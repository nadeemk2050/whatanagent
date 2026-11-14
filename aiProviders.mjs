// Central routing for third-party model providers.
//
// DeepSeek is served through the Alibaba Cloud Model Studio (DashScope) key by default, so the
// app keeps a single bill and needs one fewer secret in the database. Set
// DEEPSEEK_VIA_DASHSCOPE=false (plus DEEPSEEK_API_KEY) to bill DeepSeek directly instead.
//
// Token prices are identical either way; only cache-hit rates and failure domains differ.

export const DASHSCOPE_COMPAT_BASE = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
export const DEEPSEEK_DIRECT_BASE = 'https://api.deepseek.com';
export const DEEPSEEK_DASHSCOPE_MODEL = 'deepseek-v4.1-flash';
export const DEEPSEEK_DIRECT_MODEL = 'deepseek-flash';

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const first = (...vals) => {
  for (const v of vals) { const s = str(v); if (s) return s; }
  return '';
};

export function deepSeekViaDashScope() {
  // Accept the usual "off" spellings. Previously only the exact string 'false' worked, so a
  // value of 0 / no / off was silently ignored and traffic kept going through DashScope.
  const v = String(process.env.DEEPSEEK_VIA_DASHSCOPE ?? '').trim().toLowerCase();
  if (v === '') return true;                       // default: via Alibaba
  return !['false', '0', 'no', 'off', 'n'].includes(v);
}

export const isDashScope = (base) => /dashscope/i.test(String(base || ''));

// DeepSeek-V4.1-Flash reasons by default on DashScope: a short max_tokens budget is consumed
// entirely by reasoning tokens and the reply comes back empty. Chat wants the answer, not the
// thinking - send enable_thinking:false.
export const deepseekOpenAIOptions = (base) => (isDashScope(base) ? { extra_body: { enable_thinking: false } } : {});

export const deepseekFetchExtras = (base) => (isDashScope(base) ? { enable_thinking: false } : {});

// Resolves the DeepSeek connection from whatever settings object the caller has
// (Firestore doc, merged settings, or {}), falling back to environment variables.
export function resolveDeepSeek(settings = {}) {
  const viaAlibaba = deepSeekViaDashScope();
  // Environment wins over the database. A secret set in .env is authoritative (that is the rule
  // the dashboard's own save-path follows), so a stale key left in Firestore can never shadow the
  // configured one and silently cause 401s.
  const override = first(process.env.DEEPSEEK_MODEL, settings.DEEPSEEK_MODEL);
  const dashKey = first(process.env.QWEN_API_KEY, process.env.DASHSCOPE_API_KEY, settings.QWEN_API_KEY, settings.DASHSCOPE_API_KEY);
  const dashBase = first(process.env.QWEN_BASE_URL, settings.QWEN_BASE_URL, DASHSCOPE_COMPAT_BASE).replace(/\/+$/, '');

  if (viaAlibaba && dashKey) {
    return { key: dashKey, base: dashBase, model: override || DEEPSEEK_DASHSCOPE_MODEL, provider: 'alibaba' };
  }
  const directKey = first(process.env.DEEPSEEK_API_KEY, settings.DEEPSEEK_API_KEY);
  if (directKey) {
    return { key: directKey, base: DEEPSEEK_DIRECT_BASE, model: override || DEEPSEEK_DIRECT_MODEL, provider: 'deepseek' };
  }
  return {
    key: '',
    base: viaAlibaba ? dashBase : DEEPSEEK_DIRECT_BASE,
    model: override || (viaAlibaba ? DEEPSEEK_DASHSCOPE_MODEL : DEEPSEEK_DIRECT_MODEL),
    provider: ''
  };
}

export const hasDeepSeek = (settings = {}) => !!resolveDeepSeek(settings).key;

/**
 * Optional override for BACKGROUND work (learning, staff meetings).
 *
 * IMPORTANT — measured on this app's real prompts, DeepSeek is NOT cheaper here:
 *
 *   Qwen3.8-Flash   in $0.15/M  cache-hit $0.02/M  out $0.47/M
 *   DeepSeek        in $0.30/M  cache-hit $0.03/M  out $1.20/M
 *
 * Both providers cache the prompt prefix automatically (Qwen measured 4096/4576 tokens cached
 * = 89%, DeepSeek 4352/4452 = 98%), so caching is already working on the current model. The
 * output price is what decides the bill, and DeepSeek's output is 2.55x Qwen's — making a
 * typical learning call ~2x MORE expensive ($0.00169 vs $0.000785). DeepSeek only wins if you
 * need its reasoning quality, not to save money.
 *
 * So this returns '' by default (keep the agent's model). Set AGENT_BACKGROUND_MODEL to opt in.
 */
