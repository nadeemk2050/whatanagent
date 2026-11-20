// ============================================================================
// 🔐 GDrive Service Centre — secrets at rest + identifiers
// ============================================================================
// Google client secrets and refresh tokens never sit in the database as plain
// text. They are sealed with AES-256-GCM using a key that lives only on this
// server (GDRIVE_SERVICE_KEY, or an auto-generated 0600 key file).
//
// Losing that key means re-entering the credentials; it does NOT lose the
// files already on Google Drive.
// ============================================================================
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DATA_DIR = process.env.CANDL_DATA_DIR || path.resolve(process.cwd(), 'data');
const KEY_FILE = process.env.GDRIVE_KEY_FILE || path.join(DATA_DIR, '.gdrive-service.key');
const PREFIX = 'v1:';

let cachedKey = null;

function loadKey() {
  if (cachedKey) return cachedKey;

  const envKey = String(process.env.GDRIVE_SERVICE_KEY || '').trim();
  if (envKey) {
    // Any length: stretch it to 32 bytes deterministically.
    cachedKey = crypto.scryptSync(envKey, 'whatanagent-gdrive-service', 32);
    return cachedKey;
  }

  try {
    const hex = fs.readFileSync(KEY_FILE, 'utf8').trim();
    if (/^[0-9a-f]{64}$/i.test(hex)) {
      cachedKey = Buffer.from(hex, 'hex');
      return cachedKey;
    }
  } catch (e) { /* not created yet */ }

  fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
  const fresh = crypto.randomBytes(32);
  fs.writeFileSync(KEY_FILE, fresh.toString('hex'), { mode: 0o600 });
  try { fs.chmodSync(KEY_FILE, 0o600); } catch (e) { /* windows */ }
  console.log('[GDRIVE] 🔑 created a new secret key at ' + KEY_FILE + ' — back this file up');
  cachedKey = fresh;
  return cachedKey;
}

/** Seal a secret. Returns "v1:<iv>:<tag>:<ciphertext>" (all base64). */
export function encryptSecret(plain) {
  const value = String(plain == null ? '' : plain);
  if (!value) return '';
  const key = loadKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

/** Open a sealed secret. Returns '' when the value is not sealed (legacy plain). */
export function decryptSecret(sealed) {
  const value = String(sealed == null ? '' : sealed);
  if (!value) return '';
  if (!value.startsWith(PREFIX)) return value;
  try {
    const [ivB64, tagB64, dataB64] = value.slice(PREFIX.length).split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', loadKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  } catch (e) {
    console.warn('[GDRIVE] could not decrypt a stored secret (wrong key?)');
    return '';
  }
}

export const sha256 = (v) => crypto.createHash('sha256').update(String(v || '')).digest('hex');
export const md5Hex = (buf) => crypto.createHash('md5').update(buf).digest('hex');

/** md5 of a file on disk, streaming (a 2 GB upload must not be read into RAM). */
export function md5File(absPath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(absPath);
    stream.on('data', (d) => hash.update(d));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/** Public API key: shown once, stored only as a hash. */
export function newApiKey() {
  return 'gdk_' + crypto.randomBytes(24).toString('hex');
}

/** Short, human-readable serial used by clients in the x-client-serial header. */
export function newSerial() {
  return 'gdc_' + crypto.randomBytes(6).toString('hex');
}

/** Last 4 characters of a key, safe to show in a table. */
export const keyHint = (key) => '…' + String(key || '').slice(-4);
