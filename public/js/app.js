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

    // 📰 새 소식 타임라인 (최근 등록/수정 문서, 7일 이내 NEW 배지)
    var recent = posts.slice().sort(function(a,b) { return new Date(b.date || 0) - new Date(a.date || 0); }).slice(0, 6);
    var updateContainer = document.getElementById('dashboardUpdateList');
    var now = new Date();
    if (updateContainer) {
        updateContainer.innerHTML = recent.length ? recent.map(function(p) {
            var d = new Date(p.date);
            var daysAgo = Math.floor((now - d) / (1000 * 60 * 60 * 24));
            var dateLabel = daysAgo === 0 ? '오늘' : daysAgo === 1 ? '어제' : daysAgo < 7 ? daysAgo + '일 전' : (p.date || '-');
            var isNew = daysAgo <= 7;
            return '<div class="timeline-item" onclick="goToBoardAndOpen(\'' + p.boardId + '\', \'' + p.id + '\')">' +
                '<div class="timeline-marker">' + (p.icon || '📄') + '</div>' +
                '<div class="timeline-content">' +
                '<div class="timeline-title">' + (isNew ? '<span class="timeline-new">NEW</span> ' : '') + p.title + '</div>' +
                '<div class="timeline-meta"><span class="timeline-badge">' + (boardsMap[p.boardId] || p.boardId) + '</span><span>' + dateLabel + '</span></div>' +
                '</div></div>';
        }).join('') : '<div style="padding:15px; text-align:center; color:#999;">최근 등록된 문서가 없습니다.</div>';
    }

    // 🔥 인기 문서 TOP 5
    var popular = posts.filter(function(p) { return parseInt(p.views) > 0; }).sort(function(a,b) { return (parseInt(b.views) || 0) - (parseInt(a.views) || 0); }).slice(0, 5);
    var popContainer = document.getElementById('dashboardPopularList');
    var medals = ['gold', 'silver', 'bronze', 'normal', 'normal'];
    if (popContainer) {
        popContainer.innerHTML = popular.length ? popular.map(function(p, i) {
            return '<div class="popular-item" onclick="goToBoardAndOpen(\'' + p.boardId + '\', \'' + p.id + '\')">' +
                '<div class="popular-rank ' + (medals[i] || 'normal') + '">' + (i+1) + '</div>' +
                '<div class="popular-title" style="flex:1;">' + p.title + '</div>' +
                '<div style="font-size:11px; color:var(--text-light); white-space:nowrap;">조회 ' + (p.views||0) + '</div>' +
                '</div>';
        }).join('') : '<div style="padding:15px; text-align:center; color:#999;">아직 조회된 문서가 없습니다.</div>';
    }

    // 📂 카테고리 카드 보드 (회사정보, 사내규정, 제품 등 메인 보드별)
    await renderCategoryBoard(posts, boardsMap);
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

    // 보드명 키워드별 아이콘 매핑
    var iconMap = {
        '회사': '🏢', '회사정보': '🏢', 'company': '🏢',
        '규정': '📋', '제도': '📋', 'rule': '📋',
        '제품': '📦', '프로덕트': '📦', 'product': '📦',
        '인사': '👥', '채용': '👥', 'HR': '👥',
        '도우미': '🛠️', '업무': '🛠️',
        '교육': '🎓', '학습': '🎓',
        '공지': '📢', 'notice': '📢'
    };
    var descMap = {
        '회사': '회사 소개·연혁·CI 등', 'company': '회사 소개·연혁·CI 등',
        '규정': '복무·복리후생·경비 등', 'rule': '복무·복리후생·경비 등',
        '제품': '스마트펜 라인업·기술', 'product': '스마트펜 라인업·기술',
        '인사': '조직도·연락처', 'HR': '조직도·연락처',
        '도우미': '업무용 가이드', '업무': '업무용 가이드'
    };
    function pickIcon(name) {
        var n = (name||'').toLowerCase();
        for (var k in iconMap) { if (n.indexOf(k.toLowerCase()) !== -1) return iconMap[k]; }
        return '📚';
    }
    function pickDesc(name) {
        var n = (name||'').toLowerCase();
        for (var k in descMap) { if (n.indexOf(k.toLowerCase()) !== -1) return descMap[k]; }
        return '';
    }

    container.innerHTML = boards.map(function(b) {
        var count = counts[b.id] || 0;
        var icon = pickIcon(b.name);
        var desc = pickDesc(b.name);
        return '<div class="cat-board-card" onclick="navigateTo(\'' + b.id + '\')">' +
            '<div class="cat-board-icon">' + icon + '</div>' +
            '<div class="cat-board-name">' + b.name + '</div>' +
            (desc ? '<div class="cat-board-desc">' + desc + '</div>' : '<div class="cat-board-desc">바로가기</div>') +
            '<div class="cat-board-meta">' +
            '<span class="cat-board-count">' + count + '개 문서</span>' +
            '<svg class="cat-board-arrow" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>' +
            '</div></div>';
    }).join('');
}

// 🔍 히어로 검색바: Enter 시 글로벌 검색으로 위임
function bindHeroSearch() {
    var hero = document.getElementById('heroSearch');
    var globalInput = document.getElementById('globalSearch');
    if (!hero || !globalInput) return;
    hero.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            globalInput.value = hero.value;
            globalInput.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter' }));
        }
    });
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
    bindHeroSearch();
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
