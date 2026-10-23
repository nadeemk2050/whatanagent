// ============================================================================
// 🖼️ MEDIA PREP — shrink WhatsApp media BEFORE it is uploaded to the AI
// ============================================================================
// Render bills "Service-Initiated" egress = every byte our server sends out.
// WhatsApp photos arrive at full resolution (often 2–5 MB) and were being
// base64-encoded as-is (×1.33 inflation) for the vision model — on up to three
// code paths per message (primary, retry, fallback). That is what pushed the
// monthly usage to ~19 GB.
//
// We downscale ONCE here, at download time, so every downstream call site
// inherits the small buffer with no changes: 4 MB photo → ~150–250 KB (≈95% less).
//
// Fails safe: if the image processor is unavailable or a file cannot be read,
// we fall back to size caps instead of breaking the reply.
// ============================================================================

// Tunable without a code change: OCR of invoice/document photos needs more pixels
// than a chat photo. 1536px keeps small print readable and still saves ~94%.
function envInt(name, def, lo, hi) {
  const v = Number(process.env[name]);
  if (!Number.isFinite(v) || v <= 0) return def;
  return Math.min(hi, Math.max(lo, Math.round(v)));
}

export const MEDIA_LIMITS = {
  maxEdgePx: envInt('MEDIA_MAX_EDGE_PX', 1536, 640, 2048),
  jpegQuality: envInt('MEDIA_JPEG_QUALITY', 80, 40, 95),
  maxImageBytes: 1 * 1024 * 1024,   // if an image is STILL bigger, do not upload it
  maxAudioBytes: 8 * 1024 * 1024,   // long voice notes are not worth the egress
  maxDocBytes: 5 * 1024 * 1024
};

export const mediaStats = {
  images: 0,
  resized: 0,
  bytesIn: 0,
  bytesOut: 0,
  skipped: 0,
  failures: 0
};

let sharpLib = null;
let sharpState = 'pending';       // pending | ready | failed

async function loadSharp() {
  if (sharpState === 'ready') return sharpLib;
  if (sharpState === 'failed') return null;
  try {
    const mod = await import('sharp');
    sharpLib = mod.default || mod;
    sharpState = 'ready';
    return sharpLib;
  } catch (e) {
    sharpState = 'failed';
    console.warn('[MEDIA] image processor unavailable — using size caps only: ' + (e.message || e).toString().slice(0, 140));
    return null;
  }
}

export function mediaPrepReport() {
  const kb = (n) => Math.round(n / 1024);
  const saved = Math.max(0, mediaStats.bytesIn - mediaStats.bytesOut);
  return {
    images: mediaStats.images,
    resized: mediaStats.resized,
    skipped: mediaStats.skipped,
    failures: mediaStats.failures,
    uploadedKB: kb(mediaStats.bytesOut),
    originalKB: kb(mediaStats.bytesIn),
    savedKB: kb(saved),
    savedPercent: mediaStats.bytesIn > 0 ? Math.round((saved / mediaStats.bytesIn) * 100) : 0,
    processor: sharpState,
    limits: MEDIA_LIMITS
  };
}

// Self-test: proves the image processor really works in this runtime (e.g. after a
// deploy, so you are not relying on the lazy load to find out the hard way).
export async function mediaSelfTest() {
  const sharp = await loadSharp();
  if (!sharp) {
    return { ok: false, processor: sharpState, reason: 'image processor not available — media will only be size-capped' };
  }
  try {
    const w = 1600, h = 1200;
    const raw = Buffer.alloc(w * h * 3);
    for (let i = 0; i < raw.length; i++) raw[i] = (i * 37) & 255;
    const original = await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();

    const res = await prepareMediaForAi(original, 'image/jpeg', 'image');
    const meta = await sharp(res.buffer).metadata();
    return {
      ok: res.changed && res.buffer.length < original.length,
      processor: sharpState,
      originalKB: Math.round(original.length / 1024),
      resultKB: Math.round(res.buffer.length / 1024),
      reductionPercent: Math.round((1 - res.buffer.length / original.length) * 100),
      dimensions: meta.width + 'x' + meta.height,
      mimetype: res.mimetype
    };
  } catch (e) {
    return { ok: false, processor: sharpState, reason: (e.message || String(e)).slice(0, 200) };
  }
}

// Returns { buffer, mimetype, mediaType, changed, skipped, note }
export async function prepareMediaForAi(buffer, mimetype, mediaType) {
  const untouched = { buffer, mimetype, mediaType, changed: false, skipped: false, note: '' };
  if (!buffer || !buffer.length) return untouched;

  if (mediaType === 'image') {
    const sharp = await loadSharp();

    if (!sharp) {
      if (buffer.length > MEDIA_LIMITS.maxImageBytes) {
        mediaStats.skipped++;
        return { ...untouched, skipped: true, note: 'image too large and no image processor available' };
      }
      return untouched;
    }

    try {
      const img = sharp(buffer, { failOn: 'none', limitInputPixels: 100 * 1000 * 1000 });
      const meta = await img.metadata();
      const longEdge = Math.max(meta.width || 0, meta.height || 0);

      let pipe = img.rotate();   // honour EXIF orientation (phone photos)
      if (longEdge > MEDIA_LIMITS.maxEdgePx) {
        pipe = pipe.resize({
          width: MEDIA_LIMITS.maxEdgePx,
          height: MEDIA_LIMITS.maxEdgePx,
          fit: 'inside',
          withoutEnlargement: true
        });
      }
      const resized = await pipe.jpeg({ quality: MEDIA_LIMITS.jpegQuality, mozjpeg: true }).toBuffer();

      if (resized.length > 0 && resized.length < buffer.length) {
        mediaStats.images++;
        mediaStats.resized++;
        mediaStats.bytesIn += buffer.length;
        mediaStats.bytesOut += resized.length;
        const note = (buffer.length / 1024).toFixed(0) + 'KB -> ' + (resized.length / 1024).toFixed(0) + 'KB';
        return { buffer: resized, mimetype: 'image/jpeg', mediaType, changed: true, skipped: false, note };
      }

      // Already smaller than anything we could produce — keep the original.
      mediaStats.images++;
      mediaStats.bytesIn += buffer.length;
      mediaStats.bytesOut += buffer.length;
      return untouched;
    } catch (e) {
      mediaStats.failures++;
      console.warn('[MEDIA] resize failed: ' + (e.message || e).toString().slice(0, 140));
      if (buffer.length > MEDIA_LIMITS.maxImageBytes) {
        mediaStats.skipped++;
        return { ...untouched, skipped: true, note: 'image too large to analyse' };
      }
      return untouched;
    }
  }

  if (mediaType === 'audio') {
    if (buffer.length > MEDIA_LIMITS.maxAudioBytes) {
      mediaStats.skipped++;
      return { ...untouched, skipped: true, note: 'voice note too long to transcribe' };
    }
    return untouched;
  }

  if (buffer.length > MEDIA_LIMITS.maxDocBytes) {
    mediaStats.skipped++;
    return { ...untouched, skipped: true, note: 'document too large' };
  }
  return untouched;
}
