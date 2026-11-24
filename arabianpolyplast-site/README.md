# Arabian Polyplast — website

Static site for **arabianpolyplast.com** (Barka, Oman). No framework, no database,
no runtime: every page is finished HTML, generated from `build/content.mjs`.

## Build

```bash
node build/build-site.mjs      # → dist/
```

`dist/` is the whole website:

```
index.html · about · services · quality · faq · contact · sell-scrap
products/ (index + 6 material pages)
ar/ (Arabic home + contact)
assets/ (styles.css, app.js, favicon.svg)
sitemap.xml · robots.txt · llms.txt · _headers · _redirects · 404.html
```

## Deploy (Cloudflare Pages)

**Option A — Git integration (recommended once the repo is connected):**
- Framework preset: **None**
- Build command: `node build/build-site.mjs`
- Build output directory: `dist`
- Root directory: `arabianpolyplast-site`

**Option B — direct upload from this machine:**

```bash
node build/build-site.mjs
npx wrangler pages deploy dist --project-name arabianpolyplast
```

Then add the custom domain `arabianpolyplast.com` (Cloudflare creates the DNS
records automatically because the domain is already on Cloudflare).

## Before launch — replace the placeholders

Real contacts are already set (call +968 7694 2126 · WhatsApp +968 9517 4888 · arabianpolyplast@gmail.com).
Still open in `build/content.mjs`:

| Field | Current | Replace with |
|---|---|---|
| `SITE.cr` | `CR 0000000` (not rendered until real) | commercial registration number |
| `SITE.ga4Id` | empty (tag inert) | the GA4 `G-…` measurement ID |
| `SITE.bingAuthKey` | empty (file not written) | the key Bing Webmaster Tools issues |

Also worth adding once available:

- **photos** — drop the originals in `photos/` and run `node build/photos.mjs`; see [PHOTOS.md](PHOTOS.md);
- a 1200×630 `og` image for link previews — done, `src/og-image.png`;
- the Google Maps embed on the contact page (currently a link).

## Lead form

Both forms POST to `https://whatanagent.duckdns.org/api/lead`:

```json
{ "name": "...", "phone": "...", "email": "...", "material": "...",
  "quantity": "...", "message": "...", "source": "arabianpolyplast.com", "page": "/contact.html" }
```

The API has a CORS allow-list — `https://arabianpolyplast.com` and
`https://www.arabianpolyplast.com` must be present in `LEAD_ORIGINS` in
`index.js` (added with this site). Leads land in `appData/websiteLeads` and are
pushed to the boss's WhatsApp notification queue.

## Arabic pages

`/ar/` and `/ar/contact.html` are right-to-left pages with `hreflang` links.
Extend them in `build/build-site.mjs` (`arHome`, `arContact`) when Arabic
content for the full site is ready.

## SEO notes

- Unique title/description/canonical on every page.
- JSON-LD: `Organization` + `LocalBusiness` (address, geo, hours), `Product` on
  each material page, `FAQPage`, `BreadcrumbList`.
- `sitemap.xml` with `lastmod`; `robots.txt` points to it.
- `llms.txt` for AI crawlers.
- `_headers` adds security headers and long-lived caching for `/assets/*`.
