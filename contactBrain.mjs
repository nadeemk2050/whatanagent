// ============================================================================
// 🧠 CONTACT BRAIN — per-person AI personality, memory & relationship rules
// ============================================================================
// Every WhatsApp contact can get a "brain card": who he is, how you talk to
// him, what the AI may/may not do — plus persona BLENDING (mix 3-4+ styles
// with weights, e.g. Respect 70 + Comedy 40 + Caring 30) and LEARNED memory
// (the AI studies your own past messages to that person and imitates you).
//
// Entry points:
//   attachBrainDb(db)            — give this module Firestore (called from index.js)
//   registerBrainRoutes(app,db)  — dashboard API (card CRUD, AI discussion, preview, learning, drafts)
//   getBrainForReply(jid,name)   — used by waWebClient auto-reply pipeline
//   brainPromptSectionForJid(jid)— the prompt block injected before every AI reply
//   saveBrainDraft(...) / escalateBrain(...)
//
// The AI DISCUSSION AREA lives at the bottom: /api/brain/:jid/discuss etc.
// ============================================================================

import { doc, getDoc, setDoc, getDocs, collection, addDoc, deleteDoc, query, orderBy, limit, where } from 'firebase/firestore';

let brainDb = null;
export function attachBrainDb(db) { if (db) brainDb = db; }

const BRAINS = 'contactBrains';      // one doc per contact (id = sanitized jid)
const DRAFTS = 'brainDrafts';        // pending drafts/alerts/escalations
const CFG_DOC = ['appData', 'brainConfig'];

// ---------------------------------------------------------------------------
// PERSONA CATALOG — personas are DIALS (0-100 weights), not switches.
// The AI blends them: highest weight = main personality, others are flavors.
// ---------------------------------------------------------------------------
export const PERSONAS = {
  Brother:      { icon: '👨‍👦', label: 'Brother / Family', desc: 'Warm, caring, casual family tone. NO business talk at all.' },
  Yaar:         { icon: '🤝', label: 'Yaar (Close Friend)', desc: 'Casual close-friend tone; slang, short messages, teasing allowed.' },
  Comedy:       { icon: '😂', label: 'Comedy', desc: 'Add light, clean humor. Keep jokes short.' },
  Jolly:        { icon: '🎉', label: 'Jolly', desc: 'Cheerful, high-energy; some emojis.' },
  Respect:      { icon: '🙏', label: 'Respect (Adab)', desc: 'Polite words (aap, ji, sir). Never tease or insult.' },
  Direct:       { icon: '➡️', label: 'Straight / Direct', desc: 'Short, no small talk, facts only.' },
  Professional: { icon: '💼', label: 'Professional', desc: 'Formal, clear, business-like language.' },
  SalesPro:     { icon: '📈', label: 'Sales Pro', desc: 'Friendly selling tone; may offer products, packages, invoices.' },
  Naughty:      { icon: '😜', label: 'Naughty (light)', desc: 'Playful light teasing ONLY for approved people; never vulgar.' },
  Attitude:     { icon: '😎', label: 'Attitude', desc: 'Confident, slightly cold; never rude. For pushy or rude people.' },
  Caring:       { icon: '🫶', label: 'Caring / Emotional', desc: 'Gentle, supportive; asks how they are. For sad or stressed people.' },
  ElderRespect: { icon: '🧓', label: 'Elder Respect', desc: 'Very respectful, slow, simple language (parents, uncles).' }
};

// Clashing mixes resolved automatically (server-side, cannot be bypassed)
export const CONFLICTS = [
  { a: 'Respect', b: 'Naughty', maxB: 10 },
  { a: 'Brother', b: 'SalesPro', maxB: 0 },
  { a: 'ElderRespect', b: 'Comedy', maxB: 20 },
  { a: 'Respect', b: 'Attitude', maxB: 30 },
  { a: 'ElderRespect', b: 'Naughty', maxB: 0 }
];

export const PRESETS = {
  'The Gentleman':        [{ name: 'Respect', weight: 70 }, { name: 'Professional', weight: 40 }, { name: 'Caring', weight: 20 }],
  'Funny Cousin':         [{ name: 'Yaar', weight: 60 }, { name: 'Comedy', weight: 70 }, { name: 'Jolly', weight: 40 }],
  'Respectful Joker':     [{ name: 'Respect', weight: 60 }, { name: 'Comedy', weight: 40 }],
  'Loving Brother':       [{ name: 'Brother', weight: 80 }, { name: 'Caring', weight: 50 }, { name: 'Comedy', weight: 30 }],
  'Boss Mode':            [{ name: 'Direct', weight: 70 }, { name: 'Attitude', weight: 40 }, { name: 'Professional', weight: 40 }],
  'Smooth Closer':        [{ name: 'SalesPro', weight: 60 }, { name: 'Jolly', weight: 30 }, { name: 'Respect', weight: 40 }],
  'Elder Care':           [{ name: 'ElderRespect', weight: 90 }, { name: 'Caring', weight: 60 }],
  'Cool Colleague':       [{ name: 'Professional', weight: 50 }, { name: 'Yaar', weight: 30 }, { name: 'Comedy', weight: 20 }],
  'Angry Customer Handler': [{ name: 'Caring', weight: 60 }, { name: 'Professional', weight: 60 }, { name: 'Direct', weight: 30 }]
};

