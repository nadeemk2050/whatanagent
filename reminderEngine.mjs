// ============================================================================
// ⏰ REMINDER ENGINE — stateful, self-deciding WhatsApp follow-ups
// ============================================================================
// A reminder is not a one-shot cron message. It is a PLAN with a status that the
// engine re-evaluates every minute:
//
//   scheduled → awaiting_reply → snoozed → done / escalated / stopped
//
// It reads every reply, understands "after Dhuhr", "in 1 hour", "done", "stop",
// writes a FRESH message each time (never copy-paste), respects quiet hours,
// caps attempts, and alerts the owner when the person is silent or mentions a
// health worry. Medicine reminders never give dosage or medical advice.
//
// Wiring (from index.js):
//   attachReminderDeps({ db, send, sendHuman, getBossNumber })
//   registerReminderRoutes(app, { adminToken })
//   reminderTick()            // called from the existing 60s runTick
//
// Reply hook (from waWebClient.js, after the conditional-task hook):
//   if (await handleReminderReply(jid, text)) return;
// ============================================================================
import { doc, getDoc, setDoc, getDocs, deleteDoc, collection, query, where } from 'firebase/firestore';
import { resolveDeepSeek } from './aiProviders.mjs';
import { GEMINI_TEXT_CHAIN } from './aiProviders.mjs';
import { recordAiCall } from './aiTracker.mjs';
import { cachedTokensFrom } from './promptCache.mjs';
import { humanizeReplyText } from './humanVoice.mjs';
import {
  getPrayerTimes, parseDeferral, localHm, localYmd, localTimeToUtcMs
} from './prayerTimes.mjs';
import { makeAdminGuard } from './adminGuard.mjs';

const COL = 'reminderPlans';
const ACTIVE = new Set(['scheduled', 'awaiting_reply', 'snoozed']);
const DEFAULT_TZ = process.env.REMINDER_TIMEZONE || 'Asia/Karachi';
const DEFAULT_CITY = process.env.REMINDER_CITY || 'Karachi';
const DEFAULT_COUNTRY = process.env.REMINDER_COUNTRY || 'Pakistan';

let db = null;
let sendText = null;
let sendHuman = null;
let getBossNumber = null;
let tickBusy = false;

export function attachReminderDeps(deps = {}) {
  if (deps.db) db = deps.db;
  if (typeof deps.send === 'function') sendText = deps.send;
  if (typeof deps.sendHuman === 'function') sendHuman = deps.sendHuman;
  if (typeof deps.getBossNumber === 'function') getBossNumber = deps.getBossNumber;
}

export function remindersReady() { return !!db; }

// --------------------------------------------------------------------------- settings + AI
let settingsCache = { at: 0, value: {} };
async function getSettings() {
  if (Date.now() - settingsCache.at < 300000) return settingsCache.value;
  try {
    const snap = await getDoc(doc(db, 'appData', 'settings'));
    settingsCache = { at: Date.now(), value: snap.exists() ? (snap.data() || {}) : {} };
  } catch (e) {
    settingsCache = { at: Date.now(), value: {} };
  }
  return settingsCache.value;
}

