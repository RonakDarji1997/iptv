/**
 * API Cache Wrapper with 1-hour TTL and localStorage persistence
 * Prevents redundant API calls across the app for fast navigation
 * Cache persists across page refreshes via localStorage
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class ApiCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private readonly TTL = 60 * 60 * 1000; // 1 hour
  private readonly STORAGE_KEY = 'iptv_api_cache';
  private isHydrated = false;

  constructor() {
    // Hydrate cache from localStorage on initialization
    if (typeof window !== 'undefined') {
      this.hydrateFromStorage();
    }
  }

  /**
   * Load cache from localStorage
   */
  private hydrateFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const now = Date.now();
        let validCount = 0;
        let expiredCount = 0;

        // Only restore valid (non-expired) entries
        for (const [key, entry] of Object.entries(parsed)) {
          const cacheEntry = entry as CacheEntry<any>;
          if (now - cacheEntry.timestamp < this.TTL) {
            this.cache.set(key, cacheEntry);
            validCount++;
          } else {
            expiredCount++;
          }
        }

        console.log(`[Cache] 💾 Restored ${validCount} entries from storage${expiredCount > 0 ? ` (${expiredCount} expired)` : ''}`);
        if (validCount > 0) {
          console.log('[Cache] 📋 Cached URLs:', Array.from(this.cache.keys()).map(k => k.split(':')[1]).slice(0, 5), validCount > 5 ? '...' : '');
        }
      }
      this.isHydrated = true;
    } catch (error) {
      console.warn('[Cache] Failed to hydrate from storage:', error);
      this.isHydrated = true;
    }
  }

  /**
   * Save cache to localStorage
   */
  private persistToStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const toStore: Record<string, CacheEntry<any>> = {};
      const now = Date.now();

      // Only persist valid entries
      for (const [key, entry] of this.cache.entries()) {
        if (now - entry.timestamp < this.TTL) {
          toStore[key] = entry;
        }
      }

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(toStore));
    } catch (error) {
      // Handle quota exceeded or other storage errors
      console.warn('[Cache] Failed to persist to storage:', error);
      // Try to clear old cache and retry
      try {
        localStorage.removeItem(this.STORAGE_KEY);
      } catch (e) {
        // Ignore
      }
    }
  }

  /**
   * Generate cache key from URL and options
   */
  private generateKey(url: string, options?: RequestInit): string {
    const method = options?.method || 'GET';
    const body = options?.body ? JSON.stringify(options.body) : '';
    return `${method}:${url}:${body}`;
  }

  /**
   * Check if cache entry is still valid
   */
  private isValid(entry: CacheEntry<any>): boolean {
    return Date.now() - entry.timestamp < this.TTL;
  }

  /**
   * Fetch with automatic caching
   */
  async fetch<T = any>(url: string, options?: RequestInit): Promise<T> {
    // Skip caching for subtitle endpoints
    if (url.includes('/api/subtitles')) {
      console.log('[Cache] ⏭️  SKIP (subtitles):', url);
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    }

    const key = this.generateKey(url, options);
    
    // Check cache first
    const cached = this.cache.get(key);
    if (cached && this.isValid(cached)) {
      console.log('[Cache] 🎯 HIT:', url);
      return cached.data as T;
    }

    console.log('[Cache] 📡 MISS:', url, '| Total cached:', this.cache.size);
    
    // Fetch from API
    const response = await fetch(url, options);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Store in cache
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });

    // Persist to localStorage
    this.persistToStorage();

    return data;
  }

  /**
   * Fetch with custom response handler (for non-JSON responses)
   */
  async fetchCustom<T = any>(
    url: string,
    options?: RequestInit,
    handler?: (response: Response) => Promise<T>
  ): Promise<T> {
    const key = this.generateKey(url, options);
    
    // Check cache first
    const cached = this.cache.get(key);
    if (cached && this.isValid(cached)) {
      console.log('[Cache] 🎯 HIT:', url);
      return cached.data as T;
    }

    console.log('[Cache] 📡 MISS:', url);
    
    // Fetch from API
    const response = await fetch(url, options);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = handler ? await handler(response) : await response.json();
    
    // Store in cache
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });

    // Persist to localStorage
    this.persistToStorage();

    return data;
  }

  /**
   * Manually set cache entry
   */
  set(url: string, data: any, options?: RequestInit): void {
    const key = this.generateKey(url, options);
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
    this.persistToStorage();
  }

  /**
   * Get cached entry without fetching
   */
  get<T = any>(url: string, options?: RequestInit): T | null {
    const key = this.generateKey(url, options);
    const cached = this.cache.get(key);
    
    if (cached && this.isValid(cached)) {
      return cached.data as T;
    }
    
    return null;
  }

  /**
   * Invalidate specific cache entry
   */
  invalidate(url: string, options?: RequestInit): void {
    const key = this.generateKey(url, options);
    this.cache.delete(key);
    this.persistToStorage();
    console.log('[Cache] 🗑️ INVALIDATED:', url);
  }

  /**
   * Invalidate entries matching pattern
   */
  invalidatePattern(pattern: string | RegExp): void {
    let count = 0;
    for (const key of this.cache.keys()) {
      const url = key.split(':')[1]; // Extract URL from key
      const matches = typeof pattern === 'string' 
        ? url.includes(pattern)
        : pattern.test(url);
      
      if (matches) {
        this.cache.delete(key);
        count++;
      }
    }
    this.persistToStorage();
    console.log(`[Cache] 🗑️ INVALIDATED ${count} entries matching:`, pattern);
  }

  /**
   * Clear all cache
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.STORAGE_KEY);
    }
    console.log(`[Cache] 🧹 CLEARED all ${size} entries`);
  }

  /**
   * Clear expired entries
   */
  clearExpired(): void {
    let count = 0;
    const now = Date.now();
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp >= this.TTL) {
        this.cache.delete(key);
        count++;
      }
    }
    
    if (count > 0) {
      this.persistToStorage();
      console.log(`[Cache] 🧹 CLEARED ${count} expired entries`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    persistent: boolean;
    storageKey: string;
    entries: Array<{ url: string; age: number; valid: boolean }>;
  } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      url: key.split(':')[1],
      age: Math.round((now - entry.timestamp) / 1000),
      valid: this.isValid(entry),
    }));

    return {
      size: this.cache.size,
      persistent: true,
      storageKey: this.STORAGE_KEY,
      entries,
    };
  }
}

// Singleton instance
export const apiCache = new ApiCache();

// Auto-cleanup expired entries every 10 minutes
if (typeof window !== 'undefined') {
  setInterval(() => {
    apiCache.clearExpired();
  }, 10 * 60 * 1000);
}

// Expose cache to window for debugging
if (typeof window !== 'undefined') {
  (window as any).__apiCache = apiCache;
}
