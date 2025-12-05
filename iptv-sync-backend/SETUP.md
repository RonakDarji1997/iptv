# IPTV Sync Backend - Setup Guide

## 📋 Prerequisites

- Node.js 18+ installed
- PostgreSQL 15+ installed (or Docker)
- Redis 7+ installed (or Docker)
- Git installed

## 🚀 Quick Setup

### 1. Clone and Install

```bash
cd /Users/ronika/Desktop/iptv/iptv-sync-backend
npm install
```

### 2. Environment Configuration

```bash
cp .env.example .env
```

Edit `.env` and update these critical values:
- `DB_PASSWORD` - Your PostgreSQL password
- `REDIS_PASSWORD` - Your Redis password (optional)
- `JWT_SECRET` - Random secret key for JWT tokens
- `JWT_REFRESH_SECRET` - Different random secret for refresh tokens

### 3. Start Database Services

#### Option A: Using Docker (Recommended)

```bash
docker-compose up -d postgres redis
```

#### Option B: Local Installation

Make sure PostgreSQL and Redis are running on your system.

### 4. Run Database Migrations

```bash
npm run db:migrate
```

This will create all tables, indexes, and seed initial data.

### 5. Start Development Server

```bash
npm run dev
```

The API will be available at `http://localhost:3000`

### 6. Verify Installation

```bash
curl http://localhost:3000/health
```

You should see:
```json
{
  "status": "ok",
  "timestamp": "2025-12-04T...",
  "uptime": 1.234,
  "database": "connected",
  "redis": "connected"
}
```

## 🔧 Configuration

### Database Connection

The application uses these environment variables for database connection:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=iptv_sync
DB_USER=postgres
DB_PASSWORD=your_password
```

### Redis Connection

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

### JWT Configuration

Generate secure random strings for production:

```bash
# Generate random secrets
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Use these for:
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`

## 📦 Project Structure

```
packages/
├── api/                    # Express API server
│   ├── src/
│   │   ├── routes/        # API routes
│   │   ├── controllers/   # Request handlers
│   │   ├── middleware/    # Auth, validation, etc.
│   │   ├── services/      # Business logic
│   │   └── utils/         # Helper functions
│   └── package.json
├── database/              # Database layer
│   ├── migrations/        # SQL migrations
│   ├── seeds/            # Seed data
│   └── package.json
├── shared/               # Shared utilities
│   └── package.json
└── types/                # TypeScript types
    └── package.json
```

## 🧪 Testing

### Test Registration

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123!"
  }'
```

### Test Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123!"
  }'
```

Save the returned `accessToken` and use it for authenticated requests:

```bash
curl -X GET http://localhost:3000/api/devices \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## 🔐 Security Checklist

### Development
- [x] JWT secrets set
- [x] Database password changed
- [x] Redis password set (optional)
- [x] CORS configured for localhost

### Production
- [ ] Use strong random JWT secrets (64+ characters)
- [ ] Enable HTTPS/TLS
- [ ] Set strong database passwords
- [ ] Configure CORS for your domain only
- [ ] Enable Redis password
- [ ] Set `NODE_ENV=production`
- [ ] Configure rate limiting
- [ ] Set up monitoring and logging
- [ ] Regular database backups
- [ ] Firewall configuration

## 📊 Database Management

### View Database Schema

```bash
# Connect to PostgreSQL
docker exec -it iptv-sync-postgres psql -U postgres -d iptv_sync

# List tables
\dt

# View table structure
\d users

# View active sessions
SELECT * FROM v_active_user_sessions;
```

### Create New Migration

```bash
npm run db:migrate:create -- add_new_feature
```

### Reset Database (⚠️ Danger - Deletes all data)

```bash
npm run db:reset
```

## 🐳 Docker Commands

### Start all services

```bash
docker-compose up -d
```

### View logs

```bash
# All services
docker-compose logs -f

# API only
docker-compose logs -f api

# Database only
docker-compose logs -f postgres
```

### Restart services

```bash
docker-compose restart api
```

### Stop all services

```bash
docker-compose down
```

### Remove all data (⚠️ Danger)

```bash
docker-compose down -v
```

## 🔍 Troubleshooting

### Port already in use

If port 3000, 5432, or 6379 is in use:

```bash
# Find process using port
lsof -i :3000

# Kill process
kill -9 <PID>
```

Or change ports in `.env` and `docker-compose.yml`.

### Database connection failed

1. Check if PostgreSQL is running:
```bash
docker-compose ps postgres
```

2. Check credentials in `.env`

3. Test connection:
```bash
psql -h localhost -U postgres -d iptv_sync
```

### Redis connection failed

1. Check if Redis is running:
```bash
docker-compose ps redis
```

2. Test connection:
```bash
redis-cli -h localhost ping
```

## 📱 Android App Integration

### 1. Update Android App Configuration

In your Android app, add the backend URL:

```kotlin
// Constants.kt
const val SYNC_BACKEND_URL = "http://your-server-ip:3000/api"
```

### 2. Implement Sync Client

```kotlin
// SyncService.kt
class SyncService(private val context: Context) {
    private val retrofit = Retrofit.Builder()
        .baseUrl(SYNC_BACKEND_URL)
        .addConverterFactory(GsonConverterFactory.create())
        .build()
    
    suspend fun registerUser(email: String, password: String) {
        // Call /api/auth/register
    }
    
    suspend fun syncProviders(providers: List<Provider>) {
        // Call /api/sync/providers
    }
}
```

### 3. Sync on Provider Changes

```kotlin
// In PortalSetupActivity after saveStalkerConfig()
lifecycleScope.launch {
    val syncService = SyncService(context)
    syncService.syncProviders(listOf(newProvider))
}
```

## 🌐 API Endpoints Reference

See [API Documentation](./docs/API.md) for complete endpoint reference.

### Quick Reference

- **Auth**: `/api/auth/*`
  - POST `/register` - Register user
  - POST `/login` - Login
  - POST `/logout` - Logout
  - GET `/verify` - Verify token

- **Sync**: `/api/sync/*`
  - GET `/pull` - Pull all data
  - POST `/push` - Push updates
  - POST `/providers` - Sync providers
  - POST `/categories` - Sync categories

- **Devices**: `/api/devices/*`
  - GET `/` - List devices
  - POST `/register` - Register device
  - DELETE `/:id` - Remove device

- **Stream**: `/api/stream/*`
  - POST `/start` - Start stream
  - POST `/heartbeat` - Send heartbeat
  - POST `/end` - End stream

## 📈 Monitoring

### Health Check

```bash
curl http://localhost:3000/health
```

### View Active Sessions

```bash
curl -X GET http://localhost:3000/api/stream/active \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Database Stats

```sql
-- Total users
SELECT COUNT(*) FROM users;

-- Active devices per user
SELECT user_id, COUNT(*) FROM devices WHERE is_active = true GROUP BY user_id;

-- Active streams
SELECT COUNT(*) FROM active_sessions WHERE is_active = true;
```

## 🚀 Deployment

See [DEPLOYMENT.md](./docs/DEPLOYMENT.md) for production deployment guide.

## 📞 Support

For issues or questions, please open a GitHub issue or contact support.
