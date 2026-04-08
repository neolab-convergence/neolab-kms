const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { writeLog } = require('./logger');

let PDFParseClass, officeParser;
try {
    const pdfMod = require('pdf-parse');
    // pdf-parse v2+는 { PDFParse } export, v1은 함수 직접 export
    PDFParseClass = pdfMod.PDFParse || (typeof pdfMod === 'function' ? pdfMod : null);
} catch(e) { PDFParseClass = null; }
try { officeParser = require('officeparser'); } catch(e) { officeParser = null; }

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, uuidv4() + ext);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.png', '.jpg', '.jpeg', '.gif'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) cb(null, true);
        else cb(new Error('허용되지 않은 파일 형식입니다.'));
    }
});

async function extractFileText(fileName, title) {
    const filePath = path.join(uploadsDir, fileName);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) return '';
    const ext = path.extname(fileName).toLowerCase();

    try {
        if (ext === '.pdf' && PDFParseClass) {
            const buf = fs.readFileSync(filePath);
            let text = '';
            if (typeof PDFParseClass === 'function' && PDFParseClass.prototype && PDFParseClass.prototype.loadPDF) {
                // pdf-parse v2+ (class-based)
                const parser = new PDFParseClass();
                await parser.loadPDF(buf);
                text = (parser.getRawTextContent() || '').substring(0, 5000).trim();
            } else if (typeof PDFParseClass === 'function') {
                // pdf-parse v1 (function-based)
                const data = await PDFParseClass(buf);
                text = (data.text || '').substring(0, 5000).trim();
            }
            writeLog('INFO', `PDF 텍스트 추출: ${title || fileName}`, `${text.length}자`);
            return text;
        }
        if (['.pptx', '.docx', '.xlsx'].includes(ext) && officeParser) {
            const text = await officeParser.parseOfficeAsync(filePath);
            const trimmed = (text || '').substring(0, 5000).trim();
            writeLog('INFO', `Office 텍스트 추출: ${title || fileName}`, `${trimmed.length}자`);
            return trimmed;
        }
    } catch(e) {
        writeLog('WARN', `텍스트 추출 실패: ${title || fileName}`, e.message);
    }
    return '';
}

const backupDir = path.join(__dirname, '..', 'uploads_backup');
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

function backupUploads() {
    try {
        const files = fs.readdirSync(uploadsDir);
        let copied = 0;
        files.forEach(f => {
            const src = path.join(uploadsDir, f);
            const dest = path.join(backupDir, f);
            if (!fs.existsSync(dest)) {
                fs.copyFileSync(src, dest);
                copied++;
            }
        });
        if (copied > 0) writeLog('BACKUP', `파일 백업 완료: ${copied}개 신규 복사`);
    } catch (err) {
        writeLog('ERROR', '파일 백업 실패', err.message);
    }
}

backupUploads();
setInterval(backupUploads, 60 * 60 * 1000);

module.exports = { upload, uploadsDir, backupDir, extractFileText, PDFParseClass };
