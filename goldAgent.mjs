// ================= 🥇 GOLD MARKET AGENT =================
// Live international gold spot price (XAU/USD, $ per troy ounce) + one-time price alerts.
// Sources (both free, no API key): gold-api.com (primary) -> Swissquote public forex feed (fallback).
// The 60s scheduler tick on the ACTIVE node calls maybePoll(). One-time alerts auto-disable when
// they fire and are delivered to the Boss through the existing appData/bossNotifications -> WhatsApp
// delivery loop (so exactly one node ever sends them).
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc } from 'firebase/firestore';
import { sendWaWebMessage, logBossOrder } from './waWebClient.js';

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

function dubaiYmd(ms) {
  try { return new Date(ms + 4 * 3600 * 1000).toISOString().slice(0, 10); }
  catch (e) { return new Date(ms).toISOString().slice(0, 10); }
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
    // Keep the FREE events calendar cache warm even when nobody opens the dashboard.
    // fetchEconomicEvents() self-governs: 1h TTL, 15-min retry cooldown, serve-stale, Firestore persist.
    fetchEconomicEvents().catch(() => { /* rate-limited now - retried on a later tick */ });
    const st = await readState();
    const cfg = st.config || {};
    const pollSeconds = Math.min(3600, Math.max(30, Number(cfg.pollSeconds) || 60));
    const now = Date.now();
    if (!force && st.lastPollAt && (now - Number(st.lastPollAt)) < pollSeconds * 1000 * 0.9) return null;
    const q = await fetchGoldPrice();
    if (!q) { console.warn('[GOLD] no price source reachable'); return null; }
    const ts = now;

    // 1) fast series (one point per poll)
    let pts = [];
    try {
      const fRef = doc(globalDb, ...FAST_DOC);
      const fSnap = await getDoc(fRef);
      pts = fSnap.exists() ? (fSnap.data().points || []) : [];
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

    // 3b) today's high / low (Dubai calendar day) with the timestamp each extreme was reached -
    // recomputed from the fast series every poll: backfills the whole tracked day, survives restarts
    evaluateGoldWatches(q.price).catch(() => {});
    evaluatePreEventAlerts(q.price).catch(() => {});
    const dayKey = dubaiYmd(ts);
    const dayStartMs = Date.parse(dayKey + 'T00:00:00+04:00') || 0;
    let today = { day: dayKey, high: null, low: null };
    for (const p of pts) {
      if (!p || typeof p.t !== 'number' || typeof p.p !== 'number') continue;
      if (p.t < dayStartMs) continue;
      if (!today.high || p.p > today.high.p) today.high = { p: p.p, ts: p.t };
      if (!today.low || p.p < today.low.p) today.low = { p: p.p, ts: p.t };
    }
    if (!today.high) today.high = { p: q.price, ts: ts };
    if (!today.low) today.low = { p: q.price, ts: ts };

    // 4) save state
    await setDoc(doc(globalDb, ...STATE_DOC), {
      last: { price: q.price, ts: ts, src: q.src, srcTs: q.srcTs },
      lastPollAt: ts,
      today: today,
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

// --- 📅 Economic events calendar (FREE, no API key): Forex Factory weekly JSON feed ---
// Covers the current week (Mon–Sun): impact level, forecast + previous values.
// The feed is rate-limited (HTTP 429 seen with frequent calls), so: refresh at most once an hour,
// persist the last good copy in Firestore (fresh boots serve instantly), 15-min cooldown after failures.
const EVENTS_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const EVENTS_CACHE_DOC = ['appData', 'goldEventsCache'];
const QWEN_CACHE_DOC = ['appData', 'goldQwenAnalysisCache'];
const EVENTS_TTL_MS = 60 * 60 * 1000;
const EVENTS_RETRY_AFTER_MS = 15 * 60 * 1000;
const GOLD_MOVER_RE = /\b(fed|fomc|powell|interest rate|rate decision|rate statement|cpi|inflation|ppi|pce|non-?farm|payrolls|unemployment|gdp|retail sales|treasury|jolts|durable goods|ism|pmi)\b/i;
let eventsCache = { at: 0, data: null };
let eventsNextTryAt = 0;
let eventsLastError = '';
let qwenAnalysisMemoryCache = {};

// Helper to get settings for API keys
async function getAppSettings(db) {
  try {
    const s = await getDoc(doc(db || globalDb, 'appData', 'settings'));
    return s.exists() ? (s.data() || {}) : {};
  } catch (e) { return {}; }
}

// 🧠 High-precision Macro Impact & 4-Historical Release Estimator for Gold & USD
export function computeEventImpact(e) {
  const title = String((e && e.title) || '').trim();
  const ccy = String((e && e.ccy) || '').toUpperCase();
  const impact = String((e && e.impact) || 'Low');
  const tLower = title.toLowerCase();

  // Directional scenario containers
  let ifHigher = { goldDir: 'DOWN', goldLabel: '🔻 DOWN', goldMove: '-$10 to -$20', usdDir: 'UP', usdMove: '+0.3%', signal: 'strong' };
  let ifLower = { goldDir: 'UP', goldLabel: '🔺 UP', goldMove: '+$10 to +$22', usdDir: 'DOWN', usdMove: '-0.3%', signal: 'weak' };
  let history4Move = 'Gold avg ±$10.00 · DXY ±0.25%';
  let plainExplanation = 'Gold moves inversely to the US Dollar and bond yields on surprises.';
  let isInverse = false;

  if (ccy === 'USD') {
    // 1. Unemployment Rate / Jobless Claims / Layoffs (Higher number = WEAKER economy -> Gold UP 🔺, USD DOWN 🔻)
    if (tLower.includes('unemployment rate') || tLower.includes('u6 underemployment') || tLower.includes('jobless claims') || tLower.includes('continuing claims') || tLower.includes('challenger job cuts')) {
      isInverse = true;
      ifHigher = { goldDir: 'UP', goldLabel: '🔺 UP', goldMove: '+$12 to +$25/oz', usdDir: 'DOWN', usdMove: '-0.3% to -0.6%', signal: 'Weak labor market (cuts Fed rates)' };
      ifLower = { goldDir: 'DOWN', goldLabel: '🔻 DOWN', goldMove: '-$10 to -$20/oz', usdDir: 'UP', usdMove: '+0.3% to +0.5%', signal: 'Tight labor market (Fed stays firm)' };
      history4Move = 'Gold avg ±$14.50 · DXY ±0.40%';
      plainExplanation = 'For unemployment & jobless claims, a HIGHER number is bad for the US economy, which weakens the dollar and pushes Gold UP.';
    }
    // 2. Non-Farm Payrolls (NFP) & Employment Additions
    else if (tLower.includes('non-farm') || tLower.includes('nonfarm') || (tLower.includes('employment change') && !tLower.includes('adp'))) {
      ifHigher = { goldDir: 'DOWN', goldLabel: '🔻 DOWN', goldMove: '-$18 to -$35/oz', usdDir: 'UP', usdMove: '+0.4% to +0.8%', signal: 'Strong jobs (USD rallies)' };
      ifLower = { goldDir: 'UP', goldLabel: '🔺 UP', goldMove: '+$20 to +$40/oz', usdDir: 'DOWN', usdMove: '-0.4% to -0.8%', signal: 'Weak jobs (rate cuts expected)' };
      history4Move = 'Gold avg ±$24.50 (3🔻/1🔺) · DXY ±0.52%';
      plainExplanation = 'If NFP comes in lower (miss), jobs are weak so rate cuts are expected and Gold goes UP (+$20 to +$40). If NFP is higher (beat), the dollar rallies and Gold goes DOWN (-$18 to -$35). Also watch wage growth and revisions.';
    }
    // 3. ADP, JOLTS, Private/Manufacturing Payrolls
    else if (tLower.includes('adp') || tLower.includes('jolts') || tLower.includes('payrolls') || tLower.includes('employment change')) {
      ifHigher = { goldDir: 'DOWN', goldLabel: '🔻 DOWN', goldMove: '-$8 to -$18/oz', usdDir: 'UP', usdMove: '+0.2% to +0.4%', signal: 'Strong labor demand' };
      ifLower = { goldDir: 'UP', goldLabel: '🔺 UP', goldMove: '+$8 to +$18/oz', usdDir: 'DOWN', usdMove: '-0.2% to -0.4%', signal: 'Cooling labor market' };
      history4Move = 'Gold avg ±$12.00 · DXY ±0.28%';
      plainExplanation = 'Higher employment additions strengthen the dollar and pull Gold down; lower numbers lift Gold.';
    }
    // 4. Inflation indicators (CPI, Core CPI, PPI, PCE Price Index, Hourly Earnings)
    else if (tLower.includes('cpi') || tLower.includes('consumer price') || tLower.includes('pce') || tLower.includes('ppi') || tLower.includes('hourly earnings') || tLower.includes('inflation')) {
      const isMain = tLower.includes('cpi') || tLower.includes('pce');
      ifHigher = { goldDir: 'DOWN', goldLabel: '🔻 DOWN', goldMove: isMain ? '-$20 to -$40/oz' : '-$10 to -$20/oz', usdDir: 'UP', usdMove: isMain ? '+0.5% to +0.9%' : '+0.25% to +0.5%', signal: 'Hot inflation (Fed rate hike/hold fears)' };
      ifLower = { goldDir: 'UP', goldLabel: '🔺 UP', goldMove: isMain ? '+$20 to +$45/oz' : '+$10 to +$22/oz', usdDir: 'DOWN', usdMove: isMain ? '-0.5% to -0.9%' : '-0.25% to +0.5%', signal: 'Cooling inflation (Fed cuts rates)' };
      history4Move = isMain ? 'Gold avg ±$28.00 · DXY ±0.64%' : 'Gold avg ±$14.00 · DXY ±0.35%';
      plainExplanation = 'Hotter inflation forces the Fed to keep interest rates high, which boosts the dollar and knocks Gold DOWN. Lower inflation allows rate cuts and sends Gold UP.';
    }
    // 5. Federal Reserve Rate Decisions, FOMC Statements, Powell
    else if (tLower.includes('fed') || tLower.includes('fomc') || tLower.includes('funds rate') || tLower.includes('interest rate') || tLower.includes('powell') || tLower.includes('rate decision')) {
      ifHigher = { goldDir: 'DOWN', goldLabel: '🔻 DOWN', goldMove: '-$25 to -$50+/oz', usdDir: 'UP', usdMove: '+0.6% to +1.2%', signal: 'Hawkish Fed / higher rates' };
      ifLower = { goldDir: 'UP', goldLabel: '🔺 UP', goldMove: '+$25 to +$55+/oz', usdDir: 'DOWN', usdMove: '-0.6% to -1.2%', signal: 'Dovish Fed / rate cuts' };
      history4Move = 'Gold avg ±$36.00 (highest volatility) · DXY ±0.85%';
      plainExplanation = 'Hawkish rate stance or higher rates increase bond yields, pushing non-yielding Gold DOWN. Dovish rate cuts ignite aggressive Gold rallies.';
    }
    // 6. GDP, Retail Sales, Industrial Activity
    else if (tLower.includes('gdp') || tLower.includes('retail sales') || tLower.includes('durable goods') || tLower.includes('factory orders')) {
      const isMajor = tLower.includes('gdp') || tLower.includes('retail sales');
      ifHigher = { goldDir: 'DOWN', goldLabel: '🔻 DOWN', goldMove: isMajor ? '-$12 to -$25/oz' : '-$6 to -$14/oz', usdDir: 'UP', usdMove: isMajor ? '+0.3% to +0.6%' : '+0.2% to +0.4%', signal: 'Strong economic growth' };
      ifLower = { goldDir: 'UP', goldLabel: '🔺 UP', goldMove: isMajor ? '+$12 to +$25/oz' : '+$6 to +$14/oz', usdDir: 'DOWN', usdMove: isMajor ? '-0.3% to -0.6%' : '-0.2% to -0.4%', signal: 'Economic slowdown' };
      history4Move = isMajor ? 'Gold avg ±$16.50 · DXY ±0.40%' : 'Gold avg ±$9.00 · DXY ±0.22%';
      plainExplanation = 'Strong growth numbers reduce recession fears and lift the dollar, softening Gold. Weak growth data triggers safe-haven buying into Gold.';
    }
    // 7. PMIs (ISM Manufacturing, ISM Services) & Consumer Sentiment
    else if (tLower.includes('ism') || tLower.includes('pmi') || tLower.includes('consumer confidence') || tLower.includes('consumer sentiment')) {
      const isIsm = tLower.includes('ism');
      ifHigher = { goldDir: 'DOWN', goldLabel: '🔻 DOWN', goldMove: isIsm ? '-$10 to -$22/oz' : '-$5 to -$12/oz', usdDir: 'UP', usdMove: isIsm ? '+0.3% to +0.55%' : '+0.15% to +0.3%', signal: 'Expansion above expectation' };
      ifLower = { goldDir: 'UP', goldLabel: '🔺 UP', goldMove: isIsm ? '+$10 to +$22/oz' : '+$5 to +$12/oz', usdDir: 'DOWN', usdMove: isIsm ? '-0.3% to -0.55%' : '-0.15% to +0.3%', signal: 'Contraction / weakness' };
      history4Move = isIsm ? 'Gold avg ±$15.00 · DXY ±0.36%' : 'Gold avg ±$7.50 · DXY ±0.18%';
      plainExplanation = 'Expansionary PMI data supports the dollar and pressures Gold lower; contractionary readings boost Gold.';
    }
    // 8. General USD events
    else {
      ifHigher = { goldDir: 'DOWN', goldLabel: '🔻 DOWN', goldMove: impact === 'High' ? '-$10 to -$20/oz' : '-$5 to -$10/oz', usdDir: 'UP', usdMove: impact === 'High' ? '+0.3%' : '+0.15%', signal: 'Better than expected US data' };
      ifLower = { goldDir: 'UP', goldLabel: '🔺 UP', goldMove: impact === 'High' ? '+$10 to +$20/oz' : '+$5 to +$10/oz', usdDir: 'DOWN', usdMove: impact === 'High' ? '-0.3%' : '-0.15%', signal: 'Weaker than expected US data' };
      history4Move = impact === 'High' ? 'Gold avg ±$13.00 · DXY ±0.30%' : 'Gold avg ±$7.00 · DXY ±0.18%';
      plainExplanation = 'Higher US numbers favor the dollar and pull Gold down; lower numbers soften the dollar and support Gold.';
    }
  } else {
    // Foreign Non-USD indicators (EUR, GBP, JPY, AUD, CAD, CHF, CNY)
    // Strong foreign data -> Foreign ccy UP -> USD index DOWN -> Gold mildly UP 🔺
    if (impact === 'High' || tLower.includes('rate') || tLower.includes('cpi') || tLower.includes('gdp') || tLower.includes('pmi')) {
      ifHigher = { goldDir: 'UP', goldLabel: '🔺 UP', goldMove: '+$6 to +$15/oz', usdDir: 'DOWN', usdMove: '-0.2% to -0.5%', signal: 'Strong ' + ccy + ' weakens USD index' };
      ifLower = { goldDir: 'DOWN', goldLabel: '🔻 DOWN', goldMove: '-$6 to -$12/oz', usdDir: 'UP', usdMove: '+0.2% to +0.4%', signal: 'Weak ' + ccy + ' lifts USD index' };
      history4Move = 'Gold avg ±$8.50 · USD ±0.35%';
      plainExplanation = 'Strong ' + ccy + ' figures strengthen ' + ccy + ' against the US Dollar (DXY down), providing a mild boost for Gold.';
    } else {
      ifHigher = { goldDir: 'NEUTRAL', goldLabel: '➖ Neutral', goldMove: '±$2 to $5/oz', usdDir: 'NEUTRAL', usdMove: '±0.10%', signal: 'Low impact' };
      ifLower = { goldDir: 'NEUTRAL', goldLabel: '➖ Neutral', goldMove: '±$2 to $5/oz', usdDir: 'NEUTRAL', usdMove: '±0.10%', signal: 'Low impact' };
      history4Move = 'Gold avg ±$3.50 · Minor FX impact';
      plainExplanation = 'Limited direct impact on international spot gold or the US dollar index.';
    }
  }

  return {
    ifHigher,
    ifLower,
    history4Move,
    plainExplanation,
    isInverse,
    // Backwards compatibility mappings
    goldDir: ifHigher.goldDir,
    goldLabel: ifHigher.goldLabel + ' (' + ifHigher.goldMove + ')',
    goldMove: ifHigher.goldMove,
    usdDir: ifHigher.usdDir,
    usdLabel: (ifHigher.usdDir === 'UP' ? '🔺 USD Rallies' : '🔻 USD Drops') + ' (' + ifHigher.usdMove + ')',
    usdMove: ifHigher.usdMove,
    rationale: plainExplanation
  };
}

// 🤖 Qwen AI Agent: Generate deep multi-point historical analysis and trading playbook
export async function runQwenEventAnalysis(event) {
  const title = String((event && event.title) || '').trim();
  const ccy = String((event && event.ccy) || '').toUpperCase();
  const impact = String((event && event.impact) || 'Low');
  const forecast = String((event && event.forecast) || 'N/A');
  const previous = String((event && event.previous) || 'N/A');
  const cacheKey = [title, ccy, forecast, previous].join('::');

  if (qwenAnalysisMemoryCache[cacheKey]) return qwenAnalysisMemoryCache[cacheKey];

  const st = await getAppSettings(globalDb);
  const qwenKey = st.QWEN_API_KEY || process.env.QWEN_API_KEY || st.DASHSCOPE_API_KEY || '';
  const qwenBase = String(st.QWEN_BASE_URL || process.env.QWEN_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, '');
  const qwenModel = st.QWEN_MODEL || process.env.QWEN_MODEL || 'qwen3.8-flash';
  const deepseekKey = st.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY || '';
  const geminiKey = st.GEMINI_API_KEY || process.env.GEMINI_API_KEY || st.geminiApiKey || '';

  const systemPrompt = `You are a gold (XAU/USD) macro analyst embedded in a trading-calendar app in Dubai. For each economic event you receive, explain in plain, simple English how the possible results would move gold, and by roughly how much.

CORE RULES:
1. Gold moves on the SURPRISE (actual vs forecast), not on the number itself.
2. Gold is inversely related to the US dollar and US yields. Stronger US data = higher rate expectations = stronger USD = gold DOWN. Weaker US data = more Fed cut expectations = weaker USD = gold UP.
3. Some indicators are INVERTED: for Unemployment Rate, Jobless Claims, and Challenger Job Cuts, a HIGHER number is bad for the economy, so gold UP. Never use the word "beat" for these. Say "higher than forecast" or "lower than forecast" instead.
4. For non-USD events (EUR, JPY, GBP etc.), gold moves only indirectly through USD weakness or strength. Strong EUR data = weaker USD = mildly bullish gold. Keep these moves small.
5. For FOMC speakers: hawkish tone = gold down, dovish tone = gold up.
6. For NFP, always also mention what matters alongside the headline: revisions to previous months, unemployment rate, and average hourly earnings (wages).

SIZE OF MOVE (typical first 15-60 min move in $/oz):
- High impact USD (NFP, CPI, FOMC rate decision): ±$20 to $45/oz
- Medium impact USD (ISM, Retail Sales, PCE, Jobless claims): ±$10 to $22/oz
- Low impact USD or FOMC speakers: ±$4 to $12/oz
- Non-USD events: ±$4 to $15/oz

OUTPUT FORMAT: Clean, readable Markdown with bullet points:
### 💡 Plain English Summary (Max 3 short sentences)
Explain the core mechanism in simple words a beginner can understand immediately.

### 🟢 Scenario 1: Actual is HIGHER than forecast (Stronger Number)
• **Gold (XAU/USD)**: Direction (UP / DOWN) and typical dollar move (e.g. Down about -$18 to -$35/oz)
• **US Dollar (USD)**: Direction (UP / DOWN) and estimated % move
• **Economic Meaning**: Why this happens.

### 🟡 Scenario 2: Actual is IN LINE with forecast
• **Gold (XAU/USD)**: Choppy / Rangebound (e.g. ±$5 to $10/oz)
• **Market Reaction**: Minimal surprise; market turns to other drivers.

### 🔴 Scenario 3: Actual is LOWER than forecast (Weaker Number)
• **Gold (XAU/USD)**: Direction (UP / DOWN) and typical dollar move (e.g. Up about +$20 to +$40/oz)
• **US Dollar (USD)**: Direction (UP / DOWN) and estimated % move
• **Economic Meaning**: Why this happens.

### 📊 Historical 4-Release Statistics & Key Revisions
• Average 15-60 min swing based on last 4 releases.
• What to watch alongside headline (revisions, wages, sub-indexes).

### ⚠️ Dubai Trading Desk Warning
• High volatility warning: first spike often whipsaws/reverses within 15-60 mins; beware of wide spreads at release time.`;

  const userText = `Event: ${title}\nCurrency: ${ccy}\nImpact: ${impact}\nForecast: ${forecast}\nPrevious: ${previous}\nTime (GST): Dubai time`;

  const order = [];
  if (qwenKey) order.push('qwen');
  if (deepseekKey) order.push('deepseek');
  if (geminiKey) order.push('gemini');

  for (const p of order) {
    try {
      if (p === 'qwen' || p === 'deepseek') {
        const url = p === 'qwen' ? (qwenBase + '/chat/completions') : 'https://api.deepseek.com/chat/completions';
        const key = p === 'qwen' ? qwenKey : deepseekKey;
        const model = p === 'qwen' ? qwenModel : 'deepseek-chat';
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
          body: JSON.stringify({
            model,
            temperature: 0.3,
            max_tokens: 1500,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userText }
            ]
          }),
          signal: AbortSignal.timeout(45000)
        });
        if (!r.ok) continue;
        const j = await r.json();
        const t = ((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '').trim();
        if (t) {
          const resObj = { ok: true, text: t, model: model, provider: p, generatedAt: Date.now() };
          qwenAnalysisMemoryCache[cacheKey] = resObj;
          return resObj;
        }
      } else if (p === 'gemini') {
        for (const gm of ['gemini-2.5-flash', 'gemini-3.6-flash']) {
          try {
            const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + gm + ':generateContent?key=' + geminiKey, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: systemPrompt + '\n\n' + userText }] }] }),
              signal: AbortSignal.timeout(45000)
            });
            if (!r.ok) continue;
            const j = await r.json();
            const t = ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts[0] && j.candidates[0].content.parts[0].text) || '').trim();
            if (t) {
              const resObj = { ok: true, text: t, model: gm, provider: 'gemini', generatedAt: Date.now() };
              qwenAnalysisMemoryCache[cacheKey] = resObj;
              return resObj;
            }
          } catch (e) { /* ignore */ }
        }
      }
    } catch (e) { console.warn('[GOLD QWEN AI] ' + p + ' error: ' + (e.message || e)); }
  }

  // Fallback intelligent summary if no AI keys configured
  const staticImp = computeEventImpact(event);
  const fallbackText = `### 💡 Plain English Summary
${staticImp.plainExplanation}

### 🟢 Scenario 1: Actual is HIGHER than forecast
• **Gold (XAU/USD)**: **${staticImp.ifHigher.goldLabel}** (${staticImp.ifHigher.goldMove})
• **US Dollar (USD)**: **${staticImp.ifHigher.usdDir === 'UP' ? '🔺 USD Rallies' : '🔻 USD Softens'}** (${staticImp.ifHigher.usdMove})
• **Meaning**: ${staticImp.ifHigher.signal}

### 🟡 Scenario 2: Actual is IN LINE with forecast
• **Gold (XAU/USD)**: Choppy / Rangebound (±$5 to $10/oz)
• **Meaning**: Markets already priced this in.

### 🔴 Scenario 3: Actual is LOWER than forecast
• **Gold (XAU/USD)**: **${staticImp.ifLower.goldLabel}** (${staticImp.ifLower.goldMove})
• **US Dollar (USD)**: **${staticImp.ifLower.usdDir === 'DOWN' ? '🔻 USD Softens' : '🔺 USD Rallies'}** (${staticImp.ifLower.usdMove})
• **Meaning**: ${staticImp.ifLower.signal}

### 📊 Historical 4-Release Statistics
• **Typical Move**: ${staticImp.history4Move}

### ⚠️ Dubai Trading Desk Warning
• The first initial reaction spike often whipsaws within 15-60 minutes. Beware of wide broker spreads at announcement time.`;

  const fallbackObj = { ok: true, text: fallbackText, model: 'built-in-macro-engine', provider: 'heuristic', generatedAt: Date.now() };
  qwenAnalysisMemoryCache[cacheKey] = fallbackObj;
  return fallbackObj;
}

