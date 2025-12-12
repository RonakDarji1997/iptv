import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
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

    // On web, clear browser storage to remove any persisted session data.
    if (Platform.OS === 'web') {
      try {
        console.log('🧹 [AuthManager] Clearing browser storage (web)');

        try {
          // localStorage
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.clear();
            console.log('  - localStorage cleared');
          }
        } catch (e) {
          console.warn('  - localStorage clear failed', e);
        }

        try {
          // sessionStorage
          if (typeof window !== 'undefined' && window.sessionStorage) {
            window.sessionStorage.clear();
            console.log('  - sessionStorage cleared');
          }
        } catch (e) {
          console.warn('  - sessionStorage clear failed', e);
        }

        try {
          // Clear cookies by setting expiry in the past for each cookie
          if (typeof document !== 'undefined' && document.cookie) {
            const cookies = document.cookie.split(';');
            for (const cookie of cookies) {
              const eqPos = cookie.indexOf('=');
              const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
              try {
                document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
              } catch (e) {
                // ignore per-cookie failures
              }
            }
            console.log('  - cookies cleared (best-effort)');
          }
        } catch (e) {
          console.warn('  - cookie clear failed', e);
        }

        try {
          // Clear Cache Storage (service worker caches)
          if (typeof caches !== 'undefined' && caches.keys) {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
            console.log('  - caches cleared');
          }
        } catch (e) {
          console.warn('  - caches clear failed', e);
        }

        try {
          // Attempt to delete all IndexedDB databases (if supported)
          // indexedDB.databases() is async and not available in all browsers.
          if (typeof indexedDB !== 'undefined') {
            // Try modern API first
            // @ts-ignore
            if (typeof indexedDB.databases === 'function') {
              try {
                // @ts-ignore
                const dbs = await indexedDB.databases();
                if (Array.isArray(dbs)) {
                  await Promise.all(dbs.map((d: any) => {
                    try {
                      return new Promise((resolve) => {
                        const req = indexedDB.deleteDatabase(d.name);
                        req.onsuccess = () => resolve(true);
                        req.onerror = () => resolve(true);
                        req.onblocked = () => resolve(true);
                      });
                    } catch (e) {
                      return Promise.resolve(true);
                    }
                  }));
                  console.log('  - indexedDB databases deleted (databases() path)');
                }
              } catch (e) {
                // fallthrough to best-effort deletion
              }
            }

            // Best-effort: try deleting a few common DB names (if present) or attempt a generic delete by name
            try {
              // If we don't know names, attempt a noop-safe pattern: attempt to delete common DB names used by libraries
              const common = ['firebaseLocalStorageDb', 'expo', 'workbox-precache', 'localforage'];
              await Promise.all(common.map((name) => new Promise((resolve) => {
                try {
                  const req = indexedDB.deleteDatabase(name);
                  req.onsuccess = () => resolve(true);
                  req.onerror = () => resolve(true);
                  req.onblocked = () => resolve(true);
                } catch (e) { resolve(true); }
              })));
              console.log('  - indexedDB best-effort deletions attempted');
            } catch (e) {
              // ignore
            }
          }
        } catch (e) {
          console.warn('  - indexedDB clear failed', e);
        }

      } catch (err) {
        console.warn('🧹 [AuthManager] Browser storage clear encountered errors', err);
      }
    }
  }

  /**
   * Get user email
   */
  static async getUserEmail(): Promise<string | null> {
    return await AsyncStorage.getItem(USER_EMAIL_KEY);
  }
}
