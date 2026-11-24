// Try to provision GA4 for a site using the service account already stored on
// its Search Console record.
//
//   node scripts/ga4-setup.mjs arabianpolyplast.com
//
// The service account needs access to a Google Analytics account first
// (Analytics → Admin → Account access management → add the service account as
// Editor). If it has none, the script says so and prints the exact steps.
import crypto from 'node:crypto';
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
const KEY = (process.argv[2] || 'arabianpolyplast.com').toLowerCase();
const SITE_NAME = process.argv[3] || 'Arabian Polyplast Trading LLC';

const snap = await getDoc(doc(db, 'appData', 'seoAgent'));
const site = ((snap.data() || {}).sites || {})[KEY];
if (!site) { console.error('No site record for ' + KEY); process.exit(1); }

let sa = null;
try { sa = JSON.parse(site.gscAccess || '{}'); } catch (e) { sa = null; }
if (!sa || !sa.client_email) { console.error('No service account on the site record.'); process.exit(1); }

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({
  iss: sa.client_email,
  scope: 'https://www.googleapis.com/auth/analytics.edit https://www.googleapis.com/auth/analytics.readonly',
  aud: 'https://oauth2.googleapis.com/token',
  iat: now,
  exp: now + 3600
});
const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url');
const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: unsigned + '.' + sig
  }).toString()
});
const tb = await tokenRes.json();
if (!tokenRes.ok) { console.error('Token error: ' + (tb.error_description || tb.error)); process.exit(1); }

const H = { Authorization: 'Bearer ' + tb.access_token, 'Content-Type': 'application/json' };
const API = 'https://analyticsadmin.googleapis.com/v1beta';

const accRes = await fetch(API + '/accounts', { headers: H });
const accBody = await accRes.json();
if (!accRes.ok) {
  console.error('HTTP ' + accRes.status + ': ' + JSON.stringify(accBody).slice(0, 300));
  console.error('\nThe service account has no Google Analytics access yet.');
  console.error('analytics.google.com → Admin → Account access management → + → add');
  console.error('  ' + sa.client_email + '  as Editor. Then run this again.');
  process.exit(2);
}

const accounts = accBody.accounts || [];
if (!accounts.length) {
  console.error('The service account can sign in but sees no Analytics account.');
  console.error('Add ' + sa.client_email + ' as Editor in Admin → Account access management.');
  process.exit(2);
}
console.log('Accounts visible: ' + accounts.map(a => a.displayName + ' (' + a.name + ')').join(', '));

const parent = accounts[0].name;

// Reuse the property if a previous run already made one.
const propsRes = await fetch(API + '/properties?filter=parent:' + encodeURIComponent(parent) + '&pageSize=200', { headers: H });
const props = (await propsRes.json()).properties || [];
const existing = props.find(p => (p.displayName || '').toLowerCase() === SITE_NAME.toLowerCase());

let property = existing;
if (!property) {
  const createRes = await fetch(API + '/properties', {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      parent,
      displayName: SITE_NAME,
      timeZone: 'Asia/Muscat',
      currencyCode: 'OMR',
      industryCategory: 'CONSTRUCTION'
    })
  });
  const created = await createRes.json();
  if (!createRes.ok) { console.error('Could not create the property: ' + JSON.stringify(created).slice(0, 400)); process.exit(1); }
  property = created;
  console.log('Created property: ' + property.displayName + ' (' + property.name + ')');
} else {
  console.log('Property already exists: ' + property.displayName + ' (' + property.name + ')');
}

const streamsRes = await fetch(API + '/' + property.name + '/dataStreams', { headers: H });
const streams = (await streamsRes.json()).dataStreams || [];
let stream = streams.find(s => s.type === 'WEB');

if (!stream) {
  const mk = await fetch(API + '/' + property.name + '/dataStreams', {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      type: 'WEB',
      displayName: KEY + ' (web)',
      webStreamData: { defaultUri: 'https://' + KEY }
    })
  });
  stream = await mk.json();
  if (!mk.ok) { console.error('Could not create the stream: ' + JSON.stringify(stream).slice(0, 400)); process.exit(1); }
  console.log('Created web stream.');
}

const mid = (stream.webStreamData || {}).measurementId;
console.log('\nMeasurement ID : ' + mid);
console.log('Set it in build/content.mjs  →  ga4Id: \'' + mid + '\'');
process.exit(0);
