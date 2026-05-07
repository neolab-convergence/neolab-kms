/* ==========================================
   사이드바 메뉴 렌더링
========================================== */
async function renderSidebarMenus() {
    var boards = (await cachedGet('/api/boards')).sort(function(a,b) { return (parseInt(a.order)||999) - (parseInt(b.order)||999); });
    var categories = await cachedGet('/api/categories');
    Object.keys(categories).forEach(function(k) {
        if (Array.isArray(categories[k])) categories[k].sort(function(a,b) { return (parseInt(a.order)||999) - (parseInt(b.order)||999); });
    });
    var dynamicArea = document.getElementById('dynamicSidebarArea');
    var html = '';

    // 인사/채용/HR 관련 보드에 연락처/조직도를 자동 주입 (메뉴 이름 변경에도 유지)
    // "인사", "채용", "HR", "인재" 중 하나라도 포함된 메뉴에 고정 (대소문자 무시)
    var HR_HOST_KEYWORDS = ['인사', '채용', 'hr', '인재'];
    var hrHostAttached = false; // 첫 번째 매칭 보드에만 부착

    // 보드명 키워드 → Heroicons(outline) SVG path 매핑 (테마 일관성 유지)
    // 다중 path는 '||'로 구분하여 여러 <path>를 렌더링
    var ICON_MAP = [
        { kw: ['회사', '회사정보', '소개'], path: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0h2m-2 0v-5a1 1 0 00-1-1h-2a1 1 0 00-1 1v5m-6 0V9a1 1 0 011-1h2a1 1 0 011 1v12' },
        { kw: ['규정', '제도', '정책'], path: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
        { kw: ['제품', '프로덕트', 'product'], path: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z' },
        { kw: ['가이드', '매뉴얼', '생활'], path: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
        { kw: ['인사', '채용', 'hr'], path: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
        { kw: ['공지', '알림', 'notice'], path: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
        { kw: ['인프라', '네트워크', 'infra'], path: 'M5 12H3l9-9 9 9h-2M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7M5 12l7-7 7 7' },
        { kw: ['교육', '학습', '연수'], path: 'M12 14l9-5-9-5-9 5 9 5z||M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm0 0l6.16-3.422' },
        { kw: ['보안', 'security'], path: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
        { kw: ['이벤트', '행사', '일정'], path: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
        // Ncode 도트 패턴: 3x3 격자에 작은 점 9개
        { kw: ['ncode', 'n코드'], path: 'M7 7l0 0M12 7l0 0M17 7l0 0M7 12l0 0M12 12l0 0M17 12l0 0M7 17l0 0M12 17l0 0M17 17l0 0', strokeWidth: 3 }
    ];
    var DEFAULT_ICON = 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z';

    function pickIconEntry(name) {
        var n = (name || '').toLowerCase();
        for (var i = 0; i < ICON_MAP.length; i++) {
            var entry = ICON_MAP[i];
            for (var j = 0; j < entry.kw.length; j++) {
                if (n.indexOf(entry.kw[j].toLowerCase()) !== -1) return entry;
            }
        }
        return null;
    }

    function buildIconSvg(input) {
        var pathStr = (typeof input === 'string') ? input : input.path;
        var sw = (typeof input === 'object' && input.strokeWidth) ? input.strokeWidth : 2;
        var paths = pathStr.split('||').map(function(p) {
            return '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="' + sw + '" d="' + p + '"/>';
        }).join('');
        return '<svg class="menu-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">' + paths + '</svg>';
    }

    boards.forEach(function(board) {
        pageNames[board.id] = '📋 ' + board.name;
        var boardNameLower = (board.name || '').trim().toLowerCase();
        var isHrHost = !hrHostAttached && HR_HOST_KEYWORDS.some(function(kw) {
            return boardNameLower.indexOf(kw.toLowerCase()) !== -1;
        });
        if (isHrHost) hrHostAttached = true;
        var innerItems = '';
        if (categories[board.id] && categories[board.id].length > 0) {
            categories[board.id].forEach(function(cat) {
                innerItems += '<div class="submenu-item" data-action="goto-board" data-board="' + board.id + '" data-cat="' + cat.id + '">' + cat.name + '</div>';
            });
        }
        if (isHrHost) {
            innerItems += '<div class="submenu-item" data-action="goto-hr-contacts">연락처</div>';
            innerItems += '<div class="submenu-item" data-action="goto-hr-org">조직도</div>';
        }
        var subHtml = innerItems ? ('<div class="submenu">' + innerItems + '</div>') : '';
        // 보드명 키워드 매칭이 우선, 매칭 없으면 DB의 board.icon, 그것도 없으면 DEFAULT
        var iconInput = pickIconEntry(board.name) || board.icon || DEFAULT_ICON;
        html += '<div class="menu-item" data-page="' + board.id + '">' +
            buildIconSvg(iconInput) +
            '<span class="menu-text">' + board.name + '</span>' +
            (subHtml ? '<svg class="menu-arrow" width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>' : '') +
            '</div>' + subHtml;
    });
    dynamicArea.innerHTML = html;
}

/* ==========================================
   페이지 네비게이션 (히스토리 통합 관리)
========================================== */

// _skipPushState: popstate에서 호출 시 pushState 방지용 내부 플래그
var _skipPushState = false;

async function navigateTo(pageId, pushToHistory, targetCatId) {
    if (pushToHistory === undefined) pushToHistory = true;
    if (!pageNames[pageId]) return;

    // 페이지 이동 시 인라인 뷰어 및 제품 상세 닫기
    closeInlineViewer();
    var detailView = document.getElementById('productDetailView');
    if (detailView && detailView.style.display !== 'none') closeProductDetail();

    // 사이드바 메뉴 활성화
    document.querySelectorAll('.menu-item').forEach(function(mi) { mi.classList.remove('active'); });
    var targetMenu = document.querySelector('.menu-item[data-page="' + pageId + '"]');
    if (targetMenu) {
        targetMenu.classList.add('active');
        var submenu = targetMenu.nextElementSibling;
        if (submenu && submenu.classList.contains('submenu')) {
            targetMenu.classList.add('expanded');
            submenu.classList.add('show');
        }
    }

    // 페이지 섹션 전환
    document.querySelectorAll('.page-section').forEach(function(ps) { ps.classList.remove('active'); });
    var boards = await cachedGet('/api/boards');
    var isDynamicBoard = boards.some(function(b) { return b.id === pageId; });

    if (isDynamicBoard) {
        document.getElementById('dynamicBoardSection').classList.add('active');
        await renderDynamicBoardContent(pageId, targetCatId);
    } else {
        var targetSection = document.getElementById(pageId);
        if (targetSection) targetSection.classList.add('active');
    }

    // 빵가루 네비게이션
    var breadcrumb = document.getElementById('breadcrumb');
    if (pageId === 'dashboard') {
        breadcrumb.innerHTML = '<span class="breadcrumb-current">🏠 홈</span>';
    } else {
        var crumbHtml = '<span class="breadcrumb-item"><a onclick="navigateTo(\'dashboard\')">🏠 홈</a></span><span class="breadcrumb-sep">›</span>';
        if (targetCatId && targetCatId !== 'all') {
            var cats = await cachedGet('/api/categories');
            var boardCats = cats[pageId] || [];
            var cat = boardCats.find(function(c) { return c.id === targetCatId; });
            crumbHtml += '<span class="breadcrumb-item"><a onclick="navigateTo(\'' + pageId + '\')">' + (pageNames[pageId] || pageId).replace(/^[^\s]+\s/, '') + '</a></span>';
            if (cat) crumbHtml += '<span class="breadcrumb-sep">›</span><span class="breadcrumb-current">' + cat.name + '</span>';
        } else {
            crumbHtml += '<span class="breadcrumb-current">' + (pageNames[pageId] || pageId) + '</span>';
        }
        breadcrumb.innerHTML = crumbHtml;
    }

    // 히스토리 관리
    if (pushToHistory) {
        navHistory.push({ type: 'page', page: pageId, cat: targetCatId || null });
        // 브라우저 히스토리에도 push (popstate에서 호출된 경우 제외)
        if (!_skipPushState) {
            history.pushState({ page: pageId, cat: targetCatId || null }, '', '#' + pageId);
        }
    }

    updateBackBtn();
    if (window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('mobile-show');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 뒤로가기 버튼 상태
function updateBackBtn() {
    backBtn.style.display = navHistory.length > 1 ? 'flex' : 'none';
}

// 뒤로가기 실행 (버튼 클릭 전용)
function goBack() {
    // 게시물 상세가 열려있으면 먼저 닫기
    var detailView = document.getElementById('productDetailView');
    if (detailView && detailView.style.display !== 'none') {
        closeProductDetail();
        if (navHistory.length > 0 && navHistory[navHistory.length - 1].type === 'post') {
            navHistory.pop();
        }
        updateBackBtn();
        return;
    }

    // 이전 페이지로 이동
    if (navHistory.length > 1) {
        navHistory.pop(); // 현재 제거
        var prev = navHistory[navHistory.length - 1];
        _skipPushState = true;
        navigateTo(prev.page, false, prev.cat);
        _skipPushState = false;
        // 브라우저 히스토리도 뒤로
        history.back();
    } else {
        navigateTo('dashboard', false);
    }
    updateBackBtn();
}

// 뒤로가기 버튼 클릭
backBtn.addEventListener('click', function() {
    goBack();
});

// 브라우저 뒤로가기/앞으로가기 (popstate)
window.addEventListener('popstate', function(e) {
    // 게시물 상세가 열려있으면 먼저 닫기
    var detailView = document.getElementById('productDetailView');
    if (detailView && detailView.style.display !== 'none') {
        closeProductDetail();
        if (navHistory.length > 0 && navHistory[navHistory.length - 1].type === 'post') {
            navHistory.pop();
        }
        updateBackBtn();
        // 다시 현재 state로 push해서 브라우저 히스토리 유지
        if (navHistory.length > 0) {
            var cur = navHistory[navHistory.length - 1];
            history.pushState({ page: cur.page, cat: cur.cat }, '', '#' + cur.page);
        }
        return;
    }

    // state에서 페이지 정보 읽기
    var state = e.state;
    if (state && state.page) {
        // navHistory 동기화
        if (navHistory.length > 1) navHistory.pop();
        _skipPushState = true;
        navigateTo(state.page, false, state.cat);
        _skipPushState = false;
    } else {
        // state가 없으면 (최초 페이지) 대시보드로
        navHistory = [{ type: 'page', page: 'dashboard', cat: null }];
        _skipPushState = true;
        navigateTo('dashboard', false);
        _skipPushState = false;
    }
    updateBackBtn();
});

// 사이드바 클릭 핸들러
document.getElementById('sidebar').addEventListener('click', function(e) {
    var submenuItem = e.target.closest('.submenu-item');
    if (submenuItem) {
        var action = submenuItem.getAttribute('data-action');
        if (action === 'goto-board') {
            navigateTo(submenuItem.getAttribute('data-board'), true, submenuItem.getAttribute('data-cat'));
        } else if (action === 'goto-hr-contacts') {
            navigateTo('hr'); document.querySelector('#hr .tab[data-tab="contacts"]').click();
        } else if (action === 'goto-hr-org') {
            navigateTo('hr'); document.querySelector('#hr .tab[data-tab="orgchart"]').click();
        }
        return;
    }
    var menuItem = e.target.closest('.menu-item');
    if (menuItem) {
        if (menuItem.id === 'adminMenuBtn') return;
        var submenu = menuItem.nextElementSibling;
        var hasSubmenu = submenu && submenu.classList.contains('submenu');

        if (hasSubmenu) {
            var isExpanded = menuItem.classList.contains('expanded');
            if (isExpanded) {
                menuItem.classList.remove('expanded');
                submenu.classList.remove('show');
            } else {
                menuItem.classList.add('expanded');
                submenu.classList.add('show');
                var page = menuItem.getAttribute('data-page');
                if (page) navigateTo(page);
            }
        } else {
            var page = menuItem.getAttribute('data-page');
            if (page) navigateTo(page);
        }
    }
});
