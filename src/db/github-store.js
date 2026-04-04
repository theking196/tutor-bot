const { nanoid } = require('nanoid');
const { githubRead, githubWrite } = require('./github-api');

const REPO_PATH = 'data';
let _cache = null;
let initialized = false;

async function loadDB() {
  if (_cache) return _cache;
  try {
    const raw = await githubRead(`${REPO_PATH}/db.json`);
    _cache = raw ? JSON.parse(raw) : { users: [], sessions: [] };
  } catch {
    _cache = { users: [], sessions: [] };
  }
  return _cache;
}

async function saveDB() {
  if (!_cache) return;
  await githubWrite(`${REPO_PATH}/db.json`, JSON.stringify(_cache, null, 2));
}

async function setup() {
  // Ensure the data directory and initial file
  const exists = await githubRead(`${REPO_PATH}/db.json`).catch(() => null);
  if (!exists) {
    await githubWrite(`${REPO_PATH}/db.json`, JSON.stringify({ users: [], sessions: [] }, null, 2));
  }
  initialized = true;
}

// ── Users ──
async function getOrCreateUser(chatId, username = '') {
  const db = await loadDB();
  let user = db.users.find(u => u.chatId === String(chatId));
  if (!user) {
    user = { chatId: String(chatId), username, voiceEnabled: true, createdAt: new Date().toISOString() };
    db.users.push(user);
    await saveDB();
  }
  return user;
}

async function updateUser(chatId, patch) {
  const db = await loadDB();
  const user = db.users.find(u => u.chatId === String(chatId));
  if (user) Object.assign(user, patch);
  await saveDB();
  return user;
}

async function getUser(chatId) {
  const db = await loadDB();
  return db.users.find(u => u.chatId === String(chatId)) || null;
}

// ── Sessions ──
async function openSession(chatId, curriculum) {
  const db = await loadDB();
  const session = {
    id: nanoid(),
    chatId: String(chatId),
    curriculum,
    currentModule: 0,
    currentTopic: 0,
    history: [],
    quizBuffer: [],
    quizMode: false,
    quizScore: { total: 0, correct: 0 },
    weakAreas: [],
    masterAreas: [],
    createdAt: new Date().toISOString(),
  };
  db.sessions.push(session);
  await saveDB();
  return session;
}

async function getSession(chatId) {
  const db = await loadDB();
  return db.sessions.find(s => s.chatId === String(chatId)) || null;
}

async function updateSession(chatId, patch) {
  const db = await loadDB();
  const s = db.sessions.find(x => x.chatId === String(chatId));
  if (s) {
    Object.assign(s, patch);
    await saveDB();
  }
  return s;
}

async function appendHistory(chatId, role, content) {
  const db = await loadDB();
  const s = db.sessions.find(x => x.chatId === String(chatId));
  if (!s) return;
  s.history = s.history.slice(-30);
  s.history.push({ role, content, ts: new Date().toISOString() });
  await saveDB();
}

async function recordQuizResult(chatId, correct) {
  const db = await loadDB();
  const s = db.sessions.find(x => x.chatId === String(chatId));
  if (!s) return;
  s.quizScore.total += 1;
  if (correct) s.quizScore.correct += 1;
  await saveDB();
}

// ── Stats ──
async function getStats() {
  const db = await loadDB();
  return { users: db.users.length, sessions: db.sessions.length };
}

module.exports = {
  getOrCreateUser, updateUser, getUser,
  openSession, getSession, updateSession,
  appendHistory, recordQuizResult,
  getStats, setup, initialized: false,
};
