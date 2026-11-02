// Shared copy blocks for the material pages. Imported by content-pages.mjs too,
// so the phone number and call-to-action only exist in one place.

export const TEL = '+92 333 201 0506';
export const TEL_LINK = 'tel:+923332010506';
export const WA = 'https://wa.me/923332010506';

export const CTA = `
<div class="q-cta">
  <div class="q-cta__text">
    <strong>Buying this material, or selling it to us?</strong>
    <span>Send the grade, the quantity and your city — we reply with availability and price.</span>
  </div>
  <div class="q-cta__actions">
    <a class="q-btn q-btn--primary" href="/contact/">Request a quote</a>
    <a class="q-btn q-btn--wa" href="${WA}" rel="noopener" target="_blank">WhatsApp ${TEL}</a>
  </div>
</div>`;
