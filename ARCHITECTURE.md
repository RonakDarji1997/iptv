# Architecture Documentation

## Code Organization

This project follows a clean separation between Backend (BE) and Frontend (FE):

### Backend (Next.js) - `/src`

**Location**: Root directory

**Purpose**: Server-side API and business logic

**Key Components**:
- `src/app/api/` - API routes
  - `auth/verify/` - Password verification
  - `stalker/` - All Stalker portal interactions
    - `handshake/` - Portal authentication
    - `genres/` - Get live TV categories
    - `channels/` - Get live TV channels
    - `categories/movies/` - Get movie categories
    - `categories/series/` - Get series categories
    - `vod/` - Get movies/series content
    - `search/` - Search content
    - `series/seasons/` - Get series seasons
    - `series/episodes/` - Get series episodes
    - `series/fileinfo/` - Get episode file info
    - `movie/info/` - Get movie file info
    - `stream/` - Get stream URLs
    - `epg/` - Get EPG data
    - `link/` - Create stream links
  - `proxy/` - CORS proxy for Stalker portal
- `src/lib/` - Backend utilities
  - `stalker-client.ts` - Stalker portal client (BE only)
  - `stalker-api.ts` - Stalker API types and helpers
  - `auth.ts` - Server-side authentication
  - `store.ts` - Server state management (if needed)

**Environment Variables** (`.env.local`):
```env
NEXT_PUBLIC_STALKER_BEARER=...
NEXT_PUBLIC_STALKER_ADID=...
NEXT_PUBLIC_APP_PASSWORD_HASH=...
```

### Frontend (Expo/React Native) - `/expo-rn`

**Location**: `expo-rn/` directory

**Purpose**: Mobile and web client application

**Key Components**:
- `expo-rn/lib/` - Frontend utilities
  - `api-client.ts` - HTTP client for calling BE APIs
  - `store.ts` - Frontend state management (Zustand)
  - `watch-history.ts` - Local watch history
  - `debug-logger.ts` - Frontend logging
- `expo-rn/app/` - Application screens
  - `(auth)/` - Authentication screens
  - `(tabs)/` - Main app tabs (live, movies, series, search)
  - `watch/[id].tsx` - Video player screen
  - `series/[id].tsx` - Series detail screen
  - `channel/[id].tsx` - Live channel screen
- `expo-rn/components/` - Reusable UI components

**Environment Variables** (`.env`):
```env
EXPO_PUBLIC_STALKER_MAC=...
EXPO_PUBLIC_STALKER_URL=...
EXPO_PUBLIC_APP_PASSWORD_HASH=...
EXPO_PUBLIC_API_URL=http://localhost:2005
```

## Data Flow

### 1. Authentication Flow
```
User Input → Expo App → POST /api/auth/verify
                      ← { valid: true/false }
```

### 2. Content Loading Flow
```
Expo App → POST /api/stalker/genres
         ← { genres: [...] }

Expo App → POST /api/stalker/channels { genre, page }
         ← { channels: { data: [...], total: N } }
```

### 3. Streaming Flow
```
User Selects Content → Expo App → POST /api/stalker/series/fileinfo
                                 ← { fileInfo: { id, cmd, ... } }
                                 
                                 → POST /api/stalker/stream { cmd, type }
                                 ← { url: "https://..." }

Video Player ← Stream URL
```

## API Endpoints Reference

### Authentication

#### POST `/api/auth/verify`
Verify user password.

**Request**:
```json
{
  "password": "user_password"
}
```

**Response**:
```json
{
  "valid": true
}
```

### Stalker Portal

#### POST `/api/stalker/handshake`
Initialize portal session.

**Request**:
```json
{
  "mac": "00:1A:79:XX:XX:XX",
  "url": "http://portal-url.com"
}
```

#### POST `/api/stalker/genres`
Get live TV categories.

**Request**:
```json
{
  "mac": "00:1A:79:XX:XX:XX",
  "url": "http://portal-url.com"
}
```

**Response**:
```json
{
  "genres": [
    { "id": "1", "title": "Movies", "alias": "movies" }
  ]
}
```

#### POST `/api/stalker/channels`
Get live TV channels for a category.

**Request**:
```json
{
  "mac": "00:1A:79:XX:XX:XX",
  "url": "http://portal-url.com",
  "genre": "1",
  "page": 1,
  "sortBy": "number"
}
```

