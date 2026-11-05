// ============================================================================
// 🧾 COMMISSION ACCOUNTS — offline-first ledger API (SQLite on the VPS)
// ============================================================================
// Why this module exists
//   The commission register used to live in S.E.ENGINEERING GST SHEET-2.xlsx.
//   A spreadsheet gives no protection against a bad edit, no audit trail, no
//   multi-user access and no way to see what changed. Here every record is a
//   row with an id, an `updated_at` stamp and a monotonic `seq` number, which
//   gives us three things at once:
//     • instant local reads on the phone/laptop (the browser keeps its own copy
//       in IndexedDB and works with no network at all),
//     • cheap delta sync — a client asks "what changed after seq N?" instead of
//       re-downloading everything,
//     • last-writer-wins conflict resolution that never silently drops a row.
//
//   Storage order (same idea as AccPro):  device → SQLite on the VPS → other
//   devices.  Firestore is NOT involved, so a busy day costs zero reads/writes.
//
// Auth
//   This app has its own users (name + password), separate from the WhatsApp
//   dashboard login. Passwords are scrypt hashed with a per-user salt, tokens
//   are HMAC signed. The seed file (scripts/commission-seed.json) rebuilds the
//   history from the Excel sheet on an empty database.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const DATA_DIR = process.env.COMMISSION_DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = process.env.COMMISSION_DB_PATH || path.join(DATA_DIR, 'commission.db');
const JSON_PATH = process.env.COMMISSION_JSON_PATH || path.join(DATA_DIR, 'commission-store.json');
const SECRET_FILE = path.join(DATA_DIR, 'commissionSecret.key');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const SEED_FILE = path.join(__dirname, 'scripts', 'commission-seed.json');

const TOKEN_DAYS = (() => {
  const n = Number(process.env.COMMISSION_TOKEN_DAYS);
  return Number.isFinite(n) && n > 0 ? n : 60;
})();
const MAX_FAILED = 8;
const LOCK_MS = 15 * 60 * 1000;
const MAX_RECORD_BYTES = 200 * 1024;

const VALID_KINDS = new Set(['master', 'invoice', 'voucher', 'setting']);

// --------------------------------------------------------------------------- small helpers
const nowMs = () => Date.now();
const sstr = (v, n = 300) => String(v == null ? '' : v).slice(0, n);
const numOr = (v, d = 0) => {
  const n = Number(String(v == null ? '' : v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : d;
};
const isoDay = (d = new Date()) => d.toISOString().slice(0, 10);

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); } catch (e) { /* already there */ }
}

