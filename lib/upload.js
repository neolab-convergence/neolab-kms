const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { writeLog } = require('./logger');

let pdfParse, officeParser;
try { pdfParse = require('pdf-parse'); } catch(e) { pdfParse = null; }
try { officeParser = require('officeparser'); } catch(e) { officeParser = null; }

// tesseract OCR 사용 가능 여부 확인
let hasOCR = false;
try { execSync('tesseract --version', { stdio: 'ignore' }); hasOCR = true; } catch(e) {}

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const tmpDir = path.join(__dirname, '..', 'tmp_ocr');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

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
        const allowed = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.png', '.jpg', '.jpeg', '.gif', '.webp'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) cb(null, true);
        else cb(new Error('허용되지 않은 파일 형식입니다.'));
    }
});

// OCR로 이미지에서 텍스트 추출
function ocrImage(imagePath) {
    if (!hasOCR) return '';
    try {
        // 한국어+영어+일본어 동시 인식
        const result = execSync(
            `tesseract "${imagePath}" stdout -l kor+eng+jpn --psm 6 2>/dev/null`,
            { timeout: 30000, maxBuffer: 5 * 1024 * 1024 }
        );
        return result.toString().trim();
    } catch(e) {
        return '';
    }
}

// PDF를 이미지로 변환 후 OCR (이미지 기반 PDF용)
function ocrPdf(pdfPath, maxPages) {
    if (!hasOCR) return '';
    maxPages = maxPages || 3;
    const sessionId = uuidv4().substring(0, 8);
    const texts = [];
    try {
        // pdftoppm으로 PDF → PNG 변환 (처음 N페이지만)
        execSync(
            `pdftoppm -png -r 200 -l ${maxPages} "${pdfPath}" "${tmpDir}/${sessionId}"`,
            { timeout: 60000 }
        );
        // 생성된 이미지들에 대해 OCR
        const images = fs.readdirSync(tmpDir)
            .filter(f => f.startsWith(sessionId) && f.endsWith('.png'))
            .sort();
        for (const img of images) {
            const imgPath = path.join(tmpDir, img);
            const text = ocrImage(imgPath);
            if (text) texts.push(text);
            fs.unlinkSync(imgPath); // 임시 이미지 삭제
        }
    } catch(e) {
        writeLog('WARN', `OCR PDF 변환 실패`, e.message);
    }
    // 남은 임시 파일 정리
    try {
        fs.readdirSync(tmpDir).filter(f => f.startsWith(sessionId)).forEach(f => {
            try { fs.unlinkSync(path.join(tmpDir, f)); } catch(e) {}
        });
    } catch(e) {}
    return texts.join('\n').substring(0, 5000).trim();
}

async function extractFileText(fileName, title) {
    const filePath = path.join(uploadsDir, fileName);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) return '';
    const ext = path.extname(fileName).toLowerCase();

    try {
        // 1. PDF: 먼저 텍스트 추출 시도, 실패하면 OCR
        if (ext === '.pdf' && pdfParse) {
            const buf = fs.readFileSync(filePath);
            const data = await pdfParse(buf);
            let text = (data.text || '').substring(0, 5000).trim();
            if (text.length > 20) {
                writeLog('INFO', `PDF 텍스트 추출: ${title || fileName}`, `${text.length}자`);
                return text;
            }
            // 텍스트가 거의 없으면 OCR 시도
            if (hasOCR) {
                writeLog('INFO', `PDF OCR 시도: ${title || fileName}`);
                text = ocrPdf(filePath, 3);
                if (text.length > 10) {
                    writeLog('INFO', `PDF OCR 추출: ${title || fileName}`, `${text.length}자`);
                    return text;
                }
            }
            return '';
        }
        // PDF 파서 없는 경우에도 OCR 시도
        if (ext === '.pdf' && hasOCR) {
            const text = ocrPdf(filePath, 3);
            if (text.length > 10) {
                writeLog('INFO', `PDF OCR 추출: ${title || fileName}`, `${text.length}자`);
                return text;
            }
            return '';
        }

        // 2. Office 파일
        if (['.pptx', '.docx', '.xlsx'].includes(ext) && officeParser) {
            const text = await officeParser.parseOfficeAsync(filePath);
            const trimmed = (text || '').substring(0, 5000).trim();
            writeLog('INFO', `Office 텍스트 추출: ${title || fileName}`, `${trimmed.length}자`);
            return trimmed;
        }

        // 3. 이미지 파일 → OCR
        if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext) && hasOCR) {
            const text = ocrImage(filePath);
            if (text.length > 10) {
                writeLog('INFO', `이미지 OCR 추출: ${title || fileName}`, `${text.length}자`);
                return text;
            }
            return '';
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

module.exports = { upload, uploadsDir, backupDir, extractFileText, pdfParse, hasOCR };
