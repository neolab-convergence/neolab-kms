// ═══ 관리자 게시물 테이블 ═══
var adminPostPage = 1;
const ADMIN_POSTS_PER_PAGE = 15;
var adminEditPostId = null;

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
    posts = posts.sort((a,b) => (parseInt(a.order)||999) - (parseInt(b.order)||999));
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
    const typeLabels = { pdf:'PDF', docx:'DOCX', xlsx:'XLSX', pptx:'PPTX', url:'LINK', text:'TEXT' };

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

    if (postId) {
        title.textContent = '게시물 수정';
        const post = await api.get('/api/posts/' + postId);
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
    }
    toggleWriteFields();
    modal.classList.add('show');
};

window.closeWriteModal = function() { document.getElementById('writeModalOverlay').classList.remove('show'); adminEditPostId = null; };
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
    document.getElementById('postBoardSel').value = post.boardId;
    await updatePostCategoryDropdown();
    setTimeout(function() { document.getElementById('postCatSel').value = post.categoryId; }, 50);
    document.getElementById('postType').value = post.type || 'text';
    togglePostFields();
    document.getElementById('postTitle').value = post.title || '';
    document.getElementById('postIcon').value = post.icon || '';
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
    document.getElementById('editPostIndicator').style.display = 'none';
    document.getElementById('postTitle').value = '';
    document.getElementById('postContent').value = '';
    document.getElementById('postUrl').value = '';
    document.getElementById('postIcon').value = '';
    document.getElementById('postSubInfo').value = '';
    document.getElementById('postFileName').value = '';
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
    document.getElementById('writeUrlGroup').style.display = (type === 'url') ? 'block' : 'none';
    document.getElementById('writeFileGroup').style.display = (['pdf','docx','xlsx','pptx'].includes(type)) ? 'block' : 'none';
    document.getElementById('writeContentGroup').style.display = (type === 'text') ? 'block' : 'none';
    var imagesGroup = document.getElementById('writeImagesGroup');
    if (imagesGroup) imagesGroup.style.display = (type === 'images') ? 'block' : 'none';
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

    let fileName = '';
    const fileInput = document.getElementById('writeFile');
    if (fileInput && fileInput.files.length > 0) {
        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
        const uploadData = await uploadRes.json();
        if (uploadData.error) return alert('파일 업로드 실패: ' + uploadData.error);
        fileName = uploadData.fileName;
    }

    let thumbnail = '';
    const thumbInput = document.getElementById('writeThumb');
    if (thumbInput && thumbInput.files.length > 0) {
        const formData2 = new FormData();
        formData2.append('file', thumbInput.files[0]);
        const thumbRes = await fetch('/api/upload', { method: 'POST', body: formData2 });
        const thumbData = await thumbRes.json();
        if (!thumbData.error) thumbnail = thumbData.fileName;
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
        }
    }
    var detailImage = detailImages.length > 0 ? detailImages.join('|') : '';

    // 이미지 복수 업로드 (type === 'images')
    var imagesInput = document.getElementById('writeImages');
    if (type === 'images' && imagesInput && imagesInput.files.length > 0) {
        var imgNames = [];
        var maxFiles = Math.min(imagesInput.files.length, 10);
        var statusEl = document.getElementById('writeImagesStatus');
        for (var ii = 0; ii < maxFiles; ii++) {
            if (statusEl) statusEl.textContent = '업로드 중... (' + (ii+1) + '/' + maxFiles + ')';
            var imgFd = new FormData();
            imgFd.append('file', imagesInput.files[ii]);
            var imgRes = await fetch('/api/upload', { method: 'POST', body: imgFd });
            var imgData = await imgRes.json();
            if (!imgData.error) imgNames.push(imgData.fileName);
        }
        if (statusEl) statusEl.textContent = '업로드 완료! ' + imgNames.length + '장';
        // 첫 번째를 썸네일, 전체를 detailImage에 저장
        if (imgNames.length > 0 && !thumbnail) thumbnail = imgNames[0];
        if (imgNames.length > 0) detailImage = imgNames.join('|');
    }

    var bgColor = document.getElementById('writeBgColor') ? document.getElementById('writeBgColor').value : '';
    var postData = { boardId: boardId, categoryId: categoryId, title: title, type: type, subInfo: subInfo, url: url, content: content, bgColor: bgColor };
    if (fileName) postData.fileName = fileName;
    if (thumbnail) postData.thumbnail = thumbnail;
    if (detailImage) postData.detailImage = detailImage;

    if (adminEditPostId) {
        await api.put('/api/posts/' + adminEditPostId, postData);
    } else {
        await api.post('/api/posts', postData);
    }

    invalidateAll();
    closeWriteModal();
    loadAdminPostTable();
    alert(adminEditPostId ? '수정되었습니다.' : '등록되었습니다.');
};