function atomicWrite(file, text) {
  ensureDir(path.dirname(file));
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

// --------------------------------------------------------------------------- store
// Two interchangeable stores: SQLite (node:sqlite, Node 22.5+) and a JSON file
// that keeps everything in memory. The JSON one exists because the VPS may run
// an older Node where node:sqlite is missing — the app must never refuse to run.
let store = null;

function openSqliteStore() {
  let DatabaseSync;
  try { ({ DatabaseSync } = require('node:sqlite')); } catch (e) { return null; }
  if (!DatabaseSync) return null;
  try {
    ensureDir(DATA_DIR);
    const db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = NORMAL');
    db.exec(`CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      type TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      seq INTEGER NOT NULL,
      updated_by TEXT
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_records_seq ON records(seq)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_records_kind ON records(kind, type)');
    db.exec('CREATE TABLE IF NOT EXISTS seq_counter (id INTEGER PRIMARY KEY CHECK (id = 1), value INTEGER NOT NULL)');
    db.exec(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      pass TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'staff',
      disabled INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      token_from INTEGER NOT NULL DEFAULT 0
    )`);
    db.exec('INSERT OR IGNORE INTO seq_counter (id, value) VALUES (1, 0)');

    const q = {
      getRec: db.prepare('SELECT * FROM records WHERE id = ?'),
      putRec: db.prepare(`INSERT INTO records (id, kind, type, data, updated_at, deleted, seq, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, type=excluded.type, data=excluded.data,
          updated_at=excluded.updated_at, deleted=excluded.deleted, seq=excluded.seq, updated_by=excluded.updated_by`),
      changes: db.prepare('SELECT * FROM records WHERE seq > ? ORDER BY seq ASC LIMIT ?'),
      byKind: db.prepare('SELECT * FROM records WHERE kind = ? AND deleted = 0 ORDER BY updated_at DESC LIMIT ?'),
      all: db.prepare('SELECT * FROM records WHERE deleted = 0 ORDER BY seq ASC'),
      count: db.prepare('SELECT COUNT(*) AS n FROM records WHERE deleted = 0'),
      countAll: db.prepare('SELECT COUNT(*) AS n FROM records'),
      maxSeq: db.prepare('SELECT COALESCE(MAX(seq), 0) AS s FROM records'),
      readSeq: db.prepare('SELECT value FROM seq_counter WHERE id = 1'),
      writeSeq: db.prepare('UPDATE seq_counter SET value = ? WHERE id = 1'),
      userByName: db.prepare('SELECT * FROM users WHERE username = ?'),
      userById: db.prepare('SELECT * FROM users WHERE id = ?'),
      users: db.prepare('SELECT * FROM users ORDER BY created_at ASC'),
      putUser: db.prepare(`INSERT INTO users (id, username, name, pass, role, disabled, created_at, updated_at, token_from)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET username=excluded.username, name=excluded.name, pass=excluded.pass,
          role=excluded.role, disabled=excluded.disabled, updated_at=excluded.updated_at, token_from=excluded.token_from`),
      userCount: db.prepare('SELECT COUNT(*) AS n FROM users'),
      delUser: db.prepare('DELETE FROM users WHERE id = ?')
    };

    let seq = q.readSeq.get().value || 0;

    return {
      mode: 'sqlite',
      path: DB_PATH,
      nextSeq() { seq += 1; q.writeSeq.run(seq); return seq; },
      getRecord(id) { const r = q.getRec.get(id); return r ? rowToRecord(r) : null; },
      putRecord(rec) { q.putRec.run(rec.id, rec.kind, rec.type, JSON.stringify(rec.data), rec.updatedAt, rec.deleted ? 1 : 0, rec.seq, rec.updatedBy || ''); },
      changesSince(cursor, limit) { return q.changes.all(cursor, limit).map(rowToRecord); },
      listKind(kind, limit) { return q.byKind.all(kind, limit).map(rowToRecord); },
      all() { return q.all.all().map(rowToRecord); },
      count() { return q.count.get().n; },
      countAll() { return q.countAll.get().n; },
      maxSeq() { return q.maxSeq.get().s; },
      users() { return q.users.all(); },
      userByName(name) { return q.userByName.get(name) || null; },
      userById(id) { return q.userById.get(id) || null; },
      userCount() { return q.userCount.get().n; },
      putUser(u) { q.putUser.run(u.id, u.username, u.name, u.pass, u.role, u.disabled ? 1 : 0, u.created_at, u.updated_at, u.token_from || 0); },
      removeUser(id) { q.delUser.run(id); },
      close() { try { db.close(); } catch (e) { /* ignore */ } }
    };
  } catch (e) {
    console.warn('[COMMISSION] SQLite unavailable (' + sstr(e.message || e, 160) + ') — using JSON store');
    return null;
  }
}

function openJsonStore() {
  let state = { seq: 0, records: {}, users: [] };
  try {
    if (fs.existsSync(JSON_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
      state.seq = Number(parsed.seq) || 0;
      state.records = parsed.records && typeof parsed.records === 'object' ? parsed.records : {};
      state.users = Array.isArray(parsed.users) ? parsed.users : [];
    }
  } catch (e) {
    console.warn('[COMMISSION] could not read JSON store: ' + sstr(e.message || e, 160));
  }
  let timer = null;
  const flush = () => {
    timer = null;
    try { atomicWrite(JSON_PATH, JSON.stringify(state)); }
    catch (e) { console.warn('[COMMISSION] JSON save failed: ' + sstr(e.message || e, 160)); }
  };
  const dirty = () => { if (!timer) timer = setTimeout(flush, 250); };
  const saveNow = () => { if (timer) { clearTimeout(timer); timer = null; } flush(); };

  return {
    mode: 'json',
    path: JSON_PATH,
    nextSeq() { state.seq += 1; dirty(); return state.seq; },
    getRecord(id) { return state.records[id] || null; },
    putRecord(rec) { state.records[rec.id] = rec; dirty(); },
    changesSince(cursor, limit) {
      return Object.values(state.records)
        .filter(r => r.seq > cursor)
        .sort((a, b) => a.seq - b.seq)
        .slice(0, limit);
    },
    listKind(kind, limit) {
      return Object.values(state.records)
        .filter(r => r.kind === kind && !r.deleted)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, limit);
    },
    all() { return Object.values(state.records).filter(r => !r.deleted).sort((a, b) => a.seq - b.seq); },
    count() { return Object.values(state.records).filter(r => !r.deleted).length; },
    countAll() { return Object.keys(state.records).length; },
    maxSeq() { return state.seq; },
    users() { return state.users.slice(); },
    userByName(name) { return state.users.find(u => u.username === name) || null; },
    userById(id) { return state.users.find(u => u.id === id) || null; },
    userCount() { return state.users.length; },
    putUser(u) {
      const i = state.users.findIndex(x => x.id === u.id);
      if (i >= 0) state.users[i] = u; else state.users.push(u);
      dirty();
    },
    removeUser(id) {
      state.users = state.users.filter(u => u.id !== id);
      dirty();
    },
    close() { saveNow(); }
  };
}

function rowToRecord(r) {
  let data = {};
  try { data = JSON.parse(r.data) || {}; } catch (e) { data = {}; }
  return { id: r.id, kind: r.kind, type: r.type, data, updatedAt: r.updated_at, deleted: !!r.deleted, seq: r.seq, updatedBy: r.updated_by || '' };
}

// --------------------------------------------------------------------------- auth helpers
function secret() {
  const fromEnv = String(process.env.COMMISSION_SECRET || '').trim();
  if (fromEnv.length >= 32) return Buffer.from(fromEnv, 'utf8');
  ensureDir(DATA_DIR);
  try {
    if (fs.existsSync(SECRET_FILE)) {
      const s = fs.readFileSync(SECRET_FILE);
      if (s.length >= 32) return s;
    }
    const fresh = crypto.randomBytes(48);
    fs.writeFileSync(SECRET_FILE, fresh, { mode: 0o600 });
    return fresh;
  } catch (e) {
    return crypto.createHash('sha256').update('commission-ephemeral-' + process.pid).digest();
  }
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function sign(payloadObj) {
  const body = b64url(JSON.stringify(payloadObj));
  const mac = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return body + '.' + mac;
}

function verify(token) {
  const raw = String(token || '');
  const dot = raw.lastIndexOf('.');
  if (dot < 1) return null;
  const body = raw.slice(0, dot);
  const mac = raw.slice(dot + 1);
  const expect = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload || !payload.uid) return null;
    if (payload.exp && payload.exp < nowMs()) return null;
    return payload;
  } catch (e) { return null; }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return 'scrypt$' + salt + '$' + hash;
}

function checkPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hash] = parts;
  const calc = crypto.scryptSync(String(password), salt, 64);
  const expect = Buffer.from(hash, 'hex');
  if (expect.length !== calc.length) return false;
  return crypto.timingSafeEqual(calc, expect);
}

const loginAttempts = new Map();
function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.ip || req.socket?.remoteAddress || 'unknown';
}
function lockedMs(key) {
  const rec = loginAttempts.get(key);
  if (!rec) return 0;
  if (rec.until > nowMs()) return rec.until - nowMs();
  loginAttempts.delete(key);
  return 0;
}
function noteFailure(key) {
  const rec = loginAttempts.get(key) || { count: 0, until: 0 };
  rec.count += 1;
  if (rec.count >= MAX_FAILED) rec.until = nowMs() + LOCK_MS;
  loginAttempts.set(key, rec);
  if (loginAttempts.size > 5000) loginAttempts.clear();
}

const publicUser = (u) => ({ id: u.id, username: u.username, name: u.name, role: u.role, disabled: !!u.disabled, createdAt: u.created_at });

// --------------------------------------------------------------------------- records
function sanitizeRecord(raw, user) {
  if (!raw || typeof raw !== 'object') return null;
  const id = sstr(raw.id, 80).replace(/[^A-Za-z0-9_.:-]/g, '');
  if (!id) return null;
  const kind = sstr(raw.kind, 20).toLowerCase();
  if (!VALID_KINDS.has(kind)) return null;
  const type = sstr(raw.type || 'default', 40).toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'default';
  const data = raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data) ? raw.data : {};
  let json;
  try { json = JSON.stringify(data); } catch (e) { return null; }
  if (json.length > MAX_RECORD_BYTES) return null;
  const updatedAt = Number(raw.updatedAt);
  return {
    id,
    kind,
    type,
    data,
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? Math.min(updatedAt, nowMs() + 24 * 3600 * 1000) : nowMs(),
    deleted: !!raw.deleted,
    updatedBy: user ? user.id : ''
  };
}

