// Mini Social Media Platform — Backend
// Pure Node.js (no external dependencies) so it runs with just: node server.js
//
// Features:
//  - User registration / login (salted+hashed passwords, cookie sessions)
//  - User profiles (bio, avatar initial, post count, followers/following)
//  - Posts (create, feed, like/unlike)
//  - Comments on posts
//  - Follow / unfollow system

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const db = require('./db');

const PORT = process.env.PORT || 3001;
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------- In-memory sessions ----------
const sessions = new Map(); // sid -> { userId | null }

function newSessionId() {
  return crypto.randomBytes(24).toString('hex');
}
function getSessionId(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  let sid = cookies.sid;
  if (!sid || !sessions.has(sid)) {
    sid = newSessionId();
    sessions.set(sid, { userId: null });
    res.setHeader('Set-Cookie', `sid=${sid}; HttpOnly; Path=/; SameSite=Lax`);
  }
  return sid;
}
function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    out[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return out;
}

// ---------- Password hashing (built-in crypto, no bcrypt needed) ----------
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(check));
}

// ---------- Helpers ----------
function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = '';
    req.on('data', (c) => {
      chunks += c;
      if (chunks.length > 2e6) req.destroy();
    });
    req.on('end', () => {
      if (!chunks) return resolve({});
      try {
        resolve(JSON.parse(chunks));
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
function serveStatic(req, res, pathname) {
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}

function publicUser(u, viewerId) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    bio: u.bio || '',
    createdAt: u.createdAt,
    followerCount: db.getFollowers(u.id).length,
    followingCount: db.getFollowing(u.id).length,
    postCount: db.getPostsByUser(u.id).length,
    isFollowing: viewerId ? db.isFollowing(viewerId, u.id) : false,
    isSelf: viewerId === u.id,
  };
}

function publicPost(p, viewerId) {
  const author = db.getUserById(p.userId);
  return {
    id: p.id,
    content: p.content,
    createdAt: p.createdAt,
    likeCount: (p.likes || []).length,
    likedByMe: viewerId ? (p.likes || []).includes(viewerId) : false,
    commentCount: db.getCommentsByPost(p.id).length,
    author: author ? { id: author.id, name: author.name, username: author.username } : null,
  };
}

// ---------- Route handlers ----------
async function handleApi(req, res, pathname, query) {
  const sid = getSessionId(req, res);
  const session = sessions.get(sid);
  const viewerId = session.userId;

  function requireAuth() {
    return !!viewerId;
  }

  // ----- Auth -----
  if (pathname === '/api/register' && req.method === 'POST') {
    const body = await readBody(req);
    const { name, username, email, password, bio } = body;
    if (!name || !username || !email || !password) {
      return sendJSON(res, 400, { error: 'name, username, email and password are required' });
    }
    if (password.length < 6) return sendJSON(res, 400, { error: 'Password must be at least 6 characters' });
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return sendJSON(res, 400, { error: 'Username must be 3-20 characters: letters, numbers, underscore only' });
    }
    if (db.getUserByEmail(email)) return sendJSON(res, 409, { error: 'An account with that email already exists' });
    if (db.getUserByUsername(username)) return sendJSON(res, 409, { error: 'That username is taken' });

    const user = {
      id: crypto.randomBytes(8).toString('hex'),
      name,
      username,
      email,
      bio: bio || '',
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    };
    db.createUser(user);
    session.userId = user.id;
    return sendJSON(res, 201, publicUser(user, user.id));
  }

  if (pathname === '/api/login' && req.method === 'POST') {
    const { email, password } = await readBody(req);
    const user = email && db.getUserByEmail(email);
    if (!user || !verifyPassword(password || '', user.passwordHash)) {
      return sendJSON(res, 401, { error: 'Invalid email or password' });
    }
    session.userId = user.id;
    return sendJSON(res, 200, publicUser(user, user.id));
  }

  if (pathname === '/api/logout' && req.method === 'POST') {
    session.userId = null;
    return sendJSON(res, 200, { ok: true });
  }

  if (pathname === '/api/me' && req.method === 'GET') {
    if (!viewerId) return sendJSON(res, 200, null);
    const user = db.getUserById(viewerId);
    return sendJSON(res, 200, user ? publicUser(user, viewerId) : null);
  }

  // ----- Users / Profiles -----
  // GET /api/users/:idOrUsername
  let m = pathname.match(/^\/api\/users\/([^/]+)$/);
  if (m && req.method === 'GET') {
    const key = m[1];
    const user = db.getUserById(key) || db.getUserByUsername(key);
    if (!user) return sendJSON(res, 404, { error: 'User not found' });
    return sendJSON(res, 200, publicUser(user, viewerId));
  }

  // GET /api/users/:id/posts
  m = pathname.match(/^\/api\/users\/([^/]+)\/posts$/);
  if (m && req.method === 'GET') {
    const key = m[1];
    const user = db.getUserById(key) || db.getUserByUsername(key);
    if (!user) return sendJSON(res, 404, { error: 'User not found' });
    const posts = db
      .getPostsByUser(user.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map((p) => publicPost(p, viewerId));
    return sendJSON(res, 200, posts);
  }

  // POST /api/users/:id/follow  (toggles follow/unfollow)
  m = pathname.match(/^\/api\/users\/([^/]+)\/follow$/);
  if (m && req.method === 'POST') {
    if (!requireAuth()) return sendJSON(res, 401, { error: 'Login required' });
    const target = db.getUserById(m[1]);
    if (!target) return sendJSON(res, 404, { error: 'User not found' });
    if (target.id === viewerId) return sendJSON(res, 400, { error: "You can't follow yourself" });
    if (db.isFollowing(viewerId, target.id)) {
      db.unfollow(viewerId, target.id);
    } else {
      db.follow(viewerId, target.id);
    }
    return sendJSON(res, 200, publicUser(target, viewerId));
  }

  // PATCH-like: POST /api/profile  { name, bio }
  if (pathname === '/api/profile' && req.method === 'POST') {
    if (!requireAuth()) return sendJSON(res, 401, { error: 'Login required' });
    const { name, bio } = await readBody(req);
    const patch = {};
    if (typeof name === 'string' && name.trim()) patch.name = name.trim();
    if (typeof bio === 'string') patch.bio = bio.trim();
    const updated = db.updateUser(viewerId, patch);
    return sendJSON(res, 200, publicUser(updated, viewerId));
  }

  // ----- Feed / Posts -----
  // GET /api/feed?scope=all|following
  if (pathname === '/api/feed' && req.method === 'GET') {
    const scope = query.get('scope') || 'all';
    let posts = db.getPosts();
    if (scope === 'following' && viewerId) {
      const followingIds = new Set(db.getFollowing(viewerId));
      followingIds.add(viewerId);
      posts = posts.filter((p) => followingIds.has(p.userId));
    }
    posts = posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((p) => publicPost(p, viewerId));
    return sendJSON(res, 200, posts);
  }

  // POST /api/posts { content }
  if (pathname === '/api/posts' && req.method === 'POST') {
    if (!requireAuth()) return sendJSON(res, 401, { error: 'Login required' });
    const { content } = await readBody(req);
    if (!content || !content.trim()) return sendJSON(res, 400, { error: 'Post content cannot be empty' });
    if (content.length > 500) return sendJSON(res, 400, { error: 'Post is too long (max 500 characters)' });
    const post = {
      id: 'post_' + crypto.randomBytes(8).toString('hex'),
      userId: viewerId,
      content: content.trim(),
      likes: [],
      createdAt: new Date().toISOString(),
    };
    db.createPost(post);
    return sendJSON(res, 201, publicPost(post, viewerId));
  }

  // GET /api/posts/:id
  m = pathname.match(/^\/api\/posts\/([^/]+)$/);
  if (m && req.method === 'GET') {
    const post = db.getPostById(m[1]);
    if (!post) return sendJSON(res, 404, { error: 'Post not found' });
    return sendJSON(res, 200, publicPost(post, viewerId));
  }

  // POST /api/posts/:id/like  (toggle)
  m = pathname.match(/^\/api\/posts\/([^/]+)\/like$/);
  if (m && req.method === 'POST') {
    if (!requireAuth()) return sendJSON(res, 401, { error: 'Login required' });
    const posts = db.getPosts();
    const post = posts.find((p) => p.id === m[1]);
    if (!post) return sendJSON(res, 404, { error: 'Post not found' });
    post.likes = post.likes || [];
    const idx = post.likes.indexOf(viewerId);
    if (idx === -1) post.likes.push(viewerId);
    else post.likes.splice(idx, 1);
    db.savePosts(posts);
    return sendJSON(res, 200, publicPost(post, viewerId));
  }

  // GET /api/posts/:id/comments
  m = pathname.match(/^\/api\/posts\/([^/]+)\/comments$/);
  if (m && req.method === 'GET') {
    const post = db.getPostById(m[1]);
    if (!post) return sendJSON(res, 404, { error: 'Post not found' });
    const comments = db
      .getCommentsByPost(post.id)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .map((c) => {
        const author = db.getUserById(c.userId);
        return {
          id: c.id,
          content: c.content,
          createdAt: c.createdAt,
          author: author ? { id: author.id, name: author.name, username: author.username } : null,
        };
      });
    return sendJSON(res, 200, comments);
  }

  // POST /api/posts/:id/comments { content }
  if (m && req.method === 'POST') {
    if (!requireAuth()) return sendJSON(res, 401, { error: 'Login required' });
    const post = db.getPostById(m[1]);
    if (!post) return sendJSON(res, 404, { error: 'Post not found' });
    const { content } = await readBody(req);
    if (!content || !content.trim()) return sendJSON(res, 400, { error: 'Comment cannot be empty' });
    const comment = {
      id: 'cmt_' + crypto.randomBytes(8).toString('hex'),
      postId: post.id,
      userId: viewerId,
      content: content.trim(),
      createdAt: new Date().toISOString(),
    };
    db.createComment(comment);
    const author = db.getUserById(viewerId);
    return sendJSON(res, 201, {
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt,
      author: { id: author.id, name: author.name, username: author.username },
    });
  }

  return sendJSON(res, 404, { error: 'Not found' });
}

// ---------- Server ----------
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(parsedUrl.pathname);
  try {
    if (pathname.startsWith('/api/')) {
      await handleApi(req, res, pathname, parsedUrl.searchParams);
    } else {
      serveStatic(req, res, pathname);
    }
  } catch (err) {
    console.error(err);
    sendJSON(res, 500, { error: err.message || 'Internal server error' });
  }
});

server.listen(PORT, () => {
  console.log(`📱 Social platform running at http://localhost:${PORT}`);
});
