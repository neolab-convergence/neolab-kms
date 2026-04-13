/* ==========================================
   문서 열기 및 조회수 처리
========================================== */
let currentViewerPost = null;


// ─── 갤러리 라이트박스 ───
window.openGalleryPreview = async function(id) {
    // 갤러리에서도 openPost와 동일하게 상세 페이지로 이동
    await openPost(id);
};

// ─── 게시물 상세 페이지 (범용) ───
async function openProductDetail(post, catName) {
    var detailView = document.getElementById('productDetailView');
    var gridContainer = document.getElementById('boardGridContainer');
    var galleryContainer = document.getElementById('boardGalleryContainer');
    var filterArea = document.getElementById('boardFilterContainer');
    var viewToggle = document.getElementById('viewToggle');
    var inlineViewer = document.getElementById('inlineViewer');

    // 기존 콘텐츠 숨기기
    if (gridContainer) gridContainer.style.display = 'none';
    if (galleryContainer) galleryContainer.style.display = 'none';
    if (filterArea) filterArea.parentElement.style.display = 'none';
    if (viewToggle) viewToggle.style.display = 'none';
    if (inlineViewer) inlineViewer.style.display = 'none';

    // 제목
    document.getElementById('productDetailTitle').textContent = post.title;
    document.getElementById('productDetailSub').innerHTML = [catName, post.subInfo, post.date].filter(Boolean).join(' · ') + '&nbsp;&nbsp;<span style="color:var(--text-light);">조회 ' + (post.views || 0) + '</span>' +
        '&nbsp;&nbsp;<button onclick="copyShareLink(\'' + post.id + '\')" style="background:none; border:1px solid var(--border-color); padding:3px 10px; border-radius:6px; cursor:pointer; font-size:12px; color:var(--text-secondary);" title="공유 링크 복사">🔗 공유</button>';

    var contentDiv = document.getElementById('productDetailImages');
    var html = '';

    // 1. 제품 설명 이미지 ([PRODUCT_DESC])
    if (post.content && post.content.startsWith('[PRODUCT_DESC]')) {
        if (post.detailImage) {
            post.detailImage.split('|').filter(Boolean).forEach(function(img) {
                html += '<img src="/api/files/' + encodeURIComponent(img) + '" alt="' + post.title + '" style="max-width:100%; border-radius:12px; box-shadow:0 2px 12px rgba(0,0,0,0.1); background:#fff; margin-bottom:16px;">';
            });
        } else if (post.thumbnail) {
            html += '<img src="/api/files/' + encodeURIComponent(post.thumbnail) + '" alt="' + post.title + '" style="max-width:100%; border-radius:12px; box-shadow:0 2px 12px rgba(0,0,0,0.1); background:#fff;">';
        }
        var descFiles = post.content.replace('[PRODUCT_DESC]', '').split('|');
        descFiles.forEach(function(f) {
            if (f.trim()) {
                html += '<img src="/api/files/' + encodeURIComponent(f.trim()) + '" alt="설명" style="max-width:100%; border-radius:12px; box-shadow:0 2px 12px rgba(0,0,0,0.1); background:#fff;">';
            }
        });
    }
    // 2. PDF 파일
    else if (post.type === 'pdf' && post.fileName) {
        try {
            var tokenRes = await api.post('/api/files/' + encodeURIComponent(post.fileName) + '/token');
            var pdfUrl = '/api/public-files/' + tokenRes.token + '/' + encodeURIComponent(post.fileName);
            html += '<iframe src="' + pdfUrl + '#toolbar=1&navpanes=0&view=Fit" style="width:100%; height:85vh; border:none; border-radius:12px; background:#fff;"></iframe>';
            html += '<div style="margin-top:12px; display:flex; gap:12px; justify-content:center;">';
            html += '<a href="' + pdfUrl + '" download style="padding:10px 24px; background:var(--primary); color:#fff; border-radius:8px; text-decoration:none; font-weight:600;">⬇ 다운로드</a>';
            html += '<a href="' + pdfUrl + '" target="_blank" style="padding:10px 24px; background:var(--brand-gray); color:#fff; border-radius:8px; text-decoration:none; font-weight:600;">↗ 새창에서 열기</a>';
            html += '</div>';
        } catch(e) {
            html += '<p style="color:var(--text-light);">PDF 로드에 실패했습니다.</p>';
        }
    }
    // 3. URL 링크 (Google Drive/Docs 등 임베드 가능)
    else if (post.url && post.url.trim()) {
        var url = post.url.trim();
        var driveMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
        if (driveMatch) {
            html += '<iframe src="https://drive.google.com/file/d/' + driveMatch[1] + '/preview" style="width:100%; height:85vh; border:none; border-radius:12px;"></iframe>';
        } else if (url.match(/docs\.google\.com\/(document|spreadsheets|presentation)/)) {
            var viewerUrl = url.replace(/\/edit.*$/, '/preview').replace(/\/view.*$/, '/preview');
            if (!viewerUrl.includes('/preview')) viewerUrl += '/preview';
            html += '<iframe src="' + viewerUrl + '" style="width:100%; height:85vh; border:none; border-radius:12px;"></iframe>';
        } else {
            var finalUrl = url;
            if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) finalUrl = 'https://' + finalUrl;
            html += '<div style="text-align:center; padding:40px;">';
            html += '<p style="margin-bottom:16px; color:var(--text-secondary);">외부 링크로 연결됩니다.</p>';
            html += '<a href="' + finalUrl + '" target="_blank" style="padding:12px 32px; background:var(--primary); color:#fff; border-radius:8px; text-decoration:none; font-weight:600; font-size:16px;">🔗 바로가기</a>';
            html += '</div>';
        }
    }
    // 4. 상세 이미지가 있는 경우 (detailImage, 파이프 구분 복수)
    else if (post.detailImage) {
        var detailImgs = post.detailImage.split('|').filter(Boolean);
        detailImgs.forEach(function(img) {
            html += '<img src="/api/files/' + encodeURIComponent(img) + '" alt="' + post.title + '" style="max-width:100%; border-radius:12px; box-shadow:0 2px 12px rgba(0,0,0,0.1); background:#fff; margin-bottom:16px;">';
        });
    }
    // 5. 썸네일 이미지만 있는 경우
    else if (post.thumbnail) {
        html += '<img src="/api/files/' + encodeURIComponent(post.thumbnail) + '" alt="' + post.title + '" style="max-width:100%; border-radius:12px; box-shadow:0 2px 12px rgba(0,0,0,0.1); background:#fff;">';
    }
    // 5. 텍스트 내용
    else if (post.content) {
        html += '<div style="padding:24px; background:var(--card-bg); border-radius:12px; border:1px solid var(--border-color); font-size:15px; line-height:1.8; color:var(--text-primary); white-space:pre-wrap;">' + post.content + '</div>';
    }
    // 6. 내용 없음
    else {
        html += '<div style="text-align:center; padding:60px; color:var(--text-light);"><div style="font-size:48px; margin-bottom:16px;">📄</div><p>등록된 내용이 없습니다.</p></div>';
    }

    contentDiv.innerHTML = html;
    detailView.style.display = 'block';

    // 스크롤 맨 위로
    document.querySelector('.content').scrollTo({ top: 0, behavior: 'smooth' });
}

