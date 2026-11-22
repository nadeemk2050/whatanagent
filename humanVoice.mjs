// ============================================================================
// 🗣️ HUMAN VOICE — post-process an AI reply so it reads like a person texting
// ============================================================================
// The prompt asks for short, natural replies. This module makes sure of it even
// when the model slips back into markdown or corporate English:
//   • strip markdown, bullets, headings, code fences and tables
//   • remove robotic openers ("Certainly!", "As an AI...", "I understand your concern")
//   • cap emojis
//   • split a long reply into 1–3 short WhatsApp messages
//   • give a natural typing delay based on length
//
// Pure functions only — no imports, no I/O — so they are easy to test.
// ============================================================================

const ROBOTIC_OPENERS = [
  /^\s*(certainly|absolutely|sure thing|of course)\s*[!,.:;\-–—]*\s*/i,
  /^\s*(as an ai|as a language model|as an ai language model)[^.!?\n]*[.!?]?\s*/i,
  /^\s*i understand your concern[.,!]?\s*/i,
  /^\s*thank you for (reaching out|contacting us)[.,!]?\s*/i,
  /^\s*i hope this (message|email) finds you well[.,!]?\s*/i,
  /^\s*(please be advised|kindly note|please note that)[.,:!\s]*/i,
  /^\s*we regret to inform you( that)?[.,:!\s]*/i,
  /^\s*i apologi[sz]e for the inconvenience[.,!]?\s*/i
];

const STIFF_INLINE = [
  /\bplease be advised that\b/gi,
  /\bkindly note that\b/gi,
  /\bplease note that\b/gi,
  /\bwe regret to inform you that\b/gi,
  /\bi apologi[sz]e for the inconvenience\b/gi,
  /\bi hope this (message|email) finds you well\b/gi,
  /\bthank you for reaching out\b/gi,
  /\bi understand your concern\b/gi,
  /\bis there anything else i can (help|assist) you with\b/gi
];

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu;

function stripMarkdown(input) {
  let s = String(input == null ? '' : input).replace(/\r\n/g, '\n');
  s = s.replace(/```[\s\S]*?```/g, ' ');          // fenced code
  s = s.replace(/`([^`]+)`/g, '$1');               // inline code
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1');         // bold
  s = s.replace(/__([^_]+)__/g, '$1');             // bold
  s = s.replace(/(^|\s)\*([^*\n]+)\*(?=\s|$)/g, '$1$2'); // italics
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, '');        // headings
  s = s.replace(/^\s*[-*•]\s+/gm, '');             // bullets
  s = s.replace(/^\s*\d+[.)]\s+/gm, '');           // numbered lists
  s = s.replace(/^\s*([-*_])\1{2,}\s*$/gm, '');    // rules
  s = s.replace(/[ \t]+$/gm, '');                  // trailing spaces
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

function stripRobotic(input) {
  let s = String(input == null ? '' : input);
  // Repeatedly drop robotic openers (a model sometimes stacks two).
  for (let i = 0; i < 4; i++) {
    let changed = false;
    for (const re of ROBOTIC_OPENERS) {
      if (re.test(s)) { s = s.replace(re, ''); changed = true; }
    }
    if (!changed) break;
  }
  // Drop "As an AI ..." sentences anywhere.
  s = s.replace(/\b(as an ai|as a language model)[^.!?\n]*[.!?]?/gi, ' ');
  // Drop the stiff corporate phrases anywhere.
  for (const re of STIFF_INLINE) s = s.replace(re, ' ');
  return s.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n');
}

function capEmojis(input, max = 2) {
  let n = 0;
  return String(input).replace(EMOJI_RE, (m) => {
    n += 1;
    return n <= max ? m : '';
  });
}

/** Clean one AI reply so it looks like a human wrote it. */
export function humanizeReplyText(input) {
  let s = stripMarkdown(input);
  s = stripRobotic(s);
  s = s.replace(/[ \t]{2,}/g, ' ');
  s = s.replace(/\n{3,}/g, '\n\n');
  s = capEmojis(s, 2);
  s = s.trim();

  // Hard cap so a runaway reply cannot become a wall of text.
  if (s.length > 1200) {
    const cut = s.slice(0, 1200);
    const at = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '), cut.lastIndexOf('\n'));
    s = (at > 600 ? cut.slice(0, at + 1) : cut).trim();
  }
  return s;
}

/**
 * Split a reply into 1–3 short messages suitable for WhatsApp.
 * Content is never dropped: any overflow is merged into the last message.
 */
export function splitWhatsAppMessages(input, { maxMessages = 3, maxLen = 320 } = {}) {
  const text = String(input == null ? '' : input).trim();
  if (!text) return [];
  if (text.length <= maxLen) return [text];

  const sentences = text
    .split(/(?<=[.!?؟])\s+|\n+/)
    .map((x) => x.trim())
    .filter(Boolean);

  const chunks = [];
  let cur = '';
  for (const sentence of sentences) {
    if (!cur) cur = sentence;
    else if ((cur + ' ' + sentence).length <= maxLen) cur += ' ' + sentence;
    else { chunks.push(cur); cur = sentence; }
  }
  if (cur) chunks.push(cur);

  if (chunks.length > maxMessages) {
    const head = chunks.slice(0, Math.max(1, maxMessages - 1));
    const tail = chunks.slice(Math.max(1, maxMessages - 1)).join(' ');
    head.push(tail);
    return head;
  }
  return chunks;
}

/** Natural typing pause: about 22 ms per character, clamped to 1.2–6 s. */
export function typingDelayMs(text) {
  const n = String(text == null ? '' : text).length;
  return Math.min(6000, Math.max(1200, Math.round(n * 22)));
}

/** True when a text still contains one of the blocked robotic phrases. */
export function containsRoboticPhrase(text) {
  const s = String(text || '');
  if (ROBOTIC_OPENERS.some((re) => re.test(s))) return true;
  return STIFF_INLINE.some((re) => re.test(s));
}
