#!/usr/bin/env bash
# =============================================================================
# WhatAnAgent — import an export onto a fresh server
# =============================================================================
# Prerequisite on the NEW server (once):
#   sudo DOMAIN=whatanagent.duckdns.org bash /opt/whatanagent/deploy/install.sh
# That creates /opt/whatanagent, Node, Caddy, the systemd unit and a template .env.
#
# Then:
#   sudo bash /opt/whatanagent/deploy/migrate-import.sh /tmp/whatanagent-migrate-XXXX.tar.gz
#
# It replaces the template .env with the exported one (keeping a copy of the
# template), restores the WhatsApp session and the data directory, fixes
# ownership, and starts the service.
# =============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/whatanagent}"
SERVICE="${SERVICE:-whatanagent}"
RUN_USER="${RUN_USER:-ubuntu}"
FILE="${1:-}"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[!] %s\033[0m\n' "$*"; }
die() { printf '\033[1;31mFATAL: %s\033[0m\n' "$*" >&2; exit 1; }

[ -n "$FILE" ] || die "Usage: sudo bash migrate-import.sh /tmp/whatanagent-migrate-XXXX.tar.gz"
[ -f "$FILE" ] || die "Not found: $FILE"
[ -d "$APP_DIR" ] || die "$APP_DIR missing — run deploy/install.sh first."
[ "$(id -u)" -eq 0 ] || die "Run with sudo."

log "Verifying the archive"
tar tzf "$FILE" >/dev/null || die "That file is not a valid .tar.gz"
tar tzf "$FILE" | grep -q '^\.env$' || warn "archive has no .env — the existing one will be kept"
tar tzf "$FILE" | grep -q 'auth_info_baileys/' || warn "archive has no WhatsApp session — you will have to scan the QR again"

log "Stopping $SERVICE"
systemctl stop "$SERVICE" 2>/dev/null || true

STAMP="$(date +%Y%m%d-%H%M%S)"
if [ -f "$APP_DIR/.env" ]; then
  cp -a "$APP_DIR/.env" "$APP_DIR/.env.before-migrate-$STAMP"
  echo "    existing .env kept as .env.before-migrate-$STAMP"
fi
if [ -d "$APP_DIR/auth_info_baileys" ]; then
  mv "$APP_DIR/auth_info_baileys" "$APP_DIR/auth_info_baileys.before-migrate-$STAMP"
  echo "    existing session moved aside"
fi

log "Extracting into $APP_DIR"
tar xzf "$FILE" -C "$APP_DIR"
echo "    extracted."

log "Fixing ownership and permissions"
for p in .env auth_info_baileys data; do
  [ -e "$APP_DIR/$p" ] || continue
  chown -R "$RUN_USER":"$RUN_USER" "$APP_DIR/$p"
done
[ -f "$APP_DIR/.env" ] && chmod 600 "$APP_DIR/.env"
# 47k small key files: keep the tree walkable but not world-readable
[ -d "$APP_DIR/auth_info_baileys" ] && chmod -R u+rwX,go-rwx "$APP_DIR/auth_info_baileys"

log "Starting $SERVICE"
systemctl daemon-reload
systemctl start "$SERVICE"
sleep 4

log "Status"
systemctl is-active "$SERVICE" && echo "    service is running" || warn "service is not running — check: journalctl -u $SERVICE -n 50"

echo
echo "Verify from here:"
echo "  curl -s -o /dev/null -w '%{http_code}\\n' http://127.0.0.1:3000/healthz"
echo "  curl -s http://127.0.0.1:3000/candl/api/wa/status"
echo "  journalctl -u $SERVICE -f"
echo
echo "Then, only once the new server is verified, keep the OLD one stopped or destroy it."
echo "Two servers running the same WhatsApp session will log one of them out."
