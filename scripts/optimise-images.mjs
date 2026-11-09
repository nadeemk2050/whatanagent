// Optimise a folder of photos for the website: WebP at three widths, prebuilt
// <img> snippets, and optional upload straight into the WordPress media library.
//
//   node scripts/optimise-images.mjs ./photos                      (build only)
//   node scripts/optimise-images.mjs ./photos --site alqaryangroup.com --upload
//
// Output goes to alqaryan-site/build/img/ :
//   <name>-1600.webp    hero / full width
//   <name>-900.webp     in-page content
//   <name>-450.webp     cards, thumbnails
//   manifest.json       every file with real byte size and dimensions
//   snippets.html       ready-to-paste <img> tags with srcset + width/height + lazy
//
// Photos should come off the phone/camera as-is; this does the resizing, so do not
// pre-resize or pre-crop. Auto-orient handles EXIF rotation for you.

import { readdirSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import sharp from 'sharp';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

const SRC = process.argv[2];
const OUT = 'alqaryan-site/build/img';
const UPLOAD = process.argv.includes('--upload');
const SITE_KEY = (process.argv.find(a => a.startsWith('--site=')) || '').split('=')[1]
  || (() => { const i = process.argv.indexOf('--site'); return i > -1 ? process.argv[i + 1] : 'alqaryangroup.com'; })();

if (!SRC) { console.error('Usage: node scripts/optimise-images.mjs <photo-dir> [--site domain] [--upload]'); process.exit(1); }

const WIDTHS = [1600, 900, 450];
const QUALITY = 78;
const INPUT_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.avif', '.heic']);

const files = readdirSync(SRC).filter(f => INPUT_EXT.has(extname(f).toLowerCase()));
if (!files.length) { console.error(`No images found in ${SRC}`); process.exit(1); }

mkdirSync(OUT, { recursive: true });
console.log(`Optimising ${files.length} photo(s) from ${SRC}\n`);

// Alt text: filename becomes the default, but every image needs a human-written one.
// Pattern: "<what is visible> at the Al Qaryan Industries facility, Shershah Industrial Area, Karachi"
const humanise = (name) => name.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();

const manifest = [];
for (const f of files) {
  const name = basename(f, extname(f)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const inputPath = join(SRC, f);
  const meta = await sharp(inputPath).metadata();
  const outputs = [];

  for (const w of WIDTHS) {
    const outName = `${name}-${w}.webp`;
    const outPath = join(OUT, outName);
    // never enlarge: if the photo is narrower than the target, cap at the original width
    const targetW = Math.min(w, meta.width || w);
    const info = await sharp(inputPath)
      .rotate()                                  // apply EXIF orientation
      .resize({ width: targetW, withoutEnlargement: true })
      .webp({ quality: QUALITY, effort: 5 })
      .toFile(outPath);
    outputs.push({ width: info.width, height: info.height, bytes: info.size, file: outName });
  }

  const original = statSync(inputPath).size;
  const biggest = outputs[0];
  const saving = original ? Math.round((1 - biggest.bytes / original) * 100) : 0;
  console.log(`  ${f}  ${meta.width}x${meta.height} ${Math.round(original / 1024)}KB`);
  for (const o of outputs) console.log(`     ${o.file.padEnd(34)} ${o.width}x${o.height}  ${Math.round(o.bytes / 1024)}KB`);
  console.log(`     saving vs original: ${saving}%`);

  manifest.push({ source: f, name, alt: humanise(name), original_bytes: original, outputs });
}

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));

// ---- prebuilt snippets (relative URLs; replaced with absolute after upload)
const snippet = (m) => {
  const [big, mid, small] = m.outputs;
  const url = (o) => `/wp-content/uploads/img/${o.file}`;
  return `<figure class="q-photo">
  <img src="${url(mid)}"
       srcset="${url(small)} ${small.width}w, ${url(mid)} ${mid.width}w, ${url(big)} ${big.width}w"
       sizes="(max-width: 640px) 92vw, 760px"
       alt="${m.alt} — Al Qaryan Industries, Shershah Industrial Area, Karachi"
       width="${mid.width}" height="${mid.height}"
       loading="lazy" decoding="async">
  <figcaption>${m.alt}</figcaption>
</figure>`;
};
writeFileSync(join(OUT, 'snippets.html'), manifest.map(snippet).join('\n\n'));

// ---- optional: upload to WordPress and rewrite snippets with absolute URLs
if (UPLOAD) {
  const app = initializeApp({ apiKey: 'AIzaSyDGhwmtpHazLrDWDXjK3WoGPh610mrJeaI', projectId: 'whatanagent-a1e59' });
  const sites = ((await getDoc(doc(getFirestore(app), 'appData', 'seoAgent'))).data() || {}).sites || {};
  const site = sites[SITE_KEY];
  if (!site) { console.error(`\nNo stored credentials for ${SITE_KEY}`); process.exit(1); }
  const BASE = (site.url || 'https://' + SITE_KEY).replace(/\/+$/, '');
  const H = { Authorization: 'Basic ' + Buffer.from(site.cmsUsername + ':' + site.cmsPassword).toString('base64') };

  console.log(`\nUploading to ${BASE} ...`);
  for (const m of manifest) {
    for (const o of m.outputs) {
      const body = (await import('node:fs')).readFileSync(join(OUT, o.file));
      const r = await fetch(`${BASE}/wp-json/wp/v2/media`, {
        method: 'POST',
        headers: { ...H, 'Content-Type': 'image/webp', 'Content-Disposition': `attachment; filename="${o.file}"` },
        body,
      });
      if (!r.ok) { console.log(`  FAIL ${o.file} ${r.status} ${(await r.text()).slice(0, 120)}`); continue; }
      const j = await r.json();
      o.url = j.source_url;
      // WordPress stores alt text separately from the binary upload
      await fetch(`${BASE}/wp-json/wp/v2/media/${j.id}`, {
        method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({ alt_text: `${m.alt} — Al Qaryan Industries, Karachi`, title: m.alt }),
      });
      console.log(`  ok ${o.file} -> ${j.source_url}`);
    }
  }
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
  const abs = (m) => {
    const [big, mid, small] = m.outputs;
    const u = (o) => o.url || `/wp-content/uploads/img/${o.file}`;
    return `<figure class="q-photo">
  <img src="${u(mid)}"
       srcset="${u(small)} ${small.width}w, ${u(mid)} ${mid.width}w, ${u(big)} ${big.width}w"
       sizes="(max-width: 640px) 92vw, 760px"
       alt="${m.alt} — Al Qaryan Industries, Shershah Industrial Area, Karachi"
       width="${mid.width}" height="${mid.height}"
       loading="lazy" decoding="async">
  <figcaption>${m.alt}</figcaption>
</figure>`;
  };
  writeFileSync(join(OUT, 'snippets.html'), manifest.map(abs).join('\n\n'));
  console.log('  snippets.html rewritten with live URLs');
}

const total = manifest.reduce((a, m) => a + m.outputs[0].bytes, 0);
console.log(`\nDone. ${manifest.length} photo(s), hero-size total ${(total / 1024).toFixed(0)}KB.`);
console.log(`Open ${join(OUT, 'snippets.html')} to paste the tags, or ${join(OUT, 'manifest.json')} to see every size.`);
