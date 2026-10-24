// One-time: move private tasks from a member's legacy Firebase account to their
// AlignTasks staff uid, so signing in with the name + password shows them again.
//
//   node deploy/migrate-personal-tasks.mjs --dry
//   node deploy/migrate-personal-tasks.mjs
import fs from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const sa = JSON.parse(fs.readFileSync('/opt/whatanagent-data/serviceAccountKey.json', 'utf8'));
initializeApp({ credential: cert(sa), projectId: sa.project_id });
const db = getFirestore();

const BASE = 'artifacts/1:410197132578:web:97cfc3ae33f39ed3df917b/public/data';
const DRY = process.argv.includes('--dry');
const staff = JSON.parse(fs.readFileSync('/opt/whatanagent/data/alignStaff.json', 'utf8')).staff || {};

// alias email -> staff record
const byAlias = {};
for (const r of Object.values(staff)) {
  for (const a of (r.aliases || [])) byAlias[String(a).toLowerCase()] = r;
}

const users = await db.collection(`${BASE}/users`).limit(500).get();
let moved = 0;

for (const u of users.docs) {
  const email = String((u.data() || {}).email || '').toLowerCase();
  const target = byAlias[email];
  if (!target || !target.uid || target.uid === u.id) continue;

  const src = await db.collection(`${BASE}/users/${u.id}/personal_tasks`).limit(300).get();
  if (src.empty) continue;
  console.log(`\n${email}: ${src.size} task(s)  ${u.id} -> ${target.uid} (${target.name})`);

  for (const doc of src.docs) {
    const data = Object.assign({}, doc.data() || {}, {
      createdByName: (doc.data() || {}).createdByName && (doc.data() || {}).createdByName !== 'Unknown'
        ? (doc.data() || {}).createdByName
        : target.name,
      ownerName: target.name,
      ownerUid: target.uid,
      movedFromUid: u.id
    });
    if (DRY) {
      console.log('  would move', doc.id, '-', String(data.description || '').slice(0, 40));
    } else {
      await db.collection(`${BASE}/users/${target.uid}/personal_tasks`).doc(doc.id).set(data, { merge: true });
      await doc.ref.delete();
    }
    moved++;
  }
}

console.log('\nmoved:', moved, DRY ? '(DRY RUN — nothing written)' : '');
process.exit(0);
