# Subtitle System - Developer Quick Reference

## File Structure

```
android-tv-native/app/src/main/
├── java/com/ronika/iptvnative/
│   ├── components/
│   │   ├── VODPlayerComponent.kt          # ✏️ Modified - Added subtitle side nav
│   │   └── SubtitleSideNavComponent.kt    # ✨ New - Side navigation panel
│   ├── services/
│   │   ├── SubtitleService.kt             # ✔️ Existing - Whisper AI
│   │   └── OpenSubtitlesService.kt        # ✨ New - OpenSubtitles API
│   └── utils/
│       └── SRTParser.kt                   # ✨ New - SRT file parser
└── res/
    ├── layout/
    │   ├── component_vod_player.xml       # ✏️ Modified - Added side nav
    │   ├── component_subtitle_sidenav.xml # ✨ New - Side nav layout
    │   └── item_subtitle_option.xml       # ✨ New - List item layout
    └── drawable/
        └── subtitle_option_bg.xml         # ✨ New - Focus background
```

## API Reference

### OpenSubtitlesService

```kotlin
// Search by IMDB ID
val subtitles = openSubtitlesService.searchByImdbId(
    imdbId = "tt0133093",  // The Matrix
    language = "en"
)

// Search by query
val subtitles = openSubtitlesService.searchByQuery(
    query = "The Matrix",
    language = "en",
    year = 1999
)

// Download subtitle
val srtContent = openSubtitlesService.downloadSubtitle(fileId = "12345")
```

### SRTParser

```kotlin
// Parse SRT content
val cues = SRTParser.parse(srtContent)
// Returns: List<SubtitleCue>

// Convert back to SRT
val srtText = SRTParser.toSRT(cues)
```

### SubtitleSideNavComponent

```kotlin
// Show side nav
subtitleSideNav.show(
    movieTitle = "The Matrix",
    imdbId = "tt0133093",
    year = 1999,
    season = null,
    episode = null
)

// Hide side nav
subtitleSideNav.hide()

// Callbacks
subtitleSideNav.onSubtitleSelected = { selection ->
    when (selection) {
        is SubtitleSelection.Off -> disableSubtitles()
        is SubtitleSelection.Upload -> loadUploadedSubtitles(selection.filePath)
        is SubtitleSelection.OpenSubtitle -> loadOpenSubtitle(selection.subtitle)
    }
}

subtitleSideNav.onClose = { /* Player resumed */ }
subtitleSideNav.onUploadRequested = { /* Show file picker */ }
```

### VODPlayerComponent

```kotlin
// Existing methods still work
vodPlayer.playMovie(streamUrl, title, startPosition)
vodPlayer.playSeries(streamUrl, title, hasNext, startPosition)

// New subtitle source tracking
enum class SubtitleSource {
    Off, WhisperGenerated, OpenSubtitles, Uploaded
}

// Internal methods (called automatically)
private fun openSubtitleSideNav()
private fun disableSubtitles()
private fun loadUploadedSubtitles(filePath: String)
private fun loadOpenSubtitle(subtitle: OpenSubtitlesService.SubtitleItem)
```

## Data Models

### OpenSubtitles.SubtitleItem
```kotlin
data class SubtitleItem(
    val id: String,              // File ID for download
    val language: String,        // "en", "es", etc.
    val fileName: String,        // Display name
    val downloadUrl: String,     // Not used (fetched separately)
    val format: String,          // "srt", "vtt", etc.
    val uploader: String,        // Username
    val downloads: Int,          // Download count
    val rating: Double,          // User rating
    val hearingImpaired: Boolean // HI flag
)
```

### SRTParser.SubtitleCue
```kotlin
data class SubtitleCue(
    val index: Int,          // Subtitle number
    val startTimeMs: Long,   // Start time in milliseconds
    val endTimeMs: Long,     // End time in milliseconds
    val text: String         // Subtitle text
)
```

### VODPlayer.SubtitleCue (Internal)
```kotlin
private data class SubtitleCue(
    val startMs: Long,
    val endMs: Long,
    val text: String
)
```

## Constants

### API Configuration
```kotlin
// OpenSubtitlesService.kt
BASE_URL = "https://api.opensubtitles.com/api/v1"
API_KEY = "ZH6QVEIRr9uCCpV9bpqhfatDZ63U3TrS"
USER_AGENT = "IPTV Android TV v1.0"
```

### UI Dimensions
```kotlin
// Side nav panel width: 20% of screen
val panelWidth = (screenWidth * 0.2).toInt()
```

### Polling Interval
```kotlin
// Subtitle display polling: 100ms
subtitlePollingHandler?.postDelayed(this, 100)
```

