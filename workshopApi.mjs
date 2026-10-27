// ============================================================================
// 🏗️ WEBSITES WORKSHOP — API routes
// ============================================================================
// Registered from index.js via registerWorkshopRoutes(app, db). Every route is
// behind the same fail-closed admin guard as the Academy / Offices
// (no ADMIN_TOKEN on the server -> 503, wrong token -> 401).
//
// The workshop is where websites are taken over and run by staff:
//   • a Workshop Manager (one AI staff member, hired from the Academy store)
//   • engineers (AI staff members) who are assigned to individual websites
//   • the websites themselves, stored ONCE in appData/seoAgent.sites so the
//     SEO agent and the workshop never disagree about a site or its password.
//     Workshop-only metadata (engineers, approvals, host facts, health) lives
//     in appData/websitesWorkshop.
//
// Route map
//   GET  /api/workshop/state                  manager, engineers, sites, stats
//   POST /api/workshop/scan                   inspect a URL (DNS + HTTP + CMS)
//   POST /api/workshop/site                   add / update a website
//   POST /api/workshop/site/assign            assign engineers to a website
//   POST /api/workshop/site/remove            remove a website from the workshop
//   POST /api/workshop/health                 re-check health (one or all)
//   POST /api/workshop/hire                   hire the manager or an engineer
//   POST /api/workshop/manager                appoint an existing staff member
//   POST /api/workshop/staff/remove           take a staff member off the workshop
// ============================================================================
import net from 'node:net';
import dns from 'node:dns/promises';
import axios from 'axios';
import { doc, getDoc, setDoc, updateDoc, deleteField, FieldPath } from 'firebase/firestore';
import { makeAdminGuard } from './adminGuard.mjs';
import { attachAgentsDb, listAgents, getAgent, createAgent } from './agentsStore.mjs';

const WORKSHOP = 'websitesWorkshop';
const SEO = 'seoAgent';
const UA = 'Mozilla/5.0 (compatible; WhatAnAgent-Workshop/1.0)';
const MAX_ENGINEERS_PER_SITE = 6;

const sstr = (v, n = 400) => String(v == null ? '' : v).slice(0, n);
const trimSlash = (s) => String(s || '').replace(/\/+$/, '');
const bad = (res, msg) => res.status(400).json({ ok: false, error: msg });

// ---------------------------------------------------------------------------
// URL safety: the scan endpoint fetches arbitrary addresses, so never let it
// reach loopback / RFC1918 / link-local targets (SSRF).
// ---------------------------------------------------------------------------
export function isPrivateIp(ip) {
  if (!ip) return true;
  if (net.isIPv4(ip)) {
    const p = ip.split('.').map(Number);
    if (p[0] === 0 || p[0] === 10 || p[0] === 127) return true;
    if (p[0] === 169 && p[1] === 254) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;
    if (p[0] >= 224) return true;
    return false;
  }
  const low = String(ip).toLowerCase();
  if (low === '::1' || low === '::') return true;
  if (low.startsWith('::ffff:')) return isPrivateIp(low.slice(7));
  if (low.startsWith('fc') || low.startsWith('fd')) return true;
  if (low.startsWith('fe80')) return true;
  return false;
}

