const crypto = require('crypto');

// A company's OpenAI API key is real, billable credential — it's encrypted at rest
// with AES-256-GCM (not just base64'd) the same way password_hash discipline is
// enforced elsewhere in this app, and it's never sent back to the frontend once saved
// (the Settings screen only ever shows a masked "sk-••••1234" placeholder).
const SECRET = process.env.AI_KEY_ENCRYPTION_SECRET || 'dev-ai-key-encryption-secret-change-me';
const KEY = crypto.createHash('sha256').update(SECRET).digest(); // 32 bytes for AES-256

function encryptApiKey(plainKey) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plainKey, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Store iv + authTag + ciphertext together, base64, so it's one text column.
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decryptApiKey(stored) {
  if (!stored) return null;
  const buf = Buffer.from(stored, 'base64');
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function maskApiKey(plainKey) {
  if (!plainKey || plainKey.length < 8) return null;
  return `${plainKey.slice(0, 3)}${'•'.repeat(Math.max(4, plainKey.length - 7))}${plainKey.slice(-4)}`;
}

module.exports = { encryptApiKey, decryptApiKey, maskApiKey };
