export interface WatchProgress {
  id: string;
  contentId: string;
  contentType: 'channel' | 'movie' | 'episode';
  title: string;
  imageUrl?: string;
  position: number; // Current position in seconds
  duration: number; // Total duration in seconds
  progress: number; // Percentage (0-100)
  lastWatchedAt: number; // Timestamp
  seriesId?: string; // For episodes
  seasonId?: string; // For episodes
  episodeNumber?: string; // For episodes
}

export interface Favorite {
  id: string;
  contentId: string;
  contentType: 'channel' | 'movie' | 'series';
  title: string;
  imageUrl?: string;
  addedAt: number;
}
