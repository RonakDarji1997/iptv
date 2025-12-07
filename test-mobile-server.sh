#!/bin/bash

# Test mobile app connectivity to production server

echo "🧪 Testing Mobile App → Production Server"
echo "=========================================="
echo ""

API_URL="http://api.iptv.ronika.co"

echo "1️⃣  Testing Health Endpoint..."
response=$(curl -s "${API_URL}/api/health")
if echo "$response" | grep -q "ok"; then
    echo "✅ Health check passed"
    echo "   Response: $response"
else
    echo "❌ Health check failed"
    echo "   Response: $response"
fi
echo ""

echo "2️⃣  Testing Registration (Mobile App Flow)..."
TEST_EMAIL="mobiletest$(date +%s)@test.com"
register_response=$(curl -s -X POST "${API_URL}/api/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${TEST_EMAIL}\",\"password\":\"test123\",\"deviceId\":\"mobile-test-$(date +%s)\",\"deviceName\":\"Test Mobile Device\"}")

if echo "$register_response" | grep -q "accessToken"; then
    echo "✅ Registration successful"
    ACCESS_TOKEN=$(echo $register_response | grep -o '"accessToken":"[^"]*' | sed 's/"accessToken":"//')
    echo "   Got access token: ${ACCESS_TOKEN:0:50}..."
    echo ""
    
    echo "3️⃣  Testing Authenticated Endpoint (Get Devices)..."
    devices_response=$(curl -s "${API_URL}/api/devices/list" \
        -H "Authorization: Bearer $ACCESS_TOKEN")
    
    if echo "$devices_response" | grep -q "success"; then
        echo "✅ Authenticated request successful"
        echo "   Response: $devices_response"
    else
        echo "❌ Authenticated request failed"
        echo "   Response: $devices_response"
    fi
else
    echo "❌ Registration failed"
    echo "   Response: $register_response"
fi

echo ""
echo "🏁 Test Complete!"
echo ""
echo "📱 Mobile App Configuration:"
echo "   Backend URL: ${API_URL}/api"
echo "   File: mobile-app/src/constants/index.ts"
echo ""
echo "✨ Your mobile app is now configured to use the production server!"
