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
import { isAiAutoFetchStopped, recordAiCall } from './aiTracker.mjs';
import { makeAdminGuard } from './adminGuard.mjs';
import { resolveDeepSeek, deepseekFetchExtras } from './aiProviders.mjs';
import { emitAssignmentEvent } from './assignmentEvents.mjs';
import { withRuleBook, enforceScript, hasDevanagari } from './ruleBook.mjs';
import { cachedTokensFrom } from './promptCache.mjs';

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

export const RELATIONSHIPS = ['family', 'wife', 'husband', 'son', 'daughter', 'mother', 'father', 'child', 'brother', 'sister', 'parent', 'relative', 'close friend', 'friend', 'colleague', 'customer', 'vip customer', 'supplier', 'partner', 'stranger', 'other'];
export const MODES = { auto: '🤖 Auto-reply', draft_only: '📥 Draft only (you approve)', alert_only: '🔔 Alert only (no AI reply)', silent: '🔇 Silent guard (never replies, alerts you)' };

// Formality style: "not too formal and not too casual" is the NORMAL middle level.
export const FORMALITY_LEVELS = ['very_casual', 'casual', 'normal', 'formal', 'very_formal'];
// How the AI addresses the person in Roman Urdu: friends & family = tum (never aap).
export const ADDRESS_STYLES = ['auto', 'tu', 'tum', 'aap'];
const FRIENDLY_RELATIONSHIPS = ['family', 'wife', 'husband', 'son', 'daughter', 'mother', 'father', 'child', 'brother', 'sister', 'parent', 'relative', 'close friend', 'friend', 'partner'];
const RESPECT_PERSONAS = ['Respect', 'ElderRespect'];
// Blood / family / friendship: these people are NEVER treated as a customer, and the AI must
// never run the business-intake questionnaire on them (no company, country, NTN, "business
// tafseel"). Exported because contactIntel and the WhatsApp reply builder both need the test.
export const FAMILY_RELATIONSHIPS = ['family', 'wife', 'husband', 'son', 'daughter', 'mother', 'father', 'child', 'brother', 'sister', 'parent', 'relative', 'close friend', 'friend'];
export const isFamilyRelationship = (rel) => FAMILY_RELATIONSHIPS.includes(String(rel || '').trim().toLowerCase());
// The business side of the book: these DO get business answers (from the Business Data Tank).
export const isBusinessRelationship = (rel) => ['customer', 'vip customer', 'supplier', 'partner', 'colleague'].includes(String(rel || '').trim().toLowerCase());

