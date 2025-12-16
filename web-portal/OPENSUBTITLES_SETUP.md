# OpenSubtitles API Setup Guide

## Overview
OpenSubtitles.com provides a **FREE REST API** for subtitle downloads with the following limits:

### Free Tier Limits
- **Anonymous**: 40 downloads per day
- **Registered (Free)**: 200 downloads per day
- **VIP ($)**: 1000 downloads per day

## Step 1: Get Your API Key (FREE)

1. Go to https://www.opensubtitles.com/en/consumers
2. Click "Request API Key" or "New Application"
3. Fill in the form:
   - **Application Name**: StreamHub (or your app name)
   - **Description**: Personal IPTV streaming application
   - **Application URL**: http://localhost:3001 (or your domain)
4. You'll receive an API key instantly via email

## Step 2: (Optional) Create Account for Higher Limits

1. Register at https://www.opensubtitles.com/en/users/sign_up
2. Verify your email
3. Use credentials for 200 downloads/day instead of 40

## Step 3: Add to Environment Variables

Add to `.env.local`:

```bash
# OpenSubtitles API Configuration
NEXT_PUBLIC_OPENSUBTITLES_API_KEY=your_api_key_here

# Optional: For 200/day limit instead of 40/day
NEXT_PUBLIC_OPENSUBTITLES_USERNAME=your_username
NEXT_PUBLIC_OPENSUBTITLES_PASSWORD=your_password
```

## Step 4: Implementation Details

### Features
✅ Search by IMDb ID (most accurate)
✅ Search by title + year
✅ Multiple language support
✅ Download subtitle files (.srt format)
✅ Rating and download count
✅ Automatic login for higher rate limits

### API Endpoints Used
- `POST /api/v1/login` - Get auth token
- `GET /api/v1/subtitles` - Search subtitles
- `POST /api/v1/download` - Get download URL

### Rate Limiting Strategy
1. Anonymous mode (40/day) - No credentials needed
2. Authenticated mode (200/day) - With username/password
3. VIP mode (1000/day) - Requires paid subscription

### Search Methods
```typescript
// Method 1: By IMDb ID (recommended - most accurate)
const subtitles = await SubtitleService.searchByImdbId('tt14905854', ['en', 'es']);

// Method 2: By Title + Year
const subtitles = await SubtitleService.searchByTitle('Hamnet', 2025, undefined, undefined, ['en']);

// Method 3: For TV Shows
const subtitles = await SubtitleService.searchByTitle('Breaking Bad', undefined, 1, 1, ['en']);
```

### Download Process
```typescript
// Get subtitles
const subtitles = await SubtitleService.searchByImdbId(imdbId);

// Download specific subtitle
const srtContent = await SubtitleService.downloadSubtitle(subtitles[0].fileId);
```

## Usage in VOD Player

The player will:
1. Use TMDB data to get IMDb ID
2. Search OpenSubtitles using IMDb ID
3. Display available subtitle languages
4. Download and display selected subtitle
5. Sync subtitles with video playback

## Rate Limit Management

Current implementation:
- Searches don't count toward download limit
- Only actual downloads count
- Token cached for 23 hours
- Automatic login retry on token expiry

## Alternative: Scraping (Not Recommended)

If you want to avoid API limits:
- ⚠️ Violates OpenSubtitles Terms of Service
- ⚠️ IP may be banned
- ⚠️ Less reliable
- ⚠️ Requires complex parsing

**Recommendation**: Use the FREE API with authentication (200/day is usually enough for personal use)

## Cost Analysis

For a personal IPTV app:
- **FREE (Anonymous)**: 40 downloads/day = ~1200/month
- **FREE (Registered)**: 200 downloads/day = ~6000/month  
- **VIP ($9.95/month)**: 1000 downloads/day = ~30,000/month

Most personal users won't hit 200/day limit, so FREE tier is perfect!
