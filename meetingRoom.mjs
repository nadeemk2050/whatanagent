// ============================================================================
// 🪑 STAFF MEETING ROOM — moderated, capped, multi-staff discussion
// ============================================================================
// The Live Board is great for humans but has no concept of turn-taking, so staff
// meetings get their own small engine: chair frames → each participant answers →
// chair decides. Hard caps on rounds / tokens / time stop any runaway loop.
// Output is only ever a DRAFT or a LESSON — never an automatic customer action.
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
    status: 'open', turns: [], decision: '', costUsd: 0, tokens: 0,
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
      out.push({ id: d.id, topic: r.topic, status: r.status, participants: r.participants, chairId: r.chairId, createdAt: r.createdAt, tokens: r.tokens });
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

// Run rounds until the chair has a decision, or a cap is hit.
export async function runMeeting(id, { rounds = null } = {}) {
  const room = await getMeeting(id);
  if (!room) throw new Error('Meeting not found');
  if (room.status === 'closed') throw new Error('This meeting is closed.');

  const started = Date.now();
  const caps = { ...DEFAULTS, ...(room.caps || {}) };
  const maxRounds = Math.min(caps.maxRounds, Math.max(1, Number(rounds) || caps.maxRounds));
  const agents = new Map();
  for (const pid of Array.from(new Set([room.chairId, ...room.participants]))) {
    const a = await getAgent(pid, { fresh: true }).catch(() => null);
    if (a) agents.set(pid, a);
  }
  const chair = agents.get(room.chairId) || agents.get(room.participants[0]);
  if (!chair) throw new Error('No attendee records could be loaded.');

  const turns = [];
  let tokens = 0;
  let stopReason = '';
  const transcript = () => turns.map(t => t.speakerName + ': ' + t.text).join('\n').slice(-6000);

  const push = async (t) => { turns.push(t); await setDoc(doc(meetDb, MEETINGS, id), { turns, updatedAt: Date.now() }, { merge: true }); };

  try {
    // Chair opens the discussion.
    const open = await withTimeout(ask(chair, [
      { role: 'system', content: 'You are chairing a short internal staff meeting. Be brief and practical. Do not invent facts about the business. Never include secrets, passcodes or phone numbers.' },
      { role: 'user', content: 'Topic: ' + room.topic + '\n\nOpen the meeting in 2-3 sentences: what we must decide, and what each attendee should focus on.' }
    ], 'meeting chair open'), caps.turnTimeoutMs, 'chair open');
    tokens += open.tokensIn + open.tokensOut;
    await push({ role: 'chair', speakerId: chair.id, speakerName: chair.name, text: sstr(open.text, 1500), model: open.model, at: Date.now() });

    for (let r = 1; r <= maxRounds; r++) {
      for (const pid of room.participants) {
        if (Date.now() - started > caps.maxMs) { stopReason = 'time_cap'; break; }
        if (tokens > caps.maxTokens) { stopReason = 'token_cap'; break; }
        const a = agents.get(pid);
        if (!a) { turns.push({ role: 'system', speakerName: 'system', text: a === null ? 'Skipped: staff record missing.' : 'Skipped.', at: Date.now() }); continue; }
        try {
          const t = await withTimeout(ask(a, [
            { role: 'system', content: 'You are ' + a.name + ' (' + (a.role || 'staff') + ') in an internal staff meeting. Be brief (max 120 words), practical, and say clearly if you are unsure. Never invent business facts, prices, or customer information. Never reveal secrets.' },
            { role: 'user', content: 'Topic: ' + room.topic + '\n\nDiscussion so far:\n' + (transcript() || '(opening only)') + '\n\nRound ' + r + ': give your position in max 120 words, then one concrete recommendation.' }
          ], 'meeting round ' + r), caps.turnTimeoutMs, a.name);
          tokens += t.tokensIn + t.tokensOut;
          await push({ role: 'participant', speakerId: a.id, speakerName: a.name, round: r, text: sstr(t.text, 1500), model: t.model, at: Date.now() });
        } catch (e) {
          await push({ role: 'system', speakerName: a.name, round: r, text: 'No answer: ' + sstr(e.message, 200), at: Date.now() });
        }
      }
      if (stopReason) break;
    }

    // Chair closes with a structured decision.
    const close = await withTimeout(ask(chair, [
      { role: 'system', content: 'You chair internal staff meetings. Summarise decisions precisely. Never include secrets.' },
      { role: 'user', content: 'Topic: ' + room.topic + '\n\nTranscript:\n' + transcript() + '\n\nWrite the closing summary with exactly these headings:\nDECISION:\nACTIONS: (numbered, each with an owner)\nOPEN QUESTIONS:\nCONFIDENCE: (0-100)' }
    ], 'meeting chair close'), caps.turnTimeoutMs, 'chair close');
    tokens += close.tokensIn + close.tokensOut;

    const updated = {
      turns, tokens, status: 'closed', decision: sstr(close.text, 4000),
      closedAt: Date.now(), updatedAt: Date.now(), stopReason: stopReason || 'complete'
    };
    await setDoc(doc(meetDb, MEETINGS, id), updated, { merge: true });
    await audit(chair.id, { action: 'meeting_closed', summary: 'Meeting closed: ' + room.topic, reason: stopReason || 'complete', tokensIn: 0, tokensOut: tokens });
    return { ok: true, meeting: { ...room, ...updated }, stopReason: stopReason || 'complete' };
  } catch (e) {
    await setDoc(doc(meetDb, MEETINGS, id), { status: 'error', error: sstr(e.message, 300), turns, tokens, updatedAt: Date.now() }, { merge: true });
    throw e;
  }
}

// Turn the meeting outcome into an approval-gated artefact. Nothing auto-executes.
export async function saveMeetingOutcome(id, { kind = 'lesson', staffId = '', text = '', by = 'boss' } = {}) {
  const room = await getMeeting(id);
  if (!room) throw new Error('Meeting not found');
  const body = sstr(text || room.decision, 4000);
  if (!body) throw new Error('Nothing to save yet — run the meeting first.');

  if (kind === 'lesson') {
    const target = sstr(staffId, 80) || room.participants[0];
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
  // default: keep it as meeting minutes only
  await setDoc(doc(meetDb, MEETINGS, id), { savedAs: kind, savedAt: Date.now() }, { merge: true });
  return { ok: true, saved: kind };
}

export async function reopenMeeting(id) {
  if (!meetDb) throw new Error('Meeting storage unavailable');
  const room = await getMeeting(id);
  if (!room) throw new Error('Meeting not found');
  await updateDoc(doc(meetDb, MEETINGS, id), { status: 'open', closedAt: 0, updatedAt: Date.now() });
  return { ok: true };
}
