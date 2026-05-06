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
const { getMaintenanceMode, isAdminEmail } = require('./lib/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// nginx 리버스 프록시만 신뢰 (호스트 헤더 위조 방지)
app.set('trust proxy', 'loopback');

// API 응답에 ETag/조건부 캐시 비활성화 (수정 후 즉시 반영 보장)
app.set('etag', false);

// ─── 미들웨어 ───
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 모든 /api/* 응답에 캐시 금지 헤더 (브라우저/프록시 캐시 방지)
app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    next();
});

// 세션 저장소
const sessionsDir = path.join(__dirname, 'sessions');
if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });

app.use(session({
    store: new FileStore({
        path: sessionsDir,
        ttl: 86400,
        retries: 1,                      // 1회 재시도 (read 실패 견고성)
        reapInterval: 1800,              // 30분마다 만료 세션 정리
        reapAsync: true,                 // 비동기 정리 (서버 영향 최소화)
        logFn: () => {},                 // session-file-store 자체 로그 억제
        fallbackSessionFn: () => null    // 세션 read 실패 시 null 반환 (에러 던지지 않음)
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,                       // 활동 시 세션 만료 갱신 (사용자 끊김 방지)
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
app.use(require('./routes/orgchart'));
app.use(require('./routes/boards'));
app.use(require('./routes/categories'));
app.use(require('./routes/posts'));
app.use(require('./routes/notices'));
app.use(require('./routes/contacts'));
app.use(require('./routes/settings'));
app.use(require('./routes/files'));
app.use(require('./routes/backup'));
app.use(require('./routes/suggestions'));

// ─── 점검 상태 확인 API (인증 불필요) ───
app.get('/api/maintenance-status', (req, res) => {
    res.json({ maintenance: getMaintenanceMode() });
});

// ─── 헬스체크 (모니터링/오픈 점검용) ───
app.get('/health', (req, res) => {
    const mem = process.memoryUsage();
    res.json({
        status: 'ok',
        uptime: Math.round(process.uptime()),
        memory: {
            heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
            heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
            rssMB: Math.round(mem.rss / 1024 / 1024)
        },
        timestamp: new Date().toISOString()
    });
});

// ─── 정적 파일 서빙 ───
app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/maintenance.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'maintenance.html'));
});

app.use(async (req, res, next) => {
    // API/인증 경로는 기존 로직 유지
    if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) return next();

    // 미인증 사용자 → 로그인 페이지
    if (!req.isAuthenticated()) {
        if (req.accepts('html')) return res.redirect('/login.html');
        return res.status(401).json({ error: 'Not authenticated' });
    }

    // 점검 모드: 관리자가 아니면 점검 페이지로
    if (getMaintenanceMode()) {
        const admin = await isAdminEmail(req.user.email);
        if (!admin) {
            // CSS/JS 등 정적 파일은 점검 페이지에서 필요하므로 허용
            if (req.path.match(/\.(css|js|png|jpg|ico|svg|woff|woff2|ttf)$/)) return next();
            return res.redirect('/maintenance.html');
        }
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
    // 세션 파일 누락(ENOENT) 등은 무시하고 다음 요청에서 새 세션 발급되도록
    if (err.code === 'ENOENT' && /sessions/.test(err.path || '')) {
        if (res.headersSent) return; // 이미 응답 갔으면 종료
        return res.redirect('/login.html'); // 새 로그인 유도
    }
    if (res.headersSent) return next(err); // 응답 중복 방지 (ERR_HTTP_HEADERS_SENT)
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
            const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
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
        writeLog('INFO', '자동 백업 예약: ' + next.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }) + ' 00:00 (KST)');
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
