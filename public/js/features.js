/* ==========================================
   다크모드
========================================== */
function initDarkMode() {
    const saved = localStorage.getItem('kms-dark-mode');
    if (saved === 'true') {
        document.body.classList.add('dark-mode');
        document.getElementById('darkModeToggle').textContent = '☀️';
    }
}
document.getElementById('darkModeToggle').addEventListener('click', function() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('kms-dark-mode', isDark);
    this.textContent = isDark ? '☀️' : '🌙';
});

/* ==========================================
   즐겨찾기 (localStorage 기반)
========================================== */
function getFavorites() {
    try { return JSON.parse(localStorage.getItem('kms-favorites') || '[]'); } catch { return []; }
}
function saveFavorites(favs) {
    localStorage.setItem('kms-favorites', JSON.stringify(favs));
}
function toggleFavorite(postId, el) {
    let favs = getFavorites();
    const idx = favs.indexOf(postId);
    if (idx > -1) {
        favs.splice(idx, 1);
        el.querySelector('.fav-star').className = 'fav-star';
        el.querySelector('.fav-star').textContent = '☆';
    } else {
        favs.push(postId);
        el.querySelector('.fav-star').className = 'fav-star active';
        el.querySelector('.fav-star').textContent = '⭐';
    }
    saveFavorites(favs);
    renderFavorites();
}

async function renderFavorites() {
    const favs = getFavorites();
    const section = document.getElementById('favoritesSection');
    const list = document.getElementById('favoritesList');
    if (!favs.length) { section.style.display = 'none'; return; }

    const posts = await cachedGet('/api/posts');
    const favPosts = posts.filter(p => favs.includes(p.id));
    if (!favPosts.length) { section.style.display = 'none'; return; }

    section.style.display = 'block';
    list.innerHTML = favPosts.map(p => `
        <div class="quick-item" onclick="openPost('${p.id}')">
            <div class="quick-item-title">⭐ ${p.title}</div>
            <div class="quick-item-meta">${p.date || ''}</div>
        </div>
    `).join('');
}

/* ==========================================
   AI 챗봇 (히스토리 저장 + 빠른 질문)
   ========================================== */
const chatHistory = [];

// 히스토리 복원
function loadChatHistory() {
    try {
        var saved = JSON.parse(sessionStorage.getItem('kms-chat-history') || '[]');
        if (saved.length > 0) {
            var container = document.getElementById('chatMessages');
            saved.forEach(function(msg) {
                if (msg.role === 'user') {
                    container.innerHTML += '<div style="align-self:flex-end; background:var(--primary); color:white; padding:10px 16px; border-radius:12px; border-top-right-radius:4px; font-size:13px; max-width:85%;">' + escapeHtml(msg.content) + '</div>';
                } else {
                    container.innerHTML += '<div style="background:rgba(255,103,32,0.08); padding:12px 16px; border-radius:12px; border-top-left-radius:4px; font-size:13px; max-width:85%; color:var(--text-primary);">' + escapeHtml(msg.content).replace(/\n/g, '<br>') + '</div>';
                }
                chatHistory.push(msg);
            });
            container.scrollTop = container.scrollHeight;
        }
    } catch(e) {}
}
function saveChatHistory() {
    try { sessionStorage.setItem('kms-chat-history', JSON.stringify(chatHistory.slice(-20))); } catch(e) {}
}

function toggleChatbot() {
    const panel = document.getElementById('chatbotPanel');
    const toggle = document.getElementById('chatbotToggle');
    if (panel.style.display === 'none' || panel.style.display === '') {
        panel.style.display = 'flex';
        toggle.innerHTML = '✕';
        toggle.style.background = '#666';
        if (chatHistory.length === 0) loadChatHistory();
        // 빠른 질문 표시
        var container = document.getElementById('chatMessages');
        if (chatHistory.length === 0 && !container.querySelector('.quick-questions')) {
            container.innerHTML += '<div class="quick-questions" style="display:flex; flex-wrap:wrap; gap:6px; padding:4px;">' +
                ['사내 규정 알려줘', '제품 종류가 뭐가 있어?', '연락처 찾아줘', '최근 등록된 문서는?'].map(function(q) {
                    return '<button onclick="quickChat(\'' + q + '\')" style="background:var(--main-bg); border:1px solid var(--border-color); padding:6px 12px; border-radius:16px; font-size:12px; cursor:pointer; color:var(--text-secondary); transition:all 0.2s;" onmouseover="this.style.borderColor=\'var(--primary)\';this.style.color=\'var(--primary)\'" onmouseout="this.style.borderColor=\'var(--border-color)\';this.style.color=\'var(--text-secondary)\'">' + q + '</button>';
                }).join('') + '</div>';
        }
        document.getElementById('chatInput').focus();
    } else {
        panel.style.display = 'none';
        toggle.innerHTML = '💬';
        toggle.style.background = 'var(--primary)';
    }
}

