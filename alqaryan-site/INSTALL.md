# Al Qaryan Industries — website kit

Everything in this folder builds the new `alqaryangroup.com` site. The pages are written,
structured, internally linked and carry their own schema. Nothing here needs phpMyAdmin,
FTP, or a page builder.

## What is in `dist/`

| File | What it is |
|---|---|
| `alqaryan-content.wxr` | All 22 pages + the top menu, ready to import into WordPress |
| `alqaryan-design.css` | The whole design system (paste once, in Additional CSS) |
| `preview/` | Standalone HTML previews of every page — open `index.html` in a browser |

## Rebuild after editing

```
node build/build-wxr.mjs        # regenerates dist/alqaryan-content.wxr
node build/build-preview.mjs    # regenerates dist/preview/*.html
```

Content lives in `build/content-pages.mjs`. One object per page. Edit the HTML there,
rebuild, re-import.

---

# Install — in this exact order

Log into the **new WordPress site first** (the temporary domain / `new.alqaryangroup.com`).
Never do these steps on the live domain.

### 1. Theme
Appearance → Themes → Add New → search **Astra** → Install → **Activate**.
Astra is chosen because it is light, maintained, and gives us full control through CSS.

### 2. URLs
Settings → **Permalinks** → select **Post name** → Save Changes.
This must be done **before** importing, otherwise the page addresses come out as `?page_id=123`.

### 3. Site details
Settings → General:
- Site Title: `Al Qaryan Industries`
- Tagline: `Plastic recycling, polymer trading and PVC pipes — Karachi, Pakistan`
- Timezone: **Karachi**
- Site Language: **English (United States)**

### 4. Clean out the demo content
Pages → delete **Sample Page**.
Posts → delete **Hello world!**.
Plugins → delete **Hello Dolly** and **Akismet** (both unused).

### 5. Import the pages
Tools → **Import** → **WordPress** → *Install Now* → *Run Importer* →
choose `dist/alqaryan-content.wxr` → **Upload file and import** →
assign posts to your user → **Submit**.

You should end up with 22 pages and a menu called **Primary**.

### 6. Homepage
Settings → **Reading** → *Your homepage displays* → **A static page** →
Homepage: **Home** → Save.

### 7. Menu
Appearance → **Menus** → select the **Primary** menu →
tick **Primary Menu** under *Display location* → Save.

*(If the menu imported empty, add these pages in this order: About Us · Services · Materials ·
We Buy Plastic Scrap · Our Facility · Quality & Certifications · Contact Us.)*

### 8. Design
Appearance → **Customize** → **Additional CSS** → paste the entire contents of
`dist/alqaryan-design.css` → **Publish**.

This styles everything and also hides Astra's own page title, so each page keeps the single
`<h1>` written in its content (no duplicate headings).

### 9. SEO plugin
Plugins → Add New → **Rank Math SEO** → Install → Activate →
**skip** the setup wizard (choose "Advanced Mode" only if you want the extra modules).
Then:
- Rank Math → **Titles & Meta** → Local SEO: turn on, and fill in exactly:
  - Name: `Al Qaryan Industries LLC`
  - Address: `Shershah Industrial Area, Karachi, Sindh, Pakistan`
  - Phone: `+92 333 201 0506`
  - Email: `info@alqaryangroup.com`
- Rank Math → **Sitemap Settings**: sitemaps ON, pages included.

The same `#organization` ID is used by the schema written inside the pages, so Google merges
them into one company rather than creating two. Keep the name/phone/address identical.

### 10. Speed (Hostinger shared is LiteSpeed)
Plugins → Add New → **LiteSpeed Cache** → Install → Activate →
LiteSpeed Cache → Presets → **Advanced** → Apply. Leave the rest at defaults.

### 11. Keep the site hidden while it is on the temporary domain
Settings → **Reading** → tick **Discourage search engines from indexing this site**.
**Un-tick it on go-live day** — this is the most commonly forgotten step in the whole process.

---

# Go-live checklist (do not skip)

1. Read every page once with a phone in your hand, not a desktop. Fix wording that sounds wrong.
2. Point `alqaryangroup.com` at the new hosting, then confirm:
   - `https://alqaryangroup.com` loads the new site
   - `https://www.alqaryangroup.com` redirects to it
   - SSL padlock is valid
3. **Redirects** (Rank Math → Redirections → add these two):

| Source | Destination | Type |
|---|---|---|
| `/trading-and-recycling-al-qaryan-groups-commitment-to-a-greener-future` | `/sustainability/` | 301 |
| `/sustainable-trading-al-qaryan-groups-commitment-to-a-greener-future` | `/sustainability/` | 301 |

4. Un-tick *Discourage search engines*.
5. Google Search Console → add/verify the property → submit `https://alqaryangroup.com/sitemap_index.xml`.
6. Google Business Profile → create **Al Qaryan Industries LLC** at the Shershah address with
   the same phone and spelling. Then ask 10 real customers for a review.

---

# Still needed from the owner (it cannot be invented)

| Item | Where it goes |
|---|---|
| 10–20 real photos: facility, shredder, washing line, pelletiser, pipe extrusion, bales, regrind, loading, warehouse, team | Home, Facility, each material page |
| Certificate numbers + issuing body + expiry for ISO 9001, ISO 14001, REACH, SGS | Quality page |
| Actual pipe sizes and pressure classes on the two lines | PVC pipe manufacturing page |
| Real MFI / density ranges per grade | Material pages (currently described as "agreed per lot") |
| `info@alqaryangroup.com` mailbox (or SMTP service) | Contact page + enquiry delivery |
| Opening hours | Contact page |
| Whether Eco Pipe Industries is a separate brand | Keyword split with `ecohdpepipe.com` |

The copy is deliberately written so that nothing false is claimed while those are missing.
