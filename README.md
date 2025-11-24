# IPTV Platform - Backend & Admin Dashboard

This is the backend API and admin dashboard for the IPTV platform. The user-facing application is built with Expo React Native (see `/expo-rn` folder).

## Architecture

- **Backend API** (Port 2005) - Next.js API routes
- **Admin Dashboard** (Port 2005/dashboard) - Next.js web UI for management
- **User App** - Expo React Native app (separate folder: `/expo-rn`)
- **Database** - PostgreSQL with Prisma ORM

## Getting Started

### 1. Database Setup

First, set up PostgreSQL and create a database:

```bash
# Create database
createdb iptv_platform

# Or using psql
psql -U postgres
CREATE DATABASE iptv_platform;
```

### 2. Environment Setup

Create a `.env.local` file in the root directory:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/iptv_platform"

# Encryption (generate with: openssl rand -hex 32)
ENCRYPTION_KEY="your-32-byte-hex-key-here"

# JWT Secret (change in production)
JWT_SECRET="your-jwt-secret-key-change-in-production"

# Stalker Portal Configuration (for legacy support)
STALKER_MAC=00:1A:79:XX:XX:XX
STALKER_URL=http://your-portal-url/stalker_portal/
STALKER_BEARER=your_bearer_token
STALKER_ADID=your_adid
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Run Database Migrations

```bash
npx prisma migrate dev
```

### 5. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:2005](http://localhost:2005) with your browser - it will redirect to the admin dashboard.

**Admin Dashboard:** [http://localhost:2005/dashboard](http://localhost:2005/dashboard)

## Features

### Backend API
- 🔐 **JWT Authentication** - Secure user authentication with JSON Web Tokens
- 👤 **User Management** - Register and login users
- 📡 **Provider Management** - Add and manage IPTV providers
- 👥 **Profile System** - Multiple profiles per user with parental controls
- 📱 **Device Management** - Register and track TV devices
- 🔄 **Content Sync** - Automatic content synchronization from Stalker portals
- 📦 **Snapshot System** - Pre-filtered, compressed content snapshots per profile
- 🔐 **Encryption** - AES-256-GCM encryption for sensitive credentials
- 🎬 **Stream URLs** - Secure streaming link generation

### Admin Dashboard
- 📊 **Overview** - System statistics and recent activity
- 📡 **Providers** - Manage IPTV providers with auto-handshake
- 👤 **Profiles** - Create profiles with age ratings and types (Admin/Kid/Guest)
- 📱 **Devices** - View and manage registered devices
- 🔄 **Sync Status** - Monitor content synchronization

### User App (Expo React Native)
See `/expo-rn` folder for the user-facing mobile/TV application with:
- Username/password login
- Profile selection
- Instant content loading from snapshots
- Live TV, Movies, Series browsing
- Video playback

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login with username/password
- `GET /api/auth/me` - Get current user (requires JWT)

### Providers
- `GET /api/providers` - List all providers
- `POST /api/providers` - Add new provider (auto-handshake)
- `PATCH /api/providers/:id` - Update provider
- `DELETE /api/providers/:id` - Delete provider

### Profiles
- `GET /api/profiles?userId=:id` - Get user's profiles
- `POST /api/profiles` - Create new profile
- `PATCH /api/profiles/:id` - Update profile
- `DELETE /api/profiles/:id` - Delete profile

### Devices
- `GET /api/devices` - List all devices
- `POST /api/devices` - Register new device

### Sync & Snapshots
- `POST /api/sync/:providerId` - Trigger content sync
- `GET /api/snapshots/:profileId/latest` - Get profile snapshot

### Streaming
- `POST /api/stream/link` - Get streaming URL

## Quick Start Guide

### 1. Create First User
```bash
curl -X POST http://localhost:2005/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","email":"admin@example.com","password":"yourpassword"}'
```

### 2. Add Provider (Dashboard)
1. Visit http://localhost:2005/dashboard/providers
2. Click "Add Provider"
3. Enter Stalker portal credentials
4. System will auto-handshake

### 3. Create Profile (Dashboard)
1. Go to /dashboard/profiles
2. Create profile for your user
3. Choose type (Admin/Kid/Guest)
4. Set age rating if needed

### 4. Sync Content (Dashboard)
1. Go to /dashboard/sync
2. Click "Sync Now" for provider
3. Wait for completion
4. Snapshots generated automatically

### 5. Use Expo App
1. `cd expo-rn`
2. `npm start`
3. Login with username/password
4. Select profile
5. Enjoy!

## Security

- 🔐 **JWT Tokens** - Secure authentication with 7-day expiry
- 🔒 **Password Hashing** - bcrypt with 10 rounds
- 🔐 **Credential Encryption** - AES-256-GCM for bearer tokens and passwords
- 🔑 **MAC Address Binding** - Device validation for streaming
- ⚠️ **Never commit `.env.local`** to version control

## Project Structure

```
/
├── src/
│   ├── app/
│   │   ├── api/              # Backend API routes
│   │   │   ├── auth/         # Authentication endpoints
│   │   │   ├── providers/    # Provider management
│   │   │   ├── profiles/     # Profile management
│   │   │   ├── devices/      # Device management
│   │   │   ├── sync/         # Content synchronization
│   │   │   ├── snapshots/    # Snapshot delivery
│   │   │   └── stream/       # Streaming URLs
│   │   ├── dashboard/        # Admin dashboard pages
│   │   └── page.tsx          # Root (redirects to dashboard)
│   ├── components/
│   │   └── dashboard/        # Dashboard UI components
│   └── lib/
│       ├── prisma.ts         # Database client
│       ├── jwt.ts            # JWT utilities
│       ├── crypto.ts         # AES encryption
│       ├── sync-service.ts   # Content sync logic
│       └── stalker-client.ts # Stalker API client
├── expo-rn/                  # User-facing Expo app
├── prisma/
│   └── schema.prisma         # Database schema
└── README.md
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
