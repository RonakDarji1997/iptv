import { Database } from '../database/Database';
import { backendClient } from '../services/backend';
import { Category } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ProviderService } from '../services/ProviderService';

const LAST_SYNC_KEY = 'last_category_sync';
const SYNC_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
const NORMALIZATION_FLAG = 'provider_ids_normalized_v1';

export class CategoryRepository {
  /**
   * Get live TV categories from local database
   * Database is the source of truth
   */
  static async getLiveCategories(providerIds?: string[] | string): Promise<Category[]> {
    try {
      // Ensure DB rows use canonical provider UUIDs before querying.
      await CategoryRepository.ensureProviderNormalization();
      // If caller didn't supply providerIds, fall back to the user's selected providers
      let filter = Array.isArray(providerIds) ? providerIds : (providerIds ? [providerIds] : undefined);
      if (!filter) {
        const selected = await ProviderService.getSelectedProviderIds();
        filter = selected && selected.length > 0 ? selected : undefined;
        console.log(`🔁 [getLiveCategories] No providerIds supplied, falling back to selected providers: ${filter ? filter.join(',') : 'ALL'}`);
      } else {
        console.log(`🔍 [getLiveCategories] Filtering by providerIds: ${filter ? filter.join(',') : 'ALL'}`);
      }
      const db = await Database.getDatabase();
      let query = `
        SELECT * FROM categories 
        WHERE type = 'LIVE' AND is_enabled = 1
      `;
      const params: any[] = [];

      // Use strict provider UUID filtering only. Categories and other rows
      // should have been normalized to provider UUIDs by now.
      if (filter && filter.length > 0) {
        const placeholders = filter.map(() => '?').join(',');
        query += ` AND provider_id IN (${placeholders})`;
        params.push(...filter);
      }
      
      query += ` ORDER BY censored ASC, sort_order ASC, name ASC`;
      
      const result = await db.getAllRows<any>(query, params);
      console.log(`✅ [getLiveCategories] Found ${result.length} categories for providers: ${filter ? filter.join(',') : 'ALL'}`);
      if (result.length > 0) {
        console.log(`📋 First 3 categories:`, result.slice(0, 3).map(r => ({ name: r.name, provider_id: r.provider_id })));
        const distinct = Array.from(new Set(result.map(r => r.provider_id)));
        console.log(`🔎 [getLiveCategories] Distinct provider_ids in result (${distinct.length}):`, distinct.slice(0, 10));
      }

      return result.map(row => ({
        id: row.id,
        categoryId: row.category_id,
        name: row.name,
        type: row.type,
        contentType: row.content_type,
        censored: row.censored,
        isEnabled: row.is_enabled === 1,
        sortOrder: row.sort_order,
        providerId: row.provider_id,
      }));
    } catch (error) {
      console.error('Failed to get live categories from DB:', error);
      throw error;
    }
  }

  /**
   * Get movie categories from local database
   */
  static async getMovieCategories(providerIds?: string[] | string): Promise<Category[]> {
    try {
      await CategoryRepository.ensureProviderNormalization();
      let filter = Array.isArray(providerIds) ? providerIds : (providerIds ? [providerIds] : undefined);
      if (!filter) {
        const selected = await ProviderService.getSelectedProviderIds();
        filter = selected && selected.length > 0 ? selected : undefined;
        console.log(`🔁 [getMovieCategories] No providerIds supplied, falling back to selected providers: ${filter ? filter.join(',') : 'ALL'}`);
      } else {
        console.log(`🔍 [getMovieCategories] Filtering by providerIds: ${filter ? filter.join(',') : 'ALL'}`);
      }
      const db = await Database.getDatabase();
      let query = `
        SELECT * FROM categories 
        WHERE content_type = 'movie' AND is_enabled = 1
      `;
      const params: any[] = [];

      if (filter && filter.length > 0) {
        const placeholders = filter.map(() => '?').join(',');
        query += ` AND provider_id IN (${placeholders})`;
        params.push(...filter);
      }
      
      query += ` ORDER BY censored ASC, sort_order ASC, name ASC`;
      
      const result = await db.getAllRows<any>(query, params);
      console.log(`✅ [getMovieCategories] Found ${result.length} categories for providers: ${filter ? filter.join(',') : 'ALL'}`);
      if (result.length > 0) {
        console.log(`📋 First 3 categories:`, result.slice(0, 3).map(r => ({ name: r.name, provider_id: r.provider_id })));
        const distinct = Array.from(new Set(result.map(r => r.provider_id)));
        console.log(`🔎 [getMovieCategories] Distinct provider_ids in result (${distinct.length}):`, distinct.slice(0, 10));
      }

      return result.map(row => ({
        id: row.id,
        categoryId: row.category_id,
        name: row.name,
        type: row.type,
        contentType: row.content_type,
        censored: row.censored,
        isEnabled: row.is_enabled === 1,
        sortOrder: row.sort_order,
        providerId: row.provider_id,
      }));
    } catch (error) {
      console.error('Failed to get movie categories from DB:', error);
      throw error;
    }
  }

