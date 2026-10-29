// ============================================================================
// 📱 AlignTasks — multi-account WhatsApp (send-only)
// ============================================================================
// Every registered AlignTasks account may link ITS OWN WhatsApp number by scanning
// a QR code. The link lives on this server, so closing the app, the laptop or the
// phone does not disconnect it — only "Unlink", the phone removing the device, or
// WhatsApp itself can.
//
// Scope (deliberate): read contacts/groups + SEND messages. No inbox, no AI, no
// auto-replies, no chat history (syncFullHistory: false, no message store) — that
// is what keeps each session around 35-60 MB of RAM.
//
// This module is completely separate from the WhatAnAgent bridge in waWebClient.js:
// its own storage folder, its own sockets, its own routes.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import { alignDb, ALIGN_BASE, alignAdminStatus } from './alignAdmin.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const WA_MULTI_MAX = Math.max(1, Number(process.env.ALIGN_WA_MAX || 4));
const IDLE_MS = Math.max(2 * 60000, Number(process.env.ALIGN_WA_IDLE_MINUTES || 10) * 60000);
const DATA_DIR = process.env.ALIGN_WA_DATA_DIR || path.join(__dirname, 'data', 'align-wa');
const COLLECTION = 'alignWaAccounts';   // root collection, outside the team data tree

const sessions = new Map();   // uid -> { sock, status, qr, phone, name, contacts, lastError, lastUsed, idle, retry }
const log = (...a) => console.log('[ALIGN-WA]', ...a);
const warn = (...a) => console.warn('[ALIGN-WA]', ...a);

