#!/bin/bash

# Quick initialization script using React Native CLI
# This creates the native Android/iOS projects

set -e

echo "🏗️  Initializing React Native project..."
echo ""

# Check if React Native CLI is installed globally
if ! command -v react-native &> /dev/null; then
    echo "📦 Installing React Native CLI globally..."
    npm install -g react-native-cli
fi

# Initialize new React Native project with TypeScript
echo "📱 Creating React Native project..."
npx react-native@latest init StreamHubMobile \
    --template react-native-template-typescript \
    --skip-install \
    --directory ./temp_init

# Move native folders to current directory
echo "📂 Moving native project files..."
mv temp_init/android ./android 2>/dev/null || true
mv temp_init/ios ./ios 2>/dev/null || true

# Clean up temp directory
rm -rf temp_init

echo ""
echo "✅ Native projects initialized!"
echo ""
echo "Next: Run './setup.sh' to install dependencies"