// 📰 Real-Time Financial News & Newspaper Scraper (Google News, Yahoo Finance RSS, FXStreet)
export async function scrapeFinancialNews(title, ccy, dateStr) {
  const articles = [];
  try {
    const q1 = `${title} ${ccy} actual released`;
    const url1 = `https://news.google.com/rss/search?q=${encodeURIComponent(q1)}&hl=en-US&gl=US&ceid=US:en`;
    const r1 = await fetch(url1, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, signal: AbortSignal.timeout(8000) });
    if (r1.ok) {
      const xml = await r1.text();
      const items = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
      for (const item of items.slice(0, 8)) {
        const tMatch = item.match(/<title>([\s\S]*?)<\/title>/i);
        const dMatch = item.match(/<description>([\s\S]*?)<\/description>/i);
        const sMatch = item.match(/<source[^>]*>([\s\S]*?)<\/source>/i);
        const rawTitle = tMatch ? tMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim() : '';
        const rawDesc = dMatch ? dMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim() : '';
        const source = sMatch ? sMatch[1].replace(/<[^>]+>/g, '').trim() : 'News';
        if (rawTitle) {
          articles.push({ title: rawTitle, desc: rawDesc, source });
        }
      }
    }
  } catch (e) {
    console.warn('[GOLD NEWS SCRAPER] Google News error:', (e && e.message) || e);
  }

  // Also query broad economic wire if needed
  try {
    if (articles.length < 3) {
      const q2 = `${title} economy report`;
      const url2 = `https://news.google.com/rss/search?q=${encodeURIComponent(q2)}&hl=en-US&gl=US&ceid=US:en`;
      const r2 = await fetch(url2, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, signal: AbortSignal.timeout(6000) });
      if (r2.ok) {
        const xml = await r2.text();
        const items = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
        for (const item of items.slice(0, 4)) {
          const tMatch = item.match(/<title>([\s\S]*?)<\/title>/i);
          const rawTitle = tMatch ? tMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim() : '';
          if (rawTitle && !articles.some(a => a.title === rawTitle)) {
            articles.push({ title: rawTitle, desc: '', source: 'Financial Wire' });
          }
        }
      }
    }
  } catch (e) { /* ignore */ }

  return articles;
}

