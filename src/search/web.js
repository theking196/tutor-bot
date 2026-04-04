const https = require('https');
const { URL } = require('url');

const DDG_ENDPOINT = 'https://api.duckduckgo.com/?q=';

/**
 * Perform a quick web search using DuckDuckGo Instant Answer API.
 * Returns a summary string of results (may contain snippets).
 */
async function webSearch(query, maxResults = 3) {
  const encoded = encodeURIComponent(query.trim());
  const url = `${DDG_ENDPOINT}${encoded}&format=json&no_redirect=1&no_html=1`;

  const results = await fetch(url).then(res => {
    if (res.status !== 200) throw new Error(`Search API ${res.status}`);
    return res.json();
  }).catch(err => ({ AbstractText: '', RelatedTopics: [] }));

  let snippets = [];

  if (results.AbstractText) snippets.push(results.AbstractText);
  if (Array.isArray(results.RelatedTopics)) {
    for (const t of results.RelatedTopics.slice(0, maxResults)) {
      if (t.Text) snippets.push(t.Text);
      else if (t.Topics) {
        for (const sub of t.Topics) {
          snippets.push(sub.Text);
        }
      }
    }
  }

  return snippets.join(' | ');
}

/**
 * Fetch the full text from a URL (for deeper research).
 * Basic fetch + text extraction (no heavy parsing).
 */
async function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const { URL } = require('url');
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const lib = isHttps ? https : http;

    const req = lib.get(url, { timeout: 15000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        // Remove HTML tags roughly
        const text = data.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        resolve(text.substring(0, 2000));
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Fetch timeout'));
    });
  });
}

module.exports = { webSearch, fetchUrl };
