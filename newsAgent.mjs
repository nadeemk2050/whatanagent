// ============================================================================
// BROWSING NEWS AGENT — multi-source business news collection & segregation
// ============================================================================
// What it does (the "agentic" flow the boss asked for):
//   1. BROWSES 5 business-news websites (Khaleej Times, Jang, Times of India,
//      Google News, Gulf News)
//   2. Takes the TOP 5 business news from EACH site (with publish time details)
//   3. MERGES everything together and SEGREGATES non-repeated vs repeated
//      (title-similarity + URL matching; duplicates get collapsed into one
//       card with "also seen in" source list)
//   4. Caches the result in Firestore and AUTO-REFRESHES every 5 hours
//
// Per-source reliability chain (first that returns results wins):
//   1) Direct RSS/Atom feed  →  2) Direct HTML headline scrape (cheerio)
//   →  3) Google News site-search RSS (no API key, never breaks)
// ============================================================================

import * as cheerio from 'cheerio';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export const NEWS_CACHE_HOURS = 5;   // auto-refresh every 5 hours
export const NEWS_PER_SOURCE = 5;    // top 5 news from each website

export const NEWS_SOURCES = [
  {
    id: 'khaleejtimes', name: 'Khaleej Times', region: 'UAE',
    url: 'https://www.khaleejtimes.com/business',
    rss: 'https://www.khaleejtimes.com/arc/outboundfeeds/rss/category/business/?outputType=xml',
    site: 'khaleejtimes.com'
  },
  {
    id: 'jang', name: 'Jang News', region: 'Pakistan',
    url: 'https://jang.com.pk/category/latest-news/business',
    rss: 'https://jang.com.pk/rss/business',
    site: 'jang.com.pk'
  },
  {
    id: 'timesofindia', name: 'Times of India', region: 'India',
    url: 'https://timesofindia.indiatimes.com/business',
    rss: 'https://timesofindia.indiatimes.com/rssfeeds/1898055.cms',
    site: 'timesofindia.indiatimes.com'
  },
  {
    id: 'googlenews', name: 'Google News', region: 'Global',
    url: 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en',
    rss: 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en',
    site: null
  },
  {
    id: 'gulfnews', name: 'Gulf News', region: 'UAE / Gulf',
    url: 'https://gulfnews.com/business',
    rss: 'https://gulfnews.com/rss',
    site: 'gulfnews.com'
  }
];

