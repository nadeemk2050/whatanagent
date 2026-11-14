# WHATANAGENT — repo rules

## Every AI prompt must be prefix-cache friendly

Providers cache the **start** of a request and match on an exact prefix. A cache hit costs about
a tenth of a fresh prompt token. Anything that changes per message placed early in a prompt makes
everything after it full price, on every single call.

When you add or change any code that builds a prompt, follow these rules.

1. Build the prompt with [promptCache.mjs](../promptCache.mjs) — never by concatenating strings in
   ad-hoc order:

   ```js
   import { orderParts, cacheStats, cachedTokensFrom, logCacheShape, stableFingerprint } from '../promptCache.mjs';

   const systemPrompt = orderParts({
     stable:   [globalRules, ruleBook, sectionRules],  // identical for every call
     semi:     [perContactCard, businessTank],         // identical per contact / per entity
     volatile: [transcript, incomingMessage]           // different every call
   });
   ```

2. Volatile content (transcript, the new message, timestamps, "today is …", random ids) goes in
   `volatile` and therefore LAST. `withRuleBook()` appends — if you need the rule book, fetch
   `ruleBookText(...)` and put it in `stable` instead.
3. A block that is only present sometimes (an injected tank, a warning, a retry hint) belongs in
   `semi` or `volatile`, never in the middle of `stable`.
4. Every `recordAiCall(...)` must pass real `tokensIn`, `tokensOut` and
   `cachedTokens: cachedTokensFrom(response)`. `recordAiCall` reads `area` — it ignores `source`
   and `success`, and a wrong field names silently logs 0 tokens.
5. Cap generation output (`max_tokens` / `generationConfig.maxOutputTokens`). Output costs 3-5x
   input; WhatsApp replies use `waReplyMaxTokens()` from
   [waWebClient.js](../waWebClient.js) (`WA_REPLY_MAX_TOKENS`, default 700).
6. Log the shape with `logCacheShape(label, cacheStats({...}), stableFingerprint(...))` once per
   shape change, so a regression shows up in the server log and not only on the bill.

The AI usage panel in `public/admin.html` shows the resulting hit rate in the **CACHE HIT** card.
Under 40% means volatile content has crept to the front of a prompt.

## Other conventions

- Credentials come from the environment, never from the repo or the Firestore settings document.
- Run `node --check <file>` on every module you touch; `npm run build` only echoes.
- Push to `master` deploys to the Tencent VPS automatically (`.github/workflows/deploy.yml`).

## Model ids

Only three providers are routed: Qwen, DeepSeek and Gemini 2.5 Flash. Never type a model id in a
new section — import it from [aiProviders.mjs](../aiProviders.mjs):

```js
import { QWEN_TEXT_MODEL, GEMINI_TEXT_MODEL, GEMINI_TEXT_CHAIN, DEFAULT_TEXT_MODEL } from './aiProviders.mjs';
```

- Text work → `QWEN_TEXT_MODEL` (cheapest capable engine, $0.16/M in, $0.47/M out).
- Something a model must choose for itself → `DEFAULT_TEXT_MODEL`.
- Gemini → `GEMINI_TEXT_CHAIN` (Gemini 2.5 Flash only) and only for media: PDFs, audio, images.
- A stored value that may be stale → wrap it in `normaliseModelId()` before using it.

Gemini 3.x ids were removed on purpose (`gemini-3.5-flash` = $9.00/M output). Do not add them
back; if a newer Gemini is genuinely needed, set `GEMINI_FALLBACK_MODELS` in the environment so the
choice is visible and reversible.
