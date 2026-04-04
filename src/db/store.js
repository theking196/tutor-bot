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
  } catch (e) {
    console.error('DB load error:', e.message);
    _cache = { users: [], sessions: [] };
  }
  return _cache;
}

async function saveDB() {
  if (!_cache) return;
  try {
    await githubWrite(`${REPO_PATH}/db.json`, JSON.stringify(_cache, null, 2));
  } catch (e) {
    console.error('DB save error:', e.message);
  }
}

async function setup() {
  try {
    const exists = await githubRead(`${REPO_PATH}/db.json`).catch(() => null);
    if (!exists) {
      await saveDB();
    }
    initialized = true;
  } catch (e) {
    console.error('DB setup failed:', e.message);
    throw e;
  }
}

// Users
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

// Sessions
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

// Stats
async function getStats() {
  const db = await loadDB();
  return { users: db.users.length, sessions: db.sessions.length };
}

module.exports = {
  getOrCreateUser,
  updateUser,
  getUser,
  openSession,
  getSession,
  updateSession,
  appendHistory,
  recordQuizResult,
  getStats,
  initialized,
  setup,
  saveDB,
};