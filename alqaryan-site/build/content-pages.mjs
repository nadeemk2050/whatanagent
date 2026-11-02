// Content for alqaryangroup.com — Al Qaryan Industries LLC
// Facts used here come from the owner: established 2007, Shershah Industrial Area Karachi,
// 500 tons/month, shredder + washing line + pelletizer + 2 PVC pipe extrusion lines,
// ISO 9001 / ISO 14001 / REACH / SGS, feedstock imported from UAE, Saudi Arabia, USA,
// Canada, Malaysia, Japan and Indonesia, products sold locally in Pakistan.
// Nothing else is invented: technical grades are described as agreed per lot.
import { TEL, TEL_LINK, WA, CTA } from './materials/constants.mjs';
import { MATERIAL_DEAL_PAGES } from './materials/index.mjs';

export const SITE = {
  name: 'Al Qaryan Industries',
  url: 'https://alqaryangroup.com',
  tagline: 'Plastic recycling, polymer trading and PVC pipes — Karachi, Pakistan',
  author: 'qaryan_admin',
  authorEmail: 'info@alqaryangroup.com',
  authorName: 'Al Qaryan Industries',
  menuName: 'Primary',
  menuSlug: 'primary'
};

const NAP = `
<div class="q-card q-card--flat">
  <h3>Al Qaryan Industries LLC</h3>
  <p>Shershah Industrial Area, Karachi, Pakistan<br>
  Phone / WhatsApp: <a href="${TEL_LINK}">${TEL}</a><br>
  Established 2007 · 500 tons per month</p>
</div>`;