export const RELATIONSHIPS = ['family', 'brother', 'sister', 'parent', 'relative', 'close friend', 'friend', 'colleague', 'customer', 'vip customer', 'supplier', 'partner', 'stranger', 'other'];
export const MODES = { auto: '🤖 Auto-reply', draft_only: '📥 Draft only (you approve)', alert_only: '🔔 Alert only (no AI reply)', silent: '🔇 Silent guard (never replies, alerts you)' };

// ---------------------------------------------------------------------------
// Field sanitizers (server-side clamps — the UI can never break the DB)
// ---------------------------------------------------------------------------
const sstr = (v, n = 300) => String(v == null ? '' : v).substring(0, n);
const asBool = (v) => v === true || String(v).toLowerCase() === 'true' || String(v).toLowerCase() === 'on';
const clamp = (v, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo; };

export function sanitizePersonas(list) {
  const out = [];
  const seen = new Set();
  for (const p of (Array.isArray(list) ? list : []).slice(0, 8)) {
    const name = sstr(p && p.name, 30);
    if (!PERSONAS[name] || seen.has(name)) continue;
    seen.add(name);
    out.push({ name, weight: clamp(p.weight, 0, 100) });
  }
  // conflict resolution — always applied, non-negotiable
  for (const c of CONFLICTS) {
    const A = out.find(p => p.name === c.a);
    const B = out.find(p => p.name === c.b);
    if (A && B) B.weight = Math.min(B.weight, c.maxB);
  }
  return out.filter(p => p.weight > 0).sort((x, y) => y.weight - x.weight);
}

export function sanitizeProfile(raw, existing = {}) {
  const p = {};
  p.jid = sstr(raw.jid || existing.jid, 80);
  p.phone = sstr(raw.phone || existing.phone, 20).replace(/[^0-9]/g, '');
  p.name = sstr(raw.name != null ? raw.name : existing.name, 60);
  p.nickname = sstr(raw.nickname != null ? raw.nickname : existing.nickname, 60);      // what you call him
  p.callsYou = sstr(raw.callsYou != null ? raw.callsYou : existing.callsYou, 60);      // what he calls you
  p.age = sstr(raw.age != null ? raw.age : existing.age, 6);
  p.gender = sstr(raw.gender != null ? raw.gender : existing.gender, 12);
  p.relationship = sstr(raw.relationship != null ? raw.relationship : existing.relationship, 30).toLowerCase();
  p.language = sstr(raw.language != null ? raw.language : existing.language, 40) || 'Roman Urdu';
  p.length = ['short', 'medium', 'detailed'].includes(raw.length || existing.length) ? (raw.length || existing.length) : 'short';
  p.emojiLevel = ['none', 'low', 'high'].includes(raw.emojiLevel || existing.emojiLevel) ? (raw.emojiLevel || existing.emojiLevel) : 'low';
  p.mode = ['auto', 'draft_only', 'alert_only', 'silent'].includes(raw.mode || existing.mode) ? (raw.mode || existing.mode) : 'auto';
  p.personas = sanitizePersonas(raw.personas != null ? raw.personas : existing.personas);
  const rd = raw.dials || {};
  const ed = existing.dials || {};
  p.dials = {
    formality: clamp(rd.formality != null ? rd.formality : (ed.formality != null ? ed.formality : 40), 0, 100),
    humor: clamp(rd.humor != null ? rd.humor : (ed.humor != null ? ed.humor : 30), 0, 100),
    warmth: clamp(rd.warmth != null ? rd.warmth : (ed.warmth != null ? ed.warmth : 50), 0, 100),
    slang: clamp(rd.slang != null ? rd.slang : (ed.slang != null ? ed.slang : 40), 0, 100),
    patience: clamp(rd.patience != null ? rd.patience : (ed.patience != null ? ed.patience : 60), 0, 100)
  };
  const rp = raw.permissions || {};
  const ep = existing.permissions || {};
  p.permissions = {
    canOfferProducts: asBool(rp.canOfferProducts != null ? rp.canOfferProducts : ep.canOfferProducts),
    canSendInvoice: asBool(rp.canSendInvoice != null ? rp.canSendInvoice : ep.canSendInvoice),
    canTalkPrice: asBool(rp.canTalkPrice != null ? rp.canTalkPrice : ep.canTalkPrice)
  };
  const ns = raw.neverSay != null ? raw.neverSay : existing.neverSay;
  p.neverSay = (Array.isArray(ns) ? ns : String(ns || '').split('\n')).map(x => sstr(x, 80).trim()).filter(Boolean).slice(0, 15);
  p.notes = sstr(raw.notes != null ? raw.notes : existing.notes, 1000);
  p.humanDelay = asBool(raw.humanDelay != null ? raw.humanDelay : existing.humanDelay);
  p.learnEnabled = raw.learnEnabled != null ? asBool(raw.learnEnabled) : (existing.learnEnabled !== false);
  p.autoCreated = existing.autoCreated === true;
  p.createdAt = existing.createdAt || Date.now();
  p.updatedAt = Date.now();
  p.learned = existing.learned || null;
  p.lastLearnedAt = existing.lastLearnedAt || null;
  return p;
}

