import { Database } from '../database/Database';
import { StalkerPortalClient } from '../services/StalkerPortalClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { backendClient } from './backend/BackendClient';

const PROVIDER_KEY = 'stalker_provider_config';
const LAST_SYNC_KEY = 'last_stalker_sync';

export interface ProviderConfig {
  id: string;
  name: string;
  portalUrl: string;
  bearerToken?: string;
  macAddress?: string;
}

export class StalkerSyncService {
  private static stalkerClient: StalkerPortalClient | null = null;

  /**
   * Set provider configuration with token from backend sync
   */
  static async setProvider(config: ProviderConfig): Promise<void> {
    await AsyncStorage.setItem(PROVIDER_KEY, JSON.stringify(config));
    this.stalkerClient = new StalkerPortalClient(
      config.portalUrl,
      config.macAddress
    );
    
    // Set bearer token if available
    if (config.bearerToken) {
      this.stalkerClient.setToken(config.bearerToken);
    }
  }

  /**
   * Get provider configuration
   */
  static async getProvider(): Promise<ProviderConfig | null> {
    const stored = await AsyncStorage.getItem(PROVIDER_KEY);
    if (stored) {
      const config = JSON.parse(stored);
      if (!this.stalkerClient) {
        this.stalkerClient = new StalkerPortalClient(
          config.portalUrl,
          config.macAddress
        );
        if (config.bearerToken) {
          this.stalkerClient.setToken(config.bearerToken);
        }
      }
      return config;
    }
    return null;
  }

  /**
   * Initialize provider from backend sync data
   */
  static async initializeFromBackend(): Promise<boolean> {
    try {
      console.log('🔄 Fetching provider data from backend...');
      const syncData = await backendClient.syncPull();
      
      console.log('Backend sync response:', JSON.stringify(syncData).substring(0, 500));
      
      if (!syncData.success) {
        console.warn('⚠️ Backend sync failed:', syncData);
        return false;
      }
      
      if (!syncData.data.providers || syncData.data.providers.length === 0) {
        console.warn('⚠️ No providers found in backend sync data');
        console.log('Sync data:', JSON.stringify(syncData.data));
        return false;
      }

      const provider = syncData.data.providers[0]; // Use first provider
      console.log('Provider from backend:', JSON.stringify(provider));
      
      const config: ProviderConfig = {
        id: provider.provider_id || provider.id,
        name: provider.name || 'IPTV Provider',
        portalUrl: provider.server_url || provider.portalUrl,
        bearerToken: provider.bearer_token || provider.token,
        macAddress: provider.mac_address || provider.macAddress,
      };

      console.log('Provider config:', {
        id: config.id,
        name: config.name,
        portalUrl: config.portalUrl,
        hasToken: !!config.bearerToken,
        hasMac: !!config.macAddress
      });

      await this.setProvider(config);
      console.log('✅ Provider initialized from backend:', config.name);
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize provider from backend:', error);
      if (error instanceof Error) {
        console.error('Error details:', error.message, error.stack);
      }
      return false;
    }
  }

  /**
   * Get or create Stalker client
   */
  private static async getClient(): Promise<StalkerPortalClient> {
    if (!this.stalkerClient) {
      const provider = await this.getProvider();
      if (!provider) {
        throw new Error('No provider configured');
      }
      this.stalkerClient = new StalkerPortalClient(
        provider.portalUrl,
        provider.macAddress
      );
      if (provider.bearerToken) {
        this.stalkerClient.setToken(provider.bearerToken);
      }
    }
    return this.stalkerClient;
  }

