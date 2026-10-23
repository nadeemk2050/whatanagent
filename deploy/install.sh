#!/usr/bin/env bash
# =============================================================================
# WhatAnAgent — Tencent Lighthouse (Ubuntu 24.04) one-shot installer
# =============================================================================
# Usage (run as root on a FRESH server):
#   sudo DOMAIN=whatanagent.duckdns.org bash install.sh
#
# Idempotent: safe to re-run. It will not overwrite an existing .env.
# =============================================================================
set -euo pipefail

DOMAIN="${DOMAIN:-}"
APP_DIR="/opt/whatanagent"
REPO="https://github.com/nadeemk2050/whatanagent.git"
BRANCH="${BRANCH:-master}"
NODE_MAJOR="${NODE_MAJOR:-22}"
SWAP_MB="${SWAP_MB:-2048}"
RUN_USER="${RUN_USER:-ubuntu}"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[!] %s\033[0m\n' "$*"; }

if [ "$(id -u)" -ne 0 ]; then echo "Run with sudo."; exit 1; fi

# ---------------------------------------------------------------- base packages
log "Installing base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git ca-certificates gnupg ufw openssl

# ---------------------------------------------------------------- swap (2 GB)
log "Configuring ${SWAP_MB}MB swap (protects against OOM while processing images)"
if ! swapon --show | grep -q '/swapfile'; then
  if [ ! -f /swapfile ]; then
    fallocate -l "${SWAP_MB}M" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count="${SWAP_MB}"
    chmod 600 /swapfile
    mkswap /swapfile
  fi
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=10 >/dev/null 2>&1 || true
  grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
else
  echo "swap already active"
fi

# ---------------------------------------------------------------- node LTS
log "Ensuring Node.js ${NODE_MAJOR} LTS"
NEED_NODE=1
if command -v node >/dev/null 2>&1; then
  CUR="$(node -v | sed 's/v\([0-9]*\).*/\1/')"
  if [ "${CUR:-0}" -ge "${NODE_MAJOR}" ]; then NEED_NODE=0; echo "node $(node -v) already installed"; fi
fi
if [ "$NEED_NODE" -eq 1 ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
node -v; npm -v

# ---------------------------------------------------------------- firewall
log "Configuring firewall (22, 80, 443 only)"
ufw allow 22/tcp   >/dev/null || true
ufw allow 80/tcp   >/dev/null || true
ufw allow 443/tcp  >/dev/null || true
ufw --force enable >/dev/null
ufw status | sed -n '1,12p'

# ---------------------------------------------------------------- application
log "Fetching application code"
mkdir -p "$(dirname "$APP_DIR")"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$APP_DIR"
else
  cd "$APP_DIR"
  git fetch --depth 1 origin "$BRANCH"
  git reset --hard "origin/${BRANCH}"
fi
cd "$APP_DIR"

log "Installing npm dependencies (production only)"
if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

mkdir -p "$APP_DIR/auth_info_baileys" "$APP_DIR/auth_info_archive" "$APP_DIR/backups"
chown -R "$RUN_USER":"$RUN_USER" "$APP_DIR"

# ---------------------------------------------------------------- environment
if [ ! -f "$APP_DIR/.env" ]; then
  log "Creating .env from template"
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  chown "$RUN_USER":"$RUN_USER" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  warn "You MUST edit $APP_DIR/.env with real keys before the bot works."
  warn "Then run: systemctl restart whatanagent"
else
  echo ".env already exists — left untouched"
fi

# ---------------------------------------------------------------- systemd
log "Installing systemd service"
sed "s|__APP_DIR__|$APP_DIR|g; s|__RUN_USER__|$RUN_USER|g" "$APP_DIR/deploy/whatanagent.service" \
  > /etc/systemd/system/whatanagent.service
systemctl daemon-reload
systemctl enable whatanagent >/dev/null

# ---------------------------------------------------------------- caddy (HTTPS)
log "Installing Caddy for automatic HTTPS"
if ! command -v caddy >/dev/null 2>&1; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi
if [ -n "$DOMAIN" ]; then
  sed "s|__DOMAIN__|$DOMAIN|g" "$APP_DIR/deploy/Caddyfile" > /etc/caddy/Caddyfile
  systemctl restart caddy
  echo "HTTPS will be provisioned automatically for https://$DOMAIN"
else
  warn "No DOMAIN given — Caddy left untouched. Re-run with DOMAIN=your.host to enable HTTPS."
fi

# ---------------------------------------------------------------- backups
log "Installing nightly session backup"
if [ -f "$APP_DIR/deploy/backup.sh" ]; then
  install -m 755 "$APP_DIR/deploy/backup.sh" /usr/local/bin/whatanagent-backup
  cat > /etc/cron.d/whatanagent-backup <<'CRON'
# Nightly WhatsApp session backup (02:30 server time), keep 14 days
30 2 * * * root /usr/local/bin/whatanagent-backup >/var/log/whatanagent-backup.log 2>&1
CRON
fi

# ---------------------------------------------------------------- start
log "Starting the service"
systemctl restart whatanagent || true
sleep 3
systemctl --no-pager --lines=15 status whatanagent || true

log "Done"
cat <<EOF

Next steps:
  1) Edit secrets:   sudo nano $APP_DIR/.env
  2) Restart:        sudo systemctl restart whatanagent
  3) Health check:   curl -s localhost:3000/healthz
  4) Public check:   curl -s https://${DOMAIN:-YOUR_DOMAIN}/healthz
  5) WhatsApp QR:    open https://${DOMAIN:-YOUR_DOMAIN}/admin.html -> WhatsApp Web -> scan

Logs:   sudo journalctl -u whatanagent -f
EOF
