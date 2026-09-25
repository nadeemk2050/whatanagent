// ================= 🥇 GOLD MARKET AGENT =================
// Live international gold spot price (XAU/USD, $ per troy ounce) + one-time price alerts.
// Sources (both free, no API key): gold-api.com (primary) -> Swissquote public forex feed (fallback).
// The 60s scheduler tick on the ACTIVE node calls maybePoll(). One-time alerts auto-disable when
// they fire and are delivered to the Boss through the existing appData/bossNotifications -> WhatsApp
// delivery loop (so exactly one node ever sends them).
import { doc, getDoc, setDoc } from 'firebase/firestore';

let globalDb = null;
export function attachGoldDb(db) { if (db) globalDb = db; }

const STATE_DOC = ['appData', 'goldState'];          // last price + limits + history + config
const FAST_DOC = ['appData', 'goldPointsFast'];      // ~60s poll points (capped, ~24h)
const HOURLY_DOC = ['appData', 'goldPointsHourly'];  // hourly points (capped, ~33 days)
const FAST_CAP = 1600;
const HOURLY_CAP = 800;
const MIN_PRICE = 300, MAX_PRICE = 50000;   // sanity bounds ($/oz) - protects against bad API data

let polling = false;
let snapshotCache = { at: 0, data: null };

