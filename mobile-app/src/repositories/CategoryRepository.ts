import { Database } from '../database/Database';
import { backendClient } from '../services/backend';
import { Category } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_SYNC_KEY = 'last_category_sync';
const SYNC_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

export class CategoryRepository {
  /**
   * Get live TV categories from local database
   * Database is the source of truth
   */
  static async getLiveCategories(): Promise<Category[]> {
    try {
      const db = await Database.getDatabase();
      const result = await db.getAllAsync<any>(`
        SELECT * FROM categories 
        WHERE type = 'LIVE' AND is_enabled = 1
        ORDER BY censored ASC, sort_order ASC, name ASC
      `);

      return result.map(row => ({
        id: row.category_id,
        name: row.name,
        type: row.type,
        contentType: row.content_type,
        censored: row.censored,
        isEnabled: row.is_enabled === 1,
        sortOrder: row.sort_order,
      }));
    } catch (error) {
      console.error('Failed to get live categories from DB:', error);
      throw error;
    }
  }

  /**
   * Get movie categories from local database
   */
  static async getMovieCategories(): Promise<Category[]> {
    try {
      const db = await Database.getDatabase();
      const result = await db.getAllAsync<any>(`
        SELECT * FROM categories 
        WHERE content_type = 'movie' AND is_enabled = 1
        ORDER BY censored ASC, sort_order ASC, name ASC
      `);

      return result.map(row => ({
        id: row.category_id,
        name: row.name,
        type: row.type,
        contentType: row.content_type,
        censored: row.censored,
        isEnabled: row.is_enabled === 1,
        sortOrder: row.sort_order,
      }));
    } catch (error) {
      console.error('Failed to get movie categories from DB:', error);
      throw error;
    }
  }

  /**
   * Get series categories from local database
   */
  static async getSeriesCategories(): Promise<Category[]> {
    try {
      const db = await Database.getDatabase();
      const result = await db.getAllAsync<any>(`
        SELECT * FROM categories 
        WHERE content_type = 'series' AND is_enabled = 1
        ORDER BY censored ASC, sort_order ASC, name ASC
      `);

      return result.map(row => ({
        id: row.category_id,
        name: row.name,
        type: row.type,
        contentType: row.content_type,
        censored: row.censored,
        isEnabled: row.is_enabled === 1,
        sortOrder: row.sort_order,
      }));
    } catch (error) {
      console.error('Failed to get series categories from DB:', error);
      throw error;
    }
  }

  /**
   * Sync all data from backend and save to local database
   * This should be called on app start and periodically
   * Requires authentication
   */
  static async syncFromBackend(forceSync: boolean = false): Promise<boolean> {
    try {
      // Check if we need to sync
      if (!forceSync) {
        const lastSync = await AsyncStorage.getItem(LAST_SYNC_KEY);
        if (lastSync) {
          const timeSinceSync = Date.now() - parseInt(lastSync);
          if (timeSinceSync < SYNC_INTERVAL) {
            console.log('⏭️ Skipping sync - last synced recently');
            return true;
          }
        }
      }

      console.log('🔄 Starting backend sync...');
      const syncData = await backendClient.syncPull();

      if (!syncData.success || !syncData.data) {
        throw new Error('Sync failed');
      }

      const db = await Database.getDatabase();
      const { providers, categories, channels, progress } = syncData.data;

      // Begin transaction
      await db.execAsync('BEGIN TRANSACTION');

      try {
        // Insert providers
        for (const provider of providers) {
          await db.runAsync(
            `INSERT OR REPLACE INTO providers (
              id, user_id, provider_id, name, type, server_url, username, password,
              mac_address, serial_number, token, configuration, is_active, is_configured,
              include_tv, include_vod, adult_password, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              provider.id,
              provider.user_id,
              provider.provider_id,
              provider.name,
              provider.type,
              provider.server_url,
              provider.username,
              provider.password,
              provider.mac_address,
              provider.serial_number,
              provider.token,
              provider.configuration,
              provider.is_active ? 1 : 0,
              provider.is_configured ? 1 : 0,
              provider.include_tv ? 1 : 0,
              provider.include_vod ? 1 : 0,
              provider.adult_password,
              provider.created_at,
              provider.updated_at,
            ]
          );
        }

        // Insert categories
        for (const category of categories) {
          await db.runAsync(
            `INSERT OR REPLACE INTO categories (
              id, user_id, provider_id, category_id, name, type, content_type,
              censored, is_enabled, sort_order, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              category.id,
              category.user_id,
              category.provider_id,
              category.category_id,
              category.name,
              category.type,
              category.content_type,
              category.censored || 0,
              category.is_enabled ? 1 : 0,
              category.sort_order || 0,
              category.created_at,
              category.updated_at,
            ]
          );
        }

        // Insert channels
        for (const channel of channels) {
          await db.runAsync(
            `INSERT OR REPLACE INTO channels (
              id, user_id, category_id, channel_id, name, url, cmd, logo,
              number, is_active, external_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              channel.id,
              channel.user_id,
              channel.category_id,
              channel.channel_id,
              channel.name,
              channel.url,
              channel.cmd,
              channel.logo,
              channel.number,
              channel.is_active ? 1 : 0,
              channel.external_id,
              channel.created_at,
              channel.updated_at,
            ]
          );
        }

        // Insert watch progress
        for (const prog of progress) {
          await db.runAsync(
            `INSERT OR REPLACE INTO watch_progress (
              id, user_id, content_id, content_type, content_name, provider_id,
              current_position, duration, last_watched_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              prog.id,
              prog.user_id,
              prog.content_id,
              prog.content_type,
              prog.content_name,
              prog.provider_id,
              prog.current_position,
              prog.duration,
              prog.last_watched_at,
              prog.created_at,
              prog.updated_at,
            ]
          );
        }

        await db.execAsync('COMMIT');

        // Update last sync time
        await AsyncStorage.setItem(LAST_SYNC_KEY, Date.now().toString());

        console.log(`✅ Sync complete: ${providers.length} providers, ${categories.length} categories, ${channels.length} channels`);
        return true;
      } catch (error) {
        await db.execAsync('ROLLBACK');
        throw error;
      }
    } catch (error) {
      console.error('❌ Sync failed:', error);
      return false;
    }
  }

  /**
   * Force a full sync from backend
   */
  static async forceSync(): Promise<boolean> {
    return this.syncFromBackend(true);
  }
}
