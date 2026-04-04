const https = require('https');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || 'theking196/tutor-bot-memory';

function githubRequest(method, path, body = null) {
  const url = new URL(`https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`);
  const headers = {
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'User-Agent': 'tutor-bot',
  };
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json';
  }

  const options = { method, headers, timeout: 15000 };
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(new Error(`Invalid JSON: ${data.slice(0,200)}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Read a file from the GitHub repo.
 * @param {string} path - path inside repo
 * @returns {Promise<string|null>} file content (plain text)
 */
async function githubRead(path) {
  try {
    const res = await githubRequest('GET', path);
    if (res.message === 'Not Found') return null;
    if (res.content) {
      return Buffer.from(res.content, 'base64').toString('utf8');
    }
    throw new Error(res.message || 'Unknown error');
  } catch (e) {
    if (e.message.includes('404')) return null;
    throw e;
  }
}

/**
 * Write a file to the GitHub repo.
 * @param {string} path - path inside repo
 * @param {string} content - plain text content
 */
async function githubWrite(path, content) {
  // First, try to get SHA if file exists
  let sha;
  try {
    const meta = await githubRequest('GET', path);
    if (meta.sha) sha = meta.sha;
  } catch (e) {
    if (!e.message.includes('404')) throw e;
  }

  const payload = {
    message: `Update ${path}`,
    content: Buffer.from(content).toString('base64'),
  };
  if (sha) payload.sha = sha;

  await githubRequest('PUT', path, payload);
}

module.exports = { githubRead, githubWrite, GITHUB_REPO };
