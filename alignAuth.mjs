// ============================================================================
// 🔐 ALIGNTASKS AUTH — staff credentials, sessions, and the team unlock gate
// ============================================================================
// Design decisions (boss-approved):
//   • Staff sign in with NAME + PASSWORD only. No email, no phone.
//   • Staff names + password hashes are maintained in the APP's own data
//     (a chmod-600 JSON file on the server, never Firestore, because the
//     Firestore catch-all rule leaves most collections world-readable).
//   • Passwords are scrypt-hashed with a per-user salt and compared in
//     constant time. Plaintext is never stored or logged.
//   • Two token types, both HMAC-signed and short lived:
//       staff session  —— proves who the person is
//       team unlock    —— proves they entered the team password (12h)
//   • Nobody can see another person's individual task, including the owner.
//
// The HMAC secret comes from ALIGN_SESSION_SECRET, or is generated once and
// kept in data/secret.key (chmod 600) so sessions survive restarts.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = process.env.ALIGN_DATA_DIR || path.join(process.cwd(), 'data');
const STAFF_FILE = path.join(DATA_DIR, 'alignStaff.json');
const TEAMS_FILE = path.join(DATA_DIR, 'alignTeams.json');
const SECRET_FILE = path.join(DATA_DIR, 'secret.key');
const AUDIT_FILE = path.join(DATA_DIR, 'alignAuthAudit.log');

export const SESSION_HOURS = 12;         // staff session lifetime
export const UNLOCK_HOURS = 12;          // team unlock lifetime (boss: "you decide" -> one working day)
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const SCRYPT_N = 16384;

// --------------------------------------------------------------------------- storage helpers
function ensureDir() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 }); } catch (e) { /* exists */ }
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (e) {
    console.warn('[ALIGN-AUTH] could not read ' + path.basename(file) + ': ' + e.message);
    return fallback;
  }
}

// Atomic-ish write so a crash cannot leave a half-written credential file.
function writeJson(file, obj) {
  ensureDir();
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
  try { fs.chmodSync(file, 0o600); } catch (e) { /* best effort */ }
}

function secret() {
  const fromEnv = String(process.env.ALIGN_SESSION_SECRET || '').trim();
  if (fromEnv.length >= 32) return Buffer.from(fromEnv, 'utf8');
  ensureDir();
  try {
    if (fs.existsSync(SECRET_FILE)) {
      const s = fs.readFileSync(SECRET_FILE);
      if (s.length >= 32) return s;
    }
    const fresh = crypto.randomBytes(48);
    fs.writeFileSync(SECRET_FILE, fresh, { mode: 0o600 });
    console.log('[ALIGN-AUTH] generated a new session secret at ' + SECRET_FILE);
    return fresh;
  } catch (e) {
    console.warn('[ALIGN-AUTH] secret file unavailable, using an ephemeral secret (sessions reset on restart)');
    return crypto.createHash('sha256').update('ephemeral-' + process.pid).digest();
  }
}
let _secret = null;
const getSecret = () => (_secret || (_secret = secret()));

// --------------------------------------------------------------------------- password hashing
export function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(plain), salt, 64, { N: SCRYPT_N });
  return { salt: salt.toString('hex'), hash: hash.toString('hex'), algo: 'scrypt-n' + SCRYPT_N };
}

export function verifyPassword(plain, rec) {
  if (!rec || !rec.salt || !rec.hash) return false;
  try {
    const salt = Buffer.from(rec.salt, 'hex');
    const expected = Buffer.from(rec.hash, 'hex');
    const actual = crypto.scryptSync(String(plain), salt, expected.length, { N: SCRYPT_N });
    return crypto.timingSafeEqual(expected, actual);
  } catch (e) { return false; }
}

// --------------------------------------------------------------------------- handles
export const normalizeHandle = (s) => String(s || '')
  .trim().toLowerCase()
  .replace(/[^a-z0-9\u0600-\u06FF ._-]/g, '')   // keep Arabic letters too
  .replace(/\s+/g, ' ')
  .slice(0, 40);

// --------------------------------------------------------------------------- tokens
function sign(payloadObj) {
  const body = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url');
  const mac = crypto.createHmac('sha256', getSecret()).update(body).digest('base64url');
  return body + '.' + mac;
}

function unsign(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  const [body, mac] = parts;
  const expect = crypto.createHmac('sha256', getSecret()).update(body).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const obj = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!obj || typeof obj.exp !== 'number' || obj.exp < Date.now()) return null;
    return obj;
  } catch (e) { return null; }
}

export function issueStaffSession(staff) {
  return sign({
    typ: 'staff',
    uid: staff.uid,
    handle: staff.handle,
    name: staff.name,
    role: staff.role || 'member',
    exp: Date.now() + SESSION_HOURS * 3600 * 1000
  });
}

export function verifyStaffSession(token) {
  const t = unsign(token);
  return t && t.typ === 'staff' ? t : null;
}

