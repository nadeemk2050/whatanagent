# AGENTS.md

The single source of truth for this repository's rules is
[.github/copilot-instructions.md](.github/copilot-instructions.md). Read it first; it is binding
for every agent and every contributor.

Do not duplicate those rules here - one canonical file means one place to change, and a second copy
would drift and silently invalidate the prompt cache (see "STATIC FILE" in that document).

In short, the non-negotiables:

1. Build every prompt with `promptCache.mjs` (`orderParts({ stable, semi, volatile })`) - static
   content first, per-message content last.
2. Import model ids from `aiProviders.mjs`; never type a model id in a new section.
3. Pass real `tokensIn`, `tokensOut` and `cachedTokens` to `recordAiCall`.
4. Keep this file and the instructions file byte-stable: no dates, ids, counters or status lines.
