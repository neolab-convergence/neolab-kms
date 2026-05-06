/* ==========================================
   문서 뷰어 (오프라인 데모)
   - 실제 첨부 파일(PDF/이미지)은 없으므로 플레이스홀더 표시
========================================== */
let currentViewerPost = null;
let currentViewMode = 'list';
let currentBoardViewType = 'list';
let currentBoardId = '';
let currentCategoryId = 'all';

// 오프라인 데모용 파일 플레이스홀더
function _demoFilePlaceholder(label, icon) {
    return '<div style="padding:60px 30px; background:linear-gradient(135deg, rgba(255,103,32,0.06), rgba(83,86,90,0.04)); ' +
        'border:2px dashed var(--border-color); border-radius:12px; text-align:center; color:var(--text-secondary);">' +
        '<div style="font-size:64px; margin-bottom:16px;">' + (icon || '📄') + '</div>' +
        '<div style="font-size:18px; font-weight:700; margin-bottom:8px; color:var(--text-primary);">' + (label || '문서 미리보기') + '</div>' +
        '<div style="font-size:13px; line-height:1.6;">오프라인 데모 모드입니다.<br>실제 운영 환경에서는 이 영역에 PDF/이미지 뷰어가 표시됩니다.</div>' +
        '</div>';
}

// 갤러리 클릭 → 데스크톱은 상세, 모바일은 인라인 확장
window.openGalleryPreview = async function(id) {
    if (window.innerWidth <= 768) {
        await toggleInlineExpand(id);
        return;
    }
    await openPost(id);
};

async function toggleInlineExpand(id) {
    var card = document.querySelector('.gallery-card[data-post-id="' + id + '"]');
    if (!card) {
        var cards = document.querySelectorAll('.gallery-card');
        for (var i = 0; i < cards.length; i++) {
            var oc = cards[i].getAttribute('onclick') || '';
            if (oc.indexOf("'" + id + "'") !== -1) { card = cards[i]; break; }
        }
    }
    if (!card) return;

    var existing = card.nextElementSibling;
    if (existing && existing.classList.contains('mobile-inline-expand') && existing.getAttribute('data-for') === id) {
        existing.remove();
        card.classList.remove('expanded');
        return;
    }
    document.querySelectorAll('.mobile-inline-expand').forEach(el => el.remove());
    document.querySelectorAll('.gallery-card.expanded').forEach(el => el.classList.remove('expanded'));

    var loader = document.createElement('div');
    loader.className = 'mobile-inline-expand';
    loader.setAttribute('data-for', id);
    card.insertAdjacentElement('afterend', loader);
    card.classList.add('expanded');

    addRecentViewed(id);
    var post = await api.get('/api/posts/' + id);
    if (!post) { loader.remove(); return; }

    var html = '<div class="mobile-inline-body">';
    if (post.subInfo) html = '<div class="mobile-inline-subinfo">' + post.subInfo + '</div>' + html;

    if (post.type === 'pdf') {
        html += _demoFilePlaceholder('PDF 문서: ' + post.title, '📕');
    } else if ((post.type === 'link' || post.type === 'url') && post.url) {
        var u = post.url.trim();
        if (!u.startsWith('http')) u = 'https://' + u;
        html += '<div style="padding:24px; text-align:center;"><a href="' + u + '" target="_blank" rel="noopener" style="padding:12px 24px; background:var(--primary); color:#fff; border-radius:8px; text-decoration:none; font-weight:600;">🔗 외부 링크 열기</a></div>';
    } else if (post.type === 'images') {
        html += _demoFilePlaceholder('이미지 모음: ' + post.title, '🖼️');
    } else if (post.content) {
        html += '<div class="mobile-inline-text">' + post.content + '</div>';
    } else {
        html += _demoFilePlaceholder(post.title, post.icon || '📄');
    }
    html += '<button type="button" class="mobile-inline-close" onclick="closeInlineExpand(\'' + id + '\')">▲ 접기</button>';
    html += '</div>';
    loader.innerHTML = html;

    setTimeout(function() {
        var rect = loader.getBoundingClientRect();
        if (rect.top < 60) window.scrollBy({ top: rect.top - 60, behavior: 'smooth' });
    }, 100);
}

window.closeInlineExpand = function(id) {
    var panel = document.querySelector('.mobile-inline-expand[data-for="' + id + '"]');
    if (panel) panel.remove();
    document.querySelectorAll('.gallery-card.expanded').forEach(el => el.classList.remove('expanded'));
};

