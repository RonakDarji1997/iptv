#!/bin/bash

# Sync provider from local Mac database to production server

API_URL="http://api.iptv.ronika.co"
EMAIL="ronakdarji1997@gmail.com"
PASSWORD="test123"

echo "🔄 Syncing Provider to Production Server"
echo "========================================="
echo ""

# Step 1: Get local provider details
echo "1️⃣  Fetching provider from local database..."
PROVIDER_DATA=$(psql -U postgres -d iptv_sync -t -A -F '|' -c "
SELECT 
  provider_id, 
  name, 
  type, 
  server_url, 
  mac_address, 
  COALESCE(serial_number, '058357N656529'), 
  token,
  include_tv::text,
  include_vod::text
FROM providers 
WHERE user_id IN (SELECT id FROM users WHERE email = '${EMAIL}') 
LIMIT 1;
")

if [ -z "$PROVIDER_DATA" ]; then
    echo "❌ No provider found in local database for ${EMAIL}"
    exit 1
fi

# Parse provider data
IFS='|' read -r PROVIDER_ID NAME TYPE SERVER_URL MAC_ADDRESS SERIAL_NUMBER TOKEN INCLUDE_TV INCLUDE_VOD <<< "$PROVIDER_DATA"

echo "✅ Found provider: ${NAME}"
echo "   Provider ID: ${PROVIDER_ID}"
echo "   Type: ${TYPE}"
echo "   Server: ${SERVER_URL}"
echo "   MAC: ${MAC_ADDRESS}"
echo "   Token: ${TOKEN:0:30}..."
echo ""

# Step 2: Authenticate with server
echo "2️⃣  Authenticating with server..."
AUTH_RESPONSE=$(curl -s -X POST "${API_URL}/api/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\",\"deviceId\":\"mac-sync-$(date +%s)\",\"deviceName\":\"Mac Sync\"}")

ACCESS_TOKEN=$(echo "$AUTH_RESPONSE" | grep -o '"accessToken":"[^"]*' | sed 's/"accessToken":"//')

if [ -z "$ACCESS_TOKEN" ]; then
    echo "❌ Authentication failed"
    echo "   Response: $AUTH_RESPONSE"
    exit 1
fi

echo "✅ Authenticated"
echo "   Token: ${ACCESS_TOKEN:0:50}..."
echo ""

# Step 3: Sync provider to server
echo "3️⃣  Syncing provider to server..."
SYNC_RESPONSE=$(curl -s -X POST "${API_URL}/api/sync/providers" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -d "{
        \"provider_id\": \"${PROVIDER_ID}\",
        \"name\": \"${NAME}\",
        \"type\": \"${TYPE}\",
        \"server_url\": \"${SERVER_URL}\",
        \"mac_address\": \"${MAC_ADDRESS}\",
        \"serial_number\": \"${SERIAL_NUMBER}\",
        \"token\": \"${TOKEN}\",
        \"is_active\": true,
        \"is_configured\": true,
        \"include_tv\": ${INCLUDE_TV:-true},
        \"include_vod\": ${INCLUDE_VOD:-true}
    }")

if echo "$SYNC_RESPONSE" | grep -q '"success":true'; then
    echo "✅ Provider synced successfully!"
    echo ""
    echo "4️⃣  Testing stalker-proxy endpoint..."
    
    # Test categories endpoint
    CATEGORIES=$(curl -s "${API_URL}/api/stalker-proxy/categories" \
        -H "Authorization: Bearer ${ACCESS_TOKEN}")
    
    if echo "$CATEGORIES" | grep -q "liveCategories"; then
        LIVE_COUNT=$(echo "$CATEGORIES" | grep -o '"id"' | wc -l | tr -d ' ')
        echo "✅ Stalker proxy working!"
        echo "   Categories endpoint accessible"
        echo ""
    else
        echo "⚠️  Stalker proxy response:"
        echo "   ${CATEGORIES:0:200}"
        echo ""
    fi
    
    echo "🎉 Provider sync complete!"
    echo ""
    echo "📱 Your mobile app should now work with:"
    echo "   Email: ${EMAIL}"
    echo "   Password: ${PASSWORD}"
    echo ""
    echo "Just reload the mobile app to pick up the provider data!"
else
    echo "❌ Provider sync failed"
    echo "   Response: $SYNC_RESPONSE"
    exit 1
fi
