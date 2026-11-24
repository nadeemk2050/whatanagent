// ============================================================================
// ARABIAN POLYPLAST — static site builder
// ============================================================================
//   node build/build-site.mjs
//   → dist/ (pure HTML, CSS, sitemap, robots, headers) ready for Cloudflare Pages
//
// No framework, no runtime, no database. Every page is finished HTML so Google
// gets the full content on the first request.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE, NAV, TRUST, ROLES, PRODUCTS, SERVICES, PROCESS, QUALITY, FAQS, AR, OMAN_PAGE } from './content.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SRC = path.join(ROOT, 'src');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const today = new Date().toISOString().slice(0, 10);
const CSS = fs.readFileSync(path.join(SRC, 'styles.css'), 'utf8');
const url = (p) => SITE.domain + (p === '/' ? '/' : p.replace(/\.html$/, ''));

// Cloudflare's Scrape Shield injects a render-blocking script whenever it sees a
// plain address. Encoding the @ keeps every link working while leaving nothing for
// it to obfuscate. The JSON-LD copy uses the JSON escape for the same reason.
const mail = esc(SITE.email).replace(/@/g, '&#64;');

// ---------------------------------------------------------------- structured data
const orgLd = {
  '@context': 'https://schema.org',
  '@type': ['Organization', 'LocalBusiness'],
  name: SITE.name,
  alternateName: SITE.shortName,
  url: SITE.domain,
  description: SITE.description,
  foundingDate: SITE.founded,
  telephone: SITE.phone,
  address: {
    '@type': 'PostalAddress',
    streetAddress: SITE.address.line1,
    addressLocality: SITE.address.city,
    addressRegion: SITE.address.region,
    addressCountry: 'OM'
  },
  geo: { '@type': 'GeoCoordinates', latitude: SITE.geo.lat, longitude: SITE.geo.lng },
  openingHours: ['Su-Th 08:00-18:00', 'Sa 09:00-14:00'],
  areaServed: ['Oman', 'GCC', 'Worldwide'],
  knowsLanguage: ['en', 'ar']
};

function productLd(p) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    description: p.intro,
    brand: { '@type': 'Brand', name: SITE.shortName },
    category: 'Recycled plastic raw material',
    areaServed: ['Oman', 'GCC', 'Worldwide'],
    url: url('/products/' + p.slug + '.html')
  };
}

function faqLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a }
    }))
  };
}

function breadcrumbLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem', position: i + 1, name: it.name, item: url(it.href)
    }))
  };
}

const ld = (obj) => '<script type="application/ld+json">' + JSON.stringify(obj) + '</script>';

// ---------------------------------------------------------------- layout
function head({ title, desc, canonical, dir = 'ltr', hreflang }) {
  return `<!doctype html>
<html lang="${dir === 'rtl' ? 'ar' : 'en'}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
${hreflang ? `<link rel="alternate" hreflang="en" href="${esc(hreflang.en)}">\n<link rel="alternate" hreflang="ar" href="${esc(hreflang.ar)}">\n<link rel="alternate" hreflang="x-default" href="${esc(hreflang.en)}">` : ''}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(SITE.shortName)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(url('/assets/og-image.png'))}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(SITE.shortName)} — plastic and metal scrap buyers, suppliers and exporters in Oman">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${esc(url('/assets/og-image.png'))}">
<meta name="theme-color" content="#0f3d3a">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<style>${CSS}</style>
${SITE.ga4Id ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(SITE.ga4Id)}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${esc(SITE.ga4Id)}');</script>` : ''}
</head>`;
}

function header() {
  return `<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="/" aria-label="${esc(SITE.shortName)} home">
      <span class="mark" aria-hidden="true">AP</span>
      <span class="brand-text"><strong>${esc(SITE.shortName)}</strong><small>${esc(SITE.address.city)}, Oman</small></span>
    </a>
    <nav class="nav" id="siteNav" aria-label="Main">
      ${NAV.map(n => `<a href="${n.href}">${esc(n.label)}</a>`).join('')}
    </nav>
    <div class="header-actions">
      <a class="btn btn-ghost" href="/ar/" hreflang="ar" lang="ar">العربية</a>
      <a class="btn btn-primary" href="/contact">Get a quote</a>
      <button class="nav-toggle" id="navToggle" aria-label="Menu" aria-expanded="false">☰</button>
    </div>
  </div>
