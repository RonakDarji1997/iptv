# Per-Category Sync Implementation Guide

## Problem
Current sync uses `category=*` which fetches mixed content from all categories. This doesn't guarantee full coverage of all categories, especially adult/censored categories.

## Solution
Implement per-category recursive fetching:

### 1. **Fetch All Categories First**
```typescript
const categories = await client.getMovieCategories();
```

### 2. **Loop Through Each Category**
```typescript
for (const category of categories) {
  console.log(`[Sync] Processing category: ${category.title} (ID: ${category.id})`);
  
  let page = 1;
  let hasMore = true;
  
  // Fetch all pages for this category until exhausted
  while (hasMore) {
    const result = await client.getMovies(category.id, page);
    
    if (result.data.length === 0) {
      hasMore = false;
      break;
    }
    
    // Process items (save to database)
    for (const item of result.data) {
      const isSeries = item.is_series === '1' || item.is_series === 1;
      
      if (isSeries) {
        // Save series
        await prisma.series.upsert({...});
        
        // Fetch series episodes (IMPORTANT!)
        await fetchSeriesEpisodes(item.id);
      } else {
        // Save movie
        await prisma.movie.upsert({...});
      }
    }
    
    page++;
  }
  
  console.log(`[Sync] Category ${category.title}: synced ${categoryItemCount} items`);
}
```

### 3. **Fetch Series Episodes (NEW REQUIREMENT)**
```typescript
async function fetchSeriesEpisodes(seriesId: string) {
  // First, get series info to find seasons
  const seriesInfo = await client.getSeriesInfo(seriesId);
  
  // For each season, fetch all episodes
  for (const season of seriesInfo.seasons || []) {
    let page = 1;
    let hasMore = true;
    
    while (hasMore) {
      const episodesResult = await client.getSeriesEpisodes(seriesId, season.id, page);
      
      if (episodesResult.data.length === 0) {
        hasMore = false;
        break;
      }
      
      // Save episodes to database
      for (const episode of episodesResult.data) {
        await prisma.episode.upsert({
          where: {
            seriesId_seasonId_episodeNumber: {
              seriesId,
              seasonId: season.id,
              episodeNumber: episode.num,
            }
          },
          update: {
            name: episode.name,
            cmd: episode.cmd,
            // ... other fields
          },
          create: {
            seriesId,
            seasonId: season.id,
            episodeNumber: episode.num,
            name: episode.name,
            cmd: episode.cmd,
            // ... other fields
          }
        });
      }
      
      page++;
    }
  }
}
```

## Key Changes from Current Implementation

### BEFORE (WRONG):
```typescript
const firstPage = await client.getMovies('*', 1);  // Fetches mixed content
const totalPages = Math.ceil(totalItems / itemsPerPage);

for (let page = 1; page <= totalPages; page++) {
  const result = await client.getMovies('*', page);
  // Process...
}
```

### AFTER (CORRECT):
```typescript
const categories = await client.getMovieCategories();

for (const category of categories) {
  let page = 1;
  let hasMore = true;
  
  while (hasMore) {
    const result = await client.getMovies(category.id, page);
    
    if (result.data.length === 0) {
      hasMore = false;
    } else {
      // Process items
      for (const item of result.data) {
        // Save to database
        // Fetch episodes if series
      }
      page++;
    }
  }
}
```

## Why This Fixes Adult Categories

1. **Guaranteed Coverage**: Each category is fetched individually, ensuring no content is skipped
2. **Recursive Exhaustion**: Loop continues until `result.data.length === 0` for each category
3. **Censored Flag**: Adult categories (censored=1) are treated the same as other categories
4. **Series Episodes**: Additional API calls fetch episode details that were previously missing

## Implementation Steps

1. **Update `syncVodContent` function** in `/src/app/api/providers/[id]/sync/route.ts`:
   - Remove `client.getMovies('*', 1)` approach
   - Add per-category loop with `while (hasMore)` pagination
   - Track per-category statistics

2. **Add Series Episode Fetching**:
   - Create `fetchSeriesEpisodes()` helper function
   - Call it after each series is saved
   - Store episodes in `Episode` table (may need Prisma schema update)

3. **Update Progress Tracking**:
   - Track current category being synced
   - Count items per category
   - Update sync job with category progress

4. **Incremental Sync Adaptation**:
   - For incremental mode, check first N pages per category
   - Stop per-category when consecutive pages are all duplicates
   - Still ensures adult categories are checked

## Expected Results

- Adult category 73 (GENERAL): 9,551 items synced
- Adult category 149 (CELEBRITY): 341 items synced
- All categories have `hasMovies: true` or `hasSeries: true` after sync
- Series have episodes stored in database
- Total sync time may increase but coverage is 100%

## Testing

```bash
# 1. Clean existing data
curl -X POST http://localhost:3000/api/providers/YOUR_PROVIDER_ID/clean

# 2. Run full sync with new logic
curl -X POST http://localhost:3000/api/providers/YOUR_PROVIDER_ID/sync?mode=full

# 3. Check adult categories in snapshot
curl http://localhost:3000/api/providers/YOUR_PROVIDER_ID/snapshot | jq '.categories[] | select(.name | contains("ADULT"))'

# 4. Count movies in adult category 73
curl http://localhost:3000/api/providers/YOUR_PROVIDER_ID/snapshot | jq '[.movies[] | select(.categoryId == "UUID_OF_CATEGORY_73")] | length'
```

Expected: Should show 9,551 movies in category 73, `hasMovies: true` for all adult categories.
