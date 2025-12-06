import { Dimensions, Platform } from 'react-native';

// Device dimensions
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Determine device type
export const IS_TABLET = SCREEN_WIDTH >= 768;
export const IS_SMALL_PHONE = SCREEN_WIDTH < 375; // iPhone SE, small Android
export const IS_IOS = Platform.OS === 'ios';
export const IS_ANDROID = Platform.OS === 'android';

// Responsive dimensions
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

// Typography sizes (responsive based on device size)
export const FONT_SIZES = {
  xs: IS_TABLET ? 12 : IS_SMALL_PHONE ? 9 : 10,
  sm: IS_TABLET ? 14 : IS_SMALL_PHONE ? 11 : 12,
  md: IS_TABLET ? 16 : IS_SMALL_PHONE ? 13 : 14,
  lg: IS_TABLET ? 20 : IS_SMALL_PHONE ? 16 : 18,
  xl: IS_TABLET ? 28 : IS_SMALL_PHONE ? 22 : 24,
  xxl: IS_TABLET ? 36 : IS_SMALL_PHONE ? 28 : 32,
};

// Calculate responsive card width based on screen width
const calculateCardWidth = (columns: number) => {
  const totalSpacing = SPACING.md * (columns + 1);
  return Math.floor((SCREEN_WIDTH - totalSpacing) / columns);
};

// Card dimensions (fully responsive)
export const CARD_DIMENSIONS = {
  // Movie/Series cards - maintain 2:3 aspect ratio
  movie: {
    width: IS_TABLET ? 180 : calculateCardWidth(3),
    height: IS_TABLET ? 270 : Math.floor(calculateCardWidth(3) * 1.5),
  },
  // Channel cards - maintain 4:3 aspect ratio
  channel: {
    width: IS_TABLET ? 160 : calculateCardWidth(3),
    height: IS_TABLET ? 120 : Math.floor(calculateCardWidth(3) * 0.75),
  },
  // Continue watching cards - maintain 16:9 aspect ratio
  continueWatching: {
    width: IS_TABLET ? 320 : SCREEN_WIDTH - (SPACING.md * 2),
    height: IS_TABLET ? 180 : Math.floor((SCREEN_WIDTH - (SPACING.md * 2)) * 0.5625),
  },
};

// Grid columns (responsive)
export const GRID_COLUMNS = {
  channels: IS_TABLET ? 5 : IS_SMALL_PHONE ? 2 : 3,
  movies: IS_TABLET ? 5 : IS_SMALL_PHONE ? 2 : 3,
  series: IS_TABLET ? 5 : IS_SMALL_PHONE ? 2 : 3,
  search: IS_TABLET ? 6 : IS_SMALL_PHONE ? 2 : 3,
};

// Colors (Netflix-inspired dark theme)
export const COLORS = {
  background: '#141414',
  backgroundLight: '#1F1F1F',
  primary: '#E50914', // Netflix red
  primaryDark: '#B20710',
  text: '#FFFFFF',
  textSecondary: '#B3B3B3',
  textMuted: '#808080',
  border: '#333333',
  success: '#46D369',
  warning: '#F5A623',
  error: '#E50914',
  overlay: 'rgba(0, 0, 0, 0.75)',
  cardBackground: '#2F2F2F',
};

// API Configuration
export const API_CONFIG = {
  BACKEND_URL: 'http://api.iptv.ronika.co/api', // Sync backend URL (NAS server)
  SUBTITLE_SERVICE_URL: 'http://api.iptv.ronika.co/subtitle', // Subtitle/Whisper service (proxied through nginx)
  TIMEOUT: 30000,
  MAX_RETRIES: 3,
};

// Storage Keys
export const STORAGE_KEYS = {
  PROVIDER: '@iptv_provider',
  AUTH_TOKEN: '@iptv_auth_token',
  REFRESH_TOKEN: '@iptv_refresh_token',
  USER: '@iptv_user',
  CATEGORIES_LIVE: '@iptv_categories_live',
  CATEGORIES_MOVIE: '@iptv_categories_movie',
  CATEGORIES_SERIES: '@iptv_categories_series',
  WATCH_PROGRESS: '@iptv_watch_progress',
  FAVORITES: '@iptv_favorites',
  SETTINGS: '@iptv_settings',
  SEARCH_HISTORY: '@iptv_search_history',
};

// Pagination
export const PAGINATION = {
  PAGE_SIZE: 20,
  INITIAL_PAGE: 1,
};

// Video Player
export const PLAYER_CONFIG = {
  PROGRESS_UPDATE_INTERVAL: 5000, // Update progress every 5 seconds
  SEEK_INTERVAL: 10, // Seek by 10 seconds
  CONTROLS_TIMEOUT: 5000, // Hide controls after 5 seconds
};

// Tab Navigator Icons
export const TAB_ICONS = {
  live: 'tv',
  movies: 'film',
  series: 'video',
  search: 'search',
};

// Content Types
export const CONTENT_TYPES = {
  CHANNEL: 'channel',
  MOVIE: 'movie',
  SERIES: 'series',
  EPISODE: 'episode',
} as const;

// App Info
export const APP_INFO = {
  NAME: 'IPTV Mobile',
  VERSION: '1.0.0',
  SUPPORT_EMAIL: 'support@iptv.com',
};

export { SCREEN_WIDTH, SCREEN_HEIGHT };
