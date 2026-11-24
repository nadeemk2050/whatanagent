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

// ============================================================================
// 💸 Z.ai (Zhipu) — OpenAI-compatible. GLM 5.3 family only.
//
// Older ids (4.7 / 4.5 / 4.6 / Flash) and the free pool were dropped: the free pool
// answers 1305 "service overloaded", and 4.7-class ids are superseded here.
//
// Measured on this key (Nov 2026):
//   • GLM-5.3 cannot switch thinking OFF (error 1210), but `reasoning_effort: "low"`
//     returned 0 reasoning tokens — that is the setting chat replies should use.
//   • Paid ids answer 1113 "Insufficient balance" until the Z.ai account is recharged.
//
//   glm-5.3-flash   in $0.15  cache $0.03  out $0.50  ← best value, 1M context
//   glm-5.3-flashx  in $0.37  cache $0.075 out $1.25  ← faster (~200 tok/s), same class
//   glm-5.3         in $1.40  cache $0.26  out $4.40  ← flagship reasoning, not for chat
// ============================================================================
export const ZAI_COMPAT_BASE = 'https://api.z.ai/api/paas/v4';
export const GLM_TEXT_MODEL = 'glm-5.3-flash';
export const GLM_FAST_MODEL = 'glm-5.3-flashx';
export const GLM_FLAGSHIP_MODEL = 'glm-5.3';
export const GLM_PAID_MODELS = [GLM_TEXT_MODEL, GLM_FAST_MODEL, GLM_FLAGSHIP_MODEL];

/** 5.3 cannot turn thinking off; "low" measured 0 reasoning tokens, so chat uses it. */
export const GLM_REASONING_EFFORT = 'low';

// ============================================================================
// 💸 OpenAI direct (GPT-6 Luna) + optional OpenRouter fallback.
//
// Verified live on this key (Nov 2026):
//   GET  https://api.openai.com/v1/models        -> gpt-6-luna is available
//   POST https://api.openai.com/v1/chat/completions
//
// Direct OpenAI quirks, measured (not guessed):
//   • `max_tokens` is REJECTED - use `max_completion_tokens`.
//   • `temperature` other than the default (1) is REJECTED - omit it.
//   • Luna spends a few reasoning tokens even on trivial prompts; they are billed as output
//     and count against max_completion_tokens (5 tokens on a one-word reply in the test).
//   • Cache hits arrive in usage.prompt_tokens_details.cached_tokens (same field we already read).
//
// Prices (identical on both routes; OpenRouter just adds a ~5% fee on credit top-ups):
//   gpt-6-luna   in $0.10  cache-read $0.01  out $0.50  context 1,050,000
//
// Direct is the primary route: no middleman, no markup, one less network hop. The OpenRouter
// id stays available for the same model (and for its half-price async `:batch` variant) but is
// never chosen implicitly.
// ============================================================================
export const OPENAI_BASE = 'https://api.openai.com/v1';
export const LUNA_TEXT_MODEL = 'gpt-6-luna';
export const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
export const LUNA_OPENROUTER_MODEL = 'openai/gpt-6-luna';
export const LUNA_OPENROUTER_BATCH_MODEL = 'openai/gpt-6-luna:batch';

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
//   gemini-3.8-flash     in $0.75   cache $0.075   out $3.75   ← media only
//
// Gemini is 5x+ Qwen on output, so a Gemini text call that Qwen could have answered is pure
// waste. Gemini is kept for what only it can do here: reading PDFs and audio. Gemini 2.5 Flash
// was retired by Google (400 "no longer available to new users"), so the media chain moved to
// 3.8 Flash - the id Google's own error message recommends, and the only one this app needs.
// Flash-Lite ids are cheaper on paper but have not been verified for invoice/PDF reading.
// Nothing is silently upgraded: if Gemini fails, the stack falls back to Qwen, which is both
// cheaper AND better for us than any Gemini text model.
//
// GEMINI_FALLBACK_MODELS is the escape hatch: set it to a comma-separated list (for example
// "gemini-3.5-flash-lite") so a replacement is visible and reversible without a code edit.
export const QWEN_TEXT_MODEL = 'qwen3.8-flash';
export const QWEN_VISION_MODEL = 'qwen3.8-omni-flash';
export const GEMINI_TEXT_MODEL = 'gemini-3.8-flash';

function geminiChain() {
  const extra = String(process.env.GEMINI_FALLBACK_MODELS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  return Array.from(new Set([GEMINI_TEXT_MODEL, ...extra]));
}

/** Ordered Gemini ids to try — Gemini 3.8 Flash only unless GEMINI_FALLBACK_MODELS opts in. */
export const GEMINI_TEXT_CHAIN = geminiChain();
export const GEMINI_MEDIA_CHAIN = GEMINI_TEXT_CHAIN;
export const GEMINI_AUDIO_CHAIN = GEMINI_TEXT_CHAIN;

/** Cheapest-first order for "any working text engine" fallbacks. GPT-6 Luna leads (cheapest
 * measured cost per WhatsApp reply: $0.10 in / $0.50 out with $0.01 cache reads), Qwen is the
 * first backup. Providers without a key are simply skipped by the caller. */
export const CHEAP_TEXT_ORDER = ['openai', 'qwen', 'deepseek', 'gemini'];

/** The model a new agent/section gets when nobody chose one: cheapest capable text engine. */
export const DEFAULT_TEXT_MODEL = QWEN_TEXT_MODEL;

// Gemini ids that were removed from routing. Documents saved before this change still carry
// them (AI staff agents, the WhatsApp knowledge base), so any read path must normalise.
//
// They map to the CHEAPEST CAPABLE TEXT ENGINE (Qwen), not to another Gemini: every one of these
// fields drives text generation, and Qwen writes text at $0.47/M output against Gemini's $3.75/M.
// Gemini is still used where only it can work (PDF/audio reading) — that is decided by the
// message's MIME type in waWebClient, not by a stored model id. 3.8 Flash is NOT in this map:
// it is the routed media model now, so a stored 3.8 must stay 3.8.
export const RETIRED_MODEL_MAP = {
  'gemini-2.5-flash': DEFAULT_TEXT_MODEL,
  'gemini-3.5-flash': DEFAULT_TEXT_MODEL,
  'gemini-3.6-flash': DEFAULT_TEXT_MODEL,
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
