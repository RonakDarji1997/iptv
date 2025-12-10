import { Database } from '../database/Database';
import { Channel } from '../types';
import { StalkerSyncService } from '../services/StalkerSyncService';

export class ChannelRepository {
  /**
   * Get channels by category from local database
   * Syncs from portal if channels don't exist locally
   */
  static async getChannelsByCategory(categoryId: string): Promise<Channel[]> {
    try {
      const db = await Database.getDatabase();
      
      // First get the internal category UUID from category_id
      const categoryResult = await db.getAllRows<{ id: string }>(`
        SELECT id FROM categories WHERE category_id = ? AND content_type = 'live' LIMIT 1
      `, [categoryId]);

      if (categoryResult.length === 0) {
        console.warn(`Category ${categoryId} not found in database`);
        return [];
      }

      const categoryUuid = categoryResult[0].id;

      // Check if we have channels for this category
      const countResult = await db.getAllRows<{ count: number }>(`
        SELECT COUNT(*) as count FROM channels WHERE category_id = ?
      `, [categoryUuid]);

      const hasChannels = countResult[0].count > 0;

      // If no channels, sync from portal
      if (!hasChannels) {
        console.log(`📡 No channels cached, syncing category ${categoryId} from portal...`);
        await StalkerSyncService.syncChannelsForCategory(categoryId);
      }

      // Get channels for this category
      const result = await db.getAllRows<{
        channel_id: string;
        name: string;
        url: string;
        logo: string;
        number: number;
        is_active: number;
      }>(`
        SELECT channel_id, name, url, logo, number, is_active
        FROM channels 
        WHERE category_id = ? AND is_active = 1
        ORDER BY number ASC, name ASC
      `, [categoryUuid]);

      return result.map(row => ({
        id: row.channel_id,
        name: row.name,
        number: row.number.toString(),
        logo: row.logo,
        logoUrl: row.logo,
        streamUrl: row.url,
        url: row.url,
        cmd: row.url,
        isActive: row.is_active === 1,
      }));
    } catch (error) {
      console.error('Failed to get channels from DB:', error);
      throw error;
    }
  }

  /**
   * Get all enabled channels
   */
  static async getAllChannels(): Promise<Channel[]> {
    try {
      const db = await Database.getDatabase();
      const result = await db.getAllRows<{
        channel_id: string;
        name: string;
        url: string;
        logo: string;
        number: number;
        is_active: number;
      }>(`
        SELECT channel_id, name, url, logo, number, is_active
        FROM channels 
        WHERE is_active = 1
        ORDER BY number ASC, name ASC
      `);

      return result.map(row => ({
        id: row.channel_id,
        name: row.name,
        number: row.number.toString(),
        logo: row.logo,
        logoUrl: row.logo,
        streamUrl: row.url,
        url: row.url,
        cmd: row.url,
        isActive: row.is_active === 1,
      }));
    } catch (error) {
      console.error('Failed to get all channels from DB:', error);
      throw error;
    }
  }

  /**
   * Search channels by name
   */
  static async searchChannels(query: string): Promise<Channel[]> {
    try {
      const db = await Database.getDatabase();
      const result = await db.getAllRows<{
        channel_id: string;
        name: string;
        url: string;
        logo: string;
        number: number;
        is_active: number;
      }>(`
        SELECT channel_id, name, url, logo, number, is_active
        FROM channels 
        WHERE is_active = 1 AND name LIKE ?
        ORDER BY name ASC
        LIMIT 50
      `, [`%${query}%`]);

      return result.map(row => ({
        id: row.channel_id,
        name: row.name,
        number: row.number.toString(),
        logo: row.logo,
        logoUrl: row.logo,
        streamUrl: row.url,
        url: row.url,
        cmd: row.url,
        isActive: row.is_active === 1,
      }));
    } catch (error) {
      console.error('Failed to search channels:', error);
      throw error;
    }
  }
}
