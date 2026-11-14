// ============================================================================
// 🧠 BUSINESS DATA TANK — everything about OUR business, ready for AI staff
// ============================================================================
// The owner fills structured sections (company, activities, products, raw materials,
// terms, logistics, sales playbook …) and uploads documents (price lists, catalogues,
// PDFs, Excel, Word, images). Documents are read into text and condensed by AI.
//
// Staff whose card has `useBusinessTank` get a compact, budgeted copy of this knowledge
// in their system prompt, so they answer from real business facts instead of guessing.
//
// Storage (Firestore, collection `businessTank`): one doc per section (`sec_<id>`) plus
// `main` (file list, AI digest, timestamps). Raw file text lives in `businessTankFiles`
// so the main read stays small. Everything is cached in memory: prompts read it
// synchronously and never wait on Firestore.
// ============================================================================
import { doc, getDoc, getDocs, setDoc, deleteDoc, collection } from 'firebase/firestore';
import zlib from 'zlib';

const COL = 'businessTank';
const FILES = 'businessTankFiles';
const sstr = (v, n = 300) => String(v == null ? '' : v).slice(0, n);

// --------------------------------------------------------------------------- schema
const T = (k, label, ph) => ({ k, label, type: 'text', ph: ph || '' });
const A = (k, label, ph) => ({ k, label, type: 'area', ph: ph || '' });
const S = (k, label, opts) => ({ k, label, type: 'select', opts });

