// ============================================================================
// 🧹 CONTACT CLEANUP — remove bulk-imported vCard contacts, keep the rest
// ============================================================================
// The contact book was flooded by a phone/vCard import (10k+ rows). The owner
// wants only the contacts that matter: everyone fetched from WhatsApp Web,
// manual/Boss entries, AI-chat entries, AlignTasks staff and anything else
// that is NOT a bulk vCard import.
//
// Default behaviour is a DRY RUN: it prints what would be removed and writes
// a full JSON backup. Pass --apply to actually delete.
//
//   node scripts/contact-cleanup.mjs                 # dry run + counts
//   node scripts/contact-cleanup.mjs --apply         # delete + JSON backup
//   node scripts/contact-cleanup.mjs --source vCard --source "Old import"
//
// Safety:
//   • Only rows whose `source` is in the delete list are removed.
//   • Every removed row is written to data/backups/ before deletion.
//   • A phone that appears in a KEPT source is never removed (primary key makes
//     this impossible in practice, but the check stays as a guard).
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function argValues(name, fallback = []) {
  const out = [];
  process.argv.forEach((a, i) => {
    if (a === '--' + name && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) out.push(process.argv[i + 1]);
  });
  return out.length ? out : fallback;
}

const dbPath = argValues('db', [process.env.CONTACT_DB_PATH || path.join(process.cwd(), 'data', 'contactbook.db')])[0];
const deleteSources = argValues('source', ['vCard']);
const apply = process.argv.includes('--apply');

if (!fs.existsSync(dbPath)) {
  console.error('Contact DB not found: ' + dbPath);
  process.exit(1);
}

const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA busy_timeout = 5000');

const rows = db.prepare('SELECT phone, doc FROM contacts').all();
const bySource = new Map();
const parsed = [];
for (const r of rows) {
  let doc = {};
  try { doc = JSON.parse(r.doc) || {}; } catch (e) { doc = {}; }
  const src = String(doc.source || '(none)');
  bySource.set(src, (bySource.get(src) || 0) + 1);
  parsed.push({ phone: String(r.phone), doc });
}

const wanted = new Set(deleteSources.map(s => s.toLowerCase()));
const keptPhones = new Set(parsed.filter(p => !wanted.has(String(p.doc.source || '(none)').toLowerCase())).map(p => p.phone));
const targets = parsed.filter(p => wanted.has(String(p.doc.source || '(none)').toLowerCase()) && !keptPhones.has(p.phone));

console.log('Contact book: ' + dbPath);
console.log('Total rows: ' + parsed.length);
console.log('\nBy source:');
for (const [src, n] of Array.from(bySource.entries()).sort((a, b) => b[1] - a[1])) {
  console.log('  ' + (wanted.has(src.toLowerCase()) ? 'REMOVE' : 'keep  ') + '  ' + String(n).padStart(6) + '  ' + src);
}

console.log('\nDelete list: ' + deleteSources.join(', '));
console.log('Rows to remove: ' + targets.length + '   Rows to keep: ' + (parsed.length - targets.length));

if (!targets.length) {
  console.log('Nothing to do.');
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(path.dirname(dbPath), 'backups', 'contacts-removed-' + stamp + '.json');
fs.mkdirSync(path.dirname(backupPath), { recursive: true });
fs.writeFileSync(backupPath, JSON.stringify(targets.map(t => t.doc), null, 2));
console.log('\nBackup written: ' + backupPath + ' (' + targets.length + ' rows)');

if (!apply) {
  console.log('\nDRY RUN — nothing deleted. Re-run with --apply to remove them.');
  process.exit(0);
}

const del = db.prepare('DELETE FROM contacts WHERE phone = ?');
db.exec('BEGIN');
try {
  for (const t of targets) del.run(t.phone);
  db.exec('COMMIT');
} catch (e) {
  try { db.exec('ROLLBACK'); } catch (e2) { /* ignore */ }
  throw e;
}

const left = db.prepare('SELECT COUNT(*) AS n FROM contacts').get().n;
console.log('\n✅ Deleted ' + targets.length + ' rows. Remaining contacts: ' + left);
console.log('Restore any of them from: ' + backupPath);
