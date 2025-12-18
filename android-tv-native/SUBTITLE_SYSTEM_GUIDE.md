# Subtitle Management System - Android TV Native App

## Overview

The Android TV native app now features a comprehensive subtitle management system with multiple subtitle sources:

1. **OpenSubtitles.com** - Download subtitles from the largest subtitle database
2. **Upload SRT Files** - Load custom subtitle files (future feature)
3. **Whisper AI Generation** - Auto-generate subtitles using Whisper (existing feature)
4. **Off** - Disable all subtitles

## Features

### Side Navigation Panel

When you click the subtitle button (CC icon) in the video player, a side navigation panel appears:
- **20% width** - Takes up right 20% of screen
- **Full height** - Extends from top to bottom
- **Dark overlay** - Semi-transparent background over video
- **Smooth animations** - Slides in/out from right

### Subtitle Options

#### 1. Off
- Disables all active subtitles
- Stops any Whisper generation in progress
- Clears subtitle display

#### 2. Upload SRT File
- Upload custom SRT subtitle files
- Automatically parsed and synchronized with video
- **Note**: File picker UI not yet implemented for Android TV

#### 3. OpenSubtitles.com
- Automatically searches for subtitles based on movie/series title
- Displays up to 10 matching subtitles
- Shows metadata: language, download count, file name
- One-click download and activation

## Architecture

### Components

#### SubtitleSideNavComponent
```kotlin
/app/src/main/java/com/ronika/iptvnative/components/SubtitleSideNavComponent.kt
```
- Handles side navigation UI and user interactions
- Manages subtitle list display
- Coordinates with OpenSubtitles service

#### OpenSubtitlesService
```kotlin
/app/src/main/java/com/ronika/iptvnative/services/OpenSubtitlesService.kt
```
- API integration with OpenSubtitles.com
- Search by IMDB ID or movie/series title
- Download subtitle files

#### SRTParser
```kotlin
/app/src/main/java/com/ronika/iptvnative/utils/SRTParser.kt
```
- Parse SRT (SubRip) subtitle format
- Convert timestamps to milliseconds
- Extract subtitle cues with timing

### VODPlayerComponent Updates

The player now manages multiple subtitle sources:

```kotlin
enum class SubtitleSource {
    Off,                    // No subtitles
    WhisperGenerated,       // AI-generated (existing)
    OpenSubtitles,          // Downloaded from OpenSubtitles.com
    Uploaded                // User-uploaded SRT file
}
```

### Subtitle Display Flow

1. User clicks subtitle button → Side nav opens
2. User selects subtitle source → Side nav closes
3. Subtitle content loaded and parsed
4. Polling loop matches subtitles to video position
5. Subtitle text displayed in overlay at correct timing

## OpenSubtitles API

### Configuration

API Key is configured in `OpenSubtitlesService.kt`:
```kotlin
private const val API_KEY = "ZH6QVEIRr9uCCpV9bpqhfatDZ63U3TrS"
```

### API Limits (Free Tier)
- **40 downloads per day**
- **10 requests per 10 seconds**
- Optional login for higher limits (200 downloads/day)

### Search Methods

1. **By IMDB ID** (preferred)
```kotlin
searchByImdbId(imdbId: String, language: String = "en")
```

2. **By Query** (fallback)
```kotlin
searchByQuery(
    query: String,
    language: String = "en",
    year: Int? = null,
    season: Int? = null,
    episode: Int? = null
)
```

## UI/UX Design

### Layout Files

- `component_subtitle_sidenav.xml` - Main side nav container
- `item_subtitle_option.xml` - Individual subtitle list item
- `subtitle_option_bg.xml` - Focus/selection background drawable

### Visual Design

