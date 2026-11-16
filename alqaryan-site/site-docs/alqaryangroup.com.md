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

## 6. Scrap Market (plugin `alqaryan-scrap-market`, v0.3.0)

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
- **Only three things are required**: a title, the poster's name, and a WhatsApp number *or* an
  email. Material, quantity, description, price, region and photos are all optional — a lot can
  be published with a name and a number and filled in later.
- **A rejected submission never loses what was typed.** The form posts with `fetch` when the
  browser supports it, so nothing reloads; without JavaScript the text is stashed in a
  short-lived transient and put back into the fields on the way back.
- `Settings → Scrap Market` switches posting off, or sends new listings to the review queue.
- `Scrap Market → Review queue` lists pending + reported listings (approve / dismiss / trash).
- Visitors can **report** a listing; the counter shows in the queue.
- **Photos**: up to 5 per listing, chosen one at a time or several at once, from the gallery or
  straight from the phone camera. Each one can be **cropped** (free, 1:1, 4:3, 16:9) before it is
  added, and each one can be removed again — or all of them at once. Files go through the
  **300 KB pipeline** (EXIF stripped, longest edge 1600 px, WebP binary search on quality).
- Schema: `Product` + `Offer` for For Sale, `Demand` for Need to Buy, `BreadcrumbList`, and
  `ItemList` on the archive.
- Publishing a listing purges the LiteSpeed cache so the archive refreshes immediately.
- Listing meta is exposed to REST (`register_post_meta`), so listings can be created by an agent
  or script, not only by hand.
- `/list-your-scrap/`, and any listing viewed with `?sm=manage` or an owner cookie, are
  **excluded from the page cache**: they carry a nonce and per-visitor state.

### Editing and deleting a listing

Anyone who knows the market password can edit or delete any listing — there are no accounts,
and the password is the whole permission model.

- Entry points: **“Posted this lot? Edit or delete it”** at the bottom of a listing, and the small
  **✎ Edit** link on every card in the rail. Both go to `?sm=manage`.
- `?sm=manage` shows a password box. The correct password sets a signed `sm_manage` cookie
  (HMAC of listing id + expiry, 30 minutes, httponly) and reveals the edit form.
- The password is the `sm_manage_password` **option**, defaulting to `abcd`. Change it with
  `update_option( 'sm_manage_password', '…' )` or the `sm_manage_password` filter. Wrong
  attempts are rate limited to 10 per hour per IP.
- The edit form is the posting form plus a **Status** selector (Available / Reserved / Sold), so a
  lot that is gone can be closed without deleting its history.
- **Delete** moves the listing to the WordPress trash (`wp_trash_post`), so it disappears from
  the market at once and can be restored from the admin.
- Editing fires the same cache purge as publishing.

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
| Duplicate listings | Resolved 2026-11-16 — the duplicate "PC BOTTLE SCRAP" was trashed; one listing remains |
| Case studies | Needs real project facts from the owner |

---

## 10. Changelog

### 2026-11-16 — Scrap Market 0.3.3: Facebook Page auto-publishing & Meta Graph API integration

**Features**
- Integrated official Meta Graph API with Facebook Page "Al Qaryan Industries LLC" (Page ID: `1383856674820826`).
- Automatic publishing on listing publish: uploads the high-res listing photo, grade/title, price, quantity, location, direct WhatsApp seller deep link, and website listing link.
- Added settings fields in `Settings → Scrap Market` (`fb_page_id`, `fb_token`, `fb_auto_post`).
- Added manual "📤 Post to Facebook" action in the admin listings table for instant syndication.
- Added 1-click Facebook share button on single listing pages alongside WhatsApp, Copy link, and Email.
- Packaged installer `dist/alqaryan-scrap-market-0.3.3.zip` and deployed live to production.

### 2026-11-16 — Scrap Market 0.3.2: unified compact topbar, full-bleed layout, collapsible search drawer

**UI & Layout**
- Merged the page heading ("Recycle Scrap Market") and the segmented section tabs ("All", "For Sale", "Need to Buy") into a single, compact top bar row with reduced padding and sleek pill counts.
- Converted the bulky permanent "Search and filter" second bar into a collapsible drawer toggled by a dedicated 🔍 "Search & Filter" button in the top bar. When closed, it is completely hidden, saving prime vertical space.
- Made the marketplace full-width and full-bleed (`max-width: 100% !important;`) across all desktop and mobile viewport sizes, eliminating wasted side margins.
- Expanded wide-screen rail card layout up to 5 columns on desktop displays (`min-width: 1560px: 20%`), maximizing product exposure.
- Packaged installer `dist/alqaryan-scrap-market-0.3.2.zip` and deployed live to production.

### 2026-11-16 — Scrap Market 0.3.1: WhatsApp link sanitization, Rank Math SEO filter, card CTA

**Fixes**
- Sanitized WhatsApp link numbers to strip leading `00` (e.g. `00971...` -> `971...`) and auto-prefix local UAE `05X` numbers to prevent WhatsApp mobile client "Invalid phone number" errors.
- Hooked `rank_math/frontend/description` and `rank_math/frontend/title` so single listing pages and archive views receive rich, descriptive SEO metadata instead of empty descriptions.
- Replaced the confusing `✎ Edit` link on public marketplace cards with a dedicated `💬 View Details & Contact →` action button. Listing owners can still manage/edit their lot from the single listing page.
- Bumped plugin version to 0.3.1 and rebuilt installer package `dist/alqaryan-scrap-market-0.3.1.zip`.

### 2026-11-16 — Scrap Market 0.3.0: minimal fields, owner editing, photo picker

**Fixes**
- The posting form rejected a title + name + number because material, quantity and description
  were still mandatory, and the redirect back wiped every field. Requirements are now title,
  name and one contact detail; rejection keeps the text (see §6).
- LiteSpeed cached the posting page and the manage view, so drafts and unlocked edit forms never
  reached the visitor. Both are excluded from the cache now.
- `/list-your-scrap/` rendered with no stylesheet at all: the enqueue check looked for a page slug
  that does not exist. It now matches the stored page ID.
- The archive card printed the material name directly above an identical title; it is only shown
  when the two differ.
- The duplicate "PC BOTTLE SCRAP" listing was removed and its stale URL dropped from the sitemap;
  a listing that changes state now purges the sitemaps too.

**New**
- **Edit and delete with the market password** (`?sm=manage`, cookie-signed session) — see §6.
- **Photo picker**: add several at once or one by one, shoot with the camera, crop each photo
  (free / 1:1 / 4:3 / 16:9 before upload), remove one or all.
- The edit form carries a Status selector so a sold lot can be closed without being deleted.

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
