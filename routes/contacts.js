const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../lib/auth');
const { getCached, getSheetData, appendRow, updateRow, updateColumn, deleteRow, invalidateCache } = require('../lib/sheets');

router.get('/api/contacts', requireAuth, async (req, res) => {
    try {
        const data = await getCached('contacts');
        const sorted = data.map(({ _rowIndex, ...r }) => r).sort((a, b) => {
            const oa = parseInt(a.order) || 9999;
            const ob = parseInt(b.order) || 9999;
            return oa - ob;
        });
        res.json(sorted);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/contacts', requireAdmin, async (req, res) => {
    try {
        const contact = {
            id: String(Date.now()),
            name: req.body.name || '',
            position: req.body.position || '',
            dept: req.body.dept || '',
            phone: req.body.phone || '',
            email: req.body.email || '',
            status: req.body.status || 'active',
            order: req.body.order || ''
        };
        await appendRow('contacts', contact);
        invalidateCache('contacts');
        res.json({ success: true, id: contact.id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/api/contacts/reorder', requireAdmin, async (req, res) => {
    try {
        const { items } = req.body;
        if (!items || !Array.isArray(items)) return res.status(400).json({ error: 'items 배열이 필요합니다.' });
        const data = await getSheetData('contacts');
        // id→order 매핑
        const orderMap = {};
        for (const item of items) orderMap[item.id] = String(item.order);
        // 시트 행 순서대로 order 값 배열 생성 (1회 API 호출)
        const values = data.map(row => [orderMap[row.id] || row.order || '']);
        await updateColumn('contacts', 'order', values);
        invalidateCache('contacts');
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/api/contacts/:id', requireAdmin, async (req, res) => {
    try {
        const data = await getSheetData('contacts');
        const row = data.find(r => r.id === req.params.id);
        if (!row) return res.status(404).json({ error: '연락처를 찾을 수 없습니다.' });
        const updated = { ...row, ...req.body };
        await updateRow('contacts', row._rowIndex, updated);
        invalidateCache('contacts');
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/api/contacts/:id', requireAdmin, async (req, res) => {
    try {
        await deleteRow('contacts', req.params.id);
        invalidateCache('contacts');
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
