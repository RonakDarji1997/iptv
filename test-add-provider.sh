#!/bin/bash

# Test script to add a provider for a user and test stalker-proxy

API_URL="http://api.iptv.ronika.co"

echo "🧪 Testing Provider Setup and Stalker Proxy"
echo "==========================================="
echo ""

# Step 1: Register a test user
echo "1️⃣  Registering test user..."
TEST_EMAIL="providertest$(date +%s)@test.com"
register_response=$(curl -s -X POST "${API_URL}/api/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${TEST_EMAIL}\",\"password\":\"test123\",\"deviceId\":\"test-$(date +%s)\",\"deviceName\":\"Test Device\"}")

if echo "$register_response" | grep -q "accessToken"; then
    echo "✅ User registered: ${TEST_EMAIL}"
    ACCESS_TOKEN=$(echo $register_response | grep -o '"accessToken":"[^"]*' | sed 's/"accessToken":"//')
    USER_ID=$(echo $register_response | grep -o '"userId":"[^"]*' | sed 's/"userId":"//')
    echo "   Token: ${ACCESS_TOKEN:0:50}..."
    echo "   User ID: ${USER_ID}"
else
    echo "❌ Registration failed"
    echo "   Response: $register_response"
    exit 1
fi
echo ""

# Step 2: Add a provider for this user
echo "2️⃣  Adding provider via /api/sync/providers..."
provider_response=$(curl -s -X POST "${API_URL}/api/sync/providers" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -d '{
        "provider_id": "test-stream4k",
        "name": "Stream4K Test",
        "type": "stalker",
        "server_url": "http://tv.stream4k.cc",
        "mac_address": "00:1A:79:17:F4:F5",
        "serial_number": "058357N656529",
        "token": "aIe8YpJyX4VKBPTU8NW31LmJbCgAMfW9",
        "is_active": true,
        "is_configured": true,
        "include_tv": true,
        "include_vod": true
    }')

if echo "$provider_response" | grep -q "success"; then
    echo "✅ Provider added successfully"
    echo "   Response: $provider_response"
else
    echo "❌ Provider creation failed"
    echo "   Response: $provider_response"
    exit 1
fi
echo ""

# Step 3: Test stalker-proxy/categories
echo "3️⃣  Testing /api/stalker-proxy/categories..."
categories_response=$(curl -s "${API_URL}/api/stalker-proxy/categories" \
    -H "Authorization: Bearer $ACCESS_TOKEN")

if echo "$categories_response" | grep -q "liveCategories"; then
    LIVE_COUNT=$(echo "$categories_response" | grep -o '"liveCategories":\[[^]]*\]' | grep -o '{' | wc -l | tr -d ' ')
    MOVIE_COUNT=$(echo "$categories_response" | grep -o '"movieCategories":\[[^]]*\]' | grep -o '{' | wc -l | tr -d ' ')
    SERIES_COUNT=$(echo "$categories_response" | grep -o '"seriesCategories":\[[^]]*\]' | grep -o '{' | wc -l | tr -d ' ')
    echo "✅ Categories fetched successfully"
    echo "   📺 Live: $LIVE_COUNT categories"
    echo "   🎬 Movies: $MOVIE_COUNT categories"
    echo "   📺 Series: $SERIES_COUNT categories"
elif echo "$categories_response" | grep -q "error"; then
    echo "❌ Failed to fetch categories"
    echo "   Error: $categories_response"
else
    echo "⚠️  Unexpected response"
    echo "   Response: ${categories_response:0:500}"
fi
echo ""

# Step 4: Instructions for mobile app
echo "📱 Mobile App Testing"
echo "===================="
echo ""
echo "Your mobile app should now work! The fix applied:"
echo "✅ Updated StalkerPortalClient to use this.backendUrl instead of hardcoded localhost"
echo ""
echo "Test credentials for manual testing:"
echo "Email: ${TEST_EMAIL}"
echo "Password: test123"
echo ""
echo "To test with existing user, add provider via:"
echo "curl -X POST '${API_URL}/api/sync/providers' \\"
echo "  -H 'Authorization: Bearer YOUR_TOKEN' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"provider_id\":\"stream4k\",\"name\":\"Stream4K\",\"type\":\"stalker\",...}'"
echo ""