async function aiCall(system, user, { maxTokens = 400, json = false } = {}) {
  if (!db) return '';
  const st = await getSettings();
  const qwenKey = st.QWEN_API_KEY || process.env.QWEN_API_KEY || st.DASHSCOPE_API_KEY || process.env.DASHSCOPE_API_KEY || '';
  const qwenBase = String(st.QWEN_BASE_URL || process.env.QWEN_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, '');
  const qwenModel = st.QWEN_MODEL || process.env.QWEN_MODEL || 'qwen3.8-flash';
  const ds = resolveDeepSeek(st);
  const geminiKey = st.GEMINI_API_KEY || process.env.GEMINI_API_KEY || st.geminiApiKey || '';
  const order = [];
  if (ds.key) order.push('deepseek');
  if (qwenKey) order.push('qwen');
  if (geminiKey) order.push('gemini');

  for (const p of order) {
    const started = Date.now();
    try {
      if (p === 'gemini') {
        const model = GEMINI_TEXT_CHAIN[0];
        const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(geminiKey);
        const generationConfig = { temperature: json ? 0.2 : 0.6, maxOutputTokens: maxTokens };
        if (json) generationConfig.responseMimeType = 'application/json';
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: system + '\n\n' + user }] }], generationConfig }),
          signal: AbortSignal.timeout(20000)
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        const t = (((j.candidates || [])[0] || {}).content || {}).parts?.[0]?.text || '';
        const u = j.usageMetadata || {};
        recordAiCall({
          provider: 'gemini', model, area: 'Reminder Engine', isAutoFetch: false,
          prompt: String(user).slice(0, 800), response: String(t).slice(0, 800),
          tokensIn: u.promptTokenCount || 0, tokensOut: u.candidatesTokenCount || 0,
          cachedTokens: cachedTokensFrom(j), durationMs: Date.now() - started
        });
        if (t) return String(t).trim();
      } else {
        const key = p === 'qwen' ? qwenKey : ds.key;
        const base = p === 'qwen' ? qwenBase : ds.base;
        const model = p === 'qwen' ? qwenModel : ds.model;
        const body = {
          model,
          temperature: json ? 0.2 : 0.6,
          max_tokens: maxTokens,
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
        };
        if (/dashscope/i.test(base)) body.enable_thinking = false;
        const r = await fetch(base + '/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(20000)
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        const t = j?.choices?.[0]?.message?.content || '';
        const u = j.usage || {};
        recordAiCall({
          provider: p, model, area: 'Reminder Engine', isAutoFetch: false,
          prompt: String(user).slice(0, 800), response: String(t).slice(0, 800),
          tokensIn: u.prompt_tokens || 0, tokensOut: u.completion_tokens || 0,
          cachedTokens: cachedTokensFrom(j), durationMs: Date.now() - started
        });
        if (t) return String(t).trim();
      }
    } catch (e) { /* try the next provider */ }
  }
  return '';
}

// --------------------------------------------------------------------------- time helpers
function tzOf(plan) { return plan.timezone || DEFAULT_TZ; }