export const SECTIONS = [
  {
    id: 'company', icon: '🏢', title: 'Company profile',
    hint: 'Who we are. Staff use this to introduce the company correctly.',
    fields: [
      T('legalName', 'Legal name'), T('tradeName', 'Trade / brand name'), T('tagline', 'Tagline / one-line pitch'),
      S('businessType', 'Business type', ['', 'Trading', 'Manufacturing', 'Trading + Manufacturing', 'Recycling / Scrap', 'Services', 'Retail', 'Other']),
      T('established', 'Established (year)'), T('owner', 'Owner / managing director'),
      T('licence', 'Trade licence no.'), T('taxId', 'VAT / TRN / tax ID'),
      T('address', 'Head-office address'), T('branches', 'Branches / warehouses / yards'),
      T('website', 'Website'), T('email', 'Official email'), T('phone', 'Official phone / WhatsApp'),
      T('hours', 'Working days & hours', 'e.g. Sat–Thu 8:00–18:00 Dubai time'), T('languages', 'Languages we serve in'),
      A('about', 'About the company (long description)', 'History, size, reputation, what makes us trusted…')
    ]
  },
  {
    id: 'activities', icon: '⚙️', title: 'Business activities',
    hint: 'What we actually do day to day.',
    fields: [
      A('mainActivities', 'Main activities', 'Buy, sell, process, export, import…'),
      A('services', 'Services offered'),
      A('industries', 'Industries we serve'), A('markets', 'Markets / countries we sell to'),
      A('capacity', 'Capacity & monthly volumes', 'e.g. 500 MT/month copper, 20 containers/month'),
      A('process', 'How an order works (enquiry → delivery)', 'Step by step: enquiry, quotation, inspection, payment, loading, documents…'),
      A('strengths', 'Strengths / why customers choose us'), A('certifications', 'Certifications, licences, memberships')
    ]
  },
  {
    id: 'products', icon: '📦', title: 'Products', kind: 'table', max: 300,
    hint: 'Everything we sell. One row per product / grade.',
    cols: [
      { k: 'name', label: 'Product', w: 170 }, { k: 'category', label: 'Category', w: 120 },
      { k: 'spec', label: 'Grade / specification', w: 170 }, { k: 'origin', label: 'Origin', w: 100 },
      { k: 'packing', label: 'Packing', w: 110 }, { k: 'unit', label: 'Unit', w: 70 },
      { k: 'price', label: 'Price', w: 90 }, { k: 'currency', label: 'Cur.', w: 60 },
      { k: 'moq', label: 'MOQ', w: 90 }, { k: 'stock', label: 'Stock / availability', w: 130 },
      { k: 'notes', label: 'Notes', w: 220, max: 400 }
    ]
  },
  {
    id: 'rawmaterials', icon: '🧱', title: 'Raw materials', kind: 'table', max: 300,
    hint: 'What we buy or use to make our products.',
    cols: [
      { k: 'name', label: 'Material', w: 170 }, { k: 'spec', label: 'Grade / specification', w: 170 },
      { k: 'source', label: 'Source / supplier', w: 150 }, { k: 'unit', label: 'Unit', w: 70 },
      { k: 'price', label: 'Buy price', w: 90 }, { k: 'currency', label: 'Cur.', w: 60 },
      { k: 'moq', label: 'MOQ', w: 90 }, { k: 'leadTime', label: 'Lead time', w: 100 },
      { k: 'notes', label: 'Notes', w: 220, max: 400 }
    ]
  },
  {
    id: 'suppliers', icon: '🚚', title: 'Suppliers', kind: 'table', max: 150,
    hint: 'Who supplies us.',
    cols: [
      { k: 'name', label: 'Supplier', w: 170 }, { k: 'country', label: 'Country', w: 110 },
      { k: 'supplies', label: 'Supplies', w: 200 }, { k: 'terms', label: 'Payment / terms', w: 160 },
      { k: 'contact', label: 'Contact person', w: 140 }, { k: 'notes', label: 'Notes', w: 220, max: 400 }
    ]
  },
  {
    id: 'customers', icon: '🤝', title: 'Customers & markets',
    hint: 'Who buys from us and who we want.',
    fields: [
      A('typical', 'Typical customers', 'Smelters, traders, factories, contractors…'),
      A('target', 'Ideal / target customers'), A('countries', 'Main countries'),
      A('topCustomers', 'Key customers (names allowed to be mentioned)'),
      A('avoid', 'Customers / countries we do NOT serve')
    ]
  },
  {
    id: 'commercial', icon: '💰', title: 'Pricing & terms',
    hint: 'How we price and get paid. Staff quote ONLY what is written here.',
    fields: [
      A('pricingPolicy', 'Pricing policy', 'LME-linked, fixed, per container…'),
      T('priceValidity', 'Quotation validity', 'e.g. 24 hours'), A('discounts', 'Discounts / volume rules'),
      T('incoterms', 'Incoterms offered', 'FOB, CIF, EXW…'), A('paymentTerms', 'Payment terms', 'TT in advance, LC at sight, 30% advance…'),
      T('currencies', 'Currencies accepted'), A('quotationProcess', 'How we prepare a quotation'),
      A('creditPolicy', 'Credit policy'), A('mustApprove', 'Always ask the owner before…', 'Custom prices, credit, discounts above X%…')
    ]
  },
  {
    id: 'logistics', icon: '🚢', title: 'Shipping & logistics',
    hint: 'How goods move.',
    fields: [
      A('modes', 'Shipping modes'), A('ports', 'Ports / loading locations'),
      A('deliveryTimes', 'Typical delivery times'), A('packingDetails', 'Packing & containers'),
      A('inspection', 'Inspection & quality checks'), A('documents', 'Documents we provide', 'Invoice, packing list, COO, BL, assay…'),
      A('insurance', 'Insurance & risk')
    ]
  },
  {
    id: 'policies', icon: '📜', title: 'Policies & quality',
    hint: 'Rules the business stands behind.',
    fields: [
      A('quality', 'Quality standards'), A('claims', 'Claims, returns, disputes'),
      A('warranty', 'Guarantees / warranty'), A('compliance', 'Compliance & KYC'),
      A('confidentiality', 'Confidentiality rules')
    ]
  },
  {
    id: 'playbook', icon: '🎯', title: 'Sales playbook',
    hint: 'How the owner wants enquiries handled.',
    fields: [
      A('qualifying', 'Questions to ask every new enquiry', 'Product, quantity, destination, timeline, payment method…'),
      A('objections', 'Common objections and how to answer'), A('upsell', 'Cross-sell / upsell ideas'),
      A('neverPromise', 'Never promise'), A('escalate', 'Hand over to the owner when'),
      A('customerTone', 'Tone with customers')
    ]
  },
  {
    id: 'faq', icon: '❓', title: 'FAQ', kind: 'table', max: 150,
    hint: 'Questions customers ask again and again, with the answer you want given.',
    cols: [{ k: 'q', label: 'Question', w: 300 }, { k: 'a', label: 'Answer', w: 520, max: 800 }]
  },
  {
    id: 'competitors', icon: '🥊', title: 'Competitors & market', kind: 'table', max: 80,
    hint: 'Who else is in the market.',
    cols: [
      { k: 'name', label: 'Competitor', w: 170 }, { k: 'strengths', label: 'Their strengths', w: 220 },
      { k: 'weak', label: 'Their weak points', w: 220 }, { k: 'notes', label: 'Notes', w: 220, max: 400 }
    ]
  },
  {
    id: 'contacts', icon: '👥', title: 'Internal contacts', kind: 'table', max: 80,
    hint: 'Who handles what inside the company. Staff use it to route work; they never give these numbers to customers.',
    cols: [
      { k: 'name', label: 'Name', w: 150 }, { k: 'role', label: 'Role', w: 150 },
      { k: 'handles', label: 'Handles', w: 240 }, { k: 'phone', label: 'Phone', w: 130 }, { k: 'email', label: 'Email', w: 170 }
    ]
  },
  {
    id: 'extra', icon: '🗒️', title: 'Anything else',
    hint: 'Any other facts staff should know.',
    fields: [A('notes', 'Notes', 'Seasonal patterns, upcoming plans, special instructions…')]
  }
];
const SECTION_BY_ID = new Map(SECTIONS.map(s => [s.id, s]));
const isTable = (s) => s.kind === 'table';

