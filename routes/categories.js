const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../lib/auth');
const { getCached, getSheetData, appendRow, updateRow, deleteRow, invalidateCache } = require('../lib/sheets');

router.get('/api/categories', requireAuth, async (req, res) => {
    try {
        const data = await getCached('categories');
        const clean = data.map(({ _rowIndex, ...r }) => r);
        if (req.query.boardId) {
            res.json(clean.filter(c => c.boardId === req.query.boardId).sort((a, b) => (parseInt(a.order) || 999) - (parseInt(b.order) || 999)));
        } else {
            const grouped = {};
            clean.forEach(c => {
                if (!grouped[c.boardId]) grouped[c.boardId] = [];
                grouped[c.boardId].push({ id: c.id, name: c.name, order: c.order || '', viewType: c.viewType || '' });
            });
            // 각 보드별 카테고리를 order 순으로 정렬
            Object.keys(grouped).forEach(k => {
                grouped[k].sort((a, b) => (parseInt(a.order) || 999) - (parseInt(b.order) || 999));
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
        const { _rowIndex, ...rowClean } = data.find(r => r.boardId === req.params.boardId && r.id === req.params.catId) || {};
        if (!rowClean.id) return res.status(404).json({ error: '카테고리를 찾을 수 없습니다.' });
        const oldBoardId = req.params.boardId;
        const updated = { ...rowClean, ...req.body };
        const newBoardId = updated.boardId || oldBoardId;
        const target = data.find(r => r.boardId === req.params.boardId && r.id === req.params.catId);
        await updateRow('categories', target._rowIndex, updated);

        // 소속 메뉴가 바뀌면 해당 카테고리 소속 게시물의 boardId도 함께 갱신
        let movedPosts = 0;
        if (newBoardId !== oldBoardId) {
            const posts = await getSheetData('posts');
            for (const p of posts) {
                if (p.categoryId === req.params.catId && p.boardId === oldBoardId) {
                    const { _rowIndex: pIdx, ...pClean } = p;
                    await updateRow('posts', pIdx, { ...pClean, boardId: newBoardId });
                    movedPosts++;
                }
            }
            invalidateCache('posts');
        }
        invalidateCache('categories');
        res.json({ success: true, movedPosts });
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
