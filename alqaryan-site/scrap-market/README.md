# Scrap Market — WordPress plugin

Adds a **Scrap Market** section to alqaryangroup.com: a listing post type, three
taxonomies, `Product`/`Offer` schema, IndexNow pings, and an image pipeline that
guarantees every stored photo is under 300 KB.

Phase 0 of the marketplace plan. Members, subscriptions and the VPS/Drive archive
are later phases.

## Why a plugin, not theme files

On 2026-11-02 a theme switch served the site as unstyled HTML for an hour. Anything
stored in the active Astra theme dies the same way. This lives in
`wp-content/plugins/` and survives any theme change.

## Install

1. WordPress admin → **Plugins → Add New → Upload Plugin**
2. Choose `dist/alqaryan-scrap-market-0.1.0.zip` → **Install Now** → **Activate**
3. WordPress will flush rewrite rules on activation, so `/scrap-market/` resolves
   straight away. If it 404s, go to **Settings → Permalinks → Save** once.

## Configure

**Settings → Scrap Market**

| Field | Value |
|---|---|
| IndexNow key | `f90e62ce9199ff70fd09452c4519dbf9` (the file already at the site root) |
| Archive endpoint (VPS) | leave as is — used from Phase 1 |
| Drive folder | `ScrapMarket` |
| Default seller / phone | pre-fills new listings |

**Rank Math → Sitemap Settings** — confirm *Scrap Market* is included. The plugin
also filters it out of Rank Math's exclusion list, but the sitemap checkbox is the
authority.

## Publish the first listing

**Scrap Market → Add Listing**

- Title: what a buyer would search, e.g. `HDPE Jerry Can Scrap — 24 MT, Jebel Ali`
- Main photo (right column): upload the JPG straight from a phone
- Listing details: grade, form, quantity, price, currency, per, basis, location
- Material / Region / Offer type: tick at least one of each
- Description: 2–4 sentences — the first 55 words become the meta description

On **Publish** the plugin pings IndexNow automatically. The publish box also shows
a **Submit to IndexNow** button and the HTTP result of the last ping.

## The 300 KB image pipeline

Every JPEG/PNG/WebP upload is re-encoded before WordPress stores it:

1. EXIF orientation applied, then **all EXIF stripped** — phone photos carry GPS
   coordinates, and a seller's yard location is not something to publish by accident
2. longest edge capped at 1600 px, never upscaled
3. encoded to WebP with a **binary search on quality** — it tries 65, then 80, then
   72… and keeps the highest quality that still fits under 300 KB
4. if even quality 35 is too large, it downscales and searches again

The **Photo check** box on each listing shows the stored file size and flags
anything over the ceiling. Settings → Scrap Market shows whether Imagick or GD is
driving it, and whether WebP is available on the host.

GIFs are left untouched so animations are not flattened.

## URLs

```
/scrap-market/                  archive + filters
/scrap-market/{slug}/           one listing
/scrap-market/material/hdpe/    taxonomy
/scrap-market/region/dubai/     taxonomy
/scrap-market/listing/sell/     taxonomy
```

## Search-engine behaviour

- Sold listings and listings past their expiry date **stay at their URL** but get
  `noindex` — history is preserved, dead stock leaves the index
- `Product` + `Offer` + `BreadcrumbList` on every listing, with the seller pointing
  at `https://alqaryangroup.com/#organization` so Google merges the marketplace into
  the company it already knows
- `ItemList` on archives
- Meta description falls back to the excerpt when Rank Math is not active

## Later phases (not in this build)

- Phase 1 — front-end submission form, camera capture, VPS compression + Drive archive
- Phase 2 — internal links from the material pages, filters, related listings
- Phase 3 — member accounts with a moderation queue
- Phase 4 — paid tiers via Stripe Payment Links

## Files

```
alqaryan-scrap-market.php   bootstrap, settings screen, asset enqueue
includes/cpt.php            post type, taxonomies, templates, admin columns
includes/fields.php         meta box, save handler, price/quantity labels
includes/media.php          the 300 KB compression pipeline
includes/schema.php         JSON-LD for listings and archives
includes/seo.php            noindex, description fallback, IndexNow
templates/                  archive + single, using get_header()/get_footer()
assets/scrap-market.css     uses the existing --q-* design tokens
```
