#!/bin/bash

# Test user registration
echo "Creating test user..."

curl -X POST http://api.iptv.ronika.co/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "ronakdarji1997",
    "email": "ronakdarji1997@gmail.com",
    "password": "test123456"
  }' | jq '.'

echo ""
echo "Now testing login..."

curl -X POST http://api.iptv.ronika.co/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "ronakdarji1997",
    "password": "test123456"
  }' | jq '.'
