/* ==========================================
   홈
========================================== */
async function updateDashboardStats() {
    var posts = await cachedGet('/api/posts');
    var contacts = await cachedGet('/api/contacts');

    document.getElementById('count-total').setAttribute('data-target', posts.length);
    document.getElementById('count-reg').setAttribute('data-target', posts.filter(function(p) { return p.boardId === 'rule'; }).length);
    document.getElementById('count-emp').setAttribute('data-target', contacts.filter(function(c) { return c.status === 'active'; }).length);

    ['count-total', 'count-reg', 'count-emp'].forEach(function(id) { animateCounter(document.getElementById(id)); });
}

async function loadDashboardWidgets() {
    var posts = await cachedGet('/api/posts');
    var boardsMap = {};
    (await cachedGet('/api/boards')).forEach(function(b) { boardsMap[b.id] = b.name; });

    var recent = posts.slice().sort(function(a,b) { return new Date(b.date || 0) - new Date(a.date || 0); }).slice(0, 5);
    var updateContainer = document.getElementById('dashboardUpdateList');
    if (updateContainer) {
        updateContainer.innerHTML = recent.length ? recent.map(function(p) {
            return '<div class="update-item" onclick="goToBoardAndOpen(\'' + p.boardId + '\', \'' + p.id + '\')">' +
                '<div class="update-icon" style="background: rgba(255,103,32,0.1); color: var(--primary)">' + (p.icon || '📄') + '</div>' +
                '<div class="update-content">' +
                '<div class="update-title">' + p.title + '</div>' +
                '<div class="update-meta"><span class="dept-badge">' + (boardsMap[p.boardId] || p.boardId) + '</span><span>' + (p.date || '-') + '</span></div>' +
                '</div></div>';
        }).join('') : '<div style="padding:15px; text-align:center; color:#999;">최근 업데이트된 문서가 없습니다.</div>';
    }

    var popular = posts.filter(function(p) { return parseInt(p.views) > 0; }).sort(function(a,b) { return (parseInt(b.views) || 0) - (parseInt(a.views) || 0); }).slice(0, 4);
    var popContainer = document.getElementById('dashboardPopularList');
    var medals = ['gold', 'silver', 'bronze', 'normal'];
    if (popContainer) {
        popContainer.innerHTML = popular.length ? popular.map(function(p, i) {
            return '<div class="popular-item" onclick="goToBoardAndOpen(\'' + p.boardId + '\', \'' + p.id + '\')">' +
                '<div class="popular-rank ' + (medals[i] || 'normal') + '">' + (i+1) + '</div>' +
                '<div class="popular-title" style="flex:1;">' + p.title + '</div>' +
                '<div style="font-size:11px; color:var(--text-light)">조회 ' + (p.views||0) + '</div>' +
                '</div>';
        }).join('') : '<div style="padding:15px; text-align:center; color:#999;">아직 조회된 문서가 없습니다.</div>';
    }
}

/* ==========================================
   앱 초기화
========================================== */
window.addEventListener('DOMContentLoaded', async function() {
    try {
        currentUser = await api.get('/api/me');
    } catch(e) {
        window.location.href = '/login.html';
        return;
    }

    var adminBtn = document.getElementById('adminMenuBtn');
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

    // 초기 히스토리: 대시보드를 기본으로 설정
    // replaceState로 현재 페이지를 대시보드로 마킹 (뒤로가기 시 로그인으로 안 감)
    history.replaceState({ page: 'dashboard', cat: null }, '', '#dashboard');
    navHistory = [{ type: 'page', page: 'dashboard', cat: null }];

    var boards = await cachedGet('/api/boards');
    var hash = window.location.hash.replace('#', '');

    // 딥링크: #post/123 형태로 직접 게시물 열기
    if (hash.startsWith('post/')) {
        var postId = hash.split('/')[1];
        if (postId) {
            navigateTo('dashboard', false);
            setTimeout(function() { openPost(postId); }, 300);
            return;
        }
    }

    if (hash && hash !== 'dashboard' && (pageNames[hash] || boards.find(function(b) { return b.id === hash; }))) {
        navigateTo(hash, true);
    } else {
        navigateTo('dashboard', false);
    }
});