function nextLocalOccurrence(timeLocal, tz, fromMs) {
  const m = String(timeLocal || '').match(/(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  const { y, m: mo, d } = localYmd(tz, fromMs);
  let at = localTimeToUtcMs(y, mo, d, m[1] + ':' + m[2], tz);
  if (at <= fromMs) {
    const n = new Date(Date.UTC(y, mo - 1, d) + 86400000);
    at = localTimeToUtcMs(n.getUTCFullYear(), n.getUTCMonth() + 1, n.getUTCDate(), m[1] + ':' + m[2], tz);
  }
  return at;
}

function toMinutes(hhmm) {
  const m = String(hhmm || '').match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

function isQuiet(plan, ms = Date.now()) {
  const q = plan.quietHours || {};
  const start = q.start || '22:30';
  const end = q.end || '06:30';
  const cur = toMinutes(localHm(tzOf(plan), ms));
  const a = toMinutes(start);
  const b = toMinutes(end);
  if (a === b) return false;
  return a < b ? (cur >= a && cur < b) : (cur >= a || cur < b);
}

function quietEnd(plan, ms = Date.now()) {
  const end = (plan.quietHours && plan.quietHours.end) || '06:30';
  const tz = tzOf(plan);
  const { y, m, d } = localYmd(tz, ms);
  let at = localTimeToUtcMs(y, m, d, end, tz);
  if (at <= ms) {
    const n = new Date(Date.UTC(y, m - 1, d) + 86400000);
    at = localTimeToUtcMs(n.getUTCFullYear(), n.getUTCMonth() + 1, n.getUTCDate(), end, tz);
  }
  return at;
}

function dayKey(plan) {
  const { y, m, d } = localYmd(tzOf(plan));
  return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

function formatLocal(ms, tz) {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));
  } catch (e) { return ''; }
}

function nextDelayMs(plan, attempt) {
  const ladder = Array.isArray(plan.ladderMinutes) && plan.ladderMinutes.length ? plan.ladderMinutes : [60, 30, 30, 30];
  const mins = Number(ladder[Math.min(Math.max(attempt - 1, 0), ladder.length - 1)]) || 30;
  return mins * 60000;
}

// --------------------------------------------------------------------------- storage
async function savePlan(plan) {
  plan.updatedAt = Date.now();
  await setDoc(doc(db, COL, plan.id), plan, { merge: true });
}

async function allPlans() {
  if (!db) return [];
  const snap = await getDocs(collection(db, COL));
  const out = [];
  snap.forEach((d) => out.push({ id: d.id, ...(d.data() || {}) }));
  return out;
}

export async function listPlans(limitN = 200) {
  const out = await allPlans();
  out.sort((a, b) => (Number(a.nextWakeupAt) || 0) - (Number(b.nextWakeupAt) || 0));
  return out.slice(0, limitN);
}

async function plansForJid(jid) {
  const digits = String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
  // Single-field query where possible, then loose-match the digits so a @lid chat
  // still finds a plan created from a phone number.
  let rows = [];
  try {
    const snap = await getDocs(query(collection(db, COL), where('contactJid', '==', jid)));
    snap.forEach((d) => rows.push({ id: d.id, ...(d.data() || {}) }));
  } catch (e) { rows = []; }
  if (!rows.length) rows = await allPlans();
  return rows.filter((p) => {
    if (!ACTIVE.has(p.status)) return false;
    if (p.contactJid === jid) return true;
    const pd = String(p.contactJid || p.phone || '').replace(/\D/g, '');
    return !!(digits && pd && (pd === digits || pd.endsWith(digits) || digits.endsWith(pd)));
  });
}

// --------------------------------------------------------------------------- messaging
async function deliver(jid, text) {
  const clean = humanizeReplyText(text || '');
  if (!clean) return false;
  try {
    if (sendHuman) { await sendHuman(jid, clean); return true; }
    if (sendText) { await sendText(jid, clean); return true; }
  } catch (e) {
    console.warn('[REMINDER] send failed:', (e && e.message) || e);
  }
  return false;
}

async function alertBoss(text) {
  try {
    const num = getBossNumber ? await getBossNumber() : '';
    if (num && sendText) await sendText(num, text);
  } catch (e) { /* best effort */ }
}

// --------------------------------------------------------------------------- phrasing
function fallbackNudge(plan, attempt) {
  const name = plan.contactName || '';
  const n = name ? name + ' ' : '';
  if (plan.goalType === 'medicine') {
    const lines = [
      'Assalam o Alaikum ' + n + '! Dawai ka time ho gaya hai — le li aap ne? 🙂',
      n + 'bas ek chhota sa yaad dilana tha — dawai le li? Koi jaldi nahi, jab free hon batayein.',
      'Aap busy hain shayad, koi baat nahi. Jab pani peeyein to dawai bhi le lein ji.',
      'Bas ek narm si yaad — dawai aaj reh na jaye. Main yahan hoon, batayein.'
    ];
    return lines[Math.min(Math.max(attempt - 1, 0), lines.length - 1)];
  }
  if (plan.goalType === 'walk') {
    const lines = [
      'Assalam o Alaikum ' + n + '! Subah ki thodi walk ka time hai — 10 minute bhi kaafi hain 🙂',
      n + 'mausam acha hai — jab free hon thodi walk kar lein, fresh feel hoga.',
      'Bas ek chhota reminder — aaj ki walk ho gayi? Bahar ki hawa intezar kar rahi hai.'
    ];
    return lines[Math.min(Math.max(attempt - 1, 0), lines.length - 1)];
  }
  return 'Bas ek chhota reminder: ' + plan.goal + '. Jab time ho batayein ji.';
}

async function buildNudge(plan, attempt) {
  const recent = (plan.lastMessages || []).slice(-5).map((m, i) => (i + 1) + '. ' + m.text).join('\n') || '(none yet)';
  const system = 'You write ONE short WhatsApp follow-up message for a caring, respectful assistant. ' +
    'Tone: warm, human, hans mukh, never stiff, never scolding, never guilt. Match the contact language (Roman Urdu if unsure). ' +
    '1-2 short lines. No markdown, no bullets, no emoji rows. Never promise anything. ' +
    'For a medicine reminder: never give dosage or medical advice.';
  const user = 'Goal: ' + plan.goal + ' (' + plan.goalType + ')\n' +
    'Contact: ' + (plan.contactName || 'the contact') + '\n' +
    'Attempt ' + attempt + ' of ' + (plan.maxAttempts || 5) + '\n' +
    'Local time now: ' + localHm(tzOf(plan)) + ' (' + tzOf(plan) + ')\n' +
    'Messages already sent (do NOT repeat their words or structure):\n' + recent + '\n\n' +
    'Write the next follow-up now.';
  const ai = await aiCall(system, user, { maxTokens: 160 });
  const text = humanizeReplyText(ai || '');
  return text || fallbackNudge(plan, attempt);
}

function heuristicInterpret(text) {
  const s = String(text || '').toLowerCase();
  if (/\b(pain|dard|side ?effect|ulti|chakkar|dizzy|confus|bleed|tabiyat kharab|bechain|sugar|bp)\b/.test(s)) {
    return { outcome: 'later', needsHuman: true, replyHint: 'health concern' };
  }
  if (/\b(le li|leliya|kha li|kha liya|done|took it|kar li|walk kar li|ho gaya|pa li|le liya)\b/.test(s)) {
    return { outcome: 'done', needsHuman: false, replyHint: '' };
  }
  if (/\b(tang|stop|band|mat karo|pareshan|annoy|leave me|nahi chahiye)\b/.test(s)) {
    return { outcome: 'refused', needsHuman: false, replyHint: '' };
  }
  if (/\b(baad|later|after|kal|tomorrow|busy|abhi nahi|thodi der|free ho|sehri|suhoor|dhuhr|zuhr|asr|maghrib|isha|iftar|morning|evening|tonight)\b/.test(s)) {
    return { outcome: 'later', needsHuman: false, replyHint: '' };
  }
  if (/\?/.test(s)) return { outcome: 'question', needsHuman: false, replyHint: '' };
  return { outcome: 'unclear', needsHuman: false, replyHint: '' };
}

async function interpretReply(plan, text, prayer) {
  const recent = (plan.lastMessages || []).slice(-5).map((m, i) => (i + 1) + '. ' + m.text).join('\n') || '(none)';
  const prayerLine = prayer
    ? ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].map((k) => k + ' ' + (prayer[k] || '?')).join(', ')
    : 'unknown';
  const system = 'You are the planner for a WhatsApp follow-up reminder. Read the contact reply and return JSON ONLY.';
  const user = 'Goal: ' + plan.goal + ' (' + plan.goalType + ')\n' +
    'Contact: ' + (plan.contactName || '') + '\n' +
    'Local time now: ' + localHm(tzOf(plan)) + ' (' + tzOf(plan) + ')\n' +
    'Prayer times today: ' + prayerLine + '\n' +
    'Messages already sent:\n' + recent + '\n\n' +
    'Contact reply: "' + String(text).slice(0, 500) + '"\n\n' +
    'Return JSON with keys: outcome ("done"|"later"|"refused"|"question"|"unrelated"|"unclear"), ' +
    'resumeAt (ISO 8601 WITH timezone offset, e.g. 2026-11-23T13:30:00+05:00, or null), mood, needsHuman (boolean), replyHint (one line).\n' +
    'Rules: "le li/kha li/done/took it/walk kar li" = done. "baad mein/after X/after dhuhr/kal" = later. ' +
    '"tang mat karo/stop/band karo" = refused. A health worry, pain, side effect, dizziness or confusion = needsHuman true. ' +
    'Never give medical advice.';
  const raw = await aiCall(system, user, { maxTokens: 300, json: true });

  let obj = null;
  if (raw) {
    const a = raw.indexOf('{');
    const b = raw.lastIndexOf('}');
    if (a >= 0 && b > a) { try { obj = JSON.parse(raw.slice(a, b + 1)); } catch (e) { obj = null; } }
  }
  if (!obj) obj = heuristicInterpret(text);

  let resumeAt = 0;
  // Only trust an explicit timezone; a bare local ISO would be read as UTC by the server.
  if (obj && obj.resumeAt && /(?:Z|[+-]\d{2}:\d{2})$/i.test(String(obj.resumeAt))) {
    const t = Date.parse(obj.resumeAt);
    if (Number.isFinite(t) && t > Date.now() + 60000 && t < Date.now() + 36 * 3600000) resumeAt = t;
  }
  if (!resumeAt && obj && obj.outcome === 'later') {
    resumeAt = parseDeferral(text, Date.now(), tzOf(plan), prayer) || (Date.now() + 30 * 60000);
  }
  return { ...obj, resumeAt };
}

