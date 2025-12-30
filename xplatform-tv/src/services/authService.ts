import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG } from '../config';

const STORAGE_KEYS = {
  ACCESS_TOKEN: '@streamhub:accessToken',
  REFRESH_TOKEN: '@streamhub:refreshToken',
  USER_EMAIL: '@streamhub:userEmail',
};

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user?: {
    id: string;
    email: string;
  };
}

interface RegisterResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
  };
}

class AuthService {
  private token: string | null = null;
  private refreshToken: string | null = null;

  async initializeAuth(): Promise<void> {
    try {
      const accessToken = await AsyncStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
      const refreshToken = await AsyncStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
      
      console.log('[AuthService] Initialize - found tokens:', { 
        hasAccessToken: !!accessToken, 
        hasRefreshToken: !!refreshToken 
      });
      
      if (accessToken && refreshToken) {
        this.token = accessToken;
        this.refreshToken = refreshToken;
      } else {
        this.token = null;
        this.refreshToken = null;
      }
    } catch (error) {
      console.error('[AuthService] Failed to initialize auth:', error);
      this.token = null;
      this.refreshToken = null;
    }
  }

  async login(email: string, password: string): Promise<void> {
    try {
      // Backend uses /auth/register for both login and register
      const response = await axios.post<LoginResponse>(
        `${API_CONFIG.baseURL}/api/auth/register`,
        { email, password }
      );

      const { accessToken, refreshToken } = response.data;
      
      this.token = accessToken;
      this.refreshToken = refreshToken;

      // Store tokens in AsyncStorage
      await AsyncStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
      await AsyncStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
      await AsyncStorage.setItem(STORAGE_KEYS.USER_EMAIL, email);
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  }

  async register(email: string, password: string): Promise<void> {
    try {
      const response = await axios.post<RegisterResponse>(
        `${API_CONFIG.baseURL}/api/auth/register`,
        { email, password }
      );

      const { accessToken, refreshToken } = response.data;
      
      this.token = accessToken;
      this.refreshToken = refreshToken;

      // Store tokens in AsyncStorage
      await AsyncStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
      await AsyncStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
      await AsyncStorage.setItem(STORAGE_KEYS.USER_EMAIL, email);
    } catch (error) {
      console.error('Registration failed:', error);
      throw error;
    }
  }

  async logout(): Promise<void> {
    try {
      // Clear in-memory tokens
      this.token = null;
      this.refreshToken = null;

      // Clear AsyncStorage
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.ACCESS_TOKEN,
        STORAGE_KEYS.REFRESH_TOKEN,
        STORAGE_KEYS.USER_EMAIL,
      ]);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }

  async refreshAccessToken(): Promise<string> {
    try {
      if (!this.refreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await axios.post<{ accessToken: string }>(
        `${API_CONFIG.baseURL}/api/auth/refresh`,
        { refreshToken: this.refreshToken }
      );

      const { accessToken } = response.data;
      this.token = accessToken;
      
      await AsyncStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
      
      return accessToken;
    } catch (error) {
      console.error('Token refresh failed:', error);
      // If refresh fails, logout user
      await this.logout();
      throw error;
    }
  }

  getToken(): string | null {
    return this.token;
  }

  getRefreshToken(): string | null {
    return this.refreshToken;
  }

  isAuthenticated(): boolean {
    return !!this.token;
  }

  async getUserEmail(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(STORAGE_KEYS.USER_EMAIL);
    } catch (error) {
      console.error('Failed to get user email:', error);
      return null;
    }
  }
}

export const authService = new AuthService();
