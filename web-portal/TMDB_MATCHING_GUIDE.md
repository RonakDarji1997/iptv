# 🎯 TMDB Name Matching Strategy

## How It Works

### 1. **Smart Title Cleaning**
The system automatically cleans your Stalker portal titles before searching TMDB:

```typescript
// Original Stalker title examples:
"Inception (2010)"           → "Inception"
"The Matrix [1999]"          → "The Matrix"
"Breaking Bad S01E01"        → "Breaking Bad"
"Game of Thrones (Season 1)" → "Game of Thrones"
```

**What gets removed:**
- ✅ Years in parentheses or brackets: `(2010)`, `[1999]`
- ✅ Season/Episode info: `S01E01`, `Season 1`
- ✅ Extra brackets: `[HD]`, `[BluRay]`
- ✅ Quality tags in parentheses

### 2. **TMDB Search Algorithm**
TMDB uses **fuzzy matching** and returns results sorted by **relevance**:

- First result = Most relevant match
- Accounts for typos and variations
- Uses popularity score
- Considers year if extracted from title

### 3. **Automatic Type Detection**
```typescript
// Movies
contentService.enrichWithTMDB(item, 'movie')

// TV Series
contentService.enrichWithTMDB(item, 'tv')
```

---

## Match Quality Examples

### ✅ **Excellent Matches**
```
Stalker Title              → TMDB Match
"Inception"                → ✓ Inception (2010)
"The Dark Knight (2008)"   → ✓ The Dark Knight (2008)
"Breaking Bad"             → ✓ Breaking Bad (TV)
"Game of Thrones S01"      → ✓ Game of Thrones (TV)
```

### ⚠️ **Potential Issues**
```
Stalker Title              → Problem
"Avatar"                   → Could match Avatar (2009) OR Avatar: TLA
"The Office"               → US or UK version?
"Spider-Man"               → Multiple movies with same name
```

### 🔧 **Solutions for Edge Cases**

**1. Include Year in Title**
```
"Avatar 2009"  → Matches correct movie
"Avatar 2022"  → Matches The Way of Water
```

**2. More Specific Names**
```
"The Office US"     → Better match
"Spider-Man 2002"   → Original Raimi film
"Spider-Man 2021"   → No Way Home
```

**3. Database Naming**
Your Stalker portal should use clean, specific names:
- ✓ "Breaking Bad"
- ✗ "Breaking.Bad.S01E01.HDTV.x264"

---

## Performance & Caching

### **Batch Enrichment**
```typescript
// ✅ GOOD: Enrich first 10 items (visible in UI)
await contentService.enrichBatchWithTMDB(items, 'movie')

// ❌ BAD: Enrich 1000 items at once
items.map(item => enrichWithTMDB(item, 'movie'))
```

### **Caching Strategy**
```typescript
// TMDB data is cached in browser for 10 minutes
const enriched = await cache.getOrFetch(
  `tmdb:${item.id}`,
  () => enrichWithTMDB(item, 'movie'),
  10 * 60 * 1000 // 10 minutes
)
```

### **Rate Limits**
- TMDB Free: **40 requests / 10 seconds**
- Daily: **~200,000 requests**
- Current implementation: **10 concurrent max** (safe)

---

## Manual Override (Future Enhancement)

You can add manual TMDB ID mapping for problematic titles:

```typescript
// In your database or config
const manualMappings = {
  "Avatar": { tmdbId: 19995, type: 'movie' },  // Force 2009 version
  "The Office": { tmdbId: 2316, type: 'tv' },  // Force US version
}
```

---

## UI Integration

### **What Users See:**

1. **⭐ Rating Badge**
   - Top-right corner of poster
   - Shows TMDB rating (0-10 scale)
   - Only appears if rating > 0

2. **High-Quality Posters**
   - TMDB images (500px width)
   - Fallback to Stalker portal images
   - Fallback to gradient placeholder

3. **Metadata Available**
   - Rating + vote count
   - Overview/plot
   - Genres
   - Release date
   - IMDb ID (linkable)

---

## Troubleshooting

### "No TMDB data showing"
1. Check `.env.local` has `TMDB_API_KEY`
2. Restart dev server
3. Check browser console for errors
4. Try the test page: `/test-tmdb`

### "Wrong movie matched"
- Title is too generic ("Avatar", "It")
- Add year to title in Stalker portal
- Check if it's a TV show vs movie confusion

### "Ratings not showing"
- Content might be too new/obscure
- TMDB API might be rate-limited
- Check network tab for 429 errors

---

## Current Implementation

✅ **Integrated:**
- ContentCard component shows ratings
- Browse page auto-enriches first 10 items per category
- TMDB images prioritized over Stalker images
- Follows your yellow/black UI theme

⏳ **Not Yet Implemented:**
- Subtitle selection in player
- Full metadata modal
- Search results TMDB enrichment
- Manual ID override system

---

## Example: How a Match Happens

```
1. User browses Movies → Action category
2. Stalker returns: "John Wick (2014) [HD]"
3. System cleans to: "John Wick"
4. Extracts year: 2014
5. Queries TMDB: search/movie?query=John Wick&year=2014
6. TMDB returns top match: John Wick (2014, id: 245891)
7. Fetches full details: movie/245891
8. Caches result for 10 minutes
9. UI displays:
   - High-res poster
   - ⭐ 7.4 rating
   - Action, Thriller genres
   - IMDb link: tt2911666
```

The whole process takes ~200-500ms per item (first load), then instant (cached).

---

**Result:** Your content automatically gets rich metadata and high-quality images! 🎉
