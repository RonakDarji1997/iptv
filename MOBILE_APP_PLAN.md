# IPTV Mobile App (Expo React Native) - Implementation Plan

## 📱 Project Overview

Creating a **Netflix-style IPTV mobile app** for iOS/Android using **Expo React Native** that mirrors the functionality of the Android TV app, with a mobile-optimized UI/UX.

---

## 🏗️ Architecture Analysis (Android TV → Mobile)

### Android TV App Structure

```
android-tv-native/
├── api/                      # Stalker Portal API Client
│   ├── StalkerPortalClient.kt   # Main API handler
│   ├── ApiService.kt            # Retrofit interface
│   └── ApiClient.kt             # HTTP client setup
├── data/                     # Repository layer
│   └── CategoryRepository.kt    # Category data management
├── database/                 # Room DB (local storage)
│   ├── AppDatabase.kt
│   └── entities/             # Data models
├── managers/                 # Business logic
│   ├── ProviderManager.kt
│   └── FavoriteRepository.kt
├── models/                   # Data classes
├── sync/                     # Cloud sync service
│   └── IPTVSyncService.kt
└── Activities/
    ├── MainActivity.kt       # Live TV
    ├── MoviesActivity.kt     # Movies section
    ├── SeriesDetailActivity.kt  # Series detail
    └── SearchActivity.kt     # Search functionality
```

---

## 🎯 Key Features to Implement

### 1. **Live TV** 📺
- Category-based channel navigation
- EPG (Electronic Program Guide) timeline
- Channel grid with thumbnails
- Direct playback with stream URL

### 2. **Movies** 🎬
- Category rows (Netflix-style)
- Movie thumbnails/posters
- Movie detail page (metadata, cast, description)
- Play button → streaming

### 3. **Series** 📼
- Series thumbnails
- Season selector
- Episode list with metadata
- Continue watching from last position

### 4. **Search** 🔍
- Unified search (channels, movies, series)
- Grid results with content type badges
- Auto-complete/debounced search

---

