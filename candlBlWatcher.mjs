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
import crypto from 'crypto';
import express from 'express';
import { createRequire } from 'module';
import { extractBlFields } from './candlBl.mjs';
import { listAssignments } from './candlWhatsApp.mjs';
import { downloadWaWebMedia, getWaWebStatus, readChatMessagesForOwner, sendWaWebMessage, downloadWaWebMediaRaw, addWaMediaListener, addWaMessageListener } from './waWebClient.js';
import { extractTextFromBuffer, extractTextFromFile, pdfToText } from './blText.mjs';
import { resolveDeepSeek } from './aiProviders.mjs';
import { recordAiCall } from './aiTracker.mjs';
import { cachedTokensFrom } from './promptCache.mjs';

const require = createRequire(import.meta.url);
const gdrive = require('./candlGdrive.cjs');

const PREFIX = '/candl/api/wa';
const DATA_DIR = process.env.CANDL_DATA_DIR || path.resolve(process.cwd(), 'data');
const REF_FILE = path.join(DATA_DIR, 'candl-wa-reference.json');
const INBOX_FILE = path.join(DATA_DIR, 'candl-wa-bl-inbox.json');
const ANALYSIS_FILE = path.join(DATA_DIR, 'candl-wa-chat-analysis.json');
// A group is read the moment something arrives in it (see queueScanForGroup). This sweep is only a
// backstop for what an event cannot cover: messages that arrived while the server was down and
// were replayed by history sync, which raises no live event.
const SAFETY_TICK_MS = 15 * 60 * 1000;
const SAFETY_FIRST_TICK_MS = 60 * 1000;
const EVENT_DEBOUNCE_MS = 4000;      // let a burst of messages settle before reading the group
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

export const readReference = () => readJson(REF_FILE, { masters: [], drafts: [], updatedAt: 0 });
const readInbox = () => readJson(INBOX_FILE, { lastTs: {}, items: [] });

// ── settings (provider keys live in the Firestore settings document) ─────────
// OCR needs the Gemini key, and the rest of the app reads it from settings rather than the
// environment. Cached briefly: settings change rarely and this runs on every extraction.
let blSettingsProvider = null;
let blSettingsCache = { at: 0, value: {} };

export function setBlSettingsProvider(fn) {
  if (typeof fn === 'function') { blSettingsProvider = fn; blSettingsCache = { at: 0, value: {} }; }
}

export async function blSettings() {
  if (Date.now() - blSettingsCache.at < 60000) return blSettingsCache.value;
  let value = {};
  try { if (blSettingsProvider) value = (await blSettingsProvider()) || {}; }
  catch (e) { value = {}; }
  blSettingsCache = { at: Date.now(), value: value };
  return value;
}

// ── media archive ───────────────────────────────────────────────────────────
// WHY THIS EXISTS
// WhatsApp media links expire and the raw message is dropped from the in-memory cache, so a
// document that is not fetched within minutes of arriving can NEVER be fetched again. Fetching
// on demand from a 3-month-old chat therefore fails by design - no amount of VPS or Firebase
// changes that. The only reliable answer is to copy the bytes the moment they land, which is
// what this archive does, keyed by (group, message id) and stored on the VPS disk.
const MEDIA_DIR = path.join(DATA_DIR, 'wa-media');
const MEDIA_INDEX_FILE = path.join(MEDIA_DIR, 'index.json');
const MAX_MEDIA_BYTES = 900 * 1024 * 1024;      // whole archive; oldest files drop first
const MAX_ONE_FILE_BYTES = 40 * 1024 * 1024;    // one document
const ARCHIVE_TYPES = new Set(['document', 'image']);
// Bump when text extraction improves: a kept .txt from an older reader must be redone, otherwise
// the better reader never reaches files that were already read once.
const SIDECAR_TEXT_VERSION = 2;

const readMediaIndex = () => readJson(MEDIA_INDEX_FILE, { totalBytes: 0, items: {} });
const mediaSafe = (v) => String(v == null ? '' : v).replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 90) || 'x';
const archiveKey = (jid, id) => sstr(jid, 90) + '|' + sstr(id, 90);

