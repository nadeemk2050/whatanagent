// FIX: convert stored Hindi (Devanagari) medicine-reminder texts to Roman Urdu.
// Targets: appData/aiTasks (pending waweb_message tasks), appData/bossNotifications (sent-copies).
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

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

const REPLACEMENTS = [
  [/सुबह वाली दवाई खा ली\?[\s\S]*?वो भी खानी है/g, 'Subah wali dawai kha li? Aur khane ke baad jo iron ki dawai thi wo bhi khani hai'],
  [/आयरन की दवाई खा ली है\?/g, 'Iron ki dawai kha li hai?'],
  [/रात वाली आखिरी दवाई खा ली है\?/g, 'Raat wali aakhri dawai kha li hai?'],
  [/BP की दवाई खा ली है\?/g, 'BP ki dawai kha li hai?']
];
const DEV = /[\u0900-\u097F]/;
const leftover = [];

function fixString(s, path) {
  let out = s;
  for (const [re, rep] of REPLACEMENTS) out = out.replace(re, rep);
  if (DEV.test(out)) leftover.push(path + ' :: ' + out.slice(0, 90));
  return out;
}
function walk(obj, path) {
  if (typeof obj === 'string') return fixString(obj, path);
  if (Array.isArray(obj)) return obj.map((v, i) => walk(v, path + '[' + i + ']'));
  if (obj && typeof obj === 'object') {
    if (obj instanceof Date || typeof obj.toDate === 'function') return obj;   // never touch timestamps
    const o = {};
    for (const k of Object.keys(obj)) o[k] = walk(obj[k], path ? path + '.' + k : k);
    return o;
  }
  return obj;
}

async function main() {
  for (const id of ['aiTasks', 'bossNotifications']) {
    const ref = doc(db, 'appData', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) { console.log(id + ': MISSING'); continue; }
    const raw = snap.data();
    const before = JSON.stringify(raw);
    const fixed = walk(raw, id);
    const after = JSON.stringify(fixed);
    if (after !== before) {
      await setDoc(ref, fixed, { merge: true });
      console.log(id + ': UPDATED (Hindi -> Roman Urdu)');
    } else {
      console.log(id + ': no change needed');
    }
  }
  console.log('---');
  console.log('Leftover Devanagari strings:', leftover.length);
  leftover.slice(0, 15).forEach(l => console.log('  ! ' + l));
  process.exit(0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
