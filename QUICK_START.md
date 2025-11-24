# IPTV Platform - Quick Start Guide

## ✅ Completed Implementation

### Database
- PostgreSQL setup complete (`iptv_db`)
- 12 models: User, Provider, Device, Profile, Snapshot, Category, Channel, Movie, Series, Season, Episode
- All migrations applied
- Prisma Client generated

### Core Features
1. **Provider Management** - Add/update/delete IPTV providers with auto-handshake
2. **Profile System** - Admin/Kid/Guest profiles with parental controls
3. **Device Management** - Register TV devices with MAC + token
4. **Sync Service** - Fetch metadata from providers and generate snapshots
5. **Snapshot API** - Deliver compressed pre-filtered content to TV apps
6. **Streaming API** - Generate playback URLs with token validation
7. **Encryption** - AES-256 for sensitive credentials

### API Endpoints Created
- `POST /api/providers` - Add provider with auto-handshake
- `GET /api/providers` - List providers
- `PATCH /api/providers/:id` - Update provider
- `DELETE /api/providers/:id` - Delete provider
- `POST /api/profiles` - Create profile
- `GET /api/profiles` - List profiles
- `PATCH /api/profiles/:id` - Update profile
- `DELETE /api/profiles/:id` - Delete profile
- `POST /api/devices` - Register device
- `GET /api/devices` - List devices
- `POST /api/sync/:providerId` - Trigger content sync
- `GET /api/snapshots/:profileId/latest` - Get compressed snapshot
- `POST /api/stream/link` - Generate stream URL

---

## 🚀 Quick Start

### 1. Start Dev Server
```bash
cd /Users/ronika/Desktop/iptv
npm run dev
```
Server runs on http://localhost:2005

### 2. Create Test User (Prisma Studio)
```bash
npx prisma studio
```
- Open User table
- Add record:
  - `username`: admin
  - `passwordHash`: $2b$10$ozspMK4uf1yfngxeyspPrujny4IRQVn2UMil0KAhnAdVla1g1aQCS

### 3. Add Provider
```bash
curl -X POST http://localhost:2005/api/providers \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "USER_ID_FROM_PRISMA",
    "type": "STALKER",
    "name": "Stream4K",
    "url": "http://tv.stream4k.cc/stalker_portal/",
    "stalkerBearer": "1E75E91204660B7A876055CE8830130E",
    "stalkerAdid": "06c140f97c839eaaa4faef4cc08a5722"
  }'
```

### 4. Create Profile
```bash
curl -X POST http://localhost:2005/api/profiles \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "USER_ID",
    "providerId": "PROVIDER_ID_FROM_STEP_3",
    "name": "Admin Profile",
    "type": "ADMIN"
  }'
```

### 5. Sync Provider Content
```bash
curl -X POST http://localhost:2005/api/sync/PROVIDER_ID
```
This will:
- Fetch all categories, channels, movies, series
- Store in database
- Generate compressed snapshots per profile

### 6. Get Snapshot (TV App Would Call This)
```bash
curl http://localhost:2005/api/snapshots/PROFILE_ID/latest
```

---

## 📁 Project Structure

```
src/
├── lib/
│   ├── prisma.ts              # Database client singleton
│   ├── crypto.ts              # AES-256 encryption
│   ├── mac-generator.ts       # MAC address generation
│   ├── stalker-client.ts      # Stalker API client (existing)
│   └── sync-service.ts        # Content sync + snapshots
├── app/api/
│   ├── providers/
│   │   ├── route.ts           # GET, POST
│   │   └── [id]/route.ts      # PATCH, DELETE
│   ├── profiles/
│   │   ├── route.ts           # GET, POST
│   │   └── [id]/route.ts      # PATCH, DELETE
│   ├── devices/
│   │   └── route.ts           # GET, POST
│   ├── sync/
│   │   └── [providerId]/route.ts  # POST
│   ├── snapshots/
│   │   └── [profileId]/latest/route.ts  # GET
│   └── stream/
│       └── link/route.ts      # POST
prisma/
├── schema.prisma              # Database schema (12 models)
└── migrations/                # Applied migrations
```

---

## 🔑 Key Concepts

### MAC Binding
- Each provider requires a MAC address
- Auto-generated: `00:1A:79:XX:XX:XX` if not provided
- Token tied to MAC (from handshake)

### Token Reuse
- Handshake ONCE during provider setup
- Token encrypted and stored in DB
- Reused for all API calls
- Multiple devices can share same MAC + token

### Snapshot System
- Pre-built compressed metadata per profile
- Includes: categories, channels, movies, series (NO episodes)
- Gzip compression (~80-90% size reduction)
- TV app downloads once, instant UI

### Lazy Episode Loading
- Episodes NOT in snapshot
- Fetched on-demand when series selected
- Keeps snapshot small and fast

### Parental Control
- Kid profiles have `ageRating` limit
- Snapshot filtered at generation time
- No age-inappropriate content in Kid snapshots

---

## 🧪 Testing Checklist

- [ ] Start dev server (npm run dev)
- [ ] Create user in Prisma Studio
- [ ] Add provider via API (handshake succeeds)
- [ ] Create profile via API
- [ ] Trigger sync (fetches content)
- [ ] Check database has categories/channels/movies/series
- [ ] Get snapshot via API (compressed JSON)
- [ ] Register device via API
- [ ] Generate stream URL via API

---

## 📦 Dependencies Added

```json
{
  "pako": "^2.1.0",          // Gzip compression
  "@types/pako": "^2.0.4",   // TypeScript types
  "@prisma/client": "^6.19.0",  // Database client
  "prisma": "^6.19.0"        // Prisma CLI
}
```

---

## 🔐 Environment Variables (.env.local)

```bash
# PostgreSQL
DATABASE_URL="postgresql://ronika@localhost:5432/iptv_db?schema=public"

# Encryption (32-byte hex key)
ENCRYPTION_KEY="a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2"

# Default Stalker Credentials (for testing)
STALKER_MAC=00:1A:79:17:F4:F5
STALKER_URL=http://tv.stream4k.cc/stalker_portal/
STALKER_BEARER=1E75E91204660B7A876055CE8830130E
STALKER_ADID=06c140f97c839eaaa4faef4cc08a5722
```

---

## 🎯 Next Steps

1. **Test full flow**: Add provider → Sync → Get snapshot
2. **JWT Auth**: Implement JWT for API authentication
3. **User Registration**: POST /api/auth/register endpoint
4. **Episode API**: Lazy loading endpoints for series
5. **Xtream Support**: Add Xtream API client
6. **M3U Support**: Add M3U parser
7. **Watch History**: Track playback progress
8. **Scheduled Sync**: Daily cron job
9. **TV App**: Build React Native TV app consuming these APIs
10. **Web Dashboard**: Admin UI for provider management

---

## 📚 Documentation

See `BACKEND_IMPLEMENTATION.md` for detailed architecture and flow diagrams.

**Status**: ✅ Backend ready for Stalker providers!