const safeId = (uid) => String(uid || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
const authDir = (uid) => path.join(DATA_DIR, safeId(uid));
const hasCreds = (uid) => {
  try { return fs.existsSync(path.join(authDir(uid), 'creds.json')); } catch (e) { return false; }
};
const db = () => alignDb();
const accRef = (uid) => db().collection(COLLECTION).doc(safeId(uid));

function state(uid) {
  const id = safeId(uid);
  if (!sessions.has(id)) {
    sessions.set(id, { sock: null, status: 'idle', qr: '', phone: '', name: '', contacts: new Map(), lastError: '', lastUsed: 0, idle: null, retry: null });
  }
  return sessions.get(id);
}

// ---------- persistence ----------
async function saveAccount(uid, patch) {
  try {
    await accRef(uid).set(Object.assign({ uid: safeId(uid), updatedAt: Date.now() }, patch), { merge: true });
  } catch (e) { warn('account save skipped:', (e && e.message) || e); }
}

async function readAccount(uid) {
  try {
    const snap = await accRef(uid).get();
    return snap.exists ? (snap.data() || {}) : {};
  } catch (e) { return {}; }
}

async function linkedCount() {
  try {
    const snap = await db().collection(COLLECTION).where('status', '==', 'linked').get();
    return snap.size;
  } catch (e) { return sessions.size; }
}

// ---------- idle handling (keeps RAM near zero for unused numbers) ----------
function touch(uid) {
  const st = state(uid);
  st.lastUsed = Date.now();
  if (st.idle) clearTimeout(st.idle);
  st.idle = setTimeout(() => {
    if (!st.sock) return;
    const keep = st.pending || 0;
    if (keep > 0) { touch(uid); return; }
    try { st.sock.end(undefined); } catch (e) { /* ignore */ }
    st.sock = null;
    if (st.status === 'connected') st.status = 'linked';   // linked but not connected right now
    log('idle — socket closed, link kept on disk (' + safeId(uid) + ')');
  }, IDLE_MS);
  if (st.idle.unref) st.idle.unref();
}

// ---------- socket ----------
async function openSocket(uid, opts) {
  opts = opts || {};
  const id = safeId(uid);
  const st = state(id);
  if (st.sock) return st.sock;
  if (!hasCreds(id) && !opts.allowQr) return null;

  fs.mkdirSync(authDir(id), { recursive: true });
  const { state: authState, saveCreds } = await useMultiFileAuthState(authDir(id));
  let version;
  try { version = (await fetchLatestBaileysVersion()).version; } catch (e) { version = [2, 3000, 1015901307]; }

  st.status = 'connecting';
  st.qr = '';
  const sock = makeWASocket({
    version,
    auth: authState,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['AlignTasks', 'Chrome', '2.0'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
    getMessage: async () => undefined
  });
  st.sock = sock;

  sock.ev.on('creds.update', () => { saveCreds().catch(() => {}); });

  sock.ev.on('contacts.upsert', (list) => {
    (list || []).forEach(c => {
      const jid = String(c.id || '');
      if (!jid || /@g\.us$/i.test(jid)) return;
      const phone = String(c.phoneNumber || jid.split('@')[0] || '').replace(/[^0-9]/g, '');
      st.contacts.set(jid, { id: jid, phone, name: String(c.name || c.notify || c.verifiedName || '').trim() });
    });
  });

  sock.ev.on('connection.update', async (u) => {
    if (u.qr) {
      st.qr = await QRCode.toDataURL(u.qr, { margin: 2, width: 320, color: { dark: '#111b21', light: '#ffffff' } }).catch(() => '');
      st.status = 'qr_ready';
    }
    if (u.connection === 'open') {
      st.status = 'connected';
      st.qr = '';
      st.phone = String((sock.user && sock.user.id) || '').split(':')[0].split('@')[0];
      st.name = String((sock.user && sock.user.name) || '');
      st.lastError = '';
      touch(id);
      await saveAccount(id, { status: 'linked', phone: st.phone, name: st.name, linkedAt: Date.now(), lastSeen: Date.now() });
      log('connected (' + id + ' · +' + st.phone + ')');
    }
    if (u.connection === 'close') {
      const code = (u.lastDisconnect && u.lastDisconnect.error && u.lastDisconnect.error.output && u.lastDisconnect.error.output.statusCode) || 0;
      st.sock = null;
      const loggedOut = code === DisconnectReason.loggedOut || code === 401;
      if (loggedOut) {
        st.status = 'logged_out';
        try { fs.rmSync(authDir(id), { recursive: true, force: true }); } catch (e) { /* ignore */ }
        await saveAccount(id, { status: 'unlinked', phone: '', name: '', unlinkedAt: Date.now(), lastError: 'logged out on the phone' });
        log('logged out on the phone — link removed (' + id + ')');
        return;
      }
      st.status = 'disconnected';
      st.lastError = 'connection-closed-' + code;
      if (st.retry) clearTimeout(st.retry);
      st.retry = setTimeout(() => {
        st.retry = null;
        openSocket(id).catch(() => {});
      }, 15000);
      if (st.retry.unref) st.retry.unref();
    }
  });

  return sock;
}

async function waitForOpen(uid, ms) {
  const st = state(uid);
  const until = Date.now() + (ms || 20000);
  while (Date.now() < until) {
    if (st.sock && st.status === 'connected') return true;
    if (st.status === 'qr_ready' || st.status === 'logged_out') return false;
    await new Promise(r => setTimeout(r, 400));
  }
  return st.status === 'connected';
}

// ---------- public API used by the routes ----------
export async function linkStart(uid, meta) {
  meta = meta || {};
  const id = safeId(uid);
  if (!id) throw new Error('A signed-in account is required.');
  if (alignAdminStatus && !alignAdminStatus().ready) throw new Error('Storage is not configured on this server.');
  const st = state(id);
  if (st.sock && st.status === 'connected') return status(id);
  if (!hasCreds(id)) {
    const already = await linkedCount();
    if (already >= WA_MULTI_MAX) {
      const e = new Error('All ' + WA_MULTI_MAX + ' WhatsApp slots are in use. Contact support to free one.');
      e.code = 'wa-cap';
      throw e;
    }
  }
  await openSocket(id, { allowQr: true });
  // wait for the first QR (or an immediate open when credentials already existed)
  const until = Date.now() + 25000;
  while (Date.now() < until) {
    if (st.status === 'qr_ready' || st.status === 'connected') break;
    await new Promise(r => setTimeout(r, 300));
  }
  if (st.status === 'qr_ready' && meta.teamId) await saveAccount(id, { status: 'pending', teamId: String(meta.teamId).slice(0, 80), accountName: String(meta.name || '').slice(0, 60) });
  return status(id);
}

export function status(uid) {
  const id = safeId(uid);
  const st = state(id);
  const linked = hasCreds(id) || st.status === 'connected';
  return {
    uid: id,
    linked,
    status: st.status,
    qr: st.status === 'qr_ready' ? st.qr : '',
    phone: st.phone || '',
    name: st.name || '',
    lastError: st.lastError || '',
    cap: WA_MULTI_MAX
  };
}

export async function linkStatus(uid) {
  const id = safeId(uid);
  const st = state(id);
  if (!st.sock && hasCreds(id)) {
    // keep the saved identity visible without opening a socket
    const doc = await readAccount(id);
    return Object.assign(status(id), { linked: true, status: st.status === 'idle' ? 'linked' : st.status, phone: st.phone || doc.phone || '', name: st.name || doc.name || '' });
  }
  return status(id);
}

export async function unlink(uid) {
  const id = safeId(uid);
  const st = state(id);
  try { if (st.sock) await st.sock.logout().catch(() => {}); } catch (e) { /* ignore */ }
  try { if (st.sock) st.sock.end(undefined); } catch (e) { /* ignore */ }
  st.sock = null;
  st.status = 'idle';
  st.qr = '';
  st.phone = '';
  st.name = '';
  st.contacts.clear();
  try { fs.rmSync(authDir(id), { recursive: true, force: true }); } catch (e) { /* ignore */ }
  await saveAccount(id, { status: 'unlinked', phone: '', name: '', unlinkedAt: Date.now() }).catch(() => {});
  return status(id);
}

export async function ensureSession(uid) {
  const id = safeId(uid);
  if (!hasCreds(id)) return null;
  const st = state(id);
  if (st.sock && st.status === 'connected') { touch(id); return st.sock; }
  await openSocket(id);
  const ok = await waitForOpen(id, 20000);
  touch(id);
  return ok ? st.sock : null;
}

export function isLinked(uid) {
  const id = safeId(uid);
  return hasCreds(id) || state(id).status === 'connected';
}

export async function listGroups(uid, opts) {
  opts = opts || {};
  const id = safeId(uid);
  const st = state(id);
  let groups = [];
  if (opts.refresh || st.status === 'connected') {
    const sock = await ensureSession(id);
    if (sock) {
      try {
        const all = await sock.groupFetchAllParticipating();
        groups = Object.values(all || {}).map(g => ({
          id: String(g.id || ''),
          name: String(g.subject || '').trim() || String(g.id || '')
        })).filter(g => g.id);
        await saveAccount(id, { groups: groups.slice(0, 500), groupsAt: Date.now() });
      } catch (e) { warn('group fetch failed:', (e && e.message) || e); }
    }
  }
  if (!groups.length) {
    const doc = await readAccount(id);
    groups = Array.isArray(doc.groups) ? doc.groups : [];
  }
  return groups.sort((a, b) => a.name.localeCompare(b.name));
}

export async function listContacts(uid, opts) {
  opts = opts || {};
  const id = safeId(uid);
  const st = state(id);
  if (opts.refresh || st.status === 'connected') await ensureSession(id).catch(() => null);
  const out = [];
  const seen = new Set();
  for (const c of st.contacts.values()) {
    const key = c.phone || c.id;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ id: c.id, phone: c.phone, name: c.name || (c.phone ? '+' + c.phone : c.id) });
  }
  return out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

let lastSendAt = 0;
async function pace() {
  const gap = 2500 + Math.floor(Math.random() * 2500);   // 2.5–5 s between messages
  const wait = Math.max(0, lastSendAt + gap - Date.now());
  if (wait) await new Promise(r => setTimeout(r, wait));
  lastSendAt = Date.now();
}

// Used by the reminder scheduler and the "Send now" button.
export async function sendFromAccount(uid, jid, text) {
  const id = safeId(uid);
  if (!/^[0-9A-Za-z._:\-]+@(s\.whatsapp\.net|g\.us|lid)$/i.test(String(jid || ''))) {
    throw new Error('Invalid WhatsApp destination.');
  }
  const st = state(id);
  st.pending = (st.pending || 0) + 1;
  try {
    const sock = await ensureSession(id);
    if (!sock) throw new Error('This number is not connected right now.');
    await pace();
    await Promise.race([
      sock.sendMessage(jid, { text: String(text || '').slice(0, 4000) }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('send-timeout-25s')), 25000))
    ]);
    await saveAccount(id, { lastSendAt: Date.now() });
    return true;
  } finally {
    st.pending = Math.max(0, (st.pending || 1) - 1);
    touch(id);
  }
}

