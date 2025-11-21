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
# Get the local IP address (for NAS, this will be the NAS IP)
LOCAL_IP=$(hostname -I | awk '{print $1}' 2>/dev/null || ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -n 1)
if [ -z "$LOCAL_IP" ]; then
  LOCAL_IP="localhost"
fi
echo "Detected IP: $LOCAL_IP"
# Update .env file with the API URL
cd expo-rn
if grep -q "^EXPO_PUBLIC_API_URL=" .env; then
  sed -i "s|^EXPO_PUBLIC_API_URL=.*|EXPO_PUBLIC_API_URL=http://${LOCAL_IP}:2005|" .env
else
  echo "EXPO_PUBLIC_API_URL=http://${LOCAL_IP}:2005" >> .env
fi
cd ..

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