// ---------------------------------------------------------------------------
// PROMPT BUILDER — the text block injected before every AI reply
// ---------------------------------------------------------------------------
export function buildBrainPromptSection(profile, opts = {}) {
  if (!profile) return '';
  const blend = sanitizePersonas(profile.personas);
  if (!blend.length) blend.push({ name: 'Professional', weight: 60 }, { name: 'Respect', weight: 40 });
  const [main, ...flavors] = blend;
  const perms = profile.permissions || {};
  const dials = profile.dials || {};
  const learned = profile.learned || {};

  let s = '\n\n[🧠 CONTACT BRAIN — PERSONALITY & RELATIONSHIP RULES (highest priority after safety)]\n';
  s += 'You are replying AS the OWNER of this WhatsApp account. NEVER reveal you are an AI.\n';
  s += 'Contact: ' + (profile.name || opts.name || 'this person') +
       (profile.relationship ? ' (' + profile.relationship + ')' : '') +
       (profile.age ? ', age ~' + profile.age : '') + (profile.gender ? ', ' + profile.gender : '') + '\n';
  if (profile.nickname) s += 'You call him: "' + profile.nickname + '".' + (profile.callsYou ? ' He calls you: "' + profile.callsYou + '".' : '') + '\n';
  s += 'MAIN PERSONALITY (' + main.weight + '%): ' + main.name + ' — ' + (PERSONAS[main.name] || {}).desc + '\n';
  for (const f of flavors) s += 'FLAVOR (' + f.weight + '%): ' + f.name + ' — ' + (PERSONAS[f.name] || {}).desc + '\n';
  s += 'Blend these naturally into every message. Higher % = stronger influence. If two styles clash, the higher % wins — but NEVER break respect or safety rules.\n';
  s += 'Language: ' + (profile.language || 'Roman Urdu') + ' (never Devanagari script). Reply length: ' + (profile.length || 'short') + '. Emojis: ' + (profile.emojiLevel || 'low') + '.\n';
  s += 'Tone dials → formality ' + dials.formality + '/100, humor ' + dials.humor + '/100, warmth ' + dials.warmth + '/100, slang ' + dials.slang + '/100.\n';
  s += 'BUSINESS PERMISSIONS: products/offers: ' + (perms.canOfferProducts ? 'ALLOWED' : 'NOT ALLOWED — never offer products, packages, prices or services') +
       '; invoices: ' + (perms.canSendInvoice ? 'allowed' : 'NOT allowed') +
       '; price talk: ' + (perms.canTalkPrice ? 'allowed' : 'NOT allowed') + '.\n';
  if (profile.neverSay && profile.neverSay.length) s += 'NEVER write these phrases: ' + profile.neverSay.join(' | ') + '\n';
  if (learned.style) s += 'How the owner (you) really talks to him — imitate this style: ' + sstr(learned.style, 500) + '\n';
  if (learned.facts && learned.facts.length) s += 'Remember about him: ' + learned.facts.slice(0, 8).map(f => sstr(f, 120)).join('; ') + '\n';
  if (learned.promises && learned.promises.length) s += 'Open promises/deals with him (be consistent): ' + learned.promises.slice(0, 5).map(f => sstr(f, 120)).join('; ') + '\n';
  if (profile.notes) s += 'Owner notes about him: ' + sstr(profile.notes, 500) + '\n';
  s += 'SITUATION AWARENESS: read his last message — if he is angry, sad, stressed or it is an emergency: raise Caring, drop jokes to 0, be gentle. Match his energy; mirror his greeting style.\n';
  s += 'ESCALATION RULE: if the message involves real money problems, a fight, an emergency, sickness or death — reply with exactly: ESCALATE\n';
  s += '[END CONTACT BRAIN]\n';
  return s;
}

// ---------------------------------------------------------------------------
// Storage helpers (cached — 1 Firestore read per contact per 5 minutes max)
// ---------------------------------------------------------------------------
const brainCache = new Map();          // jid -> { profile, at }
const BRAIN_TTL_MS = 5 * 60 * 1000;
let brainConfigMem = null, brainConfigAt = 0;

const sanitizeJid = (jid) => sstr(jid, 80).replace(/[^a-zA-Z0-9._@:-]/g, '_');
export const brainKeyFor = (jid) => sanitizeJid(jid);

