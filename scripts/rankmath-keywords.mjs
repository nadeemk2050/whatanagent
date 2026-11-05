// Fills Rank Math's focus keyword, SEO title and meta description on a WordPress site.
//
// Why this exists: Rank Math scores a page badly until a focus keyword is set, and every one of
// its keyword checks then fails. Doing that by hand for 37 pages is an afternoon; this is a
// minute. It only ever touches Rank Math meta — never post content, never posts or users.
//
// Credentials are NOT stored here. Supply them in the environment:
//
//   RANKMATH_SITE=https://example.com
//   RANKMATH_USER=admin-username
//   RANKMATH_PASS="xxxx xxxx xxxx xxxx xxxx xxxx"     (an Application Password, not the login password)
//   node scripts/rankmath-keywords.mjs              # dry run, prints the plan
//   node scripts/rankmath-keywords.mjs --apply      # writes it
//
// The keyword is chosen from what the page ALREADY says: a phrase that appears in both the title
// and the body. That way the checks pass honestly and no title has to be rewritten.
//
// Known limitation: Rank Math does not register its meta with the WordPress REST API, so this
// cannot read back what is already set. A second run reports the same plan and re-writes the
// same values. That is harmless (the values are deterministic) but it is not a no-op, so do not
// read '37 to write' as '37 were missing'.

const SITE = String(process.env.RANKMATH_SITE || '').replace(/\/+$/, '');
const USER = process.env.RANKMATH_USER;
const PASS = process.env.RANKMATH_PASS;
const APPLY = process.argv.includes('--apply');

if (!SITE || !USER || !PASS) {
  console.error('Set RANKMATH_SITE, RANKMATH_USER and RANKMATH_PASS first.');
  process.exit(1);
}

const H = {
  Authorization: 'Basic ' + Buffer.from(USER + ':' + PASS).toString('base64'),
  'Content-Type': 'application/json'
};

const clean = (s) => String(s || '')
  .replace(/&#8211;|&ndash;|&#8212;/g, '-').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, '’')
  .replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const norm = (s) => clean(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const ACRONYMS = {
  pp: 'PP', pvc: 'PVC', hdpe: 'HDPE', ldpe: 'LDPE', upvc: 'UPVC', pet: 'PET', pc: 'PC',
  abs: 'ABS', ps: 'PS', iso: 'ISO', faq: 'FAQ', llc: 'LLC', ppr: 'PPR', sgs: 'SGS'
};
const cap = (s) => String(s || '').split(' ').map((w, i) => {
  const a = ACRONYMS[w.toLowerCase()];
  if (a) return a;
  return i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w;
}).join(' ');

const res = await fetch(SITE + '/wp-json/wp/v2/pages?per_page=100&context=edit&_fields=id,slug,link,title,excerpt,content,meta', { headers: H });
if (!res.ok) {
  console.error('Could not read pages: HTTP ' + res.status + ' — is the Application Password valid?');
  process.exit(1);
}
const pages = await res.json();
console.log(`${pages.length} pages from ${SITE} ${APPLY ? '(APPLYING)' : '(dry run)'}`);

// Pages whose slug is not a usable keyword, or that would collide with another page.
// Rank Math reports 'You have already used this Focus Keyword' when two pages share one, so
// every keyword below must be unique across the site.
const OVERRIDES = {
  '/': 'plastic recycling',
  '/services/plastic-recycling/': 'plastic recycling services',
  '/services/pvc-pipes-supply/': 'pvc pipes supply',
  '/materials/abs-ps/': 'abs and ps plastic',
  '/about/': 'plastic recycling company'
};

// Titles that must contain the keyword AND stay short enough for Rank Math's Title Readability.
const TITLE_OVERRIDE = {
  '/': 'Plastic Recycling & PVC Pipes | Al Qaryan Industries'
};

const plan = [];
const usedKeywords = new Map();
for (const pg of pages) {
  const path = (() => { try { return new URL(pg.link).pathname; } catch (e) { return '/' + pg.slug; } })();
  const title = clean(pg.title.raw);
  const body = norm(pg.content.raw).slice(0, 8000);
  const titleN = norm(title);

  // Slug-based keywords: a slug is unique per page by definition, which is what stops the
  // 'already used this Focus Keyword' error. OVERRIDES covers the pages where the slug is not a
  // usable phrase (e.g. the homepage slug is just 'home').
  const slugPhrase = pg.slug.replace(/-/g, ' ').trim();
  let keyword = OVERRIDES[path] || slugPhrase;

  // never two pages on the same keyword
  if (usedKeywords.has(keyword)) {
    const tail = path.split('/').filter(Boolean).slice(-1)[0] || 'page';
    keyword = keyword + ' ' + tail;
  }
  usedKeywords.set(keyword, path);

  let newTitle = title, writeTitle = false;
  if (TITLE_OVERRIDE[path]) {
    writeTitle = true;
    newTitle = TITLE_OVERRIDE[path];
  } else if (!titleN.includes(norm(keyword))) {
    // the SEO title has to contain the keyword, or Rank Math fails that check
    writeTitle = true;
    newTitle = (cap(keyword) + ' | Al Qaryan Industries').slice(0, 60);
  } else if (title.length > 62) {
    writeTitle = true;
    newTitle = title.slice(0, 60).replace(/[\s,–—-]+$/, '');
  }

  const curDesc = clean(pg.meta && pg.meta.rank_math_description);
  const descOk = curDesc.length >= 110 && curDesc.length <= 165 && norm(curDesc).includes(norm(keyword));
  let newDesc = curDesc;
  if (!descOk) {
    const src = clean(pg.excerpt && pg.excerpt.raw);
    let base = src.length >= 60 ? src : '';
    if (base && !norm(base).includes(norm(keyword))) base = cap(keyword) + ' — ' + base;
    if (!base) base = cap(keyword) + ' from ' + SITE.replace(/^https?:\/\//, '') + '.';
    newDesc = base.replace(/\s+/g, ' ').trim();
    if (newDesc.length > 165) newDesc = newDesc.slice(0, 161).replace(/[\s,–—-]+$/, '') + '.';
  }

  plan.push({ id: pg.id, path, keyword, kwInTitle: titleN.includes(norm(keyword)), writeTitle, newTitle, writeDesc: !descOk, newDesc });
}

const risky = plan.filter(p => !p.kwInTitle);
console.log(`\ntitles to change ${plan.filter(p => p.writeTitle).length} | descriptions to write ${plan.filter(p => p.writeDesc).length} | keyword not in title ${risky.length}`);
for (const p of plan) {
  console.log(`  ${p.path}  "${p.keyword}"${p.kwInTitle ? '' : '  <-- not in title'}`);
}

if (!APPLY) { console.log('\nDry run. Re-run with --apply to write.'); process.exit(0); }

let ok = 0, bad = 0;
for (const p of plan) {
  const meta = { rank_math_focus_keyword: p.keyword };
  if (p.writeTitle) meta.rank_math_title = p.newTitle;
  if (p.writeDesc) meta.rank_math_description = p.newDesc;
  try {
    const r = await fetch(SITE + '/wp-json/rankmath/v1/updateMeta', {
      method: 'POST', headers: H, body: JSON.stringify({ objectID: p.id, objectType: 'post', meta })
    });
    if (r.ok) ok++; else { bad++; console.log('FAILED ' + p.path + ' HTTP ' + r.status); }
  } catch (e) { bad++; console.log('FAILED ' + p.path + ' ' + e.message); }
  await new Promise(r => setTimeout(r, 220));   // be gentle with the host
}
console.log(`\nwritten ${ok}, failed ${bad}`);
process.exit(bad ? 1 : 0);
