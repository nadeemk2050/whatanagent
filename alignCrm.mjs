// ======================== WhatAnAgent — CRM module ========================
// A self-contained CRM: companies (one per main email), members (owner + team),
// contacts, deals with a full stage history, activities (the customer timeline),
// tasks, CSV import, AI research from a pasted link/text and WhatsApp contact capture.
//
// Storage: Firestore when the admin SDK is configured, otherwise JSON files under
// data/crm/ (so the module also runs on a dev machine with no service account).
// Auth: own password auth (scrypt) for the company owner (email) and team members
// (company code + name). The linked owner email also gets the WhatAnAgent extras.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { alignDb } from './alignAdmin.mjs';
import { alignAuth } from './alignAdmin.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.ALIGN_CRM_DATA_DIR || path.join(__dirname, 'data', 'crm');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const SECRET_FILE = path.join(DATA_DIR, 'secret.key');
const LINKED_EMAIL = String(process.env.CRM_LINKED_EMAIL || 'nadeemalsaham@gmail.com').toLowerCase();
const TOKEN_DAYS = 30;

const C = {
  company: 'crmCompanies', member: 'crmMembers', contact: 'crmContacts',
  deal: 'crmDeals', act: 'crmActivities', task: 'crmTasks'
};
const DEFAULT_STAGES = [
  { id: 'new', name: 'New lead', probability: 10 },
  { id: 'qualified', name: 'Qualified', probability: 30 },
  { id: 'contacted', name: 'Contacted', probability: 45 },
  { id: 'proposal', name: 'Proposal sent', probability: 65 },
  { id: 'negotiation', name: 'Negotiation', probability: 80 },
  { id: 'won', name: 'Won', probability: 100 },
  { id: 'lost', name: 'Lost', probability: 0 }
];

const sstr = (v, n = 400) => String(v == null ? '' : v).substring(0, n);
const nowMs = () => Date.now();
const noAdmin = (e) => !!(e && e.code === 'align-no-admin');
const uid = () => crypto.randomBytes(9).toString('hex');
const norm = (s) => sstr(s, 200).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// ---------------- storage ----------------
// The CRM keeps its data in a local JSON store on the server by default: a Firestore round
// trip from this VPS measured 250-1500 ms, while a local read is a memory lookup. Set
// CRM_STORE=firestore to go back to Firestore.
const USE_FIRESTORE = String(process.env.CRM_STORE || '').toLowerCase() === 'firestore';

let fileDb = null;
let saveTimer = null;
function loadFile() {
  if (fileDb) return fileDb;
  try { fileDb = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) || {}; } catch (e) { fileDb = {}; }
  for (const k of Object.values(C)) if (!Array.isArray(fileDb[k])) fileDb[k] = [];
  return fileDb;
}
function saveNow() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(fileDb || {}));
    fs.renameSync(tmp, DB_FILE);      // atomic: a crash mid-write can never corrupt the store
  } catch (e) { console.warn('[CRM] could not write ' + DB_FILE + ': ' + sstr(e && e.message, 120)); }
}
// Batch writes: many small edits in a row cost one disk write, and still flush quickly.
function saveFile() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; saveNow(); }, 250);
}
function secret() {
  const env = process.env.CRM_SECRET;
  if (env) return env;
  try { return fs.readFileSync(SECRET_FILE, 'utf8').trim(); } catch (e) { /* create below */ }
  const s = crypto.randomBytes(32).toString('hex');
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(SECRET_FILE, s, { mode: 0o600 }); } catch (e2) { /* memory only */ }
  return s;
}
let SECRET = '';

function filePut(kind, doc) {
  const db = loadFile();
  const i = db[kind].findIndex((x) => x.id === doc.id);
  if (i >= 0) db[kind][i] = doc; else db[kind].push(doc);
  saveFile();
  return doc;
}
function fileDel(kind, id) {
  const db = loadFile();
  db[kind] = db[kind].filter((x) => x.id !== id);
  saveFile();
}

async function put(kind, doc) {
  if (!USE_FIRESTORE) return filePut(kind, doc);
  try { await alignDb().collection(kind).doc(doc.id).set(doc); return doc; }
  catch (e) {
    if (!noAdmin(e)) throw e;
    return filePut(kind, doc);
  }
}
async function get(kind, id) {
  if (!USE_FIRESTORE) return loadFile()[kind].find((x) => x.id === id) || null;
  try {
    const s = await alignDb().collection(kind).doc(String(id)).get();
    return s.exists ? s.data() : null;
  } catch (e) {
    if (!noAdmin(e)) throw e;
    return loadFile()[kind].find((x) => x.id === id) || null;
  }
}
async function del(kind, id) {
  if (!USE_FIRESTORE) { fileDel(kind, id); return; }
  try { await alignDb().collection(kind).doc(String(id)).delete(); return; }
  catch (e) {
    if (!noAdmin(e)) throw e;
    fileDel(kind, id);
  }
}
async function list(kind, filter) {
  const key = Object.keys(filter)[0];
  const val = filter[key];
  if (!USE_FIRESTORE) return loadFile()[kind].filter((x) => x[key] === val);
  try {
    const snap = await alignDb().collection(kind).where(key, '==', val).get();
    const out = [];
    snap.forEach((d) => out.push(d.data()));
    return out;
  } catch (e) {
    if (!noAdmin(e)) throw e;
    return loadFile()[kind].filter((x) => x[key] === val);
  }
}

// One-time copy of whatever the CRM already stored in Firestore into the local store.
async function migrateFromFirestore() {
  if (USE_FIRESTORE) return;
  const db = loadFile();
  if (db.crmCompanies.length) return;
  try {
    const probe = await alignDb().collection(C.company).limit(1).get();
    if (probe.empty) return;
    let n = 0;
    for (const kind of Object.values(C)) {
      const all = await alignDb().collection(kind).get();
      all.forEach((d) => { const v = d.data(); if (v && v.id && !db[kind].some((x) => x.id === v.id)) { db[kind].push(v); n++; } });
    }
    saveNow();
    console.log('[CRM] migrated ' + n + ' records from Firestore to the local store');
  } catch (e) { /* no admin SDK or empty Firebase project: nothing to migrate */ }
}

