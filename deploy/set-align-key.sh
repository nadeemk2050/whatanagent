#!/usr/bin/env bash
# =============================================================================
# Provision the AlignTasks Firebase service-account key on this server.
# =============================================================================
# The key is deliberately NOT in the repository. It lives outside the checkout at
#   /opt/whatanagent-data/serviceAccountKey.json   (chmod 600)
# and is read lazily by alignAdmin.mjs. If it is missing, every /api/align/task/*
# call answers 503 and the board shows "the server is restarting".
#
# Called by the deploy workflow with the JSON from the ALIGN_SERVICE_ACCOUNT_JSON
# repository secret, so a fresh VPS comes up with storage already working and the
# private key never reaches the CI log.
#
#   bash deploy/set-align-key.sh              # JSON or base64 on stdin (preferred)
#   bash deploy/set-align-key.sh "<json>"     # or as the first argument
#
# Idempotent and fail-safe: the existing file is replaced only after the new value
# has been validated, so a broken secret can never take a working board offline.
# No service restart is needed — alignAdmin.mjs retries on the next request.
# =============================================================================
set -euo pipefail

DIR="${ALIGN_KEY_DIR:-/opt/whatanagent-data}"
FILE="$DIR/serviceAccountKey.json"
OWNER="${ALIGN_KEY_OWNER:-ubuntu}"

raw="${1:-}"
if [ -z "$raw" ]; then raw="$(cat)"; fi
# Drop a single trailing newline; JSON.parse tolerates the remaining whitespace.
raw="${raw%$'\n'}"

if [ -z "$raw" ]; then
  echo "[align-key] no key supplied - leaving ${FILE} untouched"
  exit 0
fi

# Accept raw JSON or base64 (base64 survives .env / secret quoting better).
case "$raw" in
  \{*) : ;;
  *) raw="$(printf '%s' "$raw" | base64 -d 2>/dev/null)" || raw="" ;;
esac

# Validate before touching the live file: must parse and look like a service account.
if ! printf '%s' "$raw" | node -e '
const chunks = [];
process.stdin.on("data", (d) => chunks.push(d));
process.stdin.on("end", () => {
  try {
    const j = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!j.project_id || !j.private_key || !j.client_email) process.exit(3);
  } catch (e) {
    process.exit(2);
  }
});
'; then
  echo "[align-key] supplied value is not a valid service-account JSON - nothing written"
  exit 1
fi

# Compare with what is already on disk so a repeat deploy is a no-op.
if [ -f "$FILE" ] && printf '%s' "$raw" | cmp -s - "$FILE"; then
  echo "[align-key] already up to date at ${FILE}"
  exit 0
fi

sudo mkdir -p "$DIR"
printf '%s' "$raw" | sudo tee "$FILE" >/dev/null
sudo chown "$OWNER:$OWNER" "$DIR" "$FILE"
sudo chmod 700 "$DIR"
sudo chmod 600 "$FILE"

echo "[align-key] service-account key written to ${FILE} (contents not printed)"
