// SERP + competitor SEO audit (shared by scripts/serp-audit.mjs and the Websites Workshop).
//
// For each keyword it collects the top organic results, classifies each domain
// (directory / marketplace / company / content), audits the ranking page
// (title, description, H1, word count, schema types, images without alt, links,
// canonical, robots, viewport, server + CDN, cache-control, sitemap entries),
// reads the domain's WHOIS creation date, and compares the top 5 with our own
// site to say which factors actually separate them.
//
// SERP source: DuckDuckGo HTML by default, because Google and Bing serve
// JavaScript shells to non-browser clients. DuckDuckGo's order is a proxy for
// "who competes on this phrase", not your Google position. Set
// GOOGLE_CSE_KEY + GOOGLE_CSE_ID to use Google's own order instead.
import net from 'node:net';

const UA = 'Mozilla/5.0 (compatible; WhatAnAgent-Workshop/1.0)';

const DIRECTORY_HOSTS = ['enfplastic.com', 'recyex.com', 'tradekey.com', 'go4worldbusiness.com', 'scrapmonster.com',
  'recycleinme.com', 'yellowpages', 'dubizzle', 'opencorporates', 'crunchbase', 'linkedin.com', 'facebook.com',
  'indiamart', 'exportersindia', 'alibaba.com', 'globalsources', 'kompass', 'dnb.com', 'zaubacorp', 'oec.world',
  'listcompany', 'exportbusinessmart', 'tradewheel.com', 'tradeford.com', 'ensun.io'];

const WHOIS_SERVERS = {
  com: 'whois.verisign-grs.com', net: 'whois.verisign-grs.com', org: 'whois.pir.org',
  info: 'whois.afilias.net', biz: 'whois.biz', io: 'whois.nic.io', co: 'whois.nic.co',
  ae: 'whois.aeda.net.ae', om: 'whois.registry.om', uk: 'whois.nic.uk', de: 'whois.denic.de',
  in: 'whois.registry.in', pk: 'whois.pknic.net.pk', tr: 'whois.trabis.gov.tr',
  sa: 'whois.nic.net.sa', qa: 'whois.registry.qa', kw: 'whois.nic.kw', bh: 'whois.nic.bh'
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function get(url, ms = 15000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      signal: ctl.signal, redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8', 'Accept-Language': 'en' }
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, url: res.url, headers: res.headers, body, ms: Date.now() - started };
  } catch (e) {
    return { ok: false, status: 0, url, headers: new Headers(), body: '', ms: Date.now() - started, error: e.name };
  } finally { clearTimeout(t); }
}

const decode = (s) => String(s || '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&#x27;/gi, "'").replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));

const textOf = (html) => decode(String(html || '')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' '))
  .replace(/\s+/g, ' ').trim();

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

export function classify(domain) {
  const d = String(domain || '').toLowerCase();
  if (/(google|bing|youtube|wikipedia|reddit|quora)\./.test(d)) return 'platform';
  if (DIRECTORY_HOSTS.some(h => d.includes(h))) return 'directory';
  if (/(makepolo|ec21|ecplaza|tradeindia|b2b|marketplace)/.test(d)) return 'marketplace';
  if (/blog|news|medium\.com|wordpress\.com/.test(d)) return 'content';
  return 'company';
}

function parseDdg(html) {
  const out = [];
  const re = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    let href = decode(m[1]);
    const title = textOf(m[2]);
    const uddg = href.match(/[?&]uddg=([^&]+)/);
    if (uddg) href = decodeURIComponent(uddg[1]);
    if (!/^https?:\/\//i.test(href)) continue;
    let host = '';
    try { host = new URL(href).hostname.replace(/^www\./, ''); } catch { continue; }
    out.push({ href, host, title });
  }
  return out;
}

