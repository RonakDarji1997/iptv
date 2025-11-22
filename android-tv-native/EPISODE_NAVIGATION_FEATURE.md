# Episode Navigation Feature

## Overview
Added previous/next episode navigation buttons to the series video player, allowing users to easily navigate between episodes while watching a series.

## Changes Made

### 1. Player Controls UI (`custom_player_controls.xml`)
**Location:** After progress bar (line 232)

Added episode navigation container with two buttons:
```xml
<!-- Episode Navigation (Series only) -->
<LinearLayout
    android:id="@+id/episode_navigation_container"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:orientation="horizontal"
    android:gravity="center"
    android:paddingTop="16dp"
    android:visibility="gone">

    <Button
        android:id="@+id/prev_episode_button"
        android:layout_width="160dp"
        android:layout_height="48dp"
        android:text="◀ Previous Episode"
        android:textSize="14sp"
        android:textColor="#ffffff"
        android:background="#40ffffff"
        android:layout_marginEnd="12dp"
        android:focusable="true"
        android:focusableInTouchMode="true" />

    <Button
        android:id="@+id/next_episode_button"
        android:layout_width="160dp"
        android:layout_height="48dp"
        android:text="Next Episode ▶"
        android:textSize="14sp"
        android:textColor="#ffffff"
        android:background="#40ffffff"
        android:layout_marginStart="12dp"
        android:focusable="true"
        android:focusableInTouchMode="true" />

</LinearLayout>
```

**Features:**
- Buttons are centered below the progress bar
- Only visible when playing series content
- TV-friendly focus handling
- Semi-transparent white background for contrast

### 2. MainActivity.kt Updates

#### New Episode Tracking Variables (Lines 133-137)
```kotlin
// Current episode tracking for navigation
private var currentSeasonId: String? = null
private var currentSeasonNumber: String? = null
private var currentEpisodeId: String? = null
private var currentEpisodeNumber: String? = null
private var currentEpisodeName: String? = null
```

#### Updated Imports
Added:
- `import android.widget.Button`
- `import android.widget.Toast`

#### Episode Navigation Setup in `setupPlayerControls()` (Lines 572-584)
```kotlin
// Setup episode navigation buttons (for series only)
val episodeNavContainer = playerView.findViewById<LinearLayout>(R.id.episode_navigation_container)
val prevEpisodeButton = playerView.findViewById<Button>(R.id.prev_episode_button)
val nextEpisodeButton = playerView.findViewById<Button>(R.id.next_episode_button)

prevEpisodeButton?.setOnClickListener {
    playPreviousEpisode()
}

nextEpisodeButton?.setOnClickListener {
    playNextEpisode()
}

// Show/hide episode navigation based on playback type
episodeNavContainer?.visibility = if (isPlayingSeries) View.VISIBLE else View.GONE
```

#### New Navigation Functions

**`playPreviousEpisode()` (Lines 637-670)**
- Fetches current season's episodes from API
- Finds the current episode in the list
- Plays the previous episode if available
- Shows toast message if already at first episode

**`playNextEpisode()` (Lines 672-705)**
- Fetches current season's episodes from API
- Finds the current episode in the list
- Plays the next episode if available
- Shows toast message if already at last episode

**`playEpisode(episodeData: SeriesEpisode)` (Lines 707-769)**
- Updates current episode tracking variables
- Fetches file info for the selected episode
- Constructs streaming URL
- Updates player UI with episode info
- Plays the episode using ExoPlayer
- Shows toast notification with episode info

#### Updated `handleSeriesPlayback()` (Lines 240-244)
Added episode tracking storage:
```kotlin
// Store current episode info for navigation
currentSeasonId = seasonId
currentSeasonNumber = seasonNumber
currentEpisodeId = episodeId
currentEpisodeNumber = episodeNumber
currentEpisodeName = episodeName
```

## Technical Details

### Episode Navigation Flow
1. User presses Previous/Next button
2. Function fetches all episodes for current season
3. Finds current episode index in sorted list
4. Checks if prev/next episode exists
5. If exists, calls `playEpisode()` to switch
6. Updates tracking variables and UI
7. Starts playback of new episode

### API Endpoints Used
- `getSeriesEpisodes()` - Fetches episode list for a season
- `getSeriesFileInfo()` - Gets streaming file info for an episode

### Episode Data Structure
```kotlin
data class SeriesEpisode(
    val id: String,
    val name: String?,
    val series_number: String?,  // Episode number
    val time: String?,
    val cmd: String?
)
```

## User Experience

### How It Works
1. When playing a series episode in fullscreen
2. Episode navigation buttons appear below the progress bar
3. Press down on remote to focus the buttons
4. Navigate left/right between Previous and Next
5. Click to switch episodes
6. New episode starts playing immediately
7. Toast notification shows episode info

### Visual Feedback
- Buttons only visible during series playback
- Hidden for movies and live TV
- Toast messages for:
  - Successfully switching episodes
  - Already at first/last episode
  - Errors loading episodes

### Edge Cases Handled
- Already at first episode → Shows "Already at first episode" message
- Already at last episode → Shows "Already at last episode" message
- API errors → Shows "Error loading episode" message
- Invalid episode data → Gracefully handles with error message

## Testing Checklist
- [x] Build successful
- [x] App installed on device
- [ ] Buttons appear when playing series
- [ ] Buttons hidden for movies/live TV
- [ ] Previous button navigates to previous episode
- [ ] Next button navigates to next episode
- [ ] First episode shows appropriate message
- [ ] Last episode shows appropriate message
- [ ] Episode info updates correctly in player
- [ ] Playback continues smoothly after switching

## Future Enhancements
- Add keyboard shortcuts (Left/Right arrows) for quick navigation
- Auto-play next episode when current finishes
- Show episode thumbnail preview on hover
- Display episode list in overlay for quick jump
- Add season navigation (jump to next/previous season)
