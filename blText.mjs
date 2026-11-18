// ============================================================================
// 📄 Document text — one place that turns a file into text, with OCR fallback
// ============================================================================
// WHY THIS MODULE EXISTS
//   A BL is read again and again: once when it arrives, once for the automatic
//   check, once every time somebody presses X-Ray. Reading the PDF each time is
//   wasted CPU, and re-asking an AI each time is wasted money. The text is
//   extracted ONCE and kept beside the file; everything else reads that.
//
// TWO WAYS IN
//   - A PDF with a text layer  -> pdf-parse (free, instant, exact)
//   - A scan or a photo        -> Gemini vision, once, then cached forever
//
// Model rule (repo convention): media understanding goes to GEMINI_TEXT_CHAIN.
// ============================================================================
import fs from 'fs';
import { createRequire } from 'module';
import { GEMINI_TEXT_CHAIN } from './aiProviders.mjs';

const require = createRequire(import.meta.url);

const MAX_TEXT_CHARS = 60000;
const MIN_USEFUL_CHARS = 40;      // below this a PDF has effectively no text layer

/**
 * Does this text layer look unusable?
 *
 * Many carrier B/Ls (MSC among them) produce a text layer where the printed labels sit in one
 * block and the values in another, plus runs of barcode digits. Feeding that to a model invites
 * it to pair a label with the wrong value, so such a page is read as an IMAGE instead - vision
 * sees the real layout.
 */
export function looksScrambledText(text) {
  const t = String(text || '');
  if (t.length < 200) return false;

  if ((t.match(/\d{30,}/g) || []).length >= 2) return true;   // barcode / OCR noise

  const lines = t.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 12) return false;

  const labelOnly = lines.filter(l =>
    l.length <= 90 && (/:$/.test(l) || /^\(.*\)$/.test(l) || /^[A-Z0-9 ,.&\/()'\u2019\-]{3,}$/.test(l))
  ).length;

  return (labelOnly / lines.length) >= 0.5;
}

/** Text layer of a PDF. Throws when the PDF cannot be parsed at all. */
export async function pdfToText(buffer) {
  const { PDFParse } = require('pdf-parse');
  const parsed = await new PDFParse({ data: buffer }).getText();
  return String((parsed && parsed.text) || '').slice(0, MAX_TEXT_CHARS);
}

/** True when a vision reader is actually configured (env or settings document). */
export function visionConfigured(settings = {}) {
  return !!String((settings && (settings.GEMINI_API_KEY || settings.geminiApiKey)) || process.env.GEMINI_API_KEY || '').trim();
}

/** Read a document or photo with Gemini vision. Used for scans, photos and image-only PDFs. */
export async function ocrWithVision(buffer, mimetype, settings = {}) {
  const key = String(
    (settings && (settings.GEMINI_API_KEY || settings.geminiApiKey)) ||
    process.env.GEMINI_API_KEY ||
    ''
  ).trim();
  if (!key) throw new Error('no Gemini key configured (settings or GEMINI_API_KEY)');

  const mime = String(mimetype || 'application/pdf').split(';')[0].trim().toLowerCase();
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(key);

  let lastErr = null;
  for (const model of GEMINI_TEXT_CHAIN) {
    try {
      const m = genAI.getGenerativeModel({ model: model, generationConfig: { maxOutputTokens: 4096 } });
      const res = await m.generateContent({
        contents: [{
          role: 'user',
          parts: [
            {
              text: 'Transcribe ALL text from this document or image exactly as printed, keeping the reading order and line breaks. ' +
                'Include numbers, addresses, container numbers, seal numbers and table columns. No commentary, no summary.'
            },
            { inlineData: { mimeType: mime, data: buffer.toString('base64') } }
          ]
        }]
      });
      const text = String((res.response && res.response.text && res.response.text()) || '').trim();
      if (text) return { text: text.slice(0, MAX_TEXT_CHARS), source: 'vision:' + model };
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error('vision OCR failed' + (lastErr ? ': ' + String(lastErr.message || lastErr).slice(0, 120) : ''));
}

/**
 * Best-effort text for a buffer.
 * Returns { text, source } where source is pdf-text | vision:<model> | none.
 * Never throws: a caller that cannot read the file must still be able to say so.
 */
export async function extractTextFromBuffer(buffer, opts = {}) {
  if (!buffer || !buffer.length) return { text: '', source: 'none' };

  const mimetype = String(opts.mimetype || '').split(';')[0].trim().toLowerCase();
  const fileName = String(opts.fileName || '');
  const isPdf = /pdf/.test(mimetype) || /\.pdf$/i.test(fileName);
  const isImage = /^image\//.test(mimetype) || /\.(jpe?g|png|webp|tiff?|bmp)$/i.test(fileName);

  if (isPdf) {
    let text = '';
    try { text = await pdfToText(buffer); } catch (e) { text = ''; }

    const usable = String(text).trim().length >= MIN_USEFUL_CHARS;
    if (usable && !looksScrambledText(text)) return { text: text, source: 'pdf-text' };

    // Either there is no text layer (a scan) or the layer is scrambled (labels divorced from
    // their values). Reading the page as an image is the only reliable option for both.
    try {
      const ocr = await ocrWithVision(buffer, 'application/pdf', opts.settings || {});
      return { text: ocr.text, source: ocr.source };
    } catch (e) {
      return {
        text: text || '',
        source: text ? (usable ? 'pdf-text-scrambled' : 'pdf-text-thin') : 'none',
        error: String((e && e.message) || e).slice(0, 200)
      };
    }
  }

  if (isImage) {
    try {
      const ocr = await ocrWithVision(buffer, mimetype || 'image/jpeg', opts.settings || {});
      return { text: ocr.text, source: ocr.source };
    } catch (e) {
      return { text: '', source: 'none', error: String((e && e.message) || e).slice(0, 200) };
    }
  }

  return { text: '', source: 'none', error: 'unsupported file type' };
}

/** Text from a file already on disk. */
export async function extractTextFromFile(absPath, opts = {}) {
  try {
    const buffer = fs.readFileSync(absPath);
    return await extractTextFromBuffer(buffer, opts);
  } catch (e) {
    return { text: '', source: 'none' };
  }
}

export const TEXT_LIMITS = { MAX_TEXT_CHARS, MIN_USEFUL_CHARS };
