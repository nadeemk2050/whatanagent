/* ==========================================================================
   COMMISSION ACCOUNTS — browser app
   --------------------------------------------------------------------------
   Offline-first, AccPro style:
     1. every read and write happens against the copy kept on this device
        (IndexedDB, with localStorage as a fallback for old browsers),
     2. a background sync pushes whatever changed and pulls only the delta,
     3. conflicts resolve by `updatedAt` (last writer wins) so nothing is lost.
   The screen therefore never waits for the network.
   ========================================================================== */

const API = '/api/commission';
const APP_VERSION = '1.0.0';

/* ---------------------------------------------------------------- utilities */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const num = (v, d = 0) => {
  const raw = String(v == null ? '' : v).replace(/,/g, '').trim();
  if (!raw) return d;
  const n = Number(raw);
  return Number.isFinite(n) ? n : d;
};
const r2 = (v) => Math.round((num(v) + Number.EPSILON) * 100) / 100;
const money = (v, dec = 2) => num(v).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const money0 = (v) => money(v, 0);
const today = () => new Date().toLocaleDateString('en-CA');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = (iso) => {
  if (!iso) return '';
  const m = String(iso).slice(0, 10).split('-');
  if (m.length !== 3) return iso;
  const d = new Date(Number(m[0]), Number(m[1]) - 1, Number(m[2]));
  if (isNaN(d)) return iso;
  return String(d.getDate()).padStart(2, '0') + ' ' + MONTHS[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2);
};
const monthKey = (iso) => String(iso || '').slice(0, 7);
const uid = (prefix) => prefix + '-' + (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 20) : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

const ICON = {
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M4 19h16"/></svg>',
  print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7 8V3h10v5"/><rect x="4" y="8" width="16" height="8" rx="2"/><path d="M7 16h10v5H7z"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/></svg>',
  sync: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-15.5 6.2M3 12a9 9 0 0 1 15.5-6.2"/><path d="M21 4v5h-5M3 20v-5h5"/></svg>',
  empty: '📒'
};

/* ---------------------------------------------------------------- state */
const state = {
  token: localStorage.getItem('ca.token') || '',
  user: safeParse(localStorage.getItem('ca.user')),
  records: new Map(),
  cursor: 0,
  syncing: false,
  lastSync: 0,
  online: navigator.onLine,
  view: 'register',
  segment: 'ledger',
  filter: { q: '', party: '', from: '', to: '', year: '' },
  report: { from: '', to: '', type: '', seller: '' },
  serverInfo: null,
  masterCache: null
};

function safeParse(s) { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } }

/* ---------------------------------------------------------------- local store */
let idb = null;
const MEM_KEY = () => 'ca.records.' + (state.user ? state.user.id : 'anon');

async function openIDB() {
  return new Promise((resolve) => {
    let req;
    try { req = indexedDB.open('commission-accounts', 1); } catch (e) { return resolve(null); }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

function idbAll() {
  if (!idb) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const tx = idb.transaction('records', 'readonly');
      const req = tx.objectStore('records').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve(null);
    } catch (e) { resolve(null); }
  });
}

function idbPut(records) {
  if (!idb || !records.length) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      const tx = idb.transaction('records', 'readwrite');
      const os = tx.objectStore('records');
      records.forEach(r => os.put(r));
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch (e) { resolve(false); }
  });
}

function memSave() {
  try {
    const arr = Array.from(state.records.values());
    localStorage.setItem(MEM_KEY(), JSON.stringify(arr));
  } catch (e) { /* quota — IndexedDB is the main store */ }
}

async function loadLocal() {
  idb = await openIDB();
  let rows = await idbAll();
  if (!rows || !rows.length) {
    const mem = safeParse(localStorage.getItem(MEM_KEY()));
    if (Array.isArray(mem)) rows = mem;
  }
  state.records.clear();
  for (const r of rows || []) {
    if (r && r.id) state.records.set(r.id, r);
  }
  const cur = Number(localStorage.getItem('ca.cursor.' + (state.user ? state.user.id : 'anon'))) || 0;
  state.cursor = cur;
  state.lastSync = Number(localStorage.getItem('ca.lastSync.' + (state.user ? state.user.id : 'anon'))) || 0;
}

async function putLocal(records) {
  records.forEach(r => state.records.set(r.id, r));
  const ok = await idbPut(records);
  if (!ok) memSave();
}

/* ---------------------------------------------------------------- api */
async function api(pathname, { method = 'GET', body, signal } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers.Authorization = 'Bearer ' + state.token;
  const res = await fetch(API + pathname, {
    method, headers, signal,
    body: body == null ? undefined : JSON.stringify(body)
  });
  let payload = null;
  try { payload = await res.json(); } catch (e) { payload = null; }
  if (res.status === 401 && pathname !== '/auth/login' && pathname !== '/auth/signup') {
    toast('Session expired. Please sign in again.', 'err');
    signOut(true);
    throw new Error(payload?.error || 'Unauthorised');
  }
  if (!res.ok || (payload && payload.ok === false)) {
    throw new Error((payload && payload.error) || ('Request failed (' + res.status + ')'));
  }
  return payload || {};
}

/* ---------------------------------------------------------------- sync engine */
let syncTimer = null;
const syncSoon = () => {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncNow(), 500);
};

function setSyncUI(kind, text) {
  const chip = $('#syncChip');
  const txt = $('#syncTxt');
  if (!chip) return;
  chip.classList.toggle('offline', kind === 'offline');
  chip.classList.toggle('busy', kind === 'busy');
  txt.textContent = text;
  chip.title = kind === 'offline' ? 'Saved on this device — will sync when the connection returns' : 'Sync now';
}

function pendingCount() {
  let n = 0;
  for (const r of state.records.values()) if (r.dirty) n++;
  return n;
}

function refreshSyncChip() {
  const pending = pendingCount();
  if (!state.online) return setSyncUI('offline', pending ? 'Offline · ' + pending : 'Offline');
  if (state.syncing) return setSyncUI('busy', 'Syncing…');
  if (pending) return setSyncUI('busy', pending + ' pending');
  if (state.lastSync) {
    const t = new Date(state.lastSync).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return setSyncUI('ok', 'Synced ' + t);
  }
  setSyncUI('ok', 'Sync');
}

async function syncNow({ quiet = true } = {}) {
  if (!state.token || state.syncing) return;
  if (!navigator.onLine) { refreshSyncChip(); return; }
  state.syncing = true;
  refreshSyncChip();
  try {
    const pushList = [];
    for (const r of state.records.values()) {
      if (r.dirty) pushList.push({ id: r.id, kind: r.kind, type: r.type, data: r.data, updatedAt: r.updatedAt, deleted: !!r.deleted });
    }
    const sentIds = pushList.map(r => r.id);

    let rounds = 0;
    let hasMore = true;
    while (hasMore && rounds < 8) {
      rounds++;
      const res = await api('/sync', {
        method: 'POST',
        body: {
          cursor: state.cursor || 0,
          changes: rounds === 1 ? pushList : [],
          limit: 3000
        }
      });
      const incoming = Array.isArray(res.changes) ? res.changes : [];
      const toStore = [];
      for (const s of incoming) {
        const local = state.records.get(s.id);
        // keep a newer local edit; the next round will push it up
        if (local && local.dirty && local.updatedAt > s.updatedAt) continue;
        toStore.push({
          id: s.id, kind: s.kind, type: s.type, data: s.data || {},
          updatedAt: s.updatedAt, deleted: !!s.deleted, dirty: 0, seq: s.seq
        });
      }
      if (toStore.length) await putLocal(toStore);
      state.cursor = num(res.cursor, state.cursor);
      hasMore = !!res.hasMore;
    }

    if (sentIds.length) {
      const cleaned = [];
      for (const id of sentIds) {
        const rec = state.records.get(id);
        if (rec && rec.dirty) { const copy = { ...rec, dirty: 0 }; state.records.set(id, copy); cleaned.push(copy); }
      }
      await putLocal(cleaned);
    }

    state.lastSync = Date.now();
    localStorage.setItem('ca.cursor.' + state.user.id, String(state.cursor));
    localStorage.setItem('ca.lastSync.' + state.user.id, String(state.lastSync));
    if (!quiet) toast('Synced with the VPS database');
    render();
  } catch (e) {
    if (!quiet) toast(e.message || 'Sync failed', 'err');
    setSyncUI('offline', 'Offline');
  } finally {
    state.syncing = false;
    refreshSyncChip();
  }
}

async function bootstrapIfEmpty() {
  if (state.records.size > 0) return;
  try {
    const res = await api('/bootstrap');
    const rows = (res.records || []).map(s => ({
      id: s.id, kind: s.kind, type: s.type, data: s.data || {},
      updatedAt: s.updatedAt, deleted: !!s.deleted, dirty: 0, seq: s.seq
    }));
    if (rows.length) await putLocal(rows);
    state.cursor = num(res.cursor, 0);
    localStorage.setItem('ca.cursor.' + state.user.id, String(state.cursor));
  } catch (e) { /* offline first run — nothing to show yet */ }
}

/* ---------------------------------------------------------------- lookups */
function records(kind, type) {
  const out = [];
  for (const r of state.records.values()) {
    if (r.deleted) continue;
    if (kind && r.kind !== kind) continue;
    if (type && r.type !== type) continue;
    out.push(r);
  }
  return out;
}
const parties = () => records('master', 'party').sort((a, b) => (a.data.name || '').localeCompare(b.data.name || ''));
const items = () => records('master', 'item').sort((a, b) => (a.data.name || '').localeCompare(b.data.name || ''));
const banks = () => records('master', 'bank');
const taxes = () => records('master', 'tax');
const expenseHeads = () => records('master', 'expense');
const invoices = () => records('invoice', 'commission');
const vouchers = (type) => records('voucher', type);
const allVouchers = () => records('voucher');

function partyByName(name) {
  const key = String(name || '').trim().toLowerCase();
  return parties().find(p => String(p.data.name || '').trim().toLowerCase() === key) || null;
}
function commissionPctFor(name) {
  const p = partyByName(name);
  if (p && num(p.data.commissionPct, 0) > 0) return num(p.data.commissionPct);
  const rate = records('master', 'rate')[0];
  return rate && num(rate.data.pct, 0) > 0 ? num(rate.data.pct) : 20;
}
function itemByName(name) {
  const key = String(name || '').trim().toLowerCase();
  return items().find(i => String(i.data.name || '').trim().toLowerCase() === key) || null;
}

/* ---------------------------------------------------------------- writes */
async function saveRecord(kind, type, data, existing) {
  const rec = {
    id: existing ? existing.id : uid(kind),
    kind, type,
    data,
    updatedAt: Date.now(),
    deleted: false,
    dirty: 1,
    seq: existing ? existing.seq : undefined
  };
  await putLocal([rec]);
  syncSoon();
  return rec;
}

async function deleteRecord(rec) {
  const copy = { ...rec, deleted: true, updatedAt: Date.now(), dirty: 1 };
  await putLocal([copy]);
  syncSoon();
}

/* ---------------------------------------------------------------- toasts / modal */
function toast(message, kind = 'ok') {
  const wrap = $('#toastWrap');
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 2600);
  setTimeout(() => el.remove(), 3000);
}

function openModal(html, { wide = false } = {}) {
  const backdrop = $('#modalBackdrop');
  const modal = $('#modal');
  modal.className = 'modal' + (wide ? ' wide' : '');
  modal.innerHTML = html;
  backdrop.classList.add('open');
  return modal;
}
function closeModal() {
  $('#modalBackdrop').classList.remove('open');
  $('#modal').innerHTML = '';
}
function confirmDialog({ title, message, confirmText = 'Delete', danger = true, onConfirm }) {
  const modal = openModal(`
    <div class="modal-head"><div><h3>${esc(title)}</h3></div><button class="icon-btn x" data-close aria-label="Close">✕</button></div>
    <div class="modal-body"><p style="color:var(--ink-2);line-height:1.6">${message}</p></div>
    <div class="modal-foot">
      <button class="btn" data-close>Cancel</button>
      <button class="btn ${danger ? 'danger' : 'primary'}" id="cfmYes">${esc(confirmText)}</button>
    </div>`);
  $$('[data-close]', modal).forEach(b => b.addEventListener('click', closeModal));
  $('#cfmYes', modal).addEventListener('click', async () => {
    closeModal();
    try { await onConfirm(); } catch (e) { toast(e.message || 'Failed', 'err'); }
  });
}

/* ---------------------------------------------------------------- drawer */
function openDrawer() {
  $('#drawer').classList.add('open');
  $('#drawerBackdrop').classList.add('open');
}
function closeDrawer() {
  $('#drawer').classList.remove('open');
  $('#drawerBackdrop').classList.remove('open');
}
function toggleSubmenu(id, btn) {
  const sub = $('#sub-' + id);
  const open = sub.classList.toggle('open');
  btn.classList.toggle('expanded', open);
}

/* ---------------------------------------------------------------- auth */
function showAuth(msg, kind) {
  $('#appShell').hidden = true;
  $('#authScreen').hidden = false;
  const box = $('#authMsg');
  box.className = 'auth-msg' + (msg ? ' ' + kind : '');
  box.textContent = msg || '';
  const hasUsers = !!localStorage.getItem('ca.everSignedIn');
  $('#suInviteField').hidden = !hasUsers;
}

function showApp() {
  $('#authScreen').hidden = true;
  $('#appShell').hidden = false;
  const u = state.user || {};
  $('#userName').textContent = u.name || u.username || 'Account';
  $('#userAvatar').textContent = (u.name || u.username || 'S').trim().charAt(0).toUpperCase();
  refreshSyncChip();
  updateDrawerMeta();
}

function liveCount() {
  let n = 0;
  for (const r of state.records.values()) if (!r.deleted) n++;
  return n;
}

function updateDrawerMeta() {
  const info = state.serverInfo;
  const storeEl = $('#drawerStore');
  const countEl = $('#drawerCount');
  if (storeEl) {
    storeEl.textContent = info
      ? (info.mode === 'sqlite' ? 'VPS SQLite' : info.mode === 'json' ? 'VPS file' : 'Device only')
      : (navigator.onLine ? 'Device' : 'Offline');
  }
  if (countEl) countEl.textContent = liveCount() + ' records';
}

