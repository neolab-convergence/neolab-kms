const express = require('express');
const passport = require('passport');
const router = express.Router();
const { writeLog } = require('../lib/logger');
const { hashPassword, verifyPassword, isAdminEmail, isSuperAdmin, requireAuth } = require('../lib/auth');
const { getSheetData, appendRow, updateRow, invalidateCache } = require('../lib/sheets');

// Google OAuth 로그인
router.get('/auth/google', (req, res, next) => {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const callbackURL = `${protocol}://${host}/auth/google/callback`;
    passport.authenticate('google', {
        scope: ['profile', 'email'],
        hd: process.env.ALLOWED_DOMAIN,
        callbackURL: callbackURL
    })(req, res, next);
});

// Google OAuth 콜백
router.get('/auth/google/callback', (req, res, next) => {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const callbackURL = `${protocol}://${host}/auth/google/callback`;
    passport.authenticate('google', {
        failureRedirect: '/login.html?error=auth_failed',
        callbackURL: callbackURL
    })(req, res, () => {
        res.redirect('/');
    });
});

// 로그아웃
router.get('/auth/logout', (req, res) => {
    const email = req.user?.email || 'unknown';
    req.logout(() => {
        writeLog('AUTH', `로그아웃: ${email}`);
        res.redirect('/');
    });
});

// 관리자 비밀번호 확인
router.post('/api/admin/verify', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
    const admin = await isAdminEmail(req.user.email);
    if (!admin) return res.status(403).json({ error: '관리자 계정이 아닙니다.' });
    const { password } = req.body;

    const admins = await getSheetData('admins');
    const adminRow = admins.find(a => a.email.toLowerCase() === req.user.email.toLowerCase());

    let passwordOk = false;

    if (adminRow && adminRow.passwordHash) {
        passwordOk = verifyPassword(password, adminRow.passwordHash);
    } else {
        passwordOk = (password === process.env.ADMIN_PASSWORD);
        if (passwordOk) {
            const hashed = hashPassword(password);
            if (adminRow) {
                adminRow.passwordHash = hashed;
                await updateRow('admins', adminRow._rowIndex, adminRow);
            } else {
                await appendRow('admins', {
                    email: req.user.email.toLowerCase(),
                    name: req.user.name || '',
                    passwordHash: hashed,
                    addedBy: 'system',
                    addedDate: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
                });
            }
            invalidateCache('admins');
        }
    }

    if (passwordOk) {
        req.session.adminVerified = true;
        req.user.isAdmin = true;
        req.user.isSuperAdmin = isSuperAdmin(req.user.email);
        const needsPasswordChange = !adminRow || !adminRow.passwordHash;
        writeLog('ADMIN', `관리자 인증 성공: ${req.user.email}`);
        res.json({ success: true, needsPasswordChange });
    } else {
        writeLog('ADMIN', `관리자 인증 실패: ${req.user.email}`);
        res.status(401).json({ error: '비밀번호가 틀렸습니다.' });
    }
});

// 관리자 비밀번호 변경
router.post('/api/admin/change-password', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
    if (!req.session.adminVerified) return res.status(403).json({ error: '관리자 인증이 필요합니다.' });

    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 4) {
        return res.status(400).json({ error: '새 비밀번호는 4자 이상이어야 합니다.' });
    }

    const admins = await getSheetData('admins');
    const adminRow = admins.find(a => a.email.toLowerCase() === req.user.email.toLowerCase());

    let currentOk = false;
    if (adminRow && adminRow.passwordHash) {
        currentOk = verifyPassword(currentPassword, adminRow.passwordHash);
    } else {
        currentOk = (currentPassword === process.env.ADMIN_PASSWORD);
    }

    if (!currentOk) {
        return res.status(401).json({ error: '현재 비밀번호가 틀렸습니다.' });
    }

    const hashed = hashPassword(newPassword);
    if (adminRow) {
        adminRow.passwordHash = hashed;
        await updateRow('admins', adminRow._rowIndex, adminRow);
    } else {
        await appendRow('admins', {
            email: req.user.email.toLowerCase(),
            name: req.user.name || '',
            passwordHash: hashed,
            addedBy: 'system',
            addedDate: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
        });
    }
    invalidateCache('admins');
    writeLog('ADMIN', `비밀번호 변경: ${req.user.email}`);
    res.json({ success: true });
});

// 현재 사용자 정보
router.get('/api/me', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
    const admin = await isAdminEmail(req.user.email);
    res.json({
        email: req.user.email,
        name: req.user.name,
        photo: req.user.photo,
        isAdmin: admin,
        isSuperAdmin: isSuperAdmin(req.user.email)
    });
});

module.exports = router;