- **Background**: Dark gray (#1A1A1A)
- **Accent Color**: Pink (#FF3366) - matches app theme
- **Text**: White primary, gray secondary
- **Focus States**: Pink highlight on focus
- **Radio Buttons**: Visual feedback for selected option

### Navigation

- **D-Pad**: Navigate between options
- **Center/Enter**: Select option
- **Back Button**: Close side nav (returns to video)

## Subtitle Overlay

The existing subtitle overlay system is reused for all subtitle sources:

- **Position**: Bottom center, 100dp from bottom
- **Style**: White text on semi-transparent black background
- **Size**: 22sp text, responsive to screen size
- **Timing**: 100ms polling interval for smooth display

## Usage Examples

### Playing a Movie with Subtitles

```kotlin
vodPlayer.playMovie(
    streamUrl = "http://example.com/movie.mp4",
    title = "The Matrix",
    startPosition = 0L
)

// User clicks subtitle button
// Side nav opens with OpenSubtitles results
// User selects subtitle → Automatically downloads and displays
```

### Playing a Series Episode

```kotlin
vodPlayer.apply {
    setSeriesTitle("Breaking Bad")
    setEpisodeInfo(
        seasonNumber = 1,
        episodeNumber = 1
    )
    playSeries(
        streamUrl = "http://example.com/episode.mp4",
        title = "Pilot",
        hasNext = true
    )
}

// OpenSubtitles search includes season/episode parameters
```

## Future Enhancements

### 1. File Upload (Android TV)
- Implement file picker for Android TV
- Support USB drive and network storage
- Drag-and-drop from mobile companion app

### 2. IMDB Integration
- Fetch IMDB IDs from TMDB metadata
- Improve subtitle search accuracy
- Show movie/series metadata in side nav

### 3. Language Selection
- Multi-language subtitle support
- Language preference in settings
- Switch between multiple loaded subtitles

### 4. Subtitle Sync Adjustment
- Fine-tune subtitle timing (+/- seconds)
- Persistent sync offset per video
- Visual feedback for timing adjustments

### 5. Subtitle Styling
- Font size adjustment
- Color themes
- Position adjustment
- Background opacity control

### 6. Subtitle History
- Remember selected subtitles per video
- Auto-load last used subtitle
- Download history and cache

### 7. Multi-Subtitle Display
- Display multiple language subtitles simultaneously
- Position different languages in different areas
- Learning mode (native + translation)

## Troubleshooting

### No Subtitles Found
- Check internet connection
- Verify movie/series title is correct
- Try searching with different keywords
- Check OpenSubtitles API status

### Subtitle Timing Issues
- Ensure video is playing from beginning
- Check if SRT file matches video version
- Future: Use manual sync adjustment feature

### Download Failures
- Check API rate limits (40/day free tier)
- Verify API key is valid
- Check network connectivity
- Try different subtitle from list

## API Integration Details

### Search Request
```
GET https://api.opensubtitles.com/api/v1/subtitles
Headers:
  Api-Key: ZH6QVEIRr9uCCpV9bpqhfatDZ63U3TrS
  User-Agent: IPTV Android TV v1.0
Parameters:
  imdb_id: 0133093
  languages: en
```

### Download Request
```
POST https://api.opensubtitles.com/api/v1/download
Headers:
  Api-Key: ZH6QVEIRr9uCCpV9bpqhfatDZ63U3TrS
  Content-Type: application/json
Body:
  {"file_id": 12345}
```

## Testing

### Test Cases

1. **Open Side Nav** - Click subtitle button
2. **Search Results** - Verify OpenSubtitles list loads
3. **Select Subtitle** - Click subtitle → Downloads → Displays
4. **Timing Accuracy** - Verify subtitles sync with video
5. **Switch Sources** - Change between Off/OpenSubtitles/Upload
6. **Back Navigation** - Close side nav with back button
7. **Error Handling** - Test with no internet, invalid files

### Manual Testing Steps

1. Play a popular movie (e.g., "The Matrix")
2. Click subtitle button (CC icon)
3. Wait for OpenSubtitles results (2-3 seconds)
4. Select first subtitle from list
5. Verify subtitle downloads and displays
6. Check timing is synchronized
7. Try different subtitle from list
8. Test "Off" option to disable

## Performance Considerations

- **Lazy Loading**: Subtitles loaded only when selected
- **Caching**: Consider caching downloaded subtitles
- **Memory**: SRT parsing is memory-efficient
- **Network**: Async downloads don't block UI
- **Polling**: 100ms interval is lightweight

## Code Quality

- **Error Handling**: Comprehensive try-catch blocks
- **Logging**: Detailed logs for debugging
- **User Feedback**: Toast messages for all operations
- **Coroutines**: Proper use of Dispatchers for I/O
- **Null Safety**: Kotlin null-safety throughout

---

**Last Updated**: December 18, 2025  
**Version**: 1.0  
**Author**: Android TV Development Team
