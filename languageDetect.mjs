// ============================================================================
// 🗣️ LANGUAGE DETECTION — decide the reply language from the LATEST message
// ============================================================================
// The reply must mirror the customer instantly: English → English, Arabic →
// Arabic, Urdu script → Urdu script, Roman Urdu → Roman Urdu. A prompt rule
// alone is not enough (LLM cards, learned style and persona notes can all pull
// the model back to Roman Urdu), so the language is detected HERE in code and
// passed as a per-message, highest-priority directive.
//
// Pure string work: no network, no model call, no cost.
// ============================================================================

const DEVANAGARI_RE = /[\u0900-\u097F]/;
const ARABIC_RANGE_RE = /[\u0600-\u06FF]/;
// Letters that are Urdu-specific but not used in standard Arabic.
const URDU_SPECIFIC_RE = /[پچژکگںھےٹڈڑۓ]/;

const ROMAN_URDU_WORDS = new Set([
  'kya', 'kia', 'hai', 'hain', 'hy', 'ha', 'aap', 'ap', 'tum', 'hum', 'main', 'mein', 'mera',
  'meri', 'apna', 'apni', 'uska', 'unki', 'bhai', 'behen', 'nahi', 'nahin', 'haan', 'han',
  'ji', 'karna', 'karo', 'kar', 'karein', 'chahiye', 'chahta', 'chahti', 'batao', 'bata',
  'bataye', 'batana', 'kitna', 'kitni', 'kitne', 'kab', 'kahan', 'kaun', 'kaisa', 'kaise',
  'acha', 'achha', 'achi', 'theek', 'thik', 'bhejo', 'bhej', 'dena', 'dein', 'raha', 'rahi',
  'tha', 'thi', 'hoga', 'hogi', 'zaroor', 'bilkul', 'shukriya', 'salam', 'assalam',
  'alaikum', 'walaikum', 'maal', 'saman', 'paisa', 'paise', 'kal', 'aaj', 'abhi', 'phir',
  'kyun', 'kyu', 'koi', 'kuch', 'sab', 'bohot', 'bahut', 'zyada', 'kam', 'chalega', 'chalta',
  'milta', 'milega', 'bana', 'banega', 'lena', 'leni', 'dijiye', 'kijiye', 'sakta', 'sakti'
]);

const ENGLISH_WORDS = new Set([
  'the', 'is', 'are', 'am', 'was', 'were', 'be', 'been', 'what', 'when', 'where', 'who', 'how',
  'why', 'can', 'could', 'would', 'should', 'will', 'shall', 'please', 'thanks', 'thank', 'you',
  'your', 'yours', 'we', 'our', 'i', 'my', 'me', 'he', 'she', 'they', 'their', 'it', 'its',
  'this', 'that', 'these', 'those', 'need', 'want', 'have', 'has', 'had', 'do', 'does', 'did',
  'not', 'no', 'yes', 'good', 'okay', 'ok', 'available', 'deliver', 'delivery', 'price',
  'prices', 'quote', 'quotation', 'quantity', 'company', 'invoice', 'payment', 'bank', 'send',
  'email', 'address', 'tomorrow', 'today', 'yesterday', 'hello', 'hi', 'dear', 'kindly',
  'regards', 'meeting', 'order', 'stock', 'quality', 'material', 'sir', 'madam', 'would'
]);

/**
 * Detect the language of the contact's latest message.
 * Returns { code, label, confidence } where code is one of:
 *   english | roman_urdu | urdu | arabic | hindi (never mirrored) | unknown
 */
export function detectLanguage(text) {
  const s = String(text == null ? '' : text).trim();
  if (!s) return { code: 'unknown', label: 'English', confidence: 'low' };

  if (DEVANAGARI_RE.test(s)) {
    // Hindi is never mirrored (locked rule) — Roman Urdu is the intended equivalent.
    return { code: 'hindi', label: 'Roman Urdu', confidence: 'high' };
  }
  if (ARABIC_RANGE_RE.test(s)) {
    return URDU_SPECIFIC_RE.test(s)
      ? { code: 'urdu', label: 'Urdu (Arabic script)', confidence: 'high' }
      : { code: 'arabic', label: 'Arabic', confidence: 'high' };
  }

  const words = s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return { code: 'unknown', label: 'English', confidence: 'low' };

  let urdu = 0;
  let eng = 0;
  for (const w of words) {
    if (ROMAN_URDU_WORDS.has(w)) urdu++;
    else if (ENGLISH_WORDS.has(w)) eng++;
  }
  // Morphological hints that are very common in Roman Urdu but not in English prose.
  for (const w of words) {
    if (/(kya|nahi|hai|hain|raha|rahi|kar|bhej|chahiye|gaya|gayi|diya|liya)$/.test(w) && w.length > 3) urdu += 0.5;
    if (/(aa|ee|oo)/.test(w) && !ENGLISH_WORDS.has(w)) urdu += 0.15;
  }

  // English wins ties when any English marker exists (a mixed "Bhai please send rate" is English).
  if (urdu > 0 && urdu > eng) {
    return { code: 'roman_urdu', label: 'Roman Urdu', confidence: urdu >= 2 ? 'high' : 'medium' };
  }
  return { code: 'english', label: 'English', confidence: eng >= 2 ? 'high' : 'medium' };
}

