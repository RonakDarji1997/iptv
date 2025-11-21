import axios from 'axios';

// Backend API base URL
const getApiBaseUrl = () => {
  if (process.env.API_URL) {
    return process.env.API_URL;
  }
  // Use 10.0.2.2 for Android emulator to access host machine
  return 'http://10.0.2.2:2005';
};

const API_BASE_URL = getApiBaseUrl();

export interface ApiCredentials {
  mac: string;
  url: string;
}

export class ApiClient {
  private credentials: ApiCredentials;

  constructor(credentials: ApiCredentials) {
    this.credentials = credentials;
  }

  private async post<T>(endpoint: string, data: Record<string, any> = {}): Promise<T> {
    try {
      const response = await axios.post(
        `${API_BASE_URL}${endpoint}`,
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

  async getShortEpg(channelId: string): Promise<{ epg: any }> {
    return this.post('/api/stalker/epg', { channelId });
  }
}

// Helper function for password verification (no credentials needed)
export async function verifyPassword(password: string): Promise<boolean> {
  try {
    const response = await axios.post(
      `${API_BASE_URL}/api/auth/verify`,
      { password },
      { timeout: 5000 }
    );
    return response.data.valid;
  } catch (error) {
    console.error('[ApiClient] Password verification error:', error);
    return false;
  }
}

// Export types
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
