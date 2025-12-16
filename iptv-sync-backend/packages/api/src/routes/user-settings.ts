import { Router, Request, Response } from 'express';
import { Pool } from 'pg';

const router = Router();

// GET /api/user-settings - Get user settings
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const pool: Pool = req.app.locals.db;

    const result = await pool.query(
      `SELECT * FROM user_settings WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      // Create default settings
      const newSettings = await pool.query(
        `INSERT INTO user_settings (user_id) VALUES ($1) RETURNING *`,
        [userId]
      );
      return res.json({
        success: true,
        settings: newSettings.rows[0]
      });
    }

    res.json({
      success: true,
      settings: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching user settings:', error);
    res.status(500).json({ error: 'Failed to fetch user settings' });
  }
});

// PUT /api/user-settings - Update user settings
router.put('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      autoStartEnabled,
      autoStartType,
      autoStartChannelId,
      autoStartCategoryId,
      favoriteChannelId,
      preferences
    } = req.body;

    const pool: Pool = req.app.locals.db;

    // Upsert settings
    const result = await pool.query(
      `INSERT INTO user_settings 
       (user_id, auto_start_enabled, auto_start_type, auto_start_channel_id, auto_start_category_id, favorite_channel_id, preferences)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id) DO UPDATE SET
         auto_start_enabled = COALESCE($2, user_settings.auto_start_enabled),
         auto_start_type = COALESCE($3, user_settings.auto_start_type),
         auto_start_channel_id = COALESCE($4, user_settings.auto_start_channel_id),
         auto_start_category_id = COALESCE($5, user_settings.auto_start_category_id),
         favorite_channel_id = COALESCE($6, user_settings.favorite_channel_id),
         preferences = COALESCE($7, user_settings.preferences),
         updated_at = NOW()
       RETURNING *`,
      [userId, autoStartEnabled, autoStartType, autoStartChannelId, autoStartCategoryId, favoriteChannelId, preferences]
    );

    res.json({
      success: true,
      settings: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating user settings:', error);
    res.status(500).json({ error: 'Failed to update user settings' });
  }
});

// PATCH /api/user-settings/auto-start - Update auto-start settings specifically
router.patch('/auto-start', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { enabled, type, channelId, categoryId } = req.body;
    const pool: Pool = req.app.locals.db;

    const result = await pool.query(
      `INSERT INTO user_settings 
       (user_id, auto_start_enabled, auto_start_type, auto_start_channel_id, auto_start_category_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET
         auto_start_enabled = $2,
         auto_start_type = $3,
         auto_start_channel_id = $4,
         auto_start_category_id = $5,
         updated_at = NOW()
       RETURNING *`,
      [userId, enabled, type, channelId, categoryId]
    );

    res.json({
      success: true,
      settings: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating auto-start settings:', error);
    res.status(500).json({ error: 'Failed to update auto-start settings' });
  }
});

// POST /api/user-settings/favorite-channel - Set favorite channel
router.post('/favorite-channel', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { channelId } = req.body;
    if (!channelId) {
      return res.status(400).json({ error: 'channelId is required' });
    }

    const pool: Pool = req.app.locals.db;

    const result = await pool.query(
      `INSERT INTO user_settings (user_id, favorite_channel_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET
         favorite_channel_id = $2,
         updated_at = NOW()
       RETURNING *`,
      [userId, channelId]
    );

    res.json({
      success: true,
      settings: result.rows[0]
    });
  } catch (error) {
    console.error('Error setting favorite channel:', error);
    res.status(500).json({ error: 'Failed to set favorite channel' });
  }
});

export default router;