export function issueTeamUnlock({ teamId, uid, handle, name }) {
  return {
    token: sign({
      typ: 'team',
      teamId,
      uid,
      handle,
      name,
      exp: Date.now() + UNLOCK_HOURS * 3600 * 1000
    }),
    expiresAt: Date.now() + UNLOCK_HOURS * 3600 * 1000
  };
}

export function verifyTeamUnlock(token, teamId) {
  const t = unsign(token);
  if (!t || t.typ !== 'team') return null;
  if (teamId && t.teamId !== teamId) return null;
  return t;
}

// --------------------------------------------------------------------------- audit
export function authAudit(event) {
  try {
    ensureDir();
    const line = JSON.stringify({
      at: new Date().toISOString(),
      action: String(event.action || 'event').slice(0, 60),
      handle: String(event.handle || '').slice(0, 60),
      teamId: String(event.teamId || '').slice(0, 80),
      ok: event.ok !== false,
      note: String(event.note || '').slice(0, 200)
    }) + '\n';
    fs.appendFileSync(AUDIT_FILE, line, { mode: 0o600 });
  } catch (e) { /* audit must never break a login */ }
}

export function recentAuthEvents(max = 100) {
  try {
    if (!fs.existsSync(AUDIT_FILE)) return [];
    const lines = fs.readFileSync(AUDIT_FILE, 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-max).reverse().map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
  } catch (e) { return []; }
}

// --------------------------------------------------------------------------- staff records
export function loadStaff() {
  const db = readJson(STAFF_FILE, { staff: {} });
  return db.staff && typeof db.staff === 'object' ? db.staff : {};
}

function saveStaff(staff) {
  writeJson(STAFF_FILE, { staff, updatedAt: Date.now() });
}

const publicStaff = (r) => ({
  uid: r.uid, handle: r.handle, name: r.name, role: r.role || 'member',
  teamIds: r.teamIds || [], active: r.active !== false,
  createdAt: r.createdAt || 0, updatedAt: r.updatedAt || 0,
  hasPassword: !!r.hash, lockedUntil: r.lockedUntil || 0
});

