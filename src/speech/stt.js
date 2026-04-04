const fs = require('fs').promises;
const https = require('https');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const STT_MODEL = process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo';

const STT_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

async function transcribeAudio(filePath, language = 'en') {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');
  const fileData = await fs.readFile(filePath);
  const fileName = filePath.split(/[\\/]/).pop() || 'audio';

  const boundary = `----WebKitFormBoundary${Date.now()}`;
  const parts = [];

  // field: file
  parts.push(`--${boundary}\r\n`);
  parts.push(`Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`);
  parts.push(`Content-Type: application/octet-stream\r\n\r\n`);

  const preMetadata = Buffer.concat([Buffer.from(parts.join('')), fileData]);
  const postMetadata = [
    '\r\n--' + boundary,
    'Content-Disposition: form-data; name="model"\r\n\r\n' + STT_MODEL,
    '\r\n--' + boundary,
    'Content-Disposition: form-data; name="language"\r\n\r\n' + language,
    `\r\n--${boundary}--\r\n`,
  ].join('');

  const body = Buffer.concat([preMetadata, Buffer.from(postMetadata)]);

  return new Promise((resolve, reject) => {
    const req = https.request(STT_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) throw new Error(parsed.error.message);
          resolve(parsed.text || parsed.transcript || '');
        } catch (e) {
          reject(new Error(`STT failed (${res.statusCode}): ${parsed || e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('STT timed out')); });
    req.write(body);
    req.end();
  });
}

module.exports = { transcribeAudio };