export async function getBrainConfig() {
  if (brainConfigMem && (Date.now() - brainConfigAt) < BRAIN_TTL_MS) return brainConfigMem;
  const defaults = { autoClassifyNew: true, learningEnabled: true };
  try {
    if (brainDb) {
      const snap = await getDoc(doc(brainDb, CFG_DOC[0], CFG_DOC[1]));
      brainConfigMem = snap.exists() ? { ...defaults, ...snap.data() } : { ...defaults };
    } else brainConfigMem = { ...defaults };
  } catch (e) { brainConfigMem = { ...defaults }; }
  brainConfigAt = Date.now();
  return brainConfigMem;
}

export async function saveBrainConfig(patch) {
  const cur = await getBrainConfig();
  const next = { ...cur };
  if (patch.autoClassifyNew !== undefined) next.autoClassifyNew = asBool(patch.autoClassifyNew);
  if (patch.learningEnabled !== undefined) next.learningEnabled = asBool(patch.learningEnabled);
  next.updatedAt = Date.now();
  brainConfigMem = next; brainConfigAt = Date.now();
  try { await setDoc(doc(brainDb, CFG_DOC[0], CFG_DOC[1]), next, { merge: true }); } catch (e) { console.error('[BRAIN] config save failed:', e.message); }
  return next;
}

export async function getBrain(jid, { fresh = false } = {}) {
  if (!brainDb || !jid) return null;
  if (jid.endsWith('@g.us')) return null; // groups have no brain cards
  const key = brainKeyFor(jid);
  const hit = brainCache.get(key);
  if (!fresh && hit && (Date.now() - hit.at) < BRAIN_TTL_MS) return hit.profile;
  try {
    const snap = await getDoc(doc(brainDb, BRAINS, key));
    const profile = snap.exists() ? snap.data() : null;
    brainCache.set(key, { profile, at: Date.now() });
    return profile;
  } catch (e) {
    console.warn('[BRAIN] read failed for ' + key + ':', e.message);
    return hit ? hit.profile : null;
  }
}

export async function saveBrain(jid, rawProfile) {
  if (!brainDb || !jid) throw new Error('Brain storage unavailable');
  const key = brainKeyFor(jid);
  const snap = await getDoc(doc(brainDb, BRAINS, key));
  const existing = snap.exists() ? (snap.data() || {}) : {};
  const profile = sanitizeProfile({ ...rawProfile, jid }, existing);
  await setDoc(doc(brainDb, BRAINS, key), profile, { merge: true });
  brainCache.set(key, { profile, at: Date.now() });
  return profile;
}

export async function listBrains(maxCount = 100) {
  if (!brainDb) return [];
  try {
    const snap = await getDocs(query(collection(brainDb, BRAINS), orderBy('updatedAt', 'desc'), limit(maxCount)));
    const out = [];
    snap.forEach(d => out.push({ key: d.id, ...d.data() }));
    return out;
  } catch (e) {
    // orderBy may fail on docs missing the field — fall back to plain listing
    try {
      const snap = await getDocs(query(collection(brainDb, BRAINS), limit(maxCount)));
      const out = []; snap.forEach(d => out.push({ key: d.id, ...d.data() }));
      return out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    } catch (e2) { console.warn('[BRAIN] list failed:', e2.message); return []; }
  }
}

export async function deleteBrain(jid) {
  if (!brainDb || !jid) return;
  const key = brainKeyFor(jid);
  await deleteDoc(doc(brainDb, BRAINS, key));
  brainCache.delete(key);
}

// ---------------------------------------------------------------------------
// Auto-classify brand-new contacts (default card so the AI starts smart)
// ---------------------------------------------------------------------------
export async function maybeAutoCreateBrain(jid, name) {
  if (!brainDb || !jid || jid.endsWith('@g.us')) return null;
  const conf = await getBrainConfig();
  if (!conf.autoClassifyNew) return null;
  const key = brainKeyFor(jid);
  const existing = await getBrain(jid, { fresh: true });
  if (existing) return existing;
  const profile = sanitizeProfile({
    jid, name: name || '', relationship: 'stranger',
    personas: PRESETS['The Gentleman'],
    mode: 'auto'
  }, { autoCreated: true, createdAt: Date.now() });
  try {
    await setDoc(doc(brainDb, BRAINS, key), profile, { merge: true });
    brainCache.set(key, { profile, at: Date.now() });
    console.log('[BRAIN] 🧠 Auto-created default brain card for new contact ' + key);
    return profile;
  } catch (e) { console.warn('[BRAIN] auto-create failed:', e.message); return null; }
}

// Used by waWebClient auto-reply: cached card, auto-create for new contacts
export async function getBrainForReply(jid, name) {
  let profile = await getBrain(jid);
  if (profile) return profile;
  if (jid && !jid.endsWith('@g.us')) return await maybeAutoCreateBrain(jid, name);
  return null;
}

export async function brainPromptSectionForJid(jid, opts = {}) {
  const profile = await getBrain(jid);
  if (!profile) return '';
  return buildBrainPromptSection(profile, opts);
}

