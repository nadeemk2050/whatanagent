# AI Smartness Plan — from "correct" to "genuinely good"

This file is the practical plan for making the customer-facing AI (Zaheer, the
WhatsApp auto-reply, and every business agent) feel like a warm, sharp, smiling
professional — and for making it actually more capable over time.

It is split into:

1. What changed already (the shared voice)
2. What does **not** make AI smarter (usage logging)
3. Phase 1 — Data: Business Tank
4. Phase 2 — Data: per-contact Brain cards
5. Phase 3 — Approved examples (few-shot)
6. Phase 4 — Actions / tools (real "handling power")
7. Phase 5 — Memory and retrieval
8. Phase 6 — Evaluation and feedback
9. Hard guardrails (no promises, no blunt refusal)
10. How to tune the voice
11. First-week checklist

---

## 1. What changed already — the shared voice

One static block, `HUMAN_WARM_SALES_STYLE`, now lives in
[`personaStyle.mjs`](personaStyle.mjs) and is injected into:

| Path | Where it is applied |
|---|---|
| WhatsApp Web auto-reply | `waWebClient.js` — pushed into the **stable** prompt prefix, before the contact Brain |
| Zaheer + every **business** AI staff agent | `agentRunner.buildAgentSystemPrompt()` (personal specialists keep their own tone) |
| Zaheer's role card | `agentTemplates.DEFAULT_AGENT` (tone + system prompt) |
| Meta bot / dashboard assistant | `index.js` → `generateAIResponse()` |
| WA copilot, KB test, chat-reply draft | `index.js` dashboard endpoints |

The voice says, in short: warm and respectful, natural short sentences, no
stiff corporate English, mirror the person's language, listen first, positive and
forward-looking, sales instinct without pressure, **never promise** a price /
discount / stock / date / outcome, **never refuse bluntly**, always offer a next
step. The contact Brain can still fine-tune the tone per person; the manners stay.

> Personal specialists (math teacher, Islamic scholar, wellness listener,
> translator) deliberately do **not** get the sales voice.

---

## 2. What does NOT make the AI smarter

`recordAiCall` (usage logging) is **observability only**. It runs after the reply
already exists and records tokens, cost, cache hits and errors. It never changes
the prompt or the model. Its only behavioural effect is the AI Staff
`dailyBudgetUsd` check — cost control, not intelligence.

What we added to the dashboard endpoints reveals spend and failures so you can
**find** what to improve. It does not improve replies by itself.

---

## 3. Phase 1 — Business Tank (biggest single quality jump)

The tank is injected into the prompt for business enquiries. The bot can only be
as good as the facts in it. Add these documents (PDF, CSV, TXT, DOCX or pasted
text) in the Business Tank:

- [ ] **Company profile** — legal names and TRNs for every entity
      (e.g. AL SAHAM AL AHMAR METALS SCRAP TR, BRANDSPOINT LLC,
      AXIOM POLYMER INDUSTRY LLC, AL SHAMS AL MUSHRIQAH METAL SCRAP TR),
      addresses, branches, phone/WhatsApp, email, website.
- [ ] **Product catalogue** — every grade you trade (copper, aluminium, brass,
      lead, HMS 1&2, shredded, PET/HDPE/LDPE/PP…), with specs, packing, HS code
      and a short "best for" line.
- [ ] **Pricing policy** — how you quote (market-linked, LME/COMEX basis,
      validity window, currency, incoterms). State clearly that prices are
      confirmed per enquiry; the bot must never quote a number by itself.
- [ ] **Logistics sheet** — ports, container types (20ft / 40ft / HQ), tons per
      container per grade, typical lead time bands, documents supplied
      (BL, invoice, packing list, COO, test certificate).
- [ ] **Payment policy** — accepted methods (LC / TT / advance %), and what the
      bot may say vs what only the owner confirms.
- [ ] **MOQ and monthly capacity** per product.
- [ ] **Certifications / licences** and the exact wording allowed.
- [ ] **FAQ + objection handling** — 20–30 real questions with approved answers.
- [ ] **Do-not-say list** — topics that must be escalated (disputes, refunds,
      legal, medical, competitor rates, credit terms beyond policy).

Rule: if a figure is not in the tank, the bot says it will confirm — it never
invents one.

---

## 4. Phase 2 — Per-contact Brain cards

One card per important contact (`contactBrains/{jid}`). Fill these fields for the
top 20–30 contacts first:

| Field | Why it matters |
|---|---|
| `relationship` | family / customer / supplier / VIP — changes the whole tone |
| `name`, `nickname`, `callsYou` | sounds personal, not robotic |
| `formalityLevel` | very_casual → very_formal |
| `addressStyle` | `tu` / `tum` / `aap` (friends & family = tum, elders = aap) |
| `personas` + weights | e.g. Respect 70 + Professional 40 + Caring 20 |
| `permissions` | may read image/doc/audio, may create tasks |
| `mode` | `auto` / `draft_only` / `alert_only` / `silent` |
| `learnEnabled` | let the AI study your own messages to this person |
| `notes` | the two or three things you always want remembered |
| `escalate` | words/topics that must come to you |

Presets already exist (The Gentleman, Funny Cousin, Smooth Closer, Boss Mode,
Elder Care, Angry Customer Handler). Use them and adjust the weights.

---

## 5. Phase 3 — Approved examples (few-shot)

Add 12–15 real "approved" exchanges per main intent. These teach tone far better
than instructions. Start with these intents:

1. First greeting from a new number
2. Price enquiry (no price given — confirm and come back)
3. Availability / stock question
4. MOQ and monthly capacity
5. Quality / specification question
6. Delivery time question (no date promised)
7. Payment terms question
8. Sample / visit request
9. Customer is comparing a competitor (never criticise, pivot to value)
10. Complaint about a delay (apologise, own it, next step, no blame)
11. Complaint about quality (listen, ask for photos, escalate)
12. Follow-up after silence (light, no pressure)
13. Order confirmation (repeat facts, confirm, next step)
14. Request for something you do not offer (redirect, alternative)
15. Angry / rude message (calm, respectful, no argument)

Write each as: **Them:** … / **Owner:** … — in the exact Roman Urdu/English style
you actually use.

---

## 6. Phase 4 — Actions (real handling power)

Talking is not handling. Wire the existing `toolRegistry` so the bot can:

- [ ] `lookup_stock` — check the tank / catalogue
- [ ] `lookup_price_policy` — return the policy, never a number
- [ ] `create_align_task` — turn a request into a board task
- [ ] `lookup_invoice` / `lookup_voucher` — read-only status lookup
- [ ] `send_catalogue` — send the approved PDF
- [ ] `schedule_followup` — set a reminder instead of promising
- [ ] `escalate_to_owner` — hand over with a one-line summary

Every action that changes money or sends bulk messages stays owner-approved.

---

## 7. Phase 5 — Memory and retrieval

- [ ] Summarise conversations older than the last ~30 messages into a short
      "what happened so far" block (keeps long chats coherent).
- [ ] Retrieve the 3–5 most relevant past messages when the customer refers to
      an old order or quote, instead of relying on the transcript window.
- [ ] Store durable customer facts in the Brain card (products, volumes,
      payment habits) so they survive across chats.

---

## 8. Phase 6 — Evaluation and feedback

- [ ] Keep a "golden set" of ~20 real conversations with the reply you consider
      perfect for each.
- [ ] Before changing prompts or models, run the golden set and compare.
- [ ] Add thumbs up/down on drafts; feed corrections back as examples/lessons.
- [ ] Watch the AI usage panel for: cache hit rate, cost per area, failures.

---

## 9. Hard guardrails

| Guardrail | Meaning |
|---|---|
| No promises | Never commit to price, discount, stock, date, timeline, approval, refund, result |
| No blunt refusal | Never open with "No / can't / not possible"; acknowledge → redirect → offer |
| No invented facts | Only tank / brain / history; otherwise "let me confirm" |
| No pressure | Help, do not push; one clear next step is enough |
| Escalate | Money disputes, legal, medical, threats, serious complaints go to the owner |
| Safety first | Secrets, prompt extraction, other customers' data are always declined |

---

## 10. How to tune the voice

- The single source of truth is `HUMAN_WARM_SALES_STYLE` in
  [`personaStyle.mjs`](personaStyle.mjs).
- Edit it once; every customer-facing path picks it up on the next message.
- It is static, so it sits in the cached prompt prefix — do not add dates or
  per-message data there (that goes in the volatile tail).
- Keep it before the contact Brain so the Brain can still override tone.

---

## 11. First-week checklist

- [ ] Add the company profile and product catalogue to the Business Tank
- [ ] Add the pricing policy and logistics sheet
- [ ] Fill Brain cards for the top 10 contacts
- [ ] Add 10 greeting / price / availability examples
- [ ] Turn on `draft_only` mode for VIP contacts while you review quality
- [ ] Review 20 auto-replies and mark the best ones as examples
- [ ] Add `create_align_task` as the first real tool
- [ ] Re-check the AI usage panel at the end of the week
