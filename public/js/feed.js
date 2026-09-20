let currentScope = 'all';

function flash(type, msg) {
  qs('#flash').innerHTML = `<div class="flash ${type}">${escapeHtml(msg)}</div>`;
}

function renderComposer(user) {
  const root = qs('#composer-root');
  if (!user) {
    root.innerHTML = '';
    return;
  }
  root.innerHTML = `
    <div class="composer">
      <textarea id="post-input" maxlength="500" placeholder="What's happening, ${escapeHtml(user.name.split(' ')[0])}?"></textarea>
      <div class="composer-row">
        <span class="char-count"><span id="char-count">0</span>/500</span>
        <button class="btn btn-primary" id="post-btn">Post</button>
      </div>
    </div>`;

  const textarea = qs('#post-input');
  textarea.addEventListener('input', () => {
    qs('#char-count').textContent = textarea.value.length;
  });

  qs('#post-btn').addEventListener('click', async () => {
    const content = textarea.value.trim();
    if (!content) return;
    const btn = qs('#post-btn');
    btn.disabled = true;
    btn.textContent = 'Posting…';
    const { ok, data } = await api.post('/api/posts', { content });
    btn.disabled = false;
    btn.textContent = 'Post';
    if (!ok) {
      flash('error', data.error || 'Could not create post');
      return;
    }
    textarea.value = '';
    qs('#char-count').textContent = '0';
    loadFeed();
  });
}

async function loadFeed() {
  const { data: posts } = await api.get(`/api/feed?scope=${currentScope}`);
  renderPosts(qs('#feed-root'), posts);
}

qsa('#tabs button').forEach((btn) => {
  btn.addEventListener('click', async () => {
    if (btn.dataset.scope === 'following') {
      const user = await refreshHeader();
      if (!user) {
        flash('error', 'Log in to see posts from people you follow.');
        return;
      }
    }
    qsa('#tabs button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentScope = btn.dataset.scope;
    loadFeed();
  });
});

wirePostInteractions(qs('#feed-root'));

(async function init() {
  const user = await refreshHeader();
  renderComposer(user);
  loadFeed();
})();
