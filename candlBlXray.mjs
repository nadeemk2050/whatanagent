// ============================================================================
// 🔬 BL X-Ray Checkup — every part of a Bill of Lading, field by field
// ============================================================================
// WHAT IT DOES
//   Takes one BL (a document the AI already holds in the media archive, or raw text), reads the
//   whole document into ~45 named fields, then checks the fields the owner cares about against
//   the details saved in the app: shipper, consignee, goods description, port of loading, port of
//   discharge, shipping agent, container numbers, seal number and the free days allowed.
//
// WHY A FIXED SCHEMA
//   About 99% of bills of lading carry the same parts in the same names. Naming them once means
//   the check is the same every time, the station can render them as a form, and adding a field
//   later is one line in XRAY_FIELDS instead of a new parser.
//
// ROUTES (under /candl/api/wa)
//   GET  /xray/schema            the field list, grouped, for the form
//   POST /xray                   run a checkup on { jid, message_id } or { text }
//   GET  /xray/rules             what the owner expects (free days, required fields)
//   POST /xray/rules             save those expectations
//
// HONESTY RULE
//   A value is only called WRONG when the app holds a different value to compare with. A field
//   we have nothing to compare against is reported as "no reference", never as a mistake - the
//   same rule the automatic BL checker follows.
// ============================================================================
import fs from 'fs';
import path from 'path';
import express from 'express';
import { createRequire } from 'module';
import { resolveDeepSeek } from './aiProviders.mjs';
import { recordAiCall } from './aiTracker.mjs';
import { cachedTokensFrom } from './promptCache.mjs';
import { lookupArchivedMedia, readReference, pdfToText } from './candlBlWatcher.mjs';
import { downloadWaWebMedia } from './waWebClient.js';

const require = createRequire(import.meta.url);

const PREFIX = '/candl/api/wa';
const DATA_DIR = process.env.CANDL_DATA_DIR || path.resolve(process.cwd(), 'data');
const RULES_FILE = path.join(DATA_DIR, 'candl-wa-xray-rules.json');
const AI_TIMEOUT_MS = 60000;
const MAX_TEXT_CHARS = 60000;

const sstr = (v, n = 400) => String(v == null ? '' : v).slice(0, n);

// ── the schema ──────────────────────────────────────────────────────────────
// [group, key, label]. Order here is the order the owner reads them on the form.
const XRAY_FIELDS = [
  ['document', 'bl_number', 'B/L number'],
  ['document', 'bl_type', 'Type (original / copy / seaway)'],
  ['document', 'issue_date', 'Date of issue'],
  ['document', 'place_of_issue', 'Place of issue'],
  ['document', 'originals_count', 'Number of originals'],
  ['document', 'booking_number', 'Booking number'],
  ['document', 'shipper_reference', 'Shipper reference'],
  ['document', 'invoice_number', 'Commercial invoice no.'],

  ['parties', 'shipper_name', 'Shipper'],
  ['parties', 'shipper_address', 'Shipper address'],
  ['parties', 'consignee_name', 'Consignee'],
  ['parties', 'consignee_address', 'Consignee address'],
  ['parties', 'notify_party', 'Notify party'],
  ['parties', 'notify_address', 'Notify address'],
  ['parties', 'carrier_name', 'Carrier'],
  ['parties', 'shipping_agent', 'Shipping agent'],
  ['parties', 'delivery_agent', 'Delivery agent'],

  ['routing', 'vessel_name', 'Vessel'],
  ['routing', 'voyage_number', 'Voyage no.'],
  ['routing', 'port_of_loading', 'Port of loading'],
  ['routing', 'port_of_discharge', 'Port of discharge'],
  ['routing', 'place_of_receipt', 'Place of receipt'],
  ['routing', 'place_of_delivery', 'Place of delivery'],
  ['routing', 'sailing_date', 'Sailing date (ETD)'],
  ['routing', 'arrival_date', 'Arrival date (ETA)'],

  ['cargo', 'container_numbers', 'Container numbers'],
  ['cargo', 'container_type', 'Container type / size'],
  ['cargo', 'seal_number', 'Seal number'],
  ['cargo', 'packages_count', 'No. of packages'],
  ['cargo', 'package_type', 'Kind of packages'],
  ['cargo', 'description_of_goods', 'Description of goods'],
  ['cargo', 'marks_and_numbers', 'Marks & numbers'],
  ['cargo', 'gross_weight', 'Gross weight'],
  ['cargo', 'net_weight', 'Net weight'],
  ['cargo', 'measurement', 'Measurement (CBM)'],
  ['cargo', 'hs_code', 'HS code'],

  ['terms', 'freight_terms', 'Freight terms'],
  ['terms', 'freight_amount', 'Freight amount'],
  ['terms', 'freight_payable_at', 'Freight payable at'],
  ['terms', 'bl_conditions', 'B/L conditions / remarks'],

  ['free', 'free_days', 'Free days allowed'],
  ['free', 'free_days_basis', 'Free days basis (port / line)'],
  ['free', 'demurrage_rate', 'Demurrage rate'],
  ['free', 'detention_free_days', 'Detention free days'],
  ['free', 'storage_free_days', 'Storage free days']
];

