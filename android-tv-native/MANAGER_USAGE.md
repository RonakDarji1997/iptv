# Using the New Manager Classes

## Overview
The MainActivity has been split into 4 manager classes for better organization:

### 1. PlayerManager (`managers/PlayerManager.kt`)
Handles all player-related functionality:
```kotlin
// Initialize
playerManager = PlayerManager(context, playerView, playerContainer, playerPreviewContainer, liveIndicator)
playerManager.initialize()

// Play content
playerManager.playChannel(channel, baseUrl, isLiveTV = true)

// Fullscreen
playerManager.toggleFullscreen(
    onEnterFullscreen = { /* hide UI */ },
    onExitFullscreen = { /* show UI */ }
)

// Cleanup
playerManager.release()
```

### 2. ContentManager (`managers/ContentManager.kt`)
Handles all API calls and data management:
```kotlin
// Initialize
contentManager = ContentManager(context, lifecycleScope)

// Load data
lifecycleScope.launch {
    val result = contentManager.loadGenres("TV")
    result.onSuccess { genres ->
        // Update UI with genres
    }
}

// Access data
val movies = contentManager.allMovies
val channels = contentManager.allChannels
```

### 3. UIManager (`managers/UIManager.kt`)
Handles all UI updates:
```kotlin
// Initialize
uiManager = UIManager(context, contentTitle, contentSubtitle, ...)
uiManager.initializePreviewViews(...)
uiManager.initializeGridViews(...)
uiManager.initializeOverlayViews(...)

// Show preview
uiManager.showMoviePreview(channel, movie, series, selectedTab)

// Show overlay with auto-hide
uiManager.showMovieInfoOverlay(channel, movie, series, selectedTab) {
    // Called after overlay fades out
}

// Hide all
uiManager.hideAllDetails()
```

### 4. NavigationManager (`managers/NavigationManager.kt`)
Handles navigation and tab management:
```kotlin
// Initialize
navigationManager = NavigationManager(tvTab, moviesTab, showsTab, sidebarContainer, categorySidebar)

// Setup
navigationManager.setupTabListeners { tab ->
    // Handle tab switch
    loadContentForTab(tab)
}

// Switch tabs
navigationManager.switchTab("MOVIES")

// Sidebar
navigationManager.toggleSidebar()
```

## Migration Strategy

Since MainActivity is 1969 lines, we can migrate gradually:

### Phase 1: Add Managers (Already Done ✅)
- Created all 4 manager classes
- Ready to use

### Phase 2: Integration (Next Step)
We can either:
1. **Gradual**: Keep current MainActivity, slowly replace methods with manager calls
2. **Complete**: Rewrite MainActivity to use managers (requires thorough testing)

### Recommended: Gradual Approach
1. Initialize managers in onCreate()
2. Replace player methods with PlayerManager calls
3. Replace API calls with ContentManager
4. Replace UI updates with UIManager
5. Replace navigation with NavigationManager

This way, you can test after each change and ensure nothing breaks.

## Benefits
- **PlayerManager**: Isolates player logic, easier to debug playback issues
- **ContentManager**: API calls in one place, easier to cache/optimize
- **UIManager**: UI updates centralized, easier to redesign UI
- **NavigationManager**: Tab logic separate, easier to add new tabs

## Current Status
✅ All 4 managers created and ready
⏳ MainActivity still using old code (working)
📝 Next: Decide on migration approach