window.quickChat = function(msg) {
    document.getElementById('chatInput').value = msg;
    var quickEl = document.querySelector('.quick-questions');
    if (quickEl) quickEl.remove();
    sendChat();
};

async function sendChat() {
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (!msg) return;

    const container = document.getElementById('chatMessages');

    // 사용자 메시지 표시
    container.innerHTML += `<div style="align-self:flex-end; background:var(--primary); color:white; padding:10px 16px; border-radius:12px; border-top-right-radius:4px; font-size:13px; max-width:85%;">${escapeHtml(msg)}</div>`;
    input.value = '';

    // 로딩 표시
    const loadingId = 'loading-' + Date.now();
    container.innerHTML += `<div id="${loadingId}" style="background:rgba(255,103,32,0.08); padding:12px 16px; border-radius:12px; border-top-left-radius:4px; font-size:13px; max-width:85%; color:var(--text-light);">🤖 답변을 생성하고 있습니다...</div>`;
    container.scrollTop = container.scrollHeight;

    chatHistory.push({ role: 'user', content: msg });

    try {
        const res = await api.post('/api/chat', { message: msg, history: chatHistory.slice(-6) });

        // 로딩 제거
        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) loadingEl.remove();

        // AI 답변 표시
        let answerHtml = escapeHtml(res.answer).replace(/\n/g, '<br>');

        // 관련 문서 링크 추가
        if (res.references && res.references.length > 0) {
            answerHtml += '<div style="margin-top:10px; padding-top:8px; border-top:1px solid rgba(0,0,0,0.1); font-size:12px;">';
            answerHtml += '<div style="font-weight:700; margin-bottom:4px;">📎 관련 문서:</div>';
            res.references.forEach(ref => {
                answerHtml += `<div style="cursor:pointer; color:var(--primary); padding:2px 0;" onclick="toggleChatbot(); goToBoardAndOpen('${ref.boardId}', '${ref.id}')">📄 ${escapeHtml(ref.title)}</div>`;
            });
            answerHtml += '</div>';
        }

        container.innerHTML += `<div style="background:rgba(255,103,32,0.08); padding:12px 16px; border-radius:12px; border-top-left-radius:4px; font-size:13px; max-width:85%; color:var(--text-primary);">${answerHtml}</div>`;

        chatHistory.push({ role: 'assistant', content: res.answer });
        saveChatHistory();

    } catch (err) {
        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) loadingEl.remove();
        container.innerHTML += `<div style="background:rgba(239,68,68,0.1); padding:12px 16px; border-radius:12px; border-top-left-radius:4px; font-size:13px; max-width:85%; color:#ef4444;">죄송합니다. 오류가 발생했습니다. 다시 시도해주세요.</div>`;
    }

    container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/* ==========================================
   최근 본 문서 (localStorage 기반)
========================================== */
function getRecentViewed() {
    try { return JSON.parse(localStorage.getItem('kms-recent') || '[]'); } catch { return []; }
}
function addRecentViewed(postId) {
    let recent = getRecentViewed();
    recent = recent.filter(id => id !== postId);
    recent.unshift(postId);
    if (recent.length > 10) recent = recent.slice(0, 10);
    localStorage.setItem('kms-recent', JSON.stringify(recent));
}

async function renderRecentViewed() {
    const recent = getRecentViewed();
    const section = document.getElementById('recentSection');
    const list = document.getElementById('recentList');
    if (!recent.length) { section.style.display = 'none'; return; }

    const posts = await cachedGet('/api/posts');
    const recentPosts = recent.map(id => posts.find(p => p.id === id)).filter(Boolean).slice(0, 5);
    if (!recentPosts.length) { section.style.display = 'none'; return; }

    section.style.display = 'block';
    list.innerHTML = recentPosts.map(p => `
        <div class="quick-item" onclick="goToBoardAndOpen('${p.boardId}', '${p.id}')" style="border-left-color: var(--brand-gray);">
            <div class="quick-item-title">🕐 ${p.title}</div>
            <div class="quick-item-meta">${p.date || ''}</div>
        </div>
    `).join('');
}

/* ==========================================
   NEW 배지: 사이드바 메뉴에 표시
========================================== */
async function updateNewBadges() {
    try {
        const posts = await cachedGet('/api/posts');
        const boards = await cachedGet('/api/boards');
        const now = new Date();
        boards.forEach(board => {
            const boardPosts = posts.filter(p => p.boardId === board.id);
            const hasNew = boardPosts.some(p => {
                const d = new Date(p.date);
                return (now - d) / (1000*60*60*24) <= 7;
            });
            const menuItem = document.querySelector(`.menu-item[data-page="${board.id}"] .menu-text`);
            if (menuItem) {
                const existing = menuItem.querySelector('.new-badge');
                if (existing) existing.remove();
                if (hasNew) menuItem.insertAdjacentHTML('beforeend', '<span class="new-badge">NEW</span>');
            }
        });
    } catch(e) { /* ignore */ }
}

