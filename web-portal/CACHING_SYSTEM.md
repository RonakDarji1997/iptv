# Caching System Implementation

## Overview
A comprehensive **1-hour caching system** has been implemented across the web portal to eliminate redundant API calls and enable instant navigation. The system includes both **client-side** and **server-side** caching with automatic cleanup.

## 🆕 New API Cache (`/web-portal/src/utils/api-cache.ts`)

### Features
- **1-hour TTL**: All cached data persists for 60 minutes
- **✨ localStorage Persistence**: Cache survives page refreshes!
- **Smart cache keys**: Generated from URL + HTTP method + body
- **Automatic fetch**: Drop-in replacement for `fetch()`
- **Cache statistics**: Debug and monitor cache performance
- **Auto-cleanup**: Expired entries removed every 10 minutes
- **Browser debugging**: Exposed to `window.__apiCache`
- **Storage management**: Handles quota limits gracefully

### API Methods

#### `fetch<T>(url: string, options?: RequestInit): Promise<T>`
Fetch with automatic caching (replaces standard fetch)

```typescript
import { apiCache } from '@/utils/api-cache';

// Automatically caches for 1 hour
const data = await apiCache.fetch('/api/subtitles?action=search&imdbId=123');
```

#### `invalidate(url: string, options?: RequestInit): void`
Remove specific cache entry

```typescript
apiCache.invalidate('/api/favorites');
```

#### `invalidatePattern(pattern: string | RegExp): void`
Remove all entries matching pattern

```typescript
apiCache.invalidatePattern('/subtitles');
apiCache.invalidatePattern(/^\/api\/progress/);
```

#### `getStats()`
Get cache statistics

```typescript
const stats = apiCache.getStats();
// { size: 42, entries: [...] }
```

## Original Cache Manager (`/web-portal/src/utils/cache.ts`)

### Features
- **In-memory storage**: Fast access with Map data structure
- **TTL support**: Automatic expiration of cached entries (default: 5 minutes)
- **Auto-cleanup**: Expired entries are cleared every 5 minutes
- **Helper methods**: Convenient `getOrFetch()` pattern for API calls

#### `set<T>(key: string, data: T, ttl?: number): void`
Store data in cache with optional TTL (default: 5 minutes)

```typescript
cache.set('user-profile', userData, 10 * 60 * 1000); // 10 minutes
```

#### `get<T>(key: string): T | null`
Retrieve data from cache (returns null if not found or expired)

```typescript
const userData = cache.get<UserProfile>('user-profile');
```

#### `has(key: string): boolean`
Check if a key exists and is not expired

```typescript
if (cache.has('user-profile')) {
  // Data is available
}
```

#### `delete(key: string): void`
Remove a specific cache entry

```typescript
cache.delete('user-profile');
```

#### `clear(): void`
Clear all cache entries

```typescript
cache.clear();
```

#### `getOrFetch<T>(key: string, fetchFn: () => Promise<T>, ttl?: number): Promise<T>`
Get data from cache or fetch if not available (recommended pattern)

```typescript
const data = await cache.getOrFetch(
  'api-data-key',
  async () => {
    const response = await fetch('/api/endpoint');
    return response.json();
  },
  10 * 60 * 1000 // 10 minutes TTL
);
```

## Implementation Locations

### 1. Content Service (`/web-portal/src/services/contentService.ts`) - **PRIMARY CACHING**
**Cached Data:**
- **Categories**: `categories:{type}` or `categories:all`
  - TTL: 5 minutes
  - Used by all browse pages (movies, series, live)
  
- **Live TV Channels**: `channels:{categoryId}:page:{page}`
  - TTL: 3 minutes
  - Used by Live TV browse page and view all page
  
- **VOD Content** (Movies/Series): `vod:{categoryId}:page:{page}`
  - TTL: 3 minutes
  - Used by Movies/Series browse pages and view all pages

**Benefits:**
- **MASSIVE reduction in API calls** on main browse pages
- Categories cached across all pages
- Paginated content cached per page
- Automatic cache reuse when navigating between pages
- Users see instant results when returning to previously viewed pages

