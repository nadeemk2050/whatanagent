// ============================================================================
// 🤖 BL Inbox — the assigned AI staff reads BLs posted in the WhatsApp group
// ============================================================================
// WHAT IT DOES (one loop, no hand-holding)
//   1. Watches every group the owner has assigned to an AI staff member whose
//      "Read BLs from this group" power is on.
//   2. When a document arrives that smells like a Bill of Lading, it downloads
//      the file from WhatsApp, saves it to Google Drive (BL Inbox / <group>),
//      and reads the text.
//   3. It extracts shipper, consignee, port of loading, shipping agent, vessel,
//      seal and containers, then compares them with the details saved in the
//      app (the station pushes a small reference set: your BL drafts + masters).
//   4. A real difference is posted in the group AND messaged to the boss; a
//      clean BL gets a short confirmation to the boss only.
//
// WHY THE BROWSER SENDS THE REFERENCE DATA
// The app's records live in the browser (SQLite + Firestore mirror); the server
// never owns them. Rather than guessing, the BL Checking Station posts a compact
// reference (drafts + masters) to POST /candl/api/wa/reference, and this module
// compares against exactly what the app shows.
//
// ROUTES (under /candl/api/wa)
//   POST /reference              save the app's drafts + masters for comparison
//   GET  /reference              what the server currently holds
//   GET  /bl-inbox?jid=          BLs the AI already read, with verdicts
//   POST /bl-inbox/scan          read the group now (instead of waiting a tick)
//   POST /bl-inbox/notify        re-send a verdict to the group / boss
// ============================================================================
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import { createRequire } from 'module';
import { extractBlFields } from './candlBl.mjs';
import { listAssignments } from './candlWhatsApp.mjs';
import { downloadWaWebMedia, getWaWebStatus, readChatMessagesForOwner, sendWaWebMessage } from './waWebClient.js';

const require = createRequire(import.meta.url);
const gdrive = require('./candlGdrive.cjs');

const PREFIX = '/candl/api/wa';
const DATA_DIR = process.env.CANDL_DATA_DIR || path.resolve(process.cwd(), 'data');
const REF_FILE = path.join(DATA_DIR, 'candl-wa-reference.json');
const INBOX_FILE = path.join(DATA_DIR, 'candl-wa-bl-inbox.json');
const TICK_MS = 30 * 1000;          // the WhatsApp raw-message cache holds ~1000 msgs, so stay quick
const MAX_DOCS_PER_TICK = 3;
const MAX_TEXT_CHARS = 60000;

const sstr = (v, n = 300) => String(v == null ? '' : v).slice(0, n);

// ── tiny JSON stores (records still live in the app; these are working copies) ─
function readJson(file, fallback) {
  try {
    const obj = JSON.parse(fs.readFileSync(file, 'utf8'));
    return obj && typeof obj === 'object' ? obj : fallback;
  } catch (e) { return fallback; }
}

function writeJson(file, value) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
    fs.renameSync(tmp, file);
  } catch (e) {
    console.warn('[BL-INBOX] could not save ' + path.basename(file) + ':', e.message);
  }
}

const readReference = () => readJson(REF_FILE, { masters: [], drafts: [], updatedAt: 0 });
const readInbox = () => readJson(INBOX_FILE, { lastTs: {}, items: [] });

// ── text comparison ─────────────────────────────────────────────────────────
const norm = (v) => String(v == null ? '' : v)
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function tokens(v) {
  return new Set(norm(v).split(' ').filter(t => t.length > 1));
}

/** 0..1 — how much two company names / addresses overlap. */
function similarity(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.min(ta.size, tb.size);
}

const sameish = (a, b) => {
  if (!a || !b) return false;
  if (norm(a) === norm(b)) return true;
  if (norm(a).includes(norm(b)) || norm(b).includes(norm(a))) return true;
  return similarity(a, b) >= 0.72;
};

const FIELD_LABEL = {
  shipper_name: 'Shipper',
  consignee_name: 'Consignee',
  port_of_loading: 'Port of loading',
  shipping_agent: 'Shipping agent',
  vessel_name: 'Vessel',
  bl_number: 'BL number'
};

/**
 * Compare one extracted BL against what the app has saved.
 * Only a *known* expected value can produce a mismatch — an empty reference is
 * never treated as a mistake, because that would train the owner to ignore it.
 */