// --------------------------------------------------------------------------- plans
export async function createReminder(input = {}) {
  if (!db) throw new Error('Reminder storage unavailable');
  const tz = input.timezone || DEFAULT_TZ;
  const phone = String(input.phone || input.jid || '').replace(/\D/g, '');
  const jid = String(input.contactJid || '').includes('@')
    ? String(input.contactJid)
    : (phone ? phone + '@s.whatsapp.net' : '');
  if (!jid) throw new Error('phone or contactJid is required');

  const goalType = ['medicine', 'walk', 'custom'].includes(input.goalType) ? input.goalType : 'custom';
  const goal = String(input.goal || '').trim()
    || (goalType === 'medicine' ? 'Take medicine' : goalType === 'walk' ? 'Morning walk' : '');
  if (!goal) throw new Error('goal is required');

  let firstSendAt = Number(input.firstSendAt) || 0;
  if (!firstSendAt && input.timeLocal) firstSendAt = nextLocalOccurrence(input.timeLocal, tz, Date.now());
  if (!firstSendAt && Number(input.inMinutes) > 0) firstSendAt = Date.now() + Number(input.inMinutes) * 60000;
  if (!firstSendAt) firstSendAt = Date.now() + 60000;

  const now = Date.now();
  const id = String(input.id || ('rem_' + now.toString(36) + '_' + Math.random().toString(36).slice(2, 6)));
  const plan = {
    id,
    contactJid: jid,
    contactName: String(input.contactName || phone || '').trim(),
    phone,
    goalType,
    goal,
    status: 'scheduled',
    firstSendAt,
    nextWakeupAt: firstSendAt,
    timezone: tz,
    city: input.city || DEFAULT_CITY,
    country: input.country || DEFAULT_COUNTRY,
    timeLocal: String(input.timeLocal || ''),
    repeatDaily: !!(input.repeatDaily || input.repeat === 'daily'),
    quietHours: input.quietHours || { start: '22:30', end: '06:30' },
    attempts: 0,
    maxAttempts: Number(input.maxAttempts) || 5,
    escalateAfterAttempts: Number(input.escalateAfterAttempts) || 4,
    ladderMinutes: Array.isArray(input.ladderMinutes) && input.ladderMinutes.length ? input.ladderMinutes : [60, 30, 30, 30],
    dailyCap: Number(input.dailyCap) || 5,
    sentToday: { day: '', count: 0 },
    lastMessages: [],
    contextNote: '',
    chain: input.chain || null,
    createdAt: now,
    updatedAt: now,
    log: [{ at: now, event: 'created' }]
  };
  await setDoc(doc(db, COL, id), plan, { merge: true });
  return plan;
}

