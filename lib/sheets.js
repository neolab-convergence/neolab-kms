/**
 * lib/sheets.js — SQLite 기반 데이터 저장소 (기존 Google Sheets 인터페이스 호환)
 *
 * 외부 Google Sheets 의존성을 제거하고 서버 자체 SQLite 파일을 사용합니다.
 * 모듈명은 호환성을 위해 'sheets'로 유지 (routes/* 변경 불필요).
 *
 * - 기존 SHEET_HEADERS 그대로 → SQLite 테이블 컬럼
 * - _rowIndex는 SQLite ROWID로 매핑 (기존 코드 그대로 동작)
 * - 캐시 로직(getCached, invalidateCache) 동일 인터페이스
 * - Google Sheets 백업 파일(_disaster_backup/sheet_data.json)에서 자동 import
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { writeLog } = require('./logger');

// 시트 이름 = 테이블 이름. 기존 헤더 그대로 사용.
const SHEET_HEADERS = {
    boards: ['id', 'name', 'icon', 'order', 'viewType'],
    categories: ['id', 'boardId', 'name', 'order', 'viewType'],
    posts: ['id', 'boardId', 'categoryId', 'title', 'type', 'icon', 'subInfo', 'content', 'url', 'fileName', 'views', 'date', 'order', 'thumbnail', 'bgColor', 'detailImage', 'ocrText'],
    notices: ['id', 'title', 'type', 'content', 'date'],
    contacts: ['id', 'name', 'position', 'dept', 'phone', 'email', 'status'],
    orgchart: ['id', 'name', 'title', 'department', 'level', 'parentId', 'order', 'x', 'y', 'color'],
    settings: ['key', 'value'],
    admins: ['email', 'name', 'passwordHash', 'addedBy', 'addedDate'],
    suggestions: ['id', 'content', 'date'],
    accessLogs: ['date', 'email', 'name', 'count']
};

// SQL 예약어 회피용 컬럼 이스케이프 (예: order → "order")
function q(col) { return '"' + col.replace(/"/g, '""') + '"'; }

let db = null;
const DB_PATH = path.join(__dirname, '..', 'data', 'kms.db');

async function initSheets() {
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');     // 동시 읽기/쓰기 안정성
    db.pragma('synchronous = NORMAL');    // 성능 + 안정성 균형
    db.pragma('foreign_keys = OFF');

    // 모든 테이블 생성 (없으면)
    for (const [name, headers] of Object.entries(SHEET_HEADERS)) {
        const cols = headers.map(h => `${q(h)} TEXT DEFAULT ''`).join(', ');
        db.exec(`CREATE TABLE IF NOT EXISTS ${q(name)} (${cols})`);
        // 누락된 컬럼이 있으면 자동 추가 (스키마 진화 대응)
        const existing = db.prepare(`PRAGMA table_info(${q(name)})`).all().map(r => r.name);
        for (const h of headers) {
            if (!existing.includes(h)) {
                db.exec(`ALTER TABLE ${q(name)} ADD COLUMN ${q(h)} TEXT DEFAULT ''`);
                writeLog('INFO', `컬럼 자동 추가: ${name}.${h}`);
            }
        }
    }

    // 빈 DB라면 백업 파일에서 자동 import
    const totalRows = Object.keys(SHEET_HEADERS).reduce((sum, name) => {
        const r = db.prepare(`SELECT COUNT(*) AS c FROM ${q(name)}`).get();
        return sum + r.c;
    }, 0);

    if (totalRows === 0) {
        // 1순위: _disaster_backup/sheet_data.json (수동 백업)
        // 2순위: backups/disaster_backup_*.json (서버 자동 백업)
        const candidates = [
            path.join(__dirname, '..', '_disaster_backup', 'sheet_data.json'),
            path.join(__dirname, '..', 'backups', 'sheet_data.json'),
        ];
        // backups/disaster_backup_*.json 중 가장 최근 파일 추가
        try {
            const backupDir = path.join(__dirname, '..', 'backups');
            if (fs.existsSync(backupDir)) {
                const dis = fs.readdirSync(backupDir)
                    .filter(f => f.startsWith('disaster_backup_') && f.endsWith('.json'))
                    .sort()
                    .reverse();
                if (dis.length > 0) candidates.push(path.join(backupDir, dis[0]));
            }
        } catch(e) {}

        let imported = false;
        for (const file of candidates) {
            if (fs.existsSync(file)) {
                try {
                    const dump = JSON.parse(fs.readFileSync(file, 'utf-8'));
                    importDump(dump);
                    writeLog('INFO', `SQLite 초기 데이터 import: ${file}`);
                    imported = true;
                    break;
                } catch(e) {
                    writeLog('ERROR', `import 실패: ${file}`, e.message);
                }
            }
        }
        if (!imported) writeLog('WARN', 'SQLite DB가 비어있고 백업 파일도 없음 (새 시작)');
    }

    writeLog('INFO', `SQLite DB 연결: ${DB_PATH}`);
}

// 백업 JSON 데이터 → DB 일괄 입력 (트랜잭션)
function importDump(dump) {
    const insertMany = db.transaction(() => {
        for (const [name, rows] of Object.entries(dump)) {
            if (!SHEET_HEADERS[name] || !Array.isArray(rows)) continue;
            // 기존 데이터 클리어 (안전: import 시점에 0이어야 하지만 명시적으로)
            db.prepare(`DELETE FROM ${q(name)}`).run();
            const headers = SHEET_HEADERS[name];
            const placeholders = headers.map(() => '?').join(',');
            const stmt = db.prepare(
                `INSERT INTO ${q(name)} (${headers.map(q).join(',')}) VALUES (${placeholders})`
            );
            for (const row of rows) {
                stmt.run(...headers.map(h => row[h] !== undefined && row[h] !== null ? String(row[h]) : ''));
            }
        }
    });
    insertMany();
}

// 모든 행 조회 (rowid를 _rowIndex로 매핑하여 호환성 유지)
async function getSheetData(sheetName) {
    if (!db || !SHEET_HEADERS[sheetName]) return [];
    try {
        const headers = SHEET_HEADERS[sheetName];
        const cols = headers.map(q).join(', ');
        const rows = db.prepare(`SELECT rowid AS _rowIndex, ${cols} FROM ${q(sheetName)}`).all();
        // 시트와 동일하게 모든 값을 string으로 보장 + 누락 필드는 빈 문자열
        return rows.map(r => {
            const obj = { _rowIndex: r._rowIndex };
            headers.forEach(h => { obj[h] = r[h] !== undefined && r[h] !== null ? String(r[h]) : ''; });
            return obj;
        });
    } catch (err) {
        writeLog('ERROR', `DB 읽기 오류 (${sheetName})`, err.message);
        return [];
    }
}

async function appendRow(sheetName, data) {
    if (!db || !SHEET_HEADERS[sheetName]) return;
    const headers = SHEET_HEADERS[sheetName];
    const placeholders = headers.map(() => '?').join(',');
    const values = headers.map(h => data[h] !== undefined && data[h] !== null ? String(data[h]) : '');
    db.prepare(`INSERT INTO ${q(sheetName)} (${headers.map(q).join(',')}) VALUES (${placeholders})`).run(...values);
}

async function updateRow(sheetName, rowIndex, data) {
    if (!db || !SHEET_HEADERS[sheetName]) return;
    if (!rowIndex) {
        throw new Error(`잘못된 rowIndex (${rowIndex})`);
    }
    const headers = SHEET_HEADERS[sheetName];
    const setClause = headers.map(h => `${q(h)}=?`).join(', ');
    const values = headers.map(h => data[h] !== undefined && data[h] !== null ? String(data[h]) : '');
    const result = db.prepare(`UPDATE ${q(sheetName)} SET ${setClause} WHERE rowid=?`).run(...values, rowIndex);
    if (result.changes === 0) {
        writeLog('WARN', `updateRow: 영향받은 행 없음 (${sheetName}/rowid=${rowIndex})`);
    }
}

async function deleteRow(sheetName, targetId) {
    if (!db || !SHEET_HEADERS[sheetName]) return;
    const keyField = sheetName === 'admins' ? 'email' : 'id';
    const result = db.prepare(`DELETE FROM ${q(sheetName)} WHERE ${q(keyField)}=?`).run(String(targetId));
    if (result.changes === 0) {
        writeLog('WARN', `삭제 대상 없음: ${sheetName}/${targetId}`);
    } else {
        writeLog('INFO', `행 삭제: ${sheetName}/${targetId}`);
    }
}

// 인메모리 캐시 (시트 호환)
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

// (시트 시절 호환용 no-op)
async function ensureHeaders(sheetName) { /* SQLite는 ALTER TABLE로 init 시 처리됨 */ }
async function createSheet(sheetName) { /* CREATE TABLE은 init 시 자동 */ }

