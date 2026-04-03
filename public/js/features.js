/* ==========================================
   다크모드
========================================== */
function initDarkMode() {
    const saved = localStorage.getItem('kms-dark-mode');
    if (saved === 'true') {
        document.body.classList.add('dark-mode');
        document.getElementById('darkModeToggle').textContent = '☀️';
    }
}
document.getElementById('darkModeToggle').addEventListener('click', function() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('kms-dark-mode', isDark);
    this.textContent = isDark ? '☀️' : '🌙';
});

/* ==========================================
   즐겨찾기 (localStorage 기반)
========================================== */
function getFavorites() {
    try { return JSON.parse(localStorage.getItem('kms-favorites') || '[]'); } catch { return []; }
}
function saveFavorites(favs) {
    localStorage.setItem('kms-favorites', JSON.stringify(favs));
}
function toggleFavorite(postId, el) {
    let favs = getFavorites();
    const idx = favs.indexOf(postId);
    if (idx > -1) {
        favs.splice(idx, 1);
        el.querySelector('.fav-star').className = 'fav-star';
        el.querySelector('.fav-star').textContent = '☆';
    } else {
        favs.push(postId);
        el.querySelector('.fav-star').className = 'fav-star active';
        el.querySelector('.fav-star').textContent = '⭐';
    }
    saveFavorites(favs);
    renderFavorites();
}

async function renderFavorites() {
    const favs = getFavorites();
    const section = document.getElementById('favoritesSection');
    const list = document.getElementById('favoritesList');
    if (!favs.length) { section.style.display = 'none'; return; }

    const posts = await cachedGet('/api/posts');
    const favPosts = posts.filter(p => favs.includes(p.id));
    if (!favPosts.length) { section.style.display = 'none'; return; }

    section.style.display = 'block';
    list.innerHTML = favPosts.map(p => `
        <div class="quick-item" onclick="openPost('${p.id}')">
            <div class="quick-item-title">⭐ ${p.title}</div>
            <div class="quick-item-meta">${p.date || ''}</div>
        </div>
    `).join('');
}

/* ==========================================
   AI 챗봇
   ========================================== */
const chatHistory = [];

function toggleChatbot() {
    const panel = document.getElementById('chatbotPanel');
    const toggle = document.getElementById('chatbotToggle');
    if (panel.style.display === 'none' || panel.style.display === '') {
        panel.style.display = 'flex';
        toggle.innerHTML = '✕';
        toggle.style.background = '#666';
        document.getElementById('chatInput').focus();
    } else {
        panel.style.display = 'none';
        toggle.innerHTML = '💬';
        toggle.style.background = 'var(--primary)';
    }
}

async function sendChat() {
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (!msg) return;

    const container = document.getElementById('chatMessages');

    // 사용자 메시지 표시
    container.innerHTML += `<div style="align-self:flex-end; background:var(--primary); color:white; padding:10px 16px; border-radius:12px; border-top-right-radius:4px; font-size:13px; max-width:85%;">${escapeHtml(msg)}</div>`;
    input.value = '';

    // 로딩 표시
    const loadingId = 'loading-' + Date.now();
    container.innerHTML += `<div id="${loadingId}" style="background:rgba(255,103,32,0.08); padding:12px 16px; border-radius:12px; border-top-left-radius:4px; font-size:13px; max-width:85%; color:var(--text-light);">🤖 답변을 생성하고 있습니다...</div>`;
    container.scrollTop = container.scrollHeight;

    chatHistory.push({ role: 'user', content: msg });

    try {
        const res = await api.post('/api/chat', { message: msg, history: chatHistory.slice(-6) });

        // 로딩 제거
        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) loadingEl.remove();

        // AI 답변 표시
        let answerHtml = escapeHtml(res.answer).replace(/\n/g, '<br>');

        // 관련 문서 링크 추가
        if (res.references && res.references.length > 0) {
            answerHtml += '<div style="margin-top:10px; padding-top:8px; border-top:1px solid rgba(0,0,0,0.1); font-size:12px;">';
            answerHtml += '<div style="font-weight:700; margin-bottom:4px;">📎 관련 문서:</div>';
            res.references.forEach(ref => {
                answerHtml += `<div style="cursor:pointer; color:var(--primary); padding:2px 0;" onclick="toggleChatbot(); goToBoardAndOpen('${ref.boardId}', '${ref.id}')">📄 ${escapeHtml(ref.title)}</div>`;
            });
            answerHtml += '</div>';
        }

        container.innerHTML += `<div style="background:rgba(255,103,32,0.08); padding:12px 16px; border-radius:12px; border-top-left-radius:4px; font-size:13px; max-width:85%; color:var(--text-primary);">${answerHtml}</div>`;

        chatHistory.push({ role: 'assistant', content: res.answer });

    } catch (err) {
        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) loadingEl.remove();
        container.innerHTML += `<div style="background:rgba(239,68,68,0.1); padding:12px 16px; border-radius:12px; border-top-left-radius:4px; font-size:13px; max-width:85%; color:#ef4444;">죄송합니다. 오류가 발생했습니다. 다시 시도해주세요.</div>`;
    }

    container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/* ==========================================
   최근 본 문서 (localStorage 기반)
========================================== */
function getRecentViewed() {
    try { return JSON.parse(localStorage.getItem('kms-recent') || '[]'); } catch { return []; }
}
function addRecentViewed(postId) {
    let recent = getRecentViewed();
    recent = recent.filter(id => id !== postId);
    recent.unshift(postId);
    if (recent.length > 10) recent = recent.slice(0, 10);
    localStorage.setItem('kms-recent', JSON.stringify(recent));
}

