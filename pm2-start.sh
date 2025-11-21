#!/bin/bash

# IPTV Server Startup Script

echo "🚀 Starting IPTV Server Setup..."

# 1. Install dependencies for Backend
echo "📦 Installing Backend dependencies..."
# Ensure we have the latest code and discard local changes
sudo git reset --hard
sudo git pull
sudo npm install --legacy-peer-deps

# 2. Build Backend (Next.js)
echo "🏗️  Building Backend..."
sudo npm run build


# 3. Install dependencies for Expo App
echo "📦 Installing Expo App dependencies..."
cd expo-rn && sudo npm install --legacy-peer-deps && cd ..

# 4. Configure API URL for production
echo "⚙️  Configuring API URL..."
# Get the server IP - try multiple methods
SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ -z "$SERVER_IP" ] || [ "$SERVER_IP" = "127.0.0.1" ]; then
  SERVER_IP=$(ip addr show 2>/dev/null | grep 'inet ' | grep -v '127.0.0.1' | awk '{print $2}' | cut -d/ -f1 | head -n 1)
fi
if [ -z "$SERVER_IP" ] || [ "$SERVER_IP" = "127.0.0.1" ]; then
  SERVER_IP=$(ifconfig 2>/dev/null | grep 'inet ' | grep -v '127.0.0.1' | awk '{print $2}' | head -n 1)
fi
if [ -z "$SERVER_IP" ] || [ "$SERVER_IP" = "127.0.0.1" ]; then
  echo "❌ Could not auto-detect server IP!"
  echo "Please enter your server IP address (e.g., 100.68.86.22):"
  read SERVER_IP
fi
echo "Using Server IP: $SERVER_IP"

# Update ecosystem.config.json with the server IP
sed -i.bak "s|http://SERVER_IP:2005|http://${SERVER_IP}:2005|g" ecosystem.config.json

# 5. Manage PM2 Processes
echo "Pm2 Management..."
# Delete existing processes to ensure fresh config load
pm2 delete ecosystem.config.json 2>/dev/null || true

# Start PM2
echo "🚀 Starting PM2..."
pm2 start ecosystem.config.json

# Save PM2 list
pm2 save

echo "✅ Server started successfully!"
echo "   - Backend: http://localhost:2005"
echo "   - Expo:    http://localhost:3005"

# Show logs
echo "📋 Showing logs (press Ctrl+C to exit logs)..."
pm2 logs