// ═══ 조직도 이미지 관리 ═══
window.uploadOrgChartImage = async function() {
    const fileInput = document.getElementById('orgChartFileInput');
    if (!fileInput || !fileInput.files.length) return alert('파일을 선택해주세요.');

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.error) return alert('업로드 실패: ' + data.error);

    // settings에 저장
    await api.put('/api/settings', { orgChartImage: data.fileName });
    invalidateAll();
    alert('조직도가 업로드되었습니다.');
    await loadAdminOrgChart();
    await loadOrgChart();
};

window.deleteOrgChartImage = async function() {
    if (!confirm('조직도 이미지를 삭제하시겠습니까?')) return;
    await api.put('/api/settings', { orgChartImage: '' });
    invalidateAll();
    alert('조직도가 삭제되었습니다.');
    await loadAdminOrgChart();
    await loadOrgChart();
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
async function moveItem(sheetName, items, idx, direction) {
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= items.length) return;
    const a = items[idx], b = items[swapIdx];
    const newItems = [
        { id: a.id, order: b.order || String(swapIdx) },
        { id: b.id, order: a.order || String(idx) }
    ];
    await api.put(`/api/${sheetName}/reorder`, { items: newItems });
    invalidateAll();
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
            var catViewText = catIsGallery ? '🖼️' : '📋';
            html += '<div class="menu-tree-cat">';
            html += '<span style="color:#d1d5db;">├</span>';
            html += '<span class="cat-name">' + cat.name + '</span>';
            html += '<button class="tree-btn" style="' + catViewStyle + ' font-size:11px; padding:2px 6px;" onclick="toggleCatView(\'' + board.id + '\',\'' + cat.id + '\',\'' + (catIsGallery ? 'list' : 'gallery') + '\')" title="' + (catIsGallery ? '갤러리형' : '리스트형') + '">' + catViewText + '</button>';
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
    const name = prompt('새 메뉴 이름을 입력하세요:');
    if (!name || !name.trim()) return;
    const id = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20) || 'menu' + Date.now();
    const viewType = confirm('이 메뉴를 갤러리(이미지) 보기로 설정할까요?\n\n확인 = 갤러리 보기\n취소 = 리스트 보기') ? 'gallery' : 'list';
    (async () => {
        try {
            await api.post('/api/boards', { id: id, name: name.trim(), viewType: viewType });
            invalidateAll(); await renderMenuTree(); await renderSidebarMenus();
        } catch(e) { alert(e.message || '메뉴 추가 실패'); }
    })();
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
    const name = prompt('새 카테고리 이름을 입력하세요:');
    if (!name || !name.trim()) return;
    const id = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20) || 'cat' + Date.now();
    (async () => {
        try {
            await api.post('/api/categories', { id: id, boardId: boardId, name: name.trim() });
            invalidateAll(); await renderMenuTree(); await renderSidebarMenus();
        } catch(e) { alert(e.message || '카테고리 추가 실패'); }
    })();
};

// 카테고리 수정 다이얼로그
window.showEditCatDialog = function(boardId, catId, currentName, currentViewType) {
    editMenuState = { type: 'category', boardId: boardId, catId: catId, viewType: currentViewType || 'list' };
    document.getElementById('editMenuModalTitle').textContent = '카테고리 수정';
    document.getElementById('editMenuName').value = currentName;
    selectEditMenuView(currentViewType || 'list');
    document.getElementById('editMenuModal').classList.add('show');
    document.getElementById('editMenuName').focus();
};

window.submitEditMenu = async function() {
    var name = document.getElementById('editMenuName').value.trim();
    if (!name) return alert('이름을 입력해주세요.');
    try {
        if (editMenuState.type === 'board') {
            await api.put('/api/boards/' + editMenuState.boardId, { name: name, viewType: editMenuState.viewType });
        } else if (editMenuState.type === 'category') {
            await api.put('/api/categories/' + editMenuState.boardId + '/' + editMenuState.catId, { name: name, viewType: editMenuState.viewType });
        }
        invalidateAll();
        await renderMenuTree();
        await renderSidebarMenus();
        closeEditMenuModal();
    } catch(e) { alert(e.message || '수정 실패'); }
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
    const type = document.getElementById('postType').value;
    document.getElementById('postUrlGroup').style.display = ['url','docx','xlsx','pptx'].includes(type) ? 'block' : 'none';
    document.getElementById('postPdfGroup').style.display = type === 'pdf' ? 'block' : 'none';
    document.getElementById('postContentGroup').style.display = type === 'text' ? 'block' : 'none';
};

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

    const postData = { boardId, categoryId, type, title, icon, subInfo,
        content: type === 'text' ? content : '',
        url: ['url','docx','xlsx','pptx'].includes(type) ? url : '',
        fileName: type === 'pdf' ? fileName : ''
    };

    try {
        if (editPostId) {
            await api.put(`/api/posts/${editPostId}`, postData);
            editPostId = null; this.textContent = '게시물 등록'; this.classList.replace('admin-btn-primary', 'admin-btn-success');
        } else {
            await api.post('/api/posts', postData);
        }
        alert('게시물이 저장되었습니다!');
        document.getElementById('postTitle').value = ''; document.getElementById('postContent').value = ''; document.getElementById('postUrl').value = '';
        document.getElementById('postFileName').value = ''; document.getElementById('postPdfFileName').textContent = '';
        invalidateAll(); await loadAdminPosts(); await updateDashboardStats(); await loadDashboardWidgets();
    } catch(err) { alert('저장 실패: ' + err.message); }
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
        contactsListEl.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px; color:var(--text-light);">등록된 연락처가 없습니다.</td></tr>';
        return;
    }

    contactsListEl.innerHTML = filtered.map(c => `
        <tr>
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
    `).join('');
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

