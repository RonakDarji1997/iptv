import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { authMiddleware } from '../middleware/auth';

const router = Router();

export const createSyncRouter = (pool: Pool) => {
  
  // POST /api/sync/providers - Sync provider data
  router.post('/providers', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { userId } = (req as any).user;
      const { 
        provider_id,
        name,
        type,
        server_url,
        username,
        password,
        mac_address,
        serial_number,
        token,
        configuration,
        is_active,
        is_configured,
        include_tv,
        include_vod,
        adult_password
      } = req.body;
      
      if (!provider_id || !name || !type) {
        return res.status(400).json({ 
          error: 'provider_id, name, and type are required' 
        });
      }

      const client = await pool.connect();
      
      try {
        // Insert or update provider using provider_id (not UUID id)
        const result = await client.query(
          `INSERT INTO providers (
            provider_id, user_id, name, type, server_url, username, password, 
            mac_address, serial_number, token, configuration,
            is_active, is_configured, include_tv, include_vod, adult_password
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          ON CONFLICT (user_id, provider_id) 
          DO UPDATE SET 
            name = EXCLUDED.name,
            type = EXCLUDED.type,
            server_url = EXCLUDED.server_url,
            username = EXCLUDED.username,
            password = EXCLUDED.password,
            mac_address = EXCLUDED.mac_address,
            serial_number = EXCLUDED.serial_number,
            token = EXCLUDED.token,
            configuration = EXCLUDED.configuration,
            is_active = EXCLUDED.is_active,
            is_configured = EXCLUDED.is_configured,
            include_tv = EXCLUDED.include_tv,
            include_vod = EXCLUDED.include_vod,
            adult_password = EXCLUDED.adult_password,
            updated_at = NOW()
          RETURNING *`,
          [provider_id, userId, name, type, server_url, 
           username, password, mac_address, serial_number, token,
           configuration, is_active !== false, is_configured !== false,
           include_tv !== false, include_vod !== false, adult_password]
        );
        
        console.log(`✅ Provider synced: ${name} (${type}) - ID: ${provider_id}`);
        
        res.json({ 
          success: true, 
          provider: result.rows[0] 
        });
        
      } finally {
        client.release();
      }
      
    } catch (error) {
      console.error('❌ Provider sync error:', error);
      res.status(500).json({ error: 'Provider sync failed', details: (error as Error).message });
    }
  });
  
  // POST /api/sync/categories - Sync categories for a provider
  router.post('/categories', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { userId } = (req as any).user;
      const { provider_id, categories } = req.body;
      
      if (!provider_id || !Array.isArray(categories)) {
        return res.status(400).json({ 
          error: 'provider_id and categories array required' 
        });
      }

      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        
        // Get provider UUID from provider_id
        const providerCheck = await client.query(
          'SELECT id FROM providers WHERE provider_id = $1 AND user_id = $2',
          [provider_id, userId]
        );
        
        if (providerCheck.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(403).json({ error: 'Provider not found' });
        }
        
        const providerUuid = providerCheck.rows[0].id;
        let syncedCount = 0;
        
        // Sync each category
        for (const cat of categories) {
          await client.query(
            `INSERT INTO categories (
              category_id, user_id, provider_id, name, type, content_type, 
              censored, is_enabled, sort_order
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (user_id, provider_id, category_id) 
            DO UPDATE SET 
              name = EXCLUDED.name,
              type = EXCLUDED.type,
              content_type = EXCLUDED.content_type,
              censored = EXCLUDED.censored,
              is_enabled = EXCLUDED.is_enabled,
              sort_order = EXCLUDED.sort_order,
              updated_at = NOW()`,
            [cat.id, userId, providerUuid, cat.name, cat.type, cat.contentType,
             cat.censored || 0, cat.isEnabled !== false, cat.sortOrder || 0]
          );
          syncedCount++;
        }
        
        await client.query('COMMIT');
        
        console.log(`✅ Synced ${syncedCount} categories for provider ${provider_id}`);
        
        res.json({ 
          success: true, 
          syncedCount 
        });
        
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      
    } catch (error) {
      console.error('❌ Category sync error:', error);
      res.status(500).json({ error: 'Category sync failed', details: (error as Error).message });
    }
  });
  
  // POST /api/sync/channels - Sync channels for categories
  router.post('/channels', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { userId } = (req as any).user;
      const { provider_id, channels } = req.body;
      
      if (!provider_id || !Array.isArray(channels)) {
        return res.status(400).json({ 
          error: 'provider_id and channels array required' 
        });
      }

      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        
        // Get provider UUID from provider_id
        const providerCheck = await client.query(
          'SELECT id FROM providers WHERE provider_id = $1 AND user_id = $2',
          [provider_id, userId]
        );
        
        if (providerCheck.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(403).json({ error: 'Provider not found' });
        }
        
        let syncedCount = 0;
        
        // Sync each channel
        for (const ch of channels) {
          // Get category UUID from category_id
          const categoryCheck = await client.query(
            'SELECT id FROM categories WHERE category_id = $1 AND user_id = $2',
            [ch.categoryId, userId]
          );
          
          if (categoryCheck.rows.length === 0) {
            console.warn(`⚠️ Category ${ch.categoryId} not found for channel ${ch.name}`);
            continue;
          }
          
          const categoryUuid = categoryCheck.rows[0].id;
          
          await client.query(
            `INSERT INTO channels (
              channel_id, user_id, category_id, name, url, cmd, logo, 
              number, is_active, external_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (user_id, category_id, channel_id) 
            DO UPDATE SET 
              name = EXCLUDED.name,
              url = EXCLUDED.url,
              cmd = EXCLUDED.cmd,
              logo = EXCLUDED.logo,
              number = EXCLUDED.number,
              is_active = EXCLUDED.is_active,
              updated_at = NOW()`,
            [ch.id, userId, categoryUuid, ch.name, ch.url || ch.streamUrl, 
             ch.cmd, ch.logo || ch.logoUrl, ch.number, 
             ch.isActive !== false, ch.externalId]
          );
          syncedCount++;
        }
        
        await client.query('COMMIT');
        
        console.log(`✅ Synced ${syncedCount} channels for provider ${provider_id}`);
        
        res.json({ 
          success: true, 
          syncedCount 
        });
        
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      
    } catch (error) {
      console.error('❌ Channel sync error:', error);
      res.status(500).json({ error: 'Channel sync failed', details: (error as Error).message });
    }
  });
  
  // POST /api/sync/settings - Sync user settings
  router.post('/settings', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { userId } = (req as any).user;
      const { settings } = req.body;
      
      if (!settings || typeof settings !== 'object') {
        return res.status(400).json({ 
          error: 'Settings object required' 
        });
      }

      const client = await pool.connect();
      
      try {
        // Store settings as JSONB
        await client.query(
          `INSERT INTO settings (user_id, settings_data)
           VALUES ($1, $2)
           ON CONFLICT (user_id) 
           DO UPDATE SET settings_data = EXCLUDED.settings_data, updated_at = NOW()`,
          [userId, JSON.stringify(settings)]
        );
        
        console.log(`✅ Synced ${Object.keys(settings).length} settings`);
        
        res.json({ success: true });
        
      } finally {
        client.release();
      }
      
    } catch (error) {
      console.error('❌ Settings sync error:', error);
      res.status(500).json({ error: 'Settings sync failed' });
    }
  });
  
  // POST /api/sync/progress - Sync watch progress
  router.post('/progress', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { userId } = (req as any).user;
      const { 
        contentId, 
        contentType, 
        providerId,
        contentName,
        position, 
        duration,
        completed 
      } = req.body;
      
      if (!contentId || !contentType) {
        return res.status(400).json({ 
          error: 'Content ID and type required' 
        });
      }

      const client = await pool.connect();
      
      try {
        // Get provider UUID if provided
        let providerUuid = null;
        if (providerId) {
          const providerCheck = await client.query(
            'SELECT id FROM providers WHERE provider_id = $1 AND user_id = $2',
            [providerId, userId]
          );
          if (providerCheck.rows.length > 0) {
            providerUuid = providerCheck.rows[0].id;
          }
        }
        
        await client.query(
          `INSERT INTO watch_progress (
            user_id, content_id, content_type, content_name, provider_id,
            current_position, duration
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (user_id, content_id, content_type) 
          DO UPDATE SET 
            current_position = EXCLUDED.current_position,
            duration = EXCLUDED.duration,
            content_name = EXCLUDED.content_name,
            provider_id = EXCLUDED.provider_id,
            updated_at = NOW(),
            last_watched_at = NOW()`,
          [userId, contentId, contentType, contentName, providerUuid, 
           position || 0, duration || 0]
        );
        
        console.log(`✅ Synced progress for ${contentType}: ${contentId}`);
        
        res.json({ success: true });
        
      } finally {
        client.release();
      }
      
    } catch (error) {
      console.error('❌ Progress sync error:', error);
      res.status(500).json({ error: 'Progress sync failed' });
    }
  });
  
  // GET /api/sync/pull - Pull all data for user
  router.get('/pull', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { userId } = (req as any).user;

      const client = await pool.connect();
      
      try {
        // Get all providers
        const providers = await client.query(
          'SELECT * FROM providers WHERE user_id = $1 ORDER BY created_at',
          [userId]
        );
        
        // Get all categories
        const categories = await client.query(
          `SELECT c.* FROM categories c
           JOIN providers p ON c.provider_id = p.id
           WHERE c.user_id = $1
           ORDER BY c.sort_order`,
          [userId]
        );
        
        // Get all channels
        const channels = await client.query(
          `SELECT ch.* FROM channels ch
           JOIN categories c ON ch.category_id = c.id
           WHERE ch.user_id = $1
           ORDER BY ch.name`,
          [userId]
        );
        
        // Get settings
        const settings = await client.query(
          'SELECT settings_data FROM settings WHERE user_id = $1',
          [userId]
        );
        
        // Get watch progress
        const progress = await client.query(
          'SELECT * FROM watch_progress WHERE user_id = $1 ORDER BY last_watched_at DESC LIMIT 100',
          [userId]
        );
        
        const settingsObj: any = settings.rows.length > 0 ? settings.rows[0].settings_data : {};
        
        console.log(`✅ Pulled data for user: ${providers.rows.length} providers, ${categories.rows.length} categories, ${channels.rows.length} channels`);
        
        res.json({
          success: true,
          data: {
            providers: providers.rows,
            categories: categories.rows,
            channels: channels.rows,
            settings: settingsObj,
            progress: progress.rows
          }
        });
        
      } finally {
        client.release();
      }
      
    } catch (error) {
      console.error('❌ Pull sync error:', error);
      res.status(500).json({ error: 'Pull sync failed' });
    }
  });
  
  return router;
};
