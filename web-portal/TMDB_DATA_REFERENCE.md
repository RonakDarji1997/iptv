# TMDB Data Reference

## What Data Does TMDB Provide?

### ✅ Available from TMDB API (Free Tier)
- **Ratings**: IMDb-style ratings (vote_average out of 10)
- **Vote Count**: Number of user ratings
- **Poster Images**: High quality posters (w500, w780 sizes)
- **Backdrop Images**: High quality backdrops (w1280 size)
- **Runtime**: Movie duration in minutes
- **Release Date**: Official release date
- **Genres**: List of genre names
- **Overview**: Plot synopsis/description
- **Tagline**: Movie tagline/slogan
- **IMDb ID**: Link to IMDb page
- **Original Title**: Title in original language
- **Budget & Revenue**: Box office data
- **Production Companies**: Studio information
- **Cast & Crew**: Via additional API calls

### ❌ NOT Available from TMDB
- **Rotten Tomatoes Scores**: TMDB doesn't have rights to RT data
  - RT is owned by Fandango and their API is restricted
  - Would need separate OMDb API (requires paid key for commercial use)
- **Metacritic Scores**: Not available via TMDB

### Current Implementation

#### Movie Detail Page
```typescript
// Data displayed:
- Title & Original Title
- Tagline (e.g., "I'm gonna make him an offer he can't refuse")
- Rating: 6.9/10 (28)  // Format: score/10 (vote count)
- Runtime: 2h 55m      // Converted from minutes
- Release Year: 2025
- Genres: Animation, Comedy, Adventure
- Overview: Full plot description
- IMDb Link: Direct link to IMDb page
- Poster & Backdrop: High resolution images
```

#### Browse Page
```typescript
// Batch enriched data for first 10 items:
- TMDB Badge: Blue indicator showing TMDB enhancement
- Rating Badge: Yellow star with score
- Vote Count: Number of ratings
- Poster Images: High quality w500 posters
```

## Rating Display Format

### Current Format (IMDb Style)
```
⭐ 6.9/10 (28)
```
- Shows rating out of 10
- Displays vote count in parentheses
- Yellow star icon
- Clean, professional look

### Why Not Rotten Tomatoes?
1. **API Access**: RT doesn't offer a public API
2. **Data Rights**: RT scores are proprietary to Fandango
3. **Alternative**: OMDb API has RT scores but:
   - Requires API key
   - Limited to 1,000 requests/day on free tier
   - Commercial use requires payment

### TMDB Rating vs IMDb
- TMDB's `vote_average` is similar to IMDb's rating system
- Both use 1-10 scale
- TMDB ratings often align closely with IMDb
- TMDB provides IMDb ID for cross-reference

## API Limits

### TMDB Free Tier
- 40 requests per 10 seconds
- ~200,000 requests per day
- No cost for personal/commercial use

### Current Usage
- Browse page: ~10 requests (first 10 items per category)
- Detail pages: 1 request per movie/series
- Cached for 10 minutes in browser

## Future Enhancements

### Possible Additions
1. **Cast Photos**: Can fetch cast with headshots
2. **Similar Movies**: "You might also like" section
3. **Trailers**: YouTube trailer links
4. **Reviews**: User reviews from TMDB
5. **Collection Info**: Movie series/franchises

### Alternative Rating Sources
If you want Rotten Tomatoes scores:
1. Use OMDb API ($$ for commercial use)
2. Web scraping (violates RT ToS)
3. Stick with TMDB ratings (recommended)

## Summary

**What you get:**
- Professional IMDb-style ratings (6.9/10)
- Vote counts for credibility (28 votes)
- High quality images
- Runtime in readable format (2h 55m)
- Full metadata (genres, overview, tagline)
- Direct IMDb links

**What you don't get:**
- Rotten Tomatoes scores (not available via free APIs)
- Metacritic scores (not via TMDB)

The current implementation provides excellent metadata that rivals commercial streaming services. TMDB ratings are widely respected and the data quality is professional-grade.