const FORMALITY_TEXT = {
  very_casual: 'VERY CASUAL — talk like best friends / close family: short, relaxed, everyday words. Absolutely NO stiff or formal wording.',
  casual: 'CASUAL — friendly and easy-going; only light politeness, no stiff words.',
  normal: 'NORMAL — balanced middle: friendly and natural, NOT too formal and NOT too casual. Respectful but relaxed — never stiff, never rude.',
  formal: 'FORMAL — polite and proper wording; no slang, no teasing.',
  very_formal: 'VERY FORMAL — official / business tone with full respect.'
};

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
  p.formalityLevel = FORMALITY_LEVELS.includes(raw.formalityLevel || existing.formalityLevel) ? (raw.formalityLevel || existing.formalityLevel) : '';
  p.addressStyle = ADDRESS_STYLES.includes(raw.addressStyle || existing.addressStyle) ? (raw.addressStyle || existing.addressStyle) : 'auto';
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
  const rm = raw.modalities || {};
  const em = existing.modalities || {};
  p.modalities = {
    allowAudio: asBool(rm.allowAudio != null ? rm.allowAudio : (em.allowAudio != null ? em.allowAudio : true)),
    allowImage: asBool(rm.allowImage != null ? rm.allowImage : (em.allowImage != null ? em.allowImage : true)),
    allowVideo: asBool(rm.allowVideo != null ? rm.allowVideo : (em.allowVideo != null ? em.allowVideo : true)),
    allowDoc: asBool(rm.allowDoc != null ? rm.allowDoc : (em.allowDoc != null ? em.allowDoc : true)),
    allowGif: asBool(rm.allowGif != null ? rm.allowGif : (em.allowGif != null ? em.allowGif : true)),
    twoWayContext: asBool(rm.twoWayContext != null ? rm.twoWayContext : (em.twoWayContext != null ? em.twoWayContext : true)),
    outputVoice: asBool(rm.outputVoice != null ? rm.outputVoice : (em.outputVoice != null ? em.outputVoice : false))
  };
  const ns = raw.neverSay != null ? raw.neverSay : existing.neverSay;
  p.neverSay = (Array.isArray(ns) ? ns : String(ns || '').split('\n')).map(x => sstr(x, 80).trim()).filter(Boolean).slice(0, 15);
  p.notes = sstr(raw.notes != null ? raw.notes : existing.notes, 1000);
  p.humanDelay = asBool(raw.humanDelay != null ? raw.humanDelay : existing.humanDelay);
  p.learnEnabled = raw.learnEnabled != null ? asBool(raw.learnEnabled) : (existing.learnEnabled !== false);
  // 🎓 AI Staff assignment (optional). agentId points at a document in the `agents` collection.
  // agentManual records that the owner picked it by hand, which is required for Personal agents.
  // "Handled by" / "Backup" staff. `agentId` is kept as an alias of `handledBy` so the
  // WhatsApp pipeline and any existing data keep working unchanged.
  const handledRaw = raw.handledBy != null ? raw.handledBy
    : (raw.agentId != null ? raw.agentId
      : (existing.handledBy != null ? existing.handledBy : existing.agentId));
  p.handledBy = sstr(handledRaw, 80);
  p.agentId = p.handledBy;
  p.backupBy = sstr(raw.backupBy != null ? raw.backupBy : existing.backupBy, 80);
  p.agentManual = raw.agentManual != null ? asBool(raw.agentManual) : !!existing.agentManual;
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
  if (profile.relationship) {
    const rel = String(profile.relationship).trim().toLowerCase();
    if (isFamilyRelationship(rel)) {
      s += '⚠️ THIS PERSON IS FAMILY / A CLOSE PERSONAL CONTACT (' + rel + ') — NOT a customer, NOT a client, NOT a supplier.\n';
      s += 'FAMILY RULE (overrides every business instruction above): talk like family talk. Never ask about a company, country, city, business activity, GST/NTN, products, prices, orders, invoices or "business tafseel". ' +
           'Never run any customer-intake questionnaire. If a business template or another rule below says to ask for those details, IGNORE it for this person. ' +
           'If HE himself brings up business, answer him plainly and briefly as family would — then go back to normal talk.\n';
    } else if (isBusinessRelationship(rel)) {
      s += 'This person is on the BUSINESS side (' + rel + '). Business questions are welcome and expected — answer them from the business data provided below, never from guesswork.\n';
    }
  }
  if (profile.nickname) s += 'You call him: "' + profile.nickname + '".' + (profile.callsYou ? ' He calls you: "' + profile.callsYou + '".' : '') + '\n';
  s += 'MAIN PERSONALITY (' + main.weight + '%): ' + main.name + ' — ' + (PERSONAS[main.name] || {}).desc + '\n';
  for (const f of flavors) s += 'FLAVOR (' + f.weight + '%): ' + f.name + ' — ' + (PERSONAS[f.name] || {}).desc + '\n';
  s += 'Blend these naturally into every message. Higher % = stronger influence. If two styles clash, the higher % wins — but NEVER break respect or safety rules.\n';
  s += 'Language: ' + (profile.language || 'Roman Urdu') + ' (never Devanagari script). Reply length: ' + (profile.length || 'short') + '. Emojis: ' + (profile.emojiLevel || 'low') + '.\n';  // Formality style: level (explicit) or slider fine-tuning
  if (profile.formalityLevel) {
    s += 'FORMALITY STYLE: ' + (FORMALITY_TEXT[profile.formalityLevel] || FORMALITY_TEXT.normal) + '\n';
  }
  s += 'Tone dials → formality ' + dials.formality + '/100, humor ' + dials.humor + '/100, warmth ' + dials.warmth + '/100, slang ' + dials.slang + '/100.\n';
  // Addressing rule: tum for friends & family (never aap), unless Respect personas dominate or the owner chose a style.
  const explicitAddr = profile.addressStyle && profile.addressStyle !== 'auto' ? profile.addressStyle : '';
  const mainIsRespect = RESPECT_PERSONAS.includes(main.name);
  const effectiveAddr = explicitAddr || (FRIENDLY_RELATIONSHIPS.includes(profile.relationship) && !mainIsRespect ? 'tum' : '');
  if (effectiveAddr === 'tum') {
    s += 'HOW TO ADDRESS HIM (very important): use "tum" in Roman Urdu — tum, tumhara, tumhe, tumko, tumhare. He is friend/family so talk NORMALLY like friends do. NEVER use "aap / aapka / aapko / aapki". Example: "tum kahan ho?" NOT "aap kahan hain?".\n';
  } else if (effectiveAddr === 'tu') {
    s += 'HOW TO ADDRESS HIM: very close informal "tu" — tu, tera, tujhe, teri. Never "aap".\n';
  } else if (effectiveAddr === 'aap') {
    s += 'HOW TO ADDRESS HIM: always respectful "aap" — aap, aapka, aapko, aapki. Never "tum" or "tu".\n';
  }
  s += 'BUSINESS PERMISSIONS: products/offers: ' + (perms.canOfferProducts ? 'ALLOWED' : 'NOT ALLOWED — never offer products, packages, prices or services') +
       '; invoices: ' + (perms.canSendInvoice ? 'allowed' : 'NOT allowed') +
       '; price talk: ' + (perms.canTalkPrice ? 'allowed' : 'NOT allowed') + '.\n';
  if (profile.neverSay && profile.neverSay.length) s += 'NEVER write these phrases: ' + profile.neverSay.join(' | ') + '\n';
  if (learned.style) s += 'GROUND TRUTH — this is exactly how the owner really talks to him (auto-learned from the owner\'s own sent messages). Reply according to THIS summary precisely — it overrides generic style rules: ' + sstr(learned.style, 500) + '\n';
  // 🎭 LIVE VOICE — refreshed every few of the owner's own replies, so the AI copies the
  // register he is using RIGHT NOW (plain, bargaining, chasing payment) instead of an average.
  if (learned.live && learned.live.mode) {
    const lv = learned.live;
    s += '\n🎭 LIVE VOICE MATCH — this is how the owner is writing to him AT THIS MOMENT (' + sstr(lv.mode, 60) + '):\n';
    if (lv.register) s += 'Register: ' + sstr(lv.register, 200) + '\n';
    if (lv.tone) s += 'Tone: ' + sstr(lv.tone, 200) + '\n';
    if (lv.habits) s += 'How he actually types: ' + sstr(lv.habits, 260) + '\n';
    if (Array.isArray(lv.phrases) && lv.phrases.length) s += 'Words/phrases he uses (reuse these, do not invent new ones): ' + lv.phrases.slice(0, 10).map(x => sstr(x, 60)).join(' | ') + '\n';
    if (Array.isArray(lv.sampleLines) && lv.sampleLines.length) {
      s += 'Real examples of HIS OWN lines — copy this exact style:\n' + lv.sampleLines.slice(0, 5).map(x => '   • ' + sstr(x, 200)).join('\n') + '\n';
    }
    s += 'COPY THIS EXACTLY. Do NOT add rakh-rakhao: no extra "Dear", "sir", "please", no added politeness, no longer sentences than his, no extra emojis he would not use, no signature. ' +
         'If he writes plainly, write plainly. If he is bargaining, bargain the same way; if he is chasing a payment (wusooli), press for the payment with the same firmness and the same words. ' +
         'If the mode above is informal, be informal — do not upgrade the register.\n';
    if (lv.avoid) s += 'NEVER do this (it would break the imitation): ' + sstr(lv.avoid, 200) + '\n';
  }
  if (learned.mood) s += 'His usual mood / way of talking: ' + sstr(learned.mood, 200) + '\n';
  if (learned.topics && learned.topics.length) s += 'Usual topics between you two: ' + learned.topics.slice(0, 6).map(t => sstr(t, 60)).join(', ') + '\n';
  if (learned.facts && learned.facts.length) s += 'Remember about him: ' + learned.facts.slice(0, 8).map(f => sstr(f, 120)).join('; ') + '\n';
  if (learned.promises && learned.promises.length) s += 'Open promises/deals with him (be consistent): ' + learned.promises.slice(0, 5).map(f => sstr(f, 120)).join('; ') + '\n';
  if (profile.modalities) {
    const m = profile.modalities;
    s += 'MEDIA MODALITIES: Audio/Voice Notes: ' + (m.allowAudio ? 'ALLOWED (transcribe & understand)' : 'DISABLED (ignore audio)') +
         '; Images: ' + (m.allowImage ? 'ALLOWED (vision & OCR)' : 'DISABLED') +
         '; Documents: ' + (m.allowDoc ? 'ALLOWED' : 'DISABLED') +
         '; Video: ' + (m.allowVideo ? 'ALLOWED' : 'DISABLED') +
         '; GIFs: ' + (m.allowGif ? 'ALLOWED' : 'DISABLED') + '.\n';
    if (m.twoWayContext !== false) {
      s += 'TWO-WAY DIALOGUE UNDERSTANDING: ACTIVE — Analyze the complete timeline of BOTH what the contact said and what the Owner/Boss already replied or promised.\n';
    }
  }
  s += 'SITUATION AWARENESS: read his last message — if he is angry, sad, stressed or it is an emergency: raise Caring, drop jokes to 0, be gentle. Match his energy; mirror his greeting style.\n';
  s += 'ESCALATION RULE: if the message involves real money problems, a fight, an emergency, sickness or death — reply with exactly: ESCALATE\n';
  // LANGUAGE LOCK — last in the block on purpose: the generic knowledge prompt above tells the
  // model to mirror the sender's language, and the owner's own choice must win over that.
  const lang = String(profile.language || '').trim();
  if (lang && !/^auto$/i.test(lang)) {
    s += '\n🔒 LANGUAGE LOCK (MANDATORY — overrides every language instruction written above):\n';
    s += 'The owner has set the reply language for THIS person to: "' + lang + '".\n';
    if (/urdu/i.test(lang) && !/roman/i.test(lang)) {
      s += 'Write EVERY word in Urdu script (اردو). Do NOT answer in English and do NOT answer in Roman Urdu, even if he writes in English or Roman Urdu. Product names, numbers and dates may stay as they are.\n';
    } else if (/roman urdu/i.test(lang)) {
      s += 'Write EVERY word in Roman Urdu (Urdu in English letters). Do NOT answer in English, Urdu script or Devanagari.\n';
    } else if (/english/i.test(lang)) {
      s += 'Write EVERY word in English, even if he writes in Urdu or Roman Urdu.\n';
    } else {
      s += 'Reply only in ' + lang + '.\n';
    }
    s += 'Ignore any earlier rule that says "mirror the sender\'s language", "reply in the same language he used" or "detect and match the language" — for this contact this setting wins.\n';
  }
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

