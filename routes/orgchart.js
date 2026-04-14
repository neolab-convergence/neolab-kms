const express = require('express');
const router = express.Router();
const { writeLog } = require('../lib/logger');
const { requireAuth, requireAdmin } = require('../lib/auth');
const { getCached, getSheetData, appendRow, updateRow, deleteRow, invalidateCache, ensureHeaders, getSheetsClient, getSheetId, SHEET_HEADERS } = require('../lib/sheets');

router.get('/api/orgchart', requireAuth, async (req, res) => {
    try {
        const data = await getCached('orgchart');
        res.json(data.map(({ _rowIndex, ...r }) => r));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/orgchart', requireAdmin, async (req, res) => {
    try {
        const entry = {
            id: String(Date.now()),
            name: req.body.name || '',
            title: req.body.title || '',
            department: req.body.department || '',
            level: req.body.level || '6',
            parentId: req.body.parentId || '',
            order: req.body.order || '999'
        };
        await appendRow('orgchart', entry);
        invalidateCache('orgchart');
        res.json({ success: true, id: entry.id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 조직도 노드 위치/순서 변경 (드래그앤드롭) — :id 보다 먼저 선언
router.put('/api/orgchart/reorder', requireAdmin, async (req, res) => {
    try {
        const { updates } = req.body;
        if (!Array.isArray(updates)) return res.status(400).json({ error: '잘못된 요청입니다.' });
        const data = await getSheetData('orgchart');
        const promises = [];
        for (const upd of updates) {
            const row = data.find(r => r.id === upd.id);
            if (row) {
                if (upd.parentId !== undefined) row.parentId = String(upd.parentId);
                if (upd.order !== undefined) row.order = String(upd.order);
                promises.push(updateRow('orgchart', row._rowIndex, row));
            }
        }
        if (promises.length > 0) await Promise.all(promises);
        invalidateCache('orgchart');
        writeLog('ADMIN', `조직도 순서 변경: ${updates.length}건`, `by=${req.user.email}`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 노드 위치(x,y) 일괄 저장
router.put('/api/orgchart/save-positions', requireAdmin, async (req, res) => {
    try {
        const { updates } = req.body;
        if (!Array.isArray(updates)) return res.status(400).json({ error: '잘못된 요청입니다.' });
        await ensureHeaders('orgchart');
        const data = await getSheetData('orgchart');
        const promises = [];
        for (const upd of updates) {
            const row = data.find(r => r.id === upd.id);
            if (row) {
                if (upd.x !== undefined) row.x = String(upd.x);
                if (upd.y !== undefined) row.y = String(upd.y);
                promises.push(updateRow('orgchart', row._rowIndex, row));
            }
        }
        if (promises.length > 0) await Promise.all(promises);
        invalidateCache('orgchart');
        res.json({ success: true, updated: promises.length });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/api/orgchart/:id', requireAdmin, async (req, res) => {
    try {
        const data = await getSheetData('orgchart');
        const row = data.find(r => r.id === req.params.id);
        if (!row) return res.status(404).json({ error: '조직도 항목을 찾을 수 없습니다.' });
        const updated = { ...row, ...req.body };
        await updateRow('orgchart', row._rowIndex, updated);
        invalidateCache('orgchart');
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/api/orgchart/:id', requireAdmin, async (req, res) => {
    try {
        await deleteRow('orgchart', req.params.id);
        invalidateCache('orgchart');
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 조직도 일괄 업로드 (엑셀 파싱된 데이터 수신)
router.post('/api/orgchart/bulk', requireAdmin, async (req, res) => {
    try {
        const { items } = req.body;
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: '데이터가 없습니다.' });
        }

        // 1. 기존 시트 클리어 후 헤더 재작성
        const sheetsClient = getSheetsClient();
        const SHEET_ID = getSheetId();
        const existing = await getSheetData('orgchart');

        const meta = await sheetsClient.spreadsheets.get({ spreadsheetId: SHEET_ID });
        const sheet = meta.data.sheets.find(s => s.properties.title === 'orgchart');
        if (sheet && existing.length > 0) {
            await sheetsClient.spreadsheets.batchUpdate({
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

        // 헤더 업데이트 (새 컬럼 반영)
        await sheetsClient.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: 'orgchart!A1',
            valueInputOption: 'RAW',
            requestBody: { values: [SHEET_HEADERS['orgchart']] }
        });

        // 2. 엑셀 데이터를 트리 구조로 변환
        // items: [{department, title, name, parentDepartment}, ...]
        const deptMap = {}; // department name -> node id
        const nodes = [];
        let idCounter = Date.now();

        // 먼저 모든 고유 부서 노드 생성
        const deptSet = new Set();
        items.forEach(item => {
            if (item.department) deptSet.add(item.department);
        });

        deptSet.forEach(dept => {
            const deptId = String(idCounter++);
            deptMap[dept] = deptId;
            // 해당 부서의 상위부서 찾기
            const deptItem = items.find(i => i.department === dept);
            const parentDept = deptItem ? (deptItem.parentDepartment || '') : '';
            nodes.push({
                id: deptId,
                name: dept,
                title: '',
                department: dept,
                level: '1',
                parentId: parentDept ? ('__dept__' + parentDept) : '',
                order: '0',
                x: '', y: '',
                _isDept: true,
                _parentDeptName: parentDept
            });
        });

        // 부서 노드의 parentId를 실제 ID로 해결
        nodes.forEach(node => {
            if (node._parentDeptName && deptMap[node._parentDeptName]) {
                node.parentId = deptMap[node._parentDeptName];
            } else {
                node.parentId = '';
            }
        });

        // 레벨 계산 (루트부터 깊이 순회)
        function calcLevel(nodeId, depth) {
            nodes.forEach(n => {
                if (n.id === nodeId) n.level = String(depth);
            });
            nodes.filter(n => n.parentId === nodeId).forEach(child => {
                calcLevel(child.id, depth + 1);
            });
        }
        nodes.filter(n => !n.parentId).forEach(root => calcLevel(root.id, 1));

        // 사람 노드 추가 (부서 아래에)
        items.forEach((item, idx) => {
            if (!item.name) return;
            const personId = String(idCounter++);
            const parentNodeId = deptMap[item.department] || '';
            const parentNode = nodes.find(n => n.id === parentNodeId);
            const personLevel = parentNode ? String(parseInt(parentNode.level) + 1) : '2';
            nodes.push({
                id: personId,
                name: item.name,
                title: item.title || '',
                department: item.department || '',
                level: personLevel,
                parentId: parentNodeId,
                order: String(idx + 1),
                x: '', y: '',
                _isDept: false
            });
        });

        // 부서 노드 내 순서 할당
        let orderIdx = 0;
        nodes.filter(n => n._isDept).forEach(n => { n.order = String(orderIdx++); });

        // 3. 일괄 저장
        const headers = SHEET_HEADERS['orgchart'];
        const rows = nodes.map(item =>
            headers.map(h => item[h] !== undefined ? String(item[h]) : '')
        );

        if (rows.length > 0) {
            await sheetsClient.spreadsheets.values.append({
                spreadsheetId: SHEET_ID,
                range: 'orgchart!A:Z',
                valueInputOption: 'RAW',
                requestBody: { values: rows }
            });
        }

        invalidateCache('orgchart');
        writeLog('ADMIN', `조직도 일괄 업로드: ${nodes.length}건`, `by=${req.user.email}`);
        res.json({ success: true, count: nodes.length });
    } catch (err) {
        writeLog('ERROR', '조직도 일괄 업로드 실패', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
