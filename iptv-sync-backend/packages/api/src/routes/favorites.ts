import { Router, Request, Response } from 'express';
import { Pool } from 'pg';

const router = Router();

// GET /api/favorites - Get all user favorites
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const pool: Pool = req.app.locals.db;
    
    const result = await pool.query(
      `SELECT * FROM favorites 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json({
      success: true,
      favorites: result.rows
    });
  } catch (error) {
    console.error('Error fetching favorites:', error);
    res.status(500).json({ error: 'Failed to fetch favorites' });
  }
});

// GET /api/favorites/check/:contentType/:contentId - Check if content is favorited
router.get('/check/:contentType/:contentId', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { contentType, contentId } = req.params;
    const pool: Pool = req.app.locals.db;
    
    const result = await pool.query(
      `SELECT id FROM favorites 
       WHERE user_id = $1 AND content_type = $2 AND content_id = $3`,
      [userId, contentType.toUpperCase(), contentId]
    );

    res.json({
      success: true,
      isFavorite: result.rows.length > 0,
      favoriteId: result.rows[0]?.id || null
    });
  } catch (error) {
    console.error('Error checking favorite:', error);
    res.status(500).json({ error: 'Failed to check favorite' });
  }
});

// POST /api/favorites - Add to favorites
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { contentType, contentId, contentName, contentPoster, providerId, categoryId, metadata } = req.body;
    
    if (!contentType || !contentId || !contentName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const pool: Pool = req.app.locals.db;
    
    const result = await pool.query(
      `INSERT INTO favorites 
       (user_id, content_type, content_id, content_name, content_poster, provider_id, category_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, content_type, content_id) DO UPDATE SET
         content_name = $4,
         content_poster = $5,
         metadata = $8,
         created_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [userId, contentType.toUpperCase(), contentId, contentName, contentPoster || null, providerId || null, categoryId || null, metadata || {}]
    );

    res.status(201).json({
      success: true,
      message: 'Added to favorites',
      favorite: result.rows[0]
    });
  } catch (error) {
    console.error('Error adding favorite:', error);
    res.status(500).json({ error: 'Failed to add favorite' });
  }
});

// DELETE /api/favorites/:id - Remove from favorites
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    const pool: Pool = req.app.locals.db;
    
    const result = await pool.query(
      `DELETE FROM favorites 
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Favorite not found' });
    }

    res.json({
      success: true,
      message: 'Removed from favorites'
    });
  } catch (error) {
    console.error('Error removing favorite:', error);
    res.status(500).json({ error: 'Failed to remove favorite' });
  }
});

// DELETE /api/favorites/by-content/:contentType/:contentId - Remove by content
router.delete('/by-content/:contentType/:contentId', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { contentType, contentId } = req.params;
    const pool: Pool = req.app.locals.db;
    
    const result = await pool.query(
      `DELETE FROM favorites 
       WHERE user_id = $1 AND content_type = $2 AND content_id = $3
       RETURNING *`,
      [userId, contentType.toUpperCase(), contentId]
    );

    res.json({
      success: true,
      message: result.rows.length > 0 ? 'Removed from favorites' : 'Not in favorites'
    });
  } catch (error) {
    console.error('Error removing favorite:', error);
    res.status(500).json({ error: 'Failed to remove favorite' });
  }
});

export default router;
