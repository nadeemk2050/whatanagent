// ============================================================================
// 🪑 STAFF MEETING ROOM — moderated, capped, multi-staff discussion
// ============================================================================
// The Live Board is great for humans but has no concept of turn-taking, so staff
// meetings get their own small engine: chair frames → each participant answers →
// chair decides. Hard caps on rounds / tokens / time stop any runaway loop.
// Output is only ever a DRAFT or a LESSON — never an automatic customer action.
//
// The engine is STEP based: one LLM turn per call, so the chat room in the UI can
// show every message as it happens (and the boss can watch the discussion live).
// ============================================================================
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { getAgent, addLesson, addAgentSub } from './agentsStore.mjs';
import { runAgent } from './agentRunner.mjs';
import { audit } from './auditLog.mjs';

let meetDb = null;
export function attachMeetingDb(db) { if (db) meetDb = db; }
export const MEETINGS = 'staffMeetings';

const sstr = (v, n = 2000) => String(v == null ? '' : v).slice(0, n);
const DEFAULTS = { maxRounds: 2, maxTokens: 14000, maxMs: 120000, maxParticipants: 6, turnTimeoutMs: 45000 };

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error((label || 'turn') + ' timed out')), ms))
  ]);
}

export async function createMeeting({ topic, participants = [], chairId = 'zaheer', scribeId = '', caps = {}, by = 'boss' } = {}) {
  if (!meetDb) throw new Error('Meeting storage unavailable');
  const t = sstr(topic, 500).trim();
  if (!t) throw new Error('Give the meeting a topic.');
  const ids = Array.from(new Set(participants.map(p => sstr(p, 80)).filter(Boolean))).slice(0, DEFAULTS.maxParticipants);
  if (!ids.length) throw new Error('Pick at least one staff member to attend.');
  const id = 'MEET-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  const room = {
    id, topic: t, chairId: sstr(chairId, 80) || 'zaheer', scribeId: sstr(scribeId, 80),
    participants: ids,
    caps: {
      maxRounds: Math.min(3, Math.max(1, Number(caps.maxRounds) || DEFAULTS.maxRounds)),
      maxTokens: Math.min(40000, Math.max(2000, Number(caps.maxTokens) || DEFAULTS.maxTokens)),
      maxMs: Math.min(300000, Math.max(20000, Number(caps.maxMs) || DEFAULTS.maxMs)),
      turnTimeoutMs: DEFAULTS.turnTimeoutMs
    },
    status: 'open', phase: 'open', round: 0, slot: 0, turns: [], decision: '', costUsd: 0, tokens: 0,
    createdBy: sstr(by, 60), createdAt: Date.now(), updatedAt: Date.now()
  };
  await setDoc(doc(meetDb, MEETINGS, id), room);
  await audit(room.chairId, { action: 'meeting_created', summary: 'Meeting opened: ' + t, reason: 'staff meeting' });
  return room;
}

export async function listMeetings({ max = 25 } = {}) {
  if (!meetDb) return [];
  try {
    const snap = await getDocs(query(collection(meetDb, MEETINGS), orderBy('createdAt', 'desc'), limit(max)));
    const out = [];
    snap.forEach(d => {
      const r = d.data();
      out.push({
        id: d.id, topic: r.topic, status: r.status, phase: r.phase || '', participants: r.participants,
        chairId: r.chairId, createdAt: r.createdAt, tokens: r.tokens, turns: (r.turns || []).length
      });
    });
    return out;
  } catch (e) { return []; }
}

