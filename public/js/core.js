/* ==========================================
   API 클라이언트 레이어
========================================== */
const api = {
    async get(path) {
        const res = await fetch(path);
        if (res.status === 401) { window.location.href = '/login.html'; throw new Error('Unauthorized'); }
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },
    async post(path, data) {
        const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        if (res.status === 401) { window.location.href = '/login.html'; throw new Error('Unauthorized'); }
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },
    async put(path, data) {
        const res = await fetch(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        if (res.status === 401) { window.location.href = '/login.html'; throw new Error('Unauthorized'); }
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },
    async del(path) {
        const res = await fetch(path, { method: 'DELETE' });
        if (res.status === 401) { window.location.href = '/login.html'; throw new Error('Unauthorized'); }
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    },
    async upload(file) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        if (res.status === 401) { window.location.href = '/login.html'; throw new Error('Unauthorized'); }
        if (!res.ok) throw new Error(await res.text());
        return res.json();
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
const pageNames = { 'dashboard': '🏠 홈', 'hr': '👥 인사정보', 'notices': '📢 공지사항', 'search-results': '🔍 검색 결과' };
const backBtn = document.getElementById('backBtn');
