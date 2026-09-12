# Railway Replica (staging → production node)

> ⚡ **2026-09-12:** this node became the **MAIN production node** (webhook + schedulers). Render is kept as a silent standby — see "Production cutover" below.

- **URL:** https://whatanagent-staging-production.up.railway.app
- **Source:** `nadeemk2050/whatanagent` @ `master` — auto-deploys on every push. If a push does not trigger a deploy, re-run: `railway service source connect --repo nadeemk2050/whatanagent --branch master --service whatanagent-staging`
- **Plan note:** Railway trial (30 days or $5 credit). Always-on (`sleepApplication: false`, no cold starts). After trial: Hobby $5/mo, or stop the service in the dashboard.

## Why there are almost no secrets to mirror

All runtime secrets (WhatsApp token, DeepSeek key, phone number id, verify token, WABA id) live in the **shared Firestore `appData/settings` document**, not in environment variables. Render itself only sets `PORT` (see `render.yaml`), and Railway injects `PORT` automatically — the app listens on whatever port it receives.

Variables used during the 2026-09-12 cutover:

| Variable | Value | Purpose |
|---|---|---|
| `STAGING_MODE` | ~~1~~ **removed after cutover** | While set: disables the 60s schedulers on this node. Removed on 2026-09-12 — Railway now OWNS the schedulers |
| `API_VERSION` | `v20.0` | Same as production default |
| `DRY_RUN` | *(not set)* | Optional: set to `1` to block ALL outbound sends (logged instead) |

## Isolation guarantees (why this can never double-message customers)

1. **One scheduler owner** — exactly one node may run the 60s loops. Since the 2026-09-12 cutover **Railway runs them** (`schedulers:"active"`); Render is gated off by the `appData/runtimeConfig { renderStandby: true }` flag (live-checked on every tick). A local dev instance must also run with `STAGING_MODE=1` to avoid duplicating sends.
2. **One webhook owner** — Meta WhatsApp Cloud allows ONE callback URL per app. Since the 2026-09-12 cutover it points at Railway (`...up.railway.app/webhook`); Render no longer receives live events.
3. **Shared Firestore** — both nodes read/write the same DB (same app data), but only production mutates state autonomously (scheduler/webhook). Staging reacts only to direct calls.
4. **DRY_RUN** — for risky experiments add `DRY_RUN=1` on staging: every outbound text/template is logged (`[DRY-RUN] ... BLOCKED`) instead of sent, and the scheduler stays off.

## Health / monitoring

- `GET /healthz` → `{ ok, role, staging, dryRun, schedulers, uptimeSec }` (`role`: render/railway/local; `schedulers`: active | disabled:staging | disabled:dry-run | disabled:standby)
- Startup logs show: `[STAGING MODE - schedulers off]` and `[SCHEDULER] DISABLED (staging/dry-run instance)`.

## Testing playbook (parallel validation)

- Replay a webhook payload (use YOUR OWN number as sender) against:
  `POST https://whatanagent-staging-production.up.railway.app/webhook`
  The AI replies to that number only — customers are never touched.
- Harmless smoke tests: `POST /webhook` with `{}` → `EVENT_RECEIVED` (no side effects); `GET /admin.html`; `GET /healthz`.
- Watch logs live: `railway logs` (or `railway logs --lines 200`).

## Ops commands

```powershell
railway status                                   # linked project/deployment
railway logs --lines 200                         # runtime logs
railway variable set DRY_RUN=1 --skip-deploys    # enable dry-run
railway variable delete DRY_RUN --skip-deploys   # disable dry-run
railway redeploy                                 # manual redeploy
railway domain list                              # domains
```

## Production cutover — 2026-09-12 (Railway became the main node)

Sequence used (exactly one scheduler/webhook owner at every moment):

1. Set `appData/runtimeConfig { renderStandby: true }` (Firestore) — Render never runs the 60s schedulers while this flag is set; it is live-checked every tick.
2. Pushed the standby-gate code → Render auto-deployed → `schedulers:"disabled:standby"`.
3. Removed `STAGING_MODE` on Railway + `railway redeploy -y` → `schedulers:"active"`.
4. Meta dashboard: Webhook callback URL switched to `https://whatanagent-staging-production.up.railway.app/webhook` (verify token unchanged) → Verify and save.
5. Live customer message test.

### Rollback to Render (~2 minutes, during the standby window)

1. Firestore: set `appData/runtimeConfig { renderStandby: false }` → Render's schedulers resume within 60 seconds.
2. Railway: `railway variable set STAGING_MODE=1` then `railway redeploy -y` (retires its schedulers).
3. Meta dashboard: webhook URL back to `https://whatanagent.onrender.com/webhook` → Verify and save.

### After the observation window (3–7 days)

- Render dashboard → the `whatanagent-api` **web service** → **Settings → Suspend** (or scale to zero). Suspend ONLY this service — leave the project, logs and everything else intact. Do not delete.
- Optionally keep it suspended as an emergency cold standby.

### Billing

- Upgrade Railway to **Hobby ($5/mo)** before the trial expires (Railway dashboard → account/plan) to keep the number online continuously.

### Daily use

- Dashboard: https://whatanagent-staging-production.up.railway.app/admin.html (same-origin — no CORS issues).
