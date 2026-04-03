const crypto = require('crypto');
const { getCached } = require('./sheets');

function hashPassword(password, salt = null) {
    salt = salt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
    if (!storedHash || !storedHash.includes(':')) return false;
    const [salt] = storedHash.split(':');
    return hashPassword(password, salt) === storedHash;
}

const superAdminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

async function isAdminEmail(email) {
    const lowerEmail = email.toLowerCase();
    if (superAdminEmails.includes(lowerEmail)) return true;
    try {
        const admins = await getCached('admins');
        return admins.some(a => a.email.toLowerCase() === lowerEmail);
    } catch (e) {
        return false;
    }
}

function isSuperAdmin(email) {
    return superAdminEmails.includes(email.toLowerCase());
}

function requireAuth(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.status(401).json({ error: '로그인이 필요합니다.' });
}

async function requireAdmin(req, res, next) {
    if (!req.isAuthenticated()) return res.status(401).json({ error: '로그인이 필요합니다.' });
    if (!req.session.adminVerified) return res.status(403).json({ error: '관리자 인증이 필요합니다.' });
    const admin = await isAdminEmail(req.user.email);
    if (!admin) return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
    next();
}

function requireSuperAdmin(req, res, next) {
    if (!req.isAuthenticated()) return res.status(401).json({ error: '로그인이 필요합니다.' });
    if (!req.session.adminVerified) return res.status(403).json({ error: '관리자 인증이 필요합니다.' });
    if (!isSuperAdmin(req.user.email)) return res.status(403).json({ error: '슈퍼 관리자 권한이 필요합니다.' });
    next();
}

module.exports = {
    hashPassword,
    verifyPassword,
    superAdminEmails,
    isAdminEmail,
    isSuperAdmin,
    requireAuth,
    requireAdmin,
    requireSuperAdmin
};
