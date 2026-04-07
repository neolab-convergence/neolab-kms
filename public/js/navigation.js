/* ==========================================
   사이드바 메뉴 렌더링
========================================== */
async function renderSidebarMenus() {
    const boards = (await cachedGet('/api/boards')).sort((a,b) => (parseInt(a.order)||999) - (parseInt(b.order)||999));
    const categories = await cachedGet('/api/categories');
    Object.keys(categories).forEach(k => {
        if (Array.isArray(categories[k])) categories[k].sort((a,b) => (parseInt(a.order)||999) - (parseInt(b.order)||999));
    });
    const dynamicArea = document.getElementById('dynamicSidebarArea');

    let html = '';

    boards.forEach(board => {
        pageNames[board.id] = `📋 ${board.name}`;
        let subHtml = '';
        if (categories[board.id] && categories[board.id].length > 0) {
            subHtml += `<div class="submenu">`;
            categories[board.id].forEach(cat => {
                subHtml += `<div class="submenu-item" data-action="goto-board" data-board="${board.id}" data-cat="${cat.id}">${cat.name}</div>`;
            });
            subHtml += `</div>`;
        }
        html += `
            <div class="menu-item" data-page="${board.id}">
                <svg class="menu-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${board.icon || 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'}"/>
                </svg>
                <span class="menu-text">${board.name}</span>
                ${subHtml ? `<svg class="menu-arrow" width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>` : ''}
            </div>
            ${subHtml}
        `;
    });

    dynamicArea.innerHTML = html;
}

/* ==========================================
   페이지 네비게이션
========================================== */
async function navigateTo(pageId, pushToHistory, targetCatId) {
    if (pushToHistory === undefined) pushToHistory = true;
    if (!pageNames[pageId]) return;

    // 페이지 이동 시 인라인 뷰어 및 제품 상세 닫기
    closeInlineViewer();
    var detailView = document.getElementById('productDetailView');
    if (detailView && detailView.style.display !== 'none') closeProductDetail();

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

    // 빵가루 네비게이션 업데이트
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
    }
    updateBackBtn();
    if (window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('mobile-show');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 뒤로가기 버튼 상태 업데이트
function updateBackBtn() {
    backBtn.style.display = navHistory.length > 1 ? 'flex' : 'none';
}

// 뒤로가기 실행
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
        navigateTo(prev.page, false, prev.cat);
    } else {
        navigateTo('dashboard', false);
    }
    updateBackBtn();
}

// 뒤로가기 버튼 클릭
backBtn.addEventListener('click', function() {
    goBack();
});

// 브라우저 뒤로가기/앞으로가기
window.addEventListener('popstate', function(e) {
    goBack();
});

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
