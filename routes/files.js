const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const { writeLog } = require('../lib/logger');
const { requireAuth, requireAdmin } = require('../lib/auth');
const { getSheetData, updateRow, invalidateCache } = require('../lib/sheets');
const { upload, uploadsDir, extractFileText, pdfParse } = require('../lib/upload');

// 임시 공개 토큰 시스템
const fileTokens = new Map();

setInterval(() => {
    const now = Date.now();
    for (const [token, data] of fileTokens) {
        if (now > data.expires) fileTokens.delete(token);
    }
}, 60 * 1000);

const mimeTypes = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
};

// 파일 업로드
router.post('/api/upload', requireAdmin, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });
    writeLog('ADMIN', `파일 업로드: ${req.file.originalname}`, `size=${req.file.size} by=${req.user.email}`);

    let extractedText = '';
    if (pdfParse && req.file.filename.endsWith('.pdf')) {
        try {
            extractedText = await extractFileText(req.file.filename, req.file.originalname);
        } catch (err) {
            writeLog('WARN', `PDF 텍스트 추출 실패: ${req.file.originalname}`, err.message);
        }
    }

    res.json({
        fileName: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        extractedText: extractedText
    });
});

// 파일 없음 응답: iframe/브라우저는 HTML, fetch/JSON 호출자는 JSON
function sendFileNotFound(req, res) {
    const wantsHtml = (req.headers.accept || '').includes('text/html');
    if (wantsHtml) {
        res.status(404).type('html').send(
            '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>파일 없음</title>' +
            '<style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;' +
            'font-family:-apple-system,BlinkMacSystemFont,"Noto Sans KR",sans-serif;background:#f8f9fa;color:#374151;}' +
            '.box{text-align:center;padding:40px;}h1{font-size:18px;margin:12px 0 4px;color:#111827;}' +
            'p{font-size:14px;color:#6b7280;margin:0;}.ic{font-size:48px;}</style></head>' +
            '<body><div class="box"><div class="ic">📄</div><h1>파일을 찾을 수 없습니다</h1>' +
            '<p>업로드된 파일이 삭제되었거나 이동되었습니다. 관리자에게 문의해 주세요.</p></div></body></html>'
        );
    } else {
        res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    }
}

// 인증된 파일 접근 (UUID 파일명은 영구 캐시 가능)
router.get('/api/files/:filename', requireAuth, (req, res) => {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(uploadsDir, filename);
    if (!fs.existsSync(filePath)) return sendFileNotFound(req, res);

    const ext = path.extname(filename).toLowerCase();
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // 🚀 UUID 파일명이라 내용 변경되지 않음 → 7일 캐시 (private: 인증 필요)
    // 일반 파일명도 1시간 캐시
    const isUuid = /^[0-9a-f-]{30,}\./i.test(filename);
    if (isUuid) {
        res.setHeader('Cache-Control', 'private, max-age=604800, immutable');
    } else {
        res.setHeader('Cache-Control', 'private, max-age=3600');
    }
    res.sendFile(filePath);
});

// 임시 토큰 발급
router.post('/api/files/:filename/token', requireAuth, (req, res) => {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(uploadsDir, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });

    const token = uuidv4();
    fileTokens.set(token, {
        filename,
        expires: Date.now() + 10 * 60 * 1000
    });
    writeLog('ACCESS', `파일 토큰 발급: ${filename}`, `user=${req.user.email}`);
    res.json({ token });
});

// 토큰 기반 공개 파일 접근
router.get('/api/public-files/:token/:filename', (req, res) => {
    const tokenData = fileTokens.get(req.params.token);
    if (!tokenData || Date.now() > tokenData.expires) {
        return res.status(403).json({ error: '만료되었거나 유효하지 않은 토큰입니다.' });
    }
    if (tokenData.filename !== req.params.filename) {
        return res.status(403).json({ error: '파일이 일치하지 않습니다.' });
    }

    const filePath = path.join(uploadsDir, path.basename(req.params.filename));
    if (!fs.existsSync(filePath)) return sendFileNotFound(req, res);

    const ext = path.extname(req.params.filename).toLowerCase();
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline');
    // 🚀 토큰 자체가 unique URL이라 안전하게 캐시 가능
    res.setHeader('Cache-Control', 'public, max-age=3600, immutable');
    res.sendFile(filePath);
});

// 기존 게시물 텍스트 일괄 추출
router.post('/api/extract-all-files', requireAdmin, async (req, res) => {
    try {
        const posts = await getSheetData('posts');
        let extracted = 0;
        const fileTypes = ['pdf', 'pptx', 'docx', 'xlsx'];
        for (const post of posts) {
            if (fileTypes.includes(post.type) && post.fileName && (!post.content || post.content.trim() === '')) {
                const text = await extractFileText(post.fileName, post.title);
                if (text) {
                    post.content = text;
                    await updateRow('posts', post._rowIndex, post);
                    extracted++;
                }
            }
        }
        invalidateCache('posts');
        res.json({ success: true, extracted, message: `${extracted}개 파일에서 텍스트를 추출했습니다.` });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
