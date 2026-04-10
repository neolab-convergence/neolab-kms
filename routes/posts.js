const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { writeLog } = require('../lib/logger');
const { requireAuth, requireAdmin } = require('../lib/auth');
const { getCached, getSheetData, appendRow, updateRow, deleteRow, invalidateCache } = require('../lib/sheets');
const { uploadsDir, extractFileText } = require('../lib/upload');

// 이미지/PDF 파일에서 OCR 텍스트 일괄 추출
async function extractOcrFromFiles(fileFields, title) {
    let ocrText = '';
    // 각 필드에서 파일명 추출 (detailImage는 | 구분으로 여러 파일)
    const allFiles = [];
    for (const field of fileFields) {
        if (!field) continue;
        field.split('|').forEach(f => { if (f.trim()) allFiles.push(f.trim()); });
    }
    for (const fname of allFiles) {
        const ext = path.extname(fname).toLowerCase();
        if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf'].includes(ext)) {
            try {
                const t = await extractFileText(fname, title);
                if (t && t.length > 10) ocrText += (ocrText ? '\n' : '') + t;
            } catch(e) { /* 개별 파일 실패 무시 */ }
        }
    }
    return ocrText;
}

router.get('/api/posts', requireAuth, async (req, res) => {
    try {
        let data = await getCached('posts');
        data = data.map(({ _rowIndex, ...r }) => r);
        if (req.query.boardId) data = data.filter(p => p.boardId === req.query.boardId);
        if (req.query.categoryId) data = data.filter(p => p.categoryId === req.query.categoryId);
        if (req.query.search) {
            const q = req.query.search.toLowerCase();
            data = data.filter(p => p.title.toLowerCase().includes(q) || (p.content && p.content.toLowerCase().includes(q)) || (p.ocrText && p.ocrText.toLowerCase().includes(q)));
        }
        res.json(data);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/posts/:id', requireAuth, async (req, res) => {
    try {
        const data = await getCached('posts');
        const post = data.find(p => p.id === req.params.id);
        if (!post) return res.status(404).json({ error: '게시물을 찾을 수 없습니다.' });
        const { _rowIndex, ...clean } = post;
        res.json(clean);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/posts', requireAdmin, async (req, res) => {
    try {
        const data = await getSheetData('posts');
        const maxId = data.reduce((max, p) => Math.max(max, parseInt(p.id) || 0), 0);

        let content = req.body.content || '';
        if (req.body.fileName && !content) {
            content = await extractFileText(req.body.fileName, req.body.title);
        }

        // 이미지/PDF 파일에서 OCR 텍스트 자동 추출
        const ocrText = await extractOcrFromFiles(
            [req.body.thumbnail, req.body.detailImage, req.body.fileName],
            req.body.title
        );

        const post = {
            id: String(maxId + 1),
            boardId: req.body.boardId || '',
            categoryId: req.body.categoryId || '',
            title: req.body.title || '',
            type: req.body.type || 'text',
            icon: req.body.icon || '',
            subInfo: req.body.subInfo || '',
            content: content,
            url: req.body.url || '',
            fileName: req.body.fileName || '',
            views: '0',
            date: new Date().toISOString().split('T')[0],
            ocrText: ocrText
        };
        await appendRow('posts', post);
        invalidateCache('posts');
        writeLog('ADMIN', `게시물 추가: ${post.title}`, `id=${post.id} by=${req.user.email}`);
        res.json({ success: true, id: post.id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/api/posts/:id', requireAdmin, async (req, res) => {
    try {
        const data = await getSheetData('posts');
        const row = data.find(p => p.id === req.params.id);
        if (!row) return res.status(404).json({ error: '게시물을 찾을 수 없습니다.' });
        const updated = { ...row, ...req.body, date: new Date().toISOString().split('T')[0] };
        // 이미지/파일 변경 시 OCR 재추출
        const newFiles = [req.body.thumbnail, req.body.detailImage, req.body.fileName].join('|');
        const oldFiles = [row.thumbnail, row.detailImage, row.fileName].join('|');
        if (newFiles !== oldFiles) {
            updated.ocrText = await extractOcrFromFiles(
                [updated.thumbnail, updated.detailImage, updated.fileName],
                updated.title
            );
        }
        await updateRow('posts', row._rowIndex, updated);
        invalidateCache('posts');
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/api/posts/:id', requireAdmin, async (req, res) => {
    try {
        const data = await getSheetData('posts');
        const row = data.find(p => p.id === req.params.id);
        if (!row) return res.status(404).json({ error: '게시물을 찾을 수 없습니다.' });
        if (row.fileName) {
            const filePath = path.join(uploadsDir, row.fileName);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
        await deleteRow('posts', req.params.id);
        invalidateCache('posts');
        writeLog('ADMIN', `게시물 삭제: ${row.title}`, `id=${req.params.id} by=${req.user.email}`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/posts/:id/view', requireAuth, async (req, res) => {
    try {
        const data = await getSheetData('posts');
        const row = data.find(p => p.id === req.params.id);
        if (!row) return res.status(404).json({ error: '게시물을 찾을 수 없습니다.' });
        row.views = String((parseInt(row.views) || 0) + 1);
        await updateRow('posts', row._rowIndex, row);
        invalidateCache('posts');
        res.json({ views: row.views });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 기존 게시물의 이미지/PDF OCR 일괄 추출 (관리자 전용)
router.post('/api/posts/rebuild-ocr', requireAdmin, async (req, res) => {
    try {
        const data = await getSheetData('posts');
        let processed = 0, skipped = 0;
        for (const row of data) {
            if (row.ocrText) { skipped++; continue; }
            const ocrText = await extractOcrFromFiles(
                [row.thumbnail, row.detailImage, row.fileName],
                row.title
            );
            if (ocrText) {
                row.ocrText = ocrText;
                await updateRow('posts', row._rowIndex, row);
                processed++;
                writeLog('INFO', `OCR 추출 완료: ${row.title}`, `id=${row.id}, ${ocrText.length}자`);
            }
        }
        invalidateCache('posts');
        res.json({ success: true, processed, skipped, total: data.length });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
