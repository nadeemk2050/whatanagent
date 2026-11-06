// ============================================================================
// 🧾 COMMISSION ACCOUNTS — API smoke test
// ============================================================================
// Runs the whole API surface against a throwaway database in a temp folder, so
// the real books are never touched:
//   node scripts/commission-smoke-test.mjs
// Checks auth, the Excel import, delta sync (including conflict resolution),
// validation, permissions and the backup endpoint.
// ============================================================================
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'commission-smoke-'));
process.env.COMMISSION_DATA_DIR = TMP;
process.env.COMMISSION_SIGNUP_CODE = 'testcode';

// Every dealer workbook seed in scripts/ is imported on boot, so the expected totals are
// the old Excel history plus whatever those books add up to.
const SCRIPTS = path.dirname(fileURLToPath(import.meta.url));
const BOOKS = fs.readdirSync(SCRIPTS)
  .filter(f => /^commission-.+-seed\.json$/.test(f))
  .map(f => JSON.parse(fs.readFileSync(path.join(SCRIPTS, f), 'utf8')))
  .reduce((a, s) => {
    a.deals += (s.sales || []).length;
    a.receipts += (s.receipts || []).length;
    a.commission += Number((s.control || {}).commission) || 0;
    a.received += Number((s.control || {}).received) || 0;
    a.dealers.push(s.dealer);
    return a;
  }, { deals: 0, receipts: 0, commission: 0, received: 0, dealers: [] });
const close = (a, b) => Math.abs(Number(a) - Number(b)) < 0.02;

const express = (await import('express')).default;
const { registerCommissionRoutes } = await import('../commissionApi.mjs');

const app = express();
app.use(express.json({ limit: '30mb' }));
registerCommissionRoutes(app);

