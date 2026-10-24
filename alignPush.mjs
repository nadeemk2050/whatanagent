// ============================================================================
// 🔔 ALIGNTASKS WEB PUSH — phone / laptop notifications with the app closed
// ============================================================================
// VAPID keys are generated once and kept on disk next to the service account (they are a
// secret: the private key signs every push). Subscriptions live in `alignPushSubs` and are
// pruned automatically when a device unsubscribes (404 / 410 from the push service).
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import webpush from 'web-push';
import { alignDb } from './alignAdmin.mjs';

const APP = 'aligntasks';

function keysFile() {
  const dir = process.env.ALIGN_DATA_DIR || path.join(process.cwd(), '.data');
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { /* read-only fs: fall back to cwd */ }
  return path.join(dir, 'align-vapid.json');
}

let keys = null;
function loadKeys() {
  if (keys) return keys;
  const envPub = process.env.VAPID_PUBLIC_KEY || '';
  const envPriv = process.env.VAPID_PRIVATE_KEY || '';
  if (envPub && envPriv) {
    keys = { publicKey: envPub, privateKey: envPriv };
  } else {
    const file = keysFile();
    try {
      if (fs.existsSync(file)) {
        const j = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (j && j.publicKey && j.privateKey) keys = j;
      }
    } catch (e) { /* regenerate below */ }
    if (!keys) {
      keys = webpush.generateVAPIDKeys();
      try { fs.writeFileSync(file, JSON.stringify(keys, null, 2), 'utf8'); }
      catch (e) { console.warn('[PUSH] could not persist VAPID keys: ' + e.message); }
      console.log('[PUSH] 🔑 Generated new VAPID keys (' + file + ')');
    }
  }
  webpush.setVapidDetails('mailto:admin@whatanagent.local', keys.publicKey, keys.privateKey);
  return keys;
}

export function pushPublicKey() {
  try { return loadKeys().publicKey; } catch (e) { return ''; }
}

const subId = (endpoint) => crypto.createHash('sha1').update(String(endpoint || '')).digest('hex');

export async function savePushSubscription(sub, who = {}) {
  if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) throw new Error('Invalid push subscription.');
  const db = alignDb();
  const id = subId(sub.endpoint);
  const emails = Array.from(new Set([]
    .concat(who.emails || [])
    .concat(who.email ? [who.email] : [])
    .map(e => String(e || '').trim().toLowerCase())
    .filter(Boolean)));
  await db.collection('alignPushSubs').doc(id).set({
    endpoint: sub.endpoint,
    keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    uid: who.uid || '',
    email: emails[0] || '',
    emails,
    name: who.name || '',
    app: APP,
    ua: String(who.ua || '').slice(0, 200),
    updatedAt: Date.now(),
    createdAt: who.createdAt || Date.now()
  }, { merge: true });
  return id;
}

export async function removePushSubscription(endpoint) {
  if (!endpoint) return 0;
  await alignDb().collection('alignPushSubs').doc(subId(endpoint)).delete().catch(() => {});
  return 1;
}

// Send to every device of one person (by board email), or to everybody when no email is given.
export async function sendPush(payload, opts = {}) {
  const out = { sent: 0, failed: 0, pruned: 0, targets: 0 };
  try {
    loadKeys();
    const db = alignDb();
    let q = db.collection('alignPushSubs');
    const email = String(opts.email || '').trim().toLowerCase();
    const snap = email ? await q.where('emails', 'array-contains', email).limit(20).get() : await q.limit(300).get();
    out.targets = snap.size;
    for (const doc of snap.docs) {
      const v = doc.data() || {};
      try {
        await webpush.sendNotification({ endpoint: v.endpoint, keys: v.keys }, JSON.stringify(payload || {}), { TTL: 3600 });
        out.sent++;
      } catch (e) {
        const code = e && e.statusCode;
        if (code === 404 || code === 410) {
          await doc.ref.delete().catch(() => {});
          out.pruned++;
        } else {
          out.failed++;
          console.warn('[PUSH] send failed (' + (code || e.message) + ')');
        }
      }
    }
  } catch (e) {
    console.warn('[PUSH] ' + e.message);
  }
  return out;
}

export function pushReady() {
  try { return !!pushPublicKey(); } catch (e) { return false; }
}
