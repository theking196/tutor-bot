const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');
const { nanoid } = require('nanoid');
const fs = require('fs');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '../../data/tutor.json');
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
const adapter = new FileSync(DB_PATH);
const db = low(adapter);

// ── Schema ──
db.defaults({ users: [], sessions: [] }).write();

// ── Users ──
function getOrCreateUser(chatId, username = '') {
  let user = db.get('users').find({ chatId: String(chatId) }).value();
  if (!user) {
    user = { chatId: String(chatId), username, curriculum: null, progress: {}, createdAt: new Date().toISOString() };
    db.get('users').push(user).write();
  }
  return user;
}

function updateUser(chatId, patch) {
  return db.get('users').find({ chatId: String(chatId) }).assign(patch).write();
}

function getUser(chatId) {
  return db.get('users').find({ chatId: String(chatId) }).value();
}

// ── Sessions (conversation state) ──
function openSession(chatId, curriculum) {
  const session = {
    id: nanoid(),
    chatId: String(chatId),
    curriculum,
    currentModule: 0,
    currentTopic: 0,
    history: [],           // [{ role, content, ts }]
    quizBuffer: [],        // upcoming questions
    quizScore: { total: 0, correct: 0 },
    weakAreas: [],
    masterAreas: [],
    createdAt: new Date().toISOString(),
  };
  db.get('sessions').push(session).write();
  // Also attach to user for quick lookup
  updateUser(chatId, { sessionId: session.id });
  return session;
}

function getSession(chatId) {
  const userId = String(chatId);
  const s = db.get('sessions').find({ chatId: userId }).value();
  return s || null;
}

function getSessionById(sid) {
  return db.get('sessions').find({ id: sid }).value();
}

function updateSession(chatId, patch) {
  return db.get('sessions').find({ chatId: String(chatId) }).assign(patch).write();
}

function appendHistory(chatId, role, content) {
  const session = getSession(chatId);
  if (!session) return;
  session.history = session.history.slice(-30);  // keep last 30 msgs
  session.history.push({ role, content, ts: new Date().toISOString() });
  db.get('sessions').find({ chatId: String(chatId) }).assign({ history: session.history }).write();
}

function recordQuizResult(chatId, correct) {
  const session = getSession(chatId);
  if (!session) return;
  session.quizScore.total += 1;
  if (correct) session.quizScore.correct += 1;
  db.get('sessions').find({ chatId: String(chatId) }).assign({ quizScore: session.quizScore }).write();
}

// ── Helpers ──
function getStats() {
  return {
    users: db.get('users').size().value(),
    sessions: db.get('sessions').size().value(),
  };
}

module.exports = {
  getOrCreateUser,
  updateUser,
  getUser,
  openSession,
  getSession,
  getSessionById,
  updateSession,
  appendHistory,
  recordQuizResult,
  getStats,
  nanoid,
};
