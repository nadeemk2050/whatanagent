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
| Manage Master → Customers & Companies · **Dealer Names** · Items · Expenses · Taxes · Cash / Banks · Commission Rates | Add, edit and remove every master name. Dealers are the third-party people who bring the customers — money is received from them. |
| Quick Vouchers → Payment · Receipt · Journal · Purchase · Sales | Opens the voucher **form** straight away (no register in between); the list the entry lands in stays behind it, so saving shows the result immediately. Purchase and Sales both carry a line-by-line table with GST per line, and **a sales voucher *is* the commission voucher**: seller, buyer, dealer, GST per line and the brokerage % (switched on by default). |
| Purchase Register | Every purchase voucher with its seller, buyer, dealer, items, quantity, sub total, GST and total. Search and a **clickable date-range chip** (same smart calendar) sit in the top bar; a strip at the bottom always shows the totals: vouchers, qty, sub total, GST value, total and commission. |
| Sales Register | Every sale voucher with seller, buyer, dealer, items, quantity, sub total, GST charged and total; a Brokerage column appears when any sale carries commission. Same top-bar search/date range and the same bottom totals strip. |
| Seller Register | Seller-wise control: for each seller, how many deals, which buyers they went to, the value, the GST and the commission earned. |
| Buyer Register | The same position from the buyer side: how many deals, which sellers supplied them, value, GST and commission. |
| **Dealers Register** | The list of dealers with deals, commission, received and balance — the dealer name is clickable and opens that dealer's full ledger: inv date, inv no., seller name, buyer name, item name, HS code, qty, amount, GST %, GST value, commission %, commission value (Dr.), received from dealer (Cr.) and running balance. The ledger's totals (deals, qty, amount, GST, commission, received, balance) sit right above the columns, **Inv Date** sorts oldest/newest, and the magnifier in the top bar opens a search over everything on the page — including dates and amounts. |
| Journal Vouchers | The list of journal vouchers, since they do not appear in the commission register. |
| **Reports Section** | Two reports in one page — **Dealers Report** and **Companies Report** — picked in the top bar next to a **clickable date range** that filters every figure. Each dealer (or company) is a **box** carrying its own numbers: dealers show **commission (in)**, **received (out)** and the **balance**, companies show **qty, value, purchased (in), sold (out) and GST**. Clicking a box opens that account's report month by month (oldest first, running balance for dealers) with a **← All dealers / companies** way back; the totals of the open account (or of every box) sit in the bottom bar, and **Open full ledger / register** jumps to the line-by-line book. |
| Register Dashboard | Placeholder ("coming soon") for ageing, GST register and monthly position. |
| Settings & Sync | Password change, team logins (admin), manual sync, JSON backup, full re-download. |

### Seller, buyer and dealer on a voucher

This is a brokerage book, so a **Purchase or Sales voucher names every side of the deal**.
Each voucher stores `seller`, `buyer` and `dealer`; `party` keeps its old meaning (the seller on a
purchase, the buyer on a sale) so older rows and the registers still read correctly. The pickers
are real drop-downs of the master names, with **＋ Add a new name…** for a company that is not in
the master yet. Selecting a seller fills in that company's commission %.

**Money only moves through dealers.** Receipt and Payment vouchers list dealers — never a seller or
a buyer — so the Dealers Register is the place that shows what is still to come in.

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
```

The repair script removes only rows that came from the sheet (they carry a `source` row) and keeps
everything typed into the app.
