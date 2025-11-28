# MANUAL FIX REQUIRED - Stream Subtitle Refactoring

## What Changed

We refactored from **audio capture on Android TV** to **backend stream listening**.

### Old Approach ❌
- Android app captures audio from ExoPlayer
- Sends audio chunks to backend
- Backend transcribes and returns text
- App displays text overlay

### New Approach ✅
- Backend listens to stream URL (using FFmpeg)
- Backend extracts audio and generates VTT subtitle file
- Android app loads VTT file as ExoPlayer subtitle track
- ExoPlayer renders subtitles natively

## Files That Need Manual Fixes

### 1. `/android-tv-native/app/src/main/java/com/ronika/iptvnative/MainActivity.kt`

#### Add Imports (around line 25-30):
```kotlin
import android.net.Uri
import androidx.media3.common.C
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
```

#### Replace `handleSubtitleEvent` function (around line 4220):
Delete the entire existing function and replace with:
```kotlin
    @UnstableApi
    private fun handleSubtitleEvent(event: SubtitleService.SubtitleEvent) {
        when (event) {
            is SubtitleService.SubtitleEvent.Started -> {
                Log.d(TAG, "Subtitles started: ${event.message}")
                displaySubtitle(event.message)
            }
            is SubtitleService.SubtitleEvent.TrackReady -> {
                Log.d(TAG, "Subtitle track ready: ${event.subtitleUrl}")
                displaySubtitle("✅ Loading subtitles...")
                loadSubtitleTrack(event.subtitleUrl)
            }
            is SubtitleService.SubtitleEvent.Subtitle -> {
                Log.d(TAG, "Subtitle received: ${event.text}")
                displaySubtitle(event.text)
            }
            is SubtitleService.SubtitleEvent.Error -> {
                Log.e(TAG, "Subtitle error: ${event.message}")
                displaySubtitle("Error: ${event.message}")
            }
            is SubtitleService.SubtitleEvent.Stopped -> {
                Log.d(TAG, "Subtitles stopped")
                liveSubtitleText?.visibility = View.GONE
            }
        }
    }
```

#### Add New Function (after `handleSubtitleEvent`):
```kotlin
    @UnstableApi
    private fun loadSubtitleTrack(subtitleUrl: String) {
        runOnUiThread {
            try {
                val currentPlayer = if (livePlayer?.isPlaying == true) livePlayer else vodPlayer
                val streamUrl = currentStreamUrl
                
                if (currentPlayer == null || streamUrl == null) {
                    Log.e(TAG, "Cannot load subtitle: player or stream URL is null")
                    displaySubtitle("Error: Player not ready")
                    return@runOnUiThread
                }
                
                Log.d(TAG, "Loading subtitle track from: $subtitleUrl")
                
                val subtitleConfig = SubtitleConfiguration.Builder(Uri.parse(subtitleUrl))
                    .setMimeType(MimeTypes.TEXT_VTT)
                    .setLanguage("en")
                    .setSelectionFlags(C.SELECTION_FLAG_DEFAULT)
                    .build()
                
                val mediaItem = MediaItem.Builder()
                    .setUri(streamUrl)
                    .setSubtitleConfigurations(listOf(subtitleConfig))
                    .build()
                
                currentPlayer.setMediaItem(mediaItem)
                currentPlayer.prepare()
                currentPlayer.play()
                
                displaySubtitle("✅ Subtitles loaded!")
                
            } catch (e: Exception) {
                Log.e(TAG, "Error loading subtitle track", e)
                displaySubtitle("Error loading subtitles")
            }
        }
    }
```

#### Update `startSubtitles` function (around line 4200):
Change:
```kotlin
subtitleService?.start(language)
```
To:
```kotlin
val streamUrl = currentStreamUrl
if (streamUrl == null) {
    displaySubtitle("Error: No stream playing")
    return@launch
}
subtitleService?.start(streamUrl, language)
```

#### Update `onDestroy` (around line 4285):
Change:
```kotlin
subtitleService?.stop()
subtitleService?.cleanup()
```
To:
```kotlin
subtitleService?.stop()
```

#### Track Stream URL:
Find where streams are played (search for `MediaItem.fromUri`) and add before it:
```kotlin
currentStreamUrl = streamUrl
```

### 2. Remove Old MainActivity Configuration (around line 744-810):

Delete all the custom AudioSink and RenderersFactory code we added earlier. The players should go back to simple:
```kotlin
livePlayer = ExoPlayer.Builder(this)
    .setSeekBackIncrementMs(10000)
    .setSeekForwardIncrementMs(10000)
    .build()
    
vodPlayer = ExoPlayer.Builder(this)
    .setSeekBackIncrementMs(10000)
    .setSeekForwardIncrementMs(10000)
    .build()
```

### 3. Remove Old Imports (from top of MainActivity.kt):
Delete these imports (if present):
```kotlin
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.DefaultAudioSink
```

## Backend Setup

### 1. Start Backend Server
```bash
cd android-tv-native/whisper-backend
./start-subtitle-server.sh
```

Or manually:
```bash
node stream-subtitle-server.js
```

### 2. Verify Backend
```bash
curl http://localhost:8770/health
```

## Testing

### 1. Build and Install App
```bash
cd android-tv-native
./gradlew installDebug
```

### 2. Test on TV
1. Play a live channel or VOD content
2. Click CC button
3. Wait ~5-8 seconds
4. Subtitles should appear at bottom

### 3. Check Logs

**Backend logs** (in terminal running server):
```
Starting subtitle generation for stream: http://...
Stream ID: abc123
Processing chunk 0: ...
Subtitle [00:00:00.000 --> 00:00:03.000]: transcribed text
```

**Android logs**:
```bash
adb logcat | grep -E "(SubtitleService|MainActivity)"
```

Expected:
```
D SubtitleService: Subtitle service started for stream: http://...
D SubtitleService: ✅ Subtitle generation started
D SubtitleService: Stream ID: abc123
D MainActivity: Subtitle track ready: http://192.168.2.69:8770/subtitle/abc123.vtt
D MainActivity: Loading subtitle track from: http://...
```

## Summary

**Architecture Change**:
- ❌ Old: Android captures audio → sends to backend → displays text overlay
- ✅ New: Backend listens to stream → generates VTT → Android loads as subtitle track

**Benefits**:
- Zero overhead on TV (no audio capture/upload)
- Standard ExoPlayer subtitle rendering
- Works with any VTT-compatible player
- Backend does all the work

**Files Created**:
- `stream-subtitle-server.js` - New Node.js server
- `start-subtitle-server.sh` - Quick start script
- `SubtitleService.kt` - Rewritten service (already done ✅)
- `STREAM_SUBTITLE_ARCHITECTURE.md` - Full documentation

**Files Need Manual Fix**:
- `MainActivity.kt` - Update event handlers, add loadSubtitleTrack(), track streamUrl

Once MainActivity.kt is fixed, the app will compile and work with the new architecture!
