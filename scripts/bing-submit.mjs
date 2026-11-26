// Push a site's sitemap URLs to Bing Webmaster Tools.
//
//   BING_API_KEY=xxxxxxxx node scripts/bing-submit.mjs arabianpolyplast.com
//   node --env-file=/opt/whatanagent/.env scripts/bing-submit.mjs arabianpolyplast.com
//   node scripts/bing-submit.mjs https://arabianpolyplast.com/
//
// The key is per Microsoft account (Bing Webmaster Tools -> Settings -> API access)
// and works for every verified site on that account. It is read from the
// environment and never written to the repository or to Firestore.
//
// Why SubmitUrlBatch and not SubmitSitemap: Microsoft retired the SOAP/POX methods
// (including SubmitSitemap and GetUser) on 31 Aug 2026 — they now answer HTTP 404.
// GetFeeds / GetCrawlStats / GetRankAndTrafficStats / SubmitUrlBatch still answer on
// https://ssl.bing.com/webmaster/api.svc/json/, so this pushes every sitemap URL in
// one call and then reports what Bing holds for the site.
import { parseArgs } from 'node:util';

const API = 'https://ssl.bing.com/webmaster/api.svc/json/';
const CHUNK = 400;               // SubmitUrlBatch accepts a few hundred URLs per call

const { positionals } = parseArgs({ allowPositionals: true });
const target = positionals[0] || 'arabianpolyplast.com';
const key = process.env.BING_API_KEY || process.env.BING_WEBMASTER_API_KEY || '';

if (!key) {
  console.error('BING_API_KEY is not set. Get a key at bing.com/webmasters -> Settings -> API access.');
  process.exit(2);
}

const origin = /^https?:\/\//i.test(target) ? target.replace(/\/+$/, '') : 'https://' + target.replace(/\/+$/, '');
const siteUrl = origin + '/';
const feedUrl = origin + '/sitemap.xml';

async function call(method, { query = '', body = null } = {}) {
  const url = API + method + '?apikey=' + encodeURIComponent(key) + (query ? '&' + query : '');
  const res = await fetch(url, body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : {});
  const text = await res.text();
  if (!res.ok) throw new Error(method + ' -> HTTP ' + res.status + ' ' + text.slice(0, 200));
  try { return JSON.parse(text); } catch { return {}; }
}

const sitemapRes = await fetch(feedUrl);
if (!sitemapRes.ok) {
  console.error('Could not read ' + feedUrl + ' (HTTP ' + sitemapRes.status + ')');
  process.exit(1);
}
const xml = await sitemapRes.text();
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim()).filter(Boolean);
if (!urls.length) {
  console.error('No <loc> entries found in ' + feedUrl);
  process.exit(1);
}

console.log('Site      : ' + siteUrl);
console.log('Sitemap   : ' + feedUrl + ' (' + urls.length + ' URLs)');

let accepted = 0;
for (let i = 0; i < urls.length; i += CHUNK) {
  const batch = urls.slice(i, i + CHUNK);
  const out = await call('SubmitUrlBatch', { body: { siteUrl, urlList: batch } });
  accepted += batch.length;
  console.log('Submitted : ' + accepted + '/' + urls.length + (out && out.d ? '' : ' (no payload — that is success)'));
}

try {
  const feeds = (await call('GetFeeds', { query: 'siteUrl=' + encodeURIComponent(siteUrl) })).d || [];
  if (!feeds.length) console.log('Bing holds no sitemap record for this site yet.');
  for (const f of feeds) {
    const crawled = f.LastCrawled ? new Date(Number(String(f.LastCrawled).match(/\d+/)[0])).toISOString().slice(0, 10) : 'never';
    console.log('Bing feed : ' + f.Url + ' · ' + f.Status + ' · ' + f.UrlCount + ' URLs · last read ' + crawled);
  }
} catch (e) {
  console.log('Bing feed : could not read GetFeeds (' + e.message + ')');
}

process.exit(0);
