import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import axios from 'axios';
import * as crypto from 'crypto';

// Stalker Portal Proxy - Forwards requests to Stalker portal with proper headers
export const createStalkerProxyRouter = (pool: Pool) => {
  const router = Router();
  
  // GET /api/stalker-proxy/categories - Get live and VOD categories
  router.get('/categories', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId; // From auth middleware
      
      console.log('🔍 Proxy /categories - User ID:', userId);
      
      // Get user's active provider
      const providerResult = await pool.query(
        'SELECT * FROM providers WHERE user_id = $1 AND is_active = true LIMIT 1',
        [userId]
      );
      
      console.log('🔍 Provider query result:', providerResult.rows.length, 'providers found');
      
      if (providerResult.rows.length === 0) {
        return res.status(404).json({ error: 'No active provider found' });
      }
      
      const provider = providerResult.rows[0];
      
      // Make requests to Stalker portal with proper headers
      const headers = {
        'Cookie': `mac=${provider.mac_address}; timezone=America/Toronto; adid=06c140f97c839eaaa4faef4cc08a5722`,
        'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
        'X-User-Agent': 'Model: MAG270; Link: WiFi',
        'Authorization': `Bearer ${provider.token}`,
      };
      
      const baseUrl = `${provider.server_url}/stalker_portal/server/load.php`;
      
      // Fetch category counts from portal to validate cache
      const [liveCountResponse, vodCountResponse] = await Promise.all([
        axios.get(`${baseUrl}?type=itv&action=get_genres&JsHttpRequest=1-xml`, { headers, timeout: 10000 }),
        axios.get(`${baseUrl}?type=vod&action=get_categories&JsHttpRequest=1-xml`, { headers, timeout: 10000 }),
      ]);
      
      const portalLiveCount = (liveCountResponse.data.js || []).filter((c: any) => c.id !== '*').length;
      const portalVodCount = (vodCountResponse.data.js || []).filter((c: any) => c.id !== '*').length;
      const portalTotalCount = portalLiveCount + portalVodCount;
      
      // Check if we have cached categories (less than 24 hours old)
      const cacheResult = await pool.query(
        `SELECT COUNT(*) as count, MAX(updated_at) as last_update 
         FROM categories WHERE user_id = $1 AND provider_id = $2`,
        [userId, provider.id]
      );
      
      const cachedCount = parseInt(cacheResult.rows[0].count);
      const cacheAge = cacheResult.rows[0].last_update 
        ? Date.now() - new Date(cacheResult.rows[0].last_update).getTime()
        : null;
      const hasCache = cachedCount > 0;
      const cacheValid = cacheAge && cacheAge < 24 * 60 * 60 * 1000; // 24 hours
      const cacheComplete = cachedCount >= portalTotalCount;
      
      let liveCategories: any[];
      let movieCategories: any[];
      let seriesCategories: any[];
      
      if (hasCache && cacheValid && cacheComplete) {
        // Return cached categories
        console.log(`✅ Using cached categories (${cachedCount}/${portalTotalCount}, age: ${Math.round(cacheAge! / 1000 / 60)} minutes)`);
        
        const categoriesResult = await pool.query(
          `SELECT category_id as id, name as title, type, content_type, censored 
           FROM categories WHERE user_id = $1 AND provider_id = $2 AND is_enabled = true
           ORDER BY sort_order, name`,
          [userId, provider.id]
        );
        
        liveCategories = categoriesResult.rows.filter(c => c.type === 'LIVE');
        movieCategories = categoriesResult.rows.filter(c => c.type === 'MOVIE');
        seriesCategories = categoriesResult.rows.filter(c => c.type === 'SERIES');
      } else {
        // Fetch from Stalker portal
        if (hasCache && !cacheComplete) {
          console.log(`🔄 Cache incomplete (${cachedCount}/${portalTotalCount}), re-analyzing...`);
        } else {
          console.log('🔄 Fetching fresh categories from Stalker portal...');
        }
        
        // Use the data we already fetched for validation
        liveCategories = liveCountResponse.data.js || [];
        const vodCategories = vodCountResponse.data.js || [];
        
        // Analyze VOD categories by fetching p=1 and checking is_series field
        console.log(`🔍 Analyzing ${vodCategories.length} VOD categories...`);
        movieCategories = [];
        seriesCategories = [];
        
        const filteredVod = vodCategories.filter((c: any) => c.id !== '*');
        
        // Process all categories in parallel for speed
        const analysisPromises = filteredVod.map(async (cat: any) => {
          try {
            const itemsUrl = `${baseUrl}?type=vod&action=get_ordered_list&category=${cat.id}&page=1&p=1&sortby=added&JsHttpRequest=1-xml`;
            const itemsResponse = await axios.get(itemsUrl, { headers, timeout: 10000 });
            
            const items = itemsResponse.data.js?.data || [];
            if (items.length === 0) {
              return { category: cat, type: 'movie' };
            }
            
            // Check if any item has is_series = '1'
            const hasSeries = items.some((item: any) => item.is_series === '1');
            
            return { category: cat, type: hasSeries ? 'series' : 'movie' };
          } catch (error) {
            console.warn(`Failed to analyze category ${cat.id}:`, (error as Error).message);
            return { category: cat, type: 'movie' };
          }
        });
        
        const results = await Promise.allSettled(analysisPromises);
        
        results.forEach((result) => {
          if (result.status === 'fulfilled') {
            const { category, type } = result.value;
            if (type === 'series') {
              seriesCategories.push(category);
            } else {
              movieCategories.push(category);
            }
          }
        });
        
        console.log(`✅ Categorized: ${movieCategories.length} movies, ${seriesCategories.length} series`);
        
        // Cache categories in database with proper types
        console.log(`💾 Caching ${liveCategories.length} live + ${movieCategories.length} movies + ${seriesCategories.length} series...`);
        
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          
          // Insert/update live categories
          for (const cat of liveCategories) {
            if (cat.id === '*') continue; // Skip "All"
            
            await client.query(
              `INSERT INTO categories (
                category_id, user_id, provider_id, name, type, content_type,
                censored, is_enabled, sort_order
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, 0)
              ON CONFLICT (user_id, provider_id, category_id, type)
              DO UPDATE SET 
                name = EXCLUDED.name,
                content_type = EXCLUDED.content_type,
                censored = EXCLUDED.censored,
                updated_at = NOW()`,
              [cat.id, userId, provider.id, cat.title, 'LIVE', 'live', cat.censored || 0]
            );
          }
          
          // Insert/update movie categories
          for (const cat of movieCategories) {
            await client.query(
              `INSERT INTO categories (
                category_id, user_id, provider_id, name, type, content_type,
                censored, is_enabled, sort_order
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, 0)
              ON CONFLICT (user_id, provider_id, category_id, type)
              DO UPDATE SET 
                name = EXCLUDED.name,
                content_type = EXCLUDED.content_type,
                censored = EXCLUDED.censored,
                updated_at = NOW()`,
              [cat.id, userId, provider.id, cat.title, 'MOVIE', 'movie', cat.censored || 0]
            );
          }
          
          // Insert/update series categories
          for (const cat of seriesCategories) {
            await client.query(
              `INSERT INTO categories (
                category_id, user_id, provider_id, name, type, content_type,
                censored, is_enabled, sort_order
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, 0)
              ON CONFLICT (user_id, provider_id, category_id, type)
              DO UPDATE SET 
                name = EXCLUDED.name,
                content_type = EXCLUDED.content_type,
                censored = EXCLUDED.censored,
                updated_at = NOW()`,
              [cat.id, userId, provider.id, cat.title, 'SERIES', 'series', cat.censored || 0]
            );
          }
          
          await client.query('COMMIT');
          console.log('✅ Categories cached successfully');
        } catch (error) {
          await client.query('ROLLBACK');
          console.error('Failed to cache categories:', error);
        } finally {
          client.release();
        }
      }
      
      // Return categorized data (either from cache or freshly analyzed)
      res.json({
        success: true,
        liveCategories,
        movieCategories,
        seriesCategories,
      });
    } catch (error: any) {
      console.error('Stalker proxy error:', error.message);
      res.status(500).json({ error: 'Failed to fetch categories', details: error.message });
    }
  });
  
  // GET /api/stalker-proxy/channels/:categoryId - Get channels for a category
  router.get('/channels/:categoryId', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { categoryId } = req.params;
      const { page = '1' } = req.query;
      
      const providerResult = await pool.query(
        'SELECT * FROM providers WHERE user_id = $1 AND is_active = true LIMIT 1',
        [userId]
      );
      
      if (providerResult.rows.length === 0) {
        return res.status(404).json({ error: 'No active provider found' });
      }
      
      const provider = providerResult.rows[0];
      
      const headers = {
        'Cookie': `mac=${provider.mac_address}; timezone=America/Toronto; adid=06c140f97c839eaaa4faef4cc08a5722`,
        'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
        'X-User-Agent': 'Model: MAG270; Link: WiFi',
        'Authorization': `Bearer ${provider.token}`,
      };
      
      const url = `${provider.server_url}/stalker_portal/server/load.php?type=itv&action=get_ordered_list&genre=${categoryId}&page=${page}&p=${page}&sortby=number&JsHttpRequest=1-xml`;
      
      console.log(`📡 Fetching channels from: ${url.substring(0, 100)}...`);
      const response = await axios.get(url, { headers });
      
      const channels = response.data.js.data || [];
      if (channels.length > 0) {
        console.log(`📺 Sample channel data:`, {
          id: channels[0].id,
          name: channels[0].name,
          logo: channels[0].logo,
          number: channels[0].number,
          cmd: channels[0].cmd
        });
      }
      
      res.json({
        success: true,
        channels,
        totalItems: parseInt(response.data.js.total_items || '0'),
        maxPage: Math.ceil(parseInt(response.data.js.total_items || '0') / (response.data.js.max_page_items || 14)),
      });
    } catch (error: any) {
      console.error('Stalker proxy error:', error.message);
      res.status(500).json({ error: 'Failed to fetch channels', details: error.message });
    }
  });
  
  // GET /api/stalker-proxy/vod/:categoryId - Get VOD items for a category
  router.get('/vod/:categoryId', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { categoryId } = req.params;
      const { page = '1' } = req.query;
      
      const providerResult = await pool.query(
        'SELECT * FROM providers WHERE user_id = $1 AND is_active = true LIMIT 1',
        [userId]
      );
      
      if (providerResult.rows.length === 0) {
        return res.status(404).json({ error: 'No active provider found' });
      }
      
      const provider = providerResult.rows[0];
      
      const headers = {
        'Cookie': `mac=${provider.mac_address}; timezone=America/Toronto; adid=06c140f97c839eaaa4faef4cc08a5722`,
        'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
        'X-User-Agent': 'Model: MAG270; Link: WiFi',
        'Authorization': `Bearer ${provider.token}`,
      };
      
      const url = `${provider.server_url}/stalker_portal/server/load.php?type=vod&action=get_ordered_list&category=${categoryId}&page=${page}&p=${page}&sortby=added&JsHttpRequest=1-xml`;
      
      const response = await axios.get(url, { headers });
      
      res.json({
        success: true,
        items: response.data.js.data || [],
        totalItems: parseInt(response.data.js.total_items || '0'),
        maxPage: Math.ceil(parseInt(response.data.js.total_items || '0') / (response.data.js.max_page_items || 14)),
      });
    } catch (error: any) {
      console.error('Stalker proxy error:', error.message);
      res.status(500).json({ error: 'Failed to fetch VOD items', details: error.message });
    }
  });

  // GET /api/stalker-proxy/series/seasons/:seriesId - Get seasons for a series
  router.get('/series/seasons/:seriesId', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { seriesId } = req.params;
      
      const providerResult = await pool.query(
        'SELECT * FROM providers WHERE user_id = $1 AND is_active = true LIMIT 1',
        [userId]
      );
      
      if (providerResult.rows.length === 0) {
        return res.status(404).json({ error: 'No active provider found' });
      }
      
      const provider = providerResult.rows[0];
      
      const headers = {
        'Cookie': `mac=${provider.mac_address}; timezone=America/Toronto; adid=06c140f97c839eaaa4faef4cc08a5722`,
        'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
        'X-User-Agent': 'Model: MAG270; Link: WiFi',
        'Authorization': `Bearer ${provider.token}`,
      };
      
      // Use type=vod with movie_id to get seasons list
      const url = `${provider.server_url}/stalker_portal/server/load.php?action=get_ordered_list&type=vod&movie_id=${seriesId}&p=1&JsHttpRequest=1-xml`;
      
      console.log(`📡 Fetching seasons for series ${seriesId} from:`, url);
      const response = await axios.get(url, { headers });
      console.log(`📦 Seasons response:`, JSON.stringify(response.data));
      
      const seasons = response.data.js?.data || [];
      console.log(`📺 Found ${seasons.length} seasons`);
      
      res.json({
        success: true,
        seasons,
      });
    } catch (error: any) {
      console.error('Stalker proxy error:', error.message);
      res.status(500).json({ error: 'Failed to fetch seasons', details: error.message });
    }
  });

  // GET /api/stalker-proxy/series/episodes/:seriesId/:seasonId - Get episodes for a season
  router.get('/series/episodes/:seriesId/:seasonId', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { seriesId, seasonId } = req.params;
      
      const providerResult = await pool.query(
        'SELECT * FROM providers WHERE user_id = $1 AND is_active = true LIMIT 1',
        [userId]
      );
      
      if (providerResult.rows.length === 0) {
        return res.status(404).json({ error: 'No active provider found' });
      }
      
      const provider = providerResult.rows[0];
      
      const headers = {
        'Cookie': `mac=${provider.mac_address}; timezone=America/Toronto; adid=06c140f97c839eaaa4faef4cc08a5722`,
        'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
        'X-User-Agent': 'Model: MAG270; Link: WiFi',
        'Authorization': `Bearer ${provider.token}`,
      };
      
      // Use type=vod with season_id parameter (not type=series)
      const url = `${provider.server_url}/stalker_portal/server/load.php?action=get_ordered_list&type=vod&movie_id=${seriesId}&season_id=${seasonId}&p=1&JsHttpRequest=1-xml`;
      
      console.log(`📡 Fetching episodes for series ${seriesId}, season ${seasonId} from:`, url);
      const response = await axios.get(url, { headers });
      console.log(`📦 Episodes response:`, JSON.stringify(response.data));
      
      const episodes = response.data.js?.data || [];
      console.log(`📺 Found ${episodes.length} episodes`);
      
      res.json({
        success: true,
        episodes,
      });
    } catch (error: any) {
      console.error('Stalker proxy error:', error.message);
      res.status(500).json({ error: 'Failed to fetch episodes', details: error.message });
    }
  });

  // GET /api/stalker-proxy/episode-info/:seriesId/:seasonId/:episodeId - Get episode file info
  router.get('/episode-info/:seriesId/:seasonId/:episodeId', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { seriesId, seasonId, episodeId } = req.params;
      
      const providerResult = await pool.query(
        'SELECT * FROM providers WHERE user_id = $1 AND is_active = true LIMIT 1',
        [userId]
      );
      
      if (providerResult.rows.length === 0) {
        return res.status(404).json({ error: 'No active provider found' });
      }
      
      const provider = providerResult.rows[0];
      
      const headers = {
        'Cookie': `mac=${provider.mac_address}; timezone=America/Toronto; adid=06c140f97c839eaaa4faef4cc08a5722`,
        'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
        'X-User-Agent': 'Model: MAG270; Link: WiFi',
        'Authorization': `Bearer ${provider.token}`,
      };
      
      const url = `${provider.server_url}/stalker_portal/server/load.php?action=get_ordered_list&type=vod&movie_id=${seriesId}&season_id=${seasonId}&episode_id=${episodeId}&JsHttpRequest=1-xml`;
      
      console.log(`📡 Fetching episode info for series ${seriesId}, season ${seasonId}, episode ${episodeId}`);
      const response = await axios.get(url, { headers });
      
      const data = response.data.js?.data;
      const episodeInfo = Array.isArray(data) && data.length > 0 ? data[0] : {};
      
      console.log(`📦 Episode Info:`, episodeInfo.id ? `Found episode ${episodeInfo.id}` : 'No data found');
      
      res.json({
        success: true,
        info: episodeInfo,
      });
    } catch (error: any) {
      console.error('Stalker proxy error:', error.message);
      res.status(500).json({ error: 'Failed to fetch episode info', details: error.message });
    }
  });

  // GET /api/stalker-proxy/vod-info/:vodId - Get VOD/Movie files for playback
  router.get('/vod-info/:vodId', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { vodId } = req.params;
      
      const providerResult = await pool.query(
        'SELECT * FROM providers WHERE user_id = $1 AND is_active = true LIMIT 1',
        [userId]
      );
      
      if (providerResult.rows.length === 0) {
        return res.status(404).json({ error: 'No active provider found' });
      }
      
      const provider = providerResult.rows[0];
      
      const headers = {
        'Cookie': `mac=${provider.mac_address}; timezone=America/Toronto; adid=06c140f97c839eaaa4faef4cc08a5722`,
        'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
        'X-User-Agent': 'Model: MAG270; Link: WiFi',
        'Authorization': `Bearer ${provider.token}`,
      };
      
      // get_ordered_list returns file list for playback
      const url = `${provider.server_url}/stalker_portal/server/load.php?action=get_ordered_list&type=vod&movie_id=${vodId}&JsHttpRequest=1-xml`;
      
      console.log(`📡 Fetching VOD files for movie ${vodId} from: ${url}`);
      const response = await axios.get(url, { headers });
      
      const files = response.data.js?.data || [];
      console.log(`📦 VOD files response:`, JSON.stringify({
        filesCount: files.length,
        hasFiles: files.length > 0,
        firstFile: files.length > 0 ? {
          id: files[0].id,
          video_id: files[0].video_id,
          name: files[0].name,
          quality: files[0].quality,
          hasCmd: !!files[0].cmd
        } : null
      }, null, 2));
      
      // Return as files array - frontend will use this for playback
      res.json({
        success: true,
        files: files,
        video_id: files.length > 0 ? files[0].video_id : vodId,
      });
    } catch (error: any) {
      console.error('Stalker proxy error:', error.message);
      res.status(500).json({ error: 'Failed to fetch VOD info', details: error.message });
    }
  });

  // POST /api/stalker-proxy/create-link - Create streaming link
  router.post('/create-link', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { cmd, series, movie, forced_storage, disable_ad, download } = req.body;
      
      const providerResult = await pool.query(
        'SELECT * FROM providers WHERE user_id = $1 AND is_active = true LIMIT 1',
        [userId]
      );
      
      if (providerResult.rows.length === 0) {
        return res.status(404).json({ error: 'No active provider found' });
      }
      
      const provider = providerResult.rows[0];
      
      const headers = {
        'Cookie': `mac=${provider.mac_address}; timezone=America/Toronto; adid=06c140f97c839eaaa4faef4cc08a5722`,
        'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
        'X-User-Agent': 'Model: MAG270; Link: WiFi',
        'Authorization': `Bearer ${provider.token}`,
      };
      
      // Build URL parameters - always use type=vod for both movies and series
      const params = new URLSearchParams({
        type: 'vod',
        action: 'create_link',
        cmd: cmd || '',
        JsHttpRequest: '1-xml',
      });
      
      if (series) params.append('series', series);
      if (movie) params.append('movie', movie);
      if (forced_storage) params.append('forced_storage', forced_storage);
      if (disable_ad) params.append('disable_ad', disable_ad);
      if (download) params.append('download', download);
      
      const url = `${provider.server_url}/stalker_portal/server/load.php?${params.toString()}`;
      
      console.log(`🔗 Creating link with cmd: ${cmd}, series: ${series}, movie: ${movie}`);
      console.log(`🌐 URL: ${url}`);
      const response = await axios.get(url, { headers });
      console.log(`📦 Full response:`, JSON.stringify(response.data).substring(0, 500));
      console.log(`✅ Link created:`, response.data.js?.cmd ? `Success: ${response.data.js.cmd}` : 'No cmd in response');
      
      const result = {
        success: true,
        link: response.data.js || {},
      };
      
      res.json(result);
    } catch (error: any) {
      console.error('Stalker proxy error:', error.message);
      res.status(500).json({ error: 'Failed to create link', details: error.message });
    }
  });

  // GET /api/stalker-proxy/search?search=xxx&p=1 - Search VOD (movies and series)
  router.get('/search', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { search, p = '1' } = req.query;
      
      if (!search || typeof search !== 'string') {
        return res.status(400).json({ error: 'search parameter is required' });
      }
      
      console.log(`🔍 Proxy /search - query: "${search}", page: ${p}`);
      
      const providerResult = await pool.query(
        'SELECT * FROM providers WHERE user_id = $1 AND is_active = true LIMIT 1',
        [userId]
      );
      
      if (providerResult.rows.length === 0) {
        return res.status(404).json({ error: 'No active provider found' });
      }
      
      const provider = providerResult.rows[0];
      
      const headers = {
        'Cookie': `mac=${provider.mac_address}; timezone=America/Toronto; adid=06c140f97c839eaaa4faef4cc08a5722`,
        'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
        'X-User-Agent': 'Model: MAG270; Link: WiFi',
        'Authorization': `Bearer ${provider.token}`,
      };
      
      const url = `${provider.server_url}/stalker_portal/server/load.php?action=get_ordered_list&type=vod&category=0&search=${encodeURIComponent(search)}&sortby=name&p=${p}&JsHttpRequest=1-xml`;
      
      console.log(`📡 Calling Stalker portal search: ${url.substring(0, 150)}...`);
      
      const response = await axios.get(url, { headers });
      
      const items = response.data.js?.data || [];
      const totalItems = response.data.js?.total_items || '0';
      
      console.log(`✅ Search returned ${items.length} items (total: ${totalItems})`);
      
      res.json({
        success: true,
        items,
        total_items: totalItems,
      });
    } catch (error: any) {
      console.error('Stalker search proxy error:', error.message);
      res.status(500).json({ error: 'Failed to search', details: error.message });
    }
  });

  // GET /api/stalker-proxy/channel-stream?cmd=xxx - Get live TV stream URL
  router.get('/channel-stream', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { cmd } = req.query;
      
      if (!cmd || typeof cmd !== 'string') {
        return res.status(400).json({ error: 'cmd parameter is required' });
      }
      
      console.log(`🔍 Proxy /channel-stream - cmd: ${cmd}`);
      
      const providerResult = await pool.query(
        'SELECT * FROM providers WHERE user_id = $1 AND is_active = true LIMIT 1',
        [userId]
      );
      
      if (providerResult.rows.length === 0) {
        return res.status(404).json({ error: 'No active provider found' });
      }
      
      const provider = providerResult.rows[0];
      
      const headers = {
        'Cookie': `mac=${provider.mac_address}; timezone=America/Toronto; adid=06c140f97c839eaaa4faef4cc08a5722`,
        'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
        'X-User-Agent': 'Model: MAG270; Link: WiFi',
        'Authorization': `Bearer ${provider.token}`,
      };
      
      const url = `${provider.server_url}/stalker_portal/server/load.php?type=itv&action=create_link&cmd=${encodeURIComponent(cmd)}&forced_storage=undefined&disable_ad=0&JsHttpRequest=1-xml`;
      
      console.log(`📡 Calling Stalker portal: ${url.substring(0, 100)}...`);
      
      const response = await axios.get(url, { headers });
      
      const result = {
        success: true,
        stream: response.data.js || {},
      };
      
      res.json(result);
    } catch (error: any) {
      console.error('Stalker proxy error:', error.message);
      res.status(500).json({ error: 'Failed to get stream', details: error.message });
    }
  });

  // GET /api/stalker-proxy/image - Proxy images from Stalker portal
  // Note: This endpoint uses token from query param since React Native Image doesn't support headers
  router.get('/image', async (req: Request, res: Response) => {
    try {
      const { url, token } = req.query;
      let userId: string | undefined;

      // Verify and decode token from query parameter
      if (token && typeof token === 'string') {
        try {
          const jwt = require('jsonwebtoken');
          const jwtSecret = process.env.JWT_SECRET || 'default-secret';
          const decoded = jwt.verify(token, jwtSecret) as any;
          userId = decoded?.userId;
        } catch (error: any) {
          console.error('❌ Invalid token in image request:', error.message);
          return res.status(401).json({ error: 'Invalid token' });
        }
      }

      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'url parameter is required' });
      }

      // Get user's active provider
      const providerResult = await pool.query(
        'SELECT * FROM providers WHERE user_id = $1 AND is_active = true LIMIT 1',
        [userId]
      );

      if (providerResult.rows.length === 0) {
        return res.status(404).json({ error: 'No active provider found' });
      }

      const provider = providerResult.rows[0];
      
      // Build full URL if it's a relative path
      const imageUrl = url.startsWith('http') ? url : `${provider.server_url}${url}`;

      // Fetch image with Stalker headers
      const response = await axios.get(imageUrl, {
        headers: {
          'Cookie': `mac=${provider.mac_address}; timezone=America/Toronto`,
          'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
          'Authorization': `Bearer ${provider.token}`,
        },
        responseType: 'arraybuffer',
        timeout: 10000,
      });

      // Set appropriate content type
      const contentType = response.headers['content-type'] || 'image/jpeg';
      res.set('Content-Type', contentType);
      res.set('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
      res.send(response.data);
    } catch (error: any) {
      console.error('Image proxy error:', error.message);
      // Return a 1x1 transparent pixel as fallback
      const transparentPixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
      res.set('Content-Type', 'image/gif');
      res.send(transparentPixel);
    }
  });

  // POST /api/stalker-proxy/handshake - Perform Stalker handshake (no auth required for setup)
  router.post('/handshake', async (req: Request, res: Response) => {
    try {
      const { portalUrl, mac, adid } = req.body;

      if (!portalUrl || !mac) {
        return res.status(400).json({ error: 'portalUrl and mac are required' });
      }

      // Use provided adid or generate one
      const deviceAdid = adid || 'd5441597521c851906613d3948d84b8b';

      console.log('🤝 Handshake request:', { portalUrl, mac, adid: deviceAdid });

      // Follow redirects to get final URL (like Android TV does with OkHttp)
      let baseUrl = portalUrl;
      
      try {
        // Make a HEAD request to the server/load.php endpoint to follow redirects
        const testUrl = baseUrl.includes('/stalker_portal') 
          ? `${baseUrl}/server/load.php`
          : `${baseUrl}/stalker_portal/server/load.php`;
          
        console.log('🔍 Checking redirects for:', testUrl);
        
        const redirectCheck = await axios.head(testUrl, {
          maxRedirects: 5,
          validateStatus: () => true,
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3'
          }
        });
        
        const redirectedUrl = redirectCheck.request?.res?.responseUrl;
        
        if (redirectedUrl && redirectedUrl !== testUrl) {
          console.log('🔀 Original URL:', portalUrl);
          console.log('🔀 Redirected to:', redirectedUrl);
          
          // Extract base URL by removing everything after /stalker_portal
          if (redirectedUrl.includes('/stalker_portal')) {
            baseUrl = redirectedUrl.substring(0, redirectedUrl.indexOf('/stalker_portal') + '/stalker_portal'.length);
          } else if (redirectedUrl.includes('/portal')) {
            baseUrl = redirectedUrl.substring(0, redirectedUrl.indexOf('/portal') + '/portal'.length);
          } else {
            // Parse to get protocol + host only
            const urlObj = new URL(redirectedUrl);
            baseUrl = `${urlObj.protocol}//${urlObj.host}/stalker_portal`;
          }
          
          console.log('✅ Resolved base URL:', baseUrl);
        } else {
          // No redirect, ensure we have stalker_portal in the URL
          baseUrl = portalUrl.replace(/\/$/, '');
          if (!baseUrl.includes('/stalker_portal')) {
            baseUrl = `${baseUrl}/stalker_portal`;
          }
          console.log('✅ Using original URL:', baseUrl);
        }
      } catch (err) {
        console.log('⚠️ Redirect check failed, using original URL');
        baseUrl = portalUrl.replace(/\/$/, '');
        if (!baseUrl.includes('/stalker_portal')) {
          baseUrl = `${baseUrl}/stalker_portal`;
        }
      }

      const url = `${baseUrl}/server/load.php`;
      const timestamp = Math.floor(Date.now() / 1000);
      const prehash = '13f08489a13755456b4bb629229e14c1c358ebb1';

      const params = {
        type: 'stb',
        action: 'handshake',
        token: '',
        prehash: prehash,
        JsHttpRequest: '1-xml'
      };

      console.log('📤 Handshake URL:', url);
      console.log('📤 Handshake params:', params);
      console.log('📤 MAC:', mac);

      const response = await axios.get(url, {
        params,
        headers: {
          'Cookie': `mac=${mac}; timezone=America/Toronto; adid=${deviceAdid}`,
          'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
          'X-User-Agent': 'Model: MAG270; Link: WiFi',
        },
        timeout: 10000,
      });

      console.log('📥 Handshake response:', response.data);

      if (response.data?.js?.token) {
        res.json({
          token: response.data.js.token,
          random: response.data.js.random,
          finalUrl: baseUrl
        });
      } else {
        throw new Error('Invalid handshake response');
      }
    } catch (error: any) {
      console.error('❌ Handshake error:', error.message);
      res.status(500).json({ 
        error: 'Handshake failed', 
        details: error.message 
      });
    }
  });

  // POST /api/stalker-proxy/profile - Get Stalker profile (no auth required for setup)
  router.post('/profile', async (req: Request, res: Response) => {
    try {
      const { portalUrl, mac, token, serialNumber, adid } = req.body;

      if (!portalUrl || !mac || !token || !serialNumber) {
        return res.status(400).json({ 
          error: 'portalUrl, mac, token, and serialNumber are required' 
        });
      }

      // Use provided adid or generate one (MD5 of MAC)
      const deviceAdid = adid || crypto.createHash('md5').update(mac).digest('hex');
      
      // Generate prehash (SHA1 of MAC) - this is used as random in metrics
      const prehash = crypto.createHash('sha1').update(mac).digest('hex');

      console.log('👤 Profile request:', { portalUrl, mac, serialNumber, prehash });

      const url = `${portalUrl}/server/load.php`;
      const timestamp = Math.floor(Date.now() / 1000);

      const metrics = JSON.stringify({
        mac: mac,
        sn: serialNumber,
        model: 'MAG270',
        type: 'STB',
        uid: '',
        random: prehash  // Use prehash as random, NOT the random from handshake response!
      });

      const params = {
        type: 'stb',
        action: 'get_profile',
        ver: 'ImageDescription: 0.2.18-r22-pub-270; ImageDate: Tue Dec 19 11:33:53 EET 2017; PORTAL version: 5.6.1; API Version: JS API version: 328; STB API version: 134; Player Engine version: 0x566',
        sn: serialNumber,
        stb_type: 'MAG270',
        client_type: 'STB',
        image_version: '0.2.18',
        device_id: '',
        device_id2: '',
        auth_second_step: '1',
        hw_version: '1.7-BD-00',
        not_valid_token: '0',
        metrics: metrics,
        hw_version_2: 'ecf87650406bba50b0801a4347093864b89b38e6',
        timestamp: timestamp,
        api_signature: '262',
        prehash: 'efd15c16dc497e0839ff5accfdc6ed99c32c4e2a',
        JsHttpRequest: '1-xml'
      };

      console.log('📤 Profile URL:', url);
      console.log('📤 Profile params:', params);
      console.log('📤 Profile headers:', {
        'Cookie': `mac=${mac}; timezone=America/Toronto; adid=${deviceAdid}`,
        'Authorization': `Bearer ${token}`
      });

      const response = await axios.get(url, {
        params,
        headers: {
          'Cookie': `mac=${mac}; timezone=America/Toronto; adid=${deviceAdid}`,
          'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
          'X-User-Agent': 'Model: MAG270; Link: WiFi',
          'Authorization': `Bearer ${token}`
        },
        timeout: 10000,
      });

      console.log('📥 Profile response:', response.data);

      if (response.data?.js) {
        const profileData = response.data.js;
        
        // Check if portal requires authentication (status: 2)
        if (profileData.status === 2) {
          return res.status(401).json({
            error: 'Authentication required',
            status: 2,
            message: profileData.msg || 'This portal requires username/password authentication',
            details: profileData
          });
        }
        
        // Check for other error statuses
        if (profileData.status === 1) {
          return res.status(400).json({
            error: 'Time sync error',
            status: 1,
            message: profileData.msg || 'Time on the device is not synchronized',
            details: profileData
          });
        }
        
        res.json(profileData);
      } else {
        throw new Error('Invalid profile response');
      }
    } catch (error: any) {
      console.error('❌ Profile error:', error.message);
      res.status(500).json({ 
        error: 'Profile fetch failed', 
        details: error.message 
      });
    }
  });

  // POST /api/stalker-proxy/fetch-categories - Fetch all categories from Stalker portal (no auth required for setup)
  router.post('/fetch-categories', async (req: Request, res: Response) => {
    try {
      const { portalUrl, mac, token } = req.body;

      if (!portalUrl || !mac || !token) {
        return res.status(400).json({ 
          error: 'portalUrl, mac, and token are required' 
        });
      }

      console.log('📋 Fetching categories:', { portalUrl, mac });

      const url = `${portalUrl}/server/load.php`;
      const headers = {
        'Cookie': `mac=${mac}; timezone=America/Toronto`,
        'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
        'Authorization': `Bearer ${token}`,
      };

      // Fetch Live TV genres and VOD categories
      const [liveResponse, vodResponse] = await Promise.all([
        axios.get(url, {
          params: { type: 'itv', action: 'get_genres', JsHttpRequest: '1-xml' },
          headers,
          timeout: 10000,
        }),
        axios.get(url, {
          params: { type: 'vod', action: 'get_categories', JsHttpRequest: '1-xml' },
          headers,
          timeout: 10000,
        }),
      ]);

      const liveGenres = (liveResponse.data.js || []).filter((g: any) => g.id !== '*' && g.id !== 'dvb');
      const vodCategories = (vodResponse.data.js || []).filter((c: any) => c.id !== '*');

      console.log(`✅ Fetched ${liveGenres.length} live genres, ${vodCategories.length} VOD categories`);

      // Detect VOD category types by sampling
      const allCategories = [];

      // Add live TV genres
      for (const genre of liveGenres) {
        allCategories.push({
          id: genre.id,
          name: genre.title,
          type: 'CHANNEL',
          contentType: 'LIVE',
          censored: genre.censored || 0,
          sortOrder: parseInt(genre.number || '0', 10)
        });
      }

      // Sample and add VOD categories
      for (const category of vodCategories) {
        try {
          // Sample first page to detect type
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

          allCategories.push({
            id: category.id,
            name: category.title,
            type: type,
            contentType: 'VOD',
            censored: category.censored || 0,
            sortOrder: 0
          });

          // Small delay to avoid overwhelming server
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (err) {
          console.error(`Failed to detect type for category ${category.id}, defaulting to MOVIE`);
          allCategories.push({
            id: category.id,
            name: category.title,
            type: 'MOVIE',
            contentType: 'VOD',
            censored: category.censored || 0,
            sortOrder: 0
          });
        }
      }

      console.log(`🎉 Total categories: ${allCategories.length}`);
      res.json({ categories: allCategories });
    } catch (error: any) {
      console.error('❌ Fetch categories error:', error.message);
      res.status(500).json({ 
        error: 'Failed to fetch categories', 
        details: error.message 
      });
    }
  });

  // GET /api/stalker-proxy/epg/:channelId - Get EPG for a channel
  router.get('/epg/:channelId', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { channelId } = req.params;
      const period = req.query.period ? parseInt(req.query.period as string) : 4; // Default 4 days

      console.log('🔍 [EPG] Request received:', { userId, channelId, period });

      // Get user's active provider
      const providerResult = await pool.query(
        'SELECT * FROM providers WHERE user_id = $1 AND is_active = true LIMIT 1',
        [userId]
      );

      if (providerResult.rows.length === 0) {
        console.log('❌ [EPG] No active provider found for user:', userId);
        return res.status(404).json({ error: 'No active provider found' });
      }

      const provider = providerResult.rows[0];
      console.log('✅ [EPG] Found provider:', { id: provider.id, url: provider.server_url.substring(0, 50) + '...' });

      // Make request to Stalker portal for EPG data
      const headers = {
        'Cookie': `mac=${provider.mac_address}; timezone=America/Toronto; adid=06c140f97c839eaaa4faef4cc08a5722`,
        'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
        'X-User-Agent': 'Model: MAG270; Link: WiFi',
        'Authorization': `Bearer ${provider.token}`,
      };

      const baseUrl = `${provider.server_url}/stalker_portal/server/load.php`;
      const url = `${baseUrl}?type=itv&action=get_epg_info&ch_id=${channelId}&period=${period}&JsHttpRequest=1-xml`;

      console.log('🔗 [EPG] Fetching from Stalker:', url.substring(0, 120) + '...');

      const response = await axios.get(url, { headers, timeout: 15000 });
      
      // Debug: Log the full response structure
      console.log('📡 [EPG] Full response.data:', JSON.stringify(response.data).substring(0, 500));
      console.log('📡 [EPG] Response type:', typeof response.data);
      
      // Handle empty or invalid responses
      if (!response.data || response.data === '' || (typeof response.data === 'string' && response.data.trim() === '')) {
        console.log('⚠️ [EPG] Empty response from get_epg_info, trying get_short_epg...');
        
        // Try short EPG as fallback
        const shortEpgUrl = `${baseUrl}?type=itv&action=get_short_epg&ch_id=${channelId}&JsHttpRequest=1-xml`;
        console.log('🔗 [EPG] Trying short EPG:', shortEpgUrl.substring(0, 120) + '...');
        
        try {
          const shortResponse = await axios.get(shortEpgUrl, { headers, timeout: 10000 });
          console.log('📡 [EPG] Short EPG response:', JSON.stringify(shortResponse.data).substring(0, 500));
          
          if (shortResponse.data && shortResponse.data.js) {
            const shortEpgData = Array.isArray(shortResponse.data.js) ? shortResponse.data.js : [];
            console.log('✅ [EPG] Got short EPG data:', shortEpgData.length, 'programs');
            
            return res.json({
              success: true,
              epg: {
                current_program: shortEpgData[0] || null,
                next_program: shortEpgData[1] || null,
                programs: shortEpgData
              }
            });
          }
        } catch (shortEpgError: any) {
          console.log('⚠️ [EPG] Short EPG also failed:', shortEpgError.message);
        }
        
        // No EPG data available
        console.log('ℹ️ [EPG] No EPG data available for this channel/provider');
        return res.json({
          success: true,
          epg: {
            current_program: null,
            next_program: null,
            programs: [],
            message: 'EPG not available for this channel'
          }
        });
      }
      
      const epgData = response.data.js || response.data || {};

      console.log('📡 [EPG] Stalker response structure:', {
        hasJs: !!response.data.js,
        hasData: !!response.data,
        keys: Object.keys(epgData).slice(0, 5),
        totalKeys: Object.keys(epgData).length,
        isArray: Array.isArray(epgData)
      });

      // EPG data structure: { [channelId]: [programs...] }
      const programs = epgData[channelId] || [];
      
      console.log(`📺 [EPG] Found ${programs.length} programs for channel ${channelId}`);
      if (programs.length > 0) {
        console.log('📺 [EPG] First program sample:', {
          name: programs[0].name,
          start_timestamp: programs[0].start_timestamp,
          stop_timestamp: programs[0].stop_timestamp,
          time: programs[0].time
        });
      }

      // Extract current and next program
      const now = Math.floor(Date.now() / 1000);
      let currentProgram = null;
      let nextProgram = null;

      for (let i = 0; i < programs.length; i++) {
        const program = programs[i];
        const startTime = parseInt(program.start_timestamp || program.time || '0');
        const stopTime = parseInt(program.stop_timestamp || '0');

        // Current program: start <= now < stop
        if (startTime <= now && stopTime > now) {
          currentProgram = program;
          console.log('✅ [EPG] Found current program:', program.name);
        }
        // Next program: first program after current
        if (startTime > now && !nextProgram) {
          nextProgram = program;
          console.log('✅ [EPG] Found next program:', program.name);
          break;
        }
      }

      console.log('📊 [EPG] Returning:', {
        hasCurrent: !!currentProgram,
        hasNext: !!nextProgram,
        totalPrograms: programs.length
      });

      res.json({
        success: true,
        epg: {
          current_program: currentProgram,
          next_program: nextProgram,
          programs: programs
        }
      });
    } catch (error: any) {
      console.error('❌ [EPG] Error:', error.message);
      if (error.response) {
        console.error('❌ [EPG] Response error:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        });
      }
      res.status(500).json({
        success: false,
        error: 'Failed to fetch EPG',
        details: error.message
      });
    }
  });

  // GET /api/stalker-proxy/epg-short/:channelId - Get short EPG (current and next)
  router.get('/epg-short/:channelId', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { channelId } = req.params;

      console.log('🔍 Proxy /epg-short/:channelId - User ID:', userId, 'Channel ID:', channelId);

      // Get user's active provider
      const providerResult = await pool.query(
        'SELECT * FROM providers WHERE user_id = $1 AND is_active = true LIMIT 1',
        [userId]
      );

      if (providerResult.rows.length === 0) {
        return res.status(404).json({ error: 'No active provider found' });
      }

      const provider = providerResult.rows[0];

      // Make request to Stalker portal for short EPG
      const headers = {
        'Cookie': `mac=${provider.mac_address}; timezone=America/Toronto; adid=06c140f97c839eaaa4faef4cc08a5722`,
        'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
        'X-User-Agent': 'Model: MAG270; Link: WiFi',
        'Authorization': `Bearer ${provider.token}`,
      };

      const baseUrl = `${provider.server_url}/stalker_portal/server/load.php`;
      const url = `${baseUrl}?type=itv&action=get_short_epg&ch_id=${channelId}&JsHttpRequest=1-xml`;

      console.log('🔗 Fetching short EPG from:', url);

      const response = await axios.get(url, { headers, timeout: 10000 });
      const epgData = response.data.js || [];

      console.log(`✅ Fetched short EPG for channel ${channelId}:`, epgData.length, 'programs');

      // Short EPG returns array with current and potentially next program
      const currentProgram = epgData.length > 0 ? epgData[0] : null;
      const nextProgram = epgData.length > 1 ? epgData[1] : null;

      res.json({
        success: true,
        epg: {
          current_program: currentProgram,
          next_program: nextProgram
        }
      });
    } catch (error: any) {
      console.error('❌ Get short EPG error:', error.message);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch short EPG',
        details: error.message
      });
    }
  });
  
  return router;
};
