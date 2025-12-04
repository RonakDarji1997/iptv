# IPTV App - Feature Implementation Plan

**Date**: December 4, 2025  
**Priority**: Focus on fundamentals (stability, smooth navigation, essential features)

---

## 🎯 Phase 1: Quick Wins (Week 1-2)

### ✅ 1. Bitrate Display in Player ⭐ **[STARTING NOW]**
**Status**: 🔨 In Progress  
**Complexity**: Low  
**Impact**: High (power users, debugging)

**Implementation**:
- **Location**: Top-right corner during VOD fullscreen playback
- **Display Format**: `1080p • 8.5 Mbps • H.264`
- **Data Source**: ExoPlayer's `Format` object from current video track
- **Auto-hide**: Follows player control visibility (5s timeout)

**Files to Modify**:
1. `app/src/main/res/layout/vod_player_controls.xml` - Add bitrate TextView
2. `app/src/main/java/com/ronika/iptvnative/components/VODPlayerComponent.kt` - Add listener for track changes
3. `app/src/main/res/layout/custom_player_control.xml` - Add for live TV player

**Technical Details**:
```kotlin
// Listen to track changes
player?.addListener(object : Player.Listener {
    override fun onTracksChanged(tracks: Tracks) {
        val videoFormat = tracks.groups
            .firstOrNull { it.type == C.TRACK_TYPE_VIDEO }
            ?.getTrackFormat(0)
        
        videoFormat?.let { format ->
            val resolution = "${format.width}x${format.height}"
            val bitrate = String.format("%.1f", format.bitrate / 1_000_000.0)
            val codec = format.codecs?.split('.')[0]?.uppercase() ?: "N/A"
            
            bitrateDisplay.text = "$resolution • $bitrate Mbps • $codec"
        }
    }
})
```

---

### ✅ 2. Stream Health Indicator ⭐
**Status**: 📋 Planned  
**Complexity**: Low  
**Impact**: Medium (user feedback, debugging)

**Implementation**:
- **Settings Location**: New "Developer Options" or "Stream Info" section
- **Indicator Types**:
  - 🟢 Green: Excellent (< 5% buffer events, good bitrate)
  - 🟡 Yellow: Fair (5-15% buffer events, reduced quality)
  - 🔴 Red: Poor (> 15% buffer events, frequent stalls)

**Display Options**:
1. **Persistent Dot**: Small colored dot in player (top-left corner)
2. **Detailed Stats Overlay**: Toggle with remote button (long press INFO)
   - Current bitrate
   - Buffer health (%)
   - Dropped frames
   - Network bandwidth estimate
   - Playback session time

**Files to Create/Modify**:
1. `app/src/main/java/com/ronika/iptvnative/utils/StreamHealthMonitor.kt` - New class
2. `app/src/main/res/layout/stream_health_overlay.xml` - Stats overlay
3. `app/src/main/java/com/ronika/iptvnative/components/SettingsComponent.kt` - Add toggle setting
4. Both player components - Integrate health monitor

**Settings UI**:
```
Settings
├── Stream Info & Diagnostics
    ├── Show Stream Health Indicator    [Toggle: ON/OFF]
    ├── Show Detailed Stats             [Toggle: ON/OFF]
    ├── Network Diagnostics             [Button: Run Test]
    └── Stream Format Info              [Button: View]
```

**Data Collection**:
```kotlin
class StreamHealthMonitor(private val player: ExoPlayer) {
    private var bufferEvents = 0
    private var droppedFrames = 0
    private var totalPlaybackTime = 0L
    
    fun getHealthStatus(): HealthStatus {
        val bufferRatio = bufferEvents / (totalPlaybackTime / 60000.0)
        return when {
            bufferRatio < 0.05 && droppedFrames < 10 -> HealthStatus.EXCELLENT
            bufferRatio < 0.15 && droppedFrames < 50 -> HealthStatus.FAIR
            else -> HealthStatus.POOR
        }
    }
}
```

---

## 🎯 Phase 2: External EPG (Week 3-4)

### 📺 3. External EPG Support with Smart Matching ⭐⭐⭐
**Status**: 📋 Planned  
**Complexity**: Medium  
**Impact**: VERY HIGH (main differentiator)

