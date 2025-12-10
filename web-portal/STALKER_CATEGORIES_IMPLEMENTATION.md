# Stalker Categories Auto-Fetch Implementation

## Overview
Complete implementation of automatic category fetching and saving after successful Stalker portal authentication.

## Flow
1. **Authentication** - Handshake + Get Profile
2. **Fetch Live TV Categories** - `get_genres` with `type=itv`
3. **Fetch VOD Categories** - `get_categories` with `type=vod`
4. **Detect VOD Types** - Sample each category to determine if MOVIE or SERIES
5. **Save to Database** - Bulk save all categories with correct types
6. **Show Success** - Display popup with category count

## API Endpoints Used

### Live TV Genres
```
GET /stalker_portal/server/load.php?type=itv&action=get_genres
```
Returns array of live TV genres/categories. Each mapped to `type: 'CHANNEL'`.

### VOD Categories
```
GET /stalker_portal/server/load.php?type=vod&action=get_categories
```
Returns array of VOD categories (contains both movies and series).

### VOD Content Sampling
```
GET /stalker_portal/server/load.php?type=vod&action=get_ordered_list&category={id}&p=1
```
Returns first page of items. Check `is_series` field:
- `is_series === '1' or 1` → Category type = `SERIES`
- `is_series === '0' or 0` → Category type = `MOVIE`

## Database Schema

### Category Model
```prisma
model Category {
  id         String   @id @default(uuid())
  providerId String
  provider   Provider @relation(...)
  
  externalId String   // Stalker's category ID
  name       String
  type       CategoryType  // CHANNEL | MOVIE | SERIES
  parentId   String?
  isEnabled  Boolean  @default(true)
  ...
}

enum CategoryType {
  CHANNEL  // Live TV
  MOVIE    // VOD Movies
  SERIES   // VOD Series
}
```

## Implementation Details

### New Service Methods

#### `StalkerAuthService.getLiveTvGenres()`
- Fetches all Live TV genres
- Filters out special categories ("All", "DVB")
- Returns array of genres with id, title, censored status

#### `StalkerAuthService.getVodCategories()`
- Fetches all VOD categories
- Filters out "All" category
- Returns array of categories

#### `StalkerAuthService.detectVodCategoryType()`
- Samples first page of category
- Checks `is_series` field on items
- Returns `'MOVIE'` or `'SERIES'`

#### `StalkerAuthService.fetchAllCategories()`
- Orchestrates full category fetch
- Combines Live TV + VOD categories
- Detects type for each VOD category
- Returns complete category array with proper types

#### `ProviderService.fetchAndSaveCategories()`
- Fetches categories from Stalker portal
- Saves to backend via `/sync/categories`
- Supports progress callback

#### `ProviderService.setupStalkerProvider()`
- Complete setup flow:
  1. Authenticate with portal
  2. Save provider to database
  3. Fetch and save all categories
  4. Return provider + category count

### Updated Components

#### `AddProviderModal`
- Added progress tracking state
- Shows progress UI during setup
- Uses `setupStalkerProvider()` for complete flow
- Displays category count on success

## Progress Tracking

The UI shows real-time progress:
1. **Authenticating with portal...** (Step 1/3)
2. **Saving provider...** (Step 2/3)
3. **Fetching categories...** (Step 3/3)
4. **Categories fetched, saving to database...**
5. **✅ {count} categories saved!**

## Category Type Mapping

| Portal Type | Content Type | Database Type | UI Display |
|-------------|--------------|---------------|------------|
| `itv` genres | LIVE | CHANNEL | Live TV |
| `vod` (is_series=0) | VOD | MOVIE | Movies |
| `vod` (is_series=1) | VOD | SERIES | TV Shows |

## Backend Integration

### POST /sync/categories
Expects:
```json
{
  "provider_id": "web_1234567890",
  "categories": [
    {
      "id": "5",
      "name": "ENGLISH | NEWS",
      "type": "CHANNEL",
      "contentType": "LIVE",
      "censored": 0,
      "isEnabled": true,
      "sortOrder": 1
    },
    {
      "id": "168",
      "name": "ENGLISH | UPCOMING MOVIES",
      "type": "MOVIE",
      "contentType": "VOD",
      "censored": 0,
      "isEnabled": true,
      "sortOrder": 0
    },
    {
      "id": "42",
      "name": "ENGLISH | SERIES",
      "type": "SERIES",
      "contentType": "VOD",
      "censored": 0,
      "isEnabled": true,
      "sortOrder": 0
    }
  ]
}
```

## Testing

### Console Logs
Comprehensive logging at each step:
- 📺 Fetching Live TV genres...
- 🎬 Fetching VOD categories...
- 🔍 Sampling category {id} to detect type...
- ✅ Category {id} detected as MOVIE/SERIES
- 📋 Fetching all Stalker categories...
- 💾 Saving {count} categories to database...
- 🎉 Total categories fetched: {count}

### Success Flow
1. User enters Stalker portal URL + name
2. MAC auto-generated and cached
3. Click "Add Provider"
4. Progress shown for authentication → save → categories
5. Success toast: "{Provider Name} added with {X} categories!"
6. Modal closes, provider appears in dashboard

## Error Handling

- **Authentication fails** → Show error, keep MAC cached for retry
- **Category fetch fails** → Provider saved but categories empty
- **Category type detection fails** → Defaults to MOVIE
- **Empty category** → Defaults to MOVIE

## Performance

- Small delay (100ms) between category type detections
- Avoids overwhelming Stalker portal
- Typical setup time: 30-60 seconds for portals with 50+ categories

## Future Enhancements

1. **Parallel type detection** - Detect multiple categories at once
2. **Cache category types** - Remember types for known categories
3. **Background sync** - Queue category fetching as background job
4. **Incremental updates** - Only fetch new/changed categories
5. **Xtream Codes support** - Similar category fetching for Xtream

## Files Modified

1. `/web-portal/src/services/providerService.ts`
   - Added Stalker category fetching methods
   - Added complete setup flow

2. `/web-portal/src/components/AddProviderModal.tsx`
   - Added progress tracking
   - Updated to use setupStalkerProvider()
   - Added progress UI

## Database Tables

- `providers` - Provider info (URL, MAC, token)
- `categories` - All categories with types
- No additional tables needed

## Completion Status

✅ Database schema verified
✅ Category fetching service implemented
✅ VOD type detection implemented
✅ Complete provider setup flow
✅ Progress tracking in UI
✅ Error handling
✅ Console logging
✅ MAC caching
✅ Backend integration

Ready for testing with real Stalker portals!
