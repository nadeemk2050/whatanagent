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

All marked `TODO` in `build/content.mjs`:

| Field | Current | Replace with |
|---|---|---|
| `SITE.phone` | `+968 0000 0000` | real yard/office number |
| `SITE.whatsapp` | `+96800000` | WhatsApp number (digits, no +) |
| `SITE.cr` | `CR 0000000` | commercial registration number |
| `SITE.hours` | Sun–Thu 08:00–18:00 … | confirmed opening hours |
| `SITE.email` | `info@arabianpolyplast.com` | confirm the mailbox exists |

Also worth adding once available:

- real photos in `src/` and referenced from the pages, plus `assets/og.jpg` (1200×630) for link previews;
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
