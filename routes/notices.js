const express = require('express');
const router = express.Router();
const { writeLog } = require('../lib/logger');
const { requireAuth, requireAdmin } = require('../lib/auth');
const { getCached, getSheetData, appendRow, updateRow, deleteRow, invalidateCache } = require('../lib/sheets');

router.get('/api/notices', requireAuth, async (req, res) => {
    try {
        const data = await getCached('notices');
        res.json(data.map(({ _rowIndex, ...r }) => r));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/notices', requireAdmin, async (req, res) => {
    try {
        const notice = {
            id: String(Date.now()),
            title: req.body.title || '',
            type: req.body.type || 'info',
            content: req.body.content || '',
            date: new Date().toISOString().split('T')[0]
        };
        await appendRow('notices', notice);
        invalidateCache('notices');
        writeLog('ADMIN', `공지 추가: ${notice.title}`, `by=${req.user.email}`);
        res.json({ success: true, id: notice.id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/api/notices/:id', requireAdmin, async (req, res) => {
    try {
        const data = await getSheetData('notices');
        const row = data.find(r => r.id === req.params.id);
        if (!row) return res.status(404).json({ error: '공지를 찾을 수 없습니다.' });
        const updated = { ...row, ...req.body, date: new Date().toISOString().split('T')[0] };
        await updateRow('notices', row._rowIndex, updated);
        invalidateCache('notices');
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/api/notices/:id', requireAdmin, async (req, res) => {
    try {
        await deleteRow('notices', req.params.id);
        invalidateCache('notices');
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
