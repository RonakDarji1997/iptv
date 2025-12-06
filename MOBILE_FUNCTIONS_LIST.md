# IPTV Mobile App - Complete Functions List

## 📋 API Functions (Services Layer)

### 1. **StalkerClient.ts** - Direct Portal API
Based on Android TV `StalkerPortalClient.kt`

```typescript
class StalkerClient {
  // ✅ Authentication & Setup
  constructor(portalUrl: string, macAddress: string, token: string, serialNumber: string)
  
  // ✅ Live TV Functions
  getLiveTVCategories(): Promise<Category[]>
  getChannelsByCategory(categoryId: string, page: number): Promise<ChannelsResponse>
  getStreamUrl(cmd: string, type: 'itv' | 'vod'): Promise<string>
  getEPGForChannel(channelId: string): Promise<EPGProgram[]>
  
  // ✅ Movies Functions
  getMovieCategories(): Promise<Category[]>
  getMoviesByCategory(categoryId: string, page: number, sortBy?: string): Promise<MoviesResponse>
  getMovieInfo(movieId: string): Promise<MovieDetails>
  getMovieStreamUrl(movieId: string, cmd: string): Promise<string>
  
  // ✅ Series Functions
  getSeriesCategories(): Promise<Category[]>
  getSeriesByCategory(categoryId: string, page: number): Promise<SeriesResponse>
  getSeriesSeasons(seriesId: string): Promise<Season[]>
  getSeasonEpisodes(seriesId: string, seasonId: string, page: number): Promise<EpisodesResponse>
  getEpisodeStreamUrl(seriesId: string, seasonId: string, episodeId: string, cmd: string): Promise<string>
  getSeriesInfo(seriesId: string): Promise<SeriesDetails>
  
  // ✅ Search Function
  searchContent(query: string, type?: 'all' | 'vod' | 'series', page?: number): Promise<SearchResults>
  
  // ✅ Utility Functions
  private getBaseUrl(): string
  private buildRequest(url: string): RequestConfig
  private md5(input: string): string
}
```

---

### 2. **BackendClient.ts** - iptv-sync-backend API
Based on Android TV `IPTVSyncService.kt`

```typescript
class BackendClient {
  private baseUrl: string = 'http://192.168.2.69:3001/api';
  private authToken: string | null = null;
  
  // ✅ Authentication
  register(email: string, password: string, deviceName: string, deviceType: string): Promise<AuthResponse>
  login(email: string, password: string): Promise<AuthResponse>
  refreshToken(refreshToken: string): Promise<AuthResponse>
  logout(): Promise<void>
  
  // ✅ Provider Sync
  syncProvider(provider: Provider): Promise<void>
  getProviders(): Promise<Provider[]>
  
  // ✅ Category Sync
  syncCategories(categories: Category[], type: 'LIVE' | 'MOVIE' | 'SERIES'): Promise<void>
  getCategories(type: 'LIVE' | 'MOVIE' | 'SERIES'): Promise<Category[]>
  
  // ✅ Channel Sync
  syncChannels(channels: Channel[], categoryId: string): Promise<void>
  getChannels(categoryId: string): Promise<Channel[]>
  
  // ✅ Watch Progress
  getWatchProgress(contentId: string): Promise<WatchProgress | null>
  updateWatchProgress(contentId: string, position: number, duration: number, contentType: string): Promise<void>
  getAllWatchProgress(): Promise<WatchProgress[]>
  
  // ✅ Favorites
  addFavorite(contentId: string, contentType: string, title: string, imageUrl?: string): Promise<void>
  removeFavorite(contentId: string): Promise<void>
  getFavorites(): Promise<Favorite[]>
  
  // ✅ Devices
  getDevices(): Promise<Device[]>
  removeDevice(deviceId: string): Promise<void>
  
  // ✅ Streaming Session
  startStream(contentId: string, contentType: string): Promise<SessionResponse>
  sendHeartbeat(sessionId: string): Promise<void>
  endStream(sessionId: string): Promise<void>
  
  // ✅ Settings
  syncSettings(settings: UserSettings): Promise<void>
  getSettings(): Promise<UserSettings>
  
  // ✅ Pull All Data (Cloud Sync)
  pullAllData(): Promise<SyncData>
}
```

