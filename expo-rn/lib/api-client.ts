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

// =========================
// Backend Auth API
// =========================

export interface LoginResponse {
  success: boolean;
  user: {
    id: string;
    username: string;
    email: string;
    role: 'ADMIN' | 'USER';
  };
  token: string;
}

export interface RegisterResponse {
  success: boolean;
  user: {
    id: string;
    username: string;
    email: string;
    role: 'ADMIN' | 'USER';
  };
  token: string;
}

export interface Profile {
  id: string;
  name: string;
  avatar?: string;
  type: 'ADMIN' | 'KID' | 'GUEST';
  ageRating?: number;
  userId: string;
  providerId: string;
  isActive?: boolean;
  allowedCategories?: string[];
  blockedCategories?: string[];
  allowedChannels?: string[];
  blockedChannels?: string[];
}

export interface SnapshotData {
  categories: any[];
  channels: any[];
  movies: any[];
  series: any[];
}

export async function loginUser(username: string, password: string): Promise<LoginResponse> {
  try {
    const apiUrl = getApiBaseUrl();
    console.log('🔐 Logging in user:', username);
    const response = await axios.post(
      `${apiUrl}/api/auth/login`,
      { username, password },
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    console.error('[ApiClient] Login error:', error);
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.error || 'Login failed');
    }
    throw error;
  }
}

export async function registerUser(username: string, email: string, password: string): Promise<RegisterResponse> {
  try {
    const apiUrl = getApiBaseUrl();
    console.log('📝 Registering user:', username);
    const response = await axios.post(
      `${apiUrl}/api/auth/register`,
      { username, email, password },
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    console.error('[ApiClient] Registration error:', error);
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.error || 'Registration failed');
    }
    throw error;
  }
}

export async function getUserProfiles(userId: string, jwtToken: string, providerId?: string): Promise<Profile[]> {
  try {
    const apiUrl = getApiBaseUrl();
    console.log('👤 Fetching profiles for user:', userId);
    const url = providerId 
      ? `${apiUrl}/api/profiles?userId=${userId}&providerId=${providerId}`
      : `${apiUrl}/api/profiles?userId=${userId}`;
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${jwtToken}`
      },
      timeout: 10000
    });
    return response.data.profiles || [];
  } catch (error) {
    console.error('[ApiClient] Fetch profiles error:', error);
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.error || 'Failed to fetch profiles');
    }
    throw error;
  }
}

export async function createProfile(
  userId: string,
  jwtToken: string,
  profileData: {
    name: string;
    providerId?: string;
    avatar?: string;
    type?: 'ADMIN' | 'KID' | 'GUEST';
    ageRating?: number;
    pin?: string;
    allowedCategories?: string[];
    blockedCategories?: string[];
    allowedChannels?: string[];
    blockedChannels?: string[];
  }
): Promise<Profile> {
  try {
    const apiUrl = getApiBaseUrl();
    console.log('➕ Creating profile:', profileData.name);
    const response = await axios.post(
      `${apiUrl}/api/profiles`,
      { userId, ...profileData },
      {
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );
    return response.data.profile;
  } catch (error) {
    console.error('[ApiClient] Create profile error:', error);
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.error || 'Failed to create profile');
    }
    throw error;
  }
}

export async function updateProfile(
  profileId: string,
  jwtToken: string,
  updates: {
    name?: string;
    avatar?: string;
    type?: 'ADMIN' | 'KID' | 'GUEST';
    ageRating?: number;
    pin?: string;
    allowedCategories?: string[];
    blockedCategories?: string[];
    allowedChannels?: string[];
    blockedChannels?: string[];
  }
): Promise<Profile> {
  try {
    const apiUrl = getApiBaseUrl();
    console.log('✏️ Updating profile:', profileId);
    const response = await axios.patch(
      `${apiUrl}/api/profiles/${profileId}`,
      updates,
      {
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );
    return response.data.profile;
  } catch (error) {
    console.error('[ApiClient] Update profile error:', error);
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.error || 'Failed to update profile');
    }
    throw error;
  }
}

export async function deleteProfile(profileId: string, jwtToken: string): Promise<void> {
  try {
    const apiUrl = getApiBaseUrl();
    console.log('🗑️ Deleting profile:', profileId);
    await axios.delete(
      `${apiUrl}/api/profiles/${profileId}`,
      {
        headers: {
          'Authorization': `Bearer ${jwtToken}`
        },
        timeout: 10000
      }
    );
  } catch (error) {
    console.error('[ApiClient] Delete profile error:', error);
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.error || 'Failed to delete profile');
    }
    throw error;
  }
}

export async function switchProfile(profileId: string, jwtToken: string): Promise<Profile> {
  try {
    const apiUrl = getApiBaseUrl();
    console.log('🔄 Switching to profile:', profileId);
    const response = await axios.post(
      `${apiUrl}/api/profiles/${profileId}/switch`,
      {},
      {
        headers: {
          'Authorization': `Bearer ${jwtToken}`
        },
        timeout: 10000
      }
    );
    return response.data.profile;
  } catch (error) {
    console.error('[ApiClient] Switch profile error:', error);
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.error || 'Failed to switch profile');
    }
    throw error;
  }
}

export async function getProfileSnapshot(profileId: string, jwtToken: string): Promise<SnapshotData> {
  try {
    const apiUrl = getApiBaseUrl();
    console.log('📦 Fetching snapshot for profile:', profileId);
    const response = await axios.get(
      `${apiUrl}/api/snapshots/${profileId}/latest`,
      {
        headers: {
          'Authorization': `Bearer ${jwtToken}`
        },
        timeout: 15000
      }
    );
    return response.data.snapshot;
  } catch (error) {
    console.error('[ApiClient] Fetch snapshot error:', error);
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.error || 'Failed to fetch snapshot');
    }
    throw error;
  }
}

export async function getStreamLink(
  deviceToken: string, 
  cmd: string, 
  type: string = 'itv'
): Promise<{ url: string }> {
  try {
    const apiUrl = getApiBaseUrl();
    console.log('🎬 Requesting stream link');
    const response = await axios.post(
      `${apiUrl}/api/stream/link`,
      { deviceToken, cmd, type },
      { timeout: 10000 }
    );
    return { url: response.data.url };
  } catch (error) {
    console.error('[ApiClient] Stream link error:', error);
    if (axios.isAxiosError(error)) {
      throw new Error(error.response?.data?.error || 'Failed to get stream link');
    }
    throw error;
  }
}

// Helper function for password verification (legacy - no credentials needed)
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
