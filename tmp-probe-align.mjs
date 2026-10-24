// Read-only probe: can the server (unauthenticated client SDK) read the AlignTasks tree?
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDGhwmtpHazLrDWDXjK3WoGPh610mrJeaI',
  authDomain: 'whatanagent-a1e59.firebaseapp.com',
  projectId: 'whatanagent-a1e59',
  storageBucket: 'whatanagent-a1e59.firebasestorage.app',
  messagingSenderId: '410197132578',
  appId: '1:410197132578:web:97cfc3ae33f39ed3df917b'
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const APP_ID = process.env.ALIGN_APP_ID || 'whatanagent-a1e59';
const BASE = `artifacts/${APP_ID}/public/data`;

const targets = ['tasks', 'tasks_for_all', 'staff', 'teams', 'users'];

for (const t of targets) {
  try {
    const snap = await getDocs(query(collection(db, `${BASE}/${t}`), limit(2)));
    console.log('READ OK   ', t.padEnd(14), 'docs=' + snap.size);
  } catch (e) {
    console.log('READ FAIL ', t.padEnd(14), (e.code || '') + ' ' + String(e.message || '').slice(0, 70));
  }
}
