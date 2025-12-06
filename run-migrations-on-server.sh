#!/bin/bash

# Script to run database migrations on NAS server
# Usage: ./run-migrations-on-server.sh

set -e

echo "🚀 Running Database Migrations on NAS Server"
echo "============================================="
echo ""

# Get NAS IP from api.iptv.ronika.co domain
NAS_IP=$(dig +short api.iptv.ronika.co | head -n1)
NAS_HOST="ronak-admin@${NAS_IP}"
NAS_DOCKER_PATH="/volume1/docker/iptv"
MIGRATION_FILE="001_initial_schema.sql"

echo "Using NAS IP: $NAS_IP"
echo ""

echo "📤 Step 1: Copying migration file to NAS..."
scp "iptv-sync-backend/packages/database/migrations/$MIGRATION_FILE" "$NAS_HOST:/tmp/"
echo "✅ Migration file copied"
echo ""

echo "🗄️  Step 2: Running migration..."
ssh $NAS_HOST "sudo docker exec -i iptv-postgres psql -U postgres -d iptv_sync < /tmp/$MIGRATION_FILE"
echo "✅ Migration completed"
echo ""

echo "🧹 Step 3: Cleaning up..."
ssh $NAS_HOST "rm /tmp/$MIGRATION_FILE"
echo "✅ Cleanup complete"
echo ""

echo "📋 Step 4: Verifying tables..."
ssh $NAS_HOST "sudo docker exec iptv-postgres psql -U postgres -d iptv_sync -c '\dt'"
echo ""
echo "🎉 Done! Database schema created successfully."
