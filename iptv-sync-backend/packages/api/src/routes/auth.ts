import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';

const router = Router();

// POST /api/auth/register - Register or login user
export const createAuthRouter = (pool: Pool) => {
  
  router.post('/register', async (req: Request, res: Response) => {
    try {
      const { email, password, deviceId, deviceName, deviceModel } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ 
          error: 'Email and password are required' 
        });
      }

      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        
        // Check if user exists
        const userResult = await client.query(
          'SELECT * FROM users WHERE email = $1',
          [email]
        );
        
        let userId: string;
        let isNewUser = false;
        
        if (userResult.rows.length === 0) {
          // Create new user
          const hashedPassword = await bcrypt.hash(password, 10);
          const newUserResult = await client.query(
            `INSERT INTO users (email, password_hash, subscription_plan_id)
             VALUES ($1, $2, (SELECT id FROM subscription_plans WHERE name = 'Free'))
             RETURNING id`,
            [email, hashedPassword]
          );
          userId = newUserResult.rows[0].id;
          isNewUser = true;
          
          console.log(`✅ New user registered: ${email}`);
        } else {
          // Validate password
          const user = userResult.rows[0];
          const validPassword = await bcrypt.compare(password, user.password_hash);
          
          if (!validPassword) {
            await client.query('ROLLBACK');
            return res.status(401).json({ error: 'Invalid credentials' });
          }
          
          userId = user.id;
          console.log(`✅ User logged in: ${email}`);
        }
        
        // Register or update device
        let device;
        if (deviceId) {
          const deviceResult = await client.query(
            `INSERT INTO devices (device_id, user_id, device_name, device_model, device_type, platform, last_active)
             VALUES ($1, $2, $3, $4, 'TV', 'Android', NOW())
             ON CONFLICT (user_id, device_id) 
             DO UPDATE SET last_active = NOW(), device_name = EXCLUDED.device_name, device_model = EXCLUDED.device_model
             RETURNING *`,
            [deviceId, userId, deviceName || 'Android TV', deviceModel || 'Unknown']
          );
          device = deviceResult.rows[0];
        }
        
        // Generate tokens
        const jwtSecret = process.env.JWT_SECRET || 'default-secret';
        const refreshSecret = process.env.JWT_REFRESH_SECRET || 'default-refresh-secret';
        
        const accessToken = jwt.sign(
          { userId, email, deviceId },
          jwtSecret,
          { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );
        
        const refreshToken = jwt.sign(
          { userId },
          refreshSecret,
          { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
        );
        
        // Store refresh token (use device.id UUID, not deviceId string)
        if (device) {
          await client.query(
            `INSERT INTO refresh_tokens (user_id, token, device_id, expires_at)
             VALUES ($1, $2, $3, NOW() + INTERVAL '30 days')`,
            [userId, refreshToken, device.id]
          );
        }
        
        await client.query('COMMIT');
        
        res.json({
          success: true,
          accessToken,
          refreshToken,
          userId,
          deviceId: device?.device_id,
          isNewUser
        });
        
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      
    } catch (error) {
      console.error('❌ Registration error:', error);
      res.status(500).json({ error: 'Registration failed' });
    }
  });
  
  // POST /api/auth/refresh - Refresh access token
  router.post('/refresh', async (req: Request, res: Response) => {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        return res.status(400).json({ error: 'Refresh token required' });
      }
      
      // Verify refresh token
      const decoded: any = jwt.verify(
        refreshToken, 
        process.env.JWT_REFRESH_SECRET || 'default-refresh-secret'
      );
      
      // Check if token exists in database
      const result = await pool.query(
        `SELECT rt.*, u.email FROM refresh_tokens rt
         JOIN users u ON rt.user_id = u.id
         WHERE rt.token = $1 AND rt.is_revoked = false AND rt.expires_at > NOW()`,
        [refreshToken]
      );
      
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid refresh token' });
      }
      
      const { user_id, email, device_id } = result.rows[0];
      
      // Generate new access token
      const accessToken = jwt.sign(
        { userId: user_id, email, deviceId: device_id },
        process.env.JWT_SECRET || 'default-secret',
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );
      
      res.json({ success: true, accessToken });
      
    } catch (error) {
      console.error('❌ Token refresh error:', error);
      res.status(401).json({ error: 'Invalid refresh token' });
    }
  });
  
  return router;
};
