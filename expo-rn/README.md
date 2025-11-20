# IPTV Player - Cross-Platform

A full-featured IPTV player built with React Native and Expo, supporting iOS, Android, Android TV, Apple TV, and Web.

## 🎯 Features

- ✅ Live TV streaming with HLS support
- ✅ Movies and Series browsing
- ✅ EPG (Electronic Program Guide) support
- ✅ Video player with custom controls
- ✅ Authentication with MAC address
- ✅ Multi-platform support (Mobile, TV, Web)
- ✅ Pull-to-refresh content
- ✅ Dark theme UI

## 📱 Platforms

### Native Apps (iOS, Android, TV)
The React Native app (`/expo-rn`) works natively on:
- iOS (iPhone, iPad)
- Android (Phone, Tablet)
- Android TV
- Apple TV

### Web
For web deployment, use the original Next.js app (`/`) which includes:
- CORS proxy for Stalker Portal API
- SEO optimization
- Server-side rendering

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- Expo CLI
- iOS Simulator (for iOS development)
- Android Studio (for Android development)

### Installation

```bash
cd expo-rn
npm install
```

### Configuration

Create a `.env` file in the `expo-rn` directory:

```bash
STALKER_MAC=00:1A:79:17:F4:F5
STALKER_URL=http://tv.stream4k.cc/stalker_portal/
STALKER_BEARER=1E75E91204660B7A876055CE8830130E
STALKER_ADID=06c140f97c839eaaa4faef4cc08a5722
```

These credentials are used for direct authentication with the Stalker Portal (no handshake required).

### Running the App

**Development Server:**
```bash
npx expo start
```

Then:
- Press `i` for iOS simulator
- Press `a` for Android emulator
- Press `w` for web (limited - use Next.js app for full web experience)

**iOS:**
```bash
npx expo run:ios
```

**Android:**
```bash
npx expo run:android
```

### Configuration

1. **Login Credentials:**
   - MAC Address: Your IPTV provider's MAC address
   - Portal URL: Your Stalker Portal URL (e.g., `http://tv.stream4k.cc/stalker_portal/`)

2. **Default Credentials** (for testing):
   - MAC: `00:1A:79:17:F4:F5`
   - Portal: `http://tv.stream4k.cc/stalker_portal/`

## 📦 Project Structure

```
expo-rn/
├── app/
│   ├── (auth)/         # Authentication screens
│   ├── (tabs)/         # Main app tabs
│   ├── watch/          # Video player screen
│   └── _layout.tsx     # Root navigation
├── components/
│   ├── VideoPlayer.tsx # Custom video player
│   ├── ContentCard.tsx # Content display cards
│   └── ContentRow.tsx  # Horizontal content rows
└── lib/
    ├── stalker-client.ts # Stalker API client
    ├── stalker-api.ts    # API types
    └── store.ts          # Zustand state management
```

## 🎨 Key Components

### VideoPlayer
- HLS streaming support via expo-av
- Custom controls (play/pause, seek, progress bar)
- Auto-hide controls
- Landscape lock on mobile
- Platform-specific optimizations

### Content Browsing
- Category-based navigation
- Horizontal scrolling content rows
- Card-based UI with metadata
- HD/4K badges
- Channel numbers and logos

### Authentication
- Persistent login with AsyncStorage
- Automatic session management
- Protected routes

## 🔧 Building for Production

### Android TV
```bash
eas build --platform android --profile production
```

### iOS / Apple TV
```bash
eas build --platform ios --profile production
```

### Web (Use Next.js App)
```bash
cd ..
npm run build
npm start
```

## 📱 Platform-Specific Features

### Mobile (iOS/Android)
- Touch gestures
- Landscape video playback
- Pull-to-refresh
- Native navigation

### TV (Android TV/Apple TV)
- D-pad navigation ready
- Focus states
- Remote control support (in VideoPlayer)
- 10-foot UI optimized

### Web
- Responsive design
- CORS proxy for API calls
- Progressive Web App support (via Next.js)

## 🐛 Known Issues & Workarounds

### Web CORS Errors
**Issue:** Direct API calls from browser are blocked by CORS  
**Solution:** Use the Next.js app at `/` for web deployment which includes a proxy

### useLayoutEffect SSR Warnings
**Issue:** React Navigation shows SSR warnings  
**Impact:** Harmless warnings, app functions normally

## 🔮 Future Enhancements

- [ ] Series episode selection modal
- [ ] EPG program guide display
- [ ] Search functionality
- [ ] Favorites management
- [ ] Continue watching / playback position
- [ ] Enhanced TV D-pad navigation
- [ ] Picture-in-Picture (mobile)
- [ ] Chromecast support
- [ ] Offline downloads
- [ ] Settings & preferences

## 📄 License

MIT

## 👥 Contributing

Contributions welcome! Please feel free to submit a Pull Request.
