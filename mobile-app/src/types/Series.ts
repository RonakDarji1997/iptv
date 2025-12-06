export interface Series {
  id: string;
  name: string;
  oName?: string;
  description?: string;
  pic?: string;
  screensaverPic?: string;
  added?: string;
  year?: string;
  country?: string;
  director?: string;
  actors?: string;
  genres?: string;
  rating?: string;
  ratingMpaa?: string;
  lastSeason?: string;
  cmd: string;
  series: string; // "series" identifier
  categoryId?: string;
  isFavorite?: boolean;
}

export interface Season {
  id: string;
  seriesId: string;
  name: string;
  seasonNumber: string;
  episodeCount?: number;
}

export interface Episode {
  id: string;
  seriesId: string;
  seasonId: string;
  name: string;
  episodeNumber: string;
  duration?: string;
  cmd: string;
  added?: string;
  description?: string;
  watched?: boolean;
  watchProgress?: number;
}

export interface SeriesResponse {
  series: Series[];
  total: number;
  hasMore: boolean;
}

export interface SeasonsResponse {
  seasons: Season[];
  total: number;
}

export interface EpisodesResponse {
  episodes: Episode[];
  total: number;
  hasMore: boolean;
}

export interface SeriesDetails extends Series {
  seasons?: Season[];
  totalSeasons?: number;
}
