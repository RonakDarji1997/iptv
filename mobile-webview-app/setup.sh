#!/bin/bash

# StreamHub Mobile App - Setup Script
# Initializes React Native project with all native dependencies

set -e

echo "🚀 StreamHub Mobile App Setup"
echo "=============================="
echo ""

# Check Node version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 18+ required. Current: $(node -v)"
    exit 1
fi
echo "✅ Node.js version: $(node -v)"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Please run this script from mobile-webview-app directory"
    exit 1
fi

echo ""
echo "📦 Installing npm dependencies..."
npm install

# iOS setup
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo ""
    echo "🍎 Setting up iOS (macOS detected)..."
    
    # Check if CocoaPods is installed
    if ! command -v pod &> /dev/null; then
        echo "⚠️  CocoaPods not found. Installing..."
        sudo gem install cocoapods
    fi
    echo "✅ CocoaPods: $(pod --version)"
    
    # Initialize React Native iOS project
    echo "📱 Initializing React Native iOS project..."
    npx react-native init StreamHubMobile --template react-native-template-typescript --skip-install || true
    
    # Copy our files over the template
    echo "📋 Configuring project files..."
    cp -f App.tsx ios_temp/StreamHubMobile/ || true
    cp -rf src ios_temp/StreamHubMobile/ || true
    
    # Install pods
    echo "📦 Installing iOS dependencies..."
    cd ios
    pod install
    cd ..
    
    echo "✅ iOS setup complete!"
else
    echo "⏭️  Skipping iOS setup (macOS required)"
fi

# Android setup
echo ""
echo "🤖 Setting up Android..."

# Initialize React Native Android project if not exists
if [ ! -d "android" ]; then
    echo "📱 Initializing React Native Android project..."
    npx react-native init StreamHubMobile --template react-native-template-typescript --skip-install
    
    # Copy our files over
    cp -f App.tsx android_temp/StreamHubMobile/ || true
    cp -rf src android_temp/StreamHubMobile/ || true
fi

echo "✅ Android setup complete!"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ Setup Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📝 Next Steps:"
echo ""
echo "1️⃣  Start web-portal (in another terminal):"
echo "   cd ../web-portal"
echo "   npm run dev"
echo ""
echo "2️⃣  Run mobile app:"
echo "   iOS:     npm run ios"
echo "   Android: npm run android"
echo ""
echo "3️⃣  Start Metro bundler (if not auto-started):"
echo "   npm start"
echo ""
echo "🎉 Happy coding!"