async function doLogin(username, password) {
  const res = await api('/auth/login', { method: 'POST', body: { username, password } });
  state.token = res.token;
  state.user = res.user;
  localStorage.setItem('ca.token', res.token);
  localStorage.setItem('ca.user', JSON.stringify(res.user));
  localStorage.setItem('ca.everSignedIn', '1');
  await startApp();
}

async function doSignup(name, username, password, inviteCode) {
  const res = await api('/auth/signup', { method: 'POST', body: { name, username, password, inviteCode } });
  state.token = res.token;
  state.user = res.user;
  localStorage.setItem('ca.token', res.token);
  localStorage.setItem('ca.user', JSON.stringify(res.user));
  localStorage.setItem('ca.everSignedIn', '1');
  await startApp();
  if (res.firstUser) toast('Admin account created — you are the administrator');
}

function signOut(silent) {
  state.token = '';
  state.user = null;
  state.records.clear();
  localStorage.removeItem('ca.token');
  localStorage.removeItem('ca.user');
  showAuth(silent ? 'Please sign in again.' : '', 'err');
}

async function startApp() {
  showApp();
  await loadLocal();
  state.online = navigator.onLine;
  showApp();
  if (navigator.onLine) {
    try {
      const me = await api('/auth/me');
      state.user = me.user;
      state.serverInfo = me.store;
      localStorage.setItem('ca.user', JSON.stringify(me.user));
    } catch (e) { /* stay with cached identity */ }
    await bootstrapIfEmpty();
    await syncNow({ quiet: true });
  }
  render();
}

/* ---------------------------------------------------------------- ledger maths */
function ledgerRows() {
  const rows = [];
  for (const inv of invoices()) {
    const d = inv.data;
    rows.push({
      kind: 'invoice', id: inv.id, rec: inv,
      date: d.date || '', party: d.seller || '', counterparty: d.buyer || '',
      invNo: d.invNo || '', item: d.item || '', hsCode: d.hsCode || '',
      qty: num(d.qty), rate: num(d.rate), amount: num(d.amount),
      gstPct: num(d.gstPct), gstValue: num(d.gstValue),
      commPct: num(d.commPct), commission: num(d.commValue),
      received: 0, narration: d.notes || ''
    });
  }
  for (const v of allVouchers()) {
    const d = v.data;
    if (v.type === 'receipt' || v.type === 'payment') {
      rows.push({
        kind: v.type, id: v.id, rec: v,
        date: d.date || '', party: d.party || '', counterparty: d.account || '',
        invNo: d.no || '', item: '', hsCode: '',
        qty: 0, rate: 0, amount: 0, gstPct: 0, gstValue: 0, commPct: 0, commission: 0,
        received: num(d.amount),
        narration: d.narration || (v.type === 'receipt' ? 'Commission received' : 'Payment')
      });
    }
  }
  rows.sort((a, b) => (a.date || '9999-99-99').localeCompare(b.date || '9999-99-99') || String(a.id).localeCompare(String(b.id)));
  let bal = 0;
  for (const row of rows) {
    bal += row.commission - row.received;
    row.balance = r2(bal);
  }
  return rows;
}

function registerTotals() {
  let commission = 0, received = 0, paid = 0;
  const list = invoices();
  for (const inv of list) commission += num(inv.data.commValue);
  for (const v of vouchers('receipt')) received += num(v.data.amount);
  for (const v of vouchers('payment')) paid += num(v.data.amount);
  return {
    invoices: list.length,
    commission: r2(commission),
    received: r2(received),
    paid: r2(paid),
    balance: r2(commission - received - paid)
  };
}

/* ---------------------------------------------------------------- views: register */
/* ---------------------------------------------------------------- registers: day book & purchases */
const TXN = {
  commission: { label: 'Commission', pill: 'both' },
  purchase: { label: 'Purchase', pill: 'buyer' },
  sales: { label: 'Sales', pill: 'seller' },
  receipt: { label: 'Receipt', pill: 'seller' },
  payment: { label: 'Payment', pill: 'cash' },
  journal: { label: 'Journal', pill: 'gray' }
};

// Every entry in the books, in one list — this is what the Day Book shows.
function allTransactions() {
  const out = [];
  for (const inv of invoices()) {
    const d = inv.data;
    out.push({
      id: inv.id, rec: inv, kind: 'commission',
      date: d.date || '', no: d.invNo || '', party: d.seller || '', against: d.buyer || '',
      narration: d.notes || ('Commission on GST of invoice ' + (d.invNo || '')),
      item: d.item || '', hsCode: d.hsCode || '',
      base: num(d.amount), gst: num(d.gstValue), value: num(d.commValue),
      pct: num(d.commPct), account: ''
    });
  }
  for (const v of allVouchers()) {
    const d = v.data;
    if (v.type === 'purchase' || v.type === 'sales') {
      const lines = Array.isArray(d.lines) ? d.lines : [];
      out.push({
        id: v.id, rec: v, kind: v.type,
        date: d.date || '', no: d.no || '', party: d.party || '', against: '',
        narration: d.narration || lines.map(l => (l.item || '') + ' x ' + money(l.qty, 0)).filter(Boolean).join(', '),
        item: lines.map(l => l.item).filter(Boolean).join(', '),
        hsCode: (lines[0] || {}).hsCode || '', lines,
        base: num(d.subTotal), gst: num(d.taxTotal), value: num(d.grandTotal), account: ''
      });
    } else {
      out.push({
        id: v.id, rec: v, kind: v.type,
        date: d.date || '', no: d.no || '', party: d.party || '', against: '',
        narration: d.narration || '',
        item: '', hsCode: '', base: 0, gst: 0, value: num(d.amount),
        account: d.account || [d.debitAccount, d.creditAccount].filter(Boolean).join(' -> ')
      });
    }
  }
  out.sort((a, b) => (a.date || '').localeCompare(b.date || '') || String(a.no).localeCompare(String(b.no)));
  return out;
}

function dayTotals(list) {
  const t = { purchase: 0, sales: 0, receipt: 0, payment: 0, commission: 0, journal: 0 };
  for (const x of list) t[x.kind] = r2((t[x.kind] || 0) + x.value);
  return t;
}

function inReportRange(date) {
  const { from, to } = state.report;
  if (from && (date || '') < from) return false;
  if (to && (date || '') > to) return false;
  return true;
}

function reportLabel() {
  const { from, to } = state.report;
  if (from && to && from === to) return 'Showing ' + fmtDate(from);
  if (from || to) return 'Showing ' + (from ? fmtDate(from) : 'start') + ' to ' + (to ? fmtDate(to) : 'today');
  return 'All dates';
}

function renderDayBook() {
  const all = allTransactions();
  const rows = all.filter(x => inReportRange(x.date) && (!state.report.type || x.kind === state.report.type));
  const days = [];
  const map = new Map();
  for (const x of rows) {
    const key = x.date || 'undated';
    if (!map.has(key)) { map.set(key, []); days.push(key); }
    map.get(key).push(x);
  }
  days.sort((a, b) => a.localeCompare(b));
  const totalAll = dayTotals(rows);

  const dayBlock = (day) => {
    const list = map.get(day);
    const t = dayTotals(list);
    const d = day === 'undated' ? null : new Date(day + 'T00:00:00');
    const wd = d && !isNaN(d) ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()] : '';
    return `
      <div class="day-block">
        <div class="day-head">
          <div class="day-date">
            <b>${day === 'undated' ? 'No date' : esc(fmtDate(day))}</b>
            <span>${esc(wd)}${wd ? ' / ' : ''}${list.length} entr${list.length === 1 ? 'y' : 'ies'}</span>
          </div>
          <div class="day-chips">
            ${t.purchase ? `<span class="pill buyer">Purchase ${money0(t.purchase)}</span>` : ''}
            ${t.sales ? `<span class="pill seller">Sales ${money0(t.sales)}</span>` : ''}
            ${t.receipt ? `<span class="pill ok">Received ${money0(t.receipt)}</span>` : ''}
            ${t.payment ? `<span class="pill pend">Paid ${money0(t.payment)}</span>` : ''}
            ${t.journal ? `<span class="pill gray">Journal ${money0(t.journal)}</span>` : ''}
            ${t.commission ? `<span class="pill both">Commission ${money0(t.commission)}</span>` : ''}
          </div>
        </div>
        <div class="table-wrap">
          <table class="rtable">
            <thead><tr>
              <th>Type</th><th>Voucher</th><th>Party</th><th>Particulars</th>
              <th class="num">Amount</th><th class="num">GST</th><th class="num">Value</th><th></th>
            </tr></thead>
            <tbody>${list.map(x => `
              <tr>
                <td data-label="Type"><span class="pill ${TXN[x.kind].pill}">${esc(TXN[x.kind].label)}</span></td>
                <td class="mono strong" data-label="Voucher">${esc(x.no || '-')}</td>
                <td class="wrap" data-label="Party">${esc(x.party || '-')}${x.account ? `<div class="muted sub">${esc(x.account)}</div>` : ''}</td>
                <td class="wrap" data-label="Particulars">
                  <div class="cell-val">
                    <div>${esc(x.narration || '-')}</div>
                    ${x.item ? `<div class="muted sub">${esc(x.item)}${x.hsCode ? ' / HS ' + esc(x.hsCode) : ''}</div>` : ''}
                  </div>
                </td>
                <td class="num" data-label="Amount">${x.base ? money(x.base, 0) : '-'}</td>
                <td class="num" data-label="GST">${x.gst ? money(x.gst, 0) : '-'}</td>
                <td class="num strong" data-label="Value" style="color:${x.kind === 'payment' ? 'var(--amber)' : x.kind === 'receipt' ? 'var(--brand)' : 'var(--ink)'}">${money(x.value)}</td>
                <td class="cell-actions"><div class="row-actions">
                  <button class="icon-btn" data-edit="${esc(x.id)}" title="Open">${ICON.edit}</button>
                </div></td>
              </tr>`).join('')}</tbody>
            ${list.length > 1 ? `<tfoot><tr>
              <td colspan="4" data-label="Day total">Day total (${list.length})</td>
              <td class="num" data-label="Amount">${money(list.reduce((a, x) => a + x.base, 0), 0)}</td>
              <td class="num" data-label="GST">${money(list.reduce((a, x) => a + x.gst, 0), 0)}</td>
              <td class="num" data-label="Value">${money(list.reduce((a, x) => a + x.value, 0))}</td>
              <td></td>
            </tr></tfoot>` : ''}
          </table>
        </div>
      </div>`;
  };

  $('#main').innerHTML = `
    <div class="view-head">
      <div><h2>Day Book</h2><p>Every entry, day by day: purchases, sales, receipts, payments, journals and commission.</p></div>
      <div class="actions">
        <button class="btn" data-act="range">${ICON.calendar} Date range</button>
        <button class="btn" data-act="export">${ICON.download} Export CSV</button>
        <button class="btn primary" data-act="day">${ICON.calendar} View a day</button>
      </div>
    </div>

    <div class="kpis">
      <div class="kpi"><div class="label">Purchases</div><div class="value">${money0(totalAll.purchase)}</div><div class="sub">bought in this period</div></div>
      <div class="kpi"><div class="label">Sales</div><div class="value">${money0(totalAll.sales)}</div><div class="sub">sold in this period</div></div>
      <div class="kpi green"><div class="label">Received</div><div class="value">${money0(totalAll.receipt)}</div><div class="sub">commission received</div></div>
      <div class="kpi amber"><div class="label">Paid out</div><div class="value">${money0(totalAll.payment)}</div><div class="sub">expenses and deductions</div></div>
    </div>

    <div class="card">
      <div class="toolbar">
        <div class="search">${ICON.search}<input id="fQ" placeholder="Search voucher, party, narration..." value="${esc(state.filter.q)}"></div>
        <select id="rType">
          <option value="">All types</option>
          ${Object.keys(TXN).map(k => `<option value="${k}" ${state.report.type === k ? 'selected' : ''}>${TXN[k].label}</option>`).join('')}
        </select>
        <input type="date" id="rFrom" value="${esc(state.report.from)}" title="From date">
        <input type="date" id="rTo" value="${esc(state.report.to)}" title="To date">
        <span class="pill ok" id="rLabel">${esc(reportLabel())}</span>
        ${(state.report.from || state.report.to || state.report.type) ? '<button class="btn sm" data-act="clear">Clear</button>' : ''}
        <span class="kbd-hint" title="Press F2 to open one day, Alt+F2 for a date range">F2 / Alt+F2</span>
      </div>
      ${rows.length ? days.map(dayBlock).join('') : emptyState('No entries in this period', 'Change the dates, or add a voucher from Quick Vouchers.', '<button class="btn primary" data-act="day">View a day</button>')}
    </div>`;

  $('#main').querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openEntry(b.dataset.edit)));
  $('#fQ').addEventListener('input', debounce((e) => { state.filter.q = e.target.value; render(); }, 220));
  $('#rType').addEventListener('change', (e) => { state.report.type = e.target.value; render(); });
  $('#rFrom').addEventListener('change', (e) => { state.report.from = e.target.value; render(); });
  $('#rTo').addEventListener('change', (e) => { state.report.to = e.target.value; render(); });
  const acts = {
    day: () => openPeriodDialog('day'),
    range: () => openPeriodDialog('range'),
    export: exportDayBookCsv,
    clear: () => { state.report = { from: '', to: '', type: '', seller: '' }; render(); }
  };
  $$('[data-act]').forEach(b => { const fn = acts[b.dataset.act]; if (fn) b.addEventListener('click', fn); });
}

