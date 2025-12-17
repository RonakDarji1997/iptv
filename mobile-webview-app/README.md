# StreamHub Mobile App - Hybrid WebView + Native Video Players

**🎯 Architecture**: Web Portal UI (95%) + Native Video Players (5%)

This mobile app wraps the entire `web-portal` inside a WebView and intercepts video playback to use native players with full subtitle support, quality selection, and progress tracking.

---

## 📱 Quick Start

### Prerequisites

- **macOS** (for iOS development)
- **Node.js** 18+ (you have 20.18.1 ✅)
- **Xcode** 15+ (for iOS)
- **Android Studio** (for Android)
- **CocoaPods** (for iOS dependencies)

### Installation

```bash
# Navigate to mobile app directory
cd mobile-webview-app

# Install dependencies
npm install

# iOS: Install pods
cd ios && pod install && cd ..

# Android: Sync gradle (auto on build)
```

---

## 🚀 Development

### Run on iOS Simulator

```bash
npm run ios

# Or specific simulator
npx react-native run-ios --simulator="iPhone 15 Pro"
```

### Run on Android Emulator

```bash
# Start Android emulator first (via Android Studio)

npm run android

# Or specific device
npx react-native run-android --deviceId=emulator-5554
```

### Run with Local Web Portal

**IMPORTANT**: The web portal must be running locally:

```bash
# Terminal 1: Start web portal (in web-portal folder)
cd ../web-portal
npm run dev

# Terminal 2: Start mobile app
cd ../mobile-webview-app
npm start
```

The mobile app will connect to `http://localhost:3001` in development mode.

---

## 📦 Production Build

### Android APK

```bash
# Build release APK
npm run build:android

# Output: android/app/build/outputs/apk/release/app-release.apk
```

### iOS IPA

```bash
# Open Xcode
cd ios
open StreamHubMobile.xcworkspace

# In Xcode:
# 1. Select "Any iOS Device" scheme
# 2. Product > Archive
# 3. Distribute to App Store / Ad Hoc
```

### Bundle Web Portal (Offline Mode)

For production, bundle the web portal as static files:

```bash
# In web-portal folder
cd ../web-portal

# Build static export
BUILD_TARGET=mobile npm run build

# Copy to mobile app assets
cp -r out ../mobile-webview-app/android/app/src/main/assets/web
cp -r out ../mobile-webview-app/ios/web

# Now rebuild mobile app - it will use bundled files
```

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────┐
│   React Native Mobile App              │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │  WebView (localhost:3001)         │ │
│  │  ┌─────────────────────────────┐  │ │
│  │  │  Next.js Web Portal         │  │ │
│  │  │  • Browse / Search          │  │ │
│  │  │  • Favorites / Settings     │  │ │
│  │  │  • All UI Components        │  │ │
│  │  └─────────────────────────────┘  │ │
│  │                                    │ │
│  │  When "Play" clicked:             │ │
│  │  ↓ postMessage({ type, data })    │ │
│  └───────────────────────────────────┘ │
│              ↓                          │
│  ┌───────────────────────────────────┐ │
│  │   Native Video Players            │ │
│  │   • Live TV (MPEG-TS/HLS)        │ │
│  │   • VOD (MP4/M3U8)               │ │
│  │   • Subtitles (VTT/SRT)          │ │
│  │   • Progress Tracking            │ │
│  └───────────────────────────────────┘ │
│              ↓ Progress updates         │
│  ┌───────────────────────────────────┐ │
│  │   Backend API                     │ │
│  │   • Save watch progress           │ │
│  │   • Sync across devices           │ │
│  └───────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

---

## 🔌 Bridge Communication

### Messages: Web → Native

```typescript
// Play Live TV
window.ReactNativeWebView.postMessage(JSON.stringify({
  type: 'PLAY_LIVE_TV',
  data: { url, title, channelNum, cmd }
}));

// Play VOD
window.ReactNativeWebView.postMessage(JSON.stringify({
  type: 'PLAY_VOD',
  data: { 
    url, title, contentId, savedPosition,
    subtitles, selectedSubtitle, isSeries, ... 
  }
}));
```

