const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../lib/auth');
const { getCached, getSheetData, appendRow, updateRow, deleteRow, invalidateCache } = require('../lib/sheets');

router.get('/api/orgchart', requireAuth, async (req, res) => {
    try {
        const data = await getCached('orgchart');
        res.json(data.map(({ _rowIndex, ...r }) => r));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/orgchart', requireAdmin, async (req, res) => {
    try {
        const entry = {
            id: String(Date.now()),
            name: req.body.name || '',
            title: req.body.title || '',
            level: req.body.level || '6',
            parentId: req.body.parentId || ''
        };
        await appendRow('orgchart', entry);
        invalidateCache('orgchart');
        res.json({ success: true, id: entry.id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/api/orgchart/:id', requireAdmin, async (req, res) => {
    try {
        const data = await getSheetData('orgchart');
        const row = data.find(r => r.id === req.params.id);
        if (!row) return res.status(404).json({ error: '조직도 항목을 찾을 수 없습니다.' });
        const updated = { ...row, ...req.body };
        await updateRow('orgchart', row._rowIndex, updated);
        invalidateCache('orgchart');
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/api/orgchart/:id', requireAdmin, async (req, res) => {
    try {
        await deleteRow('orgchart', req.params.id);
        invalidateCache('orgchart');
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
