/* ==========================================
   동적 게시판 렌더링
========================================== */
async function renderDynamicBoardContent(boardId, targetCatId = null) {
    // 게시판 전환 시 인라인 뷰어 및 제품 상세 닫기
    closeInlineViewer();
    if (document.getElementById('productDetailView')) closeProductDetail();
    const boards = await cachedGet('/api/boards');
    const categories = await cachedGet('/api/categories');

    const board = boards.find(b => b.id === boardId);
    if(!board) return;

    document.getElementById('boardMainTitle').textContent = `📄 ${board.name}`;

    const filterContainer = document.getElementById('boardFilterContainer');
    const cats = (categories[boardId] || []).slice().sort(function(a, b) { return (parseInt(a.order) || 999) - (parseInt(b.order) || 999); });
    let filterHtml = `<button type="button" class="filter-btn active" data-category="all">전체</button>`;
    cats.forEach(c => { filterHtml += `<button type="button" class="filter-btn" data-category="${c.id}">${c.name}</button>`; });
    filterContainer.innerHTML = filterHtml;

    const filterBtns = filterContainer.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            filterBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            const catId = this.getAttribute('data-category');
            currentCategoryId = catId;

            // 카테고리별 보기 설정 적용 (없으면 보드 기본값으로 복원)
            let resolvedViewType = currentBoardViewType || 'list';
            if (catId !== 'all' && categories[boardId]) {
                const cat = categories[boardId].find(c => c.id === catId);
                if (cat && cat.viewType) resolvedViewType = cat.viewType;
            }

            currentViewMode = resolvedViewType;
            document.querySelectorAll('.view-toggle-btn').forEach(b => b.classList.remove('active'));
            const activeToggle = document.querySelector('.view-toggle-btn[data-view="' + resolvedViewType + '"]');
            if (activeToggle) activeToggle.classList.add('active');
            const listC = document.getElementById('boardGridContainer');
            const galleryC = document.getElementById('boardGalleryContainer');
            if (resolvedViewType === 'gallery') {
                if (listC) listC.style.display = 'none';
                if (galleryC) galleryC.style.display = 'grid';
            } else {
                if (listC) listC.style.display = 'flex';
                if (galleryC) galleryC.style.display = 'none';
            }

            renderPostGrid(boardId, catId);
        });
    });

    // 현재 게시판 ID 설정 (갤러리 뷰 전환에 필요)
    currentBoardId = boardId;
    currentCategoryId = targetCatId || 'all';

    // 게시판 기본 보기 설정 적용
    const currentBoard = board;
    currentBoardViewType = currentBoard.viewType || 'list';
    currentViewMode = currentBoardViewType;

    // targetCatId가 지정된 경우 해당 카테고리의 viewType 우선 적용
    if (targetCatId && targetCatId !== 'all' && categories[boardId]) {
        const targetCat = categories[boardId].find(c => c.id === targetCatId);
        if (targetCat && targetCat.viewType) {
            currentViewMode = targetCat.viewType;
        }
    }

    // 카테고리 없고 갤러리 전용이면 보기 전환 숨김
    const viewToggleEl = document.getElementById('viewToggle');
    const cats2 = categories[boardId] || [];
    if (cats2.length === 0 && currentBoardViewType === 'gallery') {
        if (viewToggleEl) viewToggleEl.style.display = 'none';
    } else {
        if (viewToggleEl) viewToggleEl.style.display = 'flex';
    }
    const toggleBtns = document.querySelectorAll('.view-toggle-btn');
    toggleBtns.forEach(function(b) { b.classList.remove('active'); });
    const activeToggle = document.querySelector('.view-toggle-btn[data-view="' + currentViewMode + '"]');
    if (activeToggle) activeToggle.classList.add('active');

    const listC = document.getElementById('boardGridContainer');
    const galleryC = document.getElementById('boardGalleryContainer');
    if (currentViewMode === 'gallery') {
        if (listC) listC.style.display = 'none';
        if (galleryC) galleryC.style.display = 'grid';
    } else {
        if (listC) listC.style.display = 'flex';
        if (galleryC) galleryC.style.display = 'none';
    }

    await renderPostGrid(boardId, targetCatId || 'all');

    if(targetCatId && targetCatId !== 'all') {
        const targetBtn = filterContainer.querySelector(`[data-category="${targetCatId}"]`);
        if(targetBtn) { filterBtns.forEach(b => b.classList.remove('active')); targetBtn.classList.add('active'); }
    }
}