/** The per-message instruction appended at the very END of the system prompt.
 *  opts.conversationLang — the language the chat is already running in (detectConversationLanguage),
 *  used when the latest message is too short to judge ("Ok", "👍", "kahan"). */
export function languageDirective(text, opts = {}) {
  const direct = detectLanguage(text);
  const conv = opts.conversationLang || null;
  // A one-word reply must never flip a Roman-Urdu conversation into English.
  const useConversation = direct.confidence !== 'high' && conv && conv.code !== 'unknown' && conv.code !== direct.code;
  const effective = useConversation ? conv : direct;
  const langLabel = effective.label || 'English';

  const head = '\n\n--- 🗣️ REPLY LANGUAGE FOR THIS MESSAGE (HIGHEST PRIORITY) ---\n';
  const override = 'This rule overrides EVERY other language instruction — the LLM card, learned style, persona notes, LLM Tank notes and the knowledge base. Those control tone and content, never language.';
  const basis = useConversation
    ? 'The latest message is short or ambiguous, and this conversation is running in ' + langLabel + '.\n'
    : 'The customer\'s latest message is in ' + langLabel + '.\n';
  const follow = ' If the customer switches language later, follow their newest message instantly.';

  if (effective.code === 'urdu') {
    return head + basis + 'Reply in Urdu script (اردو) with every word. Do not reply in English or Roman Urdu.' + follow + '\n' + override + '\n';
  }
  if (effective.code === 'arabic') {
    return head + basis + 'Reply in natural business Arabic with every word. Do not reply in English or Urdu.' + follow + '\n' + override + '\n';
  }
  if (effective.code === 'roman_urdu' || effective.code === 'hindi') {
    return head + basis + 'Reply in Roman Urdu (Urdu written with English letters, e.g. "ji bilkul, kal bhej dunga"). Never Devanagari, and do not answer in pure English.' + follow + '\n' + override + '\n';
  }
  if (effective.code === 'english') {
    return head + basis + 'Reply in clear, natural English only — every word in English.' + follow + '\n' + override + '\n';
  }
  return head + 'The customer\'s language could not be determined (numbers/emoji/short reply).\n' +
    'Reply in clear English, then mirror their language as soon as they write a full sentence.\n' + override + '\n';
}

const CODE_LABEL = {
  english: 'English',
  roman_urdu: 'Roman Urdu',
  hindi: 'Roman Urdu',
  urdu: 'Urdu (Arabic script)',
  arabic: 'Arabic'
};

/**
 * The language this conversation is ALREADY running in, taken from the customer's recent
 * messages in the transcript. Used when the latest message is too short to judge, so a chat
 * that has been Roman Urdu all along never flips to English on an "Ok".
 */
export function detectConversationLanguage(transcript) {
  const lines = String(transcript || '').split('\n');
  const customerLines = [];
  for (const line of lines) {
    const m = line.match(/👤[^:]*:\s*(.*)$/);
    if (m && m[1] && m[1].trim()) customerLines.push(m[1].trim());
  }
  const recent = customerLines.slice(-8);
  if (!recent.length) return null;
  const tally = new Map();
  for (const t of recent) {
    const d = detectLanguage(t);
    if (d.code === 'unknown') continue;
    tally.set(d.code, (tally.get(d.code) || 0) + (d.confidence === 'high' ? 2 : 1));
  }
  if (!tally.size) return null;
  let best = null;
  let bestScore = 0;
  for (const [code, score] of tally) if (score > bestScore) { best = code; bestScore = score; }
  return { code: best, label: CODE_LABEL[best] || 'English', confidence: bestScore >= 3 ? 'high' : 'medium' };
}
