#!/bin/bash

# Script to migrate local database to NAS server
# Usage: ./migrate-to-server.sh

set -e

echo "🔄 IPTV Database Migration to NAS Server"
echo "========================================"
echo ""

# Configuration
NAS_HOST="ronak-admin@nas.ronika.co"
NAS_DOCKER_PATH="/volume1/docker/iptv"
LOCAL_DB_NAME="iptv_sync"
SERVER_DB_NAME="iptv_sync"
BACKUP_FILE="iptv_sync_backup_$(date +%Y%m%d_%H%M%S).sql"

echo "📦 Step 1: Creating backup of local database..."
pg_dump -U postgres -d $LOCAL_DB_NAME -F p -f "/tmp/$BACKUP_FILE"
echo "✅ Backup created: /tmp/$BACKUP_FILE"
echo ""

echo "📤 Step 2: Copying backup to NAS..."
scp "/tmp/$BACKUP_FILE" "$NAS_HOST:/tmp/"
echo "✅ Backup copied to NAS"
echo ""

echo "🗄️  Step 3: Restoring database on NAS..."
ssh $NAS_HOST "sudo docker exec -i iptv-postgres psql -U postgres -d $SERVER_DB_NAME < /tmp/$BACKUP_FILE"
echo "✅ Database restored"
echo ""

echo "🧹 Step 4: Cleaning up temporary files..."
rm "/tmp/$BACKUP_FILE"
ssh $NAS_HOST "rm /tmp/$BACKUP_FILE"
echo "✅ Cleanup complete"
echo ""

echo "✨ Migration complete! Testing connection..."
ssh $NAS_HOST "sudo docker exec iptv-postgres psql -U postgres -d $SERVER_DB_NAME -c 'SELECT COUNT(*) as user_count FROM users;'"
echo ""
echo "🎉 Done! Your database has been migrated to the server."
