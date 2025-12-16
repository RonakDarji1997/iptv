import { Router, Request, Response } from 'express';
import { Pool } from 'pg';

const router = Router();

// GET /api/watch-history - Get watch history with pagination
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const contentType = req.query.contentType as string;

    const pool: Pool = req.app.locals.db;
    
    let query = `
      SELECT * FROM watch_history 
      WHERE user_id = $1
    `;
    const params: any[] = [userId];
    
    if (contentType) {
      query += ` AND content_type = $${params.length + 1}`;
      params.push(contentType.toUpperCase());
    }
    
    query += ` ORDER BY watched_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM watch_history WHERE user_id = $1';
    const countParams: any[] = [userId];
    if (contentType) {
      countQuery += ' AND content_type = $2';
      countParams.push(contentType.toUpperCase());
    }
    const countResult = await pool.query(countQuery, countParams);

    res.json({
      success: true,
      history: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit,
      offset
    });
  } catch (error) {
    console.error('Error fetching watch history:', error);
    res.status(500).json({ error: 'Failed to fetch watch history' });
  }
});

// POST /api/watch-history - Add watch history entry
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      contentType,
      contentId,
      contentName,
      contentPoster,
      providerId,
      categoryId,
      seriesId,
      seriesName,
      seasonNumber,
      episodeNumber,
      duration,
      watchedDuration,
      completed
    } = req.body;

    if (!contentType || !contentId || !contentName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const pool: Pool = req.app.locals.db;
    
    const result = await pool.query(
      `INSERT INTO watch_history 
       (user_id, content_type, content_id, content_name, content_poster, 
        provider_id, category_id, series_id, series_name, season_number, 
        episode_number, duration, watched_duration, completed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        userId,
        contentType.toUpperCase(),
        contentId,
        contentName,
        contentPoster || null,
        providerId || null,
        categoryId || null,
        seriesId || null,
        seriesName || null,
        seasonNumber || null,
        episodeNumber || null,
        duration || null,
        watchedDuration || null,
        completed || false
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Added to watch history',
      history: result.rows[0]
    });
  } catch (error) {
    console.error('Error adding to watch history:', error);
    res.status(500).json({ error: 'Failed to add to watch history' });
  }
});

// DELETE /api/watch-history/:id - Remove history entry
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    const pool: Pool = req.app.locals.db;
    
    const result = await pool.query(
      `DELETE FROM watch_history 
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'History entry not found' });
    }

    res.json({
      success: true,
      message: 'Removed from watch history'
    });
  } catch (error) {
    console.error('Error removing from watch history:', error);
    res.status(500).json({ error: 'Failed to remove from watch history' });
  }
});

// DELETE /api/watch-history/clear - Clear all watch history
router.delete('/clear/all', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const pool: Pool = req.app.locals.db;
    
    const result = await pool.query(
      `DELETE FROM watch_history WHERE user_id = $1`,
      [userId]
    );

    res.json({
      success: true,
      message: 'Watch history cleared',
      deletedCount: result.rowCount || 0
    });
  } catch (error) {
    console.error('Error clearing watch history:', error);
    res.status(500).json({ error: 'Failed to clear watch history' });
  }
});

// GET /api/watch-history/stats - Get watch statistics
router.get('/stats/summary', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const pool: Pool = req.app.locals.db;
    
    const result = await pool.query(
      `SELECT 
        content_type,
        COUNT(*) as count,
        SUM(CASE WHEN completed THEN 1 ELSE 0 END) as completed_count,
        SUM(watched_duration) as total_watched_seconds
       FROM watch_history 
       WHERE user_id = $1
       GROUP BY content_type`,
      [userId]
    );

    res.json({
      success: true,
      stats: result.rows
    });
  } catch (error) {
    console.error('Error fetching watch stats:', error);
    res.status(500).json({ error: 'Failed to fetch watch stats' });
  }
});

export default router;
