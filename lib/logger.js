const path = require('path');
const fs = require('fs');

const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

function writeLog(type, message, details = '') {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    const logLine = `[${timeStr}] [${type}] ${message} ${details}\n`;

    if (type === 'ERROR') console.error(logLine.trim());
    else console.log(logLine.trim());

    const logFile = path.join(logsDir, `${dateStr}.log`);
    fs.appendFileSync(logFile, logLine);
}

function cleanOldLogs() {
    try {
        const files = fs.readdirSync(logsDir);
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
        files.forEach(f => {
            const filePath = path.join(logsDir, f);
            const stat = fs.statSync(filePath);
            if (stat.mtimeMs < cutoff) fs.unlinkSync(filePath);
        });
    } catch (e) { /* ignore */ }
}

cleanOldLogs();
setInterval(cleanOldLogs, 24 * 60 * 60 * 1000);

module.exports = { writeLog, logsDir };
