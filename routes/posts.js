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
    let savedPostId = null;
    try {
        const data = await getSheetData('posts');
        const maxId = data.reduce((max, p) => Math.max(max, parseInt(p.id) || 0), 0);
        savedPostId = String(maxId + 1);

        const post = {
            id: savedPostId,
            boardId: req.body.boardId || '',
            categoryId: req.body.categoryId || '',
            title: req.body.title || '',
            type: req.body.type || 'text',
            icon: req.body.icon || '',
            subInfo: req.body.subInfo || '',
            content: req.body.content || '',
            url: req.body.url || '',
            fileName: req.body.fileName || '',
            views: '0',
            date: new Date().toISOString().split('T')[0],
            order: req.body.order || '',
            thumbnail: req.body.thumbnail || '',
            bgColor: req.body.bgColor || '',
            detailImage: req.body.detailImage || '',
            ocrText: ''
        };
        await appendRow('posts', post);
        invalidateCache('posts');
        writeLog('ADMIN', `게시물 추가: ${post.title}`, `id=${post.id} by=${req.user.email}`);
        res.json({ success: true, id: post.id });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }

    // 백그라운드: 파일 텍스트 추출 + OCR (응답 반환 후 실행, try-catch 밖)
    const bgPostId = savedPostId;
    const bgTitle = req.body.title || '';
    const bgFileName = req.body.fileName || '';
    const bgContent = req.body.content || '';
    const bgThumbnail = req.body.thumbnail || '';
    const bgDetailImage = req.body.detailImage || '';
    setImmediate(async () => {
        try {
            let contentText = '';
            let ocrText = '';

            // 파일에서 content 텍스트 추출
            if (bgFileName && !bgContent) {
                try {
                    contentText = await extractFileText(bgFileName, bgTitle);
                } catch(e) { writeLog('ERROR', `파일 텍스트 추출 실패: ${bgTitle}`, e.message); }
            }

            // 이미지/PDF에서 OCR 추출
            try {
                ocrText = await extractOcrFromFiles(
                    [bgThumbnail, bgDetailImage, bgFileName],
                    bgTitle
                );
            } catch(e) { writeLog('ERROR', `OCR 추출 실패: ${bgTitle}`, e.message); }

            // 업데이트할 내용이 있으면 저장
            if (contentText || ocrText) {
                const freshData = await getSheetData('posts');
                const freshRow = freshData.find(p => p.id === bgPostId);
                if (freshRow) {
                    if (contentText && !freshRow.content) freshRow.content = contentText;
                    if (ocrText) freshRow.ocrText = ocrText;
                    await updateRow('posts', freshRow._rowIndex, freshRow);
                    invalidateCache('posts');
                    writeLog('INFO', `백그라운드 처리 완료: ${bgTitle}`, `id=${bgPostId}, content=${contentText.length}자, ocr=${ocrText.length}자`);
                }
            }
        } catch(e) { writeLog('ERROR', `백그라운드 처리 실패: ${bgTitle}`, e.message); }
    });
});

router.put('/api/posts/:id', requireAdmin, async (req, res) => {
    let filesChanged = false;
    let bgData = {};
    try {
        const data = await getSheetData('posts');
        const row = data.find(p => p.id === req.params.id);
        if (!row) return res.status(404).json({ error: '게시물을 찾을 수 없습니다.' });
        // _rowIndex는 업데이트 대상에서 제외 (시트에 쓰이면 안 됨)
        const { _rowIndex, ...rowClean } = row;
        const updated = { ...rowClean, ...req.body, date: new Date().toISOString().split('T')[0] };
        const newFiles = [req.body.thumbnail || '', req.body.detailImage || '', req.body.fileName || ''].join('|');
        const oldFiles = [row.thumbnail || '', row.detailImage || '', row.fileName || ''].join('|');
        filesChanged = newFiles !== oldFiles;
        bgData = { id: req.params.id, title: updated.title, thumbnail: updated.thumbnail, detailImage: updated.detailImage, fileName: updated.fileName };
        await updateRow('posts', row._rowIndex, updated);
        invalidateCache('posts');
        writeLog('ADMIN', `게시물 수정: ${updated.title}`, `id=${req.params.id} by=${req.user.email}`);
        res.json({ success: true });
    } catch (err) {
        writeLog('ERROR', `게시물 수정 실패: id=${req.params.id}`, err.message + ' | ' + (err.stack||'').split('\n')[1]);
        return res.status(500).json({ error: err.message });
    }

    // 이미지/파일 변경 시 백그라운드에서 OCR 재추출 (try-catch 밖)
    if (filesChanged) {
        setImmediate(async () => {
            try {
                const ocrText = await extractOcrFromFiles(
                    [bgData.thumbnail, bgData.detailImage, bgData.fileName],
                    bgData.title
                );
                const freshData = await getSheetData('posts');
                const freshRow = freshData.find(p => p.id === bgData.id);
                if (freshRow) {
                    freshRow.ocrText = ocrText || '';
                    await updateRow('posts', freshRow._rowIndex, freshRow);
                    invalidateCache('posts');
                    writeLog('INFO', `OCR 재추출 완료: ${bgData.title}`, `id=${bgData.id}, ${(ocrText||'').length}자`);
                }
            } catch(e) { writeLog('ERROR', `OCR 재추출 실패: ${bgData.title}`, e.message); }
        });
    }
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
