// ═══ 관리자 게시물 테이블 ═══
var adminPostPage = 1;
const ADMIN_POSTS_PER_PAGE = 15;
var adminEditPostId = null;
var adminPostSortField = 'order';
var adminPostSortDir = 1; // 1=오름, -1=내림

window.sortAdminPosts = function(field) {
    if (adminPostSortField === field) { adminPostSortDir *= -1; }
    else { adminPostSortField = field; adminPostSortDir = 1; }
    adminPostPage = 1;
    loadAdminPostTable();
};

async function loadAdminPostTable() {
    const boardFilter = document.getElementById('adminPostBoardFilter');
    const catFilter = document.getElementById('adminPostCatFilter');
    const searchInput = document.getElementById('adminPostSearchInput');
    const searchField = document.getElementById('adminPostSearchField');
    if (!boardFilter) return;

    const boards = await cachedGet('/api/boards');
    const categories = await cachedGet('/api/categories');

    if (boardFilter.options.length <= 1) {
        boards.sort((a,b) => (parseInt(a.order)||999) - (parseInt(b.order)||999));
        boards.forEach(b => { const o = document.createElement('option'); o.value = b.id; o.textContent = b.name; boardFilter.appendChild(o); });
    }

    const selectedBoard = boardFilter.value;
    const prevCat = catFilter.value;
    catFilter.innerHTML = '<option value="all">전체 카테고리</option>';
    if (selectedBoard !== 'all' && categories[selectedBoard]) {
        categories[selectedBoard].forEach(c => { const o = document.createElement('option'); o.value = c.id; o.textContent = c.name; catFilter.appendChild(o); });
    }
    // 이전 선택 복원 (옵션에 있으면)
    if (prevCat && prevCat !== 'all') {
        var hasOpt = Array.from(catFilter.options).some(function(o) { return o.value === prevCat; });
        if (hasOpt) catFilter.value = prevCat;
    }

    let posts = await api.get('/api/posts');
    // 정렬 적용
    posts = posts.sort(function(a, b) {
        var va, vb;
        if (adminPostSortField === 'order') { va = parseInt(a.order)||999; vb = parseInt(b.order)||999; }
        else if (adminPostSortField === 'title') { va = (a.title||''); vb = (b.title||''); return va.localeCompare(vb, 'ko') * adminPostSortDir; }
        else if (adminPostSortField === 'date') { va = a.date||''; vb = b.date||''; return va.localeCompare(vb) * adminPostSortDir * -1; }
        else if (adminPostSortField === 'views') { va = parseInt(a.views)||0; vb = parseInt(b.views)||0; }
        else { va = parseInt(a.order)||999; vb = parseInt(b.order)||999; }
        return (va - vb) * adminPostSortDir;
    });
    if (selectedBoard !== 'all') posts = posts.filter(p => p.boardId === selectedBoard);
    const selectedCat = catFilter.value;
    if (selectedCat !== 'all') posts = posts.filter(p => p.categoryId === selectedCat);

    const query = (searchInput ? searchInput.value : '').toLowerCase().trim();
    if (query) {
        const field = searchField ? searchField.value : 'title';
        posts = posts.filter(p => field === 'content' ? (p.content||'').toLowerCase().includes(query) : (p.title||'').toLowerCase().includes(query));
    }

    const boardMap = {}; boards.forEach(b => { boardMap[b.id] = b.name; });
    const catMap = {}; Object.keys(categories).forEach(k => { if (Array.isArray(categories[k])) categories[k].forEach(c => { catMap[c.id] = c.name; }); });

    document.getElementById('adminPostCount').textContent = '총 ' + posts.length + '개';

    const totalPages = Math.max(1, Math.ceil(posts.length / ADMIN_POSTS_PER_PAGE));
    if (adminPostPage > totalPages) adminPostPage = totalPages;
    const startIdx = (adminPostPage - 1) * ADMIN_POSTS_PER_PAGE;
    const pagePosts = posts.slice(startIdx, startIdx + ADMIN_POSTS_PER_PAGE);

    const tbody = document.getElementById('adminPostTableBody');
    const typeLabels = { pdf:'PDF', docx:'DOCX', xlsx:'XLSX', pptx:'PPTX', url:'LINK', link:'URL', text:'TEXT' };

    if (pagePosts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:40px; color:var(--text-light);">등록된 게시물이 없습니다.</td></tr>';
    } else {
        tbody.innerHTML = pagePosts.map((p, i) =>
            `<tr>
                <td class="td-check"><input type="checkbox" class="post-check" value="${p.id}"></td>
                <td class="td-num">${startIdx + i + 1}</td>
                <td><span class="td-badge badge-cat">${boardMap[p.boardId]||''}</span></td>
                <td><span class="td-badge badge-cat">${catMap[p.categoryId]||''}</span></td>
                <td class="td-title-link" onclick="editPost('${p.id}')">${p.title}</td>
                <td><span class="board-row-type ${p.type||'text'}">${typeLabels[p.type]||'TEXT'}</span></td>
                <td style="font-size:13px; color:var(--text-light);">${p.date||'-'}</td>
                <td style="font-size:13px; color:var(--text-light);">${p.views||0}</td>
                <td>
                    <button type="button" onclick="editPost('${p.id}')" style="background:none; border:1px solid var(--primary); color:var(--primary); padding:4px 10px; border-radius:4px; cursor:pointer; font-size:12px; margin-right:4px;">수정</button>
                    <button type="button" onclick="deleteOnePost('${p.id}')" style="background:none; border:1px solid #ef4444; color:#ef4444; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:12px;">삭제</button>
                </td>
            </tr>`
        ).join('');
    }

    const pagDiv = document.getElementById('adminPostPagination');
    let pagHtml = '';
    if (totalPages > 1) {
        pagHtml += `<button class="admin-page-btn" onclick="goAdminPage(1)">&laquo;</button>`;
        pagHtml += `<button class="admin-page-btn" onclick="goAdminPage(${Math.max(1, adminPostPage-1)})">&lsaquo;</button>`;
        const startPage = Math.max(1, adminPostPage - 2);
        const endPage = Math.min(totalPages, startPage + 4);
        for (let pg = startPage; pg <= endPage; pg++) {
            pagHtml += `<button class="admin-page-btn${pg === adminPostPage ? ' active' : ''}" onclick="goAdminPage(${pg})">${pg}</button>`;
        }
        pagHtml += `<button class="admin-page-btn" onclick="goAdminPage(${Math.min(totalPages, adminPostPage+1)})">&rsaquo;</button>`;
        pagHtml += `<button class="admin-page-btn" onclick="goAdminPage(${totalPages})">&raquo;</button>`;
    }
    pagDiv.innerHTML = pagHtml;
}

window.goAdminPage = function(page) { adminPostPage = page; loadAdminPostTable(); };
window.toggleAllPostChecks = function(checked) { document.querySelectorAll('.post-check').forEach(cb => { cb.checked = checked; }); };

window.deleteSelectedPosts = async function() {
    const checks = document.querySelectorAll('.post-check:checked');
    if (checks.length === 0) return alert('삭제할 게시물을 선택해주세요.');
    if (!confirm(checks.length + '개 게시물을 삭제하시겠습니까?')) return;
    for (const cb of checks) { await api.del('/api/posts/' + cb.value); }
    invalidateAll(); loadAdminPostTable();
};

window.deleteOnePost = async function(id) {
    if (!confirm('이 게시물을 삭제하시겠습니까?')) return;
    await api.del('/api/posts/' + id);
    invalidateAll(); loadAdminPostTable();
};

// ═══ 일괄 이동 ═══
window.moveSelectedPosts = async function() {
    var checks = document.querySelectorAll('.post-check:checked');
    if (checks.length === 0) return alert('이동할 게시물을 선택해주세요.');

    var boards = await cachedGet('/api/boards');
    var boardOpts = boards.map(function(b) { return b.id + ':' + b.name; }).join('\n');
    var targetBoard = prompt('이동할 게시판 ID를 입력하세요:\n\n' + boardOpts);
    if (!targetBoard) return;
    var boardId = targetBoard.split(':')[0].trim();
    if (!boards.find(function(b) { return b.id === boardId; })) return alert('유효하지 않은 게시판입니다.');

    var categories = await cachedGet('/api/categories');
    var cats = categories[boardId] || [];
    var catId = '';
    if (cats.length > 0) {
        var catOpts = cats.map(function(c) { return c.id + ':' + c.name; }).join('\n');
        var targetCat = prompt('카테고리 ID를 입력하세요 (빈칸=미지정):\n\n' + catOpts);
        if (targetCat) catId = targetCat.split(':')[0].trim();
    }

    if (!confirm(checks.length + '개 게시물을 [' + boardId + '] 게시판으로 이동하시겠습니까?')) return;

    for (var i = 0; i < checks.length; i++) {
        var moveData = { boardId: boardId };
        if (catId) moveData.categoryId = catId;
        await api.put('/api/posts/' + checks[i].value, moveData);
    }
    invalidateAll(); loadAdminPostTable();
    alert(checks.length + '개 게시물이 이동되었습니다.');
};

// ═══ 글쓰기/수정 모달 ═══
window.openWriteModal = async function(postId) {
    adminEditPostId = postId || null;
    const modal = document.getElementById('writeModalOverlay');
    const title = document.getElementById('writeModalTitle');

    const boards = await cachedGet('/api/boards');
    const categories = await cachedGet('/api/categories');
    const boardSelect = document.getElementById('writeBoard');
    boardSelect.innerHTML = '';
    boards.sort((a,b) => (parseInt(a.order)||999) - (parseInt(b.order)||999));
    boards.forEach(b => { const o = document.createElement('option'); o.value = b.id; o.textContent = b.name; boardSelect.appendChild(o); });

    const currentFilter = document.getElementById('adminPostBoardFilter');
    if (currentFilter && currentFilter.value !== 'all') boardSelect.value = currentFilter.value;
    updateWriteCategories();

    // 드롭존/진행바 초기화
    var droppedInfo = document.getElementById('writeDroppedInfo');
    if (droppedInfo) { droppedInfo.style.display = 'none'; droppedInfo.innerHTML = ''; }
    var progressEl = document.getElementById('writeProgress');
    if (progressEl) progressEl.style.display = 'none';

    if (postId) {
        title.textContent = '게시물 수정';
        const post = await api.get('/api/posts/' + postId);
        // 원본 데이터 보존 (수정 시 기존 이미지/파일 유지용)
        window._writeEditOriginal = {
            thumbnail: post.thumbnail || '',
            detailImage: post.detailImage || '',
            bgColor: post.bgColor || '',
            fileName: post.fileName || ''
        };
        boardSelect.value = post.boardId;
        updateWriteCategories();
        document.getElementById('writeCat').value = post.categoryId;
        document.getElementById('writeTitle').value = post.title;
        document.getElementById('writeType').value = post.type || 'text';
        document.getElementById('writeSubInfo').value = post.subInfo || '';
        document.getElementById('writeUrl').value = post.url || '';
        document.getElementById('writeContent').value = post.content || '';
        document.getElementById('writeFileStatus').textContent = post.fileName ? '기존 파일: ' + post.fileName : '';
        if (document.getElementById('writeBgColor')) document.getElementById('writeBgColor').value = post.bgColor || '#ffffff';
        // 기존 썸네일/상세이미지 미리보기
        var thumbPreview = document.getElementById('writeThumbPreview');
        if (thumbPreview) thumbPreview.innerHTML = post.thumbnail ? '<img src="/api/files/' + post.thumbnail + '" style="max-height:80px; border-radius:6px; border:1px solid var(--border-color);"> <span style="font-size:12px; color:var(--text-light);">기존 썸네일</span>' : '';
        var detailPreview = document.getElementById('writeDetailPreview');
        if (detailPreview) {
            var existingDetails = (post.detailImage || '').split('|').filter(Boolean);
            detailPreview.innerHTML = existingDetails.map(function(f) {
                return '<div style="position:relative; display:inline-block;"><img src="/api/files/' + f + '" style="max-height:80px; border-radius:6px; border:1px solid var(--border-color);"></div>';
            }).join('') + (existingDetails.length ? '<div style="font-size:12px; color:var(--text-light); margin-top:4px;">기존 제품설명 이미지 ' + existingDetails.length + '장 (새로 선택하면 교체됩니다)</div>' : '');
        }
        // 수정 시 추가 설정 열기
        var advSection = document.getElementById('writeAdvancedSection');
        var advArrow = document.getElementById('writeAdvancedArrow');
        if (advSection) advSection.classList.add('open');
        if (advArrow) advArrow.innerHTML = '&#9650;';
    } else {
        title.textContent = '글쓰기';
        document.getElementById('writeTitle').value = '';
        document.getElementById('writeType').value = 'text';
        document.getElementById('writeSubInfo').value = '';
        document.getElementById('writeUrl').value = '';
        document.getElementById('writeContent').value = '';
        document.getElementById('writeFileStatus').textContent = '';
        if (document.getElementById('writeFile')) document.getElementById('writeFile').value = '';
        if (document.getElementById('writeThumb')) document.getElementById('writeThumb').value = '';
        for (var di = 1; di <= 3; di++) { var dEl = document.getElementById('writeDetailImage' + di); if (dEl) dEl.value = ''; }
        var imgInput = document.getElementById('writeImages');
        if (imgInput) imgInput.value = '';
        var imgPreview = document.getElementById('writeImagesPreview');
        if (imgPreview) imgPreview.innerHTML = '';
        var imgStatus = document.getElementById('writeImagesStatus');
        if (imgStatus) imgStatus.textContent = '';
        var thumbPreview2 = document.getElementById('writeThumbPreview');
        if (thumbPreview2) thumbPreview2.innerHTML = '';
        var detailPreview2 = document.getElementById('writeDetailPreview');
        if (detailPreview2) detailPreview2.innerHTML = '';
        // 새 글 작성 시 추가 설정 닫기
        var advSection2 = document.getElementById('writeAdvancedSection');
        var advArrow2 = document.getElementById('writeAdvancedArrow');
        if (advSection2) advSection2.classList.remove('open');
        if (advArrow2) advArrow2.innerHTML = '&#9660;';
        if (document.getElementById('writeBgColor')) document.getElementById('writeBgColor').value = '#ffffff';
    }
    toggleWriteFields();
    modal.classList.add('show');
};

window.closeWriteModal = function() { document.getElementById('writeModalOverlay').classList.remove('show'); adminEditPostId = null; window._writeEditOriginal = null; };
window.editPost = async function(id) {
    // postWrite 탭으로 전환
    document.querySelectorAll('.admin-nav-item').forEach(function(n) { n.classList.remove('active'); });
    var navItem = document.querySelector('.admin-nav-item[data-tab="postWrite"]');
    if (navItem) navItem.classList.add('active');
    document.querySelectorAll('.admin-tab-content').forEach(function(e) { e.classList.remove('active'); });
    var tab = document.getElementById('postWriteTab');
    if (tab) tab.classList.add('active');
    var titleEl = document.getElementById('adminPageTitle');
    if (titleEl) titleEl.textContent = '✏️ 게시물 등록/수정';

    // 게시물 데이터 로드
    var post = await api.get('/api/posts/' + id);
    if (!post) return;

    editPostId = id;
    // 원본 데이터 보존 (수정 시 기존 이미지/bgColor 유지용)
    window._editPostOriginal = {
        thumbnail: post.thumbnail || '',
        detailImage: post.detailImage || '',
        bgColor: post.bgColor || ''
    };
    document.getElementById('postBoardSel').value = post.boardId;
    await updatePostCategoryDropdown();
    setTimeout(function() { document.getElementById('postCatSel').value = post.categoryId; }, 50);
    document.getElementById('postType').value = post.type || 'text';
    togglePostFields();
    document.getElementById('postTitle').value = post.title || '';
    document.getElementById('postIcon').value = post.icon || '';
    var iconImgInput = document.getElementById('postIconImage');
    if (iconImgInput) iconImgInput.value = '';
    var iconImgPreview = document.getElementById('postIconImagePreview');
    if (iconImgPreview) iconImgPreview.innerHTML = post.thumbnail
        ? '<img src="/api/files/' + post.thumbnail + '" style="max-height:48px; border-radius:6px; border:1px solid var(--border-color);"> <span style="font-size:12px; color:var(--text-light);">기존 아이콘 (새 파일 선택 시 교체)</span>'
        : '';
    document.getElementById('postSubInfo').value = post.subInfo || '';
    document.getElementById('postContent').value = post.content || '';
    document.getElementById('postUrl').value = post.url || '';
    if (post.fileName) document.getElementById('postFileName').value = post.fileName;

    // 수정 중 표시
    document.getElementById('editPostIndicator').style.display = 'block';
    document.getElementById('editPostTitle').textContent = post.title;
    var btn = document.getElementById('addPostBtn');
    if (btn) { btn.textContent = '저장'; btn.classList.replace('admin-btn-success', 'admin-btn-primary'); }

    document.querySelector('.admin-container').scrollTo({ top: 0, behavior: 'smooth' });
};