window.closeProductDetail = function() {
    var detailView = document.getElementById('productDetailView');
    var gridContainer = document.getElementById('boardGridContainer');
    var galleryContainer = document.getElementById('boardGalleryContainer');
    var filterArea = document.getElementById('boardFilterContainer');
    var viewToggle = document.getElementById('viewToggle');

    detailView.style.display = 'none';

    // 기존 콘텐츠 복원
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

window.closeLightbox = function() {
    document.getElementById('lightboxOverlay').classList.remove('show');
};

// ESC 키로 라이트박스 닫기
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeLightbox();
});

// ─── 갤러리 뷰 ───
let currentViewMode = 'list';
let currentBoardViewType = 'list';
let currentBoardId = '';
let currentCategoryId = 'all';

window.switchView = function(mode) {
    currentViewMode = mode;
    document.querySelectorAll('.view-toggle-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector('.view-toggle-btn[data-view="' + mode + '"]');
    if (activeBtn) activeBtn.classList.add('active');

    const listContainer = document.getElementById('boardGridContainer');
    const galleryContainer = document.getElementById('boardGalleryContainer');

    if (mode === 'gallery') {
        if (listContainer) listContainer.style.display = 'none';
        if (galleryContainer) galleryContainer.style.display = 'grid';
        // 현재 선택된 카테고리로 갤러리 다시 렌더링
        renderGalleryView(currentBoardId, currentCategoryId);
    } else {
        if (listContainer) listContainer.style.display = 'flex';
        if (galleryContainer) galleryContainer.style.display = 'none';
    }
};

async function renderGalleryView(boardId, categoryId) {
    let url = '/api/posts?boardId=' + boardId;
    if (categoryId && categoryId !== 'all') url += '&categoryId=' + categoryId;
    let posts = await api.get(url);
    const categories = await cachedGet('/api/categories');
    const catMap = {};
    if(categories[boardId]) categories[boardId].forEach(function(c) { catMap[c.id] = c.name; });

    posts = posts.sort(function(a, b) { return (parseInt(a.order) || 999) - (parseInt(b.order) || 999); });

    const container = document.getElementById('boardGalleryContainer');
    if (!container) return;

    if (posts.length === 0) {
        container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:60px; color:var(--text-light);"><div style="font-size:48px; margin-bottom:16px;">&#128237;</div><p>&#46321;&#47197;&#46108; &#44172;&#49884;&#47932;&#51060; &#50630;&#49845;&#45768;&#45796;.</p></div>';
        return;
    }

    var html = '';
    posts.forEach(function(post) {
        var icon = post.icon || '&#128196;';
        var catName = catMap[post.categoryId] || '';
        var thumbHtml = '';
        var bg = post.bgColor || '#ffffff';

        if (post.thumbnail) {
            thumbHtml = '<div class="gallery-thumb" style="background:' + bg + ';"><img style="background:' + bg + ';" data-src="/api/files/' + post.thumbnail + '" alt="' + post.title + '" class="lazy-img" onerror="this.parentElement.innerHTML=\'' + icon + '\'"></div>';
        } else if (post.type === 'pdf' && post.fileName) {
            thumbHtml = '<div class="gallery-thumb pdf-lazy-thumb" data-pdf="/api/files/' + post.fileName + '" style="background:' + bg + '; padding:0; overflow:hidden; position:relative;">' +
                '<div style="display:flex; align-items:center; justify-content:center; width:100%; height:100%; color:#d1d5db; font-size:48px;">📄</div>' +
                '<div style="position:absolute; top:0; left:0; right:0; bottom:0; cursor:pointer;"></div>' +
                '</div>';
        } else if (post.type === 'url') {
            thumbHtml = '<div class="gallery-thumb" style="background:' + bg + '; color:#6b7280;">' + icon + '</div>';
        } else {
            thumbHtml = '<div class="gallery-thumb" style="background:' + bg + ';">' + icon + '</div>';
        }

        html += '<div class="gallery-card" onclick="openGalleryPreview(\'' + post.id + '\')">' +
            thumbHtml +
            '<div class="gallery-info">' +
            '<div class="gallery-title" title="' + post.title + '">' + post.title + '</div>' +
            '<div class="gallery-meta">' +
            '<span class="gallery-badge">' + catName + '</span>' +
            '<span>' + (post.date || '') + '</span>' +
            '</div></div></div>';
    });

    container.innerHTML = html;

    // 이미지 Lazy Loading
    var lazyImgs = container.querySelectorAll('.lazy-img');
    if (lazyImgs.length > 0) {
        var imgObserver = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    var img = entry.target;
                    img.src = img.getAttribute('data-src');
                    img.classList.remove('lazy-img');
                    imgObserver.unobserve(img);
                }
            });
        }, { rootMargin: '200px' });
        lazyImgs.forEach(function(img) { imgObserver.observe(img); });
    }

    // PDF 미리보기 Lazy Loading - 화면에 보이는 것만 로드
    const lazyThumbs = container.querySelectorAll('.pdf-lazy-thumb');
    if (lazyThumbs.length > 0) {
        const observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    const el = entry.target;
                    const pdfUrl = el.getAttribute('data-pdf');
                    if (pdfUrl && !el.dataset.loaded) {
                        el.dataset.loaded = 'true';
                        el.innerHTML = '<iframe src="' + pdfUrl + '#toolbar=0&navpanes=0&scrollbar=0&page=1&view=Fit" style="width:100%; height:100%; border:none; pointer-events:none; background:#fff; background:#fff;"></iframe>' +
                            '<div style="position:absolute; top:0; left:0; right:0; bottom:0; cursor:pointer;"></div>';
                    }
                    observer.unobserve(el);
                }
            });
        }, { rootMargin: '200px' });
        lazyThumbs.forEach(function(el) { observer.observe(el); });
    }
}