---

### 3. **StorageService.ts** - Local Caching
Based on Android TV Room Database

```typescript
class StorageService {
  // ✅ Provider Storage
  saveProvider(provider: Provider): Promise<void>
  getProvider(): Promise<Provider | null>
  clearProvider(): Promise<void>
  
  // ✅ Categories Storage
  saveCategories(categories: Category[], type: 'LIVE' | 'MOVIE' | 'SERIES'): Promise<void>
  getCategories(type: 'LIVE' | 'MOVIE' | 'SERIES'): Promise<Category[]>
  
  // ✅ Channels Storage
  saveChannels(channels: Channel[], categoryId: string): Promise<void>
  getChannels(categoryId: string): Promise<Channel[]>
  clearChannelsCache(): Promise<void>
  
  // ✅ Movies Storage
  saveMovies(movies: Movie[], categoryId: string): Promise<void>
  getMovies(categoryId: string): Promise<Movie[]>
  clearMoviesCache(): Promise<void>
  
  // ✅ Series Storage
  saveSeries(series: Series[], categoryId: string): Promise<void>
  getSeries(categoryId: string): Promise<Series[]>
  clearSeriesCache(): Promise<void>
  
  // ✅ Watch Progress Storage
  saveWatchProgress(progress: WatchProgress): Promise<void>
  getWatchProgress(contentId: string): Promise<WatchProgress | null>
  getAllWatchProgress(): Promise<WatchProgress[]>
  
  // ✅ Favorites Storage
  saveFavorite(favorite: Favorite): Promise<void>
  removeFavorite(contentId: string): Promise<void>
  getFavorites(): Promise<Favorite[]>
  
  // ✅ Search History
  saveSearchQuery(query: string): Promise<void>
  getSearchHistory(): Promise<string[]>
  clearSearchHistory(): Promise<void>
  
  // ✅ Settings Storage
  saveSettings(settings: UserSettings): Promise<void>
  getSettings(): Promise<UserSettings>
  
  // ✅ Auth Token Storage
  saveAuthToken(token: string, refreshToken: string): Promise<void>
  getAuthToken(): Promise<{ token: string; refreshToken: string } | null>
  clearAuthToken(): Promise<void>
  
  // ✅ Utility Functions
  clearAllCache(): Promise<void>
  getCacheSize(): Promise<number>
}
```

---

## 🎣 React Hooks (Data Fetching)

### 4. **useCategories.ts**
```typescript
export function useCategories(type: 'LIVE' | 'MOVIE' | 'SERIES') {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const fetchCategories = async () => { /* ... */ };
  const refreshCategories = async () => { /* ... */ };
  
  return { categories, loading, error, refreshCategories };
}
```

### 5. **useChannels.ts**
```typescript
export function useChannels(categoryId: string) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  
  const fetchChannels = async () => { /* ... */ };
  const loadMore = async () => { /* ... */ };
  const refresh = async () => { /* ... */ };
  
  return { channels, loading, hasMore, loadMore, refresh };
}
```

### 6. **useMovies.ts**
```typescript
export function useMovies(categoryId: string) {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  
  const fetchMovies = async () => { /* ... */ };
  const loadMore = async () => { /* ... */ };
  const refresh = async () => { /* ... */ };
  
  return { movies, loading, hasMore, loadMore, refresh };
}
```

### 7. **useSeries.ts**
```typescript
export function useSeries(categoryId: string) {
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  
  const fetchSeries = async () => { /* ... */ };
  const loadMore = async () => { /* ... */ };
  const refresh = async () => { /* ... */ };
  
  return { series, loading, hasMore, loadMore, refresh };
}
```