// ---------------------------------------------------------------------------
// Drafts / Alerts / Escalations (the "you stay in control" inbox)
// ---------------------------------------------------------------------------
export async function saveBrainDraft({ jid, name, kind, incoming, draft = '', reason = '' }) {
  if (!brainDb) return null;
  try {
    const payload = {
      jid: sstr(jid, 80), name: sstr(name, 60), kind: kind || 'draft',
      incoming: sstr(incoming, 1500), draft: sstr(draft, 3000), reason: sstr(reason, 60),
      status: 'pending', createdAt: Date.now()
    };
    const ref = await addDoc(collection(brainDb, DRAFTS), payload);
    console.log('[BRAIN] 📥 Saved ' + payload.kind + ' for ' + payload.jid + ' (' + (draft ? 'draft ready for approval' : 'alert only') + ')');
    return { id: ref.id, ...payload };
  } catch (e) { console.warn('[BRAIN] draft save failed:', e.message); return null; }
}

export async function escalateBrain({ jid, name, detail }) {
  await saveBrainDraft({ jid, name, kind: 'escalation', incoming: detail, draft: '', reason: 'ESCALATE' });
  // WhatsApp alert to the owner via the existing boss reminder loop
  try {
    const ref = doc(brainDb, 'appData', 'bossReminders');
    const snap = await getDoc(ref);
    const items = snap.exists() ? (snap.data().items || []) : [];
    items.push({
      id: 'brain-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      text: '🧠⚠️ BRAIN ESCALATION' + (name ? ' (' + name + ')' : '') + ': AI stopped replying. Message: "' + sstr(detail, 160) + '" — open the dashboard (🧠 Contact Brains) to handle it.',
      runAt: Date.now(), status: 'pending', createdAt: Date.now()
    });
    await setDoc(ref, { items: items.slice(-200) }, { merge: true });
    console.log('[BRAIN] 🚨 Escalation alert queued for the owner (' + jid + ')');
  } catch (e) { console.warn('[BRAIN] escalation alert failed:', e.message); }
}

export async function listDrafts({ jid = '', pendingOnly = true, maxCount = 60 } = {}) {
  if (!brainDb) return [];
  try {
    const snap = await getDocs(query(collection(brainDb, DRAFTS), orderBy('createdAt', 'desc'), limit(120)));
    let out = [];
    snap.forEach(d => out.push({ id: d.id, ...d.data() }));
    if (jid) out = out.filter(d => d.jid === jid);
    if (pendingOnly) out = out.filter(d => d.status === 'pending');
    return out.slice(0, maxCount);
  } catch (e) { console.warn('[BRAIN] drafts list failed:', e.message); return []; }
}

// ---------------------------------------------------------------------------
// AI helper — multi-model chain (Qwen → Gemini → DeepSeek), same keys as the app
// ---------------------------------------------------------------------------
async function callBrainAI(system, user, { maxTokens = 1200, temperature = 0.5 } = {}) {
  if (!brainDb) return '';
  let st = {};
  try {
    const snap = await getDoc(doc(brainDb, 'appData', 'settings'));
    st = snap.exists() ? snap.data() : {};
  } catch (e) { /* env fallbacks below */ }
  const qwenKey = st.QWEN_API_KEY || process.env.QWEN_API_KEY || st.DASHSCOPE_API_KEY || '';
  const qwenBase = String(st.QWEN_BASE_URL || process.env.QWEN_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, '');
  const qwenModel = st.QWEN_MODEL || process.env.QWEN_MODEL || 'qwen3.8-flash';
  const geminiKey = st.GEMINI_API_KEY || process.env.GEMINI_API_KEY || st.geminiApiKey || '';
  const deepseekKey = st.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY || '';

  const order = [];
  if (qwenKey) order.push('qwen');
  if (geminiKey) order.push('gemini');
  if (deepseekKey) order.push('deepseek');

  for (const p of order) {
    try {
      if (p === 'qwen' || p === 'deepseek') {
        const url = p === 'qwen' ? (qwenBase + '/chat/completions') : 'https://api.deepseek.com/chat/completions';
        const key = p === 'qwen' ? qwenKey : deepseekKey;
        const model = p === 'qwen' ? qwenModel : 'deepseek-chat';
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
          body: JSON.stringify({ model, temperature, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
          signal: AbortSignal.timeout(60000)
        });
        if (!r.ok) { console.warn('[BRAIN AI] ' + p + ' HTTP ' + r.status); continue; }
        const j = await r.json();
        const t = ((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '').trim();
        if (t) { console.log('[BRAIN AI] 🧠 answered via ' + model); return t; }
      } else if (p === 'gemini') {
        for (const gm of ['gemini-2.5-flash', 'gemini-3.6-flash']) {
          try {
            const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + gm + ':generateContent?key=' + geminiKey, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: system + '\n\n' + user }] }] }),
              signal: AbortSignal.timeout(60000)
            });
            if (!r.ok) continue;
            const j = await r.json();
            const t = ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts[0] && j.candidates[0].content.parts[0].text) || '').trim();
            if (t) { console.log('[BRAIN AI] 🧠 answered via ' + gm); return t; }
          } catch (e) { /* next */ }
        }
      }
    } catch (e) { console.warn('[BRAIN AI] ' + p + ' failed: ' + (e.message || '').substring(0, 120)); }
  }
  return '';
}

