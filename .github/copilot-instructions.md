# WHATANAGENT - repo rules

> **STATIC FILE - keep it byte-stable.**
> Everything in this file sits at the START of every request, so a single byte that changes here
> invalidates the cached prefix for the whole conversation. Never put a date, time, build number,
> request id, counter, "current status", or any other value that changes between turns in this
> file - and specifically never above this line. History belongs in commits and in
> `~/.copilot/session-state`, not here. If something must be time-stamped, put it in a code
> comment or a checkpoint file instead.

## Every AI prompt must be prefix-cache friendly

Providers cache the **start** of a request and match on an exact prefix. A cache hit costs about
a tenth of a fresh prompt token. Anything that changes per message placed early in a prompt makes
everything after it full price, on every single call.

When you add or change any code that builds a prompt, follow these rules.

1. Build the prompt with [promptCache.mjs](../promptCache.mjs) - never by concatenating strings in
   ad-hoc order:

   ```js
   import { orderParts, cacheStats, cachedTokensFrom, logCacheShape, stableFingerprint } from '../promptCache.mjs';

   const systemPrompt = orderParts({
     stable:   [globalRules, ruleBook, sectionRules],  // identical for every call
     semi:     [perContactCard, businessTank],         // identical per contact / per entity
     volatile: [transcript, incomingMessage]           // different every call
   });
   ```

2. Volatile content (transcript, the new message, timestamps, "today is ...", random ids) goes in
   `volatile` and therefore LAST. `withRuleBook()` appends - if you need the rule book, fetch
   `ruleBookText(...)` and put it in `stable` instead.
3. A block that is only present sometimes (an injected tank, a warning, a retry hint) belongs in
   `semi` or `volatile`, never in the middle of `stable`.
4. Every `recordAiCall(...)` must pass real `tokensIn`, `tokensOut` and
   `cachedTokens: cachedTokensFrom(response)`. `recordAiCall` reads `area` - it ignores `source`
   and `success`, and a wrong field names silently logs 0 tokens.
5. Cap generation output (`max_tokens` / `generationConfig.maxOutputTokens`). Output costs 3-5x
   input; WhatsApp replies use `waReplyMaxTokens()` from
   [waWebClient.js](../waWebClient.js) (`WA_REPLY_MAX_TOKENS`, default 700).
6. Log the shape with `logCacheShape(label, cacheStats({...}), stableFingerprint(...))` once per
   shape change, so a regression shows up in the server log and not only on the bill.

The AI usage panel in `public/admin.html` shows the resulting hit rate in the **CACHE HIT** card.
Under 40% means volatile content has crept to the front of a prompt.

## Context-window prefix ordering - binding for every interaction

This applies to the **agent/editor session itself**, not only to code that builds prompts. The
order below is the 0th-token-first contract; treat it as a hard architectural constraint.

| Slot | Content | Changes |
| --- | --- | --- |
| 0 to n (front) | This file, `AGENTS.md`/rule files, role definitions, repo conventions, stable codebase references, tool list | **never** within a session |
| middle | Semi-stable context: the file(s) currently being edited, schema, a fixed section of a file | per task |
| **last** | The user's new message, pasted logs, console output, ids, dates, "today is...", anything generated for this one turn | every turn |

Rules that follow from it:

- **Never** prepend per-turn data (logs, timestamps, ids, tool output summaries) above static
  instructions. New information goes at the bottom.
- **Prefer one long-lived session** over many short ones - a fresh session starts with an empty
  cache and pays full price for the static part again.
- **Batch file reads.** Every new file appended to the context moves the tail; re-reading the same
  file twice in a turn is pure waste.
- **Avoid churn in files that sit early in the prompt** (this file, `aiProviders.mjs`,
  `promptCache.mjs`, `index.js` boot section). If one must change, change it once and finish the
  task - each edit invalidates the prefix for the remainder of the conversation.
- When a task needs dynamic values, obtain them **late** (call a tool, read the file at the point
  of use) rather than loading them upfront.
- `promptCache.mjs` `orderParts({ stable, semi, volatile })` is the code-level expression of this
  same contract - the two must never diverge.

## Other conventions

- Credentials come from the environment, never from the repo or the Firestore settings document.
- Run `node --check <file>` on every module you touch; `npm run build` only echoes.
- Push to `master` deploys to the Tencent VPS automatically (`.github/workflows/deploy.yml`).

## Model ids

Only three providers are routed: Qwen, DeepSeek and Gemini 3.8 Flash. Never type a model id in a
new section - import it from [aiProviders.mjs](../aiProviders.mjs):

```js
import { QWEN_TEXT_MODEL, GEMINI_TEXT_MODEL, GEMINI_TEXT_CHAIN, DEFAULT_TEXT_MODEL } from './aiProviders.mjs';
```

- Text work > `QWEN_TEXT_MODEL` (cheapest capable engine, $0.16/M in, $0.47/M out).
- Something a model must choose for itself > `DEFAULT_TEXT_MODEL`.
- Gemini > `GEMINI_TEXT_CHAIN` (Gemini 3.8 Flash only) and only for media: PDFs, audio, images.
- A stored value that may be stale > wrap it in `normaliseModelId()` before using it.

Gemini 2.5 Flash was retired: Google now answers `400 "no longer available to new users"` for it,
so the media chain had to move. Gemini stays media-only - Qwen writes every text reply. Other
Gemini ids (`3.5-flash` legacy, `3.6`, `3.1-flash-lite`) stay unrouted; if one is genuinely needed,
set `GEMINI_FALLBACK_MODELS` in the environment so the choice is visible and reversible.
