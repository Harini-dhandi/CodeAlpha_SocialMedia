const api = {
  async get(url) {
    const res = await fetch(url, { credentials: 'include' });
    return { ok: res.ok, status: res.status, data: await res.json() };
  },
  async post(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    return { ok: res.ok, status: res.status, data: await res.json() };
  },
};

function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}

function initials(name) {
  return (name || '?')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
  return new Date(iso).toLocaleDateString();
}

// Renders the header auth area (login/logout links) on every page.
async function refreshHeader() {
  const { data: user } = await api.get('/api/me');
  const authArea = qs('#auth-area');
  if (authArea) {
    if (user) {
      authArea.innerHTML = `
        <a href="/profile.html?u=${encodeURIComponent(user.username)}">My Profile</a>
        <a href="#" id="logout-link">Logout</a>
      `;
      qs('#logout-link', authArea).addEventListener('click', async (e) => {
        e.preventDefault();
        await api.post('/api/logout');
        window.location.href = '/';
      });
    } else {
      authArea.innerHTML = `<a href="/login.html">Login</a><a href="/register.html">Register</a>`;
    }
  }
  return user;
}

document.addEventListener('DOMContentLoaded', refreshHeader);
