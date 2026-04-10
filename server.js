require('dotenv').config();
const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const passport = require('passport');
const path = require('path');
const fs = require('fs');

const { writeLog, logsDir } = require('./lib/logger');
const { initSheets } = require('./lib/sheets');
const { setupPassport } = require('./lib/passport-setup');
const { uploadsDir, backupDir } = require('./lib/upload');

const app = express();
const PORT = process.env.PORT || 3000;

// Cloudflare/ngrok 프록시 신뢰
app.set('trust proxy', true);

// ─── 미들웨어 ───
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 세션 저장소
const sessionsDir = path.join(__dirname, 'sessions');
if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });

app.use(session({
    store: new FileStore({
        path: sessionsDir,
        ttl: 86400,
        retries: 0,
        cleanupInterval: 3600
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000,
        secure: 'auto',
        httpOnly: true,
        sameSite: 'lax'
    }
}));

app.use(passport.initialize());
app.use(passport.session());

// Passport 설정
setupPassport();

// 접속 로깅 미들웨어
app.use((req, res, next) => {
    if (req.path.startsWith('/api/') || req.path === '/auth/google' || req.path === '/auth/google/callback') {
        const user = req.user ? req.user.email : 'anonymous';
        writeLog('ACCESS', `${req.method} ${req.path}`, `user=${user} ip=${req.ip}`);
    }
    next();
});

// ─── 라우트 등록 ───
app.use(require('./routes/access'));
app.use(require('./routes/auth'));
app.use(require('./routes/admin'));
app.use(require('./routes/boards'));
app.use(require('./routes/categories'));
app.use(require('./routes/posts'));
app.use(require('./routes/notices'));
app.use(require('./routes/contacts'));
app.use(require('./routes/orgchart'));
app.use(require('./routes/settings'));
app.use(require('./routes/files'));
app.use(require('./routes/chat'));
app.use(require('./routes/backup'));
app.use(require('./routes/suggestions'));

// ─── 정적 파일 서빙 ───
app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.use((req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) return next();
    if (!req.isAuthenticated()) {
        if (req.accepts('html')) return res.redirect('/login.html');
        return res.status(401).json({ error: 'Not authenticated' });
    }
    next();
});

app.use(express.static(path.join(__dirname, 'public'), {
    etag: false,
    maxAge: 0,
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
    }
}));

// ─── 글로벌 에러 핸들러 ───
app.use((err, req, res, next) => {
    writeLog('ERROR', `서버 에러: ${err.message}`, err.stack?.split('\n')[1]?.trim());
    res.status(500).json({ error: '서버 내부 오류가 발생했습니다.' });
});

process.on('uncaughtException', (err) => {
    writeLog('ERROR', `Uncaught Exception: ${err.message}`, err.stack?.split('\n')[1]?.trim());
});
process.on('unhandledRejection', (reason) => {
    writeLog('ERROR', `Unhandled Rejection: ${reason}`);
});

// ─── 자동 백업 (매일 자정) ───
function scheduleAutoBackup() {
    const { getSheetData, SHEET_HEADERS } = require('./lib/sheets');
    const backupPath = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupPath)) fs.mkdirSync(backupPath, { recursive: true });

    async function runBackup() {
        try {
            const backup = {};
            for (const sheetName of Object.keys(SHEET_HEADERS)) {
                const data = await getSheetData(sheetName);
                backup[sheetName] = data.map(({ _rowIndex, ...r }) => r);
            }
            const dateStr = new Date().toISOString().split('T')[0];
            const filePath = path.join(backupPath, 'auto_backup_' + dateStr + '.json');
            fs.writeFileSync(filePath, JSON.stringify(backup, null, 2));
            writeLog('BACKUP', '자동 백업 완료: ' + filePath);

            // 30일 이전 백업 삭제
            const files = fs.readdirSync(backupPath).filter(f => f.startsWith('auto_backup_'));
            const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
            files.forEach(f => {
                const match = f.match(/auto_backup_(\d{4}-\d{2}-\d{2})/);
                if (match && new Date(match[1]) < cutoff) {
                    fs.unlinkSync(path.join(backupPath, f));
                    writeLog('BACKUP', '오래된 백업 삭제: ' + f);
                }
            });
        } catch (e) {
            writeLog('ERROR', '자동 백업 실패: ' + e.message);
        }
    }

    // 다음 자정까지 시간 계산
    function scheduleNext() {
        const now = new Date();
        const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
        const ms = next - now;
        setTimeout(() => { runBackup(); setInterval(runBackup, 24 * 60 * 60 * 1000); }, ms);
        writeLog('INFO', '자동 백업 예약: ' + next.toISOString().split('T')[0] + ' 00:00');
    }

    scheduleNext();
}

// ─── 서버 시작 ───
async function start() {
    await initSheets();
    scheduleAutoBackup();
    app.listen(PORT, () => {
        writeLog('INFO', `NeoLab KMS 서버 시작: http://localhost:${PORT}`);
        writeLog('INFO', `허용 도메인: @${process.env.ALLOWED_DOMAIN}`);
        writeLog('INFO', `관리자: ${process.env.ADMIN_EMAILS}`);
        writeLog('INFO', `파일 저장: ${uploadsDir}`);
        writeLog('INFO', `파일 백업: ${backupDir}`);
        writeLog('INFO', `로그 저장: ${logsDir}`);
        console.log(`\n🚀 NeoLab KMS 서버 시작: http://localhost:${PORT}`);
        console.log(`📋 허용 도메인: @${process.env.ALLOWED_DOMAIN}`);
        console.log(`🔑 관리자: ${process.env.ADMIN_EMAILS}`);
        console.log(`📂 파일 저장: ${uploadsDir}`);
        console.log(`💾 파일 백업: ${backupDir}`);
        console.log(`📝 로그 저장: ${logsDir}\n`);
    });
}

start();