// --------------------------------------------------------------------------- storage
let store = null;
const firestoreStore = (db) => ({
  async get(col, id) { const s = await getDoc(doc(db, col, id)); return s.exists() ? s.data() : null; },
  async set(col, id, obj) { await setDoc(doc(db, col, id), obj); },
  async del(col, id) { await deleteDoc(doc(db, col, id)); },
  async list(col) { const s = await getDocs(collection(db, col)); const out = []; s.forEach(d => out.push({ id: d.id, ...d.data() })); return out; }
});
let tankDb = null;
export function attachBusinessDb(db) {
  if (!db) return;
  tankDb = db;
  store = firestoreStore(db);
  load(true).catch(e => console.warn('[TANK] warm-up failed:', e.message));
}
// Tests inject an in-memory store.
export function __useStore(s) { store = s; state = null; promptCache = ''; }

// --------------------------------------------------------------------------- state + cache
const TTL_MS = 5 * 60 * 1000;
let state = null;          // { at, data:{sectionId: obj|rows[]}, files:[meta], digest, updatedAt }
let promptCache = '';
let loading = null;

const emptyState = () => ({ at: Date.now(), data: {}, files: [], digest: null, updatedAt: 0 });

async function load(force = false) {
  if (!store) return emptyState();
  if (!force && state && (Date.now() - state.at) < TTL_MS) return state;
  if (loading) return loading;
  loading = (async () => {
    try {
      const docs = await store.list(COL);
      const next = emptyState();
      for (const d of docs) {
        if (d.id === 'main') {
          next.files = Array.isArray(d.files) ? d.files : [];
          next.digest = d.digest || null;
          next.updatedAt = Number(d.updatedAt) || 0;
        } else if (d.id.startsWith('sec_')) {
          const id = d.id.slice(4);
          const sec = SECTION_BY_ID.get(id);
          if (!sec) continue;
          next.data[id] = isTable(sec) ? (Array.isArray(d.rows) ? d.rows : []) : (d.values || {});
          next.updatedAt = Math.max(next.updatedAt, Number(d.updatedAt) || 0);
        }
      }
      state = next;
      promptCache = compileText(state);
      return state;
    } finally { loading = null; }
  })();
  return loading;
}

export async function getState({ fresh = false } = {}) { return load(fresh); }