window.cancelEditPostForm = function() {
    editPostId = null;
    window._editPostOriginal = null;
    document.getElementById('editPostIndicator').style.display = 'none';
    document.getElementById('postTitle').value = '';
    document.getElementById('postContent').value = '';
    document.getElementById('postUrl').value = '';
    document.getElementById('postIcon').value = '';
    document.getElementById('postSubInfo').value = '';
    document.getElementById('postFileName').value = '';
    var _iconImg = document.getElementById('postIconImage'); if (_iconImg) _iconImg.value = '';
    var _iconPrev = document.getElementById('postIconImagePreview'); if (_iconPrev) _iconPrev.innerHTML = '';
    var btn = document.getElementById('addPostBtn');
    if (btn) { btn.textContent = '게시물 등록'; btn.classList.replace('admin-btn-primary', 'admin-btn-success'); }
};

window.updateWriteCategories = function() {
    const boardId = document.getElementById('writeBoard').value;
    const catSelect = document.getElementById('writeCat');
    catSelect.innerHTML = '<option value="">-- 선택 --</option>';
    const categories = dataCache['/api/categories'] ? dataCache['/api/categories'].data : {};
    if (categories[boardId]) { categories[boardId].forEach(c => { const o = document.createElement('option'); o.value = c.id; o.textContent = c.name; catSelect.appendChild(o); }); }
};

window.toggleWriteFields = function() {
    var type = document.getElementById('writeType').value;
    document.getElementById('writeUrlGroup').style.display = (['url','link'].includes(type)) ? 'block' : 'none';
    document.getElementById('writeFileGroup').style.display = (['pdf','docx','xlsx','pptx'].includes(type)) ? 'block' : 'none';
    var contentGroup = document.getElementById('writeContentGroup');
    if (contentGroup) contentGroup.style.display = (type === 'text') ? 'block' : 'none';
    var imagesGroup = document.getElementById('writeImagesGroup');
    if (imagesGroup) imagesGroup.style.display = (type === 'images') ? 'block' : 'none';
    // 파일 유형이면 드롭존 텍스트 업데이트
    var dropText = document.querySelector('.write-dropzone-text');
    if (dropText) {
        if (['pdf','docx','xlsx','pptx'].includes(type)) {
            dropText.textContent = type.toUpperCase() + ' 파일을 여기에 끌어다 놓으세요';
        } else if (type === 'images') {
            dropText.textContent = '이미지 파일을 여기에 끌어다 놓으세요';
        } else {
            dropText.textContent = '파일을 여기에 끌어다 놓으세요';
        }
    }
};

window.toggleWriteAdvanced = function() {
    var section = document.getElementById('writeAdvancedSection');
    var arrow = document.getElementById('writeAdvancedArrow');
    if (section.classList.contains('open')) {
        section.classList.remove('open');
        arrow.innerHTML = '&#9660;';
    } else {
        section.classList.add('open');
        arrow.innerHTML = '&#9650;';
    }
};

window.handleWriteDrop = function(e) {
    e.preventDefault();
    var dropzone = document.getElementById('writeDropzone');
    dropzone.classList.remove('dragover');
    var files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    var file = files[0];
    var ext = file.name.split('.').pop().toLowerCase();
    var typeSelect = document.getElementById('writeType');
    var droppedInfo = document.getElementById('writeDroppedInfo');

    // 확장자로 유형 자동 감지
    var typeMap = { 'pdf': 'pdf', 'doc': 'docx', 'docx': 'docx', 'xls': 'xlsx', 'xlsx': 'xlsx', 'ppt': 'pptx', 'pptx': 'pptx' };
    var imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

    if (typeMap[ext]) {
        typeSelect.value = typeMap[ext];
        toggleWriteFields();
        // 파일 input에 세팅
        var fileInput = document.getElementById('writeFile');
        if (fileInput) {
            var dt = new DataTransfer();
            dt.items.add(file);
            fileInput.files = dt.files;
        }
        // 드롭 정보 표시
        var iconSvg = ext === 'pdf'
            ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/></svg>'
            : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
        droppedInfo.style.display = 'flex';
        droppedInfo.style.alignItems = 'center';
        droppedInfo.style.gap = '10px';
        droppedInfo.style.justifyContent = 'center';
        droppedInfo.innerHTML = iconSvg + '<span style="font-size:14px; font-weight:600; color:var(--text-primary);">' + file.name + '</span><span style="font-size:12px; color:var(--text-light);">(' + (file.size / 1024).toFixed(1) + ' KB)</span>';
    } else if (imageExts.includes(ext)) {
        // 이미지 한 장이면 단일 파일, 여러 장이면 images 모드
        if (files.length > 1) {
            typeSelect.value = 'images';
            toggleWriteFields();
            var imgInput = document.getElementById('writeImages');
            if (imgInput) {
                var dt2 = new DataTransfer();
                for (var i = 0; i < files.length; i++) dt2.items.add(files[i]);
                imgInput.files = dt2.files;
                if (typeof initSortableImagePreview === 'function') initSortableImagePreview('writeImages');
            }
        } else {
            typeSelect.value = 'images';
            toggleWriteFields();
            var imgInput2 = document.getElementById('writeImages');
            if (imgInput2) {
                var dt3 = new DataTransfer();
                dt3.items.add(file);
                imgInput2.files = dt3.files;
                if (typeof initSortableImagePreview === 'function') initSortableImagePreview('writeImages');
            }
        }
        // 이미지 미리보기
        droppedInfo.style.display = 'flex';
        droppedInfo.style.alignItems = 'center';
        droppedInfo.style.gap = '10px';
        droppedInfo.style.justifyContent = 'center';
        droppedInfo.style.flexWrap = 'wrap';
        var previewHtml = '';
        var maxPreviews = Math.min(files.length, 5);
        for (var pi = 0; pi < maxPreviews; pi++) {
            previewHtml += '<div style="width:56px; height:56px; border-radius:8px; overflow:hidden; border:1px solid var(--border-color); background:#f0f0f0;"><img src="' + URL.createObjectURL(files[pi]) + '" style="width:100%; height:100%; object-fit:cover;"></div>';
        }
        if (files.length > 5) previewHtml += '<span style="font-size:13px; color:var(--text-light);">+' + (files.length - 5) + '장</span>';
        droppedInfo.innerHTML = previewHtml;
    }
};

window.handleWriteDropzoneSelect = function(input) {
    if (!input.files || input.files.length === 0) return;
    // Simulate a drop event with the selected files
    var fakeEvent = { preventDefault: function(){}, dataTransfer: { files: input.files } };
    handleWriteDrop(fakeEvent);
};

window.submitWriteForm = async function() {
    const boardId = document.getElementById('writeBoard').value;
    const categoryId = document.getElementById('writeCat').value;
    const title = document.getElementById('writeTitle').value.trim();
    const type = document.getElementById('writeType').value;
    const subInfo = document.getElementById('writeSubInfo').value.trim();
    const url = document.getElementById('writeUrl').value.trim();
    const content = document.getElementById('writeContent').value.trim();

    if (!title) return alert('제목을 입력해주세요.');
    if (!boardId) return alert('게시판을 선택해주세요.');

    // 진행바 표시
    var progressEl = document.getElementById('writeProgress');
    var progressBar = document.getElementById('writeProgressBar');
    var totalSteps = 1; // 최종 저장
    var currentStep = 0;
    var fileInput = document.getElementById('writeFile');
    var thumbInput = document.getElementById('writeThumb');
    var orderedFiles = orderedImageFiles['writeImages'] || [];
    if (fileInput && fileInput.files.length > 0) totalSteps++;
    if (thumbInput && thumbInput.files.length > 0) totalSteps++;
    for (var ci = 1; ci <= 3; ci++) { var cInput = document.getElementById('writeDetailImage' + ci); if (cInput && cInput.files.length > 0) totalSteps++; }
    if (type === 'images' && orderedFiles.length > 0) totalSteps += orderedFiles.length;
    if (progressEl) { progressEl.style.display = 'block'; progressBar.style.width = '0%'; }
    function updateProgress() { currentStep++; if (progressBar) progressBar.style.width = Math.min(100, Math.round((currentStep / totalSteps) * 100)) + '%'; }

    let fileName = '';
    if (fileInput && fileInput.files.length > 0) {
        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
        const uploadData = await uploadRes.json();
        if (uploadData.error) { if (progressEl) progressEl.style.display = 'none'; return alert('파일 업로드 실패: ' + uploadData.error); }
        fileName = uploadData.fileName;
        updateProgress();
    }

    let thumbnail = '';
    if (thumbInput && thumbInput.files.length > 0) {
        const formData2 = new FormData();
        formData2.append('file', thumbInput.files[0]);
        const thumbRes = await fetch('/api/upload', { method: 'POST', body: formData2 });
        const thumbData = await thumbRes.json();
        if (!thumbData.error) thumbnail = thumbData.fileName;
        updateProgress();
    }

    var detailImages = [];
    for (var dIdx = 1; dIdx <= 3; dIdx++) {
        var detailInput = document.getElementById('writeDetailImage' + dIdx);
        if (detailInput && detailInput.files.length > 0) {
            var fd = new FormData();
            fd.append('file', detailInput.files[0]);
            var dRes = await fetch('/api/upload', { method: 'POST', body: fd });
            var dData = await dRes.json();
            if (!dData.error) detailImages.push(dData.fileName);
            updateProgress();
        }
    }
    var detailImage = detailImages.length > 0 ? detailImages.join('|') : '';

    // 이미지 복수 업로드 (type === 'images') — 순서 관리된 파일 사용
    if (type === 'images' && orderedFiles.length > 0) {
        var imgNames = [];
        var statusEl = document.getElementById('writeImagesStatus');
        for (var ii = 0; ii < orderedFiles.length; ii++) {
            if (statusEl) statusEl.textContent = '업로드 중... (' + (ii+1) + '/' + orderedFiles.length + ')';
            var imgFd = new FormData();
            imgFd.append('file', orderedFiles[ii]);
            var imgRes = await fetch('/api/upload', { method: 'POST', body: imgFd });
            var imgData = await imgRes.json();
            if (!imgData.error) imgNames.push(imgData.fileName);
            updateProgress();
        }
        if (statusEl) statusEl.textContent = '업로드 완료! ' + imgNames.length + '장';
        if (imgNames.length > 0 && !thumbnail) thumbnail = imgNames[0];
        if (imgNames.length > 0) detailImage = imgNames.join('|');
    }

    var bgColor = document.getElementById('writeBgColor') ? document.getElementById('writeBgColor').value : '';
    var postData = { boardId: boardId, categoryId: categoryId, title: title, type: type, subInfo: subInfo, url: url, content: content, bgColor: bgColor };

    // 수정 시 기존 이미지/파일 보존 (새로 업로드 안 했으면 기존 값 유지)
    if (adminEditPostId && window._writeEditOriginal) {
        if (!fileName && window._writeEditOriginal.fileName) postData.fileName = window._writeEditOriginal.fileName;
        if (!thumbnail && window._writeEditOriginal.thumbnail) postData.thumbnail = window._writeEditOriginal.thumbnail;
        if (!detailImage && window._writeEditOriginal.detailImage) postData.detailImage = window._writeEditOriginal.detailImage;
    }

    if (fileName) postData.fileName = fileName;
    if (thumbnail) postData.thumbnail = thumbnail;
    if (detailImage) postData.detailImage = detailImage;

    updateProgress();
    // 🔄 최종 저장 (재시도 내장): Google Sheets 일시 오류에 강건하게
    try {
        if (adminEditPostId) {
            await _saveWithRetry(function() { return api.put('/api/posts/' + adminEditPostId, postData); });
            window._writeEditOriginal = null;
        } else {
            await _saveWithRetry(function() { return api.post('/api/posts', postData); });
        }
    } catch (err) {
        // 진행바 숨기기
        if (progressEl) progressEl.style.display = 'none';
        if (progressBar) progressBar.style.width = '0%';
        var msg = (err && err.message) ? err.message : '알 수 없는 오류';
        // HTML 응답이면 파싱 시도
        try {
            var parsed = JSON.parse(msg);
            if (parsed && parsed.error) msg = parsed.error;
        } catch(e) {}
        if (msg.length > 200) msg = msg.substring(0, 200) + '...';
        alert('저장에 실패했습니다.\n\n원인: ' + msg + '\n\n잠시 후 다시 시도해 주세요. 문제가 반복되면 관리자에게 문의하세요.');
        return; // 모달 유지, 사용자가 재시도 가능
    }

    // 진행바 완료 표시 후 숨김
    if (progressBar) progressBar.style.width = '100%';
    setTimeout(function() { if (progressEl) progressEl.style.display = 'none'; }, 500);

    invalidateAll();
    closeWriteModal();
    loadAdminPostTable();
    alert(adminEditPostId ? '수정되었습니다.' : '등록되었습니다.');
};

// 저장 재시도 헬퍼 (Google Sheets 일시 오류 대응)
async function _saveWithRetry(fn, maxRetries) {
    maxRetries = maxRetries || 2;
    var lastErr;
    for (var attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (e) {
            lastErr = e;
            var msg = (e && e.message) || '';
            // 재시도 가능한 에러만 다시 시도: 500/429/503/네트워크 관련
            var retriable = /\b(500|502|503|504|429|ECONN|timeout|fetch)/i.test(msg);
            if (!retriable || attempt === maxRetries) throw e;
            // 지수 백오프: 0.5s, 1s, 2s
            await new Promise(function(r) { setTimeout(r, 500 * Math.pow(2, attempt)); });
        }
    }
    throw lastErr;
}


// ═══ 조직도 관리 (Excel 업로드/다운로드 + 트리 편집) ═══
window.downloadOrgChartTemplate = function() {
    if (typeof XLSX === 'undefined') return alert('Excel 라이브러리 로딩 중입니다. 잠시 후 다시 시도해주세요.');
    var headers = ['부서', '직책', '이름', '상위부서'];
    var sample = [
        ['대표이사실', '대표이사', '홍길동', ''],
        ['경영지원본부', '본부장', '김철수', '대표이사실'],
        ['인사팀', '팀장', '이영희', '경영지원본부'],
        ['인사팀', '사원', '박민수', '경영지원본부'],
        ['개발본부', '본부장', '최동훈', '대표이사실'],
        ['개발1팀', '팀장', '정수연', '개발본부'],
        ['개발1팀', '선임', '김개발', '개발본부'],
        ['개발2팀', '팀장', '박지은', '개발본부'],
    ];
    var ws = XLSX.utils.aoa_to_sheet([headers].concat(sample));
    ws['!cols'] = [{wch:18},{wch:12},{wch:12},{wch:18}];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '조직도');
    XLSX.writeFile(wb, '조직도_템플릿.xlsx');
};

