/* ==========================================
   글로벌 검색 (필터 + 하이라이팅)
========================================== */
var _searchAllPosts = [];
var _searchQuery = '';

function highlightText(text, query) {
    if (!query || !text) return text;
    var escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp('(' + escaped + ')', 'gi'), '<mark style="background:#ffe082; padding:1px 2px; border-radius:2px;">$1</mark>');
}

function renderSearchResults(posts, query) {
    var boardFilter = document.getElementById('searchBoardFilter').value;
    var typeFilter = document.getElementById('searchTypeFilter').value;

    var filtered = posts.filter(function(p) {
        if (boardFilter !== 'all' && p.boardId !== boardFilter) return false;
        if (typeFilter !== 'all' && p.type !== typeFilter) return false;
        return true;
    });

    var countEl = document.getElementById('searchResultCount');
    if (countEl) countEl.textContent = filtered.length + '건';

    var grid = document.getElementById('searchGridContainer');
    if (filtered.length === 0) {
        grid.innerHTML = '<div style="text-align:center; padding:60px; color:var(--text-light);"><div style="font-size:48px; margin-bottom:16px;">🔍</div><p>검색 결과가 없습니다.</p></div>';
        return;
    }

    var typeLabels = { pdf:'PDF', docx:'DOCX', xlsx:'XLSX', pptx:'PPTX', url:'LINK', link:'URL', text:'TEXT', images:'IMG' };
    var html = '<table class="board-table"><thead><tr><th style="width:50px;"></th><th>제목</th><th style="width:100px;">게시판</th><th style="width:80px;">유형</th><th style="width:80px;">날짜</th><th style="width:60px;">조회</th></tr></thead><tbody>';

    filtered.forEach(function(post) {
        var icon = '📋';
        if (post.type === 'pdf') icon = '📕';
        else if (post.type === 'url') icon = '🔗';
        else if (post.type === 'docx') icon = '📄';
        else if (post.type === 'xlsx') icon = '📊';
        else if (post.type === 'pptx') icon = '📑';
        else if (post.type === 'link') icon = '🌐';
        if (post.icon && post.icon.trim()) icon = post.icon;

        var boardName = post._boardName || '';
        var title = highlightText(post.title, query);

        html += '<tr onclick="goToBoardAndOpen(\'' + post.boardId + '\', \'' + post.id + '\')" style="cursor:pointer;">';
        html += '<td class="td-icon"><span class="board-row-icon ' + (post.type || 'text') + '">' + icon + '</span></td>';
        html += '<td class="td-title"><span class="board-row-title">' + title + '</span></td>';
        html += '<td><span class="board-row-badge">' + boardName + '</span></td>';
        html += '<td class="td-type"><span class="board-row-type ' + (post.type || 'text') + '">' + (typeLabels[post.type] || 'TEXT') + '</span></td>';
        html += '<td class="td-date"><span class="board-row-date">' + (post.date || '-') + '</span></td>';
        html += '<td class="td-views"><span class="board-row-views">👁 ' + (post.views || 0) + '</span></td>';
        html += '</tr>';
    });

    html += '</tbody></table>';
    grid.innerHTML = html;
}

document.getElementById('globalSearch').addEventListener('keypress', async function(e) {
    if (e.key === 'Enter') {
        _searchQuery = this.value.trim().toLowerCase();
        if (!_searchQuery) return;

        navigateTo('search-results');
        document.getElementById('searchKeywordDisplay').innerHTML = '<strong>"' + _searchQuery + '"</strong>에 대한 통합 검색 결과입니다.';

        var posts = await api.get('/api/posts?search=' + encodeURIComponent(_searchQuery));
        var boards = await cachedGet('/api/boards');
        var boardsMap = {};
        boards.forEach(function(b) { boardsMap[b.id] = b.name; });
        posts.forEach(function(p) { p._boardName = boardsMap[p.boardId] || '문서'; });
        _searchAllPosts = posts;

        // 게시판 필터 옵션 동적 생성
        var boardSelect = document.getElementById('searchBoardFilter');
        var boardIds = {};
        posts.forEach(function(p) { if (p.boardId) boardIds[p.boardId] = boardsMap[p.boardId] || p.boardId; });
        boardSelect.innerHTML = '<option value="all">전체 게시판</option>';
        Object.keys(boardIds).forEach(function(id) {
            boardSelect.innerHTML += '<option value="' + id + '">' + boardIds[id] + '</option>';
        });

        document.getElementById('searchTypeFilter').value = 'all';
        renderSearchResults(posts, _searchQuery);
    }
});

// 필터 변경 시 재렌더링
document.getElementById('searchBoardFilter').addEventListener('change', function() {
    renderSearchResults(_searchAllPosts, _searchQuery);
});
document.getElementById('searchTypeFilter').addEventListener('change', function() {
    renderSearchResults(_searchAllPosts, _searchQuery);
});
