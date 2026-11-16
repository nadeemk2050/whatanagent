# alqaryangroup.com — complete website handbook

**Read this before changing anything.** It is written for an incoming agent or developer who has
never seen this site. Everything here was verified against the live site and the workshop
records; nothing is assumed.

| | |
|---|---|
| Site | https://alqaryangroup.com |
| Company | Al Qaryan Industries LLC (Karachi, Pakistan) — plastic recycling, polymer trading, PVC pipe manufacturing. Established 2007, 500 tons/month |
| Platform | WordPress (Astra theme, Rank Math SEO, LiteSpeed Cache) on Hostinger |
| Repository folder | `alqaryan-site/` in this repo |
| Last full review | 2026-11-16 |

---

## 1. Contacts and NAP — one source of truth

| Field | Value |
|---|---|
| Phone / WhatsApp | `+92 333 201 0506` → `tel:+923332010506`, `https://wa.me/923332010506` |
| Email | `info@alqaryangroup.com` |
| Address | Shershah Industrial Area, Karachi, Sindh 75700, Pakistan |
| Google Business Profile | Verified; address, hours and website managed there |
| Search Console | Domain property `sc-domain:alqaryangroup.com` (DNS TXT) |
| GA4 | `G-MMBWQXX946`, Asia/Karachi, PKR, linked to Search Console |

**Rule:** these strings come from `alqaryan-site/build/materials/constants.mjs` (`TEL`,
`TEL_LINK`, `WA`) and `build/chrome.mjs` (`EMAIL`). Never type a phone number into a template
again — a second WhatsApp number in a floating button was live until 2026-11-16 and split the
enquiry trail.

---

## 2. Hosting and stack

| Layer | Detail |
|---|---|
| Host | Hostinger shared hosting (Business), behind the Hostinger CDN (`hcdn`) |
| Origin | LiteSpeed, `x-litespeed-cache: hit` on cached pages, Brotli |
| PHP | 8.3.x |
| WordPress | 7.1.4, Astra theme |
| Active plugins | Rank Math SEO, LiteSpeed Cache, GA Google Analytics, Hostinger (3), WordPress Importer, **Al Qaryan Scrap Market (ours)** |
| Rank Math modules | Sitemap module **OFF** (see §7), everything else on |

### Crawler behaviour to know about

The CDN answers **403** to requests that *claim* to be Googlebot/Bingbot from an ordinary IP, and
200 to everything else. This is crawler-identity verification, **not** a block on the real
crawlers — Search Console reads the sitemap successfully. Do not "fix" it; verify real access in
Search Console / Bing Webmaster instead. `scripts/alqaryan-audit.mjs` reports it as
informational.

---

## 3. Access

Credentials are **not in this repo**. They live in the workshop store
(`appData/seoAgent.sites["alqaryangroup.com"]` and
`appData/websitesWorkshop.sites["alqaryangroup.com"].host`):

| Key | What it is |
|---|---|
| `cmsUsername` / `cmsPassword` | WordPress user + **application password** (REST API only) |
| `cmsLoginUser` / `cmsLoginPassword` | WordPress login password (cookie login, plugin uploads) |
| `hostPanelUser` / `hostPanelPassword` | Hostinger hPanel (File Manager, FTP, databases, DNS) |
| `gscAccess` | Search Console service-account JSON |

REST calls: `Authorization: Basic base64(user:application-password)`.
Cookie flows (plugin zip upload, Rank Math screens) need `cmsLoginPassword` — an application
password is rejected by `wp-login.php`.

---

## 4. The site, page group by page group

```
/                                   home — H1, trust stats, two funnels
/about/ /services/ (+4 children)    company and service pages
/materials/ (+6)                    resin families: HDPE, LDPE, PP, PET, PVC, ABS&PS
/materials-we-deal/ (+13)           individual scrap streams and grades
/we-buy/ /facility/ /quality/       buying, plant, certification
/faq/ /contact/ /gallery/           support and conversion
/sustainability/ /privacy/ /terms/  trust and legal
/hdpe-pipes-pakistan/               buyer guides (7): PVC/HDPE pipes, scrap, sellers,
/pvc-pipes-pakistan/                compare, price. Product + FAQPage schema,
/hdpe-scrap-pakistan/               1,200–1,650 words each
/ldpe-scrap-pakistan/
/pipe-sellers-pakistan/
/pvc-vs-hdpe-pipes-pakistan/
/pipe-price-guide-pakistan/
/list-your-scrap/                   the free posting form (shortcode [scrap_market_post])
/scrap-market/                      Recycle Scrap Market (see §6)
```

