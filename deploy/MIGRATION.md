# Moving WhatAnAgent to a new server

The app is **almost stateless**. Everything it knows is in three things, and the rest is rebuilt
from git by `deploy/install.sh`:

| Thing | Why it matters | If lost |
| --- | --- | --- |
| `auth_info_baileys/` | the linked WhatsApp device — this **is** your login | re-scan the QR code |
| `.env` | WhatsApp/AI/Drive/boss-number keys | re-enter every key by hand |
| `data/` | SQLite DBs, BL inbox, saved media, X-Ray rules, chat analyses | BL history and saved files gone |

Code, the systemd unit and the Caddy config are all in the repo, so a new server is one command
away: `deploy/install.sh`.

> **The one rule that actually matters:** never run the old and new server at the same time. Two
> processes sharing one WhatsApp session make WhatsApp log one of them out. Stop the old one first.

## Before you start — should you migrate at all?

Compare two prices first:

1. **Upgrade in place** (Tencent Lighthouse → *Upgrade* on the instance card): keeps the disk,
   the IP, the WhatsApp session and the DNS. No migration, no downtime beyond a reboot.
2. **New instance elsewhere**: usually cheaper per year, but costs one migration window.

If the in-place upgrade to 4 GB + 1 year is within roughly 25–30% of the new provider's price,
**take the in-place upgrade** — zero risk beats a small saving. If it is much more expensive, the
move below is a 10-minute job.

Whatever you decide, **renew or extend the current instance for one month today** if the deadline
is days away. Then you migrate calmly instead of under pressure.

## The move (about 10 minutes)

### 1. Prepare the new server

Fresh Ubuntu 22.04/24.04, 2 vCPU / 4 GB is plenty. Note its public IP.

```bash
# on the NEW server, as root
sudo DOMAIN=whatanagent.duckdns.org bash -c \
  'git clone --depth 1 https://github.com/nadeemk2050/whatanagent.git /opt/whatanagent && bash /opt/whatanagent/deploy/install.sh'
```

`install.sh` is idempotent: Node 22, 2 GB swap, systemd unit, Caddy with automatic HTTPS, and a
template `.env`.

### 2. Export from the old server (stops the app)

```bash
# on the OLD server
sudo bash /opt/whatanagent/deploy/migrate-export.sh
```

This stops `whatanagent`, then writes `backups/whatanagent-migrate-<stamp>.tar.gz` containing
`.env`, `auth_info_baileys/` and `data/`, plus a manifest with the commit and a sha256.

### 3. Copy it across

From your own machine (or straight server-to-server):

```bash
scp -i <your-key> ubuntu@<OLD-IP>:/opt/whatanagent/backups/whatanagent-migrate-*.tar.gz /tmp/

# one-liner alternative, no laptop hop:
ssh ubuntu@<OLD-IP> 'tar czf - -C /opt/whatanagent .env auth_info_baileys data' \
  | ssh ubuntu@<NEW-IP> 'sudo tar xzf - -C /opt/whatanagent'
```

### 4. Import on the new server

```bash
sudo bash /opt/whatanagent/deploy/migrate-import.sh /tmp/whatanagent-migrate-<stamp>.tar.gz
```

It verifies the archive, moves any existing session/`.env` aside (kept as `*.before-migrate-*`),
extracts, fixes ownership, reloads systemd and starts the app.

### 5. Point the world at the new server

Only after step 4 shows the service running and the log is clean.

1. **DuckDNS** — update `whatanagent.duckdns.org` to the new IP.
2. **GitHub secret** — `DEPLOY_HOST` must be the new IP (Settings → Secrets → Actions), otherwise
   the next push deploys to the dead server:

   ```bash
   gh secret set DEPLOY_HOST --body '<NEW-IP>'
   ```
3. Wait for DNS (`dig +short whatanagent.duckdns.org`), then check:
   `curl -s https://whatanagent.duckdns.org/candl/api/wa/status`

### 6. Verify, then retire the old server

```bash
systemctl status whatanagent
journalctl -u whatanagent -n 50
curl -s https://whatanagent.duckdns.org/candl/api/wa/status      # expect "connected"
curl -s https://whatanagent.duckdns.org/proforma/ -o /dev/null -w '%{http_code}\n'
```

Keep the old instance **stopped but alive for 24–48 hours** as a rollback. If anything is wrong,
start it again (after stopping the new one) and you are back exactly where you were.

### Rollback in one line

```bash
sudo systemctl stop whatanagent          # on the new server
sudo systemctl start whatanagent         # on the old server
# and point DuckDNS + DEPLOY_HOST back to the old IP
```

## After the move

- Run a deploy once (push anything, or Actions → *Deploy to Tencent Lighthouse* → Run workflow)
  so the Caddy/unit files come from the current commit.
- Check disk headroom: `df -h /` and `du -sh /opt/whatanagent/data`. The media archive is capped at
  900 MB with oldest-first eviction, but a 40 GB disk is worth replacing with 60–80 GB.
- Nightly session backup keeps working: `deploy/backup.sh` (cron) writes into `backups/`.