let brainAliasResolver = null;
export function registerBrainAliasResolver(fn) {
  brainAliasResolver = fn;
}

let brainPowersSaveHook = null;
export function registerBrainPowersSaveHook(fn) {
  brainPowersSaveHook = fn;
}

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
  // Groups get brain cards too (needed for "Handled by" / "Backup"), but they are never
  // auto-created — the owner creates one explicitly by opening the panel and saving.

  const primaryKey = brainKeyFor(jid);
  const hit = brainCache.get(primaryKey);
  if (!fresh && hit && (Date.now() - hit.at) < BRAIN_TTL_MS) return hit.profile;

  // 1. Direct doc lookup by primary key
  try {
    const snap = await getDoc(doc(brainDb, BRAINS, primaryKey));
    if (snap.exists()) {
      const profile = snap.data();
      brainCache.set(primaryKey, { profile, at: Date.now() });
      return profile;
    }
  } catch (e) {
    console.warn('[BRAIN] read failed for ' + primaryKey + ':', e.message);
  }

  // 2. Candidate alias lookups (LID <-> Real Phone JID / Clean digits)
  const candidateKeys = [];
  if (typeof brainAliasResolver === 'function') {
    try {
      const aliases = brainAliasResolver(jid);
      if (Array.isArray(aliases)) {
        for (const a of aliases) {
          const k = brainKeyFor(a);
          if (k && k !== primaryKey && !candidateKeys.includes(k)) candidateKeys.push(k);
        }
      }
    } catch (e) { /* ignore */ }
  }

  const digits = String(jid).replace(/[^0-9]/g, '');
  if (digits && digits.length <= 15) {
    const pk = brainKeyFor(digits + '@s.whatsapp.net');
    if (pk !== primaryKey && !candidateKeys.includes(pk)) candidateKeys.push(pk);
  }

  for (const altKey of candidateKeys) {
    const altHit = brainCache.get(altKey);
    if (!fresh && altHit && (Date.now() - altHit.at) < BRAIN_TTL_MS) {
      if (altHit.profile) {
        brainCache.set(primaryKey, { profile: altHit.profile, at: Date.now() });
        return altHit.profile;
      }
    }
    try {
      const snap = await getDoc(doc(brainDb, BRAINS, altKey));
      if (snap.exists()) {
        const profile = snap.data();
        brainCache.set(primaryKey, { profile, at: Date.now() });
        brainCache.set(altKey, { profile, at: Date.now() });
        return profile;
      }
    } catch (e) { /* ignore */ }
  }

  // 3. Fallback: query Firestore collection by 'phone' field
  if (digits && digits.length >= 7) {
    try {
      const q = query(collection(brainDb, BRAINS), where('phone', '==', digits), limit(1));
      const qSnap = await getDocs(q);
      if (!qSnap.empty) {
        const found = qSnap.docs[0];
        const profile = found.data();
        brainCache.set(primaryKey, { profile, at: Date.now() });
        brainCache.set(found.id, { profile, at: Date.now() });
        return profile;
      }
    } catch (e) { /* non-fatal */ }
  }

  return hit ? hit.profile : null;
}

