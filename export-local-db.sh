#!/bin/bash

# Export local database to SQL file that can be manually copied to NAS
# Usage: ./export-local-db.sh

set -e

echo "📦 Exporting Local Database"
echo "==========================="
echo ""

LOCAL_DB_NAME="iptv_sync"
EXPORT_FILE="iptv_db_export_$(date +%Y%m%d_%H%M%S).sql"

# Check if database exists
if ! psql -U postgres -lqt | cut -d \| -f 1 | grep -qw $LOCAL_DB_NAME; then
    echo "❌ Database '$LOCAL_DB_NAME' not found"
    echo ""
    echo "Available databases:"
    psql -U postgres -l
    exit 1
fi

echo "🗄️  Exporting database: $LOCAL_DB_NAME"
echo "📄 Output file: $EXPORT_FILE"
echo ""

# Export only data (skip schema since it's already on server)
pg_dump -U postgres -d $LOCAL_DB_NAME \
    --data-only \
    --column-inserts \
    --disable-triggers \
    -f "$EXPORT_FILE"

echo "✅ Export complete!"
echo ""
echo "📊 File size: $(du -h "$EXPORT_FILE" | cut -f1)"
echo ""
echo "📋 Next steps:"
echo "   1. Upload this file to your NAS (use Synology web interface or any method)"
echo "   2. On NAS, run: sudo docker exec -i iptv-postgres psql -U postgres -d iptv_sync < /path/to/$EXPORT_FILE"
echo ""
echo "   Or use the web import script:"
echo "   - Open http://nas.ronika.co:5000 (Synology File Station)"
echo "   - Upload $EXPORT_FILE to /docker/iptv/"
echo "   - SSH to NAS and run: sudo bash /volume1/docker/iptv/import-db.sh"
