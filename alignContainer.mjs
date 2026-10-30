// ======================== AlignTasks — Container tracking ========================
// A container number (ISO 6346: 3 owner letters + U/J/Z + 6 digits + check digit) tells us which
// company owns it. That gives the shipping line, whose own tracking page is then used:
//   * the line's address is built from the number (fast, offline), and
//   * when the prefix is not in our table, track-trace.com resolves the company and hands back
//     the line's own tracking URL (the same page it shows in its result frame).
// Automatic event timelines are fetched only for lines where an API key was saved (the lines
// themselves block plain server requests), otherwise the app opens that line's page directly.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { alignDb } from './alignAdmin.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.ALIGN_VESSEL_DATA_DIR || path.join(__dirname, 'data', 'vessel');
const KEYS_FILE = path.join(DATA_DIR, 'carrier-keys.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const MAX_PER_SCOPE = 40;

const sstr = (v, n = 300) => String(v == null ? '' : v).substring(0, n);

// prefix -> [company, kind, tracking url template ("{n}" = container number)]
const OWNERS = {
  // ---- carriers ----
  MSKU: ['Maersk', 'carrier', 'https://www.maersk.com/tracking/{n}'],
  MRKU: ['Maersk', 'carrier', 'https://www.maersk.com/tracking/{n}'],
  MAEU: ['Maersk', 'carrier', 'https://www.maersk.com/tracking/{n}'],
  SUDU: ['Hamburg Süd (Maersk)', 'carrier', 'https://www.maersk.com/tracking/{n}'],
  MSCU: ['MSC', 'carrier', 'https://www.msc.com/track-a-shipment?container={n}'],
  MEDU: ['MSC', 'carrier', 'https://www.msc.com/track-a-shipment?container={n}'],
  CMAU: ['CMA CGM', 'carrier', 'https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=Container&Reference={n}'],
  CGMU: ['CMA CGM', 'carrier', 'https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=Container&Reference={n}'],
  CMDU: ['CMA CGM', 'carrier', 'https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=Container&Reference={n}'],
  ECMU: ['CMA CGM', 'carrier', 'https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=Container&Reference={n}'],
  APZU: ['APL (CMA CGM)', 'carrier', 'https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=Container&Reference={n}'],
  APLU: ['APL (CMA CGM)', 'carrier', 'https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=Container&Reference={n}'],
  ANCU: ['ANL (CMA CGM)', 'carrier', 'https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=Container&Reference={n}'],
  HLXU: ['Hapag-Lloyd', 'carrier', 'https://www.hapag-lloyd.com/en/online-business/tracing/tracing-by-container.html?container={n}'],
  HLBU: ['Hapag-Lloyd', 'carrier', 'https://www.hapag-lloyd.com/en/online-business/tracing/tracing-by-container.html?container={n}'],
  HLCU: ['Hapag-Lloyd', 'carrier', 'https://www.hapag-lloyd.com/en/online-business/tracing/tracing-by-container.html?container={n}'],
  HAMU: ['Hapag-Lloyd', 'carrier', 'https://www.hapag-lloyd.com/en/online-business/tracing/tracing-by-container.html?container={n}'],
  OOLU: ['OOCL', 'carrier', 'https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/cargotracking.aspx?containernumber={n}'],
  COSU: ['COSCO', 'carrier', 'https://elines.coscoshipping.com/ebusiness/cargoTracking?trackingType=CONTAINER&number={n}'],
  CSNU: ['COSCO', 'carrier', 'https://elines.coscoshipping.com/ebusiness/cargoTracking?trackingType=CONTAINER&number={n}'],
  CBHU: ['COSCO', 'carrier', 'https://elines.coscoshipping.com/ebusiness/cargoTracking?trackingType=CONTAINER&number={n}'],
  DFSU: ['COSCO', 'carrier', 'https://elines.coscoshipping.com/ebusiness/cargoTracking?trackingType=CONTAINER&number={n}'],
  EGHU: ['Evergreen', 'carrier', 'https://www.evergreen-line.com/cargotracking?container={n}'],
  EGSU: ['Evergreen', 'carrier', 'https://www.evergreen-line.com/cargotracking?container={n}'],
  EMCU: ['Evergreen', 'carrier', 'https://www.evergreen-line.com/cargotracking?container={n}'],
  EISU: ['Evergreen', 'carrier', 'https://www.evergreen-line.com/cargotracking?container={n}'],
  EITU: ['Evergreen', 'carrier', 'https://www.evergreen-line.com/cargotracking?container={n}'],
  ONEU: ['Ocean Network Express (ONE)', 'carrier', 'https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking?ctrack_type=CT&ctrack_no={n}'],
  YMLU: ['Yang Ming', 'carrier', 'https://www.yangming.com/e-service/track_trace/track_trace_cargo_tracking.aspx?container={n}'],
  YMMU: ['Yang Ming', 'carrier', 'https://www.yangming.com/e-service/track_trace/track_trace_cargo_tracking.aspx?container={n}'],
  HMMU: ['HMM', 'carrier', 'https://www.hmm21.com/e-service/general/tracking/TrackingContainer.jsp?containerNo={n}'],
  HDMU: ['HMM', 'carrier', 'https://www.hmm21.com/e-service/general/tracking/TrackingContainer.jsp?containerNo={n}'],
  ZCSU: ['ZIM', 'carrier', 'https://www.zim.com/tools/track-a-shipment?consnumber={n}'],
  ZIMU: ['ZIM', 'carrier', 'https://www.zim.com/tools/track-a-shipment?consnumber={n}'],
  WHLU: ['Wan Hai', 'carrier', 'https://www.wanhai.com/views/Tracking/TrackingQuery.xhtml?containerNo={n}'],
  WHAU: ['Wan Hai', 'carrier', 'https://www.wanhai.com/views/Tracking/TrackingQuery.xhtml?containerNo={n}'],
  SITU: ['SITC', 'carrier', 'https://www.sitcline.com/en/tracking?containerNo={n}'],
  KMTU: ['KMTC', 'carrier', 'https://www.ekmtc.com/en/service/tracking?containerNo={n}'],
  PILU: ['PIL', 'carrier', 'https://www.pilship.com/tracking?container={n}'],
  PONU: ['PIL', 'carrier', 'https://www.pilship.com/tracking?container={n}'],
  BEAU: ['Beacon (container lessor)', 'lessor', ''],
  // ---- container lessors: the box is leased, so the line comes from the bill of lading ----
  TGHU: ['Triton (container lessor)', 'lessor', ''],
  TEMU: ['Triton (container lessor)', 'lessor', ''],
  TCNU: ['Triton (container lessor)', 'lessor', ''],
  TRLU: ['Triton (container lessor)', 'lessor', ''],
  TCLU: ['Triton (container lessor)', 'lessor', ''],
  TLLU: ['Triton (container lessor)', 'lessor', ''],
  TGBU: ['Triton (container lessor)', 'lessor', ''],
  TIIU: ['Triton (container lessor)', 'lessor', ''],
  TEXU: ['Triton (container lessor)', 'lessor', ''],
  SEGU: ['Seaspan (container lessor)', 'lessor', ''],
  CAIU: ['CAI (container lessor)', 'lessor', ''],
  CAXU: ['CAI (container lessor)', 'lessor', ''],
  GESU: ['GE Seaco (container lessor)', 'lessor', ''],
  GATU: ['GE Seaco (container lessor)', 'lessor', ''],
  FCIU: ['Florens (container lessor)', 'lessor', ''],
  FSCU: ['Florens (container lessor)', 'lessor', ''],
  BMOU: ['Baldwin / BMI (container lessor)', 'lessor', ''],
  GLDU: ['Gold (container lessor)', 'lessor', '']
};

// ---------- ISO 6346 ----------
const LETTER_VALUE = (() => {
  const m = {};
  let v = 10;
  for (let i = 0; i < 26; i++) {
    const code = 65 + i;
    m[String.fromCharCode(code)] = v++;
    if (v % 11 === 0) v++;          // 11, 22, 33 are skipped by the standard
  }
  return m;
})();

function checkDigitFailure(num) {
  const s = String(num || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (!/^[A-Z]{3}[UJZ]\d{7}$/.test(s)) return 'A container number is 4 letters + 7 digits, for example MSKU1234567.';
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = s[i];
    const val = /\d/.test(ch) ? Number(ch) : LETTER_VALUE[ch];
    sum += val * Math.pow(2, i);
  }
  const expected = (sum % 11) % 10;
  if (expected !== Number(s[10])) return 'Check digit should be ' + expected + ' (you typed ' + s[10] + ') — please re-check the number.';
  return '';
}

function normalizeContainer(num) {
  return String(num || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function ownerOf(num) {
  const rec = OWNERS[num.slice(0, 4)];
  return rec ? { company: rec[0], kind: rec[1], url: rec[2] ? rec[2].replace('{n}', num) : '' } : null;
}

// ---------- resolution for unknown prefixes ----------
const ttCache = new Map();
async function resolveViaTrackTrace(num) {
  const hit = ttCache.get(num);
  if (hit && Date.now() - hit.at < 60 * 60000) return hit.v;
  try {
    const body = 'number=' + encodeURIComponent(num) + '&config=207500&commit=Track+with+options';
    const r = await fetch('https://www.track-trace.com/container', {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Referer: 'https://www.track-trace.com/container', 'Accept-Language': 'en' },
      body,
      signal: AbortSignal.timeout(20000)
    });
    if (!r.ok) return null;
    const html = await r.text();
    const origin = /Origin:[\s\S]{0,200}?<[^>]*>([^<]{2,60})</i.exec(html);
    const frame = /<iframe[^>]+src="(https?:\/\/[^"]{10,300})"/i.exec(html);
    const v = {
      carrier: origin ? sstr(origin[1].replace(/\s+/g, ' ').trim(), 60) : '',
      url: frame ? frame[1] : ''
    };
    if (!v.carrier && !v.url) return null;
    if (ttCache.size > 500) ttCache.delete(ttCache.keys().next().value);
    ttCache.set(num, { at: Date.now(), v });
    return v;
  } catch (e) { return null; }
}