/** A file we already hold for this message, or null. */
function archivedFromIndex(idx, jid, id) {
  const hit = idx && idx.items ? idx.items[archiveKey(jid, id)] : null;
  if (!hit || !hit.file) return null;
  const abs = path.join(MEDIA_DIR, hit.file);
  try {
    const st = fs.statSync(abs);
    return st.size ? Object.assign({}, hit, { abs: abs, size: st.size }) : null;
  } catch (e) { return null; }
}

const lookupArchivedMedia = (jid, id) => archivedFromIndex(readMediaIndex(), jid, id);
export { lookupArchivedMedia };

/** Oldest-first eviction so the disk never fills up. */
function pruneArchive(idx) {
  if (!idx || !idx.items || idx.totalBytes <= MAX_MEDIA_BYTES) return;
  const rows = Object.values(idx.items).sort((a, b) => (a.at || 0) - (b.at || 0));
  for (const r of rows) {
    if (idx.totalBytes <= MAX_MEDIA_BYTES) break;
    try { fs.unlinkSync(path.join(MEDIA_DIR, r.file)); } catch (e) { /* already gone */ }
    idx.totalBytes -= (r.size || 0);
    delete idx.items[archiveKey(r.jid, r.id)];
  }
}

/** Write bytes into the archive and index them. Returns the index record. */
export async function saveToArchive(jid, id, media, ts, groupName) {
  if (!jid || !id || !media || !media.buffer || !media.buffer.length) return null;
  if (media.buffer.length > MAX_ONE_FILE_BYTES) return null;

  const groupDir = mediaSafe(String(jid).split('@')[0]);
  const ext = (String(media.fileName || '').match(/\.[A-Za-z0-9]{1,8}$/) || ['.bin'])[0];
  const rel = path.join(groupDir, mediaSafe(id) + ext);
  const abs = path.join(MEDIA_DIR, rel);

  try {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, media.buffer);
  } catch (e) {
    console.warn('[BL-INBOX] could not write media file:', sstr(e.message, 120));
    return null;
  }

  const idx = readMediaIndex();
  idx.items = idx.items || {};
  const key = archiveKey(jid, id);
  const old = idx.items[key];
  if (old) idx.totalBytes = Math.max(0, (idx.totalBytes || 0) - (old.size || 0));
  const rec = {
    jid: sstr(jid, 90),
    id: sstr(id, 90),
    file: rel,
    fileName: sstr(media.fileName || ('media' + ext), 160),
    mimetype: sstr(media.mimetype || 'application/octet-stream', 120),
    size: media.buffer.length,
    ts: Number(ts) || Date.now(),
    at: Date.now(),
    group_name: sstr(groupName || '', 90)
  };
  idx.items[key] = rec;
  idx.totalBytes = Number(idx.totalBytes || 0) + rec.size;
  pruneArchive(idx);
  writeJson(MEDIA_INDEX_FILE, idx);

  // Extract the text now, in the background, so every later read is free.
  if (isTextualFile(rec.mimetype, rec.fileName)) queueArchiveText(jid, id);

  return rec;
}

// ── text + fields sidecars ──────────────────────────────────────────────────
// Each archived file gets two small neighbours: <id>.txt (the text, extracted once — OCR when the
// file is a scan) and <id>.xray.json (the X-Ray fields, keyed by a hash of that text). This is what
// makes re-checking free: comparing an old BL against updated masters costs no AI at all.
const isTextualFile = (mimetype, fileName) =>
  /pdf/i.test(String(mimetype || '')) || /^image\//i.test(String(mimetype || '')) || /\.(pdf|jpe?g|png|webp|tiff?|bmp)$/i.test(String(fileName || ''));

function sidecarBase(rec) {
  return path.join(MEDIA_DIR, String(rec.file).replace(/\.[^./\\]+$/, ''));
}

/** Paths of the two sidecars for an archived message, or null when it is not archived. */
export function archiveSidecars(jid, id) {
  const rec = lookupArchivedMedia(jid, id);
  if (!rec) return null;
  const base = sidecarBase(rec);
  return { rec: rec, text: base + '.txt', fields: base + '.xray.json' };
}

