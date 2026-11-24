// ============================================================================
// 🧠 LLM TANK — automatic, reviewable learning for every contact
// ============================================================================
// Distils real conversations into candidates:
//   • faq  — a reusable question + answer for the company library
//   • note — a fact / preference about ONE contact (goes to their LLM Card)
//
// NOTHING reaches a live prompt automatically. Candidates land in a review queue
// (`appData/llmTankQueue`) and the owner approves or rejects them — money, prices
// and promises are always flagged so they can never be published by accident.
// ============================================================================
import { doc, getDoc, setDoc } from 'firebase/firestore';
import OpenAI from 'openai';
import { isAiAutoFetchStopped, recordAiCall } from './aiTracker.mjs';
import { LUNA_TEXT_MODEL } from './aiProviders.mjs';

let tankDb = null;
export function attachLlmTankDb(db) { if (db) tankDb = db; }

const QUEUE_DOC = ['appData', 'llmTankQueue'];
const MAX_ITEMS = 500;
const MAX_FAQS_PER_CHAT = 4;
const MAX_NOTES_PER_CHAT = 4;
const NIGHTLY_MIN_GAP_MS = 20 * 60 * 60 * 1000;   // at most once per ~day
const MAX_TRANSCRIPT_CHARS = 6000;

const sstr = (v, n = 500) => String(v == null ? '' : v).slice(0, n);
const normQuestion = (q) => sstr(String(q || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(), 300);

/** Cheap similarity for de-duplication (Jaccard over word sets). */
function similarity(a, b) {
  const A = new Set(normQuestion(a).split(' ').filter(Boolean));
  const B = new Set(normQuestion(b).split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

function openAiClient() {
  const key = process.env.OPENAI_API_KEY || '';
  if (!key) throw new Error('OPENAI_API_KEY is not configured');
  const base = (process.env.OPENAI_BASE_URL || '').trim();
  return new OpenAI(base ? { apiKey: key, baseURL: base, timeout: 90000 } : { apiKey: key, timeout: 90000 });
}

function parseJsonObject(text) {
  const raw = String(text || '').replace(/```json/gi, '```').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(raw.slice(start, end + 1)); } catch (e) { return null; }
}

const DISTILL_SYSTEM =
  'You are a knowledge distiller for a WhatsApp business assistant. Read ONE conversation transcript and output ONLY JSON (no fences, no commentary) in this shape:\n' +
  '{"faqs":[{"question":"...","answer":"...","tags":["..."],"money":false}],"notes":[{"text":"...","kind":"preference|fact|person|business","money":false}]}\n' +
  'Rules:\n' +
  '- Extract ONLY facts that are explicitly present in the transcript. Never invent prices, dates, quantities or promises.\n' +
  '- "faq": only a question a FUTURE customer could plausibly ask, with an answer that is generally true for the company (hours, location, process, product basics). Skip greetings, small talk, one-off order details and anything that depends on that day\'s stock or rate.\n' +
  '- "note": one short sentence about THIS contact (preferences, language, role, company, what they usually buy). Maximum 3 notes.\n' +
  '- Set "money": true whenever the text contains a price, rate, discount, quantity commitment, payment term or delivery promise.\n' +
  '- Write the answer in the same language the customer used in the transcript (Roman Urdu stays Roman Urdu; English stays English). Never Devanagari.\n' +
  '- If the transcript has nothing reusable, output {"faqs":[],"notes":[]}.';

/** Distil one transcript. Returns { faqs:[], notes:[] } — never throws on bad model output. */
export async function distillTranscript({ name = '', transcript = '' } = {}) {
  const text = sstr(transcript, MAX_TRANSCRIPT_CHARS);
  if (!text || text.length < 40) return { faqs: [], notes: [] };

  const client = openAiClient();
  const started = Date.now();
  const comp = await client.chat.completions.create({
    model: LUNA_TEXT_MODEL,
    max_completion_tokens: 900,
    messages: [
      { role: 'system', content: DISTILL_SYSTEM },
      { role: 'user', content: 'Contact: ' + sstr(name || 'Customer', 80) + '\n--- TRANSCRIPT ---\n' + text + '\n--- END TRANSCRIPT ---' }
    ]
  });
  const replyText = comp.choices?.[0]?.message?.content || '';
  try {
    recordAiCall({
      provider: 'openai', model: LUNA_TEXT_MODEL,
      area: 'LLM Tank · distill',
      isAutoFetch: false,
      prompt: sstr(text, 200),
      response: sstr(replyText, 400),
      tokensIn: comp.usage?.prompt_tokens || 0,
      tokensOut: comp.usage?.completion_tokens || 0,
      cachedTokens: comp.usage?.prompt_tokens_details?.cached_tokens || 0,
      durationMs: Date.now() - started
    });
  } catch (e) { /* tracking must never break distillation */ }

  const parsed = parseJsonObject(replyText) || {};
  const faqs = (Array.isArray(parsed.faqs) ? parsed.faqs : [])
    .filter(f => f && String(f.question || '').trim().length > 8 && String(f.answer || '').trim().length > 2)
    .slice(0, MAX_FAQS_PER_CHAT)
    .map(f => ({
      question: sstr(String(f.question).trim(), 300),
      answer: sstr(String(f.answer).trim(), 800),
      tags: (Array.isArray(f.tags) ? f.tags : []).map(t => sstr(t, 40)).filter(Boolean).slice(0, 8),
      money: f.money === true
    }));
  const notes = (Array.isArray(parsed.notes) ? parsed.notes : [])
    .filter(n => n && String(n.text || '').trim().length > 4)
    .slice(0, MAX_NOTES_PER_CHAT)
    .map(n => ({
      text: sstr(String(n.text).trim(), 400),
      kind: ['preference', 'fact', 'person', 'business'].includes(n.kind) ? n.kind : 'fact',
      money: n.money === true
    }));
  return { faqs, notes };
}

async function readQueue() {
  if (!tankDb) return { items: [], nightlyAt: 0 };
  try {
    const snap = await getDoc(doc(tankDb, QUEUE_DOC[0], QUEUE_DOC[1]));
    const data = snap.exists() ? (snap.data() || {}) : {};
    return { items: Array.isArray(data.items) ? data.items : [], nightlyAt: Number(data.nightlyAt) || 0 };
  } catch (e) { return { items: [], nightlyAt: 0 }; }
}

async function writeQueue(queue) {
  if (!tankDb) return;
  const items = (queue.items || []).slice(-MAX_ITEMS);
  await setDoc(doc(tankDb, QUEUE_DOC[0], QUEUE_DOC[1]), { items, nightlyAt: queue.nightlyAt || 0, updatedAt: Date.now() }, { merge: true });
}

/**
 * Add candidates to the review queue, skipping near-duplicates of pending items and of the
 * existing published FAQ library. Returns how many were added.
 */
export async function queueCandidates(items, meta = {}) {
  const incoming = (Array.isArray(items) ? items : []).filter(Boolean);
  if (!incoming.length) return 0;
  const queue = await readQueue();

  // Existing published questions (best effort — the tank still works if the KB is unreachable).
  let published = [];
  try {
    const wa = await import('./waWebClient.js');
    const kb = wa.getWaWebKnowledgeBase() || {};
    published = (Array.isArray(kb.faqs) ? kb.faqs : []).map(f => f && f.question).filter(Boolean);
  } catch (e) { /* optional */ }

  const known = [...published, ...queue.items.filter(i => i.status !== 'rejected').map(i => i.question || i.text)];
  let added = 0;
  for (const item of incoming) {
    const probe = item.type === 'faq' ? item.question : item.text;
    if (!probe) continue;
    if (known.some(k => similarity(k, probe) >= 0.85)) continue;
    queue.items.push({
      id: 'lt-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
      type: item.type === 'faq' ? 'faq' : 'note',
      question: item.question || '',
      answer: item.answer || '',
      tags: item.tags || [],
      text: item.text || '',
      kind: item.kind || '',
      money: item.money === true,
      sourceJid: sstr(meta.jid || '', 80),
      sourceName: sstr(meta.name || '', 80),
      createdAt: Date.now(),
      status: 'pending'
    });
    known.push(probe);
    added++;
  }
  if (added) await writeQueue(queue);
  return added;
}

export async function listCandidates({ status = 'pending' } = {}) {
  const queue = await readQueue();
  const items = status === 'all' ? queue.items : queue.items.filter(i => i.status === status);
  return items.slice().reverse();
}

export async function approveCandidate(id) {
  const queue = await readQueue();
  const item = queue.items.find(i => i.id === id);
  if (!item) throw new Error('Candidate not found');
  if (item.status === 'approved') return item;

  if (item.type === 'faq') {
    const wa = await import('./waWebClient.js');
    const kb = wa.getWaWebKnowledgeBase() || {};
    const faqs = Array.isArray(kb.faqs) ? kb.faqs.slice() : [];
    if (!faqs.some(f => similarity(f && f.question, item.question) >= 0.85)) {
      faqs.push({ question: item.question, answer: item.answer, tags: item.tags || [] });
    }
    await wa.saveWaWebKnowledgeBase({ faqs });
  } else {
    // Contact note → the contact's LLM Card (notes field, capped by the brain sanitizer).
    const cb = await import('./contactBrain.mjs');
    const profile = await cb.getBrain(item.sourceJid, { fresh: true });
    if (!profile) throw new Error('This contact has no LLM Card yet — create the card first.');
    const stamp = new Date().toISOString().slice(0, 10);
    const line = '[' + stamp + '] ' + item.text;
    const notes = (String(profile.notes || '').trim() ? String(profile.notes).trim() + '\n' : '') + line;
    await cb.saveBrain(item.sourceJid, { ...profile, notes });
  }

  item.status = 'approved';
  item.decidedAt = Date.now();
  await writeQueue(queue);
  return item;
}

export async function rejectCandidate(id) {
  const queue = await readQueue();
  const item = queue.items.find(i => i.id === id);
  if (!item) throw new Error('Candidate not found');
  item.status = 'rejected';
  item.decidedAt = Date.now();
  await writeQueue(queue);
  return item;
}

/** Distil one chat and queue the result. Shared by the nightly job and the API/script. */
export async function learnFromTranscript({ jid = '', name = '', transcript = '' } = {}) {
  const { faqs, notes } = await distillTranscript({ name, transcript });
  const items = [
    ...faqs.map(f => ({ type: 'faq', ...f })),
    ...notes.map(n => ({ type: 'note', ...n }))
  ];
  const added = await queueCandidates(items, { jid, name });
  return { faqs: faqs.length, notes: notes.length, queued: added };
}

/**
 * Nightly auto-learn: reads recent one-to-one chats, distils them with Luna and queues the
 * candidates. Self-throttled to ~once a day and skipped entirely when the owner has paused
 * AI auto-fetching. Returns a small summary for the log.
 */
export async function runNightly({ maxChats = 6, force = false } = {}) {
  if (!tankDb) return { skipped: 'no db' };
  if (!process.env.OPENAI_API_KEY) return { skipped: 'no OPENAI_API_KEY' };
  if (isAiAutoFetchStopped()) return { skipped: 'ai auto-fetch paused' };

  const queue = await readQueue();
  if (!force && queue.nightlyAt && (Date.now() - queue.nightlyAt) < NIGHTLY_MIN_GAP_MS) {
    return { skipped: 'already ran today' };
  }

  let chats = [];
  try {
    const wa = await import('./waWebClient.js');
    chats = wa.listWaWebChatsForTank({ minMessages: 8, limit: Math.max(1, Math.min(12, maxChats)) });
  } catch (e) {
    return { skipped: 'chat list unavailable: ' + sstr(e.message, 120) };
  }

  let processed = 0, queued = 0, failed = 0;
  for (const chat of chats) {
    if (isAiAutoFetchStopped()) break;
    try {
      const r = await learnFromTranscript({ jid: chat.jid, name: chat.name, transcript: chat.transcript });
      queued += r.queued;
      processed++;
    } catch (e) {
      failed++;
      console.warn('[LLM TANK] distill failed for ' + (chat.name || chat.jid) + ': ' + sstr(e.message, 120));
    }
  }
  if (processed) {
    // Only mark the day as done once something was actually studied — a fresh restart with no
    // chats in memory must not postpone the first real run by a whole day.
    queue.nightlyAt = Date.now();
    await writeQueue(queue);
    console.log('[LLM TANK] 🌙 nightly distilled ' + processed + ' chat(s), queued ' + queued + ' candidate(s)' + (failed ? ', ' + failed + ' failed' : ''));
  }
  return { processed, queued, failed, chats: chats.length };
}
