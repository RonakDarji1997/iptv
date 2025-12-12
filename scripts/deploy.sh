#!/usr/bin/env bash
set -euo pipefail

# Deploy script for iptv-sync-backend
# Usage: sudo ./scripts/deploy.sh [branch]
# - Branch defaults to current branch or 'updates-branch' when not provided

BRANCH="${1:-updates-branch}"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="/tmp/iptv_backups"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/iptv_sync_backup_${TIMESTAMP}.sql"

log() { echo "[deploy] $*"; }
err() { echo "[deploy][ERROR] $*" >&2; }

cd "$REPO_DIR"

log "Deploying branch: $BRANCH in $REPO_DIR"

if ! command -v docker-compose >/dev/null 2>&1; then
  err "docker-compose not found in PATH"
  exit 1
fi

log "Fetching latest from origin/$BRANCH"
sudo git fetch origin "$BRANCH" || true
sudo git reset --hard "origin/$BRANCH"

log "Pulling images"
sudo docker-compose pull || log "docker-compose pull finished with warnings"

log "Starting database and cache services"
sudo docker-compose up -d postgres redis || true

# Wait for Postgres to become healthy
log "Waiting for Postgres to be ready (timeout 300s)"
timeout=300
interval=5
elapsed=0
while true; do
  if sudo docker ps --format '{{.Names}}' | grep -q '^iptv-sync-postgres$'; then
    if sudo docker exec -i iptv-sync-postgres pg_isready -U postgres >/dev/null 2>&1; then
      log "Postgres is ready"
      break
    fi
  else
    log "Container 'iptv-sync-postgres' not present yet; retrying..."
  fi
  sleep "$interval"
  elapsed=$((elapsed + interval))
  if [ "$elapsed" -ge "$timeout" ]; then
    err "Postgres did not become ready after ${timeout}s"
    exit 1
  fi
done

# Optional: backup existing data from a separate 'iptv-postgres' container if present
if sudo docker ps --format '{{.Names}}' | grep -q '^iptv-postgres$'; then
  mkdir -p "$BACKUP_DIR"
  log "Backing up data from 'iptv-postgres' to $BACKUP_FILE"
  if sudo docker exec -i iptv-postgres pg_dump -U postgres iptv_sync > "$BACKUP_FILE"; then
    log "Backup written to $BACKUP_FILE"
  else
    err "Backup from 'iptv-postgres' failed (continuing)"
  fi
fi

log "Bringing up remaining services (api, pgadmin, nginx)"
sudo docker-compose up -d api pgadmin nginx || sudo docker-compose up -d || true

# Try to run Prisma migrations inside the api container if available
if sudo docker ps --format '{{.Names}}' | grep -q '^iptv-sync-api$'; then
  log "Attempting to run Prisma migrations inside 'iptv-sync-api' (if configured)"
  if sudo docker exec iptv-sync-api sh -lc 'command -v npx >/dev/null 2>&1'; then
    if sudo docker exec -i iptv-sync-api npx prisma migrate deploy; then
      log "Prisma migrations applied"
    else
      log "Prisma migrate command failed or no migrations present (continuing)"
    fi
  else
    log "No npx available inside 'iptv-sync-api'; skipping migrations"
  fi
else
  log "'iptv-sync-api' container not running; skipping migrations"
fi

log "Restarting api and nginx to pick up new images/config"
sudo docker-compose restart api nginx || true

log "Deploy finished"

echo
echo "Tips:"
echo " - Make this script executable: sudo chmod +x scripts/deploy.sh"
echo " - Run it from the repo root, e.g. from /path/to/iptv: sudo ./scripts/deploy.sh main"