export const PAGES = [
  {
    id: 1001,
    slug: 'home',
    title: 'Home',
    seoTitle: 'Plastic Recycling &amp; PVC Pipes in Pakistan | Al Qaryan Industries',
    seoDesc: 'Al Qaryan Industries LLC, Karachi — plastic recycling, polymer trading and PVC pipe manufacturing since 2007. 500 tons per month. ISO 9001 and ISO 14001 certified.',
    focus: 'plastic recycling Pakistan',
    html: `
<div class="q-hero">
  <p class="q-kicker">Karachi, Pakistan · established 2007 · 500 tons per month</p>
  <h1>We import and trade all types of plastic</h1>
  <p class="q-lead">Al Qaryan Industries LLC is a Karachi-based plastic trading and recycling house, established 2007. We import virgin and recycled polymers from Japan, the USA, Canada, Malaysia, the UAE, Saudi Arabia and Indonesia, process what we buy at our own Shershah Industrial Area facility, and supply manufacturers across Pakistan — regrind, flakes, pellets, off-grade material, bales and purges, plus PVC pipes.</p>
  <div class="q-cta-row">
    <a class="q-btn q-btn--primary" href="/contact/">Request a quote</a>
    <a class="q-btn q-btn--ghost" href="/we-buy/">Sell us your scrap</a>
  </div>
</div>

<div class="q-trust">
  <div class="q-stat"><strong>500 t</strong><span>processed every month</span></div>
  <div class="q-stat"><strong>2007</strong><span>in operation since</span></div>
  <div class="q-stat"><strong>ISO 9001 · 14001</strong><span>quality and environment</span></div>
  <div class="q-stat"><strong>7 countries</strong><span>feedstock sourcing</span></div>
</div>

<div class="q-section">
  <h2>Two ways to trade with us</h2>
  <div class="q-funnels">
    <div class="q-funnel">
      <h3>📥 We buy — from you</h3>
      <p>Bales, purges, off-grade lots, plant recovery, regrind, flakes and scrap — single polymer or mixed. Local truckloads and container lots from the UAE, Saudi Arabia, the USA, Canada, Malaysia, Japan and Indonesia.</p>
      <a class="q-btn q-btn--primary" href="/we-buy/">Sell us your material</a>
    </div>
    <div class="q-funnel q-funnel--alt">
      <h3>📤 We supply — to you</h3>
      <p>Regrind, washed flake, pellets and off-grade resin for film, pipe, moulding and raffia producers. PVC and UPVC pipes from our own two extrusion lines. Grades agreed per lot, documented per batch.</p>
      <a class="q-btn q-btn--primary" href="/materials/">See the materials</a>
    </div>
  </div>
</div>

<div class="q-section">
  <h2>What we do</h2>
  <div class="q-grid q-grid--3">
    <div class="q-card">
      <h3>Plastic recycling</h3>
      <p>Shredding, washing and pelletising of HDPE, LDPE, PP, PET, PVC and ABS/PS scrap into regrind and pellets for Pakistani manufacturers.</p>
      <a class="q-link" href="/plastic-recycling/">How we recycle</a>
    </div>
    <div class="q-card">
      <h3>Polymer trading</h3>
      <p>Imported and locally sourced polymer feedstock, supplied in truckloads and container lots with documented quality per lot.</p>
      <a class="q-link" href="/polymer-trading/">See how we trade</a>
    </div>
    <div class="q-card">
      <h3>PVC pipes</h3>
      <p>PVC and UPVC pipes produced on two extrusion lines, plus complementary sizes and fittings sourced from vetted mills.</p>
      <a class="q-link" href="/pvc-pipe-manufacturing/">Manufacturing</a>
    </div>
  </div>
</div>

<div class="q-section">
  <h2>Materials we supply</h2>
  <p>Every material is available as regrind, washed flake or pellets, subject to the grade and colour you need. Tell us the application and we will tell you which grade fits.</p>
  <div class="q-mgrid">
    <a class="q-mtile" href="/materials/hdpe/">
      <div class="q-mtile__art"><svg viewBox="0 0 200 76" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="gHdpe" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b6e4f"/><stop offset="1" stop-color="#0a4d38"/></linearGradient></defs><rect width="200" height="76" fill="url(#gHdpe)"/><g fill="rgba(255,255,255,.18)"><circle cx="26" cy="22" r="7"/><circle cx="52" cy="42" r="5"/><circle cx="80" cy="20" r="6"/><circle cx="108" cy="46" r="7"/><circle cx="138" cy="24" r="5"/><circle cx="166" cy="48" r="6"/><circle cx="40" cy="62" r="4"/><circle cx="120" cy="66" r="4"/></g></svg></div>
      <b>HDPE</b><span>Bottles, crates, caps → film, pipe, injection</span>
    </a>
    <a class="q-mtile" href="/materials/ldpe/">
      <div class="q-mtile__art"><svg viewBox="0 0 200 76" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="gLdpe" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#13896a"/><stop offset="1" stop-color="#0b5c47"/></linearGradient></defs><rect width="200" height="76" fill="url(#gLdpe)"/><g fill="none" stroke="rgba(255,255,255,.22)" stroke-width="3"><path d="M-10 62 Q 40 30 90 56 T 210 44"/><path d="M-10 46 Q 40 14 90 40 T 210 28"/></g></svg></div>
      <b>LDPE</b><span>Film, bags, liners → film and sheet</span>
    </a>
    <a class="q-mtile" href="/materials/pp/">
      <div class="q-mtile__art"><svg viewBox="0 0 200 76" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="gPp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1c7e5c"/><stop offset="1" stop-color="#0d4a34"/></linearGradient></defs><rect width="200" height="76" fill="url(#gPp)"/><g fill="rgba(255,255,255,.16)"><rect x="18" y="18" width="26" height="12" rx="3"/><rect x="60" y="38" width="30" height="12" rx="3"/><rect x="104" y="16" width="24" height="12" rx="3"/><rect x="140" y="40" width="30" height="12" rx="3"/><rect x="40" y="58" width="26" height="10" rx="3"/><rect x="120" y="62" width="26" height="10" rx="3"/></g></svg></div>
      <b>PP</b><span>Woven sacks, containers → raffia, injection</span>
    </a>
    <a class="q-mtile" href="/materials/pet/">
      <div class="q-mtile__art"><svg viewBox="0 0 200 76" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="gPet" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2f9e8a"/><stop offset="1" stop-color="#0f5f56"/></linearGradient></defs><rect width="200" height="76" fill="url(#gPet)"/><g fill="rgba(255,255,255,.20)"><path d="M26 50 l10-16 10 16z"/><path d="M62 44 l12-20 12 20z"/><path d="M104 52 l9-15 9 15z"/><path d="M140 42 l12-19 12 19z"/></g></svg></div>
      <b>PET</b><span>Bottles, preforms → washed flake</span>
    </a>
    <a class="q-mtile" href="/materials/pvc/">
      <div class="q-mtile__art"><svg viewBox="0 0 200 76" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="gPvc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f766e"/><stop offset="1" stop-color="#0a4a44"/></linearGradient></defs><rect width="200" height="76" fill="url(#gPvc)"/><g stroke="rgba(255,255,255,.22)" stroke-width="7" stroke-linecap="round"><line x1="20" y1="52" x2="60" y2="24"/><line x1="70" y1="52" x2="110" y2="24"/><line x1="120" y1="52" x2="160" y2="24"/></g></svg></div>
      <b>PVC</b><span>Pipe, profile, window → regrind &amp; compound</span>
    </a>
    <a class="q-mtile" href="/materials/abs-ps/">
      <div class="q-mtile__art"><svg viewBox="0 0 200 76" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="gAbs" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2b6f7a"/><stop offset="1" stop-color="#123f47"/></linearGradient></defs><rect width="200" height="76" fill="url(#gAbs)"/><g fill="rgba(255,255,255,.18)"><polygon points="34,20 46,27 46,41 34,48 22,41 22,27"/><polygon points="96,26 108,33 108,47 96,54 84,47 84,33"/><polygon points="156,18 168,25 168,39 156,46 144,39 144,25"/></g></svg></div>
      <b>ABS &amp; PS</b><span>Electronics, appliance housings → moulding</span>
    </a>
    <a class="q-mtile" href="/materials/">
      <div class="q-mtile__art"><svg viewBox="0 0 200 76" preserveAspectRatio="none" aria-hidden="true"><rect width="200" height="76" fill="#157a5c"/><g fill="none" stroke="rgba(255,255,255,.22)" stroke-width="3"><path d="M-10 64 Q 40 34 90 58 T 210 46"/><path d="M-10 48 Q 40 18 90 42 T 210 30"/><path d="M-10 32 Q 40 4 90 26 T 210 16"/></g></svg></div>
      <b>LLDPE</b><span>Stretch film, liners, flexible packaging, rotomoulding powder</span>
    </a>
    <a class="q-mtile" href="/materials/">
      <div class="q-mtile__art"><svg viewBox="0 0 200 76" preserveAspectRatio="none" aria-hidden="true"><rect width="200" height="76" fill="#1b7f63"/><g fill="rgba(255,255,255,.18)"><rect x="26" y="18" width="30" height="13" rx="3"/><rect x="74" y="40" width="34" height="13" rx="3"/><rect x="128" y="20" width="30" height="13" rx="3"/><rect x="52" y="60" width="28" height="10" rx="3"/></g></svg></div>
      <b>PPRC</b><span>Random copolymer for clear food packaging and thermoforming</span>
    </a>
    <a class="q-mtile" href="/materials/">
      <div class="q-mtile__art"><svg viewBox="0 0 200 76" preserveAspectRatio="none" aria-hidden="true"><rect width="200" height="76" fill="#2b6f7a"/><g fill="rgba(255,255,255,.18)"><polygon points="40,22 52,29 52,43 40,50 28,43 28,29"/><polygon points="100,28 112,35 112,49 100,56 88,49 88,35"/><polygon points="158,20 170,27 170,41 158,48 146,41 146,27"/></g></svg></div>
      <b>Engineering Plastics</b><span>PC, PMMA and technical grades for demanding applications</span>
    </a>
    <a class="q-mtile" href="/materials/">
      <div class="q-mtile__art"><svg viewBox="0 0 200 76" preserveAspectRatio="none" aria-hidden="true"><rect width="200" height="76" fill="#3f5f8a"/><g fill="rgba(255,255,255,.22)"><circle cx="34" cy="26" r="6"/><circle cx="62" cy="50" r="6"/><circle cx="92" cy="24" r="6"/><circle cx="122" cy="50" r="6"/><circle cx="152" cy="26" r="6"/><circle cx="178" cy="50" r="6"/></g></svg></div>
      <b>Masterbatch</b><span>Colour, white, black, UV stabilisers and additive packs</span>
    </a>
    <a class="q-mtile" href="/materials/">
      <div class="q-mtile__art"><svg viewBox="0 0 200 76" preserveAspectRatio="none" aria-hidden="true"><rect width="200" height="76" fill="#6b7280"/><g stroke="rgba(255,255,255,.25)" stroke-width="4"><line x1="0" y1="24" x2="200" y2="24"/><line x1="0" y1="52" x2="200" y2="52"/></g><g fill="rgba(255,255,255,.3)"><rect x="24" y="18" width="60" height="12" rx="2"/><rect x="110" y="46" width="66" height="12" rx="2"/></g></svg></div>
      <b>Off-Spec</b><span>Off-specification lots for cost-sensitive production</span>
    </a>
    <a class="q-mtile" href="/materials/">
      <div class="q-mtile__art"><svg viewBox="0 0 200 76" preserveAspectRatio="none" aria-hidden="true"><rect width="200" height="76" fill="#4b6b5f"/><g fill="rgba(255,255,255,.2)"><rect x="18" y="20" width="40" height="16" rx="3"/><rect x="70" y="42" width="46" height="16" rx="3"/><rect x="128" y="18" width="44" height="16" rx="3"/></g></svg></div>
      <b>Off-Grade</b><span>Alternative resin grades in bulk, subject to specification</span>
    </a>
    <a class="q-mtile" href="/materials/">
      <div class="q-mtile__art"><svg viewBox="0 0 200 76" preserveAspectRatio="none" aria-hidden="true"><rect width="200" height="76" fill="#0d7a54"/><g fill="none" stroke="rgba(255,255,255,.3)" stroke-width="3"><circle cx="52" cy="38" r="18"/><path d="M52 20 v10 M52 46 v10 M34 38 h10 M60 38 h10"/></g><g fill="rgba(255,255,255,.18)"><circle cx="132" cy="28" r="8"/><circle cx="158" cy="48" r="10"/></g></svg></div>
      <b>Recycled Plastics</b><span>Post-industrial and post-consumer HDPE, PP and PET</span>
    </a>
    <a class="q-mtile" href="/materials/">
      <div class="q-mtile__art"><svg viewBox="0 0 200 76" preserveAspectRatio="none" aria-hidden="true"><rect width="200" height="76" fill="#116b52"/><g fill="rgba(255,255,255,.22)"><path d="M26 52 l10-16 10 16z"/><path d="M62 44 l12-20 12 20z"/><path d="M104 52 l9-15 9 15z"/><path d="M140 42 l12-19 12 19z"/></g></svg></div>
      <b>Regrind &amp; Flakes</b><span>Regrind and washed flake, single polymer or mixed</span>
    </a>
    <a class="q-mtile" href="/materials/">
      <div class="q-mtile__art"><svg viewBox="0 0 200 76" preserveAspectRatio="none" aria-hidden="true"><rect width="200" height="76" fill="#5a6b46"/><g fill="rgba(255,255,255,.2)"><path d="M30 56 q 14-26 30-6 q 14-22 28 4 z"/><path d="M112 58 q 12-22 26-4 q 12-18 26 6 z"/></g></svg></div>
      <b>Purges &amp; Plant Recovery</b><span>Purges, lumps and floor sweep from processing plants</span>
    </a>
    <a class="q-mtile" href="/materials/">
      <div class="q-mtile__art"><svg viewBox="0 0 200 76" preserveAspectRatio="none" aria-hidden="true"><rect width="200" height="76" fill="#1d7d63"/><g fill="rgba(255,255,255,.22)"><rect x="20" y="22" width="46" height="32" rx="4"/><rect x="76" y="22" width="46" height="32" rx="4"/><rect x="132" y="22" width="46" height="32" rx="4"/></g></svg></div>
      <b>Bales, Rolls &amp; Powder</b><span>LDPE bales, stocklot rolls and rotomoulding powder</span>
    </a>
  </div>
</div>

<div class="q-section">
  <h2>Why manufacturers work with us</h2>
  <ul class="q-list">
    <li><strong>Feedstock from mature recycling markets.</strong> We import from Japan, the USA, Canada, Malaysia, the UAE, Saudi Arabia and Indonesia — cleaner, more consistent input than mixed local scrap.</li>
    <li><strong>Documented quality.</strong> Each lot is inspected and comes with the documentation you ask for: SGS inspection, in-house test reports, moisture and contamination checks.</li>
    <li><strong>Real capacity.</strong> 500 tons per month through a shredder, a washing line, a pelletiser and two PVC pipe extrusion lines.</li>
    <li><strong>Certified systems.</strong> ISO 9001 for quality management and ISO 14001 for environmental management, with REACH compliance for export-facing customers.</li>
    <li><strong>Direct, unhurried answers.</strong> You speak to the people who own the plant, not a call centre.</li>
  </ul>
</div>

<div class="q-section">
  <h2>Where we operate</h2>
  <p>Our entire operation is in Karachi: recycling and pipe production at Shershah Industrial Area, and supply to manufacturers across Pakistan — Sindh, Punjab, Balochistan and Khyber Pakhtunkhwa.</p>
  <p><a class="q-link" href="/facility/">See the facility</a> · <a class="q-link" href="/quality/">Quality and certifications</a></p>
</div>

<div class="q-section">
  <h2>Inside our Karachi facility</h2>
  <figure class="q-photo q-photo--small">
    <img src="{{IMG_PLANT}}" srcset="{{IMG_PLANT}} 374w, {{IMG_PLANT_SM}} 240w" sizes="(max-width: 640px) 92vw, 460px" alt="Shredding and washing line at the Al Qaryan Industries plastics facility, Shershah Industrial Area, Karachi" width="374" height="320" loading="lazy" decoding="async">
    <figcaption>Shredding and washing line, Shershah Industrial Area, Karachi — 500 tons processed every month.</figcaption>
  </figure>
  <p><a class="q-link" href="/gallery/">See the full gallery</a></p>
</div>

${CTA}

<script type="application/ld+json">
{"@context":"https://schema.org","@type":["Organization","LocalBusiness"],"@id":"https://alqaryangroup.com/#organization","name":"Al Qaryan Industries LLC","alternateName":"Al Qaryan Group","url":"https://alqaryangroup.com","description":"Plastic recycling, polymer trading and PVC pipe manufacturing in Karachi, Pakistan, established 2007.","foundingDate":"2007","telephone":"+923332010506","address":{"@type":"PostalAddress","streetAddress":"Shershah Industrial Area","addressLocality":"Karachi","addressRegion":"Sindh","addressCountry":"PK"},"areaServed":[{"@type":"Country","name":"Pakistan"}],"knowsAbout":["plastic recycling","HDPE regrind","PVC pipe manufacturing","polymer trading"],"hasCredential":["ISO 9001","ISO 14001","REACH"]}
</script>`
  },

  {
    id: 1002,
    slug: 'about',
    title: 'About Us',
    seoTitle: 'About Al Qaryan Industries | Karachi, Pakistan',
    seoDesc: 'Al Qaryan Industries LLC has recycled plastics and traded polymers in Karachi since 2007. Learn how the plant works and who we supply.',
    focus: 'Al Qaryan Industries',
    html: `
<div class="q-hero q-hero--compact">
  <p class="q-kicker">Since 2007</p>
  <h1>About Al Qaryan Industries</h1>
  <p class="q-lead">We are a Karachi-based recycling and trading company. We buy plastic scrap, turn it into clean regrind and pellets, manufacture PVC pipes, and supply manufacturers across Pakistan.</p>
</div>

<div class="q-section">
  <h2>Who we are</h2>
  <p>Al Qaryan Industries LLC was established in 2007 in Karachi, Pakistan. For almost two decades we have done one thing consistently: take plastic that would otherwise be waste, process it to a standard a manufacturer can rely on, and deliver it on time.</p>
  <p>We are not a broker. Our team runs the shredder, the washing line, the pelletiser and two PVC pipe extrusion lines at our Shershah Industrial Area facility, and we handle the material from purchase through processing to delivery.</p>
</div>

<div class="q-section">
  <h2>How we work</h2>
  <ul class="q-list">
    <li><strong>Buy with discipline.</strong> We source scrap from Japan, the USA, Canada, Malaysia, the UAE, Saudi Arabia and Indonesia, and from reliable local suppliers. Material is inspected before it is bought, not after.</li>
    <li><strong>Process to spec.</strong> Shredding, washing, drying and pelletising to the form the customer's machine needs.</li>
    <li><strong>Document everything.</strong> Each lot is tested for the parameters that matter to the application and shipped with the paperwork the buyer asks for.</li>
    <li><strong>Sell locally, support locally.</strong> Our customers are Pakistani pipe makers, film producers, injection moulders and compounders.</li>
  </ul>
</div>

<div class="q-section">
  <h2>Capacity at a glance</h2>
  <table class="q-table">
    <tbody>
      <tr><th>Processing capacity</th><td>500 tons per month</td></tr>
      <tr><th>Recycling equipment</th><td>Shredder, washing line, pelletiser</td></tr>
      <tr><th>Pipe production</th><td>2 PVC pipe extrusion lines</td></tr>
      <tr><th>Location</th><td>Shershah Industrial Area, Karachi, Pakistan</td></tr>
      <tr><th>Established</th><td>2007</td></tr>
      <tr><th>Certifications</th><td>ISO 9001, ISO 14001, REACH compliance, SGS inspection reports</td></tr>
      <tr><th>Registrations</th><td>NTN / GST registered, chamber of commerce member</td></tr>
    </tbody>
  </table>
</div>

<div class="q-section">
  <h2>What we stand for</h2>
  <p>Recycling only works when the output is genuinely usable. That is the standard we hold ourselves to: material that runs in a customer's machine without surprises, and a price that reflects the real cost of doing it properly. Our ISO 14001 system keeps the environmental side honest; our ISO 9001 system keeps the quality side consistent.</p>
</div>

${NAP}

${CTA}`
  },

  {
    id: 1010,
    slug: 'services',
    title: 'Services',
    seoTitle: 'Recycling, Polymer Trading &amp; PVC Pipes | Al Qaryan Industries',
    seoDesc: 'Plastic recycling, polymer trading and PVC pipe manufacturing and supply — the four services Al Qaryan Industries provides from Karachi.',
    focus: 'plastic recycling services Pakistan',
    html: `
<div class="q-hero q-hero--compact">
  <p class="q-kicker">Services</p>
  <h1>What we do</h1>
  <p class="q-lead">Four connected services: recycling, polymer trading, PVC pipe manufacturing, and supply of complementary pipe sizes.</p>
</div>

<div class="q-grid q-grid--2">
  <div class="q-card">
    <h3>Plastic recycling</h3>
    <p>Shredding, washing and pelletising HDPE, LDPE, PP, PET, PVC and ABS/PS scrap into regrind and pellets.</p>
    <a class="q-link" href="/plastic-recycling/">Plastic recycling</a>
  </div>
  <div class="q-card">
    <h3>Polymer trading</h3>
    <p>Imported and locally sourced polymer feedstock supplied in truckloads and container lots.</p>
    <a class="q-link" href="/polymer-trading/">Polymer trading</a>
  </div>
  <div class="q-card">
    <h3>PVC pipe manufacturing</h3>
    <p>PVC and UPVC pipes produced on two extrusion lines at our Karachi facility.</p>
    <a class="q-link" href="/pvc-pipe-manufacturing/">PVC pipe manufacturing</a>
  </div>
  <div class="q-card">
    <h3>PVC pipe supply</h3>
    <p>Sizes, fittings and product families we source from vetted mills for customers who buy a mixed basket.</p>
    <a class="q-link" href="/pvc-pipes-supply/">PVC pipe supply</a>
  </div>
</div>

<div class="q-section">
  <h2>Which service fits you?</h2>
  <table class="q-table">
    <thead><tr><th>If you are…</th><th>You probably need</th></tr></thead>
    <tbody>
      <tr><td>A manufacturer needing regrind or pellets</td><td><a href="/materials/">Materials we supply</a></td></tr>
      <tr><td>A trader or plant with plastic scrap to sell</td><td><a href="/we-buy/">We buy plastic scrap</a></td></tr>
      <tr><td>Sourcing PVC pipe on a recurring basis</td><td><a href="/pvc-pipe-manufacturing/">Pipe manufacturing</a></td></tr>
      <tr><td>Buying a mixed basket of pipe and fittings</td><td><a href="/pvc-pipes-supply/">Pipe supply</a></td></tr>
    </tbody>
  </table>
</div>

${CTA}`
  },

  {
    id: 1011,
    slug: 'plastic-recycling',
    title: 'Plastic Recycling',
    parent: 1010,
    seoTitle: 'Plastic Recycling Company in Karachi | Al Qaryan Industries',
    seoDesc: 'Plastic recycling in Karachi since 2007: shredding, washing and pelletising HDPE, LDPE, PP, PET, PVC and ABS/PS at 500 tons per month.',
    focus: 'plastic recycling company Karachi',
    html: `
<div class="q-hero q-hero--compact">
  <p class="q-kicker">Service</p>
  <h1>Plastic recycling in Karachi</h1>
  <p class="q-lead">We take plastic scrap and return it to manufacturers as clean, consistent regrind and pellets — 500 tons a month through shredding, washing and pelletising.</p>
</div>

<div class="q-section">
  <h2>What happens to the material</h2>
  <ol class="q-steps">
    <li><strong>Purchase and inspection.</strong> Scrap is inspected before purchase: polymer type, contamination, moisture, colour mix. Material that will not process well is refused rather than blended in.</li>
    <li><strong>Sorting.</strong> Manual and mechanical separation by polymer and colour, with metal and foreign matter removed.</li>
    <li><strong>Shredding.</strong> Size reduction to a consistent flake for washing and feeding.</li>
    <li><strong>Washing and drying.</strong> Washing removes dirt, labels and residues; drying brings moisture down before melting.</li>
    <li><strong>Pelletising.</strong> Flake is melted and cut into pellets, or supplied as washed flake/regrind when the customer's process prefers that form.</li>
    <li><strong>Testing and dispatch.</strong> Batch tested for the parameters the application needs, packed and delivered with documentation.</li>
  </ol>
</div>

<div class="q-section">
  <h2>Polymers we process</h2>
  <div class="q-chips">
    <a class="q-chip" href="/materials/hdpe/">HDPE</a>
    <a class="q-chip" href="/materials/ldpe/">LDPE</a>
    <a class="q-chip" href="/materials/pp/">PP</a>
    <a class="q-chip" href="/materials/pet/">PET</a>
    <a class="q-chip" href="/materials/pvc/">PVC</a>
    <a class="q-chip" href="/materials/abs-ps/">ABS &amp; PS</a>
  </div>
</div>

<div class="q-section">
  <h2>Why imported feedstock matters</h2>
  <p>A recycling line is only as good as its input. Much of our raw material comes from Japan, the USA, Canada, Malaysia, the UAE, Saudi Arabia and Indonesia, where collection and sorting are established. That gives a cleaner, more predictable feedstock than mixed local scrap — and the difference shows up in the regrind your machine receives.</p>
</div>

<div class="q-section">
  <h2>Quality and environment</h2>
  <p>Our processes run under ISO 9001 and ISO 14001, with REACH compliance for customers who need it and SGS inspection available on request. <a class="q-link" href="/quality/">See our certifications</a>.</p>
</div>

${CTA}`
  },

  {
    id: 1012,
    slug: 'polymer-trading',
    title: 'Polymer Trading',
    parent: 1010,
    seoTitle: 'Polymer Trading &amp; Plastic Raw Material Supply | Al Qaryan Industries',
    seoDesc: 'Polymer trading from Karachi: recycled and imported plastic raw material supplied to manufacturers across Pakistan in truckloads and container lots.',
    focus: 'polymer trading Pakistan',
    html: `
<div class="q-hero q-hero--compact">
  <p class="q-kicker">Service</p>
  <h1>Polymer trading</h1>
  <p class="q-lead">Recycled polymer and imported raw material, supplied to manufacturers across Pakistan with clear documentation on every lot.</p>
</div>

<div class="q-section">
  <h2>What we supply</h2>
  <ul class="q-list">
    <li><strong>Recycled regrind and pellets</strong> from our own processing — HDPE, LDPE, PP, PET, PVC, ABS/PS.</li>
    <li><strong>Imported feedstock</strong> from Japan, the USA, Canada, Malaysia, the UAE, Saudi Arabia and Indonesia, for customers who need a specific origin or grade.</li>
    <li><strong>Lot-by-lot trading</strong> where a customer needs a single consignment rather than a standing supply.</li>
  </ul>
</div>

<div class="q-section">
  <h2>How a purchase works</h2>
  <ol class="q-steps">
    <li>You tell us the polymer, the application, the colour and the quantity you need.</li>
    <li>We confirm what is available, from which origin, and in which form (regrind, flake or pellets).</li>
    <li>You receive the price, packing, and the documentation we can provide for that lot.</li>
    <li>Material is dispatched with the paperwork, and we stay available after delivery if anything needs checking.</li>
  </ol>
</div>

<div class="q-section">
  <h2>Packing and logistics</h2>
  <table class="q-table">
    <tbody>
      <tr><th>Forms supplied</th><td>Regrind, washed flake, pellets</td></tr>
      <tr><th>Packing</th><td>25 kg bags, jumbo bags or bulk, per agreement</td></tr>
      <tr><th>Delivery</th><td>Across Pakistan by road; container lots for larger orders</td></tr>
      <tr><th>Documentation</th><td>Batch test report, moisture and contamination checks, SGS on request</td></tr>
    </tbody>
  </table>
</div>

${CTA}`
  },

  {
    id: 1013,
    slug: 'pvc-pipe-manufacturing',
    title: 'PVC Pipe Manufacturing',
    parent: 1010,
    seoTitle: 'PVC Pipe Manufacturer in Karachi | Al Qaryan Industries',
    seoDesc: 'PVC and UPVC pipes manufactured on two extrusion lines in Karachi by Al Qaryan Industries — produced in-house, not resold.',
    focus: 'PVC pipe manufacturer Karachi',
    html: `
<div class="q-hero q-hero--compact">
  <p class="q-kicker">Manufactured in-house</p>
  <h1>PVC pipe manufacturing</h1>
  <p class="q-lead">PVC and UPVC pipes produced on our own two extrusion lines at Shershah Industrial Area, Karachi — controlled from compound to finished length.</p>
</div>

<div class="q-section">
  <h2>What we manufacture</h2>
  <p>Our extrusion lines produce PVC pipe for plumbing, drainage and irrigation use, in the diameters and pressure classes agreed with the customer. Because the compound comes through our own recycling operation, we control what goes into the pipe rather than buying finished stock and relabelling it.</p>
  <p class="q-note">If you need a size or fitting we do not extrude ourselves, we supply it through our <a href="/pvc-pipes-supply/">pipe supply service</a> from vetted mills — and we tell you clearly which is which.</p>
</div>

<div class="q-section">
  <h2>Production control</h2>
  <ul class="q-list">
    <li><strong>Compound control.</strong> Recycled PVC is screened and blended to a consistent formulation before extrusion.</li>
    <li><strong>Two lines.</strong> Capacity to run standard sizes continuously while a second line covers a different diameter or a custom order.</li>
    <li><strong>Dimensional checks.</strong> Wall thickness, outer diameter and length checked through the run, not only at the end.</li>
    <li><strong>Traceable batches.</strong> Orders are recorded against the batch they came from.</li>
  </ul>
</div>

<div class="q-section">
  <h2>Ordering</h2>
  <table class="q-table">
    <tbody>
      <tr><th>Tell us</th><td>Diameter, pressure class, length, quantity and delivery city</td></tr>
      <tr><th>We confirm</th><td>Availability, lead time, price and packing</td></tr>
      <tr><th>Delivery</th><td>Across Pakistan by road</td></tr>
      <tr><th>Minimum order</th><td>Depends on the size — ask, we are flexible for trial orders</td></tr>
    </tbody>
  </table>
</div>

${CTA}`
  },

  {
    id: 1014,
    slug: 'pvc-pipes-supply',
    title: 'PVC Pipe Supply',
    parent: 1010,
    seoTitle: 'PVC &amp; UPVC Pipe Supplier in Pakistan | Al Qaryan Industries',
    seoDesc: 'PVC and UPVC pipe supply for customers who need a mixed basket of sizes and fittings alongside our own manufactured pipe.',
    focus: 'PVC pipe supplier Pakistan',
    html: `
<div class="q-hero q-hero--compact">
  <p class="q-kicker">Supply</p>
  <h1>PVC pipe supply</h1>
  <p class="q-lead">For customers who need more than our own extrusion range: complementary sizes, fittings and product families sourced from mills we have vetted.</p>
</div>

<div class="q-section">
  <h2>Manufactured vs supplied — we are clear about both</h2>
  <p>Pipe produced on our own two extrusion lines is sold as <a href="/pvc-pipe-manufacturing/">our manufacturing</a>. Anything outside that range — a size we do not run, a fitting, or a product family we do not extrude — is supplied from other mills. We label it honestly so you know exactly what you are buying and who made it.</p>
</div>

<div class="q-section">
  <h2>Typical supply requests</h2>
  <ul class="q-list">
    <li>Mixed baskets of pipe sizes for a project or a dealer</li>
    <li>Fittings and accessories to match pipe already delivered</li>
    <li>Repeat supply contracts where a single size has to arrive on schedule</li>
    <li>Urgent replenishment when a customer runs short mid-project</li>
  </ul>
</div>

<div class="q-section">
  <h2>Why buy the basket from one supplier</h2>
  <p>One order, one delivery note, one point of accountability. If something is missing or wrong, you have one number to call instead of three.</p>
</div>

${CTA}`
  },

  {
    id: 1020,
    slug: 'materials',
    title: 'Materials',
    seoTitle: 'Recycled Plastic Materials in Pakistan | HDPE, LDPE, PP, PET, PVC',
    seoDesc: 'Recycled HDPE, LDPE, PP, PET, PVC and ABS/PS regrind and pellets supplied across Pakistan by Al Qaryan Industries, Karachi.',
    focus: 'recycled plastic materials Pakistan',
    html: `
<div class="q-hero q-hero--compact">
  <p class="q-kicker">Materials</p>
  <h1>Recycled plastic materials we supply</h1>
  <p class="q-lead">Six polymer families, supplied as regrind, washed flake or pellets — graded against the application you are running.</p>
</div>

<div class="q-grid q-grid--3">
  <div class="q-card"><h3>HDPE</h3><p>Bottles, crates, caps and pipe scrap into regrind and pellets for film, pipe and injection work.</p><a class="q-link" href="/materials/hdpe/">HDPE</a></div>
  <div class="q-card"><h3>LDPE</h3><p>Film and bag scrap processed for film, sheet and moulding applications.</p><a class="q-link" href="/materials/ldpe/">LDPE</a></div>
  <div class="q-card"><h3>PP</h3><p>Woven sacks, containers and caps into regrind for injection and raffia work.</p><a class="q-link" href="/materials/pp/">PP</a></div>
  <div class="q-card"><h3>PET</h3><p>Bottle scrap into washed flake for fibre, sheet and strapping.</p><a class="q-link" href="/materials/pet/">PET</a></div>
  <div class="q-card"><h3>PVC</h3><p>Pipe and profile scrap into regrind and compound, feeding our own pipe lines.</p><a class="q-link" href="/materials/pvc/">PVC</a></div>
  <div class="q-card"><h3>ABS &amp; PS</h3><p>Electronics and appliance housings into regrind for moulding.</p><a class="q-link" href="/materials/abs-ps/">ABS &amp; PS</a></div>
</div>

<div class="q-section">
  <h2>How grades are agreed</h2>
  <p>Recycled material is not off-the-shelf. Two plants running the same polymer can need different melt flow, density, colour and contamination levels. So instead of publishing one number that may not fit you, we agree the specification against your application — then test the lot against it and state the result on the batch report.</p>
  <p><strong>Tell us:</strong> the polymer, the product you are making, your target MFI and density if you have them, the colour you can accept, and the monthly quantity.</p>
</div>

<div class="q-section">
  <h2>Common to every material</h2>
  <table class="q-table">
    <tbody>
  <tr><th>Forms</th><td>Regrind, washed flake, pellets</td></tr>
  <tr><th>Packing</th><td>25 kg bags, jumbo bags, or bulk per agreement</td></tr>
  <tr><th>Minimum order</th><td>One truckload; container lots available</td></tr>
  <tr><th>Documentation</th><td>Batch test report, moisture and contamination checks, SGS inspection on request</td></tr>
  <tr><th>Delivery</th><td>Nationwide across Pakistan by road</td></tr>
    </tbody>
  </table>
</div>

${CTA}`
  },

  {
    id: 1021,
    slug: 'hdpe',
    title: 'HDPE Regrind & Pellets',
    parent: 1020,
    seoTitle: 'HDPE Regrind &amp; Pellets Supplier in Pakistan | Al Qaryan Industries',
    seoDesc: 'Recycled HDPE regrind, flake and pellets from Karachi — graded to your application, delivered across Pakistan.',
    focus: 'HDPE regrind Pakistan',
    html: `
<div class="q-hero q-hero--compact">
  <p class="q-kicker">Materials · HDPE</p>
  <h1>HDPE regrind and pellets</h1>
  <p class="q-lead">High-density polyethylene recovered from bottles, crates, caps and pipe scrap, processed to the form your line needs.</p>
</div>

<div class="q-section">
  <h2>Where our HDPE comes from</h2>
  <p>Bottle, crate and pipe scrap sourced from established collection markets — Japan, the USA, Canada, Malaysia, the UAE, Saudi Arabia and Indonesia — together with verified local supply. Established collection means cleaner input, and cleaner input is what makes regrind predictable.</p>
</div>

<div class="q-section">
  <h2>What we supply</h2>
  <ul class="q-list">
    <li>Washed flake and regrind for film, pipe and sheet producers</li>
    <li>Pellets where a customer's process needs consistent melt</li>
    <li>Colour options: natural, mixed, black, or matched to your requirement</li>
  </ul>
</div>

<div class="q-section">
  <h2>Specification and ordering</h2>
  <table class="q-table">
    <tbody>
  <tr><th>Form</th><td>Regrind, washed flake or pellets</td></tr>
  <tr><th>Grade</th><td>Agreed per lot against your target MFI and density</td></tr>
  <tr><th>Colour</th><td>Natural, mixed, black, or to requirement</td></tr>
  <tr><th>Contamination</th><td>Screened and washed; the level for the lot is stated on the batch report</td></tr>
  <tr><th>Moisture</th><td>Checked before dispatch</td></tr>
  <tr><th>Packing</th><td>25 kg bags, jumbo bags or bulk</td></tr>
  <tr><th>Minimum order</th><td>One truckload; container lots available</td></tr>
  <tr><th>Documents</th><td>Batch test report; SGS inspection on request</td></tr>
    </tbody>
  </table>
</div>

<div class="q-section">
  <h2>Typical applications</h2>
  <p>Blown film, pipe, crates, injection-moulded parts, caps and closures, sheet and profiles.</p>
</div>

<div class="q-section">
  <h2>Questions buyers ask</h2>
  <details class="q-faq"><summary>What MFI can you supply?</summary><p>It depends on the lot and the grade we agree. Tell us the target MFI for your machine and we will confirm what is available rather than promise a number we cannot hold to.</p></details>
  <details class="q-faq"><summary>Can I get a trial quantity before a full order?</summary><p>Yes. A trial lot is the sensible way to start, and we would rather you test the material than discover a problem in production.</p></details>
  <details class="q-faq"><summary>Do you deliver outside Karachi?</summary><p>Yes — nationwide across Pakistan by road, with container lots available for larger orders.</p></details>
</div>

${CTA}

<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"HDPE Regrind and Pellets","category":"Recycled plastic raw material","material":"High-density polyethylene (HDPE)","brand":{"@type":"Brand","name":"Al Qaryan Industries"},"description":"Recycled HDPE regrind, washed flake and pellets supplied across Pakistan, graded to the customer application.","offers":{"@type":"Offer","availability":"https://schema.org/InStock","businessFunction":"http://purl.org/goodrelations/v1#Sell","areaServed":{"@type":"Country","name":"Pakistan"},"seller":{"@id":"https://alqaryangroup.com/#organization"}}}
</script>`
  },

  {
    id: 1022,
    slug: 'ldpe',
    title: 'LDPE Regrind & Pellets',
    parent: 1020,
    seoTitle: 'LDPE Regrind Supplier in Pakistan | Al Qaryan Industries',
    seoDesc: 'Recycled LDPE film regrind and pellets from Karachi, processed at 500 tons per month and delivered across Pakistan.',
    focus: 'LDPE regrind Pakistan',
    html: `
<div class="q-hero q-hero--compact">
  <p class="q-kicker">Materials · LDPE</p>
  <h1>LDPE regrind and pellets</h1>
  <p class="q-lead">Low-density polyethylene from film and bag scrap, washed and processed for film, sheet and moulding applications.</p>
</div>

<div class="q-section">
  <h2>Where our LDPE comes from</h2>
  <p>Post-industrial and post-consumer film, shrink wrap and bag scrap from established markets and verified local suppliers. Film scrap has to be washed properly before it is worth anything — our washing line is the reason our LDPE is usable rather than decorative.</p>
</div>

<div class="q-section">
  <h2>Specification and ordering</h2>
  <table class="q-table">
    <tbody>
  <tr><th>Form</th><td>Regrind, washed flake or pellets</td></tr>
  <tr><th>Grade</th><td>Agreed per lot against your target MFI and density</td></tr>
  <tr><th>Colour</th><td>Natural, mixed or black</td></tr>
  <tr><th>Print and contamination</th><td>Reduced by washing; the level for the lot is stated on the report</td></tr>
  <tr><th>Packing</th><td>25 kg bags, jumbo bags or bulk</td></tr>
  <tr><th>Minimum order</th><td>One truckload</td></tr>
  <tr><th>Documents</th><td>Batch test report; SGS on request</td></tr>
    </tbody>
  </table>
</div>

<div class="q-section">
  <h2>Typical applications</h2>
  <p>Blown film, carry bags, liner and construction film, sheet, and general moulding where LDPE flexibility is needed.</p>
</div>

<div class="q-section">
  <h2>Questions buyers ask</h2>
  <details class="q-faq"><summary>Is the material washed?</summary><p>Yes — washed and dried. How much residual print and contamination remains is stated per lot so you can judge whether it suits your product.</p></details>
  <details class="q-faq"><summary>Can you hold a consistent colour?</summary><p>Natural and black are the easiest to hold. For a specific colour, tell us the requirement and we will confirm what is achievable per lot.</p></details>
</div>

${CTA}

<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"LDPE Regrind and Pellets","category":"Recycled plastic raw material","material":"Low-density polyethylene (LDPE)","brand":{"@type":"Brand","name":"Al Qaryan Industries"},"description":"Recycled LDPE regrind, washed flake and pellets supplied across Pakistan.","offers":{"@type":"Offer","availability":"https://schema.org/InStock","areaServed":{"@type":"Country","name":"Pakistan"},"seller":{"@id":"https://alqaryangroup.com/#organization"}}}
</script>`
  },

  {
    id: 1023,
    slug: 'pp',
    title: 'PP Regrind & Pellets',
    parent: 1020,
    seoTitle: 'PP Regrind &amp; Granules Supplier in Pakistan | Al Qaryan Industries',
    seoDesc: 'Recycled polypropylene regrind and pellets from Karachi — woven sack, container and cap scrap processed for injection and raffia.',
    focus: 'PP regrind Pakistan',
    html: `
<div class="q-hero q-hero--compact">
  <p class="q-kicker">Materials · PP</p>
  <h1>PP regrind and pellets</h1>
  <p class="q-lead">Polypropylene recovered from woven sacks, containers and caps — processed for raffia, injection and general moulding.</p>
</div>

<div class="q-section">
  <h2>Where our PP comes from</h2>
  <p>Woven sack, container, crate and cap scrap from established collection markets and verified local suppliers. PP is one of the most reused polymers in Pakistan, and consistency between lots is what separates a good supplier from a cheap one.</p>
</div>

<div class="q-section">
  <h2>Specification and ordering</h2>
  <table class="q-table">
    <tbody>
  <tr><th>Form</th><td>Regrind, washed flake or pellets</td></tr>
  <tr><th>Grade</th><td>Agreed per lot against your target MFI and density</td></tr>
  <tr><th>Colour</th><td>Natural, mixed, black or to requirement</td></tr>
  <tr><th>Packing</th><td>25 kg bags, jumbo bags or bulk</td></tr>
  <tr><th>Minimum order</th><td>One truckload</td></tr>
  <tr><th>Documents</th><td>Batch test report; SGS on request</td></tr>
    </tbody>
  </table>
</div>

<div class="q-section">
  <h2>Typical applications</h2>
  <p>Woven sacks and raffia, injection-moulded containers, caps, crates and general household goods.</p>
</div>

<div class="q-section">
  <h2>Questions buyers ask</h2>
  <details class="q-faq"><summary>Do you supply raffia grade?</summary><p>Tell us the application and the target MFI. We confirm what is available for raffia rather than assuming one grade fits all PP buyers.</p></details>
  <details class="q-faq"><summary>Is PP available in pellets as well as regrind?</summary><p>Yes, subject to the current production run. Both forms are offered.</p></details>
</div>

${CTA}

<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"PP Regrind and Pellets","category":"Recycled plastic raw material","material":"Polypropylene (PP)","brand":{"@type":"Brand","name":"Al Qaryan Industries"},"description":"Recycled polypropylene regrind and pellets supplied across Pakistan.","offers":{"@type":"Offer","availability":"https://schema.org/InStock","areaServed":{"@type":"Country","name":"Pakistan"},"seller":{"@id":"https://alqaryangroup.com/#organization"}}}
</script>`
  },

  {
    id: 1024,
    slug: 'pet',
    title: 'PET Flakes',
    parent: 1020,
    seoTitle: 'PET Flakes Supplier in Pakistan | Al Qaryan Industries',
    seoDesc: 'Washed PET bottle flakes from Karachi, supplied to fibre, sheet and strapping producers across Pakistan.',
    focus: 'PET flakes Pakistan',
    html: `
<div class="q-hero q-hero--compact">
  <p class="q-kicker">Materials · PET</p>
  <h1>PET flakes</h1>
  <p class="q-lead">Washed polyethylene terephthalate bottle flakes for fibre, sheet and strapping producers.</p>
</div>

<div class="q-section">
  <h2>Where our PET comes from</h2>
  <p>Bottle scrap collected from established markets and verified local supply, sorted by colour, stripped of caps and labels, washed and dried.</p>
</div>

<div class="q-section">
  <h2>Specification and ordering</h2>
  <table class="q-table">
    <tbody>
  <tr><th>Form</th><td>Washed flake (pellets on request, subject to run)</td></tr>
  <tr><th>Colour</th><td>Clear, light blue, mixed — depending on the collection</td></tr>
  <tr><th>Grade</th><td>Agreed per lot: intended application, residual moisture and contamination stated</td></tr>
  <tr><th>Packing</th><td>Jumbo bags or 25 kg bags</td></tr>
  <tr><th>Minimum order</th><td>One truckload</td></tr>
  <tr><th>Documents</th><td>Batch test report; SGS on request</td></tr>
    </tbody>
  </table>
</div>

<div class="q-section">
  <h2>Typical applications</h2>
  <p>Polyester fibre, strapping, sheet and thermoformed packaging.</p>
</div>

<div class="q-section">
  <h2>Questions buyers ask</h2>
  <details class="q-faq"><summary>Which colours are available?</summary><p>It follows the collection: clear and light blue are common, mixed is available when the price matters more than the colour.</p></details>
  <details class="q-faq"><summary>What is the moisture content?</summary><p>Dried before dispatch and checked. The figure for the lot is on the batch report — fibre producers usually ask for it before confirming.</p></details>
</div>

${CTA}

<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"PET Flakes","category":"Recycled plastic raw material","material":"Polyethylene terephthalate (PET)","brand":{"@type":"Brand","name":"Al Qaryan Industries"},"description":"Washed PET bottle flakes supplied across Pakistan.","offers":{"@type":"Offer","availability":"https://schema.org/InStock","areaServed":{"@type":"Country","name":"Pakistan"},"seller":{"@id":"https://alqaryangroup.com/#organization"}}}
</script>`
  },

  {
    id: 1025,
    slug: 'pvc',
    title: 'PVC Regrind & Compound',
    parent: 1020,
    seoTitle: 'PVC Regrind Supplier in Pakistan | Al Qaryan Industries',
    seoDesc: 'Recycled PVC regrind and compound from Karachi — pipe and profile scrap processed for extrusion and moulding.',
    focus: 'PVC regrind Pakistan',
    html: `
<div class="q-hero q-hero--compact">
  <p class="q-kicker">Materials · PVC</p>
  <h1>PVC regrind and compound</h1>
  <p class="q-lead">Rigid PVC recovered from pipe, profile and window scrap — processed into regrind and compound, including the material that feeds our own pipe lines.</p>
</div>

<div class="q-section">
  <h2>Where our PVC comes from</h2>
  <p>Pipe offcuts, profile scrap and window sections from established markets and verified local suppliers. PVC is harder to recycle cleanly than polyolefins — it needs careful separation from other polymers — which is exactly why we process it in-house rather than buy it at arm's length.</p>
</div>

<div class="q-section">
  <h2>Specification and ordering</h2>
  <table class="q-table">
    <tbody>
  <tr><th>Form</th><td>Regrind or compound</td></tr>
  <tr><th>Colour</th><td>White, grey, mixed, or matched to requirement</td></tr>
  <tr><th>Grade</th><td>Agreed per lot against your application</td></tr>
  <tr><th>Packing</th><td>25 kg bags or jumbo bags</td></tr>
  <tr><th>Minimum order</th><td>One truckload</td></tr>
  <tr><th>Documents</th><td>Batch test report; SGS on request</td></tr>
    </tbody>
  </table>
</div>

<div class="q-section">
  <h2>Typical applications</h2>
  <p>Rigid pipe, conduit, profiles, and moulded fittings.</p>
</div>

<div class="q-section">
  <h2>Questions buyers ask</h2>
  <details class="q-faq"><summary>Is the PVC separated from other polymers?</summary><p>Yes. Rigid PVC is separated before processing; mixing PVC with polyolefins would ruin both. Separation is a step we control, not something we outsource.</p></details>
  <details class="q-faq"><summary>Do you supply pipe-grade compound?</summary><p>Yes — that is the same material stream that feeds our own extrusion lines, which is the most demanding test of it.</p></details>
</div>

${CTA}

<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"PVC Regrind and Compound","category":"Recycled plastic raw material","material":"Polyvinyl chloride (PVC)","brand":{"@type":"Brand","name":"Al Qaryan Industries"},"description":"Recycled rigid PVC regrind and compound supplied across Pakistan.","offers":{"@type":"Offer","availability":"https://schema.org/InStock","areaServed":{"@type":"Country","name":"Pakistan"},"seller":{"@id":"https://alqaryangroup.com/#organization"}}}
</script>`
  },

  {
    id: 1026,
    slug: 'abs-ps',
    title: 'ABS & PS Regrind',
    parent: 1020,
    seoTitle: 'ABS &amp; PS Regrind Supplier in Pakistan | Al Qaryan Industries',
    seoDesc: 'Recycled ABS and polystyrene regrind from Karachi — electronics and appliance housings processed for moulding.',
    focus: 'ABS regrind Pakistan',
    html: `
<div class="q-hero q-hero--compact">
  <p class="q-kicker">Materials · ABS &amp; PS</p>
  <h1>ABS and PS regrind</h1>
  <p class="q-lead">Acrylonitrile butadiene styrene and polystyrene recovered from electronics, appliances and packaging, processed for moulding.</p>
</div>

<div class="q-section">
  <h2>Where it comes from</h2>
  <p>Electronics housings, appliance components and packaging recovered from established markets and verified local supply. These streams need careful sorting by polymer and colour before processing, which is where most of the value is added.</p>
</div>

<div class="q-section">
  <h2>Specification and ordering</h2>
  <table class="q-table">
    <tbody>
      <tr><th>Form</th><td>Regrind or pellets (subject to run)</td></tr>
      <tr><th>Colour</th><td>Black, white, grey, mixed</td></tr>
      <tr><th>Grade</th><td>Agreed per lot against your application</td></tr>
      <tr><th>Packing</th><td>25 kg bags or jumbo bags</td></tr>
      <tr><th>Minimum order</th><td>One truckload</td></tr>
      <tr><th>Documents</th><td>Batch test report; SGS on request</td></tr>
    </tbody>
  </table>
</div>

<div class="q-section">
  <h2>Typical applications</h2>
  <p>Injection-moulded housings, appliance parts, general goods and packaging components.</p>
</div>

<div class="q-section">
  <h2>Questions buyers ask</h2>
  <details class="q-faq"><summary>Is ABS and PS supplied separately?</summary><p>Yes. They are different polymers with different properties and are kept separate through sorting.</p></details>
  <details class="q-faq"><summary>Can you match a specific colour?</summary><p>Black, white and grey are the most reliable. For other colours, tell us the requirement and we will confirm what the collection allows.</p></details>
</div>

${CTA}

<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"ABS and PS Regrind","category":"Recycled plastic raw material","material":"ABS / Polystyrene","brand":{"@type":"Brand","name":"Al Qaryan Industries"},"description":"Recycled ABS and polystyrene regrind supplied across Pakistan.","offers":{"@type":"Offer","availability":"https://schema.org/InStock","areaServed":{"@type":"Country","name":"Pakistan"},"seller":{"@id":"https://alqaryangroup.com/#organization"}}}
</script>`
  },

  {
    id: 1030,
    slug: 'we-buy',
    title: 'We Buy Plastic Scrap',
    seoTitle: 'We Buy Plastic Scrap in Pakistan | Al Qaryan Industries',
    seoDesc: 'Sell your plastic scrap to Al Qaryan Industries, Karachi. We buy HDPE, LDPE, PP, PET, PVC, ABS and PS from local suppliers and from the UAE, Saudi Arabia, USA, Canada, Malaysia, Japan and Indonesia.',
    focus: 'we buy plastic scrap Pakistan',
    html: `
<div class="q-hero">
  <p class="q-kicker">For suppliers</p>
  <h1>We buy plastic scrap</h1>
  <p class="q-lead">If you collect, sort or trade plastic scrap, we are a buyer with our own processing plant — 500 tons a month of real capacity, not a speculator's phone number.</p>
  <div class="q-cta-row">
    <a class="q-btn q-btn--primary" href="${WA}" target="_blank" rel="noopener">Send photos on WhatsApp</a>
    <a class="q-btn q-btn--ghost" href="${TEL_LINK}">Call ${TEL}</a>
  </div>
</div>

<div class="q-section">
  <h2>What we buy</h2>
  <ul class="q-list">
    <li><strong>HDPE</strong> — bottles, crates, caps, pipe scrap</li>
    <li><strong>LDPE</strong> — film, shrink wrap, bags, liner scrap</li>
    <li><strong>PP</strong> — woven sacks, containers, caps, crates</li>
    <li><strong>PET</strong> — bottles, preforms, flake</li>
    <li><strong>PVC</strong> — rigid pipe, profile and window scrap</li>
    <li><strong>ABS / PS</strong> — electronics and appliance housings</li>
  </ul>
</div>

<div class="q-section">
  <h2>Where we buy from</h2>
  <p>Pakistan, and internationally from the UAE, Saudi Arabia, the USA, Canada, Malaysia, Japan and Indonesia. Whether you have a single truckload locally or a container abroad, the conversation starts the same way: tell us the material and send photographs.</p>
</div>

<div class="q-section">
  <h2>How the purchase works</h2>
  <ol class="q-steps">
    <li><strong>Tell us what you have.</strong> Polymer, form (bale, loose, film, regrind), approximate quantity, colour mix and where it is.</li>
    <li><strong>Send photographs.</strong> Clear photos of the material and its packing avoid most misunderstandings.</li>
    <li><strong>We inspect.</strong> Sample or inspection before we commit — for container lots this happens before shipment.</li>
    <li><strong>We agree terms.</strong> Price, quantity, packing, delivery or shipment terms, and documentation.</li>
    <li><strong>Collection or delivery.</strong> We arrange movement to our Shershah Industrial Area facility.</li>
  </ol>
</div>

<div class="q-section">
  <h2>What helps us price your material correctly</h2>
  <table class="q-table">
    <tbody>
      <tr><th>Polymer mix</th><td>Single polymer or mixed — mixed is bought, but priced differently</td></tr>
      <tr><th>Contamination</th><td>Metal, dirt, moisture, labels, other plastics</td></tr>
      <tr><th>Form</th><td>Baled, loose, film, flakes, regrind</td></tr>
      <tr><th>Colour</th><td>Single colour or mixed</td></tr>
      <tr><th>Quantity</th><td>Truckload or container lot</td></tr>
      <tr><th>Location</th><td>City, or port of loading for imports</td></tr>
    </tbody>
  </table>
</div>

<div class="q-section">
  <h2>Why sell to a plant rather than a broker</h2>
  <p>We are the end user of the material, not a middleman looking for a margin. That means fewer surprises on quality claims, a straight answer on price, and a buyer who will still be there next month.</p>
</div>

<div class="q-section">
  <h2>Questions sellers ask</h2>
  <details class="q-faq"><summary>Do you buy mixed plastic?</summary><p>Yes, but mixed material is priced according to how much of it we can actually recover. Single-polymer loads are worth more, and we will tell you why the price differs rather than just quoting a number.</p></details>
  <details class="q-faq"><summary>Do you arrange transport?</summary><p>For local purchases we can arrange movement to the plant. For imports, terms are agreed before shipment.</p></details>
  <details class="q-faq"><summary>What documents do you need for an import lot?</summary><p>Commercial invoice and packing list to start; inspection or test reports if you have them. We will tell you exactly what is required once we know the material and the origin.</p></details>
</div>

${CTA}`
  },

  {
    id: 1031,
    slug: 'facility',
    title: 'Our Facility',
    seoTitle: 'Our Recycling Facility in Karachi | Al Qaryan Industries',
    seoDesc: 'Our recycling and pipe production facility at Shershah Industrial Area, Karachi: 500 tons per month, shredder, washing line, pelletiser and two PVC pipe extrusion lines.',
    focus: 'recycling facility Karachi',
    html: `
<div class="q-hero q-hero--compact">
  <p class="q-kicker">Facility</p>
  <h1>Our facility in Karachi</h1>
  <p class="q-lead">Everything we sell is processed at one site: Shershah Industrial Area, Karachi — 500 tons a month through shredding, washing, pelletising and two PVC pipe extrusion lines.</p>
</div>

<div class="q-section">
  <h2>What is on site</h2>
  <table class="q-table">
    <tbody>
      <tr><th>Location</th><td>Shershah Industrial Area, Karachi, Sindh, Pakistan</td></tr>
      <tr><th>Monthly capacity</th><td>500 tons</td></tr>
      <tr><th>Recycling equipment</th><td>Shredder · washing line · pelletiser</td></tr>
      <tr><th>Pipe production</th><td>2 PVC pipe extrusion lines</td></tr>
      <tr><th>In operation since</th><td>2007</td></tr>
      <tr><th>Systems</th><td>ISO 9001 quality management · ISO 14001 environmental management</td></tr>
    </tbody>
  </table>
</div>

<div class="q-section">
  <h2>Why one site matters</h2>
  <p>When purchase, processing, testing and dispatch happen in the same place, responsibility has nowhere to hide. If a lot is wrong, we know which batch it came from and what went into it. That is difficult to achieve when processing is subcontracted to three different units.</p>
</div>

<div class="q-section">
  <h2>Visiting us</h2>
  <p>Customers and suppliers are welcome to visit the plant. Call ahead on <a href="${TEL_LINK}">${TEL}</a> so someone senior is available to walk you through the line rather than hand you a brochure.</p>
</div>

<div class="q-section">
  <h2>Where we deliver</h2>
  <p>Nationwide across Pakistan — Sindh, Punjab, Balochistan and Khyber Pakhtunkhwa — by road, with container lots available for larger orders.</p>
</div>

${CTA}`
  },

  {
    id: 1032,
    slug: 'quality',
    title: 'Quality & Certifications',
    seoTitle: 'Quality &amp; Certifications | ISO 9001, ISO 14001, REACH | Al Qaryan Industries',
    seoDesc: 'Al Qaryan Industries operates ISO 9001 and ISO 14001 systems, is REACH compliant and supplies SGS inspection reports on request.',
    focus: 'ISO 9001 plastic recycling Pakistan',
    html: `
<div class="q-hero q-hero--compact">
  <p class="q-kicker">Quality</p>
  <h1>Quality and certifications</h1>
  <p class="q-lead">Documented quality is the difference between recycled material that works and material that wastes a production shift.</p>
</div>

<div class="q-section">
  <h2>Our standards</h2>
  <table class="q-table">
    <tbody>
      <tr><th>ISO 9001</th><td>Quality management system — how we control and record what we produce</td></tr>
      <tr><th>ISO 14001</th><td>Environmental management system — how we control the environmental side of processing</td></tr>
      <tr><th>REACH</th><td>Compliance for customers who need it in their own supply chain</td></tr>
      <tr><th>SGS inspection</th><td>Third-party inspection reports available on request</td></tr>
      <tr><th>Registrations</th><td>NTN / GST registered · member of the chamber of commerce</td></tr>
    </tbody>
  </table>
  <p class="q-note">Certificate numbers and issuing bodies are provided with quotations and on request, so a buyer's compliance team can verify them directly.</p>
</div>

<div class="q-section">
  <h2>What we test, and why</h2>
  <ul class="q-list">
    <li><strong>Moisture.</strong> Wet material degrades in the melt and shows up as defects in the finished product.</li>
    <li><strong>Contamination.</strong> Metal, dirt, label and other-polymer content — the single biggest cause of rejections in recycled material.</li>
    <li><strong>Polymer separation.</strong> PVC must not enter polyolefin streams, and vice versa.</li>
    <li><strong>Colour consistency.</strong> Stated per lot, so a buyer knows what will arrive before it arrives.</li>
    <li><strong>Form and bulk density.</strong> Because a machine feeds on a screw, not on a specification sheet.</li>
  </ul>
</div>

<div class="q-section">
  <h2>Documentation you receive</h2>
  <p>A batch test report with the lot. SGS inspection on request. Certificate copies for your compliance file. If your process needs a specific parameter recorded, tell us and we will test it rather than assume.</p>
</div>

<div class="q-section">
  <h2>Questions buyers ask</h2>
  <details class="q-faq"><summary>Can you send certificates before we order?</summary><p>Yes — certificate numbers and copies are provided during quotation, so you can verify them.</p></details>
  <details class="q-faq"><summary>Do you provide third-party inspection?</summary><p>SGS inspection is available on request, and is our normal practice for container lots.</p></details>
  <details class="q-faq"><summary>What happens if a lot does not meet the agreed specification?</summary><p>It is discussed against the batch report we both hold. That is precisely why the specification is agreed in writing before production rather than after delivery.</p></details>
</div>

${CTA}`
  },

  {
    id: 1033,
    slug: 'faq',
    title: 'Frequently Asked Questions',
    seoTitle: 'Frequently Asked Questions | Al Qaryan Industries',
    seoDesc: 'Answers about buying recycled plastic, PVC pipes, minimum orders, delivery across Pakistan, documentation, and selling scrap to Al Qaryan Industries.',
    focus: 'plastic recycling FAQ Pakistan',
    html: `
<div class="q-hero q-hero--compact">
  <p class="q-kicker">FAQ</p>
  <h1>Frequently asked questions</h1>
  <p class="q-lead">The questions we are asked most, answered straight.</p>
</div>

<div class="q-section">
  <details class="q-faq" open><summary>What do you actually sell?</summary><p>Recycled plastic regrind, flake and pellets (HDPE, LDPE, PP, PET, PVC, ABS/PS), PVC and UPVC pipes manufactured on our own extrusion lines, and complementary pipe sizes and fittings sourced from vetted mills.</p></details>
  <details class="q-faq"><summary>Do you manufacture or trade?</summary><p>Both, and we say which is which. Pipe produced on our two lines is sold as our manufacturing. Anything we source from other mills is presented as supply, not as our own production.</p></details>
  <details class="q-faq"><summary>What is your minimum order?</summary><p>One truckload for recycled material, and for pipes it depends on the size — ask, and we will be flexible for a trial order.</p></details>
  <details class="q-faq"><summary>Can I order a trial quantity first?</summary><p>Yes. Testing a lot is the sensible way to buy recycled material, and we would rather you did.</p></details>
  <details class="q-faq"><summary>Do you deliver outside Karachi?</summary><p>Yes — across Pakistan by road, with container lots available for larger orders.</p></details>
  <details class="q-faq"><summary>What documentation comes with a lot?</summary><p>A batch test report stating moisture, contamination and the parameters agreed for your application. SGS inspection is available on request.</p></details>
  <details class="q-faq"><summary>Can you match a specific MFI or density?</summary><p>Tell us the target and the application. We confirm what is achievable per lot rather than promising a single number for all orders.</p></details>
  <details class="q-faq"><summary>Do you buy scrap from abroad?</summary><p>Yes — we buy from the UAE, Saudi Arabia, the USA, Canada, Malaysia, Japan and Indonesia as well as locally. Terms and inspection are agreed before shipment.</p></details>
  <details class="q-faq"><summary>Are you certified?</summary><p>We operate ISO 9001 and ISO 14001 systems, are REACH compliant, and can provide SGS inspection reports. Certificate numbers are given with quotations.</p></details>
  <details class="q-faq"><summary>How do I get a price?</summary><p>Send the polymer or pipe specification, the quantity and the delivery city by WhatsApp on ${TEL} or through the <a href="/contact/">contact page</a>. You get availability, price and packing in reply.</p></details>
</div>

${CTA}

<script type="application/ld+json">
{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[
{"@type":"Question","name":"What do you actually sell?","acceptedAnswer":{"@type":"Answer","text":"Recycled plastic regrind, flake and pellets (HDPE, LDPE, PP, PET, PVC, ABS/PS), PVC and UPVC pipes manufactured on our own extrusion lines, and complementary pipe sizes and fittings sourced from vetted mills."}},
{"@type":"Question","name":"Do you manufacture or trade?","acceptedAnswer":{"@type":"Answer","text":"Both, and we say which is which. Pipe produced on our two lines is sold as our manufacturing; anything sourced from other mills is presented as supply."}},
{"@type":"Question","name":"What is your minimum order?","acceptedAnswer":{"@type":"Answer","text":"One truckload for recycled material. For pipes it depends on the size; we are flexible for trial orders."}},
{"@type":"Question","name":"Do you deliver outside Karachi?","acceptedAnswer":{"@type":"Answer","text":"Yes, across Pakistan by road, with container lots available for larger orders."}},
{"@type":"Question","name":"Are you certified?","acceptedAnswer":{"@type":"Answer","text":"We operate ISO 9001 and ISO 14001 systems, are REACH compliant and can provide SGS inspection reports. Certificate numbers are given with quotations."}},
{"@type":"Question","name":"Do you buy scrap from abroad?","acceptedAnswer":{"@type":"Answer","text":"Yes. We buy from the UAE, Saudi Arabia, the USA, Canada, Malaysia, Japan and Indonesia as well as locally."}}
]}
</script>`
  },

  {
    id: 1034,
    slug: 'contact',
    title: 'Contact Us',
    seoTitle: 'Contact Al Qaryan Industries | Karachi, Pakistan',
    seoDesc: 'Contact Al Qaryan Industries LLC, Shershah Industrial Area, Karachi. Call or WhatsApp +92 333 201 0506 for recycled plastic and PVC pipe enquiries.',
    focus: 'contact Al Qaryan Industries',
    html: `
<div class="q-hero q-hero--compact">
  <p class="q-kicker">Contact</p>
  <h1>Talk to us</h1>
  <p class="q-lead">Send your requirement — polymer or pipe, quantity and delivery city — and you will get availability, price and packing in reply.</p>
</div>

<div class="q-grid q-grid--2">
  <div class="q-card">
    <h3>Al Qaryan Industries LLC</h3>
    <p>Shershah Industrial Area<br>Karachi, Sindh<br>Pakistan</p>
    <p><strong>Phone / WhatsApp</strong><br><a href="${TEL_LINK}">${TEL}</a></p>
    <p><strong>Email</strong><br><a href="mailto:info@alqaryangroup.com">info@alqaryangroup.com</a></p>
    <p class="q-muted">Our team answers calls and messages during Pakistan business hours, Monday to Saturday.</p>
  </div>
  <div class="q-card">
    <h3>Fastest way to a price</h3>
    <p>WhatsApp is quickest. Send:</p>
    <ul class="q-list q-list--tight">
      <li>What you need — polymer and form, or pipe diameter and class</li>
      <li>Quantity</li>
      <li>Delivery city</li>
      <li>Any target specification (MFI, density, colour)</li>
    </ul>
    <a class="q-btn q-btn--wa" href="${WA}" target="_blank" rel="noopener">Open WhatsApp</a>
  </div>
</div>

<div class="q-section">
  <h2>Buying or selling?</h2>
  <table class="q-table">
    <thead><tr><th>You want to…</th><th>Go here</th></tr></thead>
    <tbody>
      <tr><td>Buy recycled plastic material</td><td><a href="/materials/">Materials</a></td></tr>
      <tr><td>Buy PVC pipe</td><td><a href="/pvc-pipe-manufacturing/">Pipe manufacturing</a></td></tr>
      <tr><td>Sell us plastic scrap</td><td><a href="/we-buy/">We buy plastic scrap</a></td></tr>
      <tr><td>Check our certifications</td><td><a href="/quality/">Quality</a></td></tr>
      <tr><td>Visit the plant</td><td><a href="/facility/">Our facility</a></td></tr>
    </tbody>
  </table>
</div>

<script type="application/ld+json">
{"@context":"https://schema.org","@type":"LocalBusiness","@id":"https://alqaryangroup.com/#organization","name":"Al Qaryan Industries LLC","url":"https://alqaryangroup.com","telephone":"+923332010506","email":"info@alqaryangroup.com","address":{"@type":"PostalAddress","streetAddress":"Shershah Industrial Area","addressLocality":"Karachi","addressRegion":"Sindh","addressCountry":"PK"},"areaServed":{"@type":"Country","name":"Pakistan"}}
</script>`
  },

  {
    id: 1035,
    slug: 'sustainability',
    title: 'Sustainability',
    seoTitle: 'Sustainability &amp; Our Commitment to Recycling | Al Qaryan Industries',
    seoDesc: 'How Al Qaryan Industries approaches sustainability: ISO 14001 environmental management, controlled processing, and keeping plastic in the value chain since 2007.',
    focus: 'sustainable plastic recycling Pakistan',
    html: `
<div class="q-hero q-hero--compact">
  <p class="q-kicker">Sustainability</p>
  <h1>Sustainability without greenwash</h1>
  <p class="q-lead">We have kept plastic in the value chain since 2007. Here is what that means in practice — and where we are honest about the limits.</p>
</div>

<div class="q-section">
  <h2>What we actually do</h2>
  <ul class="q-list">
    <li><strong>Recover material instead of discarding it.</strong> 500 tons a month of plastic scrap is processed into material manufacturers can use again, replacing virgin polymer in real products.</li>
    <li><strong>Run an environmental management system.</strong> Our ISO 14001 system covers how waste, water, energy and emissions are controlled on site — audited, not asserted.</li>
    <li><strong>Reject bad input rather than hide it.</strong> Contaminated loads are refused or downgraded instead of being blended into a lot that fails downstream. That protects the customer's process and keeps recycled material credible.</li>
    <li><strong>Keep processing local.</strong> Recycling happens in Karachi and serves Pakistani manufacturers, which keeps the transport footprint of the finished material low.</li>
  </ul>
</div>

<div class="q-section">
  <h2>Where we are honest</h2>
  <p>Recycling is not automatically good. Washing consumes water, melting consumes energy, and badly sorted material becomes waste again at the customer's plant. Our position is straightforward: do the steps properly, document what was done, and do not claim more than the process delivers.</p>
</div>

<div class="q-section">
  <h2>Circularity in practice</h2>
  <p>We buy scrap from suppliers in Pakistan, the UAE, Saudi Arabia, the USA, Canada, Malaysia, Japan and Indonesia; we process it at one site in Karachi; we sell the output to Pakistani manufacturers; and when their offcuts and rejects come back, we process those again. That loop — not a slogan — is the business.</p>
</div>

<div class="q-section">
  <h2>Certifications that support the claim</h2>
  <p>ISO 14001 for environmental management, ISO 9001 for quality management, REACH compliance, and SGS inspection on request. <a class="q-link" href="/quality/">See certifications</a>.</p>
</div>

${CTA}`
  },

  {
    id: 1036,
    slug: 'privacy',
    title: 'Privacy Policy',
    status: 'publish',
    seoTitle: 'Privacy Policy | Al Qaryan Industries',
    seoDesc: 'How Al Qaryan Industries handles the information you send when you contact us about recycled plastic materials or PVC pipes.',
    html: `
<div class="q-hero q-hero--compact">
  <h1>Privacy Policy</h1>
  <p class="q-lead">What we collect when you contact us, why, and what we do with it.</p>
</div>

<div class="q-prose">
  <h2>What we collect</h2>
  <p>When you call, message or email us we receive your name, phone number, email address, company and whatever details you choose to send about your requirement — for example a material specification, quantity and delivery location.</p>

  <h2>Why we keep it</h2>
  <p>To answer your enquiry, prepare a quotation, arrange delivery, and keep a commercial record of orders as required for accounting and tax purposes.</p>

  <h2>What we do not do</h2>
  <p>We do not sell your details. We do not add you to a marketing list without your agreement. We do not share your information with third parties except where it is necessary to fulfil an order (for example a transporter) or where the law requires it.</p>

  <h2>How long we keep it</h2>
  <p>Enquiry records are kept while the commercial relationship is active and afterwards for the period required by accounting and tax regulations.</p>

  <h2>Analytics</h2>
  <p>This website may use basic visit statistics to understand which pages are useful. We do not use them to identify individuals.</p>

  <h2>Your choices</h2>
  <p>You can ask us what information we hold about you, ask for a correction, or ask us to delete what is not required for legal records. Contact <a href="mailto:info@alqaryangroup.com">info@alqaryangroup.com</a> or call ${TEL}.</p>
</div>`
  },

  {
    id: 1037,
    slug: 'terms',
    title: 'Terms of Use',
    seoTitle: 'Terms of Use | Al Qaryan Industries',
    seoDesc: 'Terms of use for the Al Qaryan Industries website.',
    html: `
<div class="q-hero q-hero--compact">
  <h1>Terms of Use</h1>
  <p class="q-lead">The basis on which this website is provided.</p>
</div>

<div class="q-prose">
  <h2>Information on this site</h2>
  <p>Product descriptions, capacities and specifications are provided for general information. Recycled materials and pipes are supplied against an agreed specification confirmed in writing at quotation — the specification agreed for your order takes precedence over anything published here.</p>

  <h2>No offer</h2>
  <p>Nothing on this website constitutes a binding offer. Prices, availability and lead times are confirmed individually.</p>

  <h2>Intellectual property</h2>
  <p>The text, layout and images on this site belong to Al Qaryan Industries LLC unless stated otherwise. You may not republish them commercially without permission.</p>

  <h2>External links</h2>
  <p>Where we link to other websites we do not control their content and are not responsible for it.</p>

  <h2>Governing law</h2>
  <p>Use of this website is governed by the laws of the Islamic Republic of Pakistan.</p>

  <h2>Contact</h2>
  <p>Al Qaryan Industries LLC, Shershah Industrial Area, Karachi · ${TEL} · <a href="mailto:info@alqaryangroup.com">info@alqaryangroup.com</a></p>
</div>`
  },

  {
    id: 1038,
    slug: 'gallery',
    title: 'Gallery',
    seoTitle: 'Our Facility &amp; Materials Gallery | Al Qaryan Industries Karachi',
    seoDesc: 'Photos of the Al Qaryan Industries plastics facility in Karachi: shredding and washing line, pelletiser, PVC pipe extrusion and the materials we trade.',
    focus: 'plastic recycling facility Karachi photos',
    html: `
<div class="q-hero q-hero--compact">
  <p class="q-kicker">Gallery</p>
  <h1>Inside our plant</h1>
  <p class="q-lead">Real photographs of the equipment and materials at our Shershah Industrial Area facility in Karachi — no stock imagery.</p>
</div>

<div class="q-section">
  <h2>Recycling line</h2>
  <div class="q-gallery">
    <figure>
      <img src="{{IMG_PLANT}}" alt="Shredding and washing line with conveyor at the Al Qaryan Industries facility, Karachi" width="374" height="320" loading="lazy" decoding="async">
      <figcaption>Shredding and washing line — size reduction and washing before pelletising.</figcaption>
    </figure>
  </div>
  <p class="q-muted">More photographs of the pelletiser, PVC pipe extrusion lines, warehouse and material grades are added here as they are taken. If you need a specific view before then — for example a loading photo or a close-up of a grade — ask and we will send it.</p>
</div>

<div class="q-section">
  <h2>What we trade</h2>
  <div class="q-mgrid">
    <a class="q-mtile" href="/materials/hdpe/"><div class="q-mtile__art"><svg viewBox="0 0 200 76" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="gGHdpe" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b6e4f"/><stop offset="1" stop-color="#0a4d38"/></linearGradient></defs><rect width="200" height="76" fill="url(#gGHdpe)"/><g fill="rgba(255,255,255,.18)"><circle cx="30" cy="24" r="7"/><circle cx="60" cy="46" r="5"/><circle cx="92" cy="22" r="6"/><circle cx="126" cy="48" r="7"/><circle cx="160" cy="26" r="5"/></g></svg></div><b>HDPE</b><span>Regrind, flake, pellets</span></a>
    <a class="q-mtile" href="/materials/ldpe/"><div class="q-mtile__art"><svg viewBox="0 0 200 76" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="gGLdpe" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#13896a"/><stop offset="1" stop-color="#0b5c47"/></linearGradient></defs><rect width="200" height="76" fill="url(#gGLdpe)"/><g fill="none" stroke="rgba(255,255,255,.22)" stroke-width="3"><path d="M-10 62 Q 40 30 90 56 T 210 44"/><path d="M-10 46 Q 40 14 90 40 T 210 28"/></g></svg></div><b>LDPE</b><span>Film and liner grades</span></a>
    <a class="q-mtile" href="/materials/pp/"><div class="q-mtile__art"><svg viewBox="0 0 200 76" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="gGPp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1c7e5c"/><stop offset="1" stop-color="#0d4a34"/></linearGradient></defs><rect width="200" height="76" fill="url(#gGPp)"/><g fill="rgba(255,255,255,.16)"><rect x="22" y="20" width="28" height="12" rx="3"/><rect x="70" y="40" width="30" height="12" rx="3"/><rect x="120" y="18" width="26" height="12" rx="3"/></g></svg></div><b>PP</b><span>Raffia and injection</span></a>
    <a class="q-mtile" href="/materials/pet/"><div class="q-mtile__art"><svg viewBox="0 0 200 76" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="gGPet" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2f9e8a"/><stop offset="1" stop-color="#0f5f56"/></linearGradient></defs><rect width="200" height="76" fill="url(#gGPet)"/><g fill="rgba(255,255,255,.20)"><path d="M30 52 l10-16 10 16z"/><path d="M72 46 l12-20 12 20z"/><path d="M118 54 l9-15 9 15z"/><path d="M156 44 l12-19 12 19z"/></g></svg></div><b>PET</b><span>Washed bottle flake</span></a>
    <a class="q-mtile" href="/materials/pvc/"><div class="q-mtile__art"><svg viewBox="0 0 200 76" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="gGPvc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f766e"/><stop offset="1" stop-color="#0a4a44"/></linearGradient></defs><rect width="200" height="76" fill="url(#gGPvc)"/><g stroke="rgba(255,255,255,.22)" stroke-width="7" stroke-linecap="round"><line x1="26" y1="52" x2="66" y2="24"/><line x1="82" y1="52" x2="122" y2="24"/><line x1="138" y1="52" x2="178" y2="24"/></g></svg></div><b>PVC</b><span>Regrind and compound</span></a>
    <a class="q-mtile" href="/materials/abs-ps/"><div class="q-mtile__art"><svg viewBox="0 0 200 76" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="gGAbs" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2b6f7a"/><stop offset="1" stop-color="#123f47"/></linearGradient></defs><rect width="200" height="76" fill="url(#gGAbs)"/><g fill="rgba(255,255,255,.18)"><polygon points="40,22 52,29 52,43 40,50 28,43 28,29"/><polygon points="100,28 112,35 112,49 100,56 88,49 88,35"/><polygon points="158,20 170,27 170,41 158,48 146,41 146,27"/></g></svg></div><b>ABS &amp; PS</b><span>Housings and moulding</span></a>
  </div>
</div>

${CTA}`
  },

  ...MATERIAL_DEAL_PAGES
];

// Top navigation, in order. "home" is the logo, so it is not repeated here.
export const MENU = ['about', 'services', 'materials', 'materials-we-deal', 'we-buy', 'facility', 'quality', 'contact'];