// ---------------------------------------------------------------------------
// Message history fetch (memory-first via waWebClient; dynamic import - no cycle)
// ---------------------------------------------------------------------------
async function fetchChatMessages(jid, maxMessages = 80) {
  try {
    const { collectBrainChatMessagesForLearning } = await import('./waWebClient.js');
    return await collectBrainChatMessagesForLearning(jid, maxMessages);
  } catch (e) { console.warn('[BRAIN] chat fetch failed:', e.message); return []; }
}

function transcriptFrom(messages, limitEach = 90) {
  return (messages || []).map(m => {
    const who = m.fromMe ? 'ME' : 'THEM';
    const t = sstr(m.text || (m.mediaType ? '[' + m.mediaType + ']' : ''), limitEach);
    return who + ': ' + t;
  }).filter(x => !x.endsWith(': ')).join('\n');
}

// ---------------------------------------------------------------------------
// 🎓 STYLE LEARNING — the AI studies YOUR OWN messages and imitates you
// ---------------------------------------------------------------------------
export async function learnContactStyle(jid, { force = false } = {}) {
  const profile = await getBrain(jid, { fresh: true });
  if (!profile) return { ok: false, error: 'No brain card for this contact yet.' };
  if (profile.learnEnabled === false && !force) return { ok: false, error: 'Learning is switched off for this contact.' };
  const conf = await getBrainConfig();
  if (!conf.learningEnabled && !force) return { ok: false, error: 'Global style learning is switched off.' };

  const messages = await fetchChatMessages(jid, 130);
  if (!messages.length) return { ok: false, error: 'No messages found in the vault for this contact yet.' };
  const mine = messages.filter(m => m.fromMe && m.text).map(m => sstr(m.text, 300));
  if (mine.length < 5) return { ok: false, error: 'Not enough of YOUR messages in this chat yet (need at least 5).' };
  const theirs = messages.filter(m => !m.fromMe && m.text).map(m => sstr(m.text, 200)).slice(-40);

  const system = 'You are a style analyst. Study how the OWNER of a WhatsApp account personally writes to one specific contact, then output ONLY a JSON object (no fences, no commentary):\n' +
    '{ "style": "2-4 sentence summary of how the owner writes to him (language mix, length, emojis, tone, slang, greeting style)", ' +
    '"facts": ["up to 8 concrete personal facts about the contact found in the chat"], ' +
    '"topics": ["up to 6 usual topics"], ' +
    '"mood": "the contact\'s usual mood pattern", ' +
    '"promises": ["up to 4 open promises or pending deals either side mentioned"] }';
  const user = 'OWNER\'S OWN messages to him (most important for style):\n' + mine.slice(-90).join('\n') +
    '\n\nHIS messages (for facts/mood):\n' + theirs.join('\n') +
    (profile.learned && profile.learned.style ? '\n\nPrevious learned summary (update it): ' + profile.learned.style : '');

  const out = await callBrainAI(system, user, { maxTokens: 900, temperature: 0.3 });
  if (!out) return { ok: false, error: 'AI could not analyse the chat right now.' };
  let parsed = null;
  try {
    const s = out.indexOf('{'), e = out.lastIndexOf('}');
    if (s >= 0 && e > s) parsed = JSON.parse(out.substring(s, e + 1));
  } catch (err) { parsed = null; }
  if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'AI returned an unreadable analysis — try again.' };

  const learned = {
    style: sstr(parsed.style, 600),
    facts: (Array.isArray(parsed.facts) ? parsed.facts : []).map(f => sstr(f, 160)).slice(0, 8),
    topics: (Array.isArray(parsed.topics) ? parsed.topics : []).map(f => sstr(f, 80)).slice(0, 6),
    mood: sstr(parsed.mood, 200),
    promises: (Array.isArray(parsed.promises) ? parsed.promises : []).map(f => sstr(f, 160)).slice(0, 4),
    at: Date.now()
  };
  const key = brainKeyFor(jid);
  await setDoc(doc(brainDb, BRAINS, key), { learned, lastLearnedAt: Date.now() }, { merge: true });
  const updated = { ...profile, learned, lastLearnedAt: Date.now() };
  brainCache.set(key, { profile: updated, at: Date.now() });
  console.log('[BRAIN] 🎓 Learned style for ' + key + ' — ' + learned.facts.length + ' facts, ' + learned.topics.length + ' topics');
  return { ok: true, learned };
}

