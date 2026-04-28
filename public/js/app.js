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

    var popular = posts.filter(function(p) { return parseInt(p.views) > 0; }).sort(function(a,b) { return (parseInt(b.views) || 0) - (parseInt(a.views) || 0); }).slice(0, 5);
    var popContainer = document.getElementById('dashboardPopularList');
    var medals = ['gold', 'silver', 'bronze', 'normal', 'normal'];
    if (popContainer) {
        popContainer.innerHTML = popular.length ? popular.map(function(p, i) {
            return '<div class="popular-item" onclick="goToBoardAndOpen(\'' + p.boardId + '\', \'' + p.id + '\')">' +
                '<div class="popular-rank ' + (medals[i] || 'normal') + '">' + (i+1) + '</div>' +
                '<div class="popular-title" style="flex:1;">' + p.title + '</div>' +
                '<div style="font-size:11px; color:var(--text-light)">조회 ' + (p.views||0) + '</div>' +
                '</div>';
        }).join('') : '<div style="padding:15px; text-align:center; color:#999;">아직 조회된 문서가 없습니다.</div>';
    }

    // 📂 카테고리 카드 보드 렌더링 (try-catch로 안전 처리)
    try {
        await renderCategoryBoard(posts, boardsMap);
    } catch (err) {
        console.error('카테고리 보드 렌더링 실패:', err);
    }
}

// 📂 카테고리 보드 렌더링 (홈 화면 빠른 진입 카드)
async function renderCategoryBoard(posts, boardsMap) {
    var container = document.getElementById('categoryBoard');
    if (!container) return;
    var boards = (await cachedGet('/api/boards')).slice().sort(function(a,b) {
        return (parseInt(a.order)||999) - (parseInt(b.order)||999);
    });
    // 보드별 게시물 수 집계
    var counts = {};
    posts.forEach(function(p) { counts[p.boardId] = (counts[p.boardId] || 0) + 1; });

    // 보드명 키워드별 아이콘/설명 매핑
    var iconMap = [
        { kw: ['회사', 'company'], icon: '🏢', desc: '회사 소개·연혁·CI 등' },
        { kw: ['규정', '제도', 'rule'], icon: '📋', desc: '복무·복리후생·경비 등' },
        { kw: ['제품', 'product'], icon: '📦', desc: '스마트펜 라인업·기술' },
        { kw: ['인사', '채용', 'hr', '인재'], icon: '👥', desc: '조직도·연락처' },
        { kw: ['도우미', '업무'], icon: '🛠️', desc: '업무용 가이드' },
        { kw: ['교육', '학습'], icon: '🎓', desc: '교육·학습 자료' },
        { kw: ['공지', 'notice'], icon: '📢', desc: '중요 공지사항' }
    ];
    function pickInfo(name) {
        var n = (name || '').toLowerCase();
        for (var i = 0; i < iconMap.length; i++) {
            for (var j = 0; j < iconMap[i].kw.length; j++) {
                if (n.indexOf(iconMap[i].kw[j].toLowerCase()) !== -1) return iconMap[i];
            }
        }
        return { icon: '📚', desc: '바로가기' };
    }
    function isHrBoard(name) { return /인사|채용|hr|인재/i.test(name || ''); }

    container.innerHTML = boards.map(function(b) {
        var count = counts[b.id] || 0;
        var info = pickInfo(b.name);
        var clickAction = isHrBoard(b.name)
            ? "goToHrContacts()"
            : "navigateTo('" + b.id + "')";
        var displayCount = isHrBoard(b.name) ? '인원 현황' : (count + '개 문서');
        return '<div class="cat-board-card" onclick="' + clickAction + '">' +
            '<div class="cat-board-icon">' + info.icon + '</div>' +
            '<div class="cat-board-name">' + b.name + '</div>' +
            '<div class="cat-board-desc">' + info.desc + '</div>' +
            '<div class="cat-board-meta">' +
            '<span class="cat-board-count">' + displayCount + '</span>' +
            '<svg class="cat-board-arrow" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>' +
            '</div></div>';
    }).join('');
}

// 🧑‍💼 인사정보 카드 클릭 → hr 페이지의 연락처 탭(전체 인원 현황)으로 이동
window.goToHrContacts = function() {
    if (typeof navigateTo === 'function') navigateTo('hr');
    setTimeout(function() {
        var contactsTab = document.querySelector('#hr .tab[data-tab="contacts"]');
        if (contactsTab && !contactsTab.classList.contains('active')) contactsTab.click();
        if (typeof loadContacts === 'function') loadContacts();
    }, 50);
};

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
