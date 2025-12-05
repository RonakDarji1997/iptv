import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { authMiddleware } from '../middleware/auth';

const router = Router();

export const createProgressRouter = (pool: Pool) => {
  
  // GET /api/progress/:contentId - Get watch progress for content
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
  
  // POST /api/progress/update - Update watch progress
  router.post('/update', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { userId } = (req as any).user;
      const { 
        contentId, 
        contentType, 
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
          user_id, content_id, content_type, provider_id,
          position, duration, completed
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (user_id, content_id, provider_id) 
        DO UPDATE SET 
          position = EXCLUDED.position,
          duration = EXCLUDED.duration,
          completed = EXCLUDED.completed,
          updated_at = NOW()`,
        [userId, contentId, contentType, providerId, position, duration, completed || false]
      );
      
      res.json({ success: true });
      
    } catch (error) {
      console.error('❌ Progress update error:', error);
      res.status(500).json({ error: 'Failed to update progress' });
    }
  });
  
  return router;
};
