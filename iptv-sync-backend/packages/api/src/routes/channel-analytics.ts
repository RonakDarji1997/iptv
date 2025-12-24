import { Router, Request, Response } from 'express';
import { Pool } from 'pg';

const router = Router();

// POST /api/channel-analytics/track - Track channel play
router.post('/track', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      channelId,
      channelName,
      channelLogo,
      channelCmd,
      channelNumber,
      categoryId,
      categoryName,
      providerId,
      watchTime = 0
    } = req.body;

    if (!channelId || !channelName) {
      return res.status(400).json({ error: 'Missing required fields: channelId, channelName' });
    }

    const pool: Pool = req.app.locals.db;

    // Insert or update channel analytics
    const result = await pool.query(
      `INSERT INTO channel_analytics 
       (user_id, provider_id, channel_id, channel_name, channel_logo, category_id, category_name, 
        channel_cmd, channel_number, play_count, total_watch_time, last_watched_at, first_watched_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $10, NOW(), NOW())
       ON CONFLICT (user_id, provider_id, channel_id) 
       DO UPDATE SET
         play_count = channel_analytics.play_count + 1,
         total_watch_time = channel_analytics.total_watch_time + $10,
         last_watched_at = NOW(),
         channel_name = $4,
         channel_logo = $5,
         category_id = $6,
         category_name = $7,
         channel_cmd = $8,
         channel_number = $9,
         updated_at = NOW()
       RETURNING *`,
      [userId, providerId, channelId, channelName, channelLogo, categoryId, categoryName, channelCmd, channelNumber, watchTime]
    );

    res.json({
      success: true,
      analytics: result.rows[0]
    });
  } catch (error) {
    console.error('Error tracking channel play:', error);
    res.status(500).json({ error: 'Failed to track channel play' });
  }
});

// GET /api/channel-analytics/top - Get top played channels
router.get('/top', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { limit = '10' } = req.query;
    const pool: Pool = req.app.locals.db;

    const result = await pool.query(
      `SELECT * FROM channel_analytics 
       WHERE user_id = $1 
       ORDER BY play_count DESC, last_watched_at DESC
       LIMIT $2`,
      [userId, parseInt(limit as string)]
    );

    res.json({
      success: true,
      channels: result.rows
    });
  } catch (error) {
    console.error('Error fetching top channels:', error);
    res.status(500).json({ error: 'Failed to fetch top channels' });
  }
});

// GET /api/channel-analytics/recent - Get recently played channels
router.get('/recent', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { limit = '10' } = req.query;
    const pool: Pool = req.app.locals.db;

    const result = await pool.query(
      `SELECT * FROM channel_analytics 
       WHERE user_id = $1 
       ORDER BY last_watched_at DESC
       LIMIT $2`,
      [userId, parseInt(limit as string)]
    );

    res.json({
      success: true,
      channels: result.rows
    });
  } catch (error) {
    console.error('Error fetching recent channels:', error);
    res.status(500).json({ error: 'Failed to fetch recent channels' });
  }
});

// GET /api/channel-analytics/stats - Get overall statistics
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const pool: Pool = req.app.locals.db;

    const result = await pool.query(
      `SELECT 
         COUNT(*) as total_channels_watched,
         SUM(play_count) as total_plays,
         SUM(total_watch_time) as total_watch_time,
         MAX(last_watched_at) as last_activity
       FROM channel_analytics 
       WHERE user_id = $1`,
      [userId]
    );

    res.json({
      success: true,
      stats: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching analytics stats:', error);
    res.status(500).json({ error: 'Failed to fetch analytics stats' });
  }
});

// GET /api/channel-analytics/channel/:channelId - Get specific channel analytics
router.get('/channel/:channelId', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { channelId } = req.params;
    const pool: Pool = req.app.locals.db;

    const result = await pool.query(
      `SELECT * FROM channel_analytics 
       WHERE user_id = $1 AND channel_id = $2`,
      [userId, channelId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Channel analytics not found' });
    }

    res.json({
      success: true,
      analytics: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching channel analytics:', error);
    res.status(500).json({ error: 'Failed to fetch channel analytics' });
  }
});

// DELETE /api/channel-analytics/:id - Delete specific channel analytics by ID
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    const pool: Pool = req.app.locals.db;

    const result = await pool.query(
      'DELETE FROM channel_analytics WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Channel analytics not found' });
    }

    console.log('✅ [Channel Analytics DELETE] Deleted:', id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting channel analytics:', error);
    res.status(500).json({ error: 'Failed to delete channel analytics' });
  }
});

// DELETE /api/channel-analytics - Delete all channel analytics for user
router.delete('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const pool: Pool = req.app.locals.db;

    const result = await pool.query(
      'DELETE FROM channel_analytics WHERE user_id = $1',
      [userId]
    );

    console.log('✅ [Channel Analytics DELETE ALL] Deleted', result.rowCount, 'records for user:', userId);
    res.json({ success: true, deletedCount: result.rowCount });
  } catch (error) {
    console.error('Error deleting all channel analytics:', error);
    res.status(500).json({ error: 'Failed to delete channel analytics' });
  }
});

export default router;
