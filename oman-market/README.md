# Oman Scrap Market — market.arabianpolyplast.com

A listings market for plastic and metal scrap in Oman, run by Arabian Polyplast Trading
LLC (CR 1577463, Barka). Separate app from the marketing site in the repo root: the main
site stays static on Cloudflare Pages, this one runs as a SvelteKit worker.

## Stack

| Layer | Choice |
|---|---|
| Framework | SvelteKit 3 (Svelte 5, runes), server-rendered |
| Runtime | Cloudflare Workers (`@sveltejs/adapter-cloudflare`) |
| Local runtime | Node (`@sveltejs/adapter-node`) — used by `npm test` |
| Data | `src/lib/data/listings.json` today; the same functions are the seam for D1 later |
| Photos | none yet; `photos[]` is already in the model for R2 URLs |

## Commands

```bash
npm install
npm run dev            # local dev server
npm test               # builds with the Node adapter, boots it, runs 30 assertions
npm run build          # Node build (dist-like output in build/)
npm run build:cloudflare   # Worker build for deployment
```

`npm test` checks the things that matter for a market: every page returns 200, the
canonical URLs are right, `Product` / `Offer` / `ItemList` / `BreadcrumbList` JSON-LD is
in the server-rendered HTML, no invented prices are published, `robots.txt` allows the AI
crawlers, `sitemap.xml` lists the listings and never `/search`, a missing listing is a
404, and a category with no live stock is a 404 too.

## Routes

| Path | What it is |
|---|---|
| `/` | Latest listings + materials with live stock |
| `/materials` | Only materials that have at least one live listing |
| `/materials/<material>` | Category page, 404 when empty |
| `/listing/<slug>` | One listing: quantity, packing, location, terms, WhatsApp CTA |
| `/search?q=` | Search — deliberately `noindex, follow` |
| `/sitemap.xml` | Generated from the catalogue, `lastmod` per listing |
| `/robots.txt` | Allows GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Bingbot… |
| `/llms.txt` | Market facts + every material and live listing with its URL |

## Publishing flow (phase 2)

Until the posting form lands, a listing is published by adding it to
`src/lib/data/listings.json` and committing. That rebuilds the sitemap, so Google sees a
fresh `lastmod`, and the deploy pings IndexNow. Phase 2 replaces this with:

1. post form → moderation queue → D1 insert
2. on approve: regenerate the sitemap, ping IndexNow, send the URL to Bing's
   `SubmitUrlBatch` (see `scripts/bing-submit.mjs` in the app repo)

## Deploy

`wrangler.jsonc` at the root of this folder defines the Worker:

```jsonc
"name": "oman-scrap-market",
"routes": [{ "pattern": "market.arabianpolyplast.com", "custom_domain": true }]
```

`.github/workflows/market.yml` in the repo root builds with
`MARKET_TARGET=cloudflare` and runs `wrangler deploy` with the repository's
`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`. With `custom_domain: true`, Cloudflare
creates the DNS record for the subdomain on the first successful deploy, so no dashboard
step is needed — the zone is already on Cloudflare.

If the deploy fails with a permissions error, the token needs **Workers Scripts: Edit**
and **Zone → DNS: Edit** for `arabianpolyplast.com`.

## The rules this app enforces

- A category page exists only when it has live stock — no thin pages.
- A listing without a price says "quote per load" instead of a made-up number; no `Offer`
  is emitted without a real price.
- Listings carry `expiresAt` and disappear (404) when the date passes, so the index never
  fills with dead pages.
- `/search` and any filtered view are `noindex, follow`.
