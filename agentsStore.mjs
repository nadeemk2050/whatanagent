// ============================================================================
// 🎓 AI STAFF ACADEMY — agent store (Firestore + in-memory cache)
// ============================================================================
// One document per AI staff member in `agents/{agentId}`, with training data in
// subcollections (knowledge, examples, lessons, tests, testRuns, promptVersions, toolLogs).
//
// Mirrors the conventions of contactBrain.mjs: a TTL cache, an optimistic cache update
// after every write, and a sanitize() that merges with the existing document so fields
// the UI does not send (history, counters, createdAt) are never lost.
// ============================================================================
import {
  doc, getDoc, setDoc, deleteDoc, collection, getDocs, addDoc, query, orderBy, limit
} from 'firebase/firestore';

let agentsDb = null;
export function attachAgentsDb(db) { if (db) agentsDb = db; }

export const AGENTS = 'agents';
export const STATUSES = ['newly_hired', 'under_training', 'ready', 'archived'];
export const STATUS_LABELS = {
  newly_hired: '🆕 Newly Hired',
  under_training: '📚 Under Training',
  ready: '✅ Trained / Ready to Work',
  archived: '🗄️ Archived'
};

// Default training weights (percent). Tools are only counted for staff that actually have tools.
export const DEFAULT_WEIGHTS = { knowledge: 25, style: 20, scorecard: 35, corrections: 10, tools: 10 };
export const DEFAULT_READY_THRESHOLD = 80;

export const AVAILABLE_MODELS = [
  { id: 'qwen3.8-flash', label: 'Qwen3.8-Flash (fast, multilingual, cheapest)' },
  { id: 'qwen3.8-omni-flash', label: 'Qwen3.8-Omni-Flash (text + image + audio)' },
  { id: 'deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash (strict JSON, strong reasoning)' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (PDF + documents)' },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' }
];

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();          // id -> { agent, at }
const listCache = { at: 0, items: null };

const sstr = (v, n = 500) => String(v == null ? '' : v).slice(0, n);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number(n) || 0));
const asBool = (v, def = false) => (v === undefined || v === null ? def : (v === true || v === 'true' || v === 1 || v === '1'));
const arr = (v, n = 60, max = 40) => (Array.isArray(v) ? v : (typeof v === 'string' ? v.split('\n') : []))
  .map(x => sstr(x, n).trim()).filter(Boolean).slice(0, max);

export const slug = (name, fallback = 'agent') => {
  const base = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
  return base || fallback;
};

export function newAgentId(name) {
  return slug(name) + '-' + Math.random().toString(36).slice(2, 6);
}

