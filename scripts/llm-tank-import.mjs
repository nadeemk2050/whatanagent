// ============================================================================
// 🧪 LLM TANK IMPORT — distil exported chats into reviewable candidates
// ============================================================================
// Turns a chat export into FAQ / contact-note candidates using GPT-6 Luna, then
// writes them to a JSON file for review. Nothing is published automatically.
//
//   node scripts/llm-tank-import.mjs --in chats.json --out data/llm-tank.json
//   node scripts/llm-tank-import.mjs --in chats.json --limit 20
//   node scripts/llm-tank-import.mjs --in chats.txt          (one chat per blank-line block)
//
// chats.json accepts either:
//   ["raw transcript text", ...]                      — one transcript per string
//   [{ "name": "Ahmed", "transcript": "..." }, ...]   — keeps the contact name
//
// To queue the results on the live server instead of writing a file, pass
//   --base https://whatanagent.duckdns.org --token <ADMIN_TOKEN>
// which POSTs each transcript to /api/llm-tank/distill (still approval-only).
//
// Requires OPENAI_API_KEY in the environment.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { distillTranscript } from '../llmTank.mjs';

function arg(name, fallback = '') {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith('--') ? next : 'true';
}

function loadChats(file) {
  const raw = fs.readFileSync(file, 'utf8');
  if (/\.json$/i.test(file)) {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('JSON input must be an array');
    return parsed.map(item => typeof item === 'string'
      ? { name: '', transcript: item }
      : { name: String(item.name || ''), transcript: String(item.transcript || item.text || '') })
      .filter(c => c.transcript.trim());
  }
  // Plain text: one chat per blank-line block.
  return raw.split(/\n\s*\n\s*\n/).map(block => ({ name: '', transcript: block.trim() })).filter(c => c.transcript);
}

const inFile = arg('in');
const outFile = arg('out', 'data/llm-tank-candidates.json');
const limit = Math.max(1, Number(arg('limit', '25')) || 25);
const base = arg('base');
const token = arg('token');

if (!inFile) {
  console.error('Usage: node scripts/llm-tank-import.mjs --in <chats.json|chats.txt> [--out file] [--limit N] [--base URL --token TOKEN]');
  process.exit(1);
}
if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is not set in this shell.');
  process.exit(1);
}

const chats = loadChats(inFile).slice(0, limit);
console.log('Loaded ' + chats.length + ' chat(s) from ' + inFile);

async function postDistill(chat) {
  const r = await fetch(String(base).replace(/\/+$/, '') + '/api/llm-tank/distill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
    body: JSON.stringify(chat),
    signal: AbortSignal.timeout(120000)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status));
  return j;
}

const results = [];
let totalFaqs = 0, totalNotes = 0;

for (let i = 0; i < chats.length; i++) {
  const chat = chats[i];
  const label = chat.name || ('chat ' + (i + 1));
  try {
    if (base && token) {
      const r = await postDistill(chat);
      totalFaqs += r.faqs || 0; totalNotes += r.notes || 0;
      console.log('[' + (i + 1) + '/' + chats.length + '] ' + label + ' -> queued ' + (r.queued || 0));
      results.push({ name: chat.name, ...r });
    } else {
      const { faqs, notes } = await distillTranscript(chat);
      totalFaqs += faqs.length; totalNotes += notes.length;
      console.log('[' + (i + 1) + '/' + chats.length + '] ' + label + ' -> ' + faqs.length + ' FAQ, ' + notes.length + ' note');
      results.push({ name: chat.name, faqs, notes });
    }
  } catch (e) {
    console.warn('[' + (i + 1) + '/' + chats.length + '] ' + label + ' FAILED: ' + String(e.message || e).slice(0, 160));
    results.push({ name: chat.name, error: String(e.message || e).slice(0, 200) });
  }
}

if (!base) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify({ generatedAt: Date.now(), chats: results }, null, 2));
  console.log('\nWrote ' + results.length + ' chat result(s) to ' + outFile);
}

console.log('\nTotal: ' + totalFaqs + ' FAQ candidate(s), ' + totalNotes + ' note candidate(s).');
console.log('Review/approve on the server: GET /api/llm-tank/candidates  then POST /api/llm-tank/candidates/<id>/approve');
