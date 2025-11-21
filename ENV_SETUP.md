# Environment Variables Configuration

This project uses a clean separation between backend (Next.js) and frontend (Expo).

## Backend (Next.js) - Root .env.local

The Next.js server handles all Stalker portal interactions and authentication.

```env
# Stalker Portal Configuration (Backend Only)
NEXT_PUBLIC_STALKER_BEARER=your_bearer_token_here
NEXT_PUBLIC_STALKER_ADID=your_adid_here

# App Authentication
NEXT_PUBLIC_APP_PASSWORD_HASH=your_bcrypt_hashed_password
```

### Generating Password Hash

Use the provided script:
```bash
node scripts/hash-password.js your_password
```

## Frontend (Expo) - expo-rn/.env

The Expo app only needs credentials for authentication and the backend API URL.

```env
# Stalker Credentials (for auth only)
EXPO_PUBLIC_STALKER_MAC=00:1A:79:XX:XX:XX
EXPO_PUBLIC_STALKER_URL=http://your-portal-url.com

# App Password
EXPO_PUBLIC_APP_PASSWORD_HASH=same_hash_as_backend

# Backend API URL (Development)
EXPO_PUBLIC_API_URL=http://localhost:2005

# Backend API URL (Production)
# EXPO_PUBLIC_API_URL=https://your-production-domain.com
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│            Expo App (Frontend)                  │
│  - Uses ApiClient to call Next.js APIs         │
│  - No direct Stalker portal access              │
│  - Stores only credentials and auth state      │
└────────────────┬────────────────────────────────┘
                 │
                 │ HTTP Requests
                 ▼
┌─────────────────────────────────────────────────┐
│          Next.js Server (Backend)               │
│  - Handles all Stalker API interactions        │
│  - Proxies requests with proper headers         │
│  - Manages bearer/adid authentication           │
│  - Returns processed data to frontend           │
└────────────────┬────────────────────────────────┘
                 │
                 │ Stalker Portal Requests
                 ▼
┌─────────────────────────────────────────────────┐
│            Stalker Portal                       │
│  - Direct access only from Next.js backend     │
└─────────────────────────────────────────────────┘
```

## Benefits of This Architecture

1. **Security**: Stalker credentials (bearer/adid) never exposed to frontend
2. **CORS**: All portal requests proxied through Next.js backend
3. **Maintainability**: Single source of truth for API logic
4. **Flexibility**: Easy to add caching, rate limiting, or additional processing
5. **Consistency**: Both web and native apps use same backend APIs

## Development Setup

1. Copy `.env.example` to `.env.local` in root (Next.js)
2. Copy `.env.example` to `.env` in `expo-rn/` directory
3. Fill in your credentials and configuration
4. Start Next.js server: `npm run dev` (runs on port 2005)
5. Start Expo app: `cd expo-rn && npm start` (web on port 3005)

## Production Setup

1. Deploy Next.js to your hosting provider
2. Set environment variables in hosting platform
3. Update `EXPO_PUBLIC_API_URL` in Expo app to point to production backend
4. Build and deploy Expo app
