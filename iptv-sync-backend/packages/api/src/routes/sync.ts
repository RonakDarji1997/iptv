import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import axios from 'axios';
import * as crypto from 'crypto';
import { authMiddleware } from '../middleware/auth';

export const createSyncRouter = (pool: Pool) => {
  const router = Router();
  
  // POST /api/sync/providers - Sync provider data
  router.post('/providers', authMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId; // From auth middleware
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
        // Normalize type to lowercase
        const normalizedType = type.toLowerCase();
        
        // Insert or update provider
        const result = await client.query(
          `INSERT INTO providers (
            id, provider_id, user_id, name, type, server_url,
            mac_address, serial_number, token,
            is_active, is_configured, created_at, updated_at
          )
          VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
          ON CONFLICT (user_id, provider_id) 
          DO UPDATE SET 
            name = EXCLUDED.name,
            type = EXCLUDED.type,
            server_url = EXCLUDED.server_url,
            mac_address = EXCLUDED.mac_address,
            serial_number = EXCLUDED.serial_number,
            token = EXCLUDED.token,
            is_active = EXCLUDED.is_active,
            is_configured = EXCLUDED.is_configured,
            updated_at = NOW()
          RETURNING *`,
          [
            provider_id,              // $1 - provider_id
            userId,                   // $2 - user_id
            name,                     // $3 - name
            normalizedType,           // $4 - type (lowercase)
            server_url,               // $5 - server_url
            mac_address || null,      // $6 - mac_address
            serial_number || null,    // $7 - serial_number
            token || null,            // $8 - token
            is_active !== false,      // $9 - is_active
            is_configured !== false   // $10 - is_configured
          ]
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
  
  // GET /api/sync/providers - Get all providers for user
  router.get('/providers', authMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId; // From auth middleware
      
      const result = await pool.query(
        `SELECT 
          p.id as provider_db_id,
          p.provider_id,
          p.name,
          p.type,
          p.server_url,
          p.mac_address,
          p.serial_number,
          p.username,
          p.password,
          p.is_active,
          p.is_configured,
          p.created_at,
          p.updated_at
        FROM providers p
        WHERE p.user_id = $1
        ORDER BY p.created_at DESC`,
        [userId]
      );
      
      console.log(`📦 Fetched ${result.rows.length} providers for user ${userId}`);
      
      res.json({ 
        success: true,
        providers: result.rows 
      });
      
    } catch (error) {
      console.error('❌ Get providers error:', error);
      res.status(500).json({ error: 'Failed to get providers', details: (error as Error).message });
    }
  });
  
  // POST /api/sync/categories - Sync categories for a provider
  router.post('/categories', authMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId; // From auth middleware
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
          // Normalize type to uppercase so partial unique indexes (LIVE/MOVIE/SERIES) match
          cat.type = (cat.type || '').toUpperCase();
          await client.query(
            `INSERT INTO categories (
              category_id, external_id, user_id, provider_id, name, type, content_type, 
              censored, is_enabled, sort_order
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (user_id, provider_id, category_id, type) 
            DO UPDATE SET 
              external_id = EXCLUDED.external_id,
              name = EXCLUDED.name,
              content_type = EXCLUDED.content_type,
              censored = EXCLUDED.censored,
              is_enabled = EXCLUDED.is_enabled,
              sort_order = EXCLUDED.sort_order,
              updated_at = NOW()`,
            [cat.category_id, cat.external_id, userId, providerUuid, cat.name, cat.type, cat.content_type,
             cat.censored || 0, cat.is_enabled !== false, cat.sort_order || 0]
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
      const userId = (req as any).userId; // From auth middleware
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
      const userId = (req as any).userId; // From auth middleware
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
      const userId = (req as any).userId; // From auth middleware
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
      const userId = (req as any).userId; // From auth middleware

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

  // POST /api/sync/full-sync/:providerId - Complete sync for a Stalker provider
  router.post('/full-sync/:providerId', authMiddleware, async (req: Request, res: Response) => {
    const userId = (req as any).userId;
    const { providerId } = req.params;
    
    console.log(`\n🔄 Starting full sync for provider: ${providerId}`);
    
    const client = await pool.connect();
    
    try {
      // Get provider details
      const providerResult = await client.query(
        'SELECT * FROM providers WHERE id = $1 AND user_id = $2',
        [providerId, userId]
      );
      
      if (providerResult.rows.length === 0) {
        return res.status(404).json({ error: 'Provider not found' });
      }
      
      const provider = providerResult.rows[0];
      
      if (provider.type !== 'stalker') {
        return res.status(400).json({ error: 'Only Stalker providers supported' });
      }
      
      const { server_url, mac_address, token } = provider;
      
      if (!server_url || !mac_address || !token) {
        return res.status(400).json({ error: 'Provider missing required credentials' });
      }
      
      console.log(`📋 Provider: ${provider.name} - ${server_url}`);
      
      // Build correct Stalker portal URL
      let baseUrl = server_url;
      if (!baseUrl.includes('/stalker_portal') && !baseUrl.includes('/server/load.php')) {
        baseUrl = `${baseUrl}/stalker_portal`;
      }
      const url = `${baseUrl}/server/load.php`;
      
      console.log(`🔗 Using URL: ${url}`);
      
      const headers = {
        'Cookie': `mac=${mac_address}; timezone=America/Toronto`,
        'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
        'Authorization': `Bearer ${token}`,
      };
      
      // Step 1: Fetch Live TV genres
      console.log('\n📺 Step 1: Fetching Live TV genres...');
      const liveResponse = await axios.get(url, {
        params: { type: 'itv', action: 'get_genres', JsHttpRequest: '1-xml' },
        headers,
        timeout: 15000,
      });
      
      const liveGenres = (liveResponse.data.js || []).filter((g: any) => g.id !== '*' && g.id !== 'dvb');
      console.log(`✅ Fetched ${liveGenres.length} Live TV genres`);
      
      // Step 2: Fetch VOD categories
      console.log('\n🎬 Step 2: Fetching VOD categories...');
      const vodResponse = await axios.get(url, {
        params: { type: 'vod', action: 'get_categories', JsHttpRequest: '1-xml' },
        headers,
        timeout: 15000,
      });
      
      const vodCategories = (vodResponse.data.js || []).filter((c: any) => c.id !== '*');
      console.log(`✅ Fetched ${vodCategories.length} VOD categories`);
      
      // Step 3: Process and save categories
      console.log('\n💾 Step 3: Processing categories...');
      await client.query('BEGIN');
      
      const allCategories = [];
      let savedCategoryCount = 0;
      let skippedCategoryCount = 0;
      
      // Get existing Live TV categories to skip duplicates
      const existingLiveResult = await client.query(
        `SELECT category_id FROM categories 
         WHERE user_id = $1 AND provider_id = $2 AND type = 'LIVE'`,
        [userId, providerId]
      );
      const existingLiveIds = new Set(existingLiveResult.rows.map(r => r.category_id));
      
      // Save Live TV genres (skip if already exists)
      for (const genre of liveGenres) {
        if (existingLiveIds.has(genre.id)) {
          console.log(`  ⏭️  ${genre.title} (LIVE) - already exists, skipping`);
          skippedCategoryCount++;
          allCategories.push({
            id: genre.id,
            name: genre.title,
            type: 'LIVE',
            contentType: 'LIVE'
          });
          continue;
        }
        
        await client.query(
          `INSERT INTO categories (
            category_id, user_id, provider_id, name, type, content_type, 
            censored, is_enabled, sort_order, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
          [genre.id, userId, providerId, genre.title, 'LIVE', 'LIVE',
           genre.censored || 0, true, parseInt(genre.number || '0', 10)]
        );
        
        console.log(`  ✅ ${genre.title} (LIVE) - added`);
        allCategories.push({
          id: genre.id,
          name: genre.title,
          type: 'LIVE',
          contentType: 'LIVE'
        });
        savedCategoryCount++;
      }
      
      // Get existing VOD categories to check for duplicates
      const existingVodResult = await client.query(
        `SELECT category_id, type FROM categories 
         WHERE user_id = $1 AND provider_id = $2 AND type IN ('MOVIE', 'SERIES')`,
        [userId, providerId]
      );
      const existingVodMap = new Map();
      existingVodResult.rows.forEach(row => {
        existingVodMap.set(`${row.category_id}-${row.type}`, true);
      });
      
      // Filter out categories that need processing (not in DB yet)
      const categoriesToDetect = vodCategories.filter(category => {
        // Check if this category exists with either MOVIE or SERIES type
        const existsAsMovie = existingVodMap.has(`${category.id}-MOVIE`);
        const existsAsSeries = existingVodMap.has(`${category.id}-SERIES`);
        
        if (existsAsMovie || existsAsSeries) {
          const existingType = existsAsMovie ? 'MOVIE' : 'SERIES';
          console.log(`  ⏭️  ${category.title} (${existingType}) - already exists, skipping`);
          skippedCategoryCount++;
          
          allCategories.push({
            id: category.id,
            name: category.title,
            type: existingType,
            contentType: 'VOD'
          });
          return false; // Skip this category
        }
        return true; // Process this category
      });
      
      console.log(`📊 Need to detect type for ${categoriesToDetect.length} new categories (${vodCategories.length - categoriesToDetect.length} already exist)`);
      
      // Sample and save VOD categories with movie/series detection
      // Process in parallel batches for faster sync
      const BATCH_SIZE = 10;
      const categoriesToProcess = [];
      
      // Detect types in parallel batches (only for new categories)
      for (let i = 0; i < categoriesToDetect.length; i += BATCH_SIZE) {
        const batch = categoriesToDetect.slice(i, i + BATCH_SIZE);
        
        const batchResults = await Promise.allSettled(
          batch.map(async (category) => {
            try {
              const sampleResponse = await axios.get(url, {
                params: {
                  type: 'vod',
                  action: 'get_ordered_list',
                  category: category.id,
                  sortby: '',
                  p: 1,
                  JsHttpRequest: '1-xml'
                },
                headers,
                timeout: 10000,
              });

              const items = sampleResponse.data.js?.data || [];
              const hasSeries = items.slice(0, 3).some((item: any) => {
                const isSeries = item.is_series;
                return isSeries === '1' || isSeries === 1;
              });

              const type = hasSeries ? 'SERIES' : 'MOVIE';
              console.log(`  ✓ ${category.title} → ${type}`);
              
              return { category, type, success: true };
            } catch (err) {
              console.error(`  ✗ Failed to detect type for ${category.title}, defaulting to MOVIE`);
              return { category, type: 'MOVIE', success: false };
            }
          })
        );
        
        // Collect results
        batchResults.forEach((result) => {
          if (result.status === 'fulfilled') {
            categoriesToProcess.push(result.value);
          }
        });
      }
      
      // Batch insert all new categories
      for (const { category, type } of categoriesToProcess) {
        await client.query(
          `INSERT INTO categories (
            category_id, user_id, provider_id, name, type, content_type, 
            censored, is_enabled, sort_order, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
          [category.id, userId, providerId, category.title, type, 'VOD',
           category.censored || 0, true, 0]
        );
        
        allCategories.push({
          id: category.id,
          name: category.title,
          type: type,
          contentType: 'VOD'
        });
        savedCategoryCount++;
      }
      
      await client.query('COMMIT');
      console.log(`\n📊 Sync Summary:`);
      console.log(`   ✅ Added: ${savedCategoryCount} new categories`);
      console.log(`   ⏭️  Skipped: ${skippedCategoryCount} existing categories`);
      console.log(`   📦 Total: ${savedCategoryCount + skippedCategoryCount} categories`);
      
      // Update provider sync status
      await client.query(
        'UPDATE providers SET synced_at = NOW(), updated_at = NOW() WHERE id = $1',
        [providerId]
      );
      
      console.log('\n🎉 Category sync completed successfully!');
      console.log(`   Total categories: ${savedCategoryCount}`);
      console.log(`   - Live TV: ${allCategories.filter(c => c.contentType === 'LIVE').length}`);
      console.log(`   - Movies: ${allCategories.filter(c => c.type === 'MOVIE').length}`);
      console.log(`   - Series: ${allCategories.filter(c => c.type === 'SERIES').length}`);
      
      res.json({
        success: true,
        stats: {
          categories: savedCategoryCount,
          live: allCategories.filter(c => c.contentType === 'LIVE').length,
          movies: allCategories.filter(c => c.type === 'MOVIE').length,
          series: allCategories.filter(c => c.type === 'SERIES').length
        }
      });
      
    } catch (error: any) {
      await client.query('ROLLBACK');
      console.error('❌ Full sync error:', error.message);
      res.status(500).json({ 
        error: 'Full sync failed', 
        details: error.message 
      });
    } finally {
      client.release();
    }
  });

  // POST /api/sync/pull-xtream - Pull data from Xtreme Codes provider
  router.post('/pull-xtream', authMiddleware, async (req: Request, res: Response) => {
    const client = await pool.connect();
    
    try {
      const userId = (req as any).userId;
      console.log('\n🔄 [XTREAM SYNC] Starting Xtreme Codes sync for user:', userId);

      // Get Xtreme Codes provider for this user
      const providerResult = await client.query(
        'SELECT * FROM providers WHERE user_id = $1 AND type = $2 AND is_active = true LIMIT 1',
        [userId, 'xtream']
      );

      if (providerResult.rows.length === 0) {
        return res.status(404).json({ error: 'No active Xtreme Codes provider found' });
      }

      const provider = providerResult.rows[0];

      if (!provider.server_url || !provider.username || !provider.password) {
        return res.status(400).json({ error: 'Provider configuration incomplete' });
      }

      const baseUrl = provider.server_url.replace(/\/player_api\.php.*$/, '');
      const apiUrl = `${baseUrl}/player_api.php`;

      console.log('📡 [XTREAM SYNC] Fetching categories from:', apiUrl);

      // Fetch all data from Xtreme Codes API
      const [liveResponse, vodResponse, seriesResponse] = await Promise.all([
        axios.get(`${apiUrl}?username=${provider.username}&password=${provider.password}&action=get_live_categories`).catch(() => ({ data: [] })),
        axios.get(`${apiUrl}?username=${provider.username}&password=${provider.password}&action=get_vod_categories`).catch(() => ({ data: [] })),
        axios.get(`${apiUrl}?username=${provider.username}&password=${provider.password}&action=get_series_categories`).catch(() => ({ data: [] }))
      ]);

      await client.query('BEGIN');

      let totalCategories = 0;

      // Process live TV categories
      const liveCategories = Array.isArray(liveResponse.data) ? liveResponse.data : [];
      for (const category of liveCategories) {
        await client.query(
          `INSERT INTO categories (user_id, provider_id, category_id, external_id, name, type, content_type, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (user_id, provider_id, category_id) 
           DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()`,
          [userId, provider.id, `live_${category.category_id}`, category.category_id, category.category_name, 'LIVE', 'LIVE', category.category_id]
        );
        totalCategories++;
      }

      // Process VOD categories
      const vodCategories = Array.isArray(vodResponse.data) ? vodResponse.data : [];
      for (const category of vodCategories) {
        await client.query(
          `INSERT INTO categories (user_id, provider_id, category_id, external_id, name, type, content_type, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (user_id, provider_id, category_id) 
           DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()`,
          [userId, provider.id, `vod_${category.category_id}`, category.category_id, category.category_name, 'MOVIE', 'MOVIE', category.category_id]
        );
        totalCategories++;
      }

      // Process series categories
      const seriesCategories = Array.isArray(seriesResponse.data) ? seriesResponse.data : [];
      for (const category of seriesCategories) {
        await client.query(
          `INSERT INTO categories (user_id, provider_id, category_id, external_id, name, type, content_type, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (user_id, provider_id, category_id) 
           DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()`,
          [userId, provider.id, `series_${category.category_id}`, category.category_id, category.category_name, 'SERIES', 'SERIES', category.category_id]
        );
        totalCategories++;
      }

      await client.query('COMMIT');

      // Update provider sync timestamp
      await client.query(
        'UPDATE providers SET synced_at = NOW(), updated_at = NOW() WHERE id = $1',
        [provider.id]
      );

      console.log(`✅ [XTREAM SYNC] Synced ${totalCategories} categories`);
      console.log(`   - Live TV: ${liveCategories.length}`);
      console.log(`   - Movies: ${vodCategories.length}`);
      console.log(`   - Series: ${seriesCategories.length}`);

      res.json({
        success: true,
        stats: {
          categories: totalCategories,
          live: liveCategories.length,
          movies: vodCategories.length,
          series: seriesCategories.length
        }
      });

    } catch (error: any) {
      await client.query('ROLLBACK');
      console.error('❌ [XTREAM SYNC] Error:', error.message);
      res.status(500).json({ error: 'Xtreme Codes sync failed', details: error.message });
    } finally {
      client.release();
    }
  });
  
  return router;
};
