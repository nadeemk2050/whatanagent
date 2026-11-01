// ============================================================================
// 📇 CONTACT BOOK STORE — SQLite on the VPS (free, instant, no Firestore reads)
// The contact book holds thousands of rows and is listed in full on every
// dashboard load, so keeping it in Firestore costs one read per contact per page
// view. This module keeps the whole book in one local SQLite file instead
// (default: <repo>/data/contactbook.db, gitignored so deploys never wipe it).
// Firestore remains the one-time migration source and the automatic fallback
// when node:sqlite is unavailable (older Node, other hosts).
// ============================================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, writeBatch } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const digits = (v) => String(v == null ? '' : v).replace(/\D/g, '');
const now = () => Date.now();

let sqlite = null;          // { db, stmts }
let firestoreDb = null;     // fallback + migration source
let mode = 'none';          // 'sqlite' | 'firestore' | 'none'
let listCache = { at: 0, rows: null };
const LIST_CACHE_MS = 4000;

const DB_PATH = process.env.CONTACT_DB_PATH || path.join(__dirname, 'data', 'contactbook.db');

function openSqlite() {
  let DatabaseSync;
  try { ({ DatabaseSync } = require('node:sqlite')); } catch (e) { return null; }
  if (!DatabaseSync) return null;
  try {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    const db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = NORMAL');
    db.exec('CREATE TABLE IF NOT EXISTS contacts (phone TEXT PRIMARY KEY, doc TEXT NOT NULL, updated_at INTEGER, created_at INTEGER)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_contacts_updated ON contacts(updated_at DESC)');
    const stmts = {
      get: db.prepare('SELECT doc FROM contacts WHERE phone = ?'),
      all: db.prepare('SELECT doc FROM contacts ORDER BY updated_at DESC'),
      phones: db.prepare('SELECT phone FROM contacts'),
      del: db.prepare('DELETE FROM contacts WHERE phone = ?'),
      count: db.prepare('SELECT COUNT(*) AS n FROM contacts'),
      put: db.prepare('INSERT INTO contacts (phone, doc, updated_at, created_at) VALUES (?, ?, ?, ?) ' +
        'ON CONFLICT(phone) DO UPDATE SET doc = excluded.doc, updated_at = excluded.updated_at')
    };
    return { db, stmts };
  } catch (e) {
    console.warn('[CONTACT-DB] SQLite unavailable (' + (e.message || e).slice(0, 120) + ') - using Firestore');
    return null;
  }
}

export function initContactStore(firestoreHandle) {
  if (firestoreHandle) firestoreDb = firestoreHandle;
  if (sqlite || mode !== 'none') return getContactStoreInfo();
  sqlite = openSqlite();
  mode = sqlite ? 'sqlite' : (firestoreDb ? 'firestore' : 'none');
  if (mode === 'sqlite') console.log('[CONTACT-DB] 📇 Contact Book on local SQLite: ' + DB_PATH);
  if (mode === 'sqlite' && firestoreDb) {
    // One-time move of the existing Firestore book into SQLite (background)
    migrateFromFirestore().catch(e => console.warn('[CONTACT-DB] migration skipped:', (e.message || e).slice(0, 160)));
  }
  return getContactStoreInfo();
}

export function getContactStoreInfo() {
  let rows = 0;
  try { if (sqlite) rows = sqlite.stmts.count.get().n; } catch (e) { /* ignore */ }
  return { mode, path: mode === 'sqlite' ? DB_PATH : '', contacts: rows };
}

function touch() { listCache = { at: 0, rows: null }; }

function parseDoc(phone, docStr) {
  try {
    const d = JSON.parse(docStr) || {};
    return { id: phone, ...d, phone: d.phone || phone };
  } catch (e) { return { id: phone, phone }; }
}

