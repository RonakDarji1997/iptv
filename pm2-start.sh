#!/bin/bash

# IPTV Server Startup Script

echo "🚀 Starting IPTV Server Setup..."

# 1. Install dependencies for Backend
echo "📦 Installing Backend dependencies..."
npm install

# 2. Build Backend (Next.js)
echo "🏗️  Building Backend..."
npm run build

# 3. Install dependencies for Expo App
echo "📦 Installing Expo App dependencies..."
cd expo-rn && npm install && cd ..

# 4. Manage PM2 Processes
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
