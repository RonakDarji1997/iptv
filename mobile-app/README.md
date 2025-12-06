# IPTV Mobile App - Expo React Native

A Netflix-style IPTV mobile application built with React Native and Expo, supporting both phones and tablets.

## 🚀 Features

### Currently Implemented (Phase 1 - Dummy Data)

- ✅ **Live TV Tab**: Browse channels by category with EPG information
- ✅ **Movies Tab**: Netflix-style category rows with movie thumbnails
- ✅ **Series Tab**: TV shows with category rows
- ✅ **Search Tab**: Unified search across channels, movies, and series
- ✅ **Movie Detail Screen**: Full movie information with play button
- ✅ **Series Detail Screen**: Seasons and episodes list
- ✅ **Continue Watching Row**: Resume playback from last position
- ✅ **Responsive Design**: Optimized for both phones and tablets
- ✅ **Dark Theme**: Netflix-inspired UI

### Coming Soon (Phase 2+)

- ⏳ Real API integration (Stalker Portal + iptv-sync-backend)
- ⏳ Video player with HLS streaming
- ⏳ Watch progress tracking and sync
- ⏳ Favorites management
- ⏳ User authentication
- ⏳ Settings and preferences

## 📱 Installation

### Prerequisites

- Node.js 18+ (you have 20.18.1)
- iOS Simulator (Xcode) or Android Emulator
- Expo Go app (for testing on real device)

### Setup

```bash
cd mobile-app
npm install
```

## 🏃 Running the App

### Development Mode (Expo Go)

```bash
npm start
```

Then:
- Press `i` for iOS simulator
- Press `a` for Android emulator
- Scan QR code with Expo Go app (iOS/Android)

### iOS Simulator

```bash
npm run ios
```

### Android Emulator

```bash
npm run android
```

### Web Browser

```bash
npm run web
```

## 📁 Project Structure

```
mobile-app/
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── MovieCard.tsx
│   │   ├── ChannelCard.tsx
│   │   ├── CategoryRow.tsx
│   │   ├── CategorySelector.tsx
│   │   ├── ContinueWatchingRow.tsx
│   │   └── LoadingStates.tsx
│   ├── screens/             # Screen components
│   │   ├── LiveTVScreen.tsx
│   │   ├── MoviesScreen.tsx
│   │   ├── SeriesScreen.tsx
│   │   ├── SearchScreen.tsx
│   │   ├── MovieDetailScreen.tsx
│   │   └── SeriesDetailScreen.tsx
│   ├── services/            # API services (coming soon)
│   │   ├── stalker/
│   │   ├── backend/
│   │   └── storage/
│   ├── hooks/               # Custom React hooks (coming soon)
│   ├── store/               # State management (coming soon)
│   ├── types/               # TypeScript types
│   ├── utils/               # Utility functions
│   ├── data/                # Dummy data
│   └── constants/           # App constants
├── App.tsx                  # Root component with navigation
└── package.json
```

## 🎨 Design Features

### Responsive Layout

- **Phone**: 3 columns grid, compact spacing
- **Tablet**: 5-6 columns grid, larger cards and text

### Netflix-Style UI

- Dark theme (#141414 background)
- Horizontal scrolling category rows
- Continue watching with progress bars
- Search with mixed results grid
- Smooth animations and transitions

### Tab Navigation

- **Live TV**: Channel grid with EPG
- **Movies**: Category rows (Action, Comedy, Drama, etc.)
- **Series**: TV shows by category
- **Search**: Universal search

## 🔧 Configuration

### Backend URL (constants/index.ts)

```typescript
export const API_CONFIG = {
  BACKEND_URL: 'http://192.168.2.69:3001/api', // Update with your backend URL
  TIMEOUT: 30000,
};
```

### Responsive Breakpoints

```typescript
export const IS_TABLET = SCREEN_WIDTH >= 768;
```

## 📊 Current Status

**Phase 1: ✅ COMPLETE**
- All UI screens implemented with dummy data
- Responsive design for phones and tablets
- Navigation setup
- Component library created

**Phase 2: 🔄 IN PROGRESS**
- API integration
- Real data fetching
- Video player implementation

## 🧪 Testing on Real Device (iOS)

### Using Expo Go (Quickest)

1. Install Expo Go from App Store
2. Run `npm start`
3. Scan QR code with Camera app
4. App opens in Expo Go

### Using Development Build (Recommended for Production)

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Build development app
eas build --profile development --platform ios

# Install on your device
```

## 🎯 Next Steps

1. ✅ Test UI on iOS device
2. ⏳ Implement API services
3. ⏳ Connect to iptv-sync-backend
4. ⏳ Add video player
5. ⏳ Implement real data fetching
6. ⏳ Add authentication
7. ⏳ Test streaming on real device

## 🐛 Known Issues / Lint Warnings

- Minor ESLint warnings (any types, Image alt props) - will be fixed in Phase 2
- useEffect setState warnings - using dummy data, will be refactored with real API

## 📝 Notes

- Currently using placeholder images (via.placeholder.com)
- All functionality uses dummy data
- Video player not yet implemented
- Authentication not yet implemented

## 🚀 Ready to Test!

The app is ready to run on your iOS device. All screens are functional with dummy data. You can navigate between tabs, browse content, view details, and see the Netflix-style UI in action!