  /**
   * Sync categories from Stalker portal to local database
   */
  static async syncCategories(forceSync: boolean = false): Promise<boolean> {
    try {
      // Check if we need to sync
      if (!forceSync) {
        const lastSync = await AsyncStorage.getItem(LAST_SYNC_KEY);
        if (lastSync) {
          const timeSinceSync = Date.now() - parseInt(lastSync);
          if (timeSinceSync < 24 * 60 * 60 * 1000) { // 24 hours
            console.log('⏭️ Skipping sync - last synced recently');
            return true;
          }
        }
      }

      const client = await this.getClient();
      const provider = await this.getProvider();
      if (!provider) {
        throw new Error('No provider configured');
      }

      console.log('🔄 Starting Stalker portal sync...');

      // Try to get cached categories first
      let categories = await client.getCachedCategories();
      
      if (!categories || forceSync) {
        // Fetch from portal
        categories = await client.syncAllCategories();
      }

      const db = await Database.getDatabase();
      const userId = 'mobile-user'; // Simple user ID for mobile

      // Begin transaction
      await db.execAsync('BEGIN TRANSACTION');

      try {
        // Insert provider if doesn't exist
        await db.runAsync(
          `INSERT OR REPLACE INTO providers (
            id, user_id, provider_id, name, type, server_url, is_active, is_configured
          ) VALUES (?, ?, ?, ?, ?, ?, 1, 1)`,
          [provider.id, userId, provider.id, provider.name, 'stalker', provider.portalUrl]
        );

        // Insert live categories
        for (const cat of categories.liveCategories) {
          if (cat.id === '*') continue; // Skip "All" category
          
          await db.runAsync(
            `INSERT OR REPLACE INTO categories (
              id, user_id, provider_id, category_id, name, type, content_type,
              censored, is_enabled, sort_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
            [
              `live_${cat.id}`,
              userId,
              provider.id,
              cat.id,
              cat.title,
              'LIVE',
              'live',
              cat.censored,
            ]
          );
        }

        // Insert movie categories
        for (const cat of categories.movieCategories) {
          await db.runAsync(
            `INSERT OR REPLACE INTO categories (
              id, user_id, provider_id, category_id, name, type, content_type,
              censored, is_enabled, sort_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
            [
              `movie_${cat.id}`,
              userId,
              provider.id,
              cat.id,
              cat.title,
              'MOVIE',
              'movie',
              cat.censored,
            ]
          );
        }

        // Insert series categories
        for (const cat of categories.seriesCategories) {
          await db.runAsync(
            `INSERT OR REPLACE INTO categories (
              id, user_id, provider_id, category_id, name, type, content_type,
              censored, is_enabled, sort_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
            [
              `series_${cat.id}`,
              userId,
              provider.id,
              cat.id,
              cat.title,
              'SERIES',
              'series',
              cat.censored,
            ]
          );
        }

        await db.execAsync('COMMIT');

        // Note: Backend proxy already cached categories in PostgreSQL when we fetched them
        // No need to push back - that would be redundant

        // Update last sync time
        await AsyncStorage.setItem(LAST_SYNC_KEY, Date.now().toString());

        console.log(`✅ Sync complete: ${categories.liveCategories.length} live, ${categories.movieCategories.length} movies, ${categories.seriesCategories.length} series`);
        return true;
      } catch (error) {
        await db.execAsync('ROLLBACK');
        throw error;
      }
    } catch (error) {
      console.error('❌ Stalker sync failed:', error);
      return false;
    }
  }

  /**
   * Sync channels for a live TV category
   */
  static async syncChannelsForCategory(categoryId: string): Promise<number> {
    try {
      const client = await this.getClient();
      const provider = await this.getProvider();
      if (!provider) {
        throw new Error('No provider configured');
      }

      console.log(`📡 Syncing channels for category ${categoryId}...`);

      const { channels } = await client.getChannelsByCategory(categoryId);
      
      const db = await Database.getDatabase();
      const userId = 'mobile-user';

      // Get internal category UUID
      const categoryResult = await db.getAllAsync<{ id: string }>(`
        SELECT id FROM categories WHERE category_id = ? AND content_type = 'live' LIMIT 1
      `, [categoryId]);

      if (categoryResult.length === 0) {
        throw new Error(`Category ${categoryId} not found`);
      }

      const categoryUuid = categoryResult[0].id;

      // Insert channels
      for (const channel of channels) {
        await db.runAsync(
          `INSERT OR REPLACE INTO channels (
            id, user_id, category_id, channel_id, name, url, cmd, logo, number, is_active
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [
            `channel_${categoryId}_${channel.id}`,
            userId,
            categoryUuid,
            channel.id,
            channel.name,
            channel.cmd,
            channel.cmd,
            channel.logo || '',
            parseInt(channel.number || '0'),
          ]
        );
      }

      console.log(`✅ Synced ${channels.length} channels`);

      // Push channels to backend for cloud sync
      try {
        console.log('☁️ Pushing channels to backend...');
        
        const channelsForBackend = channels.map(ch => ({
          id: ch.id,
          categoryId: categoryId,
          name: ch.name,
          url: ch.cmd,
          cmd: ch.cmd,
          logo: ch.logo || '',
          number: parseInt(ch.number || '0'),
          isActive: true,
        }));

        const result = await backendClient.syncChannels(provider.id, channelsForBackend);
        console.log(`✅ Pushed ${result.syncedCount} channels to backend`);
      } catch (backendError) {
        console.warn('⚠️ Failed to push channels to backend:', backendError);
        // Don't fail the whole sync if backend push fails
      }

      return channels.length;
    } catch (error) {
      console.error('❌ Channel sync failed:', error);
      throw error;
    }
  }
}
