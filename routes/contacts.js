const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { requireAuth, requireAdmin } = require('../lib/auth');
const { getCached, getSheetData, appendRow, updateRow, deleteRow, invalidateCache } = require('../lib/sheets');

// 순서 데이터를 로컬 JSON 파일에 저장 (Google Sheets API 쿼터 문제 회피)
const ORDER_FILE = path.join(__dirname, '..', 'data', 'contacts-order.json');
function loadOrder() {
    try { return JSON.parse(fs.readFileSync(ORDER_FILE, 'utf8')); } catch(e) { return []; }
}
function saveOrder(orderList) {
    const dir = path.dirname(ORDER_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(ORDER_FILE, JSON.stringify(orderList));
}

router.get('/api/contacts', requireAuth, async (req, res) => {
    try {
        const data = await getCached('contacts');
        const list = data.map(({ _rowIndex, ...r }) => r);
        const order = loadOrder(); // [id1, id2, id3, ...]
        if (order.length > 0) {
            const orderMap = {};
            order.forEach((id, i) => orderMap[id] = i);
            list.sort((a, b) => {
                const oa = orderMap[a.id] !== undefined ? orderMap[a.id] : 9999;
                const ob = orderMap[b.id] !== undefined ? orderMap[b.id] : 9999;
                return oa - ob;
            });
        }
        res.json(list);
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
            mobile: req.body.mobile || '',
            email: req.body.email || '',
            status: req.body.status || 'active'
        };
        await appendRow('contacts', contact);
        invalidateCache('contacts');
        res.json({ success: true, id: contact.id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/api/contact-order', requireAdmin, async (req, res) => {
    try {
        const { items } = req.body;
        if (!items || !Array.isArray(items)) return res.status(400).json({ error: 'items 배열이 필요합니다.' });
        // order 순으로 정렬 후 id 배열만 저장 (로컬 파일, API 호출 없음)
        items.sort((a, b) => a.order - b.order);
        saveOrder(items.map(i => i.id));
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
