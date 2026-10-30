// ======================== AlignTasks — Vessel live tracking (AIS) ========================
// Real AIS data from AISStream.io (server side only — the key never reaches the browser).
//   * "collector" stream: every ShipStaticData message worldwide -> a name / IMO / MMSI directory
//     (cargo, tanker, passenger ships only) so a vessel can be found by name.
//   * "tracker" stream: live positions for the vessels the teams are tracking (MMSI filter).
// Only present-day data is ever served: positions older than 7 days and directory entries older
// than 30 days are dropped, and every answer carries the age of the last signal.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { alignDb, alignAuth } from './alignAdmin.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.ALIGN_VESSEL_DATA_DIR || path.join(__dirname, 'data', 'vessel');
const KEY_FILE = path.join(DATA_DIR, 'key.json');
const INDEX_FILE = path.join(DATA_DIR, 'index.json');
const POS_FILE = path.join(DATA_DIR, 'positions.json');
const STREAM_URL = process.env.AISSTREAM_URL || 'wss://stream.aisstream.io/v0/stream';
const ADMIN_EMAIL = String(process.env.VESSEL_ADMIN_EMAIL || 'nadeemalsaham@gmail.com').toLowerCase();

const DAY = 86400000;
const INDEX_MAX_AGE = 30 * DAY;      // directory entries not heard from for 30 days are dropped
const SEARCH_MAX_AGE = 7 * DAY;      // only vessels active in the last 7 days are offered
const POS_MAX_AGE = 7 * DAY;         // a position older than a week is never shown
const TRAIL_MAX_AGE = 72 * 3600000;
const TRAIL_MAX_POINTS = 400;
const MAX_TRACKED_PER_SCOPE = 30;
const MAX_WATCH = 200;

const sstr = (v, n = 200) => String(v == null ? '' : v).substring(0, n);
const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const NAV_STATUS = ['Under way using engine', 'At anchor', 'Not under command', 'Restricted manoeuvrability', 'Constrained by draught', 'Moored', 'Aground', 'Engaged in fishing', 'Under way sailing', '', '', '', '', '', 'AIS-SART active', 'Not defined'];

function typeName(t) {
  t = Number(t) || 0;
  if (t >= 70 && t <= 79) return 'Cargo / container ship';
  if (t >= 80 && t <= 89) return 'Tanker';
  if (t >= 60 && t <= 69) return 'Passenger ship';
  if (t >= 90) return 'Other vessel';
  return 'Vessel';
}

// ---------- storage ----------
const vessels = new Map();           // mmsi -> {m,n,k,i,c,t,d,e,dr,l,w,u}
const positions = new Map();         // mmsi -> {pos:{lat,lon,sog,cog,hdg,nav,at}, trail:[[lat,lon,at]]}
const scopes = new Map();            // scope -> [{mmsi,name,imo,voyage,line,expectedPort,note,addedAt,addedBy}]
let indexDirty = false;
let posDirty = false;

function ensureDir() { try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) { /* ignore */ } }
function writeJson(file, obj, mode) {
  ensureDir();
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj), mode ? { mode } : undefined);
  fs.renameSync(tmp, file);
}
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}

function getKey() {
  const env = String(process.env.AISSTREAM_API_KEY || '').trim();
  if (env) return env;
  const f = readJson(KEY_FILE, null);
  return f && f.apiKey ? String(f.apiKey).trim() : '';
}

function loadFiles() {
  const idx = readJson(INDEX_FILE, null);
  const now = Date.now();
  if (idx && Array.isArray(idx.v)) {
    for (const r of idx.v) { if (r && r.m && (now - (r.u || 0)) < INDEX_MAX_AGE) vessels.set(String(r.m), r); }
  }
  const pf = readJson(POS_FILE, null);
  if (pf && pf.p) {
    for (const [m, v] of Object.entries(pf.p)) {
      if (!v || !v.pos || (now - (v.pos.at || 0)) > POS_MAX_AGE) continue;
      v.trail = (Array.isArray(v.trail) ? v.trail : []).filter(p => (now - p[2]) < TRAIL_MAX_AGE);
      positions.set(m, v);
    }
  }
}

