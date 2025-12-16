# Subtitle Integration - Quick Start

## ✅ Implemented Features

Your VOD player now has **full subtitle support** without requiring any API keys!

### What Works Right Now (Free - 40 downloads/day)

1. **Automatic Subtitle Search**
   - Uses TMDB's IMDb ID for accurate matching
   - Falls back to title search if no IMDb ID
   - Searches English, Spanish, and French subtitles

2. **Subtitle Selection UI**
   - Click the CC (Subtitles) button in player controls
   - Shows available subtitles with ratings and download counts
   - Click to download and apply
   - "Off" option to disable

3. **Auto-Load English**
   - Automatically loads English subtitles if available
   - Can switch languages during playback

4. **Player Integration**
   - Native HTML5 subtitle support
   - Syncs perfectly with video
   - Works in fullscreen mode

## How It Works

### 1. When You Click Play on a Movie:
```
Movie Detail Page → Stores IMDb ID → VOD Player
                                        ↓
                                   Searches OpenSubtitles
                                        ↓
                                   Shows subtitle menu
```

### 2. Subtitle Search Priority:
```
1. IMDb ID search (most accurate) ✅
   └─> Falls back to title search if no IMDb

2. Languages searched: English, Spanish, French
   └─> Shows top 10 results sorted by rating

3. Downloads .srt file and loads into player
```

## Usage

### For Movies:
1. Go to any movie detail page
2. Click "Play"
3. In the player, click the **CC** button (bottom right)
4. Select a subtitle from the list
5. Subtitle loads instantly!

### For TV Shows:
Same process - subtitles persist across episodes

## Technical Details

### Free Tier Limits (No API Key Needed)
- **40 downloads per day** (anonymous)
- Searches are unlimited (don't count toward limit)
- Only downloads count

### What Gets Downloaded
- `.srt` subtitle files
- UTF-8 encoded
- Synced to video timestamps
- ~50-200 KB per file

### Data Flow
```
OpenSubtitles.com API (FREE)
       ↓
   Search subtitles (by IMDb ID)
       ↓
   Return list with metadata
       ↓
   User selects subtitle
       ↓
   Download .srt file
       ↓
   Create blob URL
       ↓
   Inject into <track> element
       ↓
   Video player displays subtitles
```

## Upgrading (Optional)

If you want **200 downloads/day** instead of 40:

1. Register at: https://www.opensubtitles.com/en/users/sign_up (FREE)
2. Get API key: https://www.opensubtitles.com/en/consumers (FREE)
3. Add to `.env.local`:
```bash
NEXT_PUBLIC_OPENSUBTITLES_API_KEY=your_key
NEXT_PUBLIC_OPENSUBTITLES_USERNAME=your_username
NEXT_PUBLIC_OPENSUBTITLES_PASSWORD=your_password
```

## Troubleshooting

### No Subtitles Found?
- Check if TMDB has IMDb ID for the movie
- Try searching manually on opensubtitles.com
- Some obscure content may not have subtitles

### Subtitle Out of Sync?
- This is a source file issue, not our code
- Try a different subtitle from the list
- Higher-rated subtitles usually better synced

### Hit Daily Limit (40)?
- Wait 24 hours for reset
- Or register free account for 200/day
- Or upgrade to VIP ($9.95/month) for 1000/day

## Features Comparison

| Feature | Without API Key | With API Key | VIP |
|---------|----------------|--------------|-----|
| Daily Downloads | 40 | 200 | 1000 |
| Cost | FREE | FREE | $9.95/mo |
| Search Limit | Unlimited | Unlimited | Unlimited |
| Languages | All | All | All |
| Quality | Same | Same | Same |

## Currently Supported

✅ Movies with IMDb ID
✅ TV Shows with IMDb ID  
✅ English, Spanish, French subtitles
✅ Rating-based sorting
✅ Download count display
✅ Native video player sync
✅ Fullscreen support
✅ Auto-load English
✅ On-the-fly switching

## Example Search Results

When you click CC button, you'll see:
```
Subtitles

Off

English
  Hamnet.2025.1080p.WEBRip.x264-RARBG.srt
  ⭐ 8.5  ↓ 1,234

Spanish
  Hamnet.2025.720p.WEB-DL.srt
  ⭐ 7.2  ↓ 456

French
  Hamnet.2025.WEB.srt
  ⭐ 6.8  ↓ 89
```

Click any to download and apply!

## That's It!

Subtitles work out of the box with zero configuration. Just click play and enjoy! 🎬
