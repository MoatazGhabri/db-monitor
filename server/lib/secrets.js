import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * AES-256-GCM encryption for credentials stored in the platform database.
 * The key comes from DBHUB_SECRET (any string) or, by default, from a random
 * key generated once and stored in <DATA_DIR>/.secret (mode 600).
 */
let key = null;

export function initSecrets(dataDir) {
  if (process.env.DBHUB_SECRET) {
    key = crypto.createHash('sha256').update(process.env.DBHUB_SECRET).digest();
    return 'env';
  }
  const file = path.join(dataDir, '.secret');
  if (fs.existsSync(file)) {
    key = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'hex');
  } else {
    key = crypto.randomBytes(32);
    fs.writeFileSync(file, key.toString('hex'), { mode: 0o600 });
  }
  return 'file';
}

export const isEncrypted = (v) => typeof v === 'string' && v.startsWith('enc:v1:');

export function encrypt(text) {
  if (text === null || text === undefined || text === '') return '';
  if (isEncrypted(text)) return text;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  return `enc:v1:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${data.toString('hex')}`;
}

export function decrypt(value) {
  if (!isEncrypted(value)) return value ?? ''; // legacy plaintext
  const [, , iv, tag, data] = value.split(':');
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Stored credentials cannot be decrypted (the DBHUB_SECRET / .secret key changed). Re-enter the password.');
  }
}
