// ============================================================================
// ⚙️ GDrive Service Centre — SQLite store
// ============================================================================
// A completely separate database file (data/gdrive-service.db). No existing
// table, route or environment variable is touched.
//
// Tables
//   gdrive_accounts   one row per connected Google Drive
//   gdrive_clients    one row per external app allowed to use a drive
//   gdrive_files      one row per uploaded file (the queue + retention state)
//   gdrive_audit      append-only trail of security-relevant actions
//
// File lifecycle (gdrive_files.status)
//   QUEUED              on VPS, waiting for the worker
//   UPLOADING           worker is streaming it to Google
//   UPLOADED_VERIFIED   on both VPS and Drive, checksum confirmed
//   ARCHIVED_ON_GDRIVE  VPS copy deleted after retention, Drive copy confirmed
//   FAILED              gave up after the retry budget (manual retry allowed)
// ============================================================================
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.CANDL_DATA_DIR || path.resolve(process.cwd(), 'data');
export const DB_PATH = process.env.GDRIVE_DB_PATH || path.join(DATA_DIR, 'gdrive-service.db');
export const CACHE_ROOT = process.env.GDRIVE_CACHE_DIR || path.join(DATA_DIR, 'gdrive-cache');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.mkdirSync(CACHE_ROOT, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS gdrive_accounts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  alias            TEXT NOT NULL,
  email            TEXT NOT NULL,
  client_id        TEXT NOT NULL,
  client_secret    TEXT NOT NULL,
  refresh_token    TEXT NOT NULL,
  root_folder_id   TEXT DEFAULT '',
  retention_hours  INTEGER NOT NULL DEFAULT 24,
  quota_alert_gb   REAL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'active',
  last_health      TEXT DEFAULT 'unknown',
  last_error       TEXT DEFAULT '',
  last_checked_at  INTEGER DEFAULT 0,
  quota_used       INTEGER DEFAULT 0,
  quota_total      INTEGER DEFAULT 0,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS gdrive_clients (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  drive_id      INTEGER NOT NULL REFERENCES gdrive_accounts(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  serial        TEXT NOT NULL UNIQUE,
  key_hash      TEXT NOT NULL,
  key_hint      TEXT NOT NULL,
  folder_id     TEXT DEFAULT '',
  folder_name   TEXT DEFAULT '',
  scope         TEXT NOT NULL DEFAULT 'read_upload',
  rate_limit    INTEGER NOT NULL DEFAULT 60,
  expires_at    INTEGER DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'active',
  files_count   INTEGER NOT NULL DEFAULT 0,
  bytes_used    INTEGER NOT NULL DEFAULT 0,
  last_used_at  INTEGER DEFAULT 0,
  created_at    INTEGER NOT NULL,
  revoked_at    INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS gdrive_files (
  id                TEXT PRIMARY KEY,
  drive_id          INTEGER NOT NULL REFERENCES gdrive_accounts(id) ON DELETE CASCADE,
  client_id         INTEGER REFERENCES gdrive_clients(id) ON DELETE SET NULL,
  client_name       TEXT DEFAULT '',
  original_name     TEXT NOT NULL,
  mime              TEXT DEFAULT 'application/octet-stream',
  size              INTEGER NOT NULL DEFAULT 0,
  local_path        TEXT NOT NULL,
  md5               TEXT DEFAULT '',
  gdrive_file_id    TEXT DEFAULT '',
  gdrive_folder_id  TEXT DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'QUEUED',
  attempts          INTEGER NOT NULL DEFAULT 0,
  next_attempt_at   INTEGER DEFAULT 0,
  error             TEXT DEFAULT '',
  downloads         INTEGER NOT NULL DEFAULT 0,
  created_at        INTEGER NOT NULL,
  uploaded_at       INTEGER DEFAULT 0,
  verified_at       INTEGER DEFAULT 0,
  cleaned_at        INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS gdrive_audit (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  drive_id   INTEGER,
  client_id  INTEGER,
  action     TEXT NOT NULL,
  detail     TEXT DEFAULT '',
  ip         TEXT DEFAULT '',
  at         INTEGER NOT NULL
);

-- One row per (client, subfolder name) so a per-branch folder is looked up
-- once and then reused without another Drive search.
CREATE TABLE IF NOT EXISTS gdrive_subfolders (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id  INTEGER NOT NULL REFERENCES gdrive_clients(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  folder_id  TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(client_id, name)
);

CREATE INDEX IF NOT EXISTS idx_files_queue ON gdrive_files(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_files_drive ON gdrive_files(drive_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_cleanup ON gdrive_files(status, uploaded_at);
CREATE INDEX IF NOT EXISTS idx_clients_drive ON gdrive_clients(drive_id);
CREATE INDEX IF NOT EXISTS idx_audit_drive ON gdrive_audit(drive_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_subfolders_client ON gdrive_subfolders(client_id);
`);

// Columns added after the first release, added in place on an existing database.
function ensureColumn(table, column, definition) {
  const cols = db.prepare('PRAGMA table_info(' + table + ')').all();
  if (!cols.some((c) => c.name === column)) {
    db.exec('ALTER TABLE ' + table + ' ADD COLUMN ' + column + ' ' + definition);
  }
}
ensureColumn('gdrive_files', 'subfolder', "TEXT DEFAULT ''");

const now = () => Date.now();

// ── accounts ────────────────────────────────────────────────────────────────
export function listAccounts() {
  return db.prepare('SELECT * FROM gdrive_accounts ORDER BY id ASC').all();
}

export function getAccount(id) {
  return db.prepare('SELECT * FROM gdrive_accounts WHERE id = ?').get(Number(id)) || null;
}

export function insertAccount(a) {
  const t = now();
  const res = db.prepare(`INSERT INTO gdrive_accounts
    (alias, email, client_id, client_secret, refresh_token, root_folder_id, retention_hours,
     quota_alert_gb, status, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    a.alias, a.email, a.client_id, a.client_secret, a.refresh_token,
    a.root_folder_id || '', Number(a.retention_hours) || 24,
    Number(a.quota_alert_gb) || 0, a.status === 'inactive' ? 'inactive' : 'active', t, t
  );
  return getAccount(Number(res.lastInsertRowid));
}

export function updateAccount(id, patch) {
  const allowed = ['alias', 'email', 'client_id', 'client_secret', 'refresh_token', 'root_folder_id',
    'retention_hours', 'quota_alert_gb', 'status', 'last_health', 'last_error', 'last_checked_at',
    'quota_used', 'quota_total'];
  const sets = [];
  const vals = [];
  for (const k of allowed) {
    if (patch[k] === undefined) continue;
    sets.push(k + ' = ?');
    vals.push(patch[k]);
  }
  if (!sets.length) return getAccount(id);
  sets.push('updated_at = ?');
  vals.push(now());
  vals.push(Number(id));
  db.prepare(`UPDATE gdrive_accounts SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  return getAccount(id);
}

export function deleteAccount(id) {
  const files = db.prepare('SELECT local_path FROM gdrive_files WHERE drive_id = ?').all(Number(id));
  db.prepare('DELETE FROM gdrive_accounts WHERE id = ?').run(Number(id));
  for (const f of files) {
    try { if (f.local_path && fs.existsSync(f.local_path)) fs.unlinkSync(f.local_path); } catch (e) { /* gone */ }
  }
}

// ── clients ─────────────────────────────────────────────────────────────────
export function listClients(driveId) {
  return db.prepare('SELECT * FROM gdrive_clients WHERE drive_id = ? ORDER BY id ASC').all(Number(driveId));
}

export function getClient(id) {
  return db.prepare('SELECT * FROM gdrive_clients WHERE id = ?').get(Number(id)) || null;
}

export function getClientBySerial(serial) {
  return db.prepare('SELECT * FROM gdrive_clients WHERE serial = ?').get(String(serial)) || null;
}

export function insertClient(c) {
  const res = db.prepare(`INSERT INTO gdrive_clients
    (drive_id, name, serial, key_hash, key_hint, folder_id, folder_name, scope, rate_limit,
     expires_at, status, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    Number(c.drive_id), c.name, c.serial, c.key_hash, c.key_hint,
    c.folder_id || '', c.folder_name || '', c.scope || 'read_upload',
    Number(c.rate_limit) || 60, Number(c.expires_at) || 0,
    c.status || 'active', now()
  );
  return getClient(Number(res.lastInsertRowid));
}

export function updateClient(id, patch) {
  const allowed = ['name', 'key_hash', 'key_hint', 'folder_id', 'folder_name', 'scope', 'rate_limit',
    'expires_at', 'status', 'files_count', 'bytes_used', 'last_used_at', 'revoked_at'];
  const sets = [];
  const vals = [];
  for (const k of allowed) {
    if (patch[k] === undefined) continue;
    sets.push(k + ' = ?');
    vals.push(patch[k]);
  }
  if (!sets.length) return getClient(id);
  vals.push(Number(id));
  db.prepare(`UPDATE gdrive_clients SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  return getClient(id);
}

export function deleteClient(id) {
  db.prepare('DELETE FROM gdrive_clients WHERE id = ?').run(Number(id));
}

// ── subfolders (one per branch / project inside a client folder) ─────────────
export function getSubfolder(clientId, name) {
  return db.prepare('SELECT * FROM gdrive_subfolders WHERE client_id = ? AND name = ?')
    .get(Number(clientId), String(name)) || null;
}

export function saveSubfolder(clientId, name, folderId) {
  db.prepare(`INSERT INTO gdrive_subfolders (client_id, name, folder_id, created_at)
    VALUES (?,?,?,?)
    ON CONFLICT(client_id, name) DO UPDATE SET folder_id = excluded.folder_id`)
    .run(Number(clientId), String(name), String(folderId), now());
  return getSubfolder(clientId, name);
}

export function listSubfolders(clientId) {
  return db.prepare('SELECT * FROM gdrive_subfolders WHERE client_id = ? ORDER BY name ASC').all(Number(clientId));
}

export function bumpClientUsage(clientId, bytes) {
  db.prepare('UPDATE gdrive_clients SET files_count = files_count + 1, bytes_used = bytes_used + ?, last_used_at = ? WHERE id = ?')
    .run(Number(bytes) || 0, now(), Number(clientId));
}

// ── files ───────────────────────────────────────────────────────────────────
export function insertFile(f) {
  db.prepare(`INSERT INTO gdrive_files
    (id, drive_id, client_id, client_name, original_name, mime, size, local_path, md5,
     gdrive_folder_id, subfolder, status, next_attempt_at, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    f.id, Number(f.drive_id), f.client_id ? Number(f.client_id) : null, f.client_name || '',
    f.original_name, f.mime || 'application/octet-stream', Number(f.size) || 0, f.local_path,
    f.md5 || '', f.gdrive_folder_id || '', f.subfolder || '', 'QUEUED', now(), now()
  );
  return getFile(f.id);
}

export function getFile(id) {
  return db.prepare('SELECT * FROM gdrive_files WHERE id = ?').get(String(id)) || null;
}

export function listFiles(driveId, limit = 50) {
  return db.prepare('SELECT * FROM gdrive_files WHERE drive_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(Number(driveId), Math.max(1, Math.min(Number(limit) || 50, 500)));
}

export function updateFile(id, patch) {
  const allowed = ['status', 'attempts', 'next_attempt_at', 'error', 'gdrive_file_id', 'gdrive_folder_id',
    'md5', 'uploaded_at', 'verified_at', 'cleaned_at', 'downloads', 'size', 'local_path', 'subfolder'];
  const sets = [];
  const vals = [];
  for (const k of allowed) {
    if (patch[k] === undefined) continue;
    sets.push(k + ' = ?');
    vals.push(patch[k]);
  }
  if (!sets.length) return getFile(id);
  vals.push(String(id));
  db.prepare(`UPDATE gdrive_files SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  return getFile(id);
}

export function deleteFileRow(id) {
  db.prepare('DELETE FROM gdrive_files WHERE id = ?').run(String(id));
}

/** Next jobs the worker should pick up. */
export function dueJobs(limit = 3) {
  return db.prepare(`SELECT * FROM gdrive_files
    WHERE status = 'QUEUED' AND next_attempt_at <= ?
    ORDER BY created_at ASC LIMIT ?`).all(now(), Math.max(1, Number(limit) || 1));
}

/** Files whose retention window has elapsed and whose VPS copy can be removed. */
export function filesReadyForCleanup(limit = 20) {
  return db.prepare(`SELECT f.*, a.retention_hours FROM gdrive_files f
    JOIN gdrive_accounts a ON a.id = f.drive_id
    WHERE f.status = 'UPLOADED_VERIFIED'
      AND f.uploaded_at > 0
      AND (f.uploaded_at + (a.retention_hours * 3600000)) <= ?
    ORDER BY f.uploaded_at ASC LIMIT ?`).all(now(), Math.max(1, Number(limit) || 10));
}

export function fileStats(driveId) {
  const byStatus = db.prepare(`SELECT status, COUNT(*) AS n, COALESCE(SUM(size),0) AS bytes
    FROM gdrive_files WHERE drive_id = ? GROUP BY status`).all(Number(driveId));
  const out = { queued: 0, uploading: 0, uploaded: 0, archived: 0, failed: 0, cache_bytes: 0 };
  for (const r of byStatus) {
    if (r.status === 'QUEUED') out.queued = r.n;
    if (r.status === 'UPLOADING') out.uploading = r.n;
    if (r.status === 'UPLOADED_VERIFIED') out.uploaded = r.n;
    if (r.status === 'ARCHIVED_ON_GDRIVE') out.archived = r.n;
    if (r.status === 'FAILED') out.failed = r.n;
  }
  const local = db.prepare(`SELECT COALESCE(SUM(size),0) AS b FROM gdrive_files
    WHERE drive_id = ? AND local_path != '' AND status IN ('QUEUED','UPLOADING','UPLOADED_VERIFIED')`)
    .get(Number(driveId));
  out.cache_bytes = Number(local && local.b) || 0;
  return out;
}

export function clientStats(driveId) {
  const r = db.prepare(`SELECT COUNT(*) AS n FROM gdrive_clients WHERE drive_id = ? AND status = 'active'`)
    .get(Number(driveId));
  return { active: Number(r && r.n) || 0 };
}

// ── audit ───────────────────────────────────────────────────────────────────
export function audit(entry) {
  try {
    db.prepare('INSERT INTO gdrive_audit (drive_id, client_id, action, detail, ip, at) VALUES (?,?,?,?,?,?)')
      .run(entry.drive_id ? Number(entry.drive_id) : null,
        entry.client_id ? Number(entry.client_id) : null,
        String(entry.action || 'event').slice(0, 60),
        String(entry.detail || '').slice(0, 500),
        String(entry.ip || '').slice(0, 60),
        now());
  } catch (e) { /* never let logging break a request */ }
}

export function listAudit(driveId, clientId, limit = 100) {
  if (clientId) {
    return db.prepare('SELECT * FROM gdrive_audit WHERE client_id = ? ORDER BY at DESC LIMIT ?')
      .all(Number(clientId), Math.max(1, Math.min(Number(limit) || 100, 500)));
  }
  return db.prepare('SELECT * FROM gdrive_audit WHERE drive_id = ? ORDER BY at DESC LIMIT ?')
    .all(Number(driveId), Math.max(1, Math.min(Number(limit) || 100, 500)));
}

export default db;
