// API Configuration
export const API_CONFIG = {
  baseURL: 'http://10.0.2.2:3000',
  timeout: 30000,
};

// TMDB Configuration (if needed)
export const TMDB_CONFIG = {
  apiKey: process.env.TMDB_API_KEY || '',
  imageBaseUrl: 'https://image.tmdb.org/t/p/',
};

// App Configuration
export const APP_CONFIG = {
  // Cache settings
  cacheExpiry: 5 * 60 * 1000, // 5 minutes
  
  // Pagination
  itemsPerPage: 20,
  
  // Video player
  defaultVideoQuality: 'auto',
  
  // UI
  focusScale: 1.1,
  animationDuration: 200,
  
  // Content rows
  contentRowHeight: 280,
  contentCardWidth: 180,
  contentCardSpacing: 20,
};

// Navigation
export const ROUTES = {
  HOME: 'Home',
  MOVIES: 'Movies',
  SERIES: 'Series',
  LIVE_TV: 'LiveTV',
  SEARCH: 'Search',
  SETTINGS: 'Settings',
  PLAYER: 'Player',
  MOVIE_DETAIL: 'MovieDetail',
  SERIES_DETAIL: 'SeriesDetail',
  CATEGORY: 'Category',
};
