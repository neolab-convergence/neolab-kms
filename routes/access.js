const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../lib/auth');
const { getSheetData, appendRow, updateRow, invalidateCache } = require('../lib/sheets');

// 메모리 캐시: 오늘 이미 기록한 사용자 (서버 재시작 시 초기화됨)
const todayLogged = new Map(); // key: "date|email"

// 접속 기록 미들웨어 (인증된 사용자의 /api/me 호출 시 하루 1회 기록)
router.get('/api/me', async (req, res, next) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) return next();

    const today = new Date().toISOString().split('T')[0];
    const email = req.user.email;
    const cacheKey = today + '|' + email;

    // 오늘 이미 기록했으면 스킵
    if (todayLogged.has(cacheKey)) return next();
    todayLogged.set(cacheKey, true);

    // 날짜가 바뀌면 이전 날짜 캐시 정리
    for (const [key] of todayLogged) {
        if (!key.startsWith(today)) todayLogged.delete(key);
    }

    // 비동기로 기록 (응답 지연 방지)
    setImmediate(async () => {
        try {
            const logs = await getSheetData('accessLogs');
            const existing = logs.find(r => r.date === today && r.email === email);
            if (existing) {
                existing.count = String((parseInt(existing.count) || 1) + 1);
                await updateRow('accessLogs', existing._rowIndex, existing);
            } else {
                await appendRow('accessLogs', {
                    date: today,
                    email: email,
                    name: req.user.name || '',
                    count: '1'
                });
            }
            invalidateCache('accessLogs');
        } catch (e) {
            // 기록 실패해도 서비스에 영향 없음
        }
    });

    next();
});

// 관리자: 접속 현황 조회 (최근 N일)
router.get('/api/access-stats', requireAdmin, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const logs = await getSheetData('accessLogs');

        // 날짜별 집계
        const dateMap = {};
        const userSet = new Set();

        logs.forEach(log => {
            if (!log.date) return;
            if (!dateMap[log.date]) {
                dateMap[log.date] = { date: log.date, uniqueUsers: 0, totalHits: 0, users: [] };
            }
            dateMap[log.date].uniqueUsers++;
            dateMap[log.date].totalHits += parseInt(log.count) || 1;
            dateMap[log.date].users.push({
                email: log.email,
                name: log.name || '',
                count: parseInt(log.count) || 1
            });
            userSet.add(log.email);
        });

        // 최근 N일만 필터링 후 날짜순 정렬
        const allDates = Object.values(dateMap)
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, days);

        res.json({
            stats: allDates,
            totalUniqueUsers: userSet.size,
            totalDays: allDates.length
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
