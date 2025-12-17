# Mobile WebView App - Complete Setup Guide

## 🎯 Overview

This guide helps you set up the React Native mobile app that wraps the web-portal UI.

---

## 📋 Prerequisites

Before starting, ensure you have:

### General
- ✅ **Node.js 18+** (you have 20.18.1)
- ✅ **npm or yarn**
- ✅ **Git**

### For iOS Development (macOS only)
- ✅ **Xcode 15+** (from Mac App Store)
- ✅ **CocoaPods** (`sudo gem install cocoapods`)
- ✅ **Xcode Command Line Tools** (`xcode-select --install`)

### For Android Development
- ✅ **Android Studio** (latest version)
- ✅ **Android SDK** (API 33+)
- ✅ **JDK 17** (bundled with Android Studio)
- ✅ **Android Emulator** or physical device

---

## 🚀 Step-by-Step Setup

### Step 1: Initialize Native Projects

The mobile app needs Android/iOS native code. Initialize it:

```bash
cd mobile-webview-app

# Make scripts executable
chmod +x init-native.sh setup.sh

# Initialize native projects (one-time)
./init-native.sh
```

This creates `android/` and `ios/` folders with React Native boilerplate.

### Step 2: Install Dependencies

```bash
# Install npm packages
npm install

# iOS: Install CocoaPods
cd ios && pod install && cd ..
```

**Common issues:**

```bash
# If pod install fails:
cd ios
rm -rf Pods Podfile.lock
pod install
cd ..

# If M1/M2 Mac (Apple Silicon):
cd ios
arch -x86_64 pod install
cd ..
```

### Step 3: Configure Android

#### Set Environment Variables

Add to `~/.zshrc` or `~/.bash_profile`:

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

Reload:
```bash
source ~/.zshrc
```

#### Enable Android Emulator

```bash
# List available emulators
emulator -list-avds

# Start emulator (if none exist, create one in Android Studio)
emulator -avd Pixel_5_API_33
```

#### Enable Network Access (Important!)

Android emulator needs to access localhost web-portal:

```bash
# Forward localhost:3001 to emulator
adb reverse tcp:3001 tcp:3001
```

### Step 4: Start Web Portal (Required!)

The mobile app loads the web UI from localhost:

```bash
# In a separate terminal
cd ../web-portal
npm run dev

# Keep this running! Mobile app will connect to http://localhost:3001
```

### Step 5: Run Mobile App

#### iOS (macOS only)

```bash
cd mobile-webview-app

# Start Metro bundler
npm start

# In another terminal, run iOS
npm run ios

# Or specific simulator
npx react-native run-ios --simulator="iPhone 15 Pro"
```

#### Android

```bash
cd mobile-webview-app

# Start Metro bundler (if not running)
npm start

# In another terminal, run Android
npm run android
```

---

## 🧪 Testing the Integration

### 1. Test WebView Loading

- App should show the web-portal homepage
- You should be able to browse, search, etc.

### 2. Test Native Video Player

- Click any Live TV channel
- Should open **Native Player** (not web player)
- Check controls, volume, back button

### 3. Test VOD Player

- Click any movie/series
- Click "Play"
- Should open **Native Player** with:
  - ✅ Subtitles menu
  - ✅ Play/Pause controls
  - ✅ Seek bar
  - ✅ Resume from saved position

### 4. Test Progress Tracking

- Play a VOD for 30 seconds
- Close player
- Re-open same video
- Should resume from where you left off

---

## 🐛 Troubleshooting

### Metro Bundler Issues

```bash
# Clear cache
npx react-native start --reset-cache

# Kill all Metro processes
killall -9 node
npm start
```

### iOS Build Errors

```bash
# Clean Xcode build
cd ios
xcodebuild clean
cd ..

# Reinstall pods
cd ios
rm -rf Pods Podfile.lock
pod install
cd ..
```

### Android Build Errors

```bash
# Clean Gradle
cd android
./gradlew clean
cd ..

# Clear build cache
cd android
rm -rf .gradle build app/build
cd ..
```

### WebView Not Loading

**iOS:**
- Check web-portal is running: `curl http://localhost:3001`
- Check iOS simulator can access localhost

**Android:**
- Run: `adb reverse tcp:3001 tcp:3001`
- Check: `adb shell`
- Test: `curl http://localhost:3001`

### Video Player Not Opening

**Check Bridge:**
- Open React Native debugger
- Check console logs: `[WebView → Bridge]` and `[Bridge → Native]`
- Verify messages are being sent

**Check Native Player:**
- iOS: Check Xcode logs
- Android: Check Logcat (`adb logcat *:E`)

---

## 📦 Production Build

### Android APK

```bash
# Generate release APK
cd android
./gradlew assembleRelease

# APK location:
# android/app/build/outputs/apk/release/app-release.apk
```

### iOS IPA

```bash
# Open Xcode workspace
cd ios
open StreamHubMobile.xcworkspace

# In Xcode:
# 1. Select "Any iOS Device"
# 2. Product > Archive
# 3. Distribute App > Ad Hoc or App Store
```

### Bundle Web Portal (Offline)

For production builds, bundle the web-portal:

```bash
# Build web-portal as static site
cd web-portal
BUILD_TARGET=mobile npm run build

# Copy to mobile app
cp -r out ../mobile-webview-app/android/app/src/main/assets/web
mkdir -p ../mobile-webview-app/ios/web
cp -r out/* ../mobile-webview-app/ios/web/

# Rebuild mobile app
cd ../mobile-webview-app
npm run build:android  # or build iOS
```

---

## 🎨 Customization

### Change App Name

**Android:** `android/app/src/main/res/values/strings.xml`
```xml
<string name="app_name">StreamHub</string>
```

**iOS:** `ios/StreamHubMobile/Info.plist`
```xml
<key>CFBundleDisplayName</key>
<string>StreamHub</string>
```

### Change App Icon

- **Android:** Replace `android/app/src/main/res/mipmap-*/ic_launcher.png`
- **iOS:** Replace `ios/StreamHubMobile/Images.xcassets/AppIcon.appiconset/*`

### Change Package ID

**Android:** `android/app/build.gradle`
```gradle
defaultConfig {
    applicationId "com.streamhub.mobile"
}
```

**iOS:** Xcode > Project Settings > Bundle Identifier

---

## 📞 Need Help?

1. Check logs: Metro bundler, Xcode, or Logcat
2. Verify web-portal is running
3. Test bridge communication
4. Check network access (adb reverse for Android)

---

**Ready to go? Start with Step 1!** 🚀