function dubaiTimeStr(ms) {
  try { return new Date(ms).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch (e) { return new Date(ms).toISOString(); }
}

async function fetchGoldPrice() {
  // 1) gold-api.com - free, no key, true spot XAU/USD
  try {
    const r = await fetch('https://api.gold-api.com/price/XAU', { signal: AbortSignal.timeout(12000), headers: { accept: 'application/json' } });
    if (r.ok) {
      const j = await r.json();
      const p = Number(j && j.price);
      if (p > MIN_PRICE && p < MAX_PRICE) return { price: p, src: 'gold-api.com', srcTs: Date.parse((j && j.updatedAt) || '') || Date.now() };
    }
  } catch (e) { /* fall through to next source */ }
  // 2) Swissquote public BBO feed (bid/ask -> mid)
  try {
    const r = await fetch('https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/XAU/USD', { signal: AbortSignal.timeout(12000) });
    if (r.ok) {
      const j = await r.json();
      const sp = j && j[0] && Array.isArray(j[0].spreadProfilePrices) ? j[0].spreadProfilePrices[0] : null;
      if (sp) {
        const mid = (Number(sp.bid) + Number(sp.ask)) / 2;
        if (mid > MIN_PRICE && mid < MAX_PRICE) return { price: mid, src: 'swissquote', srcTs: Date.now() };
      }
    }
  } catch (e) { /* no source available */ }
  return null;
}

async function readState() {
  try {
    const snap = await getDoc(doc(globalDb, ...STATE_DOC));
    return snap.exists() ? (snap.data() || {}) : {};
  } catch (e) { return {}; }
}

async function pushGoldNotification(text) {
  try {
    const ref = doc(globalDb, 'appData', 'bossNotifications');
    const snap = await getDoc(ref);
    const items = snap.exists() ? (snap.data().items || []) : [];
    items.push({ id: 'ntf-' + Date.now() + '-gold', text: text, createdAt: Date.now(), status: 'pending' });
    await setDoc(ref, { items: items.slice(-200) }, { merge: true });
  } catch (e) { console.warn('[GOLD] notification failed: ' + e.message); }
}

// Scheduled from the 60s tick (active node only). force=true for the dashboard Refresh button.
export async function goldMaybePoll(force = false) {
  if (!globalDb || polling) return null;
  polling = true;
  try {
    const st = await readState();
    const cfg = st.config || {};
    const pollSeconds = Math.min(3600, Math.max(30, Number(cfg.pollSeconds) || 60));
    const now = Date.now();
    if (!force && st.lastPollAt && (now - Number(st.lastPollAt)) < pollSeconds * 1000 * 0.9) return null;
    const q = await fetchGoldPrice();
    if (!q) { console.warn('[GOLD] no price source reachable'); return null; }
    const ts = now;

    // 1) fast series (one point per poll)
    try {
      const fRef = doc(globalDb, ...FAST_DOC);
      const fSnap = await getDoc(fRef);
      const pts = fSnap.exists() ? (fSnap.data().points || []) : [];
      pts.push({ t: ts, p: q.price });   // objects - Firestore forbids arrays inside arrays
      await setDoc(fRef, { points: pts.slice(-FAST_CAP), updatedAt: ts }, { merge: true });
    } catch (e) { /* ignore */ }

    // 2) hourly series (one point per new hour)
    try {
      const hKey = Math.floor(ts / 3600000);
      const hRef = doc(globalDb, ...HOURLY_DOC);
      const hSnap = await getDoc(hRef);
      const hd = hSnap.exists() ? (hSnap.data() || {}) : {};
      const hPts = hd.points || [];
      const lastKey = Number(hd.lastHourKey) || (hPts.length ? Math.floor((hPts[hPts.length - 1].t || 0) / 3600000) : 0);
      if (lastKey !== hKey) {
        hPts.push({ t: hKey * 3600000, p: q.price });   // objects - Firestore forbids arrays inside arrays
        await setDoc(hRef, { points: hPts.slice(-HOURLY_CAP), lastHourKey: hKey, updatedAt: ts }, { merge: true });
      }
    } catch (e) { /* ignore */ }

    // 3) evaluate ONE-TIME alerts (hit -> message boss -> auto-disable)
    const limits = Array.isArray(st.limits) ? st.limits.slice() : [];
    const history = Array.isArray(st.history) ? st.history.slice() : [];
    const alerts = [];
    for (const lim of limits) {
      if (!lim || !lim.active) continue;
      const target = Number(lim.price);
      if (!target) continue;
      const hit = lim.type === 'buy' ? (q.price <= target) : (q.price >= target);
      if (!hit) continue;
      lim.active = false;
      lim.hitAt = ts;
      lim.hitPrice = q.price;
      const label = lim.type === 'buy'
        ? ('🔻 BUY limit hit — price fell to *$' + target.toFixed(2) + '/oz*')
        : ('🔺 SELL limit hit — price rose to *$' + target.toFixed(2) + '/oz*');
      history.push({ id: lim.id, type: lim.type, price: target, hitPrice: q.price, at: ts, note: lim.note || '' });
      alerts.push('🚨 *GOLD PRICE ALERT* 🥇\n\n' + label +
        '\n💰 Spot price now: *$' + q.price.toFixed(2) + ' / oz*' +
        '\n🕒 ' + dubaiTimeStr(ts) + ' (Dubai)' +
        (lim.note ? ('\n📝 ' + lim.note) : '') +
        '\n\n🔕 One-time alert — it has turned itself off. Set a new one anytime.');
    }
    for (const a of alerts) await pushGoldNotification(a);

    // 4) save state
    await setDoc(doc(globalDb, ...STATE_DOC), {
      last: { price: q.price, ts: ts, src: q.src, srcTs: q.srcTs },
      lastPollAt: ts,
      limits: limits.slice(-200),
      history: history.slice(-100),
      updatedAt: ts
    }, { merge: true });
    snapshotCache = { at: ts, data: { price: q.price, ts: ts, src: q.src } };
    console.log('[GOLD] 🥇 $' + q.price.toFixed(2) + '/oz via ' + q.src + (alerts.length ? (' — ' + alerts.length + ' alert(s) fired') : ''));
    return { price: q.price, ts: ts, src: q.src, alerts: alerts.length };
  } finally { polling = false; }
}

// Light snapshot for prompts / quick checks (45s cache)
export async function goldSnapshot() {
  if (!globalDb) return null;
  const now = Date.now();
  if (snapshotCache.data && (now - snapshotCache.at) < 45000) {
    const d = snapshotCache.data;
    return { price: d.price, ts: d.ts, src: d.src, stale: (now - d.ts) > 15 * 60 * 1000 };
  }
  const st = await readState();
  const last = st.last || {};
  if (!last.price) return null;
  snapshotCache = { at: now, data: { price: Number(last.price), ts: Number(last.ts) || 0, src: last.src || '' } };
  const d = snapshotCache.data;
  return { price: d.price, ts: d.ts, src: d.src, stale: (now - d.ts) > 15 * 60 * 1000 };
}

// Boss WhatsApp commands: [GOLD: {...}] -> set_buy / set_sell / list / clear
export async function goldBossAction(p) {
  if (!globalDb) return { ok: false, error: 'No database connection' };
  const action = String((p && p.action) || '').toLowerCase();
  const st = await readState();
  const limits = Array.isArray(st.limits) ? st.limits.slice() : [];

  if (action === 'list' || action === 'show') {
    const active = limits.filter(l => l && l.active);
    const recent = (Array.isArray(st.history) ? st.history : []).slice(-5).reverse();
    const lines = [];
    lines.push(active.length
      ? ('🔔 *Active one-time gold alerts:*\n' + active.map(l => '• ' + (l.type === 'buy' ? '🔻 BUY' : '🔺 SELL') + ' at $' + Number(l.price).toFixed(2) + (l.note ? (' (' + l.note + ')') : '')).join('\n'))
      : '🔔 No active gold alerts.');
    if (recent.length) lines.push('🕘 *Recently hit:*\n' + recent.map(h => '• ' + (h.type === 'buy' ? 'BUY' : 'SELL') + ' $' + Number(h.price).toFixed(2) + ' → hit at $' + Number(h.hitPrice).toFixed(2)).join('\n'));
    return { ok: true, summary: lines.join('\n') };
  }

  if (action === 'clear' || action === 'remove' || action === 'delete') {
    const which = String(p.which || '').toLowerCase();
    let n = 0;
    for (const l of limits) {
      if (l && l.active && (!which || l.type === which)) { l.active = false; l.cancelled = true; n++; }
    }
    if (n) await setDoc(doc(globalDb, ...STATE_DOC), { limits: limits.slice(-200), updatedAt: Date.now() }, { merge: true });
    return { ok: true, summary: n ? ('🗑️ Cleared ' + n + ' gold alert(s).') : 'No active gold alerts to clear.' };
  }

  // set_buy / set_sell (also accept generic set/add with an explicit type)
  let type = '';
  if (action === 'set_buy' || action === 'buy') type = 'buy';
  else if (action === 'set_sell' || action === 'sell') type = 'sell';
  else if (action === 'set' || action === 'add' || action === 'alert') type = String(p.type || '').toLowerCase();
  if (type !== 'buy' && type !== 'sell') return { ok: false, error: 'Use action set_buy or set_sell with a price.' };
  const price = Number(p.price);
  if (!(price > MIN_PRICE && price < MAX_PRICE)) return { ok: false, error: 'Give a USD price between ' + MIN_PRICE + ' and ' + MAX_PRICE + ' per ounce.' };
  const lim = { id: 'glim-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6), type: type, price: price, note: String(p.note || '').substring(0, 120), active: true, createdBy: 'boss', createdAt: Date.now() };
  limits.push(lim);
  await setDoc(doc(globalDb, ...STATE_DOC), { limits: limits.slice(-200), updatedAt: Date.now() }, { merge: true });
  const word = type === 'buy' ? 'FALLS to' : 'RISES to';
  return { ok: true, summary: '🔔 One-time gold alert set: WhatsApp message when the price ' + word + ' *$' + price.toFixed(2) + '/oz*. (Turns off automatically after it fires.)', limit: lim };
}

function aggregateSeries(fastPts, hourlyPts, w) {
  const now = Date.now();
  const fastMap = { '5m': 5 * 60e3, '10m': 10 * 60e3, '15m': 15 * 60e3, '30m': 30 * 60e3, '1h': 3600e3, '24h': 24 * 3600e3 };
  const norm = (pts) => (pts || []).filter(p => p && typeof p.t === 'number').map(p => [Number(p.t), Number(p.p)]).filter(p => !isNaN(p[0]) && !isNaN(p[1]));
  if (fastMap[w]) {
    const cut = now - fastMap[w];
    return norm(fastPts).filter(p => p[0] >= cut);
  }
  if (w === '1w') return norm(hourlyPts).filter(p => p[0] >= now - 7 * 24 * 3600e3);
  if (w === '1M') return norm(hourlyPts).filter(p => p[0] >= now - 31 * 24 * 3600e3);
  return norm(fastPts).slice(-120);
}

export function registerGoldRoutes(app, db) {
  attachGoldDb(db);

  app.get('/api/gold', async (req, res) => {
    try {
      const st = await readState();
      const last = st.last || {};
      const now = Date.now();
      res.json({
        ok: true,
        last: last.price ? { price: Number(last.price), ts: Number(last.ts) || 0, src: last.src || '', stale: (now - (Number(last.ts) || 0)) > 15 * 60 * 1000 } : null,
        limits: Array.isArray(st.limits) ? st.limits : [],
        history: (Array.isArray(st.history) ? st.history : []).slice(-30).reverse(),
        config: st.config || {},
        lastPollAt: st.lastPollAt || 0
      });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.get('/api/gold/series', async (req, res) => {
    try {
      const w = String(req.query.w || '1h');
      const fSnap = await getDoc(doc(db, ...FAST_DOC));
      const hSnap = await getDoc(doc(db, ...HOURLY_DOC));
      const fast = fSnap.exists() ? (fSnap.data().points || []) : [];
      const hourly = hSnap.exists() ? (hSnap.data().points || []) : [];
      const points = aggregateSeries(fast, hourly, w).map(p => [Number(p[0]), Number(p[1])]);
      res.json({ ok: true, w: w, points: points });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.post('/api/gold/refresh', async (req, res) => {
    try { const r = await goldMaybePoll(true); res.json({ ok: true, poll: r }); }
    catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.post('/api/gold/limits', async (req, res) => {
    try {
      const b = req.body || {};
      const type = String(b.type || '').toLowerCase();
      const price = Number(b.price);
      if (type !== 'buy' && type !== 'sell') return res.status(400).json({ ok: false, error: 'type must be buy or sell' });
      if (!(price > MIN_PRICE && price < MAX_PRICE)) return res.status(400).json({ ok: false, error: 'price must be between ' + MIN_PRICE + ' and ' + MAX_PRICE });
      const st = await readState();
      const limits = Array.isArray(st.limits) ? st.limits.slice() : [];
      const lim = { id: 'glim-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6), type: type, price: price, note: String(b.note || '').substring(0, 120), active: true, createdBy: 'dashboard', createdAt: Date.now() };
      limits.push(lim);
      await setDoc(doc(db, ...STATE_DOC), { limits: limits.slice(-200), updatedAt: Date.now() }, { merge: true });
      res.json({ ok: true, limit: lim });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.post('/api/gold/limits/delete', async (req, res) => {
    try {
      const id = String((req.body || {}).id || '');
      if (!id) return res.status(400).json({ ok: false, error: 'id required' });
      const st = await readState();
      const limits = (Array.isArray(st.limits) ? st.limits : []).filter(l => l && l.id !== id);
      await setDoc(doc(db, ...STATE_DOC), { limits: limits.slice(-200), updatedAt: Date.now() }, { merge: true });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.post('/api/gold/config', async (req, res) => {
    try {
      const b = req.body || {};
      const st = await readState();
      const cfg = st.config || {};
      if (b.pollSeconds !== undefined) cfg.pollSeconds = Math.min(3600, Math.max(30, Number(b.pollSeconds) || 60));
      await setDoc(doc(db, ...STATE_DOC), { config: cfg, updatedAt: Date.now() }, { merge: true });
      res.json({ ok: true, config: cfg });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  console.log('[GOLD] 🥇 Gold Market API registered (live XAU/USD spot + one-time price alerts)');
  return { maybePoll: goldMaybePoll };
}