/* ==========================================
   공지사항
========================================== */
async function loadNoticeCards() {
    const notices = await cachedGet('/api/notices');
    const container = document.getElementById('noticeListContainer');
    if (!container) return;
    container.innerHTML = '';
    if (notices.length === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 40px; color: #999;"><p>📢 등록된 공지사항이 없습니다</p></div>`;
        return;
    }
    notices.forEach(notice => {
        const badgeClass = notice.type === 'urgent' ? 'urgent' : notice.type === 'important' ? 'important' : 'info';
        const badgeText = notice.type === 'urgent' ? '긴급' : notice.type === 'important' ? '중요' : '공지';
        const card = document.createElement('div');
        card.className = 'notice-card';
        card.innerHTML = `
            <div class="notice-card-header"><span class="notice-type ${badgeClass}">${badgeText}</span><span class="notice-card-title">${notice.title}</span></div>
            <div class="notice-card-meta">관리자 | ${notice.date}</div>
        `;
        card.addEventListener('click', () => { showPostModal({title: notice.title, content: notice.content, subInfo: notice.date}, badgeText); });
        container.appendChild(card);
    });
}

/* ==========================================
   연락처
========================================== */
async function loadContacts() {
    const contacts = await cachedGet('/api/contacts');
    const tbody = document.getElementById('contactTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (contacts.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px; color: #999;">등록된 연락처가 없습니다</td></tr>`; return;
    }
    contacts.forEach(contact => {
        let badgeClass = 'active';
        if (contact.status === 'dispatch' || (contact.status || '').includes('파견')) badgeClass = 'dispatch';
        if (contact.status === 'leave' || (contact.status || '').includes('휴직')) badgeClass = 'leave';
        const colors = ['#ff6720', '#53565A', '#10b981', '#f59e0b', '#ef4444', '#ff8547', '#757980'];
        const color = colors[parseInt(contact.id) % colors.length];
        tbody.innerHTML += `
            <tr data-dept="${contact.dept}">
                <td><div style="display: flex; align-items: center; gap: 12px;"><div class="avatar" style="background: ${color};">${(contact.name || '?').substring(0, 1)}</div><span>${contact.name}</span></div></td>
                <td>${contact.position}</td><td>${contact.dept}</td><td>${contact.phone}</td><td>${contact.email}</td>
                <td><span class="status-badge ${badgeClass}">${contact.status === 'active' ? '재직중' : contact.status === 'leave' ? '휴직중' : contact.status === 'dispatch' ? '파견중' : contact.status}</span></td>
            </tr>
        `;
    });
}

/* ==========================================
   조직도 (2D 캔버스 — 자유 배치 + 연결선)
========================================== */
var _orgScale = 1;
var _orgPanX = 0, _orgPanY = 0;
var _orgIsPanning = false, _orgPanStartX = 0, _orgPanStartY = 0;
var _orgNodes = []; // 현재 로드된 노드 데이터
var _orgIsAdmin = false;
var _orgDragNode = null, _orgDragOffX = 0, _orgDragOffY = 0;
var _orgSaveTimer = null;
var NODE_W = 128, NODE_H = 46;

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// 트리 구조 빌드 (자동 레이아웃용)
function _orgBuildTree(data) {
    var map = {};
    var roots = [];
    data.forEach(function(n) { map[n.id] = Object.assign({}, n, { children: [] }); });
    data.forEach(function(n) {
        if (n.parentId && map[n.parentId]) map[n.parentId].children.push(map[n.id]);
        else roots.push(map[n.id]);
    });
    function sortC(node) {
        node.children.sort(function(a,b){ return (parseInt(a.order)||999)-(parseInt(b.order)||999); });
        node.children.forEach(sortC);
    }
    roots.sort(function(a,b){ return (parseInt(a.order)||999)-(parseInt(b.order)||999); });
    roots.forEach(sortC);
    return { roots: roots, map: map };
}