// ---------------------------------------------------------------------------
// Shape + merge (the same pattern as contactBrain.sanitizeProfile)
// ---------------------------------------------------------------------------
export function sanitizeAgent(raw = {}, existing = {}) {
  const a = {};
  a.id = sstr(raw.id || existing.id, 60);
  a.name = sstr(raw.name != null ? raw.name : existing.name, 60);
  a.gender = ['male', 'female', 'neutral'].includes(raw.gender || existing.gender) ? (raw.gender || existing.gender) : 'neutral';
  a.avatarUrl = sstr(raw.avatarUrl != null ? raw.avatarUrl : existing.avatarUrl, 500);
  a.emoji = sstr(raw.emoji != null ? raw.emoji : existing.emoji, 8) || '🧑‍💼';
  a.role = sstr(raw.role != null ? raw.role : existing.role, 80);
  a.category = ['business', 'knowledge', 'personal'].includes(raw.category || existing.category) ? (raw.category || existing.category) : 'business';
  a.jobDescription = sstr(raw.jobDescription != null ? raw.jobDescription : existing.jobDescription, 3000);
  a.languages = arr(raw.languages != null ? raw.languages : existing.languages, 30, 12);
  a.defaultLanguage = sstr(raw.defaultLanguage != null ? raw.defaultLanguage : existing.defaultLanguage, 40) || 'Roman Urdu';
  a.tone = sstr(raw.tone != null ? raw.tone : existing.tone, 300);
  a.traits = arr(raw.traits != null ? raw.traits : existing.traits, 40, 15);
  a.signaturePhrases = arr(raw.signaturePhrases != null ? raw.signaturePhrases : existing.signaturePhrases, 80, 10);
  a.emojiHabit = sstr(raw.emojiHabit != null ? raw.emojiHabit : existing.emojiHabit, 120);
  a.backstory = sstr(raw.backstory != null ? raw.backstory : existing.backstory, 800);
  a.workingHours = sstr(raw.workingHours != null ? raw.workingHours : existing.workingHours, 120);
  a.agePersona = sstr(raw.agePersona != null ? raw.agePersona : existing.agePersona, 40);

  const rg = raw.guardrails || {};
  const eg = existing.guardrails || {};
  a.guardrails = {
    always: arr(rg.always != null ? rg.always : eg.always, 200, 15),
    never: arr(rg.never != null ? rg.never : eg.never, 200, 15),
    escalation: arr(rg.escalation != null ? rg.escalation : eg.escalation, 200, 10),
    disclaimers: arr(rg.disclaimers != null ? rg.disclaimers : eg.disclaimers, 200, 6)
  };

  a.model = sstr(raw.model != null ? raw.model : existing.model, 60) || 'qwen3.8-flash';
  a.fallbackModel = sstr(raw.fallbackModel != null ? raw.fallbackModel : existing.fallbackModel, 60) || 'gemini-2.5-flash';
  a.useBusinessKb = asBool(raw.useBusinessKb != null ? raw.useBusinessKb : existing.useBusinessKb, true);
  a.allowedTools = arr(raw.allowedTools != null ? raw.allowedTools : existing.allowedTools, 60, 25);
  a.systemPrompt = sstr(raw.systemPrompt != null ? raw.systemPrompt : existing.systemPrompt, 12000);
  a.promptVersion = Number(raw.promptVersion != null ? raw.promptVersion : existing.promptVersion) || 1;
  a.requireApprovalForWrites = asBool(raw.requireApprovalForWrites != null ? raw.requireApprovalForWrites : existing.requireApprovalForWrites, true);
  a.dailyBudgetUsd = Number(raw.dailyBudgetUsd != null ? raw.dailyBudgetUsd : existing.dailyBudgetUsd) || 0.5;
  a.readyThreshold = clamp(raw.readyThreshold != null ? raw.readyThreshold : existing.readyThreshold, 0, 100) || DEFAULT_READY_THRESHOLD;
  a.weights = { ...DEFAULT_WEIGHTS, ...(existing.weights || {}), ...(raw.weights || {}) };

  const rp = raw.trainingProgress || {};
  const ep = existing.trainingProgress || {};
  const overrideRaw = rp.override !== undefined ? rp.override : ep.override;
  a.trainingProgress = {
    override: (overrideRaw === null || overrideRaw === '' || overrideRaw === undefined) ? null : clamp(overrideRaw, 0, 100),
    overrideNote: sstr(rp.overrideNote != null ? rp.overrideNote : ep.overrideNote, 300)
  };

  a.status = STATUSES.includes(raw.status || existing.status) ? (raw.status || existing.status) : 'newly_hired';
  a.history = Array.isArray(existing.history) ? existing.history.slice(-100) : [];
  a.counts = { knowledge: 0, examples: 0, lessons: 0, ...(existing.counts || {}), ...(raw.counts || {}) };
  a.lastTestRun = raw.lastTestRun !== undefined ? raw.lastTestRun : (existing.lastTestRun || null);
  a.toolsPracticed = arr(raw.toolsPracticed != null ? raw.toolsPracticed : existing.toolsPracticed, 60, 25);
  a.createdAt = existing.createdAt || raw.createdAt || Date.now();
  a.updatedAt = Date.now();
  a.createdBy = sstr(raw.createdBy || existing.createdBy, 120);
  a.archivedAt = a.status === 'archived' ? (existing.archivedAt || Date.now()) : null;

  // 🌱 Learning sources: WhatsApp contacts/groups this staff member studies.
  const rawSources = Array.isArray(raw.sources) ? raw.sources : (Array.isArray(existing.sources) ? existing.sources : []);
  a.sources = rawSources.slice(0, 40).map(s => ({
    jid: sstr(s.jid, 80),
    name: sstr(s.name, 80) || 'Contact',
    isGroup: !!s.isGroup,
    addedAt: Number(s.addedAt) || Date.now(),
    lastLearnedAt: Number(s.lastLearnedAt) || null,
    messagesRead: Number(s.messagesRead) || 0,
    runs: Number(s.runs) || 0,
    confidence: clamp(Number(s.confidence) || 0, 0, 100),
    learned: {
      style: sstr((s.learned && s.learned.style) || '', 600),
      facts: arr((s.learned && s.learned.facts) || [], 160, 12),
      topics: arr((s.learned && s.learned.topics) || [], 60, 10),
      at: Number((s.learned && s.learned.at) || 0) || null
    }
  })).filter(s => s.jid);

  // Built-in staff (Mr. Zaheer Ahmed) can never be deleted by the UI.
  a.isDefault = raw.isDefault !== undefined ? !!raw.isDefault : !!existing.isDefault;
  a.autoLearn = asBool(raw.autoLearn != null ? raw.autoLearn : existing.autoLearn, true);
  a.lastAutoLearnAt = Number(raw.lastAutoLearnAt != null ? raw.lastAutoLearnAt : existing.lastAutoLearnAt) || 0;
  const days = raw.learningDays !== undefined ? raw.learningDays : existing.learningDays;
  a.learningDays = (Array.isArray(days) ? days : []).map(d => sstr(d, 10)).filter(Boolean).slice(-30);
  a.confidence = raw.confidence !== undefined ? raw.confidence : (existing.confidence || null);
  return a;
}