// ---------------------------------------------------------------------------
// Low-level fetch with timeout & browser-ish headers (many news sites block bots)
// ---------------------------------------------------------------------------
async function fetchText(url, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html, */*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------
function cleanTitle(t) {
  return String(t || '')
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&hellip;/g, '…').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
    .replace(/\s+/g, ' ')
    .replace(/^[\u200b\s]+|[\u200b\s]+$/g, '')
    .trim();
}

// Junk detector: site-description / channel-title entries like
// "Khaleej Times - Dubai News, UAE News, Gulf, News, Latest news..." are not real news
function isJunkTitle(title) {
  const s = String(title || '');
  const newsWord = (s.match(/news/gi) || []).length;
  if (newsWord >= 3) return true;
  if (/^(latest|breaking)\s+(news|headlines)\b/i.test(s) && s.length < 60) return true;
  if (/\b(prayer time|cinema|classifieds)\b/i.test(s)) return true;
  return false;
}

// Keep only reasonably fresh stories (undated items pass - many feeds omit dates)
const MAX_AGE_MS = 60 * 24 * 3600 * 1000; // 60 days

function parseLooseDate(raw) {
  if (!raw) return null;
  const ms = Date.parse(String(raw));
  return Number.isFinite(ms) ? ms : null;
}

// Parse an RSS (<item>) or Atom (<entry>) document into [{title, link, publishedAt, publishedRaw}]
function parseFeedXml(xml) {
  const $ = cheerio.load(xml, { xmlMode: true });
  const out = [];
  const push = (el) => {
    const $el = $(el);
    const title = cleanTitle($el.find('title').first().text());
    if (!title) return;
    let link = ($el.find('link').first().text() || '').trim();
    if (!link) link = ($el.find('link').first().attr('href') || '').trim();
    if (!link) {
      $el.find('link').each((i, l) => {
        const h = $(l).attr('href');
        if (!link && h) link = String(h).trim();
      });
    }
    // date: scan direct children for pubDate / published / updated / dc:date variants
    let dateRaw = '';
    $el.children().each((i, ch) => {
      if (!dateRaw && ch.name && /(pubdate|published|updated|^date$|\.date$)/i.test(ch.name)) {
        dateRaw = cleanTitle($(ch).text());
      }
    });
    out.push({ title, link, publishedAt: parseLooseDate(dateRaw), publishedRaw: dateRaw });
  };
  $('item').each((i, el) => push(el));
  if (!out.length) $('entry').each((i, el) => push(el));
  return out;
}

// Heuristic HTML headline extraction: JSON-LD first, then heading / article links
function scrapeHeadlines(html, srcUrl) {
  const $ = cheerio.load(html);
  let base = null;
  try { base = new URL(srcUrl); } catch (e) { base = null; }
  const out = [];
  const seen = new Set();
  const seenTitle = new Set();

  const add = (title, href, publishedAt) => {
    title = cleanTitle(title);
    if (!title || title.length < 25 || title.length > 180) return;
    if (/^(home|news|about|contact|subscribe|sign in|log in|login|register|more|read more|view all|next|previous|menu|search)$/i.test(title)) return;
    if (!href || /^(javascript|mailto|tel|#)/i.test(href)) return;
    if (/\.(jpg|jpeg|png|gif|webp|svg|mp4|pdf)(\?|$)/i.test(href)) return;
    let abs = href;
    try { abs = new URL(href, srcUrl).href; } catch (e) { return; }
    // keep same-domain links when possible (keeps it a "site browse")
    if (base) {
      try {
        const host = new URL(abs).hostname.replace(/^www\./, '');
        const bhost = base.hostname.replace(/^www\./, '');
        if (host !== bhost && !host.endsWith('.' + bhost) && !bhost.endsWith('.' + host)) {
          const isNoisy = /(facebook|twitter|x\.com|instagram|youtube|linkedin|whatsapp|tiktok|threads)\./.test(host);
          if (isNoisy) return;
        }
      } catch (e) { /* keep it */ }
    }
    const k = abs.replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
    if (seen.has(k)) return;
    const tk = normTitle(title);
    if (!tk || seenTitle.has(tk)) return;
    seen.add(k); seenTitle.add(tk);
    out.push({ title, link: abs, publishedAt: publishedAt || null, publishedRaw: '' });
  };

  // 1) JSON-LD structured data (most precise when present)
  $('script[type="application/ld+json"]').each((i, el) => {
    const txt = $(el).contents().text() || $(el).text();
    if (!txt || out.length >= 80) return;
    let data = null;
    try { data = JSON.parse(txt); } catch (e) { return; }
    const walk = (node, depth) => {
      if (!node || depth > 6 || out.length >= 80) return;
      if (Array.isArray(node)) { node.forEach(n => walk(n, depth + 1)); return; }
      if (typeof node !== 'object') return;
      const t = node.headline || (typeof node.name === 'string' && node['@type'] && /article|news/i.test(String(node['@type'])) ? node.name : null);
      let u = node.url || node.mainEntityOfPage && (node.mainEntityOfPage['@id'] || node.mainEntityOfPage);
      if (typeof u === 'object') u = u && (u.url || u['@id']);
      if (t && u && typeof t === 'string' && typeof u === 'string') add(t, u, parseLooseDate(node.datePublished || node.dateModified));
      ['itemListElement', 'item', 'mainEntity', 'mainEntityOfPage', 'hasPart', '@graph', 'image'].forEach(k => {
        if (node[k]) walk(node[k], depth + 1);
      });
    };
    walk(data, 0);
  });

  // 2) Heading-link heuristics
  if (out.length < 3) {
    $('article a, h1 a, h2 a, h3 a, h4 a, a[data-testid], a[class*="headline"], a[class*="title"], a[class*="Headline"], a[class*="Title"]').each((i, el) => {
      if (out.length >= 80) return;
      const $el = $(el);
      add($el.text(), $el.attr('href') || '', null);
    });
  }

  return out;
}

