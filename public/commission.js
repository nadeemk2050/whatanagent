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
const APP_VERSION = '1.7.0';
// The brokerage whose books these are — shown wherever the app names itself.
const COMPANY = 'Qaryan Brokerage';

import { buildExcel, buildPdf, downloadFile } from './commission-export.js';

/* ---------------------------------------------------------------- utilities */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const safeDecode = (v) => { try { return decodeURIComponent(v || ''); } catch (e) { return String(v || ''); } };
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

const ICON = {  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M4 19h16"/></svg>',
  print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7 8V3h10v5"/><rect x="4" y="8" width="16" height="8" rx="2"/><path d="M7 16h10v5H7z"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/></svg>',
  sync: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-15.5 6.2M3 12a9 9 0 0 1 15.5-6.2"/><path d="M21 4v5h-5M3 20v-5h5"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
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
  filter: { q: '', party: '', from: '', to: '', year: '' },
  report: { from: '', to: '', type: '', seller: '' },
  page: 1,
  sort: { key: 'date', dir: 'desc' },
  prevView: 'register',
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
const dealers = () => records('master', 'dealer').sort((a, b) => (a.data.name || '').localeCompare(b.data.name || ''));
// In this book a sales voucher IS the commission voucher: every goods voucher that
// carries brokerage on is one deal in the registers, exposed in the old invoice shape.
// Rows written before that change (kind "invoice") are still read, so the app keeps
// working on a server that has not been migrated yet — and disappears once it has.
const commissionDeals = () => records('voucher')
  .filter(v => (v.type === 'sales' || v.type === 'purchase') && num((v.data.comm || {}).value) > 0);

function invoices() {
  const out = records('invoice', 'commission');
  for (const v of commissionDeals()) {
    const d = v.data;
    const lines = Array.isArray(d.lines) ? d.lines : [];
    const amount = num(d.subTotal);
    const gstValue = num(d.taxTotal);
    out.push({
      id: v.id, kind: 'voucher', type: v.type, rec: v,
      data: {
        date: d.date || '', invNo: d.no || '',
        seller: d.seller || (v.type === 'purchase' ? d.party : ''),
        buyer: d.buyer || (v.type === 'sales' ? d.party : ''),
        dealer: d.dealer || '',
        item: lines.map(l => l.item).filter(Boolean).join(', '),
        hsCode: (lines[0] || {}).hsCode || '',
        qty: lines.reduce((s, l) => s + num(l.qty), 0),
        rate: num((lines[0] || {}).rate),
        amount,
        gstPct: amount ? r2(gstValue / amount * 100) : 0,
        gstValue,
        commPct: num((d.comm || {}).pct),
        commValue: num((d.comm || {}).value),
        notes: d.narration || ''
      }
    });
  }
  return out;
}
const vouchers = (type) => records('voucher', type);
const allVouchers = () => records('voucher');

function partyByName(name) {
  const key = String(name || '').trim().toLowerCase();
  return parties().find(p => String(p.data.name || '').trim().toLowerCase() === key) || null;
}
// A party with role "both" counts as a seller and as a buyer.
const sellerNames = () => parties().filter(p => (p.data.role || 'seller') !== 'buyer').map(p => p.data.name).filter(Boolean);
const buyerNames = () => parties().filter(p => (p.data.role || 'seller') !== 'seller').map(p => p.data.name).filter(Boolean);
// Money in this book only ever moves through a dealer.
const dealerNames = () => dealers().map(d => d.data.name).filter(Boolean);
// Both sides of a goods voucher, with the old single-`party` rows still readable.
const voucherSeller = (d, type) => (d && (d.seller || (type === 'purchase' ? d.party : ''))) || '';
const voucherBuyer = (d, type) => (d && (d.buyer || (type === 'sales' ? d.party : ''))) || '';
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
      kind: 'invoice', id: inv.id, rec: inv.rec,
      date: d.date || '', party: d.seller || '', counterparty: d.buyer || '', dealer: d.dealer || '',
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
        dealer: d.dealer || d.party || '',
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
/* ---------------------------------------------------------------- sorting & pagination */
const PAGE_SIZE = 40;
let refocusSearch = false;

function sortList(list, getters, sort) {
  const get = getters[sort.key] || getters.date || Object.values(getters)[0];
  const dir = sort.dir === 'asc' ? 1 : -1;
  if (!get) return list.slice();
  return list.slice().sort((a, b) => {
    const va = get(a);
    const vb = get(b);
    if (typeof va === 'number' || typeof vb === 'number') {
      return ((Number(va) || 0) - (Number(vb) || 0)) * dir;
    }
    return String(va == null ? '' : va).localeCompare(String(vb == null ? '' : vb)) * dir;
  });
}

const SORT_GETTERS = {
  register: {
    date: r => r.date || '', party: r => r.party || '', dealer: r => r.dealer || '',
    item: r => r.item || '',
    qty: r => r.qty, amount: r => r.amount, gst: r => r.gstValue,
    commission: r => r.commission, received: r => r.received, balance: r => r.balance
  },
  voucher: {
    date: r => r.data.date || '', no: r => r.data.no || '',
    party: r => r.data.seller || r.data.party || '', buyer: r => r.data.buyer || '',
    amount: r => (typeof r.data.grandTotal === 'number' ? r.data.grandTotal : num(r.data.amount)),
    gst: r => num(r.data.taxTotal), total: r => num(r.data.grandTotal)
  },
  master: { name: r => r.data.name || '', rate: r => num(r.data.commissionPct || r.data.rate || r.data.pct) }
};

function sortHeader(key, label, numeric) {
  const on = state.sort.key === key;
  const arrow = on ? (state.sort.dir === 'asc' ? '\u25B2' : '\u25BC') : '\u2195';
  return `<th class="${numeric ? 'num ' : ''}sortable${on ? ' on' : ''}" data-sort="${key}" title="Sort by ${esc(label)}">${label}<span class="arrow">${arrow}</span></th>`;
}

function toggleSort(key) {
  if (state.sort.key === key) state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
  else state.sort = { key, dir: 'desc' };
  state.page = 1;
  render();
}

function pageSlice(list) {
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (state.page > pages) state.page = pages;
  if (state.page < 1) state.page = 1;
  const start = (state.page - 1) * PAGE_SIZE;
  return { rows: list.slice(start, start + PAGE_SIZE), total, pages, start, end: Math.min(start + PAGE_SIZE, total) };
}

function pagerHtml(slice) {
  if (!slice.total) return '';
  const disabled = slice.pages === 1 ? 'disabled' : '';
  return `<div class="pager">
    <span class="info">${slice.start + 1}\u2013${slice.end} of ${slice.total}</span>
    <span class="spacer"></span>
    <button class="btn icon" data-pg="first" ${disabled} title="First page">\u00AB</button>
    <button class="btn icon" data-pg="prev" ${disabled} title="Previous page">\u2039</button>
    <span class="page-jump">Page
      <input id="pgInput" type="number" min="1" max="${slice.pages}" value="${state.page}"> of ${slice.pages}</span>
    <button class="btn icon" data-pg="next" ${disabled} title="Next page">\u203A</button>
    <button class="btn icon" data-pg="last" ${disabled} title="Last page">\u00BB</button>
  </div>`;
}

function scrollListTop() {
  const w = document.querySelector('.table-wrap');
  if (w) w.scrollTop = 0;
}

function wirePager(root, slice) {
  $$('[data-pg]', root).forEach(b => b.addEventListener('click', () => {
    const a = b.dataset.pg;
    if (a === 'first') state.page = 1;
    else if (a === 'last') state.page = slice.pages;
    else if (a === 'prev') state.page = Math.max(1, state.page - 1);
    else if (a === 'next') state.page = Math.min(slice.pages, state.page + 1);
    render();
    scrollListTop();
  }));
  const inp = $('#pgInput', root);
  if (inp) inp.addEventListener('change', () => {
    const p = Math.min(Math.max(1, Number(inp.value) || 1), slice.pages);
    state.page = p;
    render();
    scrollListTop();
  });
}

function wireSortHeaders(root) {
  $$('th[data-sort]', root).forEach(th => {
    th.addEventListener('click', () => toggleSort(th.dataset.sort));
  });
}

/* ---------------------------------------------------------------- purchases & sales registers */
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
  let base = vouchers(type).filter(v => inReportRange(v.data.date));
  if (state.filter.q) base = base.filter(v => JSON.stringify(v.data).toLowerCase().includes(state.filter.q.toLowerCase()));
  const sorted = sortList(base, SORT_GETTERS.voucher, state.sort);
  const slice = pageSlice(sorted);
  const all = sorted;
  const pageRows = slice.rows;

  const sum = (k) => r2(all.reduce((a, v) => a + num(v.data[k]), 0));
  const totalQty = all.reduce((a, v) => a + (v.data.lines || []).reduce((s, l) => s + num(l.qty), 0), 0);
  const hasBrokerage = all.some(v => num((v.data.comm || {}).value) > 0);
  const colspan = 6;
  const sortTh = (key, label, numeric) => sortHeader(key, label, numeric);

  const body = pageRows.length ? `
    <div class="table-wrap">
      <table class="rtable">
        <thead><tr>
          ${sortTh('date', 'Date')}${sortTh('no', 'Voucher')}${sortTh('party', 'Seller')}<th>Buyer</th><th>Dealer</th><th>Items</th>
          ${sortTh('qty', 'Qty', true)}${sortTh('gst', 'Sub total', true)}${sortTh('gst', 'GST', true)}${sortTh('total', 'Total', true)}
          ${hasBrokerage ? '<th class="num">Brokerage</th>' : ''}<th></th>
        </tr></thead>
        <tbody>${pageRows.map(v => {
          const d = v.data;
          const qty = (d.lines || []).reduce((s, l) => s + num(l.qty), 0);
          const comm = num((d.comm || {}).value);
          const seller = voucherSeller(d, type);
          const buyer = voucherBuyer(d, type);
          return `<tr>
            <td class="mono nowrap" data-label="Date">${esc(fmtDate(d.date))}</td>
            <td class="mono strong" data-label="Voucher">${esc(d.no || '-')}</td>
            <td class="wrap" data-label="Seller"><div class="cell-val"><div class="strong">${esc(seller || '-')}</div>${d.narration ? `<div class="muted sub">${esc(d.narration)}</div>` : ''}</div></td>
            <td class="wrap" data-label="Buyer"><div class="cell-val">${esc(buyer || '-')}</div></td>
            <td class="wrap" data-label="Dealer"><div class="cell-val">${esc(d.dealer || '-')}</div></td>
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

    <div class="card flexcard">
      <div class="toolbar">
        <div class="search">${ICON.search}<input id="fQ" placeholder="Search voucher, ${type === 'sales' ? 'buyer' : 'seller'}, item..." value="${esc(state.filter.q)}"></div>
        <input type="date" id="rFrom" value="${esc(state.report.from)}" title="From date">
        <input type="date" id="rTo" value="${esc(state.report.to)}" title="To date">
        <span class="pill ok">${esc(reportLabel())}</span>
        ${(state.report.from || state.report.to) ? '<button class="btn sm" data-act="clear">Clear</button>' : ''}
      </div>
      ${body}
      ${pagerHtml(slice)}
    </div>`;

  $('#fQ').addEventListener('input', debounce(e => { state.filter.q = e.target.value; state.page = 1; render(); }, 220));
  $('#rFrom').addEventListener('change', e => { state.report.from = e.target.value; state.page = 1; render(); });
  $('#rTo').addEventListener('change', e => { state.report.to = e.target.value; state.page = 1; render(); });
  const acts = {
    print: () => window.print(),
    new: () => voucherModal(type),
    clear: () => { state.report.from = ''; state.report.to = ''; state.page = 1; render(); }
  };
  $$('[data-act]').forEach(b => { const fn = acts[b.dataset.act]; if (fn) b.addEventListener('click', fn); });
  wireSortHeaders($('#main'));
  wirePager($('#main'), slice);
  $$('[data-edit]').forEach(b => b.addEventListener('click', () => openEntry(b.dataset.edit)));
}

/* ---------------------------------------------------------------- seller / buyer registers */
// One row per seller (or per buyer). Commission ledger entries carry the GST and the
// commission; goods vouchers that never produced a commission entry still count as
// deals, but only once — a voucher linked to a ledger entry is not counted twice.
function partyRegisterRows(side) {
  const isSeller = side === 'seller';
  const groups = new Map();

  const bump = (name, other, deal) => {
    let g = groups.get(name);
    if (!g) {
      g = { name, deals: 0, others: new Map(), amount: 0, gst: 0, commission: 0, received: 0, balance: 0, last: '' };
      groups.set(name, g);
    }
    g.deals += 1;
    if (other && other !== name) g.others.set(other, (g.others.get(other) || 0) + 1);
    g.amount = r2(g.amount + num(deal.amount));
    g.gst = r2(g.gst + num(deal.gst));
    g.commission = r2(g.commission + num(deal.commission));
    if ((deal.date || '') > g.last) g.last = deal.date || '';
  };

  for (const inv of invoices()) {
    const d = inv.data;
    const name = String((isSeller ? d.seller : d.buyer) || '').trim();
    if (!name) continue;
    const other = String((isSeller ? d.buyer : d.seller) || '').trim();
    bump(name, other, { date: d.date, amount: d.amount, gst: d.gstValue, commission: d.commValue });
  }

  // Goods vouchers without brokerage are still deals — they just earn nothing.
  for (const v of allVouchers()) {
    if (v.type !== 'purchase' && v.type !== 'sales') continue;
    if (num((v.data.comm || {}).value) > 0) continue;
    const d = v.data;
    const seller = String(voucherSeller(d, v.type)).trim();
    const buyer = String(voucherBuyer(d, v.type)).trim();
    const name = isSeller ? seller : buyer;
    if (!name) continue;
    bump(name, isSeller ? buyer : seller, { date: d.date, amount: d.subTotal, gst: d.taxTotal, commission: 0 });
  }

  // Receipt vouchers are commission money received from a company.
  const paid = new Map();
  for (const v of vouchers('receipt')) {
    const key = String(v.data.party || '').trim().toLowerCase();
    if (!key) continue;
    paid.set(key, r2((paid.get(key) || 0) + num(v.data.amount)));
  }
  const rows = [...groups.values()];
  for (const g of rows) {
    g.received = paid.get(g.name.toLowerCase()) || 0;
    g.balance = r2(g.commission - g.received);
  }
  return rows;
}

const PARTY_REG = {
  seller: { head: 'Seller', otherHead: 'Buyers', side: 'seller', empty: 'No sellers yet', hint: 'Sellers appear here as soon as a deal carries their name.' },
  buyer: { head: 'Buyer', otherHead: 'Sellers', side: 'buyer', empty: 'No buyers yet', hint: 'Buyers appear here as soon as a deal carries their name.' }
};

function renderPartyRegister(side) {
  const cfg = PARTY_REG[side];
  if (!cfg) return renderRegister();
  const all = partyRegisterRows(side);
  const q = state.filter.q.trim().toLowerCase();
  const filtered = q
    ? all.filter(r => (r.name + ' ' + [...r.others.keys()].join(' ')).toLowerCase().includes(q))
    : all;
  const getters = {
    name: r => r.name, deals: r => r.deals, others: r => r.others.size,
    amount: r => r.amount, gst: r => r.gst, commission: r => r.commission,
    received: r => r.received, balance: r => r.balance
  };
  const sorted = sortList(filtered, getters, state.sort);
  const slice = pageSlice(sorted);
  const sum = (k) => r2(filtered.reduce((a, r) => a + r[k], 0));
  const sortTh = (key, label, numeric) => sortHeader(key, label, numeric);
  // Money is collected from the seller side, so only that register shows receipts.
  const showMoney = side === 'seller';

  const body = slice.rows.length ? `
    <div class="table-wrap">
      <table class="rtable">
        <thead><tr>
          ${sortTh('name', cfg.head)}${sortTh('deals', 'Deals', true)}<th>${cfg.otherHead}</th>
          ${sortTh('amount', 'Amount', true)}${sortTh('gst', 'GST', true)}${sortTh('commission', 'Commission', true)}
          ${showMoney ? sortTh('received', 'Received', true) + sortTh('balance', 'Balance', true) : ''}<th></th>
        </tr></thead>
        <tbody>${slice.rows.map(r => {
          const names = [...r.others.keys()];
          const shown = names.slice(0, 3).join(', ');
          const more = names.length > 3 ? ' +' + (names.length - 3) + ' more' : '';
          return `<tr>
            <td class="wrap" data-label="${esc(cfg.head)}"><div class="cell-val"><div class="strong">${esc(r.name)}</div><div class="muted sub">last ${esc(fmtDate(r.last))}</div></div></td>
            <td class="num" data-label="Deals">${r.deals}</td>
            <td class="wrap" data-label="${esc(cfg.otherHead)}"><div class="cell-val"><div>${esc(shown || '-')}</div>${more ? `<div class="muted sub">${esc(more)}</div>` : ''}</div></td>
            <td class="num" data-label="Amount">${money(r.amount, 0)}</td>
            <td class="num" data-label="GST">${money(r.gst, 0)}</td>
            <td class="num strong" style="color:var(--brand)" data-label="Commission">${money(r.commission)}</td>
            ${showMoney ? `<td class="num" style="color:var(--amber)" data-label="Received">${r.received ? money(r.received) : '-'}</td>
            <td class="num strong" data-label="Balance">${money(r.balance)}</td>` : ''}
            <td class="cell-actions"><div class="row-actions">
              <button class="icon-btn" data-open-party="${esc(r.name)}" title="Show the deals">${ICON.edit}</button>
            </div></td>
          </tr>`;
        }).join('')}</tbody>
        <tfoot><tr>
          <td colspan="3" data-label="Total">Total (${filtered.length} ${side === 'seller' ? 'sellers' : 'buyers'})</td>
          <td class="num" data-label="Amount">${money(sum('amount'), 0)}</td>
          <td class="num" data-label="GST">${money(sum('gst'), 0)}</td>
          <td class="num" data-label="Commission">${money(sum('commission'))}</td>
          ${showMoney ? `<td class="num" data-label="Received">${money(sum('received'))}</td>
          <td class="num" data-label="Balance">${money(sum('balance'))}</td>` : ''}
          <td></td>
        </tr></tfoot>
      </table>
    </div>` : emptyState(cfg.empty, cfg.hint, '');

  $('#main').innerHTML = `
    <div class="card flexcard">
      <div class="toolbar">
        <div class="search">${ICON.search}<input id="fQ" placeholder="Search ${side}, ${cfg.otherHead.toLowerCase()}..." value="${esc(state.filter.q)}"></div>
        <span class="muted" style="font-size:12.5px;margin-left:auto">${filtered.length} of ${all.length}</span>
      </div>
      ${body}
      ${pagerHtml(slice)}
    </div>`;

  $('#fQ').addEventListener('input', debounce(e => { state.filter.q = e.target.value; state.page = 1; render(); }, 220));
  wireSortHeaders($('#main'));
  wirePager($('#main'), slice);
  $$('[data-open-party]').forEach(b => b.addEventListener('click', () => openPartyDeals(side, b.dataset.openParty)));
}

// Drills into the Commission Register already filtered to that company.
function openPartyDeals(side, name) {
  state.view = 'register';
  state.page = 1;
  state.filter.party = side === 'seller' ? name : '';
  state.filter.q = side === 'buyer' ? name : '';
  state.sort = { key: 'date', dir: 'desc' };
  render();
}

/* ---------------------------------------------------------------- dealers */
// Every dealer, with what is still to come in from them.
function dealerSummaries() {
  const groups = new Map();
  const touch = (name) => {
    let g = groups.get(name);
    if (!g) {
      g = { name, deals: 0, commission: 0, received: 0, balance: 0, last: '' };
      groups.set(name, g);
    }
    return g;
  };
  for (const d of dealers()) {
    const name = String(d.data.name || '').trim();
    if (name) touch(name);
  }
  for (const inv of invoices()) {
    const name = String(inv.data.dealer || '').trim();
    if (!name) continue;
    const g = touch(name);
    g.deals += 1;
    g.commission = r2(g.commission + num(inv.data.commValue));
    if ((inv.data.date || '') > g.last) g.last = inv.data.date || '';
  }
  for (const v of vouchers('receipt')) {
    const name = String(v.data.dealer || v.data.party || '').trim();
    if (!name) continue;
    const g = touch(name);
    g.received = r2(g.received + num(v.data.amount));
  }
  for (const g of groups.values()) g.balance = r2(g.commission - g.received);
  return [...groups.values()];
}

function renderDealers() {
  const all = dealerSummaries();
  const q = state.filter.q.trim().toLowerCase();
  const filtered = q ? all.filter(r => r.name.toLowerCase().includes(q)) : all;
  const getters = {
    name: r => r.name, deals: r => r.deals, commission: r => r.commission,
    received: r => r.received, balance: r => r.balance
  };
  const sorted = sortList(filtered, getters, state.sort);
  const slice = pageSlice(sorted);
  const sum = (k) => r2(filtered.reduce((a, r) => a + r[k], 0));
  const sortTh = (key, label, numeric) => sortHeader(key, label, numeric);

  const body = slice.rows.length ? `
    <div class="table-wrap">
      <table class="rtable">
        <thead><tr>
          ${sortTh('name', 'Dealer')}${sortTh('deals', 'Deals', true)}
          ${sortTh('commission', 'Commission', true)}${sortTh('received', 'Received', true)}${sortTh('balance', 'Balance', true)}<th></th>
        </tr></thead>
        <tbody>${slice.rows.map(r => `<tr>
          <td class="wrap" data-label="Dealer"><div class="cell-val">
            <button type="button" class="name-link" data-open-dealer="${esc(r.name)}" title="Open the dealer register">${esc(r.name)}</button>
            ${r.last ? `<div class="muted sub">last ${esc(fmtDate(r.last))}</div>` : ''}
          </div></td>
          <td class="num" data-label="Deals">${r.deals}</td>
          <td class="num strong" style="color:var(--brand)" data-label="Commission">${money(r.commission)}</td>
          <td class="num" style="color:var(--amber)" data-label="Received">${r.received ? money(r.received) : '-'}</td>
          <td class="num strong" data-label="Balance">${money(r.balance)}</td>
          <td class="cell-actions"><div class="row-actions">
            <button class="icon-btn" data-open-dealer="${esc(r.name)}" title="Open the dealer register">${ICON.arrow}</button>
          </div></td>
        </tr>`).join('')}</tbody>
        <tfoot><tr>
          <td colspan="2" data-label="Total">Total (${filtered.length} dealer${filtered.length === 1 ? '' : 's'})</td>
          <td class="num" data-label="Commission">${money(sum('commission'))}</td>
          <td class="num" data-label="Received">${money(sum('received'))}</td>
          <td class="num" data-label="Balance">${money(sum('balance'))}</td>
          <td></td>
        </tr></tfoot>
      </table>
    </div>` : emptyState(
      'No dealers yet',
      'Add your dealers in Manage Master → Dealer Names, then pick one on a sales voucher.',
      '<button class="btn primary" data-add-dealer="1">Add a dealer</button>'
    );

  $('#main').innerHTML = `
    <div class="card flexcard">
      <div class="toolbar">
        <div class="search">${ICON.search}<input id="fQ" placeholder="Search dealer..." value="${esc(state.filter.q)}"></div>
        <span class="muted" style="font-size:12.5px;margin-left:auto">${filtered.length} of ${all.length}</span>
      </div>
      ${body}
      ${pagerHtml(slice)}
    </div>`;

  $('#fQ').addEventListener('input', debounce(e => { state.filter.q = e.target.value; state.page = 1; render(); }, 220));
  wireSortHeaders($('#main'));
  wirePager($('#main'), slice);
  $$('[data-open-dealer]').forEach(b => b.addEventListener('click', () => openDealerRegister(b.dataset.openDealer)));
  $$('[data-add-dealer]').forEach(b => b.addEventListener('click', () => masterModal('dealer')));
}

function openDealerRegister(name) {
  state.view = 'dealer:' + encodeURIComponent(name);
  state.page = 1;
  state.filter.q = '';
  state.sort = { key: 'date', dir: 'asc' };
  render();
}

// One dealer's full ledger: every deal they brought (commission Dr) against every
// receipt from them (Cr), with a running balance. The balance always follows the
// calendar, whatever order the table is displayed in.
function dealerLedger(name) {
  const key = String(name || '').trim().toLowerCase();
  const rows = [];
  for (const inv of invoices()) {
    if (String(inv.data.dealer || '').trim().toLowerCase() !== key) continue;
    const d = inv.data;
    const qty = num(d.qty), rate = num(d.rate);
    rows.push({
      kind: 'deal', id: inv.id,
      date: d.date || '', no: d.invNo || '',
      seller: d.seller || '', buyer: d.buyer || '',
      item: d.item || '', hsCode: d.hsCode || '',
      qty, rate, amount: r2(qty * rate) || num(d.amount),
      gstPct: num(d.gstPct), gstValue: num(d.gstValue),
      commPct: num(d.commPct), commValue: num(d.commValue),
      received: 0
    });
  }
  for (const v of vouchers('receipt')) {
    if (String(v.data.dealer || v.data.party || '').trim().toLowerCase() !== key) continue;
    rows.push({
      kind: 'receipt', id: v.id,
      date: v.data.date || '', no: v.data.no || '',
      seller: '', buyer: '', item: v.data.narration || 'Commission received', hsCode: '',
      qty: 0, rate: 0, amount: 0, gstPct: 0, gstValue: 0, commPct: 0, commValue: 0,
      received: num(v.data.amount)
    });
  }
  rows.sort((a, b) => (a.date || '9999-99-99').localeCompare(b.date || '9999-99-99')
    || (a.kind === b.kind ? 0 : a.kind === 'deal' ? -1 : 1)
    || String(a.no).localeCompare(String(b.no)));
  let bal = 0;
  for (const r of rows) {
    bal = r2(bal + r.commValue - r.received);
    r.balance = bal;
  }
  return rows;
}

function renderDealerRegister(name) {
  const ledger = dealerLedger(name);
  const q = state.filter.q.trim().toLowerCase();
  const rows = q ? ledger.filter(r => dealerRowMatches(r, q)) : ledger;
  const slice = pageSlice(sortList(rows, { date: r => r.date || '' }, state.sort));
  const sum = (k) => r2(rows.reduce((a, r) => a + num(r[k]), 0));
  const deals = rows.filter(r => r.kind === 'deal').length;
  const closing = rows.length ? rows[rows.length - 1].balance : 0;
  const showSearch = !!q;

  const body = slice.rows.length ? `
    <div class="table-wrap">
      <table class="rtable ledger dense">
        <thead><tr>
          ${sortHeader('date', 'Inv Date')}<th>Inv No.</th><th>Seller Name</th><th>Buyer Name</th><th>Item Name</th><th>HS Code</th>
          <th class="num">Qty</th><th class="num">Amount</th>
          <th class="num">GST %</th><th class="num">GST Value</th>
          <th class="num">Commission %</th><th class="num">Commission Value (Dr.)</th>
          <th class="num">Received from Dealer (Cr.)</th><th class="num">Running Balance</th><th></th>
        </tr></thead>
        <tbody>${slice.rows.map(r => r.kind === 'receipt' ? `<tr class="row-cr">
          <td class="mono nowrap" data-label="Inv Date">${esc(fmtDate(r.date))}</td>
          <td class="mono strong" data-label="Inv No."><span class="pill ok">Receipt</span> ${esc(r.no || '-')}</td>
          <td data-label="Seller Name">-</td>
          <td data-label="Buyer Name">-</td>
          <td class="wrap muted" data-label="Item Name" colspan="2">${esc(r.item || 'Commission received')}</td>
          <td class="num" data-label="Qty">-</td>
          <td class="num" data-label="Amount">-</td>
          <td class="num" data-label="GST %">-</td>
          <td class="num" data-label="GST Value">-</td>
          <td class="num" data-label="Commission %">-</td>
          <td class="num" data-label="Commission Value (Dr.)">-</td>
          <td class="num strong" style="color:var(--amber)" data-label="Received from Dealer (Cr.)">${money(r.received)}</td>
          <td class="num strong" data-label="Running Balance">${money(r.balance)}</td>
          <td class="cell-actions"><div class="row-actions"><button class="icon-btn" data-edit="${esc(r.id)}" title="Open receipt">${ICON.edit}</button></div></td>
        </tr>` : `<tr>
          <td class="mono nowrap" data-label="Inv Date">${esc(fmtDate(r.date))}</td>
          <td class="mono strong" data-label="Inv No.">${esc(r.no || '-')}</td>
          <td class="wrap" data-label="Seller Name">${esc(r.seller || '-')}</td>
          <td class="wrap" data-label="Buyer Name">${esc(r.buyer || '-')}</td>
          <td class="wrap" data-label="Item Name">${esc(r.item || '-')}</td>
          <td class="mono muted" data-label="HS Code">${esc(r.hsCode || '-')}</td>
          <td class="num" data-label="Qty">${r.qty ? money(r.qty, 0) : '-'}</td>
          <td class="num" data-label="Amount">${r.amount ? money(r.amount, 0) : '-'}</td>
          <td class="num" data-label="GST %">${r.gstPct ? money(r.gstPct, 0) + '%' : '-'}</td>
          <td class="num" data-label="GST Value">${r.gstValue ? money(r.gstValue, 0) : '-'}</td>
          <td class="num" data-label="Commission %">${r.commPct ? money(r.commPct, 0) + '%' : '-'}</td>
          <td class="num strong" style="color:var(--brand)" data-label="Commission Value (Dr.)">${r.commValue ? money(r.commValue) : '-'}</td>
          <td class="num" data-label="Received from Dealer (Cr.)">-</td>
          <td class="num strong" data-label="Running Balance">${money(r.balance)}</td>
          <td class="cell-actions"><div class="row-actions"><button class="icon-btn" data-edit="${esc(r.id)}" title="Open deal">${ICON.edit}</button></div></td>
        </tr>`).join('')}</tbody>
        <tfoot><tr>
          <td colspan="7" data-label="Total">Total (${deals} deal${deals === 1 ? '' : 's'})</td>
          <td class="num" data-label="Amount">${money(sum('amount'), 0)}</td>
          <td></td>
          <td class="num" data-label="GST Value">${money(sum('gstValue'), 0)}</td>
          <td></td>
          <td class="num" data-label="Commission Value (Dr.)">${money(sum('commValue'))}</td>
          <td class="num" data-label="Received from Dealer (Cr.)">${money(sum('received'))}</td>
          <td class="num" data-label="Running Balance">${money(closing)}</td>
          <td></td>
        </tr></tfoot>
      </table>
    </div>` : emptyState(
      'No deals from this dealer yet',
      'Pick this dealer on a sales voucher (with commission switched on) and the deal appears here.',
      ''
    );

  // Totals right above the columns; the page title in the top bar already names the dealer.
  $('#main').innerHTML = `
    <div class="card flexcard">
      <div class="sumstrip top">
        <span class="sum"><i>Deals</i><b>${deals}</b></span>
        <span class="sum"><i>Qty</i><b>${money0(sum('qty'))}</b></span>
        <span class="sum"><i>Amount</i><b>${money0(sum('amount'))}</b></span>
        <span class="sum"><i>GST value</i><b>${money0(sum('gstValue'))}</b></span>
        <span class="sum cr"><i>Commission</i><b>${money(sum('commValue'))}</b></span>
        <span class="sum dr"><i>Received</i><b>${money(sum('received'))}</b></span>
        <span class="sum rem"><i>Balance</i><b>${money(closing)}</b></span>
      </div>
      ${body}
      ${pagerHtml(slice)}
    </div>`;

  // Search lives in the top bar, behind the magnifier next to the download icons.
  const filters = $('#topbarFilters');
  if (filters) {
    filters.hidden = false;
    filters.classList.toggle('search-closed', !showSearch);
    filters.innerHTML = `
      <div class="search" id="topSearchWrap" ${showSearch ? '' : 'hidden'}>
        ${ICON.search}<input id="fQ" placeholder="Search anything — date, invoice, seller, buyer, item, amount..." value="${esc(state.filter.q)}">
      </div>
      <span class="count-chip" title="${rows.length} of ${ledger.length} lines">${rows.length}${rows.length === ledger.length ? '' : ' <small>/ ' + ledger.length + '</small>'} <small>lines</small></span>`;
    $('.topbar')?.classList.add('has-filters');
  }

  const searchWrap = $('#topSearchWrap');
  if (searchWrap && !searchWrap.hidden) setTimeout(() => { const i = $('#fQ'); if (i) i.focus(); }, 60);
  const qBox = $('#fQ');
  if (qBox) qBox.addEventListener('input', debounce((e) => { state.filter.q = e.target.value; state.page = 1; refocusSearch = true; render(); }, 220));
  wireSortHeaders($('#main'));
  wirePager($('#main'), slice);
  $$('[data-edit]', $('#main')).forEach(b => b.addEventListener('click', () => openEntry(b.dataset.edit)));
  if (refocusSearch) {
    refocusSearch = false;
    const i = $('#fQ');
    if (i) { i.focus(); try { i.setSelectionRange(i.value.length, i.value.length); } catch (e) { /* ignore */ } }
  }
}

// Everything on the page is searchable: dates, numbers as shown, names and narration.
function dealerRowMatches(r, q) {
  const hay = [
    r.date, fmtDate(r.date), r.no, r.seller, r.buyer, r.item, r.hsCode,
    r.qty, money0(r.qty), r.amount, money0(r.amount), r.gstPct, r.gstValue, money0(r.gstValue),
    r.commPct, r.commValue, money(r.commValue), r.received, money(r.received), r.balance, money(r.balance),
    r.kind === 'receipt' ? 'receipt received cr' : 'deal commission dr'
  ].join(' ').toLowerCase();
  return q.split(/\s+/).filter(Boolean).every(part => hay.includes(part));
}

/* ---------------------------------------------------------------- views: register */
// What the top-bar date chip says: the whole book, one day, or a range.
function dateRangeLabel() {
  const { from, to } = state.filter;
  if (from && to) return from === to ? fmtDate(from) : fmtDate(from) + ' \u2013 ' + fmtDate(to);
  if (from) return 'From ' + fmtDate(from);
  if (to) return 'Up to ' + fmtDate(to);
  return 'All dates';
}

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const isoOf = (d) => d.toLocaleDateString('en-CA');
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);

// The smart range calendar behind the top-bar date chip.
function openRangeDialog() {
  let from = state.filter.from || '';
  let to = state.filter.to || '';
  const start = from ? new Date(from + 'T00:00:00') : new Date();
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const firstOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);

  const modal = openModal(`
    <div class="modal-head">
      <div><h3>Choose a date range</h3>
        <div class="sub">Tap the first day, then the last day — or take all dates.</div></div>
      <button class="icon-btn x" data-close>✕</button>
    </div>
    <div class="modal-body cal-body" id="calBody"></div>
    <div class="modal-foot">
      <button class="btn left" id="calClear">All dates</button>
      <button class="btn" data-close>Cancel</button>
      <button class="btn primary" id="calApply">Apply range</button>
    </div>`, { wide: true });

  const monthHtml = (first) => {
    const y = first.getFullYear();
    const m = first.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const lead = new Date(y, m, 1).getDay();
    const todayIso = today();
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push('<span class="cal-day blank"></span>');
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = isoOf(new Date(y, m, d));
      const classes = ['cal-day'];
      if (iso === from || iso === to) classes.push('edge');
      else if (from && to && iso > from && iso < to) classes.push('in-range');
      else if (from && !to && iso === from) classes.push('edge');
      if (iso === todayIso) classes.push('today');
      cells.push(`<button type="button" class="${classes.join(' ')}" data-d="${iso}">${d}</button>`);
    }
    return `<div class="cal-month">
      <div class="cal-title">${MONTHS_LONG[m]} ${y}</div>
      <div class="cal-dow">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(x => `<span>${x}</span>`).join('')}</div>
      <div class="cal-grid">${cells.join('')}</div>
    </div>`;
  };

  const summary = () => {
    if (!from && !to) return 'All dates — every transaction in the register';
    if (from && !to) return 'From <b>' + fmtDate(from) + '</b> — pick the last day';
    return '<b>' + fmtDate(from) + '</b> to <b>' + fmtDate(to) + '</b>';
  };

  const paint = () => {
    const active = (k) => {
      const p = presetRange(k);
      return p.from === from && p.to === to ? ' on' : '';
    };
    $('#calBody', modal).innerHTML = `
      <div class="cal-presets">
        ${[['all', 'All dates'], ['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'Last 7 days'],
        ['month', 'This month'], ['last-month', 'Last month'], ['year', 'This year'], ['fy', 'Financial year']]
        .map(([k, label]) => `<button type="button" class="cal-preset${active(k)}" data-preset="${k}">${label}</button>`).join('')}
      </div>
      <div class="cal-nav">
        <button type="button" class="icon-btn" data-nav="-1" title="Previous month">‹</button>
        <div class="cal-months">${monthHtml(cursor)}${monthHtml(addMonths(cursor, 1))}</div>
        <button type="button" class="icon-btn" data-nav="1" title="Next month">›</button>
      </div>
      <div class="cal-summary">${summary()}</div>`;
  };

  const presetRange = (kind) => {
    const now = new Date();
    const first = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
    const last = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
    switch (kind) {
      case 'today': return { from: isoOf(now), to: isoOf(now) };
      case 'yesterday': { const y = new Date(now); y.setDate(y.getDate() - 1); return { from: isoOf(y), to: isoOf(y) }; }
      case 'week': { const w = new Date(now); w.setDate(w.getDate() - 6); return { from: isoOf(w), to: isoOf(now) }; }
      case 'month': return { from: isoOf(first(now)), to: isoOf(last(now)) };
      case 'last-month': { const p = addMonths(now, -1); return { from: isoOf(first(p)), to: isoOf(last(p)) }; }
      case 'year': return { from: isoOf(new Date(now.getFullYear(), 0, 1)), to: isoOf(new Date(now.getFullYear(), 11, 31)) };
      case 'fy': {
        const y = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
        return { from: isoOf(new Date(y, 6, 1)), to: isoOf(new Date(y + 1, 5, 30)) };
      }
      default: return { from: '', to: '' };
    }
  };

  $('#calBody', modal).addEventListener('click', (e) => {
    const day = e.target.closest('[data-d]');
    if (day) {
      const iso = day.dataset.d;
      if (!from || (from && to)) { from = iso; to = ''; }
      else if (iso < from) { from = iso; to = ''; }
      else { to = iso; }
      paint();
      return;
    }
    const nav = e.target.closest('[data-nav]');
    if (nav) { cursor = addMonths(cursor, Number(nav.dataset.nav)); paint(); return; }
    const preset = e.target.closest('[data-preset]');
    if (preset) {
      const r = presetRange(preset.dataset.preset);
      from = r.from; to = r.to;
      cursor = firstOfMonth(from ? new Date(from + 'T00:00:00') : new Date());
      paint();
    }
  });

  $$('[data-close]', modal).forEach(b => b.addEventListener('click', closeModal));
  $('#calClear', modal).addEventListener('click', () => {
    state.filter.from = '';
    state.filter.to = '';
    state.filter.year = '';
    state.page = 1;
    closeModal();
    render();
  });
  $('#calApply', modal).addEventListener('click', () => {
    state.filter.from = from;
    state.filter.to = to;
    state.filter.year = '';
    state.page = 1;
    closeModal();
    render();
  });

  paint();
}

function matchesFilter(row) {
  const f = state.filter;
  if (f.party && row.party !== f.party) return false;
  if (f.from && (row.date || '') < f.from) return false;
  if (f.to && (row.date || '') > f.to) return false;
  if (f.year && String(row.date || '').slice(0, 4) !== f.year) return false;
  if (f.q) {
    const hay = [row.party, row.counterparty, row.dealer, row.invNo, row.item, row.hsCode, row.narration].join(' ').toLowerCase();
    if (!hay.includes(f.q.toLowerCase())) return false;
  }
  return true;
}

function renderRegister() {
  const all = ledgerRows();
  const filtered = all.filter(matchesFilter);
  const sorted = sortList(filtered, SORT_GETTERS.register, state.sort);
  const slice = pageSlice(sorted);
  const partyList = parties().filter(p => p.data.role !== 'buyer');
  const sum = (k) => r2(filtered.reduce((a, r) => a + num(r[k]), 0));
  const tCommission = sum('commission');
  const tReceived = sum('received');

  const body = slice.rows.length ? `
    <div class="table-wrap">
      <table class="ledger rtable">
        <thead><tr>
          ${sortHeader('date', 'Date')}
          ${sortHeader('party', 'Seller / Party')}
          ${sortHeader('dealer', 'Dealer Name')}
          ${sortHeader('item', 'Item')}
          ${sortHeader('qty', 'Qty \u00d7 Rate', true)}
          ${sortHeader('amount', 'Amount', true)}
          ${sortHeader('gst', 'GST', true)}
          ${sortHeader('commission', 'Commission', true)}
          ${sortHeader('received', 'Received', true)}
          ${sortHeader('balance', 'Balance', true)}
          <th></th>
        </tr></thead>
        <tbody>
        ${slice.rows.map(r => `
          <tr>
            <td class="mono nowrap" data-label="Date">${esc(fmtDate(r.date))}</td>
            <td class="wrap" data-label="Party">
              <div class="cell-val">
                <div class="strong">${esc(r.party || '-')}</div>
                <div class="muted sub">${r.counterparty ? '&#8594; ' + esc(r.counterparty) : ''}${r.counterparty && (r.invNo || r.narration) ? ' &middot; ' : ''}${r.invNo ? esc(r.invNo) : ''}${r.invNo && r.narration ? ' &middot; ' : ''}${r.narration ? esc(r.narration) : ''}</div>
              </div>
            </td>
            <td class="wrap" data-label="Dealer Name"><div class="cell-val"><span class="pill both" style="font-size:11.5px;white-space:nowrap">${esc(r.dealer || '-')}</span></div></td>
            <td class="wrap" data-label="Item">
              <div class="cell-val">
                <div>${esc(r.item || '-')}</div>
                ${r.hsCode ? `<div class="muted sub">HS ${esc(r.hsCode)}</div>` : ''}
              </div>
            </td>
            <td class="num sub-cell col-opt" data-label="Qty / Rate"><div class="cell-val">${r.qty ? `<div>${money(r.qty, 0)}</div><div class="muted sub">@ ${money(r.rate, 0)}</div>` : '-'}</div></td>
            <td class="num col-opt" data-label="Amount">${r.amount ? money(r.amount, 0) : '-'}</td>
            <td class="num sub-cell" data-label="GST"><div class="cell-val">${r.gstValue ? `<div>${money(r.gstValue, 0)}</div><div class="muted sub">${money(r.gstPct, 0)}%</div>` : '-'}</div></td>
            <td class="num sub-cell" style="color:var(--brand)" data-label="Commission"><div class="cell-val"><div class="strong">${r.commission ? money(r.commission) : '-'}</div>${r.commPct ? `<div class="muted sub">${money(r.commPct, 0)}% of GST</div>` : ''}</div></td>
            <td class="num" style="color:var(--amber)" data-label="Received">${r.received ? money(r.received) : '-'}</td>
            <td class="num strong" data-label="Balance">${money(r.balance)}</td>
            <td class="cell-actions">
              <div class="row-actions">
                <button class="icon-btn" data-edit="${esc(r.id)}" title="Edit">${ICON.edit}</button>
                <button class="icon-btn del" data-del="${esc(r.id)}" title="Delete">${ICON.del}</button>
              </div>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : emptyState(
      'No entries yet',
      'Record deals from Quick Vouchers (Sales) and money received from Quick Vouchers (Receipt) - they appear here automatically.',
      ''
    );

  $('#main').innerHTML = `
    <div class="card flexcard">
      ${body}
      <div class="sumstrip">
        <span class="sum"><i>Transactions</i><b>${filtered.length}</b></span>
        <span class="sum"><i>Qty</i><b>${money0(sum('qty'))}</b></span>
        <span class="sum"><i>Amount</i><b>${money0(sum('amount'))}</b></span>
        <span class="sum"><i>GST value</i><b>${money0(sum('gstValue'))}</b></span>
        <span class="sum cr"><i>Commission</i><b>${money(tCommission)}</b></span>
        <span class="sum dr"><i>Received</i><b>${money(tReceived)}</b></span>
        <span class="sum rem"><i>Remaining</i><b>${money(r2(tCommission - tReceived))}</b></span>
      </div>
      ${pagerHtml(slice)}
    </div>`;

  // The register's search and filters live in the top bar, so the list gets the whole
  // window.
  const filters = $('#topbarFilters');
  if (filters) {
    filters.hidden = false;
    filters.innerHTML = `
      <div class="search" id="topSearchWrap" data-permanent="1">${ICON.search}<input id="fQ" placeholder="Search party, dealer, invoice, item..." value="${esc(state.filter.q)}"></div>
      <select id="fParty" title="Filter by seller">
        <option value="">All companies</option>
        ${partyList.map(p => `<option value="${esc(p.data.name)}" ${state.filter.party === p.data.name ? 'selected' : ''}>${esc(p.data.name)}</option>`).join('')}
      </select>
      <button class="range-chip" id="fRange" title="Choose a date range">
        ${ICON.calendar}<span>${esc(dateRangeLabel())}</span>
      </button>
      <span class="count-chip" title="${filtered.length === all.length ? 'Every transaction' : filtered.length + ' of ' + all.length + ' transactions'}">
        ${filtered.length}${filtered.length === all.length ? '' : ' <small>/ ' + all.length + '</small>'} <small>txns</small>
      </span>`;
    $('.topbar')?.classList.add('has-filters');
  }

  $('#fQ').addEventListener('input', debounce((e) => { state.filter.q = e.target.value; state.page = 1; refocusSearch = true; render(); }, 220));
  $('#fParty').addEventListener('change', (e) => { state.filter.party = e.target.value; state.page = 1; render(); });
  const rangeBtn = $('#fRange');
  if (rangeBtn) rangeBtn.addEventListener('click', () => openRangeDialog());
  wireSortHeaders($('#main'));
  wirePager($('#main'), slice);
  $$('[data-edit]').forEach(b => b.addEventListener('click', () => openEntry(b.dataset.edit)));
  $$('[data-del]').forEach(b => b.addEventListener('click', () => askDelete(b.dataset.del)));
  // Re-rendering rebuilds the top-bar search box, so put the caret back where it was.
  if (refocusSearch) {
    refocusSearch = false;
    const q = $('#fQ');
    if (q) { q.focus(); try { q.setSelectionRange(q.value.length, q.value.length); } catch (e) { /* ignore */ } }
  }
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
  },
  dealer: {
    title: 'Dealer Names', sub: 'Third-party dealers who bring the customers — money is received from them.',
    addLabel: 'Add dealer',
    columns: [
      { k: 'name', t: 'Dealer', cell: (d) => `<div class="strong">${esc(d.name || '—')}</div>${d.company ? `<div class="muted" style="font-size:11.5px">${esc(d.company)}</div>` : ''}` },
      { k: 'phone', t: 'Contact', cell: (d) => `<span class="muted">${esc(d.phone || d.email || '—')}</span>` },
      { k: 'commissionPct', t: 'Commission %', num: true, cell: (d) => num(d.commissionPct) ? money(d.commissionPct, 0) + '% of GST' : '—' },
      { k: 'notes', t: 'Notes', cell: (d) => `<span class="muted">${esc(d.notes || '—')}</span>` }
    ]
  }
};

function renderMaster(type) {
  const cfg = MASTERS[type];
  if (!cfg) return renderRegister();
  const base = records('master', type);
  const q = state.filter.q.toLowerCase();
  const filtered = q ? base.filter(r => JSON.stringify(r.data).toLowerCase().includes(q)) : base;
  const sorted = sortList(filtered, { name: r => r.data.name || '', rate: r => num(r.data.commissionPct || r.data.rate || r.data.pct) }, state.sort);
  const slice = pageSlice(sorted);

  const body = slice.rows.length ? `
    <div class="table-wrap">
      <table class="rtable">
        <thead><tr>
          <th class="sortable${state.sort.key === 'name' ? ' on' : ''}" data-sort="name" title="Sort by name">${esc(cfg.columns[0].t)}<span class="arrow">${state.sort.key === 'name' ? (state.sort.dir === 'asc' ? '\u25B2' : '\u25BC') : '\u2195'}</span></th>
          ${cfg.columns.slice(1).map(c => `<th class="${c.num ? 'num' : ''}">${esc(c.t)}</th>`).join('')}<th></th></tr></thead>
        <tbody>
        ${slice.rows.map(r => `<tr>
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
    <div class="card flexcard">
      <div class="toolbar">
        <div class="search">${ICON.search}<input id="fQ" placeholder="Search..." value="${esc(state.filter.q)}"></div>
        <span class="muted" style="font-size:12.5px;margin-left:auto">${filtered.length} of ${base.length}</span>
      </div>
      ${body}
      ${pagerHtml(slice)}
    </div>`;

  $('#fQ').addEventListener('input', debounce(e => { state.filter.q = e.target.value; state.page = 1; render(); }, 200));
  $('[data-add]').addEventListener('click', () => masterModal(type));
  wireSortHeaders($('#main'));
  wirePager($('#main'), slice);
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
  } else if (type === 'dealer') {
    fields = `
      ${field('mName', 'Dealer name <span class="req">*</span>', `<input id="mName" value="${esc(d.name || '')}" placeholder="e.g. Bilal Traders" autofocus>`)}
      <div class="grid-2">
        ${field('mCompany', 'Firm / company', `<input id="mCompany" value="${esc(d.company || '')}" placeholder="Optional">`)}
        ${field('mPhone', 'Phone', `<input id="mPhone" value="${esc(d.phone || '')}" placeholder="03xx…">`)}
      </div>
      <div class="grid-2">
        ${field('mComm', 'Commission % of GST', `<input id="mComm" type="number" step="0.01" min="0" max="100" value="${num(d.commissionPct, 20)}">`, 'Applied automatically on new entries for this dealer.')}
        ${field('mActive', 'Status', `<select id="mActive">
          <option value="1" ${d.active === false ? '' : 'selected'}>Active</option>
          <option value="0" ${d.active === false ? 'selected' : ''}>Inactive</option>
        </select>`)}
      </div>
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
    } else if (type === 'dealer') {
      if (!val('mName')) return toast('Dealer name is required', 'err');
      Object.assign(data, {
        name: val('mName'), company: val('mCompany'), phone: val('mPhone'),
        commissionPct: num(val('mComm')), active: val('mActive') !== '0', notes: val('mNotes')
      });
    }
    await saveRecord('master', type, data, rec);
    closeModal();
    toast(rec ? 'Updated' : 'Added');
    render();
  });
}

/* ---------------------------------------------------------------- vouchers */
const VOUCHER_META = {
  payment: { title: 'Payment Vouchers', sub: 'Money you pay out to a dealer — expenses, deductions, industry payments.', code: 'PV', tone: 'payment' },
  receipt: { title: 'Receipt Vouchers', sub: 'Commission received from dealers — never straight from a buyer or seller.', code: 'RV', tone: 'receipt' },
  journal: { title: 'Journal Vouchers', sub: 'Adjustments between two accounts.', code: 'JV', tone: 'journal' },
  purchase: { title: 'Purchase Vouchers', sub: 'Material bought from a seller — with GST on every line.', code: 'PU', tone: 'purchase' },
  sales: { title: 'Sales Vouchers', sub: 'The commission voucher — seller, buyer, dealer and the GST your brokerage is earned on.', code: 'SL', tone: 'sales' }
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
  let base = vouchers(type);
  if (q) base = base.filter(v => JSON.stringify(v.data).toLowerCase().includes(q));
  const sorted = sortList(base, SORT_GETTERS.voucher, state.sort);
  const slice = pageSlice(sorted);
  const list = slice.rows;
  const amountOf = (v) => (typeof v.data.grandTotal === 'number' ? v.data.grandTotal : num(v.data.amount));
  const total = sorted.reduce((a, v) => a + amountOf(v), 0);
  const sortTh = (key, label, numeric) => sortHeader(key, label, numeric);

  const tableFor = () => {
    if (type === 'journal') {
      return `<table class="rtable">
        <thead><tr>${sortTh('date', 'Date')}${sortTh('no', 'Voucher')}<th>Debit account</th><th>Credit account</th>${sortTh('amount', 'Amount', true)}<th>Narration</th><th></th></tr></thead>
        <tbody>${list.map(v => `<tr>
          <td class="mono" data-label="Date">${esc(fmtDate(v.data.date))}</td>
          <td class="mono strong" data-label="Voucher">${esc(v.data.no || '-')}</td>
          <td data-label="Debit">${esc(v.data.debitAccount || '-')}</td>
          <td data-label="Credit">${esc(v.data.creditAccount || '-')}</td>
          <td class="num strong" data-label="Amount">${money(v.data.amount)}</td>
          <td class="wrap muted" data-label="Narration">${esc(v.data.narration || '')}</td>
          <td class="cell-actions"><div class="row-actions"><button class="icon-btn" data-edit="${esc(v.id)}">${ICON.edit}</button><button class="icon-btn del" data-del="${esc(v.id)}">${ICON.del}</button></div></td>
        </tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="4" data-label="Total">Total (${sorted.length})</td><td class="num" data-label="Amount">${money(total)}</td><td colspan="2"></td></tr></tfoot>
      </table>`;
    }
    if (type === 'purchase' || type === 'sales') {
      return `<table class="rtable">
        <thead><tr>${sortTh('date', 'Date')}${sortTh('no', 'Voucher')}${sortTh('party', 'Seller')}<th>Buyer</th><th>Dealer</th><th>Items</th>
          ${sortTh('gst', 'Sub total', true)}${sortTh('gst', 'GST', true)}${sortTh('total', 'Total', true)}<th></th></tr></thead>
        <tbody>${list.map(v => `<tr>
          <td class="mono" data-label="Date">${esc(fmtDate(v.data.date))}</td>
          <td class="mono strong" data-label="Voucher">${esc(v.data.no || '-')}</td>
          <td class="wrap" data-label="Seller"><div class="strong">${esc(voucherSeller(v.data, type) || '-')}</div>${v.data.narration ? `<div class="muted sub">${esc(v.data.narration)}</div>` : ''}</td>
          <td class="wrap" data-label="Buyer">${esc(voucherBuyer(v.data, type) || '-')}</td>
          <td class="wrap" data-label="Dealer">${esc(v.data.dealer || '-')}</td>
          <td class="wrap" data-label="Items">${(v.data.lines || []).map(l => `${esc(l.item || '-')} <span class="muted">x ${money(l.qty, 0)}</span>`).join('<br>') || '-'}</td>
          <td class="num" data-label="Sub total">${money(v.data.subTotal)}</td>
          <td class="num" data-label="GST">${money(v.data.taxTotal)}</td>
          <td class="num strong" data-label="Total">${money(v.data.grandTotal)}</td>
          <td class="cell-actions"><div class="row-actions"><button class="icon-btn" data-edit="${esc(v.id)}">${ICON.edit}</button><button class="icon-btn del" data-del="${esc(v.id)}">${ICON.del}</button></div></td>
        </tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="6" data-label="Total">Total (${sorted.length})</td>
          <td class="num" data-label="Sub total">${money(sorted.reduce((a, v) => a + num(v.data.subTotal), 0))}</td>
          <td class="num" data-label="GST">${money(sorted.reduce((a, v) => a + num(v.data.taxTotal), 0))}</td>
          <td class="num" data-label="Total">${money(sorted.reduce((a, v) => a + num(v.data.grandTotal), 0))}</td><td></td></tr></tfoot>
      </table>`;
    }
    return `<table class="rtable">
      <thead><tr>${sortTh('date', 'Date')}${sortTh('no', 'Voucher')}${sortTh('party', 'Dealer')}<th>${type === 'receipt' ? 'Received in' : 'Paid from'}</th>${sortTh('amount', 'Amount', true)}<th>Narration</th><th></th></tr></thead>
      <tbody>${list.map(v => `<tr>
        <td class="mono" data-label="Date">${esc(fmtDate(v.data.date))}</td>
        <td class="mono strong" data-label="Voucher">${esc(v.data.no || '-')}</td>
        <td class="wrap strong" data-label="Dealer">${esc(v.data.party || '-')}</td>
        <td class="wrap" data-label="${type === 'receipt' ? 'Received in' : 'Paid from'}">${esc(v.data.account || '-')}</td>
        <td class="num strong" style="color:${type === 'receipt' ? 'var(--brand)' : 'var(--amber)'}" data-label="Amount">${money(v.data.amount)}</td>
        <td class="wrap muted" data-label="Narration">${esc(v.data.narration || '')}</td>
        <td class="cell-actions"><div class="row-actions"><button class="icon-btn" data-edit="${esc(v.id)}">${ICON.edit}</button><button class="icon-btn del" data-del="${esc(v.id)}">${ICON.del}</button></div></td>
      </tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="4" data-label="Total">Total (${sorted.length})</td><td class="num" data-label="Amount">${money(total)}</td><td colspan="2"></td></tr></tfoot>
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
        <div class="label">Total ${esc(type)}</div><div class="value">${money0(total)}</div><div class="sub">${sorted.length} vouchers</div>
      </div>
      <div class="kpi"><div class="label">This month</div>
        <div class="value">${money0(sorted.filter(v => monthKey(v.data.date) === monthKey(today())).reduce((a, v) => a + (v.data.grandTotal || v.data.amount || 0), 0))}</div>
        <div class="sub">${MONTHS[new Date().getMonth()]} ${new Date().getFullYear()}</div></div>
      <div class="kpi"><div class="label">Latest voucher</div>
        <div class="value" style="font-size:17px">${esc(sorted[0] ? fmtDate(sorted[0].data.date) : '-')}</div>
        <div class="sub">${esc(sorted[0] ? (sorted[0].data.no || sorted[0].data.party || 'recorded') : 'none yet')}</div></div>
    </div>
    <div class="card flexcard">
      <div class="toolbar">
        <div class="search">${ICON.search}<input id="fQ" placeholder="Search party, voucher no, narration..." value="${esc(state.filter.q)}"></div>
        <span class="muted" style="font-size:12.5px;margin-left:auto">${sorted.length} voucher${sorted.length === 1 ? '' : 's'}</span>
      </div>
      <div class="table-wrap">${list.length ? tableFor() : emptyState('No ' + type + ' vouchers yet', meta.sub, '<button class="btn primary" data-new="1">Create the first one</button>')}</div>
      ${pagerHtml(slice)}
    </div>`;

  $('#fQ').addEventListener('input', debounce(e => { state.filter.q = e.target.value; state.page = 1; render(); }, 200));
  $$('[data-new]').forEach(b => b.addEventListener('click', () => voucherModal(type)));
  wireSortHeaders($('#main'));
  wirePager($('#main'), slice);
  $$('[data-edit]').forEach(b => b.addEventListener('click', () => voucherModal(type, byId(b.dataset.edit))));
  $$('[data-del]').forEach(b => b.addEventListener('click', () => askDelete(b.dataset.del)));
  const pr = $('[data-act="print"]'); if (pr) pr.addEventListener('click', () => window.print());
}

/* A seller/buyer picker: a real drop-down of the master names, plus
   "Add a new name..." for a company that is not in the master yet. */
function partyPicker(id, label, value, names, required) {
  const known = names.includes(value);
  const opts = names.map(n => `<option value="${esc(n)}"${n === value ? ' selected' : ''}>${esc(n)}</option>`).join('');
  const extra = value && !known ? `<option value="${esc(value)}" selected>${esc(value)}</option>` : '';
  return `<div class="field">
    <label for="${id}">${label}${required ? ' <span class="req">*</span>' : ''}</label>
    <div class="combo">
      <select id="${id}">
        <option value="">— choose ${label.toLowerCase()} —</option>
        ${opts}${extra}
        <option value="__other__">＋ Add a new name…</option>
      </select>
      <input id="${id}New" data-combo-new hidden placeholder="Type the ${label.toLowerCase()} name" autocomplete="off">
    </div>
  </div>`;
}

function wirePartyPickers(root, ids) {
  ids.forEach(id => {
    const sel = $('#' + id, root);
    const inp = $('#' + id + 'New', root);
    if (!sel || !inp) return;
    sel.addEventListener('change', () => {
      const other = sel.value === '__other__';
      inp.hidden = !other;
      if (other) { inp.value = ''; inp.focus(); } else { inp.value = ''; }
    });
  });
}

function pickerValue(root, id) {
  const sel = $('#' + id, root);
  if (!sel) return '';
  if (sel.value === '__other__') {
    const inp = $('#' + id + 'New', root);
    return inp ? inp.value.trim() : '';
  }
  return sel.value.trim();
}

function voucherModal(type, rec) {
  const meta = VOUCHER_META[type];
  const isGoods = type === 'purchase' || type === 'sales';
  // Money only moves through dealers: receipt and payment vouchers are dealer-only.
  const isMoney = type === 'receipt' || type === 'payment';
  const d = rec ? rec.data : {
    date: today(), no: nextVoucherNo(type), party: '', account: banks()[0]?.data.name || 'Bank Account',
    amount: 0, narration: '', debitAccount: '', creditAccount: '',
    seller: '', buyer: '', dealer: '',
    lines: [{ item: '', hsCode: '', qty: 0, rate: 0, amount: 0, taxPct: 18, taxAmt: 0, total: 0 }],
    subTotal: 0, taxTotal: 0, grandTotal: 0,
    // A sales voucher is the commission voucher, so brokerage starts switched on.
    comm: { enabled: type === 'sales', pct: 20, value: 0 }
  };
  const accountOpts = banks().map(b => b.data.name);
  const partyOpts = isMoney ? dealerNames() : parties().map(p => p.data.name);
  // Goods vouchers name both sides of the deal: a seller always, a buyer on sales.
  const sellerValue = isGoods ? (d.seller || (type === 'purchase' ? d.party : '')) : '';
  const buyerValue = isGoods ? (d.buyer || (type === 'sales' ? d.party : '')) : '';
  const dealerValue = d.dealer || '';

  const head = `
    <div class="grid-${isMoney ? '2' : isGoods ? '2' : '3'}">
      <div class="field"><label for="vDate">Date</label><input id="vDate" type="date" value="${esc(d.date || today())}"></div>
      <div class="field"><label for="vNo">Voucher no.</label><input id="vNo" value="${esc(d.no || '')}"></div>
      ${isGoods ? '' : `<div class="field"><label for="vParty">${isMoney ? 'Dealer' : 'Party'}${type === 'journal' ? ' (optional)' : ' <span class="req">*</span>'}</label>
        <input id="vParty" list="dlVP" value="${esc(d.party || '')}" autocomplete="off" placeholder="${isMoney ? 'Dealer name' : 'Company name'}">
        <datalist id="dlVP">${partyOpts.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
      </div>`}
    </div>
    ${isGoods ? `<div class="grid-3">
      ${partyPicker('vSeller', 'Seller', sellerValue, sellerNames(), true)}
      ${partyPicker('vBuyer', 'Buyer', buyerValue, buyerNames(), type === 'sales')}
      ${partyPicker('vDealer', 'Dealer', dealerValue, dealerNames(), type === 'sales')}
    </div>` : ''}`;

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
    wirePartyPickers(modal, ['vSeller', 'vBuyer', 'vDealer']);
    get('vAddLine').addEventListener('click', () => {
      lines.push({ item: '', hsCode: '', qty: 0, rate: 0, amount: 0, taxPct: 18, taxAmt: 0, total: 0 });
      redrawLines();
    });
    get('vCommOn').addEventListener('change', (e) => {
      get('vCommPct').disabled = !e.target.checked;
      calcLines();
    });
    get('vCommPct').addEventListener('input', calcLines);
    // The commission % follows the seller — that is whose GST you are sharing.
    const applySellerPct = () => {
      const name = pickerValue(modal, 'vSeller').trim();
      if (name && !rec) get('vCommPct').value = commissionPctFor(name);
      calcLines();
    };
    get('vSeller').addEventListener('change', applySellerPct);
    get('vSellerNew').addEventListener('input', applySellerPct);
  }

  $('#vSave', modal).addEventListener('click', async () => {
    const date = get('vDate').value || today();
    const no = get('vNo').value.trim() || nextVoucherNo(type);
    const narration = get('vNarr').value.trim();
    const isGoodsType = type === 'purchase' || type === 'sales';
    const party = isGoodsType ? '' : get('vParty').value.trim();

    let data;
    if (type === 'payment' || type === 'receipt') {
      const amount = num(get('vAmount').value);
      if (!amount) { toast('Amount is required', 'err'); return; }
      if (!party) { toast('Dealer is required', 'err'); return; }
      data = { date, no, party, account: get('vAccount').value, amount, narration, head: get('vHead') ? get('vHead').value : '', partyType: 'dealer' };
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
      const seller = pickerValue(modal, 'vSeller').trim();
      const buyer = pickerValue(modal, 'vBuyer').trim();
      const dealer = pickerValue(modal, 'vDealer').trim();
      if (!seller) { toast('Seller is required', 'err'); return; }
      if (type === 'sales' && !buyer) { toast('Buyer is required', 'err'); return; }
      if (type === 'sales' && !dealer) { toast('Dealer is required', 'err'); return; }
      const subTotal = r2(clean.reduce((a, l) => a + l.amount, 0));
      const taxTotal = r2(clean.reduce((a, l) => a + l.taxAmt, 0));
      const grandTotal = r2(subTotal + taxTotal);
      const commOn = get('vCommOn').checked;
      const commPct = num(get('vCommPct').value);
      data = {
        date, no, narration,
        seller, buyer, dealer,
        // `party` keeps its old meaning: the seller on a purchase, the buyer on a sale.
        party: type === 'purchase' ? seller : buyer,
        lines: clean, subTotal, taxTotal, grandTotal,
        comm: { enabled: commOn, pct: commPct, value: commOn ? r2(taxTotal * commPct / 100) : 0 }
      };
    }

    await saveRecord('voucher', type, data, rec);
    // A sales voucher with brokerage on IS the commission entry, so the registers read
    // it directly — there is no second record to create or clean up.
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
  if (rec.kind === 'voucher') return voucherModal(rec.type, rec);
  if (rec.kind === 'master') return masterModal(rec.type, rec);
}

/* ---------------------------------------------------------------- export (top bar) */
// Builds { title, columns, rows, filename } for whatever list is on screen.
function exportDocument() {
  const [kind, sub] = String(state.view).split(':');
  const stamp = today();

  if (state.view === 'register') {
    const rows = sortList(ledgerRows().filter(matchesFilter), SORT_GETTERS.register, state.sort);
    return {
      filename: 'commission-transactions-' + stamp,
      title: 'All Commission Transactions Register',
      subtitle: COMPANY + ' - ' + rows.length + ' rows - ' + reportLabel(),
      sheetName: 'Commission Register',
      columns: [
        { label: 'Date' }, { label: 'Seller / Party' }, { label: 'Buyer' }, { label: 'Dealer' }, { label: 'Invoice' },
        { label: 'Item' }, { label: 'HS' }, { label: 'Qty', num: true }, { label: 'Rate', num: true },
        { label: 'Amount', num: true }, { label: 'GST %', num: true }, { label: 'GST', num: true },
        { label: 'Comm %', num: true }, { label: 'Commission', num: true },
        { label: 'Received', num: true }, { label: 'Balance', num: true }, { label: 'Narration' }
      ],
      rows: rows.map(r => [r.date, r.party, r.counterparty, r.dealer, r.invNo, r.item, r.hsCode,
        r.qty, r.rate, r.amount, r.gstPct, r.gstValue, r.commPct, r.commission, r.received, r.balance, r.narration])
    };
  }

  if (kind === 'voucher') {
    const meta = VOUCHER_META[sub] || {};
    let base = vouchers(sub);
    if (state.filter.q) base = base.filter(v => JSON.stringify(v.data).toLowerCase().includes(state.filter.q.toLowerCase()));
    const rows = sortList(base, SORT_GETTERS.voucher, state.sort);
    if (sub === 'purchase' || sub === 'sales') {
      return {
        filename: sub + '-register-' + stamp,
        title: meta.title || sub, subtitle: rows.length + ' vouchers', sheetName: meta.title,
        columns: [
          { label: 'Date' }, { label: 'Voucher' }, { label: 'Seller' }, { label: 'Buyer' }, { label: 'Dealer' }, { label: 'Items' },
          { label: 'Qty', num: true }, { label: 'Sub total', num: true },
          { label: 'GST', num: true }, { label: 'Total', num: true }, { label: 'Brokerage', num: true },
          { label: 'Narration' }
        ],
        rows: rows.map(v => {
          const d = v.data;
          return [d.date, d.no, voucherSeller(d, sub), voucherBuyer(d, sub), d.dealer || '',
            (d.lines || []).map(l => `${l.item || ''} ${l.qty || ''} x ${l.rate || ''}`).join(' | '),
            (d.lines || []).reduce((s, l) => s + num(l.qty), 0),
            num(d.subTotal), num(d.taxTotal), num(d.grandTotal), num((d.comm || {}).value), d.narration || ''];
        })
      };
    }
    return {
      filename: sub + '-vouchers-' + stamp,
      title: meta.title || sub, subtitle: rows.length + ' vouchers', sheetName: meta.title,
      columns: [{ label: 'Date' }, { label: 'Voucher' }, { label: 'Party' }, { label: 'Account' },
        { label: 'Amount', num: true }, { label: 'Narration' }],
      rows: rows.map(v => [v.data.date, v.data.no, v.data.party,
        v.data.account || [v.data.debitAccount, v.data.creditAccount].filter(Boolean).join(' -> '),
        num(v.data.amount), v.data.narration || ''])
    };
  }

  if (kind === 'master') {
    const cfg = MASTERS[sub];
    if (!cfg) return null;
    const base = records('master', sub);
    const rows = sortList(base, { name: r => r.data.name || '' }, state.sort);
    const cols = ['name', 'role', 'commissionPct', 'hsCode', 'gstPct', 'unit', 'rate', 'accountNo', 'kind', 'phone', 'notes'];
    const used = cols.filter(k => rows.some(r => r.data[k] !== undefined));
    return {
      filename: 'master-' + sub + '-' + stamp,
      title: cfg.title, subtitle: rows.length + ' entries', sheetName: cfg.title,
      columns: used.map(k => ({ label: k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()), num: ['commissionPct', 'gstPct', 'rate'].includes(k) })),
      rows: rows.map(r => used.map(k => r.data[k] === undefined ? '' : r.data[k]))
    };
  }

  if (kind === 'dealer') {
    const name = safeDecode(sub);
    const rows = dealerLedger(name);
    return {
      filename: 'dealer-' + name.replace(/[^\w]+/g, '-').toLowerCase() + '-' + stamp,
      title: 'Dealer Register — ' + name, subtitle: rows.length + ' entries', sheetName: 'Dealer ' + name.slice(0, 20),
      columns: [
        { label: 'Inv Date' }, { label: 'Inv No.' }, { label: 'Seller Name' }, { label: 'Buyer' },
        { label: 'Item' }, { label: 'HS Code' }, { label: 'Qty', num: true }, { label: 'Rate', num: true },
        { label: 'Amount', num: true }, { label: 'GST %', num: true }, { label: 'GST Value', num: true },
        { label: 'Comm %', num: true }, { label: 'Commission (Dr.)', num: true },
        { label: 'Com Recv (Cr.)', num: true }, { label: 'Running Balance', num: true }
      ],
      rows: rows.map(r => [r.date, r.no, r.seller, r.buyer, r.item, r.hsCode,
        r.qty, r.rate, r.amount, r.gstPct, r.gstValue, r.commPct, r.commValue, r.received, r.balance])
    };
  }

  if (state.view === 'dealers') {
    const getters = {
      name: r => r.name, deals: r => r.deals, commission: r => r.commission,
      received: r => r.received, balance: r => r.balance
    };
    const rows = sortList(dealerSummaries(), getters, state.sort);
    return {
      filename: 'dealers-register-' + stamp,
      title: 'Dealers Register', subtitle: rows.length + ' dealers', sheetName: 'Dealers',
      columns: [
        { label: 'Dealer' }, { label: 'Deals', num: true }, { label: 'Commission', num: true },
        { label: 'Received', num: true }, { label: 'Balance', num: true }
      ],
      rows: rows.map(r => [r.name, r.deals, r.commission, r.received, r.balance])
    };
  }

  if (state.view === 'sellers' || state.view === 'buyers') {
    const side = state.view === 'sellers' ? 'seller' : 'buyer';
    const cfg = PARTY_REG[side];
    const getters = {
      name: r => r.name, deals: r => r.deals, others: r => r.others.size,
      amount: r => r.amount, gst: r => r.gst, commission: r => r.commission,
      received: r => r.received, balance: r => r.balance
    };
    const rows = sortList(partyRegisterRows(side), getters, state.sort);
    const moneyCols = side === 'seller'
      ? [{ label: 'Received', num: true }, { label: 'Balance', num: true }]
      : [];
    return {
      filename: side + '-register-' + stamp,
      title: cfg.head + ' Register', subtitle: rows.length + ' ' + side + 's', sheetName: cfg.head + ' Register',
      columns: [
        { label: cfg.head }, { label: 'Deals', num: true }, { label: cfg.otherHead },
        { label: 'Amount', num: true }, { label: 'GST', num: true }, { label: 'Commission', num: true },
        ...moneyCols
      ],
      rows: rows.map(r => {
        const base = [r.name, r.deals, [...r.others.keys()].join(', '), r.amount, r.gst, r.commission];
        return side === 'seller' ? base.concat([r.received, r.balance]) : base;
      })
    };
  }

  if (state.view === 'purchases' || state.view === 'sales') {
    const type = state.view === 'sales' ? 'sales' : 'purchase';
    const meta = GOODS_META[type];
    let base = vouchers(type).filter(v => inReportRange(v.data.date));
    if (state.filter.q) base = base.filter(v => JSON.stringify(v.data).toLowerCase().includes(state.filter.q.toLowerCase()));
    const rows = sortList(base, SORT_GETTERS.voucher, state.sort);
    return {
      filename: type + '-register-' + (state.report.from || 'all'),
      title: meta.title, subtitle: rows.length + ' vouchers - ' + reportLabel(), sheetName: meta.title,
      columns: [{ label: 'Date' }, { label: 'Voucher' }, { label: 'Seller' }, { label: 'Buyer' }, { label: 'Dealer' }, { label: 'Items' },
        { label: 'Qty', num: true }, { label: 'Sub total', num: true }, { label: 'GST', num: true },
        { label: 'Total', num: true }, { label: 'Brokerage', num: true }, { label: 'Narration' }],
      rows: rows.map(v => {
        const d = v.data;
        return [d.date, d.no, voucherSeller(d, type), voucherBuyer(d, type), d.dealer || '',
          (d.lines || []).map(l => `${l.item || ''} ${l.qty || ''} x ${l.rate || ''}`).join(' | '),
          (d.lines || []).reduce((s, l) => s + num(l.qty), 0),
          num(d.subTotal), num(d.taxTotal), num(d.grandTotal), num((d.comm || {}).value), d.narration || ''];
      })
    };
  }

  return null;
}

function exportCurrent(format) {
  const doc = exportDocument();
  if (!doc || !doc.rows.length) return toast('Nothing to export on this screen', 'err');
  const stamp = today();
  try {
    if (format === 'xls') {
      downloadFile(doc.filename + '.xls', buildExcel(doc), 'application/vnd.ms-excel');
      toast('Excel file downloaded');
    } else {
      const footer = COMPANY + '  |  ' + (state.user && state.user.name ? state.user.name : '');
      downloadFile(doc.filename + '.pdf', buildPdf({ ...doc, footer }), 'application/pdf');
      toast('PDF downloaded');
    }
  } catch (e) {
    toast('Export failed: ' + (e.message || e), 'err');
  }
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
  const changedView = String(state.view).split(':')[0] !== String(view).split(':')[0];
  state.view = view;
  state.filter.q = '';
  state.page = 1;
  if (changedView) {
    if (view === 'sellers' || view === 'buyers') state.sort = { key: 'commission', dir: 'desc' };
    else if (view === 'dealers') state.sort = { key: 'balance', dir: 'desc' };
    else if (view === 'sales' || view === 'purchases' || view === 'register') state.sort = { key: 'date', dir: 'desc' };
    else state.sort = { key: 'date', dir: 'asc' };
  }
  closeDrawer();
  render();
}

const VIEW_TITLES = {
  register: ['All Commission Transactions Register', COMPANY],
  purchases: ['Purchase Register', 'Every purchase, with GST'],
  sales: ['Sales Register', 'Every sale, with GST'],
  sellers: ['Seller Register', 'Seller-wise sales, GST and commission'],
  buyers: ['Buyer Register', 'Buyer-wise purchases, GST and commission'],
  dealers: ['Dealers Register', 'Dealer-wise deals, commission and receipts'],
  dashboard: ['Register Dashboard', 'Coming soon'],
  settings: ['Settings & Sync', 'Account, devices and backups']
};

function render() {
  const [kind, sub] = String(state.view).split(':');
  let menuKey = kind === 'master' ? 'master:' + sub : kind === 'voucher' ? 'voucher:' + sub : kind;
  if (kind === 'dealer') menuKey = 'dealers';
  $$('.menu-item[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === menuKey));

  const dealName = kind === 'dealer' ? safeDecode(sub) : '';
  const titles = VIEW_TITLES[state.view] || (kind === 'master'
    ? [MASTERS[sub]?.title || 'Manage Master', 'Add, edit and remove master names']
    : kind === 'voucher'
      ? [VOUCHER_META[sub]?.title || 'Vouchers', VOUCHER_META[sub]?.sub || '']
      : kind === 'dealer'
        ? [dealName || 'Dealer', 'Dealer ledger — deals, commission and receipts']
        : VIEW_TITLES.register);
  $('#pageTitle').textContent = titles[0];
  $('#pageSub').textContent = titles[1];
  document.title = titles[0] + ' — Commission Accounts';
  updateDrawerMeta();

  // The register is a pure list: no second heading, no action buttons - the whole
  // window is the list, with a pager at the bottom.
  const isList = kind === 'master' || kind === 'voucher' || kind === 'dealer'
    || ['register', 'purchases', 'sales', 'sellers', 'buyers', 'dealers'].includes(state.view);
  const main = $('#main');
  main.className = 'main' + (isList ? ' fill' : ' scroll');
  main.scrollTop = 0;
  const exports = $('#topbarExports');
  if (exports) exports.hidden = !isList;
  const sBtn = $('#searchToggle');
  if (sBtn) sBtn.hidden = !isList;
  // Views that keep their filters in the top bar (the register) fill this in themselves.
  const topFilters = $('#topbarFilters');
  if (topFilters) { topFilters.hidden = true; topFilters.innerHTML = ''; topFilters.classList.remove('search-closed'); }
  const topbar = $('.topbar');
  if (topbar) topbar.classList.remove('has-filters');

  if (kind === 'master') return renderMaster(sub);
  if (kind === 'voucher') return renderVouchers(sub);
  if (kind === 'dealer') return renderDealerRegister(dealName);
  if (state.view === 'purchases') return renderGoodsRegister('purchase');
  if (state.view === 'sales') return renderGoodsRegister('sales');
  if (state.view === 'sellers') return renderPartyRegister('seller');
  if (state.view === 'buyers') return renderPartyRegister('buyer');
  if (state.view === 'dealers') return renderDealers();
  if (state.view === 'dashboard') return renderDashboard();
  if (state.view === 'settings') return renderSettings();
  return renderRegister();
}

/* ---------------------------------------------------------------- boot */
// The magnifier in the top bar opens (or focuses) whatever search the page has.
function focusSearch() {
  const wrap = $('#topbarFilters .search');
  const filters = $('#topbarFilters');
  if (wrap) {
    const inp = wrap.querySelector('input');
    if (wrap.dataset.permanent) {
      if (inp) { inp.focus(); try { inp.select(); } catch (e) { /* ignore */ } }
      return;
    }
    const activeEmpty = document.activeElement === inp && inp && !inp.value;
    if (!wrap.hidden && activeEmpty) {
      wrap.hidden = true;
      if (filters) filters.classList.add('search-closed');
      return;
    }
    wrap.hidden = false;
    if (filters) filters.classList.remove('search-closed');
    if (inp) { inp.focus(); try { inp.select(); } catch (e) { /* ignore */ } }
    return;
  }
  const local = $('#main #fQ');
  if (local) { local.focus(); try { local.select(); } catch (e) { /* ignore */ } }
}

function wireChrome() {
  $('#menuBtn').addEventListener('click', openDrawer);
  $('#drawerClose').addEventListener('click', closeDrawer);
  $('#drawerBackdrop').addEventListener('click', closeDrawer);
  $('#mmToggle').addEventListener('click', (e) => toggleSubmenu('mm', e.currentTarget));
  $('#qvToggle').addEventListener('click', (e) => toggleSubmenu('qv', e.currentTarget));
  $$('.menu-item[data-view]').forEach(b => b.addEventListener('click', () => navigate(b.dataset.view)));
  $('#syncChip').addEventListener('click', () => syncNow({ quiet: false }));
  const searchBtn = $('#searchToggle');
  if (searchBtn) searchBtn.addEventListener('click', focusSearch);
  const xls = $('#exportXls'); if (xls) xls.addEventListener('click', () => exportCurrent('xls'));
  const pdf = $('#exportPdf'); if (pdf) pdf.addEventListener('click', () => exportCurrent('pdf'));
  // Profile chip: opens your account, and closes it again when clicked a second time.
  $('#userChip').addEventListener('click', () => {
    if (state.view === 'settings') navigate(state.prevView || 'register');
    else { state.prevView = state.view; navigate('settings'); }
  });
  $('#drawerLogout').addEventListener('click', () => { closeDrawer(); signOut(); });
  $('#modalBackdrop').addEventListener('click', (e) => { if (e.target.id === 'modalBackdrop') closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeModal(); closeDrawer(); return; }
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
