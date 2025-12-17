/**
 * Storage Adapter
 * Provides unified storage API for web (localStorage) and mobile (AsyncStorage via bridge)
 */

import { isMobileApp, sendToNative, listenToNative } from './mobileDetection';

class StorageAdapter {
  private pendingRequests = new Map<string, (value: string | null) => void>();
  private requestId = 0;

  constructor() {
    // Listen for storage responses from native app
    if (isMobileApp()) {
      listenToNative((type, data) => {
        if (type === 'STORAGE_RESPONSE') {
          const { requestId, value } = data;
          const resolver = this.pendingRequests.get(requestId);
          if (resolver) {
            resolver(value);
            this.pendingRequests.delete(requestId);
          }
        }
      });
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    if (isMobileApp()) {
      sendToNative('STORAGE_SET', { key, value });
    } else {
      localStorage.setItem(key, value);
    }
  }

  async getItem(key: string): Promise<string | null> {
    if (isMobileApp()) {
      // For mobile, we need to request storage value from native
      const requestId = `req_${this.requestId++}`;
      
      return new Promise((resolve) => {
        this.pendingRequests.set(requestId, resolve);
        sendToNative('STORAGE_GET', { requestId, key });
        
        // Timeout after 5 seconds
        setTimeout(() => {
          if (this.pendingRequests.has(requestId)) {
            this.pendingRequests.delete(requestId);
            resolve(null);
          }
        }, 5000);
      });
    } else {
      return localStorage.getItem(key);
    }
  }

  async removeItem(key: string): Promise<void> {
    if (isMobileApp()) {
      sendToNative('STORAGE_REMOVE', { key });
    } else {
      localStorage.removeItem(key);
    }
  }

  async clear(): Promise<void> {
    if (isMobileApp()) {
      sendToNative('STORAGE_CLEAR', {});
    } else {
      localStorage.clear();
    }
  }
}

export const storage = new StorageAdapter();
