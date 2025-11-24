# VOD Sync System - Complete Implementation

## Features Implemented

### 1. **Persistent Background Sync**
- ✅ Sync continues even when app is closed/backgrounded
- ✅ Progress persists in AsyncStorage
- ✅ Automatically resumes monitoring when app reopens
- ✅ AppState listener detects foreground/background transitions

### 2. **Incremental Sync**
- ✅ **First Sync**: Full sync of all 83k+ items
- ✅ **Subsequent Syncs**: Only fetch new content
- ✅ Early termination when no new items found (optimization)
- ✅ Tracks: new items added, existing items skipped

### 3. **Real-time Progress UI**
- ✅ Visual progress bar with percentage
- ✅ Live item counts (processed/total)
- ✅ Movies & Series breakdown
- ✅ Updates every 3 seconds
- ✅ Persists across app restarts

### 4. **Snapshot Generation**
- ✅ Creates snapshot after each sync
- ✅ Stores: total counts, categories, sample data
- ✅ Tracks new items added per sync
- ✅ Uses database Snapshot model

### 5. **Smart Sync Detection**
- ✅ Checks for active sync jobs before starting new one
- ✅ Returns existing job if sync already in progress
- ✅ Prevents duplicate syncs

## How It Works

### Full Sync (First Time)
```
1. User clicks "Sync Content"
2. System checks: No existing items → FULL SYNC
3. Fetches all 83,183 items in batches of 140 items (10 pages)
4. Stores ALL metadata (25+ fields per item)
5. Updates progress every batch
6. Generates snapshot with all data
7. Marks sync complete
```

### Incremental Sync (Subsequent) - SMART APPROACH
```
1. User clicks "Sync Content" again
2. System checks: 83k items exist → INCREMENTAL SYNC
3. Loads existing external IDs into Set (in-memory)
4. ⚡ SMART: Checks FIRST 100 pages (p=1 has newest content)
   - Stalker portals add new content at page 1
   - Only fetches ~1,400 items instead of 83k
5. Compares with existing Set → Only saves NEW items
6. Early termination when batch has ONLY existing items
7. Updates complete snapshot with ALL data
```

**Why First Pages?**
- New content is added at page 1 (p=1)
- Checking first 100 pages = 1,400 items vs 83,183
- 98% faster for incremental syncs
- Stops immediately when all items already exist

### Progress Persistence
```
1. Sync starts → Save providerId to AsyncStorage
2. App goes to background → Sync continues on server
3. User reopens app → Checks AsyncStorage
4. If active sync found → Resume polling
5. When complete → Clear AsyncStorage
```

## Database Models Used

### SyncJob
- Tracks: status, totalItems, processedItems, moviesCount, seriesCount
- Updated in real-time during sync
- Used for progress polling

### Snapshot (Complete Data Cache)
- Type: 'vod_sync'
- Contains: **ALL movies & series with FULL metadata**
- Includes: posters, descriptions, ratings, actors, directors, genres, quality flags
- Grouped by categories for fast filtering
- Used for: Fast UI rendering without database queries
- Auto-cleanup: Keeps only last 5 snapshots
- Size: ~50-100MB JSON (compressed in DB)

### Movie & Series
- 25+ metadata fields each
- Indexed by externalId for fast lookups
- CategoryId references Category UUID

## API Endpoints

### POST `/api/providers/[id]/sync`
- Starts sync (or returns existing job)
- Creates SyncJob for tracking
- Runs in background (non-blocking)

### GET `/api/providers/[id]/sync`
- Returns stats (total movies, series, channels)
- Returns activeJob if sync in progress
- Used for polling progress

### GET `/api/providers/[id]/snapshot`
- Returns latest complete snapshot
- Contains ALL movies, series, categories with full metadata
- Used by UI for instant rendering
- No database queries needed
- Example response:
  ```json
  {
    "version": "1.0",
    "generatedAt": "2025-11-23T20:30:00Z",
    "stats": {
      "totalMovies": 45000,
      "totalSeries": 38183,
      "newItemsAdded": 50
    },
    "categories": [...],
    "movies": [{ id, name, poster, year, rating, ... }],
    "series": [{ id, name, poster, episodeCount, ... }],
    "moviesByCategory": { "cat-uuid": [...] },
    "seriesByCategory": { "cat-uuid": [...] }
  }
  ```

## Image Storage

**Images are NOT stored** - only URLs from Stalker API:
- `poster` field stores the path: `/stalker_portal/misc/logos/320/1234.jpg`
- UI constructs full URL: `${providerBaseUrl}${poster}`
- Example: `http://tv.stream4k.cc/stalker_portal/misc/logos/320/1234.jpg`
- This saves storage space and keeps images always up-to-date

## Snapshot Storage

**Location**: Database `Snapshot` table, `data` column (TEXT/JSON)
- NOT a file - stored as text in PostgreSQL
- Size: ~50-100MB per snapshot (text only, no images)
- Contains: ALL movies/series with complete metadata
- Auto-cleanup: Keeps last 5 snapshots per provider
- Access: Via `/api/providers/[id]/snapshot` endpoint

## Performance Optimizations

1. **Batch Processing**: 10 pages (140 items) at once
2. **Early Termination**: Stops immediately when batch has only existing items
3. **Set Lookup**: O(1) existence checks for 83k items
4. **Category Mapping**: Pre-loaded Map for fast UUID lookups
5. **Safe Date Parsing**: Handles invalid dates gracefully

## UI Flow

```
Dashboard
  ├─ Provider Card
  │   ├─ "Sync Content" button
  │   └─ Progress Bar (when syncing)
  │       ├─ Visual bar (green fill)
  │       ├─ Percentage text
  │       └─ Movies/Series counts
  │
  ├─ Stats Cards
  │   ├─ Total Movies
  │   ├─ Total Series
  │   └─ Live Channels
  │
  └─ Last Sync Date
```

## Logs Example

```
[Sync] Initiating FULL sync for provider xxx, job: yyy
[Sync] Found 63 VOD categories
[Sync] Category map created with 63 categories
[Sync] Total VOD items: 83,183, Pages: 5,942
[Sync] Batch 1: 140 items (80 movies, 60 series) | New: 140, Skipped: 0 | Total: 140/83,183
[Sync] Batch 2: 140 items (75 movies, 65 series) | New: 140, Skipped: 0 | Total: 280/83,183
...
[Sync] Generating snapshot...
[Sync] Snapshot created: 45,000 movies, 38,183 series
[Sync] ✅ FULL sync completed! Total: 83,183 items | New: 83,183 | Skipped: 0
```

## Testing

1. **Start Sync**: Click "Sync Content" on dashboard
2. **Close App**: Progress continues on server
3. **Reopen App**: Progress resumes displaying
4. **Second Sync**: Only fetches new items (fast)
5. **Check Snapshot**: View generated JSON in database

## Files Modified

1. `/src/app/api/providers/[id]/sync/route.ts` - Backend sync logic
2. `/expo-rn/app/(tabs)/index.tsx` - Dashboard with progress UI
3. `/prisma/schema.prisma` - SyncJob & Snapshot models

## Next Steps (Optional Enhancements)

- [ ] Push notifications when sync completes
- [ ] Scheduled auto-sync (daily at 3am)
- [ ] Sync history page
- [ ] Manual snapshot viewing
- [ ] Failed sync retry mechanism