</header>`;
}

const CR_DIGITS = String(SITE.cr || '').replace(/\D/g, '');
const HAS_CR = CR_DIGITS.length > 0 && Number(CR_DIGITS) > 0;

function footer() {
  return `<footer class="site-footer">
  <div class="wrap footer-grid">
    <div>
      <div class="brand brand-footer"><span class="mark">AP</span><span class="brand-text"><strong>${esc(SITE.name)}</strong><small>${esc(SITE.tagline)}</small></span></div>
      <p class="muted">${esc(SITE.address.line1)}, ${esc(SITE.address.city)}, ${esc(SITE.address.region)}, ${esc(SITE.address.country)}${HAS_CR ? ' · ' + esc(SITE.cr) : ''}</p>
    </div>
    <div>
      <h4>Materials</h4>
      <ul class="plain">${PRODUCTS.slice(0, 6).map(p => `<li><a href="/products/${p.slug}">${esc(p.name)}</a></li>`).join('')}<li><a href="/products/">All materials →</a></li></ul>
    </div>
    <div>
      <h4>Company</h4>
      <ul class="plain">
        <li><a href="/about">About us</a></li>
        <li><a href="/services">Services</a></li>
        <li><a href="/quality">Quality</a></li>
        <li><a href="/scrap-oman">Local &amp; global</a></li>
        <li><a href="/sell-scrap">Sell scrap</a></li>
        <li><a href="/faq">FAQ</a></li>
        <li><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/cookies">Cookies</a></li>
      </ul>
    </div>
    <div>
      <h4>Contact</h4>
      <ul class="plain">
        <li><a href="tel:${esc(SITE.phoneRaw)}">${esc(SITE.phone)}</a> · call</li>
        <li><a href="https://wa.me/${esc(SITE.whatsappRaw)}" target="_blank" rel="noopener">${esc(SITE.whatsapp)}</a> · WhatsApp</li>
        <li><a href="mailto:${mail}">${mail}</a></li>
        <li>${esc(SITE.hours)}</li>
        <li><a href="${esc(SITE.mapUrl)}" target="_blank" rel="noopener">Open in Google Maps</a></li>
        <li><a href="/ar/" hreflang="ar" lang="ar">العربية</a></li>
      </ul>
    </div>
  </div>
  <div class="wrap footer-bottom">
    <span>© ${new Date().getFullYear()} ${esc(SITE.name)}. All rights reserved.</span>
    <span>Sohar · Muscat · Oman</span>
  </div>
</footer>
<script src="/assets/app.js" defer></script>`;
}

function layout(opts, body) {
  return head(opts) + '\n<body>\n' + header() + '\n<main>\n' + body + '\n</main>\n' + footer() + '\n' + floatingActions(opts.dir) + '\n</body>\n</html>\n';
}

function floatingActions(dir = 'ltr') {
  const ar = dir === 'rtl';
  const text = ar
    ? 'مرحباً Arabian Polyplast، أريد الاستفسار عن خردة البلاستيك والمعادن.'
    : 'Hello Arabian Polyplast, I would like to enquire about plastic and metal scrap.';
  const l = ar
    ? { wa: 'تواصل عبر واتساب', call: 'اتصل بنا', mail: 'أرسل بريداً إلكترونياً', top: 'أعلى الصفحة' }
    : { wa: 'Chat on WhatsApp', call: 'Call us now', mail: 'Email us', top: 'Back to top' };
  const wa = 'https://wa.me/' + SITE.whatsappRaw + '?text=' + encodeURIComponent(text);
  return `<div class="fab-stack" aria-label="${ar ? 'تواصل سريع' : 'Quick contact'}">
  <a class="fab fab-wa" href="${esc(wa)}" target="_blank" rel="noopener" aria-label="${l.wa}" title="${l.wa}">
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0 0 20.463 3.488"/></svg>
  </a>
  <a class="fab fab-call" href="tel:${esc(SITE.phoneRaw)}" aria-label="${l.call}" title="${l.call}">
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
  </a>
  <a class="fab fab-mail" href="mailto:${mail}" aria-label="${l.mail}" title="${l.mail}">
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/></svg>
  </a>
  <button type="button" class="fab fab-top" id="fabTop" aria-label="${l.top}" title="${l.top}">
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>
  </button>
</div>`;
}

// ---------------------------------------------------------------- components
const productCard = (p) => `<a class="card product-card" href="/products/${p.slug}">
  <span class="card-tag">${esc(p.name)}</span>
  <p>${esc(p.card)}</p>
  <span class="card-link">Specification →</span>
</a>`;

function ctaBand() {
  return `<section class="cta-band">
  <div class="wrap cta-inner">
    <div>
      <h2>Need a price for a specific lot?</h2>
      <p>Send the material, quantity and destination — we reply with photos, a sample and a firm offer.</p>
    </div>
    <div class="cta-actions">
      <a class="btn btn-primary" href="/contact">Request a quote</a>
      <a class="btn btn-outline" href="/sell-scrap">Sell us your scrap</a>
    </div>
  </div>
</section>`;
}

// ---------------------------------------------------------------- pages
function homePage() {
  const body = `