function persist() {
  const now = Date.now();
  try {
    if (indexDirty) {
      for (const [m, r] of vessels) { if ((now - (r.u || 0)) > INDEX_MAX_AGE) vessels.delete(m); }
      writeJson(INDEX_FILE, { savedAt: now, v: Array.from(vessels.values()) });
      indexDirty = false;
    }
    if (posDirty) {
      const p = {};
      for (const [m, v] of positions) p[m] = v;
      writeJson(POS_FILE, { savedAt: now, p });
      posDirty = false;
    }
  } catch (e) { console.warn('[VESSEL] save failed: ' + sstr(e && e.message, 120)); }
}

// ---------- AIS message handling ----------
const clean = (s) => String(s || '').replace(/@+/g, ' ').replace(/\s+/g, ' ').trim();

function parseUtc(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(String(s || ''));
  if (!m) return 0;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

function upsertStatic(msg, watched) {
  const s = msg.Message && msg.Message.ShipStaticData;
  const meta = msg.MetaData || {};
  if (!s) return;
  const mmsi = String(meta.MMSI || s.UserID || '');
  if (!/^\d{9}$/.test(mmsi)) return;
  const type = Number(s.Type) || 0;
  if (!watched && type < 60) return;
  const name = clean(s.Name || meta.ShipName);
  if (!name) return;
  const dim = s.Dimension || {};
  const eta = s.Eta || {};
  const rec = {
    m: mmsi,
    n: name,
    k: norm(name),
    i: Number(s.ImoNumber) > 1000000 ? String(s.ImoNumber) : '',
    c: clean(s.CallSign),
    t: type,
    d: clean(s.Destination),
    e: eta.Month ? { M: eta.Month, D: eta.Day, h: eta.Hour, m: eta.Minute } : null,
    dr: Number(s.MaximumStaticDraught) || 0,
    l: (Number(dim.A) || 0) + (Number(dim.B) || 0),
    w: (Number(dim.C) || 0) + (Number(dim.D) || 0),
    u: Date.now()
  };
  vessels.set(mmsi, rec);
  indexDirty = true;
}

function updatePosition(msg) {
  const meta = msg.MetaData || {};
  const p = (msg.Message && (msg.Message.PositionReport || msg.Message.StandardClassBPositionReport)) || null;
  if (!p) return;
  const mmsi = String(meta.MMSI || p.UserID || '');
  if (!watch.has(mmsi)) return;
  const lat = Number(p.Latitude), lon = Number(p.Longitude);
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
  const at = parseUtc(meta.time_utc) || Date.now();
  const sog = Number(p.Sog);
  const cog = Number(p.Cog);
  const hdg = Number(p.TrueHeading);
  const pos = {
    lat, lon,
    sog: isFinite(sog) && sog < 102.3 ? sog : null,
    cog: isFinite(cog) && cog < 360 ? cog : null,
    hdg: isFinite(hdg) && hdg < 360 ? hdg : null,
    nav: msg.Message.PositionReport && Number.isInteger(p.NavigationalStatus) ? p.NavigationalStatus : null,
    at
  };
  const cur = positions.get(mmsi) || { pos: null, trail: [] };
  if (cur.pos && at < cur.pos.at) return;       // out-of-order report
  cur.pos = pos;
  const last = cur.trail[cur.trail.length - 1];
  if (!last || at - last[2] >= 5 * 60000 || Math.abs(last[0] - lat) + Math.abs(last[1] - lon) > 0.01) {
    cur.trail.push([Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5, at]);
    const cut = Date.now() - TRAIL_MAX_AGE;
    while (cur.trail.length > TRAIL_MAX_POINTS || (cur.trail.length && cur.trail[0][2] < cut)) cur.trail.shift();
  }
  positions.set(mmsi, cur);
  posDirty = true;
}

function handleMessage(buf, which) {
  let m;
  try { m = JSON.parse(buf.toString()); } catch (e) { return; }
  if (m.error) { which.lastError = sstr(m.error, 200); return; }
  if (m.MessageType === 'ShipStaticData') upsertStatic(m, watch.has(String((m.MetaData && m.MetaData.MMSI) || '')));
  else if (m.MessageType === 'PositionReport' || m.MessageType === 'StandardClassBPositionReport') updatePosition(m);
}

// ---------- stream manager ----------
function makeStream(name, { sub, silenceMs }) {
  const st = { name, ws: null, connected: false, since: 0, lastMsgAt: 0, lastError: '', msgs: 0, backoff: 3000, retryTimer: null, want: false, alive: true, ping: null, lastSubAt: 0, subTimer: null };

  function teardown() {
    if (st.ping) { clearInterval(st.ping); st.ping = null; }
    st.connected = false;
    st.ws = null;
  }
  function scheduleRetry() {
    if (!st.want || st.retryTimer) return;
    const wait = Math.min(st.backoff, 300000) * (0.8 + Math.random() * 0.4);
    st.retryTimer = setTimeout(() => { st.retryTimer = null; connect(); }, wait);
    st.backoff = Math.min(st.backoff * 2, 300000);
  }
  function connect() {
    if (st.ws || !st.want) return;
    const key = getKey();
    const s = sub();
    if (!key || !s) return;
    let ws;
    try { ws = new WebSocket(STREAM_URL, { perMessageDeflate: true, handshakeTimeout: 15000 }); }
    catch (e) { st.lastError = sstr(e.message, 160); scheduleRetry(); return; }
    st.ws = ws;
    ws.on('open', () => {
      try { ws.send(JSON.stringify(Object.assign({ APIKey: key }, s))); st.lastSubAt = Date.now(); } catch (e) { /* closes below */ }
      st.connected = true; st.since = Date.now(); st.lastMsgAt = Date.now(); st.alive = true; st.lastError = '';
      st.ping = setInterval(() => {
        if (!st.alive) { try { ws.terminate(); } catch (e) { /* ignore */ } return; }
        if (silenceMs && Date.now() - st.lastMsgAt > silenceMs) { st.lastError = 'no data received - reconnecting'; try { ws.terminate(); } catch (e) { /* ignore */ } return; }
        st.alive = false;
        try { ws.ping(); } catch (e) { /* ignore */ }
      }, 30000);
    });
    ws.on('pong', () => { st.alive = true; });
    ws.on('message', (d) => {
      st.alive = true; st.lastMsgAt = Date.now(); st.msgs++;
      if (st.backoff > 3000) st.backoff = 3000;
      handleMessage(d, st);
    });
    ws.on('error', (e) => { st.lastError = sstr((e && e.message) || e, 200); });
    ws.on('close', () => {
      const bad = /key|auth|unauthor|forbidden|401|403|limit/i.test(st.lastError);
      teardown();
      if (bad) st.backoff = 300000;
      scheduleRetry();
    });
  }
  return {
    st,
    start() { st.want = true; st.backoff = 3000; connect(); },
    stop() {
      st.want = false;
      if (st.retryTimer) { clearTimeout(st.retryTimer); st.retryTimer = null; }
      if (st.subTimer) { clearTimeout(st.subTimer); st.subTimer = null; }
      if (st.ws) { try { st.ws.terminate(); } catch (e) { /* ignore */ } }
      teardown();
    },
    // The watch list changed: replace the subscription (the service allows one update per second).
    resub() {
      const s = sub();
      if (!s) { this.stop(); return; }
      if (!st.want) { this.start(); return; }
      if (!st.ws || !st.connected) { connect(); return; }
      if (st.subTimer) return;
      st.subTimer = setTimeout(() => {
        st.subTimer = null;
        const next = sub();
        if (!next) { this.stop(); return; }
        try { st.ws.send(JSON.stringify(Object.assign({ APIKey: getKey() }, next))); st.lastSubAt = Date.now(); } catch (e) { /* reconnect handles it */ }
      }, 1500);
    }
  };
}

const watch = new Set();
const GLOBAL_BOX = [[[-90, -180], [90, 180]]];
const collector = makeStream('collector', {
  silenceMs: 3 * 60000,
  sub: () => ({ BoundingBoxes: GLOBAL_BOX, FilterMessageTypes: ['ShipStaticData'] })
});
const tracker = makeStream('tracker', {
  silenceMs: 0,
  sub: () => watch.size
    ? { BoundingBoxes: GLOBAL_BOX, FiltersShipMMSI: Array.from(watch).slice(0, MAX_WATCH), FilterMessageTypes: ['PositionReport', 'StandardClassBPositionReport', 'ShipStaticData'] }
    : null
});

function rebuildWatch() {
  watch.clear();
  for (const list of scopes.values()) for (const v of list) watch.add(String(v.mmsi));
  for (const m of Array.from(positions.keys())) { if (!watch.has(m)) positions.delete(m); }
}
function applyStreams() {
  if (!getKey()) { collector.stop(); tracker.stop(); return; }
  if (!collector.st.want) collector.start();
  tracker.resub();
}

// ---------- tracked list (shared by a team) ----------
// Tracked lists live in Firestore; a local file is used only when the server has no admin key (dev).
const SCOPES_FILE = path.join(DATA_DIR, 'scopes.json');
const scopeDoc = (scope) => alignDb().collection('alignVessels').doc(String(scope).replace(/[\/\s]/g, '_'));
const noAdmin = (e) => !!(e && e.code === 'align-no-admin');

async function loadScope(scope) {
  if (scopes.has(scope)) return scopes.get(scope);
  let list = [];
  try {
    const s = await scopeDoc(scope).get();
    list = s.exists && Array.isArray((s.data() || {}).vessels) ? s.data().vessels : [];
  } catch (e) {
    list = noAdmin(e) ? ((readJson(SCOPES_FILE, {}) || {})[scope] || []) : [];
  }
  scopes.set(scope, list);
  return list;
}
async function saveScope(scope, list) {
  scopes.set(scope, list);
  try {
    await scopeDoc(scope).set({ vessels: list, updatedAt: Date.now() });
  } catch (e) {
    if (!noAdmin(e)) throw e;
    const all = readJson(SCOPES_FILE, {}) || {};
    all[scope] = list;
    writeJson(SCOPES_FILE, all);
  }
  rebuildWatch();
  applyStreams();
}

async function loadAllScopes() {
  try {
    const snap = await alignDb().collection('alignVessels').get();
    snap.forEach((d) => { scopes.set(d.id, Array.isArray((d.data() || {}).vessels) ? d.data().vessels : []); });
  } catch (e) {
    if (noAdmin(e)) { for (const [k, v] of Object.entries(readJson(SCOPES_FILE, {}) || {})) scopes.set(k, v); }
    else console.warn('[VESSEL] could not load tracked vessels: ' + sstr(e && e.message, 120));
  }
  rebuildWatch();
}

// ---------- queries ----------
function etaOf(e) {
  if (!e || !e.M) return 0;
  const now = new Date();
  let t = Date.UTC(now.getUTCFullYear(), e.M - 1, e.D || 1, e.h == null || e.h > 23 ? 0 : e.h, e.m == null || e.m > 59 ? 0 : e.m);
  if (t < Date.now() - 45 * DAY) t = Date.UTC(now.getUTCFullYear() + 1, e.M - 1, e.D || 1, e.h > 23 ? 0 : e.h, e.m > 59 ? 0 : e.m);
  return t;
}

function brief(r) {
  return {
    mmsi: r.m, name: r.n, imo: r.i || '', callSign: r.c || '', type: typeName(r.t), length: r.l || 0, beam: r.w || 0,
    destination: r.d || '', etaMs: etaOf(r.e), draught: r.dr || 0, lastHeardMs: r.u || 0
  };
}

function search(q) {
  const raw = sstr(q, 60).trim();
  const out = [];
  const now = Date.now();
  if (/^\d{9}$/.test(raw)) {
    const r = vessels.get(raw);
    out.push(r ? brief(r) : { mmsi: raw, name: '', imo: '', type: 'Vessel', destination: '', lastHeardMs: 0 });
    return out;
  }
  const imo = /^(?:imo\s*)?(\d{7})$/i.exec(raw);
  const nq = norm(raw);
  if (nq.length < 3 && !imo) return out;
  const scored = [];
  for (const r of vessels.values()) {
    if (now - (r.u || 0) > SEARCH_MAX_AGE) continue;
    let score = 0;
    if (imo) { if (r.i === imo[1]) score = 100; }
    else if (r.k === nq) score = 100;
    else if (r.k.startsWith(nq)) score = 60;
    else if (r.k.includes(nq)) score = 30;
    if (score) scored.push([score, r.u || 0, r]);
  }
  scored.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  return scored.slice(0, 15).map(x => brief(x[2]));
}

function freshness(pos) {
  if (!pos) return { state: 'none', ageMin: null };
  const ageMin = Math.max(0, Math.round((Date.now() - pos.at) / 60000));
  const state = ageMin <= 20 ? 'live' : ageMin <= 360 ? 'recent' : 'old';
  return { state, ageMin };
}

function snapshot(entry) {
  const mmsi = String(entry.mmsi);
  const rec = vessels.get(mmsi);
  const pe = positions.get(mmsi);
  const pos = pe && pe.pos ? pe.pos : null;
  const f = freshness(pos);
  return {
    tracked: { mmsi, name: entry.name || '', imo: entry.imo || '', voyage: entry.voyage || '', line: entry.line || '', expectedPort: entry.expectedPort || '', note: entry.note || '', addedAt: entry.addedAt || 0 },
    vessel: rec ? brief(rec) : { mmsi, name: entry.name || '', imo: entry.imo || '', destination: '', type: 'Vessel' },
    position: pos ? {
      lat: pos.lat, lon: pos.lon, sogKn: pos.sog, cog: pos.cog, heading: pos.hdg,
      navStatus: pos.nav, navText: pos.nav != null ? (NAV_STATUS[pos.nav] || '') : '',
      atMs: pos.at, ageMin: f.ageMin, freshness: f.state
    } : null,
    trail: pe && pe.trail ? pe.trail : []
  };
}

// ---------- AI ----------
async function geminiKey() {
  const env = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (env) return env;
  try {
    const s = await alignDb().doc('appData/settings').get();
    const d = s.exists ? (s.data() || {}) : {};
    return d.GEMINI_API_KEY || d.geminiApiKey || '';
  } catch (e) { return ''; }
}

const summaryCache = new Map();

function ruleSummary(snap) {
  const v = snap.vessel, p = snap.position;
  const nm = v.name || snap.tracked.name || ('MMSI ' + snap.tracked.mmsi);
  const parts = [];
  if (!p) {
    parts.push(nm + ': no AIS position has been received yet. Offshore vessels are only heard when they are in range of a coastal or satellite receiver.');
  } else {
    const age = p.ageMin < 60 ? p.ageMin + ' min' : (p.ageMin < 2880 ? Math.round(p.ageMin / 60) + ' h' : Math.round(p.ageMin / 1440) + ' days');
    parts.push(nm + ' was last heard ' + age + ' ago at ' + p.lat.toFixed(3) + ', ' + p.lon.toFixed(3) + (p.sogKn != null ? ', moving at ' + p.sogKn.toFixed(1) + ' kn' : '') + (p.navText ? ' (' + p.navText.toLowerCase() + ')' : '') + '.');
  }
  if (v.destination) parts.push('Declared destination: ' + v.destination + (v.etaMs ? ', ETA ' + new Date(v.etaMs).toUTCString().replace(':00 GMT', ' UTC') : '') + '.');
  return { summary: parts.join(' '), destinationPort: null, destinationMatchesExpected: 'unclear', ai: false };
}

async function aiSummary(snap) {
  const base = ruleSummary(snap);
  const key = await geminiKey();
  if (!key) return base;
  const v = snap.vessel, p = snap.position, t = snap.tracked;
  const facts = {
    vessel: v.name || t.name, imo: v.imo || t.imo, type: v.type,
    nowUtc: new Date().toISOString(),
    lastPosition: p ? { lat: p.lat, lon: p.lon, speedKn: p.sogKn, courseDeg: p.cog, status: p.navText, signalAgeMinutes: p.ageMin } : null,
    aisDestinationText: v.destination || null,
    aisEtaUtc: v.etaMs ? new Date(v.etaMs).toISOString() : null,
    draughtM: v.draught || null,
    userVoyage: t.voyage || null, userShippingLine: t.line || null, userExpectedPort: t.expectedPort || null
  };
  const prompt = 'You are a shipping operations analyst. Using ONLY the facts below (never invent data), reply with strict JSON: '
    + '{"summary": "<=3 short plain-English sentences: where the vessel is (nearest sea/port/coast if you are sure), whether it is moving, how fresh the signal is, and the destination/ETA>", '
    + '"destinationPort": "<the full port name that the AIS destination text refers to, or null if unsure>", '
    + '"destinationMatchesExpected": "yes|no|unclear (compare AIS destination with userExpectedPort; unclear if either is missing)"}. '
    + 'If signalAgeMinutes is above 360 say the signal is old. Facts: ' + JSON.stringify(facts);
  const ck = [t.mmsi, v.destination, t.expectedPort, p ? Math.round(p.lat * 10) + ',' + Math.round(p.lon * 10) : '', p ? Math.floor(p.ageMin / 30) : ''].join('|');
  const hit = summaryCache.get(ck);
  if (hit && Date.now() - hit.at < 20 * 60000) return hit.v;
  for (const gm of ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-flash-latest']) {
    try {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + gm + ':generateContent?key=' + key, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } }),
        signal: AbortSignal.timeout(25000)
      });
      if (!r.ok) continue;
      const j = await r.json();
      const txt = ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts[0] && j.candidates[0].content.parts[0].text) || '').trim();
      const o = JSON.parse(txt.replace(/^```json|```$/g, '').trim());
      if (!o || !o.summary) continue;
      const v2 = {
        summary: sstr(o.summary, 600),
        destinationPort: o.destinationPort ? sstr(o.destinationPort, 80) : null,
        destinationMatchesExpected: ['yes', 'no', 'unclear'].includes(o.destinationMatchesExpected) ? o.destinationMatchesExpected : 'unclear',
        ai: true
      };
      summaryCache.set(ck, { at: Date.now(), v: v2 });
      if (summaryCache.size > 300) summaryCache.delete(summaryCache.keys().next().value);
      return v2;
    } catch (e) { /* try the next model */ }
  }
  return base;
}

