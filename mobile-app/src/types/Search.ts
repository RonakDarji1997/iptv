import { Channel } from './Channel';
import { Movie } from './Movie';
import { Series } from './Series';

export interface SearchResults {
  channels: Channel[];
  movies: Movie[];
  series: Series[];
  total: number;
}

export interface SearchQuery {
  query: string;
  type?: 'all' | 'channels' | 'movies' | 'series';
  page?: number;
}