// 🌱 Confidence: how much this staff member can be trusted today.
// breadth (how many people/groups it studied), depth (how much it read),
// consistency (how many separate days it studied), quality (latest scorecard).
export function computeConfidence(agent) {
  const sources = (agent && agent.sources) || [];
  const breakdown = {
    breadth: clamp(sources.length * 25, 0, 100),
    depth: sources.length
      ? Math.round(sources.reduce((s, x) => s + clamp((x.messagesRead || 0) / 150, 0, 1) * 100, 0) / sources.length)
      : 0,
    consistency: clamp(((agent && agent.learningDays) || []).length * 20, 0, 100),
    quality: clamp((agent && agent.lastTestRun && agent.lastTestRun.passRate) || 0, 0, 100)
  };
  const score = Math.round(
    breakdown.breadth * 0.30 + breakdown.depth * 0.30 + breakdown.consistency * 0.20 + breakdown.quality * 0.20
  );
  return { score, breakdown, at: Date.now(), sources: sources.length };
}

// ---------------------------------------------------------------------------
// Training progress
// ---------------------------------------------------------------------------
export function computeProgress(agent) {
  const w = { ...DEFAULT_WEIGHTS, ...(agent && agent.weights || {}) };
  const counts = (agent && agent.counts) || {};
  const hasTools = !!((agent && agent.allowedTools) || []).length;

  const breakdown = {
    knowledge: clamp((counts.knowledge || 0) * 12.5, 0, 100),                       // 8 items = 100%
    style: clamp((counts.examples || 0) * 20, 0, 100),                              // 5 examples = 100%
    scorecard: clamp(Number(agent && agent.lastTestRun && agent.lastTestRun.passRate) || 0, 0, 100),
    corrections: clamp((counts.lessons || 0) * 10, 0, 100),                          // 10 lessons = 100%
    tools: hasTools
      ? clamp(((agent.toolsPracticed || []).length / Math.max(1, (agent.allowedTools || []).length)) * 100, 0, 100)
      : 0
  };

  const dims = hasTools ? ['knowledge', 'style', 'scorecard', 'corrections', 'tools'] : ['knowledge', 'style', 'scorecard', 'corrections'];
  const totalWeight = dims.reduce((s, d) => s + (Number(w[d]) || 0), 0) || 1;
  let auto = 0;
  for (const d of dims) auto += breakdown[d] * (Number(w[d]) || 0);
  auto = Math.round(auto / totalWeight);

  const override = agent && agent.trainingProgress ? agent.trainingProgress.override : null;
  const effective = (override === null || override === undefined) ? auto : Math.round(clamp(override, 0, 100));
  return { auto, override: override === null || override === undefined ? null : Math.round(override), effective, breakdown, weights: w, hasTools };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
export async function getAgent(id, { fresh = false } = {}) {
  if (!agentsDb || !id) return null;
  const hit = cache.get(id);
  if (!fresh && hit && (Date.now() - hit.at) < CACHE_TTL_MS) return hit.agent;
  try {
    const snap = await getDoc(doc(agentsDb, AGENTS, id));
    const agent = snap.exists() ? { id, ...snap.data() } : null;
    cache.set(id, { agent, at: Date.now() });
    return agent;
  } catch (e) {
    console.warn('[AGENTS] read failed for ' + id + ':', e.message);
    return hit ? hit.agent : null;
  }
}

export async function listAgents({ fresh = false } = {}) {
  if (!agentsDb) return [];
  if (!fresh && listCache.items && (Date.now() - listCache.at) < CACHE_TTL_MS) return listCache.items;
  try {
    const snap = await getDocs(collection(agentsDb, AGENTS));
    const out = [];
    snap.forEach(d => out.push({ id: d.id, ...d.data() }));
    out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    for (const a of out) cache.set(a.id, { agent: a, at: Date.now() });
    listCache.items = out; listCache.at = Date.now();
    return out;
  } catch (e) {
    console.warn('[AGENTS] list failed:', e.message);
    return listCache.items || [];
  }
}

export async function saveAgent(id, raw = {}) {
  if (!agentsDb) throw new Error('Agent storage unavailable');
  const agentId = id || newAgentId(raw.name);
  const snap = await getDoc(doc(agentsDb, AGENTS, agentId));
  const existing = snap.exists() ? (snap.data() || {}) : {};
  const agent = sanitizeAgent({ ...raw, id: agentId }, existing);
  await setDoc(doc(agentsDb, AGENTS, agentId), agent, { merge: true });
  cache.set(agentId, { agent, at: Date.now() });
  listCache.items = null;
  return agent;
}

export async function createAgent(raw = {}) {
  const id = raw.id || newAgentId(raw.name);
  const existing = await getAgent(id, { fresh: true });
  if (existing) throw new Error('An agent with this name already exists — pick a slightly different name.');
  const agent = await saveAgent(id, { ...raw, status: raw.status || 'newly_hired' });
  await pushHistory(id, { from: null, to: agent.status, note: 'Hired', by: raw.createdBy || 'boss' });
  return getAgent(id, { fresh: true });
}

export async function updateAgent(id, patch = {}) {
  return saveAgent(id, patch);
}

export async function deleteAgent(id) {
  if (!agentsDb) throw new Error('Agent storage unavailable');
  await deleteDoc(doc(agentsDb, AGENTS, id));
  cache.delete(id); listCache.items = null;
  return true;
}

async function pushHistory(id, entry) {
  const agent = await getAgent(id, { fresh: true });
  if (!agent) return null;
  const history = Array.isArray(agent.history) ? agent.history.slice(-99) : [];
  history.push({ at: Date.now(), ...entry });
  const progress = computeProgress(agent).effective;
  await setDoc(doc(agentsDb, AGENTS, id), { history, updatedAt: Date.now() }, { merge: true });
  const updated = { ...agent, history };
  cache.set(id, { agent: updated, at: Date.now() });
  listCache.items = null;
  return progress;
}

export async function setAgentStatus(id, to, { by = 'boss', note = '' } = {}) {
  if (!STATUSES.includes(to)) throw new Error('Unknown status: ' + to);
  const agent = await getAgent(id, { fresh: true });
  if (!agent) throw new Error('Agent not found');
  const progress = computeProgress(agent).effective;
  const history = Array.isArray(agent.history) ? agent.history.slice(-99) : [];
  history.push({ at: Date.now(), by, from: agent.status, to, progress, note: sstr(note, 200) });
  const patch = {
    status: to,
    history,
    updatedAt: Date.now(),
    archivedAt: to === 'archived' ? Date.now() : null
  };
  await setDoc(doc(agentsDb, AGENTS, id), patch, { merge: true });
  const updated = { ...agent, ...patch };
  cache.set(id, { agent: updated, at: Date.now() });
  listCache.items = null;
  return { agent: updated, progress };
}

// ---------------------------------------------------------------------------
// Subcollections
// ---------------------------------------------------------------------------
async function listSub(agentId, sub, max = 200) {
  if (!agentsDb) return [];
  try {
    const snap = await getDocs(query(collection(agentsDb, AGENTS, agentId, sub), orderBy('createdAt', 'desc'), limit(max)));
    const out = [];
    snap.forEach(d => out.push({ id: d.id, ...d.data() }));
    return out;
  } catch (e) {
    console.warn('[AGENTS] ' + sub + ' list failed:', e.message);
    return [];
  }
}

async function addSub(agentId, sub, payload) {
  if (!agentsDb) throw new Error('Agent storage unavailable');
  const createdAt = Date.now();
  const ref = await addDoc(collection(agentsDb, AGENTS, agentId, sub), { ...payload, createdAt });
  return { id: ref.id, ...payload, createdAt };
}

async function deleteSub(agentId, sub, itemId) {
  if (!agentsDb) throw new Error('Agent storage unavailable');
  await deleteDoc(doc(agentsDb, AGENTS, agentId, sub, itemId));
  return true;
}

async function bumpCount(agentId, field, delta) {
  const agent = await getAgent(agentId, { fresh: true });
  if (!agent) return;
  const counts = { knowledge: 0, examples: 0, lessons: 0, ...(agent.counts || {}) };
  counts[field] = Math.max(0, (counts[field] || 0) + delta);
  await setDoc(doc(agentsDb, AGENTS, agentId), { counts, updatedAt: Date.now() }, { merge: true });
  const updated = { ...agent, counts };
  cache.set(agentId, { agent: updated, at: Date.now() });
  listCache.items = null;
}

// knowledge ----------------------------------------------------------------
export const listKnowledge = (id) => listSub(id, 'knowledge', 200);
export async function addKnowledge(id, item) {
  const docItem = await addSub(id, 'knowledge', {
    title: sstr(item.title, 200),
    text: sstr(item.text, 8000),
    source: sstr(item.source, 300),
    type: sstr(item.type, 40) || 'text',
    chars: String(item.text || '').length
  });
  await bumpCount(id, 'knowledge', 1);
  return docItem;
}
export async function deleteKnowledge(id, itemId) {
  await deleteSub(id, 'knowledge', itemId);
  await bumpCount(id, 'knowledge', -1);
}

// examples -----------------------------------------------------------------
export const listExamples = (id) => listSub(id, 'examples', 100);
export async function addExample(id, item) {
  const docItem = await addSub(id, 'examples', {
    role: item.role === 'them' ? 'them' : 'me',
    text: sstr(item.text, 2000),
    good: item.good !== false
  });
  await bumpCount(id, 'examples', 1);
  return docItem;
}
export async function deleteExample(id, itemId) {
  await deleteSub(id, 'examples', itemId);
  await bumpCount(id, 'examples', -1);
}

// lessons ------------------------------------------------------------------
export const listLessons = (id) => listSub(id, 'lessons', 200);
export async function addLesson(id, item) {
  const docItem = await addSub(id, 'lessons', {
    trigger: sstr(item.trigger, 500),
    correction: sstr(item.correction, 2000),
    note: sstr(item.note, 300)
  });
  await bumpCount(id, 'lessons', 1);
  return docItem;
}
export async function updateLesson(id, itemId, patch) {
  if (!agentsDb) throw new Error('Agent storage unavailable');
  await setDoc(doc(agentsDb, AGENTS, id, 'lessons', itemId), {
    trigger: sstr(patch.trigger, 500),
    correction: sstr(patch.correction, 2000),
    note: sstr(patch.note, 300),
    updatedAt: Date.now()
  }, { merge: true });
  return true;
}
export async function deleteLesson(id, itemId) {
  await deleteSub(id, 'lessons', itemId);
  await bumpCount(id, 'lessons', -1);
}

// tests --------------------------------------------------------------------
export const listTests = (id) => listSub(id, 'tests', 200);
export async function addTest(id, item) {
  return addSub(id, 'tests', {
    question: sstr(item.question, 1000),
    expected: sstr(item.expected, 1000),
    criteria: sstr(item.criteria, 500),
    kind: item.kind === 'guardrail' ? 'guardrail' : 'scorecard'
  });
}
export async function deleteTest(id, itemId) { return deleteSub(id, 'tests', itemId); }

export const listTestRuns = (id) => listSub(id, 'testRuns', 30);
export async function saveTestRun(id, run) {
  const saved = await addSub(id, 'testRuns', {
    kind: run.kind || 'scorecard',
    total: Number(run.total) || 0,
    passed: Number(run.passed) || 0,
    passRate: Number(run.passRate) || 0,
    model: sstr(run.model, 60),
    results: Array.isArray(run.results) ? run.results.slice(0, 60) : []
  });
  if ((run.kind || 'scorecard') === 'scorecard') {
    const agent = await getAgent(id, { fresh: true });
    if (agent) {
      const patch = { lastTestRun: { passRate: saved.passRate, at: saved.createdAt, total: saved.total, passed: saved.passed }, updatedAt: Date.now() };
      await setDoc(doc(agentsDb, AGENTS, id), patch, { merge: true });
      cache.set(id, { agent: { ...agent, ...patch }, at: Date.now() });
      listCache.items = null;
    }
  }
  return saved;
}

// prompt versions ----------------------------------------------------------
export const listPromptVersions = (id) => listSub(id, 'promptVersions', 50);
export async function addPromptVersion(id, { systemPrompt, note = '', by = 'boss' }) {
  const agent = await getAgent(id, { fresh: true });
  if (!agent) throw new Error('Agent not found');
  const version = Number(agent.promptVersion || 1) + 1;
  const saved = await addSub(id, 'promptVersions', {
    version, systemPrompt: sstr(systemPrompt, 12000), note: sstr(note, 200), by: sstr(by, 120)
  });
  await setDoc(doc(agentsDb, AGENTS, id), { systemPrompt: sstr(systemPrompt, 12000), promptVersion: version, updatedAt: Date.now() }, { merge: true });
  cache.set(id, { agent: { ...agent, systemPrompt: sstr(systemPrompt, 12000), promptVersion: version }, at: Date.now() });
  listCache.items = null;
  return saved;
}

// tool logs ----------------------------------------------------------------
export const listToolLogs = (id) => listSub(id, 'toolLogs', 100);
export async function logToolCall(id, entry) {
  const saved = await addSub(id, 'toolLogs', {
    tool: sstr(entry.tool, 60),
    riskLevel: sstr(entry.riskLevel, 20),
    input: sstr(entry.input, 1000),
    summary: sstr(entry.summary, 1000),
    ok: entry.ok !== false,
    status: sstr(entry.status, 40) || (entry.ok === false ? 'failed' : 'ok')
  });
  if (entry.ok !== false && entry.tool) {
    const agent = await getAgent(id, { fresh: true });
    if (agent) {
      const practiced = Array.from(new Set([...(agent.toolsPracticed || []), entry.tool]));
      await setDoc(doc(agentsDb, AGENTS, id), { toolsPracticed: practiced }, { merge: true });
      cache.set(id, { agent: { ...agent, toolsPracticed: practiced }, at: Date.now() });
      listCache.items = null;
    }
  }
  return saved;
}
