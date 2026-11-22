// ============================================================================
// 🕌 PRAYER / SEHRI TIMES — for "after Dhuhr", "after sehri", "after iftar"
// ============================================================================
// Uses the free Aladhan API, cached per city + date. If the network is down,
// callers get null and should ask the contact for a time instead of guessing.
// Times are returned both as "HH:MM" and as UTC epoch ms (`*At` fields).
// ============================================================================

const cache = new Map();

function tzOffsetMs(timeZone, date) {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const p = {};
    for (const part of dtf.formatToParts(date)) p[part.type] = part.value;
    const hour = p.hour === '24' ? '0' : p.hour;
    const asUTC = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(hour), Number(p.minute), Number(p.second));
    return asUTC - date.getTime();
  } catch (e) {
    return 0;
  }
}

/** Local wall-clock time in `timeZone` -> UTC epoch ms. */
export function localTimeToUtcMs(y, m, d, hhmm, timeZone) {
  const match = String(hhmm || '').match(/(\d{1,2}):(\d{2})/);
  if (!match) return 0;
  const guess = Date.UTC(Number(y), Number(m) - 1, Number(d), Number(match[1]), Number(match[2]), 0);
  const off = tzOffsetMs(timeZone, new Date(guess));
  return guess - off;
}

/** { y, m, d } for a moment, as seen in `timeZone`. */
export function localYmd(timeZone, ms = Date.now()) {
  const dtf = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const p = {};
  for (const part of dtf.formatToParts(new Date(ms))) p[part.type] = part.value;
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day) };
}

/** { hh, mm } for a moment, as seen in `timeZone`. */
export function localHm(timeZone, ms = Date.now()) {
  const dtf = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false });
  return dtf.format(new Date(ms));
}

export async function getPrayerTimes({ city = 'Karachi', country = 'Pakistan', timeZone = 'Asia/Karachi', date = new Date() } = {}) {
  const { y, m, d } = localYmd(timeZone, date.getTime());
  const ymd = y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  const key = city + '|' + ymd;
  if (cache.has(key)) return cache.get(key);

  try {
    const apiDate = String(d).padStart(2, '0') + '-' + String(m).padStart(2, '0') + '-' + y;
    const url = 'https://api.aladhan.com/v1/timingsByCity?city=' + encodeURIComponent(city) +
      '&country=' + encodeURIComponent(country) + '&method=1&date=' + apiDate;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const t = (j && j.data && j.data.timings) || {};
    const pick = (v) => (String(v || '').match(/\d{1,2}:\d{2}/) || [''])[0];
    const out = {
      city, country, timeZone, date: ymd,
      Fajr: pick(t.Fajr), Sunrise: pick(t.Sunrise), Dhuhr: pick(t.Dhuhr),
      Asr: pick(t.Asr), Maghrib: pick(t.Maghrib), Isha: pick(t.Isha)
    };
    out.Sehri = out.Fajr;
    out.Iftar = out.Maghrib;
    for (const k of ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha', 'Sehri', 'Iftar']) {
      if (out[k]) out[k + 'At'] = localTimeToUtcMs(y, m, d, out[k], timeZone);
    }
    cache.set(key, out);
    return out;
  } catch (e) {
    console.warn('[PRAYER] times unavailable for ' + city + ': ' + ((e && e.message) || e));
    return null;
  }
}

function addDays(y, m, d, days) {
  const t = Date.UTC(y, m - 1, d) + days * 86400000;
  const dt = new Date(t);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

/**
 * Read a deferral phrase and return a UTC epoch ms, or 0 if unsure.
 * Handles: "in 30 min", "after 1 hour", "after dhuhr/sehri/iftar",
 * "tomorrow morning", "morning/evening/tonight/after lunch".
 */
export function parseDeferral(text, nowMs, timeZone = 'Asia/Karachi', prayer = null) {
  const s = String(text || '').toLowerCase();
  const now = Number(nowMs) || Date.now();

  // Relative minutes / hours
  let m = s.match(/\b(?:after|in|baad)\s+(\d{1,3})\s*(min|mins|minute|minutes|hour|hours|hr|hrs)\b/);
  if (m) {
    const n = Number(m[1]);
    return now + n * (/hour|hr/.test(m[2]) ? 3600000 : 60000);
  }
  m = s.match(/\b(\d{1,3})\s*(min|mins|minute|minutes|hour|hours|hr|hrs)\b/);
  if (m) {
    const n = Number(m[1]);
    return now + n * (/hour|hr/.test(m[2]) ? 3600000 : 60000);
  }

  // Prayer names (+ 25 min so they can finish)
  if (prayer) {
    const names = [
      ['fajr', 'Fajr'], ['sehri', 'Sehri'], ['suhoor', 'Sehri'], ['sahari', 'Sehri'],
      ['zuhr', 'Dhuhr'], ['dhuhr', 'Dhuhr'], ['asr', 'Asr'], ['maghrib', 'Maghrib'],
      ['iftar', 'Iftar'], ['isha', 'Isha']
    ];
    for (const [word, key] of names) {
      if (new RegExp('\\b' + word + '\\b').test(s) && prayer[key + 'At']) {
        return prayer[key + 'At'] + 25 * 60000;
      }
    }
  }

  const { y, m: mo, d } = localYmd(timeZone, now);
  const atLocal = (hour, minute, dayOffset = 0) => {
    const day = addDays(y, mo, d, dayOffset);
    return localTimeToUtcMs(day.y, day.m, day.d, hour + ':' + minute, timeZone);
  };
  const tomorrow = /\b(tomorrow|kal)\b/.test(s);

  if (/\bmorning\b|\bsubah\b/.test(s)) return atLocal('08', '00', tomorrow ? 1 : 0);
  if (/\bafter\s*lunch\b|\blunch\s*ke\s*baad\b|\bkhane\s*ke\s*baad\b/.test(s)) return atLocal('13', '30', tomorrow ? 1 : 0);
  if (/\bevening\b|\bshaam\b/.test(s)) return atLocal('18', '30', tomorrow ? 1 : 0);
  if (/\bafter\s*dinner\b|\bdinner\s*ke\s*baad\b|\braat\s*ke\s*khane\b/.test(s)) return atLocal('20', '30', tomorrow ? 1 : 0);
  if (/\btonight\b|\baaj\s*raat\b/.test(s)) return atLocal('20', '30', 0);
  if (tomorrow) return atLocal('09', '00', 1);

  return 0;
}
