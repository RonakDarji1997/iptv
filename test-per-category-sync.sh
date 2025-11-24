#!/bin/bash

# Test Per-Category Sync Implementation

echo "🔍 Finding Provider ID..."
PROVIDER_ID=$(curl -s http://localhost:2005/dashboard 2>&1 | grep -o 'providers/[a-f0-9-]\{36\}' | head -1 | cut -d'/' -f2)

if [ -z "$PROVIDER_ID" ]; then
    echo "❌ Could not find provider ID. Please check if server is running on port 2005"
    echo "   Alternatively, find your provider ID from the dashboard URL"
    echo "   Example: http://localhost:2005/dashboard/providers/YOUR-PROVIDER-ID"
    exit 1
fi

echo "✅ Found Provider ID: $PROVIDER_ID"
echo ""

# Step 1: Clean database
echo "📦 Step 1: Cleaning database..."
CLEAN_RESPONSE=$(curl -s -X POST "http://localhost:2005/api/providers/$PROVIDER_ID/clean")
echo "$CLEAN_RESPONSE" | jq '.' 2>/dev/null || echo "$CLEAN_RESPONSE"
echo ""

# Step 2: Start full sync
echo "🔄 Step 2: Starting full sync with per-category logic..."
SYNC_RESPONSE=$(curl -s -X POST "http://localhost:2005/api/providers/$PROVIDER_ID/sync?mode=full")
JOB_ID=$(echo "$SYNC_RESPONSE" | jq -r '.jobId // empty')

if [ -z "$JOB_ID" ]; then
    echo "❌ Sync failed to start:"
    echo "$SYNC_RESPONSE" | jq '.' 2>/dev/null || echo "$SYNC_RESPONSE"
    exit 1
fi

echo "✅ Sync started! Job ID: $JOB_ID"
echo ""

# Step 3: Monitor progress
echo "📊 Step 3: Monitoring sync progress..."
echo "   Check logs for per-category progress messages like:"
echo "   [Sync] Processing category: ADULT | GENERAL (ID: 73)"
echo "   [Sync] Category ADULT | GENERAL page 1: 14 items..."
echo ""

# Wait a bit then check adult categories
echo "⏳ Waiting 30 seconds before checking results..."
sleep 30

echo ""
echo "🎬 Step 4: Checking adult categories..."
curl -s "http://localhost:2005/api/providers/$PROVIDER_ID/snapshot" | \
    jq '.categories[] | select(.name | contains("ADULT"))' 2>/dev/null

echo ""
echo "✅ Test complete!"
echo ""
echo "Expected Results:"
echo "  - Adult categories should have hasMovies: true or hasSeries: true"
echo "  - Category 73 (ADULT | GENERAL) should have ~9,551 movies"
echo "  - Category 149 (ADULT | CELEBRITY) should have ~341 movies"
echo ""
echo "To count movies in adult category:"
echo "curl -s http://localhost:2005/api/providers/$PROVIDER_ID/snapshot | jq '[.movies[] | select(.categoryId == \"UUID_HERE\")] | length'"
