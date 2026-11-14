# WhatsApp AI Agent (Day 1 & Day 2 Prototype)

This is a working prototype of an e-commerce WhatsApp AI Agent. It uses **Node.js (Express)** to handle incoming Webhook events from Meta's WhatsApp Cloud API, queries the **Google Gemini API** (using `gemini-2.5-flash`) to generate intelligent replies, and sends them back to the user's WhatsApp number.

---

## 🚀 Setup & Installation

### 1. Prerequisites
- [Node.js](https://nodejs.org/) installed on your machine.
- A [Meta for Developers](https://developers.facebook.com/) account.
- A [Google AI Studio](https://aistudio.google.com/) account for a free Gemini API key.
- [ngrok](https://ngrok.com/) or another tunneling tool to expose your local server to the internet.

### 2. Install Dependencies
Run the following command inside the project directory:
```bash
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
copy .env.example .env
```
Fill in the values in `.env`:
- `GEMINI_API_KEY`: Get a free key from Google AI Studio.
- `VERIFY_TOKEN`: A custom random string of your choice (e.g. `my_super_secret_token_123`).
- `WHATSAPP_TOKEN`: Meta WhatsApp Temporary or Permanent Access Token.
- `PHONE_NUMBER_ID`: Meta Developer Console Phone ID.

---

## 🌐 Exposing and Verifying Webhook

Meta requires your webhook to be accessible via `https`.

1. **Start the local server**:
   ```bash
   npm run dev
   ```
   *The server runs on port 3000 by default.*

2. **Start ngrok tunnel**:
   In a separate terminal, expose port 3000:
   ```bash
   ngrok http 3000
   ```
   Copy the secure forwarding URL (e.g., `https://xxxx-xx-xx.ngrok-free.app`).

3. **Configure Meta Webhook**:
   - Go to your app in the **Meta Developers Portal**.
   - Under **WhatsApp -> Configuration**, click **Edit Webhook**.
   - **Callback URL**: paste your ngrok URL followed by `/webhook` (e.g. `https://xxxx-xx-xx.ngrok-free.app/webhook`).
   - **Verify Token**: paste the exact string you configured as `VERIFY_TOKEN` in your `.env` file.
   - Click **Verify and Save**.

4. **Subscribe to Webhook Fields**:
   - Under **Webhook fields** in Meta Developers Portal, find **messages** and click **Subscribe**.

---

## 🛠️ Development & customisation

- **AI Persona**: You can modify the system instructions for the AI agent in `index.js` under the `generateAIResponse` function.
- **Handling Images / Audio**: We can extend the receiver under `POST /webhook` to handle media and process them using Gemini.

## 🤖 AI model routing

| Job | Model |
| --- | --- |
| WhatsApp text replies, Contact Brain, notes, meeting copilot | `qwen3.8-flash` (Alibaba) |
| Voice notes | `qwen3-asr-flash` (Alibaba), Gemini audio fallback |
| Images / cards / OCR | `qwen3.8-omni-flash` (Alibaba) |
| Strict JSON (gold actuals, trade extractor) | `deepseek-v4.1-flash` (via Alibaba) |
| PDF / documents | `gemini-2.5-flash` (extraction only — the reply is written by the cheap text engine) |

DeepSeek runs through the Alibaba (DashScope) key by default, so there is one bill and one fewer
secret to protect. Set `DEEPSEEK_VIA_DASHSCOPE=false` and provide `DEEPSEEK_API_KEY` to bill the
official DeepSeek API instead; the model name switches to `deepseek-flash` automatically.
See [aiProviders.mjs](./aiProviders.mjs).

Credentials belong in the hosting environment (Render → Environment), never in the repository or
the Firestore settings document.

## 💰 Prompt-cache discipline (read this before adding a new AI section)

Providers cache the **start** of a request and match it on an exact prefix. A cache hit costs
about a tenth of a fresh prompt token (Qwen $0.016 vs $0.16 per million, DeepSeek $0.03 vs $0.30),
so one character changing early in the prompt makes everything after it full price again.

Every AI prompt in this app is therefore assembled with [promptCache.mjs](./promptCache.mjs):

```js
import { orderParts, cacheStats, cachedTokensFrom } from './promptCache.mjs';

const systemPrompt = orderParts({
  stable:   [globalRules, ruleBook, playbook],      // identical for every call
  semi:     [perContactCard, businessTank],         // identical per contact
  volatile: [transcript, incomingMessage]           // different every call
});
```

Rules that keep the hit rate high:

1. **Volatile content goes last.** The transcript and the new message are the only things that
   change per call, so nothing may be appended after them. `withRuleBook()` appends — fetch
   `ruleBookText()` early and put it in the `stable` array instead.
2. **Report cached tokens at every `recordAiCall`.** Pass `cachedTokens: cachedTokensFrom(response)`.
   Without it the dashboard shows 0% and the saving is invisible. `cachedTokensFrom` reads
   OpenAI/Qwen `usage.prompt_tokens_details.cached_tokens`, DeepSeek `prompt_cache_hit_tokens`,
   Gemini `usageMetadata.cachedContentTokenCount` and Anthropic `cache_read_input_tokens`.
3. **`recordAiCall` reads `area`, `tokensIn`, `tokensOut` — not `source` or `success`.** Passing
   the wrong field silently logs 0 tokens.
4. **Do not inject a block only sometimes in the middle of `stable`.** A conditional block that
   appears and disappears shifts everything after it. Put conditionals in `semi` (see the Business
   Data Tank in [waWebClient.js](./waWebClient.js)).
5. **Cap the output.** Output is the expensive half of the bill (Qwen $0.16 in vs $0.47 out,
   DeepSeek $0.30 vs $1.20). WhatsApp replies use `waReplyMaxTokens()` — 700 tokens by default,
   override with `WA_REPLY_MAX_TOKENS`.

The AI usage panel shows the result as a **CACHE HIT** card: hit rate, cached-token count and the
dollars the cache already saved. A rate under 40% means something volatile has moved to the front
of a prompt — `logCacheShape()` logs the stable fingerprint per contact so the change is visible in
the server log rather than only on the bill.

When using DeepSeek / Qwen from **VS Code** (Copilot custom models), the same rule applies at the
editor level: keep a long-lived chat session, put stable context (repo conventions, file listings)
early and paste changing content late, and avoid editing files mid-session — every tree change
invalidates the cached prefix and the next request is billed in full.

## 🧠 Contact Brain — who is family, who is a customer, and which language

The per-contact brain card ([contactBrain.mjs](./contactBrain.mjs)) is the highest-priority block
in the WhatsApp reply prompt, so four rules live there and are enforced in
[waWebClient.js](./waWebClient.js):

1. **Family is never a customer.** If the card's *Relationship* is family
   (`mother`, `father`, `son`, `sister`, `wife`, `relative`, `friend`, … —
   `isFamilyRelationship()`), the reply prompt forbids asking for company, country, business
   activity, GST/NTN or "business tafseel". The Contact Book intake nudge
   (`contactIntel.contactDutyPrompt`) and the "unsaved number → ask for their details" guidance are
   both suppressed for that contact, whatever the Contact Book type says.
2. **The owner's language setting wins.** The brain prompt ends with a **LANGUAGE LOCK** that
   explicitly overrides the generic "mirror the sender's language" rule, and
   `ensureReplyLanguage()` re-checks the finished reply — "Pure Urdu text" answered in English (or
   Roman Urdu answered in Urdu script) is rewritten before it is sent.
3. **A business enquiry makes a customer.** `contactIntel.looksLikeBusinessEnquiry()` scores the
   inbound text (products, rates, quantity, MOQ, orders, GST…). When it fires, the Contact Book
   entry is promoted to **Customer**, or to **VIP Customer** for an order-sized ask, and the
   **Business Data Tank** is injected into the prompt as the only source of truth for company,
   products, rates and capacity. A figure that is not in the tank is never invented.
4. **No Hindi, ever — including transcripts.** Voice notes are transcribed straight into Roman
   Urdu or English: the ASR is told so up front, and every transcript passes
   `ensureNoDevanagari()` afterwards. Devanagari can never reach a prompt, a stored message or an
   outbound reply.

Family contacts are exempt from rules 3 and 4's business part: if they raise business themselves the
AI answers plainly as family would, without the tank dump.

### 🎭 Live voice — the AI copies how you are writing right now

The long-term `learned.style` is an average of up to 90 of your messages, so a bargaining tone and a
payment-chasing tone blur together. The **live voice** read is separate and fast:

- after **every 3 of your own replies** in a chat (`VOICE_LEARN_EVERY`), `maybeLearnVoice()` reads your
  latest 12 messages plus the contact's last 8 and stores `learned.live`: **mode** ("payment chasing
  (wusooli)", "business bargaining", "informal chat", "family/personal"…), **register** (does he use
  aap or tum), **tone**, **typing habits**, the **words he actually uses**, 3–5 **verbatim sample lines**
  and a list of things he never does;
- the reply prompt then carries a **LIVE VOICE MATCH** block with an explicit *no rakh-rakhao* rule —
  no extra "sir"/"please", no longer sentences, no extra emojis, no upgrading the register — and it is
  told to press for payment when the mode is wusooli;
- it costs one small call, is skipped for 90 seconds after a read, never runs twice at once, and is
  fire-and-forget so it cannot slow a reply. It stays in force until your next 3 replies show a
  different style;
- **🎭 Read my style now** in *Brain Card → Learned Memory* forces a read immediately and shows the
  result (`POST /api/brain/:jid/voice`).

---

## 🏗️ Websites Workshop — auditing a site from the repo

Two scripts let the workshop be driven from VS Code instead of the dashboard:

- **`scripts/alqaryan-audit.mjs`** — reads a site's sitemap and checks every page for the things the
  workshop tracks: mixed content, alt text, unique titles/H1s, canonicals, `noindex`, viewport,
  cache/CDN headers, structured data, WhatsApp/tel/form presence and the www + trailing-slash
  redirects. Read-only; prints a summary and can dump JSON.
- **`scripts/workshop-set-step.mjs`** — writes one process step (or a to-do task) into the same
  Firestore document the dashboard uses (`appData/websitesWorkshop`), then reads it back to prove it
  saved. `--show` prints what is still open, with the seed default used where the DB has no override.

A "done" note should always carry the evidence that closed it (how many pages, what was measured),
because the next engineer reads the note, not the audit log.

---

## 🧾 Commission Accounts (`/commission`)

A separate, self-contained ledger app for a commission broker: one company sells material to
another through us, and we keep a percentage of the **GST amount** of that deal. It replaces
`S.E.ENGINEERING GST SHEET-2.xlsx` and is branded for **Qaryan Brokerage**.

Open it at **`/commission`** (also `/commission-accounts`). It has its own sign-up/sign-in and
does not use the dashboard admin token.

### The calculation

```
amount  = qty × rate
GST     = amount × GST%          (18% on plastic raw material)
commission = GST × commission%   (20% for most companies, 30% for Saqi Industry)
```

The commission % is stored per company (`Manage Master → Customers & Companies`), so a new entry
fills it in automatically and the form shows the working as you type.

### Menu

| Menu | What it does |
| --- | --- |
| All Commission Transactions Register | One ledger: seller, **dealer name**, the buyer it went to, invoice, item, GST, commission, received, running balance. The **top bar** holds the search, the company filter, a **clickable date-range chip** (calendar with presets — all dates, today, this month, last month, this year, financial year) and the live **transaction count**; a strip under the list always shows the totals for the filtered set: transactions, qty, amount, GST value, commission, received and remaining (commission − received). 40 rows a page. |
| Manage Master → Customers & Companies · **Dealer Names** · Items · **Indirect Expenses** · Taxes · Cash / Banks · Commission Rates | Add, edit and remove every master name. Dealers are the third-party people who bring the customers — money is received from them. **Indirect Expenses** are the heads you can pay out of a payment voucher (chalaan fees, wakeel, audit…). |
| Quick Vouchers → Payment · Receipt · Journal · Purchase · Sales | Opens the voucher **form** straight away (no register in between) as a **full page** — the whole window, its own header and a pinned footer with Save — the list the entry lands in stays behind it, so saving shows the result immediately. Purchase and Sales both carry a line-by-line table with GST per line, and **a sales voucher *is* the commission voucher**: seller, buyer, dealer, GST per line and the brokerage % (switched on by default). |
| Purchase Register | Every purchase voucher with its seller, buyer, dealer, items, quantity, sub total, GST and total. Search and a **clickable date-range chip** (same smart calendar) sit in the top bar; a strip at the bottom always shows the totals: vouchers, qty, sub total, GST value, total and commission. |
| Sales Register | Every sale voucher with seller, buyer, dealer, items, quantity, sub total, GST charged and total; a Brokerage column appears when any sale carries commission. Same top-bar search/date range and the same bottom totals strip. |
| Seller Register | Seller-wise control: for each seller, how many deals, which buyers they went to, the value, the GST and the commission earned. |
| Buyer Register | The same position from the buyer side: how many deals, which sellers supplied them, value, GST and commission. |
| **Dealers Register** | The list of dealers with deals, commission, received and balance — the dealer name is clickable and opens that dealer's full ledger: inv date, inv no., seller name, buyer name, item name, HS code, qty, amount, GST %, GST value, commission %, commission value (Dr.), received from dealer (Cr.) and running balance. The ledger's totals (deals, qty, amount, GST, commission, received, balance) sit right above the columns, **Inv Date** sorts oldest/newest, and the magnifier in the top bar opens a search over everything on the page — including dates and amounts. |
| Journal Vouchers | The list of journal vouchers, since they do not appear in the commission register. |
| **Expenses Register** | Every payment that went out — commission paid to a dealer or an **indirect expense** — with date, voucher no., who it was paid to, kind, the bank/cash it came from, narration and amount. Search and the clickable date chip sit in the top bar with the payment count; the bottom bar totals payments, expenses, dealer payments and the amount paid; 40 rows a page. |
| **Reports Section** | **The app opens on this page.** Two reports in one page — **Dealers Report** and **Companies Report** — picked in the top bar next to a **clickable date range** that filters every figure. On the dealers side the top bar also carries the position that matters: **Receivable** (commission still to come in) and, when a dealer has been paid in advance, **Payable** — each totalling the boxes on screen. Each dealer (or company) is a **box** carrying its own numbers: dealers show **commission (in)**, **received (out)** and the **balance**, companies show **qty, value, purchased (in), sold (out) and GST**. Clicking a box opens that account's report month by month; **clicking a month row** then lists every transaction of that month (date, inv no., seller, buyer, item, HS code, qty, amount, GST, commission, received and running balance — or the dealer and the seller/buyer role on a company tab). The **Month** and **Date** columns sort newest/oldest on click, and the whole path sits in the top bar as a breadcrumb — `3 dealers › S.E. ENGINEERING › Sep 2026` — where the count returns to the boxes and the name returns to the months. Nothing else is on the page: the list takes the window and the totals sit in the bottom bar. |
| Register Dashboard | Placeholder ("coming soon") for ageing, GST register and monthly position. |
| Settings & Sync | Password change, team logins (admin), manual sync, JSON backup, full re-download. |

### Seller, buyer and dealer on a voucher

This is a brokerage book, so a **Purchase or Sales voucher names every side of the deal**.
Each voucher stores `seller`, `buyer` and `dealer`; `party` keeps its old meaning (the seller on a
purchase, the buyer on a sale) so older rows and the registers still read correctly. The pickers
are real drop-downs of the master names, with **＋ Add a new name…** for a company that is not in
the master yet. Selecting a seller fills in that company's commission %.

**Money only moves through dealers.** Receipt vouchers list dealers — never a seller or
a buyer — so the Dealers Register is the place that shows what is still to come in. A **payment
voucher pays either a dealer or an indirect expense**: the "Paid to" list carries both groups, and an
expense payment is filed under that head, which is what the Expenses Register reports.

### The Excel history

The attached sheet was the business of a single dealer, **S.E. ENGINEERING**, so on the first start
after upgrading the server rewrites every imported commission invoice as a sales voucher carrying
that dealer name (and links the imported receipts to it). The migration keeps the same record ids,
so each device picks the change up through the normal delta sync, and it takes a database backup
first. The client still reads old `invoice` rows, so the books look right even before the server is
restarted.

### Importing another dealer's Excel

Every dealer's sheet can be brought in the same way. The workbook is converted once into a seed
file, and the server imports that seed at start-up:

```bash
python scripts/commission-xlsx-to-seed.py "C:/path/DEALER BOOK.xlsx" \
       scripts/commission-<dealer>-seed.json --dealer="DEALER NAME"
```

Then add one line to `WORKBOOK_SEEDS` in [commissionApi.mjs](./commissionApi.mjs) and restart. The
import is **idempotent** — each row keeps the id derived from its sheet row, so a restart writes
nothing twice and never touches an entry typed in the app. Deals land as **sales vouchers** (in this
book a sales voucher *is* the commission voucher) that carry the dealer, and the money the dealer
paid lands as **receipts**, which is exactly what the dealer register balances against.

The converter reads the columns by their header text (so a shifted sheet still works) and repairs
the typos a hand-typed sheet always has: `29..02.2024`, `02.09.20204`, `25.02.206`, blank dates in a
merged block, receipts whose year is wrong for where they sit in the sheet, `MUSAB PACKGES` vs
`MUSAB PACKAGES`, names split over several lines, HS codes pasted as long descriptions. Every repair
is printed when the seed is generated, so nothing is fixed silently.

The second book already imported is **ZUBAIRI** (Zubairee Parties): 572 deals, 67 receipts,
5,717,330 qty, 737,066,855 amount, 132,613,788.10 GST, **13,261,378.81 commission**, 10,261,351.00
received — closing balance **3,000,027.81**, which is the sheet's own control total. The smoke test
(`node scripts/commission-smoke-test.mjs`) re-checks those figures against the seed on every run.

### Date ranges

The All Commission Transactions Register carries the date range in its top bar: click the chip to
open the calendar (presets: all dates, today, yesterday, last 7 days, this month, last month, this
year, financial year — or tap a first and a last day). The Purchase and Sales registers keep simple
From/To date inputs in their toolbar (`state.report`). The Day Book was removed: the All Commission
Transactions Register already lists every deals, receipt and payment with its totals.

### Phones

Every screen is built for a phone first: lists turn into labelled cards, forms open as
bottom sheets with a sticky Save bar, the voucher line table stacks into one labelled block per
line, and all touch targets are at least 38–42px. Inputs are 16px so iOS never zooms in. It was
checked at 390 × 844 (iPhone) and stays free of horizontal scrolling down to 320px.

### Offline-first storage (AccPro style)

1. Every write goes to **this device** first (IndexedDB, with a localStorage fallback), so the app
   never waits for the network and keeps working with no connection.
2. A background sync pushes only what changed and pulls only the delta — the server answers
   "what changed after sequence N?" instead of re-sending the book.
3. Conflicts resolve last-writer-wins on `updatedAt`; nothing is silently dropped.
4. The server keeps everything in **SQLite on the VPS** (`data/commission.db`), not Firestore, so a
   busy day costs zero Firestore reads/writes. A copy is written to `data/backups/` every six hours
   (last 21 kept). If `node:sqlite` is unavailable the module falls back to a JSON file store, so
   the app still runs on an older Node.

Sequence numbers live in `records.seq`; tombstones (`deleted = 1`) propagate deletes to other
devices.

### First run

The database is empty on first boot, so the server imports the Excel history from
[`scripts/commission-seed.json`](./scripts/commission-seed.json) — 132 commission invoices and 57
receipt/payment vouchers (commission 17,360,600 · received 11,517,000 · expense 143,474 · balance
5,700,126, matching the sheet). The first account created becomes the administrator.

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `COMMISSION_DATA_DIR` | `./data` | Where the database, secret and backups live |
| `COMMISSION_DB_PATH` | `<data dir>/commission.db` | Explicit database file |
| `COMMISSION_SECRET` | generated into `data/commissionSecret.key` | Signing key for session tokens |
| `COMMISSION_SIGNUP_CODE` | empty | Invite code needed for every account after the first |
| `COMMISSION_TOKEN_DAYS` | `60` | Login lifetime |

### Maintenance scripts

```bash
# API + sync + permission checks against a throwaway database
node scripts/commission-smoke-test.mjs

# Re-import the Excel history after correcting the sheet
node scripts/commission-repair-from-seed.mjs --user <admin> --password <pw> --dry
node scripts/commission-repair-from-seed.mjs --user <admin> --password <pw>

# Rebuild scripts/commission-seed.json from the spreadsheet
python scripts/commission-seed-from-excel.py "C:\path\to\S.E.ENGINEERING GST SHEET-2.xlsx"

# Websites Workshop — audit a live site, then record a verified step without opening the browser
node scripts/alqaryan-audit.mjs
node scripts/workshop-set-step.mjs --site alqaryangroup.com --show
node scripts/workshop-set-step.mjs --site alqaryangroup.com --step https-mixed \
     --status done --note "Checked 44/44 pages: no http:// asset references"
node scripts/workshop-set-step.mjs --site alqaryangroup.com --todo "Photograph the plant — 24 photos" \
     --suggestion "Shot list in alqaryan-site/image-plan.md"
```

The repair script removes only rows that came from the sheet (they carry a `source` row) and keeps
everything typed into the app.