function googleNewsSiteFeedUrl(site) {
  return 'https://news.google.com/rss/search?q=' + encodeURIComponent('site:' + site + ' business') + '&hl=en-US&gl=US&ceid=US:en';
}

// ---------------------------------------------------------------------------
// Per-source fetch with the reliability chain (rss → scrape → google news)
// ---------------------------------------------------------------------------
export async function fetchSourceNews(src, limit = NEWS_PER_SOURCE) {
  const attempts = [];
  if (src.rss) attempts.push({ method: 'rss', run: async () => parseFeedXml(await fetchText(src.rss)) });
  attempts.push({ method: 'scrape', run: async () => scrapeHeadlines(await fetchText(src.url), src.url) });
  if (src.site) attempts.push({ method: 'google-news', run: async () => parseFeedXml(await fetchText(googleNewsSiteFeedUrl(src.site))) });

  const errors = [];
  for (const attempt of attempts) {
    try {
      let items = await attempt.run();
      items = (items || []).filter(it => it && it.title && it.link);
      // quality filters: no channel-description junk, no stale stories
      const now = Date.now();
      items = items.filter(it => !isJunkTitle(it.title) && !(it.publishedAt && (now - it.publishedAt) > MAX_AGE_MS));
      // dedupe within source by link + title key
      const seen = new Set();
      items = items.filter(it => {
        const k = urlKey(it.link) || normTitle(it.title);
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      if (items.length) {
        return { ok: true, method: attempt.method, items: items.slice(0, limit), errors };
      }
      errors.push(attempt.method + ': empty');
    } catch (e) {
      errors.push(attempt.method + ': ' + e.message);
    }
  }
  return { ok: false, method: 'none', items: [], errors };
}

// ---------------------------------------------------------------------------
// Title-similarity & merge (non-repeated segregation)
// ---------------------------------------------------------------------------
const STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'for', 'to', 'and', 'at', 'by', 'with', 'from', 'is', 'are', 'was', 'were', 'as', 'after', 'before', 'over', 'under', 'new', 'says', 'say', 'amid', 'its', 'his', 'her', 'their', 'this', 'that', 'will', 'has', 'have', 'not', 'but', 'how', 'why', 'what', 'when', 'who']);

export function normTitle(t) {
  return String(t || '')
    .toLowerCase()
    .replace(/\s+-\s+[^-]{2,45}$/, '')           // strip Google-News style " - Source Name" suffix
    .replace(/[^a-z0-9\u0600-\u06FF\s]/g, ' ')   // keep latin + arabic letters/digits
    .replace(/\s+/g, ' ')
    .trim();
}

function tokensFor(title) {
  return normTitle(title).split(' ').filter(w => w && w.length > 2 && !STOP_WORDS.has(w));
}

function jaccard(aTokens, bTokens) {
  const A = new Set(aTokens), B = new Set(bTokens);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach(x => { if (B.has(x)) inter++; });
  const uni = A.size + B.size - inter;
  return uni === 0 ? 0 : inter / uni;
}

function urlKey(u) {
  try {
    const x = new URL(String(u));
    return (x.hostname.replace(/^www\./, '') + x.pathname).replace(/\/+$/, '').toLowerCase();
  } catch (e) {
    return String(u || '').replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
  }
}

