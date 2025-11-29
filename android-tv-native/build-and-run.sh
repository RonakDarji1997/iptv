#!/bin/bash

# Build, Install, and Run Android TV App
# This script builds the app, installs it on connected device, and launches it

echo "🔨 Building Android TV App..."
./gradlew build

if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
    echo "📦 Installing app on device..."
    ./gradlew installDebug

    if [ $? -eq 0 ]; then
        echo "✅ Installation successful!"
        echo "🚀 Launching app..."
        ./gradlew runApp

        if [ $? -eq 0 ]; then
            echo "✅ App launched successfully!"
        else
            echo "❌ Failed to launch app. Make sure device is connected and ADB is working."
        fi
    else
        echo "❌ Installation failed. Make sure device is connected and ADB is working."
    fi
else
    echo "❌ Build failed!"
    exit 1
fi