// ---------------- passwords + tokens ----------------
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return salt + ':' + hash;
}
function checkPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(String(password), salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(test, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return body + '.' + sig;
}
function verify(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const want = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  let p = null;
  try { p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch (e) { return null; }
  if (!p || !p.exp || p.exp < nowMs()) return null;
  return p;
}

// ---------------- shapes ----------------
const publicMember = (m) => ({ id: m.id, name: m.name, handle: m.handle, role: m.role, email: m.email || '', active: m.active !== false, lastLoginAt: m.lastLoginAt || 0, createdAt: m.createdAt || 0 });
const publicCompany = (c) => ({ id: c.id, name: c.name, code: c.code, currency: c.currency || 'USD', stages: c.stages || DEFAULT_STAGES, customFields: c.customFields || [], linked: !!c.linked, createdAt: c.createdAt || 0 });

function contactDedupeKeys(c) {
  const keys = [];
  for (const e of (c.emails || [])) if (e) keys.push('e:' + String(e).toLowerCase().trim());
  for (const p of (c.phones || [])) { const d = String(p).replace(/\D/g, ''); if (d.length >= 7) keys.push('p:' + d.slice(-9)); }
  return keys;
}
function normalizeContact(input, base) {
  const emails = (Array.isArray(input.emails) ? input.emails : String(input.email || '').split(/[,;\s]+/)).map((x) => sstr(x, 120).trim()).filter((x) => /@/.test(x));
  const phones = (Array.isArray(input.phones) ? input.phones : String(input.phone || '').split(/[,;]+/)).map((x) => sstr(x, 40).trim()).filter(Boolean);
  const socials = Object.assign({}, base && base.socials ? base.socials : {});
  if (input.socials && typeof input.socials === 'object') {
    for (const k of ['facebook', 'instagram', 'linkedin', 'alibaba', 'x', 'tiktok', 'other']) {
      if (input.socials[k] != null && String(input.socials[k]).trim()) socials[k] = sstr(input.socials[k], 300).trim();
    }
  }
  return {
    name: sstr(input.name || (base && base.name) || '', 120).trim(),
    company: sstr(input.company || (base && base.company) || '', 160).trim(),
    title: sstr(input.title || (base && base.title) || '', 120).trim(),
    emails: emails.length ? emails : (base && base.emails) || [],
    phones: phones.length ? phones : (base && base.phones) || [],
    website: sstr(input.website || (base && base.website) || '', 200).trim(),
    country: sstr(input.country || (base && base.country) || '', 80).trim(),
    city: sstr(input.city || (base && base.city) || '', 80).trim(),
    address: sstr(input.address || (base && base.address) || '', 300).trim(),
    status: ['Lead', 'Prospect', 'Active', 'VIP', 'Inactive'].includes(input.status) ? input.status : ((base && base.status) || 'Lead'),
    tags: Array.isArray(input.tags) ? input.tags.map((t) => sstr(t, 40).trim()).filter(Boolean)
      : (typeof input.tags === 'string' && input.tags.trim() ? input.tags.split(/[,;]+/).map((t) => t.trim()).filter(Boolean) : (base && base.tags) || []),
    ownerId: input.ownerId != null ? sstr(input.ownerId, 40) : ((base && base.ownerId) || ''),
    value: Number(input.value != null ? input.value : (base && base.value) || 0) || 0,
    currency: sstr(input.currency || (base && base.currency) || '', 8),
    notes: sstr(input.notes != null ? input.notes : (base && base.notes) || '', 4000),
    socials,
    customFields: Object.assign({}, base && base.customFields ? base.customFields : {}, input.customFields && typeof input.customFields === 'object' ? input.customFields : {}),
    aiProfile: input.aiProfile && typeof input.aiProfile === 'object' ? input.aiProfile : (base && base.aiProfile) || null,
    source: sstr(input.source || (base && base.source) || 'manual', 30)
  };
}

// ---------------- CSV ----------------
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQ = false;
  const s = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQ) {
      if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',' || ch === ';' || ch === '\t') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}
const HEADER_MAP = {
  name: ['name', 'full name', 'contact', 'contact name', 'customer', 'customer name', 'person'],
  company: ['company', 'company name', 'organisation', 'organization', 'account', 'business'],
  title: ['title', 'job title', 'position', 'role', 'designation'],
  email: ['email', 'e-mail', 'email address', 'mail'],
  phone: ['phone', 'mobile', 'tel', 'telephone', 'phone number', 'whatsapp'],
  website: ['website', 'url', 'site', 'web'],
  country: ['country'],
  city: ['city', 'town'],
  address: ['address', 'street'],
  notes: ['notes', 'note', 'comment', 'comments', 'remarks'],
  tags: ['tags', 'tag', 'labels'],
  status: ['status', 'stage'],
  value: ['value', 'amount', 'deal value', 'potential']
};
function mapRow(headers, cells) {
  const out = {};
  headers.forEach((h, i) => {
    const key = norm(h);
    for (const [field, aliases] of Object.entries(HEADER_MAP)) {
      if (aliases.includes(key) && !out[field]) out[field] = cells[i];
    }
  });
  return out;
}

// ---------------- AI ----------------
async function geminiKey() {
  const env = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (env) return env;
  try {
    const s = await alignDb().doc('appData/settings').get();
    const d = s.exists ? (s.data() || {}) : {};
    return d.GEMINI_API_KEY || d.geminiApiKey || '';
  } catch (e) { return ''; }
}
async function geminiJson(prompt, temperature = 0.2) {
  const key = await geminiKey();
  if (!key) return { ok: false, error: 'AI is not configured on the server (no Gemini key).' };
  for (const model of ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-flash-latest']) {
    try {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + key, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature } }),
        signal: AbortSignal.timeout(30000)
      });
      if (!r.ok) continue;
      const j = await r.json();
      const txt = (((j.candidates || [])[0] || {}).content || {}).parts?.[0]?.text || '';
      const parsed = JSON.parse(String(txt).replace(/^```json|```$/g, '').trim());
      return { ok: true, data: parsed };
    } catch (e) { /* next model */ }
  }
  return { ok: false, error: 'The AI model did not answer. Try again in a moment.' };
}
async function pageText(url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return '';
    const r = await fetch(u.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', 'Accept-Language': 'en' },
      signal: AbortSignal.timeout(15000)
    });
    if (!r.ok) return '';
    const html = await r.text();
    return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').slice(0, 12000);
  } catch (e) { return ''; }
}

