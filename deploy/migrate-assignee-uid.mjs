// One-time migration: map existing task assigneeEmail -> assigneeUid + stamps.
import fs from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const sa = JSON.parse(fs.readFileSync('/opt/whatanagent-data/serviceAccountKey.json', 'utf8'));
initializeApp({ credential: cert(sa), projectId: sa.project_id });
const db = getFirestore();

const BASE = 'artifacts/1:410197132578:web:97cfc3ae33f39ed3df917b/public/data';
const DRY = process.argv.includes('--dry');

// Staff file written by alignAuth.mjs
const staffFile = '/opt/whatanagent/data/alignStaff.json';
const staff = fs.existsSync(staffFile) ? (JSON.parse(fs.readFileSync(staffFile, 'utf8')).staff || {}) : {};
const byHandle = {};
const byUid = {};
const byAlias = {};
for (const [handle, r] of Object.entries(staff)) {
  byHandle[handle] = r;
  if (r.uid) byUid[r.uid] = r;
  byAlias[handle] = r;
  byAlias[String(r.name || '').trim().toLowerCase()] = r;
  for (const a of (r.aliases || [])) byAlias[String(a).trim().toLowerCase()] = r;
}
const lookup = (value) => byAlias[String(value || '').trim().toLowerCase()] || null;
console.log('staff records:', Object.keys(byHandle).length, Object.keys(byHandle).join(', '));

let scanned = 0, updated = 0, unmatched = 0, alreadyOk = 0;
const unmatchedNames = new Set();

async function migrate(colName) {
  const snap = await db.collection(`${BASE}/${colName}`).limit(1000).get();
  console.log(`\n=== ${colName}: ${snap.size} documents ===`);
  for (const doc of snap.docs) {
    scanned++;
    const t = doc.data() || {};
    const patch = {};

    // 1) assigneeUid from the existing assigneeEmail (which holds the handle)
    const key = String(t.assigneeEmail || '').trim().toLowerCase();
    if (key) {
      const rec = lookup(key);
      if (rec && rec.uid) {
        if (t.assigneeUid !== rec.uid) patch.assigneeUid = rec.uid;
        if (!t.assigneeName || t.assigneeName !== rec.name) patch.assigneeName = rec.name;
        if (!t.assigneeHandle || t.assigneeHandle !== rec.handle) patch.assigneeHandle = rec.handle;
      } else {
        unmatched++;
        unmatchedNames.add(key);
      }
    }

    // 2) creator stamps for legacy docs that only have an email
    if (t.createdBy && !t.createdByUid) {
      const c = lookup(t.createdBy);
      if (c && c.uid) {
        patch.createdByUid = c.uid;
        patch.createdByName = c.name;
        patch.createdByHandle = c.handle;
      }
    }
    // Their createdAt is a Firestore Timestamp already; keep it.

    if (Object.keys(patch).length === 0) { alreadyOk++; continue; }
    if (DRY) {
      console.log('  would patch', doc.id, JSON.stringify(patch).slice(0, 120));
    } else {
      await doc.ref.set(patch, { merge: true });
    }
    updated++;
  }
}

await migrate('tasks');
await migrate('tasks_for_all');

console.log('\n=== SUMMARY ===');
console.log('  scanned        :', scanned);
console.log('  patched        :', updated);
console.log('  already complete:', alreadyOk);
console.log('  assignee not found in staff list:', unmatched, unmatchedNames.size ? '(' + [...unmatchedNames].join(', ') + ')' : '');
console.log(DRY ? '\nDRY RUN — nothing written.' : '\nApplied.');
process.exit(0);
