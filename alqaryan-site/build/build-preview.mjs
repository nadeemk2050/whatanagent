// Builds standalone preview pages and the JSON manifest used to update the live site.
// Usage: node build/build-preview.mjs
//   → dist/preview/<slug>.html   (open in a browser)
//   → dist/content-manifest.json ({ slug: wrappedHtml }, used by the REST update)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PAGES, SITE } from './content-pages.mjs';
import { wrapContent } from './chrome.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist', 'preview');
const css = fs.readFileSync(path.join(ROOT, 'dist', 'alqaryan-design.css'), 'utf8');

const manifest = {};

PAGES.forEach(function (p) {
  const wrapped = wrapContent(p.html);
  manifest[p.slug] = wrapped;

  const body = wrapped.replace(/<!--\s*\/?wp:html\s*-->/g, '');
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${p.seoTitle ? p.seoTitle.replace(/&amp;/g, '&') : p.title}</title>
<style>
  *,*::before,*::after{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#3b4a54;line-height:1.6;background:#fff}
  main{max-width:1160px;margin:0 auto;padding:24px 20px 0}
${css}
</style>
</head>
<body>
<main><div class="entry-content">${body}</div></main>
</body>
</html>`;

  const file = p.slug === 'home' ? 'index.html' : p.slug + '.html';
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, file), html, 'utf8');
});

fs.writeFileSync(path.join(ROOT, 'dist', 'content-manifest.json'), JSON.stringify(manifest), 'utf8');
console.log('Previews: ' + PAGES.length + ' → ' + OUT);
console.log('Manifest: dist/content-manifest.json (' + Math.round(Buffer.byteLength(JSON.stringify(manifest)) / 1024) + ' KB)');
console.log('Site: ' + SITE.name);
