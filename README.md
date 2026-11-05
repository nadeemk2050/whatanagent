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
| PDF / documents / last-resort fallback | `gemini-2.5-flash` |

DeepSeek runs through the Alibaba (DashScope) key by default, so there is one bill and one fewer
secret to protect. Set `DEEPSEEK_VIA_DASHSCOPE=false` and provide `DEEPSEEK_API_KEY` to bill the
official DeepSeek API instead; the model name switches to `deepseek-flash` automatically.
See [aiProviders.mjs](./aiProviders.mjs).

Credentials belong in the hosting environment (Render → Environment), never in the repository or
the Firestore settings document.

---

## 🧾 Commission Accounts (`/commission`)

A separate, self-contained ledger app for a commission broker: one company sells material to
another through us, and we keep a percentage of the **GST amount** of that deal. It replaces
`S.E.ENGINEERING GST SHEET-2.xlsx`.

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
| Commission Register | One ledger: seller, invoice, item, GST, commission, received, running balance. Filter by company/year, switch to company-wise summary, export CSV, print. |
| Manage Master → Customers & Companies · Items · Expenses · Taxes · Cash / Banks · Commission Rates | Add, edit and remove every master name. |
| Quick Vouchers → Payment · Receipt · Journal · Purchase · Sales | Normal vouchers. Purchase and Sales carry a line-by-line table with GST per line, and an optional "record commission from this deal" box that writes the matching entry into the register. Editing the voucher updates that entry; switching the box off removes it. |
| Register Dashboard | Placeholder ("coming soon") for ageing, GST register and monthly position. |
| Settings & Sync | Password change, team logins (admin), manual sync, JSON backup, full re-download. |

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
```

The repair script removes only rows that came from the sheet (they carry a `source` row) and keeps
everything typed into the app.
