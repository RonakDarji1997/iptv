# React Native TV App

TV-optimized IPTV player built with React Native TV for Android TV and Apple TV.

## Features

- **D-pad Navigation**: Full support for TV remote control navigation
- **TV-Optimized UI**: Large touch targets, focus indicators, parallax effects
- **Live TV**: Browse and watch live channels with EPG timeline
- **Movies & Series**: Browse VOD content with grid layout
- **Video Player**: Full-featured video player with TV controls
- **Focus Management**: Smart focus handling with TVFocusGuideView

## Tech Stack

- React Native TV 0.76.0-0
- React Navigation (TV-optimized)
- react-native-video for video playback
- Zustand for state management
- AsyncStorage for persistence
- TypeScript

## Setup

1. **Install dependencies**:
```bash
cd tv-app
npm install
```

2. **Configure backend API**:
Create `.env` file:
```
API_URL=http://your-backend:2005
```

3. **Android TV**:
```bash
npx react-native run-android
```

4. **Apple TV**:
```bash
cd ios
pod install
cd ..
npx react-native run-ios --simulator="Apple TV"
```

## Project Structure

```
tv-app/
├── src/
│   ├── components/         # TV-specific components
│   │   ├── TVGrid.tsx     # Grid layout with TV focus
│   │   ├── FocusableCard.tsx  # Card with focus effects
│   │   └── EPGTimeline.tsx    # Program guide timeline
│   ├── screens/           # App screens
│   │   ├── HomeScreen.tsx
│   │   ├── LiveTVScreen.tsx
│   │   ├── MoviesScreen.tsx
│   │   ├── SeriesScreen.tsx
│   │   └── PlayerScreen.tsx
│   ├── navigation/        # Navigation setup
│   │   └── AppNavigator.tsx
│   ├── lib/              # Core logic
│   │   ├── api-client.ts  # Backend API client
│   │   └── store.ts       # Zustand state
│   └── App.tsx           # App entry point
├── android/              # Android TV project
├── ios/                  # Apple TV project
└── package.json
```

## TV Remote Controls

### Navigation
- **D-pad**: Navigate between items
- **OK/Select**: Select item
- **Back**: Go back
- **Menu**: Show menu (context-specific)

### Video Player
- **Play/Pause**: Toggle playback
- **Left/Right**: Seek -30s / +30s
- **Back**: Exit player
- **OK**: Show/hide controls

## Components

### TVGrid
Grid layout with TV focus management:
```tsx
<TVGrid
  data={items}
  renderItem={(item, focused) => <Card focused={focused} />}
  onItemSelect={handleSelect}
  numColumns={5}
/>
```

### FocusableCard
Content card with focus effects:
- Scale animation on focus
- Red border highlight
- Parallax effects

### EPGTimeline
Program guide with time markers:
- Horizontal scrollable timeline
- Current time indicator
- Program blocks with metadata

### PlayerScreen
Full-featured video player:
- react-native-video integration
- TV-optimized controls
- Progress bar
- Seek controls

## API Integration

The app communicates with the Next.js backend at `http://localhost:2005`:

- `POST /api/stalker/channels` - Get live channels
- `POST /api/stalker/vod` - Get movies/series
- `POST /api/stalker/stream` - Get stream URL
- `POST /api/stalker/epg` - Get program guide

## State Management

Zustand store for auth:
- MAC address
- Portal URL
- Session token
- Auto-persist to AsyncStorage

## Development

**Metro bundler**:
```bash
npm start
```

**TypeScript check**:
```bash
npm run tsc
```

**Lint**:
```bash
npm run lint
```

## Build for Production

**Android TV**:
```bash
cd android
./gradlew assembleRelease
```

**Apple TV**:
```bash
xcodebuild -workspace ios/tvapp.xcworkspace \
  -scheme tvapp-tvOS \
  -configuration Release \
  -archivePath build/tvapp.xcarchive \
  archive
```

## Notes

- Ensure backend is running on `http://localhost:2005`
- Configure MAC address and portal URL in auth store
- TV UI is optimized for 1920x1080 resolution
- Focus management uses `hasTVPreferredFocus` prop
- All navigation uses fade transitions for TV

## Architecture

```
TV App → ApiClient → http://localhost:2005/api/* → Backend → Stalker Portal
```

The TV app is completely separate from the mobile Expo app, sharing only the backend API endpoints.