window.uploadOrgChartExcel = async function() {
    if (typeof XLSX === 'undefined') return alert('Excel 라이브러리 로딩 중입니다.');
    var fileInput = document.getElementById('orgExcelFileInput');
    if (!fileInput || !fileInput.files.length) return alert('Excel 파일을 선택해주세요.');

    var file = fileInput.files[0];
    var reader = new FileReader();
    reader.onload = async function(e) {
        try {
            var wb = XLSX.read(e.target.result, { type: 'array' });
            var ws = wb.Sheets[wb.SheetNames[0]];
            var rawData = XLSX.utils.sheet_to_json(ws);

            if (rawData.length === 0) return alert('데이터가 없습니다.');

            // 미리보기 테이블
            var previewHtml = '<table style="width:100%; border-collapse:collapse; font-size:13px;">';
            previewHtml += '<thead><tr style="background:var(--main-bg);"><th style="padding:8px; border:1px solid var(--border-color);">부서</th><th style="padding:8px; border:1px solid var(--border-color);">직책</th><th style="padding:8px; border:1px solid var(--border-color);">이름</th><th style="padding:8px; border:1px solid var(--border-color);">상위부서</th></tr></thead><tbody>';
            rawData.forEach(function(row) {
                previewHtml += '<tr><td style="padding:6px 8px; border:1px solid var(--border-color);">' + (row['부서']||'') + '</td><td style="padding:6px 8px; border:1px solid var(--border-color);">' + (row['직책']||'') + '</td><td style="padding:6px 8px; border:1px solid var(--border-color);">' + (row['이름']||'') + '</td><td style="padding:6px 8px; border:1px solid var(--border-color);">' + (row['상위부서']||'') + '</td></tr>';
            });
            previewHtml += '</tbody></table>';
            document.getElementById('orgExcelPreview').innerHTML = '<div style="padding:12px; font-weight:600; color:var(--text-primary);">미리보기 (' + rawData.length + '건)</div>' + previewHtml;
            document.getElementById('orgExcelPreview').style.display = 'block';

            if (!confirm(rawData.length + '건의 데이터를 업로드하시겠습니까?\n기존 조직도 데이터는 모두 교체됩니다.')) return;

            var items = rawData.map(function(row) {
                return {
                    department: row['부서'] || '',
                    title: row['직책'] || '',
                    name: row['이름'] || '',
                    parentDepartment: row['상위부서'] || ''
                };
            });

            await api.post('/api/orgchart/bulk', { items: items });
            invalidate('/api/orgchart');
            alert('조직도가 업데이트되었습니다! (' + items.length + '건)');
            await loadAdminOrgChart();
            await loadOrgChart();
            fileInput.value = '';
        } catch(err) { alert('업로드 실패: ' + err.message); }
    };
    reader.readAsArrayBuffer(file);
};

// 관리자 조직도 트리 — 플랫 리스트로 변환 후 렌더링
var _orgFlatList = []; // [{id, name, title, department, parentId, order, depth, isDept}, ...]
var _orgMoving = false;

function buildOrgFlatList(data) {
    var map = {};
    var roots = [];
    data.forEach(function(n) { map[n.id] = { ...n, children: [] }; });
    data.forEach(function(n) {
        if (n.parentId && map[n.parentId]) {
            map[n.parentId].children.push(map[n.id]);
        } else {
            roots.push(map[n.id]);
        }
    });
    function sortKids(node) {
        node.children.sort(function(a,b) { return (parseInt(a.order)||999) - (parseInt(b.order)||999); });
        node.children.forEach(sortKids);
    }
    roots.sort(function(a,b) { return (parseInt(a.order)||999) - (parseInt(b.order)||999); });
    roots.forEach(sortKids);

    var flat = [];
    function flatten(node, depth) {
        var isDept = !node.title && (node.children.length > 0 || !node.department || node.name === node.department);
        flat.push({ id: node.id, name: node.name, title: node.title||'', department: node.department||'', parentId: node.parentId||'', order: node.order||'0', color: node.color||'', depth: depth, isDept: isDept });
        node.children.forEach(function(c) { flatten(c, depth + 1); });
    }
    roots.forEach(function(r) { flatten(r, 0); });
    return flat;
}

// 접힘 상태 저장 (id → bool)
var _orgCollapsed = (function(){
    try { return JSON.parse(localStorage.getItem('orgTreeCollapsed') || '{}'); } catch(e) { return {}; }
})();
function _orgSaveCollapsed() {
    try { localStorage.setItem('orgTreeCollapsed', JSON.stringify(_orgCollapsed)); } catch(e) {}
}

function _buildOrgTree(data) {
    var map = {}, roots = [];
    data.forEach(function(n) { map[n.id] = Object.assign({}, n, { children: [] }); });
    data.forEach(function(n) {
        if (n.parentId && map[n.parentId]) map[n.parentId].children.push(map[n.id]);
        else roots.push(map[n.id]);
    });
    function sortKids(node) {
        node.children.sort(function(a,b) { return (parseInt(a.order)||999) - (parseInt(b.order)||999); });
        node.children.forEach(sortKids);
    }
    roots.sort(function(a,b) { return (parseInt(a.order)||999) - (parseInt(b.order)||999); });
    roots.forEach(sortKids);
    return roots;
}

function renderAdminOrgTree(data) {
    var container = document.getElementById('adminOrgTreeContainer');
    if (!container) return;
    if (!data || data.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-light);">조직도 데이터가 없습니다. Excel 파일을 업로드해주세요.</div>';
        _orgFlatList = [];
        return;
    }
    _orgFlatList = buildOrgFlatList(data);
    var tree = _buildOrgTree(data);

    // 툴바: 전체 펼치기/접기 + 카운트
    var total = data.length;
    var deptCount = data.filter(function(n){ return !n.title; }).length;
    var personCount = total - deptCount;
    var toolbar = '<div style="display:flex; align-items:center; gap:8px; padding:8px 4px 12px 4px; border-bottom:1px dashed var(--border-color); margin-bottom:10px; flex-wrap:wrap;">' +
        '<button type="button" class="admin-btn admin-btn-outline admin-btn-small" onclick="orgTreeExpandAll()">⊞ 모두 펼치기</button>' +
        '<button type="button" class="admin-btn admin-btn-outline admin-btn-small" onclick="orgTreeCollapseAll()">⊟ 모두 접기</button>' +
        '<span style="margin-left:auto; font-size:12px; color:var(--text-light);">총 ' + total + '개 (부서 ' + deptCount + ' · 인원 ' + personCount + ')</span>' +
        '</div>';

    function escape(s) { return (s==null?'':String(s)).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

    function renderNode(node, depth) {
        var isDept = !node.title;
        var hasChildren = node.children && node.children.length > 0;
        var collapsed = !!_orgCollapsed[node.id];
        var idx = _orgFlatList.findIndex(function(f){ return f.id === node.id; });

        // 노드 행
        var rowBg = isDept ? 'linear-gradient(90deg,#fff7ed,#fffbf5)' : '#ffffff';
        var borderColor = isDept ? '#fed7aa' : '#e2e8f0';
        var colorDot = node.color ? '<span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:' + escape(node.color) + '; border:1px solid rgba(0,0,0,0.15); margin-right:6px; vertical-align:middle;"></span>' : '';
        var nameHtml = isDept
            ? colorDot + '<span style="font-weight:700; color:#9a3412; font-size:14px;">' + escape(node.name) + '</span>'
            : colorDot + '<span style="font-weight:600; color:#0f172a; font-size:13px;">' + escape(node.name) + '</span>' +
              (node.title ? '<span style="color:#64748b; font-size:12px; font-weight:400; margin-left:6px;">' + escape(node.title) + '</span>' : '') +
              (node.department ? '<span style="font-size:10px; background:#e0f2fe; color:#0369a1; padding:2px 7px; border-radius:10px; margin-left:8px;">' + escape(node.department) + '</span>' : '');

        var caret;
        if (hasChildren) {
            caret = '<button type="button" onclick="orgTreeToggle(\'' + node.id + '\')" style="background:none; border:none; cursor:pointer; font-size:11px; color:#64748b; width:18px; height:18px; padding:0; display:inline-flex; align-items:center; justify-content:center;">' + (collapsed ? '▶' : '▼') + '</button>';
        } else {
            caret = '<span style="display:inline-block; width:18px;"></span>';
        }

        var childCount = hasChildren
            ? '<span style="font-size:10px; background:#f1f5f9; color:#475569; padding:2px 7px; border-radius:10px; margin-left:6px;">' + node.children.length + '</span>'
            : '';

        var icon = isDept ? '🏢' : '👤';

        var actions = '<div style="display:flex; gap:2px; opacity:0; transition:opacity 0.15s;" class="admin-org-actions">' +
            '<button type="button" onclick="showEditNodeDialog(\'' + node.id + '\')" style="background:#fff; border:1px solid #bfdbfe; border-radius:5px; cursor:pointer; padding:3px 7px; font-size:11px; color:#2563eb;" title="편집">✎</button>' +
            '<button type="button" onclick="orgMoveUp(' + idx + ')" style="background:#fff; border:1px solid #e2e8f0; border-radius:5px; cursor:pointer; padding:3px 7px; font-size:11px; color:#475569;" title="위로">▲</button>' +
            '<button type="button" onclick="orgMoveDown(' + idx + ')" style="background:#fff; border:1px solid #e2e8f0; border-radius:5px; cursor:pointer; padding:3px 7px; font-size:11px; color:#475569;" title="아래로">▼</button>' +
            '<button type="button" onclick="orgIndentRight(' + idx + ')" style="background:#fff; border:1px solid #e2e8f0; border-radius:5px; cursor:pointer; padding:3px 7px; font-size:11px; color:#475569;" title="하위로">→</button>' +
            '<button type="button" onclick="orgIndentLeft(' + idx + ')" style="background:#fff; border:1px solid #e2e8f0; border-radius:5px; cursor:pointer; padding:3px 7px; font-size:11px; color:#475569;" title="상위로">←</button>' +
            '<button type="button" onclick="deleteOrgNode(\'' + node.id + '\')" style="background:#fff; border:1px solid #fecaca; border-radius:5px; cursor:pointer; padding:3px 7px; font-size:11px; color:#dc2626;" title="삭제">×</button>' +
            '</div>';

        var row = '<div class="admin-org-row" data-idx="' + idx + '" data-id="' + node.id + '" draggable="true"' +
            ' ondragstart="orgRowDragStart(event,' + idx + ')" ondragover="orgRowDragOver(event,' + idx + ')" ondragleave="orgRowDragLeave(event)" ondrop="orgRowDrop(event,' + idx + ')" ondragend="orgRowDragEnd(event)"' +
            ' style="display:flex; align-items:center; gap:8px; padding:9px 12px; margin:3px 0; background:' + rowBg + '; border:1px solid ' + borderColor + '; border-radius:10px; cursor:grab;"' +
            ' onmouseenter="this.querySelector(\'.admin-org-actions\').style.opacity=1" onmouseleave="this.querySelector(\'.admin-org-actions\').style.opacity=0">' +
            '<span style="opacity:0.3; font-size:12px; user-select:none;">⠿</span>' +
            caret +
            '<span style="font-size:15px;">' + icon + '</span>' +
            '<span style="flex:1;">' + nameHtml + childCount + '</span>' +
            actions +
            '</div>';

        var childrenHtml = '';
        if (hasChildren && !collapsed) {
            childrenHtml = '<div style="margin-left:22px; padding-left:12px; border-left:2px dashed ' + (isDept ? '#fed7aa' : '#e2e8f0') + ';">';
            node.children.forEach(function(c) { childrenHtml += renderNode(c, depth + 1); });
            childrenHtml += '</div>';
        }
        return row + childrenHtml;
    }

    var body = '';
    tree.forEach(function(r) { body += renderNode(r, 0); });

    container.innerHTML = toolbar + '<div>' + body + '</div>';
    container.style.maxHeight = '520px';
}

window.orgTreeToggle = function(id) {
    _orgCollapsed[id] = !_orgCollapsed[id];
    _orgSaveCollapsed();
    loadAdminOrgChart();
};

window.orgTreeExpandAll = function() {
    _orgCollapsed = {};
    _orgSaveCollapsed();
    loadAdminOrgChart();
};

window.orgTreeCollapseAll = function() {
    _orgFlatList.forEach(function(n) {
        var hasChildren = _orgFlatList.some(function(x){ return x.parentId === n.id; });
        if (hasChildren) _orgCollapsed[n.id] = true;
    });
    _orgSaveCollapsed();
    loadAdminOrgChart();
};

// ─── 위/아래 이동 (같은 부모 내에서 순서 변경) ───
window.orgMoveUp = async function(idx) {
    if (_orgMoving || idx <= 0) return;
    var node = _orgFlatList[idx];
    // 같은 부모의 이전 형제 찾기
    var siblings = _orgFlatList.filter(function(n) { return n.parentId === node.parentId; });
    var sibIdx = siblings.findIndex(function(s) { return s.id === node.id; });
    if (sibIdx <= 0) return;
    await _orgSwapOrder(node.id, siblings[sibIdx - 1].id);
};

window.orgMoveDown = async function(idx) {
    if (_orgMoving) return;
    var node = _orgFlatList[idx];
    var siblings = _orgFlatList.filter(function(n) { return n.parentId === node.parentId; });
    var sibIdx = siblings.findIndex(function(s) { return s.id === node.id; });
    if (sibIdx < 0 || sibIdx >= siblings.length - 1) return;
    await _orgSwapOrder(node.id, siblings[sibIdx + 1].id);
};

async function _orgSwapOrder(idA, idB) {
    if (_orgMoving) return;
    _orgMoving = true;
    try {
        // 같은 부모 내 전체 순서 재할당
        var nodeA = _orgFlatList.find(function(n) { return n.id === idA; });
        var siblings = _orgFlatList.filter(function(n) { return n.parentId === nodeA.parentId; });
        var ids = siblings.map(function(s) { return s.id; });
        var posA = ids.indexOf(idA);
        var posB = ids.indexOf(idB);
        ids.splice(posA, 1);
        ids.splice(posB, 0, idA);
        var updates = ids.map(function(id, i) { return { id: id, order: String(i + 1) }; });
        await api.put('/api/orgchart/reorder', { updates: updates });
        invalidate('/api/orgchart');
        await loadAdminOrgChart();
        await loadOrgChart();
    } finally { _orgMoving = false; }
}

// ─── 들여쓰기: 바로 위 항목의 자식으로 이동 ───
window.orgIndentRight = async function(idx) {
    if (_orgMoving || idx <= 0) return;
    var node = _orgFlatList[idx];
    // 같은 부모의 바로 위 형제를 찾아서 그 아래로
    var siblings = _orgFlatList.filter(function(n) { return n.parentId === node.parentId; });
    var sibIdx = siblings.findIndex(function(s) { return s.id === node.id; });
    if (sibIdx <= 0) return;
    var newParent = siblings[sibIdx - 1];
    _orgMoving = true;
    try {
        await api.put('/api/orgchart/reorder', { updates: [{ id: node.id, parentId: newParent.id, order: '999' }] });
        invalidate('/api/orgchart');
        await loadAdminOrgChart();
        await loadOrgChart();
    } finally { _orgMoving = false; }
};

// ─── 내어쓰기: 부모의 부모 아래로 이동 ───
window.orgIndentLeft = async function(idx) {
    if (_orgMoving) return;
    var node = _orgFlatList[idx];
    if (!node.parentId) return; // 이미 최상위
    var parent = _orgFlatList.find(function(n) { return n.id === node.parentId; });
    var newParentId = parent ? (parent.parentId || '') : '';
    _orgMoving = true;
    try {
        await api.put('/api/orgchart/reorder', { updates: [{ id: node.id, parentId: newParentId, order: '999' }] });
        invalidate('/api/orgchart');
        await loadAdminOrgChart();
        await loadOrgChart();
    } finally { _orgMoving = false; }
};

// ─── 드래그앤드롭 (위치 삽입) ───
var _orgDragIdx = -1;

window.orgRowDragStart = function(e, idx) {
    _orgDragIdx = idx;
    e.currentTarget.style.opacity = '0.4';
    e.dataTransfer.effectAllowed = 'move';
};

window.orgRowDragOver = function(e, idx) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (_orgDragIdx === idx) return;
    // 삽입 위치 표시
    var rect = e.currentTarget.getBoundingClientRect();
    var midY = rect.top + rect.height / 2;
    document.querySelectorAll('.admin-org-row').forEach(function(el) {
        el.style.borderTop = '1px solid var(--border-color)';
        el.style.borderBottom = '1px solid var(--border-color)';
    });
    if (e.clientY < midY) {
        e.currentTarget.style.borderTop = '3px solid #ff6720';
    } else {
        e.currentTarget.style.borderBottom = '3px solid #ff6720';
    }
};

window.orgRowDragLeave = function(e) {
    e.currentTarget.style.borderTop = '1px solid var(--border-color)';
    e.currentTarget.style.borderBottom = '1px solid var(--border-color)';
};

window.orgRowDragEnd = function(e) {
    e.currentTarget.style.opacity = '1';
    document.querySelectorAll('.admin-org-row').forEach(function(el) {
        el.style.borderTop = '1px solid var(--border-color)';
        el.style.borderBottom = '1px solid var(--border-color)';
    });
    _orgDragIdx = -1;
};

