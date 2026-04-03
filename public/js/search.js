/* ==========================================
   글로벌 검색
========================================== */
document.getElementById('globalSearch').addEventListener('keypress', async function(e) {
    if(e.key === 'Enter') {
        const query = this.value.trim().toLowerCase();
        if(!query) return;

        navigateTo('search-results');
        document.getElementById('searchKeywordDisplay').innerHTML = `<strong>"${query}"</strong>에 대한 통합 검색 결과입니다.`;

        const posts = await api.get(`/api/posts?search=${encodeURIComponent(query)}`);
        const grid = document.getElementById('searchGridContainer');
        grid.innerHTML = '';
        if(posts.length === 0) {
            grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #999;">검색 결과가 없습니다.</div>`;
            return;
        }

        const categories = await cachedGet('/api/categories');
        const boardsMap = {};
        (await cachedGet('/api/boards')).forEach(b => boardsMap[b.id] = b.name);

        posts.forEach(post => {
            let catName = '기타';
            if(categories[post.boardId]) {
                const cat = categories[post.boardId].find(c => c.id === post.categoryId);
                if(cat) catName = cat.name;
            }
            let icon = '📋', headerClass = 'general', btnText = '📖 내용 보기';
            if(post.type === 'pdf') { icon = '📕'; headerClass = 'pdf'; btnText = '📄 PDF 열기'; }
            if(post.type === 'url') { icon = '🔗'; headerClass = 'xlsx'; btnText = '🔗 링크 열기'; }
            if(post.type === 'docx') { icon = '📄'; headerClass = 'docx'; btnText = '📄 열기'; }
            if(post.type === 'xlsx') { icon = '📊'; headerClass = 'xlsx'; btnText = '📄 열기'; }
            if(post.type === 'pptx') { icon = '📑'; headerClass = 'pptx'; btnText = '📄 열기'; }
            if(post.icon && post.icon.trim() !== '') icon = post.icon;

            const card = document.createElement('div');
            card.className = 'form-card';
            card.innerHTML = `
                <div class="form-card-header ${headerClass}">${icon}</div>
                <div class="form-card-body">
                    <div class="form-title" title="${post.title}">[${boardsMap[post.boardId] || '문서'}] ${post.title}</div>
                    <div class="form-meta"><span class="dept-badge">${catName}</span><span>${post.subInfo || '-'}</span></div>
                    <button type="button" class="download-btn" onclick="openPost('${post.id}')">${btnText}</button>
                </div>
            `;
            grid.appendChild(card);
        });
    }
});