async function scheduleNextDaily(plan) {
  try {
    const tz = tzOf(plan);
    const nextAt = plan.timeLocal
      ? nextLocalOccurrence(plan.timeLocal, tz, Date.now() + 3600000)
      : (Number(plan.firstSendAt) || Date.now()) + 86400000;
    const id = 'rem_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    const copy = {
      ...plan,
      id,
      status: 'scheduled',
      attempts: 0,
      lastSentAt: 0,
      lastReplyAt: 0,
      lastMessages: [],
      contextNote: '',
      sentToday: { day: '', count: 0 },
      firstSendAt: nextAt,
      nextWakeupAt: nextAt,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      log: [{ at: Date.now(), event: 'created (daily repeat)' }]
    };
    await setDoc(doc(db, COL, id), copy, { merge: true });
  } catch (e) { console.warn('[REMINDER] daily reschedule failed:', (e && e.message) || e); }
}

async function createChained(plan) {
  if (!plan.chain || !plan.chain.goal) return;
  try {
    const chain = plan.chain;
    const at = Number(chain.delayMinutes) > 0
      ? Date.now() + Number(chain.delayMinutes) * 60000
      : (chain.timeLocal ? nextLocalOccurrence(chain.timeLocal, tzOf(plan), Date.now() + 3600000) : Date.now() + 3600000);
    await createReminder({
      ...chain,
      phone: plan.phone,
      contactJid: plan.contactJid,
      contactName: plan.contactName,
      timezone: tzOf(plan),
      city: plan.city,
      country: plan.country,
      firstSendAt: at
    });
  } catch (e) { console.warn('[REMINDER] chain failed:', (e && e.message) || e); }
}