// ---------------- module ----------------
function dashboardOf(company, contacts, deals, acts, tasks, members) {
  const stages = company.stages || DEFAULT_STAGES;
  const byStage = stages.map((s) => ({ id: s.id, name: s.name, count: deals.filter((d) => d.stage === s.id).length, value: deals.filter((d) => d.stage === s.id).reduce((n, d) => n + (Number(d.value) || 0), 0) }));
  const won = deals.filter((d) => d.stage === 'won');
  const open = deals.filter((d) => d.stage !== 'won' && d.stage !== 'lost');
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const today = new Date().toISOString().slice(0, 10);
  return {
    contacts: contacts.length,
    contactsByStatus: ['Lead', 'Prospect', 'Active', 'VIP', 'Inactive'].map((s) => ({ status: s, count: contacts.filter((c) => c.status === s).length })),
    deals: {
      total: deals.length, open: open.length,
      openValue: open.reduce((n, d) => n + (Number(d.value) || 0), 0),
      won: won.length, wonValue: won.reduce((n, d) => n + (Number(d.value) || 0), 0),
      wonThisMonth: won.filter((d) => (d.wonAt || 0) >= monthStart.getTime()).length
    },
    byStage,
    tasks: { open: tasks.filter((t) => !t.done).length, overdue: tasks.filter((t) => !t.done && t.dueDate && t.dueDate < today).length },
    team: members.length,
    recent: acts.slice().sort((a, b) => b.at - a.at).slice(0, 12),
    topContacts: contacts.filter((c) => (c.value || 0) > 0).sort((a, b) => (b.value || 0) - (a.value || 0)).slice(0, 5).map((c) => ({ id: c.id, name: c.name || c.company, value: c.value, status: c.status })),
    currency: company.currency || 'USD'
  };
}

