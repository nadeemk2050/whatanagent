# Railway Staging Replica (parallel node)

Staging twin of the production Render service for zero-downtime validation.

- **URL:** https://whatanagent-staging-production.up.railway.app
- **Source:** `nadeemk2050/whatanagent` @ `master` — auto-deploys on every push (same as Render)
- **Plan note:** Railway trial (30 days or $5 credit). Always-on (`sleepApplication: false`, no cold starts). After trial: Hobby $5/mo, or stop the service in the dashboard.

## Why there are almost no secrets to mirror

All runtime secrets (WhatsApp token, DeepSeek key, phone number id, verify token, WABA id) live in the **shared Firestore `appData/settings` document**, not in environment variables. Render itself only sets `PORT` (see `render.yaml`), and Railway injects `PORT` automatically — the app listens on whatever port it receives.

The only staging-specific variables:

| Variable | Value | Purpose |
|---|---|---|
| `STAGING_MODE` | `1` | Disables the 60s schedulers (follow-ups + scheduled AI tasks) on this replica |
| `API_VERSION` | `v20.0` | Same as production default |
| `DRY_RUN` | *(not set)* | Optional: set to `1` to block ALL outbound sends (logged instead) |

## Isolation guarantees (why this can never double-message customers)

1. **Schedulers OFF** — `startFollowUpScheduler()` exits immediately on staging (`STAGING_MODE`). Production Render remains the only node running the 60s loops, so shared scheduled tasks are never processed twice.
2. **One webhook owner** — Meta WhatsApp Cloud allows ONE callback URL per app; it still points at Render. Staging only processes payloads you manually POST to it.
3. **Shared Firestore** — both nodes read/write the same DB (same app data), but only production mutates state autonomously (scheduler/webhook). Staging reacts only to direct calls.
4. **DRY_RUN** — for risky experiments add `DRY_RUN=1` on staging: every outbound text/template is logged (`[DRY-RUN] ... BLOCKED`) instead of sent, and the scheduler stays off.

## Health / monitoring

- `GET /healthz` → `{ ok, service, staging, dryRun, uptimeSec }`
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