// Synchronous for prompt builders. Triggers a background refresh when stale.
export function tankPromptText() {
  if (!state || (Date.now() - state.at) > TTL_MS) load(true).catch(() => {});
  return promptCache;
}

async function saveMain() {
  const s = state;
  await store.set(COL, 'main', {
    files: s.files, digest: s.digest || null, updatedAt: s.updatedAt || Date.now()
  });
}

// --------------------------------------------------------------------------- sanitising
export function sanitizeSection(sec, value) {
  if (isTable(sec)) {
    const rows = Array.isArray(value) ? value : [];
    const out = [];
    for (const r of rows.slice(0, sec.max || 200)) {
      if (!r || typeof r !== 'object') continue;
      const row = {};
      let any = false;
      for (const c of sec.cols) {
        const v = sstr(r[c.k], c.max || 200).trim();
        row[c.k] = v;
        if (v) any = true;
      }
      if (any) out.push(row);
    }
    return out;
  }
  const out = {};
  const src = value && typeof value === 'object' ? value : {};
  for (const f of sec.fields) {
    let v = sstr(src[f.k], f.type === 'area' ? 4000 : 300).trim();
    if (f.type === 'select' && f.opts && !f.opts.includes(v)) v = '';
    out[f.k] = v;
  }
  return out;
}

export async function saveSection(id, value) {
  const sec = SECTION_BY_ID.get(id);
  if (!sec) throw new Error('Unknown section');
  if (!store) throw new Error('Storage unavailable');
  await load();
  const clean = sanitizeSection(sec, value);
  const now = Date.now();
  await store.set(COL, 'sec_' + id, isTable(sec) ? { rows: clean, updatedAt: now } : { values: clean, updatedAt: now });
  state.data[id] = clean;
  state.updatedAt = now;
  state.at = Date.now();
  await saveMain();
  promptCache = compileText(state);
  return { updatedAt: now, pct: sectionPct(sec, clean) };
}

// --------------------------------------------------------------------------- completeness
function sectionPct(sec, v) {
  if (isTable(sec)) return Math.min(100, Math.round(((Array.isArray(v) ? v.length : 0) / 5) * 100));
  const vals = v || {};
  const total = sec.fields.length;
  const filled = sec.fields.filter(f => String(vals[f.k] || '').trim()).length;
  return total ? Math.round((filled / total) * 100) : 0;
}
export function completeness(st) {
  const per = {};
  let sum = 0;
  for (const s of SECTIONS) { per[s.id] = sectionPct(s, st.data[s.id]); sum += per[s.id]; }
  return { per, overall: Math.round(sum / SECTIONS.length) };
}

// --------------------------------------------------------------------------- compile → prompt text
function sectionText(sec, v) {
  if (isTable(sec)) {
    const rows = Array.isArray(v) ? v : [];
    if (!rows.length) return '';
    if (sec.id === 'faq') return rows.map(r => 'Q: ' + r.q + '\nA: ' + r.a).join('\n');
    return rows.map(r => '- ' + sec.cols.map(c => r[c.k]).filter(Boolean).join(' | ')).join('\n');
  }
  const vals = v || {};
  return sec.fields.filter(f => String(vals[f.k] || '').trim())
    .map(f => f.label + ': ' + String(vals[f.k]).trim()).join('\n');
}

export function digestText(d) {
  if (!d) return '';
  const lines = [];
  if (d.summary) lines.push(d.summary);
  const list = (title, arr) => { if (Array.isArray(arr) && arr.length) lines.push(title + ':\n' + arr.map(x => '- ' + x).join('\n')); };
  list('Key facts', d.keyFacts);
  list('Pricing rules', d.pricingRules);
  return lines.join('\n');
}

