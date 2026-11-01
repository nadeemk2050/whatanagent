// Shared site chrome (header + footer) rendered INSIDE the page content.
// Astra's own header builder on this install only exposes a hidden mobile menu, so the
// site navigation is generated here instead: deterministic, theme-independent, and it
// can never be wiped by a theme update.
export const HEAD = `
<header class="q-site-head">
  <div class="q-site-head__inner">
    <a class="q-brand" href="/">
      <span class="q-brand__mark">AQ</span>
      <span class="q-brand__name">Al Qaryan <em>Industries</em></span>
    </a>
    <nav class="q-nav" aria-label="Main navigation">
      <a href="/about/">About</a>
      <a href="/services/">Services</a>
      <a href="/materials/">Materials</a>
      <a href="/we-buy/">We Buy Scrap</a>
      <a href="/facility/">Facility</a>
      <a href="/quality/">Quality</a>
      <a href="/faq/">FAQ</a>
      <a class="q-nav__cta" href="/contact/">Contact</a>
    </nav>
  </div>
</header>`;

export const FOOT = `
<footer class="q-site-foot">
  <div class="q-site-foot__inner">
    <div class="q-site-foot__col">
      <strong>Al Qaryan Industries LLC</strong>
      <p>Shershah Industrial Area<br>Karachi, Sindh, Pakistan</p>
      <p>Established 2007 · 500 tons per month</p>
    </div>
    <div class="q-site-foot__col">
      <strong>Company</strong>
      <a href="/about/">About us</a>
      <a href="/facility/">Our facility</a>
      <a href="/gallery/">Gallery</a>
      <a href="/quality/">Quality &amp; certifications</a>
      <a href="/sustainability/">Sustainability</a>
      <a href="/faq/">FAQ</a>
    </div>
    <div class="q-site-foot__col">
      <strong>Materials &amp; pipes</strong>
      <a href="/materials/hdpe/">HDPE</a>
      <a href="/materials/ldpe/">LDPE</a>
      <a href="/materials/pp/">PP</a>
      <a href="/materials/pet/">PET</a>
      <a href="/materials/pvc/">PVC</a>
      <a href="/materials/abs-ps/">ABS &amp; PS</a>
      <a href="/pvc-pipe-manufacturing/">PVC pipes</a>
    </div>
    <div class="q-site-foot__col">
      <strong>Contact</strong>
      <a href="tel:+923332010506">+92 333 201 0506</a>
      <a href="https://wa.me/923332010506" target="_blank" rel="noopener">WhatsApp</a>
      <a href="mailto:info@alqaryangroup.com">info@alqaryangroup.com</a>
      <a href="/we-buy/">Sell us your scrap</a>
    </div>
  </div>
  <div class="q-site-foot__legal">
    <span>© ${new Date().getFullYear()} Al Qaryan Industries LLC. All rights reserved.</span>
    <span><a href="/privacy/">Privacy Policy</a> · <a href="/terms/">Terms of Use</a></span>
  </div>
</footer>`;

export function wrapContent(html) {
  return '<!-- wp:html -->\n' + HEAD + '\n' + String(html).trim() + '\n' + FOOT + '\n<!-- /wp:html -->';
}