window.openLightbox = function(src, title) {
    var overlay = document.getElementById('lightboxOverlay');
    var content = document.getElementById('lightboxContent');
    var titleEl = document.getElementById('lightboxTitle');
    if (!overlay || !content) return;
    content.innerHTML = '<img src="' + src + '" alt="' + (title || '') + '">';
    if (titleEl) titleEl.textContent = title || '';
    overlay.classList.add('show');
};

window.closeLightbox = function() {
    var ov = document.getElementById('lightboxOverlay');
    if (ov) ov.classList.remove('show');
};

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeLightbox();
});

async function openProductDetail(post, catName) {
    var detailView = document.getElementById('productDetailView');
    var gridContainer = document.getElementById('boardGridContainer');
    var galleryContainer = document.getElementById('boardGalleryContainer');
    var filterArea = document.getElementById('boardFilterContainer');
    var viewToggle = document.getElementById('viewToggle');
    var inlineViewer = document.getElementById('inlineViewer');

    // 모바일 CSS의 !important를 깨기 위해 setProperty 사용
    if (gridContainer) gridContainer.style.setProperty('display', 'none', 'important');
    if (galleryContainer) galleryContainer.style.setProperty('display', 'none', 'important');
    if (filterArea) filterArea.parentElement.style.setProperty('display', 'none', 'important');
    if (viewToggle) viewToggle.style.display = 'none';
    if (inlineViewer) inlineViewer.style.display = 'none';

    document.getElementById('productDetailTitle').textContent = post.title;
    document.getElementById('productDetailSub').innerHTML =
        [catName, post.subInfo, post.date].filter(Boolean).join(' · ') +
        '&nbsp;&nbsp;<span style="color:var(--text-light);">조회 ' + (post.views || 0) + '</span>';

    var contentDiv = document.getElementById('productDetailImages');
    var html = '';

    if (post.type === 'pdf') {
        html += _demoFilePlaceholder('PDF 문서: ' + post.title, '📕');
        if (post.fileName) {
            html += '<div style="margin-top:12px; text-align:center; font-size:12px; color:var(--text-light);">파일: ' + post.fileName + '</div>';
        }
    } else if ((post.type === 'link' || post.type === 'url') && post.url) {
        var u = post.url.trim();
        if (!u.startsWith('http')) u = 'https://' + u;
        html += '<div style="text-align:center; padding:40px;">';
        html += '<p style="margin-bottom:16px; color:var(--text-secondary);">외부 링크로 연결됩니다.</p>';
        html += '<a href="' + u + '" target="_blank" rel="noopener" style="padding:12px 32px; background:var(--primary); color:#fff; border-radius:8px; text-decoration:none; font-weight:600; font-size:16px;">🔗 바로가기</a>';
        html += '</div>';
    } else if (post.type === 'images') {
        html += _demoFilePlaceholder('이미지 모음: ' + post.title, '🖼️');
    } else if (post.content) {
        html += '<div style="padding:24px; background:var(--card-bg); border-radius:12px; border:1px solid var(--border-color); font-size:15px; line-height:1.8; color:var(--text-primary); white-space:pre-wrap;">' + post.content + '</div>';
    } else {
        html += _demoFilePlaceholder(post.title, post.icon || '📄');
    }

    contentDiv.innerHTML = html;
    detailView.style.display = 'block';
    document.querySelector('.content').scrollTo({ top: 0, behavior: 'smooth' });
}

window.closeProductDetail = function() {
    var detailView = document.getElementById('productDetailView');
    var gridContainer = document.getElementById('boardGridContainer');
    var galleryContainer = document.getElementById('boardGalleryContainer');
    var filterArea = document.getElementById('boardFilterContainer');
    var viewToggle = document.getElementById('viewToggle');

    detailView.style.display = 'none';
    if (gridContainer) gridContainer.style.removeProperty('display');
    if (galleryContainer) galleryContainer.style.removeProperty('display');
    if (filterArea) filterArea.parentElement.style.removeProperty('display');
    if (filterArea) filterArea.parentElement.style.display = 'flex';
    if (viewToggle) viewToggle.style.display = 'flex';
    if (currentViewMode === 'gallery') {
        if (gridContainer) gridContainer.style.display = 'none';
        if (galleryContainer) galleryContainer.style.display = 'grid';
    } else {
        if (gridContainer) gridContainer.style.display = 'flex';
        if (galleryContainer) galleryContainer.style.display = 'none';
    }
};

