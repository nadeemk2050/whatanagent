// Submit (or re-check) a site's sitemap in Google Search Console using the
// service account already stored on that site's record.
//
//   node scripts/gsc-submit.mjs arabianpolyplast.com
//
// The service account must first be added as a user of the Search Console
// property — that is an owner action, Google gives no API a way around it.
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

const snap = await getDoc(doc(db, 'appData', 'seoAgent'));
const site = ((snap.data() || {}).sites || {})[KEY];
if (!site) {
  console.error('No site record for ' + KEY + ' in appData/seoAgent.');
  process.exit(1);
}

let sa = null;
try { sa = JSON.parse(site.gscAccess || '{}'); } catch (e) { sa = null; }
if (!sa || !sa.client_email) {
  console.error('No service account stored on the record for ' + KEY + '.');
  process.exit(1);
}

const property = site.gscPropertyUrl || ('sc-domain:' + KEY);
const sitemap = site.sitemapUrl || ('https://' + KEY + '/sitemap.xml');

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({
  iss: sa.client_email,
  scope: 'https://www.googleapis.com/auth/webmasters',
  aud: 'https://oauth2.googleapis.com/token',
  iat: now,
  exp: now + 3600
});
const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url');

const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: unsigned + '.' + signature
  }).toString()
});
const tokenBody = await tokenRes.json();
if (!tokenRes.ok) {
  console.error('Could not sign in to Google: ' + (tokenBody.error_description || tokenBody.error));
  process.exit(1);
}

const auth = { Authorization: 'Bearer ' + tokenBody.access_token };
const propUrl = 'https://searchconsole.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(property);

const check = await fetch(propUrl, { headers: auth });
if (check.status === 403 || check.status === 404) {
  console.error('The service account ' + sa.client_email + ' cannot see ' + property + '.');
  console.error('Add it in Search Console → Settings → Users and permissions (permission: Full), then run this again.');
  process.exit(2);
}
if (!check.ok) {
  console.error('Search Console answered HTTP ' + check.status + ' for ' + property);
  process.exit(1);
}

const put = await fetch(propUrl + '/sitemaps/' + encodeURIComponent(sitemap), { method: 'PUT', headers: auth });
console.log('Property   : ' + property);
console.log('Sitemap    : ' + sitemap);
console.log('Submit     : HTTP ' + put.status + (put.status === 204 ? ' (accepted)' : ''));

const list = await fetch(propUrl + '/sitemaps', { headers: auth });
const body = await list.json();
for (const s of body.sitemap || []) {
  const urls = ((s.contents || [])[0] || {}).submitted || 0;
  console.log('Reported   : ' + s.path + ' · ' + urls + ' URLs · errors ' + (s.errors || 0) + ' · warnings ' + (s.warnings || 0) + (s.lastDownloaded ? ' · last read ' + s.lastDownloaded : ''));
}
process.exit(0);
