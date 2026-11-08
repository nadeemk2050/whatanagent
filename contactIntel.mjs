// ============================================================================
// 🎩 CONTACT INTEL — Mr. Zaheer is the data steward of the Contact Book.
//  - imports every WhatsApp Web contact (address-book name + WhatsApp profile name)
//  - reads the stored chat of a contact and fills the missing business fields
//    (company, country, city, address, website, email, buyer/seller, materials ...)
//  - tells the reply prompt which details are still missing, so Zaheer can ask for them naturally
// Nothing here messages anybody by itself. Manual edits always win over AI-filled values.
// ============================================================================
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { callAgentModel } from './agentRunner.mjs';
import { DEFAULT_AGENT } from './agentTemplates.mjs';
import { listContacts, getContact, setContact, bulkSetContacts, contactPhones } from './contactStore.mjs';

let DB = null;
const TYPES = ['Customer', 'VIP Customer', 'Buyer', 'Seller', 'Info only', 'Relative', 'Partner', 'Other'];
const FIELD_LABEL = {
  name: 'full name', type: 'contact type (buyer / seller / just info / relative)', company: 'company name',
  country: 'country', city: 'city', address: 'address', website: 'website', email: 'email',
  wantsToBuy: 'materials they want to BUY', wantsToSell: 'materials they want to SELL', materials: 'materials they buy or sell'
};
const AI_FIELDS = ['name', 'company', 'designation', 'country', 'city', 'address', 'website', 'email', 'type', 'wantsToBuy', 'wantsToSell'];

const digits = (s) => String(s == null ? '' : s).replace(/\D/g, '');
const clean = (v, n = 300) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);

export function normType(t) {
  const s = String(t || '').trim().toLowerCase();
  if (!s) return '';
  if (s.startsWith('vip')) return 'VIP Customer';
  if (s === 'customer' || s === 'client') return 'Customer';
  if (s === 'buyer') return 'Buyer';
  if (s === 'seller' || s === 'supplier' || s === 'vendor') return 'Seller';
  if (s.startsWith('info')) return 'Info only';
  if (s === 'relative' || s === 'family') return 'Relative';
  if (s === 'partner') return 'Partner';
  return 'Other';
}

// KEEP IN SYNC with missingFieldsJs() in public/admin.html (same rules drive the completeness bar).
export function missingFields(c) {
  c = c || {};
  const has = (k) => String(c[k] == null ? '' : c[k]).trim() !== '';
  const type = normType(c.type);
  const m = [];
  if (!has('name')) m.push('name');
  if (!type) m.push('type');
  if (type === 'Relative' || type === 'Info only') {
    ['country', 'city'].forEach(k => { if (!has(k)) m.push(k); });
    return m;
  }
  ['company', 'country', 'city', 'address', 'website', 'email'].forEach(k => { if (!has(k)) m.push(k); });
  if (type === 'Buyer' || type === 'Customer' || type === 'VIP Customer') { if (!has('wantsToBuy') && !has('products')) m.push('wantsToBuy'); }
  else if (type === 'Seller') { if (!has('wantsToSell') && !has('products')) m.push('wantsToSell'); }
  else if (!has('wantsToBuy') && !has('wantsToSell') && !has('products')) m.push('materials');
  return m;
}