export function compileText(st, budget = Number(process.env.TANK_PROMPT_BUDGET) || 9000) {
  if (!st) return '';
  let out = '';
  const add = (title, body) => {
    if (!body) return;
    const chunk = '\n[' + title + ']\n' + body + '\n';
    const room = budget - out.length;
    if (room < 250) return;
    out += chunk.length <= room ? chunk : chunk.slice(0, room - 20) + '\n…(more in Data Tank)\n';
  };
  add('Summary', digestText(st.digest));
  for (const sec of SECTIONS) add(sec.title, sectionText(sec, st.data[sec.id]));
  const fileLines = (st.files || []).filter(f => f.summary).map(f => '- ' + f.name + ': ' + f.summary);
  add('Uploaded documents (summaries)', fileLines.join('\n'));
  if (!out.trim()) return '';
  return 'These are verified facts about OUR business. Answer from them. If something is not listed here, say you will check with the owner — never invent prices, stock, terms or certificates.\n' + out;
}

// --------------------------------------------------------------------------- Office files → text
function xmlText(xml) {
  return String(xml)
    .replace(/<\/w:p>|<\/a:p>|<w:br\/>|<\/text:p>/g, '\n').replace(/<w:tab\/>/g, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n').trim();
}

function openZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('This is not a valid Office file (expected .docx / .xlsx / .pptx).');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10), csize = buf.readUInt32LE(off + 20);
    const nlen = buf.readUInt16LE(off + 28), elen = buf.readUInt16LE(off + 30), clen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    entries.set(buf.toString('utf8', off + 46, off + 46 + nlen), { method, csize, lho });
    off += 46 + nlen + elen + clen;
  }
  return {
    names: [...entries.keys()],
    read(name) {
      const e = entries.get(name);
      if (!e) return null;
      const start = e.lho + 30 + buf.readUInt16LE(e.lho + 26) + buf.readUInt16LE(e.lho + 28);
      const data = buf.subarray(start, start + e.csize);
      if (e.method === 0) return data;
      if (e.method === 8) return zlib.inflateRawSync(data, { maxOutputLength: 40 * 1024 * 1024 });
      throw new Error('Unsupported compression in file');
    }
  };
}

function colIndex(ref) {
  const m = /^([A-Z]+)/.exec(ref || '');
  if (!m) return 0;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function readXlsx(buf) {
  const z = openZip(buf);
  const shared = [];
  const ss = z.read('xl/sharedStrings.xml');
  if (ss) {
    for (const m of ss.toString('utf8').matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g)) {
      shared.push(xmlText([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join('')));
    }
  }
  const wb = z.read('xl/workbook.xml');
  const sheetNames = wb ? [...wb.toString('utf8').matchAll(/<sheet [^>]*name="([^"]*)"/g)].map(m => xmlText(m[1])) : [];
  const sheetFiles = z.names.filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => parseInt(a.match(/(\d+)\.xml/)[1], 10) - parseInt(b.match(/(\d+)\.xml/)[1], 10)).slice(0, 12);
  const parts = [];
  sheetFiles.forEach((name, i) => {
    const xml = z.read(name).toString('utf8');
    const lines = [];
    for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = [];
      for (const cm of rm[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cm[1], inner = cm[2] || '';
        const ref = (/r="([A-Z]+\d+)"/.exec(attrs) || [])[1];
        const type = (/t="([^"]+)"/.exec(attrs) || [])[1];
        let val = '';
        if (type === 's') val = shared[parseInt((/<v>([\s\S]*?)<\/v>/.exec(inner) || [])[1], 10)] || '';
        else if (type === 'inlineStr') val = xmlText([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join(''));
        else val = xmlText((/<v>([\s\S]*?)<\/v>/.exec(inner) || [])[1] || '');
        if (val === '') continue;
        const idx = ref ? colIndex(ref) : cells.length;
        while (cells.length < idx) cells.push('');
        cells[idx] = val;
      }
      if (cells.some(Boolean)) lines.push(cells.join(' | ').replace(/( \| )+$/, ''));
      if (lines.length >= 2500) break;
    }
    if (lines.length) parts.push('# Sheet: ' + (sheetNames[i] || ('Sheet' + (i + 1))) + '\n' + lines.join('\n'));
  });
  return parts.join('\n\n');
}

function readDocx(buf) {
  const z = openZip(buf);
  const xml = z.read('word/document.xml');
  if (!xml) throw new Error('This .docx has no readable text.');
  return xmlText(xml.toString('utf8'));
}