/* ── 조직도 관리 (수정 기능 추가) ── */
var editOrgId = null;

async function loadAdminOrgChart() {
    try {
        const settings = await cachedGet('/api/settings');
        const orgFile = settings.orgChartImage || '';
        const previewImg = document.getElementById('orgPreviewImg');
        const previewEmpty = document.getElementById('orgPreviewEmpty');
        if (orgFile) {
            document.getElementById('orgAdminPreview').src = '/api/files/' + orgFile;
            if (previewImg) previewImg.style.display = 'block';
            if (previewEmpty) previewEmpty.style.display = 'none';
        } else {
            if (previewImg) previewImg.style.display = 'none';
            if (previewEmpty) previewEmpty.style.display = 'block';
        }
    } catch(e) { console.error(e); }
}

window.editOrg = async function(id) {
    const orgs = await api.get('/api/orgchart');
    const o = orgs.find(x => x.id === id);
    if (!o) return;
    document.getElementById('orgName').value = o.name || '';
    document.getElementById('orgTitle').value = o.title || '';
    document.getElementById('orgLevel').value = o.level || '6';
    editOrgId = id;
    document.getElementById('editOrgIndicator').style.display = 'inline';
    document.getElementById('addOrgBtn').textContent = '저장';
    document.getElementById('addOrgBtn').classList.replace('admin-btn-success', 'admin-btn-primary');
};

window.cancelEditOrg = function() {
    editOrgId = null;
    document.getElementById('orgName').value = '';
    document.getElementById('orgTitle').value = '';
    document.getElementById('editOrgIndicator').style.display = 'none';
    document.getElementById('addOrgBtn').textContent = '추가';
    document.getElementById('addOrgBtn').classList.replace('admin-btn-primary', 'admin-btn-success');
};

var addOrgBtnEl = document.getElementById('addOrgBtn');
if (addOrgBtnEl) addOrgBtnEl.addEventListener('click', async function() {
    const data = { name: document.getElementById('orgName').value, title: document.getElementById('orgTitle').value, level: document.getElementById('orgLevel').value };
    if (!data.name) return alert('이름을 입력하세요.');
    try {
        if (editOrgId) {
            await api.put(`/api/orgchart/${editOrgId}`, data);
            cancelEditOrg();
        } else {
            await api.post('/api/orgchart', data);
        }
        document.getElementById('orgName').value = ''; document.getElementById('orgTitle').value = '';
        invalidate('/api/orgchart'); await loadAdminOrgChart(); await loadOrgChart();
    } catch(err) { alert('오류: ' + err.message); }
});
window.deleteOrg = async function(id) { if(!confirm('삭제하시겠습니까?')) return; await api.del(`/api/orgchart/${id}`); invalidate('/api/orgchart'); await loadAdminOrgChart(); await loadOrgChart(); };

/* ==========================================
   설정
========================================== */
async function loadAdminSettings() {
    const s = await api.get('/api/settings');
    document.getElementById('companyName').value = s.companyName || 'NeoLab';
}
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
var writeImagesEl = document.getElementById('writeImages');
if (writeImagesEl) writeImagesEl.addEventListener('change', function() {
    var preview = document.getElementById('writeImagesPreview');
    if (!preview) return;
    preview.innerHTML = '';
    var files = this.files;
    if (files.length > 10) {
        alert('최대 10장까지 선택할 수 있습니다.');
        this.value = '';
        return;
    }
    for (var i = 0; i < files.length; i++) {
        var reader = new FileReader();
        reader.onload = function(e) {
            preview.innerHTML += '<img src="' + e.target.result + '" style="max-height:60px; border-radius:6px; border:1px solid var(--border-color);">';
        };
        reader.readAsDataURL(files[i]);
    }
    document.getElementById('writeImagesStatus').textContent = files.length + '장 선택됨';
});

// 문서 보호: 우클릭 방지
document.addEventListener('contextmenu', function(e) {
    if (e.target.closest('.modal-body') || e.target.closest('iframe')) {
        e.preventDefault();
    }
});