function extractJson(text) {
  const t = String(text || '').replace(/```(?:json)?/gi, '');
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  try { return JSON.parse(t.substring(s, e + 1)); } catch (err) { return null; }
}

// ---------------------------------------------------------------- settings (cached)
let settingsCache = { at: 0, v: { autoCollect: true, nudge: true } };
export async function getIntelSettings(force = false) {
  if (!force && Date.now() - settingsCache.at < 60000) return settingsCache.v;
  let v = { autoCollect: true, nudge: true };
  try {
    const snap = DB ? await getDoc(doc(DB, 'appData', 'contactIntel')) : null;
    if (snap && snap.exists()) v = { autoCollect: snap.data().autoCollect !== false, nudge: snap.data().nudge !== false };
  } catch (e) { /* keep defaults */ }
  settingsCache = { at: Date.now(), v };
  return v;
}

// ---------------------------------------------------------------- extraction
async function loadWa() { return import('./waWebClient.js'); }

const bookCache = new Map();   // phone -> { at, data }
function invalidate(phone) { bookCache.delete(phone); }

async function readBookDoc(phone) {
  return await getContact(phone);
}

export async function fillContact(phoneIn, { auto = false } = {}) {
  const phone = digits(phoneIn);
  if (!DB || phone.length < 6) return { ok: false, status: 'error', message: 'Valid phone required.' };
  const existing = (await readBookDoc(phone)) || {};
  const before = missingFields(existing);
  if (!before.length) return { ok: true, status: 'complete', message: 'Nothing missing.', filled: [], missing: [] };

  const wa = await loadWa();
  const tr = await wa.getWaWebChatTranscriptByPhone(phone, 80);
  if (!tr) return { ok: true, status: 'no-chat', message: 'No WhatsApp chat with this number yet - nothing to read.', filled: [], missing: before };
  if (tr.blocked) return { ok: true, status: 'blocked', message: 'This chat is set to Full OFF - Zaheer does not read it.', filled: [], missing: before };
  const contactLines = tr.lines.filter(l => l.startsWith('CONTACT:')).length;
  if (contactLines < 2) return { ok: true, status: 'too-short', message: 'Not enough conversation yet.', filled: [], missing: before };

  let transcript = tr.lines.join('\n');
  if (transcript.length > 9000) transcript = transcript.slice(-9000);
  const known = {};
  ['name', 'company', 'designation', 'country', 'city', 'address', 'website', 'email', 'type', 'wantsToBuy', 'wantsToSell', 'products']
    .forEach(k => { if (clean(existing[k])) known[k] = clean(existing[k]); });

  const system =
    'You are ' + DEFAULT_AGENT.name + ', data steward of the boss\'s Contact Book at a trading company. ' +
    'Read the WhatsApp conversation (OWNER = the boss side, CONTACT = the other person) and extract ONLY facts that are explicitly stated or unmistakably confirmed in it.\n' +
    'Return ONE JSON object, no markdown, with exactly these keys (use "" when unknown - never guess):\n' +
    '{"name":"the person\'s real full name only if the chat confirms it","company":"","designation":"job title","country":"","city":"","address":"",' +
    '"website":"","email":"","type":"Buyer | Seller | Info only | Relative | Partner | Other | \'\'",' +
    '"wantsToBuy":"materials/products they want to buy","wantsToSell":"materials/products they want to sell","otherDetails":"one or two short useful facts (quantities, terms, preferences)"}\n' +
    'Rules: the WhatsApp profile name is NOT a confirmed name unless the chat uses it as their name; ' +
    '"type" is Buyer if they want to purchase from us, Seller if they offer goods to us, Relative for family/friends, Info only for general enquiries; ' +
    'do not repeat what is already known; keep each value short; keep original language of names; write materials in English.';
  const user =
    'WhatsApp profile name: ' + (clean(existing.waName) || '(unknown)') + '\n' +
    'Phone: +' + phone + '\n' +
    'Already known: ' + JSON.stringify(known) + '\n\n' +
    'CONVERSATION:\n' + transcript;

  let r;
  try {
    r = await callAgentModel({
      system, messages: [{ role: 'user', content: user }],
      model: 'gemini-3.8-flash', fallbackModel: 'qwen3.8-flash',
      temperature: 0.1, maxTokens: 700, agentName: DEFAULT_AGENT.name, purpose: auto ? 'contact-intel-auto' : 'contact-intel'
    });
  } catch (e) {
    return { ok: false, status: 'error', message: 'AI call failed: ' + String(e.message || e).slice(0, 160), filled: [], missing: before };
  }
  const j = extractJson(r.text);
  if (!j) return { ok: false, status: 'error', message: 'AI returned no usable data.', filled: [], missing: before };

  const aiMap = (existing.aiFields && typeof existing.aiFields === 'object') ? existing.aiFields : {};
  const patch = {};
  const filled = [];
  for (const k of AI_FIELDS) {
    let val = clean(j[k], k === 'address' ? 300 : 200);
    if (!val) continue;
    if (k === 'email') { val = val.toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) continue; }
    if (k === 'type') { val = normType(val); if (!val) continue; }
    const cur = clean(existing[k]);
    if (cur && !aiMap[k]) continue;          // never overwrite a manual / imported value
    if (cur === val) continue;
    patch[k] = val;
    filled.push(k);
  }
  const other = clean(j.otherDetails, 400);
  if (other && other !== clean(existing.aiNotes)) patch.aiNotes = other;

  const merged = { ...existing, ...patch };
  const missing = missingFields(merged);
  const out = {
    ...patch,
    phone, zaheerAt: Date.now(), zaheerMsgs: tr.total || 0,
    zaheerStatus: missing.length ? 'partial' : 'complete', updatedAt: Date.now()
  };
  if (filled.length) {
    out.aiFields = Object.fromEntries(filled.map(k => [k, true]));
    if (filled.includes('name')) out.nameSource = 'chat';
    if (!existing.source) out.source = auto ? 'WhatsApp Web (Zaheer)' : 'Zaheer';
    if (!existing.createdAt) out.createdAt = Date.now();
  }
  await setContact(phone, out, { merge: true });
  invalidate(phone);
  return { ok: true, status: missing.length ? 'partial' : 'complete', filled, missing, usedModel: r.model };
}

export async function fillBatch({ limit = 5, force = false } = {}) {
  limit = Math.max(1, Math.min(parseInt(limit, 10) || 5, 15));
  const all = await listContacts();
  const cutoff = Date.now() - 24 * 3600 * 1000;
  const cands = [];
  for (const c of all) {
    if (!c.inChat) continue;
    if (!force && c.zaheerAt && c.zaheerAt > cutoff) continue;
    if (!missingFields(c).length) continue;
    cands.push({ phone: digits(c.phone || c.id), ts: c.lastMessageTs || c.lastChatAt || 0 });
  }
  cands.sort((a, b) => b.ts - a.ts);
  const results = { tried: 0, filledContacts: 0, noChat: 0, tooShort: 0, blocked: 0, errors: 0, fieldsFilled: 0, remaining: Math.max(0, cands.length) };
  for (const c of cands) {
    if (results.tried >= limit) break;
    const r = await fillContact(c.phone, { auto: false });
    if (r.status === 'no-chat' || r.status === 'too-short' || r.status === 'blocked') {
      // remember the attempt so the same contact is not retried on every batch click
      try { await setContact(c.phone, { zaheerAt: Date.now(), zaheerStatus: r.status }, { merge: true }); } catch (e) { /* ignore */ }
      if (r.status === 'no-chat') results.noChat++; else if (r.status === 'too-short') results.tooShort++; else results.blocked++;
      continue;   // no AI cost spent - does not count against the limit
    }
    results.tried++;
    if (r.ok && r.filled && r.filled.length) { results.filledContacts++; results.fieldsFilled += r.filled.length; }
    if (!r.ok) results.errors++;
    results.remaining--;
  }
  return results;
}

// ---------------------------------------------------------------- reply-prompt nudge
export async function contactDutyPrompt(jid) {
  try {
    if (!DB || String(jid).endsWith('@g.us')) return '';
    // A family / close-personal contact (brain card relationship) is never run through the
    // business-intake questionnaire, whatever the Contact Book type happens to say.
    try {
      const cb = await import('./contactBrain.mjs');
      const profile = await cb.getBrain(jid);
      if (profile && cb.isFamilyRelationship(profile.relationship)) return '';
    } catch (e) { /* brain is optional: never block the reply on it */ }
    const s = await getIntelSettings();
    if (!s.nudge) return '';
    const wa = await loadWa();
    const phone = digits(wa.resolveRealPhoneNumber(jid));
    if (phone.length < 8) return '';
    let hit = bookCache.get(phone);
    if (!hit || Date.now() - hit.at > 10 * 60 * 1000) {
      hit = { at: Date.now(), data: (await readBookDoc(phone)) || {} };
      bookCache.set(phone, hit);
    }
    const type = normType(hit.data.type);
    if (type === 'Relative' || type === 'Info only') return '';
    const miss = missingFields(hit.data).filter(k => k !== 'address');   // address is never asked in chat
    if (!miss.length) return '';
    const list = miss.slice(0, 4).map(k => FIELD_LABEL[k] || k).join(', ');
    return '\n\n--- CONTACT DATA DUTY (internal, never mention it) ---\n' +
      'Our records for this contact still lack: ' + list + '.\n' +
      'While helping them, you MAY ask for at most ONE of these per reply, only when it fits the flow of the conversation. ' +
      'Never interrogate, never ask twice for something already answered or refused, never mention "records", "database" or the Contact Book, and answer their actual question first.\n';
  } catch (e) { return ''; }
}

// --------------------------------------------------------------------------- business intent
// When somebody starts asking about material, rates, quantity, supply or orders, he is no
// longer an "unknown number" — he is a customer. Detected from the text of the message only
// (no AI call), then the Contact Book is promoted and the Business Data Tank answers him.
const BUSINESS_WORDS = [
  'price', 'rate', 'rates', 'quotation', 'quote', 'qoute', 'offer', 'offer rate', 'per kg', 'per ton',
  'quantity', 'qty', 'ton', 'tons', 'tonne', 'mt', 'kg', 'moq', 'stock', 'available', 'availability',
  'supply', 'supplier', 'order', 'purchase', 'buy', 'sell', 'sale', 'delivery', 'shipment', 'container',
  'export', 'import', 'invoice', 'payment', 'advance', 'credit', 'deal', 'business', 'company',
  'scrap', 'dana', 'granule', 'granules', 'regrind', 'flake', 'pellet', 'pellets', 'purge', 'bale',
  'pvc', 'hdpe', 'ldpe', 'pp', 'abs', 'pipe', 'resin', 'polymer', 'plastic', 'material', 'grade',
  'gst', 'ntn', 'hs code', 'specification', 'specs', 'datasheet', 'sample', 'mill', 'factory',
  'rate kya', 'rate kia', 'kitne ka', 'kitna hai', 'kitne mein', 'price kya', 'qemat', 'keemat',
  'tijarat', 'karobar', 'maal', 'samaan', 'supply kar', 'chahiye'
];
const BUSINESS_STRONG = [
  'price', 'rate', 'quotation', 'quote', 'qty', 'quantity', 'ton', 'tons', 'tonne', 'moq', 'stock',
  'supply', 'order', 'purchase', 'invoice', 'gst', 'ntn', 'hs code', 'scrap', 'dana', 'granule',
  'regrind', 'flake', 'pellet', 'pvc', 'hdpe', 'ldpe', 'resin', 'polymer', 'kitne ka', 'rate kya', 'rate kia'
];
export function businessIntentScore(text) {
  const t = ' ' + String(text || '').toLowerCase().replace(/[^a-z0-9\u0600-\u06FF ]+/g, ' ').replace(/\s+/g, ' ') + ' ';
  if (t.trim().length < 3) return 0;
  let score = 0;
  for (const w of BUSINESS_STRONG) if (t.includes(' ' + w + ' ') || t.includes(' ' + w + 's ')) { score += 2; break; }
  for (const w of BUSINESS_WORDS) if (t.includes(' ' + w + ' ')) { score += 1; break; }
  if (/\?/.test(String(text || ''))) score += 1;
  return score;
}
export const looksLikeBusinessEnquiry = (text) => businessIntentScore(text) >= 2;

// Promote the Contact Book entry to Customer / VIP Customer. Relative and "Info only" are
// never touched, and a manual choice always wins.
export async function markBusinessContact(phoneIn, { vip = false } = {}) {
  try {
    const phone = digits(phoneIn);
    if (phone.length < 8) return null;
    const cur = (await readBookDoc(phone)) || {};
    const type = normType(cur.type);
    if (type === 'Relative' || type === 'Info only') return null;
    if (type === 'VIP Customer') return cur;                       // already the highest tier
    // Seller / Partner / Buyer are already business types — do not downgrade them.
    const keep = (type === 'Seller' || type === 'Partner' || type === 'Buyer' || type === 'Customer') && !vip;
    const next = keep ? type : (vip ? 'VIP Customer' : 'Customer');
    if (type === next) return cur;
    const saved = await setContact(phone, { ...cur, type: next, typeSource: 'auto-business-intent', typeAt: Date.now() }, { merge: true });
    invalidate(phone);
    console.log('[CONTACT-INTEL] ⬆️ ' + phone + ' promoted to ' + next + ' (business enquiry)');
    return saved || { ...cur, type: next };
  } catch (e) {
    console.warn('[CONTACT-INTEL] promote failed:', e.message);
    return null;
  }
}

// ---------------------------------------------------------------- auto-collect (debounced per chat)
const timers = new Map();
let autoRuns = { day: '', n: 0 };
const AUTO_DAILY_CAP = 40;

export function scheduleAutoFill(jid) {
  try {
    if (!DB || !jid || String(jid).endsWith('@g.us') || String(jid) === 'status@broadcast') return;
    if (timers.has(jid)) clearTimeout(timers.get(jid));
    const t = setTimeout(async () => {
      timers.delete(jid);
      try {
        const s = await getIntelSettings();
        if (!s.autoCollect) return;
        const wa = await loadWa();
        const st = wa.getContactAiState(jid);
        if (st.status !== 'active' || st.source === 'boss') return;
        const phone = digits(wa.resolveRealPhoneNumber(jid));
        if (phone.length < 8) return;
        const day = new Date().toISOString().slice(0, 10);
        if (autoRuns.day !== day) autoRuns = { day, n: 0 };
        if (autoRuns.n >= AUTO_DAILY_CAP) return;
        const ex = (await readBookDoc(phone)) || {};
        if (ex.zaheerAt && Date.now() - ex.zaheerAt < 6 * 3600 * 1000) return;
        if (!missingFields(ex).length) return;
        autoRuns.n++;
        await fillContact(phone, { auto: true });
      } catch (e) { /* background helper must never throw */ }
    }, 3 * 60 * 1000);
    if (t.unref) t.unref();
    timers.set(jid, t);
  } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------- import from WhatsApp Web
async function importFromWa({ scope = 'all', onlyExisting = false, dryRun = false } = {}) {
  const wa = await loadWa();
  const rows = wa.listWaWebAddressBook();
  if (!rows.length) return { ok: false, error: 'WhatsApp Web has no contacts yet - connect it (or wait for the sync to finish) and try again.' };
  const knownPhones = await contactPhones();
  const bookPhones = new Set(knownPhones);

  const stats = { whatsappContacts: rows.length, selected: 0, created: 0, updated: 0, unchanged: 0, skipped: 0 };
  const ops = [];
  for (const r of rows) {
    if (scope === 'saved' && !r.savedName) { stats.skipped++; continue; }
    if (scope === 'chats' && !r.hasChat) { stats.skipped++; continue; }
    const exists = bookPhones.has(r.phone);
    if (!exists && onlyExisting) { stats.skipped++; continue; }
    stats.selected++;
    const waName = r.waName || r.verifiedName || '';
    if (!exists) {
      const data = { phone: r.phone, phoneRaw: r.phone, source: 'WhatsApp Web (import)', inChat: !!r.hasChat, createdAt: Date.now(), updatedAt: Date.now() };
      if (waName) data.waName = waName;
      if (r.savedName) { data.name = r.savedName; data.nameSource = 'phonebook'; }
      if (r.lastActive) data.lastMessageTs = r.lastActive;
      stats.created++;
      ops.push({ phone: r.phone, data });
      continue;
    }
    const c = await getContact(r.phone);
    const patch = {};
    if (waName && clean(c && c.waName) !== waName) patch.waName = waName;
    if (r.savedName && !clean(c && c.name)) { patch.name = r.savedName; patch.nameSource = 'phonebook'; }
    if (r.hasChat && !(c && c.inChat)) patch.inChat = true;
    if (r.lastActive && r.lastActive > ((c && c.lastMessageTs) || 0)) patch.lastMessageTs = r.lastActive;
    if (!Object.keys(patch).length) { stats.unchanged++; continue; }
    patch.updatedAt = Date.now();
    stats.updated++;
    ops.push({ phone: r.phone, data: patch });
  }
  if (!dryRun && ops.length) {
    await bulkSetContacts(ops.map(o => ({ ...o.data, phone: o.phone })), { merge: true });
    bookCache.clear();
  }
  return { ok: true, dryRun, ...stats };
}

// ---------------------------------------------------------------- routes
export function registerContactIntelRoutes(app, db) {
  DB = db;
  const base = '/api/contactbook';
  // Same policy as the existing /api/contactbook routes (they hold no secrets): open while
  // ADMIN_TOKEN is unset, otherwise the caller must send the dashboard's x-admin-token.
  const guard = (req, res, next) => {
    const tok = String(req.get('x-admin-token') || req.query.token || '');
    if (!process.env.ADMIN_TOKEN || tok === process.env.ADMIN_TOKEN) return next();
    return res.status(401).json({ ok: false, error: 'Admin token required (set it in the dashboard).' });
  };

  app.get(base + '/zaheer-settings', guard, async (req, res) => {
    res.json({ ok: true, settings: await getIntelSettings(true) });
  });
  app.post(base + '/zaheer-settings', guard, async (req, res) => {
    try {
      const b = req.body || {};
      const cur = await getIntelSettings(true);
      const next = { autoCollect: b.autoCollect === undefined ? cur.autoCollect : !!b.autoCollect, nudge: b.nudge === undefined ? cur.nudge : !!b.nudge };
      await setDoc(doc(DB, 'appData', 'contactIntel'), { ...next, updatedAt: Date.now() }, { merge: true });
      settingsCache = { at: Date.now(), v: next };
      res.json({ ok: true, settings: next });
    } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e).slice(0, 200) }); }
  });

  app.post(base + '/import-wa', guard, async (req, res) => {
    try {
      const b = req.body || {};
      const scope = ['all', 'saved', 'chats'].includes(b.scope) ? b.scope : 'all';
      const r = await importFromWa({ scope, onlyExisting: !!b.onlyExisting, dryRun: !!b.dryRun });
      res.status(r.ok ? 200 : 409).json(r);
    } catch (e) { res.status(500).json({ ok: false, error: 'WhatsApp import failed: ' + String(e.message || e).slice(0, 200) }); }
  });

  app.post(base + '/zaheer-batch', guard, async (req, res) => {
    try {
      const b = req.body || {};
      res.json({ ok: true, ...(await fillBatch({ limit: b.limit, force: !!b.force })) });
    } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e).slice(0, 200) }); }
  });

  app.post(base + '/:phone/zaheer', guard, async (req, res) => {
    try {
      const r = await fillContact(req.params.phone, { auto: false });
      res.status(r.status === 'error' ? 502 : 200).json(r);
    } catch (e) { res.status(500).json({ ok: false, status: 'error', message: String(e.message || e).slice(0, 200) }); }
  });

  console.log('[CONTACT-INTEL] 🎩 Zaheer contact data steward registered');
}
