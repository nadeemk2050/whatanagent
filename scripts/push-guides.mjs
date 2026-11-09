// Publishes the two pipe buyer-guide pages to WordPress and wires up their SEO.
//
//   RANKMATH_SITE / RANKMATH_USER / RANKMATH_PASS   (Application Password, not the login password)
//   node scripts/push-guides.mjs --apply            (dry run without --apply)
//
// Creates or updates the page by slug, sets the post excerpt (used as the meta description
// fallback), then sets Rank Math's focus keyword, SEO title and description. Finally it appends
// a small "Pipes we manufacture" link block to the two hub pages so the new pages are reachable
// from inside the site rather than only from the sitemap.

import { GUIDES, HDPE, PVC } from '../alqaryan-site/build/guides/pages.mjs';

const SITE = String(process.env.RANKMATH_SITE || '').replace(/\/+$/, '');
const USER = process.env.RANKMATH_USER;
const PASS = process.env.RANKMATH_PASS;
const APPLY = process.argv.includes('--apply');

if (!SITE || !USER || !PASS) { console.error('Set RANKMATH_SITE, RANKMATH_USER, RANKMATH_PASS.'); process.exit(1); }
const H = { Authorization: 'Basic ' + Buffer.from(USER + ':' + PASS).toString('base64'), 'Content-Type': 'application/json' };

const render = (await import('../alqaryan-site/build/guides/pages.mjs')).default;
const html = (p) => render(p);

async function findPage(slug) {
  const r = await fetch(`${SITE}/wp-json/wp/v2/pages?slug=${encodeURIComponent(slug)}&status=publish,draft&_fields=id,slug,link`, { headers: H });
  const list = await r.json();
  return Array.isArray(list) && list.length ? list[0] : null;
}

for (const p of GUIDES) {
  const body = html(p);
  const words = body.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  const h2s = (body.match(/<h2>/g) || []).length;
  const ld = (body.match(/application\/ld\+json/g) || []).length;
  const existing = await findPage(p.slug);

  console.log(`\n=== ${p.slug} ===`);
  console.log(`  words ${words} | h2 ${h2s} | json-ld blocks ${ld} | charset ${body.length}`);
  console.log(`  seo title (${p.seoTitle.length}) : ${p.seoTitle}`);
  console.log(`  seo desc  (${p.seoDesc.length}) : ${p.seoDesc}`);
  console.log(`  keyword            : ${p.focus}`);
  console.log(`  ${existing ? 'UPDATE existing id ' + existing.id : 'CREATE new page'}`);

  if (words < 800) { console.error('  ABORT: under 800 words'); process.exit(1); }
  if (p.seoTitle.length > 62) { console.error('  ABORT: seo title too long'); process.exit(1); }
  if (p.seoDesc.length > 165 || p.seoDesc.length < 110) { console.error('  ABORT: seo desc out of range'); process.exit(1); }

  if (!APPLY) continue;

  const payload = { title: p.h1, slug: p.slug, content: body, excerpt: p.seoDesc, status: 'publish', comment_status: 'closed', ping_status: 'closed' };
  const res = existing
    ? await fetch(`${SITE}/wp-json/wp/v2/pages/${existing.id}`, { method: 'POST', headers: H, body: JSON.stringify(payload) })
    : await fetch(`${SITE}/wp-json/wp/v2/pages`, { method: 'POST', headers: H, body: JSON.stringify(payload) });
  const saved = await res.json();
  if (!res.ok) { console.error('  page save FAILED', res.status, JSON.stringify(saved).slice(0, 200)); process.exit(1); }
  console.log(`  saved id ${saved.id} -> ${saved.link}`);

  const meta = { rank_math_focus_keyword: p.focus, rank_math_title: p.seoTitle, rank_math_description: p.seoDesc };
  const mr = await fetch(`${SITE}/wp-json/rankmath/v1/updateMeta`, { method: 'POST', headers: H, body: JSON.stringify({ objectID: saved.id, objectType: 'post', meta }) });
  console.log(`  rank math meta -> ${mr.status}${mr.ok ? '' : ' FAILED'}`);
  await new Promise(r => setTimeout(r, 300));
}

// ---- internal links: each block is appended once, tracked by its own marker ----
const PIPES_BLOCK = `<div class="q-section"><h2>Pipes we manufacture</h2>
<ul class="q-list">
<li><a href="/pvc-pipes-pakistan/">PVC (uPVC) pipes in Pakistan</a> — types, pressure classes and how to verify a manufacturer.</li>
<li><a href="/hdpe-pipes-pakistan/">HDPE 100 (PE100) pipes in Pakistan</a> — grades, SDR to PN ratings and supplier checks.</li>
<li><a href="/pipe-sellers-pakistan/">PVC and HDPE pipe sellers in Pakistan</a> — how to choose a seller, and the six lines every quote must state.</li>
<li><a href="/pvc-vs-hdpe-pipes-pakistan/">PVC vs HDPE pipe</a> — which material to specify, and where each one fails.</li>
<li><a href="/pipe-price-guide-pakistan/">Pipe price in Pakistan</a> — what actually drives the rate per metre.</li>
</ul></div>`;

const SCRAP_BLOCK = `<div class="q-section"><h2>Scrap we buy</h2>
<ul class="q-list">
<li><a href="/hdpe-scrap-pakistan/">HDPE scrap in Pakistan</a> — grades, what decides the price per kg, and how selling works.</li>
<li><a href="/ldpe-scrap-pakistan/">LDPE scrap in Pakistan</a> — film grades, baling, moisture and pricing.</li>
</ul></div>`;

const BLOCKS = [
  {
    marker: '/pipe-sellers-pakistan/', html: PIPES_BLOCK, name: 'pipes',
    // hubs already carry the older two-link version — replace it rather than skip
    legacy: /<div class="q-section"><h2>Pipes we manufacture<\/h2>[\s\S]*?<\/ul><\/div>/
  },
  { marker: '/ldpe-scrap-pakistan/', html: SCRAP_BLOCK, name: 'scrap', legacy: null }
];

const HUBS = ['services', 'materials-we-deal'];
console.log('\n=== internal links from hub pages ===');
for (const slug of HUBS) {
  const pg = await findPage(slug);
  if (!pg) { console.log(`  ${slug}: not found`); continue; }
  const full = await (await fetch(`${SITE}/wp-json/wp/v2/pages/${pg.id}?context=edit&_fields=id,content`, { headers: H })).json();
  let content = full.content.raw || '';
  const added = [];
  for (const b of BLOCKS) {
    if (content.includes(b.marker)) continue;
    if (b.legacy && b.legacy.test(content)) {
      content = content.replace(b.legacy, b.html);
      added.push(b.name + ' (upgraded in place)');
      continue;
    }
    added.push(b.name);
    content = content + '\n\n' + b.html;
  }
  if (!added.length) { console.log(`  ${slug}: all blocks already present`); continue; }
  console.log(`  ${slug}: ${APPLY ? 'appending' : 'would append'} ${added.join(' + ')}`);
  if (APPLY) {
    const r = await fetch(`${SITE}/wp-json/wp/v2/pages/${pg.id}`, { method: 'POST', headers: H, body: JSON.stringify({ content }) });
    console.log(`    -> ${r.status}${r.ok ? '' : ' FAILED'}`);
  }
}

console.log(APPLY ? '\ndone' : '\ndry run only — re-run with --apply');
process.exit(0);
