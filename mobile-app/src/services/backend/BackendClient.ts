import axios, { AxiosInstance } from 'axios';
import { API_CONFIG } from '../../constants';
import { Category as AppCategory } from '../../types';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Category = AppCategory;

export interface BackendResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface SyncData {
  providers: any[];
  categories: any[];
  channels: any[];
  settings: any;
  progress: any[];
}

class BackendClient {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_CONFIG.BACKEND_URL,
      timeout: API_CONFIG.TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor to include token
    this.client.interceptors.request.use(async (config) => {
      if (!this.token) {
        this.token = await AsyncStorage.getItem('auth_token');
      }
      if (this.token) {
        config.headers.Authorization = `Bearer ${this.token}`;
      }
      return config;
    });
  }

  /**
   * Set authentication token
   */
  async setToken(token: string) {
    this.token = token;
    await AsyncStorage.setItem('auth_token', token);
  }

  /**
   * Clear authentication token
   */
  async clearToken() {
    this.token = null;
    await AsyncStorage.removeItem('auth_token');
  }

  /**
   * Login (uses register endpoint which handles both login and registration)
   */
  async login(email: string, password: string): Promise<{ success: boolean; token: string; refreshToken: string }> {
    try {
      const response = await this.client.post('/auth/register', { email, password });
      if (response.data.accessToken) {
        await this.setToken(response.data.accessToken);
      }
      return {
        success: true,
        token: response.data.accessToken,
        refreshToken: response.data.refreshToken,
      };
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  }

  /**
   * Register
   */
  async register(email: string, password: string, name?: string): Promise<{ success: boolean; token: string }> {
    try {
      const response = await this.client.post('/auth/register', { email, password, name });
      if (response.data.accessToken) {
        await this.setToken(response.data.accessToken);
      }
      return {
        success: true,
        token: response.data.accessToken,
      };
    } catch (error) {
      console.error('Registration failed:', error);
      throw error;
    }
  }

  /**
   * Pull all sync data from backend
   */
  async syncPull(): Promise<{ success: boolean; data: SyncData }> {
    try {
      const response = await this.client.get('/sync/pull');
      return response.data;
    } catch (error) {
      console.error('Sync pull failed:', error);
      throw error;
    }
  }

  /**
   * Push categories to backend
   */
  async syncCategories(providerId: string, categories: any[]): Promise<{ success: boolean; syncedCount: number }> {
    try {
      const response = await this.client.post('/sync/categories', { provider_id: providerId, categories });
      return response.data;
    } catch (error) {
      console.error('Sync categories failed:', error);
      throw error;
    }
  }

  /**
   * Push channels to backend
   */
  async syncChannels(providerId: string, channels: any[]): Promise<{ success: boolean; syncedCount: number }> {
    try {
      const response = await this.client.post('/sync/channels', { provider_id: providerId, channels });
      return response.data;
    } catch (error) {
      console.error('Sync channels failed:', error);
      throw error;
    }
  }

  /**
   * Sync watch progress
   */
  async syncProgress(data: {
    contentId: string;
    contentType: string;
    providerId?: string;
    contentName?: string;
    position: number;
    duration: number;
  }): Promise<{ success: boolean }> {
    try {
      const response = await this.client.post('/sync/progress', data);
      return response.data;
    } catch (error) {
      console.error('Sync progress failed:', error);
      throw error;
    }
  }

  /**
   * Search across all content
   */
  async search(query: string, type?: 'live' | 'vod' | 'series') {
    try {
      const response = await this.client.get('/search', {
        params: { q: query, type },
      });
      return response.data;
    } catch (error) {
      console.error('Search failed:', error);
      throw error;
    }
  }
}

export const backendClient = new BackendClient();