## 📊 API Endpoints (iptv-sync-backend)

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/refresh` - Token refresh

### Sync Endpoints
- `POST /api/sync/providers` - Sync provider data
- `POST /api/sync/categories` - Sync categories
- `POST /api/sync/channels` - Sync channels
- `GET /api/sync/pull` - Pull all data from cloud
- `POST /api/sync/progress` - Sync watch progress
- `POST /api/sync/settings` - Sync user settings

### Progress & Favorites
- `GET /api/progress/:contentId` - Get watch progress
- `POST /api/progress/update` - Update watch progress
- `GET /api/devices/list` - List user devices
- `POST /api/stream/start` - Start streaming session
- `POST /api/stream/heartbeat` - Keep session alive
- `POST /api/stream/end` - End streaming session

---

## 🔄 Android TV → Mobile Function Mapping

### 1. **API Layer**

| Android TV (Kotlin) | Mobile App (TypeScript) | Description |
|---------------------|-------------------------|-------------|
| `StalkerPortalClient.kt` | `services/stalker/StalkerClient.ts` | Direct Stalker portal API calls |
| `getGenres()` | `getLiveTVCategories()` | Get live TV categories |
| `getChannels(genreId, page)` | `getChannelsByCategory(id, page)` | Get channels paginated |
| `getStreamUrl(cmd)` | `getStreamUrl(cmd, type)` | Get HLS stream URL |
| `getVodCategories(type)` | `getMovieCategories() / getSeriesCategories()` | Get VOD categories |
| `getMovies(categoryId, page)` | `getMoviesByCategory(id, page)` | Get movies paginated |
| `getSeries(categoryId, page)` | `getSeriesByCategory(id, page)` | Get series paginated |
| `getSeriesSeasons(seriesId)` | `getSeasons(seriesId)` | Get series seasons |
| `getSeriesEpisodes(seasonId)` | `getEpisodes(seasonId, page)` | Get season episodes |
| `searchContent(query)` | `search(query, type)` | Search functionality |

### 2. **Data Models**

| Android TV (Kotlin) | Mobile App (TypeScript) |
|---------------------|-------------------------|
| `Genre.kt` | `types/Category.ts` |
| `Channel.kt` | `types/Channel.ts` |
| `Movie.kt` | `types/Movie.ts` |
| `Series.kt` | `types/Series.ts` |
| `Season.kt` | `types/Season.ts` |
| `Episode.kt` | `types/Episode.ts` |
| `EPG.kt` | `types/EPG.ts` |
| `Provider.kt` | `types/Provider.ts` |

### 3. **Local Storage**

| Android TV (Room DB) | Mobile App (AsyncStorage/SQLite) |
|----------------------|-----------------------------------|
| `AppDatabase.kt` | `storage/Database.ts` |
| `ProviderEntity` | `AsyncStorage` → 'provider' |
| `CategoryEntity` | `AsyncStorage` → 'categories' |
| `ChannelEntity` | `AsyncStorage` → 'channels' |
| `MovieEntity` | `AsyncStorage` → 'movies' |
| `FavoriteEntity` | `AsyncStorage` → 'favorites' |
| `WatchProgressEntity` | `AsyncStorage` → 'watchProgress' |

### 4. **UI Screens**

| Android TV Activity | Mobile Screen | Navigation |
|---------------------|---------------|------------|
| `MainActivity.kt` (Live TV) | `screens/LiveTVScreen.tsx` | Tab Navigator |
| `MoviesActivity.kt` | `screens/MoviesScreen.tsx` | Tab Navigator |
| `SeriesActivity` | `screens/SeriesScreen.tsx` | Tab Navigator |
| `SearchActivity.kt` | `screens/SearchScreen.tsx` | Tab Navigator |
| `MovieDetailActivity.kt` | `screens/MovieDetailScreen.tsx` | Stack Navigator |
| `SeriesDetailActivity.kt` | `screens/SeriesDetailScreen.tsx` | Stack Navigator |
| `PlayerView` (ExoPlayer) | `screens/PlayerScreen.tsx` | Modal/Fullscreen |
| `PortalSetupActivity.kt` | `screens/ProviderSetupScreen.tsx` | Stack Navigator |

### 5. **Key Components**

| Feature | Android TV | Mobile App |
|---------|-----------|-----------|
| **Category Slider** | `LiveCategoryAdapter` (RecyclerView) | `CategoryRow` (FlatList) |
| **Channel Grid** | `LiveChannelAdapter` (RecyclerView) | `ChannelGrid` (FlatList) |
| **Movie Rows** | `MovieCategoryRowAdapter` | `MovieRow` (Horizontal FlatList) |
| **EPG Timeline** | `EPGTimelineAdapter` | `EPGTimeline` (Horizontal FlatList) |
| **Video Player** | ExoPlayer | `react-native-video` or `expo-av` |
| **Thumbnails** | Coil (image loading) | `expo-image` (cached) |
| **Navigation** | Focus-based (D-pad) | Touch-based (gestures) |

---

## 📁 Proposed Mobile App Structure

```
mobile-app/                     # Expo monorepo package
├── app/                        # Expo Router (file-based routing)
│   ├── (tabs)/                # Tab navigation
│   │   ├── live.tsx           # Live TV tab
│   │   ├── movies.tsx         # Movies tab
│   │   ├── series.tsx         # Series tab
│   │   └── search.tsx         # Search tab
│   ├── movie/[id].tsx         # Movie detail (dynamic route)
│   ├── series/[id].tsx        # Series detail (dynamic route)
│   ├── player.tsx             # Video player (modal)
│   └── _layout.tsx            # Root layout
├── components/                # Reusable UI components
│   ├── CategoryRow.tsx        # Netflix-style category row
│   ├── MovieCard.tsx          # Movie thumbnail card
│   ├── ChannelCard.tsx        # Channel thumbnail card
│   ├── EPGTimeline.tsx        # EPG timeline component
│   ├── VideoPlayer.tsx        # Video player wrapper
│   └── SearchBar.tsx          # Search input
├── services/                  # API services
│   ├── stalker/
│   │   ├── StalkerClient.ts   # Direct Stalker API
│   │   └── types.ts           # Stalker API types
│   ├── backend/
│   │   ├── BackendClient.ts   # iptv-sync-backend API
│   │   └── auth.ts            # Authentication
│   └── storage/
│       ├── AsyncStorageService.ts  # Local caching
│       └── DatabaseService.ts      # SQLite (if needed)
├── hooks/                     # Custom React hooks
│   ├── useCategories.ts       # Fetch categories
│   ├── useChannels.ts         # Fetch channels
│   ├── useMovies.ts           # Fetch movies
│   ├── useSeries.ts           # Fetch series
│   ├── useSearch.ts           # Search hook
│   └── useWatchProgress.ts    # Watch progress tracking
├── store/                     # State management (Zustand/Context)
│   ├── providerStore.ts       # Provider state
│   ├── authStore.ts           # Authentication state
│   └── playerStore.ts         # Player state
├── types/                     # TypeScript types
│   ├── Provider.ts
│   ├── Category.ts
│   ├── Channel.ts
│   ├── Movie.ts
│   ├── Series.ts
│   ├── Episode.ts
│   └── EPG.ts
├── utils/                     # Utilities
│   ├── api.ts                 # API helpers
│   ├── storage.ts             # Storage helpers
│   └── constants.ts           # App constants
├── app.json                   # Expo config
├── package.json
└── tsconfig.json
```

---

## 🎨 UI/UX Design (Netflix-Style)

### Home Screen (Tab Navigation)
```
┌─────────────────────────────────┐
│  🔴 Live  🎬 Movies  📺 Series  🔍 Search │
├─────────────────────────────────┤
│  Continue Watching              │
│  [=========>  ] Movie Title     │
│                                 │
│  Trending Now                   │
│  [🎬] [🎬] [🎬] [🎬] [🎬] →     │
│                                 │
│  Action & Adventure             │
│  [🎬] [🎬] [🎬] [🎬] [🎬] →     │
│                                 │
│  Comedies                       │
│  [🎬] [🎬] [🎬] [🎬] [🎬] →     │
└─────────────────────────────────┘
```

### Live TV Screen
```
┌─────────────────────────────────┐
│  Categories: [All] Sports News   │
│                                 │
│  ┌──────┐ ┌──────┐ ┌──────┐    │
│  │ CH 1 │ │ CH 2 │ │ CH 3 │    │
│  │ Logo │ │ Logo │ │ Logo │    │
│  │ Name │ │ Name │ │ Name │    │
│  └──────┘ └──────┘ └──────┘    │
│                                 │
│  EPG: ──[Current Show]───→      │
└─────────────────────────────────┘
```

### Movie Detail Screen
```
┌─────────────────────────────────┐
│  ← Back                         │
│                                 │
│  ┌────────────┐                │
│  │            │  Movie Title    │
│  │   Poster   │  2024 • 2h 15m  │
│  │            │                 │
│  └────────────┘  ▶️ Play        │
│                  ➕ My List     │
│                                 │
│  Plot description here...       │
│  Cast: Actor 1, Actor 2...      │
│  Director: Name                 │
│                                 │
│  More Like This                 │
│  [🎬] [🎬] [🎬] [🎬]            │
└─────────────────────────────────┘
```

---

## 🚀 Implementation Strategy (Step-by-Step)

### **Phase 1: Project Setup & Dummy Data** (Week 1)

1. ✅ **Create Expo project with TypeScript**
   ```bash
   npx create-expo-app mobile-app --template tabs
   cd mobile-app
   npm install
   ```

2. ✅ **Install dependencies**
   ```bash
   npm install @react-navigation/native @react-navigation/bottom-tabs
   npm install expo-av expo-image expo-font
   npm install @react-native-async-storage/async-storage
   npm install zustand axios
   npm install react-native-video (or expo-av)
   ```

3. ✅ **Setup folder structure** (as shown above)

4. ✅ **Create dummy data files**
   - `data/dummyCategories.ts`
   - `data/dummyChannels.ts`
   - `data/dummyMovies.ts`
   - `data/dummySeries.ts`

5. ✅ **Build UI with dummy data**
   - Home screen with tabs
   - Live TV screen (categories + channel grid)
   - Movies screen (category rows)
   - Series screen (category rows)
   - Search screen (input + results)

6. ✅ **Test on iOS device** (Expo Go or development build)

### **Phase 2: API Integration** (Week 2)

7. ✅ **Create API services**
   - `StalkerClient.ts` (port from Android TV)
   - `BackendClient.ts` (iptv-sync-backend)

8. ✅ **Replace dummy data with real API calls**
   - Live TV categories → `getLiveTVCategories()`
   - Channels → `getChannelsByCategory(id, page)`
   - Movies → `getMoviesByCategory(id, page)`
   - Series → `getSeriesByCategory(id, page)`

9. ✅ **Implement pagination** (infinite scroll)

10. ✅ **Add loading states & error handling**

### **Phase 3: Detail Screens & Player** (Week 3)

11. ✅ **Movie detail screen**
    - Fetch movie metadata
    - Display poster, title, description, cast
    - Play button → get stream URL

12. ✅ **Series detail screen**
    - Fetch seasons
    - Display episodes in accordion
    - Play episode → get stream URL

13. ✅ **Video player implementation**
    - HLS streaming support
    - Fullscreen mode
    - Basic controls (play/pause, seek, volume)
    - Landscape orientation

### **Phase 4: Advanced Features** (Week 4)

14. ✅ **Search functionality**
    - Real-time search API
    - Debounced input
    - Mixed results (channels, movies, series)

15. ✅ **EPG integration**
    - Fetch EPG data for live channels
    - Display current show + timeline

16. ✅ **Watch progress tracking**
    - Save position to backend
    - Resume playback from last position
    - "Continue Watching" row

17. ✅ **Favorites feature**
    - Add/remove favorites
    - Sync with backend
    - Favorites screen

### **Phase 5: Polish & Production** (Week 5)

18. ✅ **Performance optimization**
    - Image caching (expo-image)
    - List virtualization (FlatList)
    - Lazy loading

19. ✅ **Settings screen**
    - Provider management
    - Player settings
    - Account settings

20. ✅ **iOS device testing**
    - Build development build
    - Test on real iOS device
    - Fix bugs

21. ✅ **Production build**
    - Configure app.json
    - Build standalone app
    - Submit to TestFlight (optional)

---

## 🔑 Key Technical Decisions

### 1. **Navigation**
- **Expo Router** (file-based) OR **React Navigation** (imperative)
- **Recommendation**: Expo Router for cleaner structure

### 2. **State Management**
- **Zustand** (lightweight) OR **React Context** (built-in)
- **Recommendation**: Zustand for simplicity

### 3. **Local Storage**
- **AsyncStorage** (key-value) OR **SQLite** (relational)
- **Recommendation**: AsyncStorage for simplicity, SQLite if heavy data

### 4. **Video Player**
- **expo-av** (built-in) OR **react-native-video** (more features)
- **Recommendation**: `expo-av` for simplicity, `react-native-video` for advanced controls

### 5. **Image Loading**
- **expo-image** (cached, optimized)
- **Recommendation**: Use `expo-image` for better performance

---

## 📝 Code Examples

### Example: StalkerClient.ts (Mobile)

```typescript
// services/stalker/StalkerClient.ts
import axios, { AxiosInstance } from 'axios';
import { md5 } from './utils';

