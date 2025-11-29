#!/bin/bash

# Test script for SELECT_TAB functionality
# Usage: ./test-select-tab.sh [TV|MOVIES|SHOWS]

TAB=${1:-TV}

echo "🧪 Testing SELECT_TAB functionality with tab: $TAB"

# Launch app with SELECT_TAB intent extra
adb shell am start -n com.ronika.iptvnative/.MainActivity --es SELECT_TAB "$TAB"

echo "✅ App launched with SELECT_TAB=$TAB"
echo "📺 Check your Android TV device to verify the correct tab is selected"