export function checkBlAgainstReference(fields, reference) {
  const ref = reference || {};
  const drafts = Array.isArray(ref.drafts) ? ref.drafts : [];
  const masters = Array.isArray(ref.masters) ? ref.masters : [];

  const issues = [];
  const matched = [];

  const draft = drafts.find(d => d && d.bl_number && sameish(d.bl_number, fields.bl_number));

  // 1. Same BL number already drafted in the app → compare field by field.
  if (draft) {
    for (const key of ['shipper_name', 'consignee_name', 'vessel_name', 'port_of_loading', 'shipping_agent']) {
      const expected = String(draft[key] || '').trim();
      const got = String(fields[key] || '').trim();
      if (!expected || !got) continue;
      if (sameish(expected, got)) matched.push(key);
      else issues.push({ field: key, label: FIELD_LABEL[key] || key, expected: sstr(expected, 300), got: sstr(got, 300), severity: 'mismatch' });
    }
  }

  // 2. Masters are the app's own list of shippers / consignees / ports / agents.
  const byCategory = (cat) => masters.filter(m => m && m.category === cat && m.name);
  const categories = [
    ['shipper_name', 'shipper'],
    ['consignee_name', 'consignee'],
    ['port_of_loading', 'port_of_loading'],
    ['shipping_agent', 'shipping_agent']
  ];
  for (const [field, category] of categories) {
    const got = String(fields[field] || '').trim();
    if (!got) continue;
    const list = byCategory(category);
    if (!list.length) continue;                       // nothing saved to compare with
    if (issues.some(i => i.field === field)) continue; // already reported as a draft mismatch
    const hit = list.find(m => sameish(m.name, got));
    if (hit) matched.push(field);
    else issues.push({
      field, label: FIELD_LABEL[field] || field, expected: '', got: sstr(got, 300),
      severity: 'unknown',
      note: 'not in your saved ' + category.replace(/_/g, ' ') + ' list'
    });
  }

  // 3. Containers: anything in the BL that the app has never seen for this BL/PI.
  const knownContainers = new Set();
  for (const d of drafts) {
    for (const c of (d.container_numbers || [])) knownContainers.add(norm(c));
    if (d.container_numbers_text) String(d.container_numbers_text).split(/[,\s]+/).forEach(c => c && knownContainers.add(norm(c)));
  }
  const blContainers = (fields.container_numbers || []).map(norm).filter(Boolean);
  if (knownContainers.size && blContainers.length) {
    const extra = blContainers.filter(c => !knownContainers.has(c));
    if (extra.length) {
      issues.push({
        field: 'container_numbers', label: 'Containers', expected: '', got: extra.join(', '),
        severity: 'unknown', note: 'container(s) not in your saved BL / P.I. records'
      });
    }
  }

  const hard = issues.filter(i => i.severity === 'mismatch');
  const soft = issues.filter(i => i.severity === 'unknown');
  const verdict = hard.length ? 'mismatch' : (soft.length ? 'unknown' : (matched.length ? 'ok' : 'no-reference'));

  return { verdict, issues, matched, comparedWith: draft ? draft.bl_number : '' };
}

// ── PDF text ────────────────────────────────────────────────────────────────
async function pdfToText(buffer) {
  const { PDFParse } = require('pdf-parse');
  const parsed = await new PDFParse({ data: buffer }).getText();
  const text = String((parsed && parsed.text) || '');
  return text.slice(0, MAX_TEXT_CHARS);
}

