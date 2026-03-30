import { Router, Request, Response } from 'express';
import axios from 'axios';
import { pool } from '../index';

const router = Router();

/**
 * Xtreme Codes API Proxy Routes
 * 
 * Provides proxy endpoints for Xtreme Codes IPTV providers.
 * All routes handle authentication, CORS, and HLS manifest rewriting.
 */

// GET /api/xtream-proxy/authenticate - Test Xtreme Codes credentials
router.get('/authenticate', async (req: Request, res: Response) => {
  try {
    const { serverUrl, username, password } = req.query;

    if (!serverUrl || !username || !password) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const baseUrl = (serverUrl as string).replace(/\/player_api\.php.*$/, '');
    const authUrl = `${baseUrl}/player_api.php?username=${username}&password=${password}`;

    console.log('🔐 [XTREAM AUTH] Testing credentials...');

    const response = await axios.get(authUrl, { timeout: 10000 });
    const data = response.data;

    if (data.user_info) {
      console.log('✅ [XTREAM AUTH] Authentication successful');
      res.json({
        success: true,
        userInfo: data.user_info,
        serverInfo: data.server_info,
      });
    } else {
      console.log('❌ [XTREAM AUTH] Invalid credentials');
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (error: any) {
    console.error('❌ [XTREAM AUTH] Error:', error.message);
    res.status(500).json({ error: 'Authentication failed', details: error.message });
  }
});

// GET /api/xtream-proxy/channels/:categoryId - Get channels for a category
router.get('/channels/:categoryId', async (req: Request, res: Response) => {
  try {
    const { categoryId } = req.params;
    const userId = (req as any).userId;

    console.log('📺 [XTREAM CHANNELS] Fetching channels for category:', categoryId);

    // Get provider for this user
    const providerResult = await pool.query(
      'SELECT * FROM providers WHERE user_id = $1 AND type = $2 AND is_active = true LIMIT 1',
      [userId, 'xtream']
    );

    if (providerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Xtreme Codes provider not found' });
    }

    const provider = providerResult.rows[0];

    if (!provider.server_url || !provider.username || !provider.password) {
      return res.status(400).json({ error: 'Provider configuration incomplete' });
    }

    const baseUrl = provider.server_url.replace(/\/player_api\.php.*$/, '');
    const apiUrl = `${baseUrl}/player_api.php`;

    // Extract external category ID (remove "live_" prefix if present)
    const externalCategoryId = categoryId.replace(/^live_/, '');

    // Fetch streams from Xtreme Codes API
    const url = `${apiUrl}?username=${provider.username}&password=${provider.password}&action=get_live_streams&category_id=${externalCategoryId}`;
    console.log('📤 [XTREAM CHANNELS] Fetching from:', url);

    const response = await axios.get(url, { timeout: 30000 });
    const streams = Array.isArray(response.data) ? response.data : [];

    console.log(`✅ [XTREAM CHANNELS] Fetched ${streams.length} streams`);

    // Transform to match expected format
    const channels = streams.map((stream: any) => ({
      id: stream.stream_id?.toString() || stream.num?.toString(),
      name: stream.name,
      number: stream.num?.toString(),
      cmd: `http://${baseUrl}/live/${provider.username}/${provider.password}/${stream.stream_id}.m3u8`,
      logo: stream.stream_icon,
      imageUrl: stream.stream_icon,
    }));

    res.json({
      success: true,
      channels,
      streams: channels, // Alias for compatibility
      totalItems: channels.length,
    });

  } catch (error: any) {
    console.error('❌ [XTREAM CHANNELS] Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch channels', details: error.message });
  }
});

// GET /api/xtream-proxy/stream/:streamId.m3u8 - Proxy HLS manifest with URL rewriting
router.get('/stream/:streamId', async (req: Request, res: Response) => {
  try {
    const { streamId } = req.params;
    const userId = (req as any).userId;

    console.log('📺 [XTREAM STREAM] Manifest request for stream:', streamId);

    // Get provider for this user
    const providerResult = await pool.query(
      'SELECT * FROM providers WHERE user_id = $1 AND type = $2 AND is_active = true LIMIT 1',
      [userId, 'xtream']
    );

    if (providerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Xtreme Codes provider not found' });
    }

    const provider = providerResult.rows[0];

    if (!provider.server_url || !provider.username || !provider.password) {
      return res.status(400).json({ error: 'Provider configuration incomplete' });
    }

    const baseUrl = provider.server_url.replace(/\/player_api\.php.*$/, '');
    const cleanStreamId = streamId.replace('.m3u8', '');
    const streamUrl = `${baseUrl}/live/${provider.username}/${provider.password}/${cleanStreamId}.m3u8`;

    console.log('📤 [XTREAM STREAM] Fetching manifest from:', streamUrl);

    // Fetch manifest from Xtreme server
    const response = await axios.get(streamUrl, {
      responseType: 'text',
      timeout: 30000,
      headers: {
        'User-Agent': 'Lavf/62.3.100',
        'Accept': '*/*',
      },
    });

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');

    let manifest = response.data as string;

    // Rewrite segment URLs to proxy through our backend
    // Pattern: /hls/TOKEN/STREAMID_SEGMENT.ts -> /api/xtream-proxy/segment/STREAMID/TOKEN/STREAMID_SEGMENT.ts
    manifest = manifest.replace(/^(\/)?hls\/([^\/]+)\/(.+\.ts)$/gm, (match, slash, token, filename) => {
      return `/api/xtream-proxy/segment/${cleanStreamId}/${token}/${filename}`;
    });

    console.log('✅ [XTREAM STREAM] Manifest rewritten and sent');
    res.send(manifest);

  } catch (error: any) {
    console.error('❌ [XTREAM STREAM] Error:', error.message);
    res.status(500).json({ error: 'Failed to proxy stream', details: error.message });
  }
});

// GET /api/xtream-proxy/segment/:streamId/:token/:filename - Proxy HLS segments
router.get('/segment/:streamId/:token/:filename', async (req: Request, res: Response) => {
  try {
    const { streamId, token, filename } = req.params;
    const userId = (req as any).userId;

    console.log('📦 [XTREAM SEGMENT] Request:', filename);

    // Get provider for this user
    const providerResult = await pool.query(
      'SELECT * FROM providers WHERE user_id = $1 AND type = $2 AND is_active = true LIMIT 1',
      [userId, 'xtream']
    );

    if (providerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Xtreme Codes provider not found' });
    }

    const provider = providerResult.rows[0];

    if (!provider.server_url || !provider.username || !provider.password) {
      return res.status(400).json({ error: 'Provider configuration incomplete' });
    }

    const baseUrl = provider.server_url.replace(/\/player_api\.php.*$/, '');
    const segmentUrl = `${baseUrl}/hls/${token}/${filename}`;

    console.log('📤 [XTREAM SEGMENT] Fetching from:', segmentUrl);

    // Proxy segment with proper headers
    const response = await axios.get(segmentUrl, {
      responseType: 'stream',
      timeout: 30000,
      headers: {
        'User-Agent': 'Lavf/62.3.100',
        'Accept': '*/*',
        'Range': req.headers.range || 'bytes=0-',
      },
    });

    // Set CORS and content headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
    res.setHeader('Content-Type', response.headers['content-type'] || 'video/mp2t');

    if (response.headers['content-length']) {
      res.setHeader('Content-Length', response.headers['content-length']);
    }

    res.status(response.status);
    response.data.pipe(res);

    response.data.on('error', (error: any) => {
      console.error('❌ [XTREAM SEGMENT] Stream error:', error.message);
    });

  } catch (error: any) {
    console.error('❌ [XTREAM SEGMENT] Error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to proxy segment', details: error.message });
    }
  }
});

// OPTIONS handlers for CORS preflight
router.options('/stream/:streamId', (req: Request, res: Response) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.status(204).send();
});

router.options('/segment/:streamId/:token/:filename', (req: Request, res: Response) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
  res.status(204).send();
});

export default router;