async function serp(keyword) {
  const key = process.env.GOOGLE_CSE_KEY || '';
  const cx = process.env.GOOGLE_CSE_ID || '';
  if (key && cx) {
    const r = await get('https://www.googleapis.com/customsearch/v1?key=' + encodeURIComponent(key) +
      '&cx=' + encodeURIComponent(cx) + '&num=10&q=' + encodeURIComponent(keyword));
    try {
      const j = JSON.parse(r.body);
      const items = (j.items || []).map(it => ({
        href: it.link, host: new URL(it.link).hostname.replace(/^www\./, ''), title: it.title, source: 'Google CSE'
      }));
      if (items.length) return items;
    } catch { /* fall through to DuckDuckGo */ }
  }
  const results = [];
  for (const start of [0, 10]) {
    const r = await get('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(keyword) + '&s=' + start);
    if (!r.ok) break;
    const page = parseDdg(r.body);
    if (!page.length) break;
    results.push(...page);
    await sleep(1200);
  }
  return results.map(r => ({ ...r, source: 'DuckDuckGo' }));
}

function whoisQuery(server, query, ms = 8000) {
  return new Promise((resolve) => {
    let data = '';
    let done = false;
    const finish = (v) => { if (!done) { done = true; try { sock.destroy(); } catch { /* ignore */ } resolve(v); } };
    const sock = net.connect(43, server, () => sock.write(query + '\r\n'));
    sock.setTimeout(ms);
    sock.on('data', c => { data += c.toString('utf8'); });
    sock.on('end', () => finish(data));
    sock.on('timeout', () => finish(data));
    sock.on('error', () => finish(data));
  });
}

const ageCache = new Map();
export async function domainAge(domain) {
  const key = String(domain || '').toLowerCase();
  if (ageCache.has(key)) return ageCache.get(key);
  const tld = key.split('.').pop();
  let server = WHOIS_SERVERS[tld] || '';
  if (!server) {
    try {
      const ref = await whoisQuery('whois.iana.org', tld);
      const m = ref.match(/^refer:\s*(\S+)/mi);
      if (m) server = m[1].trim();
    } catch { /* none */ }
  }
  let txt = '';
  if (server) { try { txt = await whoisQuery(server, key); } catch { /* ignore */ } }
  const m = txt.match(/(?:creation date|created|created on|registered on|registration time|domain registration date|record created|registration date)[^:\n]*:\s*([^\r\n]+)/i);
  let when = null;
  if (m) {
    const d = new Date(m[1].trim());
    if (!isNaN(d) && d.getFullYear() > 1990 && d.getTime() < Date.now()) when = d;
  }
  const out = { created: when, years: when ? (Date.now() - when.getTime()) / (365.25 * 24 * 3600 * 1000) : null, server: server || 'none' };
  ageCache.set(key, out);
  return out;
}

const SCHEMA_OF_INTEREST = ['Organization', 'LocalBusiness', 'Product', 'FAQPage', 'BreadcrumbList', 'Service', 'WebSite', 'AggregateRating', 'Review'];

function collectLdTypes(node, set) {
  if (!node) return;
  if (Array.isArray(node)) { node.forEach(n => collectLdTypes(n, set)); return; }
  if (typeof node !== 'object') return;
  const t = node['@type'];
  if (typeof t === 'string') set.add(t);
  else if (Array.isArray(t)) t.forEach(x => typeof x === 'string' && set.add(x));
  for (const k of ['@graph', 'mainEntity', 'itemListElement', 'hasOfferCatalog', 'about', 'publisher', 'author']) {
    if (node[k]) collectLdTypes(node[k], set);
  }
}

export async function auditPage(url, kw, withSitemap = true) {
  const r = await get(url, 18000);
  const html = r.body || '';
  const row = {
    url, host: '', status: r.status, ms: r.ms, bytes: html.length, reachable: r.ok && html.length > 500,
    title: '', titleLen: 0, kwTitle: false, desc: '', descLen: 0, kwDesc: false,
    h1: '', kwH1: false, h2: 0, words: 0, imgs: 0, imgsNoAlt: 0, internal: 0, external: 0,
    canonical: '', robotsMeta: '', lang: '', noindex: false, viewport: false,
    schema: [], server: '', cdn: '', cache: '', sitemapEntries: null, ageYears: null, created: null
  };
  try { row.host = new URL(r.url || url).hostname.replace(/^www\./, ''); } catch { row.host = String(url); }
  if (!row.reachable) return row;

  const head = html.slice(0, 200000);
  row.title = decode((head.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').trim();
  row.titleLen = row.title.length;
  row.desc = decode((head.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
    head.match(/<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i) || [])[1] || '').trim();
  row.descLen = row.desc.length;
  row.h1 = textOf((head.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || '');
  row.h2 = (html.match(/<h2[\s>]/gi) || []).length;
  row.canonical = decode((head.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']*)["']/i) || [])[1] || '');
  row.robotsMeta = decode((head.match(/<meta[^>]+name=["']robots["'][^>]*content=["']([^"']*)["']/i) || [])[1] || '');
  row.noindex = /noindex/i.test(row.robotsMeta);
  row.lang = decode((head.match(/<html[^>]+lang=["']([^"']*)["']/i) || [])[1] || '');
  row.viewport = /name=["']viewport["']/i.test(head);

  const text = textOf(html);
  row.words = text ? text.split(/\s+/).length : 0;
  const kWords = norm(kw).split(' ').filter(w => w.length > 2);
  const inText = (s) => { const n = norm(s); return kWords.length ? kWords.every(w => n.includes(w)) : false; };
  row.kwTitle = inText(row.title);
  row.kwDesc = inText(row.desc);
  row.kwH1 = inText(row.h1);

  const imgs = [...html.matchAll(/<img\b([^>]*)>/gi)].map(m => m[1]);
  row.imgs = imgs.length;
  row.imgsNoAlt = imgs.filter(a => !/\balt\s*=/i.test(a) || /\balt\s*=\s*["']\s*["']/i.test(a)).length;

  for (const h of [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)].map(m => m[1])) {
    if (/^https?:\/\//i.test(h)) {
      try { (new URL(h).hostname.replace(/^www\./, '') === row.host ? row.internal++ : row.external++); } catch { row.external++; }
    } else if (h.startsWith('/') || h.startsWith('#')) row.internal++;
  }

  const types = new Set();
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { collectLdTypes(JSON.parse(m[1]), types); } catch { /* invalid JSON-LD */ }
  }
  row.schema = SCHEMA_OF_INTEREST.filter(t => types.has(t));

  row.server = String(r.headers.get('server') || '');
  row.cdn = (/cloudflare/i.test(row.server) || r.headers.get('cf-ray')) ? 'Cloudflare'
    : /hcdn/i.test(row.server) ? 'Hostinger CDN' : (/nginx|apache|litespeed/i.test(row.server) ? row.server : '');
  row.cache = String(r.headers.get('cache-control') || '').slice(0, 40);

  if (withSitemap) {
    const sitemap = await get('https://' + row.host + '/sitemap.xml', 10000);
    if (sitemap.ok && /<loc>/i.test(sitemap.body)) row.sitemapEntries = (sitemap.body.match(/<loc>/gi) || []).length;
  }
  const age = await domainAge(row.host);
  row.ageYears = age.years;
  row.created = age.created ? age.created.toISOString().slice(0, 10) : null;
  return row;
}

const med = (arr) => {
  const v = arr.filter(x => typeof x === 'number' && !Number.isNaN(x)).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : null;
};
const pct = (arr, f) => arr.length ? Math.round((arr.filter(f).length / arr.length) * 100) : 0;
const fmt = (v, d = 1) => (v === null || v === undefined || Number.isNaN(v)) ? '—' : (typeof v === 'number' ? v.toFixed(d) : String(v));

// A row for a domain we ran out of time (or budget) to audit.
function blankRow(host) {
  return {
    url: 'https://' + host + '/', host, status: 0, ms: 0, bytes: 0, reachable: false,
    title: '', titleLen: 0, kwTitle: false, desc: '', descLen: 0, kwDesc: false,
    h1: '', kwH1: false, h2: 0, words: 0, imgs: 0, imgsNoAlt: 0, internal: 0, external: 0,
    canonical: '', robotsMeta: '', lang: '', noindex: false, viewport: false,
    schema: [], server: '', cdn: '', cache: '', sitemapEntries: null, ageYears: null, created: null
  };
}

/**
 * @param {{site:string, keywords:string[], maxAudit?:number, log?:Function}} opts
 */
export async function runSerpAudit({ site, keywords, maxAudit = 12, budgetMs = 110000, log = () => {} }) {
  const clean = String(site || '').replace(/^https?:\/\//i, '').replace(/\/+$/, '').replace(/^www\./, '');
  const kws = (Array.isArray(keywords) ? keywords : []).map(s => String(s).trim()).filter(Boolean).slice(0, 8);
  if (!clean || !kws.length) throw new Error('A site and at least one keyword are required.');
  // Hard budget so a web request (the workshop button) never hangs on slow sites.
  const deadline = Date.now() + budgetMs;

  const perKeyword = [];
  const order = [];
  for (const kw of kws) {
    if (perKeyword.length && Date.now() > deadline) break;
    const found = await serp(kw);
    const seen = new Set();
    const top = [];
    for (const r of found) {
      if (seen.has(r.host)) continue;
      seen.add(r.host);
      top.push(r);
      if (top.length >= 20) break;
    }
    perKeyword.push({ keyword: kw, items: top });
    for (const r of top.slice(0, maxAudit)) if (!order.includes(r.host)) order.push(r.host);
    log('serp ' + kw + ' -> ' + top.length + (top[0] ? ' (#1 ' + top[0].host + ')' : ''));
    await sleep(700);
  }

  const auditCache = new Map();
  const audited = new Map();
  async function auditOnce(host, href, kw) {
    if (audited.has(host)) return audited.get(host);
    if (Date.now() > deadline) { const blank = blankRow(host); audited.set(host, blank); return blank; }
    let row;
    if (auditCache.has(href)) row = auditCache.get(href);
    else { row = await auditPage(href, kw); auditCache.set(href, row); }
    audited.set(host, row);
    log('audit ' + host + ' · ' + row.status + ' · ' + row.ms + 'ms');
    return row;
  }

  const ourRows = [];
  for (const kw of kws) ourRows.push(await auditPage('https://' + clean + '/', kw, true));
  const ours = ourRows[0];
  // Site-wide schema: the homepage alone does not show FAQ/Product markup.
  const siteSchema = new Set(ours.schema);
  for (const extra of ['/faq', '/products/pet-bottle-scrap']) {
    const page = await auditPage('https://' + clean + extra, kws[0], false);
    page.schema.forEach(s => siteSchema.add(s));
  }

  const keywordsOut = [];
  for (const block of perKeyword) {
    const results = [];
    for (let i = 0; i < block.items.length; i++) {
      const item = block.items[i];
      const row = item.host === clean ? ours : await auditOnce(item.host, item.href, block.keyword);
      results.push({
        rank: i + 1,
        host: item.host,
        href: item.href,
        type: classify(item.host),
        title: row.reachable ? row.title : '',
        reachable: !!row.reachable,
        status: row.status,
        ageYears: row.ageYears,
        created: row.created,
        kwTitle: !!row.kwTitle,
        kwH1: !!row.kwH1,
        words: row.words,
        schema: row.schema || [],
        ms: row.ms,
        isOurs: item.host === clean
      });
    }
    keywordsOut.push({ keyword: block.keyword, results });
  }

  const first = keywordsOut[0];
  const top5 = first.results.slice(0, 5).map(r => r);
  const dirsTop20 = first.results.filter(r => r.type === 'directory').length;
  const ourRank = (first.results.find(r => r.isOurs) || {}).rank || null;

  const factors = [
    { label: 'Median domain age (years)', top5: fmt(med(top5.map(r => r.ageYears))), ours: fmt(ours.ageYears) },
    { label: 'Median response time (ms)', top5: fmt(med(top5.map(r => r.ms)), 0), ours: String(ours.ms) },
    { label: 'Median word count', top5: fmt(med(top5.map(r => r.words)), 0), ours: String(ours.words) },
    { label: 'Keyword in title', top5: pct(top5, r => r.kwTitle) + '%', ours: ours.kwTitle ? 'yes' : 'no' },
    { label: 'Keyword in H1', top5: pct(top5, r => r.kwH1) + '%', ours: ours.kwH1 ? 'yes' : 'no' },
    { label: 'Organization / LocalBusiness schema', top5: pct(top5, r => r.schema.includes('Organization') || r.schema.includes('LocalBusiness')) + '%', ours: siteSchema.has('Organization') || siteSchema.has('LocalBusiness') ? 'yes' : 'no' },
    { label: 'FAQPage schema', top5: pct(top5, r => r.schema.includes('FAQPage')) + '%', ours: siteSchema.has('FAQPage') ? 'yes' : 'no' },
    { label: 'Product schema', top5: pct(top5, r => r.schema.includes('Product')) + '%', ours: siteSchema.has('Product') ? 'yes' : 'no' },
    { label: 'Behind a CDN', top5: pct(top5, r => !!r.cdn) + '%', ours: ours.cdn ? 'yes' : 'no' }
  ];

  const dirShare = top5.length ? Math.round((top5.filter(r => r.type === 'directory').length / top5.length) * 100) : 0;
  const gaps = [];
  if (dirShare >= 40 || dirsTop20 >= 3) gaps.push('Directories are ' + dirShare + '% of the top 5 and ' + dirsTop20 + ' of the ' + first.results.length + ' results returned — get the company listed in the ones that rank (they collect facts and links; that is why they win).');
  if ((med(top5.map(r => r.ageYears)) || 0) > 0.5) gaps.push('The top 5 have been live a median of ' + fmt(med(top5.map(r => r.ageYears))) + ' years. Nothing closes that today; publish consistently and the long-tail phrases move first.');
  if (pct(top5, r => r.kwTitle) >= 50 && !ours.kwTitle) gaps.push('Put the exact phrase in the <title> of the page you want to rank — ' + pct(top5, r => r.kwTitle) + '% of the top 5 do.');
  if (pct(top5, r => r.kwH1) >= 50 && !ours.kwH1) gaps.push('Put the exact phrase in the H1.');
  if (!siteSchema.has('FAQPage')) gaps.push('Add FAQPage schema to the page targeting the phrase, answering the buyer questions in the same words.');
  if (!siteSchema.has('Product')) gaps.push('Add Product schema on material pages so they can surface as items, not just links.');
  if ((med(top5.map(r => r.ms)) || 0) < ours.ms) gaps.push('Response time: ' + ours.ms + 'ms against a ' + fmt(med(top5.map(r => r.ms)), 0) + 'ms median — check the edge cache for HTML.');
  gaps.push('Earn mentions that use the exact phrase (anchor text and first paragraph), not just links: the entity is matched on the words the query uses.');

  const source = (perKeyword[0].items[0] || {}).source || 'DuckDuckGo';
  const generatedAt = new Date().toISOString().slice(0, 16).replace('T', ' ');

  // ---- markdown (saved by the CLI, copied out of the workshop modal)
  const esc = (s) => String(s || '').replace(/\|/g, '\\|');
  let md = '# SERP & competitor SEO audit — ' + clean + '\n\n';
  md += 'Generated ' + generatedAt + ' · ' + kws.length + ' keywords · SERP source: ' + source + '\n\n';
  md += '> ' + (source === 'Google CSE' ? 'Google Custom Search order.' :
    'DuckDuckGo order is a proxy for "who competes on this phrase", not your Google position, and it returns about 10 results per phrase. Set GOOGLE_CSE_KEY + GOOGLE_CSE_ID to use Google\'s own order with 20 results (free: 100 queries/day).') + '\n\n';
  for (const block of keywordsOut) {
    md += '## "' + block.keyword + '"\n\n';
    if (!block.results.length) { md += 'No results parsed.\n\n'; continue; }
    const dirs = block.results.filter(r => r.type === 'directory').length;
    md += 'Top ' + block.results.length + ' · **' + dirs + ' directory/marketplace** · our rank: ' + (ourRank || 'not in the top ' + block.results.length) + '\n\n';
    md += '| # | Domain | Type | Age (y) | Title | kw in title | kw in H1 | Words | Schema | ms |\n|---|---|---|---|---|---|---|---|---|---|\n';
    for (const r of block.results) {
      md += '| ' + r.rank + ' | [' + esc(r.host) + '](' + r.href + ') | ' + r.type + ' | ' + fmt(r.ageYears) + ' | ' +
        (r.reachable ? esc(r.title.slice(0, 70)) : '*HTTP ' + r.status + '*') + ' | ' + (r.kwTitle ? 'yes' : 'no') + ' | ' +
        (r.kwH1 ? 'yes' : 'no') + ' | ' + r.words + ' | ' + (r.schema.length ? r.schema.slice(0, 3).join(', ') : '—') + ' | ' + r.ms + ' |\n';
    }
    md += '\n';
  }
  md += '\n## Why the top 5 win ("' + first.keyword + '")\n\n| Factor | Top 5 | ' + clean + ' |\n|---|---|---|\n';
  for (const f of factors) md += '| ' + f.label + ' | ' + f.top5 + ' | ' + f.ours + ' |\n';
  md += '\n### Reading it\n\n';
  md += '- ' + dirShare + '% of the top 5 are directories or marketplaces. They win by collecting company facts and by being linked to, not by writing better copy.\n';
  md += '- Median age of the top 5 is ' + fmt(med(top5.map(r => r.ageYears))) + ' years; ' + clean + ' is ' + fmt(ours.ageYears) + '.\n';
  md += '- On-page factors are already ' + (ours.kwTitle && ours.kwH1 ? 'matched' : 'close') + ': extra copy will not move you, entity signals and mentions will.\n';
  md += '- Speed and schema are table stakes here, not differentiators.\n';
  md += '\n## Gaps to close, most impact first\n\n' + gaps.map(g => '- ' + g).join('\n') + '\n';

  return { ok: true, site: clean, generatedAt, source, keywords: keywordsOut, factors, gaps, ourRank, markdown: md };
}