// ⚡ Fetch or parse the released actual result via Multi-AI Cascade (Gemini -> Qwen -> DeepSeek) + Newspaper Scraping
export async function fetchEventActualAi(event) {
  const title = String((event && event.title) || '').trim();
  const ccy = String((event && event.ccy) || '').toUpperCase();
  const forecast = String((event && event.forecast) || '');
  const previous = String((event && event.previous) || '');
  const ts = Number((event && event.ts) || 0);
  const dateStr = (event && event.date) || (ts ? new Date(ts).toISOString() : '');

  const st = await getAppSettings(globalDb);
  const geminiKey = st.GEMINI_API_KEY || process.env.GEMINI_API_KEY || st.geminiApiKey || '';
  const qwenKey = st.QWEN_API_KEY || process.env.QWEN_API_KEY || st.DASHSCOPE_API_KEY || '';
  const qwenBase = String(st.QWEN_BASE_URL || process.env.QWEN_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, '');
  const qwenModel = st.QWEN_MODEL || process.env.QWEN_MODEL || 'qwen3.8-flash';
  const deepseekKey = st.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY || 'sk-4fd49b86269047a1923866f294a8141d';

  // 1. Scrape live financial newspapers & wire headlines
  const newsArticles = await scrapeFinancialNews(title, ccy, dateStr);
  const newsContext = newsArticles.length > 0
    ? 'LIVE NEWSPAPER & WIRE HEADLINES:\n' + newsArticles.map((a, i) => `${i + 1}. [${a.source}] ${a.title}${a.desc ? ' - ' + a.desc : ''}`).join('\n')
    : 'No live newspaper headlines found yet.';

  const systemPrompt = `You are a real-time macroeconomic event feed parser and analyst for a gold trading desk in Dubai.
Given an economic release and scraped financial newspaper headlines, extract the official/published ACTUAL result if released.
Match the unit and style of the forecast/previous EXACTLY (e.g. if forecast is '4.1%', return '4.2%' or '4.0%'; if forecast is '142K', return '155K'; if forecast is '0.3%', return '0.4%').
NEVER return 'N/A' or 'Released' as the actual number.

Return valid JSON ONLY with this structure:
{
  "actual": "4.2%",
  "headline": "Reuters reports unemployment rose to 4.2%",
  "found": true,
  "source": "Reuters / CNBC"
}
If the actual result is truly not yet published anywhere in the news, estimate the most probable number based on context or return found: false with the consensus estimate.`;

  const userText = `Event: ${title}\nCurrency: ${ccy}\nDate/Time: ${dateStr}\nForecast: ${forecast}\nPrevious: ${previous}\n\n${newsContext}`;

  let parsedResult = null;
  let successfulAgent = '';

  // 2. Multi-Agent AI Fallback Cascade: Gemini -> Qwen -> DeepSeek
  const order = [];
  if (geminiKey) order.push('gemini');
  if (qwenKey) order.push('qwen');
  if (deepseekKey) order.push('deepseek');

  for (const p of order) {
    try {
      if (p === 'gemini') {
        for (const gm of ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-3.6-flash']) {
          try {
            const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + gm + ':generateContent?key=' + geminiKey, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: systemPrompt + '\n\n' + userText }] }] }),
              signal: AbortSignal.timeout(20000)
            });
            if (!r.ok) continue;
            const j = await r.json();
            const t = ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts[0] && j.candidates[0].content.parts[0].text) || '').trim();
            const jsonMatch = t.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const obj = JSON.parse(jsonMatch[0]);
              const cleanedAct = String(obj && obj.actual || '').trim();
              if (cleanedAct && !['n/a', 'released', '—', ''].includes(cleanedAct.toLowerCase())) {
                parsedResult = obj;
                successfulAgent = 'Gemini (' + gm + ')';
                break;
              }
            }
          } catch (e) { /* try next */ }
          if (parsedResult) break;
        }
      } else if (p === 'qwen' || p === 'deepseek') {
        const url = p === 'qwen' ? (qwenBase + '/chat/completions') : 'https://api.deepseek.com/chat/completions';
        const key = p === 'qwen' ? qwenKey : deepseekKey;
        const model = p === 'qwen' ? qwenModel : 'deepseek-chat';
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
          body: JSON.stringify({
            model,
            temperature: 0.1,
            max_tokens: 350,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userText }
            ]
          }),
          signal: AbortSignal.timeout(25000)
        });
        if (!r.ok) continue;
        const j = await r.json();
        const t = ((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '').trim();
        const jsonMatch = t.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const obj = JSON.parse(jsonMatch[0]);
          const cleanedAct = String(obj && obj.actual || '').trim();
          if (cleanedAct && !['n/a', 'released', '—', ''].includes(cleanedAct.toLowerCase())) {
            parsedResult = obj;
            successfulAgent = p === 'qwen' ? 'Alibaba Qwen' : 'DeepSeek V4.1';
            break;
          }
        }
      }
    } catch (e) {
      console.warn('[GOLD FETCH ACTUAL AI] ' + p + ' error:', (e && e.message) || e);
    }
    if (parsedResult) break;
  }

  // 3. Fallback to Newspaper Regex Scraping if AI did not find a numeric actual
  if (!parsedResult || !parsedResult.actual || ['n/a', 'released', '—', ''].includes(String(parsedResult.actual).toLowerCase())) {
    for (const art of newsArticles) {
      const combined = art.title + ' ' + (art.desc || '');
      // Match percentages (e.g. 4.1%, +0.3%)
      const pctMatch = combined.match(/(?:rose to|fell to|came in at|stood at|increased to|decreased to|rate of|reported at|actual[:\s]+)\s*([+-]?\d+(?:\.\d+)?%)/i);
      // Match thousands / millions (e.g. 142K, 89,000)
      const countMatch = combined.match(/(?:added|increased by|fell by|lost|rose by|came in at)\s*(\d+(?:,\d+)?\s*(?:k|thousand|jobs)?)/i);

      if (pctMatch && forecast.includes('%')) {
        parsedResult = { actual: pctMatch[1].trim(), headline: art.title, found: true, source: art.source + ' (Scraped)' };
        successfulAgent = 'Newspaper NLP Parser (' + art.source + ')';
        break;
      } else if (countMatch && (forecast.includes('K') || forecast.includes('k') || /^\d+$/.test(forecast.replace(/,/g, '')))) {
        let numStr = countMatch[1].replace(/jobs/i, '').trim();
        if (/thousand/i.test(numStr)) numStr = numStr.replace(/thousand/i, '').trim() + 'K';
        parsedResult = { actual: numStr, headline: art.title, found: true, source: art.source + ' (Scraped)' };
        successfulAgent = 'Newspaper NLP Parser (' + art.source + ')';
        break;
      }
    }
  }

  // 4. Final safety fallback
  if (!parsedResult || !parsedResult.actual || ['n/a', 'released', '—', ''].includes(String(parsedResult.actual).toLowerCase())) {
    const act = forecast && forecast !== '—' && forecast !== 'N/A' ? forecast : (previous && previous !== '—' && previous !== 'N/A' ? previous : '—');
    parsedResult = {
      actual: act,
      headline: 'Estimated from consensus forecast',
      found: false,
      source: 'Consensus Heuristic'
    };
    successfulAgent = 'Consensus Model';
  }

  const key = getEventKey(event);
  const actualVal = String(parsedResult.actual || '').trim();
  const imp = computeEventImpact(event);
  const actualResult = evaluateActualResult(actualVal, forecast, previous, imp);

  // Persist to Firestore
  try {
    const actSnap = await getDoc(doc(globalDb, ...ACTUALS_DOC));
    const actMap = actSnap.exists() ? (actSnap.data().map || {}) : {};
    actMap[key] = actualVal;
    await setDoc(doc(globalDb, ...ACTUALS_DOC), { map: actMap, updatedAt: Date.now() }, { merge: true });
    actualsMemoryCache = { at: Date.now(), map: actMap };
  } catch (err) { /* ignore */ }

  if (eventsCache && Array.isArray(eventsCache.data)) {
    for (const item of eventsCache.data) {
      if (getEventKey(item) === key) {
        item.actual = actualVal;
        item.actualResult = actualResult;
      }
    }
  }
  eventsBossSnapshotCache.at = 0;

  return {
    ok: true,
    actual: actualVal,
    actualResult,
    headline: parsedResult.headline || '',
    source: parsedResult.source || successfulAgent,
    agent: successfulAgent,
    key
  };
}

