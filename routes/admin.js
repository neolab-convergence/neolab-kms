const express = require('express');
const router = express.Router();
const { writeLog } = require('../lib/logger');
const { superAdminEmails, isAdminEmail, isSuperAdmin, requireAdmin, requireSuperAdmin } = require('../lib/auth');
const { getCached, getSheetData, appendRow, deleteRow, updateRow, invalidateCache } = require('../lib/sheets');

// 관리자 목록 조회
router.get('/api/admins', requireAdmin, async (req, res) => {
    try {
        const admins = await getCached('admins');
        const adminList = admins.map(({ _rowIndex, ...r }) => r);
        const allAdmins = superAdminEmails.map(email => ({
            email,
            name: '슈퍼 관리자',
            addedBy: 'system',
            addedDate: '-',
            isSuperAdmin: true
        }));
        adminList.forEach(a => {
            if (!superAdminEmails.includes(a.email.toLowerCase())) {
                allAdmins.push({ ...a, isSuperAdmin: false });
            }
        });
        res.json(allAdmins);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 관리자 추가
router.post('/api/admins', requireSuperAdmin, async (req, res) => {
    try {
        const { email, name } = req.body;
        if (!email) return res.status(400).json({ error: '이메일은 필수입니다.' });
        const domain = email.split('@')[1];
        if (domain !== process.env.ALLOWED_DOMAIN) {
            return res.status(400).json({ error: `@${process.env.ALLOWED_DOMAIN} 도메인만 추가할 수 있습니다.` });
        }
        const existing = await isAdminEmail(email);
        if (existing) return res.status(400).json({ error: '이미 관리자로 등록되어 있습니다.' });

        await appendRow('admins', {
            email: email.toLowerCase(),
            name: name || '',
            addedBy: req.user.email,
            addedDate: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
        });
        invalidateCache('admins');
        writeLog('ADMIN', `관리자 추가: ${email}`, `by=${req.user.email}`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 관리자 삭제
router.delete('/api/admins/:email', requireSuperAdmin, async (req, res) => {
    try {
        const targetEmail = decodeURIComponent(req.params.email).toLowerCase();
        if (isSuperAdmin(targetEmail)) {
            return res.status(403).json({ error: '슈퍼 관리자는 삭제할 수 없습니다.' });
        }
        const admins = await getSheetData('admins');
        const row = admins.find(a => a.email.toLowerCase() === targetEmail);
        if (!row) return res.status(404).json({ error: '해당 관리자를 찾을 수 없습니다.' });

        await deleteRow('admins', row.email);
        invalidateCache('admins');
        writeLog('ADMIN', `관리자 삭제: ${targetEmail}`, `by=${req.user.email}`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 관리자 비밀번호 초기화
router.post('/api/admins/:email/reset-password', requireSuperAdmin, async (req, res) => {
    try {
        const targetEmail = decodeURIComponent(req.params.email).toLowerCase();
        const admins = await getSheetData('admins');
        const adminRow = admins.find(a => a.email.toLowerCase() === targetEmail);
        if (!adminRow) return res.status(404).json({ error: '해당 관리자를 찾을 수 없습니다.' });

        adminRow.passwordHash = '';
        await updateRow('admins', adminRow._rowIndex, adminRow);
        invalidateCache('admins');
        writeLog('ADMIN', `비밀번호 초기화: ${targetEmail}`, `by=${req.user.email}`);
        res.json({ success: true, message: `${targetEmail}의 비밀번호가 기본 비밀번호로 초기화되었습니다.` });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
