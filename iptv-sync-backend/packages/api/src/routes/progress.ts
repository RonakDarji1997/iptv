import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { authMiddleware } from '../middleware/auth';

export const createProgressRouter = (pool: Pool) => {
  const router = Router();
  
  // GET /progress - Get all watch progress for user
  router.get('/', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { userId } = (req as any).user;

      const result = await pool.query(
        `SELECT * FROM watch_progress 
         WHERE user_id = $1 
         ORDER BY last_watched_at DESC`,
        [userId]
      );
      
      res.json({ 
        success: true, 
        progress: result.rows 
      });
      
    } catch (error) {
      console.error('❌ Progress list error:', error);
      res.status(500).json({ error: 'Failed to get progress' });
    }
  });
  
  // GET /progress/:contentId - Get watch progress for specific content
  router.get('/:contentId', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { userId } = (req as any).user;
      const { contentId } = req.params;

      const result = await pool.query(
        'SELECT * FROM watch_progress WHERE user_id = $1 AND content_id = $2',
        [userId, contentId]
      );
      
      res.json({ 
        success: true, 
        progress: result.rows[0] || null 
      });
      
    } catch (error) {
      console.error('❌ Progress get error:', error);
      res.status(500).json({ error: 'Failed to get progress' });
    }
  });
  
  // POST /progress - Save/update watch progress (new format)
  router.post('/', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { userId } = (req as any).user;
      const { 
        contentId, 
        contentType,
        contentName,
        contentPoster,
        seriesId,
        seasonNumber,
        episodeNumber,
        currentPosition, 
        duration
      } = req.body;
      
      console.log('📥 [Progress POST] Request:', {
        userId,
        contentId,
        contentType,
        contentName,
        seriesId,
        currentPosition,
        duration,
        percentage: duration ? `${((currentPosition / duration) * 100).toFixed(1)}%` : 'N/A'
      });
      
      if (!contentId || currentPosition === undefined || !duration) {
        console.error('❌ [Progress POST] Missing fields');
        return res.status(400).json({ error: 'contentId, currentPosition, and duration are required' });
      }

      const result = await pool.query(
        `INSERT INTO watch_progress (
          user_id, content_id, content_type, content_name, content_poster,
          series_id, season_number, episode_number,
          current_position, duration, last_watched_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        ON CONFLICT (user_id, content_id, content_type) 
        DO UPDATE SET 
          content_name = EXCLUDED.content_name,
          content_poster = EXCLUDED.content_poster,
          series_id = EXCLUDED.series_id,
          season_number = EXCLUDED.season_number,
          episode_number = EXCLUDED.episode_number,
          current_position = EXCLUDED.current_position,
          duration = EXCLUDED.duration,
          last_watched_at = NOW()
        RETURNING *`,
        [userId, contentId, (contentType || 'movie').toUpperCase(), contentName, contentPoster, seriesId, seasonNumber, episodeNumber, currentPosition, duration]
      );
      
      console.log('✅ [Progress POST] Saved:', result.rows[0]);

      res.json({ success: true });
      
    } catch (error) {
      console.error('❌ Progress save error:', error);
      res.status(500).json({ error: 'Failed to save progress' });
    }
  });
  
  // POST /progress/update - Update watch progress (legacy format for compatibility)
  router.post('/update', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { userId } = (req as any).user;
      const { 
        contentId, 
        contentType,
        contentName,
        contentPoster,
        providerId,
        position, 
        duration,
        completed 
      } = req.body;
      
      if (!contentId) {
        return res.status(400).json({ error: 'Content ID required' });
      }

      await pool.query(
        `INSERT INTO watch_progress (
          user_id, content_id, content_type, content_name, content_poster,
          current_position, duration, last_watched_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (user_id, content_id, content_type) 
        DO UPDATE SET 
          content_name = EXCLUDED.content_name,
          content_poster = EXCLUDED.content_poster,
          current_position = EXCLUDED.current_position,
          duration = EXCLUDED.duration,
          last_watched_at = NOW()`,
        [userId, contentId, (contentType || 'movie').toUpperCase(), contentName, contentPoster, position || 0, duration || 0]
      );
      
      res.json({ success: true });
      
    } catch (error) {
      console.error('❌ Progress update error:', error);
      res.status(500).json({ error: 'Failed to update progress' });
    }
  });

  // DELETE /progress/:id - Delete watch progress by ID
  router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { userId } = (req as any).user;
      const { id } = req.params;

      const result = await pool.query(
        'DELETE FROM watch_progress WHERE id = $1 AND user_id = $2 RETURNING *',
        [id, userId]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Progress not found' });
      }

      console.log('✅ [Progress DELETE] Deleted:', id);
      res.json({ success: true });
      
    } catch (error) {
      console.error('❌ Progress delete error:', error);
      res.status(500).json({ error: 'Failed to delete progress' });
    }
  });
  
  return router;
};
