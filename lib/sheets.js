const { google } = require('googleapis');
const fs = require('fs');
const { writeLog } = require('./logger');

let sheets;
let SHEET_ID = process.env.GOOGLE_SHEET_ID;

const SHEET_HEADERS = {
    boards: ['id', 'name', 'icon', 'order', 'viewType'],
    categories: ['id', 'boardId', 'name', 'order', 'viewType'],
    posts: ['id', 'boardId', 'categoryId', 'title', 'type', 'icon', 'subInfo', 'content', 'url', 'fileName', 'views', 'date', 'order', 'thumbnail', 'bgColor', 'detailImage', 'ocrText'],
    notices: ['id', 'title', 'type', 'content', 'date'],
    contacts: ['id', 'name', 'position', 'dept', 'phone', 'email', 'status'],
    orgchart: ['id', 'name', 'title', 'department', 'level', 'parentId', 'order'],
    settings: ['key', 'value'],
    admins: ['email', 'name', 'passwordHash', 'addedBy', 'addedDate'],
    suggestions: ['id', 'content', 'date'],
    accessLogs: ['date', 'email', 'name', 'count']
};

async function initSheets() {
    const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
    if (!keyPath || !fs.existsSync(keyPath)) {
        writeLog('WARN', '서비스 계정 키 파일이 없습니다. Google Sheets 연동이 비활성화됩니다.');
        return;
    }
    const auth = new google.auth.GoogleAuth({
        keyFile: keyPath,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    sheets = google.sheets({ version: 'v4', auth });
    writeLog('INFO', 'Google Sheets 연결 완료');
}

async function getSheetData(sheetName) {
    if (!sheets) return [];
    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${sheetName}!A:Z`
        });
        const rows = res.data.values;
        if (!rows || rows.length < 2) return [];
        const headers = rows[0];
        return rows.slice(1).map((row, idx) => {
            const obj = { _rowIndex: idx + 2 };
            headers.forEach((h, i) => { obj[h] = row[i] || ''; });
            return obj;
        });
    } catch (err) {
        if (err.code === 400 || err.message?.includes('Unable to parse range')) {
            await createSheet(sheetName);
            return [];
        }
        writeLog('ERROR', `Sheets 읽기 오류 (${sheetName})`, err.message);
        return [];
    }
}

async function createSheet(sheetName) {
    if (!sheets) return;
    try {
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SHEET_ID,
            requestBody: {
                requests: [{ addSheet: { properties: { title: sheetName } } }]
            }
        });
        const headers = SHEET_HEADERS[sheetName];
        if (headers) {
            await sheets.spreadsheets.values.update({
                spreadsheetId: SHEET_ID,
                range: `${sheetName}!A1`,
                valueInputOption: 'RAW',
                requestBody: { values: [headers] }
            });
        }
        writeLog('INFO', `시트 생성 완료: ${sheetName}`);
    } catch (err) {
        if (!err.message?.includes('already exists')) {
            writeLog('ERROR', `시트 생성 오류 (${sheetName})`, err.message);
        }
    }
}

async function appendRow(sheetName, data) {
    if (!sheets) return;
    const headers = SHEET_HEADERS[sheetName];
    const row = headers.map(h => data[h] !== undefined ? String(data[h]) : '');
    await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${sheetName}!A:Z`,
        valueInputOption: 'RAW',
        requestBody: { values: [row] }
    });
}

async function updateRow(sheetName, rowIndex, data) {
    if (!sheets) return;
    const headers = SHEET_HEADERS[sheetName];
    const row = headers.map(h => data[h] !== undefined ? String(data[h]) : '');
    await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${sheetName}!A${rowIndex}`,
        valueInputOption: 'RAW',
        requestBody: { values: [row] }
    });
}

async function deleteRow(sheetName, targetId) {
    if (!sheets) return;
    const freshData = await getSheetData(sheetName);
    const keyField = sheetName === 'admins' ? 'email' : 'id';
    const row = freshData.find(r => r[keyField] === targetId);
    if (!row) {
        writeLog('WARN', `삭제 대상 없음: ${sheetName}/${targetId}`);
        return;
    }
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    const sheet = meta.data.sheets.find(s => s.properties.title === sheetName);
    if (!sheet) return;
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
            requests: [{
                deleteDimension: {
                    range: {
                        sheetId: sheet.properties.sheetId,
                        dimension: 'ROWS',
                        startIndex: row._rowIndex - 1,
                        endIndex: row._rowIndex
                    }
                }
            }]
        }
    });
    writeLog('INFO', `행 삭제: ${sheetName}/${targetId}`);
}

// 인메모리 캐시
const cache = {};
const CACHE_TTL = 30000;

async function getCached(sheetName) {
    const now = Date.now();
    if (cache[sheetName] && (now - cache[sheetName].time < CACHE_TTL)) {
        return cache[sheetName].data;
    }
    const data = await getSheetData(sheetName);
    cache[sheetName] = { data, time: now };
    return data;
}

function invalidateCache(sheetName) {
    delete cache[sheetName];
}

function clearAllCache() {
    Object.keys(cache).forEach(k => delete cache[k]);
}

// 특정 컬럼만 일괄 업데이트 (단일 API 호출 = 쓰기 1회)
async function updateColumn(sheetName, columnName, values) {
    if (!sheets || values.length === 0) return;
    const headers = SHEET_HEADERS[sheetName];
    const colIdx = headers.indexOf(columnName);
    if (colIdx < 0) return;
    const colLetter = String.fromCharCode(65 + colIdx); // A=0, B=1, ...
    const range = `${sheetName}!${colLetter}2:${colLetter}${values.length + 1}`;
    await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range,
        valueInputOption: 'RAW',
        requestBody: { values }
    });
}

async function batchUpdateRows(sheetName, updates) {
    if (!sheets || updates.length === 0) return;
    const headers = SHEET_HEADERS[sheetName];
    const data = updates.map(u => ({
        range: `${sheetName}!A${u.rowIndex}`,
        values: [headers.map(h => u.data[h] !== undefined ? String(u.data[h]) : '')]
    }));
    await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: { valueInputOption: 'RAW', data }
    });
}

function getSheetsClient() {
    return sheets;
}

function getSheetId() {
    return SHEET_ID;
}

module.exports = {
    initSheets,
    getSheetData,
    createSheet,
    appendRow,
    updateRow,
    updateColumn,
    batchUpdateRows,
    deleteRow,
    getCached,
    invalidateCache,
    clearAllCache,
    getSheetsClient,
    getSheetId,
    SHEET_HEADERS
};