  /**
   * Get series categories from local database
   */
  static async getSeriesCategories(providerIds?: string[] | string): Promise<Category[]> {
    try {
      await CategoryRepository.ensureProviderNormalization();
      let filter = Array.isArray(providerIds) ? providerIds : (providerIds ? [providerIds] : undefined);
      if (!filter) {
        const selected = await ProviderService.getSelectedProviderIds();
        filter = selected && selected.length > 0 ? selected : undefined;
        console.log(`🔁 [getSeriesCategories] No providerIds supplied, falling back to selected providers: ${filter ? filter.join(',') : 'ALL'}`);
      } else {
        console.log(`🔍 [getSeriesCategories] Filtering by providerIds: ${filter ? filter.join(',') : 'ALL'}`);
      }
      const db = await Database.getDatabase();
      let query = `
        SELECT * FROM categories 
        WHERE content_type = 'series' AND is_enabled = 1
      `;
      const params: any[] = [];

      if (filter && filter.length > 0) {
        const placeholders = filter.map(() => '?').join(',');
        query += ` AND provider_id IN (${placeholders})`;
        params.push(...filter);
      }
      
      query += ` ORDER BY censored ASC, sort_order ASC, name ASC`;
      
      const result = await db.getAllRows<any>(query, params);
      console.log(`✅ [getSeriesCategories] Found ${result.length} categories for providers: ${filter ? filter.join(',') : 'ALL'}`);
      if (result.length > 0) {
        console.log(`📋 First 3 categories:`, result.slice(0, 3).map(r => ({ name: r.name, provider_id: r.provider_id })));
        const distinct = Array.from(new Set(result.map(r => r.provider_id)));
        console.log(`🔎 [getSeriesCategories] Distinct provider_ids in result (${distinct.length}):`, distinct.slice(0, 10));
      }

      return result.map(row => ({
        id: row.id,
        categoryId: row.category_id,
        name: row.name,
        type: row.type,
        contentType: row.content_type,
        censored: row.censored,
        isEnabled: row.is_enabled === 1,
        sortOrder: row.sort_order,
        providerId: row.provider_id,
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

      console.log('📥 Backend sync response:', JSON.stringify(syncData).substring(0, 500));

      if (!syncData.success || !syncData.data) {
        throw new Error('Sync failed');
      }

      const db = await Database.getDatabase();
      const { providers, categories, channels, progress } = syncData.data;
      
      console.log(`📦 Received from backend: ${providers.length} providers, ${categories.length} categories, ${channels.length} channels`);
      console.log('🏢 Providers:', providers.map(p => ({ id: p.provider_id, name: p.name, active: p.is_active })));

      // Begin transaction
      await db.beginTransaction();

      try {
        // Insert providers
        for (const provider of providers) {
          await db.runQuery(
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

        // Build a mapping from any provider identifier the backend may use
        // to the canonical provider UUID (`provider.id`). Backend sometimes
        // sends `provider.provider_id` (legacy string) in category/channel
        // records; normalize those to the provider `id` so DB relationships
        // remain consistent.
        const providerMap: Record<string, string> = {};
        for (const p of providers) {
          if (p.id) providerMap[p.id] = p.id;
          if (p.provider_id) providerMap[p.provider_id] = p.id;
        }

        // Insert categories (normalize provider_id -> provider UUID)
        for (const category of categories) {
          const normalizedProviderId = providerMap[category.provider_id] || category.provider_id;
          await db.runQuery(
            `INSERT OR REPLACE INTO categories (
              id, user_id, provider_id, category_id, name, type, content_type,
              censored, is_enabled, sort_order, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              category.id,
              category.user_id,
              normalizedProviderId,
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

        // Insert channels (normalize any provider references if present on channel)
        for (const channel of channels) {
          // channel.category_id in backend is likely the category.category_id or category.id
          await db.runQuery(
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

        // Insert watch progress (normalize provider_id)
        for (const prog of progress) {
          const normalizedProgProvider = providerMap[prog.provider_id] || prog.provider_id;
          await db.runQuery(
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
              normalizedProgProvider,
              prog.current_position,
              prog.duration,
              prog.last_watched_at,
              prog.created_at,
              prog.updated_at,
            ]
          );
        }

        await db.commit();

        // After committing, normalize any existing rows that may still
        // reference legacy provider identifiers (provider.provider_id)
        // and replace them with the canonical provider UUID (providers.id).
        // This fixes cases where older rows were inserted before we added
        // normalization logic.
        try {
          await CategoryRepository.normalizeExistingProviderIds();
        } catch (err) {
          console.warn('Normalization of existing provider_ids failed:', err);
        }

        // Update last sync time
        await AsyncStorage.setItem(LAST_SYNC_KEY, Date.now().toString());

        console.log(`✅ Sync complete: ${providers.length} providers, ${categories.length} categories, ${channels.length} channels`);
        return true;
      } catch (error) {
        await db.rollback();
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

  /**
   * Normalize existing DB rows that reference legacy provider identifiers.
   * Some older records may have `provider_id` set to the backend's legacy
   * `provider.provider_id` string. If a provider row exists that maps that
   * legacy string to the canonical UUID, update the referencing rows.
   */
  static async normalizeExistingProviderIds(): Promise<void> {
    try {
      const db = await Database.getDatabase();
      // Read all providers and build mapping of legacy -> canonical id
      const providersRows: any[] = await db.getAllRows<any>(`SELECT id, provider_id FROM providers`);
      const mapping: Array<{ legacy: string; id: string }> = [];
      for (const p of providersRows) {
        if (p.provider_id && p.id) {
          mapping.push({ legacy: p.provider_id, id: p.id });
        }
      }

      // For each mapping, update categories and watch_progress rows that reference the legacy id
      for (const m of mapping) {
        try {
          await db.runQuery(`UPDATE categories SET provider_id = ? WHERE provider_id = ?`, [m.id, m.legacy]);
          await db.runQuery(`UPDATE watch_progress SET provider_id = ? WHERE provider_id = ?`, [m.id, m.legacy]);
        } catch (err) {
          console.warn('Normalization update failed for', m, err);
        }
      }

      // Log distinct provider ids remaining in categories for diagnostic purposes
      const allCats: any[] = await db.getAllRows<any>(`SELECT * FROM categories`);
      const distinct = Array.from(new Set(allCats.map(r => r.provider_id).filter(Boolean)));
      console.log(`🔧 [normalizeExistingProviderIds] Distinct provider_ids after normalization (${distinct.length}):`, distinct.slice(0, 20));
    } catch (error) {
      console.error('Failed to normalize existing provider_ids:', error);
      throw error;
    }
  }

  /**
   * Ensure provider normalization has run once. Uses a flag in AsyncStorage
   * to avoid repeating work on every query. If normalization has not run,
   * run it and set the flag.
   */
  static async ensureProviderNormalization(): Promise<void> {
    try {
      const done = await AsyncStorage.getItem(NORMALIZATION_FLAG);
      if (done === '1') return;
      await CategoryRepository.normalizeExistingProviderIds();
      await AsyncStorage.setItem(NORMALIZATION_FLAG, '1');
      console.log('🔧 [ensureProviderNormalization] Normalization completed and flag set');
    } catch (err) {
      console.warn('🔧 [ensureProviderNormalization] Normalization failed:', err);
    }
  }
}
