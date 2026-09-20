const username = new URLSearchParams(window.location.search).get('u');

function flash(type, msg) {
  qs('#flash').innerHTML = `<div class="flash ${type}">${escapeHtml(msg)}</div>`;
}

async function load() {
  if (!username) {
    qs('#profile-root').innerHTML = '<p>No profile specified.</p>';
    return;
  }
  const { ok, data: profile } = await api.get(`/api/users/${encodeURIComponent(username)}`);
  if (!ok) {
    qs('#profile-root').innerHTML = '<p>User not found.</p>';
    return;
  }
  renderProfile(profile);

  const { data: posts } = await api.get(`/api/users/${encodeURIComponent(username)}/posts`);
  renderPosts(qs('#posts-root'), posts);
  wirePostInteractions(qs('#posts-root'));
}

function renderProfile(p) {
  const editBlock = p.isSelf
    ? `
    <div class="profile-actions">
      <button class="btn btn-outline" id="edit-btn">Edit Profile</button>
    </div>
    <form id="edit-form" style="display:none; margin-top:14px;">
      <div class="field">
        <label for="edit-name">Name</label>
        <input type="text" id="edit-name" value="${escapeHtml(p.name)}" />
      </div>
      <div class="field">
        <label for="edit-bio">Bio</label>
        <textarea id="edit-bio" rows="3" maxlength="200">${escapeHtml(p.bio)}</textarea>
      </div>
      <button class="btn btn-primary" type="submit">Save</button>
    </form>`
    : `
    <div class="profile-actions">
      <button class="btn ${p.isFollowing ? 'btn-outline following' : 'btn-primary'}" id="follow-btn" data-id="${p.id}">
        ${p.isFollowing ? 'Following' : 'Follow'}
      </button>
    </div>`;

  qs('#profile-root').innerHTML = `
    <div class="profile-header">
      <div class="profile-top">
        <div class="avatar">${initials(p.name)}</div>
        <div class="profile-names">
          <h1>${escapeHtml(p.name)}</h1>
          <div class="username">@${escapeHtml(p.username)}</div>
        </div>
      </div>
      <div class="profile-bio" id="bio-text">${p.bio ? escapeHtml(p.bio) : '<span style="color:var(--muted)">No bio yet.</span>'}</div>
      <div class="profile-stats">
        <span><b>${p.postCount}</b> Posts</span>
        <span><b>${p.followerCount}</b> Followers</span>
        <span><b>${p.followingCount}</b> Following</span>
      </div>
      ${editBlock}
    </div>
  `;

  const followBtn = qs('#follow-btn');
  if (followBtn) {
    followBtn.addEventListener('click', async () => {
      const user = await refreshHeader();
      if (!user) return (window.location.href = '/login.html');
      followBtn.disabled = true;
      const { ok, data } = await api.post(`/api/users/${followBtn.dataset.id}/follow`);
      followBtn.disabled = false;
      if (!ok) return flash('error', data.error || 'Could not update follow status');
      renderProfile(data);
    });
  }

  const editBtn = qs('#edit-btn');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      const form = qs('#edit-form');
      form.style.display = form.style.display === 'none' ? 'block' : 'none';
    });
    qs('#edit-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = qs('#edit-name').value.trim();
      const bio = qs('#edit-bio').value.trim();
      const { ok, data } = await api.post('/api/profile', { name, bio });
      if (!ok) return flash('error', data.error || 'Could not save profile');
      renderProfile(data);
    });
  }
}

load();