**Usage Example:**
```typescript
// Categories cached automatically
const categories = await contentService.getCategories('MOVIE');

// VOD content cached per page
const page1 = await contentService.getVODContent(categoryId, 1);
const page2 = await contentService.getVODContent(categoryId, 2);
```

### 2. VOD Player (`/web-portal/src/app/player/vod/page.tsx`)
**Cached Data:**
- Episode info: `episode-info:{seriesId}:{seasonId}:{episodeId}`
- TTL: 10 minutes

**Usage:**
```typescript
const episodeCacheKey = `episode-info:${seriesId}:${seasonId}:${episode.id}`;
const infoData = await cache.getOrFetch(
  episodeCacheKey,
  async () => {
    const response = await fetch(
      `http://localhost:3000/stalker-proxy/episode-info/${seriesId}/${seasonId}/${episode.id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.json();
  },
  10 * 60 * 1000
);
```

### 3. Series Detail Page (`/web-portal/src/app/browse/series/[categoryId]/[seriesId]/page.tsx`)
**Cached Data:**
- Series seasons: `series-seasons:{seriesId}`
- Series episodes: `series-episodes:{seriesId}:{seasonId}`
- Episode info: `episode-info:{seriesId}:{seasonId}:{episodeId}`
- TTL: 10 minutes for all

**Benefits:**
- Seasons list cached on first load
- Episodes cached per season when expanded
- Episode info cached when playing

### 4. Movie Detail Page (`/web-portal/src/app/browse/movies/[categoryId]/[movieId]/page.tsx`)
**Cached Data:**
- VOD info: `vod-info:{movieId}`
- TTL: 10 minutes

**Benefits:**
- Movie file info cached on first play button click
- Reduces API calls when user plays/pauses multiple times

### 5. Browse Pages (Movies, Series, Live TV)
**Cached Data:**
- All data fetched via contentService (see #1)
- Categories and paginated content automatically cached

**Benefits:**
- Instant page load on revisits
- Smooth scrolling with cached thumbnails
- Reduced server load

### 6. Search Page (`/web-portal/src/app/search/page.tsx`)
**Cached Data:**
- Search results: `search:{query}`
- TTL: 1 minute

**Benefits:**
- Instant results for repeated searches
- Reduced API calls for popular searches
- Fast back/forward navigation

**Usage:**
```typescript
const cacheKey = `search:${searchQuery.toLowerCase()}`;
const data = await cache.getOrFetch(
  cacheKey,
  async () => {
    const response = await fetch(
      `${API_URL}/stalker-proxy/search?search=${encodeURIComponent(searchQuery)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.json();
  },
  60 * 1000 // 1 minute TTL
);

## Cache Key Patterns

| Data Type | Key Pattern | TTL | Used By |
|-----------|-------------|-----|---------|
| Categories (All) | `categories:all` | 5 min | Browse pages |
| Categories (Type) | `categories:{type}` | 5 min | Movies/Series/Live pages |
| Live Channels | `channels:{categoryId}:page:{page}` | 3 min | Live TV browse, view all |
| VOD Content | `vod:{categoryId}:page:{page}` | 3 min | Movies/Series browse, view all |
| Search Results | `search:{query}` | 1 min | Search page |
| Series Seasons | `series-seasons:{seriesId}` | 10 min | Series detail page |
| Series Episodes | `series-episodes:{seriesId}:{seasonId}` | 10 min | Series detail page |
| Episode Info | `episode-info:{seriesId}:{seasonId}:{episodeId}` | 10 min | Series detail, VOD player |
| VOD Info | `vod-info:{movieId}` | 10 min | Movie detail page |
| **Subtitle Search** | `search:{imdbId}:{languages}` | **1 hour** | **Subtitle API** |
| **Subtitle Download** | `download:{fileId}` | **1 hour** | **Subtitle API** |
| **Progress List** | `/progress` | **1 hour** | **Continue Watching** |
| **Favorites** | `/favorites` + filters | **1 hour** | **Favorites Page** |

## Performance Benefits

### Before Enhanced Caching (Original)
- **Browse pages**: Every visit = API call for categories + API calls for each category content
- **View all pages**: Every page scroll = new API call
- **Episode navigation**: 2 API calls per episode (episode-info + create-link)
- **Series page**: 1 API call for seasons + 1 per season expanded
- **Movie playback**: 1 API call every time play button clicked

### After Enhanced Caching (1-Hour System)
- **Browse pages**: First visit = API calls, revisits within 3-5 min = 0 calls ⚡
- **View all pages**: Scrolled pages cached for 3 min = instant back/forward navigation ⚡
- **Episode navigation**: First episode = 2 calls, subsequent = 1 call (50% reduction) ⚡
- **Series page**: First load = API calls, revisits within 10 min = 0 calls ⚡
- **Movie playback**: First play = 1 call, subsequent within 10 min = 0 calls ⚡
- **🆕 Subtitles**: First download = 1 call, re-select within 1 hour = **0 calls** ⚡
- **🆕 Continue Watching**: Reload/tab switch within 1 hour = **0 calls** ⚡
- **🆕 Favorites**: View within 1 hour = **0 calls** ⚡

### Real-World Impact
- **User browses Movies page**: 
  - First visit: ~10-15 API calls (categories + 3 category pages)
  - Returns within 3 min: **0 API calls** (100% cached)
  
- **User scrolls through category (view all)**:
  - Pages 1-5 loaded: 5 API calls
  - Scrolls back up: **0 additional calls** (pages cached)
  
- **User watches series episodes**:
  - Episode 1: 2 API calls
  - Episodes 2-10: 1 call each (50% reduction)
  - Rewatch within 10 min: **0 calls per episode**

- **🆕 User selects subtitles**:
  - First search: 1 API call (OpenSubtitles)
  - First download: 1 API call
  - Re-open menu: **0 calls** (cached for 1 hour)
  - Re-select same subtitle: **0 calls** (VTT cached)

- **🆕 User checks Continue Watching**:
  - First load: 1 API call
  - Refresh page: **0 calls** (cached for 1 hour)

## Debugging

### Browser Console
```javascript
// Check API cache stats
window.__apiCache.getStats()

// View cache entries
window.__apiCache.getStats().entries

// Clear all API cache
window.__apiCache.clear()

// Invalidate specific pattern
window.__apiCache.invalidatePattern('/subtitles')
```

### Console Logs
- `[Cache] 🎯 HIT:` - Data served from cache
- `[Cache] 📡 MISS:` - Data fetched from API
- `[Cache] 🗑️ INVALIDATED:` - Cache entry removed
- `[Cache] 🧹 CLEARED` - Cache cleaned
- `[Cache] 💾 Restored X entries from storage` - Cache loaded from localStorage on page load
- `[Subtitles Cache] 🎯 HIT:` - Server-side subtitle cache hit

## Important Notes

1. **Stream Links Not Cached**: The `/create-link` endpoint is intentionally NOT cached as these URLs may expire or have session-based restrictions.

2. **✨ Persistent Cache**: The API cache now persists to localStorage and survives page refreshes! Cache is automatically restored on page load.

3. **Memory Management**: The auto-cleanup mechanism runs every 5-10 minutes to remove expired entries and prevent memory bloat.

4. **Smart Invalidation**: Favorites cache is automatically invalidated when items are deleted.

5. **Silent Error Handling**: 406 errors (quota exceeded) for subtitles are handled silently with user-friendly messages.

6. **Storage Quota**: If localStorage quota is exceeded, the cache gracefully degrades to memory-only mode.

## Future Improvements

- [x] ~~Implement persistent cache using IndexedDB for cross-session caching~~ ✅ **DONE with localStorage**
- [ ] Add request deduplication for concurrent cache misses
- [ ] Add cache statistics dashboard
- [ ] Implement cache warming strategies
- [ ] Add configurable TTL per endpoint
- [ ] Consider LRU (Least Recently Used) eviction policy with size limits
- [ ] Add cache versioning for API changes
- [ ] Migrate to IndexedDB for larger storage capacity