window.switchView = function(mode) {
    currentViewMode = mode;
    document.querySelectorAll('.view-toggle-btn').forEach(b => b.classList.remove('active'));
    var btn = document.querySelector('.view-toggle-btn[data-view="' + mode + '"]');
    if (btn) btn.classList.add('active');
    var listC = document.getElementById('boardGridContainer');
    var galC = document.getElementById('boardGalleryContainer');
    if (mode === 'gallery') {
        if (listC) listC.style.display = 'none';
        if (galC) galC.style.display = 'grid';
        renderGalleryView(currentBoardId, currentCategoryId);
    } else {
        if (listC) listC.style.display = 'flex';
        if (galC) galC.style.display = 'none';
    }
};

async function renderGalleryView(boardId, categoryId) {
    let url = '/api/posts?boardId=' + boardId;
    if (categoryId && categoryId !== 'all') url += '&categoryId=' + categoryId;
    let posts = await api.get(url);
    const categories = await cachedGet('/api/categories');
    const catMap = {};
    if (categories[boardId]) categories[boardId].forEach(c => catMap[c.id] = c.name);
    posts = posts.sort((a, b) => (parseInt(a.order) || 999) - (parseInt(b.order) || 999));

    const container = document.getElementById('boardGalleryContainer');
    if (!container) return;
    if (posts.length === 0) {
        container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:60px; color:var(--text-light);"><div style="font-size:48px; margin-bottom:16px;">📭</div><p>등록된 게시물이 없습니다.</p></div>';
        return;
    }

    var html = '';
    posts.forEach(function(post) {
        var icon = post.icon || '📄';
        var catName = catMap[post.categoryId] || '';
        var bg = post.bgColor || '#f1f5f9';
        // 오프라인 모드: 썸네일 파일 없이 아이콘만
        var thumbHtml = '<div class="gallery-thumb" style="background:' + bg + '; font-size:48px;">' + icon + '</div>';
        html += '<div class="gallery-card" data-post-id="' + post.id + '" onclick="openGalleryPreview(\'' + post.id + '\')">' +
            thumbHtml +
            '<div class="gallery-info">' +
            '<div class="gallery-title" title="' + post.title + '">' + post.title + '</div>' +
            '<div class="gallery-meta">' +
            '<span class="gallery-badge">' + catName + '</span>' +
            '<span>' + (post.date || '') + '</span>' +
            '</div></div></div>';
    });
    container.innerHTML = html;
}

window.goToBoardAndOpen = async function(boardId, postId) {
    if (typeof navigateTo === 'function' && boardId) {
        navigateTo(boardId);
        setTimeout(() => openPost(postId), 300);
    } else {
        openPost(postId);
    }
};

window.copyShareLink = function(postId) {
    var url = window.location.href.split('#')[0] + '#post/' + postId;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => alert('링크가 복사되었습니다:\n' + url)).catch(() => prompt('링크:', url));
    } else {
        prompt('링크:', url);
    }
};

window.openPost = async function(id) {
    try {
        addRecentViewed(id);
        var post = await api.get('/api/posts/' + id);
        if (!post) return;
        currentViewerPost = post;

        if ((post.type === 'link' || post.type === 'url') && post.url) {
            var u = post.url.trim();
            if (!u.startsWith('http')) u = 'https://' + u;
            // 외부 링크는 새 창 — 단, 데모에선 인터넷 없을 수 있으므로 상세도 같이
        }

        const categories = await cachedGet('/api/categories');
        let catName = '기타';
        if (categories[post.boardId]) {
            const cat = categories[post.boardId].find(c => c.id === post.categoryId);
            if (cat) catName = cat.name;
        }

        await openProductDetail(post, catName);
        navHistory.push({ type: 'post', page: post.boardId, cat: post.categoryId, postId: post.id });
        if (backBtn) backBtn.style.display = 'flex';
        loadDashboardWidgets();
    } catch (err) { console.error('문서 열기 오류:', err); }
};

function closeInlineViewer() {
    var v = document.getElementById('inlineViewer');
    if (v) v.style.display = 'none';
}
function openInNewTab() {
    var f = document.getElementById('inlineViewerFrame');
    if (f && f.src) window.open(f.src, '_blank');
}