async function escalate(plan, reason) {
  if (plan.status === 'escalated') return;
  plan.status = 'escalated';
  plan.escalatedAt = Date.now();
  plan.log = (plan.log || []).concat([{ at: Date.now(), event: 'escalated', reason }]).slice(-50);
  await savePlan(plan);
  await alertBoss('⏰ Reminder: ' + (plan.contactName || plan.contactJid) + ' ne "' + plan.goal + '" ka reply nahi diya (' + reason + '). Please check.');
  if (plan.repeatDaily) await scheduleNextDaily(plan);
}

async function processPlan(plan, now) {
  if (isQuiet(plan, now)) {
    plan.nextWakeupAt = quietEnd(plan, now);
    plan.log = (plan.log || []).concat([{ at: now, event: 'quiet-hours' }]).slice(-50);
    await savePlan(plan);
    return;
  }

  const today = dayKey(plan);
  if (!plan.sentToday || plan.sentToday.day !== today) plan.sentToday = { day: today, count: 0 };
  if ((plan.sentToday.count || 0) >= (plan.dailyCap || 5)) {
    await escalate(plan, 'daily cap reached');
    return;
  }

  const attempt = Number(plan.attempts || 0) + 1;
  if (attempt > (plan.maxAttempts || 5)) {
    await escalate(plan, 'no reply after ' + (plan.attempts || 0) + ' attempts');
    return;
  }

  const prayer = await getPrayerTimes({
    city: plan.city || DEFAULT_CITY,
    country: plan.country || DEFAULT_COUNTRY,
    timeZone: tzOf(plan)
  });
  const text = await buildNudge(plan, attempt);
  const ok = await deliver(plan.contactJid, text);
  if (!ok) {
    plan.nextWakeupAt = now + 5 * 60000;
    await savePlan(plan);
    return;
  }

  plan.attempts = attempt;
  plan.lastSentAt = now;
  plan.lastMessages = (plan.lastMessages || []).concat([{ at: now, text }]).slice(-6);
  plan.sentToday.count = (plan.sentToday.count || 0) + 1;
  plan.status = 'awaiting_reply';
  plan.nextWakeupAt = now + nextDelayMs(plan, attempt);
  plan.log = (plan.log || []).concat([{ at: now, event: 'sent', attempt }]).slice(-50);
  await savePlan(plan);

  if (attempt >= (plan.escalateAfterAttempts || 4)) await escalate(plan, 'no reply after ' + attempt + ' attempts');
}

export async function reminderTick() {
  if (!db || tickBusy) return;
  tickBusy = true;
  try {
    const now = Date.now();
    const due = (await allPlans())
      .filter((p) => ACTIVE.has(p.status) && Number(p.nextWakeupAt || 0) <= now)
      .sort((a, b) => (Number(a.nextWakeupAt) || 0) - (Number(b.nextWakeupAt) || 0))
      .slice(0, 10);
    for (const plan of due) {
      try { await processPlan(plan, now); }
      catch (e) { console.warn('[REMINDER] plan ' + plan.id + ' failed:', (e && e.message) || e); }
    }
  } catch (e) {
    console.warn('[REMINDER] tick failed:', (e && e.message) || e);
  } finally {
    tickBusy = false;
  }
}