// ---------- status ----------
function status() {
  const key = getKey();
  return {
    configured: !!key,
    directory: {
      vessels: vessels.size,
      streaming: collector.st.connected,
      sinceMs: collector.st.since || 0,
      error: key ? collector.st.lastError : '',
      ready: vessels.size >= 5000
    },
    tracker: { streaming: tracker.st.connected, watching: watch.size, error: key ? tracker.st.lastError : '' }
  };
}

// ---------- routes ----------
export function registerAlignVesselRoutes(app, opts) {
  const api = (opts && opts.api) || '/api/align';
  const requireStaff = opts && opts.requireStaff;
  const scopeOf = (opts && opts.scopeOf) || ((req) => String((req.staff && req.staff.uid) || ''));
  if (typeof requireStaff !== 'function') throw new Error('registerAlignVesselRoutes needs requireStaff');

  ensureDir();
  loadFiles();
  setInterval(persist, 2 * 60000).unref();
  process.on('beforeExit', persist);
  loadAllScopes().then(applyStreams).catch(() => applyStreams());
  console.log('[VESSEL] 🚢 vessel tracking routes registered (' + vessels.size + ' vessels in directory, key ' + (getKey() ? 'set' : 'not set') + ')');

  const fail = (res, e, code) => res.status(code || 500).json({ ok: false, error: sstr((e && e.message) || e, 240) });

  async function isAdmin(req) {
    if (!req.staff || req.staff.role !== 'owner') return false;
    const raw = String(req.headers['x-firebase-token'] || '').trim();
    if (!raw) return false;
    try {
      const d = await alignAuth().verifyIdToken(raw);
      return String(d.email || '').toLowerCase() === ADMIN_EMAIL;
    } catch (e) { return false; }
  }

  app.get(api + '/vessel/status', requireStaff, async (req, res) => {
    res.json(Object.assign({ ok: true, canConfigure: await isAdmin(req) }, status()));
  });

  app.post(api + '/vessel/config', requireStaff, async (req, res) => {
    try {
      if (!(await isAdmin(req))) return res.status(403).json({ ok: false, error: 'Only the main account owner can set the AIS key.' });
      const k = sstr(req.body && req.body.apiKey, 120).trim();
      if (k && !/^[A-Za-z0-9_-]{16,100}$/.test(k)) return res.status(400).json({ ok: false, error: 'That does not look like an AISStream API key.' });
      if (k) writeJson(KEY_FILE, { apiKey: k, savedAt: Date.now() }, 0o600);
      else { try { fs.unlinkSync(KEY_FILE); } catch (e) { /* none */ } }
      collector.stop(); tracker.stop();
      collector.st.lastError = ''; tracker.st.lastError = '';
      applyStreams();
      res.json(Object.assign({ ok: true }, status()));
    } catch (e) { fail(res, e); }
  });

  app.get(api + '/vessel/search', requireStaff, (req, res) => {
    try {
      const results = search(req.query.q);
      const st = status();
      res.json({ ok: true, results, directory: st.directory, configured: st.configured });
    } catch (e) { fail(res, e); }
  });

  app.get(api + '/vessel/tracked', requireStaff, async (req, res) => {
    try {
      const list = await loadScope(scopeOf(req));
      res.json({ ok: true, vessels: list.map(snapshot), status: status() });
    } catch (e) { fail(res, e); }
  });

  app.post(api + '/vessel/track', requireStaff, async (req, res) => {
    try {
      const b = req.body || {};
      const mmsi = sstr(b.mmsi, 12).trim();
      if (!/^\d{9}$/.test(mmsi)) return res.status(400).json({ ok: false, error: 'Choose a vessel from the list (it needs a 9-digit MMSI).' });
      if (!getKey()) return res.status(503).json({ ok: false, error: 'Live tracking is not switched on yet - the owner must add the AIS key first.' });
      const scope = scopeOf(req);
      const list = (await loadScope(scope)).slice();
      const rec = vessels.get(mmsi);
      const entry = {
        mmsi,
        name: sstr(b.name || (rec && rec.n), 80),
        imo: sstr(b.imo || (rec && rec.i), 10),
        voyage: sstr(b.voyage, 60).trim(),
        line: sstr(b.line, 80).trim(),
        expectedPort: sstr(b.expectedPort, 80).trim(),
        note: sstr(b.note, 200).trim(),
        addedAt: Date.now(),
        addedBy: sstr(req.staff && req.staff.name, 60)
      };
      const i = list.findIndex(v => String(v.mmsi) === mmsi);
      if (i >= 0) { entry.addedAt = list[i].addedAt || entry.addedAt; entry.addedBy = list[i].addedBy || entry.addedBy; list[i] = entry; }
      else {
        if (list.length >= MAX_TRACKED_PER_SCOPE) return res.status(400).json({ ok: false, error: 'You can track up to ' + MAX_TRACKED_PER_SCOPE + ' vessels. Remove one first.' });
        list.unshift(entry);
      }
      await saveScope(scope, list);
      res.json({ ok: true, vessel: snapshot(entry) });
    } catch (e) { fail(res, e); }
  });

  app.post(api + '/vessel/untrack', requireStaff, async (req, res) => {
    try {
      const mmsi = sstr(req.body && req.body.mmsi, 12).trim();
      const scope = scopeOf(req);
      const list = (await loadScope(scope)).filter(v => String(v.mmsi) !== mmsi);
      await saveScope(scope, list);
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });

  app.get(api + '/vessel/position', requireStaff, async (req, res) => {
    try {
      const mmsi = sstr(req.query.mmsi, 12).trim();
      const entry = (await loadScope(scopeOf(req))).find(v => String(v.mmsi) === mmsi);
      if (!entry) return res.status(404).json({ ok: false, error: 'This vessel is not in your tracked list.' });
      res.json(Object.assign({ ok: true }, snapshot(entry)));
    } catch (e) { fail(res, e); }
  });

  app.get(api + '/vessel/summary', requireStaff, async (req, res) => {
    try {
      const mmsi = sstr(req.query.mmsi, 12).trim();
      const entry = (await loadScope(scopeOf(req))).find(v => String(v.mmsi) === mmsi);
      if (!entry) return res.status(404).json({ ok: false, error: 'This vessel is not in your tracked list.' });
      res.json(Object.assign({ ok: true }, await aiSummary(snapshot(entry))));
    } catch (e) { fail(res, e); }
  });
}
