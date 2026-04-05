const https = require('https');
const fs = require('fs').promises;

const STT_PROVIDERS = {
  'groq-whisper': {
    url: 'https://api.groq.com/openai/v1/audio/transcriptions',
    defaultModel: 'whisper-large-v3-turbo',
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
    buildForm: (filePath, model, language = 'en') => {
      // Simple multipart/form-data with file + model + language
      const boundary = `----boundary${Date.now()}`;
      const formParts = [];

      // file
      formParts.push(`--${boundary}\r\n`);
      formParts.push(`Content-Disposition: form-data; name="file"; filename="${filePath.split(/[\\/]/).pop()}"\r\n`);
      formParts.push(`Content-Type: application/octet-stream\r\n\r\n`);

      // model
      formParts.push(`\r\n--${boundary}\r\n`);
      formParts.push(`Content-Disposition: form-data; name="model"\r\n\r\n${model}\r\n`);

      // language
      formParts.push(`--${boundary}\r\n`);
      formParts.push(`Content-Disposition: form-data; name="language"\r\n\r\n${language}\r\n`);

      formParts.push(`--${boundary}--\r\n`);

      return { boundary, parts: formParts };
    },
    parseResponse: (resBody) => {
      if (resBody.error) throw new Error(resBody.error.message);
      return resBody.text || resBody.transcript || '';
    },
  },
  'openai-whisper': {
    url: 'https://api.openai.com/v1/audio/transcriptions',
    defaultModel: 'whisper-1',
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
    buildForm: (filePath, model, language = 'en') => {
      const boundary = `----boundary${Date.now()}`;
      const formParts = [];

      formParts.push(`--${boundary}\r\n`);
      formParts.push(`Content-Disposition: form-data; name="file"; filename="${filePath.split(/[\\/]/).pop()}"\r\n`);
      formParts.push(`Content-Type: application/octet-stream\r\n\r\n`);

      formParts.push(`\r\n--${boundary}\r\n`);
      formParts.push(`Content-Disposition: form-data; name="model"\r\n\r\n${model}\r\n`);

      formParts.push(`--${boundary}\r\n`);
      formParts.push(`Content-Disposition: form-data; name="language"\r\n\r\n${language}\r\n`);

      formParts.push(`--${boundary}--\r\n`);

      return { boundary, parts: formParts };
    },
    parseResponse: (resBody) => {
      if (resBody.error) throw new Error(resBody.error.message);
      return resBody.text || '';
    },
  },
};

async function transcribe(filePath, config) {
  const providerName = config?.provider || 'groq-whisper';
  const provider = STT_PROVIDERS[providerName];
  if (!provider) throw new Error(`Unknown STT provider: ${providerName}`);

  const apiKey = config?.apiKey || process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error(`No API key for ${providerName}`);

  const model = config?.model || provider.defaultModel;
  const { boundary, parts } = provider.buildForm(filePath, model, config?.language);

  const fileData = await fs.readFile(filePath);
  // Build buffer: pre-file parts + file + post parts
  const pre = Buffer.from(parts[0] + parts[1] + parts[2], 'utf8');
  const mid = fileData;
  const post = Buffer.from(parts.slice(3).join(''), 'utf8');
  const body = Buffer.concat([pre, mid, post]);

  return new Promise((resolve, reject) => {
    const url = new URL(provider.url);
    const headers = {
      ...provider.authHeader(apiKey),
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length,
      timeout: 30000,
    };

    const req = https.request(url, { method: 'POST', headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(provider.parseResponse(parsed));
        } catch (e) {
          reject(new Error(`STT parse error (${res.statusCode}): ${data.slice(0,200)}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`${providerName} timeout`)); });
    req.write(body);
    req.end();
  });
}

module.exports = { transcribe, STT_PROVIDERS };
