# Project Structure Diagram

## Directory Layout

```
iptv/
│
├── src/                          # BACKEND (Next.js)
│   ├── app/
│   │   ├── api/                 # API Routes (16 endpoints)
│   │   │   ├── auth/
│   │   │   │   └── verify/
│   │   │   │       └── route.ts           ✅ Password verification
│   │   │   ├── proxy/
│   │   │   │   └── route.ts               ✅ CORS proxy for Stalker
│   │   │   └── stalker/
│   │   │       ├── handshake/route.ts     ✅ Portal authentication
│   │   │       ├── genres/route.ts        ✅ Live TV categories
│   │   │       ├── channels/route.ts      ✅ Live TV channels
│   │   │       ├── vod/route.ts           ✅ Movies/Series content
│   │   │       ├── search/route.ts        ✅ Content search
│   │   │       ├── stream/route.ts        ✅ Get stream URLs
│   │   │       ├── link/route.ts          ✅ Create stream links
│   │   │       ├── epg/route.ts           ✅ EPG data
│   │   │       ├── categories/
│   │   │       │   ├── movies/route.ts    ✅ Movie categories
│   │   │       │   └── series/route.ts    ✅ Series categories
│   │   │       ├── series/
│   │   │       │   ├── seasons/route.ts   ✅ Series seasons
│   │   │       │   ├── episodes/route.ts  ✅ Series episodes
│   │   │       │   └── fileinfo/route.ts  ✅ Episode file info
│   │   │       └── movie/
│   │   │           └── info/route.ts      ✅ Movie file info
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/              # Backend UI components (web)
│   └── lib/                     # Backend utilities
│       ├── stalker-client.ts    🔒 BACKEND ONLY
│       ├── stalker-api.ts       🔒 BACKEND ONLY
│       ├── auth.ts              🔒 BACKEND ONLY
│       └── store.ts
│
├── expo-rn/                     # FRONTEND (Expo/React Native)
│   ├── app/
│   │   ├── (auth)/
│   │   │   └── login.tsx        📱 Uses ApiClient
│   │   ├── (tabs)/
│   │   │   ├── live.tsx         📱 Uses ApiClient
│   │   │   ├── movies.tsx       📱 Uses ApiClient
│   │   │   ├── series.tsx       📱 Uses ApiClient
│   │   │   └── search.tsx       📱 Uses ApiClient
│   │   ├── watch/[id].tsx       📱 Uses ApiClient
│   │   ├── series/[id].tsx      📱 Uses ApiClient
│   │   └── channel/[id].tsx     📱 Uses ApiClient
│   ├── components/              # Reusable UI components
│   └── lib/                     # Frontend utilities
│       ├── api-client.ts        ✨ NEW - HTTP client for BE
│       ├── store.ts             📱 Frontend state (Zustand)
│       ├── watch-history.ts     📱 Local watch history
│       └── debug-logger.ts      📱 Frontend logging
│
├── .env.local                   # Backend environment vars
├── expo-rn/.env                 # Frontend environment vars
├── ARCHITECTURE.md              # Architecture documentation
├── API_CLIENT_REFERENCE.md      # API usage guide
├── ENV_SETUP.md                 # Environment setup guide
├── CLEANUP_SUMMARY.md           # Cleanup details
├── DONE.md                      # Quick summary
└── STRUCTURE.md                 # This file
```

## Communication Flow

```
┌─────────────────────────────────────────────────────────────┐
│                        USER DEVICE                          │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │          Expo App (Web/iOS/Android)                 │   │
│  │                                                     │   │
│  │  📱 Components:                                     │   │
│  │     • Login Screen                                  │   │
│  │     • Live TV                                       │   │
│  │     • Movies                                        │   │
│  │     • Series                                        │   │
│  │     • Search                                        │   │
│  │     • Video Player                                  │   │
│  │                                                     │   │
│  │  🔧 Uses: api-client.ts                            │   │
│  │                                                     │   │
│  └──────────────────┬──────────────────────────────────┘   │
│                     │                                       │
└─────────────────────┼───────────────────────────────────────┘
                      │
                      │ HTTP/HTTPS Requests
                      │ POST /api/stalker/*
                      │ POST /api/auth/verify
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                   Next.js Backend                           │
│                 (localhost:2005 / production)               │
│                                                             │
│  🔌 API Routes:                                             │
│     /api/auth/verify          → verifyPassword()            │
│     /api/stalker/genres       → getGenres()                 │
│     /api/stalker/channels     → getChannels()               │
│     /api/stalker/vod          → getMovies()/getSeries()     │
│     /api/stalker/search       → searchContent()             │
│     /api/stalker/stream       → getStreamUrl()              │
│     ... (16 total endpoints)                                │
│                                                             │
│  🔧 Uses: stalker-client.ts                                 │
│  🔐 Credentials: bearer, adid (server-side only)            │
│                                                             │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ Stalker Portal API Requests
                      │ (with proper headers, auth)
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                   Stalker Portal                            │
│               (tv.stream4k.cc/stalker_portal/)              │
│                                                             │
│  • Live TV Channels                                         │
│  • Movies                                                   │
│  • Series                                                   │
│  • EPG Data                                                 │
│  • Stream URLs                                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## API Request Flow Example

### Loading Live TV Channels

```
1. User opens Live TV tab
   │
   ├─ expo-rn/app/(tabs)/live.tsx
   │
   ▼