function readPptx(buf) {
  const z = openZip(buf);
  const slides = z.names.filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => parseInt(a.match(/(\d+)\.xml/)[1], 10) - parseInt(b.match(/(\d+)\.xml/)[1], 10));
  return slides.map((n, i) => '# Slide ' + (i + 1) + '\n' + xmlText(z.read(n).toString('utf8'))).join('\n\n');
}

const TEXT_EXT = new Set(['txt', 'md', 'csv', 'tsv', 'json', 'xml', 'log', 'html', 'htm', 'rtf']);
const AI_READ_MIME = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

async function aiReadFile(buf, mime, name) {
  const { getAiSettingsForTank } = await import('./agentRunner.mjs');
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const settings = await getAiSettingsForTank();
  const key = settings.GEMINI_API_KEY || settings.geminiApiKey || process.env.GEMINI_API_KEY || '';
  if (!key) throw new Error('Reading PDFs and images needs the Gemini key, which is not configured. Upload a .txt / .csv / .xlsx / .docx instead.');
  const model = new GoogleGenerativeAI(key).getGenerativeModel({ model: 'gemini-2.5-flash' });
  const prompt = 'Extract ALL text and data from this business document "' + name + '" faithfully. Keep numbers, units, currencies, grades and names exactly as written. Render tables as rows with " | " between columns. Do not summarise or add commentary. If a page is a photo of goods or a logo, describe it in one short line.';
  const res = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: mime, data: buf.toString('base64') } }] }] });
  return (res.response.text() || '').trim();
}

export async function extractText({ name, mime, buf }) {
  const ext = String(name || '').toLowerCase().split('.').pop();
  if (TEXT_EXT.has(ext) || /^text\//.test(mime || '')) {
    let t = buf.toString('utf8');
    if (ext === 'html' || ext === 'htm') t = t.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, ' ');
    return t.replace(/[ \t]+/g, ' ').trim();
  }
  if (ext === 'docx') return readDocx(buf);
  if (ext === 'xlsx' || ext === 'xlsm') return readXlsx(buf);
  if (ext === 'pptx') return readPptx(buf);
  if (AI_READ_MIME[ext]) return aiReadFile(buf, AI_READ_MIME[ext], name);
  if (['doc', 'xls', 'ppt'].includes(ext)) throw new Error('Old Office format (.' + ext + '). Please save it as .docx / .xlsx / .pptx or PDF and upload again.');
  throw new Error('Unsupported file type .' + ext + '. Use PDF, Excel, Word, PowerPoint, CSV, text or an image.');
}

// --------------------------------------------------------------------------- AI helpers
async function askModel(system, user, { maxTokens = 900, purpose = 'briefing' } = {}) {
  const { callAgentModel } = await import('./agentRunner.mjs');
  const r = await callAgentModel({
    system, messages: [{ role: 'user', content: user }],
    model: 'gemini-3.8-flash', fallbackModel: 'qwen3.8-flash',
    temperature: 0.2, maxTokens, agentName: 'Business Data Tank', purpose
  });
  return r.text;
}

function fallbackSummary(text) {
  return String(text).replace(/\s+/g, ' ').trim().slice(0, 450);
}

async function summariseFile(name, text) {
  try {
    const out = await askModel(
      'You condense business documents for an AI sales/purchase staff member. Reply with at most 700 characters of plain text: what the document is, the products/materials/prices/terms it contains (keep exact numbers, units, currencies and grades), and anything staff must remember. No preamble, no markdown headings.',
      'Document: ' + name + '\n\n' + String(text).slice(0, 14000), { maxTokens: 450 });
    return { summary: sstr(out, 900).trim(), ai: true };
  } catch (e) {
    return { summary: fallbackSummary(text), ai: false };
  }
}