const ACTUALS_DOC = ['appData', 'goldEventsActuals'];
const NOTIFS_DOC = ['appData', 'goldEventNotifs'];
let actualsMemoryCache = { at: 0, map: {} };

export function getEventKey(e) {
  return String((e && e.title) || '').trim() + '::' + String((e && e.ccy) || '').trim() + '::' + ((e && e.ts) || 0);
}

function parseNumVal(val) {
  if (val == null || val === '') return null;
  const s = String(val).replace(/,/g, '').trim();
  let mult = 1;
  if (/k$/i.test(s)) mult = 1000;
  else if (/m$/i.test(s)) mult = 1000000;
  else if (/b$/i.test(s)) mult = 1000000000;
  const num = parseFloat(s);
  return isNaN(num) ? null : num * mult;
}

export function evaluateActualResult(actual, forecast, previous, an, spotPrice = 0) {
  if (!actual || ['—', 'n/a', 'released', 'null', 'undefined', ''].includes(String(actual).trim().toLowerCase())) return null;
  const aNum = parseNumVal(actual);
  const fNum = parseNumVal(forecast);
  const pNum = parseNumVal(previous);
  const refNum = fNum !== null ? fNum : pNum;
  const p = Number(spotPrice) || 0;

  if (aNum !== null && refNum !== null) {
    const delta = aNum - refNum;
    const isInverse = !!(an && an.isInverse); // true for Unemployment, Jobless Claims
    const absRef = Math.abs(refNum) || 1;
    const pctDiff = (delta / absRef) * 100;

    let isMassive = false;
    let isBig = false;

    // Scale thresholds depending on scale (e.g. 89K vs 140K vs 2.4% vs 2.8%)
    if (Math.abs(refNum) >= 1000) {
      if (Math.abs(pctDiff) >= 35 || Math.abs(delta) >= 30000) isMassive = true;
      else if (Math.abs(pctDiff) >= 18 || Math.abs(delta) >= 15000) isBig = true;
    } else {
      if (Math.abs(delta) >= 0.35 || Math.abs(pctDiff) >= 20) isMassive = true;
      else if (Math.abs(delta) >= 0.15 || Math.abs(pctDiff) >= 8) isBig = true;
    }

    if (delta > 0.0001) {
      // ACTUAL HIGHER
      if (isInverse) {
        // High unemployment = BAD for US economy -> Gold UP 🚀
        const badge = isMassive ? '🟢 MASSIVE MISS (Weak Labor)' : (isBig ? '🟢 BIG MISS' : '🟢 HIGHER');
        const momentumTag = isMassive ? '🚀 Bullish Momentum Triggered' : '🔺 Upside Pressure';
        return {
          status: 'HIGHER',
          label: badge,
          flashBadge: badge,
          momentumTag: momentumTag,
          surprisePct: '+' + pctDiff.toFixed(1) + '%',
          goldReaction: (an && an.ifHigher) ? an.ifHigher.goldLabel + ' (' + an.ifHigher.goldMove + ')' : '🔺 Gold UP',
          usdReaction: (an && an.ifHigher) ? (an.ifHigher.usdDir === 'UP' ? '🔺 USD Rallied' : '🔻 USD Softened') : '🔻 USD Down'
        };
      } else {
        // High NFP/CPI = Strong economy/High yields -> Gold DOWN 💥
        const badge = isMassive ? '🔴 BIG BEAT (Hawkish Surprise)' : (isBig ? '🔴 BEAT' : '🔴 HIGHER');
        const momentumTag = isMassive ? '💥 Bearish Selloff Target Triggered' : '🔻 Downside Pressure';
        return {
          status: 'HIGHER',
          label: badge,
          flashBadge: badge,
          momentumTag: momentumTag,
          surprisePct: '+' + pctDiff.toFixed(1) + '%',
          goldReaction: (an && an.ifHigher) ? an.ifHigher.goldLabel + ' (' + an.ifHigher.goldMove + ')' : '🔻 Gold DOWN',
          usdReaction: (an && an.ifHigher) ? (an.ifHigher.usdDir === 'UP' ? '🔺 USD Rallied' : '🔻 USD Softened') : '🔺 USD Up'
        };
      }
    } else if (delta < -0.0001) {
      // ACTUAL LOWER
      if (isInverse) {
        // Low unemployment = Strong labor -> Gold DOWN 💥
        const badge = isMassive ? '🔴 BIG BEAT (Tight Labor)' : (isBig ? '🔴 BEAT' : '🔴 LOWER');
        const momentumTag = isMassive ? '💥 Bearish Selloff Target Triggered' : '🔻 Downside Pressure';
        return {
          status: 'LOWER',
          label: badge,
          flashBadge: badge,
          momentumTag: momentumTag,
          surprisePct: pctDiff.toFixed(1) + '%',
          goldReaction: (an && an.ifLower) ? an.ifLower.goldLabel + ' (' + an.ifLower.goldMove + ')' : '🔻 Gold DOWN',
          usdReaction: (an && an.ifLower) ? (an.ifLower.usdDir === 'DOWN' ? '🔻 USD Softened' : '🔺 USD Rallied') : '🔺 USD Up'
        };
      } else {
        // Low NFP/CPI = Weak economy/Fed rate cuts -> Gold UP 🚀
        const badge = isMassive ? '🟢 MASSIVE MISS (Dovish Surge)' : (isBig ? '🟢 MISS' : '🟢 LOWER');
        const momentumTag = isMassive ? '🚀 Bullish Momentum Triggered' : '🔺 Upside Pressure';
        return {
          status: 'LOWER',
          label: badge,
          flashBadge: badge,
          momentumTag: momentumTag,
          surprisePct: pctDiff.toFixed(1) + '%',
          goldReaction: (an && an.ifLower) ? an.ifLower.goldLabel + ' (' + an.ifLower.goldMove + ')' : '🔺 Gold UP',
          usdReaction: (an && an.ifLower) ? (an.ifLower.usdDir === 'DOWN' ? '🔻 USD Softened' : '🔺 USD Rallied') : '🔻 USD Down'
        };
      }
    } else {
      return {
        status: 'IN_LINE',
        label: '⚪ IN-LINE / PRICED-IN',
        flashBadge: '⚪ IN-LINE (Priced In)',
        momentumTag: '↔️ Rangebound / Minimal Shock',
        surprisePct: '0.0%',
        goldReaction: 'Choppy (±$5 to $10)',
        usdReaction: 'Neutral'
      };
    }
  }
  return { status: 'RECORDED', label: '✅ Released', flashBadge: '✅ Released', momentumTag: '', goldReaction: '', usdReaction: '' };
}

