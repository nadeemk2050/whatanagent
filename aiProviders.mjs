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
  return String(process.env.DEEPSEEK_VIA_DASHSCOPE || '').toLowerCase() !== 'false';
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
  const override = first(settings.DEEPSEEK_MODEL, process.env.DEEPSEEK_MODEL);
  const dashKey = first(settings.QWEN_API_KEY, process.env.QWEN_API_KEY, settings.DASHSCOPE_API_KEY, process.env.DASHSCOPE_API_KEY);
  const dashBase = first(settings.QWEN_BASE_URL, process.env.QWEN_BASE_URL, DASHSCOPE_COMPAT_BASE).replace(/\/+$/, '');

  if (viaAlibaba && dashKey) {
    return { key: dashKey, base: dashBase, model: override || DEEPSEEK_DASHSCOPE_MODEL, provider: 'alibaba' };
  }
  const directKey = first(settings.DEEPSEEK_API_KEY, process.env.DEEPSEEK_API_KEY);
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
