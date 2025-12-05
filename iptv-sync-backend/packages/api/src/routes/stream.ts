import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { authMiddleware } from '../middleware/auth';

const router = Router();

export const createStreamRouter = (pool: Pool) => {
  
  // POST /api/stream/start - Start streaming session
  router.post('/start', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { userId, deviceId } = (req as any).user;
      const { contentId, contentType, streamUrl } = req.body;

      if (!contentId || !contentType) {
        return res.status(400).json({ 
          error: 'Content ID and type required' 
        });
      }

      const client = await pool.connect();
      
      try {
        // Create streaming session
        const result = await client.query(
          `INSERT INTO active_sessions (
            user_id, device_id, content_id, content_type, stream_url
          )
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *`,
          [userId, deviceId, contentId, contentType, streamUrl]
        );
        
        console.log(`✅ Stream started: ${contentType} ${contentId}`);
        
        res.json({ 
          success: true, 
          session: result.rows[0] 
        });
        
      } finally {
        client.release();
      }
      
    } catch (error) {
      console.error('❌ Stream start error:', error);
      res.status(500).json({ error: 'Failed to start stream' });
    }
  });
  
  // POST /api/stream/heartbeat - Update session heartbeat
  router.post('/heartbeat', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { userId, deviceId } = (req as any).user;
      const { sessionId } = req.body;

      if (!sessionId) {
        return res.status(400).json({ error: 'Session ID required' });
      }

      await pool.query(
        `UPDATE active_sessions 
         SET last_heartbeat_at = NOW()
         WHERE id = $1 AND user_id = $2 AND device_id = $3`,
        [sessionId, userId, deviceId]
      );
      
      res.json({ success: true });
      
    } catch (error) {
      console.error('❌ Heartbeat error:', error);
      res.status(500).json({ error: 'Heartbeat failed' });
    }
  });
  
  // POST /api/stream/end - End streaming session
  router.post('/end', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { userId, deviceId } = (req as any).user;
      const { sessionId } = req.body;

      if (!sessionId) {
        return res.status(400).json({ error: 'Session ID required' });
      }

      await pool.query(
        `UPDATE active_sessions 
         SET ended_at = NOW()
         WHERE id = $1 AND user_id = $2 AND device_id = $3`,
        [sessionId, userId, deviceId]
      );
      
      console.log(`✅ Stream ended: session ${sessionId}`);
      
      res.json({ success: true });
      
    } catch (error) {
      console.error('❌ Stream end error:', error);
      res.status(500).json({ error: 'Failed to end stream' });
    }
  });
  
  return router;
};
