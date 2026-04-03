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
            const pdfBuffer = fs.readFileSync(req.file.path);
            const pdfData = await pdfParse(pdfBuffer);
            extractedText = (pdfData.text || '').substring(0, 5000).trim();
            writeLog('INFO', `PDF 텍스트 추출 완료: ${req.file.originalname}`, `${extractedText.length}자`);
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

// 인증된 파일 접근
router.get('/api/files/:filename', requireAuth, (req, res) => {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(uploadsDir, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });

    const ext = path.extname(filename).toLowerCase();
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
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
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });

    const ext = path.extname(req.params.filename).toLowerCase();
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline');
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
