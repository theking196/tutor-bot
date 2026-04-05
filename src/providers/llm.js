const https = require('https');

const PROVIDERS = {
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    defaultModel: 'llama3-70b-8192',
    authHeader: (k) => ({ Authorization: `Bearer ${k}` }),
    mapBody: (msgs, model) => ({ model, messages: msgs, max_tokens: 600, temperature: 0.7 }),
    parse: (b) => { if (b.error) throw new Error(b.error.message); return b.choices?.[0]?.message?.content || ''; },
    envVar: 'GROQ_API_KEY',
  },
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
    authHeader: (k) => ({ Authorization: `Bearer ${k}` }),
    mapBody: (msgs, model) => ({ model, messages: msgs, max_tokens: 600, temperature: 0.7 }),
    parse: (b) => { if (b.error) throw new Error(b.error.message); return b.choices?.[0]?.message?.content || ''; },
    envVar: 'OPENAI_API_KEY',
  },
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-3-haiku-20240307',
    authHeader: (k) => ({ 'x-api-key': k, 'anthropic-version': '2023-06-01' }),
    mapBody: (msgs, model) => {
      const sys = msgs.find(m => m.role === 'system')?.content || '';
      const userMsgs = msgs.filter(m => m.role !== 'system');
      return { model, system: sys, messages: userMsgs, max_tokens: 600 };
    },
    parse: (b) => { if (b.error) throw new Error(b.error.message); return b.content?.find(c => c.type === 'text')?.text || ''; },
    envVar: 'ANTHROPIC_API_KEY',
  },
};

async function callLLM(messages, config) {
  const providerName = config?.provider || 'groq';
  const p = PROVIDERS[providerName];
  if (!p) throw new Error(`Unsupported LLM provider: ${providerName}`);

  const apiKey = config?.apiKey || process.env[p.envVar];
  if (!apiKey) throw new Error(`${providerName} API key missing`);

  const model = config?.model || p.defaultModel;
  const body = p.mapBody(messages, model);
  const bodyStr = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = https.request(p.url, {
      method: 'POST',
      headers: { ...p.authHeader(apiKey), 'Content-Type': 'application/json', 'Content-Length': bodyStr.length },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', (d) => data += d);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(p.parse(parsed));
        } catch (e) {
          reject(new Error(`${providerName} error (${res.statusCode}): ${data.slice(0,200)}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`${providerName} timeout`)); });
    req.write(bodyStr);
    req.end();
  });
}

module.exports = { callLLM, PROVIDERS };
