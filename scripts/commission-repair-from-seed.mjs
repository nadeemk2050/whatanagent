// ============================================================================
// 🧾 COMMISSION ACCOUNTS — rebuild the Excel history from scripts/commission-seed.json
// ============================================================================
// The Excel sheet stays the source of truth for everything that happened before
// the app existed. When the sheet (or the converter) is corrected, this script
// replaces the imported history in the live database with the new seed:
//
//   • only records that came from the sheet are removed — anything entered in the
//     app itself (it always carries a date and no `source`) is left untouched,
//   • the seed rows are then written back with their stable ids.
//
// Usage (server must be running):
//   node scripts/commission-repair-from-seed.mjs --user raheel --password secret123 --dry
//   node scripts/commission-repair-from-seed.mjs --user raheel --password secret123
//   node scripts/commission-repair-from-seed.mjs --user u --password p --base https://host
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_FILE = path.join(__dirname, 'commission-seed.json');

const arg = (name, fallback = '') => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const BASE = arg('base', process.env.COMMISSION_BASE || 'http://127.0.0.1:3000').replace(/\/$/, '') + '/api/commission';
const USER = arg('user');
const PASS = arg('password');
const DRY = process.argv.includes('--dry');
// The whole Excel history came through this one dealer.
const DEALER = arg('dealer', 'S.E. ENGINEERING');

if (!USER || !PASS) {
  console.error('Usage: node scripts/commission-repair-from-seed.mjs --user <username> --password <password> [--base http://host] [--dry]');
  process.exit(1);
}
if (!fs.existsSync(SEED_FILE)) {
  console.error('Seed file not found: ' + SEED_FILE);
  process.exit(1);
}

const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));

const login = await fetch(BASE + '/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: USER, password: PASS })
}).then(r => r.json());
if (!login.ok) {
  console.error('Sign-in failed:', login.error || login);
  throw new Error('sign-in failed');
}
const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + login.token };

// ---------------------------------------------------------------- what to write
const wanted = [
  // A sales voucher IS the commission voucher: the sheet's deals are written as sales
  // vouchers that carry the dealer they came through.
  ...seed.invoices.map(inv => {
    const amount = Math.round((Number(inv.amount) + Number.EPSILON) * 100) / 100;
    const gstValue = Math.round((Number(inv.gstValue) + Number.EPSILON) * 100) / 100;
    return {
      id: inv.id, kind: 'voucher', type: 'sales',
      data: {
        date: inv.date, no: inv.invNo, seller: inv.seller, buyer: inv.buyer, dealer: DEALER,
        lines: [{
          item: inv.item || '', hsCode: inv.hsCode || '', qty: Number(inv.qty) || 0, rate: Number(inv.rate) || 0,
          amount, taxPct: Number(inv.gstPct) || 0, taxAmt: gstValue,
          total: Math.round((amount + gstValue + Number.EPSILON) * 100) / 100
        }],
        subTotal: amount, taxTotal: gstValue,
        grandTotal: Math.round((amount + gstValue + Number.EPSILON) * 100) / 100,
        comm: { enabled: Number(inv.commValue) > 0, pct: Number(inv.commPct) || 0, value: Number(inv.commValue) || 0 },
        narration: inv.notes || '', source: inv.source
      }
    };
  }),
  ...seed.payments.map(p => {
    const isExpense = p.kind === 'expense';
    return {
      id: p.id, kind: 'voucher', type: isExpense ? 'payment' : 'receipt',
      data: {
        date: p.date, no: p.no || '', party: p.party, dealer: DEALER, amount: p.amount, mode: p.mode || 'Bank',
        account: p.mode || 'Bank Account',
        narration: p.narration || (isExpense ? 'Payment' : 'Commission received'),
        auto: 'excel-import', partyType: isExpense ? 'expense' : 'seller', source: p.source
      }
    };
  })
];

const boot = await (await fetch(BASE + '/bootstrap', { headers: H })).json();

// A record belongs to the sheet when it carries a `source` row, the import mark,
// or has no date at all (a sheet row whose date cell was unreadable).
const isHistory = (rec) => {
  if (rec.kind !== 'invoice' && rec.kind !== 'voucher') return false;
  const d = rec.data || {};
  if (String(d.source || '').startsWith('excel-row-')) return true;
  if (d.auto === 'excel-import') return true;
  return !d.date;
};

const stale = boot.records.filter(isHistory);
const keptUserRecords = boot.records.filter(r => (r.kind === 'invoice' || r.kind === 'voucher') && !isHistory(r));

console.log('current rows: ' + boot.records.length);
console.log('history rows to replace: ' + stale.length);
console.log('rows entered in the app (kept): ' + keptUserRecords.length);
console.log('seed rows: ' + wanted.length);
keptUserRecords.forEach(r => console.log('   kept ' + r.kind + '/' + r.type + ' ' + (r.data.invNo || r.data.no || '') + ' ' + (r.data.date || '')));

if (DRY) {
  console.log('\n--dry: nothing written');
} else {
  let removed = 0;
  for (const rec of stale) {
    const res = await fetch(BASE + '/records/' + encodeURIComponent(rec.id), { method: 'DELETE', headers: H });
    if (res.ok) removed++;
    else console.error('could not delete ' + rec.id + ' (' + res.status + ')');
  }
  console.log('\nremoved: ' + removed);

  let written = 0;
  for (let i = 0; i < wanted.length; i += 150) {
    const chunk = wanted.slice(i, i + 150).map(w => ({ id: w.id, kind: w.kind, type: w.type, data: w.data, updatedAt: Date.now(), deleted: false }));
    const res = await fetch(BASE + '/sync', { method: 'POST', headers: H, body: JSON.stringify({ cursor: 0, changes: chunk, limit: 1 }) }).then(r => r.json());
    if (!res.ok) { console.error('write failed:', res.error); break; }
    written += res.applied || 0;
  }
  console.log('written: ' + written);

  const stats = await (await fetch(BASE + '/stats', { headers: H })).json();
  console.log('stats: ' + JSON.stringify(stats.stats));
}
