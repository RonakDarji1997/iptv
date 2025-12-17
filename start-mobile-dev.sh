#!/bin/bash

# Quick Start Script for Mobile App Development
# Starts both web-portal and mobile app simultaneously

set -e

echo "🚀 StreamHub Mobile App - Quick Start"
echo "======================================"
echo ""

# Check if we're in the right directory
if [ ! -d "mobile-webview-app" ] || [ ! -d "web-portal" ]; then
    echo "❌ Please run this script from the iptv root directory"
    exit 1
fi

# Check if web-portal dependencies are installed
if [ ! -d "web-portal/node_modules" ]; then
    echo "📦 Installing web-portal dependencies..."
    cd web-portal
    npm install
    cd ..
fi

# Check if mobile app dependencies are installed
if [ ! -d "mobile-webview-app/node_modules" ]; then
    echo "📦 Installing mobile app dependencies..."
    cd mobile-webview-app
    npm install
    
    # iOS: Install pods if on macOS
    if [[ "$OSTYPE" == "darwin"* ]] && [ -d "ios" ]; then
        echo "📦 Installing iOS pods..."
        cd ios
        pod install
        cd ..
    fi
    
    cd ..
fi

# Function to cleanup background processes
cleanup() {
    echo ""
    echo "🛑 Stopping all processes..."
    kill $(jobs -p) 2>/dev/null || true
    exit
}

trap cleanup EXIT INT TERM

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📱 Starting Applications..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Start web-portal in background
echo "🌐 Starting web-portal on http://localhost:3001..."
cd web-portal
npm run dev > ../web-portal.log 2>&1 &
WEB_PID=$!
cd ..

# Wait for web-portal to start
echo "⏳ Waiting for web-portal to be ready..."
sleep 5

# Check if web-portal is running
if curl -s http://localhost:3001 > /dev/null 2>&1; then
    echo "✅ Web-portal is running!"
else
    echo "⚠️  Web-portal may not be ready yet (check web-portal.log)"
fi

echo ""

# Detect platform and ask user
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "Select platform to run:"
    echo "1) iOS Simulator"
    echo "2) Android Emulator"
    echo "3) Both"
    read -p "Enter choice (1-3): " choice
else
    echo "Running on Android (iOS requires macOS)..."
    choice=2
fi

echo ""

case $choice in
    1)
        echo "📱 Starting iOS app..."
        cd mobile-webview-app
        npm run ios
        ;;
    2)
        echo "🤖 Starting Android app..."
        
        # Check if emulator is running
        if ! adb devices | grep -q "emulator"; then
            echo "⚠️  No Android emulator detected. Starting one..."
            echo "   (If this hangs, start an emulator manually in Android Studio)"
            emulator -avd $(emulator -list-avds | head -1) &
            sleep 10
        fi
        
        # Reverse port for localhost access
        echo "🔌 Setting up network access..."
        adb reverse tcp:3001 tcp:3001
        
        cd mobile-webview-app
        npm run android
        ;;
    3)
        echo "📱🤖 Starting both iOS and Android..."
        
        # Android setup
        if ! adb devices | grep -q "emulator"; then
            echo "🤖 Starting Android emulator..."
            emulator -avd $(emulator -list-avds | head -1) &
            sleep 10
        fi
        adb reverse tcp:3001 tcp:3001
        
        # Start iOS
        cd mobile-webview-app
        npm run ios > ../ios.log 2>&1 &
        
        # Start Android
        npm run android > ../android.log 2>&1 &
        
        echo "✅ Both apps starting (check ios.log and android.log)"
        cd ..
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ Apps Running!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📝 Logs:"
echo "   Web Portal: tail -f web-portal.log"
echo ""
echo "🎯 Test these features:"
echo "   1. Browse content in WebView"
echo "   2. Play Live TV (should open native player)"
echo "   3. Play VOD with subtitles"
echo "   4. Test resume playback"
echo ""
echo "🛑 Press Ctrl+C to stop all processes"
echo ""

# Keep script running
wait
