const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin, setMaintenanceMode, getMaintenanceMode } = require('../lib/auth');
const { getCached, getSheetData, appendRow, updateRow, invalidateCache } = require('../lib/sheets');

router.get('/api/settings', requireAuth, async (req, res) => {
    try {
        const data = await getCached('settings');
        const obj = {};
        data.forEach(r => { obj[r.key] = r.value; });
        res.json(obj);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/api/settings', requireAdmin, async (req, res) => {
    try {
        const data = await getSheetData('settings');
        for (const [key, value] of Object.entries(req.body)) {
            const existing = data.find(r => r.key === key);
            if (existing) {
                await updateRow('settings', existing._rowIndex, { key, value });
            } else {
                await appendRow('settings', { key, value });
            }
        }
        invalidateCache('settings');
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 점검 모드 ON/OFF
router.get('/api/maintenance', requireAdmin, (req, res) => {
    res.json({ maintenance: getMaintenanceMode() });
});

router.put('/api/maintenance', requireAdmin, (req, res) => {
    const enabled = req.body.enabled === true;
    setMaintenanceMode(enabled);
    res.json({ success: true, maintenance: enabled });
});

module.exports = router;
