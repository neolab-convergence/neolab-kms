const express = require('express');
const router = express.Router();
const { writeLog } = require('../lib/logger');
const { requireAuth, requireAdmin } = require('../lib/auth');
const { getCached, getSheetData, appendRow, updateRow, deleteRow, invalidateCache } = require('../lib/sheets');

router.get('/api/boards', requireAuth, async (req, res) => {
    try {
        const data = await getCached('boards');
        res.json(data.map(({ _rowIndex, ...r }) => r));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/boards', requireAdmin, async (req, res) => {
    try {
        const { id, name, icon } = req.body;
        if (!id || !name) return res.status(400).json({ error: 'id와 name은 필수입니다.' });
        await appendRow('boards', { id, name, icon: icon || '' });
        invalidateCache('boards');
        writeLog('ADMIN', `게시판 추가: ${name}`, `id=${id} by=${req.user.email}`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 순서 변경 공통 API — :id 패턴보다 먼저 등록해야 'reorder'가 :id로 잘못 잡히지 않음
router.put('/api/:sheetName/reorder', requireAdmin, async (req, res) => {
    try {
        const { sheetName } = req.params;
        const { items } = req.body;
        if (!['boards', 'categories', 'posts'].includes(sheetName)) {
            return res.status(400).json({ error: '순서 변경이 지원되지 않는 시트입니다.' });
        }
        const data = await getSheetData(sheetName);
        const updates = [];
        for (const item of items) {
            const row = data.find(r => r.id === item.id);
            if (row && row.order !== String(item.order)) {
                row.order = String(item.order);
                updates.push(updateRow(sheetName, row._rowIndex, row));
            }
        }
        if (updates.length > 0) await Promise.all(updates);
        invalidateCache(sheetName);
        writeLog('ADMIN', `순서 변경: ${sheetName}`, `${updates.length}건 by=${req.user.email}`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/api/boards/:id', requireAdmin, async (req, res) => {
    try {
        const data = await getSheetData('boards');
        const row = data.find(r => r.id === req.params.id);
        if (!row) return res.status(404).json({ error: '게시판을 찾을 수 없습니다.' });
        const updated = { ...row, ...req.body };
        await updateRow('boards', row._rowIndex, updated);
        invalidateCache('boards');
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/api/boards/:id', requireAdmin, async (req, res) => {
    try {
        await deleteRow('boards', req.params.id);
        invalidateCache('boards');
        writeLog('ADMIN', `게시판 삭제: ${req.params.id}`, `by=${req.user.email}`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