export async function saveBrain(jid, rawProfile) {
  if (!brainDb || !jid) throw new Error('Brain storage unavailable');
  const key = brainKeyFor(jid);
  const snap = await getDoc(doc(brainDb, BRAINS, key));
  const existing = snap.exists() ? (snap.data() || {}) : {};
  let resolvedPhone = rawProfile.phone || existing.phone || '';
  if (!resolvedPhone && typeof brainAliasResolver === 'function') {
    try {
      const aliases = brainAliasResolver(jid);
      for (const a of (aliases || [])) {
        const d = String(a).replace(/[^0-9]/g, '');
        if (d && d.length >= 7 && d.length <= 15) { resolvedPhone = d; break; }
      }
    } catch (e) { /* ignore */ }
  }
  const profile = sanitizeProfile({ ...rawProfile, phone: resolvedPhone || rawProfile.phone, jid }, existing);
  await setDoc(doc(brainDb, BRAINS, key), profile, { merge: true });
  brainCache.set(key, { profile, at: Date.now() });

  // 🏢 Office sync: a change of handler emits an assignment event (audit + client list).
  try {
    const prevHandled = existing.handledBy || existing.agentId || '';
    const nextHandled = profile.handledBy || profile.agentId || '';
    const prevBackup = existing.backupBy || '';
    const nextBackup = profile.backupBy || '';
    if (nextHandled !== prevHandled) {
      await emitAssignmentEvent({
        chatJid: jid, chatName: profile.name || jid, type: jid.endsWith('@g.us') ? 'group' : 'person',
        staffId: nextHandled, previousStaffId: prevHandled, role: 'primary', autonomy: profile.mode === 'draft_only' ? 'draft' : 'auto', assignedBy: 'boss'
      });
    }
    if (nextBackup !== prevBackup && nextBackup) {
      await emitAssignmentEvent({
        chatJid: jid, chatName: profile.name || jid, type: jid.endsWith('@g.us') ? 'group' : 'person',
        staffId: nextBackup, previousStaffId: '', role: 'backup', assignedBy: 'boss'
      });
    }
  } catch (e) { console.warn('[BRAIN] assignment sync failed:', e.message); }

  if (resolvedPhone) {
    const phoneKey = brainKeyFor(resolvedPhone + '@s.whatsapp.net');
    if (phoneKey !== key) brainCache.set(phoneKey, { profile, at: Date.now() });
  }

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
  // 📖 App Rule Book (Roman Hindi/Urdu only, no secrets) applies to every brain AI call.
  try { system = await withRuleBook(system, 'academy'); } catch (e) { /* best effort */ }
  const raw = await callBrainAIRaw(system, user, { maxTokens, temperature });
  if (!raw) return raw;
  return hasDevanagari(raw) ? enforceScript(raw).text : raw;
}