// 겹침 방지 + 행 정렬: 가까운 y값의 노드들을 같은 행으로 묶어 y 스냅 + x 최소간격 확보
function _orgResolveOverlap(data) {
    var MIN_GAP = 15;
    var ROW_SNAP = 40; // 40px 이내 y 차이는 같은 행으로 간주 (NODE_H=46보다 작게)
    var shifted = false;

    // 1) 행 스냅: y 값이 가까운 노드들을 같은 y로 정렬
    var sorted = data.slice().sort(function(a,b) { return (parseInt(a.y)||0) - (parseInt(b.y)||0); });
    var rowId = 0, currentRowY = null, rowMap = {}; // nodeId -> rowId
    var rowYSum = {}, rowCount = {};
    sorted.forEach(function(n) {
        var y = parseInt(n.y)||0;
        if (currentRowY === null || y - currentRowY > ROW_SNAP) {
            rowId++;
            currentRowY = y;
        }
        rowMap[n.id] = rowId;
        rowYSum[rowId] = (rowYSum[rowId]||0) + y;
        rowCount[rowId] = (rowCount[rowId]||0) + 1;
    });
    // 각 행의 평균 y로 스냅
    var rowAvgY = {};
    Object.keys(rowCount).forEach(function(rid) {
        rowAvgY[rid] = Math.round(rowYSum[rid] / rowCount[rid]);
    });
    data.forEach(function(n) {
        var rid = rowMap[n.id];
        var newY = rowAvgY[rid];
        if (String(newY) !== String(n.y)) { n.y = String(newY); shifted = true; }
    });

    // 2) x 겹침 해소: 같은 행 안에서 최소 간격 확보
    var rows = {};
    data.forEach(function(n) {
        var rid = rowMap[n.id];
        if (!rows[rid]) rows[rid] = [];
        rows[rid].push(n);
    });
    Object.keys(rows).forEach(function(rid) {
        var row = rows[rid];
        row.sort(function(a,b) { return (parseInt(a.x)||0) - (parseInt(b.x)||0); });
        for (var i = 1; i < row.length; i++) {
            var prev = row[i-1], cur = row[i];
            var prevRight = (parseInt(prev.x)||0) + NODE_W;
            var curLeft = parseInt(cur.x)||0;
            if (curLeft < prevRight + MIN_GAP) {
                cur.x = String(prevRight + MIN_GAP);
                shifted = true;
            }
        }
    });
    return shifted;
}

// 자동 레이아웃: 트리를 x,y 좌표로 배치
function _orgAutoLayout(data) {
    var tree = _orgBuildTree(data);
    var gapX = 150, gapY = 90;
    var xCounter = { val: 40 };

    function layout(node, depth) {
        if (node.children.length === 0) {
            node.x = xCounter.val;
            node.y = depth * gapY + 40;
            xCounter.val += gapX;
        } else {
            node.children.forEach(function(c) { layout(c, depth + 1); });
            var firstX = node.children[0].x;
            var lastX = node.children[node.children.length - 1].x;
            node.x = Math.round((firstX + lastX) / 2);
            node.y = depth * gapY + 40;
        }
    }
    tree.roots.forEach(function(r, i) { layout(r, 0); });

    // 플랫 리스트로 반환
    var result = [];
    function collect(node) {
        var d = data.find(function(n){ return n.id === node.id; });
        result.push(Object.assign({}, d, { x: String(node.x), y: String(node.y) }));
        node.children.forEach(collect);
    }
    tree.roots.forEach(collect);
    return result;
}

