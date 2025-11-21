# Quick Start Guide - TV App

## Overview
Standalone React Native TV application for Android TV and Apple TV. Shares backend with mobile app but completely separate codebase.

## Directory
```
/Users/ronika/Desktop/iptv/tv-app/
```

## Quick Start

### 1. Install Dependencies
```bash
cd /Users/ronika/Desktop/iptv/tv-app
npm install
```

### 2. Configure Backend URL
Create `.env`:
```
API_URL=http://localhost:2005
```

### 3. Run Backend (in separate terminal)
```bash
cd /Users/ronika/Desktop/iptv
npm run dev
```

### 4. Run TV App

**Android TV:**
```bash
npx react-native run-android
```

**Apple TV (macOS only):**
```bash
cd ios
pod install
cd ..
npx react-native run-ios --simulator="Apple TV"
```

## File Structure
```
tv-app/
├── src/
│   ├── App.tsx              # Main app
│   ├── components/          # TVGrid, FocusableCard, EPGTimeline
│   ├── screens/             # Home, LiveTV, Movies, Series, Player
│   ├── navigation/          # AppNavigator
│   └── lib/                 # api-client, store
├── android/                 # Android TV config
├── ios/                     # Apple TV config
└── index.js                 # Entry point
```

## Key Features
- ✅ D-pad navigation with focus management
- ✅ Live TV with channel grid
- ✅ Movies & Series browsers
- ✅ Full video player with TV controls
- ✅ EPG timeline support
- ✅ Same backend APIs as mobile app

## TV Remote Controls
- **D-pad**: Navigate
- **OK**: Select
- **Back**: Go back
- **Play/Pause**: Control video
- **Left/Right**: Seek ±30s in player

## Components

### TVGrid
```tsx
<TVGrid
  data={items}
  renderItem={(item, focused) => <Card focused={focused} />}
  onItemSelect={handleSelect}
  numColumns={5}
/>
```

### FocusableCard
```tsx
<FocusableCard
  title="Item Name"
  imageUrl="http://..."
  subtitle="Year"
  focused={isFocused}
/>
```

### PlayerScreen
Full-featured player with:
- react-native-video
- Progress bar
- Seek controls
- Auto-hide UI

## API Client
```typescript
import { ApiClient } from '@/lib/api-client';

const client = new ApiClient({ 
  mac: 'XX:XX:XX:XX:XX:XX',
  url: 'http://portal.example.com'
});

// Get channels
const result = await client.getChannels('*', 1);

// Get stream URL
const stream = await client.getStreamUrl(cmd, 'itv');
```

## State Management
```typescript
import { useAuthStore } from '@/lib/store';

const { macAddress, portalUrl, isAuthenticated } = useAuthStore();
```

## Troubleshooting

**"Cannot find module"**: Run `npm install`

**Backend not reachable**: Check API_URL in .env and backend is running on port 2005

**Video won't play**: Check stream URL format (HLS .m3u8 works best)

**Focus not working**: Ensure `hasTVPreferredFocus` is set on first item

## Development Commands

```bash
# Start Metro
npm start

# Type check
npm run tsc

# Android TV
npx react-native run-android

# Apple TV
npx react-native run-ios --simulator="Apple TV"

# Clear cache
npm start -- --reset-cache
```

## Architecture
```
TV App → ApiClient → http://localhost:2005/api/* → Backend → Stalker Portal
```

## Platform Requirements

**Android TV:**
- Android Studio
- Android SDK 28+
- Android TV emulator or device

**Apple TV:**
- macOS
- Xcode 15+
- tvOS 17+
- Apple TV simulator or device

## Next Steps

1. ✅ Install dependencies: `npm install`
2. ✅ Configure .env with API_URL
3. ✅ Start backend on port 2005
4. ✅ Run on Android TV or Apple TV
5. Test D-pad navigation
6. Test video playback
7. Add login screen if needed
8. Customize UI colors/themes

## Related Files

- **Backend API**: `/Users/ronika/Desktop/iptv/src/app/api/stalker/`
- **Mobile App**: `/Users/ronika/Desktop/iptv/expo-rn/`
- **Documentation**: 
  - `TV_APP_SUMMARY.md` - Full development summary
  - `README.md` - TV app documentation
  - `/ARCHITECTURE.md` - Overall architecture

## Support

All TV app files are in `/tv-app/` directory, completely separate from mobile app. Both apps share the same Next.js backend API at `http://localhost:2005`.