// ── Drive: permanent home for the BL the group sent ─────────────────────────
async function saveBlToDrive(buffer, fileName, groupName, blNumber) {
  const conn = await gdrive.checkConnection();
  if (!conn.connected) return { ok: false, reason: conn.reason || 'Google Drive is not connected' };
  if (gdrive.isMockMode && gdrive.isMockMode()) return { ok: false, reason: 'Google Drive is in mock mode' };

  const root = await gdrive.getOrCreateRootFolder();
  const inbox = await gdrive.getOrCreateSubfolder(root, 'BL Inbox');
  const groupFolder = await gdrive.getOrCreateSubfolder(inbox || root, sstr(groupName || 'WhatsApp group', 90).replace(/[\\/:*?"<>|]+/g, '_'));
  const monthFolder = await gdrive.getOrCreateSubfolder(groupFolder || inbox || root, new Date().toISOString().slice(0, 7));

  const safeName = sstr(fileName || (blNumber ? 'BL-' + blNumber : 'BL') + '.pdf', 160).replace(/[\\/:*?"<>|]+/g, '_');
  const tempPath = path.join(os.tmpdir(), 'bl-inbox-' + Date.now() + '-' + safeName);
  try {
    fs.writeFileSync(tempPath, buffer);
    const uploaded = await gdrive.uploadFile(tempPath, safeName, 'application/pdf', monthFolder || inbox || root);
    if (!uploaded || !uploaded.id || String(uploaded.id).startsWith('file_')) {
      return { ok: false, reason: 'Drive returned no real file id' };
    }
    return {
      ok: true,
      file_id: uploaded.id,
      file_name: safeName,
      folder_id: monthFolder || inbox || root || null,
      web_view_link: uploaded.webViewLink || ('https://drive.google.com/file/d/' + uploaded.id + '/view')
    };
  } catch (e) {
    return { ok: false, reason: sstr(e.message || e, 160) };
  } finally {
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (e) { /* ignore */ }
  }
}

// ── WhatsApp messages ───────────────────────────────────────────────────────
function bossNumber() {
  return String(process.env.BOSS_PHONE || process.env.OWNER_PHONE_NUMBER || '').replace(/\D/g, '');
}

function verdictMessage(item) {
  const f = item.fields || {};
  const issues = (item.check && item.check.issues) || [];
  const hard = issues.filter(i => i.severity === 'mismatch');
  const soft = issues.filter(i => i.severity === 'unknown');
  const verdict = item.check && item.check.verdict;

  // Never claim "OK" when there was nothing to compare with — that would train the
  // owner to trust a check that never ran.
  const title = hard.length ? '❌ *BL CHECK — MISMATCH*'
    : soft.length ? '⚠️ *BL CHECK — PLEASE CONFIRM*'
      : verdict === 'no-reference' ? 'ℹ️ *BL CHECK — NOTHING SAVED TO COMPARE*'
        : '✅ *BL CHECK — OK*';

  const head = title + '\n' +
    '*' + (f.bl_number || item.source_file_name || 'Bill of Lading') + '*' +
    (f.vessel_name ? ' · ' + f.vessel_name : '') + '\n';

  const lines = [];
  for (const i of hard) {
    lines.push('• ' + i.label.toUpperCase() + ' differs\n   in BL : ' + (i.got || '—') + '\n   in app: ' + (i.expected || '—'));
  }
  for (const i of soft) {
    lines.push('• ' + i.label + ': ' + (i.got || '—') + ' (' + (i.note || 'check this') + ')');
  }
  if (!hard.length && !soft.length) {
    lines.push(verdict === 'no-reference'
      ? 'No BL draft or saved master for this shipper / consignee / port / agent was found in the app, so there was nothing to compare.'
      : 'Shipper, consignee, port of loading and shipping agent all match the app.');
  }
  const drive = item.drive && item.drive.ok ? '\n📎 Saved to Drive: ' + item.drive.web_view_link : '\n📎 Drive save failed: ' + ((item.drive && item.drive.reason) || 'unknown');
  return head + lines.join('\n') + drive;
}

async function notify(item, { group, boss }) {
  const text = verdictMessage(item);
  const done = { group: false, boss: false };
  if (group && item.jid) {
    try { await sendWaWebMessage(item.jid, text); done.group = true; }
    catch (e) { console.warn('[BL-INBOX] group notify failed:', sstr(e.message, 120)); }
  }
  const bn = bossNumber();
  if (boss && bn) {
    try { await sendWaWebMessage(bn, text); done.boss = true; }
    catch (e) { console.warn('[BL-INBOX] boss notify failed:', sstr(e.message, 120)); }
  }
  return done;
}

// ── one document → checked + filed + reported ───────────────────────────────
async function processDocument(assignment, msg, groupName, reference, state) {
  const fileName = (msg.mediaInfo && msg.mediaInfo.fileName) || 'document.pdf';
  const base = {
    id: sstr(msg.id, 90),
    jid: assignment.jid,
    group_name: groupName,
    message_id: sstr(msg.id, 90),
    message_ts: Number(msg.timestamp) || 0,
    sender: sstr(msg.fromMe ? 'You' : (msg.senderName || ''), 80),
    source_file_name: sstr(fileName, 160),
    at: Date.now()
  };

  let media;
  try {
    media = await downloadWaWebMedia(assignment.jid, msg.id);
  } catch (e) {
    const item = Object.assign(base, {
      status: 'error',
      error: 'Could not download the document from WhatsApp (' + sstr(e.message, 120) + '). It is only downloadable while it is still in the recent-message cache.',
      check: { verdict: 'error', issues: [], matched: [] }
    });
    state.items.unshift(item);
    return item;
  }

  // 1. Save the original to Drive first — even if reading the text fails, the file is safe.
  const drive = await saveBlToDrive(media.buffer, media.fileName || fileName, groupName, '');

  // 2. Read it.
  let text = '';
  try { text = await pdfToText(media.buffer); }
  catch (e) {
    const item = Object.assign(base, {
      status: 'unreadable',
      drive,
      error: 'The PDF has no readable text (probably a scan). ' + sstr(e.message, 120),
      check: { verdict: 'unreadable', issues: [], matched: [] }
    });
    state.items.unshift(item);
    return item;
  }

  const { source, fields } = await extractBlFields(text, {});
  const looksLikeBl = !!(fields.bl_number || fields.shipper_name || fields.consignee_name);
  if (!looksLikeBl) {
    const item = Object.assign(base, {
      status: 'skipped',
      drive,
      fields,
      error: 'Not a Bill of Lading (no BL number, shipper or consignee found).',
      check: { verdict: 'not-a-bl', issues: [], matched: [] }
    });
    state.items.unshift(item);
    return item;
  }

  // 3. Compare with the app's own details.
  const check = checkBlAgainstReference(fields, reference);
  const item = Object.assign(base, {
    status: 'checked',
    extraction_source: source,
    drive,
    fields,
    check
  });

  // 4. Report: a real mismatch goes to the group AND the boss; anything else to the boss only.
  const hard = check.issues.some(i => i.severity === 'mismatch');
  item.notified = await notify(item, {
    group: hard,
    boss: assignment.powers ? assignment.powers.notifyOwner !== false : true
  });

  state.items.unshift(item);
  return item;
}

// ── the watcher tick ────────────────────────────────────────────────────────
const LOOKS_LIKE_DOC = /bl|lading|bill\s*of/i;

// Split on anything that is not a letter/digit, so "MEDUALU18574_EBKG19393286_MSC" still yields
// the BL-style token EBKG19393286 (an underscore is a word character for \b, which hid it).
const alphaNumTokens = (v) => String(v == null ? '' : v).toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
const hasBlToken = (v) => alphaNumTokens(v).some(t => /^[A-Z]{3,5}\d{6,}$/.test(t));

export function isBlCandidate(msg) {
  if (!msg || msg.mediaType !== 'document') return false;
  const name = (msg.mediaInfo && msg.mediaInfo.fileName) || '';
  const mime = (msg.mediaInfo && msg.mediaInfo.mimetype) || '';
  if (!/pdf/i.test(name) && !/pdf/i.test(mime)) return false;
  if (LOOKS_LIKE_DOC.test(name)) return true;
  if (hasBlToken(name)) return true;
  if (hasBlToken(msg.text)) return true;
  return false;
}

let ticking = false;

export async function scanGroup(assignment, { force = false } = {}) {
  const state = readInbox();
  const reference = readReference();
  const groupName = assignment.groupName || assignment.jid;

  let messages = [];
  try {
    messages = await readChatMessagesForOwner(assignment.jid, 200);
  } catch (e) {
    return { ok: false, error: sstr(e.message || e, 150), processed: 0 };
  }
  if (!messages.length) return { ok: true, processed: 0, scanned: 0 };

  const seen = new Set(state.items.filter(i => i && i.jid === assignment.jid).map(i => i.message_id));
  const lastTs = Number(state.lastTs[assignment.jid]) || 0;

  // Oldest first: messages are sorted ascending, so taking the tail would advance lastTs past
  // documents that were never read. Taking the head means a burst of BLs drains tick by tick.
  const pending = messages
    .filter(m => isBlCandidate(m))
    .filter(m => force || (Number(m.timestamp) || 0) > lastTs)
    .filter(m => !seen.has(sstr(m.id, 90)))
    .slice(0, MAX_DOCS_PER_TICK);

  const processed = [];
  for (const msg of pending) {
    try {
      processed.push(await processDocument(assignment, msg, groupName, reference, state));
    } catch (e) {
      console.warn('[BL-INBOX] document failed:', sstr(e.message, 160));
    }
  }

  if (pending.length) {
    state.lastTs[assignment.jid] = Math.max(lastTs, ...pending.map(m => Number(m.timestamp) || 0));
  }
  state.items = state.items.slice(0, 400);
  writeJson(INBOX_FILE, state);
  return { ok: true, processed: processed.length, scanned: messages.length, items: processed.map(i => ({ id: i.id, bl_number: i.fields && i.fields.bl_number, verdict: i.check && i.check.verdict, status: i.status })) };
}

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    if (getWaWebStatus().status !== 'connected') return;      // only the node that owns the session
    const assignments = listAssignments().filter(a =>
      a && a.jid && a.jid.endsWith('@g.us') && (!a.powers || a.powers.readBls !== false));
    for (const a of assignments) await scanGroup(a);
  } catch (e) {
    console.warn('[BL-INBOX] tick error:', sstr(e.message || e, 160));
  } finally {
    ticking = false;
  }
}

let starter = false;
export function startCandlBlWatcher() {
  if (starter) return;
  starter = true;
  setTimeout(tick, 45 * 1000);              // let WhatsApp finish connecting first
  const timer = setInterval(tick, TICK_MS);
  if (typeof timer.unref === 'function') timer.unref();
  console.log('[BL-INBOX] 🤖 BL watcher started — every ' + (TICK_MS / 1000) + 's over assigned groups');
}

// ── routes ──────────────────────────────────────────────────────────────────
export function registerCandlBlInboxRoutes(app) {
  const expectedKey = String(process.env.CANDL_WA_KEY || '').trim();
  const guard = (req, res, next) => {
    if (!expectedKey) return next();
    const given = String(req.headers['x-candl-key'] || req.query.key || '').trim();
    if (given !== expectedKey) return res.status(401).json({ ok: false, error: 'Bad CANDL_WA_KEY' });
    return next();
  };

  app.post(PREFIX + '/reference', guard, express.json({ limit: '4mb' }), (req, res) => {
    const body = req.body || {};
    const clean = (arr, keys, cap) => (Array.isArray(arr) ? arr : []).slice(0, cap).map(row => {
      const out = {};
      for (const k of keys) {
        if (row == null) continue;
        out[k] = k === 'container_numbers'
          ? (Array.isArray(row[k]) ? row[k].map(c => sstr(c, 20)) : [])
          : sstr(row[k], 400);
      }
      return out;
    });
    const payload = {
      masters: clean(body.masters, ['category', 'name', 'details'], 4000),
      drafts: clean(body.drafts, ['bl_number', 'shipper_name', 'consignee_name', 'vessel_name', 'port_of_loading', 'shipping_agent', 'container_numbers', 'container_numbers_text', 'proforma_number'], 500),
      updatedAt: Date.now()
    };
    writeJson(REF_FILE, payload);
    res.json({ ok: true, masters: payload.masters.length, drafts: payload.drafts.length, updatedAt: payload.updatedAt });
  });

  app.get(PREFIX + '/reference', guard, (req, res) => {
    const ref = readReference();
    const byCat = {};
    for (const m of ref.masters || []) byCat[m.category] = (byCat[m.category] || 0) + 1;
    res.json({ ok: true, masters: (ref.masters || []).length, drafts: (ref.drafts || []).length, byCategory: byCat, updatedAt: ref.updatedAt || 0 });
  });

  app.get(PREFIX + '/bl-inbox', guard, (req, res) => {
    const jid = sstr(req.query.jid, 120).trim();
    const state = readInbox();
    const items = (state.items || []).filter(i => i && (!jid || i.jid === jid));
    res.json({ ok: true, total: items.length, items: items.slice(0, 100) });
  });

  app.post(PREFIX + '/bl-inbox/scan', guard, async (req, res) => {
    const jid = sstr((req.body || {}).jid || req.query.jid, 120).trim();
    const assignments = listAssignments().filter(a => a && a.jid && (!jid || a.jid === jid));
    if (!assignments.length) return res.status(400).json({ ok: false, error: 'No group is assigned to an AI staff member yet.' });
    const out = [];
    for (const a of assignments) out.push(Object.assign({ jid: a.jid }, await scanGroup(a, { force: true })));
    res.json({ ok: true, results: out });
  });

  app.post(PREFIX + '/bl-inbox/notify', guard, express.json({ limit: '1mb' }), async (req, res) => {
    const id = sstr((req.body || {}).id, 90).trim();
    const target = sstr((req.body || {}).to, 20).trim();
    const state = readInbox();
    const item = (state.items || []).find(i => i && i.id === id);
    if (!item) return res.status(404).json({ ok: false, error: 'BL not found in the inbox.' });
    const done = await notify(item, { group: target === 'group', boss: target !== 'group' });
    item.notified = Object.assign({}, item.notified, done);
    writeJson(INBOX_FILE, state);
    res.json({ ok: true, notified: done });
  });

  console.log('[BL-INBOX] 📥 BL inbox routes ready at ' + PREFIX + '/bl-inbox');
}
