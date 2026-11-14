// ============================================================================
// 💰 promptCache — prefix-cache discipline for every AI prompt in this app
// ============================================================================
// WHY THIS EXISTS
// Providers (DeepSeek, Qwen/DashScope, Gemini, OpenAI, Anthropic) cache the START of a
// request. A prompt token served from that cache costs ~1/8th to 1/5th of a fresh one
// (Qwen $0.02 vs $0.15 per M, DeepSeek $0.03 vs $0.30 per M). The cache is matched on an
// EXACT PREFIX, so the moment one character changes, everything after it is re-billed at
// the full rate for that request.
//
// The rule this module enforces:
//
//     STABLE content FIRST  →  changes per contact  →  changes per message LAST
//
// Concretely, for the WhatsApp reply prompt the transcript used to sit BEFORE the rules,
// the Contact Brain and the Business Data Tank — so ~3,000-4,000 tokens of perfectly
// cacheable text were re-billed on every single message. Moving the transcript (and the
// new message) to the end turns that block into a permanent cache hit.
//
// HOW TO USE IT IN A NEW SECTION
//
//   import { orderParts, cachedTokensFrom, cacheStats } from './promptCache.mjs';
//
//   const system = orderParts({
//     stable:   [GLOBAL_RULES, SECTION_RULES, ENTITY_BLOCK],   // never changes per call
//     semi:     [perContactCard],                              // changes per person
//     volatile: [transcript, incomingMessage]                  // changes every message
//   });
//
// The order of the three arrays is the order they are concatenated, so `semi` and
// `volatile` can never leak in front of `stable`.
// ============================================================================

/** Parts smaller than this are not worth reordering for — the saving is noise. */
export const CACHE_WORTH_MIN_CHARS = 400;

const asText = (part) => {
  if (!part) return '';
  if (typeof part === 'string') return part;
  if (Array.isArray(part)) return part.map(asText).filter(Boolean).join('\n');
  return String(part);
};

/**
 * Concatenate prompt parts in cache-friendly order: stable → semi → volatile.
 * Blank parts are dropped, and a missing section never leaves a double newline.
 */
export function orderParts({ stable = [], semi = [], volatile = [] } = {}) {
  const groups = [stable, semi, volatile].map(g => asText(g).trim()).filter(Boolean);
  return groups.join('\n\n');
}

/**
 * How much of the prompt can actually be cached, and how much cannot.
 * Logged once per change of shape, so a future section that quietly moves a
 * per-message block to the front gets caught instead of silently costing money.
 */
export function cacheStats({ stable = [], semi = [], volatile = [] } = {}) {
  const size = (g) => asText(g).trim().length;
  const stableChars = size(stable);
  const semiChars = size(semi);
  const volatileChars = size(volatile);
  const total = stableChars + semiChars + volatileChars;
  return {
    stableChars, semiChars, volatileChars, total,
    // Everything up to the first per-message content is theoretically cacheable.
    cacheableChars: stableChars + semiChars,
    cacheablePct: total ? Math.round(((stableChars + semiChars) / total) * 100) : 0,
    worthOrdering: total >= CACHE_WORTH_MIN_CHARS
  };
}

/**
 * Cached prompt tokens out of any provider's usage payload.
 *
 * Every provider reports this in a different place, and reading the wrong field is why
 * a dashboard can show "0% cache hit" while the cache is actually working:
 *
 *   OpenAI / Qwen / DashScope compat : usage.prompt_tokens_details.cached_tokens
 *   DeepSeek (direct API)            : usage.prompt_cache_hit_tokens
 *   Gemini                           : usageMetadata.cachedContentTokenCount
 *   Anthropic                        : usage.cache_read_input_tokens
 */
export function cachedTokensFrom(...candidates) {
  for (const c of candidates) {
    if (!c) continue;
    // Gemini's SDK returns { response: { usageMetadata } } — accept either the wrapper or the
    // inner response so a caller cannot lose the count by passing the wrong level.
    const inner = c.response && typeof c.response === 'object' ? c.response : null;
    const usage = c.usage || c.usageMetadata || (inner && (inner.usage || inner.usageMetadata)) || c;
    if (!usage) continue;
    const n = firstNumber(
      usage.prompt_tokens_details && usage.prompt_tokens_details.cached_tokens,
      usage.prompt_cache_hit_tokens,
      usage.cachedContentTokenCount,
      usage.cache_read_input_tokens,
      usage.cached_tokens,
      usage.cachedTokens
    );
    if (n !== null) return n;
  }
  return 0;
}

function firstNumber(...vals) {
  for (const v of vals) {
    if (v === null || v === undefined || v === '') continue;
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

/**
 * A cheap fingerprint of the stable part of a prompt.
 *
 * Caching only pays off while the stable text is byte-identical. Printing this next to
 * the cache-hit number makes a regression obvious: if the fingerprint changes on every
 * call, something per-message has crept into the stable block.
 */
export function stableFingerprint(text) {
  const s = asText(text);
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = (h1 ^ c) >>> 0;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = (h2 + c * (i + 1)) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

/**
 * One-line log for the reply path: proves the ordering held and reports the win.
 * Call it only when the shape changes (first message, new contact, tank toggled) so it
 * does not spam the log on every message.
 */
export function logCacheShape(label, stats, fingerprint) {
  try {
    console.log('[CACHE] ' + label + ' · cacheable ' + stats.cacheablePct + '% (' +
      stats.cacheableChars + '/' + stats.total + ' chars)' +
      (fingerprint ? ' · stable# ' + fingerprint : ''));
  } catch (e) { /* logging must never break a reply */ }
}

export default { orderParts, cacheStats, cachedTokensFrom, stableFingerprint, logCacheShape, CACHE_WORTH_MIN_CHARS };