async function renderRecentViewed() {
    const recent = getRecentViewed();
    const section = document.getElementById('recentSection');
    const list = document.getElementById('recentList');
    if (!recent.length) { section.style.display = 'none'; return; }

    const posts = await cachedGet('/api/posts');
    const recentPosts = recent.map(id => posts.find(p => p.id === id)).filter(Boolean).slice(0, 5);
    if (!recentPosts.length) { section.style.display = 'none'; return; }

    section.style.display = 'block';
    list.innerHTML = recentPosts.map(p => `
        <div class="quick-item" onclick="goToBoardAndOpen('${p.boardId}', '${p.id}')" style="border-left-color: var(--brand-gray);">
            <div class="quick-item-title">🕐 ${p.title}</div>
            <div class="quick-item-meta">${p.date || ''}</div>
        </div>
    `).join('');
}

/* ==========================================
   NEW 배지: 사이드바 메뉴에 표시
========================================== */
async function updateNewBadges() {
    try {
        const posts = await cachedGet('/api/posts');
        const boards = await cachedGet('/api/boards');
        const now = new Date();
        boards.forEach(board => {
            const boardPosts = posts.filter(p => p.boardId === board.id);
            const hasNew = boardPosts.some(p => {
                const d = new Date(p.date);
                return (now - d) / (1000*60*60*24) <= 7;
            });
            const menuItem = document.querySelector(`.menu-item[data-page="${board.id}"] .menu-text`);
            if (menuItem) {
                const existing = menuItem.querySelector('.new-badge');
                if (existing) existing.remove();
                if (hasNew) menuItem.insertAdjacentHTML('beforeend', '<span class="new-badge">NEW</span>');
            }
        });
    } catch(e) { /* ignore */ }
}

/* ==========================================
   공지사항
========================================== */
async function loadNoticeCards() {
    const notices = await cachedGet('/api/notices');
    const container = document.getElementById('noticeListContainer');
    if (!container) return;
    container.innerHTML = '';
    if (notices.length === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 40px; color: #999;"><p>📢 등록된 공지사항이 없습니다</p></div>`;
        return;
    }
    notices.forEach(notice => {
        const badgeClass = notice.type === 'urgent' ? 'urgent' : notice.type === 'important' ? 'important' : 'info';
        const badgeText = notice.type === 'urgent' ? '긴급' : notice.type === 'important' ? '중요' : '공지';
        const card = document.createElement('div');
        card.className = 'notice-card';
        card.innerHTML = `
            <div class="notice-card-header"><span class="notice-type ${badgeClass}">${badgeText}</span><span class="notice-card-title">${notice.title}</span></div>
            <div class="notice-card-meta">관리자 | ${notice.date}</div>
        `;
        card.addEventListener('click', () => { showPostModal({title: notice.title, content: notice.content, subInfo: notice.date}, badgeText); });
        container.appendChild(card);
    });
}

