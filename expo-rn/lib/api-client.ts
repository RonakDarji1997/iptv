import axios from 'axios';
import { Platform } from 'react-native';

// Backend API base URL - configurable via environment variable
const getApiBaseUrl = () => {
  // Use environment variable if provided (check at runtime)
  if (process.env.EXPO_PUBLIC_API_URL) {
    console.log('🔧 Using EXPO_PUBLIC_API_URL:', process.env.EXPO_PUBLIC_API_URL);
    return process.env.EXPO_PUBLIC_API_URL;
  }
  
  // Default to localhost:2005 for development
  if (Platform.OS === 'web') {
    // For web, use relative URLs or same host on port 2005
    const isLocalhost = typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    
    if (isLocalhost) {
      console.log('🔧 Using localhost:2005');
      return 'http://localhost:2005';
    }
    
    // Production web - same domain but port 2005
    if (typeof window !== 'undefined') {
      const protocol = window.location.protocol;
      const hostname = window.location.hostname;
      const url = `${protocol}//${hostname}:2005`;
      console.log('🔧 Constructed API URL from window:', url);
      return url;
    }
    return 'http://localhost:2005';
  }
  
  // For native apps, point to local development server
  return 'http://localhost:2005';
};

export interface ApiCredentials {
  mac: string;
  url: string;
}

export class ApiClient {
  private credentials: ApiCredentials;

  constructor(credentials: ApiCredentials) {
    this.credentials = credentials;
  }

  private async post<T>(endpoint: string, data: any = {}): Promise<T> {
    try {
      const apiUrl = getApiBaseUrl();
      const response = await axios.post(
        `${apiUrl}${endpoint}`,
        { ...this.credentials, ...data },
        { timeout: 15000 }
      );
      return response.data;
    } catch (error) {
      console.error(`[ApiClient] Error calling ${endpoint}:`, error);
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.error || error.message);
      }
      throw error;
    }
  }

  // Authentication
  async verifyPassword(password: string): Promise<{ valid: boolean }> {
    return this.post('/api/auth/verify', { password });
  }

  // Stalker API methods
  async handshake(): Promise<any> {
    return this.post('/api/stalker/handshake');
  }

  async getGenres(): Promise<{ genres: any[] }> {
    return this.post('/api/stalker/genres');
  }

  async getMovieCategories(): Promise<{ categories: any[] }> {
    return this.post('/api/stalker/categories/movies');
  }

  async getSeriesCategories(): Promise<{ categories: any[] }> {
    return this.post('/api/stalker/categories/series');
  }

  async getChannels(genre: string, page: number = 1, sortBy: string = 'number'): Promise<{ channels: { data: any[], total: number } }> {
    return this.post('/api/stalker/channels', { genre, page, sortBy });
  }

  async getMovies(category: string, page: number = 1, sortBy: string = 'added'): Promise<{ items: { data: any[], total: number } }> {
    return this.post('/api/stalker/vod', { category, page, sortBy, type: 'vod' });
  }

  async getSeries(category: string, page: number = 1, sortBy: string = 'added'): Promise<{ items: { data: any[], total: number } }> {
    return this.post('/api/stalker/vod', { category, page, sortBy, type: 'vod' });
  }

  async searchContent(query: string, page: number = 1): Promise<{ data: any[], total: number }> {
    return this.post('/api/stalker/search', { query, page });
  }

  async getSeriesSeasons(seriesId: string): Promise<{ seasons: any[] }> {
    return this.post('/api/stalker/series/seasons', { seriesId });
  }

  async getSeriesEpisodes(seriesId: string, seasonId: string, page: number = 1): Promise<{ data: any[], total: number }> {
    return this.post('/api/stalker/series/episodes', { seriesId, seasonId, page });
  }

  async getSeriesFileInfo(seriesId: string, seasonId: string, episodeId: string): Promise<any> {
    const result = await this.post<{ fileInfo: any }>('/api/stalker/series/fileinfo', { seriesId, seasonId, episodeId });
    return result.fileInfo;
  }

  async getMovieInfo(movieId: string): Promise<any> {
    const result = await this.post<{ fileInfo: any }>('/api/stalker/movie/info', { movieId });
    return result.fileInfo;
  }

  async getStreamUrl(cmd: string, type: string = 'itv', episodeNumber?: string): Promise<{ url: string }> {
    return this.post('/api/stalker/stream', { cmd, type, episodeNumber });
  }

  async createLink(cmd: string, type: string = 'itv'): Promise<{ link: any }> {
    return this.post('/api/stalker/link', { cmd, type });
  }

  async getEpg(channelId: string): Promise<{ epg: any }> {
    return this.post('/api/stalker/epg', { channelId });
  }
}

// Helper function for password verification (no credentials needed)
export async function verifyPassword(password: string): Promise<boolean> {
  try {
    // Get the URL dynamically each time
    const apiUrl = getApiBaseUrl();
    console.log('🔐 Verifying password with API URL:', apiUrl);
    const response = await axios.post(
      `${apiUrl}/api/auth/verify`,
      { password },
      { timeout: 5000 }
    );
    return response.data.valid;
  } catch (error) {
    console.error('[ApiClient] Password verification error:', error);
    return false;
  }
}

// Export types that might be needed
export interface EpgProgram {
  id: string;
  ch_id: string;
  time: string;
  time_to: string;
  duration: string;
  name: string;
  descr: string;
  real_id: string;
  category?: string;
}

export interface ShortEpg {
  current_program: EpgProgram | null;
  next_program: EpgProgram | null;
}
