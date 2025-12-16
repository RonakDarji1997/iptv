# TMDB Data Source Logging Guide

## 🔍 Console Logging Overview

When browsing content, you'll see detailed logs showing what data is being used from TMDB vs your Stalker provider.

---

## 📊 Log Examples

### **Browse Page - Batch Enrichment**

```javascript
[TMDB] Batch enriching 20 movies (processing first 10)
[TMDB] Enriching movie: "Inception"
[TMDB] Match found for "Inception": {
  tmdbId: 27205,
  title: "Inception",
  rating: 8.4,
  year: "2010-07-16"
}
[TMDB] Enriching movie: "The Matrix"
[TMDB] Match found for "The Matrix": {
  tmdbId: 603,
  title: "The Matrix",
  rating: 8.2,
  year: "1999-03-30"
}
[TMDB] No match found for "Obscure Movie Title 2024"
[TMDB] Batch complete: 9/10 enriched
```

### **Movie Detail Page**

```javascript
[MovieDetail] Data sources: {
  tmdbAvailable: true,
  usingTmdbBackdrop: true,
  usingTmdbPoster: true,
  usingTmdbRating: true,
  usingTmdbGenres: true,
  usingTmdbOverview: true,
  fallbackToProvider: false
}
```

**With Fallback:**
```javascript
[MovieDetail] Data sources: {
  tmdbAvailable: false,
  usingTmdbBackdrop: false,
  usingTmdbPoster: false,
  usingTmdbRating: false,
  usingTmdbGenres: false,
  usingTmdbOverview: false,
  fallbackToProvider: true
}
```

### **Series Detail Page**

```javascript
[TMDB] Enriching tv: "Breaking Bad"
[TMDB] Match found for "Breaking Bad": {
  tmdbId: 1396,
  title: "Breaking Bad",
  rating: 9.5,
  year: "2008-01-20"
}

[SeriesDetail] Data sources: {
  tmdbAvailable: true,
  usingTmdbBackdrop: true,
  usingTmdbPoster: true,
  usingTmdbRating: true,
  usingTmdbGenres: true,
  usingTmdbOverview: true,
  fallbackToProvider: false
}
```

---

## 🎨 Visual Indicators

### **Content Cards**
- **Blue "TMDB" badge** (top-left) - Shows when TMDB data is used
- **Yellow star rating** (top-right) - Shows TMDB rating

### **Detail Pages**
- **TMDB Data badge** - Blue badge with text "Enhanced with metadata from The Movie Database"
- Appears below the overview section when TMDB data is used

---

## 📈 What Each Field Tells You

| Log Field | Meaning |
|-----------|---------|
| `tmdbAvailable` | TMDB API returned data for this title |
| `usingTmdbBackdrop` | Background image from TMDB (high quality) |
| `usingTmdbPoster` | Poster image from TMDB (high quality) |
| `usingTmdbRating` | Rating from TMDB (0-10 scale with vote count) |
| `usingTmdbGenres` | Genre list from TMDB |
| `usingTmdbOverview` | Plot summary from TMDB |
| `fallbackToProvider` | Using Stalker portal data instead |

---

## 🔄 Fallback Priority

### **Images:**
1. ✅ TMDB poster/backdrop (1280px/500px high quality)
2. ⬇️ Provider images (upscaled via UpscaledImage component)
3. ⬇️ Gradient placeholder

### **Metadata:**
1. ✅ TMDB rating (with vote count)
2. ⬇️ Provider IMDb/Kinopoisk rating
3. ⬇️ No rating shown

### **Text:**
1. ✅ TMDB overview
2. ⬇️ Provider description
3. ⬇️ No description shown

### **Genres:**
1. ✅ TMDB genres array (formatted as pills)
2. ⬇️ Provider genre string (comma-separated)
3. ⬇️ No genres shown

---

## 🐛 Debugging Issues

### **No TMDB Data Showing**

Check console for:
```javascript
[TMDB] No match found for "Movie Title"
[TMDB] Failed to fetch for "Movie Title": 404
```

**Solutions:**
- Title too generic or misspelled
- Add year to title in Stalker portal
- Check TMDB API key in `.env.local`
- Verify network requests in browser DevTools

### **Partial TMDB Data**

```javascript
[MovieDetail] Data sources: {
  tmdbAvailable: true,
  usingTmdbBackdrop: true,
  usingTmdbPoster: false,  // ← Poster missing in TMDB
  usingTmdbRating: true,
  usingTmdbGenres: true,
  usingTmdbOverview: true,
  fallbackToProvider: false
}
```

This is normal - some movies have incomplete data on TMDB. The system automatically falls back to provider data for missing fields.

### **Rate Limiting**

```javascript
[TMDB] Failed to fetch for "Movie Title": 429
```

**Solutions:**
- Wait 10 seconds and reload
- TMDB free tier: 40 requests/10 seconds
- Batch enrichment already limits to 10 concurrent

---

## 📝 Example Full Flow

```javascript
// User visits browse page
[TMDB] Batch enriching 20 movies (processing first 10)

// For each movie
[TMDB] Enriching movie: "Inception"
[TMDB] Match found for "Inception": { tmdbId: 27205, title: "Inception", rating: 8.4, year: "2010-07-16" }

// Batch complete
[TMDB] Batch complete: 9/10 enriched

// User clicks on "Inception"
[TMDB] Enriching movie: "Inception"  // Detail page fetches full data
[TMDB] Match found for "Inception": { ... }

// Detail page renders
[MovieDetail] Data sources: {
  tmdbAvailable: true,
  usingTmdbBackdrop: true,
  usingTmdbPoster: true,
  usingTmdbRating: true,
  usingTmdbGenres: true,
  usingTmdbOverview: true,
  fallbackToProvider: false
}
```

---

## 🎯 Performance Monitoring

Watch these metrics in console:

**Good:**
```javascript
[TMDB] Batch complete: 10/10 enriched  // ✅ All matched
[TMDB] Batch complete: 8/10 enriched   // ✅ Most matched
```

**Needs Attention:**
```javascript
[TMDB] Batch complete: 2/10 enriched   // ⚠️ Poor matching
[TMDB] Batch complete: 0/10 enriched   // ❌ API issue or bad titles
```

If match rate is low, improve title quality in your Stalker portal database.

---

## 💡 Pro Tips

1. **Check Console First** - Before reporting issues, check what data sources are being used
2. **Network Tab** - View actual TMDB API requests in browser DevTools
3. **Cache** - TMDB data is cached for 10 minutes per item
4. **Batch Limit** - Only first 10 items per category are enriched (visible items)
5. **Blue Badge** - Quick visual indicator that TMDB is working

---

**Happy debugging!** 🚀
