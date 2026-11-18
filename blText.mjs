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

/** Text layer of a PDF. Throws when the PDF cannot be parsed at all. */
export async function pdfToText(buffer) {
  const { PDFParse } = require('pdf-parse');
  const parsed = await new PDFParse({ data: buffer }).getText();
  return String((parsed && parsed.text) || '').slice(0, MAX_TEXT_CHARS);
}

/** Read a document or photo with Gemini vision. Used for scans, photos and image-only PDFs. */
export async function ocrWithVision(buffer, mimetype) {
  const key = String(process.env.GEMINI_API_KEY || '').trim();
  if (!key) throw new Error('GEMINI_API_KEY is not set on the server');

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
    if (String(text).trim().length >= MIN_USEFUL_CHARS) return { text: text, source: 'pdf-text' };

    // No text layer (or almost none): it is a scan, so read it as an image.
    try {
      const ocr = await ocrWithVision(buffer, 'application/pdf');
      return { text: ocr.text, source: ocr.source };
    } catch (e) {
      return { text: text || '', source: text ? 'pdf-text-thin' : 'none' };
    }
  }

  if (isImage) {
    try {
      const ocr = await ocrWithVision(buffer, mimetype || 'image/jpeg');
      return { text: ocr.text, source: ocr.source };
    } catch (e) {
      return { text: '', source: 'none' };
    }
  }

  return { text: '', source: 'none' };
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