// slices: [{ sourceId, sourceName, region, ok, method, items: [{title, link, publishedAt...}] }]
export function mergeWithSegregation(slices, collectedAt) {
  const kept = []; // clusters
  const keptByUrl = new Map();
  let totalCount = 0;

  for (const slice of slices) {
    for (const it of (slice.items || [])) {
      totalCount++;
      const entry = {
        title: it.title,
        link: it.link,
        source: slice.sourceId,
        sourceName: slice.sourceName,
        region: slice.region,
        publishedAt: it.publishedAt || null,
        publishedRaw: it.publishedRaw || '',
        collectedAt,
        alsoSeenIn: []
      };
      const uk = urlKey(it.link);
      let match = (uk && keptByUrl.get(uk)) || null;
      if (!match) {
        const tokens = tokensFor(it.title);
        for (const c of kept) {
          if (jaccard(tokens, c._tokens) >= 0.55) { match = c; break; }
        }
      }
      if (match) {
        // duplicate → collapse into the first-seen cluster, remember where else it appeared
        const dupeSource = { source: slice.sourceId, sourceName: slice.sourceName, link: it.link, publishedAt: it.publishedAt || null };
        const already = match.alsoSeenIn.some(d => d.source === dupeSource.source);
        if (!already) match.alsoSeenIn.push(dupeSource);
      } else {
        const cluster = { ...entry, _tokens: tokensFor(it.title) };
        kept.push(cluster);
        if (uk) keptByUrl.set(uk, cluster);
      }
    }
  }

  // sort: newest first (items without date go last, alphabetically)
  kept.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0) || String(a.title).localeCompare(String(b.title)));
  kept.forEach(c => { delete c._tokens; });

  const uniqueCount = kept.filter(c => c.alsoSeenIn.length === 0).length;
  return {
    collectedAt,
    totalCount,
    groups: kept.length,
    uniqueCount,
    repeatedCount: totalCount - kept.length,
    repeatedGroups: kept.length - uniqueCount,
    clusters: kept
  };
}

// ---------------------------------------------------------------------------
// Full collection run: all 5 sources in parallel → merged & segregated
// ---------------------------------------------------------------------------
export async function collectAllSources({ perSource = NEWS_PER_SOURCE, sources = NEWS_SOURCES } = {}) {
  const collectedAt = Date.now();
  const slices = await Promise.all(sources.map(async (s) => {
    const r = await fetchSourceNews(s, perSource);
    return {
      sourceId: s.id, sourceName: s.name, region: s.region, url: s.url,
      ok: r.ok, method: r.method, errors: r.errors,
      items: (r.items || []).map(it => ({
        title: it.title, link: it.link,
        publishedAt: it.publishedAt || null, publishedRaw: it.publishedRaw || '',
        source: s.id, sourceName: s.name, region: s.region, collectedAt
      }))
    };
  }));
  const merged = mergeWithSegregation(slices, collectedAt);
  return { collectedAt, perSource, sources: slices, merged };
}