const GROUP_LABELS = {
  document: 'Document',
  parties: 'Parties',
  routing: 'Routing',
  cargo: 'Cargo',
  terms: 'Freight & terms',
  free: 'Free time / demurrage'
};

const FIELDS = XRAY_FIELDS.map(([group, key, label]) => ({ group, key, label }));
const FIELD_KEYS = FIELDS.map(f => f.key);
const FIELD_LABEL = FIELDS.reduce((m, f) => { m[f.key] = f.label; return m; }, {});

export function xraySchema() {
  const groups = [];
  for (const [group, key, label] of XRAY_FIELDS) {
    let g = groups.find(x => x.key === group);
    if (!g) { g = { key: group, label: GROUP_LABELS[group] || group, fields: [] }; groups.push(g); }
    g.fields.push({ key, label });
  }
  return groups;
}

// ── text helpers ────────────────────────────────────────────────────────────
const norm = (v) => String(v == null ? '' : v).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

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

/** ISO 6346 check digit (the 11th character). Returns null when the shape is wrong. */
export function iso6346CheckDigit(num) {
  const s = String(num || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z]{4}\d{7}$/.test(s)) return null;
  const values = { A: 10, B: 12, C: 13, D: 14, E: 15, F: 16, G: 17, H: 18, I: 19, J: 20, K: 21, L: 23, M: 24, N: 25, O: 26, P: 27, Q: 28, R: 29, S: 30, T: 31, U: 32, V: 34, W: 35, X: 36, Y: 37, Z: 38 };
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = s[i];
    const val = /\d/.test(ch) ? Number(ch) : values[ch];
    if (val == null) return null;
    sum += val * Math.pow(2, i);
  }
  const rem = sum % 11;
  return rem === 10 ? 0 : rem;
}

export function iso6346Valid(num) {
  const want = iso6346CheckDigit(num);
  if (want == null) return false;
  return want === Number(String(num).toUpperCase().replace(/[^A-Z0-9]/g, '')[10]);
}

// ── rules the owner sets (what "should be" means) ───────────────────────────
const readRules = () => {
  try {
    const obj = JSON.parse(fs.readFileSync(RULES_FILE, 'utf8'));
    return obj && typeof obj === 'object' ? obj : {};
  } catch (e) { return {}; }
};

function writeRules(v) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = RULES_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(v, null, 2));
    fs.renameSync(tmp, RULES_FILE);
  } catch (e) {
    console.warn('[BL-XRAY] could not save rules:', e.message);
  }
}

