// PROBE: inspect AlignTasks board + find Hindi (Devanagari) texts stored in Firestore
// READ-ONLY for this pass.
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';

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
const DEV = /[\u0900-\u097F]/;

function snip(s, at, len = 90) { return JSON.stringify(String(s).slice(Math.max(0, at - 40), at + len)); }
function findDev(obj, path = '', out = []) {
  if (obj == null) return out;
  if (typeof obj === 'string') {
    let m; const re = /[\u0900-\u097F]/g;
    if (re.test(obj)) out.push({ path, text: obj });
    return out;
  }
  if (Array.isArray(obj)) { obj.forEach((v, i) => findDev(v, path + '[' + i + ']', out)); return out; }
  if (typeof obj === 'object') { for (const k of Object.keys(obj)) findDev(obj[k], path ? path + '.' + k : k, out); return out; }
  return out;
}

async function main() {
  console.log('=== TASKS (align board, latest 20) ===');
  try {
    const ts = await getDocs(query(collection(db, `artifacts/${APPID}/public/data/tasks`), orderBy('createdAt', 'desc'), limit(20)));
    ts.forEach(d => {
      const t = d.data();
      console.log(`- ${d.id} | "${String(t.description || '').slice(0, 45)}" | assignee=${t.assigneeEmail} | status=${t.status} | by=${t.createdBy} | createdAt=${t.createdAt?.toDate ? t.createdAt.toDate().toISOString() : t.createdAt}`);
    });
    console.log('Total shown:', ts.size);
  } catch (e) { console.log('tasks read error:', e.message); }

  console.log('\n=== STAFF (board) ===');
  try {
    const ss = await getDocs(collection(db, `artifacts/${APPID}/public/data/staff`));
    ss.forEach(d => { const s = d.data(); console.log(`- ${s.name} | ${s.email} | uid=${s.uid || ''}`); });
    if (ss.empty) console.log('(empty)');
  } catch (e) { console.log('staff read error:', e.message); }

  console.log('\n=== USERS (board) ===');
  try {
    const us = await getDocs(collection(db, `artifacts/${APPID}/public/data/users`));
    us.forEach(d => { const u = d.data(); console.log(`- ${u.name} | ${u.email} | role=${u.role} | active=${u.active}`); });
    if (us.empty) console.log('(empty)');
  } catch (e) { console.log('users read error:', e.message); }

  console.log('\n=== appData DOCS WITH DEVANAGARI ===');
  try {
    const ad = await getDocs(collection(db, 'appData'));
    let totalDev = 0;
    for (const d of ad.docs) {
      const data = d.data();
      const hits = findDev(data);
      if (hits.length) {
        totalDev += hits.length;
        console.log(`\n--- appData/${d.id} : ${hits.length} Hindi string(s) ---`);
        hits.slice(0, 12).forEach(h => console.log(`   ${h.path} => ${snip(h.text, 0, 120)}`));
      }
    }
    console.log('\nTotal Hindi strings found in appData:', totalDev);
    console.log('appData doc ids:', ad.docs.map(d => d.id + '(' + JSON.stringify(d.data()).length + 'B)').join(', '));
  } catch (e) { console.log('appData read error:', e.message); }
}

main().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