// ---------------------------------------------------------------------------
// 5-hour cache (Firestore-backed) + auto-refresh helper for the 60s scheduler
// ---------------------------------------------------------------------------
export function createNewsAgent(db) {
  const ref = doc(db, 'appData', 'newsAgentCache');
  let mem = null;
  let lastAutoCheck = 0;
  let newsState = 'idle';

  async function loadCache() {
    if (mem) return mem;
    try {
      const snap = await getDoc(ref);
      if (snap.exists()) mem = snap.data();
    } catch (e) {
      console.error('[NEWS-AGENT] cache read failed:', e.message);
    }
    return mem;
  }

  async function saveCache(payload) {
    mem = {
      ...payload,
      lastRunAt: payload.collectedAt,
      nextRunAt: payload.collectedAt + NEWS_CACHE_HOURS * 3600 * 1000
    };
    try {
      await setDoc(ref, mem);
    } catch (e) {
      console.error('[NEWS-AGENT] cache save failed:', e.message);
    }
    return mem;
  }

  function isFresh(c) {
    return !!(c && c.lastRunAt && (Date.now() - c.lastRunAt) < NEWS_CACHE_HOURS * 3600 * 1000);
  }

  // Used by the API: returns the 5-hour cached payload, or re-collects when stale/forced
  async function getFresh(force = false) {
    const c = await loadCache();
    if (!force && isFresh(c)) return c;
    newsState = 'running';
    try {
      const payload = await collectAllSources();
      newsState = 'ok (' + new Date(payload.collectedAt).toISOString() + ')';
      return await saveCache(payload);
    } catch (e) {
      newsState = 'error: ' + e.message;
      console.error('[NEWS-AGENT] collect failed:', e.message);
      if (c) return c; // serve stale cache rather than nothing
      throw e;
    }
  }

  // Called from the 60s scheduler tick — self-throttled to a light check, refreshes when 5h old
  async function maybeAutoRefresh() {
    if (Date.now() - lastAutoCheck < 10 * 60 * 1000) return; // max one check per 10 min
    lastAutoCheck = Date.now();
    try {
      const c = await loadCache();
      if (isFresh(c)) return;
      console.log('[NEWS-AGENT] 5-hour auto-refresh starting...');
      const payload = await collectAllSources();
      await saveCache(payload);
      newsState = 'auto-refreshed (' + new Date(payload.collectedAt).toISOString() + ')';
      console.log('[NEWS-AGENT] auto-refresh done:', payload.merged.uniqueCount, 'unique /', payload.merged.totalCount, 'total articles');
    } catch (e) {
      newsState = 'auto-error: ' + e.message;
      console.error('[NEWS-AGENT] auto-refresh failed:', e.message);
    }
  }

  async function getStatus() {
    const c = await loadCache();
    const ageMs = c && c.lastRunAt ? (Date.now() - c.lastRunAt) : null;
    const nextRunAt = c && c.nextRunAt ? c.nextRunAt : null;
    return {
      ok: true,
      schedulerState: newsState,
      cacheHours: NEWS_CACHE_HOURS,
      perSource: NEWS_PER_SOURCE,
      lastRunAt: c ? c.lastRunAt || null : null,
      nextRunAt,
      ageMs,
      fresh: isFresh(c),
      sources: NEWS_SOURCES.map(s => ({ id: s.id, name: s.name, region: s.region, url: s.url })),
      sourceResults: c && c.sources ? c.sources.map(s => ({ sourceId: s.sourceId, sourceName: s.sourceName, ok: s.ok, method: s.method, count: (s.items || []).length })) : null,
      stats: c && c.merged ? {
        totalCount: c.merged.totalCount,
        uniqueCount: c.merged.uniqueCount,
        repeatedCount: c.merged.repeatedCount,
        repeatedGroups: c.merged.repeatedGroups,
        groups: c.merged.groups
      } : null
    };
  }

  return { getFresh, maybeAutoRefresh, getStatus, loadCache };
}

// ---------------------------------------------------------------------------
// Express routes
// ---------------------------------------------------------------------------
export function registerNewsRoutes(app, db) {
  const agent = createNewsAgent(db);
  const parseForce = (v) => /^(1|true|yes|on)$/i.test(String(v || ''));

  app.get('/api/news/status', async (req, res) => {
    try { res.json(await agent.getStatus()); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/news/collect', async (req, res) => {
    try {
      const c = await agent.getFresh(parseForce(req.query.force));
      res.json({
        lastRunAt: c.lastRunAt, nextRunAt: c.nextRunAt, collectedAt: c.collectedAt,
        perSource: c.perSource, cacheHours: NEWS_CACHE_HOURS,
        sources: c.sources, merged: c.merged
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/news/merged', async (req, res) => {
    try {
      const c = await agent.getFresh(parseForce(req.query.force));
      res.json({
        lastRunAt: c.lastRunAt, nextRunAt: c.nextRunAt, collectedAt: c.collectedAt,
        cacheHours: NEWS_CACHE_HOURS, perSource: c.perSource,
        merged: c.merged
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return agent;
}
