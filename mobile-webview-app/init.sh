#!/bin/bash

# Simple React Native Project Initialization
# This uses npx to create a complete React Native project, then we'll move our custom files

set -e

echo "🏗️  Initializing React Native Mobile App"
echo "========================================="
echo ""

# Check Node version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 18+ required. Current: $(node -v)"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"
echo ""

# Get the parent directory (iptv/)
PARENT_DIR=$(pwd)

# Go to parent to create fresh project
cd ..

echo "📱 Creating React Native project with TypeScript..."
echo "   (This may take a few minutes...)"
echo ""

# Create new React Native project
npx @react-native-community/cli@latest init StreamHubMobile \
    --pm npm \
    --skip-install

echo ""
echo "✅ React Native project created!"
echo ""

# Now move the native folders to our existing mobile-webview-app
echo "📂 Moving native projects to mobile-webview-app..."

# Move iOS and Android to our folder
mv StreamHubMobile/ios "$PARENT_DIR/mobile-webview-app/"
mv StreamHubMobile/android "$PARENT_DIR/mobile-webview-app/"

# Copy some config files we might need
cp StreamHubMobile/.watchmanconfig "$PARENT_DIR/mobile-webview-app/" 2>/dev/null || true
cp StreamHubMobile/jest.config.js "$PARENT_DIR/mobile-webview-app/" 2>/dev/null || true

# Clean up temp project
echo "🧹 Cleaning up temporary files..."
rm -rf StreamHubMobile

cd "$PARENT_DIR/mobile-webview-app"

echo ""
echo "✅ Native projects initialized!"
echo ""
echo "📦 Installing dependencies..."
npm install

# iOS: Install pods if on macOS
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo ""
    echo "🍎 Installing iOS dependencies (CocoaPods)..."
    cd ios
    pod install || {
        echo "⚠️  Pod install failed. Trying with arch..."
        arch -x86_64 pod install
    }
    cd ..
    echo "✅ iOS setup complete!"
fi

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
echo "🎉 Ready to develop!"