function normalizeUrl(raw) {
  let s = String(raw || '').trim();
  if (!s) throw new Error('Enter the website address first.');
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  let u;
  try { u = new URL(s); } catch (e) { throw new Error('That does not look like a website address.'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('Only http:// and https:// addresses are supported.');
  if (!u.hostname.includes('.') || u.hostname === 'localhost') throw new Error('The domain in that address looks incomplete.');
  return trimSlash(u.toString());
}

async function assertPublicUrl(raw) {
  const url = normalizeUrl(raw);
  const host = new URL(url).hostname.toLowerCase();
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error('That address is inside a private network — the workshop only inspects public websites.');
    return url;
  }
  let addrs = [];
  try { addrs = await dns.lookup(host, { all: true, verbatim: true }); }
  catch (e) { throw new Error('The domain "' + host + '" did not resolve. Check the spelling, or the DNS may not be live yet.'); }
  if (!addrs.length) throw new Error('The domain "' + host + '" did not resolve.');
  if (addrs.some(a => isPrivateIp(a.address))) throw new Error('That domain points at a private network address — refusing to inspect it.');
  return url;
}

const withTimeout = (p, ms, fallback) => Promise.race([
  p.catch(() => fallback),
  new Promise(resolve => setTimeout(() => resolve(fallback), ms))
]);

// Manual redirect following so every hop is re-validated.
async function safeGet(rawUrl, { maxHops = 4, timeout = 12000 } = {}) {
  let current = rawUrl;
  const chain = [];
  for (let hop = 0; hop <= maxHops; hop++) {
    const url = await assertPublicUrl(current);
    chain.push(url);
    const started = Date.now();
    let res;
    try {
      res = await axios.get(url, {
        timeout,
        maxRedirects: 0,
        responseType: 'text',
        decompress: true,
        maxContentLength: 2000000,
        validateStatus: () => true,
        headers: {
          'user-agent': UA,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'en'
        }
      });
    } catch (e) {
      const code = e && e.code ? String(e.code) : '';
      let msg = e.message || 'Request failed';
      if (code === 'ENOTFOUND') msg = 'The host name could not be found.';
      else if (code === 'ECONNREFUSED') msg = 'The server refused the connection (port closed).';
      else if (code === 'ETIMEDOUT' || /timeout/i.test(msg)) msg = 'The site did not answer in time.';
      else if (/certificate|SSL|CERT/i.test(msg)) msg = 'The HTTPS certificate is not valid for this address.';
      else if (/maxContentLength|maxContent/i.test(msg)) msg = 'The page is too large to inspect.';
      else if (code === 'ERR_FR_TOO_MANY_REDIRECTS') msg = 'The site redirects in a loop.';
      return { ok: false, error: msg, status: 0, headers: {}, body: '', ms: Date.now() - started, finalUrl: url, chain };
    }
    const status = Number(res.status) || 0;
    const loc = res.headers && res.headers.location;
    if (status >= 300 && status < 400 && loc) {
      current = new URL(loc, url).toString();
      continue;
    }
    return {
      ok: status >= 200 && status < 400,
      status,
      headers: res.headers || {},
      body: String(res.data == null ? '' : res.data).slice(0, 700000),
      ms: Date.now() - started,
      finalUrl: url,
      chain
    };
  }
  return { ok: false, error: 'Too many redirects.', status: 0, headers: {}, body: '', ms: 0, finalUrl: current, chain };
}

// ---------------------------------------------------------------------------
// Detection: provider from nameservers, stack from headers + markup
// ---------------------------------------------------------------------------
const NS_PROVIDERS = [
  [/hostinger|dns-parking\.com/i, 'Hostinger'],
  [/ns\.cloudflare\.com|cloudflare/i, 'Cloudflare'],
  [/googledomains|ns-cloud|google\.com/i, 'Google Cloud DNS'],
  [/registrar-servers\.com|namecheap/i, 'Namecheap'],
  [/domaincontrol|godaddy/i, 'GoDaddy'],
  [/digitalocean/i, 'DigitalOcean'],
  [/alidns|hichina|aliyun/i, 'Alibaba Cloud DNS'],
  [/dnspod|tencent|\.qq\.com/i, 'Tencent Cloud DNSPod'],
  [/azure-dns/i, 'Azure DNS'],
  [/awsdns/i, 'AWS Route 53'],
  [/bluehost/i, 'Bluehost'],
  [/siteground/i, 'SiteGround'],
  [/name\.com/i, 'Name.com'],
  [/dnsimple/i, 'DNSimple'],
  [/vultr/i, 'Vultr'],
  [/linode/i, 'Akamai / Linode'],
  [/hostgator/i, 'HostGator'],
  [/porkbun/i, 'Porkbun'],
  [/wordpress\.com/i, 'WordPress.com'],
  [/squarespace/i, 'Squarespace'],
  [/wixdns|wix\.com/i, 'Wix'],
  [/shopify/i, 'Shopify'],
  [/vercel/i, 'Vercel'],
  [/netlify/i, 'Netlify'],
  [/one\.com/i, 'One.com'],
  [/hostnet/i, 'Hostnet'],
  [/hover/i, 'Hover'],
  [/dnsowl|namecheap/i, 'Namecheap'],
  [/nsone|ns1\.com/i, 'NS1']
];

function providerFromNs(list) {
  const joined = (list || []).join(' ').toLowerCase();
  if (!joined) return '';
  for (const [re, name] of NS_PROVIDERS) if (re.test(joined)) return name;
  return '';
}

function registrableDomain(host) {
  const h = String(host || '').toLowerCase().replace(/^www\./, '');
  const parts = h.split('.');
  if (parts.length <= 2) return h;
  const two = parts.slice(-2).join('.');
  // second-level suffixes like co.uk / com.au / com.pk
  if (/^(co|com|org|net|gov|edu|ac)\.[a-z]{2}$/.test(two)) return parts.slice(-3).join('.');
  return two;
}

function detectStack(res) {
  const h = res.headers || {};
  const html = res.body || '';
  const low = html.toLowerCase();
  const stack = { platform: '', version: '', server: '', cdn: '', builder: '', ecommerce: '', signals: [] };
  const add = (s) => { if (s && !stack.signals.includes(s)) stack.signals.push(s); };

  const server = String(h.server || '').toLowerCase();
  if (server) stack.server = String(h.server).slice(0, 60);
  if (h['x-powered-by']) add('X-Powered-By: ' + String(h['x-powered-by']).slice(0, 60));

  if (h['cf-ray']) { stack.cdn = 'Cloudflare'; add('Cloudflare edge (cf-ray)'); }
  else if (/^hcdn$/i.test(server) || /hostinger/i.test(server)) { stack.cdn = 'Hostinger CDN'; add('Hostinger CDN (hcdn)'); }
  else if (h['x-vercel-id'] || h['x-vercel-cache']) { stack.cdn = 'Vercel'; add('Vercel edge'); }
  else if (h['x-nf-request-id']) { stack.cdn = 'Netlify'; add('Netlify edge'); }
  else if (h['x-github-request-id']) { stack.cdn = 'GitHub Pages'; add('GitHub Pages'); }
  else if (h['x-litespeed-cache'] || /litespeed/i.test(server)) { stack.cdn = ''; add('LiteSpeed web server'); }
  else if (h['x-sucuri-id']) { stack.cdn = 'Sucuri'; add('Sucuri firewall'); }
  else if (h['x-kinsta-cache']) { add('Kinsta hosting'); }

  const gen = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i);
  if (gen) add('Generator meta: ' + sstr(gen[1], 60));

  if (/wp-content|wp-includes|wp-json/i.test(low)) {
    stack.platform = 'WordPress';
    const v = (gen && /WordPress\s*([\d.]+)/i.exec(gen[1])) || /ver=([\d.]+)/.exec(html);
    if (v) stack.version = v[1];
  }
  if (/cdn\.shopify\.com|shopify\.theme/i.test(low) || h['x-shopid'] || h['x-shopify-stage']) { stack.platform = 'Shopify'; stack.ecommerce = 'Shopify'; add('Shopify storefront'); }
  if (/static\.wixstatic\.com|wix-image|_wixcssloader/i.test(low) || h['x-wix-request-id']) { stack.platform = 'Wix'; add('Wix site'); }
  if (/squarespace-cdn|static1\.squarespace\.com|squarespace\.com\/universal/i.test(low)) { stack.platform = 'Squarespace'; add('Squarespace site'); }
  if (/webflow\.(io|com)\/|data-wf-page/i.test(low)) { stack.platform = 'Webflow'; add('Webflow site'); }
  if (/\/_next\/static\/|__NEXT_DATA__/i.test(low)) { stack.builder = 'Next.js'; add('Next.js front end'); }
  if (/__gatsby|page-data\.json/i.test(low)) { stack.builder = 'Gatsby'; add('Gatsby front end'); }
  if (/joomla/i.test(low) && !stack.platform) { stack.platform = 'Joomla'; add('Joomla markup'); }
  if (/drupal-settings-json|sites\/(all|default)\/files/i.test(low) && !stack.platform) { stack.platform = 'Drupal'; add('Drupal markup'); }
  if (stack.platform === 'WordPress') {
    if (/elementor/i.test(low)) { stack.builder = stack.builder || 'Elementor'; add('Elementor page builder'); }
    if (/woocommerce/i.test(low)) { stack.ecommerce = 'WooCommerce'; add('WooCommerce shop'); }
    if (/wpml|sitepress/i.test(low)) add('WPML multilingual');
  }
  if (/blogger\.com\/static|blogspot/i.test(low) && !stack.platform) { stack.platform = 'Blogger'; add('Blogger template'); }
  if (!stack.platform) {
    const generic = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i);
    if (generic) { stack.platform = 'Other (see generator)'; stack.builder = sstr(generic[1], 60); }
  }
  return stack;
}

