import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import axios from 'axios';

const router = Router();

// Stalker Portal Proxy - Forwards requests to Stalker portal with proper headers
export const createStalkerProxyRouter = (pool: Pool) => {
  
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
              ON CONFLICT (user_id, provider_id, category_id)
              DO UPDATE SET 
                name = EXCLUDED.name,
                type = EXCLUDED.type,
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
              ON CONFLICT (user_id, provider_id, category_id)
              DO UPDATE SET 
                name = EXCLUDED.name,
                type = EXCLUDED.type,
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
              ON CONFLICT (user_id, provider_id, category_id)
              DO UPDATE SET 
                name = EXCLUDED.name,
                type = EXCLUDED.type,
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

  // GET /api/stalker-proxy/vod-info/:vodId - Get VOD/Movie file info
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
      
      const url = `${provider.server_url}/stalker_portal/server/load.php?action=get_ordered_list&type=vod&movie_id=${vodId}&JsHttpRequest=1-xml`;
      
      console.log(`📡 Fetching VOD info for movie ${vodId} from: ${url}`);
      const response = await axios.get(url, { headers });
      
      console.log(`📦 Raw response structure:`, {
        hasJs: !!response.data.js,
        hasData: !!response.data.js?.data,
        dataType: Array.isArray(response.data.js?.data) ? 'array' : typeof response.data.js?.data,
        dataLength: Array.isArray(response.data.js?.data) ? response.data.js.data.length : 'N/A'
      });
      
      const data = response.data.js?.data;
      const movieInfo = Array.isArray(data) && data.length > 0 ? data[0] : {};
      
      console.log(`📦 VOD Info:`, movieInfo.id ? `Found movie ${movieInfo.id} with ${movieInfo.files?.length || 0} files` : 'No data found');
      
      res.json({
        success: true,
        info: movieInfo,
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
      
      res.json({
        success: true,
        link: response.data.js || {},
      });
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
      
      res.json({
        success: true,
        stream: response.data.js || {},
      });
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
  
  return router;
};
