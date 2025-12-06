#!/bin/bash

# Script to test NAS server API endpoints
# Usage: ./test-server-endpoints.sh

set -e

API_URL="http://api.iptv.ronika.co"
TEST_EMAIL="test@example.com"
TEST_PASSWORD="test123"
TEST_DEVICE_ID="test-device-$(date +%s)"
TEST_DEVICE_NAME="Test Device"

echo "🧪 Testing IPTV API Server Endpoints"
echo "====================================="
echo "Server: $API_URL"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

test_endpoint() {
    local name=$1
    local method=$2
    local endpoint=$3
    local data=$4
    local auth=$5
    
    echo -e "${YELLOW}Testing: $name${NC}"
    echo "  $method $endpoint"
    
    if [ -n "$data" ]; then
        if [ -n "$auth" ]; then
            response=$(curl -s -w "\n%{http_code}" -X $method "$API_URL$endpoint" \
                -H "Content-Type: application/json" \
                -H "Authorization: Bearer $auth" \
                -d "$data")
        else
            response=$(curl -s -w "\n%{http_code}" -X $method "$API_URL$endpoint" \
                -H "Content-Type: application/json" \
                -d "$data")
        fi
    else
        if [ -n "$auth" ]; then
            response=$(curl -s -w "\n%{http_code}" -X $method "$API_URL$endpoint" \
                -H "Authorization: Bearer $auth")
        else
            response=$(curl -s -w "\n%{http_code}" -X $method "$API_URL$endpoint")
        fi
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        echo -e "  ${GREEN}✅ Success ($http_code)${NC}"
        echo "  Response: $body" | head -c 200
        echo ""
    else
        echo -e "  ${RED}❌ Failed ($http_code)${NC}"
        echo "  Response: $body"
    fi
    echo ""
}

echo "1️⃣  Health Checks"
echo "=================="
test_endpoint "Nginx Health" "GET" "/health"
test_endpoint "IPTV API Health" "GET" "/api/health"
test_endpoint "Whisper API Health" "GET" "/subtitle/health"

echo ""
echo "2️⃣  Authentication"
echo "=================="
echo "Registering new user..."
register_response=$(curl -s -X POST "$API_URL/api/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"deviceId\":\"$TEST_DEVICE_ID\",\"deviceName\":\"$TEST_DEVICE_NAME\"}")

echo "Response: $register_response"

# Extract token if registration successful
ACCESS_TOKEN=$(echo $register_response | grep -o '"accessToken":"[^"]*' | sed 's/"accessToken":"//')

if [ -n "$ACCESS_TOKEN" ]; then
    echo -e "${GREEN}✅ Got access token${NC}"
    echo ""
    
    echo "3️⃣  Protected Endpoints (with auth)"
    echo "====================================="
    test_endpoint "Get Devices" "GET" "/api/devices" "" "$ACCESS_TOKEN"
    test_endpoint "Get Progress" "GET" "/api/progress" "" "$ACCESS_TOKEN"
    
    echo "4️⃣  Sync Endpoint"
    echo "=================="
    test_endpoint "Sync Progress" "POST" "/api/sync" \
        '{"contentId":"test-movie-1","contentType":"movie","currentTime":120,"duration":7200,"lastWatched":"2025-12-06T20:00:00Z"}' \
        "$ACCESS_TOKEN"
else
    echo -e "${RED}❌ Failed to get access token. Cannot test protected endpoints.${NC}"
    echo "Please check if database is initialized and migrations are run."
fi

echo ""
echo "🏁 Testing Complete!"
echo ""
echo "📝 Summary:"
echo "  - If health checks pass but auth fails, run migrations first:"
echo "    ./run-migrations-on-server.sh"
echo ""
echo "  - If you have local data to copy:"
echo "    ./migrate-to-server.sh"
echo ""
echo "  - To access database on NAS:"
echo "    ssh ronak-admin@nas.ronika.co"
echo "    sudo docker exec -it iptv-postgres psql -U postgres -d iptv_sync"