// SVG 연결선 그리기 (버스 스타일: 부모→수평 트렁크→자식들)
function _orgDrawLines(svgEl, data) {
    var html = '';
    var stroke = '#64748b';
    // 부모 id 기준으로 자식들 그룹핑
    var groups = {};
    data.forEach(function(node) {
        if (!node.parentId) return;
        if (!groups[node.parentId]) groups[node.parentId] = [];
        groups[node.parentId].push(node);
    });
    Object.keys(groups).forEach(function(pid) {
        var parent = data.find(function(p){ return p.id === pid; });
        if (!parent) return;
        var allChildren = groups[pid];
        var pxL = parseInt(parent.x)||0;
        var pyT = parseInt(parent.y)||0;
        var px = pxL + NODE_W/2;
        var pyB = pyT + NODE_H;
        var pyMid = pyT + NODE_H/2;

        // 자식 분류: 부모 아래쪽에 있는 자식(below) vs 옆에 나란히 있는 자식(side, 보좌/자문 형태)
        var belowChildren = [];
        var sideChildren = [];
        allChildren.forEach(function(c) {
            var cy = parseInt(c.y)||0;
            var cyMid = cy + NODE_H/2;
            // 자식 수직 중앙이 부모 수직 범위 안에 들어오면 "옆" 배치 (같은 행)
            if (cyMid >= pyT && cyMid <= pyB) {
                sideChildren.push(c);
            } else {
                belowChildren.push(c);
            }
        });

        // ─ 옆 배치 자식: 직각(ㄱ자) 엘보 연결
        sideChildren.forEach(function(c) {
            var cxL = parseInt(c.x)||0;
            var cyT = parseInt(c.y)||0;
            var cyMid = cyT + NODE_H/2;
            if (cxL >= pxL + NODE_W) {
                var x1 = pxL + NODE_W, x2 = cxL;
                var midX = Math.round((x1 + x2) / 2);
                html += '<path d="M'+x1+','+pyMid+' L'+midX+','+pyMid+' L'+midX+','+cyMid+' L'+x2+','+cyMid+'" fill="none" stroke="'+stroke+'" stroke-width="1.5"/>';
            } else if (cxL + NODE_W <= pxL) {
                var x1 = pxL, x2 = cxL + NODE_W;
                var midX = Math.round((x1 + x2) / 2);
                html += '<path d="M'+x1+','+pyMid+' L'+midX+','+pyMid+' L'+midX+','+cyMid+' L'+x2+','+cyMid+'" fill="none" stroke="'+stroke+'" stroke-width="1.5"/>';
            } else {
                var cxC = cxL + NODE_W/2;
                html += '<path d="M'+px+','+pyMid+' L'+cxC+','+cyMid+'" fill="none" stroke="'+stroke+'" stroke-width="1.5"/>';
            }
        });

        // ─ 아래 배치 자식: 기존 버스 스타일
        if (belowChildren.length > 0) {
            var minChildTop = Infinity;
            belowChildren.forEach(function(c) {
                var cy = parseInt(c.y)||0;
                if (cy < minChildTop) minChildTop = cy;
            });
            // busY를 부모 하단에서 고정 오프셋(22px) + 자식보다 10px 위로 제한
            var busY = Math.min(pyB + 22, minChildTop - 10);
            if (busY < pyB + 6) busY = pyB + 6;

            html += '<path d="M'+px+','+pyB+' L'+px+','+busY+'" fill="none" stroke="'+stroke+'" stroke-width="1.5"/>';

            if (belowChildren.length > 1) {
                var xs = belowChildren.map(function(c){ return (parseInt(c.x)||0) + NODE_W/2; });
                xs.push(px);
                var minX = Math.min.apply(null, xs);
                var maxX = Math.max.apply(null, xs);
                html += '<path d="M'+minX+','+busY+' L'+maxX+','+busY+'" fill="none" stroke="'+stroke+'" stroke-width="1.5"/>';
            }

            belowChildren.forEach(function(c) {
                var cx = (parseInt(c.x)||0) + NODE_W/2;
                var cy = parseInt(c.y)||0;
                if (belowChildren.length === 1) {
                    html += '<path d="M'+px+','+busY+' L'+cx+','+busY+' L'+cx+','+cy+'" fill="none" stroke="'+stroke+'" stroke-width="1.5"/>';
                } else {
                    html += '<path d="M'+cx+','+busY+' L'+cx+','+cy+'" fill="none" stroke="'+stroke+'" stroke-width="1.5"/>';
                }
            });
        }
    });
    svgEl.innerHTML = html;
}

// hex 색상 대비 텍스트 (밝으면 검정, 어두우면 흰색)
function _orgContrastText(hex) {
    if (!hex) return '#0f172a';
    var h = hex.replace('#','');
    if (h.length === 3) h = h.split('').map(function(c){return c+c;}).join('');
    var r = parseInt(h.substr(0,2),16), g = parseInt(h.substr(2,2),16), b = parseInt(h.substr(4,2),16);
    var lum = (0.299*r + 0.587*g + 0.114*b) / 255;
    return lum > 0.6 ? '#0f172a' : '#ffffff';
}

// 노드 HTML 생성
function _orgRenderNodes(container, data, editable) {
    var html = '';
    data.forEach(function(node) {
        var isDept = !node.title;
        var x = parseInt(node.x)||0, y = parseInt(node.y)||0;
        var cls = isDept ? 'orgc-dept' : 'orgc-person';
        var colorStyle = '';
        if (node.color) {
            // 사용자 지정 색: 배경 + 대비색 글자
            var textColor = _orgContrastText(node.color);
            colorStyle = ' background:' + node.color + ' !important; background-image:none !important; color:' + textColor + ' !important;';
        }

        html += '<div class="orgc-node ' + cls + '" data-id="' + node.id + '" style="left:'+x+'px; top:'+y+'px; width:'+NODE_W+'px;' + colorStyle + '"';
        if (editable) html += ' onmousedown="orgNodeMouseDown(event, \'' + node.id + '\')" oncontextmenu="orgNodeContextMenu(event, \'' + node.id + '\')" ondblclick="showEditNodeDialog(\'' + node.id + '\')"';
        html += '>';
        if (isDept) {
            html += '<div class="orgc-dept-name">' + escapeHtml(node.name) + '</div>';
        } else {
            html += '<div class="orgc-p-name">' + escapeHtml(node.name) + '</div>';
            html += '<div class="orgc-p-title"' + (node.color ? ' style="color:' + _orgContrastText(node.color) + '; opacity:0.85;"' : '') + '>' + escapeHtml(node.title) + '</div>';
        }
        html += '</div>';
    });
    // 기존 SVG는 유지하고 노드만 교체
    var oldSvg = container.querySelector('svg');
    container.innerHTML = html;
    if (oldSvg) container.insertBefore(oldSvg, container.firstChild);
}

