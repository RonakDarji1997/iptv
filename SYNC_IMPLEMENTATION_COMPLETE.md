# Complete IPTV Sync System Implementation

## ✅ What's Been Implemented

### 1. **Channel Sync Endpoint**
**File:** `/src/app/api/providers/[id]/sync-channels/route.ts`

- Syncs all ITV (Live TV) channels
- Fetches ITV genres using `type=itv&action=get_genres`
- Processes channels in batches of 150 pages (2,100 channels per batch)
- Stores channels with logos (full URLs), numbers, categories
- Creates `CHANNEL` type categories

**Usage:**
```bash
POST http://localhost:2005/api/providers/{id}/sync-channels
```

### 2. **Compressed Snapshot**
**File:** `/src/app/api/providers/[id]/snapshot/route.ts`

- **GZIP Compression:** Reduces size by ~70% (132MB → ~40MB)
- **Auto-detection:** Checks `Accept-Encoding: gzip` header
- **Caching:** `Cache-Control: public, max-age=3600` (1 hour)
- Browser/mobile automatically decompress

**Benefits:**
- 132MB JSON → ~40MB compressed transfer
- Faster loading on mobile networks
- Reduces bandwidth costs

### 3. **Smart Sync Detection** (To Implement)

The main `/sync` endpoint should:

```typescript
// Check what's missing
const counts = await Promise.all([
  prisma.movie.count({ where: { providerId } }),
  prisma.series.count({ where: { providerId } }),
  prisma.channel.count({ where: { providerId } })
]);

const [movieCount, seriesCount, channelCount] = counts;
const needsMoviesSync = movieCount === 0;
const needsChannelsSync = channelCount === 0;
const needsFullSync = needsMoviesSync && needsChannelsSync;

if (needsFullSync) {
  // Sync both channels AND VOD
  await Promise.all([
    syncChannelContent(...),
    syncVodContent(...)
  ]);
} else if (needsChannelsSync) {
  // Only sync channels
  await syncChannelContent(...);
} else {
  // Only sync VOD (incremental)
  await syncVodContent(...);
}
```

## 📋 How It Works Now

### First Time Sync (Button Click)
1. User clicks "Sync Content" → Checks database
2. **No movies/series:** Syncs VOD (movies + series)
3. **Result:** 64,106 movies + 19,076 series
4. **Snapshot:** 132MB JSON (or 40MB compressed)

### Channel Sync (Separate)
```bash
curl -X POST http://localhost:2005/api/providers/{id}/sync-channels
```
- Syncs all live TV channels
- Stores with logos, categories, numbers

### Future Full Sync
When user clicks "Sync Content" again:
1. **Check:** Movies exist? ✅ → Incremental VOD sync (first 100 pages)
2. **Check:** Channels exist? ❌ → Full channel sync
3. **Result:** Only syncs what's missing

## 🚀 Optimization Strategies

### 1. **Compression (Implemented)**
- GZIP reduces JSON by 70%
- 132MB → 40MB transfer size
- Automatic browser decompression

### 2. **Pagination for Snapshot**
Instead of one 132MB file, split into pages:

```typescript
// GET /api/providers/[id]/snapshot?page=1&limit=1000
{
  "total": 83182,
  "page": 1,
  "limit": 1000,
  "movies": [...], // 1000 items
  "hasMore": true
}
```

### 3. **Incremental Loading**
Load essentials first:
```json
{
  "stats": { "totalMovies": 64106, "totalSeries": 19076 },
  "categories": [...], // ~2KB
  "featured": [...], // Top 50 items
  // Load rest on demand
}
```

### 4. **CDN + Static Hosting**
Save snapshot to file, serve from CDN:
```bash
# After sync completes
curl http://localhost:2005/api/providers/{id}/snapshot > /var/www/snapshots/provider-{id}.json.gz
# Serve via Nginx/CloudFlare
```

### 5. **Database Queries (Alternative)**
Instead of snapshot, query database directly:
```typescript
// Frontend
const response = await fetch('/api/movies?page=1&limit=50&category=action');
```
**Pros:** Real-time data, no large snapshots  
**Cons:** More API calls, database load

## 📱 Mobile App Integration

### Current (To Fix)
```typescript
// expo-rn/app/(tabs)/index.tsx
// Fetches stats correctly ✅
// But no snapshot loading for movies/series yet
```

