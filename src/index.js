require('dotenv').config();

// Required on startup
const required = ['TELEGRAM_BOT_TOKEN', 'GROQ_API_KEY', 'GITHUB_TOKEN'];
for (const k of required) {
  if (!process.env[k]) {
    console.error(`❌ Missing: ${k}`);
    process.exit(1);
  }
}

const http = require('http');
const db = require('./db/github-store');
const { bot, start } = require('./bot');

const PORT = process.env.PORT || 3000;

// Health server
const srv = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: db.initialized ? 'ok' : 'starting', time: Date.now() }));
  } else {
    res.writeHead(404); res.end();
  }
});

srv.listen(PORT, async () => {
  console.log(`🩺 ${PORT}/health`);
  try {
    await db.setup();
    console.log('✅ GitHub memory initialized');
    start();
  } catch (e) {
    console.error('❌ Failed to init:', e.message);
  }
});

process.on('SIGINT', async () => { await db.saveDB?.(); srv.close(); process.exit(0); });
process.on('SIGTERM', async () => { await db.saveDB?.(); srv.close(); process.exit(0); });
