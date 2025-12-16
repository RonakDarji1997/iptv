import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';

const router = Router();

// POST /api/parental-control/set-pin - Set or update parental PIN
router.post('/set-pin', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { pin, currentPin } = req.body;

    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return res.status(400).json({ error: 'PIN must be 4 digits' });
    }

    const pool: Pool = req.app.locals.db;
    
    // Check if user already has a PIN
    const userResult = await pool.query(
      'SELECT parental_pin FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const existingPin = userResult.rows[0].parental_pin;

    // If PIN exists, verify current PIN before allowing change
    if (existingPin) {
      if (!currentPin) {
        return res.status(400).json({ error: 'Current PIN required to change' });
      }

      const isValid = await bcrypt.compare(currentPin, existingPin);
      if (!isValid) {
        return res.status(403).json({ error: 'Current PIN is incorrect' });
      }
    }

    // Hash the new PIN
    const hashedPin = await bcrypt.hash(pin, 10);

    // Update user's parental PIN
    await pool.query(
      'UPDATE users SET parental_pin = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [hashedPin, userId]
    );

    res.json({
      success: true,
      message: existingPin ? 'Parental PIN updated' : 'Parental PIN set'
    });
  } catch (error) {
    console.error('Error setting parental PIN:', error);
    res.status(500).json({ error: 'Failed to set parental PIN' });
  }
});

// POST /api/parental-control/verify - Verify parental PIN
router.post('/verify', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { pin } = req.body;

    if (!pin || pin.length !== 4) {
      return res.status(400).json({ error: 'Invalid PIN' });
    }

    const pool: Pool = req.app.locals.db;
    
    const result = await pool.query(
      'SELECT parental_pin FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const hashedPin = result.rows[0].parental_pin;

    if (!hashedPin) {
      return res.status(400).json({ error: 'No parental PIN set' });
    }

    const isValid = await bcrypt.compare(pin, hashedPin);

    if (!isValid) {
      return res.status(403).json({
        success: false,
        error: 'Incorrect PIN'
      });
    }

    // Generate a temporary session token (valid for 1 hour)
    const sessionToken = Buffer.from(`${userId}-${Date.now()}`).toString('base64');

    res.json({
      success: true,
      message: 'PIN verified',
      sessionToken,
      expiresIn: 3600 // 1 hour in seconds
    });
  } catch (error) {
    console.error('Error verifying parental PIN:', error);
    res.status(500).json({ error: 'Failed to verify PIN' });
  }
});

// GET /api/parental-control/status - Check if parental PIN is set
router.get('/status', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const pool: Pool = req.app.locals.db;
    
    const result = await pool.query(
      'SELECT parental_pin FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const hasPin = !!result.rows[0].parental_pin;

    res.json({
      success: true,
      hasPin
    });
  } catch (error) {
    console.error('Error checking parental PIN status:', error);
    res.status(500).json({ error: 'Failed to check PIN status' });
  }
});

// DELETE /api/parental-control/remove-pin - Remove parental PIN
router.delete('/remove-pin', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { pin } = req.body;

    if (!pin) {
      return res.status(400).json({ error: 'PIN required to remove' });
    }

    const pool: Pool = req.app.locals.db;
    
    const result = await pool.query(
      'SELECT parental_pin FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const hashedPin = result.rows[0].parental_pin;

    if (!hashedPin) {
      return res.status(400).json({ error: 'No parental PIN set' });
    }

    const isValid = await bcrypt.compare(pin, hashedPin);

    if (!isValid) {
      return res.status(403).json({ error: 'Incorrect PIN' });
    }

    await pool.query(
      'UPDATE users SET parental_pin = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [userId]
    );

    res.json({
      success: true,
      message: 'Parental PIN removed'
    });
  } catch (error) {
    console.error('Error removing parental PIN:', error);
    res.status(500).json({ error: 'Failed to remove PIN' });
  }
});

export default router;