window.orgRowDrop = async function(e, targetIdx) {
    e.preventDefault();
    if (_orgDragIdx < 0 || _orgDragIdx === targetIdx || _orgMoving) return;
    var dragNode = _orgFlatList[_orgDragIdx];
    var targetNode = _orgFlatList[targetIdx];
    if (!dragNode || !targetNode) return;

    // 자기 자신의 자식으로 이동 방지
    var checkId = targetNode.parentId;
    while (checkId) {
        if (checkId === dragNode.id) { alert('자신의 하위로는 이동할 수 없습니다.'); return; }
        var p = _orgFlatList.find(function(n) { return n.id === checkId; });
        checkId = p ? p.parentId : null;
    }

    // 타겟 노드의 부모 아래로 이동 (같은 레벨)
    var rect = e.currentTarget.getBoundingClientRect();
    var isAbove = e.clientY < rect.top + rect.height / 2;
    var newParentId = targetNode.parentId;

    _orgMoving = true;
    try {
        // 먼저 parentId 변경
        await api.put('/api/orgchart/reorder', { updates: [{ id: dragNode.id, parentId: newParentId, order: '0' }] });
        // 형제 목록에서 순서 재조정
        invalidate('/api/orgchart');
        var freshData = await api.get('/api/orgchart');
        var newSiblings = freshData.filter(function(n) { return n.parentId === newParentId; })
            .sort(function(a,b) { return (parseInt(a.order)||999) - (parseInt(b.order)||999); });
        var sibIds = newSiblings.map(function(s) { return s.id; });

        // 드래그 노드를 타겟 기준으로 위치
        var dragPosInSibs = sibIds.indexOf(dragNode.id);
        if (dragPosInSibs >= 0) sibIds.splice(dragPosInSibs, 1);
        var targetPosInSibs = sibIds.indexOf(targetNode.id);
        if (targetPosInSibs < 0) {
            sibIds.push(dragNode.id);
        } else {
            sibIds.splice(isAbove ? targetPosInSibs : targetPosInSibs + 1, 0, dragNode.id);
        }

        var updates = sibIds.map(function(id, i) { return { id: id, order: String(i + 1) }; });
        await api.put('/api/orgchart/reorder', { updates: updates });
        invalidate('/api/orgchart');
        await loadAdminOrgChart();
        await loadOrgChart();
    } catch(err) { alert('이동 실패: ' + err.message); }
    _orgMoving = false;
};

// ─── 삭제 ───
window.deleteOrgNode = async function(id) {
    if (!confirm('이 항목을 삭제하시겠습니까?\n하위 항목도 함께 삭제됩니다.')) return;
    var data = await api.get('/api/orgchart');
    var toDelete = [id];
    function findChildren(parentId) {
        data.filter(function(n) { return n.parentId === parentId; }).forEach(function(n) {
            toDelete.push(n.id);
            findChildren(n.id);
        });
    }
    findChildren(id);
    for (var i = 0; i < toDelete.length; i++) {
        try { await api.del('/api/orgchart/' + toDelete[i]); } catch(e) {}
    }
    invalidate('/api/orgchart');
    await loadAdminOrgChart();
    await loadOrgChart();
};

// ─── 노드 추가 ───
// ─── 조직도 노드 편집 모달 ───
window.showEditNodeDialog = function(id) {
    var node = _orgFlatList.find(function(n){ return n.id === id; });
    if (!node) {
        // fresh fetch fallback
        api.get('/api/orgchart').then(function(data){
            var n = data.find(function(x){ return x.id === id; });
            if (n) _openOrgEditModal(n);
        });
        return;
    }
    _openOrgEditModal(node);
};

function _openOrgEditModal(node) {
    document.getElementById('orgEditId').value = node.id;
    document.getElementById('orgEditName').value = node.name || '';
    document.getElementById('orgEditTitle').value = node.title || '';
    document.getElementById('orgEditDepartment').value = node.department || '';
    var color = node.color || '';
    document.getElementById('orgEditColor').value = color || '#cccccc';
    document.getElementById('orgEditColorHex').value = color;
    document.getElementById('orgEditModal').style.display = 'flex';
}

window.closeOrgEditModal = function() {
    document.getElementById('orgEditModal').style.display = 'none';
};

window.orgEditSetColor = function(hex) {
    document.getElementById('orgEditColor').value = hex;
    document.getElementById('orgEditColorHex').value = hex;
};

window.orgEditClearColor = function() {
    document.getElementById('orgEditColor').value = '#cccccc';
    document.getElementById('orgEditColorHex').value = '';
};

// 색상 picker <-> hex 텍스트 양방향 동기화
document.addEventListener('DOMContentLoaded', function() {
    var cp = document.getElementById('orgEditColor');
    var hx = document.getElementById('orgEditColorHex');
    if (cp) cp.addEventListener('input', function() { hx.value = cp.value; });
    if (hx) hx.addEventListener('input', function() {
        var v = hx.value.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(v)) cp.value = v;
    });
});

window.saveOrgEditNode = async function() {
    var id = document.getElementById('orgEditId').value;
    var name = document.getElementById('orgEditName').value.trim();
    if (!name) { alert('이름은 필수입니다.'); return; }
    var title = document.getElementById('orgEditTitle').value.trim();
    var department = document.getElementById('orgEditDepartment').value.trim();
    var colorHex = document.getElementById('orgEditColorHex').value.trim();
    if (colorHex && !/^#[0-9a-fA-F]{6}$/.test(colorHex)) {
        alert('색상 형식은 #RRGGBB 여야 합니다.');
        return;
    }
    try {
        await api.put('/api/orgchart/' + id, {
            name: name, title: title, department: department, color: colorHex
        });
        invalidate('/api/orgchart');
        closeOrgEditModal();
        await loadAdminOrgChart();
        await loadOrgChart();
    } catch(e) {
        alert('저장 실패: ' + e.message);
    }
};

window.showAddNodeDialog = function(type) {
    var name = prompt(type === 'dept' ? '부서명을 입력하세요:' : '이름을 입력하세요:');
    if (!name) return;
    var title = '';
    var department = '';
    var parentId = '';
    if (type === 'person') {
        title = prompt('직책을 입력하세요 (예: 팀장, 사원):') || '';
        // 부서 목록 보여주기
        var depts = _orgFlatList.filter(function(n) { return n.isDept; });
        if (depts.length > 0) {
            var deptNames = depts.map(function(d, i) { return (i+1) + '. ' + d.name; }).join('\n');
            var deptChoice = prompt('소속 부서 번호를 선택하세요:\n' + deptNames);
            if (deptChoice) {
                var dIdx = parseInt(deptChoice) - 1;
                if (depts[dIdx]) { parentId = depts[dIdx].id; department = depts[dIdx].name; }
            }
        }
    }
    api.post('/api/orgchart', {
        name: name, title: title, department: department,
        level: type === 'dept' ? '1' : '2',
        parentId: parentId, order: '999'
    }).then(function() {
        invalidate('/api/orgchart');
        loadAdminOrgChart();
        loadOrgChart();
    });
};

/* ==========================================
   관리자 모드 (Google OAuth + 비밀번호 인증)
========================================== */
var adminVerified = false;

document.getElementById('adminMenuBtn').addEventListener('click', async e => {
    e.preventDefault();
    // 실시간으로 관리자 여부 재확인
    try {
        const me = await api.get('/api/me');
        currentUser = me;
    } catch(e) {}
    if (!currentUser || !currentUser.isAdmin) return alert('관리자 권한이 없습니다.');
    if (adminVerified) {
        document.getElementById('adminOverlay').classList.add('show');
        // 슈퍼 관리자 탭 표시/숨김
        const manageBtn = document.getElementById('adminManageNavBtn');
        if (manageBtn) manageBtn.style.display = currentUser.isSuperAdmin ? '' : 'none';
        // 사이드바 사용자 정보 표시
        if (currentUser) {
            const nameEl = document.getElementById('adminUserName');
            const roleEl = document.getElementById('adminUserRole');
            const avatarEl = document.getElementById('adminUserAvatar');
            if (nameEl) nameEl.textContent = currentUser.name || currentUser.email;
            if (roleEl) roleEl.textContent = currentUser.isSuperAdmin ? '최고관리자' : '관리자';
            if (avatarEl) avatarEl.textContent = (currentUser.name || 'A').charAt(0);
        }
        await loadAdminPanelData();
    } else {
        document.getElementById('adminLoginModal').classList.add('show');
        document.getElementById('adminPasswordInput').value = '';
        document.getElementById('adminPasswordInput').focus();
        document.getElementById('adminLoginError').classList.remove('show');
    }
});

document.getElementById('adminLoginSubmitBtn').addEventListener('click', async () => {
    const pw = document.getElementById('adminPasswordInput').value;
    if (!pw) return;
    try {
        await api.post('/api/admin/verify', { password: pw });
        adminVerified = true;
        // 슈퍼 관리자 여부 재확인
        try { currentUser = await api.get('/api/me'); } catch(e) {}
        const manageBtn = document.getElementById('adminManageNavBtn');
        if (manageBtn) manageBtn.style.display = currentUser.isSuperAdmin ? '' : 'none';
        // 사이드바 사용자 정보 표시
        if (currentUser) {
            const nameEl = document.getElementById('adminUserName');
            const roleEl = document.getElementById('adminUserRole');
            const avatarEl = document.getElementById('adminUserAvatar');
            if (nameEl) nameEl.textContent = currentUser.name || currentUser.email;
            if (roleEl) roleEl.textContent = currentUser.isSuperAdmin ? '최고관리자' : '관리자';
            if (avatarEl) avatarEl.textContent = (currentUser.name || 'A').charAt(0);
        }
        document.getElementById('adminLoginModal').classList.remove('show');
        document.getElementById('adminOverlay').classList.add('show');
        await loadAdminPanelData();
    } catch(err) {
        document.getElementById('adminLoginError').classList.add('show');
    }
});

document.getElementById('adminPasswordInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('adminLoginSubmitBtn').click();
});

document.getElementById('adminLoginCancelBtn').addEventListener('click', () => {
    document.getElementById('adminLoginModal').classList.remove('show');
});

document.getElementById('adminLogoutBtn').addEventListener('click', () => {
    if(confirm('종료하시겠습니까?')) {
        document.getElementById('adminOverlay').classList.remove('show');
        adminVerified = false;
    }
});

// 관리자 사이드바 네비게이션
document.querySelectorAll('.admin-nav-item').forEach(nav => {
    nav.addEventListener('click', function() {
        const tab = this.getAttribute('data-tab');
        if (!tab) return;
        // 사이드바 활성화
        document.querySelectorAll('.admin-nav-item').forEach(n => n.classList.remove('active'));
        this.classList.add('active');
        // 탭 콘텐츠 전환
        document.querySelectorAll('.admin-tab-content').forEach(e => e.classList.remove('active'));
        const targetTab = document.getElementById(tab + 'Tab');
        if (targetTab) targetTab.classList.add('active');
        // 헤더 타이틀 변경
        const titleEl = document.getElementById('adminPageTitle');
        if (titleEl) titleEl.textContent = this.textContent.trim();
        // 탭별 데이터 새로고침
        if (tab === 'contacts') loadAdminContacts();
        if (tab === 'postAdmin') loadAdminPostTable();
        if (tab === 'postWrite') loadAdminPosts();
        if (tab === 'infraAdmin') loadAdminInfra();
        if (tab === 'suggestionsAdmin') loadAdminSuggestions();
        if (tab === 'accessStats') loadAccessStats();
    });
});
// 기존 admin-tab 호환 (숨겨진 상태)
document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', function() {
        document.querySelectorAll('.admin-tab, .admin-tab-content').forEach(e => e.classList.remove('active'));
        this.classList.add('active'); document.getElementById(this.getAttribute('data-tab') + 'Tab').classList.add('active');
    });
});

async function loadAdminPanelData() {
    invalidateAll();
    const fns = [loadAdminMenuManager, loadAdminPosts, loadAdminPostTable, loadAdminNotices, loadAdminContacts, loadAdminOrgChart, loadAdminSettings, loadAdminSuggestions, loadAdminInfra];
    if (currentUser && currentUser.isSuperAdmin) fns.push(loadAdminList);
    await Promise.all(fns.map(fn => fn().catch(err => console.error('[Admin]', fn.name, '오류:', err))));
}

