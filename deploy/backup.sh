#!/usr/bin/env bash
# =============================================================================
# Nightly WhatsApp session backup.
# =============================================================================
# The Baileys session (creds.json + key files) IS your WhatsApp login. If it is
# lost you must re-scan the QR code. This archives it, keeps 14 days, and prunes
# expired keys with the app's own safe cleaner (creds/app-state/session untouched).
# =============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/whatanagent}"
SRC="$APP_DIR/auth_info_baileys"
DEST="$APP_DIR/backups"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$DEST"

if [ ! -d "$SRC" ]; then
  echo "No session folder at $SRC — nothing to back up."
  exit 0
fi

# 1) Prune stale, re-fetchable key files first (never creds.json / app-state / session-*)
if [ -f "$APP_DIR/sessionCleanup.mjs" ]; then
  node --input-type=module -e "
    import { archiveOldSession } from '$APP_DIR/sessionCleanup.mjs';
    const r = archiveOldSession('$SRC', { keepDays: 3, keepNewestPerCategory: 1000 });
    console.log('pruned ' + r.moved + ' stale key files (' + r.bytesMoved + ' MB)');
  " || echo "cleaner skipped (non-fatal)"
fi

# 2) Archive the session
tar -czf "$DEST/session-$STAMP.tar.gz" -C "$APP_DIR" auth_info_baileys
chmod 600 "$DEST/session-$STAMP.tar.gz"

# 3) Retention
find "$DEST" -name 'session-*.tar.gz' -type f -mtime +"$KEEP_DAYS" -delete

# 4) Keep the archive folder from growing without bound
find "$APP_DIR/auth_info_archive" -maxdepth 1 -type d -mtime +"$KEEP_DAYS" -exec rm -rf {} + 2>/dev/null || true

COUNT="$(find "$DEST" -name 'session-*.tar.gz' | wc -l)"
SIZE="$(du -sh "$DEST" | cut -f1)"
echo "$(date -Is) backup ok: $DEST/session-$STAMP.tar.gz (retained: $COUNT archives, $SIZE total)"