async function probeText(url) {
  const started = Date.now();
  try {
    const r = await safeGet(url, { maxHops: 2, timeout: 9000 });
    return { ok: r.ok, status: r.status, body: r.body, ms: Date.now() - started };
  } catch (e) { return { ok: false, status: 0, body: '', ms: Date.now() - started, error: e.message }; }
}

function countSitemapUrls(xml) {
  const locs = String(xml || '').match(/<loc>/gi);
  return locs ? locs.length : 0;
}

function buildChecklist({ stack, dnsInfo, http, pages }) {
  const items = [];
  const push = (o) => items.push(Object.assign({ have: false }, o));
  const wp = stack.platform === 'WordPress';

  if (wp) {
    push({ id: 'cms.username', group: 'cms', kind: 'text', required: true, label: 'WordPress username', why: 'The workshop signs in with its own account so every edit is traceable to the workshop, not to your personal login.' });
    push({ id: 'cms.appPassword', group: 'cms', kind: 'secret', required: true, label: 'WordPress Application Password', why: 'wp-admin → Users → your profile → Application Passwords → create one named "ATS Workshop". It can be revoked any time without changing your real password.' });
    push({ id: 'cms.adminUrl', group: 'cms', kind: 'text', required: false, label: 'Admin (wp-admin) address', why: wp ? 'Prefilled from the address you gave — correct it if your login lives somewhere else.' : 'Where the login page lives.' });
  } else if (/shopify/i.test(stack.platform)) {
    push({ id: 'cms.shopifyToken', group: 'cms', kind: 'secret', required: true, label: 'Shopify Admin API access token', why: 'Shopify Admin → Apps → Develop apps → create a custom app and copy the Admin API token.' });
  } else if (/wix/i.test(stack.platform)) {
    push({ id: 'cms.wixKey', group: 'cms', kind: 'secret', required: true, label: 'Wix API key + site ID', why: 'Wix dashboard → Settings → API keys.' });
  } else {
    push({ id: 'cms.username', group: 'cms', kind: 'text', required: true, label: 'Admin username', why: 'The workshop needs a named login of its own on this platform.' });
    push({ id: 'cms.appPassword', group: 'cms', kind: 'secret', required: true, label: 'Admin password / API key', why: 'Used only by the workshop manager and the engineer assigned to this site.' });
  }

  push({ id: 'server.panel', group: 'server', kind: 'bool', required: false, label: 'Hosting panel access', why: 'Needed for backups, PHP version, database and cron jobs. ' + (dnsInfo.provider ? 'This domain appears to be at ' + dnsInfo.provider + '.' : '') });
  push({ id: 'server.ftp', group: 'server', kind: 'bool', required: false, label: 'FTP / SFTP account', why: 'Only needed for theme or plugin file edits and full backups.' });
  if (stack.cdn === 'Cloudflare') {
    push({ id: 'cloud.cfToken', group: 'cloud', kind: 'secret', required: false, label: 'Cloudflare API token', why: 'This site is behind Cloudflare — a token lets us purge cache after changes and read zone settings without touching your DNS by hand.' });
  }
  push({ id: 'dns.registrar', group: 'dns', kind: 'bool', required: false, label: 'Domain registrar access', why: 'For DNS records, new subdomains and renewals. Nameservers: ' + ((dnsInfo.nameservers || []).slice(0, 2).join(', ') || 'not detected') + '.' });
  push({ id: 'growth.gsc', group: 'growth', kind: 'bool', required: false, label: 'Google Search Console', why: 'Shows real queries, indexing problems and sitemap status.' });
  push({ id: 'growth.analytics', group: 'growth', kind: 'bool', required: false, label: 'Google Analytics 4', why: 'Traffic and conversion numbers for the monthly report.' });
  push({ id: 'growth.meta', group: 'growth', kind: 'bool', required: false, label: 'Meta / Facebook page', why: 'Only if we will post updates or run ads for this site.' });
  push({ id: 'approval.owner', group: 'approval', kind: 'text', required: true, label: 'Who authorised full management', why: 'Written approval from the owner (name + date). If it is you, write your own name — it is recorded against every change.' });

  return items;
}