**Unique Feature**: Similarity % slider for auto-matching channels to EPG

**EPG Sources to Support**:
1. **XMLTV** (primary format) - http://example.com/epg.xml.gz
2. **M3U with embedded EPG** - `tvg-id`, `tvg-name` attributes
3. **JSON EPG** (custom format)

**Database Schema**:
```kotlin
@Entity(tableName = "epg_sources")
data class EpgSourceEntity(
    @PrimaryKey val id: String,
    val name: String,
    val sourceUrl: String,
    val sourceType: String, // "XMLTV", "M3U_EPG", "JSON"
    val refreshIntervalHours: Int = 12,
    val lastUpdate: Long = 0,
    val isActive: Boolean = true
)

@Entity(tableName = "epg_channel_mappings")
data class EpgChannelMappingEntity(
    @PrimaryKey val id: String,
    val channelId: String, // References ChannelEntity.id
    val epgSourceId: String,
    val externalEpgId: String,
    val matchType: String, // "exact", "fuzzy", "manual"
    val matchConfidence: Float // 0.0 - 1.0
)

@Entity(tableName = "epg_programs")
data class EpgProgramEntity(
    @PrimaryKey val id: String,
    val epgChannelId: String,
    val title: String,
    val description: String?,
    val startTime: Long,
    val endTime: Long,
    val category: String?,
    val iconUrl: String?
)
```

**Settings UI - EPG Configuration**:
```
Settings
├── EPG Settings
    ├── EPG Source URL                  [Text Input]
    ├── EPG Format                      [Dropdown: XMLTV / M3U]
    ├── Auto-Match Similarity           [Slider: 60% - 100%]
    ├── Last Updated                    [Display: 2 hours ago]
    ├── Refresh Now                     [Button]
    └── Manual Channel Mapping          [Button: Open Mapper]
```

**Auto-Matching Algorithm**:
```kotlin
class EpgChannelMatcher {
    fun matchChannels(
        channels: List<ChannelEntity>,
        epgChannels: List<ExternalEpgChannel>,
        similarityThreshold: Float // From slider: 0.6 - 1.0
    ): List<MatchResult> {
        return channels.map { channel ->
            val matches = epgChannels.map { epgChannel ->
                val nameSimilarity = calculateJaroWinkler(
                    channel.name.lowercase(),
                    epgChannel.displayName.lowercase()
                )
                
                val numberMatch = channel.number?.toString() == epgChannel.channelNumber
                val score = if (numberMatch) nameSimilarity * 1.2f else nameSimilarity
                
                MatchResult(channel, epgChannel, score)
            }.filter { it.score >= similarityThreshold }
            
            matches.maxByOrNull { it.score }
        }
    }
    
    private fun calculateJaroWinkler(s1: String, s2: String): Float {
        // Implementation using Apache Commons Text or custom
    }
}
```

**Manual Mapping UI**:
- Show list of channels with auto-match confidence
- Allow manual selection for low-confidence matches
- Preview EPG data for selected mapping

**Files to Create**:
1. `managers/EpgSourceManager.kt` - EPG download & refresh
2. `parsers/XmltvParser.kt` - Parse XMLTV format
3. `utils/EpgChannelMatcher.kt` - Fuzzy matching logic
4. `database/entities/EpgSourceEntity.kt`
5. `database/entities/EpgChannelMappingEntity.kt`
6. `database/entities/EpgProgramEntity.kt`
7. `database/dao/EpgSourceDao.kt`
8. `components/EpgSettingsComponent.kt` - Settings UI
9. `components/EpgMappingComponent.kt` - Manual mapping UI

**Dependencies to Add**:
```kotlin
// For Jaro-Winkler similarity
implementation("org.apache.commons:commons-text:1.10.0")

// For XMLTV parsing
implementation("com.fasterxml.jackson.dataformat:jackson-dataformat-xml:2.15.0")
```

---

## 🎯 Phase 3: M3U Playlist Support (Week 5-6)

### 📡 4. M3U Playlist Provider
**Status**: 📋 Planned  
**Complexity**: Medium  
**Impact**: High (expands compatibility)

**Discussion Points**:

#### **Q1: What M3U features to support?**
- [ ] Basic M3U8 playlist parsing (streams only)
- [ ] Extended M3U with metadata (`#EXTINF`)
- [ ] Group titles (`group-title` attribute)
- [ ] EPG integration (`tvg-id`, `tvg-logo`, `tvg-name`)
- [ ] Catchup support (`catchup`, `catchup-source`)
- [ ] User-agent headers
- [ ] VOD from M3U (movies/series sections)

#### **Q2: M3U Source Types**
1. **URL-based**: User provides URL to M3U file
2. **Local file**: Upload M3U from device
3. **Hybrid**: Parse M3U but use external EPG

#### **Q3: Channel Organization from M3U**
M3U playlists typically have:
```m3u
#EXTM3U
#EXTINF:-1 tvg-id="espn.us" tvg-name="ESPN HD" tvg-logo="http://..." group-title="Sports",ESPN HD
http://server.com/stream/espn/index.m3u8

#EXTINF:-1 tvg-id="hbo.us" tvg-name="HBO" group-title="Movies",HBO
http://server.com/stream/hbo/index.m3u8
```

**How should we handle categories?**
- Option A: Use `group-title` as categories
- Option B: Create custom category mapper
- Option C: Use both (group-title + custom tags)

#### **Q4: M3U vs Stalker Portal**
Current app focuses on **Stalker Portal**. Adding M3U means:
- **Provider Selection UI** at startup
- Support multiple provider types in same app
- Different API flows (M3U = static parsing, Stalker = API calls)

**Architecture Change**:
```kotlin
// Current: ContentManager assumes Stalker
class ContentManager(private val stalkerClient: StalkerClient)

// New: Abstract provider interface
interface IptvProvider {
    suspend fun loadChannels(genreId: String): Result<List<Channel>>
    suspend fun loadEpg(channelId: String): Result<EpgData>
    suspend fun getStreamUrl(contentId: String): Result<String>
}

class StalkerProvider(private val client: StalkerClient) : IptvProvider
class M3uProvider(private val playlistUrl: String) : IptvProvider
class XtreamCodesProvider(private val serverUrl: String) : IptvProvider
```

#### **Q5: M3U Refresh Strategy**
- Auto-refresh interval (daily, weekly)?
- Manual refresh button?
- Detect M3U changes and prompt user?
- Cache parsed M3U in database?

#### **Q6: VOD in M3U**
Some M3U playlists have movies/series sections:
```m3u
#EXTINF:-1 group-title="VOD Movies",Avengers Endgame
http://server.com/movie/avengers.mp4
```

Should we:
- Parse and show in Movies/Series tabs?
- Require separate M3U for VOD?
- Ignore VOD in M3U?

---

**My Recommendations for M3U**:

1. **Start Simple**: 
   - Parse basic M3U8 with `#EXTINF` metadata
   - Use `group-title` for categories
   - Support `tvg-*` attributes for EPG matching

2. **Provider Architecture**:
   - Create `IptvProvider` interface
   - Refactor `ContentManager` to support multiple providers
   - Add provider selection in initial setup

3. **M3U Features Priority**:
   - ✅ Basic parsing (channel name, logo, stream URL)
   - ✅ Group titles → categories
   - ✅ EPG attributes (`tvg-id`, `tvg-name`)
   - ⏳ Catchup support (Phase 2)
   - ⏳ VOD sections (Phase 2)
   - ❌ Advanced features (later)

4. **Storage**:
   - Download M3U file on device
   - Parse and store in database (same `ChannelEntity` structure)
   - Refresh every 24 hours or manual trigger

---

## 🎯 Phase 4: Advanced Features (Week 7+)

### 5. Catch-up TV
**Status**: 📋 Future  
**Complexity**: Medium  
**Impact**: High (if provider supports it)

**Requirements**:
- Provider must support time-shifted streaming
- UI: Click on past EPG program → play from archive
- Usually requires `?start=TIMESTAMP&end=TIMESTAMP` URL params

### 6. PIP Mode
**Status**: 📋 Future  
**Complexity**: Low (native Android)  
**Impact**: Medium

### 7. Local Recording (Instant)
**Status**: 📋 Future  
**Complexity**: High  
**Impact**: Medium

### 8. Parental Controls
**Status**: 📋 Future  
**Complexity**: Low  
**Impact**: Medium

---