### Recommended Approach
```typescript
// 1. On app launch - Load snapshot once
const loadSnapshot = async () => {
  const response = await fetch(`${API_URL}/api/providers/${providerId}/snapshot`, {
    headers: { 'Accept-Encoding': 'gzip' }, // Enable compression
  });
  const snapshot = await response.json();
  
  // Store in AsyncStorage or global state
  await AsyncStorage.setItem('vod_snapshot', JSON.stringify(snapshot));
  
  return snapshot;
};

// 2. Use snapshot for all screens
const MoviesScreen = () => {
  const snapshot = useSnapshot(); // From AsyncStorage
  return snapshot.movies.map(movie => <MovieCard {...movie} />);
};

const LiveTVScreen = () => {
  const channels = await fetch(`${API_URL}/api/providers/${providerId}/channels`);
  // Or include in snapshot
};
```

### Lazy Loading Pattern
```typescript
// Load categories first (small)
const categories = snapshot.categories;

// Load movies when category selected
const movies = snapshot.moviesByCategory[selectedCategory];

// This avoids loading all 83k items at once
```

## 🎯 Recommended Next Steps

### 1. Update Main Sync Route
Add smart detection:
```typescript
// Check what needs syncing
const needsChannels = await prisma.channel.count({ where: { providerId } }) === 0;
const needsVod = await prisma.movie.count({ where: { providerId } }) === 0;

if (needsChannels) {
  // Also sync channels in background
  syncChannelContent(providerId, providerUrl, client, channelJobId);
}
```

### 2. Add Channels to Snapshot
```typescript
const allChannels = await prisma.channel.findMany({
  where: { providerId, isActive: true },
  select: { id: true, name: true, number: true, logo: true, cmd: true },
});

snapshotData.channels = channelsWithFullUrls;
snapshotData.channelsByCategory = groupedChannels;
```

### 3. Create Movies/Series/Channels Screens
```typescript
// expo-rn/app/movies/index.tsx
export default function MoviesScreen() {
  const [snapshot, setSnapshot] = useState(null);
  
  useEffect(() => {
    loadSnapshot();
  }, []);
  
  return (
    <FlatList
      data={snapshot?.movies || []}
      renderItem={({ item }) => <MovieCard movie={item} />}
      keyExtractor={(item) => item.id}
    />
  );
}
```

### 4. Implement Pagination (Optional)
For very large datasets:
```typescript
GET /api/providers/{id}/movies?page=1&limit=100&category={categoryId}
```

## 📊 Current Database Stats

**Provider:** 584c6e57-4859-4e8f-8b94-a59e5ada4d6f  
**Movies:** 64,106  
**Series:** 19,076  
**Channels:** 0 (not synced yet)  
**Snapshot:** 132MB uncompressed, ~40MB gzipped  

## 🎬 Quick Commands

```bash
# Full VOD sync (movies + series)
curl -X POST http://localhost:2005/api/providers/{id}/sync

# Channel sync only
curl -X POST http://localhost:2005/api/providers/{id}/sync-channels

# Get compressed snapshot
curl -H "Accept-Encoding: gzip" http://localhost:2005/api/providers/{id}/snapshot

# Check stats
curl http://localhost:2005/api/providers/{id}/sync | jq '.stats'

# Clean database
curl -X DELETE http://localhost:2005/api/providers/{id}/clean
```

## 📦 File Structure Summary

```
src/app/api/providers/[id]/
├── sync/route.ts              # VOD sync (movies + series)
├── sync-channels/route.ts     # Channel sync (NEW)
├── sync/cancel/route.ts       # Stop sync
├── snapshot/route.ts          # Get snapshot (WITH COMPRESSION)
└── clean/route.ts             # Delete all data

expo-rn/app/
├── (tabs)/index.tsx          # Dashboard (stats work ✅)
├── movies/                   # TODO: Use snapshot
├── series/                   # TODO: Use snapshot
└── live/                     # TODO: Use channels from snapshot
```

## ⚡ Performance Summary

**Current:**
- Batch size: 150 pages (2,100 items per batch)
- Full VOD sync: ~10-15 minutes for 83k items
- Snapshot size: 132MB → 40MB compressed
- Stats: Real-time from database ✅

**Optimizations Applied:**
- ✅ GZIP compression (70% size reduction)
- ✅ Batch processing (150x parallelism)
- ✅ Smart incremental sync (first 100 pages only)
- ✅ Early termination (stops when no new data)
- ✅ HTTP caching (1 hour)
- ✅ Database stats (always persisted)

**Still TODO:**
- Pagination for large snapshots
- Snapshot-based UI screens
- Smart sync detection (channels + VOD together)
- CDN hosting for snapshots