async function inspectSite(rawUrl) {
  const url = normalizeUrl(rawUrl);
  const host = new URL(url).hostname.toLowerCase();
  const out = {
    ok: true, url, host, key: host, checkedAt: Date.now(),
    http: null, dns: { addresses: [], nameservers: [], provider: '', cname: [] },
    stack: { platform: '', version: '', server: '', cdn: '', builder: '', ecommerce: '', signals: [] },
    rest: null, sitemap: null, robots: null, pages: null,
    facts: [], warnings: [], checklist: []
  };

  // ---- DNS ---------------------------------------------------------------
  const addrs = await withTimeout(dns.lookup(host, { all: true, verbatim: true }), 5000, []);
  out.dns.addresses = (Array.isArray(addrs) ? addrs : []).map(a => a.address).slice(0, 6);
  if (!out.dns.addresses.length) out.warnings.push('That domain did not resolve — the site may not be live yet.');
  const base = registrableDomain(host);
  let ns = await withTimeout(dns.resolveNs(base), 5000, []);
  if (!ns || !ns.length) ns = await withTimeout(dns.resolveNs(host), 4000, []);
  out.dns.nameservers = (ns || []).slice(0, 6);
  out.dns.provider = providerFromNs(out.dns.nameservers);
  const cname = await withTimeout(dns.resolveCname(host), 4000, []);
  out.dns.cname = (cname || []).slice(0, 4);

  // ---- HTTP --------------------------------------------------------------
  const res = await safeGet(url);
  out.http = {
    status: res.status, ms: res.ms, ok: res.ok,
    finalUrl: res.finalUrl, https: String(res.finalUrl).startsWith('https://'),
    redirects: Math.max(0, (res.chain || []).length - 1),
    error: res.error || ''
  };
  if (!res.ok) {
    out.ok = false;
    out.warnings.push(res.error || ('The site answered with HTTP ' + (res.status || 'no response') + '.'));
    out.checklist = buildChecklist({ stack: out.stack, dnsInfo: out.dns, http: out.http, pages: null });
    return out;
  }

  const titleMatch = (res.body || '').match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i);
  out.title = titleMatch ? sstr(titleMatch[1].replace(/\s+/g, ' ').trim(), 160) : '';
  out.stack = detectStack(res);
  out.http.contentLength = String(res.headers['content-length'] || '').slice(0, 20);

  const origin = new URL(res.finalUrl).origin;

  // ---- WordPress REST + sitemap + robots --------------------------------
  if (out.stack.platform === 'WordPress' || /wp-json/i.test(res.body || '')) {
    const r = await probeText(origin + '/wp-json/');
    let namespaces = [];
    if (r.ok) { try { namespaces = (JSON.parse(r.body).namespaces || []).slice(0, 12); } catch (e) {} }
    out.rest = { ok: r.ok, status: r.status, namespaces };
    if (!r.ok) out.warnings.push('The WordPress REST API (/wp-json/) is blocked — the SEO agent and the workshop need it open to edit pages.');
  }

  const sitemapCandidates = ['/sitemap.xml', '/sitemap_index.xml', '/wp-sitemap.xml', '/sitemap-index.xml'];
  for (const path of sitemapCandidates) {
    const r = await probeText(origin + path);
    const n = countSitemapUrls(r.body);
    if (r.ok && n > 0) { out.sitemap = { url: origin + path, urls: n }; break; }
  }
  if (!out.sitemap && out.rest && out.rest.ok) {
    try {
      const r = await axios.get(origin + '/wp-json/wp/v2/pages?per_page=1', {
        timeout: 8000, validateStatus: () => true, maxRedirects: 0,
        headers: { 'user-agent': UA }
      });
      const total = Number(r.headers && (r.headers['x-wp-total'] || r.headers['X-WP-Total']));
      if (total) out.pages = { count: total, source: 'WordPress REST' };
    } catch (e) {}
  }
  if (out.sitemap) out.pages = { count: out.sitemap.urls, source: 'sitemap' };

  const robots = await probeText(origin + '/robots.txt');
  if (robots.ok) {
    const lines = String(robots.body).split('\n').map(l => l.trim()).filter(Boolean).slice(0, 20);
    out.robots = { ok: true, sitemaps: lines.filter(l => /^sitemap:/i.test(l)).map(l => l.replace(/^sitemap:\s*/i, '')) };
  }

  // ---- Human-readable facts + warnings ----------------------------------
  if (out.http.ok) out.facts.push('Answers over ' + (out.http.https ? 'HTTPS' : 'plain HTTP') + ' with HTTP ' + out.http.status + ' in ' + out.http.ms + ' ms.');
  if (out.http.redirects) out.facts.push(out.http.redirects + ' redirect(s), final address ' + out.http.finalUrl);
  if (!out.http.https) out.warnings.push('The site is served without HTTPS — browsers will warn visitors and Google demotes it.');
  if (out.stack.platform) out.facts.push('Platform: ' + out.stack.platform + (out.stack.version ? ' ' + out.stack.version : '') + (out.stack.builder ? ' · builder: ' + out.stack.builder : '') + (out.stack.ecommerce ? ' · shop: ' + out.stack.ecommerce : ''));
  if (out.stack.server) out.facts.push('Web server: ' + (/^hcdn$/i.test(out.stack.server) ? 'Hostinger CDN edge (hcdn)' : out.stack.server));
  if (out.stack.cdn) out.facts.push('CDN / proxy: ' + out.stack.cdn);
  if (out.dns.provider) out.facts.push('DNS provider: ' + out.dns.provider + ((out.dns.nameservers || []).length ? ' (' + out.dns.nameservers.slice(0, 2).join(', ') + ')' : ''));
  if (out.sitemap) out.facts.push('Sitemap: ' + out.sitemap.urls + ' URLs listed (' + out.sitemap.url + ')');
  else out.warnings.push('No sitemap found — the workshop will build one after it is given access.');
  if (out.rest) out.facts.push('WordPress REST API: ' + (out.rest.ok ? 'open' : 'blocked'));
  if (out.stack.version) out.warnings.push('The WordPress version is publicly visible — the workshop will hide it on first pass.');

  out.checklist = buildChecklist({ stack: out.stack, dnsInfo: out.dns, http: out.http, pages: out.pages });
  return out;
}