// 캔버스 크기 계산
function _orgCalcCanvasSize(data) {
    var maxX = 800, maxY = 400;
    data.forEach(function(n) {
        var x = (parseInt(n.x)||0) + NODE_W + 50;
        var y = (parseInt(n.y)||0) + NODE_H + 50;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
    });
    return { w: maxX, h: maxY };
}

// ─── 메인 로드 함수 ───
async function loadOrgChart() {
    try {
        var data = await cachedGet('/api/orgchart');
        var canvas = document.getElementById('orgChartCanvas');
        if (!canvas) return;

        if (!data || data.length === 0) {
            canvas.innerHTML = '<div style="text-align:center; padding:60px 20px; color:var(--text-light);"><div style="font-size:48px; margin-bottom:16px;">🏢</div><p style="font-size:16px;">조직도가 등록되지 않았습니다.</p><p style="font-size:13px;">관리자 모드에서 Excel로 등록해주세요.</p></div>';
            return;
        }

        // 좌표가 없으면 자동 레이아웃
        var hasCoords = data.some(function(n){ return n.x && n.y; });
        if (!hasCoords) data = _orgAutoLayout(data);
        _orgResolveOverlap(data);
        _orgNodes = data;

        var size = _orgCalcCanvasSize(data);
        canvas.style.width = size.w + 'px';
        canvas.style.height = size.h + 'px';
        canvas.style.position = 'relative';

        // SVG 레이어 (연결선)
        canvas.innerHTML = '<svg style="position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:0;"></svg>';
        var svg = canvas.querySelector('svg');
        _orgDrawLines(svg, data);

        // 노드 레이어
        _orgRenderNodes(canvas, data, false);
    } catch(e) { console.error('조직도 로드 오류:', e); }
}

// ─── 줌/팬 ───
window.orgChartZoom = function(factor) {
    _orgScale = Math.max(0.3, Math.min(2.5, _orgScale * factor));
    var canvas = document.getElementById('orgChartCanvas');
    if (canvas) canvas.style.transform = 'scale(' + _orgScale + ')';
};
window.orgChartReset = function() {
    _orgScale = 1; _orgPanX = 0; _orgPanY = 0;
    var canvas = document.getElementById('orgChartCanvas');
    if (canvas) canvas.style.transform = 'scale(1)';
    var scroll = document.getElementById('orgChartScrollArea');
    if (scroll) { scroll.scrollLeft = 0; scroll.scrollTop = 0; }
};

// ─── 관리자 캔버스 (드래그 이동 가능) ───
async function loadAdminOrgCanvas() {
    var data = await api.get('/api/orgchart');
    var container = document.getElementById('adminOrgCanvas');
    if (!container) return;

    if (!data || data.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:60px; color:var(--text-light);">조직도 데이터가 없습니다.</div>';
        return;
    }

    var hasCoords = data.some(function(n){ return n.x && n.y; });
    if (!hasCoords) data = _orgAutoLayout(data);
    // 저장된 위치가 현재 박스 크기와 겹치면 자동 보정
    var shifted = _orgResolveOverlap(data);
    _orgNodes = data;
    _orgIsAdmin = true;
    if (shifted) {
        clearTimeout(_orgSaveTimer);
        _orgSaveTimer = setTimeout(_orgSavePositions, 800);
    }

    var size = _orgCalcCanvasSize(data);
    container.style.width = Math.max(size.w, 1200) + 'px';
    container.style.height = Math.max(size.h, 600) + 'px';
    container.style.position = 'relative';

    container.innerHTML = '<svg style="position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:0;"></svg>';
    var svg = container.querySelector('svg');
    _orgDrawLines(svg, data);
    _orgRenderNodes(container, data, true);
}

// ─── 연결선 그리기 모드 ───
var _orgLinkMode = false;
var _orgLinkFrom = null; // 선택된 부모 노드

window.orgToggleLinkMode = function() {
    _orgLinkMode = !_orgLinkMode;
    _orgLinkFrom = null;
    var btn = document.getElementById('orgLinkModeBtn');
    var hint = document.getElementById('orgLinkModeHint');
    var canvas = document.getElementById('adminOrgCanvas');
    if (_orgLinkMode) {
        if (btn) { btn.style.background = '#3b82f6'; btn.style.color = '#fff'; btn.style.borderColor = '#3b82f6'; }
        if (hint) hint.textContent = '① 부모 노드 클릭 → ② 자식 노드 클릭 (우클릭: 연결 해제)';
        if (canvas) canvas.classList.add('org-link-mode');
    } else {
        if (btn) { btn.style.background = ''; btn.style.color = ''; btn.style.borderColor = ''; }
        if (hint) hint.textContent = '노드를 마우스로 드래그하여 위치 변경';
        if (canvas) {
            canvas.classList.remove('org-link-mode');
            canvas.querySelectorAll('.orgc-node').forEach(function(n) { n.classList.remove('org-link-selected'); });
        }
    }
};