/* ==========================================
   연락처
========================================== */
async function loadContacts() {
    const contacts = await cachedGet('/api/contacts');
    const tbody = document.getElementById('contactTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (contacts.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px; color: #999;">등록된 연락처가 없습니다</td></tr>`; return;
    }
    contacts.forEach(contact => {
        let badgeClass = 'active';
        if (contact.status === 'dispatch' || (contact.status || '').includes('파견')) badgeClass = 'dispatch';
        if (contact.status === 'leave' || (contact.status || '').includes('휴직')) badgeClass = 'leave';
        const colors = ['#ff6720', '#53565A', '#10b981', '#f59e0b', '#ef4444', '#ff8547', '#757980'];
        const color = colors[parseInt(contact.id) % colors.length];
        tbody.innerHTML += `
            <tr data-dept="${contact.dept}">
                <td><div style="display: flex; align-items: center; gap: 12px;"><div class="avatar" style="background: ${color};">${(contact.name || '?').substring(0, 1)}</div><span>${contact.name}</span></div></td>
                <td>${contact.position}</td><td>${contact.dept}</td><td>${contact.phone}</td><td>${contact.email}</td>
                <td><span class="status-badge ${badgeClass}">${contact.status === 'active' ? '재직중' : contact.status === 'leave' ? '휴직중' : contact.status === 'dispatch' ? '파견중' : contact.status}</span></td>
            </tr>
        `;
    });
}

/* ==========================================
   조직도
========================================== */
async function loadOrgChart() {
    try {
        const settings = await cachedGet('/api/settings');
        const orgChartFile = settings.orgChartImage || '';
        const imgDiv = document.getElementById('orgChartImage');
        const emptyDiv = document.getElementById('orgChartEmpty');
        if (!imgDiv) return;

        if (orgChartFile) {
            document.getElementById('orgChartImg').src = '/api/files/' + orgChartFile;
            imgDiv.style.display = 'block';
            if (emptyDiv) emptyDiv.style.display = 'none';
        } else {
            imgDiv.style.display = 'none';
            if (emptyDiv) emptyDiv.style.display = 'block';
        }
    } catch(e) { console.error('조직도 로드 오류:', e); }
}

/* ==========================================
   UI 헬퍼
========================================== */
document.getElementById('sidebarToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle(window.innerWidth <= 768 ? 'mobile-show' : 'collapsed');
});

function animateCounter(el) {
    if(!el) return;
    const target = parseInt(el.getAttribute('data-target')) || 0;
    let current = 0, step = target / (2000 / 16);
    if(target === 0) { el.textContent = 0; return; }
    const t = setInterval(() => { current += step; if(current >= target) { el.textContent = target; clearInterval(t); } else el.textContent = Math.floor(current); }, 16);
}

document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', function() {
        const targetTab = this.getAttribute('data-tab');
        const parent = this.closest('section');
        parent.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        parent.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
        parent.querySelector(`#${targetTab}`).classList.add('active');
    });
});

const contactSearch = document.getElementById('contactSearch');
const deptFilter = document.getElementById('deptFilter');
function filterContacts() {
    const tbody = document.getElementById('contactTableBody');
    if (!contactSearch || !tbody) return;
    const term = contactSearch.value.toLowerCase();
    const dept = deptFilter ? deptFilter.value : 'all';
    tbody.querySelectorAll('tr').forEach(row => {
        const n = row.cells[0]?.textContent.toLowerCase() || '';
        const d = row.getAttribute('data-dept') || '';
        const deptMatch = dept === 'all' || d.includes(dept) || (dept === 'CEO' && (d === 'CEO' || d === 'CSO' || d === 'COO' || d.startsWith('COO') || d.startsWith('CSO')));
        row.style.display = (n.includes(term) || d.toLowerCase().includes(term)) && deptMatch ? '' : 'none';
    });
}
if (contactSearch) contactSearch.addEventListener('input', filterContacts);
if (deptFilter) deptFilter.addEventListener('change', filterContacts);

let sortDirection = {};
document.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', function() {
        const column = this.getAttribute('data-sort');
        const tbody = this.closest('table').querySelector('tbody');
        const rows = Array.from(tbody.querySelectorAll('tr'));
        sortDirection[column] = !sortDirection[column];
        const direction = sortDirection[column] ? 1 : -1;
        rows.sort((a, b) => {
            let aVal = a.cells[column==='name'?0:column==='position'?1:2].textContent.trim();
            let bVal = b.cells[column==='name'?0:column==='position'?1:2].textContent.trim();
            return aVal.localeCompare(bVal, 'ko') * direction;
        });
        rows.forEach(row => tbody.appendChild(row));
    });
});

const scrollTop = document.getElementById('scrollTop');
window.addEventListener('scroll', () => { scrollTop.classList.toggle('show', window.scrollY > 300); });
if (scrollTop) scrollTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
