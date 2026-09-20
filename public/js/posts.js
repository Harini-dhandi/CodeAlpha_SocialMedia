// Shared between feed.html and profile.html: renders post cards and wires up
// like / comment-toggle / comment-submit interactions via event delegation.

function postCardHTML(p) {
  const author = p.author || { name: 'Unknown', username: 'unknown', id: '' };
  return `
  <div class="post" data-post-id="${p.id}">
    <div class="post-head">
      <div class="avatar small">${initials(author.name)}</div>
      <div>
        <a class="post-author" href="/profile.html?u=${encodeURIComponent(author.username)}">${escapeHtml(author.name)}</a>
        <span class="username">@${escapeHtml(author.username)}</span>
      </div>
      <span class="post-time">${timeAgo(p.createdAt)}</span>
    </div>
    <div class="post-content">${escapeHtml(p.content)}</div>
    <div class="post-actions">
      <button class="action-btn like-btn ${p.likedByMe ? 'liked' : ''}" data-id="${p.id}">
        ${p.likedByMe ? '❤️' : '🤍'} <span class="like-count">${p.likeCount}</span>
      </button>
      <button class="action-btn comment-toggle-btn" data-id="${p.id}">
        💬 <span class="comment-count">${p.commentCount}</span>
      </button>
    </div>
    <div class="comments" id="comments-${p.id}">
      <div class="comment-list">Loading comments…</div>
      <form class="comment-form" data-id="${p.id}">
        <input type="text" placeholder="Write a comment…" maxlength="300" required />
        <button type="submit">Post</button>
      </form>
    </div>
  </div>`;
}

function renderPosts(container, posts) {
  if (posts.length === 0) {
    container.innerHTML = `<div class="empty-state">No posts yet.</div>`;
    return;
  }
  container.innerHTML = posts.map(postCardHTML).join('');
}

// Call once per page load — uses event delegation so re-rendered posts still work.
function wirePostInteractions(container) {
  container.addEventListener('click', async (e) => {
    const likeBtn = e.target.closest('.like-btn');
    if (likeBtn) {
      const user = await refreshHeader();
      if (!user) return (window.location.href = '/login.html');
      const { data } = await api.post(`/api/posts/${likeBtn.dataset.id}/like`);
      likeBtn.classList.toggle('liked', data.likedByMe);
      likeBtn.innerHTML = `${data.likedByMe ? '❤️' : '🤍'} <span class="like-count">${data.likeCount}</span>`;
      return;
    }
    const commentToggle = e.target.closest('.comment-toggle-btn');
    if (commentToggle) {
      const box = qs(`#comments-${commentToggle.dataset.id}`);
      box.classList.toggle('open');
      if (box.classList.contains('open')) loadComments(commentToggle.dataset.id, box);
      return;
    }
  });

  container.addEventListener('submit', async (e) => {
    const form = e.target.closest('.comment-form');
    if (!form) return;
    e.preventDefault();
    const user = await refreshHeader();
    if (!user) return (window.location.href = '/login.html');
    const input = form.querySelector('input');
    const content = input.value.trim();
    if (!content) return;
    const postId = form.dataset.id;
    const { ok, data } = await api.post(`/api/posts/${postId}/comments`, { content });
    if (!ok) return;
    input.value = '';
    const box = qs(`#comments-${postId}`);
    loadComments(postId, box);
    const countEl = container.querySelector(`.comment-toggle-btn[data-id="${postId}"] .comment-count`);
    if (countEl) countEl.textContent = String(parseInt(countEl.textContent, 10) + 1);
  });
}

async function loadComments(postId, box) {
  const { data: comments } = await api.get(`/api/posts/${postId}/comments`);
  const list = box.querySelector('.comment-list');
  if (comments.length === 0) {
    list.innerHTML = `<p style="color:var(--muted); font-size:0.85rem;">No comments yet — be the first!</p>`;
  } else {
    list.innerHTML = comments
      .map(
        (c) => `
      <div class="comment">
        <div class="avatar small">${initials(c.author ? c.author.name : '?')}</div>
        <div class="comment-body">
          <span class="comment-author">${escapeHtml(c.author ? c.author.name : 'Unknown')}</span>${escapeHtml(c.content)}
        </div>
      </div>`
      )
      .join('');
  }
}