// --------------------------------------------------------------------------- reply hook
export async function handleReminderReply(jid, text) {
  if (!db || !jid || !String(text || '').trim()) return false;
  let plans = [];
  try { plans = await plansForJid(jid); } catch (e) { return false; }
  if (!plans.length) return false;

  plans.sort((a, b) => (Number(b.lastSentAt || b.firstSendAt) || 0) - (Number(a.lastSentAt || a.firstSendAt) || 0));
  const plan = plans[0];
  const prayer = await getPrayerTimes({
    city: plan.city || DEFAULT_CITY,
    country: plan.country || DEFAULT_COUNTRY,
    timeZone: tzOf(plan)
  });
  const verdict = await interpretReply(plan, text, prayer);
  const now = Date.now();

  plan.lastReplyAt = now;
  plan.contextNote = String(verdict.replyHint || verdict.outcome || '').slice(0, 200);
  plan.log = (plan.log || []).concat([{
    at: now, event: 'reply', outcome: verdict.outcome, detail: String(text).slice(0, 120)
  }]).slice(-50);

  if (verdict.needsHuman) {
    plan.status = 'escalated';
    await savePlan(plan);
    await deliver(jid, 'Allah hafiz ' + (plan.contactName || '') + ', aap please apne doctor se baat kar lein. Main Nadeem sahib ko bhi bata deta hoon.');
    await alertBoss('⚠️ ' + (plan.contactName || jid) + ' replied about "' + plan.goal + '": "' + String(text).slice(0, 160) + '" — please check. (AI ne koi medical advice nahi di.)');
    return true;
  }

  if (verdict.outcome === 'done') {
    plan.status = 'done';
    plan.completedAt = now;
    await savePlan(plan);
    await deliver(jid, 'Shabash ' + (plan.contactName || '') + '! 😊 Bahut acha. Main aaj ke liye yaad dilana band kar deta hoon.');
    if (plan.repeatDaily) await scheduleNextDaily(plan);
    if (plan.chain) await createChained(plan);
    return true;
  }

  if (verdict.outcome === 'refused') {
    plan.status = 'stopped';
    plan.stoppedAt = now;
    await savePlan(plan);
    await deliver(jid, 'Bilkul ' + (plan.contactName || '') + ', main samajh gaya. Main aap ko tang nahi karunga. Jab zaroorat ho batayein ji.');
    await alertBoss('⏸️ ' + (plan.contactName || jid) + ' asked to stop the "' + plan.goal + '" reminder. Stopped.');
    return true;
  }

  if (verdict.outcome === 'later') {
    const resumeAt = verdict.resumeAt || (now + 30 * 60000);
    plan.status = 'snoozed';
    plan.snoozedUntil = resumeAt;
    plan.nextWakeupAt = resumeAt;
    await savePlan(plan);
    await deliver(jid, 'Theek hai ' + (plan.contactName || '') + ', main ' + formatLocal(resumeAt, tzOf(plan)) + ' ke baad yaad dila doonga. Aap araam se rahein ji.');
    return true;
  }

  // question / unrelated / unclear: the normal AI should answer; just push the nudge out.
  plan.nextWakeupAt = Math.max(Number(plan.nextWakeupAt) || 0, now + 30 * 60000);
  await savePlan(plan);
  return false;
}

// --------------------------------------------------------------------------- admin API
export function registerReminderRoutes(app, { adminToken } = {}) {
  const guard = makeAdminGuard({ adminToken, label: 'reminders' });

  app.get('/api/reminders', guard, async (req, res) => {
    try { res.json({ ok: true, plans: await listPlans(200) }); }
    catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.post('/api/reminders', guard, async (req, res) => {
    try { res.json({ ok: true, plan: await createReminder(req.body || {}) }); }
    catch (e) { res.status(400).json({ ok: false, error: e.message }); }
  });

  app.post('/api/reminders/:id/stop', guard, async (req, res) => {
    try {
      const ref = doc(db, COL, req.params.id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ ok: false, error: 'Plan not found' });
      const plan = { id: req.params.id, ...(snap.data() || {}), status: 'stopped', stoppedAt: Date.now() };
      await setDoc(ref, plan, { merge: true });
      res.json({ ok: true, plan });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.post('/api/reminders/:id/snooze', guard, async (req, res) => {
    try {
      const minutes = Math.max(1, Number((req.body || {}).minutes) || 30);
      const ref = doc(db, COL, req.params.id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ ok: false, error: 'Plan not found' });
      const plan = { id: req.params.id, ...(snap.data() || {}) };
      plan.status = 'snoozed';
      plan.snoozedUntil = Date.now() + minutes * 60000;
      plan.nextWakeupAt = plan.snoozedUntil;
      await setDoc(ref, plan, { merge: true });
      res.json({ ok: true, plan });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.post('/api/reminders/:id/run-now', guard, async (req, res) => {
    try {
      const ref = doc(db, COL, req.params.id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ ok: false, error: 'Plan not found' });
      const plan = { id: req.params.id, ...(snap.data() || {}), status: 'scheduled', nextWakeupAt: Date.now() };
      await setDoc(ref, plan, { merge: true });
      res.json({ ok: true, plan });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.delete('/api/reminders/:id', guard, async (req, res) => {
    try { await deleteDoc(doc(db, COL, req.params.id)); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
}