/** Throw away a kept text so the next read re-extracts it (after a reader improvement). */
export function clearArchiveText(jid, id) {
  const p = archiveSidecars(jid, id);
  if (!p) return false;
  try { fs.unlinkSync(p.text); } catch (e) { /* nothing kept */ }
  patchMediaRecord(jid, id, { text_source: '', text_chars: 0, text_error: '', text_version: 0 });
  return true;
}

export function readSidecarText(jid, id) {
  const p = archiveSidecars(jid, id);
  if (!p) return null;
  try {
    const t = fs.readFileSync(p.text, 'utf8');
    return t.trim() ? t : null;
  } catch (e) { return null; }
}

export function readSidecarFields(jid, id) {
  const p = archiveSidecars(jid, id);
  if (!p) return null;
  try {
    const obj = JSON.parse(fs.readFileSync(p.fields, 'utf8'));
    return obj && obj.fields ? obj : null;
  } catch (e) { return null; }
}

export function writeSidecarFields(jid, id, data) {
  const p = archiveSidecars(jid, id);
  if (!p || !data) return false;
  try {
    const tmp = p.fields + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, p.fields);
    return true;
  } catch (e) { return false; }
}

/** Patch one archive record (text_source / text_chars / text_at). */
function patchMediaRecord(jid, id, patch) {
  try {
    const idx = readMediaIndex();
    const key = archiveKey(jid, id);
    if (!idx.items || !idx.items[key]) return;
    idx.items[key] = Object.assign({}, idx.items[key], patch);
    writeJson(MEDIA_INDEX_FILE, idx);
  } catch (e) { /* index trouble must never break extraction */ }
}

/**
 * Text for an archived file, extracted once and kept. Returns { text, source, at } or null.
 * Uses the .txt sidecar when present, otherwise reads the file (PDF text layer, or vision OCR for
 * a scan or a photo).
 */
export async function ensureArchiveText(jid, id) {
  const p = archiveSidecars(jid, id);
  if (!p) return null;

  const existing = readSidecarText(jid, id);
  const fresh = existing && (Number(p.rec && p.rec.text_version) || 0) === SIDECAR_TEXT_VERSION;
  if (fresh) {
    return { text: existing, source: (p.rec && p.rec.text_source) || 'sidecar', at: (p.rec && p.rec.text_at) || 0 };
  }

  if (!p.rec.size || p.rec.size > MAX_ONE_FILE_BYTES) {
    return { text: '', source: 'too-large', at: Date.now(), error: 'file exceeds the extraction size limit' };
  }

  const got = await extractTextFromFile(p.rec.abs, {
    mimetype: p.rec.mimetype,
    fileName: p.rec.fileName,
    settings: await blSettings()
  });
  const text = String((got && got.text) || '').trim();
  const at = Date.now();

  if (!text) {
    // Record the failure (so it is reported, and so we do not retry a vision call every tick).
    patchMediaRecord(jid, id, {
      text_source: (got && got.source) || 'none',
      text_error: (got && got.error) || '',
      text_chars: 0,
      text_at: at,
      text_version: SIDECAR_TEXT_VERSION
    });
    return { text: '', source: (got && got.source) || 'none', at: at, error: (got && got.error) || '' };
  }

  try { fs.writeFileSync(p.text, text.slice(0, MAX_TEXT_CHARS)); }
  catch (e) { /* the text is still usable in memory */ }

  patchMediaRecord(jid, id, {
    text_source: got.source || 'text',
    text_error: got.source === 'pdf-text-scrambled' ? ((got && got.error) || '') : '',
    text_chars: text.length,
    text_at: at,
    text_version: SIDECAR_TEXT_VERSION
  });
  console.log('[BL-INBOX] 📄 text ready (' + (got.source || 'text') + ', ' + text.length + ' chars) for ' + sstr(p.rec.fileName, 40));
  return { text: text, source: got.source || 'text', at: at, error: (got && got.error) || '' };
}