// ---------- per-line API keys (only the lines that publish a tracking API) ----------
function readKeys() { try { return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8')) || {}; } catch (e) { return {}; } }
function writeKeys(o) { try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(KEYS_FILE, JSON.stringify(o, null, 0), { mode: 0o600 }); } catch (e) { /* ignore */ } }

const API_CARRIERS = {
  maersk: { label: 'Maersk', needs: 'Consumer-Key from developer.maersk.com' },
  hapag: { label: 'Hapag-Lloyd', needs: 'API key from Hapag-Lloyd (developer.hapag-lloyd.com)' },
  cmacgm: { label: 'CMA CGM', needs: 'API key from CMA CGM' }
};

function carrierKeyId(company) {
  const c = String(company || '').toLowerCase();
  if (/maersk|hamburg/.test(c)) return 'maersk';
  if (/hapag/.test(c)) return 'hapag';
  if (/cma|apl|anl/.test(c)) return 'cmacgm';
  return '';
}

function eventList(events) {
  const out = [];
  for (const e of (Array.isArray(events) ? events : [])) {
    if (!e || typeof e !== 'object') continue;
    const when = e.eventDateTime || e.eventTime || e.dateTime || e.time || e.eventDate || '';
    const where = sstr(e.location || e.eventLocation || e.place || (e.locationName || ''), 90);
    const what = sstr(e.description || e.eventDescription || e.eventType || e.activity || e.status || '', 120);
    if (!what && !where) continue;
    out.push({ when: sstr(when, 40), where, what });
  }
  return out.slice(0, 40);
}

async function fetchMaersk(num, key) {
  const r = await fetch('https://api.maersk.com/track-and-trace/containers/' + encodeURIComponent(num), {
    headers: { 'Consumer-Key': key, Accept: 'application/json', 'User-Agent': UA },
    signal: AbortSignal.timeout(20000)
  });
  if (!r.ok) return { ok: false, error: 'Maersk API returned HTTP ' + r.status };
  const j = await r.json().catch(() => null);
  if (!j) return { ok: false, error: 'Maersk API did not return JSON' };
  const cont = Array.isArray(j.containers) ? j.containers[0] : (j.container || j);
  const events = eventList((cont && (cont.events || cont.trackingEvents)) || j.events || []);
  if (!events.length) return { ok: false, error: 'Maersk returned no events for this container' };
  return { ok: true, events, source: 'Maersk API' };
}

async function fetchHapag(num, key) {
  const url = 'https://api.hlag.com/hlag/external/v1/container-tracking?containerNumber=' + encodeURIComponent(num);
  const r = await fetch(url, { headers: { 'Consumer-Key': key, Accept: 'application/json', 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) return { ok: false, error: 'Hapag-Lloyd API returned HTTP ' + r.status };
  const j = await r.json().catch(() => null);
  const events = eventList((j && (j.events || (j.container && j.container.events))) || []);
  if (!events.length) return { ok: false, error: 'Hapag-Lloyd returned no events for this container' };
  return { ok: true, events, source: 'Hapag-Lloyd API' };
}

async function fetchCmaCgm(num, key) {
  const url = 'https://apis.cma-cgm.net/operation/v1/tracking?reference=' + encodeURIComponent(num) + '&referenceType=CONTAINER';
  const r = await fetch(url, { headers: { 'Authorization': 'Bearer ' + key, Accept: 'application/json', 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) return { ok: false, error: 'CMA CGM API returned HTTP ' + r.status };
  const j = await r.json().catch(() => null);
  const events = eventList((j && (j.events || (j.container && j.container.events))) || []);
  if (!events.length) return { ok: false, error: 'CMA CGM returned no events for this container' };
  return { ok: true, events, source: 'CMA CGM API' };
}

async function fetchEvents(number, company) {
  const id = carrierKeyId(company);
  if (!id) return { ok: false, error: '' };
  const key = readKeys()[id];
  if (!key) return { ok: false, error: '', locked: true };
  try {
    if (id === 'maersk') return await fetchMaersk(number, key);
    if (id === 'hapag') return await fetchHapag(number, key);
    if (id === 'cmacgm') return await fetchCmaCgm(number, key);
  } catch (e) {
    return { ok: false, error: sstr((e && e.message) || e, 160) };
  }
  return { ok: false, error: '' };
}

// ---------- storage ----------
const SCOPES_FILE = path.join(DATA_DIR, 'containers.json');
const scopes = new Map();
const noAdmin = (e) => !!(e && e.code === 'align-no-admin');
const docOf = (scope) => alignDb().collection('alignContainers').doc(String(scope).replace(/[\/\s]/g, '_'));

async function loadScope(scope) {
  if (scopes.has(scope)) return scopes.get(scope);
  let list = [];
  try {
    const s = await docOf(scope).get();
    list = s.exists && Array.isArray((s.data() || {}).containers) ? s.data().containers : [];
  } catch (e) {
    if (noAdmin(e)) { try { list = (JSON.parse(fs.readFileSync(SCOPES_FILE, 'utf8')) || {})[scope] || []; } catch (e2) { list = []; } }
  }
  scopes.set(scope, list);
  return list;
}

async function saveScope(scope, list) {
  scopes.set(scope, list);
  try {
    await docOf(scope).set({ containers: list, updatedAt: Date.now() });
  } catch (e) {
    if (!noAdmin(e)) throw e;
    let all = {};
    try { all = JSON.parse(fs.readFileSync(SCOPES_FILE, 'utf8')) || {}; } catch (e2) { all = {}; }
    all[scope] = list;
    fs.writeFileSync(SCOPES_FILE, JSON.stringify(all));
  }
}

function view(c) {
  return {
    number: c.number,
    company: c.company || '',
    kind: c.kind || '',
    url: c.url || '',
    status: c.status || '',
    events: Array.isArray(c.events) ? c.events : [],
    source: c.source || '',
    note: c.note || '',
    error: c.error || '',
    checkedAt: c.checkedAt || 0,
    addedAt: c.addedAt || 0,
    addedBy: c.addedBy || ''
  };
}

// ---------- routes ----------
export function registerAlignContainerRoutes(app, opts) {
  const api = (opts && opts.api) || '/api/align';
  const requireStaff = opts && opts.requireStaff;
  const scopeOf = (opts && opts.scopeOf) || ((req) => String((req.staff && req.staff.uid) || ''));
  const isAdmin = (opts && opts.isAdmin) || (async () => false);
  if (typeof requireStaff !== 'function') throw new Error('registerAlignContainerRoutes needs requireStaff');

  const fail = (res, e, code) => res.status(code || 500).json({ ok: false, error: sstr((e && e.message) || e, 240) });

  // Which lines can return events automatically right now?
  app.get(api + '/container/status', requireStaff, async (req, res) => {
    const keys = readKeys();
    res.json({
      ok: true,
      canConfigure: await isAdmin(req),
      carriers: Object.entries(API_CARRIERS).map(([id, c]) => ({ id, label: c.label, needs: c.needs, ready: !!keys[id] })),
      linkage: 'track-trace.com + the line\'s own tracking page'
    });
  });

  app.post(api + '/container/config', requireStaff, async (req, res) => {
    try {
      if (!(await isAdmin(req))) return res.status(403).json({ ok: false, error: 'Only the main account owner can add carrier API keys.' });
      const id = sstr(req.body && req.body.carrier, 20).trim();
      const key = sstr(req.body && req.body.apiKey, 200).trim();
      if (!API_CARRIERS[id]) return res.status(400).json({ ok: false, error: 'Unknown shipping line.' });
      const keys = readKeys();
      if (key) keys[id] = key; else delete keys[id];
      writeKeys(keys);
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });

  app.get(api + '/container/tracked', requireStaff, async (req, res) => {
    try {
      const list = await loadScope(scopeOf(req));
      res.json({ ok: true, containers: list.map(view) });
    } catch (e) { fail(res, e); }
  });

  // Add (or re-check) a container: validate, identify the company, and fetch events when possible.
  app.post(api + '/container/track', requireStaff, async (req, res) => {
    try {
      const b = req.body || {};
      const number = normalizeContainer(b.number);
      const bad = checkDigitFailure(number);
      if (bad) return res.status(400).json({ ok: false, error: bad });
      const scope = scopeOf(req);
      const list = (await loadScope(scope)).slice();
      const idx = list.findIndex(c => c.number === number);
      const cur = idx >= 0 ? list[idx] : { number, addedAt: Date.now(), addedBy: sstr(req.staff && req.staff.name, 60), events: [] };
      let owner = ownerOf(number);
      // Unknown prefix: let track-trace name the company and hand back the line's own page.
      if (!owner || !owner.url) {
        const tt = await resolveViaTrackTrace(number);
        if (tt) owner = { company: (owner && owner.company) || tt.carrier || '', kind: (owner && owner.kind) || 'carrier', url: (owner && owner.url) || tt.url || '' };
      }
      const entry = Object.assign({}, cur, {
        company: (owner && owner.company) || cur.company || '',
        kind: (owner && owner.kind) || cur.kind || '',
        url: (owner && owner.url) || cur.url || '',
        note: b.note != null ? sstr(b.note, 200) : (cur.note || '')
      });
      // Events from the line's API when a key exists; otherwise the app opens the line's page.
      let fetched = { ok: false, error: '' };
      if (entry.company) fetched = await fetchEvents(number, entry.company);
      if (fetched.ok) {
        entry.events = fetched.events;
        entry.source = fetched.source;
        entry.status = fetched.events[0] ? (fetched.events[0].what + (fetched.events[0].where ? ' — ' + fetched.events[0].where : '')) : '';
        entry.error = '';
      } else if (fetched.error) {
        entry.error = fetched.error;
      }
      entry.checkedAt = Date.now();
      if (idx >= 0) list[idx] = entry; else {
        if (list.length >= MAX_PER_SCOPE) return res.status(400).json({ ok: false, error: 'You can track up to ' + MAX_PER_SCOPE + ' containers. Remove one first.' });
        list.unshift(entry);
      }
      await saveScope(scope, list);
      res.json({ ok: true, container: view(entry), needsKey: !!fetched.locked });
    } catch (e) { fail(res, e); }
  });

  app.post(api + '/container/untrack', requireStaff, async (req, res) => {
    try {
      const number = normalizeContainer((req.body || {}).number);
      const scope = scopeOf(req);
      const list = (await loadScope(scope)).filter(c => c.number !== number);
      await saveScope(scope, list);
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });

  app.post(api + '/container/status', requireStaff, async (req, res) => {
    try {
      const b = req.body || {};
      const number = normalizeContainer(b.number);
      const scope = scopeOf(req);
      const list = (await loadScope(scope)).slice();
      const i = list.findIndex(c => c.number === number);
      if (i < 0) return res.status(404).json({ ok: false, error: 'This container is not in your list.' });
      if (b.status != null) list[i].status = sstr(b.status, 200);
      if (b.note != null) list[i].note = sstr(b.note, 200);
      await saveScope(scope, list);
      res.json({ ok: true, container: view(list[i]) });
    } catch (e) { fail(res, e); }
  });

  console.log('[CONTAINER] 📦 container tracking routes registered');
}

