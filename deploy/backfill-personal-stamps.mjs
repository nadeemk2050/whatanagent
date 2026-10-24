import fs from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const sa = JSON.parse(fs.readFileSync('/opt/whatanagent-data/serviceAccountKey.json', 'utf8'));
initializeApp({ credential: cert(sa), projectId: sa.project_id });
const db = getFirestore();
const BASE = 'artifacts/1:410197132578:web:97cfc3ae33f39ed3df917b/public/data';
const staff = JSON.parse(fs.readFileSync('/opt/whatanagent/data/alignStaff.json', 'utf8')).staff || {};
const nameByUid = {};
for (const r of Object.values(staff)) if (r.uid) nameByUid[r.uid] = r.name;
const users = await db.collection(`${BASE}/users`).limit(300).get();
let patched = 0, scanned = 0;
for (const u of users.docs) {
  const snap = await db.collection(`${BASE}/users/${u.id}/personal_tasks`).limit(300).get();
  const userName = nameByUid[u.id] || (u.data() || {}).name || '';
  for (const doc of snap.docs) {
    scanned++;
    const d = doc.data() || {};
    if (d.createdByName) continue;
    const patch = { createdByName: userName || 'Unknown', ownerName: userName || 'Unknown' };
    if (!d.createdByUid) patch.createdByUid = u.id;
    await doc.ref.set(patch, { merge: true });
    patched++;
    console.log('  stamped', doc.id, '->', patch.createdByName);
  }
}
console.log('scanned:', scanned, '| patched:', patched);
process.exit(0);