### 8. **useSeriesDetail.ts**
```typescript
export function useSeriesDetail(seriesId: string) {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [episodes, setEpisodes] = useState<Record<string, Episode[]>>({});
  const [loading, setLoading] = useState(false);
  
  const fetchSeasons = async () => { /* ... */ };
  const fetchEpisodes = async (seasonId: string) => { /* ... */ };
  
  return { seasons, episodes, loading, fetchSeasons, fetchEpisodes };
}
```

### 9. **useSearch.ts**
```typescript
export function useSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>({
    channels: [],
    movies: [],
    series: [],
  });
  const [loading, setLoading] = useState(false);
  
  const search = async (searchQuery: string) => { /* ... */ };
  const clearSearch = () => { /* ... */ };
  
  return { query, results, loading, search, clearSearch };
}
```

### 10. **useWatchProgress.ts**
```typescript
export function useWatchProgress(contentId: string) {
  const [progress, setProgress] = useState<WatchProgress | null>(null);
  const [loading, setLoading] = useState(false);
  
  const fetchProgress = async () => { /* ... */ };
  const updateProgress = async (position: number, duration: number) => { /* ... */ };
  const clearProgress = async () => { /* ... */ };
  
  return { progress, loading, updateProgress, clearProgress };
}
```

### 11. **useFavorites.ts**
```typescript
export function useFavorites() {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(false);
  
  const fetchFavorites = async () => { /* ... */ };
  const addFavorite = async (contentId: string, contentType: string, title: string) => { /* ... */ };
  const removeFavorite = async (contentId: string) => { /* ... */ };
  const isFavorite = (contentId: string) => { /* ... */ };
  
  return { favorites, loading, addFavorite, removeFavorite, isFavorite };
}
```

### 12. **useEPG.ts**
```typescript
export function useEPG(channelId: string) {
  const [programs, setPrograms] = useState<EPGProgram[]>([]);
  const [currentProgram, setCurrentProgram] = useState<EPGProgram | null>(null);
  const [loading, setLoading] = useState(false);
  
  const fetchEPG = async () => { /* ... */ };
  const getCurrentProgram = () => { /* ... */ };
  
  return { programs, currentProgram, loading, fetchEPG };
}
```

### 13. **useVideoPlayer.ts**
```typescript
export function useVideoPlayer(contentId: string, contentType: string) {
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState(0);
  
  const loadStream = async (cmd: string) => { /* ... */ };
  const saveProgress = async (currentPosition: number, duration: number) => { /* ... */ };
  const resumeFromProgress = async () => { /* ... */ };
  
  return { streamUrl, loading, error, position, loadStream, saveProgress, resumeFromProgress };
}
```

---

## 🏪 State Management (Zustand Stores)

### 14. **useProviderStore.ts**
```typescript
interface ProviderStore {
  provider: Provider | null;
  loading: boolean;
  error: string | null;
  
  setProvider: (provider: Provider) => void;
  loadProvider: () => Promise<void>;
  clearProvider: () => Promise<void>;
}

export const useProviderStore = create<ProviderStore>((set) => ({ /* ... */ }));
```

### 15. **useAuthStore.ts**
```typescript
interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  token: string | null;
  
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, deviceName: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({ /* ... */ }));
```

### 16. **usePlayerStore.ts**
```typescript
interface PlayerStore {
  isPlaying: boolean;
  currentContent: { id: string; type: string; title: string } | null;
  position: number;
  duration: number;
  
  play: (content: any) => void;
  pause: () => void;
  seek: (position: number) => void;
  setPosition: (position: number) => void;
  setDuration: (duration: number) => void;
  reset: () => void;
}

export const usePlayerStore = create<PlayerStore>((set) => ({ /* ... */ }));
```

---

## 🧩 React Components

### 17. **CategoryRow.tsx**
```typescript
interface CategoryRowProps {
  title: string;
  items: Movie[] | Series[];
  onItemPress: (item: any) => void;
  onViewAll?: () => void;
}

export const CategoryRow: React.FC<CategoryRowProps> = ({ ... }) => { /* ... */ }
```

### 18. **MovieCard.tsx**
```typescript
interface MovieCardProps {
  movie: Movie;
  onPress: () => void;
  width?: number;
  height?: number;
}

export const MovieCard: React.FC<MovieCardProps> = ({ ... }) => { /* ... */ }
```

