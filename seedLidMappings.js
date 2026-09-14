// Ops tool: harvest LID -> real phone mappings from Baileys' own persisted store
// (auth_info_baileys/lid-mapping-*.json) and publish them to Firestore as a seed.
// The app loads this seed at boot:  appData/waLidMapSeed { lidMappings: "<json>" }
// Re-run any time the local Baileys store grows (then restart the app to pick it up).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(__dirname, 'auth_info_baileys');

const firebaseConfig = {
  apiKey: "AIzaSyDGhwmtpHazLrDWDXjK3WoGPh610mrJeaI",
  authDomain: "whatanagent-a1e59.firebaseapp.com",
  projectId: "whatanagent-a1e59",
  storageBucket: "whatanagent-a1e59.firebasestorage.app",
  messagingSenderId: "410197132578",
  appId: "1:410197132578:web:97cfc3ae33f39ed3df917b"
};

const db = getFirestore(initializeApp(firebaseConfig));

// 1. Harvest pairs. File formats written by Baileys:
//    lid-mapping-<LID>_reverse.json -> content is the phone number
//    lid-mapping-<PN>.json          -> content is the LID
const pairs = new Map();
let scanned = 0, bad = 0;
for (const name of fs.readdirSync(AUTH_DIR)) {
  const m = name.match(/^lid-mapping-(\d+)(_reverse)?\.json$/);
  if (!m) continue;
  scanned++;
  const fileNum = m[1];
  const isReverse = !!m[2];
  let content = '';
  try { content = fs.readFileSync(path.join(AUTH_DIR, name), 'utf8'); } catch { bad++; continue; }
  const val = content.replace(/[^0-9]/g, '');
  if (!val) { bad++; continue; }
  const lid = isReverse ? fileNum : val;
  const pn = isReverse ? val : fileNum;
  if (!lid || !pn || lid === pn) { bad++; continue; }
  if (lid.length < 13) { bad++; continue; }      // LIDs are long; phones are shorter
  if (pn.length < 8 || pn.length > 15) { bad++; continue; }
  pairs.set(lid, pn);
}
console.log('LID mapping files scanned :', scanned);
console.log('Valid LID -> phone pairs  :', pairs.size);
console.log('Skipped / malformed       :', bad);

// 2. Publish as the seed document (the app reads it at boot and never writes it)
const obj = {};
for (const [lid, pn] of pairs.entries()) obj[lid] = pn;
const json = JSON.stringify(obj);
await setDoc(doc(db, 'appData', 'waLidMapSeed'), {
  lidMappings: json,
  count: pairs.size,
  generator: 'auth_info_baileys/lid-mapping-*.json',
  updatedAt: Date.now()
}, { merge: true });

console.log('Published to Firestore appData/waLidMapSeed (' + Math.round(json.length / 1024) + ' KB)');
console.log('Restart the app (railway redeploy --from-source -y) to load the seed.');
process.exit(0);
