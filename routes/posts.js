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
        const isSearch = !!req.query.search;
        if (req.query.boardId) data = data.filter(p => p.boardId === req.query.boardId);
        if (req.query.categoryId) data = data.filter(p => p.categoryId === req.query.categoryId);
        if (isSearch) {
            const q = req.query.search.toLowerCase();
            data = data.filter(p => p.title.toLowerCase().includes(q) || (p.content && p.content.toLowerCase().includes(q)) || (p.ocrText && p.ocrText.toLowerCase().includes(q)));
        }
        // 🚀 목록에서는 ocrText/content 등 큰 필드 제거 (응답 크기 90% 감소)
        // 검색 시에도 결과만 보여주면 되므로 본문 제외
        data = data.map(({ _rowIndex, ocrText, content, ...rest }) => {
            // content는 [PRODUCT_DESC] 같은 메타 정보가 필요할 수 있어 짧게 유지
            const shortContent = content && content.startsWith('[') ? content.substring(0, 200) : '';
            return { ...rest, content: shortContent };
        });
        // HTTP 캐시: 목록은 30초 캐시 (private)
        res.setHeader('Cache-Control', 'private, max-age=30');
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
        // 🔒 항상 시트에서 최신 데이터 조회 (캐시 사용 안 함, 경쟁 조건 방지)
        const data = await getSheetData('posts');
        const row = data.find(p => p.id === req.params.id);
        if (!row) return res.status(404).json({ error: '게시물을 찾을 수 없습니다. 이미 삭제되었거나 ID가 변경되었을 수 있습니다.' });
        if (!row._rowIndex || row._rowIndex < 2) {
            writeLog('ERROR', `게시물 수정: 잘못된 rowIndex`, `id=${req.params.id}, rowIndex=${row._rowIndex}`);
            return res.status(500).json({ error: '시트 데이터 인덱스 오류. 관리자에게 문의하세요.' });
        }
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
        // 사용자에게 보여줄 에러 메시지를 친화적으로
        let userMsg = err.message || '알 수 없는 오류';
        if (/quota|rateLimit|429/i.test(userMsg)) userMsg = 'Google Sheets API 사용량 한도에 도달했습니다. 1분 후 다시 시도해 주세요.';
        else if (/timeout|ECONN/i.test(userMsg)) userMsg = '서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.';
        else if (/Missing required parameters/i.test(userMsg)) userMsg = 'Google Sheets 연결이 일시적으로 끊어졌습니다. 서버 재시작이 필요할 수 있습니다.';
        return res.status(500).json({ error: userMsg, detail: err.message });
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

// 🚀 조회수 배치 누적 (인메모리) - 30초마다 시트에 일괄 반영
const viewBuffer = new Map(); // postId → 누적 카운트
let viewFlushScheduled = false;

async function flushViewCounts() {
    if (viewBuffer.size === 0) return;
    const snapshot = new Map(viewBuffer);
    viewBuffer.clear();
    try {
        const data = await getSheetData('posts');
        let updated = 0;
        for (const [postId, count] of snapshot) {
            const row = data.find(p => p.id === postId);
            if (!row) continue;
            row.views = String((parseInt(row.views) || 0) + count);
            await updateRow('posts', row._rowIndex, row);
            updated++;
        }
        if (updated > 0) invalidateCache('posts');
    } catch (e) {
        // 실패 시 카운트 다시 누적 (다음 flush 때 재시도)
        for (const [postId, count] of snapshot) {
            viewBuffer.set(postId, (viewBuffer.get(postId) || 0) + count);
        }
    }
}
// 30초마다 자동 flush
setInterval(flushViewCounts, 30000);
// 종료 시 flush
process.on('SIGTERM', flushViewCounts);
process.on('SIGINT', flushViewCounts);

router.post('/api/posts/:id/view', requireAuth, async (req, res) => {
    // 🚀 즉시 응답 (시트 업데이트는 백그라운드 배치)
    const id = req.params.id;
    viewBuffer.set(id, (viewBuffer.get(id) || 0) + 1);
    res.json({ ok: true });
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
