# IPTV Sync Backend - Project Summary

## 🎯 Overview

A production-ready Node.js backend for synchronizing IPTV data across multiple devices with device management, concurrent stream control, and subscription plans.

## ✨ Key Features Implemented

### 1. **Multi-Device Synchronization**
- Sync providers, categories, channels, and settings across TV, Mobile, and Web
- Real-time data sync when providers/categories are added or modified
- Crash recovery - users can retrieve all data after app reinstall
- Watch progress sync for "Continue Watching" feature

### 2. **Device Management**
- Track all registered devices per user
- Device limit enforcement based on subscription plan
- Device types: TV, Mobile, Web, Tablet
- Remove/deactivate devices remotely
- Last active tracking

### 3. **Concurrent Stream Control**
- Enforce single-stream or multi-stream limits
- Real-time session tracking with heartbeat mechanism
- Automatic cleanup of stale sessions
- Prevent multiple simultaneous streams (configurable)
- Session monitoring and analytics

### 4. **Subscription Plans**
- Free: 1 device, 1 concurrent stream
- Premium: 3 devices, 2 concurrent streams
- Ultimate: 10 devices, 5 concurrent streams
- Custom plan support
- Easy to extend for payment integration

### 5. **Security & Authentication**
- JWT-based authentication
- Refresh token rotation
- Password hashing with bcrypt
- Rate limiting on all endpoints
- Audit logging for all actions
- CORS and Helmet security

### 6. **Database Schema**
- **Users**: Email, password, subscription plan
- **Devices**: Device info, last active, type
- **Providers**: Exact mirror of Android app provider data
- **Categories**: Channel categories with type (Live/Movie/Series)
- **Channels**: Individual channels with URLs and metadata
- **Settings**: User app settings as JSON
- **Watch Progress**: Position, duration, percentage
- **Active Sessions**: Real-time streaming sessions
- **Audit Logs**: Complete audit trail

## 📁 Project Structure

```
iptv-sync-backend/
├── packages/
│   ├── api/              # Express API server
│   ├── database/         # PostgreSQL migrations & schema
│   ├── shared/           # Shared utilities
│   └── types/            # TypeScript definitions
├── docker/               # Docker configurations
├── docs/                 # API documentation
├── .env.example          # Environment template
├── docker-compose.yml    # Docker services
├── Dockerfile            # Production image
├── package.json          # Monorepo root
├── README.md             # Project documentation
└── SETUP.md              # Setup instructions
```

## 🚀 Quick Start

```bash
# 1. Navigate to project
cd /Users/ronika/Desktop/iptv/iptv-sync-backend

# 2. Install dependencies
npm install

# 3. Setup environment
cp .env.example .env
# Edit .env with your configuration

# 4. Start services (Docker)
docker-compose up -d

# 5. Run migrations
npm run db:migrate

# 6. Start API server
npm run dev
```

API available at: `http://localhost:3000`

## 📡 API Endpoints

### Authentication
- `POST /api/auth/register` - Register with email/password
- `POST /api/auth/login` - Login and get JWT tokens
- `POST /api/auth/logout` - Logout and invalidate tokens
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/verify` - Verify token validity

### Sync Operations
- `GET /api/sync/pull` - Pull all user data (providers, categories, channels, settings)
- `POST /api/sync/push` - Push bulk updates from device
- `POST /api/sync/providers` - Sync provider changes
- `POST /api/sync/categories` - Sync category changes
- `POST /api/sync/channels` - Sync channel changes
- `POST /api/sync/settings` - Sync app settings

### Device Management
- `GET /api/devices` - List all user devices
- `POST /api/devices/register` - Register new device
- `PUT /api/devices/:id` - Update device info
- `DELETE /api/devices/:id` - Remove/deactivate device

### Stream Control
- `POST /api/stream/start` - Start streaming session (checks concurrent limit)
- `POST /api/stream/heartbeat` - Send heartbeat to keep session alive
- `POST /api/stream/end` - End streaming session
- `GET /api/stream/active` - Get active sessions for user

### Watch Progress
- `GET /api/progress` - Get all watch progress
- `GET /api/progress/:contentId` - Get specific content progress
- `POST /api/progress/update` - Update watch progress
- `DELETE /api/progress/:contentId` - Delete progress entry

### Subscriptions
- `GET /api/subscriptions/plans` - List available plans
- `GET /api/subscriptions/current` - Get user's current plan
- `POST /api/subscriptions/upgrade` - Upgrade subscription plan

## 🔐 Security Features

- ✅ JWT authentication with access & refresh tokens
- ✅ Bcrypt password hashing (12 rounds)
- ✅ Rate limiting (100 requests per 15 minutes)
- ✅ CORS configuration
- ✅ Helmet security headers
- ✅ SQL injection prevention (parameterized queries)
- ✅ Input validation with Joi
- ✅ Audit logging for all actions
- ✅ Session timeout and cleanup
- ✅ Device-specific token binding

## 📊 Database Views

### Active User Sessions View
```sql
SELECT * FROM v_active_user_sessions;
```
Shows:
- User email
- Concurrent stream limit
- Active stream count
- Session details (device, content, timestamps)

## 🔄 Sync Flow Example

### Android App → Backend

1. **User Adds Provider**:
```kotlin
// After saveStalkerConfig() in Android
val provider = ProviderEntity(...)
syncService.syncProvider(provider)
```

2. **Backend Receives**:
```http
POST /api/sync/providers
Authorization: Bearer {token}

{
  "provider_id": "uuid",
  "name": "My IPTV",
  "type": "stalker",
  "server_url": "http://...",
  "mac_address": "00:1A:79:...",
  "token": "...",
  "configuration": {...}
}
```

3. **Backend Stores**: Provider saved to database

4. **Other Devices Pull**:
```http
GET /api/sync/pull
Authorization: Bearer {token}