// 게시판으로 이동 후 문서 열기
window.goToBoardAndOpen = async function(boardId, postId) {
    const menuItem = document.querySelector('.menu-item[data-page="' + boardId + '"]');
    if (menuItem) {
        menuItem.click();
        setTimeout(function() { openPost(postId); }, 500);
    } else {
        openPost(postId);
    }
};

window.copyShareLink = function(postId) {
    var url = window.location.origin + '/#post/' + postId;
    navigator.clipboard.writeText(url).then(function() {
        alert('공유 링크가 복사되었습니다!\n' + url);
    }).catch(function() {
        prompt('아래 링크를 복사하세요:', url);
    });
};

window.openPost = async function(id) {
    try {
        addRecentViewed(id);
        await api.post(`/api/posts/${id}/view`);
        invalidate('/api/posts');
        const post = await api.get(`/api/posts/${id}`);
        currentViewerPost = post;

        // link 타입 또는 인프라 게시물은 새 창으로 바로 열기
        if ((post.type === 'link' || post.boardId === 'infra') && post.url) {
            var linkUrl = post.url.trim();
            if (!linkUrl.startsWith('http://') && !linkUrl.startsWith('https://')) linkUrl = 'https://' + linkUrl;
            window.open(linkUrl, '_blank');
            return;
        }

        const categories = await cachedGet('/api/categories');
        let catName = '기타';
        if(categories[post.boardId]) {
            const cat = categories[post.boardId].find(c => c.id === post.categoryId);
            if(cat) catName = cat.name;
        }

        // 모든 게시물 → 하위 상세 페이지에서 표시
        await openProductDetail(post, catName);
        // 히스토리에 게시물 상세 추가
        navHistory.push({ type: 'post', page: post.boardId, cat: post.categoryId, postId: post.id });
        backBtn.style.display = 'flex';
        loadDashboardWidgets();
        return;

        // (아래는 더 이상 사용되지 않음 - 호환성을 위해 유지)
        let viewerUrl = null;
        let viewerIcon = '📄';

        if (viewerUrl) {
            showInlineViewer(post, catName, viewerUrl, viewerIcon);
        }

        loadDashboardWidgets();
    } catch(err) { console.error('문서 열기 오류:', err); }
};

function showInlineViewer(post, catName, viewerUrl, icon) {
    const viewer = document.getElementById('inlineViewer');
    const frame = document.getElementById('inlineViewerFrame');

    document.getElementById('inlineViewerTitle').textContent = post.title;
    document.getElementById('inlineViewerMeta').textContent = `${catName} | ${post.date || ''} | 조회 ${post.views || 0}`;
    document.getElementById('inlineViewerIcon').textContent = icon;

    frame.src = viewerUrl;
    viewer.style.display = 'block';

    // 뷰어로 스크롤
    setTimeout(() => {
        viewer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}

function closeInlineViewer() {
    const viewer = document.getElementById('inlineViewer');
    const frame = document.getElementById('inlineViewerFrame');
    frame.src = '';
    viewer.style.display = 'none';
    currentViewerPost = null;
}

function openInNewTab() {
    if (!currentViewerPost) return;
    const frame = document.getElementById('inlineViewerFrame');
    if (frame.src) {
        window.open(frame.src, '_blank');
    }
}
