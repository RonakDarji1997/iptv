import AsyncStorage from '@react-native-async-storage/async-storage';
import { backendClient } from '../services/backend';

const AUTH_TOKEN_KEY = 'auth_token';
const USER_EMAIL_KEY = 'user_email';
const DEVICE_ID_KEY = 'device_id';

export class AuthManager {
  private static deviceId: string | null = null;

  /**
   * Generate a simple UUID v4
   */
  private static generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Get or create device ID
   */
  static async getDeviceId(): Promise<string> {
    if (this.deviceId) {
      return this.deviceId;
    }

    let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      // Generate a unique device ID
      deviceId = this.generateUUID();
      await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
    }

    this.deviceId = deviceId;
    return deviceId;
  }

  /**
   * Check if user is authenticated
   */
  static async isAuthenticated(): Promise<boolean> {
    const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    return !!token;
  }

  /**
   * Get stored auth token
   */
  static async getToken(): Promise<string | null> {
    return await AsyncStorage.getItem(AUTH_TOKEN_KEY);
  }

  /**
   * Login with email and password
   */
  static async login(email: string, password: string): Promise<boolean> {
    try {
      console.log('🔑 Logging in...');
      const response = await backendClient.login(email, password);
      
      if (response.success && response.token) {
        await AsyncStorage.setItem(AUTH_TOKEN_KEY, response.token);
        await AsyncStorage.setItem(USER_EMAIL_KEY, email);
        await backendClient.setToken(response.token);
        console.log('✅ Login successful');
        return true;
      }
      
      return false;
    } catch (error: unknown) {
      console.error('❌ Login failed:', error);
      return false;
    }
  }

  /**
   * Check if user is authenticated (has valid token)
   */
  static async ensureAuthenticated(): Promise<boolean> {
    const token = await this.getToken();
    const email = await this.getUserEmail();
    
    // Clear old device-based tokens
    if (email && email.includes('device_') && email.includes('@mobile.app')) {
      console.log('🔄 Clearing old device token...');
      await this.logout();
      return false;
    }
    
    if (token) {
      await backendClient.setToken(token);
      console.log('✅ Found existing auth token');
      return true;
    }
    return false;
  }

  /**
   * Logout
   */
  static async logout(): Promise<void> {
    await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
    await AsyncStorage.removeItem(USER_EMAIL_KEY);
    await backendClient.clearToken();
    console.log('✅ Logged out');
  }

  /**
   * Get user email
   */
  static async getUserEmail(): Promise<string | null> {
    return await AsyncStorage.getItem(USER_EMAIL_KEY);
  }
}