// ─── 관리자 관리 함수 ───
async function loadAdminList() {
    try {
        const admins = await api.get('/api/admins');
        const container = document.getElementById('adminListContainer');
        if (!admins || admins.length === 0) {
            container.innerHTML = '<p style="color: var(--text-light);">등록된 관리자가 없습니다.</p>';
            return;
        }
        let html = '<table style="width:100%; border-collapse: collapse;">';
        html += '<thead><tr style="background: var(--main-bg); text-align: left;">';
        html += '<th style="padding: 12px 16px; font-weight: 600;">이메일</th>';
        html += '<th style="padding: 12px 16px; font-weight: 600;">이름</th>';
        html += '<th style="padding: 12px 16px; font-weight: 600;">유형</th>';
        html += '<th style="padding: 12px 16px; font-weight: 600;">추가일</th>';
        html += '<th style="padding: 12px 16px; font-weight: 600;">작업</th>';
        html += '</tr></thead><tbody>';
        admins.forEach(a => {
            const badge = a.isSuperAdmin
                ? '<span style="background:#ff6720; color:white; padding:2px 8px; border-radius:4px; font-size:12px;">슈퍼 관리자</span>'
                : '<span style="background:#10b981; color:white; padding:2px 8px; border-radius:4px; font-size:12px;">추가 관리자</span>';
            const resetBtn = a.isSuperAdmin
                ? ''
                : `<button type="button" onclick="resetAdminPassword('${a.email}')" style="background:#f59e0b; color:white; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:12px; margin-right:6px;">PW초기화</button>`;
            const deleteBtn = a.isSuperAdmin
                ? '<span style="color: var(--text-light); font-size: 12px;">삭제 불가</span>'
                : `${resetBtn}<button type="button" onclick="removeAdmin('${a.email}')" style="background:#ef4444; color:white; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:12px;">삭제</button>`;
            html += `<tr style="border-bottom: 1px solid var(--border-color);">`;
            html += `<td style="padding: 12px 16px;">${a.email}</td>`;
            html += `<td style="padding: 12px 16px;">${a.name || '-'}</td>`;
            html += `<td style="padding: 12px 16px;">${badge}</td>`;
            html += `<td style="padding: 12px 16px;">${a.addedDate || '-'}</td>`;
            html += `<td style="padding: 12px 16px;">${deleteBtn}</td>`;
            html += '</tr>';
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch(err) {
        document.getElementById('adminListContainer').innerHTML = '<p style="color: var(--red);">관리자 목록을 불러올 수 없습니다.</p>';
    }
}

async function addAdmin() {
    const email = document.getElementById('newAdminEmail').value.trim();
    const name = document.getElementById('newAdminName').value.trim();
    if (!email) return alert('이메일을 입력해주세요.');
    if (!email.includes('@')) return alert('올바른 이메일 형식이 아닙니다.');
    try {
        await api.post('/api/admins', { email, name });
        alert(`${email} 관리자가 추가되었습니다.`);
        document.getElementById('newAdminEmail').value = '';
        document.getElementById('newAdminName').value = '';
        await loadAdminList();
    } catch(err) {
        alert(err.message || '관리자 추가에 실패했습니다.');
    }
}

async function removeAdmin(email) {
    if (!confirm(`${email}을(를) 관리자에서 제거하시겠습니까?`)) return;
    try {
        await api.del(`/api/admins/${encodeURIComponent(email)}`);
        alert('관리자가 제거되었습니다.');
        await loadAdminList();
    } catch(err) {
        alert(err.message || '관리자 제거에 실패했습니다.');
    }
}

async function resetAdminPassword(email) {
    if (!confirm(`${email}의 비밀번호를 기본 비밀번호로 초기화하시겠습니까?\n초기화 후 해당 관리자는 .env의 ADMIN_PASSWORD로 로그인해야 합니다.`)) return;
    try {
        await api.post(`/api/admins/${encodeURIComponent(email)}/reset-password`);
        alert(`${email}의 비밀번호가 초기화되었습니다.`);
    } catch(err) {
        alert(err.message || '비밀번호 초기화에 실패했습니다.');
    }
}

async function changeMyPassword() {
    const currentPw = document.getElementById('currentPwInput').value;
    const newPw = document.getElementById('newPwInput').value;
    const confirmPw = document.getElementById('newPwConfirmInput').value;

    if (!currentPw) return alert('현재 비밀번호를 입력해주세요.');
    if (!newPw || newPw.length < 4) return alert('새 비밀번호는 4자 이상이어야 합니다.');
    if (newPw !== confirmPw) return alert('새 비밀번호가 일치하지 않습니다.');

    try {
        const res = await fetch('/api/admin/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw })
        });
        const data = await res.json();
        if (!res.ok) {
            alert(data.error || '비밀번호 변경에 실패했습니다.');
            return;
        }
        document.getElementById('currentPwInput').value = '';
        document.getElementById('newPwInput').value = '';
        document.getElementById('newPwConfirmInput').value = '';
        const msg = document.getElementById('pwChangeSuccess');
        msg.textContent = '✅ 비밀번호가 변경되었습니다.';
        msg.style.display = 'block';
        setTimeout(() => { msg.style.display = 'none'; }, 3000);
    } catch(err) {
        alert(err.message || '비밀번호 변경에 실패했습니다.');
    }
}

var editBoardId = null, editCatId = null, editCatBoardId = null;
var allAdminPosts = []; // 게시물 필터용 전체 목록

// ─── 순서 변경 공통 함수 ───
var _reordering = false;

async function moveItem(sheetName, items, idx, direction) {
    if (_reordering) return;
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= items.length) return;
    _reordering = true;
    try {
        // 배열에서 위치 교환
        var temp = items[idx];
        items[idx] = items[swapIdx];
        items[swapIdx] = temp;
        // 전체 항목에 순차적 order 재할당
        var allItems = items.map(function(item, i) {
            return { id: item.id, order: String(i + 1) };
        });
        await api.put('/api/' + sheetName + '/reorder', { items: allItems });
        invalidateAll();
    } finally {
        _reordering = false;
    }
}

function sortByOrder(items) {
    return items.sort((a, b) => (parseInt(a.order) || 999) - (parseInt(b.order) || 999));
}

// ═══ 메뉴 트리 뷰 ═══
async function renderMenuTree() {
    const boards = sortByOrder(await api.get('/api/boards'));
    const categories = await api.get('/api/categories');
    const container = document.getElementById('menuTreeContainer');
    if (!container) return;

    if (boards.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:40px; color:#9ca3af;"><p>등록된 메뉴가 없습니다.</p><p style="font-size:13px;">우측 상단 [+ 메뉴 추가] 버튼을 클릭하세요.</p></div>';
        return;
    }

    let html = '';
    boards.forEach(function(board, bIdx) {
        const cats = sortByOrder(categories[board.id] || []);
        const isGallery = board.viewType === 'gallery';
        const viewBtnStyle = isGallery
            ? 'background:#fff7ed; color:#ff6720; border-color:#ff6720;'
            : 'background:#f0f9ff; color:#2563eb; border-color:#2563eb;';
        const viewBtnText = isGallery ? '🖼️ 갤러리' : '📋 리스트';

        html += '<div class="menu-tree-board">';
        html += '<div class="menu-tree-board-header">';
        html += '<span class="tree-toggle" onclick="this.textContent=this.textContent===\'▼\'?\'▶\':\'▼\'; this.closest(\'.menu-tree-board\').querySelector(\'.menu-tree-cats\').classList.toggle(\'collapsed\')">▼</span>';
        html += '<span class="tree-name">' + board.name + '</span>';
        html += '<button class="tree-btn" style="' + viewBtnStyle + ' font-weight:600;" onclick="toggleBoardView(\'' + board.id + '\',\'' + (isGallery ? 'list' : 'gallery') + '\')">' + viewBtnText + '</button>';
        html += '<span style="font-size:11px; color:#9ca3af;">ID: ' + board.id + '</span>';
        html += '<div class="tree-actions">';
        html += '<button class="tree-btn" onclick="moveBoardUp(' + bIdx + ')" ' + (bIdx===0?'disabled style="opacity:0.3"':'') + '>▲</button>';
        html += '<button class="tree-btn" onclick="moveBoardDown(' + bIdx + ')" ' + (bIdx===boards.length-1?'disabled style="opacity:0.3"':'') + '>▼</button>';
        html += '<button class="tree-btn" onclick="showEditBoardDialog(\'' + board.id + '\',\'' + board.name.replace(/'/g,"\\\'") + '\',\'' + (board.viewType||'list') + '\')">수정</button>';
        html += '<button class="tree-btn tree-btn-danger" onclick="deleteBoard(\'' + board.id + '\')">삭제</button>';
        html += '</div></div>';

        html += '<div class="menu-tree-cats">';
        cats.forEach(function(cat, cIdx) {
            var catIsGallery = cat.viewType === 'gallery';
            var catViewStyle = catIsGallery
                ? 'background:#fff7ed; color:#ff6720; border-color:#ff6720;'
                : 'background:#f0f9ff; color:#2563eb; border-color:#2563eb;';
            var catViewText = catIsGallery ? '🖼️ 갤러리' : '📋 리스트';
            html += '<div class="menu-tree-cat">';
            html += '<span style="color:#d1d5db;">├</span>';
            html += '<span class="cat-name">' + cat.name + '</span>';
            html += '<button class="tree-btn" style="' + catViewStyle + ' font-weight:600;" onclick="toggleCatView(\'' + board.id + '\',\'' + cat.id + '\',\'' + (catIsGallery ? 'list' : 'gallery') + '\')" title="' + (catIsGallery ? '갤러리형' : '리스트형') + '">' + catViewText + '</button>';
            html += '<div class="tree-actions">';
            html += '<button class="tree-btn" onclick="moveCatUp(\'' + board.id + '\',' + cIdx + ')" ' + (cIdx===0?'disabled style="opacity:0.3"':'') + '>▲</button>';
            html += '<button class="tree-btn" onclick="moveCatDown(\'' + board.id + '\',' + cIdx + ')" ' + (cIdx===cats.length-1?'disabled style="opacity:0.3"':'') + '>▼</button>';
            html += '<button class="tree-btn" onclick="showEditCatDialog(\'' + board.id + '\',\'' + cat.id + '\',\'' + cat.name.replace(/'/g,"\\\'") + '\',\'' + (cat.viewType||'list') + '\')">수정</button>';
            html += '<button class="tree-btn tree-btn-danger" onclick="deleteCat(\'' + board.id + '\',\'' + cat.id + '\')">삭제</button>';
            html += '</div></div>';
        });
        html += '<div class="menu-tree-add"><button class="menu-tree-add-btn" onclick="showAddCatDialog(\'' + board.id + '\')">+ 카테고리 추가</button></div>';
        html += '</div></div>';
    });

    container.innerHTML = html;
}

// 메뉴 추가 다이얼로그
window.showAddBoardDialog = function() {
    editMenuState = { type: 'addBoard', boardId: '', catId: '', viewType: 'list' };
    document.getElementById('editMenuModalTitle').textContent = '새 메뉴 추가';
    document.getElementById('editMenuName').value = '';
    selectEditMenuView('list');
    var grp = document.getElementById('editMenuBoardGroup');
    if (grp) grp.style.display = 'none';
    document.getElementById('editMenuModal').classList.add('show');
    document.getElementById('editMenuName').focus();
};

// 메뉴 수정 다이얼로그
// 수정 모달 상태
var editMenuState = { type: '', boardId: '', catId: '', viewType: 'list' };

window.selectEditMenuView = function(view) {
    editMenuState.viewType = view;
    var listLabel = document.getElementById('editMenuViewList');
    var galleryLabel = document.getElementById('editMenuViewGallery');
    listLabel.style.borderColor = view === 'list' ? 'var(--primary)' : 'var(--border-color)';
    listLabel.style.background = view === 'list' ? 'rgba(255,103,32,0.05)' : '';
    galleryLabel.style.borderColor = view === 'gallery' ? 'var(--primary)' : 'var(--border-color)';
    galleryLabel.style.background = view === 'gallery' ? 'rgba(255,103,32,0.05)' : '';
    document.querySelector('input[name="editMenuView"][value="' + view + '"]').checked = true;
};

window.closeEditMenuModal = function() {
    document.getElementById('editMenuModal').classList.remove('show');
};

window.showEditBoardDialog = function(boardId, currentName, currentViewType) {
    editMenuState = { type: 'board', boardId: boardId, catId: '', viewType: currentViewType || 'list' };
    document.getElementById('editMenuModalTitle').textContent = '메뉴 수정';
    document.getElementById('editMenuName').value = currentName;
    selectEditMenuView(currentViewType || 'list');
    var grp = document.getElementById('editMenuBoardGroup');
    if (grp) grp.style.display = 'none';
    document.getElementById('editMenuModal').classList.add('show');
    document.getElementById('editMenuName').focus();
};

// 메뉴 삭제
// 카테고리 보기 전환 (리스트 ↔ 갤러리)
window.toggleCatView = async function(boardId, catId, newViewType) {
    try {
        await api.put('/api/categories/' + boardId + '/' + catId, { viewType: newViewType });
        invalidateAll();
        await renderMenuTree();
        await renderSidebarMenus();
    } catch(e) { alert(e.message || '변경 실패'); }
};

// 게시판 보기 전환 (리스트 ↔ 갤러리)
window.toggleBoardView = async function(boardId, newViewType) {
    try {
        await api.put('/api/boards/' + boardId, { viewType: newViewType });
        invalidateAll();
        await renderMenuTree();
        await renderSidebarMenus();
    } catch(e) { alert(e.message || '변경 실패'); }
};

window.deleteBoard = async function(boardId) {
    if (!confirm('이 메뉴와 하위 카테고리가 모두 삭제됩니다. 진행하시겠습니까?')) return;
    try {
        await api.del('/api/boards/' + boardId);
        invalidateAll(); await renderMenuTree(); await renderSidebarMenus();
    } catch(e) { alert(e.message || '삭제 실패'); }
};

// 카테고리 추가 다이얼로그
window.showAddCatDialog = function(boardId) {
    editMenuState = { type: 'addCategory', boardId: boardId, catId: '', viewType: 'list' };
    document.getElementById('editMenuModalTitle').textContent = '새 카테고리 추가';
    document.getElementById('editMenuName').value = '';
    selectEditMenuView('list');
    var grp = document.getElementById('editMenuBoardGroup');
    if (grp) grp.style.display = 'none';
    document.getElementById('editMenuModal').classList.add('show');
    document.getElementById('editMenuName').focus();
};

// 카테고리 수정 다이얼로그
window.showEditCatDialog = async function(boardId, catId, currentName, currentViewType) {
    editMenuState = { type: 'category', boardId: boardId, catId: catId, viewType: currentViewType || 'list' };
    document.getElementById('editMenuModalTitle').textContent = '카테고리 수정';
    document.getElementById('editMenuName').value = currentName;
    selectEditMenuView(currentViewType || 'list');
    // 소속 메뉴 드롭다운 (카테고리 수정에만 표시)
    var grp = document.getElementById('editMenuBoardGroup');
    var sel = document.getElementById('editMenuBoardSel');
    if (grp && sel) {
        grp.style.display = 'block';
        try {
            var boards = sortByOrder(await api.get('/api/boards'));
            sel.innerHTML = boards.map(function(b) {
                return '<option value="'+b.id+'"'+(b.id===boardId?' selected':'')+'>'+escapeHtml(b.name)+' (ID: '+b.id+')</option>';
            }).join('');
        } catch(e) { console.error('메뉴 목록 로드 실패:', e); }
    }
    document.getElementById('editMenuModal').classList.add('show');
    document.getElementById('editMenuName').focus();
};

window.submitEditMenu = async function() {
    var name = document.getElementById('editMenuName').value.trim();
    if (!name) return alert('이름을 입력해주세요.');
    try {
        if (editMenuState.type === 'addBoard') {
            var id = name.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20) || 'menu' + Date.now();
            await api.post('/api/boards', { id: id, name: name, viewType: editMenuState.viewType });
        } else if (editMenuState.type === 'addCategory') {
            var catId = name.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20) || 'cat' + Date.now();
            await api.post('/api/categories', { id: catId, boardId: editMenuState.boardId, name: name });
        } else if (editMenuState.type === 'board') {
            await api.put('/api/boards/' + editMenuState.boardId, { name: name, viewType: editMenuState.viewType });
        } else if (editMenuState.type === 'category') {
            var newBoardId = editMenuState.boardId;
            var sel = document.getElementById('editMenuBoardSel');
            if (sel && sel.value) newBoardId = sel.value;
            var moved = newBoardId !== editMenuState.boardId;
            if (moved) {
                if (!confirm('소속 메뉴를 변경하시겠습니까?\n이 카테고리에 속한 모든 게시물도 함께 이동됩니다.')) return;
            }
            await api.put('/api/categories/' + editMenuState.boardId + '/' + editMenuState.catId, {
                name: name,
                viewType: editMenuState.viewType,
                boardId: newBoardId
            });
        }
        invalidateAll();
        await renderMenuTree();
        await renderSidebarMenus();
        closeEditMenuModal();
    } catch(e) { alert(e.message || '저장 실패'); }
};

// 카테고리 삭제
window.deleteCat = async function(boardId, catId) {
    if (!confirm('이 카테고리를 삭제하시겠습니까?')) return;
    try {
        await api.del('/api/categories/' + boardId + '/' + catId);
        invalidateAll(); await renderMenuTree(); await renderSidebarMenus();
    } catch(e) { alert(e.message || '삭제 실패'); }
};

async function loadAdminMenuManager() {
    // 트리 뷰 렌더링
    await renderMenuTree();

    let boards = await api.get('/api/boards');
    const categories = await api.get('/api/categories');

    boards = sortByOrder(boards);
    document.getElementById('boardListContainer').innerHTML = boards.map((b, i) => `
        <div class="admin-data-item" style="display:flex; align-items:center; gap:8px;">
            <div style="display:flex; flex-direction:column; gap:2px;">
                <button type="button" onclick="moveBoardUp(${i})" style="background:none; border:1px solid var(--border-color); border-radius:4px; cursor:pointer; padding:2px 6px; font-size:11px; color:var(--text-secondary);" ${i===0?'disabled':''}>▲</button>
                <button type="button" onclick="moveBoardDown(${i})" style="background:none; border:1px solid var(--border-color); border-radius:4px; cursor:pointer; padding:2px 6px; font-size:11px; color:var(--text-secondary);" ${i===boards.length-1?'disabled':''}>▼</button>
            </div>
            <div style="flex:1;"><div class="admin-data-item-title">${b.name}</div><div class="admin-data-item-meta">ID: ${b.id}</div></div>
            <div class="admin-item-actions">
                <button type="button" class="admin-btn admin-btn-small admin-btn-outline" onclick="editBoard('${b.id}')">수정</button>
                <button type="button" class="admin-btn admin-btn-danger admin-btn-small" onclick="deleteBoard('${b.id}')">삭제</button>
            </div>
        </div>
    `).join('');

    document.getElementById('catTargetBoard').innerHTML = boards.map(b => `<option value="${b.id}">${b.name}</option>`).join('');

    let catHtml = '';
    boards.forEach(b => {
        const cats = categories[b.id] || [];
        const sortedCats = sortByOrder(cats);
        sortedCats.forEach((c, i) => {
            catHtml += `<div class="admin-data-item" style="display:flex; align-items:center; gap:8px;">
                <div style="display:flex; flex-direction:column; gap:2px;">
                    <button type="button" onclick="moveCatUp('${b.id}', ${i})" style="background:none; border:1px solid var(--border-color); border-radius:4px; cursor:pointer; padding:2px 6px; font-size:11px; color:var(--text-secondary);" ${i===0?'disabled':''}>▲</button>
                    <button type="button" onclick="moveCatDown('${b.id}', ${i})" style="background:none; border:1px solid var(--border-color); border-radius:4px; cursor:pointer; padding:2px 6px; font-size:11px; color:var(--text-secondary);" ${i===sortedCats.length-1?'disabled':''}>▼</button>
                </div>
                <div style="flex:1;"><div class="admin-data-item-title">${b.name} > ${c.name}</div><div class="admin-data-item-meta">ID: ${c.id}</div></div>
                <div class="admin-item-actions">
                    <button type="button" class="admin-btn admin-btn-small admin-btn-outline" onclick="editCategory('${b.id}', '${c.id}')">수정</button>
                    <button type="button" class="admin-btn admin-btn-danger admin-btn-small" onclick="deleteCategory('${b.id}', '${c.id}')">삭제</button>
                </div>
            </div>`;
        });
    });
    document.getElementById('catListContainer').innerHTML = catHtml;
}

// 대분류 순서 변경
window.moveBoardUp = async function(idx) {
    const boards = sortByOrder(await api.get('/api/boards'));
    await moveItem('boards', boards, idx, -1);
    await loadAdminMenuManager(); await renderSidebarMenus();
};
window.moveBoardDown = async function(idx) {
    const boards = sortByOrder(await api.get('/api/boards'));
    await moveItem('boards', boards, idx, 1);
    await loadAdminMenuManager(); await renderSidebarMenus();
};

// 중분류 순서 변경
window.moveCatUp = async function(boardId, idx) {
    const categories = await api.get('/api/categories');
    const cats = sortByOrder(categories[boardId] || []);
    await moveItem('categories', cats, idx, -1);
    await loadAdminMenuManager(); await renderSidebarMenus();
};
window.moveCatDown = async function(boardId, idx) {
    const categories = await api.get('/api/categories');
    const cats = sortByOrder(categories[boardId] || []);
    await moveItem('categories', cats, idx, 1);
    await loadAdminMenuManager(); await renderSidebarMenus();
};

// 대분류 추가/수정
document.getElementById('addBoardBtn').addEventListener('click', async function() {
    const id = document.getElementById('boardIdInput').value.trim();
    const name = document.getElementById('boardNameInput').value.trim();
    if (!id || !name) return alert('ID와 이름을 모두 입력하세요.');

    try {
        if (editBoardId) {
            const viewType = document.getElementById('boardViewTypeInput').value;
            await api.put(`/api/boards/${editBoardId}`, { id, name, viewType });
            editBoardId = null; this.textContent = '대분류 추가'; this.classList.replace('admin-btn-primary', 'admin-btn-success');
        } else {
            await api.post('/api/boards', { id, name, icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' });
        }
        document.getElementById('boardIdInput').value = ''; document.getElementById('boardNameInput').value = '';
        invalidateAll(); await loadAdminMenuManager(); await renderSidebarMenus(); await loadAdminPosts();
    } catch(err) { alert('오류: ' + err.message); }
});

window.editBoard = async function(id) {
    const boards = await api.get('/api/boards');
    const board = boards.find(b => b.id === id);
    if(board) {
        document.getElementById('boardIdInput').value = board.id;
        document.getElementById('boardNameInput').value = board.name;
        editBoardId = id;
        const btn = document.getElementById('addBoardBtn'); btn.textContent = '저장'; btn.classList.replace('admin-btn-success', 'admin-btn-primary');
    }
};
window.deleteBoard = async function(id) {
    if (!confirm('게시판을 삭제하면 하위 게시물 접근이 어려워집니다. 진행하시겠습니까?')) return;
    await api.del(`/api/boards/${id}`);
    invalidateAll(); await loadAdminMenuManager(); await renderSidebarMenus();
};

// 중분류 추가/수정
document.getElementById('addCatBtn').addEventListener('click', async function() {
    const boardId = document.getElementById('catTargetBoard').value;
    const id = document.getElementById('catIdInput').value.trim();
    const name = document.getElementById('catNameInput').value.trim();
    if (!boardId || !id || !name) return alert('모든 필드를 입력하세요.');

    try {
        if (editCatId) {
            await api.put(`/api/categories/${editCatBoardId}/${editCatId}`, { id, boardId, name });
            editCatId = null; editCatBoardId = null; this.textContent = '중분류 추가'; this.classList.replace('admin-btn-primary', 'admin-btn-success');
        } else {
            await api.post('/api/categories', { id, boardId, name });
        }
        document.getElementById('catIdInput').value = ''; document.getElementById('catNameInput').value = '';
        invalidateAll(); await loadAdminMenuManager(); await renderSidebarMenus(); await loadAdminPosts();
    } catch(err) { alert('오류: ' + err.message); }
});

window.editCategory = async function(boardId, catId) {
    const categories = await api.get('/api/categories');
    const cat = categories[boardId]?.find(c => c.id === catId);
    if(cat) {
        document.getElementById('catTargetBoard').value = boardId;
        document.getElementById('catIdInput').value = cat.id;
        document.getElementById('catNameInput').value = cat.name;
        editCatId = catId; editCatBoardId = boardId;
        const btn = document.getElementById('addCatBtn'); btn.textContent = '저장'; btn.classList.replace('admin-btn-success', 'admin-btn-primary');
    }
};
window.deleteCategory = async function(boardId, catId) {
    if (!confirm('카테고리를 삭제하시겠습니까?')) return;
    await api.del(`/api/categories/${boardId}/${catId}`);
    invalidateAll(); await loadAdminMenuManager(); await renderSidebarMenus();
};

/* ==========================================
   게시물 관리
========================================== */
var editPostId = null;

async function updatePostCategoryDropdown() {
    const boardId = document.getElementById('postBoardSel').value;
    const categories = await cachedGet('/api/categories');
    const cats = categories[boardId] || [];
    document.getElementById('postCatSel').innerHTML = cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

async function loadAdminPosts() {
    const boards = await api.get('/api/boards');
    const boardSel = document.getElementById('postBoardSel');
    const curVal = boardSel.value;
    boardSel.innerHTML = boards.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
    if(curVal && boards.find(b=>b.id===curVal)) boardSel.value = curVal;
    await updatePostCategoryDropdown();

    // 필터 드롭다운 업데이트
    const filterSel = document.getElementById('postFilterBoard');
    const filterVal = filterSel.value;
    filterSel.innerHTML = '<option value="">전체 게시판</option>' + boards.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
    if(filterVal) filterSel.value = filterVal;

    allAdminPosts = sortByOrder(await api.get('/api/posts'));
    filterAdminPosts();
}

window.filterAdminPosts = function() {
    const filterBoard = document.getElementById('postFilterBoard').value;
    const search = (document.getElementById('postSearchInput').value || '').toLowerCase();
    let filtered = allAdminPosts;
    if (filterBoard) filtered = filtered.filter(p => p.boardId === filterBoard);
    if (search) filtered = filtered.filter(p => p.title.toLowerCase().includes(search));

    document.getElementById('postsListContainer').innerHTML = filtered.length === 0
        ? '<p style="color:var(--text-light); padding:12px;">게시물이 없습니다.</p>'
        : filtered.map((p, i) => `
        <div class="admin-data-item" style="display:flex; align-items:center; gap:8px;">
            <div style="display:flex; flex-direction:column; gap:2px;">
                <button type="button" onclick="movePostUp(${i}, '${filterBoard}')" style="background:none; border:1px solid var(--border-color); border-radius:4px; cursor:pointer; padding:2px 6px; font-size:11px; color:var(--text-secondary);" ${i===0?'disabled':''}>▲</button>
                <button type="button" onclick="movePostDown(${i}, '${filterBoard}')" style="background:none; border:1px solid var(--border-color); border-radius:4px; cursor:pointer; padding:2px 6px; font-size:11px; color:var(--text-secondary);" ${i===filtered.length-1?'disabled':''}>▼</button>
            </div>
            <div style="flex:1;">
                <div class="admin-data-item-title">${p.title}</div>
                <div class="admin-data-item-meta">📁 ${p.boardId} > ${p.categoryId} | ${p.type} | 조회 ${p.views || 0}</div>
            </div>
            <div class="admin-item-actions">
                <button type="button" class="admin-btn admin-btn-small admin-btn-outline" onclick="editPost('${p.id}')">수정</button>
                <button type="button" class="admin-btn admin-btn-danger admin-btn-small" onclick="deletePost('${p.id}')">삭제</button>
            </div>
        </div>
    `).join('');
};

// 게시물 순서 변경
window.movePostUp = async function(idx, filterBoard) {
    const filtered = filterBoard ? allAdminPosts.filter(p => p.boardId === filterBoard) : allAdminPosts;
    const sorted = sortByOrder(filtered);
    await moveItem('posts', sorted, idx, -1);
    allAdminPosts = sortByOrder(await api.get('/api/posts'));
    filterAdminPosts();
};
window.movePostDown = async function(idx, filterBoard) {
    const filtered = filterBoard ? allAdminPosts.filter(p => p.boardId === filterBoard) : allAdminPosts;
    const sorted = sortByOrder(filtered);
    await moveItem('posts', sorted, idx, 1);
    allAdminPosts = sortByOrder(await api.get('/api/posts'));
    filterAdminPosts();
};

window.togglePostFields = function() {
    var type = document.getElementById('postType').value;
    document.getElementById('postUrlGroup').style.display = ['url','link','docx','xlsx','pptx'].includes(type) ? 'block' : 'none';
    document.getElementById('postPdfGroup').style.display = type === 'pdf' ? 'block' : 'none';
    document.getElementById('postContentGroup').style.display = type === 'text' ? 'block' : 'none';
    var postImgGroup = document.getElementById('postImagesGroup');
    if (postImgGroup) postImgGroup.style.display = (type === 'images') ? 'block' : 'none';
};

// 아이콘 이미지 선택 → 즉시 미리보기
var _postIconImgEl = document.getElementById('postIconImage');
if (_postIconImgEl) _postIconImgEl.addEventListener('change', function() {
    var prev = document.getElementById('postIconImagePreview');
    if (!prev) return;
    var f = this.files && this.files[0];
    if (!f) { prev.innerHTML = ''; return; }
    var url = URL.createObjectURL(f);
    prev.innerHTML = '<img src="' + url + '" style="max-height:48px; border-radius:6px; border:1px solid var(--border-color);"> <span style="font-size:12px; color:var(--text-light);">' + f.name + '</span>';
});

// PDF 파일 선택 → 서버 업로드
var postPdfFileEl = document.getElementById('postPdfFile');
if (postPdfFileEl) postPdfFileEl.addEventListener('change', async function(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.type !== 'application/pdf') return alert('PDF 파일만 업로드 가능합니다.');
    document.getElementById('postPdfFileName').textContent = `업로드 중...`;
    try {
        const result = await api.upload(file);
        document.getElementById('postFileName').value = result.fileName;
        document.getElementById('postPdfFileName').textContent = `업로드 완료: ${file.name}`;
    } catch(err) {
        document.getElementById('postPdfFileName').textContent = `업로드 실패: ${err.message}`;
    }
});

var addPostBtnEl = document.getElementById('addPostBtn');
if (addPostBtnEl) addPostBtnEl.addEventListener('click', async function() {
    const boardId = document.getElementById('postBoardSel').value;
    const categoryId = document.getElementById('postCatSel').value;
    const type = document.getElementById('postType').value;
    const title = document.getElementById('postTitle').value;
    const icon = document.getElementById('postIcon').value;
    const subInfo = document.getElementById('postSubInfo').value;
    const content = document.getElementById('postContent').value;
    const url = document.getElementById('postUrl').value;
    const fileName = document.getElementById('postFileName').value;

    if (!title) return alert('제목을 입력하세요.');

    var postData = { boardId: boardId, categoryId: categoryId, type: type, title: title, icon: icon, subInfo: subInfo,
        content: type === 'text' ? content : '',
        url: ['url','link','docx','xlsx','pptx'].includes(type) ? url : '',
        fileName: type === 'pdf' ? fileName : ''
    };

    // 아이콘 이미지 업로드 (선택)
    var iconImgEl = document.getElementById('postIconImage');
    if (iconImgEl && iconImgEl.files && iconImgEl.files.length > 0) {
        var iconFd = new FormData();
        iconFd.append('file', iconImgEl.files[0]);
        try {
            var iconRes = await fetch('/api/upload', { method: 'POST', body: iconFd });
            var iconData = await iconRes.json();
            if (!iconData.error) postData.thumbnail = iconData.fileName;
        } catch(e) { console.error('아이콘 업로드 실패:', e); }
    }

    // 수정 시 기존 이미지 정보 보존 (아이콘을 새로 올리지 않았을 때만)
    if (editPostId && window._editPostOriginal) {
        if (!postData.thumbnail && window._editPostOriginal.thumbnail) postData.thumbnail = window._editPostOriginal.thumbnail;
        if (window._editPostOriginal.detailImage) postData.detailImage = window._editPostOriginal.detailImage;
        if (window._editPostOriginal.bgColor) postData.bgColor = window._editPostOriginal.bgColor;
    }

    // 이미지 복수 업로드 처리
    if (type === 'images') {
        var postOrderedFiles = orderedImageFiles['postImages'] || [];
        if (postOrderedFiles.length > 0) {
            var imgNames = [];
            var statusEl = document.getElementById('postImagesStatus');
            for (var ii = 0; ii < postOrderedFiles.length; ii++) {
                if (statusEl) statusEl.textContent = '업로드 중... (' + (ii+1) + '/' + postOrderedFiles.length + ')';
                var imgFd = new FormData();
                imgFd.append('file', postOrderedFiles[ii]);
                var imgRes = await fetch('/api/upload', { method: 'POST', body: imgFd });
                var imgData = await imgRes.json();
                if (!imgData.error) imgNames.push(imgData.fileName);
            }
            if (statusEl) statusEl.textContent = '업로드 완료! ' + imgNames.length + '장';
            if (imgNames.length > 0) {
                postData.thumbnail = imgNames[0];
                postData.detailImage = imgNames.join('|');
            }
        }
    }

    // 1) 실제 저장 — 재시도 내장, 네트워크 일시 오류에 강건하게
    try {
        if (editPostId) {
            await _saveWithRetry(function() { return api.put('/api/posts/' + editPostId, postData); });
            editPostId = null; window._editPostOriginal = null; this.textContent = '게시물 등록'; this.classList.replace('admin-btn-primary', 'admin-btn-success');
            document.getElementById('editPostIndicator').style.display = 'none';
        } else {
            await _saveWithRetry(function() { return api.post('/api/posts', postData); });
        }
    } catch(err) {
        console.error('[게시물 저장 실패]', err);
        var msg = (err && err.message) ? err.message : String(err);
        // 친화적 메시지 변환
        if (/Failed to fetch|NetworkError|fetch failed/i.test(msg)) {
            msg = '서버와 연결이 끊어졌습니다.\n\n- 네트워크 상태를 확인해 주세요\n- 페이지를 새로고침하고 다시 시도해 주세요\n- 로그인이 만료되었을 수 있습니다';
        } else if (/401|Unauthorized/i.test(msg)) {
            msg = '로그인이 만료되었습니다. 다시 로그인 후 시도해 주세요.';
        } else if (/500/i.test(msg)) {
            msg = '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.\n(' + msg.substring(0, 100) + ')';
        }
        alert('저장 실패: ' + msg);
        return;
    }
    // 2) 폼 리셋 + 화면 갱신 — 여기서 난 오류는 저장과 무관, 콘솔에만 기록
    alert('게시물이 저장되었습니다!');
    try {
        document.getElementById('postTitle').value = ''; document.getElementById('postContent').value = ''; document.getElementById('postUrl').value = '';
        document.getElementById('postFileName').value = ''; document.getElementById('postPdfFileName').textContent = '';
        var _pii = document.getElementById('postIconImage'); if (_pii) _pii.value = '';
        var _piip = document.getElementById('postIconImagePreview'); if (_piip) _piip.innerHTML = '';
        var postImgEl = document.getElementById('postImages'); if (postImgEl) postImgEl.value = '';
        var postImgPrev = document.getElementById('postImagesPreview'); if (postImgPrev) postImgPrev.innerHTML = '';
        var postImgStat = document.getElementById('postImagesStatus'); if (postImgStat) postImgStat.textContent = '';
        if (typeof orderedImageFiles !== 'undefined') orderedImageFiles['postImages'] = [];
        invalidateAll();
        await loadAdminPosts();
        if (typeof updateDashboardStats === 'function') await updateDashboardStats();
        if (typeof loadDashboardWidgets === 'function') await loadDashboardWidgets();
    } catch(e) { console.warn('저장 후 화면 갱신 경고:', e); }
});

// editPost는 openWriteModal로 통합 (라인 162에서 정의됨)
window.deletePost = async function(id) {
    if (!confirm('삭제하시겠습니까?')) return;
    await api.del(`/api/posts/${id}`);
    invalidateAll(); await loadAdminPosts(); await updateDashboardStats(); await loadDashboardWidgets();
};

/* ==========================================
   공지/연락처/조직도 관리
========================================== */
/* ── 공지사항 관리 (수정 기능 추가) ── */
var editNoticeId = null;
var allAdminContacts = [];

async function loadAdminNotices() {
    const notices = await api.get('/api/notices');
    const typeLabel = { general: '🔵 일반', important: '🟡 중요', urgent: '🔴 긴급' };
    document.getElementById('noticesList').innerHTML = notices.map(n => `
        <div class="admin-data-item">
            <div style="flex:1;">
                <div class="admin-data-item-title">${n.title}</div>
                <div class="admin-data-item-meta">${typeLabel[n.type] || n.type} | ${n.date || ''}</div>
            </div>
            <div class="admin-item-actions">
                <button type="button" class="admin-btn admin-btn-small admin-btn-outline" onclick="editNotice('${n.id}')">수정</button>
                <button type="button" class="admin-btn admin-btn-danger admin-btn-small" onclick="deleteNotice('${n.id}')">삭제</button>
            </div>
        </div>
    `).join('');
}

window.editNotice = async function(id) {
    const notices = await api.get('/api/notices');
    const n = notices.find(x => x.id === id);
    if (!n) return;
    document.getElementById('noticeTitle').value = n.title || '';
    document.getElementById('noticeType').value = n.type || 'general';
    document.getElementById('noticeContent').value = n.content || '';
    editNoticeId = id;
    document.getElementById('editNoticeIndicator').style.display = 'inline';
    document.getElementById('addNoticeBtn').textContent = '저장';
    document.getElementById('addNoticeBtn').classList.replace('admin-btn-success', 'admin-btn-primary');
};

window.cancelEditNotice = function() {
    editNoticeId = null;
    document.getElementById('noticeTitle').value = '';
    document.getElementById('noticeContent').value = '';
    document.getElementById('editNoticeIndicator').style.display = 'none';
    document.getElementById('addNoticeBtn').textContent = '추가';
    document.getElementById('addNoticeBtn').classList.replace('admin-btn-primary', 'admin-btn-success');
};

document.getElementById('addNoticeBtn').addEventListener('click', async function() {
    const data = { title: document.getElementById('noticeTitle').value, type: document.getElementById('noticeType').value, content: document.getElementById('noticeContent').value };
    if (!data.title) return alert('제목을 입력하세요.');
    try {
        if (editNoticeId) {
            await api.put(`/api/notices/${editNoticeId}`, data);
            cancelEditNotice();
        } else {
            await api.post('/api/notices', data);
        }
        document.getElementById('noticeTitle').value = ''; document.getElementById('noticeContent').value = '';
        invalidate('/api/notices'); await loadAdminNotices(); await loadNoticeCards();
    } catch(err) { alert('오류: ' + err.message); }
});
window.deleteNotice = async function(id) { if(!confirm('삭제하시겠습니까?')) return; await api.del(`/api/notices/${id}`); invalidate('/api/notices'); await loadAdminNotices(); await loadNoticeCards(); };

/* ── 인사정보 관리 (수정/검색 기능 추가) ── */
var editContactId = null;

async function loadAdminContacts() {
    try {
        allAdminContacts = await api.get('/api/contacts');
        console.log('[Admin] 연락처 로드 완료:', allAdminContacts.length, '건');
        filterAdminContacts();
    } catch(e) { console.error('연락처 로드 실패:', e); }
}

window.filterAdminContacts = function() {
    const searchEl = document.getElementById('contactSearchInput');
    const search = searchEl ? (searchEl.value || '').toLowerCase() : '';
    let filtered = allAdminContacts || [];
    if (search) filtered = filtered.filter(c =>
        (c.name||'').toLowerCase().includes(search) ||
        (c.dept||'').toLowerCase().includes(search) ||
        (c.position||'').toLowerCase().includes(search)
    );

    const countEl = document.getElementById('adminContactCount');
    if (countEl) countEl.textContent = '총 ' + filtered.length + '명';

    const contactsListEl = document.getElementById('contactsList');
    if (!contactsListEl) return;

    const statusText = function(s) {
        if (s === 'active') return '<span style="color:#10b981; font-weight:600;">재직중</span>';
        if (s === 'leave') return '<span style="color:#7c3aed; font-weight:600;">휴직중</span>';
        if (s === 'dispatch') return '<span style="color:#d97706; font-weight:600;">파견중</span>';
        return s || '';
    };

    if (filtered.length === 0) {
        contactsListEl.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:40px; color:var(--text-light);">등록된 연락처가 없습니다.</td></tr>';
        return;
    }

    contactsListEl.innerHTML = filtered.map(function(c, idx) { return `
        <tr data-contact-id="${c.id}">
            <td style="text-align:center;">
                <button type="button" onclick="moveContact('${c.id}','up')" style="background:none; border:none; cursor:pointer; font-size:16px; padding:0 2px; opacity:${idx === 0 ? '0.3' : '1'};" ${idx === 0 ? 'disabled' : ''}>▲</button>
                <button type="button" onclick="moveContact('${c.id}','down')" style="background:none; border:none; cursor:pointer; font-size:16px; padding:0 2px; opacity:${idx === filtered.length - 1 ? '0.3' : '1'};" ${idx === filtered.length - 1 ? 'disabled' : ''}>▼</button>
            </td>
            <td style="font-weight:600;">${c.name || ''}</td>
            <td>${c.position || ''}</td>
            <td>${c.dept || ''}</td>
            <td style="font-size:13px;">${c.phone || ''}</td>
            <td style="font-size:13px;">${c.email || ''}</td>
            <td>${statusText(c.status)}</td>
            <td>
                <button type="button" onclick="editContact('${c.id}')" style="background:none; border:1px solid var(--primary); color:var(--primary); padding:4px 10px; border-radius:4px; cursor:pointer; font-size:12px; margin-right:4px;">수정</button>
                <button type="button" onclick="deleteContact('${c.id}')" style="background:none; border:1px solid #ef4444; color:#ef4444; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:12px;">삭제</button>
            </td>
        </tr>
    `; }).join('');
};

var editContactModalId = null;

window.openContactModal = function(id) {
    editContactModalId = id || null;
    const modal = document.getElementById('contactModal');
    const title = document.getElementById('contactModalTitle');

    if (id) {
        const c = allAdminContacts.find(x => x.id === id);
        if (!c) return;
        title.textContent = '직원 수정';
        document.getElementById('cmName').value = c.name || '';
        document.getElementById('cmPosition').value = c.position || '';
        document.getElementById('cmDept').value = c.dept || '';
        document.getElementById('cmPhone').value = c.phone || '';
        document.getElementById('cmEmail').value = c.email || '';
        document.getElementById('cmStatus').value = c.status || 'active';
    } else {
        title.textContent = '직원 추가';
        document.getElementById('cmName').value = '';
        document.getElementById('cmPosition').value = '';
        document.getElementById('cmDept').value = '';
        document.getElementById('cmPhone').value = '';
        document.getElementById('cmEmail').value = '';
        document.getElementById('cmStatus').value = 'active';
    }
    modal.classList.add('show');
    document.getElementById('cmName').focus();
};

window.closeContactModal = function() {
    document.getElementById('contactModal').classList.remove('show');
    editContactModalId = null;
};

window.submitContactModal = async function() {
    const data = {
        name: document.getElementById('cmName').value.trim(),
        position: document.getElementById('cmPosition').value.trim(),
        dept: document.getElementById('cmDept').value.trim(),
        phone: document.getElementById('cmPhone').value.trim(),
        email: document.getElementById('cmEmail').value.trim(),
        status: document.getElementById('cmStatus').value
    };
    if (!data.name) return alert('이름을 입력하세요.');
    try {
        if (editContactModalId) {
            await api.put('/api/contacts/' + editContactModalId, data);
        } else {
            await api.post('/api/contacts', data);
        }
        closeContactModal();
        invalidateAll();
        await loadAdminContacts();
        await loadContacts();
        await updateDashboardStats();
        alert(editContactModalId ? '수정되었습니다.' : '추가되었습니다.');
    } catch(e) { alert('오류: ' + e.message); }
};

window.editContact = async function(id) {
    openContactModal(id);
    return;
    const c = allAdminContacts.find(x => x.id === id);
    if (!c) return;
    document.getElementById('contactName').value = c.name || '';
    document.getElementById('contactPosition').value = c.position || '';
    document.getElementById('contactDept').value = c.dept || '';
    document.getElementById('contactPhone').value = c.phone || '';
    document.getElementById('contactEmail').value = c.email || '';
    document.getElementById('contactStatus').value = c.status || 'active';
    editContactId = id;
    document.getElementById('editContactIndicator').style.display = 'inline';
    document.getElementById('addContactBtn').textContent = '저장';
    document.getElementById('addContactBtn').classList.replace('admin-btn-success', 'admin-btn-primary');
    document.querySelector('#contactsTab').scrollTo({ top: 0, behavior: 'smooth' });
};

window.cancelEditContact = function() {
    editContactId = null;
    document.getElementById('contactName').value = '';
    document.getElementById('contactPosition').value = '';
    document.getElementById('contactDept').value = '';
    document.getElementById('contactPhone').value = '';
    document.getElementById('contactEmail').value = '';
    document.getElementById('editContactIndicator').style.display = 'none';
    document.getElementById('addContactBtn').textContent = '추가';
    document.getElementById('addContactBtn').classList.replace('admin-btn-primary', 'admin-btn-success');
};

var addContactBtnEl = document.getElementById('addContactBtn');
if (addContactBtnEl) addContactBtnEl.addEventListener('click', async function() {
    const data = { name: document.getElementById('contactName').value, position: document.getElementById('contactPosition').value, dept: document.getElementById('contactDept').value, status: document.getElementById('contactStatus').value, phone: document.getElementById('contactPhone').value, email: document.getElementById('contactEmail').value };
    if (!data.name) return alert('이름을 입력하세요.');
    try {
        if (editContactId) {
            await api.put(`/api/contacts/${editContactId}`, data);
            cancelEditContact();
        } else {
            await api.post('/api/contacts', data);
        }
        document.getElementById('contactName').value = ''; document.getElementById('contactPosition').value = '';
        document.getElementById('contactDept').value = ''; document.getElementById('contactPhone').value = '';
        document.getElementById('contactEmail').value = '';
        invalidateAll(); await loadAdminContacts(); await loadContacts(); await updateDashboardStats();
    } catch(err) { alert('오류: ' + err.message); }
});
window.deleteContact = async function(id) { if(!confirm('삭제하시겠습니까?')) return; await api.del(`/api/contacts/${id}`); invalidateAll(); await loadAdminContacts(); await loadContacts(); await updateDashboardStats(); };

window.moveContact = async function(id, direction) {
    var list = allAdminContacts || [];
    var idx = list.findIndex(function(c) { return c.id === id; });
    if (idx < 0) return;
    var swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= list.length) return;
    // 배열에서 스왑
    var temp = list[idx];
    list[idx] = list[swapIdx];
    list[swapIdx] = temp;
    // 전체 목록에 순번 부여 (배치 API 1회 호출)
    var items = list.map(function(c, i) { return { id: c.id, order: i + 1 }; });
    try {
        await api.put('/api/contact-order', { items: items });
        invalidateAll();
        await loadAdminContacts();
        await loadContacts();
    } catch(e) { alert('순서 변경 실패: ' + e.message); }
};

/* ── 조직도 관리 ── */
async function loadAdminOrgChart() {
    try {
        var data = await api.get('/api/orgchart');
        renderAdminOrgTree(data);
        // 캔버스도 로드
        if (typeof loadAdminOrgCanvas === 'function') loadAdminOrgCanvas();
    } catch(e) { console.error(e); }
}

/* ==========================================
   설정
========================================== */
async function loadAdminSettings() {
    const s = await api.get('/api/settings');
    document.getElementById('companyName').value = s.companyName || 'NeoLab';
    // 점검 모드 상태 로드
    try {
        var m = await api.get('/api/maintenance');
        updateMaintenanceUI(m.maintenance);
    } catch(e) { console.warn('점검 모드 확인 실패:', e); }
}

function updateMaintenanceUI(enabled) {
    var statusEl = document.getElementById('maintenanceStatus');
    var btnEl = document.getElementById('maintenanceToggleBtn');
    if (statusEl) statusEl.innerHTML = enabled
        ? '<span style="color:#ef4444;">🔴 점검 모드 ON (관리자만 접속 가능)</span>'
        : '<span style="color:#10b981;">🟢 정상 운영 중</span>';
    if (btnEl) {
        btnEl.textContent = enabled ? '점검 해제' : '점검 모드 켜기';
        btnEl.style.background = enabled ? '#10b981' : '#ef4444';
        btnEl.style.color = 'white';
        btnEl.style.border = 'none';
    }
}

window.toggleMaintenance = async function() {
    try {
        var current = await api.get('/api/maintenance');
        var newState = !current.maintenance;
        var msg = newState ? '점검 모드를 활성화하면 관리자 외 모든 사용자가 접속할 수 없습니다.\n계속하시겠습니까?' : '점검 모드를 해제하시겠습니까?';
        if (!confirm(msg)) return;
        var result = await api.put('/api/maintenance', { enabled: newState });
        updateMaintenanceUI(result.maintenance);
        alert(newState ? '점검 모드가 활성화되었습니다.' : '점검 모드가 해제되었습니다.');
    } catch(e) { alert('오류: ' + e.message); }
};
document.getElementById('saveSettingsBtn').addEventListener('click', async function() {
    await api.put('/api/settings', { companyName: document.getElementById('companyName').value });
    showAdminSuccess('settingsSuccess', '저장되었습니다!');
});

/* ==========================================
   백업/복원
========================================== */
document.getElementById('backupBtn').addEventListener('click', async function() {
    try {
        const res = await fetch('/api/backup');
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'kms_backup.json';
        a.click();
    } catch(err) { alert('백업 실패: ' + err.message); }
});

document.getElementById('restoreBtn').addEventListener('click', async function() {
    const file = document.getElementById('restoreFile').files[0];
    if (!file || !confirm('기존 데이터를 덮어씁니다. 진행하시겠습니까?')) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = JSON.parse(e.target.result);
            await api.post('/api/restore', data);
            alert('복원 완료!');
            location.reload();
        } catch(err) { alert('복원 실패: ' + err.message); }
    };
    reader.readAsText(file);
});

