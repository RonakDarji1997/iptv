#!/bin/bash

# Monitor CloudSyncManager and MainActivity cloud sync logs
# Usage: ./watch-cloud-logs.sh

echo "📱 Monitoring Cloud Sync Logs..."
echo "================================"
echo ""

adb -s adb-29221HFGN30KVS-iK7PnG._adb-tls-connect._tcp logcat -c
adb -s adb-29221HFGN30KVS-iK7PnG._adb-tls-connect._tcp logcat -s CloudSyncManager:D RefactoredMain:D | grep -E "🚀|☁️|⬇️|⬆️|📥|📤|🔢|➕|✓|✅|❌|🗑️|💾|👤|🔐|📡"
