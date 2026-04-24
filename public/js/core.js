/* ==========================================
   API 클라이언트 레이어
========================================== */
var _apiLoading = 0;
function showLoading() {
    _apiLoading++;
    var el = document.getElementById('globalLoading');
    if (el) el.style.display = 'flex';
}
function hideLoading() {
    _apiLoading = Math.max(0, _apiLoading - 1);
    if (_apiLoading === 0) {
        var el = document.getElementById('globalLoading');
        if (el) el.style.display = 'none';
    }
}
async function _fetch(path, opts) {
    showLoading();
    try {
        var res = await fetch(path, opts);
        if (res.status === 401) { window.location.href = '/login.html'; throw new Error('Unauthorized'); }
        if (res.status === 503) { var msg = '현재 시스템 점검 중입니다. 잠시 후 다시 이용해주세요.'; alert(msg); throw new Error('503: ' + msg); }
        if (!res.ok) {
            // 에러 응답을 JSON 우선, 실패 시 텍스트로 파싱
            var body = await res.text();
            var errMsg = body;
            try {
                var parsed = JSON.parse(body);
                if (parsed && parsed.error) errMsg = parsed.error;
            } catch(e) { /* JSON 아니면 그대로 텍스트 사용 */ }
            // HTML 응답은 잘라냄 (너무 김)
            if (errMsg && errMsg.length > 300) errMsg = errMsg.substring(0, 300);
            throw new Error(res.status + ': ' + errMsg);
        }
        return res.json();
    } finally { hideLoading(); }
}
const api = {
    async get(path) { return _fetch(path); },
    async post(path, data) { return _fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); },
    async put(path, data) { return _fetch(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); },
    async del(path) { return _fetch(path, { method: 'DELETE' }); },
    async upload(file) {
        var fd = new FormData(); fd.append('file', file);
        return _fetch('/api/upload', { method: 'POST', body: fd });
    }
};

// 인메모리 캐시 (API 호출 최소화)
const dataCache = {};
async function cachedGet(path, ttl = 15000) {
    const now = Date.now();
    if (dataCache[path] && (now - dataCache[path].time < ttl)) return dataCache[path].data;
    const data = await api.get(path);
    dataCache[path] = { data, time: now };
    return data;
}
function invalidate(path) { delete dataCache[path]; }
function invalidateAll() { Object.keys(dataCache).forEach(k => delete dataCache[k]); }

/* ==========================================
   전역 상태
========================================== */
let currentUser = null;
const pageNames = { 'dashboard': '🏠 홈', 'hr': '👥 인사정보', 'notices': '📢 공지사항', 'suggestions': '💡 개선요청', 'search-results': '🔍 검색 결과' };
const backBtn = document.getElementById('backBtn');

// 내부 히스토리 스택 (브라우저 히스토리와 별개로 직접 관리)
var navHistory = [];
var navHistoryLock = false;