// Background queue: reading a scan can cost a vision call, so arrival must never wait for it.
const textQueue = [];
const textQueued = new Set();
let textPumpBusy = false;

export function queueArchiveText(jid, id) {
  if (!jid || !id) return;
  const key = archiveKey(jid, id);
  if (textQueued.has(key)) return;
  textQueued.add(key);
  textQueue.push({ jid: jid, id: id });
  pumpTextQueue();
}

async function pumpTextQueue() {
  if (textPumpBusy) return;
  textPumpBusy = true;
  try {
    while (textQueue.length) {
      const job = textQueue.shift();
      try {
        await ensureArchiveText(job.jid, job.id);
      } catch (e) {
        console.warn('[BL-INBOX] text extraction failed:', sstr(e.message || e, 140));
      } finally {
        textQueued.delete(archiveKey(job.jid, job.id));
      }
    }
  } finally {
    textPumpBusy = false;
  }
}

// Groups the owner has opted in to media saving for (they must be assigned to an AI staff member).
let archiveTargetsCache = { at: 0, set: new Set(), names: new Map() };
function archiveTargets() {
  if (Date.now() - archiveTargetsCache.at < 15000) return archiveTargetsCache.set;
  const set = new Set();
  const names = new Map();
  for (const a of listAssignments()) {
    if (!a || !a.jid || !a.jid.endsWith('@g.us')) continue;
    if (a.powers && a.powers.saveMedia === false) continue;
    set.add(a.jid);
    if (a.groupName) names.set(a.jid, a.groupName);
  }
  archiveTargetsCache = { at: Date.now(), set: set, names: names };
  return set;
}

/** The friendly group name for a jid, or '' when the group is not assigned. */
function groupNameFor(jid) {
  archiveTargets();
  return archiveTargetsCache.names.get(jid) || '';
}

/**
 * Arrival-time hook: copy the bytes while WhatsApp still allows it.
 * Called for every live media message; does nothing unless the group is opted in.
 */