function exportDayBookCsv() {
  const rows = allTransactions().filter(x => inReportRange(x.date));
  if (!rows.length) return toast('Nothing to export', 'err');
  const head = ['Date', 'Type', 'Voucher', 'Party', 'Particulars', 'Item', 'Amount', 'GST', 'Value'];
  const body = rows.map(x => [x.date, TXN[x.kind].label, x.no, x.party, x.narration, x.item, x.base, x.gst, x.value]);
  const csv = [head, ...body].map(line => line.map(v => {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\r\n');
  download('day-book-' + (state.report.from || 'all') + '.csv', '\ufeff' + csv, 'text/csv');
  toast('Day book exported');
}

const GOODS_META = {
  purchase: {
    title: 'Purchase Register', sub: 'Every material purchase, with the GST you paid on it.',
    party: 'Seller', partyHead: 'Seller',
    totalKpi: 'Purchases', gstKpi: 'GST paid', gstSub: 'input tax',
    withTaxSub: 'what you owe', empty: 'No purchases in this period',
    emptyHint: 'Purchase vouchers you save will appear here, with GST on every line.',
    newLabel: 'New purchase', csv: 'purchase-register'
  },
  sales: {
    title: 'Sales Register', sub: 'Every material sale, with the GST you charged on it.',
    party: 'Buyer', partyHead: 'Buyer',
    totalKpi: 'Sales', gstKpi: 'GST charged', gstSub: 'output tax',
    withTaxSub: 'what your buyer owes', empty: 'No sales in this period',
    emptyHint: 'Sales vouchers you save will appear here, with GST on every line.',
    newLabel: 'New sale', csv: 'sales-register'
  }
};

function renderGoodsRegister(type) {
  const meta = GOODS_META[type] || GOODS_META.purchase;
  const all = vouchers(type)
    .filter(v => inReportRange(v.data.date))
    .filter(v => !state.filter.q || JSON.stringify(v.data).toLowerCase().includes(state.filter.q.toLowerCase()))
    .sort((a, b) => (a.data.date || '').localeCompare(b.data.date || '') || String(a.data.no || '').localeCompare(String(b.data.no || '')));

  const sum = (k) => r2(all.reduce((a, v) => a + num(v.data[k]), 0));
  const totalQty = all.reduce((a, v) => a + (v.data.lines || []).reduce((s, l) => s + num(l.qty), 0), 0);
  const hasBrokerage = all.some(v => num((v.data.comm || {}).value) > 0);
  const colspan = hasBrokerage ? 5 : 4;

  const body = all.length ? `
    <div class="table-wrap">
      <table class="rtable">
        <thead><tr>
          <th>Date</th><th>Voucher</th><th>${esc(meta.partyHead)}</th><th>Items</th>
          <th class="num">Qty</th><th class="num">Sub total</th><th class="num">GST</th><th class="num">Total</th>
          ${hasBrokerage ? '<th class="num">Brokerage</th>' : ''}<th></th>
        </tr></thead>
        <tbody>${all.map(v => {
          const d = v.data;
          const qty = (d.lines || []).reduce((s, l) => s + num(l.qty), 0);
          const comm = num((d.comm || {}).value);
          return `<tr>
            <td class="mono nowrap" data-label="Date">${esc(fmtDate(d.date))}</td>
            <td class="mono strong" data-label="Voucher">${esc(d.no || '-')}</td>
            <td class="wrap" data-label="${esc(meta.party)}"><div class="cell-val"><div class="strong">${esc(d.party || '-')}</div>${d.narration ? `<div class="muted sub">${esc(d.narration)}</div>` : ''}</div></td>
            <td class="wrap" data-label="Items"><div class="cell-val">${(d.lines || []).map(l => `${esc(l.item || '-')} <span class="muted">x ${money(l.qty, 0)} @ ${money(l.rate, 0)}</span>${num(l.taxPct) ? ` <span class="muted">(${money(l.taxPct, 0)}% GST)</span>` : ''}`).join('<br>') || '-'}</div></td>
            <td class="num" data-label="Qty">${money(qty, 0)}</td>
            <td class="num" data-label="Sub total">${money(d.subTotal)}</td>
            <td class="num" data-label="GST">${money(d.taxTotal)}</td>
            <td class="num strong" data-label="Total">${money(d.grandTotal)}</td>
            ${hasBrokerage ? `<td class="num" data-label="Brokerage" style="color:var(--violet)">${comm ? money(comm) : '-'}</td>` : ''}
            <td class="cell-actions"><div class="row-actions">
              <button class="icon-btn" data-edit="${esc(v.id)}" title="Open voucher">${ICON.edit}</button>
            </div></td>
          </tr>`;
        }).join('')}</tbody>
        <tfoot><tr>
          <td colspan="${colspan}" data-label="Total">Total (${all.length} voucher${all.length === 1 ? '' : 's'})</td>
          <td class="num" data-label="Qty">${money(totalQty, 0)}</td>
          <td class="num" data-label="Sub total">${money(sum('subTotal'))}</td>
          <td class="num" data-label="GST">${money(sum('taxTotal'))}</td>
          <td class="num" data-label="Total">${money(sum('grandTotal'))}</td>
          ${hasBrokerage ? `<td class="num" data-label="Brokerage">${money(r2(all.reduce((a, v) => a + num((v.data.comm || {}).value), 0)))}</td>` : ''}
          <td></td>
        </tr></tfoot>
      </table>
    </div>` : emptyState(meta.empty, meta.emptyHint, `<button class="btn primary" data-act="new">${esc(meta.newLabel)} voucher</button>`);

  $('#main').innerHTML = `
    <div class="view-head">
      <div><h2>${esc(meta.title)}</h2><p>${esc(meta.sub)}</p></div>
      <div class="actions">
        <button class="btn" data-act="range">${ICON.calendar} Date range</button>
        <button class="btn" data-act="export">${ICON.download} Export CSV</button>
        <button class="btn" data-act="print">${ICON.print} Print</button>
        <button class="btn primary" data-act="new">${ICON.plus} ${esc(meta.newLabel)}</button>
      </div>
    </div>

    <div class="kpis">
      <div class="kpi"><div class="label">${esc(meta.totalKpi)}</div><div class="value">${money0(sum('subTotal'))}</div><div class="sub">${all.length} voucher${all.length === 1 ? '' : 's'}</div></div>
      <div class="kpi amber"><div class="label">${esc(meta.gstKpi)}</div><div class="value">${money0(sum('taxTotal'))}</div><div class="sub">${esc(meta.gstSub)}</div></div>
      <div class="kpi violet"><div class="label">Total with tax</div><div class="value">${money0(sum('grandTotal'))}</div><div class="sub">${esc(meta.withTaxSub)}</div></div>
      <div class="kpi"><div class="label">Quantity</div><div class="value">${money0(totalQty)}</div><div class="sub">all items</div></div>
    </div>

    <div class="card">
      <div class="toolbar">
        <div class="search">${ICON.search}<input id="fQ" placeholder="Search voucher, ${type === 'sales' ? 'buyer' : 'seller'}, item..." value="${esc(state.filter.q)}"></div>
        <input type="date" id="rFrom" value="${esc(state.report.from)}" title="From date">
        <input type="date" id="rTo" value="${esc(state.report.to)}" title="To date">
        <span class="pill ok">${esc(reportLabel())}</span>
        ${(state.report.from || state.report.to) ? '<button class="btn sm" data-act="clear">Clear</button>' : ''}
        <span class="kbd-hint" title="Press F2 to open one day, Alt+F2 for a date range">F2 / Alt+F2</span>
      </div>
      ${body}
    </div>`;

  $('#fQ').addEventListener('input', debounce(e => { state.filter.q = e.target.value; render(); }, 220));
  $('#rFrom').addEventListener('change', e => { state.report.from = e.target.value; render(); });
  $('#rTo').addEventListener('change', e => { state.report.to = e.target.value; render(); });
  const acts = {
    range: () => openPeriodDialog('range'),
    print: () => window.print(),
    export: () => exportGoodsCsv(type, all, meta),
    new: () => voucherModal(type),
    clear: () => { state.report.from = ''; state.report.to = ''; render(); }
  };
  $$('[data-act]').forEach(b => { const fn = acts[b.dataset.act]; if (fn) b.addEventListener('click', fn); });
  $$('[data-edit]').forEach(b => b.addEventListener('click', () => openEntry(b.dataset.edit)));
}

function exportGoodsCsv(type, list, meta) {
  if (!list.length) return toast('Nothing to export', 'err');
  const head = ['Date', 'Voucher', meta.party, 'Items', 'Qty', 'Sub total', 'GST', 'Total', 'Brokerage', 'Narration'];
  const body = list.map(v => {
    const d = v.data;
    const qty = (d.lines || []).reduce((s, l) => s + num(l.qty), 0);
    return [
      d.date, d.no, d.party,
      (d.lines || []).map(l => `${l.item || ''} ${l.qty || ''} x ${l.rate || ''}${num(l.taxPct) ? ' @' + l.taxPct + '%' : ''}`).join(' | '),
      qty, num(d.subTotal), num(d.taxTotal), num(d.grandTotal), num((d.comm || {}).value), d.narration || ''
    ];
  });
  const csv = [head, ...body].map(line => line.map(v => {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\r\n');
  download(meta.csv + '-' + (state.report.from || 'all') + '.csv', '\ufeff' + csv, 'text/csv');
  toast(meta.title + ' exported');
}

/* ---------------------------------------------------------------- F2 / Alt+F2 period view */
function openPeriodDialog(mode) {
  const todayStr = today();
  const from = state.report.from || (mode === 'day' ? todayStr : todayStr.slice(0, 8) + '01');
  const to = state.report.to || todayStr;
  const isDay = mode === 'day';
  const modal = openModal(`
    <div class="modal-head">
      <div><h3>${isDay ? 'View a day' : 'View a date range'}</h3>
        <div class="sub">${isDay ? 'Opens the Day Book for one date.' : 'Opens the Day Book between two dates.'}</div></div>
      <button class="icon-btn x" data-close>Close</button>
    </div>
    <div class="modal-body">
      ${isDay ? `
        <div class="quick-days">
          <button class="btn sm" data-day="0">Today</button>
          <button class="btn sm" data-day="-1">Yesterday</button>
          <button class="btn sm" data-day="-7">A week ago</button>
        </div>
        <div class="field" style="margin-top:14px"><label for="pDay">Date</label><input id="pDay" type="date" value="${esc(from)}"></div>` : `
        <div class="quick-days">
          <button class="btn sm" data-range="month">This month</button>
          <button class="btn sm" data-range="last-month">Last month</button>
          <button class="btn sm" data-range="year">This year</button>
          <button class="btn sm" data-range="fy">Financial year (Jul-Jun)</button>
        </div>
        <div class="grid-2" style="margin-top:14px">
          <div class="field"><label for="pFrom">From</label><input id="pFrom" type="date" value="${esc(from)}"></div>
          <div class="field"><label for="pTo">To</label><input id="pTo" type="date" value="${esc(to)}"></div>
        </div>`}
    </div>
    <div class="modal-foot">
      <button class="btn" data-close>Cancel</button>
      <button class="btn primary" id="pGo">${isDay ? 'Open that day' : 'Open range'}</button>
    </div>`);

  const go = (f, t) => {
    state.report.from = f;
    state.report.to = t;
    state.filter.q = '';
    state.view = 'daybook';
    closeModal();
    render();
  };

  $$('[data-close]', modal).forEach(b => b.addEventListener('click', closeModal));
  if (isDay) {
    $$('[data-day]', modal).forEach(b => b.addEventListener('click', () => {
      const d = new Date();
      d.setDate(d.getDate() + Number(b.dataset.day));
      $('#pDay', modal).value = d.toLocaleDateString('en-CA');
    }));
  } else {
    $$('[data-range]', modal).forEach(b => b.addEventListener('click', () => {
      const now = new Date();
      const iso = (d) => d.toLocaleDateString('en-CA');
      let f, t;
      if (b.dataset.range === 'month') { f = new Date(now.getFullYear(), now.getMonth(), 1); t = now; }
      else if (b.dataset.range === 'last-month') { f = new Date(now.getFullYear(), now.getMonth() - 1, 1); t = new Date(now.getFullYear(), now.getMonth(), 0); }
      else if (b.dataset.range === 'year') { f = new Date(now.getFullYear(), 0, 1); t = now; }
      else { const y = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1; f = new Date(y, 6, 1); t = new Date(y + 1, 5, 30); }
      $('#pFrom', modal).value = iso(f);
      $('#pTo', modal).value = iso(t);
    }));
  }
  $('#pGo', modal).addEventListener('click', () => {
    if (isDay) {
      const d = $('#pDay', modal).value || today();
      go(d, d);
    } else {
      let f = $('#pFrom', modal).value;
      let t = $('#pTo', modal).value;
      if (!f && !t) return toast('Choose at least one date', 'err');
      if (f && t && f > t) { const x = f; f = t; t = x; }
      go(f, t || f);
    }
  });
  const first = $(isDay ? '#pDay' : '#pFrom', modal);
  if (first) setTimeout(() => { try { first.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 60);
}

/* ---------------------------------------------------------------- views: register */
function matchesFilter(row) {
  const f = state.filter;
  if (f.party && row.party !== f.party) return false;
  if (f.from && (row.date || '') < f.from) return false;
  if (f.to && (row.date || '') > f.to) return false;
  if (f.year && String(row.date || '').slice(0, 4) !== f.year) return false;
  if (f.q) {
    const hay = [row.party, row.counterparty, row.invNo, row.item, row.hsCode, row.narration].join(' ').toLowerCase();
    if (!hay.includes(f.q.toLowerCase())) return false;
  }
  return true;
}

function renderRegister() {
  const t = registerTotals();
  const all = ledgerRows();
  const rows = all.filter(matchesFilter);
  const years = [...new Set(all.map(r => String(r.date || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  const filterSum = rows.reduce((a, r) => ({ commission: a.commission + r.commission, received: a.received + r.received }), { commission: 0, received: 0 });

  const partyList = parties().filter(p => p.data.role !== 'buyer');
  const seg = state.segment;

  let body = '';
  if (seg === 'company') {
    body = renderByCompany(rows);
  } else {
    const list = seg === 'invoice' ? rows.filter(r => r.kind === 'invoice') : rows;
    body = list.length ? `
      <div class="table-wrap">
        <table class="ledger rtable">
          <thead><tr>
            <th>Date</th><th>Seller / Party</th><th>Item</th>
            <th class="num col-opt">Qty × Rate</th><th class="num col-opt">Amount</th>
            <th class="num">GST</th><th class="num">Commission</th>
            <th class="num">Received</th><th class="num">Balance</th><th></th>
          </tr></thead>
          <tbody>
          ${list.map(r => `
            <tr>
              <td class="mono nowrap" data-label="Date">${esc(fmtDate(r.date))}</td>
              <td class="wrap" data-label="Party">
                <div class="cell-val">
                  <div class="strong">${esc(r.party || '—')}</div>
                  <div class="muted sub">${r.invNo ? esc(r.invNo) : ''}${r.narration ? (r.invNo ? ' · ' : '') + esc(r.narration) : ''}</div>
                </div>
              </td>
              <td class="wrap" data-label="Item">
                <div class="cell-val">
                  <div>${esc(r.item || '—')}</div>
                  ${r.hsCode ? `<div class="muted sub">HS ${esc(r.hsCode)}</div>` : ''}
                </div>
              </td>
              <td class="num sub-cell col-opt" data-label="Qty × Rate"><div class="cell-val">${r.qty ? `<div>${money(r.qty, 0)}</div><div class="muted sub">@ ${money(r.rate, 0)}</div>` : '—'}</div></td>
              <td class="num col-opt" data-label="Amount">${r.amount ? money(r.amount, 0) : '—'}</td>
              <td class="num sub-cell" data-label="GST"><div class="cell-val">${r.gstValue ? `<div>${money(r.gstValue, 0)}</div><div class="muted sub">${money(r.gstPct, 0)}%</div>` : '—'}</div></td>
              <td class="num sub-cell" style="color:var(--brand)" data-label="Commission"><div class="cell-val"><div class="strong">${r.commission ? money(r.commission) : '—'}</div>${r.commPct ? `<div class="muted sub">${money(r.commPct, 0)}% of GST</div>` : ''}</div></td>
              <td class="num" style="color:var(--amber)" data-label="Received">${r.received ? money(r.received) : '—'}</td>
              <td class="num strong" data-label="Balance">${money(r.balance)}</td>
              <td class="cell-actions">
                <div class="row-actions">
                  <button class="icon-btn" data-edit="${esc(r.id)}" title="Edit">${ICON.edit}</button>
                  <button class="icon-btn del" data-del="${esc(r.id)}" title="Delete">${ICON.del}</button>
                </div>
              </td>
            </tr>`).join('')}
          </tbody>
          <tfoot><tr>
            <td colspan="3" data-label="Total">Total (${list.length} row${list.length === 1 ? '' : 's'})</td>
            <td class="col-opt"></td>
            <td class="num col-opt" data-label="Amount">${money(list.reduce((a, r) => a + r.amount, 0), 0)}</td>
            <td class="num" data-label="GST">${money(list.reduce((a, r) => a + r.gstValue, 0), 0)}</td>
            <td class="num" style="color:var(--brand)" data-label="Commission">${money(filterSum.commission)}</td>
            <td class="num" style="color:var(--amber)" data-label="Received">${money(filterSum.received)}</td>
            <td class="num" data-label="Balance">${money(r2(filterSum.commission - filterSum.received))}</td>
            <td></td>
          </tr></tfoot>
        </table>
      </div>` : emptyState(
        'No entries yet',
        'Add your first commission entry — seller, buyer, invoice and the GST share you earn are calculated automatically.',
        '<button class="btn primary" data-new="invoice">Add commission entry</button>'
      );
  }

  $('#main').innerHTML = `
    <div class="view-head">
      <div>
        <h2>Commission Register</h2>
        <p>Every deal through S.E. Engineering — commission calculated on the GST amount.</p>
      </div>
      <div class="actions">
        <button class="btn" data-act="export">${ICON.download} Export CSV</button>
        <button class="btn" data-act="print">${ICON.print} Print</button>
        <button class="btn" data-new="receipt">＋ Receive commission</button>
        <button class="btn primary" data-new="invoice">${ICON.plus} New commission entry</button>
      </div>
    </div>

    <div class="kpis">
      <div class="kpi violet"><div class="label">Commission earned</div><div class="value">${money0(t.commission)}</div><div class="sub">${t.invoices} invoices</div></div>
      <div class="kpi green"><div class="label">Received</div><div class="value">${money0(t.received)}</div><div class="sub">commission receipts</div></div>
      <div class="kpi amber"><div class="label">Payments / deductions</div><div class="value">${money0(t.paid)}</div><div class="sub">paid out</div></div>
      <div class="kpi ${t.balance > 0 ? 'red' : 'green'}"><div class="label">Balance receivable</div><div class="value">${money0(t.balance)}</div><div class="sub">${t.balance >= 0 ? 'still to receive' : 'over-received'}</div></div>
    </div>

    <div class="card">
      <div class="toolbar">
        <div class="search">${ICON.search}<input id="fQ" placeholder="Search party, invoice, item…" value="${esc(state.filter.q)}"></div>
        <select id="fParty">
          <option value="">All companies</option>
          ${partyList.map(p => `<option value="${esc(p.data.name)}" ${state.filter.party === p.data.name ? 'selected' : ''}>${esc(p.data.name)}</option>`).join('')}
        </select>
        <select id="fYear"><option value="">All years</option>${years.map(y => `<option value="${y}" ${state.filter.year === y ? 'selected' : ''}>${y}</option>`).join('')}</select>
        <div class="seg" style="margin-left:auto">
          <button data-seg="ledger" class="${seg === 'ledger' ? 'on' : ''}">Ledger</button>
          <button data-seg="invoice" class="${seg === 'invoice' ? 'on' : ''}">Commission only</button>
          <button data-seg="company" class="${seg === 'company' ? 'on' : ''}">By company</button>
        </div>
      </div>
      ${body}
    </div>`;

  $('#fQ').addEventListener('input', debounce((e) => { state.filter.q = e.target.value; render(); }, 220));
  $('#fParty').addEventListener('change', (e) => { state.filter.party = e.target.value; render(); });
  $('#fYear').addEventListener('change', (e) => { state.filter.year = e.target.value; render(); });
  $$('[data-seg]').forEach(b => b.addEventListener('click', () => { state.segment = b.dataset.seg; render(); }));
  $$('[data-new]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.new === 'invoice') commissionModal();
    else if (b.dataset.new === 'receipt') voucherModal('receipt');
  }));
  $$('[data-edit]').forEach(b => b.addEventListener('click', () => openEntry(b.dataset.edit)));
  $$('[data-del]').forEach(b => b.addEventListener('click', () => askDelete(b.dataset.del)));
  const ex = $('[data-act="export"]'); if (ex) ex.addEventListener('click', exportCSV);
  const pr = $('[data-act="print"]'); if (pr) pr.addEventListener('click', () => window.print());
}

function renderByCompany(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = r.party || '—';
    if (!map.has(key)) map.set(key, { name: key, commission: 0, received: 0, gst: 0, amount: 0, count: 0 });
    const e = map.get(key);
    e.commission += r.commission;
    e.received += r.received;
    e.gst += r.gstValue;
    e.amount += r.amount;
    if (r.kind === 'invoice') e.count++;
  }
  const list = [...map.values()].sort((a, b) => b.commission - a.commission);
  if (!list.length) return emptyState('Nothing to summarise', 'Add commission entries to see the company-wise split.');
  return `
    <div class="party-summary">
      ${list.map(e => `
        <div class="party-sum-card">
          <div class="top"><span class="pill seller">${e.count} inv</span><span class="name">${esc(e.name)}</span></div>
          <div class="amt">${money(e.commission, 0)}</div>
          <div class="meta">on GST ${money(e.gst, 0)} · received ${money(e.received, 0)}</div>
          <div class="meta">business value ${money(e.amount, 0)}</div>
        </div>`).join('')}
    </div>`;
}

function emptyState(title, text, action = '') {
  return `<div class="empty">
    <div class="big">${ICON.empty}</div>
    <h4>${esc(title)}</h4>
    <p>${esc(text)}</p>
    ${action}
  </div>`;
}

/* ---------------------------------------------------------------- views: masters */
const MASTERS = {
  party: {
    title: 'Customers & Companies', sub: 'Sellers, buyers and the commission % you take from each one.',
    addLabel: 'Add company',
    columns: [
      { k: 'name', t: 'Name', cell: (d) => `<div class="strong">${esc(d.name || '—')}</div>${d.gstNo ? `<div class="muted" style="font-size:11.5px">GST ${esc(d.gstNo)}</div>` : ''}` },
      { k: 'role', t: 'Role', cell: (d) => `<span class="pill ${d.role === 'seller' ? 'seller' : d.role === 'buyer' ? 'buyer' : 'both'}">${esc(d.role || 'seller')}</span>` },
      { k: 'commissionPct', t: 'Commission %', num: true, cell: (d) => num(d.commissionPct) ? money(d.commissionPct, 0) + '% of GST' : '—' },
      { k: 'phone', t: 'Contact', cell: (d) => `<span class="muted">${esc(d.phone || d.email || '—')}</span>` }
    ]
  },
  item: {
    title: 'Items', sub: 'Material you deal in, with HS code and default GST.',
    addLabel: 'Add item',
    columns: [
      { k: 'name', t: 'Item', cell: (d) => `<div class="strong">${esc(d.name || '—')}</div>${d.grade ? `<div class="muted" style="font-size:11.5px">${esc(d.grade)}</div>` : ''}` },
      { k: 'hsCode', t: 'HS Code', cell: (d) => `<span class="mono">${esc(d.hsCode || '—')}</span>` },
      { k: 'gstPct', t: 'GST %', num: true, cell: (d) => money(d.gstPct || 0, 0) + '%' },
      { k: 'unit', t: 'Unit', cell: (d) => `<span class="muted">${esc(d.unit || 'KG')}</span>` }
    ]
  },
  expense: {
    title: 'Expenses', sub: 'Expense heads used in payment vouchers (chalaan fees, wakeel, audit…).',
    addLabel: 'Add expense head',
    columns: [
      { k: 'name', t: 'Head', cell: (d) => `<div class="strong">${esc(d.name || '—')}</div><div class="muted" style="font-size:11.5px">${esc(d.notes || '')}</div>` },
      { k: 'defaultAmount', t: 'Default amount', num: true, cell: (d) => num(d.defaultAmount) ? money(d.defaultAmount, 0) : '—' }
    ]
  },
  tax: {
    title: 'Taxes', sub: 'GST and any other rate you apply on vouchers.',
    addLabel: 'Add tax',
    columns: [
      { k: 'name', t: 'Tax', cell: (d) => `<div class="strong">${esc(d.name || '—')}</div><div class="muted" style="font-size:11.5px">${esc(d.notes || '')}</div>` },
      { k: 'rate', t: 'Rate', num: true, cell: (d) => money(d.rate || 0, 0) + '%' }
    ]
  },
  bank: {
    title: 'Cash / Banks', sub: 'Where money comes in and goes out.',
    addLabel: 'Add account',
    columns: [
      { k: 'name', t: 'Account', cell: (d) => `<div class="strong">${esc(d.name || '—')}</div>` },
      { k: 'kind', t: 'Type', cell: (d) => `<span class="pill ${d.kind === 'cash' ? 'cash' : 'bank'}">${esc(d.kind || 'bank')}</span>` },
      { k: 'accountNo', t: 'Account no.', cell: (d) => `<span class="mono muted">${esc(d.accountNo || '—')}</span>` }
    ]
  },
  rate: {
    title: 'Commission Rates', sub: 'Fallback commission % used when a company has no own rate.',
    addLabel: 'Add rate',
    columns: [
      { k: 'name', t: 'Name', cell: (d) => `<div class="strong">${esc(d.name || '—')}</div>` },
      { k: 'pct', t: 'Rate', num: true, cell: (d) => money(d.pct || 0, 0) + '% of GST' },
      { k: 'notes', t: 'Notes', cell: (d) => `<span class="muted">${esc(d.notes || '—')}</span>` }
    ]
  }
};

function renderMaster(type) {
  const cfg = MASTERS[type];
  if (!cfg) return renderRegister();
  const list = records('master', type).sort((a, b) => String(a.data.name || '').localeCompare(String(b.data.name || '')));
  const q = state.filter.q.toLowerCase();
  const shown = q ? list.filter(r => JSON.stringify(r.data).toLowerCase().includes(q)) : list;

  const body = shown.length ? `
    <div class="table-wrap">
      <table class="rtable">
        <thead><tr>${cfg.columns.map(c => `<th class="${c.num ? 'num' : ''}">${esc(c.t)}</th>`).join('')}<th></th></tr></thead>
        <tbody>
        ${shown.map(r => `<tr>
          ${cfg.columns.map(c => `<td class="${c.num ? 'num' : ''} wrap" data-label="${esc(c.t)}">${c.cell(r.data)}</td>`).join('')}
          <td class="cell-actions"><div class="row-actions">
            <button class="icon-btn" data-edit="${esc(r.id)}" title="Edit">${ICON.edit}</button>
            <button class="icon-btn del" data-del="${esc(r.id)}" title="Delete">${ICON.del}</button>
          </div></td>
        </tr>`).join('')}
        </tbody>
      </table>
    </div>` : emptyState('Nothing here yet', 'Add your first entry so it can be picked in the vouchers.', '');

  $('#main').innerHTML = `
    <div class="view-head">
      <div><h2>${esc(cfg.title)}</h2><p>${esc(cfg.sub)}</p></div>
      <div class="actions">
        <button class="btn primary" data-add="1">${ICON.plus} ${esc(cfg.addLabel)}</button>
      </div>
    </div>
    <div class="card">
      <div class="toolbar">
        <div class="search">${ICON.search}<input id="fQ" placeholder="Search…" value="${esc(state.filter.q)}"></div>
        <span class="muted" style="font-size:12.5px;margin-left:auto">${shown.length} of ${list.length}</span>
      </div>
      ${body}
    </div>`;

  $('#fQ').addEventListener('input', debounce(e => { state.filter.q = e.target.value; render(); }, 200));
  $('[data-add]').addEventListener('click', () => masterModal(type));
  $$('[data-edit]').forEach(b => b.addEventListener('click', () => masterModal(type, byId(b.dataset.edit))));
  $$('[data-del]').forEach(b => b.addEventListener('click', () => askDelete(b.dataset.del)));
}

const byId = (id) => state.records.get(id);

function masterModal(type, rec) {
  const cfg = MASTERS[type];
  const d = rec ? rec.data : {};
  const field = (id, label, html, hint = '') => `<div class="field"><label for="${id}">${label}</label>${html}${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
  let fields = '';

  if (type === 'party') {
    fields = `
      ${field('mName', 'Company / person name <span class="req">*</span>', `<input id="mName" value="${esc(d.name || '')}" placeholder="e.g. Chagani" autofocus>`)}
      <div class="grid-2">
        ${field('mRole', 'Role', `<select id="mRole">
          <option value="seller" ${d.role === 'seller' ? 'selected' : ''}>Seller — supplies material</option>
          <option value="buyer" ${d.role === 'buyer' ? 'selected' : ''}>Buyer — takes material</option>
          <option value="both" ${d.role === 'both' ? 'selected' : ''}>Both</option>
        </select>`)}
        ${field('mComm', 'Commission % of GST', `<input id="mComm" type="number" step="0.01" min="0" max="100" value="${num(d.commissionPct, 20)}">`, 'e.g. 20 or 50 — applied automatically on new entries.')}
      </div>
      <div class="grid-2">
        ${field('mGst', 'GST / STRN no.', `<input id="mGst" value="${esc(d.gstNo || '')}" placeholder="8232636-3">`)}
        ${field('mPhone', 'Phone', `<input id="mPhone" value="${esc(d.phone || '')}" placeholder="03xx…">`)}
      </div>
      ${field('mNotes', 'Notes', `<input id="mNotes" value="${esc(d.notes || '')}">`)}`;
  } else if (type === 'item') {
    fields = `
      ${field('mName', 'Item name <span class="req">*</span>', `<input id="mName" value="${esc(d.name || '')}" placeholder="ABS DANA" autofocus>`)}
      <div class="grid-3">
        ${field('mHs', 'HS code', `<input id="mHs" value="${esc(d.hsCode || '')}" placeholder="3901">`)}
        ${field('mGst', 'GST %', `<input id="mGst" type="number" step="0.01" value="${num(d.gstPct, 18)}">`)}
        ${field('mUnit', 'Unit', `<select id="mUnit">
          ${['KG', 'MT', 'PCS', 'BAGS', 'LTR'].map(u => `<option ${String(d.unit || 'KG') === u ? 'selected' : ''}>${u}</option>`).join('')}
        </select>`)}
      </div>
      ${field('mGrade', 'Grade / note', `<input id="mGrade" value="${esc(d.grade || '')}" placeholder="Pol / Repro">`)}`;
  } else if (type === 'expense') {
    fields = `
      ${field('mName', 'Expense head <span class="req">*</span>', `<input id="mName" value="${esc(d.name || '')}" placeholder="Chalaan Fees" autofocus>`)}
      ${field('mDef', 'Default amount', `<input id="mDef" type="number" step="0.01" value="${num(d.defaultAmount, 0)}">`)}
      ${field('mNotes', 'Notes', `<input id="mNotes" value="${esc(d.notes || '')}" placeholder="5% of GST for Qaryan / ALBA">`)}`;
  } else if (type === 'tax') {
    fields = `
      ${field('mName', 'Tax name <span class="req">*</span>', `<input id="mName" value="${esc(d.name || '')}" placeholder="GST 18%" autofocus>`)}
      <div class="grid-2">
        ${field('mRate', 'Rate %', `<input id="mRate" type="number" step="0.01" value="${num(d.rate, 18)}">`)}
        ${field('mKind', 'Applies on', `<select id="mKind">
          <option value="gst" ${d.kind === 'gst' ? 'selected' : ''}>Sales tax / GST</option>
          <option value="wht" ${d.kind === 'wht' ? 'selected' : ''}>Withholding</option>
          <option value="other" ${d.kind === 'other' ? 'selected' : ''}>Other</option>
        </select>`)}
      </div>
      ${field('mNotes', 'Notes', `<input id="mNotes" value="${esc(d.notes || '')}">`)}`;
  } else if (type === 'bank') {
    fields = `
      ${field('mName', 'Account name <span class="req">*</span>', `<input id="mName" value="${esc(d.name || '')}" placeholder="Meezan Bank — 0123" autofocus>`)}
      <div class="grid-2">
        ${field('mKind', 'Type', `<select id="mKind">
          <option value="bank" ${d.kind === 'bank' ? 'selected' : ''}>Bank</option>
          <option value="cash" ${d.kind === 'cash' ? 'selected' : ''}>Cash</option>
        </select>`)}
        ${field('mAcc', 'Account no.', `<input id="mAcc" value="${esc(d.accountNo || '')}">`)}
      </div>
      ${field('mOpen', 'Opening balance', `<input id="mOpen" type="number" step="0.01" value="${num(d.opening, 0)}">`)}`;
  } else if (type === 'rate') {
    fields = `
      ${field('mName', 'Name <span class="req">*</span>', `<input id="mName" value="${esc(d.name || '')}" placeholder="Default brokerage" autofocus>`)}
      ${field('mPct', 'Percent of GST', `<input id="mPct" type="number" step="0.01" value="${num(d.pct, 20)}">`)}
      ${field('mNotes', 'Notes', `<input id="mNotes" value="${esc(d.notes || '')}">`)}`;
  }

  const modal = openModal(`
    <div class="modal-head">
      <div><h3>${rec ? 'Edit' : 'Add'} — ${esc(cfg.title)}</h3><div class="sub">Saved on this device first, then synced.</div></div>
      <button class="icon-btn x" data-close>✕</button>
    </div>
    <div class="modal-body">${fields}</div>
    <div class="modal-foot">
      ${rec ? '<button class="btn danger left" id="mDelete">Delete</button>' : ''}
      <button class="btn" data-close>Cancel</button>
      <button class="btn primary" id="mSave">Save</button>
    </div>`);

  $$('[data-close]', modal).forEach(b => b.addEventListener('click', closeModal));
  if (rec) $('#mDelete', modal).addEventListener('click', () => { closeModal(); askDelete(rec.id); });

  $('#mSave', modal).addEventListener('click', async () => {
    const val = (id) => { const el = $('#' + id, modal); return el ? el.value.trim() : ''; };
    const data = { ...d };
    if (type === 'party') {
      if (!val('mName')) return toast('Name is required', 'err');
      Object.assign(data, { name: val('mName'), role: val('mRole'), commissionPct: num(val('mComm')), gstNo: val('mGst'), phone: val('mPhone'), notes: val('mNotes'), active: true });
    } else if (type === 'item') {
      if (!val('mName')) return toast('Item name is required', 'err');
      Object.assign(data, { name: val('mName').toUpperCase(), hsCode: val('mHs'), gstPct: num(val('mGst'), 18), unit: val('mUnit'), grade: val('mGrade') });
    } else if (type === 'expense') {
      if (!val('mName')) return toast('Expense head is required', 'err');
      Object.assign(data, { name: val('mName'), defaultAmount: num(val('mDef')), notes: val('mNotes'), active: true });
    } else if (type === 'tax') {
      if (!val('mName')) return toast('Tax name is required', 'err');
      Object.assign(data, { name: val('mName'), rate: num(val('mRate')), kind: val('mKind'), notes: val('mNotes') });
    } else if (type === 'bank') {
      if (!val('mName')) return toast('Account name is required', 'err');
      Object.assign(data, { name: val('mName'), kind: val('mKind'), accountNo: val('mAcc'), opening: num(val('mOpen')) });
    } else if (type === 'rate') {
      if (!val('mName')) return toast('Name is required', 'err');
      Object.assign(data, { name: val('mName'), pct: num(val('mPct')), notes: val('mNotes') });
    }
    await saveRecord('master', type, data, rec);
    closeModal();
    toast(rec ? 'Updated' : 'Added');
    render();
  });
}

/* ---------------------------------------------------------------- commission entry modal */
function commissionModal(rec) {
  const d = rec ? rec.data : {
    date: today(), seller: '', buyer: 'S.E. ENGINEERING (PRIVATE) LIMITED', invNo: '',
    item: '', hsCode: '', grade: '', qty: 0, rate: 0, amount: 0,
    gstPct: 18, gstValue: 0, commPct: 20, commValue: 0, notes: ''
  };
  const sellerOpts = parties().filter(p => p.data.role !== 'buyer').map(p => p.data.name);
  const buyerOpts = parties().filter(p => p.data.role !== 'seller').map(p => p.data.name);

  const modal = openModal(`
    <div class="modal-head">
      <div><h3>${rec ? 'Edit commission entry' : 'New commission entry'}</h3>
        <div class="sub">Amount → GST → your commission. Everything calculates as you type.</div></div>
      <button class="icon-btn x" data-close>✕</button>
    </div>
    <div class="modal-body">
      <div class="grid-3">
        <div class="field"><label for="cDate">Invoice date</label><input id="cDate" type="date" value="${esc(d.date || today())}"></div>
        <div class="field"><label for="cInv">Invoice no.</label><input id="cInv" value="${esc(d.invNo || '')}" placeholder="829 / AQ-0461"></div>
        <div class="field"><label for="cHs">HS code</label><input id="cHs" value="${esc(d.hsCode || '')}" placeholder="3901"></div>
      </div>
      <div class="grid-2">
        <div class="field"><label for="cSeller">Seller (who supplies) <span class="req">*</span></label>
          <input id="cSeller" list="dlSeller" value="${esc(d.seller || '')}" placeholder="Chagani" autocomplete="off">
          <datalist id="dlSeller">${sellerOpts.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
        </div>
        <div class="field"><label for="cBuyer">Buyer (who receives)</label>
          <input id="cBuyer" list="dlBuyer" value="${esc(d.buyer || '')}" placeholder="S.E. ENGINEERING (PRIVATE) LIMITED" autocomplete="off">
          <datalist id="dlBuyer">${buyerOpts.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
        </div>
      </div>
      <div class="field"><label for="cItem">Item description</label>
        <input id="cItem" list="dlItem" value="${esc(d.item || '')}" placeholder="ABS DANA" autocomplete="off">
        <datalist id="dlItem">${items().map(i => `<option value="${esc(i.data.name)}">`).join('')}</datalist>
      </div>
      <div class="grid-4">
        <div class="field"><label for="cQty">Quantity</label><input id="cQty" type="number" step="0.01" value="${num(d.qty)}"></div>
        <div class="field"><label for="cRate">Rate</label><input id="cRate" type="number" step="0.01" value="${num(d.rate)}"></div>
        <div class="field"><label for="cAmount">Amount</label><input id="cAmount" type="number" step="0.01" value="${num(d.amount)}"></div>
        <div class="field"><label for="cGstPct">GST %</label><input id="cGstPct" type="number" step="0.01" value="${num(d.gstPct, 18)}"></div>
      </div>
      <div class="grid-3">
        <div class="field"><label for="cGstVal">GST value</label><input id="cGstVal" type="number" step="0.01" value="${num(d.gstValue)}" readonly></div>
        <div class="field"><label for="cCommPct">Commission %</label><input id="cCommPct" type="number" step="0.01" value="${num(d.commPct, 20)}"></div>
        <div class="field"><label for="cCommVal">Commission value</label><input id="cCommVal" type="number" step="0.01" value="${num(d.commValue)}" readonly></div>
      </div>
      <div class="field"><label for="cNotes">Notes</label><input id="cNotes" value="${esc(d.notes || '')}" placeholder="Optional"></div>
      <div class="banner info" style="margin:0">
        <span id="cFormula">—</span>
      </div>
    </div>
    <div class="modal-foot">
      ${rec ? '<button class="btn danger left" id="cDelete">Delete</button>' : ''}
      <button class="btn" data-close>Cancel</button>
      <button class="btn primary" id="cSave">Save entry</button>
    </div>`, { wide: false });

  const get = (id) => $('#' + id, modal);
  const recalc = (source) => {
    const qty = num(get('cQty').value), rate = num(get('cRate').value);
    if (source === 'qty' || source === 'rate') {
      const amt = r2(qty * rate);
      if (amt) get('cAmount').value = amt;
    }
    const amount = num(get('cAmount').value);
    const gstPct = num(get('cGstPct').value);
    const gstValue = r2(amount * gstPct / 100);
    get('cGstVal').value = gstValue || 0;
    const commPct = num(get('cCommPct').value);
    const commValue = r2(gstValue * commPct / 100);
    get('cCommVal').value = commValue || 0;
    $('#cFormula', modal).textContent =
      `${money(amount, 0)} × ${gstPct}% = GST ${money(gstValue, 0)}  →  ${commPct}% of GST = commission ${money(commValue, 0)}`;
  };

  ['cQty', 'cRate', 'cAmount', 'cGstPct', 'cCommPct'].forEach(id => get(id).addEventListener('input', (e) => recalc(id.replace('c', '').toLowerCase())));
  get('cSeller').addEventListener('change', () => {
    const name = get('cSeller').value.trim();
    if (name && !rec) get('cCommPct').value = commissionPctFor(name);
    recalc();
  });
  get('cItem').addEventListener('change', () => {
    const it = itemByName(get('cItem').value);
    if (it) {
      if (!get('cHs').value) get('cHs').value = it.data.hsCode || '';
      get('cGstPct').value = num(it.data.gstPct, 18);
      recalc();
    }
  });
  recalc();
  $$('[data-close]', modal).forEach(b => b.addEventListener('click', closeModal));
  if (rec) $('#cDelete', modal).addEventListener('click', () => { closeModal(); askDelete(rec.id); });

  $('#cSave', modal).addEventListener('click', async () => {
    const seller = get('cSeller').value.trim();
    if (!seller) { toast('Seller is required', 'err'); return get('cSeller').focus(); }
    const data = {
      date: get('cDate').value || today(),
      seller,
      buyer: get('cBuyer').value.trim(),
      invNo: get('cInv').value.trim(),
      item: get('cItem').value.trim().toUpperCase(),
      hsCode: get('cHs').value.trim(),
      grade: d.grade || '',
      qty: num(get('cQty').value),
      rate: num(get('cRate').value),
      amount: num(get('cAmount').value),
      gstPct: num(get('cGstPct').value),
      gstValue: num(get('cGstVal').value),
      commPct: num(get('cCommPct').value),
      commValue: num(get('cCommVal').value),
      notes: get('cNotes').value.trim()
    };
    await saveRecord('invoice', 'commission', data, rec);
    closeModal();
    toast(rec ? 'Entry updated' : 'Commission entry saved');
    render();
  });
}

/* ---------------------------------------------------------------- vouchers */
const VOUCHER_META = {
  payment: { title: 'Payment Vouchers', sub: 'Money you pay out — expenses, deductions, industry payments.', code: 'PV', tone: 'payment' },
  receipt: { title: 'Receipt Vouchers', sub: 'Commission and payments received from companies.', code: 'RV', tone: 'receipt' },
  journal: { title: 'Journal Vouchers', sub: 'Adjustments between two accounts.', code: 'JV', tone: 'journal' },
  purchase: { title: 'Purchase Vouchers', sub: 'Material bought from a seller — with GST on every line.', code: 'PU', tone: 'purchase' },
  sales: { title: 'Sales Vouchers', sub: 'Material sold to a buyer — with GST on every line.', code: 'SL', tone: 'sales' }
};

function nextVoucherNo(type) {
  const meta = VOUCHER_META[type];
  const list = vouchers(type);
  let max = 0;
  for (const v of list) {
    const m = String(v.data.no || '').match(/(\d+)\s*$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return meta.code + '-' + String(max + 1).padStart(4, '0');
}

function renderVouchers(type) {
  const meta = VOUCHER_META[type];
  if (!meta) return renderRegister();
  const q = state.filter.q.toLowerCase();
  let list = vouchers(type).sort((a, b) => (b.data.date || '').localeCompare(a.data.date || '') || (b.updatedAt - a.updatedAt));
  if (q) list = list.filter(v => JSON.stringify(v.data).toLowerCase().includes(q));
  const amountOf = (v) => (typeof v.data.grandTotal === 'number' ? v.data.grandTotal : num(v.data.amount));
  const total = list.reduce((a, v) => a + amountOf(v), 0);

  const tableFor = () => {
    if (type === 'journal') {
      return `<table class="rtable">
        <thead><tr><th>Date</th><th>Voucher</th><th>Debit account</th><th>Credit account</th><th class="num">Amount</th><th>Narration</th><th></th></tr></thead>
        <tbody>${list.map(v => `<tr>
          <td class="mono" data-label="Date">${esc(fmtDate(v.data.date))}</td>
          <td class="mono strong" data-label="Voucher">${esc(v.data.no || '—')}</td>
          <td data-label="Debit">${esc(v.data.debitAccount || '—')}</td>
          <td data-label="Credit">${esc(v.data.creditAccount || '—')}</td>
          <td class="num strong" data-label="Amount">${money(v.data.amount)}</td>
          <td class="wrap muted" data-label="Narration">${esc(v.data.narration || '')}</td>
          <td class="cell-actions"><div class="row-actions"><button class="icon-btn" data-edit="${esc(v.id)}">${ICON.edit}</button><button class="icon-btn del" data-del="${esc(v.id)}">${ICON.del}</button></div></td>
        </tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="4" data-label="Total">Total (${list.length})</td><td class="num" data-label="Amount">${money(total)}</td><td colspan="2"></td></tr></tfoot>
      </table>`;
    }
    if (type === 'purchase' || type === 'sales') {
      return `<table class="rtable">
        <thead><tr><th>Date</th><th>Voucher</th><th>${type === 'purchase' ? 'Seller' : 'Buyer'}</th><th>Items</th>
          <th class="num">Sub total</th><th class="num">GST</th><th class="num">Total</th><th></th></tr></thead>
        <tbody>${list.map(v => `<tr>
          <td class="mono" data-label="Date">${esc(fmtDate(v.data.date))}</td>
          <td class="mono strong" data-label="Voucher">${esc(v.data.no || '—')}</td>
          <td class="wrap" data-label="${type === 'purchase' ? 'Seller' : 'Buyer'}"><div class="strong">${esc(v.data.party || '—')}</div>${v.data.narration ? `<div class="muted sub">${esc(v.data.narration)}</div>` : ''}</td>
          <td class="wrap" data-label="Items">${(v.data.lines || []).map(l => `${esc(l.item || '—')} <span class="muted">× ${money(l.qty, 0)}</span>`).join('<br>') || '—'}</td>
          <td class="num" data-label="Sub total">${money(v.data.subTotal)}</td>
          <td class="num" data-label="GST">${money(v.data.taxTotal)}</td>
          <td class="num strong" data-label="Total">${money(v.data.grandTotal)}</td>
          <td class="cell-actions"><div class="row-actions"><button class="icon-btn" data-edit="${esc(v.id)}">${ICON.edit}</button><button class="icon-btn del" data-del="${esc(v.id)}">${ICON.del}</button></div></td>
        </tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="4" data-label="Total">Total (${list.length})</td>
          <td class="num" data-label="Sub total">${money(list.reduce((a, v) => a + num(v.data.subTotal), 0))}</td>
          <td class="num" data-label="GST">${money(list.reduce((a, v) => a + num(v.data.taxTotal), 0))}</td>
          <td class="num" data-label="Total">${money(list.reduce((a, v) => a + num(v.data.grandTotal), 0))}</td><td></td></tr></tfoot>
      </table>`;
    }
    return `<table class="rtable">
      <thead><tr><th>Date</th><th>Voucher</th><th>Party</th><th>${type === 'receipt' ? 'Received in' : 'Paid from'}</th><th class="num">Amount</th><th>Narration</th><th></th></tr></thead>
      <tbody>${list.map(v => `<tr>
        <td class="mono" data-label="Date">${esc(fmtDate(v.data.date))}</td>
        <td class="mono strong" data-label="Voucher">${esc(v.data.no || '—')}</td>
        <td class="wrap strong" data-label="Party">${esc(v.data.party || '—')}</td>
        <td class="wrap" data-label="${type === 'receipt' ? 'Received in' : 'Paid from'}">${esc(v.data.account || '—')}</td>
        <td class="num strong" style="color:${type === 'receipt' ? 'var(--brand)' : 'var(--amber)'}" data-label="Amount">${money(v.data.amount)}</td>
        <td class="wrap muted" data-label="Narration">${esc(v.data.narration || '')}</td>
        <td class="cell-actions"><div class="row-actions"><button class="icon-btn" data-edit="${esc(v.id)}">${ICON.edit}</button><button class="icon-btn del" data-del="${esc(v.id)}">${ICON.del}</button></div></td>
      </tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="4" data-label="Total">Total (${list.length})</td><td class="num" data-label="Amount">${money(total)}</td><td colspan="2"></td></tr></tfoot>
    </table>`;
  };

  $('#main').innerHTML = `
    <div class="view-head">
      <div><h2>${esc(meta.title)}</h2><p>${esc(meta.sub)}</p></div>
      <div class="actions">
        <button class="btn" data-act="print">${ICON.print} Print</button>
        <button class="btn primary" data-new="1">${ICON.plus} New ${esc(type)} voucher</button>
      </div>
    </div>
    <div class="kpis">
      <div class="kpi ${type === 'receipt' ? 'green' : type === 'payment' ? 'amber' : 'violet'}">
        <div class="label">Total ${esc(type)}</div><div class="value">${money0(total)}</div><div class="sub">${list.length} vouchers</div>
      </div>
      <div class="kpi"><div class="label">This month</div>
        <div class="value">${money0(list.filter(v => monthKey(v.data.date) === monthKey(today())).reduce((a, v) => a + (v.data.grandTotal || v.data.amount || 0), 0))}</div>
        <div class="sub">${MONTHS[new Date().getMonth()]} ${new Date().getFullYear()}</div></div>
      <div class="kpi"><div class="label">Latest voucher</div>
        <div class="value" style="font-size:17px">${esc(list[0] ? fmtDate(list[0].data.date) : '—')}</div>
        <div class="sub">${esc(list[0] ? (list[0].data.no || list[0].data.party || 'recorded') : 'none yet')}</div></div>
    </div>
    <div class="card">
      <div class="toolbar">
        <div class="search">${ICON.search}<input id="fQ" placeholder="Search party, voucher no, narration…" value="${esc(state.filter.q)}"></div>
        <span class="muted" style="font-size:12.5px;margin-left:auto">${list.length} voucher${list.length === 1 ? '' : 's'}</span>
      </div>
      <div class="table-wrap" style="max-height:max(420px, calc(100vh - 400px))">${list.length ? tableFor() : emptyState('No ' + type + ' vouchers yet', meta.sub, '<button class="btn primary" data-new="1">Create the first one</button>')}</div>
    </div>`;

  $('#fQ').addEventListener('input', debounce(e => { state.filter.q = e.target.value; render(); }, 200));
  $$('[data-new]').forEach(b => b.addEventListener('click', () => voucherModal(type)));
  $$('[data-edit]').forEach(b => b.addEventListener('click', () => voucherModal(type, byId(b.dataset.edit))));
  $$('[data-del]').forEach(b => b.addEventListener('click', () => askDelete(b.dataset.del)));
  const pr = $('[data-act="print"]'); if (pr) pr.addEventListener('click', () => window.print());
}

function voucherModal(type, rec) {
  const meta = VOUCHER_META[type];
  const d = rec ? rec.data : {
    date: today(), no: nextVoucherNo(type), party: '', account: banks()[0]?.data.name || 'Bank Account',
    amount: 0, narration: '', debitAccount: '', creditAccount: '',
    lines: [{ item: '', hsCode: '', qty: 0, rate: 0, amount: 0, taxPct: 18, taxAmt: 0, total: 0 }],
    subTotal: 0, taxTotal: 0, grandTotal: 0,
    comm: { enabled: false, pct: 20, value: 0 }
  };
  const accountOpts = banks().map(b => b.data.name);
  const partyOpts = parties().map(p => p.data.name);

  const head = `
    <div class="grid-3">
      <div class="field"><label for="vDate">Date</label><input id="vDate" type="date" value="${esc(d.date || today())}"></div>
      <div class="field"><label for="vNo">Voucher no.</label><input id="vNo" value="${esc(d.no || '')}"></div>
      <div class="field"><label for="vPartyLabel">${type === 'purchase' ? 'Seller' : type === 'sales' ? 'Buyer' : 'Party'}${type === 'journal' ? ' (optional)' : ' <span class="req">*</span>'}</label>
        <input id="vParty" list="dlVP" value="${esc(d.party || '')}" autocomplete="off" placeholder="Company name">
        <datalist id="dlVP">${partyOpts.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
      </div>
    </div>`;

  let body = '';
  if (type === 'payment' || type === 'receipt') {
    body = `
      <div class="grid-2">
        <div class="field"><label for="vAccount">${type === 'receipt' ? 'Received in' : 'Paid from'}</label>
          <select id="vAccount">${accountOpts.map(a => `<option ${d.account === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>
        </div>
        <div class="field"><label for="vAmount">Amount <span class="req">*</span></label><input id="vAmount" type="number" step="0.01" value="${num(d.amount) || ''}" placeholder="0"></div>
      </div>
      ${type === 'payment' ? `<div class="field"><label for="vHead">Expense head</label>
        <select id="vHead"><option value="">— none —</option>${expenseHeads().map(e => `<option ${d.head === e.data.name ? 'selected' : ''}>${esc(e.data.name)}</option>`).join('')}</select>
      </div>` : ''}
      <div class="field"><label for="vNarr">Narration</label><input id="vNarr" value="${esc(d.narration || '')}" placeholder="${type === 'receipt' ? 'Commission received against invoice…' : 'Chalaan fees, wakeel charges…'}"></div>`;
  } else if (type === 'journal') {
    body = `
      <div class="grid-2">
        <div class="field"><label for="vDebit">Debit account <span class="req">*</span></label>
          <input id="vDebit" list="dlAcc" value="${esc(d.debitAccount || '')}" placeholder="Expense / party">
          <datalist id="dlAcc">${accountOpts.map(a => `<option value="${esc(a)}">`).join('')}${partyOpts.map(a => `<option value="${esc(a)}">`).join('')}</datalist>
        </div>
        <div class="field"><label for="vCredit">Credit account <span class="req">*</span></label>
          <input id="vCredit" list="dlAcc2" value="${esc(d.creditAccount || '')}" placeholder="Bank / party">
          <datalist id="dlAcc2">${accountOpts.map(a => `<option value="${esc(a)}">`).join('')}${partyOpts.map(a => `<option value="${esc(a)}">`).join('')}</datalist>
        </div>
      </div>
      <div class="field"><label for="vAmount">Amount <span class="req">*</span></label><input id="vAmount" type="number" step="0.01" value="${num(d.amount) || ''}" placeholder="0"></div>
      <div class="field"><label for="vNarr">Narration</label><input id="vNarr" value="${esc(d.narration || '')}"></div>`;
  } else {
    // purchase / sales with tax per line
    const lineRow = (l, i) => `
      <tr data-line="${i}">
        <td><input data-f="item" list="dlItems" value="${esc(l.item || '')}" placeholder="ABS DANA"></td>
        <td><input data-f="hsCode" value="${esc(l.hsCode || '')}" placeholder="3901" style="max-width:90px"></td>
        <td class="num"><input data-f="qty" type="number" step="0.01" value="${num(l.qty) || ''}" placeholder="0"></td>
        <td class="num"><input data-f="rate" type="number" step="0.01" value="${num(l.rate) || ''}" placeholder="0"></td>
        <td class="calc" data-c="amount">0.00</td>
        <td class="num"><input data-f="taxPct" type="number" step="0.01" value="${num(l.taxPct, 18)}"></td>
        <td class="calc" data-c="taxAmt">0.00</td>
        <td class="calc" data-c="total">0.00</td>
        <td><button type="button" class="icon-btn rm" data-rm="${i}" title="Remove line">✕</button></td>
      </tr>`;

    body = `
      <datalist id="dlItems">${items().map(i => `<option value="${esc(i.data.name)}">`).join('')}</datalist>
      <div class="voucher-lines">
        <table class="lines-table">
          <colgroup>
            <col class="c-item"><col class="c-hs"><col class="c-qty"><col class="c-rate">
            <col class="c-amount"><col class="c-taxpct"><col class="c-taxamt"><col class="c-total"><col class="c-act">
          </colgroup>
          <thead><tr>
            <th>Item</th><th>HS</th><th class="num">Qty</th><th class="num">Rate</th>
            <th class="num">Amount</th><th class="num">GST %</th><th class="num">GST Amt</th><th class="num">Total</th><th></th>
          </tr></thead>
          <tbody id="vLines">${(d.lines || []).map(lineRow).join('')}</tbody>
        </table>
        <button class="btn sm" id="vAddLine" type="button" style="margin-top:9px">＋ Add line</button>
      </div>
      <div class="totals">
        <div class="row"><span>Sub total</span><span id="vSub">0.00</span></div>
        <div class="row"><span>GST / tax</span><span id="vTax">0.00</span></div>
        <div class="row grand"><span>Grand total</span><span id="vGrand">0.00</span></div>
      </div>
      <div class="comm-box">
        <div class="head">
          <b>Brokerage commission</b>
          <label class="comm-check" style="margin-left:auto">
            <input type="checkbox" id="vCommOn" ${d.comm && d.comm.enabled ? 'checked' : ''}> Record commission from this deal
          </label>
        </div>
        <div class="comm-fields">
          <div class="field" style="margin:0"><label for="vCommPct">Commission % of GST</label>
            <input id="vCommPct" type="number" step="0.01" value="${num(d.comm && d.comm.pct, 20)}" ${d.comm && d.comm.enabled ? '' : 'disabled'}></div>
          <div class="field" style="margin:0"><label>Commission on GST</label>
            <div class="comm-result" id="vCommVal">${money(num(d.comm && d.comm.value, 0))}</div></div>
          <div class="field" style="margin:0"><label>Adds to register</label>
            <div class="muted" style="font-size:12.5px;padding-top:8px">A commission entry is created and linked to this voucher.</div></div>
        </div>
      </div>
      <div class="field" style="margin-top:16px"><label for="vNarr">Narration</label><input id="vNarr" value="${esc(d.narration || '')}" placeholder="Optional note"></div>`;
  }

  const modal = openModal(`
    <div class="modal-head">
      <div><h3>${rec ? 'Edit' : 'New'} ${esc(type)} voucher</h3><div class="sub">${esc(meta.sub)}</div></div>
      <button class="icon-btn x" data-close>✕</button>
    </div>
    <div class="modal-body">${head}${body}</div>
    <div class="modal-foot">
      ${rec ? '<button class="btn danger left" id="vDelete">Delete</button>' : ''}
      <button class="btn" data-close>Cancel</button>
      <button class="btn primary" id="vSave">Save voucher</button>
    </div>`, { wide: type === 'purchase' || type === 'sales' });

  const get = (id) => $('#' + id, modal);
  $$('[data-close]', modal).forEach(b => b.addEventListener('click', closeModal));
  if (rec) $('#vDelete', modal).addEventListener('click', () => { closeModal(); askDelete(rec.id); });

  let lines = (d.lines || []).map(l => ({ ...l }));
  const calcLines = () => {
    if (!get('vLines')) return;
    let sub = 0, tax = 0;
    lines.forEach((l, i) => {
      const row = $(`tr[data-line="${i}"]`, modal);
      if (!row) return;
      const amount = r2(num(l.qty) * num(l.rate));
      const taxAmt = r2(amount * num(l.taxPct) / 100);
      l.amount = amount; l.taxAmt = taxAmt; l.total = r2(amount + taxAmt);
      $('[data-c="amount"]', row).textContent = money(amount);
      $('[data-c="taxAmt"]', row).textContent = money(taxAmt);
      $('[data-c="total"]', row).textContent = money(l.total);
      sub += amount; tax += taxAmt;
    });
    sub = r2(sub); tax = r2(tax);
    $('#vSub', modal).textContent = money(sub);
    $('#vTax', modal).textContent = money(tax);
    $('#vGrand', modal).textContent = money(r2(sub + tax));
    const on = get('vCommOn') && get('vCommOn').checked;
    const val = on ? r2(tax * num(get('vCommPct').value) / 100) : 0;
    if (get('vCommVal')) $('#vCommVal', modal).textContent = money(val);
    modal.dataset.sub = sub; modal.dataset.tax = tax; modal.dataset.grand = r2(sub + tax); modal.dataset.commVal = val;
  };

  const bindLines = () => {
    $$('#vLines tr', modal).forEach(row => {
      const i = Number(row.dataset.line);
      $$('input', row).forEach(inp => {
        inp.addEventListener('input', () => {
          const f = inp.dataset.f;
          lines[i][f] = f === 'item' || f === 'hsCode' ? inp.value : num(inp.value);
          if (f === 'item') {
            const it = itemByName(inp.value);
            if (it) {
              lines[i].hsCode = it.data.hsCode || lines[i].hsCode;
              const hs = $('[data-f="hsCode"]', row); if (hs) hs.value = lines[i].hsCode;
              if (!num(lines[i].taxPct)) lines[i].taxPct = num(it.data.gstPct, 18);
              const tp = $('[data-f="taxPct"]', row); if (tp) tp.value = lines[i].taxPct;
            }
          }
          calcLines();
        });
      });
      const rm = $('[data-rm]', row);
      if (rm) rm.addEventListener('click', () => {
        if (lines.length === 1) { toast('At least one line is needed', 'err'); return; }
        lines.splice(i, 1);
        redrawLines();
      });
    });
  };

  const redrawLines = () => {
    const host = $('#vLines', modal);
    if (!host) return;
    host.innerHTML = lines.map((l, i) => `
      <tr data-line="${i}">
        <td><input data-f="item" list="dlItems" value="${esc(l.item || '')}" placeholder="ABS DANA"></td>
        <td><input data-f="hsCode" value="${esc(l.hsCode || '')}" placeholder="3901" style="max-width:90px"></td>
        <td class="num"><input data-f="qty" type="number" step="0.01" value="${num(l.qty) || ''}" placeholder="0"></td>
        <td class="num"><input data-f="rate" type="number" step="0.01" value="${num(l.rate) || ''}" placeholder="0"></td>
        <td class="calc" data-c="amount">0.00</td>
        <td class="num"><input data-f="taxPct" type="number" step="0.01" value="${num(l.taxPct, 18)}"></td>
        <td class="calc" data-c="taxAmt">0.00</td>
        <td class="calc" data-c="total">0.00</td>
        <td><button type="button" class="icon-btn rm" data-rm="${i}" title="Remove line">✕</button></td>
      </tr>`).join('');
    bindLines();
    calcLines();
  };

  if (type === 'purchase' || type === 'sales') {
    bindLines();
    calcLines();
    get('vAddLine').addEventListener('click', () => {
      lines.push({ item: '', hsCode: '', qty: 0, rate: 0, amount: 0, taxPct: 18, taxAmt: 0, total: 0 });
      redrawLines();
    });
    get('vCommOn').addEventListener('change', (e) => {
      get('vCommPct').disabled = !e.target.checked;
      calcLines();
    });
    get('vCommPct').addEventListener('input', calcLines);
    get('vParty').addEventListener('change', () => {
      const name = get('vParty').value.trim();
      if (name && !rec) get('vCommPct').value = commissionPctFor(name);
      calcLines();
    });
  }

  $('#vSave', modal).addEventListener('click', async () => {
    const date = get('vDate').value || today();
    const no = get('vNo').value.trim() || nextVoucherNo(type);
    const party = get('vParty').value.trim();
    const narration = get('vNarr').value.trim();

    let data;
    if (type === 'payment' || type === 'receipt') {
      const amount = num(get('vAmount').value);
      if (!amount) { toast('Amount is required', 'err'); return; }
      if (!party) { toast('Party is required', 'err'); return; }
      data = { date, no, party, account: get('vAccount').value, amount, narration, head: get('vHead') ? get('vHead').value : '', partyType: type === 'receipt' ? 'seller' : 'expense' };
    } else if (type === 'journal') {
      const amount = num(get('vAmount').value);
      const debitAccount = get('vDebit').value.trim();
      const creditAccount = get('vCredit').value.trim();
      if (!amount || !debitAccount || !creditAccount) { toast('Amount and both accounts are required', 'err'); return; }
      data = { date, no, party, amount, debitAccount, creditAccount, narration };
    } else {
      calcLines();
      const clean = lines.filter(l => num(l.qty) && num(l.rate));
      if (!clean.length) { toast('Add at least one line with quantity and rate', 'err'); return; }
      if (!party) { toast(type === 'purchase' ? 'Seller is required' : 'Buyer is required', 'err'); return; }
      const subTotal = r2(clean.reduce((a, l) => a + l.amount, 0));
      const taxTotal = r2(clean.reduce((a, l) => a + l.taxAmt, 0));
      const grandTotal = r2(subTotal + taxTotal);
      const commOn = get('vCommOn').checked;
      const commPct = num(get('vCommPct').value);
      data = {
        date, no, party, narration,
        lines: clean, subTotal, taxTotal, grandTotal,
        comm: { enabled: commOn, pct: commPct, value: commOn ? r2(taxTotal * commPct / 100) : 0 }
      };
    }

    await saveRecord('voucher', type, data, rec);

    // A purchase/sales voucher with brokerage on owns exactly one register entry:
    // created with the voucher, updated when the voucher changes, removed when the
    // commission is switched off.
    if (type === 'purchase' || type === 'sales') {
      const saved = rec || [...state.records.values()].find(r => r.kind === 'voucher' && r.type === type && r.data.no === data.no);
      const linked = saved ? invoices().find(i => i.data.voucherId === saved.id) : null;
      const wantsCommission = data.comm.enabled && data.comm.value > 0;
      if (wantsCommission) {
        await saveRecord('invoice', 'commission', {
          date: data.date,
          seller: type === 'purchase' ? data.party : 'S.E. ENGINEERING (PRIVATE) LIMITED',
          buyer: type === 'purchase' ? 'S.E. ENGINEERING (PRIVATE) LIMITED' : data.party,
          invNo: data.no,
          item: (data.lines[0] || {}).item || '',
          hsCode: (data.lines[0] || {}).hsCode || '',
          qty: (data.lines[0] || {}).qty || 0,
          rate: (data.lines[0] || {}).rate || 0,
          amount: data.subTotal,
          gstPct: data.subTotal ? r2(data.taxTotal / data.subTotal * 100) : 0,
          gstValue: data.taxTotal,
          commPct: data.comm.pct,
          commValue: data.comm.value,
          notes: 'Brokerage from ' + type + ' voucher ' + data.no,
          voucherId: saved ? saved.id : ''
        }, linked || undefined);
      } else if (linked) {
        await deleteRecord(linked);
      }
    }

    closeModal();
    toast(rec ? 'Voucher updated' : 'Voucher saved');
    render();
  });
}

/* ---------------------------------------------------------------- delete flow */
function askDelete(id) {
  const rec = byId(id);
  if (!rec) return;
  const label = rec.data.name || rec.data.invNo || rec.data.no || rec.data.party || 'this record';
  confirmDialog({
    title: 'Delete ' + esc(String(label)) + '?',
    message: 'This removes it from every device after the next sync. Your other entries are not affected.',
    confirmText: 'Delete',
    onConfirm: async () => {
      await deleteRecord(rec);
      toast('Deleted');
      render();
    }
  });
}

function openEntry(id) {
  const rec = byId(id);
  if (!rec) return;
  if (rec.kind === 'invoice') return commissionModal(rec);
  if (rec.kind === 'voucher') return voucherModal(rec.type, rec);
  if (rec.kind === 'master') return masterModal(rec.type, rec);
}

/* ---------------------------------------------------------------- export */
function exportCSV() {
  const rows = ledgerRows().filter(matchesFilter);
  if (!rows.length) return toast('Nothing to export', 'err');
  const head = ['Date', 'Party', 'Counterparty', 'Invoice', 'Item', 'HS Code', 'Qty', 'Rate', 'Amount', 'GST %', 'GST Value', 'Comm %', 'Commission', 'Received', 'Balance', 'Narration'];
  const body = rows.map(r => [
    r.date, r.party, r.counterparty, r.invNo, r.item, r.hsCode, r.qty, r.rate, r.amount,
    r.gstPct, r.gstValue, r.commPct, r.commission, r.received, r.balance, r.narration
  ]);
  const csv = [head, ...body].map(line => line.map(v => {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\r\n');
  download('commission-register-' + today() + '.csv', '\ufeff' + csv, 'text/csv');
  toast('CSV exported');
}

function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime || 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* ---------------------------------------------------------------- views: dashboard & settings */
function renderDashboard() {
  const t = registerTotals();
  $('#main').innerHTML = `
    <div class="view-head"><div><h2>Register Dashboard</h2><p>Position, ageing and tax registers at a glance.</p></div></div>
    <div class="card">
      <div class="soon-wrap">
        <div class="glyph">📊</div>
        <h3>Coming soon</h3>
        <p>This screen is reserved for the full register dashboard. Your books keep working meanwhile — the register below already holds ${t.invoices} invoices worth ${money(t.commission, 0)} in commission.</p>
        <div class="soon-list">
          <div class="soon-item"><b>Company-wise ageing</b><span>How long each commission has been outstanding.</span></div>
          <div class="soon-item"><b>GST register</b><span>Input / output tax summary per month for the return.</span></div>
          <div class="soon-item"><b>Monthly position</b><span>Commission earned, received and payable over time.</span></div>
        </div>
        <button class="btn primary" style="margin-top:26px" data-go="register">Open the register</button>
      </div>
    </div>`;
  $('[data-go]').addEventListener('click', () => navigate('register'));
}

async function renderSettings() {
  const u = state.user || {};
  const info = state.serverInfo || {};
  const pending = pendingCount();
  $('#main').innerHTML = `
    <div class="view-head"><div><h2>Settings &amp; Sync</h2><p>Your login, the devices and the backups behind this app.</p></div></div>

    <div class="kpis">
      <div class="kpi green"><div class="label">Records on this device</div><div class="value">${liveCount()}</div><div class="sub">${pending} waiting to sync</div></div>
      <div class="kpi"><div class="label">Server storage</div><div class="value" style="font-size:18px">${esc(info.mode === 'sqlite' ? 'VPS SQLite' : info.mode === 'json' ? 'VPS JSON' : 'Device only')}</div><div class="sub">${esc(info.records != null ? info.records + ' records' : 'offline')}</div></div>
      <div class="kpi violet"><div class="label">Last sync</div><div class="value" style="font-size:18px">${state.lastSync ? new Date(state.lastSync).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</div><div class="sub">${state.online ? 'online' : 'offline'}</div></div>
      <div class="kpi"><div class="label">App version</div><div class="value" style="font-size:18px">${APP_VERSION}</div><div class="sub">offline-first</div></div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-head"><h3>Account</h3><div class="right"><span class="pill ok">${esc(u.role || 'staff')}</span></div></div>
      <div class="card-pad">
        <div class="grid-3">
          <div class="field"><label>Name</label><input value="${esc(u.name || '')}" readonly></div>
          <div class="field"><label>Username</label><input value="${esc(u.username || '')}" readonly></div>
          <div class="field"><label>Role</label><input value="${esc(u.role || '')}" readonly></div>
        </div>
        <div class="grid-3">
          <div class="field"><label for="pwOld">Current password</label><input id="pwOld" type="password" autocomplete="current-password"></div>
          <div class="field"><label for="pwNew">New password</label><input id="pwNew" type="password" autocomplete="new-password"></div>
          <div class="field"><label>&nbsp;</label><button class="btn block" id="pwSave">Change password</button></div>
        </div>
      </div>
    </div>

    ${u.role === 'admin' ? `
    <div class="card" style="margin-bottom:16px">
      <div class="card-head"><h3>Logins for the team</h3>
        <div class="right"><button class="btn sm primary" id="addUser">${ICON.plus} Add login</button></div></div>
      <div id="userList" class="card-pad"><span class="muted">Loading…</span></div>
    </div>` : ''}

    <div class="card">
      <div class="card-head"><h3>Sync &amp; backup</h3></div>
      <div class="card-pad">
        <p class="muted" style="font-size:13px;line-height:1.65;margin-bottom:14px">
          Entries are written to this device first, so the app keeps working with no internet.
          Every change is pushed to the VPS database and pulled by your other devices on the next sync.
          A copy of the database is also saved on the server every six hours.
        </p>
        <div style="display:flex;gap:9px;flex-wrap:wrap">
          <button class="btn primary" id="syncNow">${ICON.sync} Sync now</button>
          <button class="btn" id="exportJson">${ICON.download} Download my books (.json)</button>
          ${u.role === 'admin' ? '<button class="btn" id="serverBackup">' + ICON.download + ' Download server backup</button>' : ''}
          <button class="btn" id="reload">Full re-download</button>
        </div>
      </div>
    </div>`;

  $('#pwSave').addEventListener('click', async () => {
    try {
      const res = await api('/auth/password', { method: 'POST', body: { currentPassword: $('#pwOld').value, newPassword: $('#pwNew').value } });
      state.token = res.token;
      localStorage.setItem('ca.token', res.token);
      toast('Password changed');
      $('#pwOld').value = ''; $('#pwNew').value = '';
    } catch (e) { toast(e.message, 'err'); }
  });

  $('#syncNow').addEventListener('click', () => syncNow({ quiet: false }));
  $('#exportJson').addEventListener('click', () => {
    download('commission-books-' + today() + '.json', JSON.stringify({ generatedAt: new Date().toISOString(), records: Array.from(state.records.values()).filter(r => !r.deleted) }, null, 1));
  });
  const sb = $('#serverBackup');
  if (sb) sb.addEventListener('click', async () => {
    try {
      const res = await fetch(API + '/backup', { headers: { Authorization: 'Bearer ' + state.token } });
      if (!res.ok) throw new Error('Backup failed');
      download('commission-server-backup-' + today() + '.json', await res.text());
      toast('Server backup downloaded');
    } catch (e) { toast(e.message, 'err'); }
  });
  $('#reload').addEventListener('click', async () => {
    state.records.clear();
    state.cursor = 0;
    localStorage.removeItem('ca.cursor.' + state.user.id);
    await putLocal([]);
    await bootstrapIfEmpty();
    await syncNow({ quiet: true });
    toast('Books re-downloaded');
    render();
  });

  if (u.role === 'admin') {
    const addUser = $('#addUser');
    if (addUser) addUser.addEventListener('click', userModal);
    loadUsers();
  }
}

async function loadUsers() {
  const host = $('#userList');
  if (!host) return;
  try {
    const res = await api('/users');
    host.innerHTML = `
      <table class="rtable">
        <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th></th></tr></thead>
        <tbody>${res.users.map(x => `<tr>
          <td class="strong" data-label="Name">${esc(x.name)}</td>
          <td class="mono" data-label="Username">${esc(x.username)}</td>
          <td data-label="Role"><span class="pill ${x.role === 'admin' ? 'both' : 'gray'}">${esc(x.role)}</span></td>
          <td data-label="Status">${x.disabled ? '<span class="pill pend">disabled</span>' : '<span class="pill ok">active</span>'}</td>
          <td class="cell-actions"><div class="row-actions">
            <button class="icon-btn" data-reset="${esc(x.id)}" title="Reset password">🔑</button>
            <button class="icon-btn" data-toggle="${esc(x.id)}" data-disabled="${x.disabled ? '1' : '0'}" title="${x.disabled ? 'Enable' : 'Disable'}">${x.disabled ? '✓' : '⏻'}</button>
            ${x.id === (state.user && state.user.id) ? '' : `<button class="icon-btn del" data-remove="${esc(x.id)}" data-name="${esc(x.name)}" title="Remove login">${ICON.del}</button>`}
          </div></td>
        </tr>`).join('')}</tbody>
      </table>`;
    $$('[data-toggle]', host).forEach(b => b.addEventListener('click', async () => {
      try {
        await api('/users/' + b.dataset.toggle, { method: 'PATCH', body: { disabled: b.dataset.disabled !== '1' } });
        toast('Updated');
        loadUsers();
      } catch (e) { toast(e.message, 'err'); }
    }));
    $$('[data-reset]', host).forEach(b => b.addEventListener('click', async () => {
      const pw = prompt('New password for this login (6+ characters):');
      if (!pw) return;
      try {
        await api('/users/' + b.dataset.reset, { method: 'PATCH', body: { resetPassword: pw } });
        toast('Password reset');
      } catch (e) { toast(e.message, 'err'); }
    }));
    $$('[data-remove]', host).forEach(b => b.addEventListener('click', () => {
      confirmDialog({
        title: 'Remove ' + b.dataset.name + '?',
        message: 'This login will stop working immediately. Entries that person already made stay in the books.',
        confirmText: 'Remove login',
        onConfirm: async () => {
          await api('/users/' + b.dataset.remove, { method: 'DELETE' });
          toast('Login removed');
          loadUsers();
        }
      });
    }));
  } catch (e) {
    host.innerHTML = `<span class="muted">${esc(e.message)}</span>`;
  }
}

function userModal() {
  const modal = openModal(`
    <div class="modal-head"><div><h3>Add a login</h3><div class="sub">For staff who should enter vouchers.</div></div>
      <button class="icon-btn x" data-close>✕</button></div>
    <div class="modal-body">
      <div class="field"><label for="uName">Name</label><input id="uName" placeholder="Name"></div>
      <div class="field"><label for="uUser">Username</label><input id="uUser" placeholder="username" autocapitalize="none"></div>
      <div class="field"><label for="uPass">Password</label><input id="uPass" type="password" placeholder="6+ characters"></div>
      <div class="field"><label for="uRole">Role</label><select id="uRole"><option value="staff">Staff</option><option value="admin">Admin</option></select></div>
    </div>
    <div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn primary" id="uSave">Create login</button></div>`);
  $$('[data-close]', modal).forEach(b => b.addEventListener('click', closeModal));
  $('#uSave', modal).addEventListener('click', async () => {
    try {
      await api('/users', { method: 'POST', body: { name: $('#uName', modal).value.trim(), username: $('#uUser', modal).value.trim(), password: $('#uPass', modal).value, role: $('#uRole', modal).value } });
      closeModal();
      toast('Login created');
      loadUsers();
    } catch (e) { toast(e.message, 'err'); }
  });
}

/* ---------------------------------------------------------------- router */
function navigate(view) {
  state.view = view;
  state.filter.q = '';
  closeDrawer();
  render();
}

const VIEW_TITLES = {
  register: ['Commission Register', 'S.E. Engineering (Pvt) Ltd'],
  daybook: ['Day Book', 'All entries, day by day'],
  purchases: ['Purchase Register', 'Every purchase, with GST'],
  sales: ['Sales Register', 'Every sale, with GST'],
  dashboard: ['Register Dashboard', 'Coming soon'],
  settings: ['Settings & Sync', 'Account, devices and backups']
};

function render() {
  const [kind, sub] = String(state.view).split(':');
  const menuKey = kind === 'master' ? 'master:' + sub : kind === 'voucher' ? 'voucher:' + sub : kind;
  $$('.menu-item[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === menuKey));

  const titles = VIEW_TITLES[state.view] || (kind === 'master'
    ? [MASTERS[sub]?.title || 'Manage Master', 'Add, edit and remove master names']
    : kind === 'voucher'
      ? [VOUCHER_META[sub]?.title || 'Vouchers', VOUCHER_META[sub]?.sub || '']
      : VIEW_TITLES.register);
  $('#pageTitle').textContent = titles[0];
  $('#pageSub').textContent = titles[1];
  document.title = titles[0] + ' — Commission Accounts';
  updateDrawerMeta();

  if (kind === 'master') return renderMaster(sub);
  if (kind === 'voucher') return renderVouchers(sub);
  if (state.view === 'daybook') return renderDayBook();
  if (state.view === 'purchases') return renderGoodsRegister('purchase');
  if (state.view === 'sales') return renderGoodsRegister('sales');
  if (state.view === 'dashboard') return renderDashboard();
  if (state.view === 'settings') return renderSettings();
  return renderRegister();
}

/* ---------------------------------------------------------------- boot */
function wireChrome() {
  $('#menuBtn').addEventListener('click', openDrawer);
  $('#drawerClose').addEventListener('click', closeDrawer);
  $('#drawerBackdrop').addEventListener('click', closeDrawer);
  $('#mmToggle').addEventListener('click', (e) => toggleSubmenu('mm', e.currentTarget));
  $('#qvToggle').addEventListener('click', (e) => toggleSubmenu('qv', e.currentTarget));
  $$('.menu-item[data-view]').forEach(b => b.addEventListener('click', () => navigate(b.dataset.view)));
  $('#syncChip').addEventListener('click', () => syncNow({ quiet: false }));
  $('#userChip').addEventListener('click', () => navigate('settings'));
  $('#drawerLogout').addEventListener('click', () => { closeDrawer(); signOut(); });
  $('#modalBackdrop').addEventListener('click', (e) => { if (e.target.id === 'modalBackdrop') closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeModal(); closeDrawer(); return; }
    // F2 = one day, Alt+F2 = a date range (the AccPro habit)
    if (e.key === 'F2') {
      e.preventDefault();
      if ($('#appShell').hidden) return;
      openPeriodDialog(e.altKey ? 'range' : 'day');
    }
  });

  window.addEventListener('online', () => { state.online = true; refreshSyncChip(); syncNow({ quiet: true }); });
  window.addEventListener('offline', () => { state.online = false; refreshSyncChip(); });
  setInterval(() => { if (navigator.onLine && (pendingCount() || !state.lastSync)) syncNow({ quiet: true }); }, 20000);
}

function wireAuth() {
  const tabLogin = $('#tabLogin');
  const tabSignup = $('#tabSignup');
  const loginForm = $('#loginForm');
  const signupForm = $('#signupForm');

  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('on'); tabSignup.classList.remove('on');
    loginForm.hidden = false; signupForm.hidden = true;
    $('#authMsg').className = 'auth-msg';
  });
  tabSignup.addEventListener('click', () => {
    tabSignup.classList.add('on'); tabLogin.classList.remove('on');
    signupForm.hidden = false; loginForm.hidden = true;
    $('#authMsg').className = 'auth-msg';
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#loginBtn');
    btn.disabled = true; btn.textContent = 'Signing in…';
    try {
      await doLogin($('#loginUser').value.trim(), $('#loginPass').value);
    } catch (err) {
      showAuth(err.message || 'Sign in failed', 'err');
    } finally {
      btn.disabled = false; btn.textContent = 'Sign in';
    }
  });

  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#signupBtn');
    btn.disabled = true; btn.textContent = 'Creating…';
    try {
      await doSignup($('#suName').value.trim(), $('#suUser').value.trim(), $('#suPass').value, $('#suInvite').value.trim());
    } catch (err) {
      showAuth(err.message || 'Could not create the account', 'err');
    } finally {
      btn.disabled = false; btn.textContent = 'Create account';
    }
  });
}

async function boot() {
  wireChrome();
  wireAuth();
  if (state.token && state.user) {
    await startApp();
  } else {
    showAuth('', 'ok');
  }
  if ('serviceWorker' in navigator) {
    try { navigator.serviceWorker.register('/commission-sw.js', { scope: '/commission' }).catch(() => {}); } catch (e) { /* ignore */ }
  }
}

boot();
