// ============================================================================
// 🏗️ WORKSHOP — set one process step for a website from the command line
// ============================================================================
// The Websites Workshop dashboard writes appData/workshop.process[site].steps[step].
// This script does the same thing from a terminal, so a verified step can be
// recorded while working in the repo (and by an automated audit) without opening
// the browser.
//
//   node scripts/workshop-set-step.mjs --site alqaryangroup.com --step https-mixed \
//        --status done --note "Checked 44/44 pages: no http:// asset references"
//
//   node scripts/workshop-set-step.mjs --site alqaryangroup.com --list
//
// The step ids are the ones in workshopApi.mjs (PROCESS_STEPS).
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const arg = (name, fallback = '') => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const has = (name) => process.argv.includes('--' + name);

// Step ids + labels straight from the API module, so this can never drift.
function stepCatalogue() {
  const src = fs.readFileSync(path.join(ROOT, 'workshopApi.mjs'), 'utf8');
  const block = src.match(/const PROCESS_STEPS = \[([\s\S]*?)\n\];/);
  if (!block) throw new Error('PROCESS_STEPS not found in workshopApi.mjs');
  return [...block[1].matchAll(/\{ id: '([^']+)',\s*group: '([^']+)',\s*label: '([^']*)',\s*owner: '([^']+)'/g)]
    .map(m => ({ id: m[1], group: m[2], label: m[3], owner: m[4] }));
}

// Same public web config the dashboard uses (it is a client config, not a secret).
// admin.html writes it with double quotes, other files with single — accept both.
function firebaseConfig() {
  const src = fs.readFileSync(path.join(ROOT, 'public', 'admin.html'), 'utf8');
  const pick = (key) => {
    const m = src.match(new RegExp(key + '\\s*:\\s*["\']([^"\']+)["\']'));
    return m ? m[1] : '';
  };
  return {
    apiKey: pick('apiKey'),
    projectId: pick('projectId') || 'whatanagent-a1e59',
    appId: pick('appId')
  };
}

const SITE = arg('site', 'alqaryangroup.com').toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
const STEP = arg('step');
const STATUS = arg('status', 'done');
const NOTE = arg('note', '');
const TODO_TEXT = arg('todo', '');
const TODO_SUGGEST = arg('suggestion', '');
const STATUSES = ['done', 'doing', 'todo', 'blocked', 'na'];

const catalogue = stepCatalogue();

if (has('list') || (!STEP && !has('show') && !TODO_TEXT)) {
  console.log('Steps for ' + SITE + ' (id · group · owner · label):\n');
  catalogue.forEach(s => console.log('  ' + s.id.padEnd(20) + ' ' + s.group.padEnd(12) + ' ' + s.owner.padEnd(9) + ' ' + s.label));
  console.log('\nUsage: node scripts/workshop-set-step.mjs --site ' + SITE +
    ' --step <id> --status <' + STATUSES.join('|') + '> --note "..."');
  console.log('       node scripts/workshop-set-step.mjs --site ' + SITE + ' --show');
  process.exit(STEP || has('show') ? 0 : 1);
}
if (STEP && !catalogue.some(s => s.id === STEP)) {
  console.error('Unknown step "' + STEP + '". Run with --list to see the ids.');
  process.exit(1);
}
if (STEP && !STATUSES.includes(STATUS)) {
  console.error('Unknown status "' + STATUS + '". Use one of: ' + STATUSES.join(', '));
  process.exit(1);
}

const cfg = firebaseConfig();
if (!cfg.apiKey || !cfg.appId) {
  console.error('Could not read the Firebase web config from public/admin.html.');
  process.exit(1);
}
const app = initializeApp(cfg, 'workshop-cli-' + Date.now());
const db = getFirestore(app);
// Same document the dashboard uses: appData/websitesWorkshop (see WORKSHOP in workshopApi.mjs).
const ref = doc(db, 'appData', 'websitesWorkshop');

const snap = await getDoc(ref);
const meta = snap.exists() ? (snap.data() || {}) : {};
const process_ = { ...(meta.process || {}) };
const site = { ...(process_[SITE] || {}) };
const steps = { ...(site.steps || {}) };
const stored = (site.steps || {});

if (has('show') && !STEP) {
  // Status per step, with the seed default used when Firestore has no override.
  const seedSrc = fs.readFileSync(path.join(ROOT, 'workshopApi.mjs'), 'utf8');
  const seedBlock = (seedSrc.match(/'alqaryangroup\.com': \{[\s\S]*?steps: \{([\s\S]*?)\n    \}/) || [])[1] || '';
  const seed = {};
  for (const m of seedBlock.matchAll(/'([a-z0-9-]+)':\s*\{ status: '([^']+)'/g)) seed[m[1]] = m[2];
  const rows = catalogue.map(s => ({ ...s, status: (stored[s.id] || {}).status || seed[s.id] || 'todo', note: (stored[s.id] || {}).note || '', override: !!stored[s.id] }));
  const done = rows.filter(r => r.status === 'done').length;
  const doing = rows.filter(r => r.status === 'doing').length;
  const todo = rows.filter(r => r.status === 'todo').length;
  const blocked = rows.filter(r => r.status === 'blocked').length;
  const na = rows.filter(r => r.status === 'na').length;
  console.log(SITE + ' — ' + (site.name || '') + ' · ' + done + '/' + rows.length + ' done (' +
    Math.round(done / rows.length * 100) + '%) · ' + doing + ' doing · ' + todo + ' to-do · ' + blocked + ' blocked' + (na ? ' · ' + na + ' n/a' : '') + '\n');
  for (const r of rows) {
    if (r.status === 'done') continue;
    console.log('  ' + r.status.padEnd(8) + r.id.padEnd(20) + r.owner.padEnd(9) + r.label);
    if (r.note) console.log('           ' + r.note.slice(0, 120));
  }
  console.log('\n(done steps hidden — ' + done + ' of them; use --list for the full catalogue)');
  process.exit(0);
}

const before = (steps[STEP] || {}).status || '(default)';

// ---------------------------------------------------------------- to-do tasks
// The workshop keeps free-form tasks next to the pipeline (appData.todos[site]).
if (TODO_TEXT) {
  const todos = { ...(meta.todos || {}) };
  const list = Array.isArray(todos[SITE]) ? todos[SITE].slice() : [];
  const item = {
    id: 'td-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    text: TODO_TEXT.slice(0, 600),
    suggestion: TODO_SUGGEST.slice(0, 4000),
    by: 'workshop-cli',
    byName: 'Workshop CLI',
    status: 'todo',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  list.unshift(item);
  todos[SITE] = list.slice(0, 200);
  if (!has('dry')) await setDoc(ref, { todos, updatedAt: Date.now() }, { merge: true });
  console.log((has('dry') ? '[dry] would add to-do: ' : 'Added to-do: ') + item.text);
  if (TODO_SUGGEST) console.log('  suggestion: ' + TODO_SUGGEST.slice(0, 160) + (TODO_SUGGEST.length > 160 ? '…' : ''));
  console.log('  id: ' + item.id + ' · tasks now on this site: ' + todos[SITE].length);
  process.exit(0);
}
steps[STEP] = { status: STATUS, note: NOTE || (steps[STEP] || {}).note || '', at: Date.now() };
site.steps = steps;
process_[SITE] = site;

if (!has('dry')) {
  await setDoc(ref, { process: process_, updatedAt: Date.now() }, { merge: true });
}

// Read back so "saved" is verified, not assumed.
let verified = null;
if (!has('dry')) {
  const after = await getDoc(ref);
  verified = ((((after.data() || {}).process || {})[SITE] || {}).steps || {})[STEP] || null;
}

const label = (catalogue.find(s => s.id === STEP) || {}).label || STEP;
console.log((has('dry') ? '[dry] would set ' : 'Set ') + SITE + ' · ' + STEP + ' (' + label + ')');
console.log('  status: ' + before + ' -> ' + STATUS);
if (NOTE) console.log('  note  : ' + NOTE);
if (verified) console.log('  saved : ' + verified.status + ' at ' + new Date(verified.at).toISOString() + ' (read back from Firestore)');
