import { WatchProgress, Favorite } from '../types';

export const DUMMY_WATCH_PROGRESS: WatchProgress[] = [
  {
    id: 'wp_1',
    contentId: 'movie_10_1',
    contentType: 'movie',
    title: 'The Dark Knight',
    imageUrl: 'https://via.placeholder.com/300x450?text=The+Dark+Knight',
    position: 3600, // 1 hour in
    duration: 9120, // 2h 32min total
    progress: 39.5,
    lastWatchedAt: Date.now() - 1000 * 60 * 60 * 2, // 2 hours ago
  },
  {
    id: 'wp_2',
    contentId: 'episode_season_series_20_1_3_1',
    contentType: 'episode',
    title: 'Breaking Bad - S1E1',
    imageUrl: 'https://via.placeholder.com/300x450?text=Breaking+Bad',
    position: 1800, // 30 minutes in
    duration: 2700, // 45 min total
    progress: 66.7,
    lastWatchedAt: Date.now() - 1000 * 60 * 60 * 24, // 1 day ago
    seriesId: 'series_20_1',
    seasonId: 'season_series_20_1_1',
    episodeNumber: '1',
  },
  {
    id: 'wp_3',
    contentId: 'movie_14_3',
    contentType: 'movie',
    title: 'Inception',
    imageUrl: 'https://via.placeholder.com/300x450?text=Inception',
    position: 4200,
    duration: 8880,
    progress: 47.3,
    lastWatchedAt: Date.now() - 1000 * 60 * 60 * 48, // 2 days ago
  },
];

export const DUMMY_FAVORITES: Favorite[] = [
  {
    id: 'fav_1',
    contentId: 'movie_10_1',
    contentType: 'movie',
    title: 'The Dark Knight',
    imageUrl: 'https://via.placeholder.com/300x450?text=The+Dark+Knight',
    addedAt: Date.now() - 1000 * 60 * 60 * 24 * 7, // 1 week ago
  },
  {
    id: 'fav_2',
    contentId: 'series_20_1',
    contentType: 'series',
    title: 'Breaking Bad',
    imageUrl: 'https://via.placeholder.com/300x450?text=Breaking+Bad',
    addedAt: Date.now() - 1000 * 60 * 60 * 24 * 30, // 1 month ago
  },
  {
    id: 'fav_3',
    contentId: 'ch_2_5',
    contentType: 'channel',
    title: 'Sports Channel 5',
    imageUrl: 'https://via.placeholder.com/150?text=CH5',
    addedAt: Date.now() - 1000 * 60 * 60 * 24 * 14, // 2 weeks ago
  },
];
