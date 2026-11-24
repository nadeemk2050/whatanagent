# Photos — drop zone

Put camera originals in this folder, run one command, and the site uses them.

```bash
node build/photos.mjs      # writes src/photos/*.webp + manifest.json
node build/build-site.mjs  # rebuild
```

## How to name the files

The filename decides where the photo appears. Lowercase, hyphens, any size:

| File | Where it goes |
|---|---|
| `hero.jpg` | the homepage hero, beside the headline |
| `pet-bottle-scrap.jpg` | that material page, full width under the title |
| `hdpe100-scrap.jpg`, `pvc-pipe-scrap.jpg`, … | any material slug on the site |

Current slugs: `pet-bottle-scrap`, `pet-flakes`, `pet-preform-scrap`, `pet-sheet-scrap`,
`hdpe-scrap`, `hdpe100-scrap`, `hdpe-pipes-scrap`, `pvc-scrap`, `pvc-pipe-scrap`,
`upvc-profile-scrap`, `pp-scrap`, `ldpe-film`, `pc-bottle-scrap`, `aluminium-scrap`, `iron-scrap`.

Any other name is optimised but unused — useful later for an about or gallery page.

## What the script does

- Auto-rotates by EXIF, so phone photos come out upright.
- Writes WebP at **1600 / 900 / 450** px wide, quality 78 — typically 80–95 % smaller.
- Records real dimensions in `manifest.json`, so `<img width height>` is correct and the
  page does not jump while loading (CLS stays at 0).
- Originals stay in `photos/` and are git-ignored; only the WebP output is committed.

## What to shoot

Yard and gate, baled PET by colour, HDPE drums, PE100 pipe coils, PVC pipe bundles,
UPVC window offcuts, LDPE film bales, aluminium profiles, HMS steel, a loaded container.
Daylight, no filter, no people's faces without permission, 3–8 photos per material is plenty.

When the files are in place, tell the agent and the alt text, `image-optimisation` and
`alt-text` steps get closed with the real numbers.