2. Component calls ApiClient
   │
   ├─ const client = new ApiClient({ mac, url })
   ├─ const { genres } = await client.getGenres()
   ├─ const { channels } = await client.getChannels(genreId, 1)
   │
   ▼

3. ApiClient sends HTTP request
   │
   ├─ POST http://localhost:2005/api/stalker/genres
   ├─ Body: { mac, url }
   │
   ▼

4. Next.js API route handles request
   │
   ├─ src/app/api/stalker/genres/route.ts
   ├─ const client = new StalkerClient({ mac, url })
   ├─ const genres = await client.getCategories()
   │
   ▼

5. StalkerClient calls portal
   │
   ├─ src/lib/stalker-client.ts
   ├─ Adds bearer, adid, cookies
   ├─ Proxies through /api/proxy
   ├─ Calls portal: tv.stream4k.cc/stalker_portal/server/load.php
   │
   ▼

6. Portal returns data
   │
   ├─ { js: [{ id: "1", title: "Movies", ... }] }
   │
   ▼

7. Response flows back
   │
   ├─ StalkerClient → API route → ApiClient → Component
   ├─ Each layer transforms/validates data
   │
   ▼

8. Component displays channels
   │
   └─ Renders ContentCard components with channel data
```

## Key Files

### Backend Only 🔒
- `src/lib/stalker-client.ts` - Stalker portal client
- `src/lib/stalker-api.ts` - API types and helpers
- `src/lib/auth.ts` - Server-side authentication
- `src/app/api/**/route.ts` - API endpoints

### Frontend Only 📱
- `expo-rn/lib/api-client.ts` - HTTP client
- `expo-rn/lib/store.ts` - Frontend state
- `expo-rn/lib/watch-history.ts` - Watch history
- `expo-rn/app/**/*.tsx` - UI components

### Shared Concept 🔄
- Both have `store.ts` but different implementations
- Backend: minimal/unused
- Frontend: Zustand store for app state

## Environment Variables

### Backend (.env.local)
```env
NEXT_PUBLIC_STALKER_BEARER=...    # Stalker auth token
NEXT_PUBLIC_STALKER_ADID=...      # Stalker ad ID
NEXT_PUBLIC_APP_PASSWORD_HASH=... # App password (bcrypt)
```

### Frontend (expo-rn/.env)
```env
EXPO_PUBLIC_STALKER_MAC=...       # MAC address (for UI only)
EXPO_PUBLIC_STALKER_URL=...       # Portal URL (for UI only)
EXPO_PUBLIC_APP_PASSWORD_HASH=... # App password (bcrypt)
EXPO_PUBLIC_API_URL=...           # Backend URL (http://localhost:2005)
```

## Port Configuration

- Backend (Next.js): **2005**
- Frontend Web (Expo): **3005** (proxies API calls to :2005)
- Frontend Native: Connects directly to **localhost:2005** or production URL

## Benefits of This Structure

1. **Security** 🔐
   - Sensitive credentials (bearer, adid) never exposed to client
   - Only backend talks to Stalker portal

2. **CORS** 🌐
   - No browser CORS issues
   - All requests proxied through backend

3. **Maintainability** 🛠️
   - Single place to update API logic
   - Clear separation of concerns

4. **Scalability** 📈
   - Easy to add caching
   - Easy to add rate limiting
   - Easy to add monitoring

5. **Consistency** 🎯
   - Same APIs for web and native apps
   - Consistent error handling
   - Unified data format

## Testing the Structure

```bash
# Terminal 1: Start backend
npm run dev

# Terminal 2: Start frontend
cd expo-rn
npm start

# Terminal 3: Test API
curl -X POST http://localhost:2005/api/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"password":"test"}'
```

---

For more information, see:
- `ARCHITECTURE.md` - Detailed architecture
- `API_CLIENT_REFERENCE.md` - API usage
- `ENV_SETUP.md` - Setup instructions