document.getElementById('resetBtn').addEventListener('click', async function() {
    if (confirm('정말 초기화하시겠습니까? 모든 데이터가 삭제됩니다.')) {
        try {
            await api.post('/api/restore', { boards: [], categories: [], posts: [], notices: [], contacts: [], orgchart: [], settings: [] });
            alert('초기화 완료!');
            location.reload();
        } catch(err) { alert('초기화 실패: ' + err.message); }
    }
});

function showAdminSuccess(id, msg) { const e = document.getElementById(id); if (e) { e.textContent = msg; e.classList.add('show'); setTimeout(() => e.classList.remove('show'), 3000); } }

/* ── 개선요청 관리 (관리자 전용) ── */
async function loadAdminSuggestions() {
    try {
        const suggestions = await api.get('/api/suggestions');
        const countEl = document.getElementById('adminSuggestionCount');
        if (countEl) countEl.textContent = '총 ' + suggestions.length + '건';

        const listEl = document.getElementById('adminSuggestionsList');
        if (!listEl) return;

        if (suggestions.length === 0) {
            listEl.innerHTML = '<div style="text-align:center; padding:60px 20px; color:var(--text-light);"><div style="font-size:48px; margin-bottom:12px;">📭</div><p>접수된 개선요청이 없습니다.</p></div>';
            return;
        }

        // 최신순 정렬
        suggestions.sort((a, b) => b.id.localeCompare(a.id));

        listEl.innerHTML = suggestions.map(s => `
            <div class="suggestion-card">
                <div class="suggestion-card-header">
                    <span style="font-size:12px; color:var(--text-light);">📅 ${s.date} · ID: ${s.id}</span>
                    <button type="button" onclick="deleteSuggestion('${s.id}')" style="background:none; border:1px solid #ef4444; color:#ef4444; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:12px;">삭제</button>
                </div>
                <div class="suggestion-card-body">${(s.content || '').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</div>
            </div>
        `).join('');
    } catch(e) { console.error('개선요청 로드 실패:', e); }
}

