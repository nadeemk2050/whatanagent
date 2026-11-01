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
</footer>

<div class="q-fab" aria-label="Contact Al Qaryan Industries">
  <a class="q-fab__btn q-fab__btn--wa" href="https://wa.me/971529244592" target="_blank" rel="noopener" title="WhatsApp +971 52 924 4592" aria-label="Chat on WhatsApp +971 52 924 4592">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.04 2C6.6 2 2.2 6.4 2.2 11.84c0 1.74.46 3.44 1.32 4.94L2 22l5.36-1.4a9.9 9.9 0 0 0 4.68 1.2h.01c5.43 0 9.84-4.4 9.84-9.84S17.47 2 12.04 2Zm0 17.94a8.1 8.1 0 0 1-4.14-1.14l-.3-.18-3.08.8.82-3-.19-.31a8.1 8.1 0 1 1 6.89 3.83Zm4.44-6.07c-.24-.12-1.44-.71-1.66-.79-.22-.08-.38-.12-.54.12-.16.24-.62.79-.76.95-.14.16-.28.18-.52.06-.24-.12-1.02-.38-1.95-1.2-.72-.64-1.2-1.43-1.34-1.67-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.19-.46-.39-.4-.54-.41h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.7 2.6 4.12 3.64.58.25 1.03.4 1.38.51.58.18 1.11.16 1.53.1.47-.07 1.44-.59 1.64-1.16.2-.57.2-1.06.14-1.16-.06-.1-.22-.16-.46-.28Z"/></svg>
  </a>
  <a class="q-fab__btn q-fab__btn--call" href="tel:+923332010506" title="Call +92 333 201 0506" aria-label="Call +92 333 201 0506">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.2.4 2.4.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.2 1l-2.3 2.2Z"/></svg>
  </a>
  <a class="q-fab__btn q-fab__btn--mail" href="mailto:nadeemalsaham@gmail.com" title="Email nadeemalsaham@gmail.com" aria-label="Email nadeemalsaham@gmail.com">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 5h18c.6 0 1 .4 1 1v12c0 .6-.4 1-1 1H3c-.6 0-1-.4-1-1V6c0-.6.4-1 1-1Zm9 7.2L4.6 7h14.8L12 12.2ZM4 8.6V17h16V8.6l-7.4 5.2c-.4.3-.8.3-1.2 0L4 8.6Z"/></svg>
  </a>
</div>`;

export function wrapContent(html) {
  return '<!-- wp:html -->\n' + HEAD + '\n' + String(html).trim() + '\n' + FOOT + '\n<!-- /wp:html -->';
}