export async function addFile({ name, mime, buf }) {
  if (!store) throw new Error('Storage unavailable');
  await load();
  if (state.files.length >= 60) throw new Error('File limit reached (60). Delete old files first.');
  let text = await extractText({ name, mime, buf });
  text = String(text || '').replace(/\u0000/g, '').trim();
  if (!text) throw new Error('No readable text was found in this file.');
  const truncated = text.length > 150000;
  if (truncated) text = text.slice(0, 150000);
  const { summary, ai } = await summariseFile(name, text);
  const id = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const meta = { id, name: sstr(name, 160), size: buf.length, chars: text.length, truncated, summary, ai, addedAt: Date.now() };
  await store.set(FILES, id, { name: meta.name, text, addedAt: meta.addedAt });
  state.files = [meta, ...state.files];
  state.updatedAt = Date.now();
  state.at = Date.now();
  await saveMain();
  promptCache = compileText(state);
  return meta;
}

export async function getFileText(id) {
  if (!store) throw new Error('Storage unavailable');
  const f = await store.get(FILES, String(id));
  if (!f) throw new Error('File not found');
  return { name: f.name, text: f.text };
}

export async function deleteFile(id) {
  if (!store) throw new Error('Storage unavailable');
  await load();
  await store.del(FILES, String(id));
  state.files = state.files.filter(f => f.id !== id);
  state.updatedAt = Date.now();
  state.at = Date.now();
  await saveMain();
  promptCache = compileText(state);
}

// --------------------------------------------------------------------------- AI digest (summary + ready lists)
const listOf = (v, n, len) => (Array.isArray(v) ? v : []).map(x => sstr(typeof x === 'string' ? x : JSON.stringify(x), len).trim()).filter(Boolean).slice(0, n);

export function parseDigest(raw) {
  const s = String(raw || '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  let j;
  try { j = JSON.parse(s.slice(a, b + 1)); } catch (e) { return null; }
  return {
    summary: sstr(j.summary, 1200).trim(),
    productList: listOf(j.productList, 60, 200),
    rawMaterialList: listOf(j.rawMaterialList, 60, 200),
    keyFacts: listOf(j.keyFacts, 20, 240),
    pricingRules: listOf(j.pricingRules, 12, 240),
    faqs: (Array.isArray(j.faqs) ? j.faqs : []).slice(0, 12)
      .map(f => ({ q: sstr(f && f.q, 200).trim(), a: sstr(f && f.a, 400).trim() })).filter(f => f.q && f.a),
    gaps: listOf(j.gaps, 12, 200)
  };
}

let digestBusy = false;
export async function buildDigest() {
  if (!store) throw new Error('Storage unavailable');
  await load(true);
  const body = compileText({ ...state, digest: null }, 16000);
  if (!body.trim()) throw new Error('Nothing to summarise yet — fill in a section or upload a file first.');
  if (digestBusy) throw new Error('A summary is already being built — wait a moment.');
  digestBusy = true;
  try {
    const raw = await askModel(
      'You prepare a business knowledge brief for AI staff (sales and purchase assistants). Use ONLY the facts provided; never invent anything. Reply with ONE JSON object and nothing else, with keys: ' +
      '"summary" (max 900 chars, what the business is, what it sells and buys, who it serves, how it trades), ' +
      '"productList" (array of short lines: product — key spec — price/MOQ if known), ' +
      '"rawMaterialList" (same style for raw materials), ' +
      '"keyFacts" (up to 15 short facts staff must remember), ' +
      '"pricingRules" (rules about prices, terms, approvals), ' +
      '"faqs" (up to 10 objects {"q","a"} using the given answers), ' +
      '"gaps" (up to 10 important things still missing that the owner should add, e.g. missing prices, payment terms, MOQs). ' +
      'Write in clear English; keep names, grades, units and numbers exactly as given.',
      body, { maxTokens: 2200, purpose: 'briefing' });
    const digest = parseDigest(raw);
    if (!digest) throw new Error('The AI reply could not be read. Try again.');
    digest.at = Date.now();
    state.digest = digest;
    state.at = Date.now();
    await saveMain();
    promptCache = compileText(state);
    return digest;
  } finally { digestBusy = false; }
}

export function previewText() { return promptCache || compileText(state || emptyState()); }