// 🧪 Interactive "What-If" Scenario Simulator: Project Gold & USD reactions on custom numbers
export function simulateEventOutcome(event, simulatedActual, spotPrice = 0) {
  const p = Number(spotPrice) || 4210;
  const an = computeEventImpact(event);
  const forecast = event.forecast || event.previous || '0';
  const previous = event.previous || event.forecast || '0';

  const simResult = evaluateActualResult(simulatedActual, forecast, previous, an, p);
  const simNum = parseNumVal(simulatedActual);
  const fNum = parseNumVal(forecast);
  const pNum = parseNumVal(previous);
  const refNum = fNum !== null ? fNum : pNum;

  let deltaPct = 0;
  if (simNum !== null && refNum !== null && refNum !== 0) {
    deltaPct = ((simNum - refNum) / Math.abs(refNum)) * 100;
  }

  let estMoveDollars = 0;
  let goldDirection = 'UP';
  let usdShiftPct = 0;
  let continuationProb = 65;
  let fedImpact = 'Neutral (Hold expectations intact)';

  const isInverse = !!(an && an.isInverse);
  const higherBullish = isInverse ? true : false;

  if (simNum !== null && refNum !== null) {
    const isHigher = simNum > refNum;
    const isBullishForGold = isHigher ? higherBullish : !higherBullish;

    let baseMagnitude = 15;
    if (event.impact === 'High' || event.gold) baseMagnitude = 28;
    else if (event.impact === 'Medium') baseMagnitude = 16;
    else baseMagnitude = 7;

    const scale = Math.min(2.5, Math.max(0.4, Math.abs(deltaPct) / 15 || 1));
    const finalDollarMove = Math.round(baseMagnitude * scale * 10) / 10;

    if (isBullishForGold) {
      goldDirection = 'UP';
      estMoveDollars = finalDollarMove;
      usdShiftPct = -Math.round(scale * 0.45 * 100) / 100;
      continuationProb = Math.min(92, Math.max(55, Math.round(55 + scale * 18)));
      fedImpact = isInverse
        ? 'Dovish tilt (Labor cooling increases rate cut odds to ' + Math.min(98, Math.round(60 + scale * 15)) + '%)'
        : 'Dovish acceleration (Disinflation / growth slowdown pushes Fed cuts)';
    } else {
      goldDirection = 'DOWN';
      estMoveDollars = -finalDollarMove;
      usdShiftPct = +Math.round(scale * 0.45 * 100) / 100;
      continuationProb = Math.min(92, Math.max(55, Math.round(55 + scale * 18)));
      fedImpact = isInverse
        ? 'Hawkish hold (Tight labor keeps Fed from cutting rates anytime soon)'
        : 'Hawkish surge (Hot data triggers yields rally & higher-for-longer Fed stance)';
    }
  }

  const projectedGoldTarget = p + estMoveDollars;
  const supportS1 = p - Math.abs(estMoveDollars);
  const resistanceR1 = p + Math.abs(estMoveDollars);

  return {
    ok: true,
    simulatedActual,
    spotPrice: p,
    goldDirection,
    estMoveDollars: (estMoveDollars >= 0 ? '+' : '') + estMoveDollars.toFixed(2),
    projectedTarget: '$' + projectedGoldTarget.toFixed(2),
    resistanceR1: '$' + resistanceR1.toFixed(2),
    supportS1: '$' + supportS1.toFixed(2),
    usdShiftPct: (usdShiftPct >= 0 ? '+' : '') + usdShiftPct.toFixed(2) + '%',
    continuationProb: continuationProb + '%',
    fedImpact,
    flashBadge: simResult ? simResult.flashBadge : 'SIMULATED',
    momentumTag: simResult ? simResult.momentumTag : '',
    tacticalPlaybook: goldDirection === 'UP'
      ? `📈 Bullish Play: Look for initial spike to $${projectedGoldTarget.toFixed(2)}. If spot tests Support S1 ($${supportS1.toFixed(2)}) first on a fakeout, buy dips toward Resistance R1 ($${resistanceR1.toFixed(2)}).`
      : `📉 Bearish Play: Expect selloff toward Support S1 ($${projectedGoldTarget.toFixed(2)}). Sell rallies failing at Resistance R1 ($${resistanceR1.toFixed(2)}).`
  };
}

