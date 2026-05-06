/* ==========================================
   문서 열기 및 조회수 처리
========================================== */
let currentViewerPost = null;


// ─── 갤러리 라이트박스 ───
window.openGalleryPreview = async function(id) {
    // 📱 모바일: 인라인 아코디언 확장 (현재 리스트 위치에서 바로 펼침)
    if (window.innerWidth <= 768) {
        await toggleInlineExpand(id);
        return;
    }
    // 💻 데스크톱: 기존대로 상세 페이지 이동
    await openPost(id);
};

// 📱 모바일 전용 인라인 확장 (아코디언)
async function toggleInlineExpand(id) {
    var card = document.querySelector('.gallery-card[data-post-id="' + id + '"]');
    if (!card) {
        // data-post-id 속성이 없는 경우 onclick 속성에서 찾기
        var cards = document.querySelectorAll('.gallery-card');
        for (var i = 0; i < cards.length; i++) {
            var oc = cards[i].getAttribute('onclick') || '';
            if (oc.indexOf("'" + id + "'") !== -1) { card = cards[i]; break; }
        }
    }
    if (!card) return;

    // 이미 펼쳐진 동일 카드 → 닫기
    var existing = card.nextElementSibling;
    if (existing && existing.classList.contains('mobile-inline-expand') && existing.getAttribute('data-for') === id) {
        existing.remove();
        card.classList.remove('expanded');
        return;
    }

    // 다른 카드가 펼쳐져 있으면 먼저 닫기
    document.querySelectorAll('.mobile-inline-expand').forEach(function(el) { el.remove(); });
    document.querySelectorAll('.gallery-card.expanded').forEach(function(el) { el.classList.remove('expanded'); });

    // 로딩 표시
    var loader = document.createElement('div');
    loader.className = 'mobile-inline-expand';
    loader.setAttribute('data-for', id);
    loader.innerHTML = '<div style="padding:30px; text-align:center; color:var(--text-light);"><div class="loading-spinner" style="margin:0 auto 12px;"></div>불러오는 중...</div>';
    card.insertAdjacentElement('afterend', loader);
    card.classList.add('expanded');

    try {
        addRecentViewed(id);
        api.post('/api/posts/' + id + '/view').catch(function(){});
        var post = await api.get('/api/posts/' + id);

        // 링크 타입은 새창으로 (인라인 불가)
        if ((post.type === 'link' || post.boardId === 'infra') && post.url) {
            var linkUrl = post.url.trim();
            if (!linkUrl.startsWith('http://') && !linkUrl.startsWith('https://')) linkUrl = 'https://' + linkUrl;
            window.open(linkUrl, '_blank');
            loader.remove();
            card.classList.remove('expanded');
            return;
        }

        // 콘텐츠 생성
        var html = '<div class="mobile-inline-body">';
        var images = [];
        if (post.detailImage) images = post.detailImage.split('|').filter(Boolean);
        else if (post.thumbnail) images = [post.thumbnail];

        // PRODUCT_DESC
        if (post.content && post.content.indexOf('[PRODUCT_DESC]') === 0) {
            images.forEach(function(img) {
                html += '<img src="/api/files/' + encodeURIComponent(img) + '" alt="' + post.title + '" onclick="openLightbox(this.src, \'' + post.title.replace(/'/g, "\\'") + '\')" />';
            });
            var descFiles = post.content.replace('[PRODUCT_DESC]', '').split('|').filter(function(f){return f.trim();});
            descFiles.forEach(function(f) {
                html += '<img src="/api/files/' + encodeURIComponent(f.trim()) + '" alt="설명" onclick="openLightbox(this.src, \'' + post.title.replace(/'/g, "\\'") + '\')" />';
            });
        }
        // PDF - 🚀 토큰 라운드트립 제거, 쿠키 인증으로 직접 로드 (1RTT 절약)
        else if (post.type === 'pdf' && post.fileName) {
            var pdfUrl = '/api/files/' + encodeURIComponent(post.fileName);
            html += '<iframe src="' + pdfUrl + '#toolbar=1&view=FitH" loading="lazy"></iframe>';
            html += '<div class="mobile-inline-actions">';
            html += '<a href="' + pdfUrl + '" download>⬇ 다운로드</a>';
            html += '<a href="' + pdfUrl + '" target="_blank">↗ 전체화면</a>';
            html += '</div>';
        }
        // URL iframe
        else if (post.url && post.url.trim()) {
            var url = post.url.trim();
            var driveMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
            if (driveMatch) {
                html += '<iframe src="https://drive.google.com/file/d/' + driveMatch[1] + '/preview" loading="lazy"></iframe>';
            } else if (url.match(/docs\.google\.com\/(document|spreadsheets|presentation)/)) {
                var vurl = url.replace(/\/edit.*$/, '/preview').replace(/\/view.*$/, '/preview');
                if (vurl.indexOf('/preview') === -1) vurl += '/preview';
                html += '<iframe src="' + vurl + '" loading="lazy"></iframe>';
            } else {
                var finalUrl = url;
                if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) finalUrl = 'https://' + finalUrl;
                html += '<div style="padding:24px;text-align:center;"><a href="' + finalUrl + '" target="_blank" style="padding:12px 24px;background:var(--primary);color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">🔗 바로가기</a></div>';
            }
        }
        // 이미지들 (각 이미지에 detailImageLinks가 있으면 클릭 시 외부 링크로 이동)
        else if (images.length > 0) {
            var mLinks = (post.detailImageLinks || '').split('|');
            images.forEach(function(img, i) {
                var imgTag = '<img src="/api/files/' + encodeURIComponent(img) + '" alt="' + post.title + '" />';
                var u = (mLinks[i] || '').trim();
                if (u) {
                    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
                    html += '<a href="' + encodeURI(u) + '" target="_blank" rel="noopener" style="display:block;">' + imgTag + '</a>';
                } else {
                    html += imgTag.replace('<img ', '<img onclick="openLightbox(this.src, \'' + post.title.replace(/'/g, "\\'") + '\')" ');
                }
            });
        }
        // 텍스트
        else if (post.content) {
            html += '<div class="mobile-inline-text">' + post.content + '</div>';
        }
        else {
            html += '<p style="color:var(--text-light);padding:20px;text-align:center;">등록된 내용이 없습니다.</p>';
        }

        // 부가 정보
        if (post.subInfo) {
            html = '<div class="mobile-inline-subinfo">' + post.subInfo + '</div>' + html;
        }

        // 닫기 버튼
        html += '<button type="button" class="mobile-inline-close" onclick="closeInlineExpand(\'' + id + '\')">▲ 접기</button>';
        html += '</div>';

        loader.innerHTML = html;

        // 살짝 스크롤해서 확장된 내용이 잘 보이게
        setTimeout(function() {
            var rect = loader.getBoundingClientRect();
            if (rect.top < 60) {
                window.scrollBy({ top: rect.top - 60, behavior: 'smooth' });
            }
        }, 100);

        loadDashboardWidgets();
    } catch(e) {
        loader.innerHTML = '<div style="padding:20px;text-align:center;color:var(--red);">로드 실패: ' + e.message + '</div>';
    }
}

window.closeInlineExpand = function(id) {
    var panel = document.querySelector('.mobile-inline-expand[data-for="' + id + '"]');
    if (panel) panel.remove();
    document.querySelectorAll('.gallery-card.expanded').forEach(function(el) { el.classList.remove('expanded'); });
};

window.openLightbox = function(src, title) {
    var overlay = document.getElementById('lightboxOverlay');
    var content = document.getElementById('lightboxContent');
    var titleEl = document.getElementById('lightboxTitle');
    if (!overlay || !content) return;
    content.innerHTML = '<img src="' + src + '" alt="' + (title||'') + '">';
    if (titleEl) titleEl.textContent = title || '';
    overlay.classList.add('show');
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
    // 2. PDF 파일 - 🚀 토큰 라운드트립 제거 (쿠키 인증으로 직접 로드)
    else if (post.type === 'pdf' && post.fileName) {
        var pdfUrl = '/api/files/' + encodeURIComponent(post.fileName);
        html += '<iframe src="' + pdfUrl + '#toolbar=1&navpanes=0&view=Fit" style="width:100%; height:85vh; border:none; border-radius:12px; background:#fff;" loading="lazy"></iframe>';
        html += '<div style="margin-top:12px; display:flex; gap:12px; justify-content:center;">';
        html += '<a href="' + pdfUrl + '" download style="padding:10px 24px; background:var(--primary); color:#fff; border-radius:8px; text-decoration:none; font-weight:600;">⬇ 다운로드</a>';
        html += '<a href="' + pdfUrl + '" target="_blank" style="padding:10px 24px; background:var(--brand-gray); color:#fff; border-radius:8px; text-decoration:none; font-weight:600;">↗ 새창에서 열기</a>';
        html += '</div>';
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
        var dLinks = (post.detailImageLinks || '').split('|');
        detailImgs.forEach(function(img, i) {
            var imgStyle = 'max-width:100%; border-radius:12px; box-shadow:0 2px 12px rgba(0,0,0,0.1); background:#fff; margin-bottom:16px;';
            var imgTag = '<img src="/api/files/' + encodeURIComponent(img) + '" alt="' + post.title + '" style="' + imgStyle + '">';
            var u = (dLinks[i] || '').trim();
            if (u) {
                if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
                html += '<a href="' + encodeURI(u) + '" target="_blank" rel="noopener" style="display:block; cursor:pointer;">' + imgTag + '</a>';
            } else {
                html += imgTag;
            }
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

        // 인프라 카테고리는 썸네일 클릭 시 URL로 바로 이동 (새 탭)
        var isInfra = catName === '인프라' && post.url;
        var clickHandler = isInfra
            ? 'window.open(\'' + (post.url || '').replace(/'/g, "\\'") + '\', \'_blank\', \'noopener\')'
            : 'openGalleryPreview(\'' + post.id + '\')';

        html += '<div class="gallery-card" onclick="' + clickHandler + '">' +
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
        // 🚀 조회수 업데이트는 fire-and-forget, 캐시 무효화도 안 함 (사용자 응답 차단 방지)
        api.post(`/api/posts/${id}/view`).catch(function(){});
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
