export interface Movie {
  id: string;
  name: string;
  oName?: string; // Original name
  description?: string;
  pic?: string; // Poster URL
  screensaverPic?: string;
  added?: string; // Date added
  year?: string;
  country?: string;
  director?: string;
  actors?: string;
  genres?: string;
  rating?: string;
  ratingMpaa?: string;
  duration?: string; // In minutes
  cmd: string;
  series?: string; // Empty for movies, "series" for TV shows
  categoryId?: string;
  isFavorite?: boolean;
}

export interface MovieDetails extends Movie {
  videoInfo?: {
    width: number;
    height: number;
    aspectRatio: string;
    fps: number;
    bitrate: number;
  };
  audioInfo?: {
    codec: string;
    channels: string;
    language: string;
  };
}

export interface MoviesResponse {
  movies: Movie[];
  total: number;
  hasMore: boolean;
}
