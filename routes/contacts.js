const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { requireAuth, requireAdmin } = require('../lib/auth');
const { getCached, getSheetData, appendRow, updateRow, deleteRow, invalidateCache, getDb } = require('../lib/sheets');

// 상태 라벨 정규화: "재직중" → "active" 등
function normalizeStatus(s) {
    const v = String(s || '').trim().toLowerCase();
    if (!v) return 'active';
    if (v === 'active' || v === '재직중' || v === '재직') return 'active';
    if (v === 'leave' || v === '휴직중' || v === '휴직') return 'leave';
    if (v === 'dispatch' || v === '파견중' || v === '파견') return 'dispatch';
    return 'active';
}

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

// 연락처 일괄 업로드 (Excel/CSV 파싱된 데이터 수신)
// body: { items: [{name, position, dept, phone, mobile, email, status}, ...], mode: 'replace' | 'append' }
router.post('/api/contacts/bulk', requireAdmin, async (req, res) => {
    try {
        const { items, mode } = req.body || {};
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: '데이터가 없습니다.' });
        }
        // 이름 필수 검증
        const invalid = items.findIndex(it => !it || !String(it.name || '').trim());
        if (invalid >= 0) {
            return res.status(400).json({ error: `${invalid + 1}번째 행에 이름이 없습니다.` });
        }

        const db = getDb();
        if (!db) return res.status(500).json({ error: 'DB 연결 실패' });

        const useReplace = mode !== 'append'; // 기본 = 전체 교체
        let baseId = Date.now();

        const tx = db.transaction(() => {
            if (useReplace) {
                db.prepare('DELETE FROM contacts').run();
            }
            const stmt = db.prepare(
                'INSERT INTO contacts (id, name, position, dept, phone, mobile, email, status) VALUES (?,?,?,?,?,?,?,?)'
            );
            items.forEach((it, i) => {
                stmt.run(
                    String(baseId + i),
                    String(it.name || '').trim(),
                    String(it.position || '').trim(),
                    String(it.dept || '').trim(),
                    String(it.phone || '').trim(),
                    String(it.mobile || '').trim(),
                    String(it.email || '').trim(),
                    normalizeStatus(it.status)
                );
            });
        });
        tx();

        // 순서 파일은 새 ID 기준으로 무효화 (재업로드 후 화면에 입력 순서로 보이도록)
        try {
            const newIds = items.map((_, i) => String(baseId + i));
            saveOrder(newIds);
        } catch(e) { /* 순서 저장 실패는 치명적이지 않음 */ }

        invalidateCache('contacts');
        res.json({ success: true, count: items.length, mode: useReplace ? 'replace' : 'append' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