export async function linkedAccountInfo(uid) {
  const doc = await readAccount(uid);
  return { linked: hasCreds(safeId(uid)), status: doc.status || '', phone: doc.phone || '', name: doc.name || '', groups: Array.isArray(doc.groups) ? doc.groups.length : 0 };
}

// ---------- routes ----------
export function registerAlignWaMultiRoutes(app, opts) {
  const api = (opts && opts.api) || '/api/align';
  const requireStaff = opts && opts.requireStaff;
  if (typeof requireStaff !== 'function') throw new Error('registerAlignWaMultiRoutes needs requireStaff');
  const uidOf = (req) => String((req.staff && req.staff.uid) || '');

  console.log('[ALIGN-WA] 📱 multi-account WhatsApp routes registered (max ' + WA_MULTI_MAX + ')');

  app.get(api + '/wa/multi/status', requireStaff, async (req, res) => {
    try {
      const uid = uidOf(req);
      const st = await linkStatus(uid);
      const doc = await readAccount(uid);
      res.json({
        ok: true,
        ...st,
        groups: Array.isArray(doc.groups) ? doc.groups.length : 0,
        linkedAt: doc.linkedAt || 0,
        lastSendAt: doc.lastSendAt || 0
      });
    } catch (e) {
      res.json({ ok: false, error: (e && e.message) || String(e), linked: false, status: 'error', cap: WA_MULTI_MAX });
    }
  });

  app.post(api + '/wa/multi/link', requireStaff, async (req, res) => {
    try {
      const uid = uidOf(req);
      const b = req.body || {};
      const out = await linkStart(uid, { teamId: b.teamId, name: b.name });
      res.json({ ok: true, ...out });
    } catch (e) {
      res.status(e.code === 'wa-cap' ? 409 : 400).json({ ok: false, error: (e && e.message) || String(e), code: e.code || '' });
    }
  });

  app.get(api + '/wa/multi/link/status', requireStaff, async (req, res) => {
    try { res.json({ ok: true, ...status(uidOf(req)) }); }
    catch (e) { res.status(400).json({ ok: false, error: (e && e.message) || String(e) }); }
  });

  app.post(api + '/wa/multi/unlink', requireStaff, async (req, res) => {
    try { res.json({ ok: true, ...(await unlink(uidOf(req))) }); }
    catch (e) { res.status(400).json({ ok: false, error: (e && e.message) || String(e) }); }
  });

  app.get(api + '/wa/multi/groups', requireStaff, async (req, res) => {
    try {
      const groups = await listGroups(uidOf(req), { refresh: String(req.query.refresh || '') === '1' });
      res.json({ ok: true, total: groups.length, groups });
    } catch (e) { res.status(400).json({ ok: false, error: (e && e.message) || String(e) }); }
  });

  app.get(api + '/wa/multi/contacts', requireStaff, async (req, res) => {
    try {
      const contacts = await listContacts(uidOf(req), { refresh: String(req.query.refresh || '') === '1' });
      res.json({ ok: true, total: contacts.length, contacts });
    } catch (e) { res.status(400).json({ ok: false, error: (e && e.message) || String(e) }); }
  });

  app.post(api + '/wa/multi/send', requireStaff, async (req, res) => {
    try {
      const uid = uidOf(req);
      const b = req.body || {};
      const message = String(b.message || '').slice(0, 900).trim();
      if (!message) return res.status(400).json({ ok: false, error: 'Write the message first.' });
      const targets = Array.isArray(b.targets) ? b.targets.slice(0, 25) : [];
      if (!targets.length) return res.status(400).json({ ok: false, error: 'Pick at least one person or group.' });
      const results = [];
      for (const t of targets) {
        const raw = String(t.id || '').trim();
        const isGroup = String(t.type) === 'group' || /@g\.us$/i.test(raw);
        const jid = isGroup ? raw : (String(t.phone || '').replace(/[^0-9]/g, '') ? String(t.phone || '').replace(/[^0-9]/g, '') + '@s.whatsapp.net' : '');
        const label = String(t.name || jid || '').slice(0, 80);
        if (!jid) { results.push({ name: label, ok: false, error: 'no-whatsapp-number' }); continue; }
        try {
          await sendFromAccount(uid, jid, message);
          results.push({ name: label, ok: true });
        } catch (e) {
          results.push({ name: label, ok: false, error: String((e && e.message) || e).slice(0, 160) });
        }
      }
      res.json({ ok: true, results, sent: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length });
    } catch (e) {
      res.status(400).json({ ok: false, error: (e && e.message) || String(e) });
    }
  });
}