// ---------------------------------------------------------------------------
// FEATURE ENGINE — registered from index.js; maybeLearn() runs from the scheduler
// ---------------------------------------------------------------------------
export function createBrainEngine(db) {
  attachBrainDb(db);
  let lastLearnTick = 0;

  // Runs a few times/hour max; processes up to 2 stale contacts per pass
  async function maybeLearn() {
    if (Date.now() - lastLearnTick < 60 * 60 * 1000) return;
    lastLearnTick = Date.now();
    try {
      const conf = await getBrainConfig();
      if (!conf.learningEnabled) return;
      const all = await listBrains(60);
      const now = Date.now();
      const stale = all.filter(b =>
        b.learnEnabled !== false &&
        (!b.lastLearnedAt || (now - b.lastLearnedAt) > 20 * 3600 * 1000)
      ).slice(0, 2);
      for (const b of stale) {
        const messages = await fetchChatMessages(b.jid || b.key, 130);
        if (!messages.length) continue;
        const lastMsgAt = messages[messages.length - 1].timestamp || 0;
        if (b.lastLearnedAt && lastMsgAt <= b.lastLearnedAt) continue; // nothing new to study
        console.log('[BRAIN] 🎓 Nightly-style learning for ' + (b.name || b.key) + '...');
        await learnContactStyle(b.jid || b.key, { force: true });
      }
    } catch (e) { console.warn('[BRAIN] learning tick failed:', e.message); }
  }

  return { maybeLearn };
}

