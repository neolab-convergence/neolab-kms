/* ==========================================
   홈
========================================== */
async function updateDashboardStats() {
    const posts = await cachedGet('/api/posts');
    const contacts = await cachedGet('/api/contacts');

    document.getElementById('count-total').setAttribute('data-target', posts.length);
    document.getElementById('count-reg').setAttribute('data-target', posts.filter(p => p.boardId === 'rule').length);
    document.getElementById('count-emp').setAttribute('data-target', contacts.filter(c => c.status === 'active').length);

    ['count-total', 'count-reg', 'count-emp'].forEach(id => animateCounter(document.getElementById(id)));
}

async function loadDashboardWidgets() {
    const posts = await cachedGet('/api/posts');
    const boardsMap = {};
    (await cachedGet('/api/boards')).forEach(b => boardsMap[b.id] = b.name);

    const recent = [...posts].sort((a,b) => new Date(b.date || 0) - new Date(a.date || 0)).slice(0, 5);
    const updateContainer = document.getElementById('dashboardUpdateList');
    if(updateContainer) {
        updateContainer.innerHTML = recent.length ? recent.map(p => `
            <div class="update-item" onclick="goToBoardAndOpen('${p.boardId}', '${p.id}')">
                <div class="update-icon" style="background: rgba(255,103,32,0.1); color: var(--primary)">${p.icon || '📄'}</div>
                <div class="update-content">
                    <div class="update-title">${p.title}</div>
                    <div class="update-meta"><span class="dept-badge">${boardsMap[p.boardId] || p.boardId}</span><span>${p.date || '-'}</span></div>
                </div>
            </div>
        `).join('') : '<div style="padding:15px; text-align:center; color:#999;">최근 업데이트된 문서가 없습니다.</div>';
    }

    const popular = [...posts].filter(p => parseInt(p.views) > 0).sort((a,b) => (parseInt(b.views) || 0) - (parseInt(a.views) || 0)).slice(0, 4);
    const popContainer = document.getElementById('dashboardPopularList');
    const medals = ['gold', 'silver', 'bronze', 'normal'];
    if(popContainer) {
        popContainer.innerHTML = popular.length ? popular.map((p, i) => `
            <div class="popular-item" onclick="goToBoardAndOpen('${p.boardId}', '${p.id}')">
                <div class="popular-rank ${medals[i] || 'normal'}">${i+1}</div>
                <div class="popular-title" style="flex:1;">${p.title}</div>
                <div style="font-size:11px; color:var(--text-light)">조회 ${p.views||0}</div>
            </div>
        `).join('') : '<div style="padding:15px; text-align:center; color:#999;">아직 조회된 문서가 없습니다.</div>';
    }
}

// popstate는 navigation.js에서 처리 (중복 제거)

/* ==========================================
   앱 초기화
========================================== */
window.addEventListener('DOMContentLoaded', async () => {
    try {
        currentUser = await api.get('/api/me');
    } catch(e) {
        window.location.href = '/login.html';
        return;
    }

    const adminBtn = document.getElementById('adminMenuBtn');
    if (!currentUser.isAdmin) adminBtn.style.display = 'none';

    initDarkMode();
    await renderSidebarMenus();
    await updateNewBadges();
    await renderFavorites();
    await renderRecentViewed();
    await updateDashboardStats();
    await loadDashboardWidgets();
    await loadNoticeCards();
    await loadContacts();
    await loadOrgChart();

    // 초기 페이지 설정
    navHistory = [{ type: 'page', page: 'dashboard', cat: null }];

    const boards = await cachedGet('/api/boards');
    const hash = window.location.hash.replace('#', '');
    if (hash && (pageNames[hash] || boards.find(b => b.id === hash))) {
        navigateTo(hash, true);
    } else {
        navigateTo('dashboard', false);
    }
});
