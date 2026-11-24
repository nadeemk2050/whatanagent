// Submit every URL in the sitemap to IndexNow (Bing, Yandex, Seznam, Naver).
// Run after a deploy:  node build/indexnow.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE } from './content.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sitemap = fs.readFileSync(path.join(ROOT, 'dist', 'sitemap.xml'), 'utf8');
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
const host = new URL(SITE.domain).host;

if (!urls.length) {
  console.error('No URLs found in dist/sitemap.xml — run the build first.');
  process.exit(1);
}

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    host,
    key: SITE.indexNowKey,
    keyLocation: `${SITE.domain}/${SITE.indexNowKey}.txt`,
    urlList: urls
  })
});

console.log(`IndexNow: submitted ${urls.length} URLs for ${host} — HTTP ${res.status}`);
if (res.status >= 400) process.exit(1);
