// Add the task the boss asked for ("Abu UAE pass sahir", due today 7:00 PM Dubai) exactly the way
// bossAlignTaskAdd does it - including the staff entry needed for board visibility.
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, addDoc, setDoc } from 'firebase/firestore';

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
  const usersSnap = await getDocs(collection(db, BASE + '/users'));
  const admin = usersSnap.docs.find(d => String((d.data() || {}).email || '').toLowerCase() === 'nadeemalsaham@gmail.com');
  if (!admin) throw new Error('admin user not found in board users collection');
  const u = admin.data() || {};
  const person = { name: u.name || 'nadeemalsaham', email: String(u.email).toLowerCase(), uid: admin.id };

  // 1) staff entry (board visibility requirement)
  const staffCol = collection(db, BASE + '/staff');
  const staffSnap = await getDocs(query(staffCol, where('email', '==', person.email)));
  const staffData = { name: person.name, email: person.email, uid: person.uid };
  if (staffSnap.empty) { await addDoc(staffCol, staffData); console.log('STAFF: entry created ->', person.name); }
  else { await setDoc(staffSnap.docs[0].ref, staffData, { merge: true }); console.log('STAFF: entry updated ->', person.name); }

  // 2) the task exactly as bossAlignTaskAdd writes it
  const task = {
    description: 'Abu UAE pass sahir',
    assigneeEmail: person.email,
    dueDate: '2026-09-17T19:00',
    status: 'To Do',
    comments: [],
    createdAt: new Date(),
    createdBy: 'boss-waweb',
    ownerAdminUid: person.uid,
    ownerAdminEmail: '',
    setAlarm: false
  };
  const ref = await addDoc(collection(db, BASE + '/tasks'), task);
  console.log('TASK CREATED:', ref.id);
  console.log(JSON.stringify({ ...task, createdAt: task.createdAt.toISOString() }, null, 1));
  process.exit(0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
