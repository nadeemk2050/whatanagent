#!/usr/bin/env bash
# =============================================================================
# Zero-downtime-ish deploy, run ON the server (by GitHub Actions or by hand).
# This is the replacement for Render's "git push -> auto deploy" button.
# =============================================================================
#   /opt/whatanagent/deploy/deploy.sh            # deploy master
#   BRANCH=dev /opt/whatanagent/deploy/deploy.sh # deploy a branch
#
# Behaviour: pull, install prod deps, restart, health-check. If the health check
# fails it ROLLS BACK to the previous commit automatically and restarts.
# =============================================================================
set -uo pipefail

APP_DIR="${APP_DIR:-/opt/whatanagent}"
BRANCH="${BRANCH:-master}"
SERVICE="${SERVICE:-whatanagent}"
HEALTH_URL="http://127.0.0.1:3000/healthz"
HEALTH_RETRIES=20
HEALTH_SLEEP=2

cd "$APP_DIR" || { echo "FATAL: $APP_DIR missing"; exit 1; }

log() { printf '\n\033[1;36m[deploy] %s\033[0m\n' "$*"; }

PREV_SHA="$(git rev-parse HEAD)"
log "current commit: ${PREV_SHA:0:8}"

log "fetching origin/$BRANCH"
git fetch --depth 1 origin "$BRANCH" || { echo "FATAL: git fetch failed"; exit 1; }

NEW_SHA="$(git rev-parse "origin/$BRANCH")"
if [ "$PREV_SHA" = "$NEW_SHA" ]; then
  log "already up to date (${NEW_SHA:0:8}) — restarting anyway to pick up .env changes"
  DEPS_CHANGED=0
else
  log "updating ${PREV_SHA:0:8} -> ${NEW_SHA:0:8}"
  # Installing deps wipes node_modules WHILE the old process is still serving, so a message that
  # arrives mid-install fails with "Cannot find module .../openai/index.mjs". Only reinstall when
  # the dependency manifest actually changed (or node_modules is missing) — code-only deploys skip it.
  if git diff --quiet "$PREV_SHA" "$NEW_SHA" -- package.json package-lock.json 2>/dev/null && [ -d node_modules ]; then
    DEPS_CHANGED=0
  else
    DEPS_CHANGED=1
  fi
  git reset --hard "$NEW_SHA" || { echo "FATAL: reset failed"; exit 1; }
fi

if [ "$DEPS_CHANGED" -eq 1 ]; then
  log "installing production dependencies (manifest changed)"
  if [ -f package-lock.json ]; then
    npm ci --omit=dev || npm install --omit=dev || { echo "FATAL: npm install failed"; exit 1; }
  else
    npm install --omit=dev || { echo "FATAL: npm install failed"; exit 1; }
  fi
else
  log "dependencies unchanged — skipping npm install (no mid-deploy module gaps)"
fi

log "restarting $SERVICE"
sudo systemctl restart "$SERVICE" || { echo "FATAL: restart failed"; exit 1; }

log "health check: $HEALTH_URL"
OK=0
for i in $(seq 1 "$HEALTH_RETRIES"); do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$HEALTH_URL" 2>/dev/null)"
  CODE="${CODE:-000}"
  if [ "$CODE" = "200" ]; then OK=1; break; fi
  echo "  attempt $i/$HEALTH_RETRIES -> HTTP $CODE"
  sleep "$HEALTH_SLEEP"
done

if [ "$OK" -eq 1 ]; then
  log "SUCCESS — live on ${NEW_SHA:0:8}"
  exit 0
fi

log "HEALTH CHECK FAILED — rolling back to ${PREV_SHA:0:8}"
git reset --hard "$PREV_SHA"
if [ "$DEPS_CHANGED" -eq 1 ] && [ -f package-lock.json ]; then npm ci --omit=dev >/dev/null 2>&1 || npm install --omit=dev >/dev/null 2>&1; fi
sudo systemctl restart "$SERVICE"
sleep 5
CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$HEALTH_URL" 2>/dev/null)"
CODE="${CODE:-000}"
echo "  after rollback: HTTP $CODE"
exit 1