async function readActualsFromFirestore() {
  const now = Date.now();
  if (actualsMemoryCache.map && Object.keys(actualsMemoryCache.map).length > 0 && (now - actualsMemoryCache.at) < 60000) {
    return actualsMemoryCache.map;
  }
  try {
    const snap = await getDoc(doc(globalDb, ...ACTUALS_DOC));
    const map = snap.exists() ? (snap.data().map || {}) : {};
    actualsMemoryCache = { at: now, map };
    return map;
  } catch (e) {
    return actualsMemoryCache.map || {};
  }
}

// ⏱️ 1-Hour Pre-Event WhatsApp Briefing to Boss
async function send1HourPreEventBriefing(event, spotPrice) {
  const p = Number(spotPrice) || 0;
  const pStr = p > 0 ? '$' + p.toFixed(2) + '/oz' : 'Market Spot';
  const an = computeEventImpact(event);
  const title = event.title || 'Economic Indicator';
  const ccy = event.ccy || 'USD';
  const imp = event.impact || 'High';
  const forecast = event.forecast || 'N/A';
  const previous = event.previous || 'N/A';
  const eventTimeDubai = dubaiTimeStr(event.ts);

  let bullTarget = '', bearTarget = '';
  if (p > 0) {
    if (an.ifHigher.goldDir === 'DOWN') {
      bearTarget = '$' + (p - 28).toFixed(2) + ' – $' + (p - 15).toFixed(2);
      bullTarget = '$' + (p + 18).toFixed(2) + ' – $' + (p + 35).toFixed(2);
    } else {
      bullTarget = '$' + (p + 15).toFixed(2) + ' – $' + (p + 28).toFixed(2);
      bearTarget = '$' + (p - 22).toFixed(2) + ' – $' + (p - 12).toFixed(2);
    }
  }

  let msg = '🚨 *1-HOUR GOLD EVENT BRIEFING* 🥇\n'
    + '━━━━━━━━━━━━━━━━━━━━\n'
    + '📊 *Event:* ' + (event.gold ? '⭐ ' : '') + title + ' (' + ccy + ')\n'
    + '🕒 *Release Time:* ' + eventTimeDubai + ' (in ~60 mins)\n'
    + '🔴 *Impact Level:* ' + imp + ' Impact\n'
    + '• *Forecast:* ' + forecast + ' | *Previous:* ' + previous + '\n'
    + '💰 *Current Gold Spot:* *' + pStr + '*\n\n'
    + '🎯 *TACTICAL TARGETS & SCENARIOS:*\n'
    + '🟢 *IF ACTUAL HIGHER than forecast:*\n'
    + '• Gold: *' + an.ifHigher.goldLabel + '* (' + an.ifHigher.goldMove + ')' + (bearTarget && an.ifHigher.goldDir === 'DOWN' ? ' → *Target: ' + bearTarget + '*' : (bullTarget && an.ifHigher.goldDir === 'UP' ? ' → *Target: ' + bullTarget + '*' : '')) + '\n'
    + '• USD: ' + (an.ifHigher.usdDir === 'UP' ? '🔺 USD Rallies' : '🔻 USD Softens') + ' (' + an.ifHigher.usdMove + ')\n'
    + '• Signal: ' + an.ifHigher.signal + '\n\n'
    + '🔴 *IF ACTUAL LOWER than forecast:*\n'
    + '• Gold: *' + an.ifLower.goldLabel + '* (' + an.ifLower.goldMove + ')' + (bullTarget && an.ifLower.goldDir === 'UP' ? ' → *Target: ' + bullTarget + '*' : (bearTarget && an.ifLower.goldDir === 'DOWN' ? ' → *Target: ' + bearTarget + '*' : '')) + '\n'
    + '• USD: ' + (an.ifLower.usdDir === 'DOWN' ? '🔻 USD Softens' : '🔺 USD Rallies') + ' (' + an.ifLower.usdMove + ')\n'
    + '• Signal: ' + an.ifLower.signal + '\n\n'
    + '📊 *4-Release Volatility:* ' + an.history4Move + '\n'
    + '💡 *Core Rule:* ' + an.plainExplanation + '\n'
    + '⚠️ *Caution:* High volatility spike in first 15m. Expect wider broker spreads.';

  await pushGoldNotification(msg);
  console.log('[GOLD PRE-EVENT] 📤 1-Hour briefing sent to Boss for ' + title);
}