### Messages: Native → Web

```typescript
// Progress updates (every 5s)
webView.postMessage(JSON.stringify({
  type: 'VIDEO_PROGRESS',
  data: { contentId, currentTime, duration }
}));

// Video ended
webView.postMessage(JSON.stringify({
  type: 'VIDEO_ENDED',
  data: { contentId, duration }
}));

// Player closed
webView.postMessage(JSON.stringify({
  type: 'VIDEO_CLOSED',
  data: {}
}));
```

---

## 📂 Project Structure

```
mobile-webview-app/
├── android/                 # Android native code
├── ios/                     # iOS native code
├── src/
│   ├── screens/
│   │   └── WebViewScreen.tsx       # Main WebView container
│   ├── components/
│   │   ├── NativeLiveTVPlayer.tsx  # Live TV player
│   │   └── NativeVODPlayer.tsx     # VOD player (full features)
│   ├── types/
│   │   └── bridge.ts               # TypeScript types for messaging
│   └── utils/
├── App.tsx                  # App entry point
├── package.json
└── README.md
```

---

## ✨ Features

### Native Video Players

✅ **Live TV Player**
- MPEG-TS and HLS stream support
- Hardware acceleration
- Volume control
- Channel info overlay
- Auto-hide controls

✅ **VOD Player**
- Full subtitle support (VTT/SRT)
- Quality selection (Original/720p/480p)
- Resume playback from last position
- Skip forward/backward (10s)
- Progress bar with seek
- Episode navigation (for series)
- Play/Pause controls
- Fullscreen mode

### Web Portal Features (All Available)

✅ Browse content by category
✅ Search (Movies, Series, Live TV)
✅ Favorites management
✅ Continue watching
✅ Watch history
✅ User authentication
✅ Provider management
✅ Parental controls

---

## 🔧 Troubleshooting

### iOS Issues

**Metro bundler not connecting:**
```bash
# Clear cache
npx react-native start --reset-cache
```

**Pods installation failed:**
```bash
cd ios
pod deintegrate
pod install
cd ..
```

### Android Issues

**Gradle build failed:**
```bash
cd android
./gradlew clean
cd ..
npm run android
```

**WebView not loading:**
- Check if web-portal is running on `http://localhost:3001`
- Check Android emulator can access host: `adb reverse tcp:3001 tcp:3001`

### Video Playback Issues

**Subtitles not showing:**
- Ensure subtitle URL is accessible from mobile
- Check subtitle format (VTT preferred over SRT)
- Native player logs: Check Xcode/Logcat

**Progress not saving:**
- Verify backend API is accessible
- Check auth token in WebView
- Bridge message logs in console

---

## 📱 Testing Checklist

### Before Release

- [ ] Test Live TV playback (MPEG-TS stream)
- [ ] Test VOD playback (MP4/HLS)
- [ ] Test subtitle loading and display
- [ ] Test quality switching
- [ ] Test resume playback
- [ ] Test progress saving to backend
- [ ] Test video ended detection
- [ ] Test back button handling
- [ ] Test app backgrounding/foregrounding
- [ ] Test offline mode (bundled web-portal)
- [ ] Test on different screen sizes
- [ ] Test on iOS (iPhone/iPad)
- [ ] Test on Android (Phone/Tablet)

---

## 🚢 Deployment

### Android Play Store

1. Generate signed APK/Bundle
2. Create store listing
3. Upload APK/AAB
4. Submit for review

### iOS App Store

1. Archive in Xcode
2. Upload to App Store Connect
3. Fill app information
4. Submit for review

---

## 🎯 Next Steps

1. **Test Development Mode**: Run both web-portal and mobile app locally
2. **Test Video Playback**: Try Live TV and VOD with subtitles
3. **Build Production Bundle**: Bundle web-portal for offline use
4. **Test on Real Devices**: Install on physical iOS/Android devices
5. **Submit to Stores**: Follow deployment guide above

---

## 📞 Support

For issues:
- Check logs in Xcode (iOS) or Logcat (Android)
- Verify web-portal is accessible
- Test bridge communication
- Check backend API connectivity

---

**Built with ❤️ using React Native + Next.js**
