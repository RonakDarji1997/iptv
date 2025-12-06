#!/bin/bash

# Import database from SQL file on NAS
# Run this on NAS after uploading the SQL export file
# Usage: sudo bash import-db.sh <filename.sql>

set -e

if [ -z "$1" ]; then
    echo "❌ Usage: sudo bash import-db.sh <filename.sql>"
    echo ""
    echo "Available SQL files in current directory:"
    ls -lh *.sql 2>/dev/null || echo "No SQL files found"
    exit 1
fi

SQL_FILE="$1"

if [ ! -f "$SQL_FILE" ]; then
    echo "❌ File not found: $SQL_FILE"
    exit 1
fi

echo "📥 Importing Database"
echo "===================="
echo ""
echo "File: $SQL_FILE"
echo "Size: $(du -h "$SQL_FILE" | cut -f1)"
echo ""

read -p "This will import data into iptv_sync database. Continue? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Import cancelled"
    exit 1
fi

echo "🗄️  Importing data..."
sudo docker exec -i iptv-postgres psql -U postgres -d iptv_sync < "$SQL_FILE"

echo ""
echo "✅ Import complete!"
echo ""
echo "📊 Verifying data..."
echo ""
echo "Users:"
sudo docker exec iptv-postgres psql -U postgres -d iptv_sync -c 'SELECT id, email, created_at FROM users LIMIT 5;'
echo ""
echo "Devices:"
sudo docker exec iptv-postgres psql -U postgres -d iptv_sync -c 'SELECT COUNT(*) as device_count FROM devices;'
echo ""
echo "Watch Progress:"
sudo docker exec iptv-postgres psql -U postgres -d iptv_sync -c 'SELECT COUNT(*) as progress_count FROM watch_progress;'
echo ""
echo "🎉 Done!"
