require('dotenv').config();
const http = require('http');
const { launch } = require('./bot');

const PORT = process.env.PORT || 3000;

// Simple health server
const srv = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', time: Date.now() }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

srv.listen(PORT, () => {
  console.log(`🩺 Health on ${PORT}/health`);
  // Launch Telegram bot
  launch();
});

// graceful shutdown
process.on('SIGINT', () => { srv.close(); process.exit(0); });
process.on('SIGTERM', () => { srv.close(); process.exit(0); });
