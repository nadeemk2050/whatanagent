# Deployment ownership — Render is MAIN, Railway PAUSED (2026-09-24)

> ⚡ **2026-09-24 cutback executed:** production moved back from Railway to Render.
> Railway service `whatanagent-staging` has **no running deployment** (compute stopped + GitHub source disconnected).
> Render (`whatanagent-api`, https://whatanagent.onrender.com) runs the webhook + 60s schedulers + WhatsApp-Web (Baileys) session.

## Current ownership (must always be exactly ONE owner per resource)

| Resource | Owner | Guard |
|---|---|---|
| Meta webhook | **Render** — `https://whatanagent.onrender.com/webhook` (verify token unchanged: `my_whatsapp_agent_verify_token_2026`) | one callback URL per Meta app |
| 60s schedulers | **Render** | `appData/runtimeConfig { renderStandby: false }` — live-checked every tick |
| WhatsApp-Web (Baileys linked device) | **Render** | boot-time check `renderStandby !== false`; Railway/local nodes skip via `STAGING_MODE=1` |
| Firestore | shared by all nodes | single source of truth (secrets live here, not in env vars) |

## What was executed (2026-09-24)

```powershell
railway variable set STAGING_MODE=1 --skip-deploys                  # insurance: if it ever boots, it stays harmless
railway service source disconnect --service whatanagent-staging     # stop auto-deploys from GitHub pushes
railway down -y                                                     # remove the running deployment (compute stops)
node setRenderActive.js                                             # Firestore: renderStandby = false (Render becomes active)
git push                                                            # Render auto-deploy -> fresh boot -> schedulers + WA-Web
```

Then (USER action): Meta dashboard → WhatsApp → Configuration → Webhook → callback URL `https://whatanagent.onrender.com/webhook` → Verify and save.

## Verify any time

- `GET https://whatanagent.onrender.com/healthz` → `role:"render"`, `schedulers:"active"`, `staging:false`, `dryRun:false`
- `GET https://whatanagent.onrender.com/api/wa-web/status` → connected
- `railway service status --json` → `deploymentId: null` (paused)

## ⚠️ Render free tier sleeps after ~15 min idle!

- Cold start = 30-60s, and the 60s schedulers pause while the instance is asleep (reminders/announcements fire on the next wake).
- Meta webhook verification can fail on the first try if the instance is asleep → just click **Verify** again after a minute.
- For always-on production either:
  1. **Free:** external uptime pinger every 5-10 min (UptimeRobot 5-min monitor, cron-job.org, etc.) on `https://whatanagent.onrender.com/healthz` — keeps the instance awake 24/7.
  2. **Paid:** Render dashboard → service → upgrade instance to **Starter ($7/mo)** → never sleeps.

## Re-activate Railway (reverse cutover, if ever needed)

```powershell
node setRenderStandby.js                    # 1. Firestore: renderStandby = true (Render schedulers retire within 60s)
# 2. Render dashboard -> Manual Deploy -> Restart (so Render RELEASES the WA-Web session)
railway service source connect --repo nadeemk2050/whatanagent --branch master --service whatanagent-staging
railway variable delete STAGING_MODE --skip-deploys
railway redeploy --from-source -y           # 3. Railway boots as main node (schedulers + WA-Web)
# 4. Meta dashboard: webhook URL -> https://whatanagent-staging-production.up.railway.app/webhook -> Verify and save
```

## Local development caution

Render now OWNS the WhatsApp-Web session and the 60s schedulers. Any local run must use `STAGING_MODE=1`, otherwise it would fight the linked device and double-send. (The WA-Web page shows a staging banner when `staging:true`.)

## Known open issue (2026-09-24)

- Railway logs showed continuous `RESOURCE_EXHAUSTED: Write stream exhausted maximum allowed queued writes` (Firestore) — a heavy writer is saturating the client write queue. Same code now runs on Render. Investigate: likely auth-session chunk sync / vault sweep / new Align engines. Also the logs contain a raw Signal session dump (private keys!) printed by some debug log — find and remove it.

## History

- 2026-09-12: Railway took over as main node (Render kept as silent standby, `renderStandby:true`).
- **2026-09-24: cutback to Render; Railway paused** (this file).