const asDays = (v) => {
  const n = Number(String(v == null ? '' : v).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** How many free days the owner expects for this BL, or null when no rule applies. */
function expectedFreeDays(fields, rules) {
  const byPort = rules.free_days_by_port || {};
  const byAgent = rules.free_days_by_agent || {};
  for (const port of [fields.port_of_discharge, fields.port_of_loading]) {
    const key = Object.keys(byPort).find(k => sameish(k, port));
    if (key) return { days: asDays(byPort[key]), source: 'port ' + key };
  }
  const agentKey = Object.keys(byAgent).find(k => sameish(k, fields.shipping_agent));
  if (agentKey) return { days: asDays(byAgent[agentKey]), source: 'agent ' + agentKey };
  return { days: asDays(rules.free_days_default), source: rules.free_days_default ? 'default' : '' };
}

// ── extraction ──────────────────────────────────────────────────────────────
const xrayPrompt = (text) => `You are a shipping document OCR expert. Read the Bill of Lading text below and return EVERY field you can find.

Return ONLY a JSON object (no markdown, no code fences, no commentary) with exactly these keys:
${FIELDS.map(f => '- "' + f.key + '": ' + f.label).join('\n')}

RULES
- Use "" (empty string) for anything the document does not contain. Never invent a value.
- "container_numbers" must be a JSON array of ISO 6346 numbers (4 letters + 7 digits), no spaces.
- "free_days", "detention_free_days", "storage_free_days": digits only, e.g. "14".
- Keep ports as printed, e.g. "JEBEL ALI, UAE".
- shipper_address / consignee_address: the full address block, not the company name again.
- description_of_goods: the goods description exactly as printed (all of it, not the first words).

TEXT:
---
${(text || '').slice(0, MAX_TEXT_CHARS)}
---`;

function parseJsonObject(raw) {
  if (!raw) return null;
  const text = String(raw).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch (e) { return null; }
}

async function extractWithAi(text, settings = {}) {
  const ds = resolveDeepSeek(settings);
  if (!ds.key) throw new Error('no AI key configured');

  const started = Date.now();
  const body = {
    model: ds.model,
    messages: [
      { role: 'system', content: 'You read bills of lading and return one JSON object with the requested keys. Empty string when a field is absent. Never invent values.' },
      { role: 'user', content: xrayPrompt(text) }
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
    max_tokens: 2000
  };
  if (/dashscope/i.test(ds.base)) body.enable_thinking = false;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
  let resp;
  let raw = '';
  try {
    resp = await fetch(ds.base.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ds.key },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    raw = await resp.text();
  } finally {
    clearTimeout(timer);
  }
  if (!resp.ok) throw new Error('AI ' + resp.status + ': ' + raw.slice(0, 200));

  let data = {};
  try { data = JSON.parse(raw); } catch (e) { data = {}; }
  const content = data?.choices?.[0]?.message?.content || '';
  recordAiCall({
    provider: 'deepseek',
    model: ds.model,
    area: 'Container BL X-Ray',
    isAutoFetch: false,
    prompt: text.slice(0, 2000),
    response: content.slice(0, 2000),
    tokensIn: data?.usage?.prompt_tokens || 0,
    tokensOut: data?.usage?.completion_tokens || 0,
    cachedTokens: cachedTokensFrom(data),
    durationMs: Date.now() - started
  });
  return parseJsonObject(content);
}

/** Regex pass — answers alone when there is no AI key, and fills AI gaps otherwise. */
export function extractXrayLocal(text) {
  const src = String(text || '').replace(/\r/g, '');
  const flat = src.replace(/\s+/g, ' ');
  const first = (res) => {
    for (const re of res) {
      const m = flat.match(re);
      if (m && m[1] && String(m[1]).trim()) return String(m[1]).replace(/[|_•·]+/g, ' ').replace(/\s+/g, ' ').trim();
    }
    return '';
  };
  const out = {};
  for (const k of FIELD_KEYS) out[k] = '';

  out.bl_number = first([
    /(?:B\/L\s*NO\.?|BL\s*NO\.?|BILL\s*OF\s*LADING\s*NO\.?)\s*[:.]?\s*([A-Z0-9][A-Z0-9\/\-]{4,25})/i,
    /(?:B\/L|BL|MBL|HBL)\s*[:.]?\s*([A-Z0-9][A-Z0-9\/\-]{4,25})/i
  ]);
  out.bl_type = first([/\b(SEAWAY\s*BILL|SEAWAY|ORIGINAL|SURRENDERED|COPY|DRAFT)\b/i]);
  out.issue_date = first([
    /(?:DATE\s*OF\s*ISSUE|ISSUED?\s*(?:ON|AT)?|DATED)\s*[:.]?\s*(\d{1,2}[\/.\- ]\s*[A-Za-z0-9]{1,9}[\/.\- ]\s*\d{2,4})/i,
    /(\d{1,2}[\/.\-][A-Za-z]{3}[\/.\-]\d{2,4})/
  ]);
  out.place_of_issue = first([/(?:PLACE\s*OF\s*ISSUE|ISSUED\s*AT)\s*[:.]?\s*([A-Z][A-Za-z ,.\-]{2,60})/i]);
  out.originals_count = first([/\(?\s*(THREE|TWO|ONE|3|2|1)\s*\)?\s*\(?\s*(?:3|2|1)\s*\)?\s*ORIGINAL/i, /(\d)\s*ORIGINAL\s*B\/?L/i]);
  out.booking_number = first([/(?:BOOKING\s*(?:NO|NUMBER|REF)?|BKG)\s*[:.]?\s*([A-Z0-9][A-Z0-9\-]{3,25})/i]);
  out.shipper_reference = first([/(?:SHIPPER\s*(?:REF|REFERENCE)|EXPORTER\s*REF)\s*[:.]?\s*([A-Z0-9][A-Z0-9\-]{3,25})/i]);
  out.invoice_number = first([/(?:COMMERCIAL\s*)?INVOICE\s*(?:NO|NUMBER)?\s*[:.]?\s*([A-Z0-9][A-Z0-9\-]{3,25})/i]);

  out.shipper_name = first([/(?:SHIPPER|EXPORTER)\s*(?:NAME)?\s*[:.]?\s*([A-Z][A-Za-z0-9 .,&()'\/\-]{3,90})/i]);
  out.consignee_name = first([/(?:CONSIGNEE|IMPORTER)\s*(?:NAME)?\s*[:.]?\s*([A-Z][A-Za-z0-9 .,&()'\/\-]{3,90})/i]);
  out.notify_party = first([/(?:NOTIFY\s*PARTY|NOTIFY)\s*(?:NAME)?\s*[:.]?\s*([A-Z][A-Za-z0-9 .,&()'\/\-]{3,90})/i]);
  out.carrier_name = first([/(?:CARRIER|OCEAN\s*CARRIER)\s*[:.]?\s*([A-Z][A-Za-z0-9 .,&()'\/\-]{3,70})/i]);
  out.shipping_agent = first([/(?:SHIPPING\s*AGENT|DESTINATION\s*AGENT|AGENT)\s*[:.]?\s*([A-Z][A-Za-z0-9 .,&()'\/\-]{3,70})/i]);
  out.delivery_agent = first([/(?:DELIVERY\s*AGENT)\s*[:.]?\s*([A-Z][A-Za-z0-9 .,&()'\/\-]{3,70})/i]);

  out.vessel_name = first([
    /(?:OCEAN\s*VESSEL|VESSEL\s*\/\s*VOYAGE|VESSEL\s*NAME|VESSEL|M\.?V\.?)\s*[:.]?\s*([A-Z][A-Z0-9 \-.]{2,45})/i
  ]);
  out.voyage_number = first([/(?:VOYAGE\s*(?:NO|NUMBER)?|VOY\.?)\s*[:.]?\s*([A-Z0-9\-]{2,15})/i]);
  out.port_of_loading = first([
    /(?:PORT\s*OF\s*LOADING|LOADING\s*PORT|PORT\s*OF\s*LOAD|POL)\s*[:.]?\s*([A-Z][A-Za-z .,\-]{2,60})/i
  ]);
  out.port_of_discharge = first([
    /(?:PORT\s*OF\s*DISCHARGE|DISCHARGE\s*PORT|PORT\s*OF\s*DISCHARGE|POD|DESTINATION)\s*[:.]?\s*([A-Z][A-Za-z .,\-]{2,60})/i
  ]);
  out.place_of_receipt = first([/(?:PLACE\s*OF\s*RECEIPT|RECEIVED\s*AT)\s*[:.]?\s*([A-Z][A-Za-z .,\-]{2,60})/i]);
  out.place_of_delivery = first([/(?:PLACE\s*OF\s*DELIVERY|DELIVERED\s*AT)\s*[:.]?\s*([A-Z][A-Za-z .,\-]{2,60})/i]);
  out.sailing_date = first([/(?:ETD|SAILING\s*DATE|LADEN\s*ON\s*BOARD|ON\s*BOARD)\s*[:.]?\s*(\d{1,2}[\/.\- ]\s*[A-Za-z0-9]{1,9}[\/.\- ]\s*\d{2,4})/i]);
  out.arrival_date = first([/(?:ETA|ARRIVAL\s*DATE|ESTIMATED\s*ARRIVAL)\s*[:.]?\s*(\d{1,2}[\/.\- ]\s*[A-Za-z0-9]{1,9}[\/.\- ]\s*\d{2,4})/i]);

  const containers = (src.match(/\b[A-Z]{4}\d{7}\b/g) || []).map(c => c.toUpperCase());
  out.container_numbers = [...new Set(containers)];
  out.container_type = first([/\b(20\s*['’]?\s*(?:FT|DV|GP|HC|RF)|40\s*['’]?\s*(?:FT|DV|GP|HC|RF|HQ)|45\s*['’]?\s*(?:FT|HC))\b/i]);
  out.seal_number = first([
    /\b[A-Z]{4}\d{7}\s*\/\s*([A-Z0-9]{4,20})\b/i,
    /(?:SEAL\s*(?:NO|NUMBER|#)?)\s*[:.]?\s*([A-Z0-9]{4,20})/i
  ]);
  out.packages_count = first([/(?:NO\.?\s*OF\s*PACKAGES|NUMBER\s*OF\s*PACKAGES|TOTAL\s*PACKAGES)\s*[:.]?\s*([\d,]+)/i]);
  out.package_type = first([/\b(\d[\d,]*\s*(?:CARTONS?|BAGS?|BALES?|PALLETS?|CRATES?|BOXES?|DRUMS?|ROLLS?|PCS|PIECES))\b/i]);
  out.description_of_goods = first([
    /(?:DESCRIPTION\s*OF\s*GOODS|DESCRIPTION|COMMODITY|GOODS)\s*[:.]?\s*([A-Za-z0-9][^\n]{3,200})/i
  ]);
  out.marks_and_numbers = first([/(?:MARKS?\s*(?:AND|&)?\s*NUMBERS?|SHIPPING\s*MARKS)\s*[:.]?\s*([A-Za-z0-9][^\n]{1,120})/i]);
  out.gross_weight = first([/(?:GROSS\s*WEIGHT|G\.?W\.?|GROSS\s*WT)\s*[:.]?\s*([\d.,]+\s*(?:KGS?|KILOS?|MT|TONS?)?)/i]);
  out.net_weight = first([/(?:NET\s*WEIGHT|N\.?W\.?|NET\s*WT)\s*[:.]?\s*([\d.,]+\s*(?:KGS?|KILOS?|MT|TONS?)?)/i]);
  out.measurement = first([/(?:MEASUREMENT|VOLUME|CBM|M3)\s*[:.]?\s*([\d.,]+\s*(?:CBM|M3|M³)?)/i]);
  out.hs_code = first([/(?:HS\s*CODE|H\.?S\.?\s*NO)\s*[:.]?\s*([\d]{4,12})/i]);

  out.freight_terms = first([/\b(FREIGHT\s*PREPAID|FREIGHT\s*COLLECT|PREPAID|COLLECT)\b/i]);
  out.freight_amount = first([/(?:FREIGHT\s*(?:AMOUNT|CHARGES?)|OCEAN\s*FREIGHT)\s*[:.]?\s*(?:USD|US\$|\$)?\s*([\d.,]+)/i]);
  out.freight_payable_at = first([/(?:FREIGHT\s*PAYABLE\s*AT|PAYABLE\s*AT)\s*[:.]?\s*([A-Z][A-Za-z .,\-]{2,60})/i]);
  out.bl_conditions = first([/(?:REMARKS?|CONDITIONS?|CLAUSES?)\s*[:.]?\s*([A-Za-z0-9][^\n]{3,200})/i]);

  out.free_days = first([
    /(?:FREE\s*(?:TIME|DAYS|PERIOD)|STORAGE\s*FREE|DEMURRAGE\s*FREE)\s*[^0-9]{0,40}?(\d{1,3})\s*DAYS?/i,
    /(\d{1,3})\s*DAYS?\s*(?:FREE|FREE\s*TIME)/i
  ]).replace(/[^0-9]/g, '');
  out.detention_free_days = first([
    /DETENTION\s*(?:FREE|TIME)?\s*[^0-9]{0,30}?(\d{1,3})\s*DAYS?/i
  ]).replace(/[^0-9]/g, '');
  out.storage_free_days = first([
    /STORAGE\s*(?:FREE|TIME)?\s*[^0-9]{0,30}?(\d{1,3})\s*DAYS?/i
  ]).replace(/[^0-9]/g, '');
  out.demurrage_rate = first([/DEMURRAGE\s*(?:RATE)?\s*[:.]?\s*(?:USD|US\$|\$)?\s*([\d.,]+\s*(?:PER\s*DAY|DAY)?)/i]);
  out.free_days_basis = first([/(?:FREE\s*TIME\s*(?:AT|BASIS))\s*[:.]?\s*([A-Z][A-Za-z .,\-]{2,60})/i]);

  return out;
}

/** AI first, local regex for anything the AI left empty. */
export async function extractXray(text, settings = {}) {
  const local = extractXrayLocal(text);
  let ai = null;
  let source = 'local';
  try {
    ai = await extractWithAi(text, settings);
    if (ai && typeof ai === 'object') source = 'ai';
  } catch (e) {
    console.warn('[BL-XRAY] AI read failed, using the local parser:', sstr(e.message || e, 160));
  }

  const fields = {};
  for (const key of FIELD_KEYS) {
    let v = ai ? ai[key] : '';
    if (Array.isArray(v)) v = v.map(x => String(x).trim().toUpperCase()).filter(Boolean);
    else v = String(v == null ? '' : v).trim();

    const hasAi = Array.isArray(v) ? v.length > 0 : !!v;
    const lv = local[key];
    const hasLocal = Array.isArray(lv) ? lv.length > 0 : !!lv;

    if (!hasAi && hasLocal) v = lv;
    if (key === 'container_numbers') {
      const list = Array.isArray(v) ? v : String(v).split(/[\s,;]+/).filter(Boolean);
      v = [...new Set(list.map(c => String(c).toUpperCase().replace(/[^A-Z0-9]/g, '')).filter(Boolean))];
      if (!v.length && Array.isArray(lv)) v = lv;
    }
    fields[key] = v;
  }
  return { source, fields };
}

// ── the checks the owner asked for ──────────────────────────────────────────
const CHECK_STATUS_LABEL = {
  ok: 'OK',
  mismatch: 'DIFFERS',
  missing: 'MISSING',
  invalid: 'INVALID',
  unknown: 'NO REFERENCE'
};

function pushCheck(out, key, label, status, got, expected, note) {
  out.push({
    key, label, status,
    status_label: CHECK_STATUS_LABEL[status] || status,
    got: sstr(got, 300),
    expected: sstr(expected, 300),
    note: sstr(note, 240)
  });
}

/**
 * Compare the x-ray fields with the app's saved details.
 * A 'mismatch' means the app knows a different value. Differences we cannot verify are 'unknown'.
 */
export function checkXray(fields, reference, rules) {
  const ref = reference || {};
  const drafts = Array.isArray(ref.drafts) ? ref.drafts : [];
  const masters = Array.isArray(ref.masters) ? ref.masters : [];
  const byCategory = (cat) => masters.filter(m => m && m.category === cat && m.name);
  const draft = drafts.find(d => d && d.bl_number && sameish(d.bl_number, fields.bl_number));
  const checks = [];

  // 1. The parties and places the owner asked for, against drafts first then masters.
  const compare = (key, label, categories, draftKey) => {
    const got = String(fields[key] == null ? '' : fields[key]).trim();
    const fromDraft = draft && draftKey ? String(draft[draftKey] || '').trim() : '';
    if (!got) { pushCheck(checks, key, label, 'missing', '', fromDraft, 'not written on the BL'); return; }
    if (fromDraft) {
      if (sameish(fromDraft, got)) pushCheck(checks, key, label, 'ok', got, fromDraft, 'matches the BL draft in the app');
      else pushCheck(checks, key, label, 'mismatch', got, fromDraft, 'differs from the BL draft in the app');
      return;
    }
    for (const cat of categories) {
      const list = byCategory(cat);
      if (!list.length) continue;
      const hit = list.find(m => sameish(m.name, got));
      if (hit) pushCheck(checks, key, label, 'ok', got, hit.name, 'found in your saved ' + cat.replace(/_/g, ' ') + ' list');
      else pushCheck(checks, key, label, 'unknown', got, '', 'not in your saved ' + cat.replace(/_/g, ' ') + ' list');
      return;
    }
    pushCheck(checks, key, label, 'unknown', got, '', 'nothing saved in the app to compare with');
  };

  compare('shipper_name', 'Shipper', ['shipper'], 'shipper_name');
  compare('consignee_name', 'Consignee', ['consignee'], 'consignee_name');
  compare('description_of_goods', 'Item description', ['item_description'], null);
  compare('port_of_loading', 'Port of loading', ['port_of_loading'], 'port_of_loading');
  compare('port_of_discharge', 'Port of discharge', ['port_of_discharge', 'port_of_destination'], null);
  compare('shipping_agent', 'Shipping agent', ['shipping_agent'], 'shipping_agent');
  compare('vessel_name', 'Vessel', [], 'vessel_name');

  // 2. Container numbers: shape and check digit first — a wrong check digit is always a real error.
  const containers = Array.isArray(fields.container_numbers) ? fields.container_numbers : [];
  if (!containers.length) {
    pushCheck(checks, 'container_numbers', 'Container numbers', 'missing', '', '', 'no ISO container number found on the BL');
  } else {
    const bad = containers.filter(c => !iso6346Valid(c));
    const known = new Set();
    for (const d of drafts) {
      for (const c of (d.container_numbers || [])) known.add(norm(c));
      if (d.container_numbers_text) String(d.container_numbers_text).split(/[,\s]+/).forEach(c => c && known.add(norm(c)));
    }
    if (bad.length) {
      pushCheck(checks, 'container_numbers', 'Container numbers', 'invalid', bad.join(', '), '',
        'check digit does not match — the number is mistyped on the BL');
    } else if (known.size) {
      const extra = containers.filter(c => !known.has(norm(c)));
      if (extra.length) pushCheck(checks, 'container_numbers', 'Container numbers', 'unknown', extra.join(', '), '', 'not in your saved BL / P.I. records');
      else pushCheck(checks, 'container_numbers', 'Container numbers', 'ok', containers.join(', '), containers.join(', '), 'all valid and already saved');
    } else {
      pushCheck(checks, 'container_numbers', 'Container numbers', 'unknown', containers.join(', '), '', 'check digits are valid; nothing saved to compare with');
    }
  }

  // 3. Seal number: the owner wants to know whether one is written at all.
  const seal = String(fields.seal_number || '').trim();
  if (seal) pushCheck(checks, 'seal_number', 'Seal number', 'ok', seal, '', 'written on the BL');
  else pushCheck(checks, 'seal_number', 'Seal number', 'missing', '', '', 'no seal number on the BL');

  // 4. Free days: what the BL grants vs what the owner expects.
  const gotFree = asDays(fields.free_days);
  const want = expectedFreeDays(fields, rules || {});
  if (!gotFree && !want.days) {
    pushCheck(checks, 'free_days', 'Free days', 'unknown', '', '', 'neither the BL nor your rules state the free days');
  } else if (!gotFree) {
    pushCheck(checks, 'free_days', 'Free days', 'missing', '', want.days + ' days (' + want.source + ')', 'the BL does not state the free days');
  } else if (!want.days) {
    pushCheck(checks, 'free_days', 'Free days', 'unknown', gotFree + ' days', '', 'set what you expect in the X-Ray rules to compare');
  } else if (gotFree === want.days) {
    pushCheck(checks, 'free_days', 'Free days', 'ok', gotFree + ' days', want.days + ' days', 'matches your rule (' + want.source + ')');
  } else if (gotFree < want.days) {
    pushCheck(checks, 'free_days', 'Free days', 'mismatch', gotFree + ' days', want.days + ' days',
      'short by ' + (want.days - gotFree) + ' day(s) against your rule (' + want.source + ')');
  } else {
    pushCheck(checks, 'free_days', 'Free days', 'ok', gotFree + ' days', want.days + ' days',
      'more than your rule requires (' + want.source + ')');
  }

  // 5. Plain presence checks — the fields a BL is not valid without.
  const presence = [
    ['bl_number', 'B/L number'],
    ['issue_date', 'Date of issue'],
    ['originals_count', 'Number of originals'],
    ['notify_party', 'Notify party'],
    ['port_of_discharge', 'Port of discharge'],
    ['gross_weight', 'Gross weight'],
    ['freight_terms', 'Freight terms']
  ];
  for (const [key, label] of presence) {
    if (checks.some(c => c.key === key)) continue;   // already judged above
    const v = String(fields[key] == null ? '' : fields[key]).trim();
    if (v) pushCheck(checks, key, label, 'ok', v, '', 'written on the BL');
    else pushCheck(checks, key, label, 'missing', '', '', 'not written on the BL');
  }

  const summary = { ok: 0, mismatch: 0, missing: 0, invalid: 0, unknown: 0 };
  for (const c of checks) summary[c.status] = (summary[c.status] || 0) + 1;

  return { checks, summary, mastered_with: draft ? draft.bl_number : '' };
}

// ── routes ──────────────────────────────────────────────────────────────────
export function registerCandlXrayRoutes(app) {
  const expectedKey = String(process.env.CANDL_WA_KEY || '').trim();
  const guard = (req, res, next) => {
    if (!expectedKey) return next();
    const given = String(req.headers['x-candl-key'] || req.query.key || '').trim();
    if (given !== expectedKey) return res.status(401).json({ ok: false, error: 'Bad CANDL_WA_KEY' });
    return next();
  };

  app.get(PREFIX + '/xray/schema', guard, (req, res) => {
    res.json({ ok: true, groups: xraySchema(), total: FIELDS.length });
  });

  app.get(PREFIX + '/xray/rules', guard, (req, res) => {
    const rules = readRules();
    res.json({
      ok: true,
      free_days_default: rules.free_days_default || null,
      free_days_by_port: rules.free_days_by_port || {},
      free_days_by_agent: rules.free_days_by_agent || {}
    });
  });

  app.post(PREFIX + '/xray/rules', guard, express.json({ limit: '256kb' }), (req, res) => {
    const body = req.body || {};
    const days = asDays(body.free_days_default);
    const cleanMap = (obj, cap) => {
      const out = {};
      if (!obj || typeof obj !== 'object') return out;
      const keys = Object.keys(obj).slice(0, cap);
      for (const k of keys) {
        const n = asDays(obj[k]);
        const name = sstr(k, 90).trim();
        if (name && n) out[name] = n;
      }
      return out;
    };
    const rules = {
      free_days_default: days,
      free_days_by_port: cleanMap(body.free_days_by_port, 200),
      free_days_by_agent: cleanMap(body.free_days_by_agent, 200),
      updatedAt: Date.now()
    };
    writeRules(rules);
    res.json({ ok: true, rules });
  });

  app.post(PREFIX + '/xray', guard, express.json({ limit: '1mb' }), async (req, res) => {
    const body = req.body || {};
    const jid = sstr(body.jid, 120).trim();
    const messageId = sstr(body.message_id, 90).trim();
    const pastedText = String(body.text || '').slice(0, MAX_TEXT_CHARS);

    let buffer = null;
    let fileName = sstr(body.file_name, 160) || 'pasted text';
    let mediaSource = '';

    if (pastedText.trim()) {
      mediaSource = 'pasted';
    } else {
      if (!jid || !messageId) return res.status(400).json({ ok: false, error: 'Pass { jid, message_id } or { text }.' });
      const archived = lookupArchivedMedia(jid, messageId);
      if (archived) {
        try { buffer = fs.readFileSync(archived.abs); fileName = archived.fileName; mediaSource = 'archive'; }
        catch (e) { buffer = null; }
      }
      if (!buffer) {
        try {
          const media = await downloadWaWebMedia(jid, messageId);
          buffer = media.buffer;
          fileName = media.fileName || fileName;
          mediaSource = 'whatsapp';
        } catch (e) {
          return res.status(409).json({
            ok: false,
            error: 'That file is not in the archive and WhatsApp no longer serves it. Forward it into the group once.'
          });
        }
      }
    }

    let text = pastedText;
    if (!text.trim()) {
      try { text = await pdfToText(buffer); }
      catch (e) { return res.status(422).json({ ok: false, error: 'The PDF has no readable text (probably a scan).' }); }
    }
    if (!String(text || '').trim()) {
      return res.status(422).json({ ok: false, error: 'The document produced no text to read.' });
    }

    const settings = (body.settings && typeof body.settings === 'object') ? body.settings : {};
    const { source, fields } = await extractXray(text, settings);
    const result = checkXray(fields, readReference(), readRules());

    const groups = xraySchema().map(g => ({
      key: g.key,
      label: g.label,
      fields: g.fields.map(f => {
        const v = fields[f.key];
        return { key: f.key, label: f.label, value: Array.isArray(v) ? v.join(', ') : String(v == null ? '' : v) };
      })
    }));

    res.json({
      ok: true,
      jid,
      message_id: messageId,
      file_name: fileName,
      media_source: mediaSource,
      extraction_source: source,
      groups,
      checks: result.checks,
      summary: result.summary,
      compared_with_bl: result.mastered_with,
      rules: { free_days_default: readRules().free_days_default || null }
    });
  });

  console.log('[BL-XRAY] 🔬 BL X-Ray routes ready at ' + PREFIX + '/xray');
}
