#!/usr/bin/env bash
# =============================================================================
# WhatAnAgent — export everything the app needs to survive a move
# =============================================================================
# Run ON THE OLD SERVER. Produces one tarball holding the only three things that
# are not reproducible from git:
#
#   .env                 your keys (WhatsApp/AI/Drive/boss number)
#   auth_info_baileys/   the linked WhatsApp device (this IS your login)
#   data/                SQLite DBs, BL inbox, media archive, rules, backups
#
# Everything else (code, systemd unit, Caddy config) is rebuilt from the repo by
# deploy/install.sh on the new machine.
#
# Usage:
#   sudo bash deploy/migrate-export.sh            # stops the app, then exports (recommended)
#   sudo STOP=0 bash deploy/migrate-export.sh     # export while running (session may be mid-write)
#
# The app is left STOPPED on purpose: two servers must never use the same WhatsApp
# session at the same time, or WhatsApp will log one of them out.
# =============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/whatanagent}"
OUT_DIR="${OUT_DIR:-$APP_DIR/backups}"
SERVICE="${SERVICE:-whatanagent}"
STOP="${STOP:-1}"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[!] %s\033[0m\n' "$*"; }
die() { printf '\033[1;31mFATAL: %s\033[0m\n' "$*" >&2; exit 1; }

[ -d "$APP_DIR" ] || die "$APP_DIR not found — run this on the OLD server."
[ -d "$APP_DIR/data" ] || warn "no data/ directory — the app will start empty"
mkdir -p "$OUT_DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$OUT_DIR/whatanagent-migrate-$STAMP.tar.gz"
MANIFEST="$OUT_DIR/whatanagent-migrate-$STAMP.txt"

if [ "$STOP" = "1" ]; then
  log "Stopping $SERVICE so the WhatsApp session is copied consistently"
  systemctl stop "$SERVICE" || warn "could not stop $SERVICE (continuing)"
  sleep 2
  if systemctl is-active --quiet "$SERVICE"; then
    die "$SERVICE is still running. Stop it manually, then re-run."
  fi
  echo "    stopped."
else
  warn "STOP=0: exporting while the app runs. The session folder may be mid-write."
fi

log "Collecting sizes"
du -sh "$APP_DIR/data" "$APP_DIR/auth_info_baileys" 2>/dev/null || true

log "Writing $FILE"
tar czf "$FILE" \
  -C "$APP_DIR" \
  --exclude='data/wa-media/.cache' \
  .env auth_info_baileys data

{
  echo "WhatAnAgent migration export"
  echo "created      : $(date -Is)"
  echo "host         : $(hostname)"
  echo "commit       : $(git -C "$APP_DIR" rev-parse HEAD 2>/dev/null || echo unknown)"
  echo "node         : $(node -v 2>/dev/null || echo unknown)"
  echo "os           : $(. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME" || echo unknown)"
  echo "tarball      : $FILE"
  echo "sha256       : $(sha256sum "$FILE" | awk '{print $1}')"
  echo "size         : $(du -h "$FILE" | awk '{print $1}')"
  echo
  echo "IMPORTANT: $SERVICE is now STOPPED on this server. Do not start it again"
  echo "while the new server runs, or WhatsApp will log one of them out."
} | tee "$MANIFEST"

log "Done"
echo "Tarball : $FILE"
echo "Manifest: $MANIFEST"
echo
echo "Copy it to the new server (run this from your own machine):"
echo "  scp -i <your-key> $FILE ubuntu@<NEW-IP>:/tmp/"
echo
echo "Then on the NEW server:"
echo "  sudo bash /opt/whatanagent/deploy/migrate-import.sh /tmp/$(basename "$FILE")"
echo
echo "To abort the move and keep using this server:"
echo "  sudo systemctl start $SERVICE"
