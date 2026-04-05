const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
let key = null;

function getKey() {
  if (key) return key;
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) return null;
  // Derive 32‑byte key from secret
  key = crypto.createHash('sha256').update(secret).digest();
  return key;
}

/**
 * Encrypt plaintext (UTF‑8) → base64(iv)+authTag+ciphertext
 */
function encrypt(text) {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) return text; // no encryption in dev
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipherGCM(ALGO, key, iv);
  let ciphertext = cipher.update(text, 'utf8', 'base64');
  ciphertext += cipher.final('base64');
  const authTag = cipher.getAuthTag();
  // Store iv + authTag + ciphertext
  const combined = Buffer.concat([iv, authTag, Buffer.from(ciphertext, 'base64')]);
  return combined.toString('base64');
}

/**
 * Decrypt base64 blob back to plaintext (UTF‑8)
 */
function decrypt(blob) {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) return blob; // stored as plain
  const key = getKey();
  const data = Buffer.from(blob, 'base64');
  const iv = data.slice(0, 12);
  const authTag = data.slice(12, 28);
  const ciphertext = data.slice(28);
  const decipher = crypto.createDecipherGCM(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  let plaintext = decipher.update(ciphertext, null, 'utf8');
  plaintext += decipher.final('utf8');
  return plaintext;
}

module.exports = { encrypt, decrypt, getKey };
