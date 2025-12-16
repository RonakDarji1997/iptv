# TMDB & Subtitles Integration Guide

## 🎬 Features Added

This integration adds:
- **TMDB Integration** - High-quality images, ratings, metadata from The Movie Database
- **OpenSubtitles Support** - Subtitle fetching for VOD content
- **Enhanced UI** - Better content cards with ratings and metadata
- **Free APIs** - No paid services required!

---

## 🚀 Setup Instructions

### 1. Get TMDB API Key (FREE)

1. Go to https://www.themoviedb.org/signup
2. Create a free account
3. Go to Settings → API → Create API Key
4. Choose "Developer" option
5. Fill in the form (use "Personal" or "Educational" for type)
6. Copy your API key

### 2. Get OpenSubtitles API Key (FREE - Optional)

1. Go to https://www.opensubtitles.com/api
2. Create a free account
3. Request an API key (Consumer plan is free)
4. Copy your API key

### 3. Configure Environment Variables

Edit your `.env.local` file in the `web-portal` directory:

```bash
# TMDB API (REQUIRED for images and ratings)
TMDB_API_KEY=your_tmdb_api_key_here

# OpenSubtitles API (OPTIONAL for subtitles)
OPENSUBTITLES_API_KEY=your_opensubtitles_api_key_here
```

### 4. Restart the Development Server

```bash
cd web-portal
npm run dev
```

---

## 📚 Usage

### TMDB Service

The TMDB service is automatically used when browsing content:

```typescript
import { contentService } from '@/services/contentService';

// Enrich a single item
const enrichedItem = await contentService.enrichWithTMDB(item, 'movie');

// Enrich multiple items
const enrichedItems = await contentService.enrichBatchWithTMDB(items, 'tv');
```

### Content Item with TMDB Data

Enriched content items now include:

```typescript
{
  id: "123",
  name: "Inception",
  // ... other fields
  tmdb: {
    id: 27205,
    posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
    rating: 8.4,
    voteCount: 25000,
    overview: "A thief who steals corporate secrets...",
    releaseDate: "2010-07-16",
    genres: ["Action", "Science Fiction", "Adventure"],
    imdbId: "tt1375666"
  }
}
```

### Subtitle Service

```typescript
import { SubtitleService } from '@/services/subtitleService';

// Search by IMDb ID (most accurate)
const subtitles = await SubtitleService.searchByImdbId('tt1375666', ['eng', 'spa']);

// Search by title
const subtitles = await SubtitleService.searchByTitle('Inception', 2010);

// Download subtitle
const srtContent = await SubtitleService.downloadSubtitle(subtitleId);

// Convert to VTT for HTML5 video
const vttContent = SubtitleService.srtToVtt(srtContent);
```

---

## 🎨 Image Quality Options

TMDB provides multiple image sizes. The service uses:

**Posters:**
- `w92`, `w154`, `w185`, `w342`, `w500`, `w780`, `original`
- Default: `w500` (balanced quality/size)

**Backdrops:**
- `w300`, `w780`, `w1280`, `original`
- Default: `w1280` (high quality)

To change image quality, modify `tmdbService.ts`:

```typescript
posterUrl: TMDBService.getPosterUrl(details.poster_path, 'original');
backdropUrl: TMDBService.getBackdropUrl(details.backdrop_path, 'original');
```

---

## 🔧 API Endpoints

### TMDB Endpoint

**Search:**
```
GET /api/tmdb?action=search&query=Inception&type=movie&year=2010
```

**Get Details:**
```
GET /api/tmdb?action=details&id=27205&type=movie
```

**Smart Search** (auto-cleans title):
```
GET /api/tmdb?action=smart-search&title=Inception%20(2010)&type=movie
```

### Subtitle Endpoint

**Search by IMDb ID:**
```
GET /api/subtitles?action=search&imdbId=tt1375666&languages=eng,spa
```

**Search by Title:**
```
GET /api/subtitles?action=search&title=Inception&year=2010
```

**Download:**
```
GET /api/subtitles?action=download&id=subtitle_id
```

---

## ⚡ Performance Tips

### Caching

TMDB data is cached automatically using the existing cache utility:

```typescript
// Cache duration: 10 minutes for metadata
const enriched = await cache.getOrFetch(
  `tmdb:${item.id}`,
  () => contentService.enrichWithTMDB(item, 'movie'),
  10 * 60 * 1000
);
```

### Batch Processing

Don't enrich all items at once to avoid rate limits:

```typescript
// ✅ Good: Enrich first 10 items
const enriched = await contentService.enrichBatchWithTMDB(items, 'movie');

// ❌ Bad: Enrich 1000 items at once
const enriched = await Promise.all(items.map(item => enrich(item)));
```

### Rate Limits

**TMDB Free Tier:**
- 40 requests every 10 seconds
- ~200,000 requests per day

**Best Practices:**
- Cache aggressively
- Enrich on-demand (when user views details)
- Batch enrich visible items only

---

## 🎯 Next Steps

### Enhance UI Components

Update your content cards to show TMDB data:

```tsx
{item.tmdb && (
  <div>
    <img src={item.tmdb.posterUrl || item.imageUrl} alt={item.name} />
    <div className="rating">⭐ {item.tmdb.rating.toFixed(1)}</div>
    <p>{item.tmdb.overview}</p>
  </div>
)}
```

### Add Subtitle Selection

Add subtitle picker to VOD player:

```tsx
<select onChange={(e) => loadSubtitle(e.target.value)}>
  {subtitles.map(sub => (
    <option key={sub.id} value={sub.id}>
      {sub.languageName}
    </option>
  ))}
</select>
```

### Fallback Images

Use TMDB images as fallback when Stalker images fail:

```tsx
const imageUrl = item.tmdb?.posterUrl || item.imageUrl || '/placeholder.jpg';
```

---

## 🐛 Troubleshooting

### "TMDB API key not found"
- Make sure `TMDB_API_KEY` is set in `.env.local`
- Restart the dev server after adding the key

### "No results found"
- TMDB uses exact title matching
- Try using `smart-search` action which auto-cleans titles
- Extract year from title for better matching

### Images not loading
- Check CORS policy on TMDB CDN
- Use Next.js Image component with proper domains config
- Fallback to original Stalker images

### Rate limit errors
- Reduce batch size (max 10 concurrent requests)
- Add delays between requests
- Increase cache TTL

---

## 📖 Documentation

- [TMDB API Docs](https://developers.themoviedb.org/3)
- [OpenSubtitles API](https://www.opensubtitles.com/api)
- [Next.js API Routes](https://nextjs.org/docs/api-routes/introduction)

---

## 🎉 That's It!

You now have:
✅ High-quality movie posters and backdrops  
✅ IMDb ratings and metadata  
✅ Subtitle support for VOD content  
✅ All completely FREE!

Enjoy your enhanced IPTV experience! 🚀
