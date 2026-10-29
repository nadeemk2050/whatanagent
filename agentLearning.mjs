// ============================================================================
// 🌱 AI STAFF ACADEMY — learn from real WhatsApp chats
// ============================================================================
// A staff member under training can be assigned WhatsApp contacts and groups.
// Learning reads the recent history of each assigned chat, asks the agent's own
// model to extract durable facts / style / corrections, and files the results as
// knowledge, examples and lessons — so the training percentage grows with use.
//
// Nothing is ever sent to the contact: this is read-only study of the owner's
// own conversations. Every run is logged to the agent's `learningRuns`.
// ============================================================================
import { collectBrainChatMessagesForLearning, getWaWebChats } from './waWebClient.js';
import { callAgentModel } from './agentRunner.mjs';
import {
  getAgent, saveAgent, listKnowledge, listLessons, listExamples,
  addKnowledge, addExample, addLesson, computeProgress, computeConfidence
} from './agentsStore.mjs';
import { doc, addDoc, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';

let learnDb = null;
export function attachLearningDb(db) { if (db) learnDb = db; }

const sstr = (v, n = 500) => String(v == null ? '' : v).slice(0, n);
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const today = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Available chats to assign
// ---------------------------------------------------------------------------
export function listChatCandidates() {
  try {
    return getWaWebChats().slice(0, 400).map(c => ({
      jid: c.id,
      name: c.name || 'Contact',
      isGroup: !!c.isGroup,
      lastMessage: sstr(c.lastMessage, 90),
      timestamp: c.timestamp || 0
    }));
  } catch (e) {
    return [];
  }
}

// ---------------------------------------------------------------------------
// One learning run for one source
// ---------------------------------------------------------------------------
export async function learnFromSource(agent, source, { maxMessages = 150 } = {}) {
  const jid = source && source.jid;
  if (!jid) return { ok: false, error: 'No chat selected.' };

  const messages = await collectBrainChatMessagesForLearning(jid, maxMessages);
  if (!Array.isArray(messages) || messages.length < 8) {
    return { ok: false, error: 'Not enough messages in "' + (source.name || jid) + '" yet (need at least 8).' };
  }

  const mine = messages.filter(m => m.fromMe && m.text).map(m => sstr(m.text, 300));
  const theirs = messages.filter(m => !m.fromMe && m.text).map(m => sstr(m.text, 220));

  const system =
    'You are a training analyst. Study a WhatsApp conversation between the OWNER of the account and ' +
    (source.isGroup ? 'a group' : 'one contact') + '. Extract durable, reusable training material.\n' +
    'Return ONLY a JSON object (no fences, no commentary) shaped exactly like:\n' +
    '{ "style": "2-3 sentences describing how the owner writes here (language mix, length, tone, greeting)", ' +
    '"facts": ["up to 8 durable facts about the people or business in this chat"], ' +
    '"topics": ["up to 6 recurring topics"], ' +
    '"knowledge": [{"title":"short label","text":"one durable business fact or rule worth remembering"}], ' +
    '"corrections": [{"trigger":"what the other side says","correction":"how the owner should answer"}] }\n' +
    'Ignore small talk, greetings and anything private that would not help answer future messages. ' +
    'Never include phone numbers, passwords or payment details in the output.';

  const user =
    'OWNER messages:\n' + mine.slice(-80).join('\n') +
    '\n\nOTHER SIDE messages:\n' + theirs.slice(-60).join('\n');

  let parsed = null;
  let model = '';
  try {
    const r = await callAgentModel({
      system,
      messages: [{ role: 'user', content: user }],
      model: agent.model,
      fallbackModel: agent.fallbackModel,
      temperature: 0.2,
      maxTokens: 1400,
      agentName: agent.name,
      purpose: 'learning · ' + (source.name || jid),
      preferBackground: true   // honours AGENT_BACKGROUND_MODEL; default keeps the agent's model
    });
    model = r.model;
    const s = r.text.indexOf('{'), e = r.text.lastIndexOf('}');
    if (s >= 0 && e > s) parsed = JSON.parse(r.text.substring(s, e + 1));
  } catch (e) {
    await logRun(agent, source, { ok: false, error: sstr(e.message, 300), model: '', added: {} });
    return { ok: false, error: e.message };
  }

  if (!parsed || typeof parsed !== 'object') {
    await logRun(agent, source, { ok: false, error: 'The model returned an unreadable analysis.', model, added: {} });
    return { ok: false, error: 'The model returned an unreadable analysis — try again.' };
  }

  // ---- de-duplicate against what we already know -------------------------
  const [kExisting, lExisting, eExisting] = await Promise.all([
    listKnowledge(agent.id).catch(() => []),
    listLessons(agent.id).catch(() => []),
    listExamples(agent.id).catch(() => [])
  ]);
  const kKeys = new Set(kExisting.map(k => norm((k.title || '') + ' ' + (k.text || ''))));
  const lKeys = new Set(lExisting.map(l => norm(l.correction || '')));
  const eKeys = new Set(eExisting.map(x => norm(x.text || '')));

  const added = { knowledge: 0, examples: 0, lessons: 0 };

  const knowledgeList = Array.isArray(parsed.knowledge) ? parsed.knowledge.slice(0, 5) : [];
  for (const k of knowledgeList) {
    const title = sstr(k.title, 120) || 'Learned fact';
    const text = sstr(k.text, 1500);
    const key = norm(title + ' ' + text);
    if (!text || kKeys.has(key)) continue;
    await addKnowledge(agent.id, { title, text, source: 'WhatsApp: ' + (source.name || jid), type: 'learned' });
    kKeys.add(key); added.knowledge++;
  }

  const exampleTexts = mine.slice(-40).filter(t => t.length > 12);
  let picked = 0;
  for (const t of exampleTexts) {
    if (picked >= 4) break;
    const key = norm(t);
    if (eKeys.has(key)) continue;
    await addExample(agent.id, { role: 'me', text: sstr(t, 600), good: true });
    eKeys.add(key); added.examples++; picked++;
  }

  const corrections = Array.isArray(parsed.corrections) ? parsed.corrections.slice(0, 3) : [];
  for (const c of corrections) {
    const correction = sstr(c && c.correction, 800);
    const key = norm(correction);
    if (!correction || lKeys.has(key)) continue;
    await addLesson(agent.id, { trigger: sstr(c.trigger, 300), correction, note: 'Auto-learned from ' + (source.name || jid) });
    lKeys.add(key); added.lessons++;
  }

  const learned = {
    style: sstr(parsed.style, 600),
    facts: (Array.isArray(parsed.facts) ? parsed.facts : []).map(f => sstr(f, 160)).slice(0, 8),
    topics: (Array.isArray(parsed.topics) ? parsed.topics : []).map(t => sstr(t, 60)).slice(0, 6),
    at: Date.now()
  };

  // ---- update the source + agent counters -------------------------------
  const fresh = await getAgent(agent.id, { fresh: true });
  const sources = (fresh.sources || []).map(s => {
    if (s.jid !== jid) return s;
    return {
      ...s,
      lastLearnedAt: Date.now(),
      messagesRead: Math.max(s.messagesRead || 0, messages.length),
      runs: (s.runs || 0) + 1,
      // each run can move this source up to 100 by breadth of what it learned
      confidence: Math.min(100, Math.round(
        ((s.confidence || 0) * Math.min(3, s.runs || 0) + Math.min(100, (learned.facts.length + learned.topics.length) * 12)) /
        Math.min(4, (s.runs || 0) + 1)
      )),
      learned
    };
  });
  const days = Array.from(new Set([...(fresh.learningDays || []), today()])).slice(-30);
  const confidence = computeConfidence({ ...fresh, sources, learningDays: days });

  const saved = await saveAgent(agent.id, {
    sources, learningDays: days, confidence,
    lastAutoLearnAt: Date.now()
  });

  await logRun(agent, source, { ok: true, model, added, learned, messagesRead: messages.length });

  return {
    ok: true,
    source: source.name || jid,
    added,
    learned,
    messagesRead: messages.length,
    progress: computeProgress(saved),
    confidence
  };
}

async function logRun(agent, source, entry) {
  if (!learnDb) return;
  try {
    await addDoc(collection(learnDb, 'agents', agent.id, 'learningRuns'), {
      jid: source.jid,
      name: source.name || source.jid,
      isGroup: !!source.isGroup,
      ok: entry.ok !== false,
      error: entry.error || '',
      model: entry.model || '',
      messagesRead: entry.messagesRead || 0,
      added: entry.added || {},
      learned: entry.learned || null,
      createdAt: Date.now()
    });
  } catch (e) { /* logging must never break learning */ }
}

// ---------------------------------------------------------------------------
// Learn from every assigned source
// ---------------------------------------------------------------------------
export async function learnFromAllSources(agent, { maxSources = 6 } = {}) {
  const sources = (agent.sources || []).slice(0, maxSources);
  if (!sources.length) return { ok: false, error: 'No chats assigned yet. Add a WhatsApp contact or group first.' };

  const results = [];
  let okCount = 0;
  for (const s of sources) {
    const r = await learnFromSource(agent, s);
    results.push({ source: s.name || s.jid, ok: r.ok, error: r.error || '', added: r.added || null });
    if (r.ok) okCount++;
  }
  const fresh = await getAgent(agent.id, { fresh: true });
  return {
    ok: okCount > 0,
    learned: okCount,
    total: sources.length,
    results,
    progress: computeProgress(fresh),
    confidence: computeConfidence(fresh),
    agent: fresh
  };
}

// ---------------------------------------------------------------------------
// Automatic learning (self-throttled)
//
// Was every 6 hours — that alone was ~60% of the AI bill, re-reading the SAME messages four
// times a day. Default is now once a day; override with AGENT_AUTOLEARN_HOURS if you want more.
// ---------------------------------------------------------------------------
const AUTO_INTERVAL_MS = (() => {
  const h = Number(process.env.AGENT_AUTOLEARN_HOURS);
  const hours = Number.isFinite(h) && h > 0 ? h : 24;
  return hours * 60 * 60 * 1000;
})();
let autoRunning = false;

export async function maybeAutoLearn(agents) {
  if (autoRunning || !Array.isArray(agents)) return;
  const due = agents.filter(a =>
    a.autoLearn !== false &&
    a.status !== 'archived' &&
    (a.sources || []).length > 0 &&
    (Date.now() - (a.lastAutoLearnAt || 0)) > AUTO_INTERVAL_MS
  );
  if (!due.length) return;
  autoRunning = true;
  try {
    for (const a of due) {
      console.log('[AGENTS] 🌱 auto-learning ' + a.name + ' from ' + (a.sources || []).length + ' chat(s)');
      await learnFromAllSources(a, { maxSources: 3 });
    }
  } catch (e) {
    console.warn('[AGENTS] auto-learn failed:', e.message);
  } finally {
    autoRunning = false;
  }
}

export async function listLearningRuns(agentId, max = 40) {
  if (!learnDb) return [];
  try {
    const snap = await getDocs(query(collection(learnDb, 'agents', agentId, 'learningRuns'), orderBy('createdAt', 'desc'), limit(max)));
    const out = [];
    snap.forEach(d => out.push({ id: d.id, ...d.data() }));
    return out;
  } catch (e) { return []; }
}
