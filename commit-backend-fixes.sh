#!/bin/bash
# Script to commit backend subtitle fixes to git

echo "📦 Copying fixed backend files to git repo..."

# Create necessary directories
mkdir -p android-tv-native/whisper-backend/services
mkdir -p android-tv-native/whisper-backend/app

# Copy Node.js backend files (whisper-api container)
echo "  - Copying server.js..."
cp server.js.final android-tv-native/whisper-backend/server.js

echo "  - Copying SubtitleGenerator.js..."
cp SubtitleGenerator.js android-tv-native/whisper-backend/services/SubtitleGenerator.js

# Copy Python Flask service (whisper-container)
echo "  - Copying whisper_service.py..."
cp whisper_service.py.fixed2 android-tv-native/whisper-backend/app/whisper_service.py

# Check if files were copied
if [ -f android-tv-native/whisper-backend/server.js ] && \
   [ -f android-tv-native/whisper-backend/services/SubtitleGenerator.js ] && \
   [ -f android-tv-native/whisper-backend/app/whisper_service.py ]; then
  echo "✅ All files copied successfully"
  
  # Add to git
  echo "📝 Adding files to git..."
  git add android-tv-native/whisper-backend/
  
  # Show what will be committed
  echo ""
  echo "📋 Files to be committed:"
  git status --short android-tv-native/whisper-backend/
  
  echo ""
  echo "✅ Ready to commit. Run:"
  echo "   git commit -m 'Fix subtitle backend: HTTP communication, gateway IP, segments support'"
  echo "   git push origin updates-branch"
else
  echo "❌ Error: Some files failed to copy"
  exit 1
fi