Total public pages: **45** (44 original + the posting page). The core sitemap lists all of them.

---

## 5. How content is produced (the build folder)

`alqaryan-site/build/` generates every page as a single WordPress Custom HTML block, so the theme
never re-processes the markup.

| File | Role |
|---|---|
| `content-pages.mjs` | `PAGES` array (ids 1001–1038) + `MENU`; imports material pages and guide pages |
| `materials/` | material + scrap-stream page data and template |
| `guides/pages.mjs` | the 7 buyer guides; `GUIDE_PAGES` publishes them through the normal build |
| `chrome.mjs` | header, footer, floating WhatsApp/call/mail buttons; `wrapContent()` |
| `build-preview.mjs` | writes `dist/preview/*.html` **and** `dist/content-manifest.json` |
| `build-wxr.mjs` | writes `dist/alqaryan-content.wxr` for a fresh WordPress import |

**Rule:** every page must be wrapped by `wrapContent()` in `chrome.mjs`. Publishing raw
`render()` output is what left 7 guide pages with no header, no footer and no WhatsApp button
until 2026-11-16.

Publishing today: `scripts/push-guides.mjs --apply` (guides) and the REST content manifest for
the rest. Both use the application password.

---

## 6. Scrap Market (plugin `alqaryan-scrap-market`, v0.2.2)

A free, public market for plastic scrap: **For Sale** and **Need to Buy** listings.

### URLs

```
/scrap-market/                 the market: kind switch, search, facets, sideways rail, 20 per slide
/scrap-market/?kind=sell       For Sale only
/scrap-market/?kind=buy        Need to Buy only
/scrap-market/?q=…&material=hdpe&region=uae&qty=10&sort=price_asc
/scrap-market/{slug}/          one listing: gallery, price bar, WhatsApp, enquiry form, related lots
/scrap-market/material/{slug}/ material view      /scrap-market/region/{slug}/  region view
/list-your-scrap/              public posting form
```

### Behaviour

- **Posting is open**: no account, no fee. Controls are a honeypot, a 3-second minimum fill
  time, a nonce, 5 posts/hour per IP, and duplicate-title suppression for an hour.
- `Settings → Scrap Market` switches posting off, or sends new listings to the review queue.
- `Scrap Market → Review queue` lists pending + reported listings (approve / dismiss / trash).
- Visitors can **report** a listing; the counter shows in the queue.
- Photos: up to 5 per listing, re-encoded through the **300 KB pipeline** (EXIF stripped, longest
  edge 1600 px, WebP binary search on quality).
- Schema: `Product` + `Offer` for For Sale, `Demand` for Need to Buy, `BreadcrumbList`, and
  `ItemList` on the archive.
- Publishing a listing purges the LiteSpeed cache so the archive refreshes immediately.
- Listing meta is exposed to REST (`register_post_meta`), so listings can be created by an agent
  or script, not only by hand.

### Layout rules

Mobile first: the kind switch and the listing rail come first, the heading and copy below. The
rail is a native scroll container (swipe, mouse wheel, arrow keys) with 20 lots per slide;
pagination moves to the next 20. On ≥861 px the heading returns to the top and 3–4 cards are
visible per view.

---

## 7. Search visibility

| Item | State |
|---|---|
| Indexing | Home `INDEXING_ALLOWED`, robots `index, follow` |
| Canonicals | Self-referencing on every page |
| Titles / descriptions | 45 unique titles, 45 unique descriptions, one H1 per page |
| Structured data | Organization/LocalBusiness 44/44, BreadcrumbList 43, Product 26, FAQPage 22, 0 invalid |
| Sitemap | **Core** `/wp-sitemap.xml` (see below) |
| IndexNow | Key `f90e62ce9199ff70fd09452c4519dbf9` served at the site root; all URLs submitted |
| Mixed content | None |
| Image weight | Every served image is WebP under 300 KB |

### Why core sitemaps, not Rank Math's

