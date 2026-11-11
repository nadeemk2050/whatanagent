// ============================================================================
// 🔎 AL QARYAN — website audit (workshop evidence collector)
// ============================================================================
// Reads the live site and reports, page by page, the things the Websites Workshop
// tracks: mixed content, alt text, unique titles/H1s, canonicals, viewport, cache
// headers, structured data, NAP and the WhatsApp/quote CTA.
//
// Nothing is written anywhere — this only measures, so the workshop's "done" notes
// can be backed by real evidence instead of assumption.
//
//   node scripts/alqaryan-audit.mjs
//   node scripts/alqaryan-audit.mjs --site https://example.com --json out.json
// ============================================================================
import fs from 'node:fs';

const arg = (name, fallback = '') => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const SITE = arg('site', 'https://alqaryangroup.com').replace(/\/$/, '');
const JSON_OUT = arg('json', '');
const UA = 'Mozilla/5.0 (compatible; WorkshopAudit/1.0; +https://whatanagent.duckdns.org)';
const CONCURRENCY = 6;
const TIMEOUT_MS = 25000;

const strip = (h) => String(h || '');
const unesc = (s) => strip(s).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

async function get(url, { method = 'GET' } = {}) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { method, redirect: 'follow', headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const body = method === 'HEAD' ? '' : await res.text();
    return { ok: res.ok, status: res.status, headers: res.headers, body, ms: Date.now() - t0, url: res.url };
  } catch (e) {
    return { ok: false, status: 0, headers: new Headers(), body: '', ms: Date.now() - t0, error: e.message, url };
  }
}

async function sitemapUrls() {
  const out = [];
  const index = await get(SITE + '/sitemap_index.xml');
  const direct = [];
  const children = [];
  for (const m of index.body.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const u = m[1].trim();
    if (/\.xml$/i.test(u)) children.push(u); else direct.push(u);
  }
  if (!children.length) children.push(SITE + '/page-sitemap.xml');
  for (const child of children) {
    const s = await get(child);
    for (const m of s.body.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const u = m[1].trim();
      if (!/\.xml$/i.test(u)) out.push(u);
    }
  }
  return [...new Set([...direct, ...out])];
}