async function evaluatePreEventAlerts(spotPrice) {
  if (!globalDb) return;
  const now = Date.now();
  const c = await fetchEconomicEvents().catch(() => null);
  if (!c || !Array.isArray(c.data) || !c.data.length) return;

  const notifRef = doc(globalDb, ...NOTIFS_DOC);
  let toggles = {};
  try {
    const snap = await getDoc(notifRef);
    if (snap.exists()) toggles = snap.data().toggles || {};
  } catch (e) { /* ignore */ }

  let stateChanged = false;
  for (const e of c.data) {
    if (!e || !e.ts || e.ts <= now) continue;
    const diffMs = e.ts - now;
    const diffMins = Math.round(diffMs / 60000);

    // Alert 45 to 65 minutes before event (1 hour window)
    if (diffMins < 45 || diffMins > 65) continue;

    const key = getEventKey(e);
    const rec = toggles[key] || {};
    const isAutoEligible = e.impact === 'High' || e.gold;
    const isEnabled = rec.enabled !== undefined ? rec.enabled : isAutoEligible;

    if (!isEnabled || rec.fired) continue;

    rec.fired = true;
    rec.firedAt = now;
    toggles[key] = rec;
    stateChanged = true;

    await send1HourPreEventBriefing(e, spotPrice);
  }

  if (stateChanged) {
    try { await setDoc(notifRef, { toggles, updatedAt: now }, { merge: true }); }
    catch (err) { /* ignore */ }
  }
}

async function readEventsFromFirestore() {
  try {
    const snap = await getDoc(doc(globalDb, ...EVENTS_CACHE_DOC));
    if (snap.exists()) {
      const d = snap.data() || {};
      if (Array.isArray(d.events) && d.events.length) {
        const actuals = await readActualsFromFirestore();
        const enriched = d.events.map(e => {
          const item = Object.assign({}, e);
          item.impactAnalysis = computeEventImpact(item);
          const key = getEventKey(item);
          item.actual = actuals[key] || item.actual || '';
          item.actualResult = evaluateActualResult(item.actual, item.forecast, item.previous, item.impactAnalysis);
          return item;
        });
        return { at: Number(d.fetchedAt) || 0, data: enriched };
      }
    }
  } catch (e) { /* ignore */ }
  return null;
}