Response:
{
  "providers": [...],
  "categories": [...],
  "channels": [...],
  "settings": {...},
  "progress": [...]
}
```

## 🎮 Stream Control Flow

### Starting Stream

1. **User Clicks Play**:
```http
POST /api/stream/start
{
  "device_id": "uuid",
  "content_id": "movie_123",
  "content_type": "MOVIE",
  "content_name": "Action Movie"
}
```

2. **Backend Checks**:
- Count active sessions for user
- Compare with concurrent_stream_limit
- If limit reached → Reject (409 Conflict)
- If allowed → Create session, return session_id

3. **App Sends Heartbeats** (every 30s):
```http
POST /api/stream/heartbeat
{
  "session_id": "uuid"
}
```

4. **On Stop/Exit**:
```http
POST /api/stream/end
{
  "session_id": "uuid"
}
```

5. **Auto Cleanup**: Sessions without heartbeat for 2 minutes are automatically ended

## 🐳 Docker Services

### Included Services
- **postgres**: PostgreSQL 15 database
- **redis**: Redis 7 for caching and sessions
- **api**: Node.js Express API
- **pgadmin**: Database management UI (port 5050)

### Ports
- API: `3000`
- PostgreSQL: `5432`
- Redis: `6379`
- pgAdmin: `5050`

## 📈 Future Enhancements

### Planned Features
- [ ] Email verification
- [ ] Password reset via email
- [ ] Payment integration (Stripe/PayPal)
- [ ] WebSocket for real-time sync
- [ ] Analytics dashboard
- [ ] Admin panel
- [ ] Favorites sync
- [ ] Playlist sync
- [ ] Parental controls sync
- [ ] EPG data caching
- [ ] Content recommendations
- [ ] Push notifications
- [ ] Offline mode support
- [ ] Bandwidth monitoring

### Monetization Ready
- Device-based subscriptions ✅
- Concurrent stream limits ✅
- Subscription tiers ✅
- Audit trail ✅
- Ready for payment gateway integration

## 🔧 Configuration

### Subscription Plans (Configurable)

Edit `packages/database/migrations/001_initial_schema.sql`:

```sql
INSERT INTO subscription_plans (...) VALUES
('Free', ..., 1, 1, 0.00, 0.00),
('Premium', ..., 3, 2, 9.99, 99.99),
('Ultimate', ..., 10, 5, 19.99, 199.99);
```

### Session Timeouts

Edit `.env`:
```env
SESSION_TIMEOUT_MINUTES=30
HEARTBEAT_INTERVAL_SECONDS=30
SESSION_CLEANUP_INTERVAL_MINUTES=5
```

## 📱 Android App Integration

### Add Dependencies
```gradle
// Retrofit for API calls
implementation 'com.squareup.retrofit2:retrofit:2.9.0'
implementation 'com.squareup.retrofit2:converter-gson:2.9.0'
```

### Create API Service
```kotlin
interface SyncApiService {
    @POST("auth/register")
    suspend fun register(@Body request: RegisterRequest): AuthResponse
    
    @POST("auth/login")
    suspend fun login(@Body request: LoginRequest): AuthResponse
    
    @POST("sync/providers")
    suspend fun syncProvider(
        @Header("Authorization") token: String,
        @Body provider: ProviderSync
    ): SyncResponse
    
    @GET("sync/pull")
    suspend fun pullData(
        @Header("Authorization") token: String
    ): PullDataResponse
}
```

### Sync on Changes
```kotlin
// In PortalSetupActivity.kt
private fun saveStalkerConfig(...) {
    lifecycleScope.launch {
        // Save locally
        providerDao.insertProvider(provider)
        
        // Sync to backend
        try {
            val syncService = SyncService(context)
            syncService.syncProvider(provider)
        } catch (e: Exception) {
            Log.e(TAG, "Sync failed", e)
            // Continue even if sync fails
        }
    }
}
```

## 📊 Monitoring

### Health Check
```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2025-12-04T...",
  "uptime": 123.45,
  "database": "connected",
  "redis": "connected",
  "version": "1.0.0"
}
```

### Metrics Endpoints (Future)
- `/metrics` - Prometheus metrics
- `/admin/stats` - Usage statistics
- `/admin/sessions` - Active sessions
- `/admin/users` - User analytics

## 🎁 What You Get

1. **Complete Backend**: Production-ready Express server
2. **Database Schema**: PostgreSQL with all tables, indexes, triggers
3. **API Endpoints**: 30+ endpoints for all features
4. **Docker Setup**: One-command deployment
5. **Security**: JWT, bcrypt, rate limiting, audit logs
6. **Documentation**: Comprehensive guides and examples
7. **Monitoring**: Health checks and logging
8. **Scalability**: Redis caching, connection pooling

## 📞 Next Steps

1. **Review Setup**: Go through SETUP.md
2. **Install Dependencies**: Run `npm install`
3. **Configure Environment**: Copy and edit `.env`
4. **Start Services**: Run `docker-compose up -d`
5. **Run Migrations**: Run `npm run db:migrate`
6. **Test API**: Use provided curl examples
7. **Integrate Android**: Add sync calls to your app
8. **Deploy**: Follow deployment guide for production

## 🎉 Ready to Use!

Your backend is now ready for:
- Multi-device sync
- Device management
- Concurrent stream control
- Subscription management
- Watch progress tracking
- Complete audit trail

All with production-grade security and scalability!

---

**Location**: `/Users/ronika/Desktop/iptv/iptv-sync-backend`

**Tech Stack**: Node.js, Express, PostgreSQL, Redis, JWT, TypeScript

**Status**: ✅ Complete and ready for development
