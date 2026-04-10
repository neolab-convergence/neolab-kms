const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../lib/auth');
const { getCached, getSheetData, appendRow, updateRow, batchUpdateRows, deleteRow, invalidateCache } = require('../lib/sheets');

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
        const updates = [];
        for (const item of items) {
            const row = data.find(r => r.id === item.id);
            if (row) {
                row.order = String(item.order);
                updates.push({ rowIndex: row._rowIndex, data: row });
            }
        }
        if (updates.length > 0) await batchUpdateRows('contacts', updates);
        invalidateCache('contacts');
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 최초 1회: order가 비어있는 전체 연락처에 순서 일괄 부여 (배치 API로 1회 호출)
router.post('/api/contacts/init-order', requireAdmin, async (req, res) => {
    try {
        const data = await getSheetData('contacts');
        const updates = [];
        for (let i = 0; i < data.length; i++) {
            if (!data[i].order) {
                data[i].order = String(i + 1);
                updates.push({ rowIndex: data[i]._rowIndex, data: data[i] });
            }
        }
        if (updates.length === 0) return res.json({ success: true, message: '이미 초기화됨' });
        await batchUpdateRows('contacts', updates);
        invalidateCache('contacts');
        res.json({ success: true, initialized: updates.length });
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