async function callBrainAIRaw(system, user, { maxTokens = 1200, temperature = 0.5 } = {}) {
  let st = {};
  try {
    const snap = await getDoc(doc(brainDb, 'appData', 'settings'));
    st = snap.exists() ? snap.data() : {};
  } catch (e) { /* env fallbacks below */ }
  const qwenKey = st.QWEN_API_KEY || process.env.QWEN_API_KEY || st.DASHSCOPE_API_KEY || '';
  const qwenBase = String(st.QWEN_BASE_URL || process.env.QWEN_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, '');
  const qwenModel = st.QWEN_MODEL || process.env.QWEN_MODEL || 'qwen3.8-flash';
  const geminiKey = st.GEMINI_API_KEY || process.env.GEMINI_API_KEY || st.geminiApiKey || '';
  const ds = resolveDeepSeek(st);
  const deepseekKey = ds.key;
  const deepseekBase = ds.base;
  const deepseekModel = ds.model;

  const order = [];
  if (qwenKey) order.push('qwen');
  if (geminiKey) order.push('gemini');
  if (deepseekKey) order.push('deepseek');

  for (const p of order) {
    const startTime = Date.now();
    try {
      if (p === 'qwen' || p === 'deepseek') {
        const url = p === 'qwen' ? (qwenBase + '/chat/completions') : (deepseekBase + '/chat/completions');
        const key = p === 'qwen' ? qwenKey : deepseekKey;
        const model = p === 'qwen' ? qwenModel : deepseekModel;
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
          body: JSON.stringify({ model, ...(p === 'deepseek' ? deepseekFetchExtras(deepseekBase) : {}), ...(p === 'qwen' ? { enable_thinking: false } : {}), temperature, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
          signal: AbortSignal.timeout(60000)
        });
        if (!r.ok) {
          const errText = await r.text().catch(() => '');
          recordAiCall({
            provider: p,
            model,
            area: 'Contact Brain',
            isAutoFetch: false,
            prompt: user,
            response: '',
            error: `HTTP ${r.status}: ${errText.substring(0, 200)}`,
            durationMs: Date.now() - startTime
          });
          console.warn('[BRAIN AI] ' + p + ' HTTP ' + r.status);
          continue;
        }
        const j = await r.json();
        const t = ((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '').trim();
        const tokensIn = (j.usage && j.usage.prompt_tokens) || 0;
        const tokensOut = (j.usage && j.usage.completion_tokens) || 0;
        recordAiCall({
          provider: p,
          model,
          area: 'Contact Brain',
          isAutoFetch: false,
          prompt: user,
          response: t,
          tokensIn,
          tokensOut,
          cachedTokens: cachedTokensFrom(j),
          durationMs: Date.now() - startTime
        });
        if (t) { console.log('[BRAIN AI] 🧠 answered via ' + model); return t; }
      } else if (p === 'gemini') {
        for (const gm of ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-flash-latest']) {
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
            const tokensIn = (j.usageMetadata && j.usageMetadata.promptTokenCount) || 0;
            const tokensOut = (j.usageMetadata && j.usageMetadata.candidatesTokenCount) || 0;
            recordAiCall({
              provider: 'gemini',
              model: gm,
              area: 'Contact Brain',
              isAutoFetch: false,
              prompt: user,
              response: t,
              tokensIn,
              tokensOut,
              cachedTokens: cachedTokensFrom(j),
              durationMs: Date.now() - startTime
            });
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
// ============================================================================
// 🎭 LIVE VOICE — how the owner is writing in THIS chat right now
// ============================================================================
// The long-term `learned.style` is an average of up to 90 owner messages, so a bargaining tone
// and a payment-chasing tone blur into each other. This learns the CURRENT register instead:
// the last handful of the owner's own replies (plus the contact's last few) produce a mode
// ("informal chat", "business bargaining", "payment chasing / wusooli", "formal", "angry"…),
// the phrases he actually uses, and a few verbatim sample lines to copy.
//
// It refreshes after every VOICE_LEARN_EVERY owner replies (3 by default — one or two replies is
// noise, and the mode must track him, not lag behind), and it is deliberately cheap: one small
// call, at most once per VOICE_MIN_GAP_MS per contact, skipped entirely while a call is running.
const VOICE_LEARN_EVERY = 3;
const VOICE_MIN_GAP_MS = 90 * 1000;
const voiceInFlight = new Set();

export async function learnContactVoice(jid, { force = false } = {}) {
  const profile = await getBrain(jid, { fresh: true });
  if (!profile) return { ok: false, error: 'No brain card for this contact yet.' };
  if (profile.learnEnabled === false && !force) return { ok: false, error: 'Learning is switched off for this contact.' };
  const conf = await getBrainConfig();
  if (!conf.learningEnabled && !force) return { ok: false, error: 'Global style learning is switched off.' };

  const messages = await fetchChatMessages(jid, 60);
  if (!messages.length) return { ok: false, error: 'No messages found for this contact yet.' };
  const owner = messages.filter(m => m.fromMe && m.text && String(m.text).trim().length > 1);
  if (owner.length < VOICE_LEARN_EVERY) {
    return { ok: false, error: 'Need at least ' + VOICE_LEARN_EVERY + ' of your own messages to read your style.' };
  }
  // Recency wins: the latest 12 owner lines define the register, the contact's last 8 the context.
  const mine = owner.slice(-12).map(m => sstr(m.text, 300));
  const theirs = messages.filter(m => !m.fromMe && m.text).slice(-8).map(m => sstr(m.text, 200));

  const system = 'You analyse how ONE person writes on WhatsApp, so another AI can copy him exactly.\n' +
    'Study the OWNER\'S OWN latest messages (newest last) and the contact\'s messages for context.\n' +
    'Judge the CURRENT mode from the newest messages — not the average of the whole chat. Modes include: ' +
    '"informal chat", "casual business", "business bargaining", "payment chasing (wusooli)", "order/rate discussion", ' +
    '"angry / complaining", "family/personal", "formal".\n' +
    'Output ONLY this JSON object (no fences, no commentary):\n' +
    '{ "mode": "the mode right now, 1-4 words", ' +
    '"register": "how formal: e.g. very informal / plain / semi-formal / formal — say whether he uses aap or tum", ' +
    '"tone": "the emotional tone right now: e.g. soft, direct, firm, irritated, warm", ' +
    '"habits": "how he types: message length, line breaks, punctuation, emojis and which ones, English/Roman-Urdu mix, slang, spelling habits, does he greet or jump straight to the point", ' +
    '"phrases": ["6-10 words or short phrases he actually uses in these messages — copy them verbatim"], ' +
    '"sampleLines": ["3-5 of HIS OWN complete lines, verbatim, that best show the style"], ' +
    '"avoid": "what the AI must NOT do to sound like him (things he never does — e.g. never says sir/please, never writes long paragraphs)" }';
  const user = 'OWNER\'S OWN latest messages (oldest first, newest LAST — this is the style to copy):\n' +
    mine.map((t, i) => (i + 1) + '. ' + t).join('\n') +
    '\n\nCONTACT\'S messages (context only):\n' + (theirs.join('\n') || '(none)') +
    (profile.learned && profile.learned.live && profile.learned.live.mode
      ? '\n\nPrevious live read (only keep it if the new messages still show it): mode=' + sstr(profile.learned.live.mode, 60) + ', tone=' + sstr(profile.learned.live.tone, 80)
      : '');

  const out = await callBrainAI(system, user, { maxTokens: 700, temperature: 0.2 });
  if (!out) return { ok: false, error: 'AI could not read the style right now.' };
  let parsed = null;
  try {
    const a = out.indexOf('{'), b = out.lastIndexOf('}');
    if (a >= 0 && b > a) parsed = JSON.parse(out.substring(a, b + 1));
  } catch (e) { parsed = null; }
  if (!parsed || !parsed.mode) return { ok: false, error: 'AI returned an unreadable style read — try again.' };

  const live = {
    mode: sstr(parsed.mode, 60),
    register: sstr(parsed.register, 200),
    tone: sstr(parsed.tone, 200),
    habits: sstr(parsed.habits, 300),
    phrases: (Array.isArray(parsed.phrases) ? parsed.phrases : []).map(x => sstr(x, 60)).filter(Boolean).slice(0, 10),
    sampleLines: (Array.isArray(parsed.sampleLines) ? parsed.sampleLines : []).map(x => sstr(x, 220)).filter(Boolean).slice(0, 5),
    avoid: sstr(parsed.avoid, 200),
    ownerMsgs: owner.length,
    at: Date.now()
  };
  const key = brainKeyFor(jid);
  try {
    // Keep the long-term summary/facts intact — only the live read is replaced.
    await setDoc(doc(brainDb, BRAINS, key), { learned: { ...(profile.learned || {}), live } }, { merge: true });
  } catch (e) {
    console.warn('[BRAIN] live voice save failed:', e.message);
    return { ok: false, error: 'Could not save the style read.' };
  }
  console.log('[BRAIN] 🎭 Live voice updated for ' + (profile.name || key) + ': ' + live.mode +
    (live.register ? ' · ' + live.register : ''));
  return { ok: true, live };
}

// Plain-language one-liner for the dashboard: "Payment chasing (wusooli) · firm · Roman Urdu".
export function describeVoice(live) {
  if (!live || !live.mode) return 'No style read yet';
  return [live.mode, live.tone, live.register].filter(Boolean).join(' \u00b7 ');
}

// Called from the reply path: re-read the owner's style once every few of his own replies.
// Fire-and-forget — never blocks or delays a WhatsApp reply.
export async function maybeLearnVoice(jid) {
  try {
    if (!brainDb || !jid || String(jid).endsWith('@g.us')) return;
    if (voiceInFlight.has(jid)) return;
    const conf = await getBrainConfig();
    if (!conf.learningEnabled) return;
    const profile = await getBrain(jid);
    if (!profile || profile.learnEnabled === false) return;
    const live = profile.learned && profile.learned.live;
    if (live && (Date.now() - (live.at || 0)) < VOICE_MIN_GAP_MS) return;
    const messages = await fetchChatMessages(jid, 40);
    const owner = messages.filter(m => m.fromMe && m.text && String(m.text).trim().length > 1);
    if (owner.length < VOICE_LEARN_EVERY) return;
    const seen = live ? (live.ownerMsgs || 0) : 0;
    const newestOwnerAt = owner.length ? (owner[owner.length - 1].timestamp || 0) : 0;
    const learnedAt = live ? (live.at || 0) : 0;
    // Count only the owner messages that arrived since the last read.
    const fresh = owner.filter(m => (m.timestamp || 0) > learnedAt).length;
    if (fresh < VOICE_LEARN_EVERY && !(seen === 0 && owner.length >= VOICE_LEARN_EVERY)) return;
    if (newestOwnerAt && learnedAt && newestOwnerAt <= learnedAt) return;
    voiceInFlight.add(jid);
    learnContactVoice(jid, { force: true })
      .catch(() => {})
      .finally(() => voiceInFlight.delete(jid));
  } catch (e) { /* style learning must never break a reply */ }
}

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
    // keep the live voice read (and anything else already learned) — only the long-term
    // summary is replaced here
    ...(profile.learned || {}),
    style: sstr(parsed.style, 600),
    facts: (Array.isArray(parsed.facts) ? parsed.facts : []).map(f => sstr(f, 160)).slice(0, 8),
    topics: (Array.isArray(parsed.topics) ? parsed.topics : []).map(f => sstr(f, 80)).slice(0, 6),
    mood: sstr(parsed.mood, 200),
    promises: (Array.isArray(parsed.promises) ? parsed.promises : []).map(f => sstr(f, 160)).slice(0, 4),
    at: Date.now()
  };
  const key = brainKeyFor(jid);
  await setDoc(doc(brainDb, BRAINS, key), { learned, lastLearnedAt: learned.at }, { merge: true });

  // Read the document back so the UI can honestly say "saved", not just "request finished".
  let verified = false;
  let storedAt = null;
  try {
    const check = await getDoc(doc(brainDb, BRAINS, key));
    const stored = check.exists() ? (check.data() || {}) : {};
    verified = !!(stored.learned && Number(stored.learned.at) === learned.at);
    storedAt = Number(stored.lastLearnedAt) || null;
  } catch (e) { console.warn('[BRAIN] learn verification failed:', e.message); }

  const updated = { ...profile, learned, lastLearnedAt: learned.at };
  brainCache.set(key, { profile: updated, at: Date.now() });
  console.log('[BRAIN] 🎓 Learned style for ' + key + ' — ' + learned.facts.length + ' facts, ' + learned.topics.length + ' topics' + (verified ? ' (verified in DB)' : ''));
  return { ok: true, learned, verified, savedAt: storedAt || learned.at, facts: learned.facts.length, topics: learned.topics.length };
}

// ---------------------------------------------------------------------------
// FEATURE ENGINE — registered from index.js; maybeLearn() runs from the scheduler
// ---------------------------------------------------------------------------
export function createBrainEngine(db) {
  attachBrainDb(db);
  let lastLearnTick = 0;

  // Runs a few times/hour max; processes up to 2 stale contacts per pass
  async function maybeLearn() {
    if (isAiAutoFetchStopped()) {
      return; // Skip auto-learning when auto-fetch is stopped by user
    }
    if (Date.now() - lastLearnTick < 60 * 60 * 1000) return;
    lastLearnTick = Date.now();
    try {
      const conf = await getBrainConfig();
      if (!conf.learningEnabled) return;
      const all = await listBrains(60);
      const now = Date.now();
      const candidates = all.filter(b => b.learnEnabled !== false).slice(0, 12);
      let done = 0;
      for (const b of candidates) {
        if (isAiAutoFetchStopped()) break;
        if (done >= 3) break;
        const age = b.lastLearnedAt ? (now - b.lastLearnedAt) : Infinity;
        const dueByTime = !b.lastLearnedAt || age > 20 * 3600 * 1000;
        if (!dueByTime && age < 90 * 60 * 1000) continue; // adaptive check at most every 90 min per contact
        const messages = await fetchChatMessages(b.jid || b.key, 130);
        if (!messages.length) continue;
        const lastMsgAt = messages[messages.length - 1].timestamp || 0;
        if (b.lastLearnedAt && lastMsgAt <= b.lastLearnedAt) continue; // nothing new at all
        const newOwnerMsgs = messages.filter(m => m.fromMe && (m.timestamp || 0) > (b.lastLearnedAt || 0)).length;
        if (!dueByTime && newOwnerMsgs < 40) continue; // adaptive: re-understand after 40+ new owner messages
        console.log('[BRAIN] 🎓 Updating understanding for ' + (b.name || b.key) + ' (' + newOwnerMsgs + ' new owner messages since last learn)...');
        await learnContactStyle(b.jid || b.key, { force: true });
        done++;
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
    modes: Object.entries(MODES).map(([id, label]) => ({ id, label })),
    formalityLevels: FORMALITY_LEVELS,
    addressStyles: ADDRESS_STYLES
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

  app.get(['/api/brain-powers', '/api/brain/:jid/powers', '/api/brain-powers/:jid'], async (req, res) => {
    try {
      const rawJid = req.query?.jid || req.params?.jid || '';
      const jid = decodeURIComponent(rawJid);
      if (!jid) return res.status(400).json({ error: 'Missing jid' });
      let profile = await getBrain(jid, { fresh: true });
      if (!profile) {
        profile = sanitizeProfile({ jid });
      }
      res.json({
        ok: true,
        jid,
        name: profile.name || '',
        mode: profile.mode || 'auto',
        modalities: profile.modalities || {
          allowAudio: true,
          allowImage: true,
          allowVideo: true,
          allowDoc: true,
          allowGif: true,
          twoWayContext: true,
          outputVoice: false
        },
        permissions: profile.permissions || {
          canOfferProducts: false,
          canSendInvoice: false,
          canTalkPrice: false
        }
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post(['/api/brain-powers', '/api/brain/:jid/powers', '/api/brain-powers/:jid'], async (req, res) => {
    try {
      const rawJid = req.body?.jid || req.query?.jid || req.params?.jid || '';
      const jid = decodeURIComponent(rawJid);
      if (!jid) return res.status(400).json({ error: 'Missing jid' });
      const { mode, modalities, permissions } = req.body || {};
      let profile = await getBrain(jid, { fresh: true });
      const patch = {};
      if (mode) patch.mode = mode;
      if (modalities && typeof modalities === 'object') patch.modalities = modalities;
      if (permissions && typeof permissions === 'object') patch.permissions = permissions;
      
      patch.powersConfigured = true;
      patch.autoCreated = false;
      patch.powersConfiguredAt = Date.now();

      const saved = await saveBrain(jid, { ...(profile || {}), ...patch });

      if (typeof brainPowersSaveHook === 'function') {
        try {
          await brainPowersSaveHook(jid, modalities, saved);
        } catch (hErr) {
          console.warn('[BRAIN] brainPowersSaveHook error:', hErr.message);
        }
      }

      res.json({ ok: true, profile: saved });
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

  // Brain writes change who handles a chat, so they are fail-closed admin protected.
  const brainWriteGuard = makeAdminGuard({ adminToken: process.env.ADMIN_TOKEN, label: 'brain' });

  app.post('/api/brain/:jid', brainWriteGuard, async (req, res) => {
    try {
      const jid = decodeURIComponent(req.params.jid);
      if (!jid || jid.length > 120) return res.status(400).json({ error: 'Invalid chat id' });
      const profile = await saveBrain(jid, req.body || {});
      res.json({
        ok: true,
        profile,
        savedAt: profile.updatedAt,
        learnedPreserved: !!(profile.learned && profile.learned.style),
        facts: (profile.learned && Array.isArray(profile.learned.facts)) ? profile.learned.facts.length : 0,
        // 🎭 What the AI currently thinks the owner's writing style is in this chat.
        liveVoice: (profile.learned && profile.learned.live) || null,
        liveVoiceLabel: describeVoice(profile.learned && profile.learned.live)
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/brain/:jid', brainWriteGuard, async (req, res) => {
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
      res.json(r.ok
        ? { ok: true, learned: r.learned, verified: r.verified, savedAt: r.savedAt, facts: r.facts, topics: r.topics }
        : { ok: false, error: r.error });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 🎭 Live voice: read the owner's current writing style in this chat right now (mode, tone,
  // phrases, sample lines). Also runs by itself every few of the owner's own replies.
  app.post('/api/brain/:jid/voice', async (req, res) => {
    try {
      const r = await learnContactVoice(decodeURIComponent(req.params.jid), { force: true });
      res.json(r.ok
        ? { ok: true, live: r.live, reading: describeVoice(r.live) }
        : { ok: false, error: r.error });
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
