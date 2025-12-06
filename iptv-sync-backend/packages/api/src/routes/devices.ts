import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { authMiddleware } from '../middleware/auth';

export const createDevicesRouter = (pool: Pool) => {
  const router = Router();
  
  // GET /api/devices/list - Get all user devices
  router.get('/list', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { userId } = (req as any).user;

      const result = await pool.query(
        'SELECT * FROM devices WHERE user_id = $1 ORDER BY last_active_at DESC',
        [userId]
      );
      
      res.json({ 
        success: true, 
        devices: result.rows 
      });
      
    } catch (error) {
      console.error('❌ Device list error:', error);
      res.status(500).json({ error: 'Failed to get devices' });
    }
  });
  
  return router;
};