export async function archiveIncomingMedia(rawMsg, meta) {
  try {
    if (!rawMsg || !meta || !meta.jid || !meta.messageId) return null;
    if (!ARCHIVE_TYPES.has(meta.mediaType)) return null;
    if (!archiveTargets().has(meta.jid)) return null;
    if (lookupArchivedMedia(meta.jid, meta.messageId)) return null;   // already have it

    const hinted = Number((meta.mediaInfo && meta.mediaInfo.fileLength) || 0);
    if (hinted > MAX_ONE_FILE_BYTES) {
      console.warn('[BL-INBOX] media too large to archive (' + Math.round(hinted / 1048576) + ' MB) for ' + sstr(meta.messageId, 40));
      return null;
    }

    const media = await downloadWaWebMediaRaw(rawMsg);
    const rec = await saveToArchive(meta.jid, meta.messageId, media, meta.timestamp, groupNameFor(meta.jid));
    if (rec) console.log('[BL-INBOX] 🗄 archived ' + rec.fileName + ' (' + Math.round(rec.size / 1024) + ' KB) from ' + sstr(meta.jid, 30));
    return rec;
  } catch (e) {
    console.warn('[BL-INBOX] media archive skipped:', sstr(e.message || e, 120));
    return null;
  }
}

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
// The implementation lives in blText.mjs (shared with the X-Ray reader) and is re-exported here so
// existing callers keep working.
export { pdfToText };

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
  } else if (boss && !bn) {
    // Say so out loud: a silent skip looks exactly like a check that found nothing.
    done.boss_error = 'BOSS_PHONE (or OWNER_PHONE_NUMBER) is not set on the server';
    console.warn('[BL-INBOX] boss notification skipped — ' + done.boss_error);
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

  let media = null;
  let mediaSource = '';

  // 0. Prefer our own copy: the archive does not depend on WhatsApp still serving the media.
  const archived = lookupArchivedMedia(assignment.jid, msg.id);
  if (archived) {
    try {
      media = { buffer: fs.readFileSync(archived.abs), fileName: archived.fileName, mimetype: archived.mimetype };
      mediaSource = 'archive';
    } catch (e) { media = null; }
  }

  // 1. Fall back to a live download, and keep a permanent copy of the bytes we just obtained.
  if (!media) {
    try {
      media = await downloadWaWebMedia(assignment.jid, msg.id);
      mediaSource = 'whatsapp';
      await saveToArchive(assignment.jid, msg.id, media, msg.timestamp, groupName);
    } catch (e) {
      const item = Object.assign(base, {
        status: 'awaiting-media',
        error: 'This file arrived before media saving was on for this group, and WhatsApp no longer serves it (' +
          sstr(e.message, 120) + '). Forward it into the group once — the AI will read it, check it and file it automatically.',
        check: { verdict: 'awaiting-media', issues: [], matched: [] }
      });
      state.items.unshift(item);
      return item;
    }
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
    media_source: mediaSource,
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

/** Groups the owner has handed to an AI staff member that is allowed to read BLs. */
function watchedGroups() {
  try {
    return listAssignments().filter(a =>
      a && a.jid && a.jid.endsWith('@g.us') && (!a.powers || a.powers.readBls !== false));
  } catch (e) { return []; }
}

// ── event-driven scanning ───────────────────────────────────────────────────
// One pending scan per group: a group that receives ten messages in a row is read once, after the
// burst, not ten times. This is what keeps a quiet group completely free.
const pendingScans = new Map();

export function queueScanForGroup(jid) {
  if (!jid || !String(jid).endsWith('@g.us')) return false;
  if (pendingScans.has(jid)) return true;

  const watched = watchedGroups().some(a => a.jid === jid);
  if (!watched) return false;                      // not assigned (yet): nothing to watch

  const timer = setTimeout(() => {
    pendingScans.delete(jid);
    const assignment = watchedGroups().find(a => a.jid === jid);
    if (!assignment) return;
    scanGroup(assignment).catch((e) => console.warn('[BL-INBOX] event scan failed:', sstr(e.message || e, 140)));
  }, EVENT_DEBOUNCE_MS);
  if (typeof timer.unref === 'function') timer.unref();

  pendingScans.set(jid, timer);
  return true;
}

/** Every live message in a watched group triggers one debounced read of that group. */
function onLiveMessage(msg, meta) {
  try {
    if (!meta || !meta.jid) return;
    queueScanForGroup(meta.jid);
  } catch (e) { /* never break the WhatsApp pipeline for this */ }
}

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

export async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    if (getWaWebStatus().status !== 'connected') return;      // only the node that owns the session
    for (const a of watchedGroups()) await scanGroup(a);
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
  // Copy media the moment it arrives: WhatsApp media links expire, so this is the only moment a
  // BL can be captured for good. Listening costs nothing for groups the owner has not opted in.
  addWaMediaListener(archiveIncomingMedia);
  // Read a group when it becomes active instead of polling it around the clock.
  addWaMessageListener(onLiveMessage);
  setTimeout(tick, SAFETY_FIRST_TICK_MS);    // let WhatsApp finish connecting first
  const timer = setInterval(tick, SAFETY_TICK_MS);
  if (typeof timer.unref === 'function') timer.unref();
  console.log('[BL-INBOX] 🤖 BL watcher ready — reads a group when a message arrives; safety sweep every ' +
    (SAFETY_TICK_MS / 60000) + ' min');
}

/** Small introspection hook for tests and diagnostics. */
export function watcherStats() {
  return {
    pending_scans: pendingScans.size,
    watched_groups: watchedGroups().length,
    safety_tick_ms: SAFETY_TICK_MS,
    event_debounce_ms: EVENT_DEBOUNCE_MS
  };
}

// ── routes ──────────────────────────────────────────────────────────────────
export function registerCandlBlInboxRoutes(app, opts = {}) {
  if (opts && typeof opts.getSettings === 'function') setBlSettingsProvider(opts.getSettings);
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
    res.json({ ok: true, total: items.length, items: items.slice(0, 100), boss_notifications: !!bossNumber() });
  });

  app.post(PREFIX + '/bl-inbox/scan', guard, async (req, res) => {
    const jid = sstr((req.body || {}).jid || req.query.jid, 120).trim();
    const assignments = listAssignments().filter(a => a && a.jid && (!jid || a.jid === jid));
    if (!assignments.length) return res.status(400).json({ ok: false, error: 'No group is assigned to an AI staff member yet.' });
    const out = [];
    for (const a of assignments) out.push(Object.assign({ jid: a.jid }, await scanGroup(a, { force: true })));
    res.json({ ok: true, results: out });
  });

  // ── read the group's chat and explain it ───────────────────────────────
  app.get(PREFIX + '/chat', guard, async (req, res) => {
    const jid = sstr(req.query.jid, 120).trim();
    if (!jid) return res.status(400).json({ ok: false, error: 'Which group? Pass ?jid=' });
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 200, 500));

    let messages = [];
    try { messages = await readChatMessagesForOwner(jid, limit); }
    catch (e) { return res.json({ ok: false, error: sstr(e.message || e, 150), messages: [] }); }

    const idx = readMediaIndex();
    const assignment = listAssignments().find(a => a && a.jid === jid) || {};
    const rows = messages.map((m) => {
      const hit = archivedFromIndex(idx, jid, m.id);
      return {
        id: sstr(m.id, 90),
        from_me: !!m.fromMe,
        sender: sstr(m.fromMe ? 'You' : (m.senderName || ''), 80),
        text: sstr(m.text, 400),
        ts: Number(m.timestamp) || 0,
        media_type: m.mediaType || '',
        file_name: sstr((m.mediaInfo && m.mediaInfo.fileName) || '', 160),
        archived: !!hit,
        size: hit ? hit.size : 0,
        download_url: hit ? (PREFIX + '/media?jid=' + encodeURIComponent(jid) + '&id=' + encodeURIComponent(m.id)) : ''
      };
    });

    res.json({
      ok: true,
      jid: jid,
      group_name: sstr(assignment.groupName || '', 90),
      total: rows.length,
      archived_files: rows.filter(r => r.archived).length,
      messages: rows
    });
  });

  // ── explain the group: who wants what, and what is meant ───────────────
  // One call per changed conversation: the answer is cached against a hash of the messages, so
  // opening the section again, or pressing Analyse again, costs nothing.
  app.post(PREFIX + '/chat/analyse', guard, express.json({ limit: '256kb' }), async (req, res) => {
    const body = req.body || {};
    const jid = sstr(body.jid || req.query.jid, 120).trim();
    const limit = Math.max(10, Math.min(Number(body.limit) || 200, 500));
    const force = !!body.force;
    if (!jid) return res.status(400).json({ ok: false, error: 'Which group? Pass { jid }' });

    let messages = [];
    try { messages = await readChatMessagesForOwner(jid, limit); }
    catch (e) { return res.status(500).json({ ok: false, error: sstr(e.message || e, 150) }); }

    if (!messages.length) {
      return res.json({ ok: true, empty: true, messages: 0, analysis: null, hint: 'No messages in memory for this group yet.' });
    }

    const transcript = messages.map((m) => {
      const who = m.fromMe ? 'You (owner)' : (m.senderName || 'Member');
      const when = m.timestamp ? new Date(m.timestamp).toISOString().slice(0, 16).replace('T', ' ') : '';
      const media = m.mediaType
        ? ' [' + m.mediaType + (m.mediaInfo && m.mediaInfo.fileName ? ': ' + m.mediaInfo.fileName : '') + ']'
        : '';
      return when + ' | ' + who + ': ' + String(m.text || '').slice(0, 300) + media;
    }).join('\n').slice(0, MAX_TEXT_CHARS);

    const hash = crypto.createHash('sha1').update(transcript).digest('hex');
    const store = readJson(ANALYSIS_FILE, {});
    const cached = store[jid];
    if (!force && cached && cached.hash === hash && cached.analysis) {
      return res.json({ ok: true, cached: true, messages: messages.length, analysis: cached.analysis, at: cached.at || 0 });
    }

    const settings = await blSettings();
    const ds = resolveDeepSeek(settings);
    if (!ds.key) return res.status(503).json({ ok: false, error: 'No AI key is configured for the server.' });

    const prompt = `You are reading a business WhatsApp group for the owner of a shipping/trading company. Explain it plainly.

Return ONLY a JSON object (no markdown, no code fences) with EXACTLY these keys:
{
  "summary": "2-4 sentences: what this group is about and what is happening in it right now",
  "members": [ { "name": "exactly as shown in the transcript", "role": "shipper / consignee / agent / broker / colleague / unknown", "wants": ["what this person wants, in their own terms"], "asks": ["direct requests or questions they made"], "notes": "anything important about them" } ],
  "decisions": ["things already agreed or confirmed"],
  "open_questions": ["questions still unanswered in the chat"],
  "action_items": [ { "who": "name or 'You'", "what": "the action" } ]
}

RULES
- Only use what the transcript supports. Use "" or [] when unsure. Never invent a person or a fact.
- "You (owner)" is the reader of this report; do not list them as a customer.
- Judge intent from the actual wording, including short replies and document names.
- If a document (PDF/image) was sent, say who sent it and what it appears to be.

TRANSCRIPT:
---
${transcript}
---`;

    const started = Date.now();
    let content = '';
    try {
      const aiBody = {
        model: ds.model,
        messages: [
          { role: 'system', content: 'You summarise WhatsApp business chats into JSON. Never invent facts.' },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 1600
      };
      if (/dashscope/i.test(ds.base)) aiBody.enable_thinking = false;

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 60000);
      let resp;
      let raw = '';
      try {
        resp = await fetch(ds.base.replace(/\/+$/, '') + '/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ds.key },
          body: JSON.stringify(aiBody),
          signal: ctrl.signal
        });
        raw = await resp.text();
      } finally {
        clearTimeout(timer);
      }
      if (!resp.ok) throw new Error('AI ' + resp.status + ': ' + raw.slice(0, 160));

      let data = {};
      try { data = JSON.parse(raw); } catch (e) { data = {}; }
      content = data?.choices?.[0]?.message?.content || '';
      recordAiCall({
        provider: 'deepseek',
        model: ds.model,
        area: 'Container Group Chat Analysis',
        isAutoFetch: false,
        prompt: transcript.slice(0, 2000),
        response: content.slice(0, 2000),
        tokensIn: data?.usage?.prompt_tokens || 0,
        tokensOut: data?.usage?.completion_tokens || 0,
        cachedTokens: cachedTokensFrom(data),
        durationMs: Date.now() - started
      });
    } catch (e) {
      return res.status(502).json({ ok: false, error: sstr(e.message || e, 180) });
    }

    let analysis = null;
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      try { analysis = JSON.parse(content.slice(start, end + 1)); } catch (e) { analysis = null; }
    }
    if (!analysis) return res.status(502).json({ ok: false, error: 'The model returned no usable JSON.' });

    store[jid] = { hash: hash, at: Date.now(), messages: messages.length, analysis: analysis };
    writeJson(ANALYSIS_FILE, store);

    res.json({ ok: true, cached: false, messages: messages.length, analysis: analysis, at: store[jid].at });
  });

  // List what the AI has actually downloaded and kept on this server.
  app.get(PREFIX + '/media/list', guard, (req, res) => {
    const jid = sstr(req.query.jid, 120).trim();
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 100, 500));
    const idx = readMediaIndex();
    idx.items = idx.items || {};

    // Files archived by the arrival hook used to have no group name. Fill it in on read so the
    // folder never shows a bare jid just because the record is old.
    const assignmentNames = new Map();
    try {
      for (const a of listAssignments()) if (a && a.jid && a.groupName) assignmentNames.set(a.jid, a.groupName);
    } catch (e) { /* listings still work without names */ }

    // Trust the disk, not the index: a file can disappear (manual delete, lost volume), and a
    // stale entry would then inflate the reported size forever. A global listing also drops the
    // dead entries so the index heals itself.
    const all = [];
    let dropped = 0;
    for (const key of Object.keys(idx.items)) {
      const r = idx.items[key];
      if (!r || !r.file) { delete idx.items[key]; dropped++; continue; }
      let st = null;
      try { st = fs.statSync(path.join(MEDIA_DIR, r.file)); } catch (e) { st = null; }
      if (!st || !st.size) {
        if (!jid) { idx.totalBytes = Math.max(0, (Number(idx.totalBytes) || 0) - (Number(r.size) || 0)); delete idx.items[key]; dropped++; }
        continue;
      }
      if (jid && r.jid !== jid) continue;
      if (!r.group_name && assignmentNames.has(r.jid)) r.group_name = assignmentNames.get(r.jid);
      all.push({ r: r, size: st.size });
    }
    if (dropped) writeJson(MEDIA_INDEX_FILE, idx);

    all.sort((a, b) => (b.r.ts || 0) - (a.r.ts || 0));
    const totalBytes = all.reduce((n, x) => n + x.size, 0);

    const items = all.slice(0, limit).map(({ r, size }) => ({
      id: r.id,
      jid: r.jid,
      group_name: r.group_name || '',
      file_name: r.fileName || path.basename(r.file),
      mimetype: r.mimetype || '',
      size: size,
      ts: r.ts || 0,
      at: r.at || 0,
      url: PREFIX + '/media?jid=' + encodeURIComponent(r.jid) + '&id=' + encodeURIComponent(r.id)
    }));

    res.json({
      ok: true,
      folder: MEDIA_DIR,
      total: all.length,
      bytes: totalBytes,
      shown: items.length,
      items: items
    });
  });

  // Serve an archived file back to the station (or straight to the browser).
  app.get(PREFIX + '/media', guard, (req, res) => {
    const jid = sstr(req.query.jid, 120).trim();
    const id = sstr(req.query.id, 90).trim();
    const hit = lookupArchivedMedia(jid, id);
    if (!hit) return res.status(404).json({ ok: false, error: 'That file is not in the archive.' });
    res.setHeader('Content-Type', hit.mimetype || 'application/octet-stream');
    res.setHeader('Content-Length', String(hit.size));
    res.setHeader('Content-Disposition', 'inline; filename="' + mediaSafe(hit.fileName) + '"');
    fs.createReadStream(hit.abs).on('error', () => { try { res.end(); } catch (e) { /* client gone */ } }).pipe(res);
  });

  // Copy one archived file to Google Drive — permanent, shareable, independent of this server.
  app.post(PREFIX + '/media/save', guard, express.json({ limit: '256kb' }), async (req, res) => {
    const jid = sstr((req.body || {}).jid, 120).trim();
    const id = sstr((req.body || {}).id, 90).trim();
    const hit = lookupArchivedMedia(jid, id);
    if (!hit) return res.status(404).json({ ok: false, error: 'That file is not in the archive yet.' });

    const conn = await gdrive.checkConnection();
    if (!conn.connected) return res.status(503).json({ ok: false, error: conn.reason || 'Google Drive is not connected' });
    if (gdrive.isMockMode && gdrive.isMockMode()) return res.status(503).json({ ok: false, error: 'Google Drive is in mock mode' });

    try {
      const root = await gdrive.getOrCreateRootFolder();
      const box = await gdrive.getOrCreateSubfolder(root, 'WhatsApp Media');
      const group = await gdrive.getOrCreateSubfolder(box || root, sstr(hit.group_name || jid.split('@')[0], 90).replace(/[\\/:*?"<>|]+/g, '_'));
      const month = await gdrive.getOrCreateSubfolder(group || box || root, new Date().toISOString().slice(0, 7));
      const uploaded = await gdrive.uploadFile(hit.abs, mediaSafe(hit.fileName), hit.mimetype || 'application/pdf', month || group || box || root);
      if (!uploaded || !uploaded.id || String(uploaded.id).startsWith('file_')) {
        return res.status(502).json({ ok: false, error: 'Drive returned no real file id' });
      }
      res.json({
        ok: true,
        file_id: uploaded.id,
        web_view_link: uploaded.webViewLink || ('https://drive.google.com/file/d/' + uploaded.id + '/view')
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: sstr(e.message || e, 160) });
    }
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