function _orgSetParent(childId, parentId) {
    var child = _orgNodes.find(function(n){ return n.id === childId; });
    if (!child) return;
    child.parentId = parentId || '';
    // 즉시 화면 반영
    var container = document.getElementById('adminOrgCanvas');
    var svg = container && container.querySelector('svg');
    if (svg) _orgDrawLines(svg, _orgNodes);
    // 서버 저장
    api.put('/api/orgchart/reorder', { updates: [{ id: childId, parentId: parentId || '' }] }).then(function() {
        invalidate('/api/orgchart');
    }).catch(function(e) { console.error('연결 저장 실패:', e); alert('연결 저장 실패: ' + e.message); });
}

window.orgNodeContextMenu = function(e, nodeId) {
    if (!_orgIsAdmin) return;
    e.preventDefault();
    var node = _orgNodes.find(function(n){ return n.id === nodeId; });
    if (!node) return;
    if (!node.parentId) { alert('이 노드는 부모와 연결되어 있지 않습니다.'); return; }
    if (confirm('이 노드의 연결을 해제하시겠습니까?')) {
        _orgSetParent(nodeId, '');
    }
};

// 노드 드래그 시작
window.orgNodeMouseDown = function(e, nodeId) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    // 연결선 그리기 모드
    if (_orgLinkMode) {
        var el = e.currentTarget;
        if (!_orgLinkFrom) {
            _orgLinkFrom = nodeId;
            el.classList.add('org-link-selected');
        } else if (_orgLinkFrom === nodeId) {
            // 같은 노드 클릭 시 선택 해제
            el.classList.remove('org-link-selected');
            _orgLinkFrom = null;
        } else {
            // 순환 참조 방지: from이 nodeId의 자손이면 안됨
            var isDescendant = function(ancestorId, descId) {
                var n = _orgNodes.find(function(x){ return x.id === descId; });
                while (n && n.parentId) {
                    if (n.parentId === ancestorId) return true;
                    n = _orgNodes.find(function(x){ return x.id === n.parentId; });
                }
                return false;
            };
            if (isDescendant(nodeId, _orgLinkFrom)) {
                alert('순환 연결은 만들 수 없습니다.');
            } else {
                _orgSetParent(nodeId, _orgLinkFrom);
            }
            // 초기화
            var container = document.getElementById('adminOrgCanvas');
            if (container) container.querySelectorAll('.orgc-node').forEach(function(n) { n.classList.remove('org-link-selected'); });
            _orgLinkFrom = null;
        }
        return;
    }

    var el = e.currentTarget;
    _orgDragNode = { id: nodeId, el: el };
    var rect = el.getBoundingClientRect();
    _orgDragOffX = e.clientX - rect.left;
    _orgDragOffY = e.clientY - rect.top;
    el.style.zIndex = '100';
    el.style.boxShadow = '0 8px 24px rgba(0,0,0,0.2)';
    el.style.cursor = 'grabbing';

    document.addEventListener('mousemove', _orgNodeMouseMove);
    document.addEventListener('mouseup', _orgNodeMouseUp);
};

function _orgNodeMouseMove(e) {
    if (!_orgDragNode) return;
    var container = document.getElementById('adminOrgCanvas');
    var scrollArea = container.parentElement;
    var contRect = container.getBoundingClientRect();
    var newX = Math.max(0, Math.round((e.clientX - contRect.left + scrollArea.scrollLeft - _orgDragOffX)));
    var newY = Math.max(0, Math.round((e.clientY - contRect.top + scrollArea.scrollTop - _orgDragOffY)));
    // 그리드 스냅 (10px)
    newX = Math.round(newX / 10) * 10;
    newY = Math.round(newY / 10) * 10;
    _orgDragNode.el.style.left = newX + 'px';
    _orgDragNode.el.style.top = newY + 'px';
    // 실시간 연결선 업데이트
    var node = _orgNodes.find(function(n){ return n.id === _orgDragNode.id; });
    if (node) { node.x = String(newX); node.y = String(newY); }
    var svg = container.querySelector('svg');
    if (svg) _orgDrawLines(svg, _orgNodes);
}

