import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { Pool } from 'pg';
import { authenticateToken } from '../middleware/auth';

/**
 * Router for managing TV device linking and cloud sync
 */
export const createTvLinkRouter = (pool: Pool) => {
  const router = Router();

  /**
   * POST /api/tv/link-account
   * Link a TV device to cloud account
   * Creates user if doesn't exist, returns cloud user ID for local sync
   */
  router.post('/link-account', async (req: Request, res: Response) => {
    try {
      const { 
        email, 
        password, 
        deviceId, 
        deviceName,
        provider 
      } = req.body;

      if (!email || !password) {
        return res.status(400).json({ 
          error: 'Email and password are required' 
        });
      }

      if (!deviceId) {
        return res.status(400).json({ 
          error: 'Device ID is required' 
        });
      }

      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        
        // Check if user exists
        const userResult = await client.query(
          'SELECT id, password_hash FROM users WHERE email = $1',
          [email]
        );
        
        let userId: string;
        let isNewUser = false;
        
        if (userResult.rows.length === 0) {
          // Create new user with cloud enabled
          const hashedPassword = await bcrypt.hash(password, 10);
          const newUserResult = await client.query(
            `INSERT INTO users (
              email, 
              password_hash, 
              cloud_enabled,
              subscription_enabled,
              subscription_plan_id
            )
            VALUES ($1, $2, true, false, (SELECT id FROM subscription_plans WHERE name = 'Free'))
            RETURNING id`,
            [email, hashedPassword]
          );
          userId = newUserResult.rows[0].id;
          isNewUser = true;
          
          console.log(`✅ New TV user created with cloud enabled: ${email}`);
        } else {
          // Validate password
          const user = userResult.rows[0];
          const validPassword = await bcrypt.compare(password, user.password_hash);
          
          if (!validPassword) {
            await client.query('ROLLBACK');
            return res.status(401).json({ error: 'Invalid credentials' });
          }
          
          userId = user.id;
          
          // Enable cloud sync for existing user
          await client.query(
            'UPDATE users SET cloud_enabled = true, updated_at = NOW() WHERE id = $1',
            [userId]
          );
          
          console.log(`✅ Cloud sync enabled for existing user: ${email}`);
        }
        
        // Register TV device
        const deviceResult = await client.query(
          `INSERT INTO devices (device_id, user_id, device_name, device_type, platform, last_active)
           VALUES ($1, $2, $3, 'TV', 'Android TV', NOW())
           ON CONFLICT (user_id, device_id) 
           DO UPDATE SET last_active = NOW(), device_name = EXCLUDED.device_name
           RETURNING id`,
          [deviceId, userId, deviceName || 'Android TV']
        );
        const deviceDbId = deviceResult.rows[0].id;
        
        // If provider info provided, sync it to cloud
        let providerId = null;
        if (provider) {
          const {
            localProviderId,
            name,
            type,
            serverUrl,
            macAddress,
            serialNumber,
            username,
            password: providerPassword,
            configuration
          } = provider;
          
          const providerResult = await client.query(
            `INSERT INTO providers (
              user_id,
              provider_id,
              name,
              type,
              server_url,
              mac_address,
              serial_number,
              username,
              password,
              configuration,
              is_active,
              is_configured
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, true)
            ON CONFLICT (user_id, provider_id)
            DO UPDATE SET
              name = EXCLUDED.name,
              server_url = EXCLUDED.server_url,
              mac_address = EXCLUDED.mac_address,
              serial_number = EXCLUDED.serial_number,
              username = EXCLUDED.username,
              password = EXCLUDED.password,
              configuration = EXCLUDED.configuration,
              synced_at = NOW(),
              updated_at = NOW()
            RETURNING id`,
            [
              userId,
              localProviderId || `tv-${deviceId}-${Date.now()}`,
              name,
              type,
              serverUrl,
              macAddress,
              serialNumber,
              username,
              providerPassword,
              configuration ? JSON.stringify(configuration) : '{}'
            ]
          );
          providerId = providerResult.rows[0].id;
        }
        
        await client.query('COMMIT');
        
        // Get user details with subscription info
        const userDetailsResult = await client.query(
          `SELECT 
            u.id,
            u.email,
            u.cloud_enabled,
            u.subscription_enabled,
            sp.name as subscription_plan
          FROM users u
          LEFT JOIN subscription_plans sp ON u.subscription_plan_id = sp.id
          WHERE u.id = $1`,
          [userId]
        );
        const userDetails = userDetailsResult.rows[0];
        
        return res.status(200).json({
          success: true,
          isNewUser,
          user: {
            cloudUserId: userDetails.id,
            email: userDetails.email,
            cloudEnabled: userDetails.cloud_enabled,
            subscriptionEnabled: userDetails.subscription_enabled,
            subscriptionPlan: userDetails.subscription_plan
          },
          device: {
            deviceDbId
          },
          provider: providerId ? {
            cloudProviderId: providerId
          } : null
        });
        
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      
    } catch (error) {
      console.error('❌ Error linking TV account:', error);
      return res.status(500).json({ 
        error: 'Failed to link TV account',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/tv/unlink-account
   * Disable cloud sync for a TV device
   */
  router.post('/unlink-account', authenticateToken, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      
      const client = await pool.connect();
      try {
        // Disable cloud sync
        await client.query(
          'UPDATE users SET cloud_enabled = false, updated_at = NOW() WHERE id = $1',
          [userId]
        );
        
        console.log(`✅ Cloud sync disabled for user: ${userId}`);
        
        return res.status(200).json({
          success: true,
          message: 'Cloud sync disabled'
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('❌ Error unlinking TV account:', error);
      return res.status(500).json({ 
        error: 'Failed to unlink account'
      });
    }
  });

  /**
   * GET /api/tv/sync-status
   * Get cloud sync status for current user
   */
  router.get('/sync-status', authenticateToken, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      
      const client = await pool.connect();
      try {
        const result = await client.query(
          `SELECT 
            u.cloud_enabled,
            u.subscription_enabled,
            sp.name as subscription_plan,
            COUNT(DISTINCT d.id) as device_count
          FROM users u
          LEFT JOIN subscription_plans sp ON u.subscription_plan_id = sp.id
          LEFT JOIN devices d ON d.user_id = u.id AND d.is_active = true
          WHERE u.id = $1
          GROUP BY u.id, u.cloud_enabled, u.subscription_enabled, sp.name`,
          [userId]
        );
        
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'User not found' });
        }
        
        return res.status(200).json({
          cloudEnabled: result.rows[0].cloud_enabled,
          subscriptionEnabled: result.rows[0].subscription_enabled,
          subscriptionPlan: result.rows[0].subscription_plan,
          deviceCount: parseInt(result.rows[0].device_count)
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('❌ Error getting sync status:', error);
      return res.status(500).json({ 
        error: 'Failed to get sync status'
      });
    }
  });

  return router;
};
