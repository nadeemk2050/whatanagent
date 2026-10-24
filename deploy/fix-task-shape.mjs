// One-time: normalise task documents written by the API before it matched the board's
// vocabulary — numeric timestamps became Firestore Timestamps and 'Pending' became 'To Do'.
//
//   node deploy/fix-task-shape.mjs --dry
//   node deploy/fix-task-shape.mjs
import fs from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const sa = JSON.parse(fs.readFileSync('/opt/whatanagent-data/serviceAccountKey.json', 'utf8'));
initializeApp({ credential: cert(sa), projectId: sa.project_id });
const db = getFirestore();

const BASE = 'artifacts/1:410197132578:web:97cfc3ae33f39ed3df917b/public/data';
const DRY = process.argv.includes('--dry');
const DATE_FIELDS = ['createdAt', 'updatedAt', 'completedAt', 'assignedAt', 'reminderSentAt', 'waAnnounceSentAt'];

async function fixDoc(ref, data) {
  const patch = {};
  for (const f of DATE_FIELDS) {
    if (typeof data[f] === 'number') patch[f] = new Date(data[f]);
  }
  if (data.status === 'Pending') patch.status = 'To Do';
  if (!Object.keys(patch).length) return false;
  if (!DRY) await ref.set(patch, { merge: true });
  console.log('  ' + (DRY ? 'would fix ' : 'fixed ') + ref.path.split('/').pop() + ' ' + JSON.stringify(Object.keys(patch)));
  return true;
}

let total = 0;
for (const col of ['tasks', 'tasks_for_all']) {
  const snap = await db.collection(`${BASE}/${col}`).limit(500).get();
  let n = 0;
  for (const d of snap.docs) if (await fixDoc(d.ref, d.data() || {})) n++;
  console.log(`${col}: ${snap.size} docs, fixed ${n}`);
  total += n;
}

const users = await db.collection(`${BASE}/users`).limit(300).get();
for (const u of users.docs) {
  const snap = await db.collection(`${BASE}/users/${u.id}/personal_tasks`).limit(300).get();
  let n = 0;
  for (const d of snap.docs) if (await fixDoc(d.ref, d.data() || {})) n++;
  if (n) console.log(`personal (${u.id}): fixed ${n}`);
  total += n;
}

console.log('\ntotal fixed:', total, DRY ? '(DRY RUN — nothing written)' : '');
process.exit(0);