### 19. **ChannelCard.tsx**
```typescript
interface ChannelCardProps {
  channel: Channel;
  onPress: () => void;
  showEPG?: boolean;
}

export const ChannelCard: React.FC<ChannelCardProps> = ({ ... }) => { /* ... */ }
```

### 20. **SeriesCard.tsx**
```typescript
interface SeriesCardProps {
  series: Series;
  onPress: () => void;
  width?: number;
  height?: number;
}

export const SeriesCard: React.FC<SeriesCardProps> = ({ ... }) => { /* ... */ }
```

### 21. **EPGTimeline.tsx**
```typescript
interface EPGTimelineProps {
  programs: EPGProgram[];
  currentProgram?: EPGProgram;
  onProgramPress?: (program: EPGProgram) => void;
}

export const EPGTimeline: React.FC<EPGTimelineProps> = ({ ... }) => { /* ... */ }
```

### 22. **VideoPlayer.tsx**
```typescript
interface VideoPlayerProps {
  uri: string;
  initialPosition?: number;
  onProgress?: (position: number, duration: number) => void;
  onEnd?: () => void;
  onError?: (error: any) => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ ... }) => { /* ... */ }
```

### 23. **SearchBar.tsx**
```typescript
interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({ ... }) => { /* ... */ }
```

### 24. **CategorySelector.tsx**
```typescript
interface CategorySelectorProps {
  categories: Category[];
  selectedCategory: string | null;
  onSelectCategory: (categoryId: string) => void;
}

export const CategorySelector: React.FC<CategorySelectorProps> = ({ ... }) => { /* ... */ }
```

### 25. **ContinueWatchingRow.tsx**
```typescript
interface ContinueWatchingRowProps {
  items: WatchProgress[];
  onItemPress: (item: WatchProgress) => void;
}

export const ContinueWatchingRow: React.FC<ContinueWatchingRowProps> = ({ ... }) => { /* ... */ }
```

### 26. **EpisodeList.tsx**
```typescript
interface EpisodeListProps {
  episodes: Episode[];
  onEpisodePress: (episode: Episode) => void;
  watchedEpisodes?: string[];
}

export const EpisodeList: React.FC<EpisodeListProps> = ({ ... }) => { /* ... */ }
```

### 27. **SeasonSelector.tsx**
```typescript
interface SeasonSelectorProps {
  seasons: Season[];
  selectedSeason: string | null;
  onSelectSeason: (seasonId: string) => void;
}

export const SeasonSelector: React.FC<SeasonSelectorProps> = ({ ... }) => { /* ... */ }
```

---

## 📱 Screen Components

### 28. **LiveTVScreen.tsx**
```typescript
export default function LiveTVScreen() {
  const categories = useCategories('LIVE');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const channels = useChannels(selectedCategory || '');
  
  // Render category selector + channel grid + EPG
  return ( /* ... */ );
}
```

### 29. **MoviesScreen.tsx**
```typescript
export default function MoviesScreen() {
  const categories = useCategories('MOVIE');
  const [moviesByCategory, setMoviesByCategory] = useState<Record<string, Movie[]>>({});
  
  // Render Netflix-style category rows
  return ( /* ... */ );
}
```

### 30. **SeriesScreen.tsx**
```typescript
export default function SeriesScreen() {
  const categories = useCategories('SERIES');
  const [seriesByCategory, setSeriesByCategory] = useState<Record<string, Series[]>>({});
  
  // Render Netflix-style category rows for series
  return ( /* ... */ );
}
```

### 31. **SearchScreen.tsx**
```typescript
export default function SearchScreen() {
  const { query, results, loading, search } = useSearch();
  
  // Render search bar + mixed results (channels, movies, series)
  return ( /* ... */ );
}
```

### 32. **MovieDetailScreen.tsx**
```typescript
export default function MovieDetailScreen({ route }: any) {
  const { movieId } = route.params;
  const [movie, setMovie] = useState<MovieDetails | null>(null);
  const { isFavorite, addFavorite, removeFavorite } = useFavorites();
  
  // Render movie detail with poster, metadata, play button
  return ( /* ... */ );
}
```

