/* ==========================================
   사이드바 메뉴 렌더링
========================================== */
async function renderSidebarMenus() {
    const boards = (await cachedGet('/api/boards')).sort((a,b) => (parseInt(a.order)||999) - (parseInt(b.order)||999));
    const categories = await cachedGet('/api/categories');
    // 각 게시판의 카테고리도 정렬
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
async function navigateTo(pageId, pushToHistory = true, targetCatId = null) {
    if (!pageNames[pageId]) return;

    // 페이지 이동 시 인라인 뷰어 및 제품 상세 닫기
    closeInlineViewer();
    if (document.getElementById('productDetailView')) closeProductDetail();

    document.querySelectorAll('.menu-item').forEach(mi => mi.classList.remove('active'));
    const targetMenu = document.querySelector(`.menu-item[data-page="${pageId}"]`);
    if (targetMenu) {
        targetMenu.classList.add('active');
        const submenu = targetMenu.nextElementSibling;
        if (submenu && submenu.classList.contains('submenu')) {
            targetMenu.classList.add('expanded');
            submenu.classList.add('show');
        }
    }

    document.querySelectorAll('.page-section').forEach(ps => ps.classList.remove('active'));

    const boards = await cachedGet('/api/boards');
    const isDynamicBoard = boards.some(b => b.id === pageId);

    if (isDynamicBoard) {
        document.getElementById('dynamicBoardSection').classList.add('active');
        await renderDynamicBoardContent(pageId, targetCatId);
    } else {
        const targetSection = document.getElementById(pageId);
        if (targetSection) targetSection.classList.add('active');
    }

    // 빵가루 네비게이션 업데이트
    const breadcrumb = document.getElementById('breadcrumb');
    if (pageId === 'dashboard') {
        breadcrumb.innerHTML = `<span class="breadcrumb-current">🏠 홈</span>`;
    } else {
        let crumbHtml = `<span class="breadcrumb-item"><a onclick="navigateTo('dashboard')">🏠 홈</a></span><span class="breadcrumb-sep">›</span>`;
        if (targetCatId && targetCatId !== 'all') {
            const cats = await cachedGet('/api/categories');
            const boardCats = cats[pageId] || [];
            const cat = boardCats.find(c => c.id === targetCatId);
            crumbHtml += `<span class="breadcrumb-item"><a onclick="navigateTo('${pageId}')">${pageNames[pageId]?.replace(/^[^\s]+\s/, '') || pageId}</a></span>`;
            if (cat) crumbHtml += `<span class="breadcrumb-sep">›</span><span class="breadcrumb-current">${cat.name}</span>`;
        } else {
            crumbHtml += `<span class="breadcrumb-current">${pageNames[pageId] || pageId}</span>`;
        }
        breadcrumb.innerHTML = crumbHtml;
    }
    backBtn.style.display = pageId === 'dashboard' ? 'none' : 'flex';

    if (pushToHistory) history.pushState({ page: pageId, cat: targetCatId }, '', `#${pageId}`);
    if (window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('mobile-show');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.getElementById('sidebar').addEventListener('click', function(e) {
    const submenuItem = e.target.closest('.submenu-item');
    if (submenuItem) {
        const action = submenuItem.getAttribute('data-action');
        if (action === 'goto-board') {
            navigateTo(submenuItem.getAttribute('data-board'), true, submenuItem.getAttribute('data-cat'));
        } else if (action === 'goto-hr-contacts') {
            navigateTo('hr'); document.querySelector('#hr .tab[data-tab="contacts"]').click();
        } else if (action === 'goto-hr-org') {
            navigateTo('hr'); document.querySelector('#hr .tab[data-tab="orgchart"]').click();
        }
        return;
    }
    const menuItem = e.target.closest('.menu-item');
    if (menuItem) {
        if (menuItem.id === 'adminMenuBtn') return;
        const submenu = menuItem.nextElementSibling;
        const hasSubmenu = submenu && submenu.classList.contains('submenu');

        if (hasSubmenu) {
            // 서브메뉴가 있는 경우: 접기/펼치기 토글
            const isExpanded = menuItem.classList.contains('expanded');
            if (isExpanded) {
                // 이미 펼쳐져 있으면 접기
                menuItem.classList.remove('expanded');
                submenu.classList.remove('show');
            } else {
                // 접혀있으면 펼치고 해당 게시판으로 이동
                menuItem.classList.add('expanded');
                submenu.classList.add('show');
                const page = menuItem.getAttribute('data-page');
                if (page) navigateTo(page);
            }
        } else {
            // 서브메뉴가 없는 경우: 바로 이동
            const page = menuItem.getAttribute('data-page');
            if (page) navigateTo(page);
        }
    }
});
