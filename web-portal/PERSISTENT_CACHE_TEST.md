# Persistent Cache Testing Guide

## How to Test localStorage Persistence

### Test 1: Basic Persistence
1. Open the web portal in your browser
2. Navigate to any page that uses cached data (e.g., Continue Watching, Favorites)
3. Open browser console and run:
   ```javascript
   window.__apiCache.getStats()
   ```
4. Note the cache size
5. **Refresh the page (F5 or Cmd+R)**
6. Open console again and run:
   ```javascript
   window.__apiCache.getStats()
   ```
7. ✅ **Expected**: Cache size should be the same, you should see:
   ```
   [Cache] 💾 Restored X entries from storage
   ```

### Test 2: Subtitle Persistence
1. Play a video
2. Select a subtitle
3. Check console - you should see subtitle download
4. **Refresh the page**
5. Play the same video again
6. Click subtitles menu
7. ✅ **Expected**: Subtitle list loads instantly (cache hit)
8. Select the same subtitle again
9. ✅ **Expected**: Subtitle loads instantly (cache hit)

### Test 3: Continue Watching Persistence
1. Visit Continue Watching page (`/continue-watching`)
2. Wait for it to load
3. Note the console logs
4. **Refresh the page**
5. ✅ **Expected**: 
   - Console shows: `[Cache] 💾 Restored X entries from storage`
   - Console shows: `[Cache] 🎯 HIT: /progress`
   - Page loads instantly without API call

### Test 4: Cache Expiration
1. Open browser console
2. Manually set an old timestamp:
   ```javascript
   const cache = JSON.parse(localStorage.getItem('iptv_api_cache'));
   // Set timestamp to 2 hours ago
   for (let key in cache) {
     cache[key].timestamp = Date.now() - (2 * 60 * 60 * 1000);
   }
   localStorage.setItem('iptv_api_cache', JSON.stringify(cache));
   ```
3. **Refresh the page**
4. ✅ **Expected**: Console shows expired entries were not restored

### Test 5: Storage Inspection
1. Open browser DevTools
2. Go to Application tab (Chrome) or Storage tab (Firefox)
3. Navigate to Local Storage → `http://localhost:3001`
4. Find key: `iptv_api_cache`
5. ✅ **Expected**: See JSON object with cached entries

### Test 6: Cache Invalidation Persistence
1. Go to Favorites page
2. Wait for favorites to load (cache populated)
3. Remove a favorite
4. Check console - should see cache invalidation
5. **Refresh the page**
6. ✅ **Expected**: Updated cache is restored (without deleted favorite)

## Console Commands for Testing

```javascript
// Check cache stats
window.__apiCache.getStats()

// View all cached URLs
window.__apiCache.getStats().entries.map(e => e.url)

// Check localStorage size
JSON.stringify(localStorage.getItem('iptv_api_cache')).length + ' bytes'

// Clear cache and storage
window.__apiCache.clear()

// Manually trigger persistence
// (not exposed, but happens automatically)
```

## Expected Console Output

### On Page Load (with existing cache)
```
[Cache] 💾 Restored 12 entries from storage (3 expired)
```

### On Cache Hit
```
[Cache] 🎯 HIT: /api/subtitles?action=search&imdbId=123
```

### On Cache Miss
```
[Cache] 📡 MISS: /api/favorites
```

### On Invalidation
```
[Cache] 🗑️ INVALIDATED: /api/favorites
```

## Troubleshooting

### Cache not persisting?
1. Check if localStorage is enabled in browser
2. Check browser privacy settings (some modes disable localStorage)
3. Check for storage quota issues
4. Look for console warnings about storage failures

### Cache too large?
- Current implementation has no size limit
- Browser localStorage typically has 5-10MB limit
- If quota exceeded, cache falls back to memory-only mode
- Consider clearing old cache: `window.__apiCache.clear()`

### Cache showing stale data?
- Check cache timestamps: `window.__apiCache.getStats().entries`
- TTL is 1 hour - older entries should not be restored
- Try manual invalidation: `window.__apiCache.invalidatePattern('/api')`