### 33. **SeriesDetailScreen.tsx**
```typescript
export default function SeriesDetailScreen({ route }: any) {
  const { seriesId } = route.params;
  const { seasons, episodes, fetchSeasons, fetchEpisodes } = useSeriesDetail(seriesId);
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);
  
  // Render series detail with seasons selector + episodes
  return ( /* ... */ );
}
```

### 34. **PlayerScreen.tsx**
```typescript
export default function PlayerScreen({ route }: any) {
  const { contentId, contentType, cmd } = route.params;
  const { streamUrl, position, loadStream, saveProgress } = useVideoPlayer(contentId, contentType);
  
  // Render fullscreen video player
  return ( /* ... */ );
}
```

### 35. **ProviderSetupScreen.tsx**
```typescript
export default function ProviderSetupScreen() {
  const { setProvider } = useProviderStore();
  const [portalUrl, setPortalUrl] = useState('');
  const [macAddress, setMacAddress] = useState('');
  
  // Render provider setup form
  return ( /* ... */ );
}
```

### 36. **SettingsScreen.tsx**
```typescript
export default function SettingsScreen() {
  const { user, logout } = useAuthStore();
  const { provider, clearProvider } = useProviderStore();
  
  // Render settings (account, provider, player settings)
  return ( /* ... */ );
}
```

### 37. **FavoritesScreen.tsx**
```typescript
export default function FavoritesScreen() {
  const { favorites, loading, removeFavorite } = useFavorites();
  
  // Render favorites list
  return ( /* ... */ );
}
```

---

## 🛠️ Utility Functions

### 38. **utils/api.ts**
```typescript
export function buildStalkerUrl(baseUrl: string, params: Record<string, any>): string { /* ... */ }
export function handleApiError(error: any): string { /* ... */ }
export function parseM3U8Url(url: string): string { /* ... */ }
export function formatDuration(seconds: number): string { /* ... */ }
export function debounce<T extends (...args: any[]) => any>(func: T, delay: number): (...args: Parameters<T>) => void { /* ... */ }
```

### 39. **utils/storage.ts**
```typescript
export async function setItem(key: string, value: any): Promise<void> { /* ... */ }
export async function getItem<T>(key: string): Promise<T | null> { /* ... */ }
export async function removeItem(key: string): Promise<void> { /* ... */ }
export async function clear(): Promise<void> { /* ... */ }
```

### 40. **utils/formatters.ts**
```typescript
export function formatTime(seconds: number): string { /* ... */ } // "1:23:45"
export function formatDate(timestamp: number): string { /* ... */ } // "Jan 15, 2024"
export function formatFileSize(bytes: number): string { /* ... */ } // "1.2 GB"
export function truncateText(text: string, maxLength: number): string { /* ... */ }
```

### 41. **utils/validators.ts**
```typescript
export function isValidUrl(url: string): boolean { /* ... */ }
export function isValidMacAddress(mac: string): boolean { /* ... */ }
export function isValidEmail(email: string): boolean { /* ... */ }
```

---

## 📊 Total Functions Summary

- **API Services**: 40+ functions
- **React Hooks**: 13 custom hooks
- **State Stores**: 3 Zustand stores
- **Components**: 27 reusable components
- **Screens**: 10 screen components
- **Utilities**: 15+ helper functions

**Grand Total**: ~110 functions/components

---

## 🚀 Implementation Order

1. ✅ Setup project structure
2. ✅ Create dummy data files
3. ✅ Build all UI screens with dummy data
4. ✅ Test on iOS device (UI/UX)
5. ✅ Implement API services (StalkerClient, BackendClient)
6. ✅ Create React hooks for data fetching
7. ✅ Replace dummy data with real API calls
8. ✅ Implement video player
9. ✅ Add watch progress tracking
10. ✅ Add favorites feature
11. ✅ Performance optimization
12. ✅ Production build

---

Ready to start implementing! 🎉