async function renderPostGrid(boardId, categoryId = 'all') {
    // 현재 보드/카테고리 추적
    currentBoardId = boardId;
    currentCategoryId = categoryId;

    let url = `/api/posts?boardId=${boardId}`;
    if (categoryId !== 'all') url += `&categoryId=${categoryId}`;
    let posts = await api.get(url);
    const categories = await cachedGet('/api/categories');
    const catMap = {};
    if(categories[boardId]) categories[boardId].forEach(c => catMap[c.id] = c.name);

    // 순서 정렬
    posts = posts.sort((a, b) => (parseInt(a.order) || 999) - (parseInt(b.order) || 999));

    const grid = document.getElementById('boardGridContainer');

    if (posts.length === 0) {
        grid.innerHTML = `<div style="text-align: center; padding: 60px 20px; color: var(--text-light);">
            <div style="font-size: 48px; margin-bottom: 16px;">📭</div>
            <p style="font-size: 16px;">등록된 게시물이 없습니다.</p>
        </div>`;
        return;
    }

    const typeLabels = { pdf: 'PDF', docx: 'DOCX', xlsx: 'XLSX', pptx: 'PPTX', url: 'LINK', link: 'URL', text: 'TEXT' };

    const favs = getFavorites();
    const now = new Date();

    let html = `<div style="display:flex; justify-content:flex-end; margin-bottom:12px;">
        <button type="button" class="print-btn" onclick="window.print()">🖨️ 인쇄</button>
    </div>
    <table class="board-table">
        <thead><tr>
            <th style="width:30px;">★</th>
            <th style="width:50px;"></th>
            <th>제목</th>
            <th style="width:100px;">카테고리</th>
            <th style="width:80px;">유형</th>
            <th style="width:80px;">부가정보</th>
            <th style="width:80px;">날짜</th>
            <th style="width:60px;">조회</th>
        </tr></thead><tbody>`;

    posts.forEach(post => {
        let icon = '📋', typeClass = post.type || 'text';
        if(post.type === 'pdf') icon = '📕';
        else if(post.type === 'url') icon = '🔗';
        else if(post.type === 'docx') icon = '📄';
        else if(post.type === 'xlsx') icon = '📊';
        else if(post.type === 'pptx') icon = '📑';
        else if(post.type === 'link') icon = '🌐';
        if(post.icon && post.icon.trim() !== '') icon = post.icon;
        const catName = catMap[post.categoryId] || '기타';
        const isFav = favs.includes(post.id);
        // NEW 배지: 7일 이내 등록된 게시물
        const postDate = new Date(post.date);
        const diffDays = (now - postDate) / (1000 * 60 * 60 * 24);
        const newBadge = diffDays <= 7 ? '<span class="new-badge">NEW</span>' : '';

        html += `<tr>
            <td onclick="event.stopPropagation(); toggleFavorite('${post.id}', this)"><span class="fav-star ${isFav ? 'active' : ''}">${isFav ? '⭐' : '☆'}</span></td>
            <td class="td-icon" onclick="openPost('${post.id}')"><span class="board-row-icon ${typeClass}">${icon}</span></td>
            <td class="td-title" onclick="openPost('${post.id}')"><span class="board-row-title">${post.title}</span>${newBadge}</td>
            <td class="td-cat" onclick="openPost('${post.id}')"><span class="board-row-badge">${catName}</span></td>
            <td class="td-type" onclick="openPost('${post.id}')"><span class="board-row-type ${typeClass}">${typeLabels[post.type] || 'TEXT'}</span></td>
            <td onclick="openPost('${post.id}')" style="font-size:13px; color:var(--text-secondary);">${post.subInfo || '-'}</td>
            <td class="td-date" onclick="openPost('${post.id}')"><span class="board-row-date">${post.date || '-'}</span></td>
            <td class="td-views" onclick="openPost('${post.id}')"><span class="board-row-views">👁 ${post.views || 0}</span></td>
        </tr>`;
    });

    html += `</tbody></table>`;
    grid.innerHTML = html;

    // 갤러리 뷰도 동시 렌더링
    await renderGalleryView(boardId, categoryId);
}

function showPostModal(post, catName) {
    const modal = document.getElementById('noticeModal');
    document.getElementById('modalTitle').textContent = post.title;
    document.getElementById('modalBody').innerHTML = `
        <div style="margin-bottom: 15px; padding: 10px; background: rgba(255,103,32,0.05); border: 1px solid rgba(255,103,32,0.2); border-radius: 8px; color: var(--text-primary); font-size: 14px;">
            <strong>분류:</strong> <span class="dept-badge">${catName}</span>
            ${post.subInfo ? `<span style="margin-left:10px;"><strong>추가정보:</strong> ${post.subInfo}</span>` : ''}
            <span style="margin-left:10px;"><strong>조회수:</strong> ${post.views || 0}</span>
        </div>
        <div style="line-height: 1.8; color: var(--text-primary); overflow-x: auto; font-size: 15px;" oncontextmenu="return false">
            ${post.content || '등록된 내용이나 링크가 없습니다.'}
        </div>
    `;
    modal.classList.add('show');
}
