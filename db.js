// Simple JSON-file "database" layer.
// Swap this module out for a real DB (MongoDB, Postgres, etc.) later without
// touching the rest of the app — every route only talks to db.js.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');

function readJSON(file) {
  const filePath = path.join(DATA_DIR, file);
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  return raw ? JSON.parse(raw) : [];
}
function writeJSON(file, data) {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

module.exports = {
  // ---- Users ----
  getUsers() {
    return readJSON('users.json');
  },
  getUserById(id) {
    return readJSON('users.json').find((u) => u.id === id) || null;
  },
  getUserByEmail(email) {
    return readJSON('users.json').find((u) => u.email.toLowerCase() === email.toLowerCase()) || null;
  },
  getUserByUsername(username) {
    return readJSON('users.json').find((u) => u.username.toLowerCase() === username.toLowerCase()) || null;
  },
  createUser(user) {
    const users = readJSON('users.json');
    users.push(user);
    writeJSON('users.json', users);
    return user;
  },
  updateUser(id, patch) {
    const users = readJSON('users.json');
    const u = users.find((x) => x.id === id);
    if (!u) return null;
    Object.assign(u, patch);
    writeJSON('users.json', users);
    return u;
  },

  // ---- Posts ----
  getPosts() {
    return readJSON('posts.json');
  },
  getPostById(id) {
    return readJSON('posts.json').find((p) => p.id === id) || null;
  },
  getPostsByUser(userId) {
    return readJSON('posts.json').filter((p) => p.userId === userId);
  },
  createPost(post) {
    const posts = readJSON('posts.json');
    posts.push(post);
    writeJSON('posts.json', posts);
    return post;
  },
  savePosts(posts) {
    writeJSON('posts.json', posts);
  },
  deletePost(id) {
    const posts = readJSON('posts.json').filter((p) => p.id !== id);
    writeJSON('posts.json', posts);
  },

  // ---- Comments ----
  getCommentsByPost(postId) {
    return readJSON('comments.json').filter((c) => c.postId === postId);
  },
  createComment(comment) {
    const comments = readJSON('comments.json');
    comments.push(comment);
    writeJSON('comments.json', comments);
    return comment;
  },

  // ---- Follows ----
  getFollows() {
    return readJSON('follows.json');
  },
  isFollowing(followerId, followingId) {
    return readJSON('follows.json').some((f) => f.followerId === followerId && f.followingId === followingId);
  },
  follow(followerId, followingId) {
    const follows = readJSON('follows.json');
    if (!follows.some((f) => f.followerId === followerId && f.followingId === followingId)) {
      follows.push({ followerId, followingId, createdAt: new Date().toISOString() });
      writeJSON('follows.json', follows);
    }
  },
  unfollow(followerId, followingId) {
    const follows = readJSON('follows.json').filter(
      (f) => !(f.followerId === followerId && f.followingId === followingId)
    );
    writeJSON('follows.json', follows);
  },
  getFollowers(userId) {
    return readJSON('follows.json').filter((f) => f.followingId === userId).map((f) => f.followerId);
  },
  getFollowing(userId) {
    return readJSON('follows.json').filter((f) => f.followerId === userId).map((f) => f.followingId);
  },
};