**Response**:
```json
{
  "channels": {
    "data": [
      {
        "id": "1",
        "name": "Channel Name",
        "cmd": "stream_command",
        "logo": "logo_url"
      }
    ],
    "total": 100
  }
}
```

#### POST `/api/stalker/vod`
Get movies or series.

**Request**:
```json
{
  "mac": "00:1A:79:XX:XX:XX",
  "url": "http://portal-url.com",
  "category": "1",
  "page": 1,
  "sortBy": "added",
  "type": "vod"
}
```

#### POST `/api/stalker/search`
Search content.

**Request**:
```json
{
  "mac": "00:1A:79:XX:XX:XX",
  "url": "http://portal-url.com",
  "query": "search term",
  "page": 1
}
```

#### POST `/api/stalker/series/seasons`
Get seasons for a series.

**Request**:
```json
{
  "mac": "00:1A:79:XX:XX:XX",
  "url": "http://portal-url.com",
  "seriesId": "123"
}
```

**Response**:
```json
{
  "seasons": [
    {
      "id": "1",
      "name": "Season 1",
      "series_name": "Series Name"
    }
  ]
}
```

#### POST `/api/stalker/series/episodes`
Get episodes for a season.

**Request**:
```json
{
  "mac": "00:1A:79:XX:XX:XX",
  "url": "http://portal-url.com",
  "seriesId": "123",
  "seasonId": "1",
  "page": 1
}
```

#### POST `/api/stalker/series/fileinfo`
Get file info for an episode.

**Request**:
```json
{
  "mac": "00:1A:79:XX:XX:XX",
  "url": "http://portal-url.com",
  "seriesId": "123",
  "seasonId": "1",
  "episodeId": "1"
}
```

**Response**:
```json
{
  "fileInfo": {
    "id": "file_123",
    "cmd": "/media/file_123.mpg"
  }
}
```

#### POST `/api/stalker/stream`
Get stream URL.

**Request**:
```json
{
  "mac": "00:1A:79:XX:XX:XX",
  "url": "http://portal-url.com",
  "cmd": "/media/file_123.mpg",
  "type": "vod",
  "episodeNumber": "1"
}
```

**Response**:
```json
{
  "url": "https://stream-url.com/path/to/stream.m3u8"
}
```

## Migration Notes

### What Changed

**Before** (Duplicated Code):
- `stalker-client.ts` existed in both `src/lib/` and `expo-rn/lib/`
- `stalker-api.ts` existed in both locations
- `auth.ts` existed in both locations
- Expo app directly called Stalker portal (CORS issues)
- Duplicate proxy implementations

**After** (Clean Separation):
- `stalker-client.ts` only in `src/lib/` (Backend)
- `api-client.ts` in `expo-rn/lib/` (Frontend HTTP client)
- All Stalker interactions go through Next.js APIs
- Single proxy implementation in backend
- No CORS issues
- Single source of truth for business logic

### Breaking Changes

If you have existing code, update imports:

**Old**:
```typescript
import { StalkerClient } from '@/lib/stalker-client';
const client = new StalkerClient({ url, mac });
const channels = await client.getChannels(genre, page);
```

**New**:
```typescript
import { ApiClient } from '@/lib/api-client';
const client = new ApiClient({ url, mac });
const { channels } = await client.getChannels(genre, page);
```

Note the destructured response format.

## Development

### Running Backend (Next.js)
```bash
npm run dev
# Runs on http://localhost:2005
```

### Running Frontend (Expo)
```bash
cd expo-rn
npm start
# Web runs on http://localhost:3005
# Mobile apps connect to http://localhost:2005
```

### Testing API Endpoints

Use curl or Postman:
```bash
curl -X POST http://localhost:2005/api/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"password":"test"}'
```

## Benefits

1. **Separation of Concerns**: Clear boundaries between BE and FE
2. **Security**: Sensitive credentials stay on server
3. **Maintainability**: Single place to update API logic
4. **Scalability**: Easy to add caching, rate limiting, etc.
5. **Testing**: Can test BE and FE independently
6. **CORS**: No browser CORS issues
7. **Consistency**: Same APIs for web and mobile

## Future Enhancements

- [ ] Add response caching in backend APIs
- [ ] Implement rate limiting
- [ ] Add request/response logging
- [ ] Create API documentation with OpenAPI/Swagger
- [ ] Add TypeScript types for all API responses
- [ ] Implement API versioning
- [ ] Add unit tests for API endpoints
- [ ] Add integration tests