export function registerAlignCrmRoutes(app, opts) {
  const api = (opts && opts.api) || '/api/crm';
  const waListContacts = opts && opts.waListContacts;   // WhatsApp contact capture
  SECRET = secret();
  loadFile();                                            // warm the store (also creates the file lazily)
  migrateFromFirestore();                                // one-time copy of any existing Firestore data
  const flush = () => saveNow();
  process.on('SIGTERM', flush);
  process.on('SIGINT', flush);
  process.on('beforeExit', flush);

  const fail = (res, e, code) => res.status(code || 500).json({ ok: false, error: sstr((e && e.message) || e, 240) });
  const bad = (res, msg, code) => res.status(code || 400).json({ ok: false, error: msg });

  async function auth(req, res, next) {
    const raw = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const p = verify(raw);
    if (!p) return res.status(401).json({ ok: false, error: 'Please sign in again.' });
    const member = await get(C.member, p.mid);
    if (!member || member.active === false) return res.status(401).json({ ok: false, error: 'This login is no longer active.' });
    const company = await get(C.company, member.companyId);
    if (!company) return res.status(401).json({ ok: false, error: 'Company not found.' });
    req.crm = { member, company, body: req.body || {} };
    next();
  }
  const ownerOnly = (req, res, next) => (req.crm.member.role === 'owner' ? next() : bad(res, 'Only the account owner can do this.', 403));

  async function log(companyId, member, type, body, extra) {
    const a = Object.assign({
      id: uid(), companyId, type: sstr(type, 30), body: sstr(body, 4000),
      contactId: '', dealId: '', memberId: member.id, memberName: member.name, at: nowMs(), meta: null
    }, extra || {});
    await put(C.act, a);
    return a;
  }
  const code6 = () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += alphabet[crypto.randomInt(alphabet.length)];
    return s;
  };

  // ---------- auth ----------
  app.post(api + '/register', async (req, res) => {
    try {
      const b = req.body || {};
      const email = sstr(b.email, 160).toLowerCase().trim();
      const name = sstr(b.name, 60).trim();
      const companyName = sstr(b.company, 120).trim() || (name ? name + "'s company" : 'My company');
      const password = String(b.password || '');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad(res, 'Enter a valid email address.');
      const existing = await list(C.company, { ownerEmail: email });
      if (existing.length) return bad(res, 'This email already has a CRM account. Please sign in.');
      if (name.length < 2) return bad(res, 'Enter your name (this is the owner name in the team).');
      const company = { id: uid(), name: companyName, code: code6(), ownerEmail: email, currency: sstr(b.currency, 8) || 'USD', stages: DEFAULT_STAGES, customFields: [], linked: email === LINKED_EMAIL, createdAt: nowMs() };
      await put(C.company, company);
      const member = { id: uid(), companyId: company.id, name, handle: norm(name), email, role: 'owner', saltHash: hashPassword(password), active: true, createdAt: nowMs(), lastLoginAt: nowMs() };
      await put(C.member, member);
      await log(company.id, member, 'system', 'CRM account created for ' + companyName + '.');
      const token = sign({ mid: member.id, cid: company.id, exp: nowMs() + TOKEN_DAYS * 86400000 });
      res.json({ ok: true, token, member: publicMember(member), company: publicCompany(company) });
    } catch (e) { fail(res, e); }
  });

  app.post(api + '/login', async (req, res) => {
    try {
      const b = req.body || {};
      const email = sstr(b.email, 160).toLowerCase().trim();
      const code = sstr(b.code, 10).toUpperCase().trim();
      const name = sstr(b.name, 60).trim();
      const password = String(b.password || '');
      let member = null;
      if (email) {
        const cs = await list(C.company, { ownerEmail: email });
        if (!cs.length) return bad(res, 'No CRM account uses that email.', 401);
        const ms = await list(C.member, { companyId: cs[0].id });
        member = ms.find((m) => m.email === email && m.role === 'owner') || ms.find((m) => m.email === email) || null;
      } else {
        if (!code || !name) return bad(res, 'Enter the company code and your team name to sign in.');
        const cs = await list(C.company, { code });
        if (!cs.length) return bad(res, 'That company code was not found.', 401);
        const ms = await list(C.member, { companyId: cs[0].id });
        const want = norm(name).replace(/\s+/g, '');
        member = ms.find((m) => m.handle === want) || null;
        if (!member) return bad(res, 'No team member with that name in this company.', 401);
      }
      if (!member || !checkPassword(password, member.saltHash)) return bad(res, 'Wrong password.', 401);
      if (member.active === false) return bad(res, 'This login has been switched off by the owner.', 403);
      const company = await get(C.company, member.companyId);
      member = Object.assign({}, member, { lastLoginAt: nowMs() });
      await put(C.member, member);
      const token = sign({ mid: member.id, cid: company.id, exp: nowMs() + TOKEN_DAYS * 86400000 });
      res.json({ ok: true, token, member: publicMember(member), company: publicCompany(company) });
    } catch (e) { fail(res, e); }
  });

  // Sign in with the existing WhatAnAgent (Firebase) login instead of a CRM password.
  // Any verified email may use it: an existing company is opened, a new one is created on first use.
  app.post(api + '/sso', async (req, res) => {
    try {
      const b = req.body || {};
      const idToken = String(b.idToken || '').trim();
      if (!idToken) return bad(res, 'Missing WhatAnAgent sign-in token.');
      let decoded = null;
      try { decoded = await alignAuth().verifyIdToken(idToken); }
      catch (e) {
        if (e && e.code === 'align-no-admin') return bad(res, 'WhatAnAgent sign-in is not switched on for this server yet — use the email and password form.', 503);
        return bad(res, 'That WhatAnAgent sign-in could not be verified. Please try again.', 401);
      }
      const email = String((decoded && decoded.email) || '').toLowerCase().trim();
      if (!email || !(decoded.email_verified !== false)) return bad(res, 'That account has no verified email.', 401);
      const guessName = String((decoded && decoded.name) || '').trim() || email.split('@')[0];
      const existing = await list(C.company, { ownerEmail: email });
      let company = existing[0] || null;
      if (!company) {
        const companyName = sstr(b.company, 120).trim();
        if (!companyName) return res.json({ ok: true, needsCompany: true, email, name: guessName });
        company = { id: uid(), name: companyName, code: code6(), ownerEmail: email, currency: 'USD', stages: DEFAULT_STAGES, customFields: [], linked: email === LINKED_EMAIL, createdAt: nowMs() };
        await put(C.company, company);
      }
      const ms = await list(C.member, { companyId: company.id });
      let member = ms.find((m) => m.role === 'owner' && m.email === email) || ms.find((m) => m.role === 'owner') || null;
      if (!member) {
        member = { id: uid(), companyId: company.id, name: guessName, handle: norm(guessName).replace(/\s+/g, ''), email, role: 'owner', saltHash: '', active: true, createdAt: nowMs(), lastLoginAt: nowMs(), via: 'sso' };
        await put(C.member, member);
        await log(company.id, member, 'system', 'CRM account created for ' + company.name + ' (signed in with WhatAnAgent).');
      } else if (member.active === false) {
        return bad(res, 'This account has been switched off.', 403);
      } else {
        member = Object.assign({}, member, { lastLoginAt: nowMs() });
        await put(C.member, member);
      }
      const token = sign({ mid: member.id, cid: company.id, exp: nowMs() + TOKEN_DAYS * 86400000 });
      res.json({ ok: true, token, member: publicMember(member), company: publicCompany(company), via: 'sso' });
    } catch (e) { fail(res, e); }
  });

  app.get(api + '/me', auth, (req, res) => {
    res.json({ ok: true, member: publicMember(req.crm.member), company: publicCompany(req.crm.company), linkedEmail: LINKED_EMAIL });
  });

  // ---------- team ----------
  app.get(api + '/team', auth, async (req, res) => {
    try {
      const ms = await list(C.member, { companyId: req.crm.company.id });
      res.json({ ok: true, members: ms.map(publicMember).sort((a, b) => (a.role === 'owner' ? -1 : 1)) });
    } catch (e) { fail(res, e); }
  });

  app.post(api + '/team', auth, ownerOnly, async (req, res) => {
    try {
      const b = req.crm.body;
      const name = sstr(b.name, 60).trim();
      const password = String(b.password || '');
      if (name.length < 2) return bad(res, 'Enter the team member name.');
      if (password.length < 6) return bad(res, 'The password must be at least 6 characters.');
      const ms = await list(C.member, { companyId: req.crm.company.id });
      const handle = norm(name).replace(/\s+/g, '');
      if (ms.some((m) => m.handle === handle)) return bad(res, 'That name is already used in this team. Add a surname or initial.');
      const member = { id: uid(), companyId: req.crm.company.id, name, handle, email: sstr(b.email, 160).toLowerCase().trim(), role: 'member', saltHash: hashPassword(password), active: true, createdAt: nowMs(), lastLoginAt: 0 };
      await put(C.member, member);
      await log(req.crm.company.id, req.crm.member, 'system', 'Added team member ' + name + '.');
      res.json({ ok: true, member: publicMember(member), company: publicCompany(req.crm.company) });
    } catch (e) { fail(res, e); }
  });

  app.patch(api + '/team/:id', auth, ownerOnly, async (req, res) => {
    try {
      const m = await get(C.member, req.params.id);
      if (!m || m.companyId !== req.crm.company.id) return bad(res, 'Member not found.', 404);
      const b = req.crm.body;
      if (b.name) { m.name = sstr(b.name, 60).trim(); m.handle = norm(m.name).replace(/\s+/g, ''); }
      if (b.password) {
        if (String(b.password).length < 6) return bad(res, 'The password must be at least 6 characters.');
        m.saltHash = hashPassword(b.password);
      }
      if (b.active != null && m.role !== 'owner') m.active = !!b.active;
      if (b.email != null) m.email = sstr(b.email, 160).toLowerCase().trim();
      await put(C.member, m);
      res.json({ ok: true, member: publicMember(m) });
    } catch (e) { fail(res, e); }
  });

  app.delete(api + '/team/:id', auth, ownerOnly, async (req, res) => {
    try {
      const m = await get(C.member, req.params.id);
      if (!m || m.companyId !== req.crm.company.id) return bad(res, 'Member not found.', 404);
      if (m.role === 'owner') return bad(res, 'The owner cannot be removed.');
      await del(C.member, m.id);
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });

  // ---------- contacts ----------
  app.get(api + '/contacts', auth, async (req, res) => {
    try {
      const all = await list(C.contact, { companyId: req.crm.company.id });
      const q = norm(req.query.q || '');
      const status = sstr(req.query.status, 20);
      const owner = sstr(req.query.owner, 40);
      const tag = norm(req.query.tag || '');
      let rows = all;
      if (status) rows = rows.filter((c) => c.status === status);
      if (owner) rows = rows.filter((c) => (c.ownerId || '') === owner);
      if (tag) rows = rows.filter((c) => (c.tags || []).some((t) => norm(t) === tag));
      if (q) {
        rows = rows.filter((c) => norm([c.name, c.company, c.title, c.notes, (c.emails || []).join(' '), (c.phones || []).join(' '), (c.tags || []).join(' ')].join(' ')).includes(q));
      }
      rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      res.json({ ok: true, total: rows.length, contacts: rows });
    } catch (e) { fail(res, e); }
  });

  app.get(api + '/contacts/:id', auth, async (req, res) => {
    try {
      const c = await get(C.contact, req.params.id);
      if (!c || c.companyId !== req.crm.company.id) return bad(res, 'Contact not found.', 404);
      const acts = (await list(C.act, { companyId: req.crm.company.id })).filter((a) => a.contactId === c.id).sort((x, y) => y.at - x.at);
      const deals = (await list(C.deal, { companyId: req.crm.company.id })).filter((d) => d.contactId === c.id);
      const tasks = (await list(C.task, { companyId: req.crm.company.id })).filter((t) => t.contactId === c.id);
      res.json({ ok: true, contact: c, activities: acts, deals, tasks });
    } catch (e) { fail(res, e); }
  });

  app.post(api + '/contacts', auth, async (req, res) => {
    try {
      const b = req.crm.body;
      const companyId = req.crm.company.id;
      const clean = normalizeContact(b, null);
      if (!clean.name && !clean.company) return bad(res, 'A contact needs at least a name or a company.');
      const all = await list(C.contact, { companyId });
      const keys = contactDedupeKeys(clean);
      const dup = all.find((c) => contactDedupeKeys(c).some((k) => keys.includes(k)));
      if (dup) {
        const merged = Object.assign({}, dup, normalizeContact(clean, dup), { updatedAt: nowMs(), source: dup.source || clean.source });
        merged.tags = Array.from(new Set([...(dup.tags || []), ...(clean.tags || [])]));
        merged.emails = Array.from(new Set([...(dup.emails || []), ...(clean.emails || [])]));
        merged.phones = Array.from(new Set([...(dup.phones || []), ...(clean.phones || [])]));
        await put(C.contact, merged);
        await log(companyId, req.crm.member, 'system', 'Merged a duplicate entry into ' + (merged.name || merged.company) + '.', { contactId: merged.id });
        return res.json({ ok: true, contact: merged, merged: true });
      }
      const contact = Object.assign({}, clean, {
        id: uid(), companyId, createdAt: nowMs(), updatedAt: nowMs(),
        createdBy: req.crm.member.id, createdByName: req.crm.member.name,
        lastContactAt: b.lastContactAt ? Number(b.lastContactAt) || 0 : 0
      });
      await put(C.contact, contact);
      await log(companyId, req.crm.member, 'system', 'Created contact ' + (contact.name || contact.company) + ' (' + contact.source + ').', { contactId: contact.id });
      res.json({ ok: true, contact });
    } catch (e) { fail(res, e); }
  });

  app.patch(api + '/contacts/:id', auth, async (req, res) => {
    try {
      const c = await get(C.contact, req.params.id);
      if (!c || c.companyId !== req.crm.company.id) return bad(res, 'Contact not found.', 404);
      const b = req.crm.body;
      const updated = Object.assign({}, c, normalizeContact(b, c), { updatedAt: nowMs(), updatedBy: req.crm.member.id });
      await put(C.contact, updated);
      const changed = Object.keys(b).filter((k) => !['customFields', 'aiProfile', 'source'].includes(k));
      if (changed.length) await log(req.crm.company.id, req.crm.member, 'update', 'Updated ' + (updated.name || updated.company) + ' (' + changed.slice(0, 6).join(', ') + ').', { contactId: updated.id });
      res.json({ ok: true, contact: updated });
    } catch (e) { fail(res, e); }
  });

  app.delete(api + '/contacts/:id', auth, async (req, res) => {
    try {
      const c = await get(C.contact, req.params.id);
      if (!c || c.companyId !== req.crm.company.id) return bad(res, 'Contact not found.', 404);
      if (req.crm.member.role !== 'owner' && c.createdBy !== req.crm.member.id && c.ownerId !== req.crm.member.id) return bad(res, 'Only the owner or the contact owner can delete this.', 403);
      await del(C.contact, c.id);
      await log(req.crm.company.id, req.crm.member, 'system', 'Deleted contact ' + (c.name || c.company) + '.');
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });

  // ---------- import + research ----------
  app.post(api + '/import/csv', auth, async (req, res) => {
    try {
      const companyId = req.crm.company.id;
      const text = String(req.crm.body.csv || '');
      if (!text.trim()) return bad(res, 'The file is empty.');
      const rows = parseCsv(text);
      if (rows.length < 2) return bad(res, 'The file needs a header row and at least one contact.');
      const headers = rows[0];
      const all = await list(C.contact, { companyId });
      const existingKeys = new Map();
      for (const c of all) for (const k of contactDedupeKeys(c)) existingKeys.set(k, c);
      let added = 0, merged = 0, skipped = 0;
      const touched = [];
      for (const r of rows.slice(1)) {
        const mapped = mapRow(headers, r);
        const clean = normalizeContact(Object.assign({}, mapped, { source: 'csv' }), null);
        if (!clean.name && !clean.company && !clean.emails.length) { skipped++; continue; }
        const keys = contactDedupeKeys(clean);
        const hit = keys.map((k) => existingKeys.get(k)).find(Boolean);
        if (hit) {
          const m = Object.assign({}, hit, normalizeContact(clean, hit), { updatedAt: nowMs(), source: hit.source || clean.source });
          m.emails = Array.from(new Set([...(hit.emails || []), ...(clean.emails || [])]));
          m.phones = Array.from(new Set([...(hit.phones || []), ...(clean.phones || [])]));
          m.tags = Array.from(new Set([...(hit.tags || []), ...(clean.tags || [])]));
          await put(C.contact, m);
          for (const k of contactDedupeKeys(m)) existingKeys.set(k, m);
          merged++; touched.push(m.id);
        } else {
          const c = Object.assign({}, clean, { id: uid(), companyId, createdAt: nowMs(), updatedAt: nowMs(), createdBy: req.crm.member.id, createdByName: req.crm.member.name, lastContactAt: 0 });
          await put(C.contact, c);
          for (const k of keys) existingKeys.set(k, c);
          added++; touched.push(c.id);
        }
      }
      await log(companyId, req.crm.member, 'import', 'Imported a CSV: ' + added + ' new, ' + merged + ' merged, ' + skipped + ' skipped.');
      res.json({ ok: true, added, merged, skipped, total: touched.length });
    } catch (e) { fail(res, e); }
  });

  // AI reads a pasted link or text and proposes a contact (nothing is saved until the user accepts).
  app.post(api + '/research', auth, async (req, res) => {
    try {
      const b = req.crm.body;
      const pasted = sstr(b.text, 20000).trim();
      if (!pasted) return bad(res, 'Paste a link or some text about the customer first.');
      const urls = pasted.match(/https?:\/\/[^\s]+/g) || [];
      let page = '';
      if (urls.length) page = await pageText(urls[0]);
      const prompt = 'You are a B2B sales research assistant. Read the material and extract ONE company/customer profile. '
        + 'Never invent values: use an empty string when the material does not say. '
        + 'Reply with strict JSON only: {"name":"<best contact person name, or empty>","company":"<company name>","title":"<contact job title>",'
        + '"emails":["..."],"phones":["..."],"website":"...","country":"...","city":"...","address":"...",'
        + '"socials":{"facebook":"","instagram":"","linkedin":"","alibaba":"","x":"","tiktok":""},'
        + '"sector":"<industry>","size":"<employees if stated>","summary":"<max 3 sentences about what they do>",'
        + '"products":["what they sell"],"opportunities":["how we could sell to them, max 3"],"confidence":"high|medium|low"}. '
        + 'Material (user text): ' + pasted.slice(0, 6000)
        + (page ? ' . Page text: ' + page.slice(0, 8000) : '');
      const ai = await geminiJson(prompt, 0.1);
      if (!ai.ok) return bad(res, ai.error, 503);
      const d = ai.data || {};
      const socials = Object.assign({}, d.socials || {});
      for (const u of urls) {
        if (/facebook\.com/i.test(u) && !socials.facebook) socials.facebook = u;
        if (/instagram\.com/i.test(u) && !socials.instagram) socials.instagram = u;
        if (/linkedin\.com/i.test(u) && !socials.linkedin) socials.linkedin = u;
        if (/alibaba\.com/i.test(u) && !socials.alibaba) socials.alibaba = u;
      }
      const candidate = normalizeContact({
        name: d.name, company: d.company, title: d.title, emails: d.emails, phones: d.phones,
        website: d.website, country: d.country, city: d.city, address: d.address, socials, source: 'ai'
      }, null);
      candidate.aiProfile = {
        sector: sstr(d.sector, 120), size: sstr(d.size, 80), summary: sstr(d.summary, 900),
        products: Array.isArray(d.products) ? d.products.slice(0, 10).map((x) => sstr(x, 90)) : [],
        opportunities: Array.isArray(d.opportunities) ? d.opportunities.slice(0, 5).map((x) => sstr(x, 160)) : [],
        confidence: ['high', 'medium', 'low'].includes(d.confidence) ? d.confidence : 'low',
        fromUrl: urls[0] || '', at: nowMs()
      };
      const all = await list(C.contact, { companyId: req.crm.company.id });
      const keys = contactDedupeKeys(candidate);
      const dup = all.find((c) => contactDedupeKeys(c).some((k) => keys.includes(k)));
      res.json({ ok: true, candidate, duplicateOf: dup ? { id: dup.id, name: dup.name || dup.company } : null, pageFetched: !!page });
    } catch (e) { fail(res, e); }
  });

  // ---------- deals ----------
  app.get(api + '/deals', auth, async (req, res) => {
    try {
      const rows = (await list(C.deal, { companyId: req.crm.company.id })).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      res.json({ ok: true, deals: rows, stages: (req.crm.company.stages || DEFAULT_STAGES) });
    } catch (e) { fail(res, e); }
  });

  app.post(api + '/deals', auth, async (req, res) => {
    try {
      const b = req.crm.body;
      const companyId = req.crm.company.id;
      const title = sstr(b.title, 160).trim();
      if (!title) return bad(res, 'Give the deal a title.');
      const stages = req.crm.company.stages || DEFAULT_STAGES;
      const stage = stages.some((s) => s.id === b.stage) ? b.stage : stages[0].id;
      let contact = null;
      if (b.contactId) {
        contact = await get(C.contact, b.contactId);
        if (!contact || contact.companyId !== companyId) return bad(res, 'Contact not found.', 404);
      }
      const deal = {
        id: uid(), companyId, title, contactId: contact ? contact.id : '', contactName: contact ? (contact.name || contact.company) : sstr(b.contactName, 120),
        company: contact ? contact.company : sstr(b.company, 160), value: Number(b.value) || 0,
        currency: sstr(b.currency || req.crm.company.currency, 8) || 'USD', stage,
        probability: b.probability != null ? Math.max(0, Math.min(100, Number(b.probability) || 0)) : ((stages.find((s) => s.id === stage) || {}).probability || 0),
        expectedCloseDate: sstr(b.expectedCloseDate, 20), ownerId: sstr(b.ownerId || req.crm.member.id, 40),
        source: sstr(b.source, 40), notes: sstr(b.notes, 4000), products: sstr(b.products, 500), lostReason: '',
        stageHistory: [{ stage, at: nowMs(), by: req.crm.member.name }],
        createdAt: nowMs(), updatedAt: nowMs(), createdBy: req.crm.member.id, createdByName: req.crm.member.name
      };
      await put(C.deal, deal);
      await log(companyId, req.crm.member, 'deal', 'Opened deal "' + title + '".', { dealId: deal.id, contactId: deal.contactId });
      res.json({ ok: true, deal });
    } catch (e) { fail(res, e); }
  });

  app.patch(api + '/deals/:id', auth, async (req, res) => {
    try {
      const d = await get(C.deal, req.params.id);
      if (!d || d.companyId !== req.crm.company.id) return bad(res, 'Deal not found.', 404);
      const b = req.crm.body;
      const stages = req.crm.company.stages || DEFAULT_STAGES;
      const before = d.stage;
      const updated = Object.assign({}, d, { updatedAt: nowMs() });
      for (const k of ['title', 'notes', 'products', 'expectedCloseDate', 'source', 'lostReason', 'ownerId', 'contactId', 'contactName', 'company']) {
        if (b[k] != null) updated[k] = sstr(b[k], k === 'notes' ? 4000 : 200);
      }
      if (b.value != null) updated.value = Number(b.value) || 0;
      if (b.probability != null) updated.probability = Math.max(0, Math.min(100, Number(b.probability) || 0));
      if (b.stage && stages.some((s) => s.id === b.stage) && b.stage !== before) {
        updated.stage = b.stage;
        const st = stages.find((s) => s.id === b.stage);
        if (b.probability == null && st) updated.probability = st.probability;
        updated.stageHistory = [...(d.stageHistory || []), { stage: b.stage, at: nowMs(), by: req.crm.member.name }];
        if (b.stage === 'won' || /^won$/i.test(st ? st.name : '')) updated.wonAt = nowMs();
        if (/^lost$/i.test(b.stage) || (st && /^lost$/i.test(st.name))) updated.lostAt = nowMs();
      }
      await put(C.deal, updated);
      if (updated.stage !== before) {
        const st = stages.find((s) => s.id === updated.stage);
        await log(req.crm.company.id, req.crm.member, 'stage', 'Deal "' + updated.title + '" moved to ' + (st ? st.name : updated.stage) + '.', { dealId: updated.id, contactId: updated.contactId, meta: { from: before, to: updated.stage } });
      } else {
        await log(req.crm.company.id, req.crm.member, 'update', 'Updated deal "' + updated.title + '".', { dealId: updated.id, contactId: updated.contactId });
      }
      res.json({ ok: true, deal: updated });
    } catch (e) { fail(res, e); }
  });

  app.delete(api + '/deals/:id', auth, async (req, res) => {
    try {
      const d = await get(C.deal, req.params.id);
      if (!d || d.companyId !== req.crm.company.id) return bad(res, 'Deal not found.', 404);
      await del(C.deal, d.id);
      await log(req.crm.company.id, req.crm.member, 'system', 'Deleted deal "' + d.title + '".');
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });

  // ---------- activities (the customer history) ----------
  app.get(api + '/activities', auth, async (req, res) => {
    try {
      const limit = Math.min(500, Number(req.query.limit) || 100);
      let rows = await list(C.act, { companyId: req.crm.company.id });
      if (req.query.contactId) rows = rows.filter((a) => a.contactId === req.query.contactId);
      if (req.query.dealId) rows = rows.filter((a) => a.dealId === req.query.dealId);
      rows.sort((a, b) => b.at - a.at);
      res.json({ ok: true, activities: rows.slice(0, limit) });
    } catch (e) { fail(res, e); }
  });

  app.post(api + '/activities', auth, async (req, res) => {
    try {
      const b = req.crm.body;
      const type = ['note', 'call', 'email', 'meeting', 'whatsapp', 'message', 'task'].includes(b.type) ? b.type : 'note';
      const body = sstr(b.body, 8000).trim();
      if (!body) return bad(res, 'Write something first.');
      if (!b.contactId && !b.dealId) return bad(res, 'Pick a contact or a deal.');
      const a = await log(req.crm.company.id, req.crm.member, type, body, { contactId: sstr(b.contactId, 40), dealId: sstr(b.dealId, 40) });
      if (b.contactId) {
        const c = await get(C.contact, b.contactId);
        if (c && c.companyId === req.crm.company.id) { c.lastContactAt = nowMs(); c.updatedAt = nowMs(); await put(C.contact, c); }
      }
      res.json({ ok: true, activity: a });
    } catch (e) { fail(res, e); }
  });

  // ---------- tasks ----------
  app.get(api + '/tasks', auth, async (req, res) => {
    try {
      const rows = (await list(C.task, { companyId: req.crm.company.id })).sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || String(a.dueDate || '').localeCompare(String(b.dueDate || '')));
      res.json({ ok: true, tasks: rows });
    } catch (e) { fail(res, e); }
  });

  app.post(api + '/tasks', auth, async (req, res) => {
    try {
      const b = req.crm.body;
      const title = sstr(b.title, 200).trim();
      if (!title) return bad(res, 'Give the task a title.');
      const t = {
        id: uid(), companyId: req.crm.company.id, title, dueDate: sstr(b.dueDate, 20),
        priority: ['High', 'Medium', 'Low'].includes(b.priority) ? b.priority : 'Medium',
        contactId: sstr(b.contactId, 40), dealId: sstr(b.dealId, 40),
        assignedTo: sstr(b.assignedTo || req.crm.member.id, 40), done: false,
        createdAt: nowMs(), createdBy: req.crm.member.id, createdByName: req.crm.member.name
      };
      await put(C.task, t);
      res.json({ ok: true, task: t });
    } catch (e) { fail(res, e); }
  });

  app.patch(api + '/tasks/:id', auth, async (req, res) => {
    try {
      const t = await get(C.task, req.params.id);
      if (!t || t.companyId !== req.crm.company.id) return bad(res, 'Task not found.', 404);
      const b = req.crm.body;
      for (const k of ['title', 'dueDate', 'priority', 'assignedTo']) if (b[k] != null) t[k] = sstr(b[k], 200);
      if (b.done != null) { t.done = !!b.done; t.doneAt = t.done ? nowMs() : 0; t.doneBy = req.crm.member.name; }
      await put(C.task, t);
      res.json({ ok: true, task: t });
    } catch (e) { fail(res, e); }
  });

  app.delete(api + '/tasks/:id', auth, async (req, res) => {
    try {
      const t = await get(C.task, req.params.id);
      if (!t || t.companyId !== req.crm.company.id) return bad(res, 'Task not found.', 404);
      await del(C.task, t.id);
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });

  // ---------- capture from the linked WhatsApp number ----------
  app.post(api + '/capture/whatsapp', auth, async (req, res) => {
    try {
      if (typeof waListContacts !== 'function') return bad(res, 'WhatsApp capture is not available on this server.', 503);
      const b = req.crm.body;
      const uidWa = sstr(b.account || '', 60);
      const contacts = await waListContacts(uidWa, { refresh: true });
      if (!contacts || !contacts.length) return bad(res, 'No contacts came back from WhatsApp. Make sure the number is linked and has synced.', 409);
      const companyId = req.crm.company.id;
      const all = await list(C.contact, { companyId });
      const byPhone = new Map();
      for (const c of all) for (const p of (c.phones || [])) { const d = String(p).replace(/\D/g, '').slice(-9); if (d.length >= 7) byPhone.set(d, c); }
      let added = 0, merged = 0;
      for (const w of contacts.slice(0, 3000)) {
        const phone = String(w.phone || w.id || '').replace(/\D/g, '');
        if (phone.length < 7) continue;
        const tail = phone.slice(-9);
        const hit = byPhone.get(tail);
        if (hit) {
          if (!(hit.phones || []).some((p) => String(p).replace(/\D/g, '').endsWith(tail))) {
            hit.phones = [...(hit.phones || []), phone];
            hit.updatedAt = nowMs();
            await put(C.contact, hit);
          }
          merged++;
          continue;
        }
        const c = Object.assign({}, normalizeContact({ name: w.name || '', phones: [phone], source: 'whatsapp' }, null), {
          id: uid(), companyId, createdAt: nowMs(), updatedAt: nowMs(),
          createdBy: req.crm.member.id, createdByName: req.crm.member.name, lastContactAt: 0
        });
        if (!c.name) c.name = '+' + phone;
        await put(C.contact, c);
        byPhone.set(tail, c);
        added++;
      }
      await log(companyId, req.crm.member, 'import', 'Captured WhatsApp contacts: ' + added + ' new, ' + merged + ' already known.');
      res.json({ ok: true, added, merged, scanned: contacts.length });
    } catch (e) { fail(res, e); }
  });

  // ---------- settings + dashboard ----------
  app.patch(api + '/settings', auth, ownerOnly, async (req, res) => {
    try {
      const b = req.crm.body;
      const c = req.crm.company;
      if (b.name) c.name = sstr(b.name, 120).trim();
      if (b.currency) c.currency = sstr(b.currency, 8).toUpperCase();
      if (Array.isArray(b.stages) && b.stages.length >= 2) {
        c.stages = b.stages.filter((s) => s && s.id && s.name).map((s) => ({ id: sstr(s.id, 30), name: sstr(s.name, 40), probability: Math.max(0, Math.min(100, Number(s.probability) || 0)) }));
      }
      if (Array.isArray(b.customFields)) {
        c.customFields = b.customFields.filter((f) => f && f.name).map((f) => ({
          id: sstr(f.id || uid(), 30), name: sstr(f.name, 60), key: norm(f.name).replace(/\s+/g, '_'),
          type: ['text', 'number', 'select', 'date'].includes(f.type) ? f.type : 'text',
          options: Array.isArray(f.options) ? f.options.map((o) => sstr(o, 40)) : [], target: f.target === 'deal' ? 'deal' : 'contact'
        }));
      }
      await put(C.company, c);
      res.json({ ok: true, company: publicCompany(c) });
    } catch (e) { fail(res, e); }
  });

  // Everything the app needs after login, in ONE round trip (was 5 separate requests).
  app.get(api + '/bootstrap', auth, async (req, res) => {
    try {
      const companyId = req.crm.company.id;
      const [contacts, deals, acts, tasks, members] = await Promise.all([
        list(C.contact, { companyId }), list(C.deal, { companyId }),
        list(C.act, { companyId }), list(C.task, { companyId }), list(C.member, { companyId })
      ]);
      res.json({
        ok: true,
        member: publicMember(req.crm.member),
        company: publicCompany(req.crm.company),
        contacts: contacts.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
        deals: deals.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
        tasks: tasks.sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || String(a.dueDate || '').localeCompare(String(b.dueDate || ''))),
        members: members.map(publicMember).sort((a, b) => (a.role === 'owner' ? -1 : 1)),
        dashboard: dashboardOf(req.crm.company, contacts, deals, acts, tasks, members)
      });
    } catch (e) { fail(res, e); }
  });

  app.get(api + '/dashboard', auth, async (req, res) => {
    try {
      const companyId = req.crm.company.id;
      const [contacts, deals, acts, tasks, members] = await Promise.all([
        list(C.contact, { companyId }), list(C.deal, { companyId }),
        list(C.act, { companyId }), list(C.task, { companyId }), list(C.member, { companyId })
      ]);
      res.json(Object.assign({ ok: true, currency: req.crm.company.currency || 'USD' }, dashboardOf(req.crm.company, contacts, deals, acts, tasks, members)));
    } catch (e) { fail(res, e); }
  });

  console.log('[CRM] 🏢 CRM routes registered at ' + api + ' (' + (USE_FIRESTORE ? 'Firestore' : 'local file store: ' + DB_FILE) + ', linked owner: ' + LINKED_EMAIL + ')');
}
