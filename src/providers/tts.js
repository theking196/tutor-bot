const https = require('https');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');

const TTS_PROVIDERS = {
  elevenlabs: {
    url: (voiceId) => `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    defaultVoiceId: 'pNInz6obpgDQGcFmaJgB',
    authHeader: (key) => ({ 'xi-api-key': key }),
    buildBody: (text) => JSON.stringify({
      text,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      model_id: 'eleven_monolingual_v1',
    }),
    parseResponse: async (res) => {
      if (res.statusCode !== 200) throw new Error(`ElevenLabs ${res.statusCode}`);
      return res; // pipe directly to file
    },
  },
  openai: {
    url: 'https://api.openai.com/v1/audio/speech',
    defaultVoice: 'alloy',
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
    buildBody: (text, voice) => JSON.stringify({
      model: 'tts-1',
      input: text,
      voice,
      response_format: 'mp3',
    }),
    parseResponse: async (res) => {
      if (res.statusCode !== 200) throw new Error(`OpenAI TTS ${res.statusCode}`);
      return res; // stream
    },
  },
};

async function synthesize(text, config) {
  const providerName = config?.provider || 'elevenlabs';
  const provider = TTS_PROVIDERS[providerName];
  if (!provider) throw new Error(`Unknown TTS provider: ${providerName}`);

  const apiKey = config?.apiKey || process.env.ELEVEN_API_KEY;
  if (!apiKey) throw new Error(`No API key for ${providerName}`);

  const voiceId = providerName === 'elevenlabs' ? (config?.voiceId || provider.defaultVoiceId) : (config?.voice || provider.defaultVoice);
  const bodyStr = provider.buildBody(text, voiceId);

  return new Promise((resolve, reject) => {
    const url = new URL(provider.url(voiceId));
    const headers = {
      ...provider.authHeader(apiKey),
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(bodyStr),
    };

    const req = https.request(url, { method: 'POST', headers, timeout: 30000 }, async (res) => {
      try {
        await provider.parseResponse(res);
        const tmpFile = path.join(os.tmpdir(), `tts-${Date.now()}.mp3`);
        const file = await fs.createWriteStream(tmpFile);
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve(tmpFile);
        });
      } catch (e) {
        reject(e);
      }
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`${providerName} timeout`)); });
    req.write(bodyStr);
    req.end();
  });
}

module.exports = { synthesize, TTS_PROVIDERS };
