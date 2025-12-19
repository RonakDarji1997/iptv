import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { Pool } from 'pg';
import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'iptv_sync',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: parseInt(process.env.DB_POOL_MAX || '10'),
  min: parseInt(process.env.DB_POOL_MIN || '2'),
});

// Redis connection
const redis = createClient({
  url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
  password: process.env.REDIS_PASSWORD || undefined,
});

redis.connect().catch(console.error);

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || '*',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Rate limiting - DISABLED for fast rendering
// const limiter = rateLimit({
//   windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
//   max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '300'),
//   message: 'Too many requests from this IP, please try again later.',
//   standardHeaders: true,
//   legacyHeaders: false,
// });
// app.use('/api/', limiter);
console.log('⚡ Rate limiting DISABLED for maximum performance');

// Health check
app.get('/health', async (req: Request, res: Response) => {
  try {
    await pool.query('SELECT 1');
    const redisOk = redis.isOpen;
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: 'connected',
      redis: redisOk ? 'connected' : 'disconnected',
      version: '1.0.0',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Health check failed',
    });
  }
});

// Import routes
import { createAuthRouter } from './routes/auth';
import { createSyncRouter } from './routes/sync';
import { createDevicesRouter } from './routes/devices';
import { createStreamRouter } from './routes/stream';
import { createProgressRouter } from './routes/progress';
import { createStalkerProxyRouter } from './routes/stalker-proxy';
import { createTvLinkRouter } from './routes/tv-link';
import favoritesRouter from './routes/favorites';
import watchHistoryRouter from './routes/watch-history';
import parentalControlRouter from './routes/parental-control';
import channelAnalyticsRouter from './routes/channel-analytics';
import userSettingsRouter from './routes/user-settings';
import { authMiddleware } from './middleware/auth';

// Conditional auth middleware that skips certain endpoints
const conditionalAuth = (req: Request, res: Response, next: NextFunction) => {
  // Skip auth for image proxy (uses token in query)
  if (req.path === '/image') {
    return next();
  }
  // Skip auth for setup endpoints (used before user has provider)
  if (req.path === '/handshake' || req.path === '/profile' || req.path === '/fetch-categories') {
    return next();
  }
  return authMiddleware(req, res, next);
};

// Mount all routes under /api prefix for nginx compatibility
const apiRouter = express.Router();

apiRouter.use('/auth', createAuthRouter(pool));
apiRouter.use('/sync', authMiddleware, createSyncRouter(pool));
apiRouter.use('/devices', authMiddleware, createDevicesRouter(pool));
apiRouter.use('/stream', authMiddleware, createStreamRouter(pool));
apiRouter.use('/progress', authMiddleware, createProgressRouter(pool));
apiRouter.use('/stalker-proxy', conditionalAuth, createStalkerProxyRouter(pool));
apiRouter.use('/tv', createTvLinkRouter(pool)); // TV linking endpoints (no auth for initial link)

// New routes
app.locals.db = pool; // Make pool available to new route handlers
apiRouter.use('/favorites', authMiddleware, favoritesRouter);
apiRouter.use('/watch-history', authMiddleware, watchHistoryRouter);
apiRouter.use('/parental-control', authMiddleware, parentalControlRouter);
apiRouter.use('/channel-analytics', authMiddleware, channelAnalyticsRouter);
apiRouter.use('/user-settings', authMiddleware, userSettingsRouter);

// Mount all API routes under /api
app.use('/api', apiRouter);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Start server
app.listen(port, "0.0.0.0", () => {
  console.log(`🚀 IPTV Sync API running on port ${port}`);
  console.log(`📊 Health check: http://localhost:${port}/health`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await pool.end();
  await redis.quit();
  process.exit(0);
});

export { pool, redis };