<section class="hero">
  <div class="wrap hero-inner">
    <div class="hero-copy">
      <p class="eyebrow">Barka · Sultanate of Oman · since ${esc(SITE.founded)}</p>
      <h1>Plastic &amp; metal scrap buyers in Oman</h1>
      <p class="lead">PET bottle scrap, PC bottle scrap, PET flakes, HDPE, HDPE 100 pipes, PVC, UPVC profiles, PP, LDPE film, aluminium and iron scrap — bought, processed and exported from Barka to the GCC and worldwide.</p>
      <div class="hero-actions">
        <a class="btn btn-primary" href="/contact">Request a quote</a>
        <a class="btn btn-outline" href="/sell-scrap">Sell your scrap</a>
      </div>
      <ul class="chips">${TRUST.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
    </div>
    <div class="hero-art" aria-hidden="true">
      <div class="blob"></div>
      <div class="hero-card">
        <span class="dot"></span>
        <strong>PET · HDPE · PP · LDPE · PVC</strong>
        <small>Washed · ground · baled · container-ready</small>
      </div>
    </div>
  </div>
</section>

<section class="section" id="materials">
  <div class="wrap">
    <div class="section-head"><p class="eyebrow">Scrap we buy &amp; sell</p><h2>All kinds of plastic and metal scrap</h2><p>Graded streams prepared to an agreed specification, loaded at Sohar or Muscat. PET bottle scrap, HDPE 100, PVC pipes, UPVC profiles, aluminium and iron included.</p></div>
    <div class="grid cards-3">${PRODUCTS.map(productCard).join('')}</div>
  </div>
</section>

<section class="section" id="roles">
  <div class="wrap">
    <div class="section-head"><p class="eyebrow">Local &amp; international</p><h2>Buyer, supplier, importer, exporter</h2><p>One partner for Omani factories and for buyers anywhere in the world.</p></div>
    <div class="grid cards-2">${ROLES.map(r => `<article class="card"><h3>${esc(r.title)}</h3><p>${esc(r.text)}</p></article>`).join('')}</div>
  </div>
</section>

<section class="section section-alt" id="services">
  <div class="wrap">
    <div class="section-head"><p class="eyebrow">What we do</p><h2>Buying, processing and exporting</h2></div>
    <div class="grid cards-2">${SERVICES.map(s => `<article class="card"><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></article>`).join('')}</div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="section-head"><p class="eyebrow">How it works</p><h2>From enquiry to container</h2></div>
    <ol class="steps">${PROCESS.map(p => `<li><span class="step-n">${p.n}</span><div><h4>${esc(p.title)}</h4><p>${esc(p.text)}</p></div></li>`).join('')}</ol>
  </div>
</section>

${ctaBand()}`;
  return layout({
    title: 'PET, HDPE & PVC Scrap Buyers in Oman | Arabian Polyplast',
    desc: SITE.description,
    canonical: url('/'),
    hreflang: { en: url('/'), ar: url('/ar/') }
  }, body + '\n' + ld(orgLd));
}

function aboutPage() {
  const body = `
<section class="page-head"><div class="wrap"><p class="eyebrow">About</p><h1>Trading plastic from Oman since ${esc(SITE.founded)}</h1><p class="lead">Arabian Polyplast Trading LLC is a plastic recycling and raw-materials trading company based in As-Saqsuq, Barka. We buy, process and export industrial polymers, plastic scrap and recycled materials for factories and manufacturers in Oman and abroad.</p></div></section>
<section class="section"><div class="wrap two-col">
  <div>
    <h2>What we do</h2>
    <p>We work directly with factories, recyclers and collectors to take their plastic scrap, upgrade it in our Barka yard, and ship consistent material to buyers who need a reliable specification rather than a lucky lot.</p>
    <p>Every shipment is inspected, photographed and documented. If we cannot supply a grade to spec, we say so — a cancelled container costs everyone more than a lost order.</p>
  </div>
  <div class="card facts">
    <h3>Company facts</h3>
    <dl>
      <dt>Legal name</dt><dd>${esc(SITE.name)}</dd>
      <dt>Established</dt><dd>${esc(SITE.founded)}</dd>
      <dt>Location</dt><dd>${esc(SITE.address.line1)}, ${esc(SITE.address.city)}, ${esc(SITE.address.region)}</dd>
${HAS_CR ? `      <dt>Registration</dt><dd>${esc(SITE.cr)}</dd>\n` : ''}
      <dt>Loading ports</dt><dd>${SITE.ports.map(esc).join(' · ')}</dd>
      <dt>Languages</dt><dd>English · العربية</dd>
    </dl>
  </div>
</div></section>
${ctaBand()}`;
  return layout({
    title: 'About Arabian Polyplast — plastic trading in Barka, Oman',
    desc: 'Arabian Polyplast Trading LLC buys, processes and exports plastic scrap and recycled polymers from As-Saqsuq, Barka, Oman. Established 2020.',
    canonical: url('/about.html')
  }, body + '\n' + ld(orgLd));
}

function servicesPage() {
  const body = `
<section class="page-head"><div class="wrap"><p class="eyebrow">Services</p><h1>Buying, processing, exporting</h1><p class="lead">One partner from the scrap yard to the container terminal.</p></div></section>
<section class="section"><div class="wrap grid cards-2">${SERVICES.map(s => `<article class="card"><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></article>`).join('')}</div></section>
<section class="section section-alt"><div class="wrap"><div class="section-head"><h2>How a shipment runs</h2></div><ol class="steps">${PROCESS.map(p => `<li><span class="step-n">${p.n}</span><div><h4>${esc(p.title)}</h4><p>${esc(p.text)}</p></div></li>`).join('')}</ol></div></section>
${ctaBand()}`;
  return layout({
    title: 'Services — scrap buying, processing and export | Arabian Polyplast',
    desc: 'Plastic scrap buying, processing, export documentation and container loading at Sohar and Muscat.',
    canonical: url('/services.html')
  }, body);
}

function qualityPage() {
  const body = `
<section class="page-head"><div class="wrap"><p class="eyebrow">Quality</p><h1>How the material is controlled</h1><p class="lead">Six checks between the yard and the buyer.</p></div></section>
<section class="section"><div class="wrap grid cards-2">${QUALITY.map(([t, d]) => `<article class="card"><h3>${esc(t)}</h3><p>${esc(d)}</p></article>`).join('')}</div>
<div class="note">Third-party pre-shipment inspection can be arranged at the yard or the port on request.</div></section>
${ctaBand()}`;
  return layout({
    title: 'Quality control — inspection, sampling and loading reports',
    desc: 'Incoming inspection, manual sorting, washing, sampling, packing and loading reports at Arabian Polyplast, Oman.',
    canonical: url('/quality.html')
  }, body);
}

function faqPage() {
  const body = `
<section class="page-head"><div class="wrap"><p class="eyebrow">FAQ</p><h1>Buying and selling questions</h1></div></section>
<section class="section"><div class="wrap faq-list">
${FAQS.map(f => `<details class="faq"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}
</div></section>
${ctaBand()}`;
  return layout({
    title: 'FAQ — buying and selling plastic scrap in Oman',
    desc: 'Answers about materials, minimum orders, export terms, inspection and packing.',
    canonical: url('/faq.html')
  }, body + '\n' + ld(faqLd()));
}

function legalPage(slug, title, heading, lead, sections) {
  const body = `
<section class="page-head"><div class="wrap"><p class="eyebrow">Legal</p><h1>${esc(heading)}</h1><p class="lead">${esc(lead)}</p></div></section>
<section class="section"><div class="wrap legal">
${sections.map(([h, ps]) => `<h2>${esc(h)}</h2>${ps.map(p => `<p>${p}</p>`).join('')}`).join('\n')}
<p class="muted">Last updated 24 November 2026.</p>
</div></section>
${ctaBand()}`;
  return layout({
    title: `${heading} | ${SITE.shortName}`,
    desc: lead,
    canonical: url('/' + slug)
  }, body);
}

function privacyPage() {
  const who = `${SITE.name}, ${SITE.address.line1}, ${SITE.address.city}, ${SITE.address.region}, Oman`;
  return legalPage('privacy', 'Privacy', 'Privacy notice',
    'What we do with the details you send us, and how to have them removed.', [
    ['Who is responsible', [`${esc(who)}. Email <a href="mailto:${mail}">${mail}</a> or call ${esc(SITE.phone)}.`]],
    ['What we collect', ['Only what you give us: your name, company, country, phone or WhatsApp number, email address, the material and quantity you are asking about, and anything you write in the message box or send us on WhatsApp or by email.']],
    ['Why we hold it', ['To answer your enquiry, prepare a quotation, arrange inspection, loading or shipping, and keep a record of the trade. We do not sell it, and we do not add you to a marketing list.']],
    ['How long we keep it', ['Enquiries that do not become a contract are deleted after 24 months. Records relating to an actual shipment are kept for as long as commercial and tax record-keeping requires.']],
    ['Who can see it', ['Our own sales and operations staff. Enquiries are transmitted to our servers and to our company mailbox; the site itself is served by Cloudflare as a hosting and security provider. We do not pass your details to anyone else unless a law, a court or a port authority requires it.']],
    ['Your choices', ['Write to <a href="mailto:${mail}">${mail}</a> and ask for a copy, a correction or deletion of what we hold, or tell us to stop contacting you. We answer within 30 days. If you are not satisfied you may complain to the Ministry of Transport, Communications and Information Technology in Oman.']],
    ['Children', ['We trade business to business. We do not knowingly collect details from anyone under 18.']]
  ]);
}

function termsPage() {
  return legalPage('terms', 'Terms', 'Terms of use',
    'The rules for using this website. Quotations and shipments are governed by their own contract.', [
    ['Information, not an offer', ['Material descriptions, grades and capacities on this site are general information. Nothing here is a binding offer: every lot is quoted individually after inspection, and prices change with the market.']],
    ['Quotations and contracts', ['A quote is valid for the period stated on it. A sale or purchase exists only once we confirm it in writing with the specification, quantity, price, delivery term (FOB, CFR or CIF) and payment terms.']],
    ['Trademarks and content', ['The Arabian Polyplast name, this site and its text belong to us. You may quote short extracts with a link; you may not copy the site wholesale.']],
    ['Accuracy', ['We keep the site current but cannot promise that every page is free of error at every moment. If a detail matters to a decision, confirm it with us in writing.']],
    ['Links we do not control', ['Where we link to a map, a port authority or another site, we are not responsible for its content.']],
    ['Governing law', ['These terms are governed by the laws of the Sultanate of Oman, and the courts of Oman have jurisdiction.']],
    ['Contact', [`Questions about these terms: <a href="mailto:${mail}">${mail}</a> or ${esc(SITE.phone)}.`]]
  ]);
}

function cookiesPage() {
  return legalPage('cookies', 'Cookies', 'Cookies and local storage',
    'This site is deliberately light: no advertising cookies and no analytics tags.', [
    ['What we set', ['Nothing of our own. There is no Google Analytics, no advertising pixel and no marketing tag on any page.']],
    ['What our host sets', ['Cloudflare, which serves this site, may set a security cookie named <code>__cf_bm</code> to tell a real visitor from a bot. It lasts about 30 minutes and holds no personal information. Cloudflare may also keep short-lived security tokens in your browser while a page loads.']],
    ['Your enquiry', ['When you submit the quote form, the details you typed are sent to our server so we can answer you. That is a deliberate action on your part, not a tracking cookie.']],
    ['Changing your mind', ['You can clear or block cookies in your browser settings. Blocking the Cloudflare security cookie does not stop you reading the site, though a form submission may occasionally ask you to try again.']],
    ['Contact', [`If you want to know what we hold about you: <a href="mailto:${mail}">${mail}</a>.`]]
  ]);
}

function contactPage() {
  const addr = `${SITE.address.line1}, ${SITE.address.city}, ${SITE.address.region}, ${SITE.address.country}`;
  const body = `
<section class="page-head"><div class="wrap"><p class="eyebrow">Contact</p><h1>Talk to us about a lot</h1><p class="lead">Send the material, quantity and destination — we reply with photos, a sample and a firm price.</p></div></section>
<section class="section"><div class="wrap two-col">
  <div class="card">
    <h2>Enquiry form</h2>
    <form class="lead-form" data-source="arabianpolyplast.com" novalidate>
      <div class="row"><label>Name *<input name="name" required autocomplete="name"></label><label>Company<input name="company" autocomplete="organization"></label></div>
      <div class="row"><label>Phone / WhatsApp *<input name="phone" type="tel" autocomplete="tel"></label><label>Email *<input name="email" type="email" autocomplete="email"></label></div>
      <div class="row"><label>Country<input name="country" autocomplete="country-name"></label><label>Material
        <select name="material"><option value="">Select…</option>${PRODUCTS.map(p => `<option>${esc(p.name)}</option>`).join('')}<option>Other</option></select></label></div>
      <div class="row"><label>Quantity<input name="quantity" placeholder="e.g. 2 × 40ft"></label><label>&nbsp;<span class="hp" aria-hidden="true"><input name="_hp" tabindex="-1" autocomplete="off"></span></label></div>
      <label>Message<textarea name="message" rows="4" placeholder="Grade, colour, packing, destination port…"></textarea></label>
      <button class="btn btn-primary" type="submit">Send enquiry</button>
      <p class="form-note">We reply within one working day. Your details are used only for this enquiry.</p>
      <p class="form-status" role="status" aria-live="polite"></p>
    </form>
  </div>
  <div>
    <div class="card">
      <h3>Yard &amp; office</h3>
      <p>${esc(addr)}</p>
      <p><strong>Call:</strong> <a href="tel:${esc(SITE.phoneRaw)}">${esc(SITE.phone)}</a><br>
      <strong>WhatsApp:</strong> <a href="https://wa.me/${esc(SITE.whatsappRaw)}" target="_blank" rel="noopener">${esc(SITE.whatsapp)}</a><br>
      <strong>Email:</strong> <a href="mailto:${mail}">${mail}</a><br>
      <strong>Hours:</strong> ${esc(SITE.hours)}</p>
      <p><a class="btn btn-outline" href="${esc(SITE.mapUrl)}" target="_blank" rel="noopener">Open in Google Maps</a></p>
    </div>
    <div class="card">
      <h3>Selling scrap?</h3>
      <p>Factories and collectors: tell us the material and volume, and we will arrange collection or a yard visit.</p>
      <p><a class="btn btn-outline" href="/sell-scrap">Sell scrap to us</a></p>
    </div>
  </div>
</div></section>`;
  return layout({
    title: 'Contact — Arabian Polyplast, Barka, Oman',
    desc: 'Contact Arabian Polyplast Trading LLC in As-Saqsuq, Barka, Oman for plastic scrap purchases, sales and export enquiries.',
    canonical: url('/contact'),
    hreflang: { en: url('/contact'), ar: url('/ar/contact') }
  }, body + '\n' + ld(orgLd));
}

function sellScrapPage() {
  const body = `
<section class="page-head"><div class="wrap"><p class="eyebrow">Sell scrap</p><h1>We buy plastic scrap across Oman</h1><p class="lead">Factories, recyclers, collection companies and municipalities — one-off lots or monthly volumes.</p></div></section>
<section class="section"><div class="wrap two-col">
  <div>
    <h2>What we buy</h2>
    <ul class="tick">${PRODUCTS.map(p => `<li>${esc(p.name)}</li>`).join('')}<li>Baled film, crates, drums, pipes, profiles</li><li>Mixed industrial loads (inspected first)</li></ul>
    <h3>How it works</h3>
    <ol class="steps compact">${PROCESS.slice(0, 4).map(p => `<li><span class="step-n">${p.n}</span><div><h4>${esc(p.title)}</h4><p>${esc(p.text)}</p></div></li>`).join('')}</ol>
  </div>
  <div class="card">
    <h2>Sell to us</h2>
    <form class="lead-form" data-source="arabianpolyplast.com/sell-scrap" novalidate>
      <div class="row"><label>Name *<input name="name" required autocomplete="name"></label><label>Company<input name="company" autocomplete="organization"></label></div>
      <div class="row"><label>Phone / WhatsApp *<input name="phone" type="tel" autocomplete="tel"></label><label>Email<input name="email" type="email" autocomplete="email"></label></div>
      <div class="row"><label>Material
        <select name="material"><option value="">Select…</option>${PRODUCTS.map(p => `<option>${esc(p.name)}</option>`).join('')}<option>Mixed / other</option></select></label>
        <label>Quantity<input name="quantity" placeholder="e.g. 10 tons / month"></label></div>
      <label>Details<textarea name="message" rows="4" placeholder="Location, form (bales/loose), photos available…"></textarea></label>
      <span class="hp" aria-hidden="true"><input name="_hp" tabindex="-1" autocomplete="off"></span>
      <button class="btn btn-primary" type="submit">Offer scrap</button>
      <p class="form-status" role="status" aria-live="polite"></p>
    </form>
  </div>
</div></section>`;
  return layout({
    title: 'Sell plastic scrap in Oman — Arabian Polyplast buys',
    desc: 'Sell PET, HDPE, PP, LDPE film, PVC and mixed plastic scrap to Arabian Polyplast in Barka, Oman. Fair weighing, fast terms.',
    canonical: url('/sell-scrap.html')
  }, body);
}

function productsIndex() {
  const plastic = PRODUCTS.filter(p => p.group === 'plastic');
  const metal = PRODUCTS.filter(p => p.group === 'metal');
  const body = `
<section class="page-head"><div class="wrap"><p class="eyebrow">Scrap we buy</p><h1>Plastic &amp; metal scrap we buy and sell</h1><p class="lead">PET bottle scrap, PET flakes, HDPE and HDPE 100 pipes, PVC and UPVC profiles, PP, LDPE film, PC bottles, aluminium and iron scrap — from our yard in Barka, Oman.</p></div></section>
<section class="section"><div class="wrap">
  <div class="section-head"><h2>Plastic scrap</h2></div>
  <div class="grid cards-3">${plastic.map(productCard).join('')}</div>
</div></section>
<section class="section section-alt"><div class="wrap">
  <div class="section-head"><h2>Metal scrap</h2></div>
  <div class="grid cards-2">${metal.map(productCard).join('')}</div>
</div></section>
${ctaBand()}`;
  return layout({
    title: 'Scrap We Buy — PET, HDPE, PVC, UPVC, Aluminium & Iron | Arabian Polyplast',
    desc: 'All kinds of plastic and metal scrap bought and sold in Oman: PET bottle scrap, HDPE, PVC pipes, UPVC profiles, aluminium and iron. Loaded at Sohar or Muscat.',
    canonical: url('/products/')
  }, body + '\n' + ld(breadcrumbLd([{ name: 'Home', href: '/' }, { name: 'Scrap we buy', href: '/products/' }])));
}

function productPage(p) {
  const others = PRODUCTS.filter(x => x.slug !== p.slug).slice(0, 3);
  const body = `
<section class="page-head"><div class="wrap">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/products/">Materials</a><span>/</span><span>${esc(p.name)}</span></nav>
  <h1>${esc(p.h1 || p.name)}</h1>
  <p class="lead">${esc(p.intro)}</p>
</div></section>
<section class="section"><div class="wrap two-col">
  <div>
    <h2>Specification</h2>
    <table class="spec"><tbody>${p.specs.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table>
    <p class="note">Specifications are agreed per lot. Tell us your target grades and we will confirm what is available.</p>
  </div>
  <div>
    <div class="card"><h3>Typical applications</h3><ul class="tick">${p.uses.map(u => `<li>${esc(u)}</li>`).join('')}</ul></div>
    <div class="card"><h3>Ask for this material</h3><p>Share quantity, destination port and any specification requirements.</p><p><a class="btn btn-primary" href="/contact?material=${encodeURIComponent(p.name)}">Request a quote</a></p></div>
  </div>
</div></section>
<section class="section section-alt"><div class="wrap"><div class="section-head"><h2>Other materials</h2></div><div class="grid cards-3">${others.map(productCard).join('')}</div></div></section>`;
  return layout({
    title: p.seoTitle || (p.name + ' from Oman — specification & supply | Arabian Polyplast'),
    desc: p.seoDesc || (p.card + ' Supplied by Arabian Polyplast Trading LLC, Barka, Oman.'),
    canonical: url('/products/' + p.slug + '.html')
  }, body + '\n' + ld(productLd(p)) + '\n' + ld(breadcrumbLd([
    { name: 'Home', href: '/' }, { name: 'Materials', href: '/products/' }, { name: p.name, href: '/products/' + p.slug }
  ])));
}

function scrapOmanPage() {
  const body = `
<section class="page-head"><div class="wrap"><p class="eyebrow">Local &amp; global</p><h1>${esc(OMAN_PAGE.h1)}</h1><p class="lead">${esc(OMAN_PAGE.intro)}</p></div></section>
<section class="section"><div class="wrap grid cards-2">
${OMAN_PAGE.sections.map(s => `<article class="card"><h2>${esc(s.h)}</h2><p>${esc(s.p)}</p></article>`).join('')}
</div></section>
<section class="section section-alt"><div class="wrap">
  <div class="section-head"><h2>Scrap types we handle</h2></div>
  <div class="grid cards-3">${PRODUCTS.map(productCard).join('')}</div>
</div></section>
${ctaBand()}`;
  return layout({
    title: OMAN_PAGE.seoTitle,
    desc: OMAN_PAGE.seoDesc,
    canonical: url('/scrap-oman.html')
  }, body + '\n' + ld(orgLd) + '\n' + ld(breadcrumbLd([{ name: 'Home', href: '/' }, { name: 'Oman & GCC', href: '/scrap-oman' }])));
}

function notFound() {
  return layout({
    title: 'Page not found — Arabian Polyplast',
    desc: 'The page you requested was not found.',
    canonical: url('/404.html')
  }, `<section class="page-head"><div class="wrap"><h1>Page not found</h1><p class="lead">That page does not exist. Start from the materials list or contact us.</p><p><a class="btn btn-primary" href="/">Home</a> <a class="btn btn-outline" href="/contact">Contact</a></p></div></section>`);
}

// ---------------------------------------------------------------- Arabic
function arHome() {
  const body = `
<section class="hero" dir="rtl">
  <div class="wrap hero-inner">
    <div class="hero-copy">
      <p class="eyebrow">بركاء · سلطنة عُمان · منذ ${esc(SITE.founded)}</p>
      <h1>${esc(AR.home.h1)}</h1>
      <p class="lead">${esc(AR.home.intro)}</p>
      <div class="hero-actions">
        <a class="btn btn-primary" href="/ar/contact">${esc(AR.home.cta)}</a>
        <a class="btn btn-outline" href="/">English</a>
      </div>
    </div>
  </div>
</section>
<section class="section" id="materials"><div class="wrap">
  <div class="section-head"><h2>${esc(AR.home.materials)}</h2></div>
  <div class="grid cards-3">${PRODUCTS.map(p => `<div class="card"><h3>${esc(p.name)}</h3><p dir="rtl">${esc(p.card)}</p></div>`).join('')}</div>
</div></section>
<section class="section section-alt" id="services"><div class="wrap">
  <div class="section-head"><h2>${esc(AR.home.services)}</h2></div>
  <div class="grid cards-2">${SERVICES.map(s => `<article class="card"><h3>${esc(s.title)}</h3><p dir="rtl">${esc(s.text)}</p></article>`).join('')}</div>
</div></section>
${ctaBand()}`;
  return layout({
    title: AR.home.title,
    desc: AR.home.intro,
    canonical: url('/ar/'),
    dir: 'rtl',
    hreflang: { en: url('/'), ar: url('/ar/') }
  }, body + '\n' + ld(orgLd));
}

function arContact() {
  const addr = `${SITE.address.line1}، ${SITE.address.city}، ${SITE.address.region}، ${SITE.address.country}`;
  const body = `
<section class="page-head" dir="rtl"><div class="wrap"><p class="eyebrow">اتصل بنا</p><h1>تواصل معنا بخصوص شحنتك</h1><p class="lead">أرسل نوع المادة والكمية وميناء الوصول — نرد بالصور والعينة والسعر.</p></div></section>
<section class="section"><div class="wrap two-col">
  <div class="card" dir="rtl">
    <h3>العنوان</h3>
    <p>${esc(addr)}</p>
    <p><strong>هاتف:</strong> <a href="tel:${esc(SITE.phone.replace(/\s/g, ''))}" dir="ltr">${esc(SITE.phone)}</a><br>
    <strong>واتساب:</strong> <a href="https://wa.me/${esc(SITE.whatsapp.replace(/\D/g, ''))}" target="_blank" rel="noopener">راسلنا</a><br>
    <strong>بريد:</strong> <a href="mailto:${mail}" dir="ltr">${mail}</a></p>
    <p><a class="btn btn-outline" href="${esc(SITE.mapUrl)}" target="_blank" rel="noopener">الموقع على الخريطة</a></p>
  </div>
  <div class="card">
    <h2>Enquiry form · نموذج الطلب</h2>
    <form class="lead-form" data-source="arabianpolyplast.com/ar" novalidate>
      <div class="row"><label>الاسم *<input name="name" required></label><label>الشركة<input name="company"></label></div>
      <div class="row"><label>الهاتف / واتساب *<input name="phone" type="tel"></label><label>البريد *<input name="email" type="email"></label></div>
      <div class="row"><label>الدولة<input name="country"></label><label>المادة
        <select name="material"><option value="">اختر…</option>${PRODUCTS.map(p => `<option>${esc(p.name)}</option>`).join('')}<option>أخرى</option></select></label></div>
      <div class="row"><label>الكمية<input name="quantity"></label><label>&nbsp;<span class="hp" aria-hidden="true"><input name="_hp" tabindex="-1" autocomplete="off"></span></label></div>
      <label>الرسالة<textarea name="message" rows="4"></textarea></label>
      <button class="btn btn-primary" type="submit">إرسال</button>
      <p class="form-status" role="status" aria-live="polite"></p>
    </form>
  </div>
</div></section>`;
  return layout({
    title: 'اتصل بنا — Arabian Polyplast، بركاء، عُمان',
    desc: 'تواصل مع Arabian Polyplast Trading LLC في بركاء، سلطنة عُمان لشراء وبيع خردة البلاستيك والتصدير.',
    canonical: url('/ar/contact'),
    dir: 'rtl',
    hreflang: { en: url('/contact'), ar: url('/ar/contact') }
  }, body + '\n' + ld(orgLd));
}

// ---------------------------------------------------------------- write
const CLEAN_PATHS = [];

function write(rel, html) {
  const file = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html, 'utf8');
  CLEAN_PATHS.push('/' + rel.replace(/\\/g, '/').replace(/index\.html$/, '').replace(/\.html$/, ''));
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(path.join(DIST, 'assets'), { recursive: true });

write('index.html', homePage());
write('about.html', aboutPage());
write('services.html', servicesPage());
write('quality.html', qualityPage());
write('faq.html', faqPage());
write('contact.html', contactPage());
write('sell-scrap.html', sellScrapPage());
write('scrap-oman.html', scrapOmanPage());
write('privacy.html', privacyPage());
write('terms.html', termsPage());
write('cookies.html', cookiesPage());
write('products/index.html', productsIndex());
for (const p of PRODUCTS) write('products/' + p.slug + '.html', productPage(p));
write('ar/index.html', arHome());
write('ar/contact.html', arContact());
write('404.html', notFound());

// sitemap
const pages = [
  ['/', '1.0'], ['/products/', '0.9'], ['/contact.html', '0.8'], ['/sell-scrap.html', '0.8'],
  ['/scrap-oman.html', '0.8'], ['/about.html', '0.7'], ['/services.html', '0.7'], ['/quality.html', '0.6'], ['/faq.html', '0.6'],
  ['/privacy.html', '0.3'], ['/terms.html', '0.3'], ['/cookies.html', '0.3'],
  ['/ar/', '0.8'], ['/ar/contact.html', '0.6']
].concat(PRODUCTS.map(p => ['/products/' + p.slug + '.html', '0.8']));
const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  pages.map(([p, pr]) => `  <url><loc>${url(p)}</loc><lastmod>${today}</lastmod><priority>${pr}</priority></url>`).join('\n') +
  '\n</urlset>\n';
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), sitemap, 'utf8');