// Returns 'applied' | 'ignored' (server copy is newer).
function applyRecord(raw, user) {
  const rec = sanitizeRecord(raw, user);
  if (!rec) return 'invalid';
  const existing = store.getRecord(rec.id);
  if (existing && existing.updatedAt > rec.updatedAt) return 'ignored';
  rec.seq = store.nextSeq();
  store.putRecord(rec);
  return 'applied';
}

// --------------------------------------------------------------------------- seeding
function seedIfEmpty() {
  if (store.count() > 0 || store.userCount() > 0) return { seeded: false, records: store.count() };
  let seed = null;
  try {
    if (fs.existsSync(SEED_FILE)) seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  } catch (e) {
    console.warn('[COMMISSION] seed file unreadable: ' + sstr(e.message || e, 160));
  }
  if (!seed) return { seeded: false, records: 0 };

  const t0 = nowMs() - 1000;
  const add = (kind, type, data, id) => {
    const rec = { id, kind, type, data, updatedAt: t0, deleted: false, updatedBy: 'seed' };
    rec.seq = store.nextSeq();
    store.putRecord(rec);
  };

  const rateFor = (name) => {
    const found = (seed.commissionRates || []).slice();
    const def = { 'Chagani': 20, 'AL QARYAN': 20, 'ALBA': 20, 'Saqi Industry': 30 };
    return def[name] != null ? def[name] : (found.length === 1 ? found[0] : 20);
  };

  // Masters -------------------------------------------------------------
  for (const name of seed.sellers || []) {
    add('master', 'party', {
      name, role: 'seller', commissionPct: rateFor(name), gstNo: '', phone: '', email: '',
      opening: 0, notes: 'Imported from ' + (seed.sourceFile || 'Excel'), active: true
    }, 'party-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
  }
  for (const name of seed.buyers || []) {
    add('master', 'party', {
      name, role: 'buyer', commissionPct: 0, gstNo: '', phone: '', email: '', opening: 0,
      notes: 'Imported from ' + (seed.sourceFile || 'Excel'), active: true
    }, 'party-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
  }
  for (const item of seed.items || []) {
    add('master', 'item', {
      name: item.name, hsCode: item.hsCode || '', unit: 'KG', rate: 0, gstPct: 18, active: true
    }, 'item-' + String(item.name).toLowerCase().replace(/[^a-z0-9]+/g, '-'));
  }
  add('master', 'tax', { name: 'GST 18%', rate: 18, kind: 'gst', notes: 'Standard sales tax on plastic raw material' }, 'tax-gst-18');
  add('master', 'bank', { name: 'Cash in Hand', kind: 'cash', accountNo: '', opening: 0 }, 'bank-cash');
  add('master', 'bank', { name: 'Bank Account', kind: 'bank', accountNo: '', opening: 0 }, 'bank-main');
  for (const [i, ex] of [
    ['Chalaan Fees', '5% of GST for Qaryan / ALBA chalaans'],
    ['Wakeel Charges', 'Lawyer / tax counsel charges'],
    ['Audit Expenses', 'Occasional audit cost'],
    ['Industry Payment', 'Deductions paid towards the industry']
  ].entries()) {
    add('master', 'expense', { name: ex[0], notes: ex[1], active: true }, 'expense-' + i);
  }

  // Commission invoices ------------------------------------------------
  for (const inv of seed.invoices || []) {
    add('invoice', 'commission', {
      date: inv.date, seller: inv.seller, buyer: inv.buyer, invNo: inv.invNo, item: inv.item,
      hsCode: inv.hsCode, grade: inv.grade || '', qty: inv.qty, rate: inv.rate, amount: inv.amount,
      gstPct: inv.gstPct, gstValue: inv.gstValue, commPct: inv.commPct, commValue: inv.commValue,
      notes: inv.notes || '', source: inv.source || ''
    }, inv.id);
  }

  // Receipts / payments ------------------------------------------------
  for (const p of seed.payments || []) {
    const isExpense = p.kind === 'expense';
    add('voucher', isExpense ? 'payment' : 'receipt', {
      date: p.date, no: p.no || '', party: p.party, amount: p.amount, mode: p.mode || 'Bank',
      account: p.mode || 'Bank Account', narration: p.narration || (isExpense ? 'Payment' : 'Commission received'),
      auto: 'excel-import', partyType: isExpense ? 'expense' : 'seller'
    }, p.id);
  }

  return { seeded: true, records: store.count() };
}

// --------------------------------------------------------------------------- backups
function backupNow(force = false) {
  if (!store || store.mode !== 'sqlite') return null;
  try {
    ensureDir(BACKUP_DIR);
    const file = path.join(BACKUP_DIR, 'commission-' + isoDay() + '.db');
    if (!force && fs.existsSync(file)) return file;
    fs.copyFileSync(DB_PATH, file);
    const keep = 21;
    const files = fs.readdirSync(BACKUP_DIR).filter(f => /^commission-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
    while (files.length > keep) {
      const old = files.shift();
      try { fs.unlinkSync(path.join(BACKUP_DIR, old)); } catch (e) { /* ignore */ }
    }
    return file;
  } catch (e) {
    console.warn('[COMMISSION] backup skipped: ' + sstr(e.message || e, 160));
    return null;
  }
}

// --------------------------------------------------------------------------- maintenance
// Vouchers created before numbering existed (an already-deployed database) get a
// number on the next start, so every receipt/payment is referenceable like in Tally.
function backfillVoucherNumbers() {
  let changed = 0;
  for (const [type, prefix] of [['receipt', 'RV'], ['payment', 'PV']]) {
    const list = store.all().filter(r => r.kind === 'voucher' && r.type === type);
    if (!list.length) continue;
    let max = 0;
    for (const r of list) {
      const m = String(r.data.no || '').match(/(\d+)\s*$/);
      if (m) max = Math.max(max, Number(m[1]));
    }
    const missing = list
      .filter(r => !r.data.no)
      .sort((a, b) => (a.data.date || '').localeCompare(b.data.date || '') || a.id.localeCompare(b.id));
    for (const r of missing) {
      max += 1;
      const next = { ...r, data: { ...r.data, no: prefix + '-' + String(max).padStart(4, '0') }, updatedAt: nowMs(), seq: store.nextSeq() };
      store.putRecord(next);
      changed++;
    }
  }
  return changed;
}

// --------------------------------------------------------------------------- init
export function initCommissionStore() {
  if (store) return info();
  ensureDir(DATA_DIR);
  store = openSqliteStore() || openJsonStore();
  const seeded = seedIfEmpty();
  if (seeded.seeded) console.log('[COMMISSION] 🧾 seeded ' + seeded.records + ' records from the Excel history');
  const numbered = backfillVoucherNumbers();
  if (numbered) console.log('[COMMISSION] 🧾 numbered ' + numbered + ' imported vouchers');
  backupNow();
  const timer = setInterval(() => backupNow(), 6 * 3600 * 1000);
  if (timer.unref) timer.unref();
  console.log('[COMMISSION] 🧾 store mode=' + store.mode + ' file=' + store.path + ' records=' + store.count());
  return { ...info(), seeded: seeded.seeded };
}

function info() {
  return { mode: store ? store.mode : 'none', path: store ? store.path : '', records: store ? store.count() : 0 };
}

// --------------------------------------------------------------------------- routes
export function registerCommissionRoutes(app) {
  initCommissionStore();

  const api = '/api/commission';

  const auth = (req, res, next) => {
    const header = String(req.headers.authorization || '');
    const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : String(req.query.token || '');
    const payload = verify(token);
    if (!payload) return res.status(401).json({ ok: false, error: 'Please sign in again.' });
    const user = store.userById(payload.uid);
    if (!user || user.disabled) return res.status(401).json({ ok: false, error: 'This account is not active.' });
    if ((user.token_from || 0) > (payload.iat || 0)) return res.status(401).json({ ok: false, error: 'Please sign in again.' });
    req.user = user;
    next();
  };

  const adminOnly = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') return res.status(403).json({ ok: false, error: 'Only the admin can do this.' });
    next();
  };

  // ---------------------------------------------------------------- auth
  app.post(api + '/auth/signup', (req, res) => {
    try {
      const body = req.body || {};
      const name = sstr(body.name, 60).trim();
      const username = sstr(body.username, 40).trim().toLowerCase();
      const password = String(body.password || '');
      const invite = sstr(body.inviteCode, 80).trim();
      if (!name) return res.status(400).json({ ok: false, error: 'Enter your name.' });
      if (!/^[a-z0-9._-]{3,40}$/.test(username)) return res.status(400).json({ ok: false, error: 'Username: 3+ letters, numbers, dot, dash or underscore.' });
      if (password.length < 6) return res.status(400).json({ ok: false, error: 'Password must be at least 6 characters.' });
      if (store.userByName(username)) return res.status(409).json({ ok: false, error: 'That username is already taken.' });

      const firstUser = store.userCount() === 0;
      const requiredCode = String(process.env.COMMISSION_SIGNUP_CODE || '').trim();
      if (!firstUser) {
        if (!requiredCode) return res.status(403).json({ ok: false, error: 'Sign-up is closed. Ask the admin to create your login.' });
        if (invite !== requiredCode) return res.status(403).json({ ok: false, error: 'Wrong invite code.' });
      }

      const user = {
        id: 'u-' + crypto.randomUUID(),
        username,
        name,
        pass: hashPassword(password),
        role: firstUser ? 'admin' : 'staff',
        disabled: 0,
        created_at: nowMs(),
        updated_at: nowMs(),
        token_from: 0
      };
      store.putUser(user);
      const iat = nowMs();
      const token = sign({ uid: user.id, name: user.name, role: user.role, iat, exp: iat + TOKEN_DAYS * 86400000 });
      res.json({ ok: true, token, user: publicUser(user), firstUser });
    } catch (e) {
      res.status(500).json({ ok: false, error: sstr(e.message || e, 200) });
    }
  });

  app.post(api + '/auth/login', (req, res) => {
    try {
      const body = req.body || {};
      const username = sstr(body.username, 40).trim().toLowerCase();
      const password = String(body.password || '');
      const key = clientIp(req) + '|' + username;
      const wait = lockedMs(key);
      if (wait > 0) return res.status(429).json({ ok: false, error: 'Too many attempts. Try again in ' + Math.ceil(wait / 60000) + ' min.' });
      const user = store.userByName(username);
      if (!user || !checkPassword(password, user.pass)) {
        noteFailure(key);
        return res.status(401).json({ ok: false, error: 'Wrong username or password.' });
      }
      if (user.disabled) return res.status(403).json({ ok: false, error: 'This account has been disabled.' });
      loginAttempts.delete(key);
      const iat = nowMs();
      const token = sign({ uid: user.id, name: user.name, role: user.role, iat, exp: iat + TOKEN_DAYS * 86400000 });
      res.json({ ok: true, token, user: publicUser(user) });
    } catch (e) {
      res.status(500).json({ ok: false, error: sstr(e.message || e, 200) });
    }
  });

  app.get(api + '/auth/me', auth, (req, res) => {
    res.json({ ok: true, user: publicUser(req.user), serverTime: nowMs(), store: info() });
  });

  app.post(api + '/auth/password', auth, (req, res) => {
    try {
      const current = String((req.body || {}).currentPassword || '');
      const next = String((req.body || {}).newPassword || '');
      if (next.length < 6) return res.status(400).json({ ok: false, error: 'New password must be at least 6 characters.' });
      if (!checkPassword(current, req.user.pass)) return res.status(401).json({ ok: false, error: 'Current password is wrong.' });
      const updated = { ...req.user, pass: hashPassword(next), updated_at: nowMs(), token_from: nowMs() };
      store.putUser(updated);
      const iat = nowMs();
      const token = sign({ uid: updated.id, name: updated.name, role: updated.role, iat, exp: iat + TOKEN_DAYS * 86400000 });
      res.json({ ok: true, token, user: publicUser(updated) });
    } catch (e) {
      res.status(500).json({ ok: false, error: sstr(e.message || e, 200) });
    }
  });

  // Admin user management (the "load separately for other staff" part)
  app.get(api + '/users', auth, adminOnly, (req, res) => {
    res.json({ ok: true, users: store.users().map(publicUser) });
  });

  app.delete(api + '/users/:id', auth, adminOnly, (req, res) => {
    try {
      const list = store.users();
      const user = list.find(u => u.id === req.params.id);
      if (!user) return res.status(404).json({ ok: false, error: 'User not found.' });
      if (user.id === req.user.id) return res.status(400).json({ ok: false, error: 'You cannot remove your own login.' });
      if (user.role === 'admin' && list.filter(u => u.role === 'admin' && !u.disabled).length <= 1) {
        return res.status(400).json({ ok: false, error: 'At least one admin login must stay active.' });
      }
      store.removeUser(user.id);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: sstr(e.message || e, 200) });
    }
  });

  app.post(api + '/users', auth, adminOnly, (req, res) => {
    try {
      const body = req.body || {};
      const name = sstr(body.name, 60).trim();
      const username = sstr(body.username, 40).trim().toLowerCase();
      const password = String(body.password || '');
      if (!name || !/^[a-z0-9._-]{3,40}$/.test(username)) return res.status(400).json({ ok: false, error: 'Name and a 3+ character username are required.' });
      if (password.length < 6) return res.status(400).json({ ok: false, error: 'Password must be at least 6 characters.' });
      if (store.userByName(username)) return res.status(409).json({ ok: false, error: 'That username already exists.' });
      const user = {
        id: 'u-' + crypto.randomUUID(), username, name, pass: hashPassword(password),
        role: body.role === 'admin' ? 'admin' : 'staff', disabled: 0,
        created_at: nowMs(), updated_at: nowMs(), token_from: 0
      };
      store.putUser(user);
      res.json({ ok: true, user: publicUser(user) });
    } catch (e) {
      res.status(500).json({ ok: false, error: sstr(e.message || e, 200) });
    }
  });

  app.patch(api + '/users/:id', auth, adminOnly, (req, res) => {
    try {
      const user = store.userById(req.params.id);
      if (!user) return res.status(404).json({ ok: false, error: 'User not found.' });
      const body = req.body || {};
      const updated = { ...user, updated_at: nowMs() };
      if (typeof body.disabled === 'boolean') {
        if (user.id === req.user.id && body.disabled) return res.status(400).json({ ok: false, error: 'You cannot disable your own login.' });
        updated.disabled = body.disabled ? 1 : 0;
        updated.token_from = nowMs();
      }
      if (body.resetPassword) {
        const pw = String(body.resetPassword);
        if (pw.length < 6) return res.status(400).json({ ok: false, error: 'Password must be at least 6 characters.' });
        updated.pass = hashPassword(pw);
        updated.token_from = nowMs();
      }
      if (body.role === 'admin' || body.role === 'staff') updated.role = body.role;
      if (body.name) updated.name = sstr(body.name, 60).trim();
      store.putUser(updated);
      res.json({ ok: true, user: publicUser(updated) });
    } catch (e) {
      res.status(500).json({ ok: false, error: sstr(e.message || e, 200) });
    }
  });

  // ---------------------------------------------------------------- data
  // Full dataset, used the first time a device opens the app.
  app.get(api + '/bootstrap', auth, (req, res) => {
    try {
      const records = store.all();
      res.set('Cache-Control', 'no-store');
      res.json({ ok: true, records, cursor: store.maxSeq(), serverTime: nowMs(), store: info(), user: publicUser(req.user) });
    } catch (e) {
      res.status(500).json({ ok: false, error: sstr(e.message || e, 200) });
    }
  });

  // Delta sync — the heart of the offline-first design.
  app.post(api + '/sync', auth, (req, res) => {
    try {
      const body = req.body || {};
      const cursor = Math.max(0, numOr(body.cursor, 0));
      const incoming = Array.isArray(body.changes) ? body.changes.slice(0, 2000) : [];
      let applied = 0, ignored = 0, invalid = 0;
      for (const raw of incoming) {
        const result = applyRecord(raw, req.user);
        if (result === 'applied') applied++;
        else if (result === 'ignored') ignored++;
        else invalid++;
      }
      const limit = Math.min(5000, Math.max(1, numOr(body.limit, 5000)));
      const changes = store.changesSince(cursor, limit);
      const nextCursor = changes.length ? changes[changes.length - 1].seq : Math.max(cursor, store.maxSeq());
      res.set('Cache-Control', 'no-store');
      res.json({
        ok: true,
        cursor: nextCursor,
        hasMore: changes.length >= limit,
        changes,
        applied, ignored, invalid,
        serverTime: nowMs(),
        total: store.count()
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: sstr(e.message || e, 200) });
    }
  });

  app.get(api + '/records', auth, (req, res) => {
    try {
      const kind = sstr(req.query.kind, 20).toLowerCase();
      const limit = Math.min(5000, Math.max(1, numOr(req.query.limit, 500)));
      const rows = kind && VALID_KINDS.has(kind) ? store.listKind(kind, limit) : store.all().slice(-limit);
      res.json({ ok: true, records: rows, total: rows.length });
    } catch (e) {
      res.status(500).json({ ok: false, error: sstr(e.message || e, 200) });
    }
  });

  app.post(api + '/records', auth, (req, res) => {
    try {
      const body = req.body || {};
      const list = Array.isArray(body.records) ? body.records : [body.record || body];
      const saved = [];
      for (const raw of list.slice(0, 500)) {
        const result = applyRecord(raw, req.user);
        if (result === 'applied') saved.push(raw.id);
      }
      res.json({ ok: true, saved, cursor: store.maxSeq() });
    } catch (e) {
      res.status(500).json({ ok: false, error: sstr(e.message || e, 200) });
    }
  });

  app.delete(api + '/records/:id', auth, (req, res) => {
    try {
      const existing = store.getRecord(sstr(req.params.id, 80));
      if (!existing) return res.status(404).json({ ok: false, error: 'Record not found.' });
      const result = applyRecord({ ...existing, deleted: true, updatedAt: nowMs() }, req.user);
      res.json({ ok: true, result });
    } catch (e) {
      res.status(500).json({ ok: false, error: sstr(e.message || e, 200) });
    }
  });

  app.get(api + '/stats', auth, (req, res) => {
    let commission = 0, received = 0, paid = 0, invoices = 0;
    for (const rec of store.all()) {
      if (rec.kind === 'invoice') {
        invoices++;
        commission += numOr(rec.data.commValue, 0);
      } else if (rec.kind === 'voucher') {
        if (rec.type === 'receipt') received += numOr(rec.data.amount, 0);
        if (rec.type === 'payment') paid += numOr(rec.data.amount, 0);
      }
    }
    res.json({
      ok: true,
      stats: { invoices, commission: Math.round(commission * 100) / 100, received: Math.round(received * 100) / 100, paid: Math.round(paid * 100) / 100, balance: Math.round((commission - received - paid) * 100) / 100 },
      store: info()
    });
  });

  // Full JSON backup the boss can download and keep (replaces "the Excel file").
  app.get(api + '/backup', auth, adminOnly, (req, res) => {
    try {
      const payload = { app: 'commission-accounts', generatedAt: new Date().toISOString(), records: store.all(), users: store.users().map(publicUser) };
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="commission-accounts-' + isoDay() + '.json"');
      res.send(JSON.stringify(payload, null, 1));
    } catch (e) {
      res.status(500).json({ ok: false, error: sstr(e.message || e, 200) });
    }
  });

  app.get(api + '/health', (req, res) => {
    res.json({ ok: true, ...info(), users: store.userCount(), cursor: store.maxSeq() });
  });

  console.log('[COMMISSION] 🧾 Commission Accounts API registered (' + store.mode + ')');
}

// Exposed for tests / scripts
export const commissionInternals = {
  initCommissionStore,
  info,
  seedFile: SEED_FILE
};
