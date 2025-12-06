import { Category } from '../types';

export const DUMMY_LIVE_CATEGORIES: Category[] = [
  { id: '1', name: 'All Channels', type: 'LIVE', censored: false, isEnabled: true },
  { id: '2', name: 'Sports', type: 'LIVE', censored: false, isEnabled: true },
  { id: '3', name: 'News', type: 'LIVE', censored: false, isEnabled: true },
  { id: '4', name: 'Entertainment', type: 'LIVE', censored: false, isEnabled: true },
  { id: '5', name: 'Movies', type: 'LIVE', censored: false, isEnabled: true },
  { id: '6', name: 'Kids', type: 'LIVE', censored: false, isEnabled: true },
  { id: '7', name: 'Music', type: 'LIVE', censored: false, isEnabled: true },
  { id: '8', name: 'Documentary', type: 'LIVE', censored: false, isEnabled: true },
];

export const DUMMY_MOVIE_CATEGORIES: Category[] = [
  { id: '10', name: 'Action', type: 'MOVIE', censored: false, isEnabled: true },
  { id: '11', name: 'Comedy', type: 'MOVIE', censored: false, isEnabled: true },
  { id: '12', name: 'Drama', type: 'MOVIE', censored: false, isEnabled: true },
  { id: '13', name: 'Horror', type: 'MOVIE', censored: false, isEnabled: true },
  { id: '14', name: 'Sci-Fi', type: 'MOVIE', censored: false, isEnabled: true },
  { id: '15', name: 'Thriller', type: 'MOVIE', censored: false, isEnabled: true },
  { id: '16', name: 'Romance', type: 'MOVIE', censored: false, isEnabled: true },
  { id: '17', name: 'Documentary', type: 'MOVIE', censored: false, isEnabled: true },
];

export const DUMMY_SERIES_CATEGORIES: Category[] = [
  { id: '20', name: 'Popular TV Shows', type: 'SERIES', censored: false, isEnabled: true },
  { id: '21', name: 'Crime', type: 'SERIES', censored: false, isEnabled: true },
  { id: '22', name: 'Comedy Series', type: 'SERIES', censored: false, isEnabled: true },
  { id: '23', name: 'Drama Series', type: 'SERIES', censored: false, isEnabled: true },
  { id: '24', name: 'Sci-Fi & Fantasy', type: 'SERIES', censored: false, isEnabled: true },
  { id: '25', name: 'Reality TV', type: 'SERIES', censored: false, isEnabled: true },
];
