#!/usr/bin/env bash
# =============================================================================
# Write the Containers & Lots Google Drive credentials into /opt/whatanagent/.env
# =============================================================================
# Called by the deploy workflow with values from repository secrets, so no
# credential is ever committed to this (public) repository.
#
#   bash deploy/set-candl-env.sh "<client_id>" "<client_secret>" "<refresh_token>" "<parent_folder_id>"
#
# Idempotent: an existing KEY=... line is replaced in place; a missing key is
# appended. Nothing is echoed, so the values never reach the CI log.
# =============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/whatanagent}"
ENV_FILE="$APP_DIR/.env"

CLIENT_ID="${1:-}"
CLIENT_SECRET="${2:-}"
REFRESH_TOKEN="${3:-}"
PARENT_FOLDER="${4:-}"

[ -f "$ENV_FILE" ] || touch "$ENV_FILE"
chmod 600 "$ENV_FILE" 2>/dev/null || true

upsert() {
  local key="$1" val="$2"
  [ -z "$val" ] && return 0
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    # Use a temp file so a failure can never truncate .env
    awk -v k="$key" -v v="$val" 'BEGIN{FS=OFS="="} $1==k {print k "=" v; next} {print}' "$ENV_FILE" > "$ENV_FILE.tmp"
    mv "$ENV_FILE.tmp" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$val" >> "$ENV_FILE"
  fi
}

# The Containers & Lots helper reads the CANDL_* names first, then the GDRIVE_* ones.
upsert CANDL_GDRIVE_CLIENT_ID "$CLIENT_ID"
upsert CANDL_GDRIVE_CLIENT_SECRET "$CLIENT_SECRET"
upsert CANDL_GDRIVE_REFRESH_TOKEN "$REFRESH_TOKEN"
upsert CANDL_GDRIVE_PARENT_FOLDER_ID "$PARENT_FOLDER"

upsert GDRIVE_CLIENT_ID "$CLIENT_ID"
upsert GDRIVE_CLIENT_SECRET "$CLIENT_SECRET"
upsert GDRIVE_REFRESH_TOKEN "$REFRESH_TOKEN"
upsert GDRIVE_PARENT_FOLDER_ID "$PARENT_FOLDER"
# The OAuth re-authorise button must come back to this host, not the old Render one.
upsert GDRIVE_REDIRECT_URI "https://whatanagent.duckdns.org/candl/api/gdrive/callback"

echo "[candl] drive credentials written to $ENV_FILE (values not printed)"