function analysePage(page, url) {
  const html = page.body;
  const headHtml = (html.match(/<head[\s\S]*?<\/head>/i) || [''])[0];
  const title = unesc((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  const desc = unesc((html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i) || [])[1] || '');
  const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => unesc(m[1].replace(/<[^>]+>/g, ''))).filter(Boolean);
  const canonical = (headHtml.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) || [])[1] || '';
  const robots = (headHtml.match(/<meta[^>]+name=["']robots["'][^>]*content=["']([^"']+)["']/i) || [])[1] || '';
  const viewport = (headHtml.match(/<meta[^>]+name=["']viewport["'][^>]*content=["']([^"']+)["']/i) || [])[1] || '';

  // images + alt
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map(m => m[0]);
  const missingAlt = imgs.filter(t => !/\balt\s*=\s*("[^"]*"|'[^']*')/i.test(t));
  const emptyAlt = imgs.filter(t => /\balt\s*=\s*("[^"]{0,3}"|'[^']{0,3}')/i.test(t));

  // mixed content: any http:// asset reference (src/href/srcset/url()) inside the HTML
  const insecure = [...html.matchAll(/(?:src|href|srcset|data-src|action)\s*=\s*["']http:\/\/[^"']+/gi)].map(m => m[0]);
  const insecureCss = [...html.matchAll(/url\(\s*['"]?http:\/\/[^)'"]+/gi)].map(m => m[0]);

  // structured data
  const ldTypes = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = m[1];
    for (const t of raw.matchAll(/"@type"\s*:\s*"([^"]+)"/g)) ldTypes.push(t[1]);
  }

  // CTAs and contact signals
  const hasWhatsApp = /wa\.me\/|api\.whatsapp\.com|whatsapp/i.test(html);
  const telLinks = [...html.matchAll(/href=["']tel:([^"']+)["']/gi)].map(m => m[1]);
  const hasForm = /<form\b/i.test(html);
  const hasMap = /google\.com\/maps|maps\.google|iframe[^>]+maps/i.test(html);
  const hasFaqSchema = ldTypes.includes('FAQPage');
  const hasOrg = ldTypes.includes('Organization') || ldTypes.includes('LocalBusiness');

  return {
    url, status: page.status, ms: page.ms,
    title, titleLen: title.length, desc, descLen: desc.length,
    h1Count: h1s.length, h1: h1s[0] || '',
    canonical, robots, viewport,
    images: imgs.length, missingAlt: missingAlt.length, emptyAlt: emptyAlt.length,
    insecureRefs: insecure.length + insecureCss.length, insecureSample: [...insecure, ...insecureCss].slice(0, 3),
    ldTypes: [...new Set(ldTypes)], hasOrg, hasFaqSchema,
    hasWhatsApp, telLinks: [...new Set(telLinks)], hasForm, hasMap
  };
}

async function pool(items, fn, n) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k], k);
    }
  }));
  return out;
}

const main = async () => {
  console.log('Auditing ' + SITE + ' …\n');
  const home = await get(SITE + '/');
  if (!home.ok) { console.error('Homepage failed: ' + (home.error || home.status)); process.exit(1); }

  // hostname / redirect behaviour
  const wwwTest = await get(SITE.replace('https://', 'https://www.') + '/');
  const trailing = await get(SITE + '/about');

  const urls = await sitemapUrls();
  console.log('Sitemap URLs: ' + urls.length);

  const pages = await pool(urls, async (u) => {
    const p = await get(u);
    return analysePage(p, u);
  }, CONCURRENCY);

  // ---- aggregate
  const bad = pages.filter(p => !p.status || p.status >= 400);
  const noTitle = pages.filter(p => !p.title);
  const dupTitles = Object.entries(pages.reduce((a, p) => { a[p.title] = (a[p.title] || 0) + 1; return a; }, {})).filter(([, n]) => n > 1);
  const dupH1 = Object.entries(pages.reduce((a, p) => { if (p.h1) a[p.h1] = (a[p.h1] || 0) + 1; return a; }, {})).filter(([, n]) => n > 1);
  const noH1 = pages.filter(p => p.h1Count === 0);
  const multiH1 = pages.filter(p => p.h1Count > 1);
  const noCanonical = pages.filter(p => !p.canonical);
  const noindex = pages.filter(p => /noindex/i.test(p.robots));
  const noViewport = pages.filter(p => !p.viewport);
  const altIssues = pages.filter(p => p.missingAlt > 0);
  const mixed = pages.filter(p => p.insecureRefs > 0);
  const cacheHeaders = [...home.headers.entries()].filter(([k]) => /cache|cdn|litespeed|age|x-|server|cf-/i.test(k));
  const ttl = home.headers.get('cache-control') || '';
  const cached = /max-age|s-maxage|public/i.test(ttl);

  console.log('\n=== INDEXING / STRUCTURE ===');
  console.log('pages fetched            : ' + pages.length + (bad.length ? '  (' + bad.length + ' failed: ' + bad.map(b => b.url + ' ' + b.status).join(', ') + ')' : '  (all 2xx/3xx)'));
  console.log('missing title            : ' + noTitle.length);
  console.log('duplicate titles         : ' + dupTitles.length + (dupTitles.length ? ' -> ' + dupTitles.slice(0, 5).map(([t, n]) => n + 'x "' + t.slice(0, 50) + '"').join(' | ') : ''));
  console.log('missing H1               : ' + noH1.length);
  console.log('more than one H1         : ' + multiH1.length);
  console.log('duplicate H1             : ' + dupH1.length + (dupH1.length ? ' -> ' + dupH1.slice(0, 5).map(([t, n]) => n + 'x "' + t.slice(0, 50) + '"').join(' | ') : ''));
  console.log('missing canonical        : ' + noCanonical.length);
  console.log('noindex pages            : ' + noindex.length + (noindex.length ? ' -> ' + noindex.map(p => p.url).join(', ') : ''));
  console.log('missing viewport         : ' + noViewport.length);

  console.log('\n=== HTTPS / MIXED CONTENT ===');
  console.log('pages with http:// refs  : ' + mixed.length + (mixed.length ? ' -> ' + mixed.slice(0, 8).map(p => p.url + ' (' + p.insecureRefs + ')').join(', ') : ''));
  if (mixed.length) mixed.slice(0, 5).forEach(p => console.log('   ' + p.url + ' :: ' + p.insecureSample.join(' , ')));

  console.log('\n=== IMAGES / ALT TEXT ===');
  const totalImgs = pages.reduce((a, p) => a + p.images, 0);
  const totalMissing = pages.reduce((a, p) => a + p.missingAlt, 0);
  const totalEmpty = pages.reduce((a, p) => a + p.emptyAlt, 0);
  console.log('images total             : ' + totalImgs);
  console.log('images without alt       : ' + totalMissing + (altIssues.length ? '  on ' + altIssues.length + ' page(s)' : ''));
  console.log('images with empty alt    : ' + totalEmpty);
  if (altIssues.length) altIssues.slice(0, 10).forEach(p => console.log('   ' + p.url + ' :: ' + p.missingAlt + ' missing / ' + p.images));

  console.log('\n=== CACHING / CDN ===');
  cacheHeaders.forEach(([k, v]) => console.log('  ' + k + ': ' + String(v).slice(0, 90)));
  console.log('page cache declared      : ' + (cached ? 'YES (' + ttl + ')' : 'NO cache-control on HTML'));
  console.log('homepage TTFB            : ' + home.ms + ' ms');

  console.log('\n=== STRUCTURED DATA ===');
  const orgPages = pages.filter(p => p.hasOrg).length;
  const faqPages = pages.filter(p => p.hasFaqSchema).length;
  console.log('Organization/LocalBusiness: ' + orgPages + '/' + pages.length);
  console.log('FAQPage                  : ' + faqPages + '/' + pages.length);
  const types = pages.reduce((a, p) => { p.ldTypes.forEach(t => a[t] = (a[t] || 0) + 1); return a; }, {});
  console.log('types seen               : ' + Object.entries(types).map(([t, n]) => t + '×' + n).join(', '));

  console.log('\n=== CONVERSION / CONTACT ===');
  console.log('pages with WhatsApp link : ' + pages.filter(p => p.hasWhatsApp).length + '/' + pages.length);
  console.log('pages with a form        : ' + pages.filter(p => p.hasForm).length);
  console.log('pages with a map embed   : ' + pages.filter(p => p.hasMap).length);
  console.log('tel: links seen          : ' + [...new Set(pages.flatMap(p => p.telLinks))].join(', '));

  console.log('\n=== REDIRECTS ===');
  console.log('www host                 : ' + (wwwTest.status ? wwwTest.status + ' -> ' + wwwTest.url : 'no response'));
  console.log('trailing-slash /about    : ' + (trailing.status ? trailing.status + ' -> ' + trailing.url : 'no response'));

  const report = {
    site: SITE, at: new Date().toISOString(), pages,
    summary: {
      urls: pages.length, failed: bad.length,
      duplicateTitles: dupTitles.length, missingH1: noH1.length, multiH1: multiH1.length,
      duplicateH1: dupH1.length, noCanonical: noCanonical.length, noindex: noindex.length,
      noViewport: noViewport.length, mixedContentPages: mixed.length,
      images: totalImgs, imagesMissingAlt: totalMissing, imagesEmptyAlt: totalEmpty,
      cacheDeclared: cached, ttfbMs: home.ms,
      orgPages, faqPages, whatsappPages: pages.filter(p => p.hasWhatsApp).length,
      wwwStatus: wwwTest.status, wwwFinal: wwwTest.url
    }
  };
  if (JSON_OUT) { fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 1), 'utf8'); console.log('\nJSON written: ' + JSON_OUT); }

  console.log('\n--- DONE ---');
};

main().catch(e => { console.error('audit crashed:', e); process.exit(1); });
