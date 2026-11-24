// ============================================================================
// 📚 FAQ RETRIEVAL — keep replies fast and accurate as the FAQ library grows
// ============================================================================
// A prompt that carries 1,000 FAQ entries costs more, answers slower and gets
// LESS accurate (the right answer drowns in the middle). So the full library
// stays OUT of the prompt: this module scores every entry against the incoming
// message and the caller injects only the few that matter.
//
// Deliberately dependency-free and local: no embeddings call, no network, no
// per-message cost. English, Roman Urdu and mixed text tokenise the same way.
// ============================================================================

const STOPWORDS = new Set([
  // English
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'to', 'of', 'in', 'on', 'at', 'for', 'from', 'with', 'by', 'as', 'it', 'its', 'this', 'that',
  'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they', 'me', 'my', 'your', 'our', 'their',
  'do', 'does', 'did', 'can', 'could', 'will', 'would', 'shall', 'should', 'have', 'has', 'had',
  'not', 'no', 'yes', 'please', 'pls', 'plz', 'ok', 'okay', 'thanks', 'thank', 'hi', 'hello',
  'sir', 'madam', 'mr', 'mrs', 'dear',
  // Roman Urdu / Hindi
  'salam', 'assalam', 'alaikum', 'alaikm', 'bhai', 'bro', 'kya', 'kia', 'ky', 'kyun', 'hai',
  'hain', 'hy', 'ka', 'ke', 'ki', 'ko', 'se', 'me', 'mein', 'main', 'hum', 'aap', 'ap', 'tum',
  'ye', 'yeh', 'wo', 'woh', 'kar', 'karo', 'kr', 'dena', 'de', 'do', 'raha', 'rahi', 'tha',
  'thi', 'na', 'nahi', 'nahin', 'ji', 'acha', 'achha', 'shukriya', 'bata', 'batao', 'bataye',
  'chahiye', 'chahta', 'chahti', 'hoga', 'hogi', 'kuch', 'koi', 'ab', 'abhi', 'phir', 'aur'
]);

/** Lowercase, strip punctuation, drop stopwords. Numbers are kept — prices, quantities,
 *  invoice numbers and phone digits are often the strongest signal in a business message. */
export function tokenize(text) {
  return String(text == null ? '' : text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .map(w => w.trim())
    .filter(w => w.length >= 2 && !STOPWORDS.has(w));
}

/**
 * Rank FAQs against a message.
 * Returns [{ faq, score }] ordered best-first (empty when nothing matches).
 */
export function retrieveFaqs(query, faqs, { topK = 5, minScore = 1.5 } = {}) {
  const qSet = new Set(tokenize(query));
  if (!qSet.size) return [];
  const list = (Array.isArray(faqs) ? faqs : []).filter(f => f && f.question && f.answer);
  if (!list.length) return [];

  const df = new Map();
  const docs = list.map(faq => {
    const q = new Set(tokenize(faq.question));
    const a = new Set(tokenize(faq.answer));
    for (const t of new Set([...q, ...a])) df.set(t, (df.get(t) || 0) + 1);
    return { faq, q, a, qText: String(faq.question).toLowerCase(), tokens: q.size + a.size };
  });

  const N = docs.length;
  const scored = [];
  for (const d of docs) {
    let score = 0;
    for (const t of qSet) {
      const idf = Math.log(1 + N / (1 + (df.get(t) || 0)));
      if (d.q.has(t)) score += 2.5 * idf;
      else if (d.a.has(t)) score += 1 * idf;
    }
    for (const t of qSet) {
      if (/^\d+$/.test(t) && (d.q.has(t) || d.a.has(t))) score += 1.5;
    }
    if (score > 0) scored.push({ faq: d.faq, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.filter(s => s.score >= minScore).slice(0, Math.max(1, Number(topK) || 5));
}

/**
 * Ready-to-inject prompt block. Empty string when nothing is relevant, so callers can
 * simply skip the push and keep the prompt byte-identical for unrelated chats.
 */
export function faqPromptBlock(query, faqs, opts = {}) {
  const hits = retrieveFaqs(query, faqs, opts);
  if (!hits.length) return '';
  const maxChars = Number(opts.maxChars) || 1400;
  let out = '';
  for (const { faq } of hits) {
    const chunk = 'Q: ' + String(faq.question).trim() + '\nA: ' + String(faq.answer).trim() + '\n\n';
    if (out.length + chunk.length > maxChars) break;
    out += chunk;
  }
  return out.trim();
}
