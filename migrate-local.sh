#!/bin/bash

# Simple migration script to run directly on NAS
# Copy this to NAS and run: sudo bash migrate-local.sh

set -e

echo "🚀 Running Database Migrations"
echo "=============================="
echo ""

MIGRATION_FILE="/volume1/docker/iptv/iptv-sync-backend/packages/database/migrations/001_initial_schema.sql"

if [ ! -f "$MIGRATION_FILE" ]; then
    echo "❌ Migration file not found: $MIGRATION_FILE"
    echo "Make sure you're in the /volume1/docker/iptv directory"
    exit 1
fi

echo "📋 Running migration..."
sudo docker exec -i iptv-postgres psql -U postgres -d iptv_sync < "$MIGRATION_FILE"

echo ""
echo "✅ Migration completed!"
echo ""
echo "📊 Verifying tables..."
sudo docker exec iptv-postgres psql -U postgres -d iptv_sync -c '\dt'

echo ""
echo "👥 Checking users table..."
sudo docker exec iptv-postgres psql -U postgres -d iptv_sync -c 'SELECT COUNT(*) as user_count FROM users;'

echo ""
echo "🎉 Done! Database is ready."
