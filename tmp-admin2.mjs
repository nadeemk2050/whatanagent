import fs from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const sa = JSON.parse(fs.readFileSync(process.env.KEY_PATH, 'utf8'));
initializeApp({ credential: cert(sa), projectId: 'whatanagent-a1e59' });
const db = getFirestore();

const BASE = 'artifacts/1:410197132578:web:97cfc3ae33f39ed3df917b/public/data';

console.log('=== ADMIN SDK ACCESS TEST ===');

for (const col of ['tasks', 'tasks_for_all', 'staff', 'teams', 'users']) {
  try {
    const snap = await db.collection(`${BASE}/${col}`).limit(3).get();
    console.log('READ OK   ', col.padEnd(14), 'docs=' + snap.size);
  } catch (e) {
    console.log('READ FAIL ', col.padEnd(14), (e.code || '') + ' ' + String(e.message || '').slice(0, 60));
  }
}

try {
  const ref = db.collection(`${BASE}/tasks`).doc('probe-' + Date.now());
  await ref.set({ probe: true, at: Date.now(), teamId: '__probe__' });
  const back = await ref.get();
  console.log('WRITE OK   probe readable back:', back.exists);
  await ref.delete();
  console.log('CLEANUP OK probe deleted');
} catch (e) {
  console.log('WRITE FAIL', (e.code || '') + ' ' + String(e.message || '').slice(0, 70));
}

try {
  const snap = await db.collection(`${BASE}/tasks`).limit(1).get();
  if (!snap.empty) {
    console.log('\n=== EXISTING tasks FIELD NAMES ===');
    console.log(Object.keys(snap.docs[0].data()).sort().join(', '));
  }
  const allSnap = await db.collection(`${BASE}/tasks_for_all`).limit(1).get();
  if (!allSnap.empty) {
    console.log('\n=== EXISTING tasks_for_all FIELD NAMES ===');
    console.log(Object.keys(allSnap.docs[0].data()).sort().join(', '));
  }
  const t = await db.collection(`${BASE}/teams`).limit(3).get();
  console.log('\n=== TEAMS IN PROJECT:', t.size, '===');
  t.forEach(d => { const x = d.data(); console.log('  id=' + d.id + '  name=' + (x.name || '(none)') + '  ownerUid=' + (x.ownerUid ? 'set' : 'none')); });
} catch (e) { console.log('shape read failed:', e.message); }

process.exit(0);

