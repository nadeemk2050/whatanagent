# Scrap Market — WordPress plugin

Adds the **Recycle Scrap Market** to alqaryangroup.com: a public market page with a
*For Sale* / *Need to Buy* switch, search and facets, listing pages with WhatsApp
enquiry, free posting by visitors, a review queue, `Product`/`Demand` schema, IndexNow
pings, and an image pipeline that guarantees every stored photo is under 300 KB.

## What the page does

```
/scrap-market/                 the market — switch, search, material/region/quantity facets, sort
/scrap-market/?kind=sell       For Sale only
/scrap-market/?kind=buy        Need to Buy only
/scrap-market/{slug}/          one listing: gallery, price bar, WhatsApp, enquiry form, related lots
/scrap-market/material/hdpe/   material view
/scrap-market/region/uae/      region view
/list-your-scrap/              the free posting form ([scrap_market_post])
```

Every filter is a plain GET parameter, so a filtered view is a real URL that can be sent
on WhatsApp or indexed, and the whole page works with JavaScript switched off. JS only
adds the photo switcher, the copy-link button and a localStorage shortlist.

## Posting

Posting is open by design — no account, no fee. Four cheap controls replace a login:

1. a honeypot field only a bot fills in
2. a minimum of three seconds on the form
3. a per-IP limit of 5 posts an hour (and 20 reports an hour)
4. a nonce, so the form cannot be posted from another site

Duplicates of the same title from the same IP inside an hour are dropped.

Only **three things are required**: the title, the poster's name, and a WhatsApp number *or* an
email. Material, quantity, description, price, region and photos are optional — a lot can go
live with a name and a number and be completed later from the edit form.

A rejected submission keeps what was typed: the form posts with `fetch` when JavaScript is
available, and without it the text is stashed in a short-lived transient and re-filled on the
way back.

### Photos

Up to five per listing, added one at a time or all at once, chosen from the gallery or taken
with the phone camera (`capture="environment"`). Each photo can be **cropped** in the browser
(free, 1:1, 4:3, 16:9) before it is queued, and each one can be removed again — or all of them.
The queued files are written back into the real `sm_photos[]` input through a `DataTransfer`,
so a plain form post still carries them. Server side they go through the 300 KB pipeline.

### Editing and deleting a listing

No accounts: a shared password is the permission model.

- Entry points are `?sm=manage` — the "Posted this lot? Edit or delete it" link on a listing and
  the `✎ Edit` link on each card.
- The password form sets a signed `sm_manage` cookie (HMAC of the listing id and an expiry, 30
  minutes, httponly, SameSite=Lax). Wrong attempts are limited to 10 an hour per IP.
- The password is the `sm_manage_password` option, default `abcd`; override it with
  `update_option( 'sm_manage_password', '…' )` or the `sm_manage_password` filter.
- The edit form is the posting form plus a **Status** selector (Available / Reserved / Sold).
- Delete calls `wp_trash_post()`, so the listing leaves the market immediately and can still be
  restored from the WordPress trash.

### Caching

`/list-your-scrap/` and any listing viewed with `?sm=manage`, `?sm_msg` or an owner cookie send
`litespeed_control_set_nocache` and `nocache_headers()`, because they carry a nonce and
per-visitor state. Everything else stays cached; a listing that changes state purges the
archive, the listing and both sitemaps.

**Settings → Scrap Market** decides whether a new listing goes live immediately (default)
or into the review queue. The queue lives at **Scrap Market → Review queue** and also
collects every listing a visitor reported. Row actions: Approve, Dismiss report, Trash.

## Why a plugin, not theme files

On 2026-11-02 a theme switch served the site as unstyled HTML for an hour. Anything
stored in the active Astra theme dies the same way. This lives in
`wp-content/plugins/` and survives any theme change.

## Install