## Usage Examples

### Basic Movie Playback
```kotlin
vodPlayer.playMovie(
    streamUrl = "http://example.com/movie.mp4",
    title = "The Matrix",
    startPosition = 0L
)
// User clicks CC button → Side nav opens → Selects subtitle
```

### Series Episode
```kotlin
vodPlayer.apply {
    setSeriesTitle("Breaking Bad")
    setEpisodeInfo(seasonNumber = 1, episodeNumber = 1)
    playSeries(
        streamUrl = "http://example.com/ep1.mp4",
        title = "Pilot",
        hasNext = true
    )
}
```

### Manual Subtitle Loading (Testing)
```kotlin
// For testing without side nav
scope.launch {
    val subtitles = openSubtitlesService.searchByQuery("The Matrix")
    val firstSubtitle = subtitles.firstOrNull() ?: return@launch
    
    val srtContent = openSubtitlesService.downloadSubtitle(firstSubtitle.id)
    val cues = SRTParser.parse(srtContent ?: "")
    
    // Apply to player
    vodPlayer.subtitleCues = cues.map { 
        VODPlayerComponent.SubtitleCue(it.startTimeMs, it.endTimeMs, it.text)
    }
    vodPlayer.startSubtitlePolling()
}
```

## Error Handling

### Network Errors
```kotlin
try {
    val subtitles = openSubtitlesService.searchByQuery("Movie")
} catch (e: Exception) {
    Log.e(TAG, "Search failed", e)
    // Returns empty list on error
}
```

### Parse Errors
```kotlin
val cues = SRTParser.parse(invalidContent)
// Returns empty list if parsing fails
// Logs warnings for malformed blocks
```

### Download Errors
```kotlin
val content = openSubtitlesService.downloadSubtitle(fileId)
if (content == null) {
    // Download failed - show error to user
    Toast.makeText(context, "Download failed", Toast.LENGTH_SHORT).show()
}
```

## Debugging

### Enable Detailed Logs
```kotlin
// In OpenSubtitlesService
Log.d(TAG, "API Response: $responseBody")

// In SRTParser
Log.d(TAG, "Parsed ${cues.size} subtitle cues")

// In VODPlayerComponent
Log.d(TAG, "✅ Loaded ${parsedCues.size} subtitles from OpenSubtitles")
```

### Test Subtitle Timing
```kotlin
// Check subtitle display
Log.d(TAG, "👁️ [Showing] [${currentPosition}ms]: ${text}")
```

### Monitor API Calls
```bash
adb logcat | grep "OpenSubtitlesService"
```

## Common Issues & Solutions

### Issue: No subtitles found
**Solution**: 
- Check movie title spelling
- Try IMDB ID search instead
- Verify internet connection
- Check OpenSubtitles API status

### Issue: Wrong timing
**Solution**:
- Ensure video starts from beginning
- Check SRT file matches video version
- Future: Manual sync adjustment

### Issue: Side nav doesn't open
**Solution**:
- Check if player is initialized
- Verify layout includes `SubtitleSideNavComponent`
- Check focus state of subtitle button

### Issue: Download fails
**Solution**:
- Check API rate limits (40/day)
- Verify API key is valid
- Check network connectivity
- Try different subtitle from list

## Testing Checklist

- [ ] Side nav opens on subtitle button click
- [ ] OpenSubtitles search returns results
- [ ] Subtitle downloads successfully
- [ ] Subtitle timing is accurate
- [ ] "Off" option stops subtitles
- [ ] Back button closes side nav
- [ ] Focus navigation works smoothly
- [ ] Multiple subtitles can be switched
- [ ] Player resumes after selection
- [ ] Error messages display correctly

## Performance Tips

1. **Lazy Loading**: Only fetch subtitles when side nav opens
2. **Caching**: Cache downloaded SRT files (future)
3. **Debouncing**: Limit API calls with proper delays
4. **Memory**: Clear subtitle cues when switching sources
5. **Threading**: Use Dispatchers.IO for network/file operations

## Quick Commands

```bash
# Build debug APK
./gradlew assembleDebug

# Install to device/emulator
adb install app/build/outputs/apk/debug/app-debug.apk

# View logs
adb logcat | grep -E "VODPlayer|SubtitleSideNav|OpenSubtitles"

# Clear app data
adb shell pm clear com.ronika.iptvnative
```

---

**Quick Start**: See `SUBTITLE_IMPLEMENTATION_SUMMARY.md`  
**Full Guide**: See `SUBTITLE_SYSTEM_GUIDE.md`
