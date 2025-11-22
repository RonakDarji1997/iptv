# MainActivity Refactoring Plan

## Current State
- MainActivity.kt: 1969 lines
- Contains ALL logic: UI, Player management, Content loading, Navigation

## New Architecture

### Manager Classes Created
1. **PlayerManager** - Handles ExoPlayer setup and playback
   - `livePlayer` and `vodPlayer` management
   - Play/Stop/Fullscreen control
   - Located: `managers/PlayerManager.kt`

2. **ContentManager** - Handles API calls and data
   - Load genres, channels, movies, series
   - Pagination logic
   - Data storage (allChannels, allMovies, allSeries)
   - Located: `managers/ContentManager.kt`

3. **UIManager** - Handles UI updates
   - Preview panels
   - Movie details (grid header + overlay)
   - Loading/Empty states
   - Located: `managers/UIManager.kt`

4. **NavigationManager** - Handles navigation
   - Tab switching
   - Sidebar toggling
   - Tab styling
   - Located: `managers/NavigationManager.kt`

### MainActivity (Refactored)
- ~500 lines (down from 1969)
- Coordinates between managers
- Handles Android lifecycle
- Key event handling
- Adapter setup

## Implementation Steps
1. ✅ Create all 4 manager classes
2. ⏳ Refactor MainActivity to use managers
3. ⏳ Test build
4. ⏳ Deploy and test functionality

## Benefits
- Much easier to maintain
- Clear separation of concerns
- Easier to test individual components
- Easier to add new features
- Better code organization
