const express = require('express');
const router = express.Router();
const { writeLog } = require('../lib/logger');
const { requireAdmin } = require('../lib/auth');
const { getSheetData, getSheetsClient, getSheetId, clearAllCache, SHEET_HEADERS } = require('../lib/sheets');

router.get('/api/backup', requireAdmin, async (req, res) => {
    try {
        const backup = {};
        for (const sheetName of Object.keys(SHEET_HEADERS)) {
            const data = await getSheetData(sheetName);
            backup[sheetName] = data.map(({ _rowIndex, ...r }) => r);
        }
        writeLog('ADMIN', '데이터 백업 실행', `by=${req.user.email}`);
        res.setHeader('Content-Disposition', 'attachment; filename=kms_backup.json');
        res.json(backup);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/restore', requireAdmin, express.json({ limit: '100mb' }), async (req, res) => {
    try {
        const sheets = getSheetsClient();
        const SHEET_ID = getSheetId();
        const data = req.body;
        for (const sheetName of Object.keys(SHEET_HEADERS)) {
            if (!data[sheetName]) continue;
            const existing = await getSheetData(sheetName);
            if (existing.length > 0) {
                const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
                const sheet = meta.data.sheets.find(s => s.properties.title === sheetName);
                if (sheet) {
                    await sheets.spreadsheets.batchUpdate({
                        spreadsheetId: SHEET_ID,
                        requestBody: {
                            requests: [{
                                deleteDimension: {
                                    range: {
                                        sheetId: sheet.properties.sheetId,
                                        dimension: 'ROWS',
                                        startIndex: 1,
                                        endIndex: existing.length + 1
                                    }
                                }
                            }]
                        }
                    });
                }
            }
            const headers = SHEET_HEADERS[sheetName];
            const rows = data[sheetName].map(item =>
                headers.map(h => item[h] !== undefined ? String(item[h]) : '')
            );
            if (rows.length > 0) {
                await sheets.spreadsheets.values.append({
                    spreadsheetId: SHEET_ID,
                    range: `${sheetName}!A:Z`,
                    valueInputOption: 'RAW',
                    requestBody: { values: rows }
                });
            }
        }
        clearAllCache();
        writeLog('ADMIN', '데이터 복원 실행', `by=${req.user.email}`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
