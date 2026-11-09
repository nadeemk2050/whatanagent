# Al Qaryan Industries — image plan

## Audit finding (2026-11-09)

Image optimisation was on the pipeline as "compress what is there". There is nothing to
compress. Measured across all 41 published pages and posts:

| Measure | Result |
|---|---|
| Published pages + posts scanned | 41 |
| Files in the WordPress media library | **3** |
| `<img>` tags on the entire site | **2** |
| Photos on `/facility/` | **0** |
| Photos on `/about/` | **0** |
| Photos on `/pvc-pipe-manufacturing/` | **0** |
| Photos on every `/materials/*` page | **0** |
| Photos on `/gallery/` | **1** |
| CSS background images | 0 |
| Inline SVG icons | 13–29 per page |
| Total image weight, whole site | 0.05 MB |

The single photo is `plant-shredder-line.webp` (374×320, 23 KB), used on the homepage and
the gallery. Page weight is 141–151 KB with one CSS and one JavaScript file — the site is
technically light because it is almost entirely text and vector icons.

So the step is **image coverage**, not image compression. A metal and plastics trading
house asking buyers for container lots, with two products of visual proof on 41 pages, is
leaving trust and Google Images traffic on the table. The gallery page currently says more
photographs are added "as they are taken" — that promise needs fulfilling.

---

## How to shoot them

Hand this section to whoever holds the phone.

1. **Send the originals.** Do not crop, resize or straighten first. Do not send through
   WhatsApp photo mode — it recompresses heavily. Use WhatsApp *document* mode, email, or
   Google Drive.
2. **Landscape, 4:3.** Hold the phone level. Use the main (rear) camera, not the selfie one.
3. **Daylight, no flash.** Nothing on this site should look staged. Overcast is fine.
4. **Wipe the lens** before starting — a dirty lens is the most common reason plant photos
   look cheap.
5. **Fill the frame.** Get close enough that the machine or material fills most of the shot.
   A wide shot of a shed with a machine somewhere in it is useless.
6. **Exclude people**, or get their permission first — a recognisable face needs consent.
   Nobody in shot is simpler and works fine.
7. **Hide what you don't want seen:** paperwork with customer names, vehicle plates,
   anything broken or untidy.
8. **Two shots minimum per subject** — one wide, one close — so there is a choice.

They come back at 3–5 MB each, which is correct. `scripts/optimise-images.mjs` turns each
into three WebP sizes (1600 / 900 / 450 wide), typically 4.3 MB → 162 KB, and prints
ready-to-paste `<img>` tags with `srcset`, `width`/`height` and `loading="lazy"`.

```
node scripts/optimise-images.mjs ./photos
node scripts/optimise-images.mjs ./photos --site alqaryangroup.com --upload
```

---

## The shot list

Priority 1 first — those six unblock the most pages.

### Priority 1 — trust on the pages that sell

| # | Filename | Page | What to shoot |
|---|---|---|---|
| 1 | `plant-exterior-gate` | `/`, `/facility/`, `/about/` | The gate or entrance, sign visible, level and straight on. Lets a foreign buyer confirm you are a real plant. |
| 2 | `shredder-running` | `/`, `/plastic-recycling/` | Shredder with material going in — action, not a parked machine. |
| 3 | `washing-line` | `/plastic-recycling/`, `/facility/` | Washing line with flake visible. |
| 4 | `pelletiser-output` | `/`, `/materials/` | Pellets coming out of the die, close enough to see colour and shape. |
| 5 | `pvc-pipe-extrusion-line` | `/pvc-pipe-manufacturing/` | An extrusion line running. This page currently has no proof you own lines. |
| 6 | `pvc-pipe-stack` | `/pvc-pipe-manufacturing/`, `/materials/pvc/` | Finished pipes stacked, ends facing camera so diameter and wall thickness read. |

### Priority 2 — one photo per material page

Each `/materials/*` page is text only and competes on the material name. A close-up of the
actual grade is the strongest possible relevance signal.

| # | Filename | Page | What to shoot |
|---|---|---|---|
| 7 | `hdpe-regrind-closeup` | `/materials/hdpe/` | HDPE regrind on a clean surface, raking light. |
| 8 | `ldpe-film-bales` | `/materials/ldpe/` | LDPE film bales, strapping visible. |
| 9 | `pp-woven-sacks` | `/materials/pp/` | PP woven sacks or raffia feedstock. |
| 10 | `pet-washed-flake` | `/materials/pet/` | PET washed flake — the whiteness is the selling point. |
| 11 | `pvc-regrind-compound` | `/materials/pvc/` | PVC regrind or compound. |
| 12 | `abs-ps-housings` | `/materials/abs-ps/` | ABS/PS appliance or electronics housings, baled or loose. |

### Priority 3 — the proof a buyer actually asks for

| # | Filename | Page | What to shoot |
|---|---|---|---|
| 13 | `warehouse-grades` | `/facility/`, `/gallery/` | Bags or boxes of different grades, labelled, in the warehouse. |
| 14 | `container-loading` | `/`, `/gallery/` | Material being loaded into a container or truck. Answers "can you actually ship?" |
| 15 | `lab-testing` | `/quality/` | Someone testing material — moisture meter, melt flow, or a bench with samples. |
| 16 | `iso-certificates-framed` | `/quality/` | The ISO 9001 and ISO 14001 certificates on the wall. Blur any certificate numbers you don't want public. |
| 17 | `weighbridge` | `/we-buy/` | A truck on the weighbridge. Speaks directly to sellers of scrap. |
| 18 | `bales-for-sale` | `/we-buy/` | Bales ready to buy, so sellers see the material has a home. |

### Priority 4 — fills the gallery

| # | Filename | What to shoot |
|---|---|---|
| 19 | `team-office` | Two or three people working, faces not required (over-shoulder works). |
| 20 | `delivery-truck` | Loaded truck leaving the gate. |
| 21 | `quality-samples` | Sample bags laid out with grade labels. |
| 22 | `plant-aerial` | The site from a high point or the roof, to show scale. |
| 23 | `machine-detail` | Any close-up of a screw, die head or blade — texture shots lift a gallery. |
| 24 | `night-shift` | The plant lit at night. Distinctive, and nothing competitors post. |

---

## Google Business Profile photos

The same Priority 1 set goes to the GBP — that profile has **15 views** and no photo
activity, which is itself a ranking factor. After the first upload, add one or two photos
per week indefinitely. Rotate through: exterior, interior, product, at-work, team.

---

## What to do with the files

1. Put originals in a folder, e.g. `photos/`.
2. Run `node scripts/optimise-images.mjs ./photos`.
3. Review `alqaryan-site/build/img/snippets.html` and the sizes in `manifest.json`.
4. Either upload through WP Media and paste the snippets into the page content yourself, or
   run with `--upload` and paste the rewritten snippets.
5. Set the featured image on each page from the 1600px file so social shares and schema
   carry a real photo.

Alt text is generated from the filename, so **name the files sensibly before running** —
`hdpe-regrind-closeup.jpg` becomes "hdpe regrind closeup — Al Qaryan Industries, Shershah
Industrial Area, Karachi". Rewrite any that read badly.

---

## Do not do

- **Do not use stock photography.** The gallery page promises "no stock imagery". Breaking
  that promise on a scrap-trading site is worse than having fewer photos.
- **Do not enlarge** the existing 374×320 photo to fill a hero slot — it will look soft.
  Shoot a new one.
- **Do not add images without `width` and `height`** — they cause layout shift, which counts
  against Core Web Vitals. The generated snippets include both.
- **Do not set `loading="eager"`** on anything except one above-the-fold image per page.