export function backgroundModelFor(settings = {}) {
  const forced = first(process.env.AGENT_BACKGROUND_MODEL, process.env.AGENT_LEARNING_MODEL);
  if (!forced) return '';                       // default: never silently switch models
  if (forced === 'auto') {                      // explicit opt-in to "whatever DeepSeek route exists"
    const ds = resolveDeepSeek(settings);
    return ds.key ? ds.model : '';
  }
  return forced;
}

// ============================================================================
// 💸 CHEAP-FIRST MODEL CATALOGUE — the one place model ids are written
// ============================================================================
// Prices per 1M tokens (verified against the providers' pages, see aiTracker.mjs):
//
//   qwen3.8-flash        in $0.16   cache $0.016   out $0.47   ← default for everything
//   deepseek-v4.1-flash  in $0.30   cache $0.030   out $1.20   ← strict JSON only
//   gemini-2.5-flash     in $0.30   cache    —     out $2.50   ← media only
//
// Gemini is 5x Qwen on output, so a Gemini text call that Qwen could have answered is pure
// waste. Gemini is kept for what only it can do here: reading PDFs and audio. Every other
// gradient (3.5 / 3.6 / 3.8 / "latest") was removed: 3.5 costs $9.00/M out — 19x Qwen — and
// the newer ids are all $0.75/$3.75, i.e. more expensive than 2.5 with no feature this app
// uses. Nothing is silently upgraded: if Gemini 2.5 fails, the stack falls back to Qwen,
// which is both cheaper AND better for us than any Gemini text model.
//
// GEMINI_FALLBACK_MODELS is the escape hatch: set it to a comma-separated list (for example
// "gemini-3.8-flash") if Gemini 2.5 is ever retired and media reading breaks.
export const QWEN_TEXT_MODEL = 'qwen3.8-flash';
export const QWEN_VISION_MODEL = 'qwen3.8-omni-flash';
export const GEMINI_TEXT_MODEL = 'gemini-2.5-flash';

function geminiChain() {
  const extra = String(process.env.GEMINI_FALLBACK_MODELS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  return Array.from(new Set([GEMINI_TEXT_MODEL, ...extra]));
}

/** Ordered Gemini ids to try — Gemini 2.5 only unless GEMINI_FALLBACK_MODELS opts in. */
export const GEMINI_TEXT_CHAIN = geminiChain();
export const GEMINI_MEDIA_CHAIN = GEMINI_TEXT_CHAIN;
export const GEMINI_AUDIO_CHAIN = GEMINI_TEXT_CHAIN;

/** Cheapest-first order for "any working text engine" fallbacks. */
export const CHEAP_TEXT_ORDER = ['qwen', 'deepseek', 'gemini'];

/** The model a new agent/section gets when nobody chose one: cheapest capable text engine. */
export const DEFAULT_TEXT_MODEL = QWEN_TEXT_MODEL;

// Gemini ids that were removed from routing. Documents saved before this change still carry
// them (AI staff agents, the WhatsApp knowledge base), so any read path must normalise.
//
// They map to the CHEAPEST CAPABLE TEXT ENGINE (Qwen), not to another Gemini: every one of these
// fields drives text generation, and Qwen writes text at $0.47/M output against Gemini's $2.50/M.
// Gemini is still used where only it can work (PDF/audio reading) — that is decided by the
// message's MIME type in waWebClient, not by a stored model id. Without this normalisation a
// stored "gemini-3.8-flash" would keep billing $3.75/M output forever.
export const RETIRED_MODEL_MAP = {
  'gemini-3.5-flash': DEFAULT_TEXT_MODEL,
  'gemini-3.6-flash': DEFAULT_TEXT_MODEL,
  'gemini-3.8-flash': DEFAULT_TEXT_MODEL,
  'gemini-flash-latest': DEFAULT_TEXT_MODEL,
  'gemini-2.0-flash': DEFAULT_TEXT_MODEL,
  'gemini-1.5-flash': DEFAULT_TEXT_MODEL
};

/** Rewrite a stored model id to a routed one. Unknown ids pass through untouched. */
export function normaliseModelId(id) {
  const s = String(id == null ? '' : id).trim();
  if (!s) return s;
  return RETIRED_MODEL_MAP[s.toLowerCase()] || s;
}

/** True when a stored id had to be replaced — used to log the migration once per agent. */
export function isRetiredModelId(id) {
  return !!RETIRED_MODEL_MAP[String(id == null ? '' : id).trim().toLowerCase()];
}
