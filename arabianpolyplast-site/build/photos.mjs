// Turn a folder of camera originals into web-ready photos for this site.
//
//   node build/photos.mjs                 (reads ./photos, writes ./src/photos)
//
// Name each file after the page it belongs to, so no mapping file is needed:
//   photos/hero.jpg                    the homepage hero
//   photos/pet-bottle-scrap.jpg        that material page
//   photos/yard.jpg, photos/loading.jpg any other page-free shot
//
// For every input you get three WebP files and a manifest entry:
//   <name>-1600.webp   hero / full width
//   <name>-900.webp    in-page
//   <name>-450.webp    cards
// The originals stay where they are; commit src/photos so the deploy needs no
// image tooling. Re-running replaces the outputs, so it is safe to repeat.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IN = path.join(ROOT, 'photos');
const OUT = path.join(ROOT, 'src', 'photos');
const WIDTHS = [1600, 900, 450];
const EXT = /\.(jpe?g|png|tiff?|webp|avif)$/i;

if (!fs.existsSync(IN)) {
  console.log('No ./photos folder yet — nothing to do.');
  console.log('Create arabianpolyplast-site/photos/ and drop the originals in, then run this again.');
  process.exit(0);
}

const files = fs.readdirSync(IN).filter(f => EXT.test(f));
if (!files.length) {
  console.log('photos/ exists but holds no images (jpg, png, tiff, webp, avif).');
  process.exit(0);
}

fs.mkdirSync(OUT, { recursive: true });

const manifest = {};
let before = 0;
let after = 0;

for (const file of files) {
  const name = path.basename(file, path.extname(file)).toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  const input = path.join(IN, file);
  before += fs.statSync(input).size;

  const image = sharp(input, { failOn: 'error' }).rotate();
  const meta = await image.metadata();
  const outputs = [];

  for (const w of WIDTHS) {
    const target = path.join(OUT, `${name}-${w}.webp`);
    const info = await sharp(input).rotate()
      .resize({ width: w, withoutEnlargement: true })
      .webp({ quality: 78, effort: 5 })
      .toFile(target);
    outputs.push({ width: info.width, height: info.height, bytes: info.size, file: `${name}-${w}.webp` });
    after += info.size;
  }

  manifest[name] = {
    source: file,
    original: { width: meta.width, height: meta.height, bytes: fs.statSync(input).size },
    variants: outputs
  };

  const big = outputs[0];
  console.log(`${file.padEnd(34)} ${Math.round(fs.statSync(input).size / 1024)} KB → ${Math.round(big.bytes / 1024)} KB (${big.width}×${big.height})`);
}

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log('');
console.log(`${files.length} photo(s) · ${Math.round(before / 1024)} KB in → ${Math.round(after / 1024)} KB out across ${WIDTHS.length} sizes`);
console.log('Written to src/photos — commit that folder and the pages pick the images up on the next build.');
