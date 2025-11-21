# Quick Reference - Backend API Client Usage

## Import

```typescript
import { ApiClient, verifyPassword } from '@/lib/api-client';
```

## Initialize Client

```typescript
const client = new ApiClient({
  mac: '00:1A:79:XX:XX:XX',
  url: 'http://portal-url.com'
});
```

## Authentication

```typescript
// Verify password (no client needed)
const isValid = await verifyPassword('user_password');

// Handshake with portal
await client.handshake();
```

## Categories & Genres

```typescript
// Get live TV genres
const { genres } = await client.getGenres();

// Get movie categories
const { categories } = await client.getMovieCategories();

// Get series categories
const { categories } = await client.getSeriesCategories();
```

## Content Listing

```typescript
// Get live TV channels
const { channels } = await client.getChannels(genreId, page, sortBy);
// Returns: { channels: { data: [...], total: N } }

// Get movies
const { items } = await client.getMovies(categoryId, page, sortBy);
// Returns: { items: { data: [...], total: N } }

// Get series
const { items } = await client.getSeries(categoryId, page, sortBy);
// Returns: { items: { data: [...], total: N } }

// Search content
const { data, total } = await client.searchContent(query, page);
```

## Series Details

```typescript
// Get seasons
const { seasons } = await client.getSeriesSeasons(seriesId);

// Get episodes
const { data, total } = await client.getSeriesEpisodes(seriesId, seasonId, page);

// Get episode file info
const fileInfo = await client.getSeriesFileInfo(seriesId, seasonId, episodeId);
```

## Movies

```typescript
// Get movie file info
const fileInfo = await client.getMovieInfo(movieId);
```

## Streaming

```typescript
// Get stream URL for live TV
const { url } = await client.getStreamUrl(cmd, 'itv');

// Get stream URL for movies
const { url } = await client.getStreamUrl(cmd, 'vod');

// Get stream URL for series episode
const { url } = await client.getStreamUrl(cmd, 'series', episodeNumber);

// Create link
const { link } = await client.createLink(cmd, type);
```

## EPG (Electronic Program Guide)

```typescript
// Get EPG for channel
const { epg } = await client.getEpg(channelId);
```

## Response Formats

All responses are wrapped in objects for consistency:

```typescript
// Genres
{ genres: Array<{ id, title, alias }> }

// Categories
{ categories: Array<{ id, title, alias }> }

// Channels/Movies/Series
{ channels: { data: Array<...>, total: number } }
{ items: { data: Array<...>, total: number } }

// Search
{ data: Array<...>, total: number }

// Seasons
{ seasons: Array<{ id, name, series_name }> }

// Episodes
{ data: Array<...>, total: number }

// Stream
{ url: string }

// EPG
{ epg: EpgProgram[] }

// File Info
fileInfo: { id, cmd, ... }
```

## Error Handling

```typescript
try {
  const { channels } = await client.getChannels(genreId, 1);
  // Use channels
} catch (error) {
  console.error('Failed to load channels:', error);
  // Handle error
}
```

## Common Patterns

### Loading Live TV

```typescript
// 1. Get genres
const { genres } = await client.getGenres();

// 2. Select a genre
const selectedGenre = genres[0].id;

// 3. Get channels
const { channels } = await client.getChannels(selectedGenre, 1);

// 4. Get stream URL
const { url } = await client.getStreamUrl(channels.data[0].cmd, 'itv');
```

### Playing a Movie

```typescript
// 1. Get movie file info
const fileInfo = await client.getMovieInfo(movieId);

// 2. Construct cmd
const cmd = `/media/file_${fileInfo.id}.mpg`;

// 3. Get stream URL
const { url } = await client.getStreamUrl(cmd, 'vod');

// 4. Play video
<VideoPlayer source={{ uri: url }} />
```

### Playing a Series Episode

```typescript
// 1. Get seasons
const { seasons } = await client.getSeriesSeasons(seriesId);

// 2. Get episodes for selected season
const { data: episodes } = await client.getSeriesEpisodes(seriesId, seasonId);

// 3. Get file info for episode
const fileInfo = await client.getSeriesFileInfo(seriesId, seasonId, episodeId);

// 4. Construct cmd
const cmd = `/media/file_${fileInfo.id}.mpg`;

// 5. Get stream URL
const { url } = await client.getStreamUrl(cmd, 'series', episodeNumber);

// 6. Play video
<VideoPlayer source={{ uri: url }} />
```

## Environment Configuration

```typescript
// Backend URL is configured via environment variable
EXPO_PUBLIC_API_URL=http://localhost:2005

// For production
EXPO_PUBLIC_API_URL=https://your-production-domain.com
```

## Debugging

```typescript
// ApiClient logs errors to console
// Check browser/React Native console for detailed error messages

// Example error:
// [ApiClient] Error calling /api/stalker/genres: Request failed with status 500
```

## TypeScript Types

```typescript
import type { EpgProgram, ShortEpg } from '@/lib/api-client';

interface EpgProgram {
  id: string;
  ch_id: string;
  time: string;
  time_to: string;
  duration: string;
  name: string;
  descr: string;
  real_id: string;
  category?: string;
}

interface ShortEpg {
  current_program: EpgProgram | null;
  next_program: EpgProgram | null;
}
```
