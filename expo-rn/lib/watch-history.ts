import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const STORAGE_KEY = '@iptv_watch_history';

export interface WatchHistoryItem {
  id: string; // Unique key: "series_276419_87242_1859766" or "movie_12345" or "live_123"
  contentId: string;
  type: 'movie' | 'series' | 'live';
  title: string;
  screenshot: string;
  cmd?: string; // Stalker cmd parameter like "/media/file_3044228.mpg"
  
  // Series specific
  seasonId?: string;
  seasonNumber?: string;
  episodeId?: string;
  episodeNumber?: string;
  episodeTitle?: string;
  
  // Progress
  currentTime: number; // seconds
  duration: number;    // seconds
  percentage: number;  // 0-100
  
  // Metadata
  lastWatchedAt: string; // ISO date string
  completed: boolean;    // true if >90% watched
}

// Platform-specific storage
const storage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key);
    }
    return AsyncStorage.getItem(key);
  },
  
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
    } else {
      await AsyncStorage.setItem(key, value);
    }
  },
  
  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
    } else {
      await AsyncStorage.removeItem(key);
    }
  }
};

export class WatchHistoryManager {
  // Generate unique ID for watch history item
  static generateId(type: string, contentId: string, seasonId?: string, episodeId?: string): string {
    if (type === 'series' && seasonId && episodeId) {
      return `series_${contentId}_${seasonId}_${episodeId}`;
    } else if (type === 'movie') {
      return `movie_${contentId}`;
    } else if (type === 'live') {
      return `live_${contentId}`;
    }
    return `${type}_${contentId}`;
  }

  // Save or update watch progress
  static async saveProgress(item: WatchHistoryItem): Promise<void> {
    try {
      const history = await this.getAll();
      
      // Remove existing entry if found
      const filtered = history.filter(h => h.id !== item.id);
      
      // Add updated entry at the beginning
      filtered.unshift(item);
      
      // Keep only last 50 items
      const limited = filtered.slice(0, 50);
      
      await storage.setItem(STORAGE_KEY, JSON.stringify(limited));
    } catch (error) {
      console.error('Error saving watch progress:', error);
    }
  }

  // Get all watch history
  static async getAll(): Promise<WatchHistoryItem[]> {
    try {
      const data = await storage.getItem(STORAGE_KEY);
      if (!data) return [];
      
      const history: WatchHistoryItem[] = JSON.parse(data);
      
      // Sort by most recent
      return history.sort((a, b) => 
        new Date(b.lastWatchedAt).getTime() - new Date(a.lastWatchedAt).getTime()
      );
    } catch (error) {
      console.error('Error getting watch history:', error);
      return [];
    }
  }

  // Get continue watching items (not completed, sorted by recent)
  static async getContinueWatching(): Promise<WatchHistoryItem[]> {
    try {
      const all = await this.getAll();
      
      // Filter out completed items (>90% watched) and live TV
      return all.filter(item => !item.completed && item.type !== 'live');
    } catch (error) {
      console.error('Error getting continue watching:', error);
      return [];
    }
  }

  // Get progress for specific content
  static async getProgress(id: string): Promise<WatchHistoryItem | null> {
    try {
      const history = await this.getAll();
      return history.find(item => item.id === id) || null;
    } catch (error) {
      console.error('Error getting progress:', error);
      return null;
    }
  }

  // Remove specific item
  static async remove(id: string): Promise<void> {
    try {
      const history = await this.getAll();
      const filtered = history.filter(h => h.id !== id);
      await storage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    } catch (error) {
      console.error('Error removing watch history:', error);
    }
  }

  // Clear all history
  static async clearAll(): Promise<void> {
    try {
      await storage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Error clearing watch history:', error);
    }
  }

  // Helper to create WatchHistoryItem from content data
  static createItem(
    type: 'movie' | 'series' | 'live',
    contentId: string,
    title: string,
    screenshot: string,
    currentTime: number,
    duration: number,
    options?: {
      cmd?: string;
      seasonId?: string;
      seasonNumber?: string;
      episodeId?: string;
      episodeNumber?: string;
      episodeTitle?: string;
    }
  ): WatchHistoryItem {
    const percentage = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;
    const completed = percentage >= 90;
    
    const id = this.generateId(type, contentId, options?.seasonId, options?.episodeId);
    
    return {
      id,
      contentId,
      type,
      title,
      screenshot,
      cmd: options?.cmd,
      seasonId: options?.seasonId,
      seasonNumber: options?.seasonNumber,
      episodeId: options?.episodeId,
      episodeNumber: options?.episodeNumber,
      episodeTitle: options?.episodeTitle,
      currentTime,
      duration,
      percentage,
      completed,
      lastWatchedAt: new Date().toISOString()
    };
  }
}