const PORT = 4599;
const server = app.listen(PORT, async () => {
  const base = `http://127.0.0.1:${PORT}/api/commission`;
  let failed = 0;
  const check = (name, ok, extra = '') => {
    console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  -> ' + extra : ''));
    if (!ok) failed++;
  };
  const post = (p, body, headers) => fetch(base + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    body: JSON.stringify(body)
  });

  try {
    const health = await (await fetch(base + '/health')).json();
    check('health + seeded history', health.ok && health.records > 180, health.records + ' records, mode=' + health.mode);

    const signup = await (await post('/auth/signup', { name: 'Raheel', username: 'raheel', password: 'secret123' })).json();
    check('first signup becomes admin', signup.ok && signup.user.role === 'admin', signup.error || '');
    const H = { Authorization: 'Bearer ' + signup.token };

    const noCode = await (await post('/auth/signup', { name: 'X', username: 'someone', password: 'secret123' })).json();
    check('later signup needs the invite code', noCode.ok === false, noCode.error);

    const withCode = await (await post('/auth/signup', { name: 'Staff', username: 'staff1', password: 'secret123', inviteCode: 'testcode' })).json();
    check('signup with invite code', withCode.ok && withCode.user.role === 'staff', withCode.error || '');

    const login = await (await post('/auth/login', { username: 'raheel', password: 'secret123' })).json();
    check('login', login.ok === true, login.error || '');

    const badPass = await post('/auth/login', { username: 'raheel', password: 'nope' });
    check('wrong password rejected', badPass.status === 401, String(badPass.status));

    const noAuth = await fetch(base + '/bootstrap');
    check('bootstrap needs a token', noAuth.status === 401, String(noAuth.status));

    const tampered = await fetch(base + '/bootstrap', { headers: { Authorization: 'Bearer ' + signup.token.slice(0, -4) + 'aaaa' } });
    check('tampered token rejected', tampered.status === 401, String(tampered.status));

    const boot = await (await fetch(base + '/bootstrap', { headers: H })).json();
    const kinds = {};
    boot.records.forEach(r => { kinds[r.kind] = (kinds[r.kind] || 0) + 1; });
    check('history imported as sales vouchers (no commission invoices left)', !kinds.invoice, JSON.stringify(kinds));
    check('history imported: old Excel + every dealer book', kinds.voucher === 189 + BOOKS.deals + BOOKS.receipts, JSON.stringify(kinds));
    check('masters imported', (kinds.master || 0) >= 14, String(kinds.master));
    check('every history row has a date', boot.records.filter(r => r.kind !== 'master').every(r => !!r.data.date));
    check('every imported voucher has a number', boot.records.filter(r => r.kind === 'voucher').every(r => !!r.data.no));
    const deals = boot.records.filter(r => r.kind === 'voucher' && r.data.comm && r.data.comm.value > 0);
    check('every deal carries a dealer name', deals.length === 132 + BOOKS.deals && deals.every(r => !!r.data.dealer), deals.length + ' deals');
    check('a dealer master exists', boot.records.some(r => r.kind === 'master' && r.type === 'dealer' && r.data.name === 'S.E. ENGINEERING'));
    check('dealer books brought their own dealer master', BOOKS.dealers.every(n => boot.records.some(r => r.kind === 'master' && r.type === 'dealer' && r.data.name === n)), BOOKS.dealers.join(', '));

    const stats = (await (await fetch(base + '/stats', { headers: H })).json()).stats;
    check('commission matches the sheets', close(stats.commission, 17360600 + BOOKS.commission), JSON.stringify(stats));
    check('balance matches the sheets', close(stats.balance, 5700126 + BOOKS.commission - BOOKS.received), JSON.stringify(stats));

    const rec = {
      id: 'deal-test-1', kind: 'voucher', type: 'sales',
      data: {
        date: '2026-11-05', no: 'SL-TEST', seller: 'Chagani', buyer: 'S.E. ENGINEERING (PRIVATE) LIMITED',
        dealer: 'S.E. ENGINEERING', lines: [{ item: 'ABS DANA', hsCode: '3901', qty: 100, rate: 400, amount: 40000, taxPct: 18, taxAmt: 7200, total: 47200 }],
        subTotal: 40000, taxTotal: 7200, grandTotal: 47200, comm: { enabled: true, pct: 20, value: 1440 }
      },
      updatedAt: Date.now(), deleted: false
    };
    const push = await (await post('/sync', { cursor: boot.cursor, changes: [rec], limit: 5000 }, H)).json();
    check('sync accepts a new record', push.ok && push.applied === 1, JSON.stringify({ applied: push.applied, invalid: push.invalid }));
    check('sync moves the cursor', push.cursor > boot.cursor, push.cursor + ' > ' + boot.cursor);

    const pull = await (await post('/sync', { cursor: 0, changes: [], limit: 5000 }, H)).json();
    check('delta pull returns the new record', pull.changes.some(c => c.id === 'deal-test-1'), pull.changes.length + ' changes');

    const stale = await (await post('/sync', { cursor: pull.cursor, changes: [{ ...rec, data: { ...rec.data, no: 'OLD' }, updatedAt: rec.updatedAt - 5000 }] }, H)).json();
    check('older write is ignored (last-writer-wins)', stale.ignored === 1, JSON.stringify({ applied: stale.applied, ignored: stale.ignored }));

    const fresh = await (await post('/sync', { cursor: stale.cursor, changes: [{ ...rec, data: { ...rec.data, no: 'NEW' }, updatedAt: Date.now() + 1000 }] }, H)).json();
    check('newer write is applied', fresh.applied === 1, JSON.stringify({ applied: fresh.applied }));

    const del = await fetch(base + '/records/deal-test-1', { method: 'DELETE', headers: H });
    check('delete works', del.ok, String(del.status));

    const junk = await (await post('/sync', { cursor: 0, changes: [{ id: 'x1', kind: 'hack', type: 'x', data: {} }] }, H)).json();
    check('unknown record kinds rejected', junk.invalid === 1, JSON.stringify(junk.invalid));

    const backup = await fetch(base + '/backup', { headers: H });
    check('admin can download a backup', backup.status === 200, String(backup.status));

    const staffBackup = await fetch(base + '/backup', { headers: { Authorization: 'Bearer ' + withCode.token } });
    check('staff cannot download a backup', staffBackup.status === 403, String(staffBackup.status));

    const users = (await (await fetch(base + '/users', { headers: H })).json()).users;
    const selfDelete = await fetch(base + '/users/' + users.find(u => u.username === 'raheel').id, { method: 'DELETE', headers: H });
    check('cannot remove your own login', selfDelete.status === 400, String(selfDelete.status));
  } catch (e) {
    console.error('ERROR', e);
    failed++;
  } finally {
    console.log(failed ? `\n${failed} FAILURE(S)` : '\nALL CHECKS PASSED');
    server.close();
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* Windows may hold the file briefly */ }
    process.exitCode = failed ? 1 : 0;
  }
});