## 📊 Implementation Timeline

### Week 1-2: Quick Wins
- [x] ~~Day 1-2~~: Bitrate display in player
- [ ] Day 3-4: Stream health monitor class
- [ ] Day 5-6: Stream health settings UI
- [ ] Day 7: Testing & refinement

### Week 3-4: External EPG
- [ ] Day 1-2: Database schema + DAOs
- [ ] Day 3-4: XMLTV parser
- [ ] Day 5-6: Matching algorithm + slider UI
- [ ] Day 7-9: Manual mapping UI
- [ ] Day 10-12: Integration with LiveTVChannelsComponent
- [ ] Day 13-14: Testing with real XMLTV sources

### Week 5-6: M3U Support
- [ ] Day 1-2: M3U parser
- [ ] Day 3-4: Provider interface refactor
- [ ] Day 5-7: M3U provider implementation
- [ ] Day 8-10: Settings UI for M3U source
- [ ] Day 11-14: Testing & debugging

---

## 🛠️ Technical Dependencies

### New Libraries Needed
```gradle
// For fuzzy string matching (EPG)
implementation("org.apache.commons:commons-text:1.10.0")

// For XMLTV parsing (EPG)
implementation("com.fasterxml.jackson.dataformat:jackson-dataformat-xml:2.15.0")

// For M3U parsing (optional, can use custom parser)
implementation("com.squareup.okhttp3:okhttp:4.12.0") // Already have

// For stream recording (future)
implementation("androidx.media3:media3-exoplayer-hls:1.2.0") // Already have
implementation("androidx.media3:media3-exoplayer-dash:1.2.0") // May need
```

---

## 🔍 Testing Strategy

### Bitrate Display
- [x] Test with different video qualities (480p, 720p, 1080p, 4K)
- [x] Verify codec detection (H.264, H.265, VP9)
- [x] Test auto-hide behavior
- [x] Test on both VOD and Live TV

### Stream Health
- [ ] Simulate poor network (throttle bandwidth)
- [ ] Test with unstable streams
- [ ] Verify indicator colors match actual performance
- [ ] Test detailed stats accuracy

### External EPG
- [ ] Test with public XMLTV sources (iptv-org)
- [ ] Test matching with different similarity thresholds
- [ ] Verify EPG display in channel list
- [ ] Test EPG refresh logic
- [ ] Test manual mapping UI

### M3U Support
- [ ] Test with various M3U playlist formats
- [ ] Test with large playlists (1000+ channels)
- [ ] Verify category parsing
- [ ] Test EPG attribute extraction
- [ ] Test stream playback

---

## 📝 Discussion Notes

### Questions for Review:
1. **Bitrate Display**: Confirmed - top-right corner, auto-hide with controls ✅
2. **Stream Health**: Confirmed - setting toggle + status indicator ✅
3. **M3U Support**: Need to discuss:
   - Which M3U features are priority?
   - Should we support VOD in M3U?
   - How to handle provider switching (Stalker vs M3U)?
   - Refresh strategy for M3U playlists?

### Design Decisions Pending:
- [ ] Stream health overlay design (minimal vs detailed)
- [ ] EPG matching UI flow (wizard vs single screen)
- [ ] M3U provider selection UX
- [ ] Recording UI/UX (if proceeding)

---

## 🎨 UI/UX Mockups Needed

1. **Bitrate Display** - Simple overlay (can implement without mockup)
2. **Stream Health Indicator** - Small dot + detailed overlay
3. **EPG Settings Screen** - URL input, slider, refresh button
4. **EPG Manual Mapping** - Two-column selection UI
5. **M3U Provider Setup** - URL input, category preview

---

## 🚀 Success Metrics

**After Phase 1 (Quick Wins)**:
- Bitrate display visible and accurate
- Users can troubleshoot buffering issues
- Stream health indicator provides useful feedback

**After Phase 2 (External EPG)**:
- Users can add their own EPG sources
- Auto-matching works for 80%+ of channels
- EPG data displays correctly in channel guide

**After Phase 3 (M3U Support)**:
- Users can add M3U playlists as providers
- Categories auto-populate from group-title
- Playback works seamlessly

---

**Last Updated**: December 4, 2025  
**Next Review**: After Phase 1 completion
