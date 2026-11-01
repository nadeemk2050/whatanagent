// Builds standalone preview pages so the design can be checked in a browser
// before anything is imported into WordPress.
// Usage: node build/build-preview.mjs   → dist/preview/<slug>.html
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PAGES, MENU, SITE } from './content-pages.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist', 'preview');
const css = fs.readFileSync(path.join(ROOT, 'dist', 'alqaryan-design.css'), 'utf8');

const nav = ['<a href="index.html">Home</a>']
  .concat(MENU.map(function (slug) {
    const p = PAGES.find(function (x) { return x.slug === slug; });
    return '<a href="' + slug + '.html">' + (p ? p.title : slug) + '</a>';
  })).join('');

function wrap(p) {
  const body = p.html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${p.seoTitle ? p.seoTitle.replace(/&amp;/g, '&') : p.title}</title>
<style>
  *,*::before,*::after{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#3b4a54;background:#fff;line-height:1.6}
  .pv-wrap{max-width:1160px;margin:0 auto;padding:0 20px}
  .pv-head{background:#0b3d2c;color:#fff;padding:14px 0;margin-bottom:28px}
  .pv-head a{color:#cdeadd;text-decoration:none;font-size:14px;font-weight:600;margin-right:18px}
  .pv-head a:hover{color:#fff}
  .pv-brand{font-weight:800;font-size:17px;margin-right:26px;color:#fff}
  .pv-foot{background:#0b3d2c;color:#a9c9bd;margin-top:60px;padding:26px 0;font-size:13px}
  .pv-foot strong{color:#fff;display:block;margin-bottom:6px;font-size:15px}
${css}
</style>
</head>
<body>
<div class="pv-head"><div class="pv-wrap"><span class="pv-brand">Al Qaryan Industries</span>${nav}</div></div>
<main class="pv-wrap"><div class="entry-content">${body}</div></main>
<div class="pv-foot"><div class="pv-wrap"><strong>Al Qaryan Industries LLC</strong>Shershah Industrial Area, Karachi, Pakistan · +92 333 201 0506</div></div>
</body>
</html>`;
}

fs.mkdirSync(OUT, { recursive: true });
let n = 0;
PAGES.forEach(function (p) {
  const file = p.slug === 'home' ? 'index.html' : p.slug + '.html';
  fs.writeFileSync(path.join(OUT, file), wrap(p), 'utf8');
  n++;
});
console.log('Preview pages written: ' + n + ' → ' + OUT);