// ============================================================================
// EXPRESS ROUTES — Brain card API + 💬 AI DISCUSSION AREA + drafts inbox
// ============================================================================
export function registerBrainRoutes(app, db) {
  attachBrainDb(db);
  const engine = createBrainEngine(db);
  const meta = {
    personas: Object.entries(PERSONAS).map(([id, p]) => ({ id, ...p })),
    presets: Object.entries(PRESETS).map(([name, personas]) => ({ name, personas })),
    conflicts: CONFLICTS,
    relationships: RELATIONSHIPS,
    modes: Object.entries(MODES).map(([id, label]) => ({ id, label }))
  };

  app.get('/api/brain/meta', (req, res) => res.json({ ok: true, ...meta }));

  app.get('/api/brain/list', async (req, res) => {
    try {
      const brains = await listBrains(100);
      const drafts = await listDrafts({ pendingOnly: true, maxCount: 100 });
      res.json({ ok: true, brains, pendingDrafts: drafts.length, drafts: drafts.slice(0, 40), config: await getBrainConfig() });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/brain/drafts', async (req, res) => {
    try { res.json({ ok: true, drafts: await listDrafts({ jid: sstr(req.query.jid, 80), pendingOnly: true }) }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/brain/drafts/action', async (req, res) => {
    try {
      const { id, action, text } = req.body || {};
      if (!id || !action) return res.status(400).json({ error: 'Missing id or action' });
      const ref = doc(db, DRAFTS, id);
      const snap = await getDoc(ref);
      if (!snap.exists()) return res.status(404).json({ error: 'Draft not found' });
      const d = snap.data() || {};
      if (action === 'discard') {
        await setDoc(ref, { status: 'discarded', actedAt: Date.now() }, { merge: true });
        return res.json({ ok: true, status: 'discarded' });
      }
      if (action === 'send') {
        const finalText = sstr((text && String(text).trim()) || d.draft || '', 3000).trim();
        if (!finalText) return res.status(400).json({ error: 'Nothing to send' });
        const { sendWaWebMessage } = await import('./waWebClient.js');
        await sendWaWebMessage(d.jid, finalText);
        await setDoc(ref, { status: 'sent', sentText: finalText, actedAt: Date.now() }, { merge: true });
        console.log('[BRAIN] 📤 Draft approved & sent to ' + d.jid);
        return res.json({ ok: true, status: 'sent' });
      }
      return res.status(400).json({ error: 'Unknown action' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/brain/:jid', async (req, res) => {
    try {
      const jid = decodeURIComponent(req.params.jid);
      let profile = await getBrain(jid, { fresh: true });
      if (!profile) return res.json({ ok: true, exists: false, jid, meta });
      let msgCount = 0, lastMsgAt = 0;
      try {
        const msgs = await fetchChatMessages(jid, 1);
        lastMsgAt = msgs.length ? (msgs[0].timestamp || 0) : 0;
        const msgsFull = await fetchChatMessages(jid, 400);
        msgCount = msgsFull.length;
        if (msgsFull.length) lastMsgAt = msgsFull[msgsFull.length - 1].timestamp || lastMsgAt;
      } catch (e) { /* chat may not be loaded on this node */ }
      res.json({ ok: true, exists: true, jid, profile, msgCount, lastMsgAt, meta, config: await getBrainConfig() });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/brain/:jid', async (req, res) => {
    try {
      const jid = decodeURIComponent(req.params.jid);
      const profile = await saveBrain(jid, req.body || {});
      res.json({ ok: true, profile });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/brain/:jid', async (req, res) => {
    try { await deleteBrain(decodeURIComponent(req.params.jid)); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/brain/config', async (req, res) => {
    try { res.json({ ok: true, config: await saveBrainConfig(req.body || {}) }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 🎓 Run the style-learning now for one contact
  app.post('/api/brain/:jid/learn', async (req, res) => {
    try {
      const r = await learnContactStyle(decodeURIComponent(req.params.jid), { force: true });
      res.json(r.ok ? { ok: true, learned: r.learned } : { ok: false, error: r.error });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ✍️ Preview: 3 sample replies the AI would send right now (with this exact card)
  app.post('/api/brain/:jid/preview', async (req, res) => {
    try {
      const jid = decodeURIComponent(req.params.jid);
      const profile = await getBrain(jid);
      if (!profile) return res.status(404).json({ error: 'Create the brain card first.' });
      const scenario = sstr((req.body || {}).scenario || '', 500);
      const msgs = await fetchChatMessages(jid, 24);
      const system = 'You write WhatsApp replies AS the account owner. Follow the CONTACT BRAIN rules exactly.\n' + buildBrainPromptSection(profile) +
        '\nReturn ONLY a JSON array of 3 different sample replies (short strings, no commentary): ["...","...","..."]';
      const user = 'Recent conversation:\n' + (transcriptFrom(msgs) || '(no history yet)') +
        (scenario ? '\n\nThey just said: "' + scenario + '"' : '\n\nReply to their last message.') +
        '\n\nGive 3 different option replies now.';
      const out = await callBrainAI(system, user, { maxTokens: 600, temperature: 0.7 });
      let options = [];
      try {
        const s = out.indexOf('['), e = out.lastIndexOf(']');
        if (s >= 0 && e > s) options = JSON.parse(out.substring(s, e + 1));
      } catch (err) { options = out.split('\n').filter(Boolean).slice(0, 3); }
      if (!Array.isArray(options) || !options.length) return res.status(502).json({ error: 'AI could not draft previews right now.' });
      options = options.map(o => sstr(o, 400)).filter(Boolean).slice(0, 3);
      res.json({ ok: true, options });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 💬 AI DISCUSSION AREA — talk with the AI about this person; it can suggest card updates
  app.post('/api/brain/:jid/discuss', async (req, res) => {
    try {
      const jid = decodeURIComponent(req.params.jid);
      const message = sstr((req.body || {}).message || '', 1500).trim();
      const history = (Array.isArray((req.body || {}).history) ? req.body.history : []).slice(-20);
      if (!message) return res.status(400).json({ error: 'Empty message' });
      const profile = await getBrain(jid);
      const msgs = await fetchChatMessages(jid, 40);

      const system = 'You are the PERSONAL AI BRAIN COACH inside the owner\'s dashboard — you discuss ONE WhatsApp contact with the owner (he is the account holder; this discussion is PRIVATE, your text is never sent to the contact).\n' +
        'Context — the contact\'s brain card:\n' + (profile ? JSON.stringify({ name: profile.name, nickname: profile.nickname, relationship: profile.relationship, mode: profile.mode, personas: profile.personas, dials: profile.dials, permissions: profile.permissions, neverSay: profile.neverSay, notes: profile.notes, learned: profile.learned }, null, 1) : '(no card yet — propose one)') +
        '\n\nRecent conversation with the contact:\n' + (transcriptFrom(msgs) || '(no messages yet)') +
        '\n\nYou help with: how to handle this person, best persona mix and weights, reply drafts, remembering facts, relationship advice.\n' +
        'IMPORTANT: if you recommend concrete changes to the brain card, END your reply with a JSON block in this exact form:\n```json\n{"suggestedProfile": {"personas": [{"name":"Respect","weight":70}], "mode": "auto", "notes": "...", "neverSay": ["..."], "permissions": {"canOfferProducts": false}, "relationship": "brother", "language": "Roman Urdu", "dials": {"formality": 60}}}\n```\nOnly include fields you want to change. Keep your visible answer short, clear and practical (the owner may not be technical).';

      const convo = history.map(h => (h.role === 'user' ? 'OWNER: ' : 'YOU: ') + sstr(h.text, 800)).join('\n');
      const user = (convo ? 'Earlier discussion:\n' + convo + '\n\n' : '') + 'OWNER now asks: ' + message;
      const out = await callBrainAI(system, user, { maxTokens: 1100, temperature: 0.6 });
      if (!out) return res.status(502).json({ error: 'AI is unavailable right now — try again.' });

      let suggestion = null;
      let reply = out;
      const m = out.match(/```json\s*([\s\S]*?)```/i);
      if (m) {
        try {
          const parsed = JSON.parse(m[1]);
          if (parsed && parsed.suggestedProfile && typeof parsed.suggestedProfile === 'object') suggestion = parsed.suggestedProfile;
        } catch (e) { /* keep raw */ }
        reply = out.replace(m[0], '').trim();
      }
      res.json({ ok: true, reply, suggestion });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  console.log('[BRAIN] 🧠 Contact Brain API registered (cards, personas+mixing, AI discussion, previews, style learning, drafts inbox)');
  return engine;
}
