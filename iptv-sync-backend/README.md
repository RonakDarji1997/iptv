# IPTV Sync Backend

Multi-device IPTV synchronization backend with device management, concurrent stream control, and cross-platform data sync.

## 🎯 Features

- **Multi-Device Sync**: Sync providers, categories, channels, and settings across TV, Mobile, and Web
- **Device Management**: Track and limit devices per user
- **Concurrent Stream Control**: Enforce single-stream or multi-stream limits based on subscription
- **Watch Progress Sync**: Continue watching from where you left off on any device
- **Session Management**: Real-time active session tracking with automatic cleanup
- **Subscription Plans**: Flexible plans with device and stream limits
- **Audit Logging**: Complete audit trail for security and debugging
- **Crash Recovery**: Users can retrieve all data after app reinstall

## 🏗️ Architecture

```
iptv-sync-backend/
├── packages/
│   ├── api/              # Express API server
│   ├── database/         # PostgreSQL schema & migrations
│   ├── shared/           # Shared types & utilities
│   └── types/            # TypeScript type definitions
├── docker/               # Docker configurations
├── docs/                 # API documentation
└── scripts/              # Utility scripts
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 15+
- Redis 7+
- Docker (optional)

### Installation

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your configuration

# Start PostgreSQL and Redis (Docker)
npm run docker:up

# Run migrations
npm run db:migrate

# Seed database (optional)
npm run db:seed

# Start development server
npm run dev
```

### Using Docker

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f api

# Stop services
docker-compose down
```

## 📡 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login and get JWT
- `POST /api/auth/logout` - Logout user
- `POST /api/auth/refresh` - Refresh JWT token
- `GET /api/auth/verify` - Verify token

### Sync
- `GET /api/sync/pull` - Pull all user data
- `POST /api/sync/push` - Push updates
- `POST /api/sync/providers` - Sync providers
- `POST /api/sync/categories` - Sync categories
- `POST /api/sync/channels` - Sync channels
- `POST /api/sync/settings` - Sync settings

### Devices
- `GET /api/devices` - List user devices
- `POST /api/devices/register` - Register device
- `DELETE /api/devices/:id` - Remove device
- `PUT /api/devices/:id` - Update device info

### Streaming
- `POST /api/stream/start` - Start stream session
- `POST /api/stream/heartbeat` - Send heartbeat
- `POST /api/stream/end` - End stream session
- `GET /api/stream/active` - Get active sessions

### Progress
- `GET /api/progress` - Get all watch progress
- `GET /api/progress/:contentId` - Get specific progress
- `POST /api/progress/update` - Update watch progress
- `DELETE /api/progress/:contentId` - Delete progress

### Subscriptions
- `GET /api/subscriptions/plans` - List plans
- `GET /api/subscriptions/current` - Get user's plan
- `POST /api/subscriptions/upgrade` - Upgrade plan

## 🔐 Security

- JWT-based authentication
- Password hashing with bcrypt
- Rate limiting on all endpoints
- CORS configuration
- SQL injection prevention
- XSS protection
- Environment variable validation

## 📊 Database Schema

### Users
- email, password_hash, subscription_plan_id
- device_limit, concurrent_stream_limit
- created_at, updated_at

### Devices
- user_id, device_id, device_type, device_name
- platform, app_version, last_active
- created_at

### Providers
- user_id, provider_id, name, type
- server_url, mac_address, token
- configuration (JSON)

### Categories
- user_id, provider_id, category_id
- name, type, external_id

### Channels
- user_id, category_id, channel_id
- name, url, logo, number

### Active Sessions
- user_id, device_id, session_id
- content_id, content_type, start_time
- last_heartbeat

### Watch Progress
- user_id, content_id, content_type
- position, duration, updated_at

## 🔧 Environment Variables

```env
# Server
NODE_ENV=development
PORT=3000
API_VERSION=v1

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=iptv_sync
DB_USER=postgres
DB_PASSWORD=your_password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# Rate Limiting
RATE_LIMIT_WINDOW=15m
RATE_LIMIT_MAX_REQUESTS=100

# Session
SESSION_TIMEOUT=30m
HEARTBEAT_INTERVAL=30s
```

## 📈 Monitoring & Logging

- Winston for structured logging
- Request/response logging
- Error tracking
- Performance metrics
- Health check endpoint: `GET /health`

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific workspace tests
npm test --workspace=@iptv-sync/api

# Run with coverage
npm run test:coverage
```

## 📝 Development

### Adding a New Feature

1. Create database migration in `packages/database/migrations/`
2. Add types in `packages/types/src/`
3. Implement API endpoints in `packages/api/src/routes/`
4. Add tests
5. Update documentation

### Code Style

- ESLint + Prettier
- TypeScript strict mode
- Commit message format: `type(scope): message`

## 🚢 Deployment

### Production Build

```bash
npm run build
npm start
```

### Docker Deployment

```bash
docker build -t iptv-sync-backend .
docker run -p 3000:3000 iptv-sync-backend
```

## 📚 Additional Features (Future)

- [ ] Email verification
- [ ] Password reset via email
- [ ] WebSocket for real-time sync
- [ ] Payment integration (Stripe/PayPal)
- [ ] Analytics dashboard
- [ ] Admin panel
- [ ] Content recommendation engine
- [ ] Parental controls sync
- [ ] Favorites sync
- [ ] Playlist sync
- [ ] EPG data caching

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md)

## 📄 License

MIT License - see [LICENSE](./LICENSE)

## 📞 Support

For issues and questions, please open a GitHub issue.