export function listStaff() {
  return Object.values(loadStaff()).map(publicStaff).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export function getStaffByHandle(handle) {
  const h = normalizeHandle(handle);
  return loadStaff()[h] || null;
}

export function getStaffByUid(uid) {
  return Object.values(loadStaff()).find(r => r.uid === uid) || null;
}

// Create or update a staff member. `password` is optional on update (keeps the old one).
export function upsertStaff({ handle, name, password, role = 'member', teamIds = [], active = true, uid = '' }) {
  const h = normalizeHandle(handle || name);
  if (!h || h.length < 2) throw new Error('Name must be at least 2 characters.');
  if (!String(name || '').trim()) throw new Error('A display name is required.');

  const staff = loadStaff();
  const existing = staff[h] || null;

  if (!existing && !password) throw new Error('A password is required for a new staff member.');
  if (password && String(password).length < 6) throw new Error('Password must be at least 6 characters.');

  const rec = existing || {
    uid: uid || ('staff_' + crypto.randomBytes(9).toString('hex')),
    handle: h,
    createdAt: Date.now()
  };

  rec.name = String(name).trim().slice(0, 60);
  rec.role = role === 'owner' ? 'owner' : (role === 'admin' ? 'admin' : 'member');
  rec.teamIds = Array.isArray(teamIds) ? teamIds.map(t => String(t).slice(0, 80)).slice(0, 50) : (rec.teamIds || []);
  rec.active = active !== false;
  rec.updatedAt = Date.now();

  if (password) {
    const h2 = hashPassword(password);
    rec.salt = h2.salt; rec.hash = h2.hash; rec.algo = h2.algo;
    rec.failedAttempts = 0; rec.lockedUntil = 0;
    rec.passwordChangedAt = Date.now();
  }

  staff[h] = rec;
  saveStaff(staff);
  authAudit({ action: existing ? 'staff_updated' : 'staff_created', handle: h, note: existing ? '' : 'uid=' + rec.uid });
  return publicStaff(rec);
}

export function deleteStaff(handle) {
  const h = normalizeHandle(handle);
  const staff = loadStaff();
  if (!staff[h]) throw new Error('Staff member not found.');
  if (staff[h].role === 'owner' && Object.values(staff).filter(s => s.role === 'owner').length <= 1) {
    throw new Error('Cannot delete the only owner account.');
  }
  delete staff[h];
  saveStaff(staff);
  authAudit({ action: 'staff_deleted', handle: h });
  return true;
}

// --------------------------------------------------------------------------- login
export function loginStaff(handle, password) {
  const h = normalizeHandle(handle);
  const staff = loadStaff();
  const rec = staff[h];

  if (!rec) {
    authAudit({ action: 'login_failed', handle: h, ok: false, note: 'unknown name' });
    // Same message + timing shape as a wrong password, so names cannot be enumerated.
    verifyPassword(String(password || ''), { salt: '00'.repeat(16), hash: '00'.repeat(64) });
    throw new Error('Name or password is incorrect.');
  }

  if (rec.active === false) {
    authAudit({ action: 'login_blocked', handle: h, ok: false, note: 'inactive' });
    throw new Error('This account is disabled. Ask the owner.');
  }

  if (rec.lockedUntil && rec.lockedUntil > Date.now()) {
    const mins = Math.ceil((rec.lockedUntil - Date.now()) / 60000);
    authAudit({ action: 'login_blocked', handle: h, ok: false, note: 'locked' });
    throw new Error('Too many wrong attempts. Try again in ' + mins + ' minute(s).');
  }

  if (!verifyPassword(String(password || ''), rec)) {
    rec.failedAttempts = (rec.failedAttempts || 0) + 1;
    if (rec.failedAttempts >= MAX_FAILED) {
      rec.lockedUntil = Date.now() + LOCK_MINUTES * 60000;
      rec.failedAttempts = 0;
      authAudit({ action: 'login_locked', handle: h, ok: false, note: LOCK_MINUTES + 'min' });
      staff[h] = rec;
      saveStaff(staff);
      throw new Error('Too many wrong attempts. Try again in ' + LOCK_MINUTES + ' minute(s).');
    }
    authAudit({ action: 'login_failed', handle: h, ok: false, note: 'attempt ' + rec.failedAttempts });
    staff[h] = rec;
    saveStaff(staff);
    throw new Error('Name or password is incorrect.');
  }

  rec.failedAttempts = 0;
  rec.lockedUntil = 0;
  rec.lastLoginAt = Date.now();
  staff[h] = rec;
  saveStaff(staff);

  authAudit({ action: 'login_ok', handle: h });
  return {
    session: issueStaffSession(rec),
    staff: publicStaff(rec),
    expiresIn: SESSION_HOURS * 3600
  };
}

// --------------------------------------------------------------------------- team password
// Team passwords live in the same protected data directory (never Firestore).
export function loadTeams() {
  const db = readJson(TEAMS_FILE, { teams: {} });
  return db.teams && typeof db.teams === 'object' ? db.teams : {};
}

function saveTeams(teams) { writeJson(TEAMS_FILE, { teams, updatedAt: Date.now() }); }

export function setTeamPassword(teamId, password, { name = '' } = {}) {
  const id = String(teamId || '').trim().slice(0, 80);
  if (!id) throw new Error('A team id is required.');
  if (String(password || '').length < 6) throw new Error('Team password must be at least 6 characters.');
  const teams = loadTeams();
  const rec = teams[id] || { teamId: id, createdAt: Date.now() };
  const h = hashPassword(password);
  rec.salt = h.salt; rec.hash = h.hash; rec.algo = h.algo;
  rec.name = String(name || rec.name || '').slice(0, 60);
  rec.updatedAt = Date.now();
  teams[id] = rec;
  saveTeams(teams);
  authAudit({ action: 'team_password_set', teamId: id });
  return { teamId: id, name: rec.name, updatedAt: rec.updatedAt };
}

export function teamHasPassword(teamId) {
  const t = loadTeams()[String(teamId || '')];
  return !!(t && t.hash);
}

export function unlockTeam({ teamId, password, staff }) {
  const id = String(teamId || '').trim();
  const teams = loadTeams();
  const rec = teams[id];

  if (!rec || !rec.hash) {
    authAudit({ action: 'team_unlock_failed', teamId: id, handle: staff && staff.handle, ok: false, note: 'no password set' });
    throw new Error('This team has no password yet. The owner must set one first.');
  }

  if (rec.lockedUntil && rec.lockedUntil > Date.now()) {
    const mins = Math.ceil((rec.lockedUntil - Date.now()) / 60000);
    throw new Error('Too many wrong attempts. Try again in ' + mins + ' minute(s).');
  }

  if (!verifyPassword(String(password || ''), rec)) {
    rec.failedAttempts = (rec.failedAttempts || 0) + 1;
    if (rec.failedAttempts >= MAX_FAILED) {
      rec.lockedUntil = Date.now() + LOCK_MINUTES * 60000;
      rec.failedAttempts = 0;
    }
    teams[id] = rec;
    saveTeams(teams);
    authAudit({ action: 'team_unlock_failed', teamId: id, handle: staff && staff.handle, ok: false });
    throw new Error('Team password is incorrect.');
  }

  rec.failedAttempts = 0;
  rec.lockedUntil = 0;
  teams[id] = rec;
  saveTeams(teams);

  const out = issueTeamUnlock({ teamId: id, uid: staff.uid, handle: staff.handle, name: staff.name });
  authAudit({ action: 'team_unlock_ok', teamId: id, handle: staff.handle });
  return out;
}