// 특정 컬럼만 일괄 업데이트 (orgchart 등에서 사용)
// values: [[v1], [v2], ...] 형태 (시트 호환). rowid 1, 2, 3, ... 순
async function updateColumn(sheetName, columnName, values) {
    if (!db || !SHEET_HEADERS[sheetName]) return;
    if (!SHEET_HEADERS[sheetName].includes(columnName)) return;
    const tx = db.transaction(() => {
        const stmt = db.prepare(`UPDATE ${q(sheetName)} SET ${q(columnName)}=? WHERE rowid=?`);
        values.forEach((v, idx) => {
            const val = Array.isArray(v) ? v[0] : v;
            stmt.run(val !== undefined && val !== null ? String(val) : '', idx + 1);
        });
    });
    tx();
}

// 여러 행 일괄 업데이트
async function batchUpdateRows(sheetName, updates) {
    if (!db || !SHEET_HEADERS[sheetName] || updates.length === 0) return;
    const headers = SHEET_HEADERS[sheetName];
    const setClause = headers.map(h => `${q(h)}=?`).join(', ');
    const stmt = db.prepare(`UPDATE ${q(sheetName)} SET ${setClause} WHERE rowid=?`);
    const tx = db.transaction(() => {
        for (const u of updates) {
            const values = headers.map(h => u.data[h] !== undefined && u.data[h] !== null ? String(u.data[h]) : '');
            stmt.run(...values, u.rowIndex);
        }
    });
    tx();
}

// (시트 시절 호환용 — 사용처 없을 가능성 높지만 안전을 위해 유지)
function getSheetsClient() { return null; }
function getSheetId() { return null; }
function getDb() { return db; }

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
    ensureHeaders,
    clearAllCache,
    getSheetsClient,
    getSheetId,
    getDb,
    SHEET_HEADERS
};