export class StalkerClient {
  private client: AxiosInstance;
  private portalUrl: string;
  private macAddress: string;
  private token: string;
  private adid: string;

  constructor(portalUrl: string, macAddress: string, token: string = '') {
    this.portalUrl = portalUrl;
    this.macAddress = macAddress;
    this.token = token;
    this.adid = md5(macAddress.replace(/:/g, '').toUpperCase());

    this.client = axios.create({
      baseURL: this.getBaseUrl(),
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3',
        'X-User-Agent': 'Model: MAG270; Link: WiFi',
        'Authorization': `Bearer ${this.token}`,
        'Cookie': `mac=${this.macAddress}; timezone=America/Toronto; adid=${this.adid}`,
      },
    });
  }

  private getBaseUrl(): string {
    const baseUrl = this.portalUrl.replace(/\/$/, '');
    return baseUrl.includes('/stalker_portal')
      ? baseUrl
      : `${baseUrl}/stalker_portal`;
  }

  async getLiveTVCategories(): Promise<Category[]> {
    const url = '/server/load.php?type=itv&action=get_genres&JsHttpRequest=1-xml';
    const response = await this.client.get(url);
    const data = response.data.js;
    return data.map((item: any) => ({
      id: item.id,
      name: item.title,
      censored: item.censored === '1',
    }));
  }

  async getChannelsByCategory(categoryId: string, page: number = 1): Promise<ChannelsResponse> {
    const url = `/server/load.php?type=itv&action=get_ordered_list&genre=${categoryId}&page=${page}&sortby=number&JsHttpRequest=1-xml`;
    const response = await this.client.get(url);
    const data = response.data.js;
    return {
      channels: data.data.map(this.mapChannel),
      total: parseInt(data.total_items, 10),
    };
  }

  async getStreamUrl(cmd: string): Promise<string> {
    const url = `/server/load.php?type=itv&action=create_link&cmd=${cmd}&JsHttpRequest=1-xml`;
    const response = await this.client.get(url);
    return response.data.js.cmd;
  }

  // ... more methods
}
```

### Example: Category Row Component

```typescript
// components/CategoryRow.tsx
import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { MovieCard } from './MovieCard';

interface CategoryRowProps {
  title: string;
  items: Movie[];
  onItemPress: (item: Movie) => void;
}

export const CategoryRow: React.FC<CategoryRowProps> = ({ title, items, onItemPress }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <FlatList
        horizontal
        data={items}
        renderItem={({ item }) => (
          <MovieCard movie={item} onPress={() => onItemPress(item)} />
        )}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginVertical: 16 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 12, marginLeft: 16 },
  list: { paddingHorizontal: 16 },
});
```

---

## 🧪 Testing Strategy

1. **Development**: Use Expo Go on iOS device
2. **API Testing**: Test with real iptv-sync-backend
3. **Video Playback**: Test HLS streams on real device
4. **Performance**: Monitor FPS, memory usage
5. **Production**: Create development build for TestFlight

---

## 📦 Next Steps

**Start with Phase 1**: Create project structure with dummy data, build all UI screens, test on iOS device. Once UI is complete and approved, we'll proceed to API integration phase by phase.

Would you like me to start implementing Phase 1 now?