export async function getMeeting(id) {
  if (!meetDb) return null;
  const snap = await getDoc(doc(meetDb, MEETINGS, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

async function ask(agent, messages, purpose) {
  const r = await runAgent(agent, messages, { purpose });
  return { text: String(r.text || '').trim(), model: r.model, tokensIn: r.tokensIn || 0, tokensOut: r.tokensOut || 0 };
}

// ---------------------------------------------------------------------------
// STEP ENGINE — one LLM turn per call so the UI can stream the discussion.
//   phase: 'open' -> 'rounds' -> 'close' -> 'done'
// Every call returns the new turns so the chat room can render them live.
// ---------------------------------------------------------------------------
export async function stepMeeting(id) {
  const room = await getMeeting(id);
  if (!room) throw new Error('Meeting not found');
  if (room.status === 'closed' || room.phase === 'done') {
    return { ok: true, done: true, newTurns: [], meeting: room };
  }

  const caps = { ...DEFAULTS, ...(room.caps || {}) };
  const started = room.startedAt || room.createdAt || Date.now();
  const agents = new Map();
  for (const pid of Array.from(new Set([room.chairId, ...(room.participants || [])]))) {
    const a = await getAgent(pid, { fresh: true }).catch(() => null);
    if (a) agents.set(pid, a);
  }
  const chair = agents.get(room.chairId) || agents.get((room.participants || [])[0]);
  if (!chair) throw new Error('No attendee records could be loaded.');

  const turns = Array.isArray(room.turns) ? room.turns.slice() : [];
  let tokens = Number(room.tokens) || 0;
  let phase = room.phase || 'open';
  let round = Number(room.round) || 1;
  let slot = Number(room.slot) || 0;
  let stopReason = room.stopReason || '';
  const newTurns = [];
  const transcript = () => turns.map(t => (t.speakerName || 'system') + ': ' + t.text).join('\n').slice(-6000);
  const commit = (turn) => { turns.push(turn); newTurns.push(turn); };

  // Caps: jump straight to the chair's closing summary.
  if (phase !== 'close' && (Date.now() - started > caps.maxMs || tokens > caps.maxTokens)) {
    stopReason = Date.now() - started > caps.maxMs ? 'time_cap' : 'token_cap';
    phase = 'close';
  }

  if (phase === 'open') {
    const r = await withTimeout(ask(chair, [
      { role: 'system', content: 'You are chairing a short internal staff meeting. Be brief and practical. Do not invent facts about the business. Never include secrets, passcodes or phone numbers.' },
      { role: 'user', content: 'Topic: ' + room.topic + '\n\nOpen the meeting in 2-3 sentences: what we must decide, and what each attendee should focus on.' }
    ], 'meeting chair open'), caps.turnTimeoutMs, 'chair open');
    tokens += (r.tokensIn || 0) + (r.tokensOut || 0);
    commit({
      role: 'chair', speakerId: chair.id, speakerName: chair.name, speakerRole: chair.role || 'Chair',
      emoji: chair.emoji || '🪑', kind: 'open', text: sstr(r.text, 2000), model: r.model, at: Date.now()
    });
    phase = 'rounds'; round = 1; slot = 0;
  } else if (phase === 'rounds') {
    const list = (room.participants || []).filter(p => agents.has(p));
    if (!list.length) {
      phase = 'close'; stopReason = stopReason || 'no_participants';
    } else {
      if (slot >= list.length) { slot = 0; round += 1; }
      if (round > caps.maxRounds) {
        phase = 'close'; stopReason = stopReason || 'round_cap';
      } else {
        const a = agents.get(list[slot]);
        slot += 1;
        try {
          const t = await withTimeout(ask(a, [
            { role: 'system', content: 'You are ' + a.name + ' (' + (a.role || 'staff') + ') in an internal staff meeting with your colleagues and the boss watching. Be brief (max 120 words), practical, and say clearly if you are unsure. React to what colleagues said when useful. Never invent business facts, prices or customer information. Never reveal secrets.' },
            { role: 'user', content: 'Topic: ' + room.topic + '\n\nDiscussion so far:\n' + (transcript() || '(opening only)') + '\n\nRound ' + round + ': give your position in max 120 words. End with one line starting "SUGGESTION:" with your concrete recommendation.' }
          ], 'meeting round ' + round), caps.turnTimeoutMs, a.name);
          tokens += (t.tokensIn || 0) + (t.tokensOut || 0);
          const txt = sstr(t.text, 2000);
          const sug = /SUGGESTION:\s*(.+)$/im.exec(txt);
          commit({
            role: 'participant', speakerId: a.id, speakerName: a.name, speakerRole: a.role || 'Staff',
            emoji: a.emoji || '🧑‍💼', round, kind: 'say', text: txt,
            suggestion: sug ? sstr(sug[1], 400) : '', model: t.model, at: Date.now()
          });
        } catch (e) {
          commit({ role: 'system', speakerName: a.name, emoji: '⚠️', round, kind: 'error', text: 'Could not answer: ' + sstr(e.message, 200), at: Date.now() });
        }
      }
    }
  }

  if (phase === 'close') {
    const c = await withTimeout(ask(chair, [
      { role: 'system', content: 'You chair internal staff meetings. Summarise decisions precisely, in plain language the boss can act on. Never include secrets.' },
      { role: 'user', content: 'Topic: ' + room.topic + '\n\nTranscript:\n' + transcript() + '\n\nWrite the closing summary with exactly these headings:\nDECISION:\nACTIONS: (numbered, each with an owner)\nOPEN QUESTIONS:\nCONFIDENCE: (0-100)' }
    ], 'meeting chair close'), caps.turnTimeoutMs, 'chair close');
    tokens += (c.tokensIn || 0) + (c.tokensOut || 0);
    const decision = sstr(c.text, 6000);
    commit({
      role: 'chair', speakerId: chair.id, speakerName: chair.name, speakerRole: chair.role || 'Chair',
      emoji: chair.emoji || '🪑', kind: 'close', text: decision, model: c.model, at: Date.now()
    });
    phase = 'done';
    const updated = {
      turns, tokens, phase, round, slot, decision, status: 'closed',
      stopReason: stopReason || 'complete', closedAt: Date.now(), updatedAt: Date.now()
    };
    await setDoc(doc(meetDb, MEETINGS, id), updated, { merge: true });
    await audit(chair.id, { action: 'meeting_closed', summary: 'Meeting closed: ' + room.topic, reason: stopReason || 'complete', tokensIn: 0, tokensOut: tokens });
    return { ok: true, done: true, newTurns, meeting: { ...room, ...updated } };
  }

  const patch = { turns, tokens, phase, round, slot, stopReason, status: 'running', startedAt: started, updatedAt: Date.now() };
  await setDoc(doc(meetDb, MEETINGS, id), patch, { merge: true });
  return { ok: true, done: false, newTurns, meeting: { ...room, ...patch } };
}

// Run the whole meeting by looping the step engine (used by non-streaming callers).
export async function runMeeting(id) {
  const room = await getMeeting(id);
  if (!room) throw new Error('Meeting not found');
  if (room.status === 'closed') throw new Error('This meeting is closed.');
  let last = room;
  for (let i = 0; i < 40; i++) {
    const r = await stepMeeting(id);
    last = r.meeting;
    if (r.done) break;
  }
  return { ok: true, meeting: last, stopReason: last.stopReason || 'complete' };
}

// A boss interjection during a live meeting (shown to every attendee afterwards).
export async function addMeetingMessage(id, { text = '', by = 'boss' } = {}) {
  const room = await getMeeting(id);
  if (!room) throw new Error('Meeting not found');
  const body = sstr(text, 1000).trim();
  if (!body) throw new Error('Type something first.');
  const turns = Array.isArray(room.turns) ? room.turns.slice() : [];
  const turn = { role: 'boss', speakerName: sstr(by, 60) || 'Boss', speakerRole: 'Boss', emoji: '👑', kind: 'boss', text: body, at: Date.now() };
  turns.push(turn);
  await setDoc(doc(meetDb, MEETINGS, id), { turns, updatedAt: Date.now() }, { merge: true });
  return { ok: true, turn };
}

// Turn the meeting outcome into an approval-gated artefact. Nothing auto-executes.
export async function saveMeetingOutcome(id, { kind = 'lesson', staffId = '', text = '', by = 'boss' } = {}) {
  const room = await getMeeting(id);
  if (!room) throw new Error('Meeting not found');
  const body = sstr(text || room.decision, 4000);
  if (!body) throw new Error('Nothing to save yet — run the meeting first.');

  if (kind === 'lesson') {
    const target = sstr(staffId, 80) || (room.participants || [])[0];
    if (!target) throw new Error('Pick which staff member should learn this.');
    await addLesson(target, { trigger: 'Staff meeting: ' + sstr(room.topic, 200), correction: body, note: 'From meeting ' + id });
    await audit(target, { action: 'meeting_lesson', summary: 'Lesson saved from meeting ' + id, reason: 'boss approved' });
    return { ok: true, saved: 'lesson', staffId: target };
  }
  if (kind === 'briefing') {
    await addAgentSub(sstr(staffId, 80) || room.chairId, 'notebook', {
      title: 'Meeting: ' + sstr(room.topic, 120), text: body, source: id, kind: 'meeting'
    });
    return { ok: true, saved: 'notebook' };
  }
  await setDoc(doc(meetDb, MEETINGS, id), { savedAs: kind, savedAt: Date.now() }, { merge: true });
  return { ok: true, saved: kind };
}

export async function reopenMeeting(id) {
  if (!meetDb) throw new Error('Meeting storage unavailable');
  const room = await getMeeting(id);
  if (!room) throw new Error('Meeting not found');
  await updateDoc(doc(meetDb, MEETINGS, id), { status: 'open', phase: 'open', closedAt: 0, updatedAt: Date.now() });
  return { ok: true };
}
