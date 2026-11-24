// Generate the square profile logo the trade directories want (512×512 PNG).
//   node build/logo.mjs  →  src/logo-512.png
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0f4c5c"/>
      <stop offset="1" stop-color="#146a4a"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#g)"/>
  <rect x="106" y="56" width="300" height="300" rx="72" fill="#ffffff" fill-opacity="0.10"
        stroke="#ffffff" stroke-opacity="0.45" stroke-width="4"/>
  <text x="256" y="238" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="132"
        font-weight="700" fill="#ffffff" text-anchor="middle" letter-spacing="4">AP</text>
  <text x="256" y="418" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="34"
        font-weight="600" fill="#ffffff" text-anchor="middle" letter-spacing="1">ARABIAN POLYPLAST</text>
  <text x="256" y="458" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="22"
        fill="#9fe0c4" text-anchor="middle" letter-spacing="3">SCRAP · OMAN</text>
</svg>`;

await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(path.join(ROOT, 'src', 'logo-512.png'));

// A 1200×630 banner for the wider directory headers, matching the og card.
const banner = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="b" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0f4c5c"/>
      <stop offset="1" stop-color="#146a4a"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#b)"/>
  <rect x="72" y="96" width="120" height="120" rx="30" fill="#ffffff" fill-opacity="0.12"
        stroke="#ffffff" stroke-opacity="0.45" stroke-width="3"/>
  <text x="132" y="182" font-family="Segoe UI, Arial, sans-serif" font-size="58" font-weight="700"
        fill="#ffffff" text-anchor="middle">AP</text>
  <text x="224" y="160" font-family="Segoe UI, Arial, sans-serif" font-size="44" font-weight="700"
        fill="#ffffff">Arabian Polyplast</text>
  <text x="224" y="200" font-family="Segoe UI, Arial, sans-serif" font-size="24"
        fill="#9fe0c4">Trading LLC · Barka, Sultanate of Oman</text>
  <text x="72" y="330" font-family="Segoe UI, Arial, sans-serif" font-size="46" font-weight="700"
        fill="#ffffff">Buyers, suppliers and exporters of</text>
  <text x="72" y="386" font-family="Segoe UI, Arial, sans-serif" font-size="46" font-weight="700"
        fill="#ffffff">plastic and metal scrap</text>
  <text x="72" y="450" font-family="Segoe UI, Arial, sans-serif" font-size="25"
        fill="#ffffff" fill-opacity="0.88">PET · PC · HDPE · HDPE 100 · PVC · UPVC · PP · LDPE · aluminium · iron</text>
  <text x="72" y="530" font-family="Segoe UI, Arial, sans-serif" font-size="26"
        fill="#f0c27a">arabianpolyplast.com · +968 7694 2126</text>
</svg>`;

await sharp(Buffer.from(banner)).png({ compressionLevel: 9 }).toFile(path.join(ROOT, 'src', 'banner-1200.png'));

console.log('Wrote src/logo-512.png and src/banner-1200.png');