window.deleteSuggestion = async function(id) {
    if (!confirm('이 개선요청을 삭제하시겠습니까?')) return;
    try {
        await api.del('/api/suggestions/' + id);
        invalidateAll();
        await loadAdminSuggestions();
    } catch(e) { alert('삭제 실패: ' + e.message); }
};

/* ── 인프라 관리 ── */
var editInfraId = null;

async function loadAdminInfra() {
    try {
        var posts = await api.get('/api/posts');
        var infraPosts = posts.filter(function(p) { return p.boardId === 'infra'; });
        var countEl = document.getElementById('adminInfraCount');
        if (countEl) countEl.textContent = '총 ' + infraPosts.length + '개';

        var listEl = document.getElementById('infraList');
        if (!listEl) return;

        if (infraPosts.length === 0) {
            listEl.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:40px; color:var(--text-light);">등록된 인프라가 없습니다.</td></tr>';
            return;
        }

        listEl.innerHTML = infraPosts.map(function(p) {
            var iconHtml = p.thumbnail
                ? '<img src="/api/files/' + p.thumbnail + '" style="width:36px; height:36px; border-radius:8px; object-fit:contain;">'
                : '<span style="font-size:24px;">' + (p.icon || '🔗') + '</span>';
            return '<tr>' +
                '<td style="text-align:center;">' + iconHtml + '</td>' +
                '<td style="font-weight:600;">' + (p.title || '') + '</td>' +
                '<td style="font-size:13px; color:var(--text-secondary); max-width:300px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + (p.url || '') + '</td>' +
                '<td>' +
                    '<button type="button" onclick="editInfra(\'' + p.id + '\')" style="background:none; border:1px solid var(--primary); color:var(--primary); padding:4px 10px; border-radius:4px; cursor:pointer; font-size:12px; margin-right:4px;">수정</button>' +
                    '<button type="button" onclick="deleteInfra(\'' + p.id + '\')" style="background:none; border:1px solid #ef4444; color:#ef4444; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:12px;">삭제</button>' +
                '</td></tr>';
        }).join('');
    } catch(e) { console.error('인프라 로드 실패:', e); }
}

