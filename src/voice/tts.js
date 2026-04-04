const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ELEVEN_API_KEY = process.env.ELEVEN_API_KEY || '';
const ELEVEN_VOICE_ID = process.env.ELEVEN_VOICE_ID || 'pNInz6obpgDQGcFmaJgB'; // Adam (default male)

// Temp directory for TTS wav files
const TMP_DIR = os.tmpdir();

/**
 * Convert text to speech via ElevenLabs API.
 * Returns path to a local WAV/MP3 file or null on failure.
 */
async function synthesizeSpeech(text) {
  if (!ELEVEN_API_KEY) return null;  // skip if no key
  if (!text || text.length < 5) return null;

  // Truncate very long text (ElevenLabs limit ~5000 chars)
  const safe = text.length > 3000 ? text.substring(0, 3000) + '…' : text;

  return new Promise((resolve, reject) => {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE_ID}`;
    const data = JSON.stringify({
      text: safe,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      model_id: 'eleven_monolingual_v1',
    });

    const req = https.request(url, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVEN_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      timeout: 30_000,
    }, (res) => {
      if (res.statusCode !== 200) {
        res.on('data', () => {});
        return reject(new Error(`ElevenLabs API error: ${res.statusCode}`));
      }

      const tmpPath = path.join(TMP_DIR, `tts-${Date.now()}.mp3`);
      const file = fs.createWriteStream(tmpPath);

      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(tmpPath);
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('ElevenLabs request timed out (30s)'));
    });
    req.write(data);
    req.end();
  });
}

async function cleanup() {
  // Remove stale TTS files older than 1 hour
  const files = await fs.promises.readdir(TMP_DIR).catch(() => []);
  const now = Date.now();
  for (const f of files) {
    if (!f.startsWith('tts-')) continue;
    const fullPath = path.join(TMP_DIR, f);
    const stat = await fs.promises.stat(fullPath).catch(() => null);
    if (stat && (now - stat.mtimeMs > 3_600_000)) {
      fs.unlink(fullPath).catch(() => {});
    }
  }
}

module.exports = { synthesizeSpeech, cleanup };