async function healthCheck(rawUrl) {
  const started = Date.now();
  try {
    const url = normalizeUrl(rawUrl);
    const res = await safeGet(url, { maxHops: 3, timeout: 10000 });
    return {
      ok: !!res.ok, status: res.status, ms: Date.now() - started, checkedAt: Date.now(),
      error: res.error || '', https: String(res.finalUrl || '').startsWith('https://')
    };
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - started, checkedAt: Date.now(), error: e.message };
  }
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------
async function readMeta(db) {
  const snap = await getDoc(doc(db, 'appData', WORKSHOP));
  return snap.exists() ? (snap.data() || {}) : {};
}
async function writeMeta(db, patch) {
  await setDoc(doc(db, 'appData', WORKSHOP), { ...patch, updatedAt: Date.now() }, { merge: true });
}
async function readSeoSites(db) {
  const snap = await getDoc(doc(db, 'appData', SEO));
  return snap.exists() ? ((snap.data() || {}).sites || {}) : {};
}

function staffCard(a) {
  return {
    id: a.id, name: sstr(a.name, 60), emoji: sstr(a.emoji, 8) || '🧑‍💼',
    role: sstr(a.role, 80), status: a.status, model: a.model,
    confidence: a.confidence, updatedAt: a.updatedAt || 0
  };
}

