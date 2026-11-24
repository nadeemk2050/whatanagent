// Read-only inspection of the Websites Workshop data in Firestore.
// Usage: node scripts/workshop-inspect.mjs [key]
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDGhwmtpHazLrDWDXjK3WoGPh610mrJeaI',
  authDomain: 'whatanagent-a1e59.firebaseapp.com',
  projectId: 'whatanagent-a1e59',
  storageBucket: 'whatanagent-a1e59.firebasestorage.app',
  messagingSenderId: '410197132578',
  appId: '1:410197132578:web:97cfc3ae33f39ed3df917b'
};

const db = getFirestore(initializeApp(firebaseConfig));
const key = process.argv[2] || 'alqaryangroup.com';

const seoSnap = await getDoc(doc(db, 'appData', 'seoAgent'));
const wsSnap = await getDoc(doc(db, 'appData', 'websitesWorkshop'));
const seo = seoSnap.exists() ? seoSnap.data() : {};
const ws = wsSnap.exists() ? wsSnap.data() : {};

const seoSite = (seo.sites || {})[key] || null;
const mask = (site) => {
  if (!site) return null;
  const out = { ...site };
  if (out.gscAccess) {
    let email = 'unparseable';
    try { email = JSON.parse(out.gscAccess).client_email || 'no client_email'; } catch (e) { /* ignore */ }
    out.gscAccess = '<' + String(out.gscAccess).length + ' bytes · ' + email + '> ';
  }
  if (out.cmsPassword) out.cmsPassword = '<set>';
  if (out.ftpPassword) out.ftpPassword = '<set>';
  if (out.fbPageToken) out.fbPageToken = out.fbPageToken ? '<set>' : '';
  return out;
};

console.log('=== seoAgent.sites keys ===');
console.log(Object.keys(seo.sites || {}).join('\n'));
console.log('\n=== seoAgent.sites[' + key + '] ===');
console.log(JSON.stringify(mask(seoSite), null, 2));

console.log('\n=== workshops: manager / engineers ===');
console.log(JSON.stringify({ managerId: ws.managerId, engineerIds: ws.engineerIds, helpers: ws.helpers }, null, 2));

console.log('\n=== workshops.site[' + key + '] ===');
console.log(JSON.stringify((ws.sites || {})[key] || null, null, 2));

console.log('\n=== process[' + key + '] ===');
console.log(JSON.stringify((ws.process || {})[key] || null, null, 2));

console.log('\n=== todos[' + key + '] ===');
console.log(JSON.stringify((ws.todos || {})[key] || null, null, 2));

console.log('\n=== keywords[' + key + '] ===');
console.log(JSON.stringify((ws.keywords || {})[key] || null, null, 2));

console.log('\n=== all workshop keys ===');
console.log('sites: ' + Object.keys(ws.sites || {}).join(', '));
console.log('process: ' + Object.keys(ws.process || {}).join(', '));
console.log('todos: ' + Object.keys(ws.todos || {}).join(', '));
process.exit(0);
