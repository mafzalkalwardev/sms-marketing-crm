const crypto = require('crypto');

function getKey() {
  const key = process.env.MASTER_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!key) {
    throw new Error('MASTER_ENCRYPTION_KEY or JWT_SECRET is required for encryption');
  }
  return crypto.scryptSync(key, 'signalmint-salt', 32);
}

function encryptSecret(value) {
  const key = getKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decryptSecret(encryptedBase64) {
  const key = getKey();
  const data = Buffer.from(encryptedBase64, 'base64');
  const iv = data.subarray(0, 16);
  const tag = data.subarray(16, 32);
  const encrypted = data.subarray(32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

function maskSecret(value) {
  if (!value) return '••••••••••••';
  const str = String(value);
  if (str.length <= 4) return '••••••••••••';
  const last = str.slice(-4);
  return `••••••••••••${last}`;
}

module.exports = { encryptSecret, decryptSecret, maskSecret };