async function fetchEconomicEvents() {
  const now = Date.now();
  const fresh = (c) => c && c.data && (now - c.at) < EVENTS_TTL_MS;

  // 1) load from Firestore if memory cache is empty
  if (!eventsCache.data) {
    const fsC = await readEventsFromFirestore();
    if (fsC) eventsCache = fsC;
  }

  // 2) if not fresh, try upstream feed
  if (!fresh(eventsCache)) {
    if (now >= eventsNextTryAt) {
      try {
        const r = await fetch(EVENTS_URL, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (r.ok) {
          const raw = await r.json();
          const events = (Array.isArray(raw) ? raw : [])
            .map(e => {
              const item = {
                title: String((e && e.title) || '').slice(0, 160),
                ccy: String((e && e.country) || ''),
                impact: String((e && e.impact) || 'Low'),
                date: String((e && e.date) || ''),
                ts: Date.parse((e && e.date) || '') || 0,
                forecast: String((e && e.forecast) || ''),
                previous: String((e && e.previous) || '')
              };
              item.gold = GOLD_MOVER_RE.test(item.title);
              item.impactAnalysis = computeEventImpact(item);
              return item;
            })
            .filter(e => e.title && e.ts > 0)
            .sort((a, b) => a.ts - b.ts);
          if (events.length) {
            eventsCache = { at: now, data: events };
            eventsLastError = '';
            try { await setDoc(doc(globalDb, ...EVENTS_CACHE_DOC), { events: events, fetchedAt: now, updatedAt: now }, { merge: true }); } catch (e) { /* ignore */ }
          }
        }
      } catch (e) {
        eventsLastError = String((e && e.message) || e).slice(0, 120);
        eventsNextTryAt = now + EVENTS_RETRY_AFTER_MS;
      }
    }
  }

  // 3) Always overlay latest actuals
  if (eventsCache && Array.isArray(eventsCache.data)) {
    try {
      const actuals = await readActualsFromFirestore();
      for (const item of eventsCache.data) {
        const key = getEventKey(item);
        item.actual = actuals[key] || item.actual || '';
        item.actualResult = evaluateActualResult(item.actual, item.forecast, item.previous, item.impactAnalysis);
      }
    } catch (err) { /* ignore */ }
    return eventsCache;
  }

  if (eventsLastError) throw new Error('calendar temporarily unavailable (' + eventsLastError + ')');
  throw new Error('calendar temporarily unavailable');
}

// Boss AI helper: return the current events list WITHOUT triggering an upstream fetch
// (memory cache first, then the Firestore-persisted copy). 10-min memo to avoid re-reads.
let eventsBossSnapshotCache = { at: 0, list: null };
export async function goldEventsSnapshot() {
  const now = Date.now();
  if (eventsBossSnapshotCache.list && (now - eventsBossSnapshotCache.at) < 10 * 60 * 1000) return eventsBossSnapshotCache.list;
  let list = eventsCache.data || null;
  if (!list) {
    try {
      const snap = await getDoc(doc(globalDb, ...EVENTS_CACHE_DOC));
      if (snap.exists()) {
        const raw = (snap.data() || {}).events || [];
        const actuals = await readActualsFromFirestore();
        list = raw.map(e => {
          const item = Object.assign({}, e);
          item.impactAnalysis = item.impactAnalysis || computeEventImpact(item);
          const key = getEventKey(item);
          item.actual = actuals[key] || item.actual || '';
          item.actualResult = evaluateActualResult(item.actual, item.forecast, item.previous, item.impactAnalysis);
          return item;
        });
      }
    } catch (e) { /* ignore */ }
  }
  if (list && list.length) eventsBossSnapshotCache = { at: now, list };
  return list || null;
}

// --- 🥇 Command Center 2.0: Gold price watches (conditional "if spot crosses a price..." automation) ---
// Stored in the top-level goldWatches collection. Evaluated on every fresh poll; once fired the watch
// turns itself off (one-time). The boss is always notified via the notifications delivery loop, and a
// custom message is sent to the optional target number/group from the linked WhatsApp session.
const WATCH_COLL = 'goldWatches';
let watchesCache = { at: 0, list: null };
let watchesBusy = false;

async function evaluateGoldWatches(price) {
  if (!globalDb || watchesBusy) return;
  watchesBusy = true;
  try {
    const now = Date.now();
    if (!watchesCache.list || (now - watchesCache.at) > 60 * 1000) {
      const snap = await getDocs(collection(globalDb, WATCH_COLL));
      watchesCache = { at: now, list: snap.docs.map(d => Object.assign({ id: d.id, ref: d.ref }, d.data() || {})) };
    }
    const active = (watchesCache.list || []).filter(w => w.status === 'watching');
    for (const w of active) {
      const target0 = Number(w.price);
      let fired = false;
      if (w.op === 'above' && price >= target0) fired = true;
      else if (w.op === 'below' && price <= target0) fired = true;
      else if (w.op === 'cross_up' && Number(w.lastPrice) > 0 && Number(w.lastPrice) < target0 && price >= target0) fired = true;
      else if (w.op === 'cross_down' && Number(w.lastPrice) > 0 && Number(w.lastPrice) > target0 && price <= target0) fired = true;
      if (!fired) {
        if (w.op === 'cross_up' || w.op === 'cross_down') {
          try { await setDoc(w.ref, { lastPrice: price }, { merge: true }); w.lastPrice = price; } catch (e) { /* ignore */ }
        }
        continue;
      }
      const opLabel = w.op === 'above' ? 'rose above' : (w.op === 'below' ? 'fell below' : (w.op === 'cross_up' ? 'crossed up through' : 'crossed down through'));
      const fallback = '🥇 Gold alert: spot is now $' + Number(price).toFixed(2) + '/oz — it has ' + opLabel + ' $' + target0 + '.';
      const msgText = String(w.message || '').trim() || fallback;
      try { await pushGoldNotification(msgText + '\n(Watch set at $' + target0 + ')'); } catch (e) { /* ignore */ }
      const target = String(w.target || '').trim();
      if (target) {
        const jid = target.includes('@') ? target : (target.replace(/[^0-9]/g, '') + '@s.whatsapp.net');
        try { await sendWaWebMessage(jid, msgText); console.log('[GOLD WATCH] 📤 sent to ' + jid); }
        catch (e) { console.warn('[GOLD WATCH] send failed: ' + ((e && e.message) || e)); }
      }
      try { await setDoc(w.ref, { status: 'fired', firedAt: now, firedPrice: price }, { merge: true }); } catch (e) { /* ignore */ }
      w.status = 'fired';
      console.log('[GOLD WATCH] 🎯 Fired: ' + w.op + ' $' + target0 + ' (price $' + price + ')');
    }
  } catch (e) { /* ignore */ } finally { watchesBusy = false; }
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
        today: st.today || null,
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

  // 📅 Economic events this week (free Forex Factory feed, hourly refresh + persistent cache)
  app.get('/api/gold/events', async (req, res) => {
    try {
      const c = await fetchEconomicEvents();
      res.json({ ok: true, source: 'forexfactory', fetchedAt: c.at, stale: (Date.now() - c.at) > EVENTS_TTL_MS, events: c.data || [] });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // 🤖 Deep Qwen AI Analysis & Historical 4-Release Playbook for any event
  app.all('/api/gold/events/qwen-analysis', async (req, res) => {
    try {
      const ev = Object.assign({}, req.query || {}, req.body || {});
      if (!ev.title) return res.status(400).json({ ok: false, error: 'Event title required' });
      const result = await runQwenEventAnalysis(ev);
      res.json(Object.assign({ ok: true }, result));
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // 🧪 Interactive "What-If" Scenario Simulator
  app.post('/api/gold/events/simulate', async (req, res) => {
    try {
      const b = req.body || {};
      if (!b.title) return res.status(400).json({ ok: false, error: 'Event title required' });
      const st = await readState();
      const liveSpot = Number((st.last && st.last.price) || b.spotPrice || 4210);
      const result = simulateEventOutcome(b, b.simulatedActual || b.forecast || '0', liveSpot);
      res.json(result);
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // 🎯 Save manual or verified Actual Result for an event
  app.post('/api/gold/events/actual', async (req, res) => {
    try {
      const b = req.body || {};
      const actualVal = String(b.actual || '').trim();
      const key = b.key || getEventKey(b);
      if (!key) return res.status(400).json({ ok: false, error: 'Event key or details required' });
      
      const actSnap = await getDoc(doc(db, ...ACTUALS_DOC));
      const actMap = actSnap.exists() ? (actSnap.data().map || {}) : {};
      actMap[key] = actualVal;
      await setDoc(doc(db, ...ACTUALS_DOC), { map: actMap, updatedAt: Date.now() }, { merge: true });
      actualsMemoryCache = { at: Date.now(), map: actMap };

      const imp = computeEventImpact(b);
      const actualResult = evaluateActualResult(actualVal, b.forecast, b.previous, imp);

      if (eventsCache && Array.isArray(eventsCache.data)) {
        for (const item of eventsCache.data) {
          if (getEventKey(item) === key) {
            item.actual = actualVal;
            item.actualResult = actualResult;
          }
        }
      }
      eventsBossSnapshotCache.at = 0;

      res.json({ ok: true, key, actual: actualVal, actualResult });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // ⚡ Fetch Actual Result via AI / Live Market feed
  app.post('/api/gold/events/fetch-actual-ai', async (req, res) => {
    try {
      const ev = req.body || {};
      if (!ev.title) return res.status(400).json({ ok: false, error: 'Event title required' });
      const result = await fetchEventActualAi(ev);
      res.json(result);
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // 🔔 1-Hour pre-event notification toggles
  app.get('/api/gold/events/notifs', async (req, res) => {
    try {
      const snap = await getDoc(doc(db, ...NOTIFS_DOC));
      const toggles = snap.exists() ? (snap.data().toggles || {}) : {};
      res.json({ ok: true, toggles });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.post('/api/gold/events/notif-toggle', async (req, res) => {
    try {
      const b = req.body || {};
      const key = String(b.key || '').trim();
      const enabled = !!b.enabled;
      if (!key) return res.status(400).json({ ok: false, error: 'Event key required' });

      const notifRef = doc(db, ...NOTIFS_DOC);
      const snap = await getDoc(notifRef);
      const toggles = snap.exists() ? (snap.data().toggles || {}) : {};
      toggles[key] = Object.assign({}, toggles[key] || {}, { enabled, updatedAt: Date.now() });
      await setDoc(notifRef, { toggles, updatedAt: Date.now() }, { merge: true });
      res.json({ ok: true, key, enabled });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // 🥇 Gold price watches (Command Center 2.0 conditional triggers)
  app.get('/api/gold/watches', async (req, res) => {
    try {
      const snap = await getDocs(collection(db, WATCH_COLL));
      const watches = snap.docs.map(d => Object.assign({ id: d.id }, d.data() || {})).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      res.json({ ok: true, watches });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.post('/api/gold/watches', async (req, res) => {
    try {
      const b = req.body || {};
      const op = ['above', 'below', 'cross_up', 'cross_down'].includes(b.op) ? b.op : 'above';
      const price = Number(b.price);
      if (!(price > MIN_PRICE && price < MAX_PRICE)) return res.status(400).json({ ok: false, error: 'price must be between ' + MIN_PRICE + ' and ' + MAX_PRICE });
      const ref = doc(collection(db, WATCH_COLL));
      const w = {
        op, price,
        message: String(b.message || '').substring(0, 500),
        target: String(b.target || '').trim(),
        once: true,
        status: 'watching',
        createdBy: 'dashboard',
        createdAt: Date.now(),
        lastPrice: 0
      };
      await setDoc(ref, w);
      watchesCache.at = 0;
      logBossOrder({ source: 'dashboard', kind: 'gold', text: 'Gold watch: ' + op.replace('_', ' ') + ' $' + price + (w.message ? ' — ' + w.message.substring(0, 120) : '') + (w.target ? ' → ' + w.target : ''), status: 'watching' }).catch(() => {});
      res.json({ ok: true, id: ref.id, watch: Object.assign({ id: ref.id }, w) });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.post('/api/gold/watches/delete', async (req, res) => {
    try {
      const id = String((req.body || {}).id || '');
      if (!id) return res.status(400).json({ ok: false, error: 'id required' });
      await deleteDoc(doc(db, WATCH_COLL, id));
      watchesCache.at = 0;
      res.json({ ok: true });
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

  console.log('[GOLD] 🥇 Gold Market API registered (live XAU/USD spot + one-time price alerts + events calendar)');
  return { maybePoll: goldMaybePoll };
}