Rank Math's sitemap module began returning 404 for `/sitemap_index.xml` and `/page-sitemap.xml`
on 2026-11-16 (rewrite rules present, module enabled, settings healthy, XSL still served — the
index 404'd even for a logged-in admin, and a module off/on cycle did not recover it). The module
is therefore **off**, and WordPress core serves:

```
/wp-sitemap.xml                        index
/wp-sitemap-posts-page-1.xml           45 pages
/wp-sitemap-posts-post-1.xml           blog posts
/wp-sitemap-posts-scrap_listing-1.xml  market listings (automatic)
```

`robots.txt` advertises `/wp-sitemap.xml` automatically. **Do not re-enable Rank Math's sitemap
module without re-testing all four URLs** — and if you do, submit the new index in Search Console
the same day.

### IndexNow

```
POST https://api.indexnow.org/indexnow
{"host":"alqaryangroup.com","key":"f90e62ce9199ff70fd09452c4519dbf9",
 "keyLocation":"https://alqaryangroup.com/f90e62ce9199ff70fd09452c4519dbf9",
 "urlList":["https://alqaryangroup.com/..."]}
```

Accepted codes: api.indexnow.org 200, bing.com/indexnow 200, yandex.com/indexnow 202.

---

## 8. Rules — do not break these

1. **One phone number.** `+92 333 201 0506` / `wa.me/923332010506`, everywhere, from the
   constants file.
2. **Every page gets `wrapContent()`** — header, footer and the contact buttons.
3. **One H1 per page**; the title names the company and the trade.
4. **Never invent a fact.** Certifications, capacity, sizes and prices come from the owner.
   Grades are "agreed per lot".
5. **Images stay under 300 KB**, WebP, EXIF stripped.
6. **The market is not a broker.** Listings are posted by the trade; the safety block on each
   listing says so and must stay.
7. **Internal links point at final URLs** (`/services/plastic-recycling/`, never
   `/plastic-recycling/`, which 301s).
8. **Purge the cache after content changes** — the CDN otherwise serves week-old HTML. Listing
   publishes do it automatically.
9. **Never store credentials in the repo.** They live in the workshop store (§3).
10. **An application password cannot log in to `wp-admin`.** For cookie flows use
    `cmsLoginPassword`.

---

## 9. Open items

| Item | Detail |
|---|---|
| Bing indexing | 0 pages indexed historically; all URLs pushed via IndexNow on 2026-11-16. Confirm in Bing Webmaster (owner login) |
| Bing sitemap | Confirm `/wp-sitemap.xml` shows discovered URLs, or submit it manually |
| Gallery | Only one real plant photo; the 24-photo shot list is in `alqaryan-site/image-plan.md` |
| Homepage TTFB | 1.0–1.8 s measured; origin render 1.2–1.5 s |
| HSTS | `Strict-Transport-Security` not sent; add in hPanel when convenient |
| Duplicate listings | Two identical "PC BOTTLE SCRAP" listings were posted on 2026-11-16; remove one in Scrap Market → All Listings |
| Case studies | Needs real project facts from the owner |

---

## 10. Changelog

### 2026-11-16 — audit, repair, and the Scrap Market launch

**Repairs**
- The 7 buyer guides were rebuilt and republished with the shared header, footer and
  WhatsApp/call buttons; the CTA phone typo (`+92 333 201506`) was corrected in the build and the
  guide CTA became a real WhatsApp button.
- Removed the second WhatsApp number (UAE `+971 52 924 4592`) from every floating button and
  replaced the personal Gmail (`nadeemalsaham@…`) with `info@alqaryangroup.com` — 37 pages
  patched, verified 44/44 pages carry the correct number.
- 7 internal links repointed from 301 URLs to `/services/…`.
- IndexNow confirmed working (key at root, 200/200/202) and all 44 URLs submitted.
- Rank Math's dead sitemap replaced with WordPress core sitemaps (see §7).

**New**
- Recycle Scrap Market plugin v0.2.2: public market page, For Sale / Need to Buy switch, search +
  facets + sort, mobile sliding rail (20 per slide), listing pages with gallery, WhatsApp deep
  link and enquiry form, open posting with anti-spam, review queue, report button, 300 KB photo
  pipeline, Product/Demand schema, IndexNow on publish, automatic cache purge.
- `/list-your-scrap/` posting page published; Scrap Market added to the main navigation and
  footer on all pages.
- Credentials for WordPress and Hostinger stored in the workshop records.

**Verification**
- `scripts/alqaryan-audit.mjs`: 45 URLs, 0 non-200, 0 duplicate titles/H1, 0 missing canonicals,
  0 mixed content, 0 missing alt, 44/44 WhatsApp.
