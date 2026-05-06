const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../lib/auth');
const { getCached, getSheetData, appendRow, deleteRow, invalidateCache } = require('../lib/sheets');

// 개선요청 작성 (로그인 사용자 누구나, 작성자 정보 저장 안 함)
router.post('/api/suggestions', requireAuth, async (req, res) => {
    try {
        const { content } = req.body;
        if (!content || !content.trim()) return res.status(400).json({ error: '내용을 입력해주세요.' });

        const suggestion = {
            id: String(Date.now()),
            content: content.trim(),
            date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
        };
        await appendRow('suggestions', suggestion);
        invalidateCache('suggestions');
        // 의도적으로 로그에 user 정보를 남기지 않음 (무기명 보장)
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 개선요청 목록 조회 (관리자만)
router.get('/api/suggestions', requireAdmin, async (req, res) => {
    try {
        const data = await getCached('suggestions');
        res.json(data.map(({ _rowIndex, ...r }) => r));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 개선요청 삭제 (관리자만)
router.delete('/api/suggestions/:id', requireAdmin, async (req, res) => {
    try {
        await deleteRow('suggestions', req.params.id);
        invalidateCache('suggestions');
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