function _orgNodeMouseUp(e) {
    if (!_orgDragNode) return;
    _orgDragNode.el.style.zIndex = '1';
    _orgDragNode.el.style.boxShadow = '';
    _orgDragNode.el.style.cursor = '';
    // 위치 저장 (디바운스)
    clearTimeout(_orgSaveTimer);
    _orgSaveTimer = setTimeout(_orgSavePositions, 1500);
    _orgDragNode = null;
    document.removeEventListener('mousemove', _orgNodeMouseMove);
    document.removeEventListener('mouseup', _orgNodeMouseUp);
}

function _orgSavePositions() {
    var updates = _orgNodes.map(function(n) { return { id: n.id, x: n.x||'0', y: n.y||'0' }; });
    api.put('/api/orgchart/save-positions', { updates: updates }).then(function() {
        invalidate('/api/orgchart');
    }).catch(function(e) { console.error('위치 저장 실패:', e); });
}

// 자동 정렬 버튼
window.orgAutoArrange = async function() {
    var data = await api.get('/api/orgchart');
    if (!data || data.length === 0) return;
    var laid = _orgAutoLayout(data);
    _orgNodes = laid;
    var updates = laid.map(function(n) { return { id: n.id, x: n.x, y: n.y }; });
    await api.put('/api/orgchart/save-positions', { updates: updates });
    invalidate('/api/orgchart');
    await loadAdminOrgCanvas();
    await loadOrgChart();
    alert('자동 정렬 완료!');
};

/* ==========================================
   UI 헬퍼
========================================== */
document.getElementById('sidebarToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle(window.innerWidth <= 768 ? 'mobile-show' : 'collapsed');
});

function animateCounter(el) {
    if(!el) return;
    const target = parseInt(el.getAttribute('data-target')) || 0;
    let current = 0, step = target / (2000 / 16);
    if(target === 0) { el.textContent = 0; return; }
    const t = setInterval(() => { current += step; if(current >= target) { el.textContent = target; clearInterval(t); } else el.textContent = Math.floor(current); }, 16);
}

document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', function() {
        const targetTab = this.getAttribute('data-tab');
        const parent = this.closest('section');
        parent.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        parent.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
        parent.querySelector(`#${targetTab}`).classList.add('active');
    });
});

const contactSearch = document.getElementById('contactSearch');
const deptFilter = document.getElementById('deptFilter');
function filterContacts() {
    const tbody = document.getElementById('contactTableBody');
    if (!contactSearch || !tbody) return;
    const term = contactSearch.value.toLowerCase();
    const dept = deptFilter ? deptFilter.value : 'all';
    tbody.querySelectorAll('tr').forEach(row => {
        const n = row.cells[0]?.textContent.toLowerCase() || '';
        const d = row.getAttribute('data-dept') || '';
        const deptMatch = dept === 'all' || d.includes(dept) || (dept === 'CEO' && (d === 'CEO' || d === 'CSO' || d === 'COO' || d.startsWith('COO') || d.startsWith('CSO')));
        row.style.display = (n.includes(term) || d.toLowerCase().includes(term)) && deptMatch ? '' : 'none';
    });
}
if (contactSearch) contactSearch.addEventListener('input', filterContacts);
if (deptFilter) deptFilter.addEventListener('change', filterContacts);

let sortDirection = {};
document.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', function() {
        const column = this.getAttribute('data-sort');
        const tbody = this.closest('table').querySelector('tbody');
        const rows = Array.from(tbody.querySelectorAll('tr'));
        sortDirection[column] = !sortDirection[column];
        const direction = sortDirection[column] ? 1 : -1;
        rows.sort((a, b) => {
            let aVal = a.cells[column==='name'?0:column==='position'?1:2].textContent.trim();
            let bVal = b.cells[column==='name'?0:column==='position'?1:2].textContent.trim();
            return aVal.localeCompare(bVal, 'ko') * direction;
        });
        rows.forEach(row => tbody.appendChild(row));
    });
});

/* ==========================================
   개선요청 (무기명)
========================================== */
window.submitSuggestion = async function() {
    const input = document.getElementById('suggestionInput');
    const content = (input.value || '').trim();
    if (!content) return alert('내용을 입력해주세요.');
    if (content.length < 5) return alert('5자 이상 입력해주세요.');
    try {
        await api.post('/api/suggestions', { content });
        input.value = '';
        const successEl = document.getElementById('suggestionSuccess');
        if (successEl) {
            successEl.style.display = 'block';
            setTimeout(() => { successEl.style.display = 'none'; }, 4000);
        }
    } catch(e) {
        alert('제출 실패: ' + (e.message || '오류가 발생했습니다.'));
    }
};

const scrollTop = document.getElementById('scrollTop');
window.addEventListener('scroll', () => { scrollTop.classList.toggle('show', window.scrollY > 300); });
if (scrollTop) scrollTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
