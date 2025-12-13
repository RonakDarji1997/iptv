# Caching System Implementation

## Overview
A simple in-memory caching system has been implemented to reduce backend API calls and improve application performance. The cache uses TTL (Time To Live) to automatically expire stale data.

## Cache Manager (`/web-portal/src/utils/cache.ts`)

### Features
- **In-memory storage**: Fast access with Map data structure
- **TTL support**: Automatic expiration of cached entries
- **Auto-cleanup**: Expired entries are cleared every 5 minutes
- **Helper methods**: Convenient `getOrFetch()` pattern for API calls

### API Methods

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

## Performance Benefits

### Before Caching
- **Browse pages**: Every visit = API call for categories + API calls for each category content
- **View all pages**: Every page scroll = new API call
- **Episode navigation**: 2 API calls per episode (episode-info + create-link)
- **Series page**: 1 API call for seasons + 1 per season expanded
- **Movie playback**: 1 API call every time play button clicked

### After Caching
- **Browse pages**: First visit = API calls, revisits within 3-5 min = 0 calls ⚡
- **View all pages**: Scrolled pages cached for 3 min = instant back/forward navigation ⚡
- **Episode navigation**: First episode = 2 calls, subsequent = 1 call (50% reduction) ⚡
- **Series page**: First load = API calls, revisits within 10 min = 0 calls ⚡
- **Movie playback**: First play = 1 call, subsequent within 10 min = 0 calls ⚡

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

## Important Notes

1. **Stream Links Not Cached**: The `/create-link` endpoint is intentionally NOT cached as these URLs may expire or have session-based restrictions.

2. **Client-Side Only**: This is an in-memory cache that exists only in the browser. It will be cleared on page refresh.

3. **Memory Management**: The auto-cleanup mechanism runs every 5 minutes to remove expired entries and prevent memory bloat.

4. **Concurrent Requests**: Multiple simultaneous requests for the same uncached key will each trigger a fetch. Consider implementing request deduplication if needed.

## Future Improvements

- [ ] Add request deduplication for concurrent cache misses
- [ ] Implement persistent cache using IndexedDB for longer TTL
- [ ] Add cache statistics/monitoring
- [ ] Implement cache warming strategies
- [ ] Add selective cache invalidation on user actions
- [ ] Consider LRU (Least Recently Used) eviction policy
