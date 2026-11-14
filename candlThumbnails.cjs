// Thumbnail generator — converts images & PDFs into small WebP thumbnails.
// Uses @napi-rs/canvas (NAPI → works in Node, Electron, SEA) + pdfjs-dist
// (legacy build renders the PDF first page). Re-encoding to WebP automatically
// strips all EXIF/comment/camera metadata (source metadata is not copied).
//
// Spec: 250x250 max dimension (fit-inside, aspect preserved), WebP @ 72 quality.
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const THUMB_MAX = 250;          // max width/height in px
const THUMB_QUALITY = 72;       // WebP quality 70-75%

// Minimal DOM shims required by pdfjs-dist when running in Node (no browser).
function ensurePdfDomShims() {
  if (typeof globalThis.DOMMatrix === 'undefined') {
    globalThis.DOMMatrix = class DOMMatrix {
      constructor(init) {
        if (init && init.a !== undefined) { this.a = init.a; this.b = init.b; this.c = init.c; this.d = init.d; this.e = init.e; this.f = init.f; }
        else { this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0; }
        this.m11 = this.a; this.m12 = this.b; this.m21 = this.c; this.m22 = this.d; this.m41 = this.e; this.m42 = this.f;
      }
      multiply() { return this; } translate() { return this; } scale() { return this; }
      rotate() { return this; } inverse() { return this; } flipX() { return this; }
      flipY() { return this; } transformPoint() { return this; } setMatrixValue() { return this; }
    };
  }
  if (typeof globalThis.DOMPoint === 'undefined') {
    globalThis.DOMPoint = class DOMPoint { constructor(x = 0, y = 0) { this.x = x; this.y = y; } matrixTransform() { return this; } };
  }
  if (typeof globalThis.Path2D === 'undefined') {
    globalThis.Path2D = class Path2D { constructor(p) { this.p = p; } moveTo() {} lineTo() {} bezierCurveTo() {} closePath() {} rect() {} arc() {} };
  }
  if (typeof globalThis.ImageData === 'undefined') {
    globalThis.ImageData = class ImageData { constructor(w, h) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); } };
  }
}

// Cache generated thumbnails (in-memory LRU) so repeated grid loads are instant.
const cache = new Map();
const CACHE_MAX = 300;
function cacheSet(key, buf) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, buf);
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
}

function isPdf(buf) {
  return buf && buf.length > 4 &&
    buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46; // %PDF
}

async function imageThumb(buf) {
  const img = await loadImage(buf);
  const scale = Math.min(1, THUMB_MAX / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toBuffer('image/webp', THUMB_QUALITY);
}

let pdfjsPromise = null;
async function pdfThumb(buf) {
  ensurePdfDomShims();
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  }
  const pdfjs = await pdfjsPromise;
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buf),
    // Points pdfjs at the bundled standard-font + cmap data so embedded fonts
    // render correctly (falls back gracefully when the folders are absent).
    standardFontDataUrl: require('path').join(__dirname, 'node_modules', 'pdfjs-dist', 'standard_fonts') + '/',
    cMapUrl: require('path').join(__dirname, 'node_modules', 'pdfjs-dist', 'cmaps') + '/',
    cMapPacked: true,
  }).promise;
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(1, THUMB_MAX / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.max(1, Math.floor(viewport.width)), Math.max(1, Math.floor(viewport.height)));
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  try { await doc.destroy(); } catch (e) {}
  return canvas.toBuffer('image/webp', THUMB_QUALITY);
}

/**
 * Generate a WebP thumbnail from an image or PDF buffer.
 * Returns { buffer, type } or null when the input can't be processed.
 */
async function makeThumbnail(buffer) {
  if (!buffer || !buffer.length) return null;
  try {
    if (isPdf(buffer)) return { buffer: await pdfThumb(buffer), type: 'image/webp' };
    return { buffer: await imageThumb(buffer), type: 'image/webp' };
  } catch (e) {
    console.warn('[Thumbnails] generation failed:', e && e.message);
    return null;
  }
}

function thumbCacheGet(key) { return cache.get(key) || null; }
function thumbCacheSet(key, thumb) { if (thumb) cacheSet(key, thumb); }
// Invalidate on delete/replace, otherwise a deleted photo keeps rendering from the
// in-memory cache until it is evicted.
function thumbCacheDelete(key) { return cache.delete(key); }

module.exports = { makeThumbnail, thumbCacheGet, thumbCacheSet, thumbCacheDelete, isPdf, THUMB_MAX, THUMB_QUALITY };
