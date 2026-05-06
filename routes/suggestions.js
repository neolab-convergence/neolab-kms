const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../lib/auth');
const { getCached, getSheetData, appendRow, updateRow, deleteRow, invalidateCache } = require('../lib/sheets');

// 상태값 정규화: 'pending' (대기/진행중) / 'completed' (완료)
function normStatus(s) {
    const v = String(s || '').trim().toLowerCase();
    if (v === 'completed' || v === '완료') return 'completed';
    return 'pending';
}

// 개선요청 작성 (로그인 사용자 누구나, 작성자 정보 저장 안 함)
router.post('/api/suggestions', requireAuth, async (req, res) => {
    try {
        const { content } = req.body;
        if (!content || !content.trim()) return res.status(400).json({ error: '내용을 입력해주세요.' });

        const suggestion = {
            id: String(Date.now()),
            content: content.trim(),
            date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }),
            status: 'pending',
            adminNote: '',
            completedBy: '',
            completedDate: ''
        };
        await appendRow('suggestions', suggestion);
        invalidateCache('suggestions');
        // 의도적으로 로그에 user 정보를 남기지 않음 (무기명 보장)
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 개선요청 목록 조회 (관리자만) — 기존 데이터에 status가 없으면 'pending'으로 채움
router.get('/api/suggestions', requireAdmin, async (req, res) => {
    try {
        const data = await getCached('suggestions');
        const out = data.map(({ _rowIndex, ...r }) => {
            r.status = r.status || 'pending';
            return r;
        });
        res.json(out);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 개선요청 상태/메모 갱신 (관리자만)
// body: { status: 'completed'|'pending', adminNote?: string }
router.put('/api/suggestions/:id', requireAdmin, async (req, res) => {
    try {
        const data = await getSheetData('suggestions');
        const row = data.find(r => r.id === req.params.id);
        if (!row) return res.status(404).json({ error: '개선요청을 찾을 수 없습니다.' });

        const { _rowIndex, ...rowClean } = row;
        const newStatus = normStatus(req.body.status);
        const adminNote = (req.body.adminNote !== undefined) ? String(req.body.adminNote || '') : (rowClean.adminNote || '');

        // 상태가 처음으로 'completed'로 바뀌는 경우 처리자/처리일시 기록
        let completedBy = rowClean.completedBy || '';
        let completedDate = rowClean.completedDate || '';
        if (newStatus === 'completed') {
            // 이미 완료된 건이면 기존 처리자 유지, 처음 완료 처리하는 경우 현재 관리자 기록
            if (!completedBy || rowClean.status !== 'completed') {
                completedBy = req.user.name || req.user.email || '';
                completedDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
            }
        } else {
            // 다시 진행 상태로 되돌리면 완료 정보 초기화
            completedBy = '';
            completedDate = '';
        }

        const updated = { ...rowClean, status: newStatus, adminNote, completedBy, completedDate };
        await updateRow('suggestions', row._rowIndex, updated);
        invalidateCache('suggestions');
        res.json({ success: true });
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