// robots
fs.writeFileSync(path.join(DIST, 'robots.txt'),
  `User-agent: *\nAllow: /\n\nSitemap: ${SITE.domain}/sitemap.xml\n`, 'utf8');

// llms.txt — a short, honest map for AI crawlers
fs.writeFileSync(path.join(DIST, 'llms.txt'),
  `# ${SITE.name}\n\n> ${SITE.description}\n\n` +
  `Location: ${SITE.address.line1}, ${SITE.address.city}, ${SITE.address.region}, Oman\n` +
  `Established: ${SITE.founded}\nContact: arabianpolyplast&#64;gmail.com · ${SITE.phone}\n\n` +
  `## Materials\n${PRODUCTS.map(p => `- ${p.name}: ${p.card} (${SITE.domain}/products/${p.slug})`).join('\n')}\n\n` +
  `## Pages\n- Home: ${SITE.domain}/\n- Contact: ${SITE.domain}/contact\n- Sell scrap: ${SITE.domain}/sell-scrap\n`, 'utf8');

// Cloudflare Pages headers
fs.writeFileSync(path.join(DIST, '_headers'),
  `/*\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: SAMEORIGIN\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: geolocation=(), microphone=(), camera=()\n  Strict-Transport-Security: max-age=31536000; includeSubDomains\n\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n\n/*.html\n  Cache-Control: public, max-age=0, must-revalidate\n`, 'utf8');

fs.writeFileSync(path.join(DIST, '_redirects'),
  `/home / 301\n/index.html / 301\n/products /products/ 301\n/ar /ar/ 301\n` +
  CLEAN_PATHS
    .filter(p => p !== '/' && !p.endsWith('/') && p !== '/404')
    .map(p => `${p}.html ${p} 301`)
    .join('\n') + '\n', 'utf8');

// IndexNow key file (Bing / Seznam / Yandex instant indexing)
fs.writeFileSync(path.join(DIST, SITE.indexNowKey + '.txt'), SITE.indexNowKey + '\n', 'utf8');

// copy assets
for (const f of ['styles.css', 'app.js', 'favicon.svg', 'og-image.png']) {
  fs.copyFileSync(path.join(SRC, f), path.join(DIST, 'assets', f));
}

console.log('Built ' + pages.length + ' pages + ' + PRODUCTS.length + ' product pages into ' + DIST);