window.openInfraModal = function(id) {
    editInfraId = id || null;
    var modal = document.getElementById('infraModal');
    var title = document.getElementById('infraModalTitle');

    if (id) {
        title.textContent = '인프라 수정';
        api.get('/api/posts/' + id).then(function(p) {
            document.getElementById('infraName').value = p.title || '';
            document.getElementById('infraUrl').value = p.url || '';
            document.getElementById('infraIcon').value = p.icon || '';
            var preview = document.getElementById('infraThumbPreview');
            if (preview) preview.innerHTML = p.thumbnail ? '<img src="/api/files/' + p.thumbnail + '" style="max-height:40px; border-radius:6px;"> <span style="font-size:12px; color:var(--text-light);">기존 아이콘</span>' : '';
        });
    } else {
        title.textContent = '인프라 추가';
        document.getElementById('infraName').value = '';
        document.getElementById('infraUrl').value = '';
        document.getElementById('infraIcon').value = '';
        if (document.getElementById('infraThumb')) document.getElementById('infraThumb').value = '';
        var preview = document.getElementById('infraThumbPreview');
        if (preview) preview.innerHTML = '';
    }
    modal.classList.add('show');
    document.getElementById('infraName').focus();
};

window.closeInfraModal = function() {
    document.getElementById('infraModal').classList.remove('show');
    editInfraId = null;
};

window.submitInfraModal = async function() {
    var name = document.getElementById('infraName').value.trim();
    var url = document.getElementById('infraUrl').value.trim();
    var icon = document.getElementById('infraIcon').value.trim();

    if (!name) return alert('이름을 입력하세요.');
    if (!url) return alert('URL을 입력하세요.');

    // 아이콘 이미지 업로드
    var thumbnail = '';
    var thumbInput = document.getElementById('infraThumb');
    if (thumbInput && thumbInput.files.length > 0) {
        var fd = new FormData();
        fd.append('file', thumbInput.files[0]);
        var res = await fetch('/api/upload', { method: 'POST', body: fd });
        var data = await res.json();
        if (!data.error) thumbnail = data.fileName;
    }

    var postData = {
        title: name,
        url: url,
        icon: icon || '🔗',
        type: 'url',
        boardId: 'infra',
        categoryId: ''
    };
    if (thumbnail) postData.thumbnail = thumbnail;

    try {
        if (editInfraId) {
            await api.put('/api/posts/' + editInfraId, postData);
        } else {
            await api.post('/api/posts', postData);
        }
        closeInfraModal();
        invalidateAll();
        await loadAdminInfra();
        alert(editInfraId ? '수정되었습니다.' : '추가되었습니다.');
    } catch(e) { alert('오류: ' + e.message); }
};

window.editInfra = function(id) {
    openInfraModal(id);
};

window.deleteInfra = async function(id) {
    if (!confirm('삭제하시겠습니까?')) return;
    try {
        await api.del('/api/posts/' + id);
        invalidateAll();
        await loadAdminInfra();
    } catch(e) { alert('삭제 실패: ' + e.message); }
};

// 이미지 복수 선택 시 미리보기
// 이미지 복수 선택 미리보기 (글쓰기 모달 + 게시물 등록/수정 탭 공통)
// 이미지 순서 관리용 전역 변수
var orderedImageFiles = { writeImages: [], postImages: [] };

function setupImagePreview(inputId, previewId, statusId) {
    var el = document.getElementById(inputId);
    if (!el) return;
    el.addEventListener('change', function() {
        var files = Array.from(this.files);
        if (files.length > 20) {
            alert('최대 20장까지 선택할 수 있습니다.');
            this.value = '';
            return;
        }
        orderedImageFiles[inputId] = files.slice();
        renderImageOrder(inputId, previewId, statusId);
    });
}

function renderImageOrder(inputId, previewId, statusId) {
    var preview = document.getElementById(previewId);
    if (!preview) return;
    var files = orderedImageFiles[inputId] || [];
    var stat = document.getElementById(statusId);
    if (stat) stat.textContent = files.length > 0 ? files.length + '장 선택됨 (드래그 또는 버튼으로 순서 변경)' : '';

    if (files.length === 0) { preview.innerHTML = ''; return; }

    preview.innerHTML = '';
    files.forEach(function(file, idx) {
        var card = document.createElement('div');
        card.className = 'img-order-card';
        card.setAttribute('draggable', 'true');
        card.setAttribute('data-idx', idx);

        var numBadge = '<div class="img-order-num">' + (idx + 1) + '</div>';
        var btnHtml = '<div class="img-order-btns">' +
            '<button type="button" onclick="moveImage(\'' + inputId + '\',\'' + previewId + '\',\'' + statusId + '\',' + idx + ',-1)" ' + (idx === 0 ? 'disabled' : '') + '>◀</button>' +
            '<button type="button" onclick="removeImage(\'' + inputId + '\',\'' + previewId + '\',\'' + statusId + '\',' + idx + ')">✕</button>' +
            '<button type="button" onclick="moveImage(\'' + inputId + '\',\'' + previewId + '\',\'' + statusId + '\',' + idx + ',1)" ' + (idx === files.length - 1 ? 'disabled' : '') + '>▶</button>' +
            '</div>';

        var img = document.createElement('img');
        img.className = 'img-order-thumb';
        var reader = new FileReader();
        reader.onload = function(e) { img.src = e.target.result; };
        reader.readAsDataURL(file);

        var nameEl = document.createElement('div');
        nameEl.className = 'img-order-name';
        nameEl.textContent = file.name.length > 12 ? file.name.substring(0, 12) + '...' : file.name;

        card.innerHTML = numBadge;
        card.appendChild(img);
        card.innerHTML += nameEl.outerHTML + btnHtml;

        // 드래그 이벤트
        card.addEventListener('dragstart', function(e) {
            e.dataTransfer.setData('text/plain', idx);
            card.classList.add('dragging');
        });
        card.addEventListener('dragend', function() { card.classList.remove('dragging'); });
        card.addEventListener('dragover', function(e) { e.preventDefault(); card.classList.add('drag-over'); });
        card.addEventListener('dragleave', function() { card.classList.remove('drag-over'); });
        card.addEventListener('drop', function(e) {
            e.preventDefault();
            card.classList.remove('drag-over');
            var fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
            var toIdx = idx;
            if (fromIdx !== toIdx) {
                var arr = orderedImageFiles[inputId];
                var item = arr.splice(fromIdx, 1)[0];
                arr.splice(toIdx, 0, item);
                renderImageOrder(inputId, previewId, statusId);
            }
        });

        preview.appendChild(card);
    });
}

window.moveImage = function(inputId, previewId, statusId, idx, dir) {
    var arr = orderedImageFiles[inputId];
    var newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= arr.length) return;
    var temp = arr[idx];
    arr[idx] = arr[newIdx];
    arr[newIdx] = temp;
    renderImageOrder(inputId, previewId, statusId);
};

window.removeImage = function(inputId, previewId, statusId, idx) {
    orderedImageFiles[inputId].splice(idx, 1);
    renderImageOrder(inputId, previewId, statusId);
};

setupImagePreview('writeImages', 'writeImagesPreview', 'writeImagesStatus');
setupImagePreview('postImages', 'postImagesPreview', 'postImagesStatus');

// 문서 보호: 우클릭 방지
document.addEventListener('contextmenu', function(e) {
    if (e.target.closest('.modal-body') || e.target.closest('iframe')) {
        e.preventDefault();
    }
});

/* ==========================================
   📊 일별 접속 현황
========================================== */
window.loadAccessStats = async function() {
    var days = parseInt(document.getElementById('accessStatsDays').value) || 30;
    try {
        var data = await api.get('/api/access-stats?days=' + days);
        var stats = data.stats || [];

        // ── 요약 카드 ──
        var totalVisits = 0;
        var totalHits = 0;
        stats.forEach(function(d) { totalVisits += d.uniqueUsers; totalHits += d.totalHits; });
        var avgVisits = stats.length > 0 ? (totalVisits / stats.length).toFixed(1) : 0;
        var todayStr = new Date().toISOString().split('T')[0];
        var todayData = stats.find(function(d) { return d.date === todayStr; });

        document.getElementById('accessStatsSummary').innerHTML =
            '<div style="background:linear-gradient(135deg,#ff6720,#ff8f5a); padding:20px; border-radius:12px; color:#fff;">' +
                '<div style="font-size:13px; opacity:0.9;">오늘 접속자</div>' +
                '<div style="font-size:32px; font-weight:800; margin-top:4px;">' + (todayData ? todayData.uniqueUsers : 0) + '명</div>' +
            '</div>' +
            '<div style="background:linear-gradient(135deg,#2563eb,#60a5fa); padding:20px; border-radius:12px; color:#fff;">' +
                '<div style="font-size:13px; opacity:0.9;">일평균 접속자</div>' +
                '<div style="font-size:32px; font-weight:800; margin-top:4px;">' + avgVisits + '명</div>' +
            '</div>' +
            '<div style="background:linear-gradient(135deg,#059669,#34d399); padding:20px; border-radius:12px; color:#fff;">' +
                '<div style="font-size:13px; opacity:0.9;">총 누적 접속</div>' +
                '<div style="font-size:32px; font-weight:800; margin-top:4px;">' + totalVisits + '회</div>' +
            '</div>' +
            '<div style="background:linear-gradient(135deg,#7c3aed,#a78bfa); padding:20px; border-radius:12px; color:#fff;">' +
                '<div style="font-size:13px; opacity:0.9;">전체 사용자 수</div>' +
                '<div style="font-size:32px; font-weight:800; margin-top:4px;">' + (data.totalUniqueUsers || 0) + '명</div>' +
            '</div>';

        // ── 막대 차트 ──
        var chartDays = stats.slice().reverse(); // 오래된 날짜부터
        var maxUsers = 1;
        chartDays.forEach(function(d) { if (d.uniqueUsers > maxUsers) maxUsers = d.uniqueUsers; });

        var chartHtml = '<div style="display:flex; align-items:flex-end; gap:4px; height:200px; padding:8px 0;">';
        chartDays.forEach(function(d) {
            var height = Math.max(4, (d.uniqueUsers / maxUsers) * 160);
            var dateLabel = d.date.substring(5); // MM-DD
            var isToday = d.date === todayStr;
            var barColor = isToday ? '#ff6720' : '#60a5fa';
            chartHtml += '<div style="flex:1; min-width:28px; max-width:60px; display:flex; flex-direction:column; align-items:center; gap:4px;">';
            chartHtml += '<span style="font-size:11px; font-weight:700; color:var(--text-primary);">' + d.uniqueUsers + '</span>';
            chartHtml += '<div style="width:100%; height:' + height + 'px; background:' + barColor + '; border-radius:4px 4px 0 0; transition:height 0.3s;" title="' + d.date + ': ' + d.uniqueUsers + '명"></div>';
            chartHtml += '<span style="font-size:10px; color:var(--text-light); writing-mode:vertical-lr; transform:rotate(180deg); height:40px; overflow:hidden;">' + dateLabel + '</span>';
            chartHtml += '</div>';
        });
        chartHtml += '</div>';
        document.getElementById('accessStatsChart').innerHTML = chartDays.length > 0 ? chartHtml : '<p style="color:var(--text-light); text-align:center; padding:40px;">접속 기록이 없습니다.</p>';

        // ── 상세 테이블 ──
        var tableHtml = '<table class="board-table" style="font-size:14px;">';
        tableHtml += '<thead><tr><th style="width:120px;">날짜</th><th style="width:60px;">요일</th><th style="width:80px;">접속자 수</th><th>접속자 목록</th></tr></thead><tbody>';
        var dayNames = ['일', '월', '화', '수', '목', '금', '토'];

        stats.forEach(function(d) {
            var dt = new Date(d.date + 'T00:00:00');
            var dayName = dayNames[dt.getDay()];
            var isWeekend = dt.getDay() === 0 || dt.getDay() === 6;
            var dayStyle = isWeekend ? 'color:#ef4444;' : '';
            var isToday2 = d.date === todayStr;
            var rowStyle = isToday2 ? 'background:rgba(255,103,32,0.05);' : '';

            var userList = d.users.sort(function(a, b) { return b.count - a.count; }).map(function(u) {
                var displayName = u.name || u.email.split('@')[0];
                return '<span style="display:inline-block; padding:2px 8px; margin:2px; border-radius:12px; font-size:12px; background:var(--bg-light); border:1px solid var(--border-color);">' + displayName + (u.count > 1 ? ' <span style="color:var(--primary); font-weight:600;">(' + u.count + ')</span>' : '') + '</span>';
            }).join('');

            tableHtml += '<tr style="' + rowStyle + '">';
            tableHtml += '<td style="font-weight:' + (isToday2 ? '700' : '400') + ';">' + d.date + '</td>';
            tableHtml += '<td style="' + dayStyle + '">' + dayName + '</td>';
            tableHtml += '<td style="text-align:center; font-weight:700; color:var(--primary);">' + d.uniqueUsers + '명</td>';
            tableHtml += '<td>' + userList + '</td>';
            tableHtml += '</tr>';
        });

        tableHtml += '</tbody></table>';
        document.getElementById('accessStatsTable').innerHTML = stats.length > 0 ? tableHtml : '<p style="color:var(--text-light); text-align:center; padding:40px;">접속 기록이 없습니다.</p>';

        // ── 인기 문서 TOP 10 ──
        try {
            var posts = await api.get('/api/posts');
            var boards = await cachedGet('/api/boards');
            var bMap = {}; boards.forEach(function(b) { bMap[b.id] = b.name; });
            var popular = posts.filter(function(p) { return parseInt(p.views) > 0; })
                .sort(function(a, b) { return (parseInt(b.views)||0) - (parseInt(a.views)||0); })
                .slice(0, 10);

            var popHtml = '<table class="board-table" style="font-size:14px;">';
            popHtml += '<thead><tr><th style="width:40px;">순위</th><th>제목</th><th style="width:100px;">게시판</th><th style="width:80px;">조회수</th></tr></thead><tbody>';
            var medals = ['#FFD700', '#C0C0C0', '#CD7F32'];
            popular.forEach(function(p, i) {
                var medalStyle = i < 3 ? 'color:' + medals[i] + '; font-weight:700;' : 'color:var(--text-light);';
                popHtml += '<tr>';
                popHtml += '<td style="text-align:center; ' + medalStyle + '">' + (i + 1) + '</td>';
                popHtml += '<td style="font-weight:500;">' + p.title + '</td>';
                popHtml += '<td><span class="board-row-badge">' + (bMap[p.boardId] || '') + '</span></td>';
                popHtml += '<td style="text-align:center; font-weight:700; color:var(--primary);">' + (p.views || 0) + '</td>';
                popHtml += '</tr>';
            });
            popHtml += '</tbody></table>';
            document.getElementById('popularDocsTable').innerHTML = popular.length > 0 ? popHtml : '<p style="color:var(--text-light); text-align:center; padding:20px;">조회 기록이 없습니다.</p>';
        } catch(pe) { console.error('인기 문서 로드 실패:', pe); }

    } catch(e) {
        console.error('접속 현황 로드 실패:', e);
        document.getElementById('accessStatsTable').innerHTML = '<p style="color:#ef4444; text-align:center; padding:20px;">데이터 로드 실패: ' + e.message + '</p>';
    }
};