// ---------------------------------------------------------------- reads
export async function listContacts({ fresh = false } = {}) {
  if (sqlite) {
    if (!fresh && listCache.rows && now() - listCache.at < LIST_CACHE_MS) return listCache.rows;
    const rows = sqlite.stmts.all.all().map(r => parseDoc('', r.doc));
    listCache = { at: now(), rows };
    return rows;
  }
  if (!firestoreDb) return [];
  const snap = await getDocs(collection(firestoreDb, 'contactBook'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getContact(phoneIn) {
  const phone = digits(phoneIn);
  if (!phone) return null;
  if (sqlite) {
    const r = sqlite.stmts.get.get(phone);
    return r ? parseDoc(phone, r.doc) : null;
  }
  if (!firestoreDb) return null;
  const snap = await getDoc(doc(firestoreDb, 'contactBook', phone));
  return snap.exists() ? { id: phone, ...snap.data() } : null;
}

export async function contactCount() {
  if (sqlite) { try { return sqlite.stmts.count.get().n; } catch (e) { return 0; } }
  if (!firestoreDb) return 0;
  try { return (await getDocs(collection(firestoreDb, 'contactBook'))).size; } catch (e) { return 0; }
}

export async function contactPhones() {
  const set = new Set();
  if (sqlite) {
    sqlite.stmts.phones.all().forEach(r => set.add(String(r.phone)));
    return set;
  }
  if (!firestoreDb) return set;
  const snap = await getDocs(collection(firestoreDb, 'contactBook'));
  snap.forEach(d => set.add(digits((d.data() || {}).phone || d.id)));
  return set;
}

// ---------------------------------------------------------------- writes
function writeOne(phone, data, { merge = true } = {}) {
  let prev = {};
  if (merge) {
    const r = sqlite.stmts.get.get(phone);
    if (r) { try { prev = JSON.parse(r.doc) || {}; } catch (e) { prev = {}; } }
  }
  const next = merge ? { ...prev, ...data } : { ...data };
  next.phone = next.phone || phone;
  next.createdAt = prev.createdAt || next.createdAt || now();
  sqlite.stmts.put.run(phone, JSON.stringify(next), now(), next.createdAt);
  return next;
}

export async function setContact(phoneIn, dataIn, opts = {}) {
  const phone = digits(phoneIn || (dataIn && dataIn.phone));
  if (!phone) return null;
  if (sqlite) {
    const out = writeOne(phone, dataIn || {}, opts);
    touch();
    return { id: phone, ...out };
  }
  if (!firestoreDb) return null;
  const ref = doc(firestoreDb, 'contactBook', phone);
  const existing = opts.merge === false ? null : await getDoc(ref);
  const payload = { ...(dataIn || {}) };
  if (opts.merge !== false && existing && existing.exists() && !payload.createdAt) payload.createdAt = existing.data().createdAt || now();
  await setDoc(ref, payload, { merge: opts.merge !== false });
  return { id: phone, ...payload, phone };
}

export async function deleteContact(phoneIn) {
  const phone = digits(phoneIn);
  if (!phone) return false;
  if (sqlite) {
    sqlite.stmts.del.run(phone);
    touch();
    return true;
  }
  if (!firestoreDb) return false;
  await deleteDoc(doc(firestoreDb, 'contactBook', phone));
  return true;
}

// Bulk merge (imports / sync). One transaction: thousands of rows in milliseconds.
export async function bulkSetContacts(rows, { merge = true } = {}) {
  const list = Array.isArray(rows) ? rows.filter(r => r && digits(r.phone).length >= 6) : [];
  if (!list.length) return { written: 0 };
  if (sqlite) {
    const { db, stmts } = sqlite;
    db.exec('BEGIN');
    try {
      for (const r of list) {
        const phone = digits(r.phone);
        let prev = {};
        if (merge) {
          const ex = stmts.get.get(phone);
          if (ex) { try { prev = JSON.parse(ex.doc) || {}; } catch (e) { prev = {}; } }
        }
        const next = merge ? { ...prev, ...r } : { ...r };
        next.phone = phone;
        next.createdAt = prev.createdAt || next.createdAt || now();
        stmts.put.run(phone, JSON.stringify(next), now(), next.createdAt);
      }
      db.exec('COMMIT');
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch (e2) { /* ignore */ }
      throw e;
    }
    touch();
    return { written: list.length };
  }
  if (!firestoreDb) return { written: 0 };
  for (let i = 0; i < list.length; i += 400) {
    const batch = writeBatch(firestoreDb);
    list.slice(i, i + 400).forEach(r => batch.set(doc(firestoreDb, 'contactBook', digits(r.phone)), r, { merge }));
    await batch.commit();
  }
  return { written: list.length };
}

// ---------------------------------------------------------------- migration
export async function migrateFromFirestore() {
  if (!sqlite || !firestoreDb) return { moved: 0 };
  let already = 0;
  try { already = sqlite.stmts.count.get().n; } catch (e) { already = 0; }
  if (already > 0) return { moved: 0, skipped: already };
  let snap;
  try { snap = await getDocs(collection(firestoreDb, 'contactBook')); } catch (e) {
    console.warn('[CONTACT-DB] Firestore read failed, nothing migrated:', (e.message || e).slice(0, 160));
    return { moved: 0 };
  }
  const rows = snap.docs.map(d => ({ ...d.data(), phone: digits((d.data() || {}).phone || d.id) })).filter(r => r.phone);
  if (!rows.length) return { moved: 0 };
  await bulkSetContacts(rows, { merge: true });
  console.log('[CONTACT-DB] ✅ Migrated ' + rows.length + ' contacts from Firestore to local SQLite (one-time).');
  return { moved: rows.length };
}

export function isContactDbLocal() { return mode === 'sqlite'; }
export function contactDbPath() { return mode === 'sqlite' ? DB_PATH : ''; }