export function registerWorkshopRoutes(app, db) {
  attachAgentsDb(db);
  const guard = makeAdminGuard({ adminToken: process.env.ADMIN_TOKEN, label: 'workshop' });
  const api = '/api/workshop';
  app.use(api, guard);

  // simple per-IP throttle so a scan loop cannot hammer a target
  const hits = new Map();
  const throttled = (ip) => {
    const now = Date.now();
    const rec = hits.get(ip) || { at: now, n: 0 };
    if (now - rec.at > 60000) { rec.at = now; rec.n = 0; }
    rec.n++;
    hits.set(ip, rec);
    if (hits.size > 3000) hits.clear();
    return rec.n > 25;
  };

  // ---------------------------------------------------------------- state
  app.get(api + '/state', async (req, res) => {
    try {
      const meta = await readMeta(db);
      const seoSites = await readSeoSites(db);
      const agents = await listAgents({ fresh: false });
      const byId = new Map(agents.map(a => [a.id, a]));

      const engineerIds = Array.isArray(meta.engineerIds) ? meta.engineerIds : [];
      const sites = { ...(meta.sites || {}) };
      const keys = Object.keys(seoSites);
      for (const k of Object.keys(sites)) if (!seoSites[k]) delete sites[k]; // site removed in the SEO tab

      const list = keys.sort().map((key) => {
        const s = seoSites[key] || {};
        const m = sites[key] || {};
        const eng = (Array.isArray(m.engineers) ? m.engineers : []).map(id => byId.get(id)).filter(Boolean).map(staffCard);
        return {
          key,
          url: sstr(s.url || ('https://' + key), 300),
          name: sstr(m.name || key, 120),
          cmsPlatform: sstr(s.cmsPlatform || 'wordpress', 30),
          cmsAdminUrl: sstr(s.cmsAdminUrl, 300),
          cmsUsername: sstr(s.cmsUsername, 120),
          hasPassword: !!s.cmsPassword,
          hasFtp: !!s.ftpHost,
          sitemapUrl: sstr(s.sitemapUrl, 300),
          notes: sstr(m.notes, 600),
          approvedBy: sstr(m.approvedBy, 120),
          approvals: m.approvals || {},
          host: m.host || {},
          scan: m.scan || null,
          health: m.health || null,
          pages: m.pages || (m.scan && m.scan.pages) || null,
          engineers: eng,
          addedAt: Number(m.addedAt) || Number(s.updatedAt) || 0,
          updatedAt: Number(m.updatedAt) || Number(s.updatedAt) || 0
        };
      });

      const manager = meta.managerId ? byId.get(meta.managerId) : null;
      const engineers = engineerIds.map(id => byId.get(id)).filter(Boolean).map(a => {
        const mine = list.filter(s => (s.engineers || []).some(e => e.id === a.id));
        return { ...staffCard(a), sites: mine.map(s => ({ key: s.key, name: s.name, healthy: !!(s.health && s.health.ok) })) };
      });

      const healthy = list.filter(s => s.health && s.health.ok).length;
      const unassigned = list.filter(s => !(s.engineers || []).length).length;

      res.json({
        ok: true,
        manager: manager ? staffCard(manager) : null,
        managerId: meta.managerId || '',
        engineers,
        engineerIds,
        sites: list,
        staff: agents.map(staffCard),
        stats: { sites: list.length, engineers: engineers.length, healthy, unassigned, manager: manager ? 1 : 0 }
      });
    } catch (e) {
      console.error('[WORKSHOP] state failed:', e.message);
      res.status(500).json({ ok: false, error: 'Could not load the workshop: ' + e.message });
    }
  });

  // ----------------------------------------------------------------- scan
  app.post(api + '/scan', async (req, res) => {
    const ip = String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
    if (throttled(ip)) return res.status(429).json({ ok: false, error: 'Too many inspections — wait a minute.' });
    try {
      const report = await inspectSite((req.body || {}).url);
      res.json(report);
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  // ------------------------------------------------------------ add site
  app.post(api + '/site', async (req, res) => {
    try {
      const b = req.body || {};
      const url = normalizeUrl(b.url);
      const key = new URL(url).hostname.toLowerCase();
      const seoSites = await readSeoSites(db);
      const meta = await readMeta(db);
      const isFirst = Object.keys(seoSites).length === 0;

      const patch = { url, updatedAt: Date.now() };
      const map = {
        cmsPlatform: 'cmsPlatform', cmsAdminUrl: 'cmsAdminUrl', cmsUsername: 'cmsUsername',
        sitemapUrl: 'sitemapUrl', ftpHost: 'ftpHost', ftpPort: 'ftpPort', ftpUser: 'ftpUser',
        notes: 'notes'
      };
      for (const [from, to] of Object.entries(map)) {
        if (b[from] !== undefined && b[from] !== null) patch[to] = sstr(b[from], 500);
      }
      if (b.cmsPassword) patch.cmsPassword = sstr(b.cmsPassword, 500);
      if (b.ftpPassword) patch.ftpPassword = sstr(b.ftpPassword, 500);
      if (isFirst || b.isDefault) patch.isDefault = true;

      await setDoc(doc(db, 'appData', SEO), { sites: { [key]: patch }, updatedAt: Date.now() }, { merge: true });

      const sites = { ...(meta.sites || {}) };
      const prev = sites[key] || {};
      sites[key] = {
        ...prev,
        name: sstr(b.name || prev.name || key, 120),
        notes: sstr(b.notes != null ? b.notes : prev.notes, 600),
        approvedBy: sstr(b.approvedBy != null ? b.approvedBy : prev.approvedBy, 120),
        approvals: { ...(prev.approvals || {}), ...(b.approvals || {}) },
        host: b.host && typeof b.host === 'object' ? b.host : (prev.host || {}),
        scan: b.scan && typeof b.scan === 'object' ? b.scan : (prev.scan || null),
        pages: (b.scan && b.scan.pages) || prev.pages || null,
        engineers: Array.isArray(b.engineers) ? b.engineers.slice(0, MAX_ENGINEERS_PER_SITE) : (prev.engineers || []),
        health: prev.health || null,
        addedAt: prev.addedAt || Date.now(),
        updatedAt: Date.now()
      };
      await writeMeta(db, { sites });

      res.json({ ok: true, key, site: sites[key] });
    } catch (e) {
      console.error('[WORKSHOP] save site failed:', e.message);
      bad(res, e.message);
    }
  });

  // --------------------------------------------------------- assign staff
  app.post(api + '/site/assign', async (req, res) => {
    try {
      const { key, engineers } = req.body || {};
      if (!key) return bad(res, 'Which website?');
      const meta = await readMeta(db);
      const sites = { ...(meta.sites || {}) };
      if (!sites[key]) sites[key] = { addedAt: Date.now() };
      const ids = (Array.isArray(engineers) ? engineers : []).map(x => sstr(x, 80)).filter(Boolean).slice(0, MAX_ENGINEERS_PER_SITE);
      for (const id of ids) {
        const a = await getAgent(id);
        if (!a) return bad(res, 'Unknown staff member: ' + id);
      }
      sites[key].engineers = ids;
      sites[key].updatedAt = Date.now();
      await writeMeta(db, { sites });
      res.json({ ok: true, key, engineers: ids });
    } catch (e) { bad(res, e.message); }
  });

  // ---------------------------------------------------------- remove site
  app.post(api + '/site/remove', async (req, res) => {
    try {
      const key = sstr((req.body || {}).key, 120);
      if (!key) return bad(res, 'Which website?');
      // Site keys are hostnames, so the dotted string form ("sites.example.com")
      // would address a nested field. FieldPath keeps the key literal.
      await updateDoc(doc(db, 'appData', SEO), new FieldPath('sites', key), deleteField());
      const meta = await readMeta(db);
      const sites = { ...(meta.sites || {}) };
      delete sites[key];
      await writeMeta(db, { sites });
      res.json({ ok: true, key });
    } catch (e) { bad(res, e.message); }
  });

  // -------------------------------------------------------------- health
  app.post(api + '/health', async (req, res) => {
    try {
      const b = req.body || {};
      const meta = await readMeta(db);
      const seoSites = await readSeoSites(db);
      const sites = { ...(meta.sites || {}) };
      const wanted = Array.isArray(b.keys) && b.keys.length ? b.keys : Object.keys(seoSites);
      const results = {};
      for (const key of wanted.slice(0, 20)) {
        const s = seoSites[key];
        if (!s) continue;
        const health = await healthCheck(s.url || ('https://' + key));
        results[key] = health;
        sites[key] = { ...(sites[key] || {}), health, updatedAt: Date.now() };
      }
      await writeMeta(db, { sites });
      res.json({ ok: true, health: results });
    } catch (e) { bad(res, e.message); }
  });

  // ---------------------------------------------------------------- hire
  app.post(api + '/hire', async (req, res) => {
    try {
      const b = req.body || {};
      const kind = b.kind === 'manager' ? 'manager' : 'engineer';
      const name = sstr(b.name, 60).trim();
      if (!name) return bad(res, 'Give the new staff member a name.');
      const meta = await readMeta(db);
      if (kind === 'manager' && meta.managerId && !b.replace) {
        return bad(res, 'A Workshop Manager already exists. Fire or replace the current manager first.');
      }

      const isManager = kind === 'manager';
      const agent = await createAgent({
        name,
        emoji: sstr(b.emoji, 8) || (isManager ? '👷' : '🧑‍🔧'),
        role: isManager ? 'Websites Workshop Manager' : (sstr(b.role, 80) || 'Full-Stack Website Engineer'),
        category: 'business',
        gender: ['male', 'female', 'neutral'].includes(b.gender) ? b.gender : 'neutral',
        jobDescription: isManager
          ? 'Runs the Websites Workshop: plans the work for every website, reviews what the engineers produce, reports to the owner and escalates anything that needs approval.'
          : 'Full-stack website engineer: fixes pages, layout, speed, forms, plugins and SEO issues on the websites assigned in the Websites Workshop.',
        tone: isManager ? 'Calm, decisive, reports numbers first.' : 'Practical and precise; says what was changed and why.',
        traits: isManager ? ['organised', 'accountable', 'clear'] : ['methodical', 'careful', 'fast'],
        languages: ['English', 'Roman Urdu'],
        defaultLanguage: 'English',
        systemPrompt: (isManager
          ? 'You manage a workshop of website engineers. For each website you decide what to fix first, assign it to the right engineer, and report progress in short numbered lists with the website name, what changed, and what still needs the owner\'s approval. Never publish destructive changes without approval.'
          : 'You are a full-stack website engineer. When given a task on a website, state the exact pages and files involved, make the smallest change that solves it, then report: what changed, where, and how it was verified. Never delete content, credentials or users without explicit approval.'),
        model: sstr(b.model, 60) || 'qwen3.8-flash',
        allowedTools: [],
        readyThreshold: 70,
        createdBy: 'websites-workshop'
      });

      if (isManager) {
        await writeMeta(db, { managerId: agent.id });
        if (meta.managerId && meta.managerId !== agent.id) {
          const ids = (Array.isArray(meta.engineerIds) ? meta.engineerIds : []).filter(x => x !== meta.managerId);
          await writeMeta(db, { engineerIds: ids });
        }
      } else {
        const ids = Array.isArray(meta.engineerIds) ? meta.engineerIds.slice() : [];
        if (!ids.includes(agent.id)) ids.push(agent.id);
        await writeMeta(db, { engineerIds: ids });
      }

      res.json({ ok: true, kind, staff: staffCard(agent) });
    } catch (e) {
      console.error('[WORKSHOP] hire failed:', e.message);
      bad(res, e.message);
    }
  });

  // ------------------------------------------------------------- manager
  app.post(api + '/manager', async (req, res) => {
    try {
      const agentId = sstr((req.body || {}).agentId, 80);
      if (!agentId) return bad(res, 'Choose a staff member first.');
      const agent = await getAgent(agentId);
      if (!agent) return bad(res, 'That staff member does not exist.');
      await writeMeta(db, { managerId: agentId });
      res.json({ ok: true, manager: staffCard(agent) });
    } catch (e) { bad(res, e.message); }
  });

  // ------------------------------------------------------- remove staff
  app.post(api + '/staff/remove', async (req, res) => {
    try {
      const b = req.body || {};
      const id = sstr(b.agentId, 80);
      if (!id) return bad(res, 'Which staff member?');
      const meta = await readMeta(db);
      const sites = { ...(meta.sites || {}) };
      for (const k of Object.keys(sites)) {
        if (Array.isArray(sites[k].engineers)) sites[k].engineers = sites[k].engineers.filter(x => x !== id);
      }
      const engineerIds = (Array.isArray(meta.engineerIds) ? meta.engineerIds : []).filter(x => x !== id);
      await writeMeta(db, { engineerIds, sites, ...(meta.managerId === id ? { managerId: '' } : {}) });
      res.json({ ok: true });
    } catch (e) { bad(res, e.message); }
  });

  console.log('[WORKSHOP] 🏗️ Websites Workshop API registered (fail-closed admin guard)');
}