1. WordPress admin → **Plugins → Add New → Upload Plugin**
2. Choose `dist/alqaryan-scrap-market-0.3.8.zip` → **Install Now** → **Activate**
3. Activation flushes rewrite rules, so `/scrap-market/` resolves straight away. If it
   404s, go to **Settings → Permalinks → Save** once.

The posting page exists as a draft (`/list-your-scrap/`) — publish it once the plugin is
active.

## Configure

**Settings → Scrap Market**

| Field | Value |
|---|---|
| IndexNow key | `f90e62ce9199ff70fd09452c4519dbf9` (already served at the site root) |
| Facebook Page ID | Page ID for Al Qaryan Industries LLC |
| Facebook Page token | A **long-lived Page** token with `pages_manage_posts`. Use a Business Manager System User token (never expires) — a normal user token dies after ~60 days. Use **Test Facebook connection** after saving. |
| Archive endpoint (VPS) | leave as is — used for the Drive archive |
| Drive folder | `ScrapMarket` |
| Default seller / phone | pre-fills new listings |
| Public posting | on — turn off to close the market to outside posts |
| New listing goes | live immediately, or into the review queue |

**Rank Math → Sitemap Settings** — confirm *Scrap Market* is included. The plugin also
filters it out of Rank Math's exclusion list, but the sitemap checkbox is the authority.

## Publish the first listing

**Scrap Market → Add Listing**

- Title: what a buyer would search, e.g. `HDPE Jerry Can Scrap — 24 MT, Jebel Ali`
- Main photo (right column): upload the JPG straight from a phone
- Listing details: grade, form, quantity, price, currency, per, basis, location
- Material / Region / Offer type: tick at least one of each
- Description: 2–4 sentences — the first 55 words become the meta description

On **Publish** the plugin pings IndexNow automatically. The publish box also shows a
**Submit to IndexNow** button and the HTTP result of the last ping.

## The 300 KB image pipeline

Every JPEG/PNG/WebP upload — admin or front-end — is re-encoded before WordPress stores it:

1. EXIF orientation applied, then **all EXIF stripped** — phone photos carry GPS
   coordinates, and a seller's yard location is not something to publish by accident
2. longest edge capped at 1600 px, never upscaled
3. encoded to WebP with a **binary search on quality** — it tries 65, then 80, then 72…
   and keeps the highest quality that still fits under 300 KB
4. if even quality 35 is too large, it downscales and searches again

GIFs are left untouched so animations are not flattened.

## Search-engine behaviour

- Sold listings and listings past their expiry date **stay at their URL** but get
  `noindex` — history is preserved, dead stock leaves the index
- `Product` + `Offer` + `BreadcrumbList` on a *For Sale* listing; a *Need to Buy* listing
  emits `Demand` instead, so a buyer's budget is never published as a price
- `ItemList` on archives
- Meta description falls back to the excerpt when Rank Math is not active

## Later phases (not in this build)

- Phase 2 — links from the material pages into matching listings, saved searches
- Phase 3 — member accounts, so a seller can edit their own listing
- Phase 4 — paid featured listings via Stripe Payment Links
- Phase 5 — VPS compression + permanent Drive archive for photos

## Files

```
alqaryan-scrap-market.php   bootstrap, settings screen, asset enqueue
includes/cpt.php            post type, taxonomies, term seeding, templates, admin columns
includes/fields.php         meta box, save handler, price/quantity labels
includes/query.php          kind switch, search, facets, sorting, market template
includes/submission.php     public posting form, anti-spam, report handler
includes/queue.php          review queue (pending + reported), approve/dismiss/trash
includes/media.php          the 300 KB compression pipeline
includes/schema.php         JSON-LD for listings and archives
includes/seo.php            noindex, description fallback, IndexNow
templates/                  archive + single, using get_header()/get_footer()
assets/scrap-market.css     uses the existing --q-* design tokens
assets/scrap-market.js      gallery switcher, copy link, localStorage shortlist
```
