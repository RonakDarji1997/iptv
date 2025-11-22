# Native Android TV IPTV Player

A native Android TV application for IPTV streaming with proper focus handling and navigation.

## Features

- ✅ **Focus Tracking**: White background when navigating with D-pad (UP/DOWN)
- ✅ **Selection State**: Grey background with blue border when CENTER/SELECT pressed
- ✅ **Three Tabs**: TV, Movies, Shows navigation
- ✅ **Debug Display**: Real-time display of selected and hover states
- 🔄 **API Integration**: Connects to backend at http://10.0.2.2:2005
- 🔄 **ExoPlayer**: Video playback for streams
- 🔄 **Content Grid**: Category-based content browsing

## Project Structure

```
android-tv-native/
├── app/
│   ├── build.gradle.kts
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── java/com/ronika/iptvnative/
│       │   └── MainActivity.kt
│       └── res/
│           ├── layout/
│           │   └── activity_main.xml
│           ├── drawable/
│           │   ├── nav_item_focused.xml (white)
│           │   ├── nav_item_selected.xml (grey + blue border)
│           │   └── nav_item_normal.xml (transparent)
│           └── values/
│               ├── colors.xml
│               ├── strings.xml
│               └── themes.xml
├── build.gradle.kts
└── settings.gradle.kts
```

## Build Instructions

1. **Prerequisites**:
   - Android Studio
   - Android SDK API 21-34
   - Java 17+

2. **Build APK**:
   ```bash
   cd android-tv-native
   ./gradlew assembleDebug
   ```

3. **Install on Emulator**:
   ```bash
   # Start GoogleTV_ARM64_API34 emulator
   adb install app/build/outputs/apk/debug/app-debug.apk
   ```

## Testing Focus Behavior

1. Launch app on Android TV emulator
2. Press **UP/DOWN** on D-pad → Tab should show white background + black text (hover state)
3. Press **CENTER/SELECT** → Tab should show grey background + blue border (selected state)
4. Check debug display for current Selected and Hover states

## Focus States

| State | Background | Text Color | Border |
|-------|-----------|------------|--------|
| Normal | Transparent | #b0bec5 | None |
| Focused (Hover) | White (#ffffff) | Black (#000000) | White |
| Selected | Grey (#546e7a) | White (#ffffff) | Blue (#00bcd4) |

## Next Steps

- [ ] Implement API client with Retrofit
- [ ] Add categories row (Action, Drama, Comedy, etc.)
- [ ] Build content grid with channel/movie cards
- [ ] Add video player screen with ExoPlayer
- [ ] Implement watch history
- [ ] Add series detail modal

## Backend API

The app connects to the Next.js backend at:
- **Local**: http://localhost:2005
- **From Emulator**: http://10.0.2.2:2005

## Dependencies

- **Leanback 1.0.0**: Android TV UI components
- **ExoPlayer/Media3 1.2.0**: Video playback
- **Retrofit 2.9.0**: API client
- **Coil 2.5.0**: Image loading
- **Coroutines**: Async operations
- **LiveData & ViewModel**: MVVM architecture
