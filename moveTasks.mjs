// MOVE: boss-created tasks (createdBy='boss-waweb') from the individual `tasks` collection to the
// shared `tasks_for_all` (General Tasks) list - matching the new rule: no person named => General.
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, addDoc, deleteDoc } from 'firebase/firestore';

const cfg = {
  apiKey: 'AIzaSyDGhwmtpHazLrDWDXjK3WoGPh610mrJeaI',
  authDomain: 'whatanagent-a1e59.firebaseapp.com',
  projectId: 'whatanagent-a1e59',
  storageBucket: 'whatanagent-a1e59.firebasestorage.app',
  messagingSenderId: '410197132578',
  appId: '1:410197132578:web:97cfc3ae33f39ed3df917b'
};
const app = initializeApp(cfg);
const db = getFirestore(app);
const APPID = '1:410197132578:web:97cfc3ae33f39ed3df917b';
const BASE = `artifacts/${APPID}/public/data`;

async function main() {
  const snap = await getDocs(collection(db, BASE + '/tasks'));
  let moved = 0;
  for (const d of snap.docs) {
    const t = d.data() || {};
    if (t.createdBy !== 'boss-waweb') {
      console.log('SKIP (not boss-created):', d.id, '|', t.description);
      continue;
    }
    const movedDoc = {
      description: t.description || '',
      dueDate: t.dueDate || '',
      status: t.status || 'To Do',
      comments: t.comments || [],
      createdAt: t.createdAt || new Date(),
      createdBy: t.createdBy || 'boss-waweb',
      ownerAdminUid: t.ownerAdminUid || '',
      ownerAdminEmail: t.ownerAdminEmail || ''
    };
    const ref = await addDoc(collection(db, BASE + '/tasks_for_all'), movedDoc);
    await deleteDoc(d.ref);
    moved++;
    console.log('MOVED -> ' + ref.id + ' | ' + movedDoc.description);
  }
  console.log('---');
  console.log('Total moved from Individual -> General:', moved);
  process.exit(0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
