const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../lib/auth');
const { getCached, getSheetData, appendRow, updateRow, deleteRow, invalidateCache } = require('../lib/sheets');

router.get('/api/categories', requireAuth, async (req, res) => {
    try {
        const data = await getCached('categories');
        const clean = data.map(({ _rowIndex, ...r }) => r);
        if (req.query.boardId) {
            res.json(clean.filter(c => c.boardId === req.query.boardId));
        } else {
            const grouped = {};
            clean.forEach(c => {
                if (!grouped[c.boardId]) grouped[c.boardId] = [];
                grouped[c.boardId].push({ id: c.id, name: c.name, order: c.order || '', viewType: c.viewType || '' });
            });
            res.json(grouped);
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/categories', requireAdmin, async (req, res) => {
    try {
        const { id, boardId, name, viewType } = req.body;
        if (!id || !boardId || !name) return res.status(400).json({ error: 'id, boardId, name은 필수입니다.' });
        await appendRow('categories', { id, boardId, name, viewType: viewType || '' });
        invalidateCache('categories');
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/api/categories/:boardId/:catId', requireAdmin, async (req, res) => {
    try {
        const data = await getSheetData('categories');
        const row = data.find(r => r.boardId === req.params.boardId && r.id === req.params.catId);
        if (!row) return res.status(404).json({ error: '카테고리를 찾을 수 없습니다.' });
        const updated = { ...row, ...req.body };
        await updateRow('categories', row._rowIndex, updated);
        invalidateCache('categories');
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/api/categories/:boardId/:catId', requireAdmin, async (req, res) => {
    try {
        await deleteRow('categories', req.params.catId);
        invalidateCache('categories');
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
