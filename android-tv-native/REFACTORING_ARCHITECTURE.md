# IPTV Android TV App - Component-Based Refactoring Architecture

## Overview

This document outlines the complete refactoring plan to transform the monolithic MainActivity (5899 lines) into a modular, high-performance, component-based architecture.

## Goals

1. **Separation of Concerns**: Split Live TV, Movies, Series, and Search into independent components
2. **Performance**: Aggressive caching, parallel processing, fast RecyclerViews, direct provider calls
3. **Navigation**: Smart focus management with history tracking for proper back button behavior
4. **UI/UX**: Netflix-style theme (red primary, white text/borders), consistent across all components
5. **Maintainability**: Each component is self-contained and testable

## Architecture Components

### 1. Core Infrastructure (✅ COMPLETED)

#### NetflixTheme (`theme/NetflixTheme.kt`)
- Centralized theme configuration
- Red primary color (#E50914)
- White text and borders
- Pre-built drawables for focused/selected/normal states
- Consistent dimensions and animations

#### NavigationHistoryManager (`navigation/NavigationHistoryManager.kt`)
- Tracks navigation history stack
- Remembers where user came from
- Supports proper back button behavior
- Screen and focus target tracking
- Can clear history to root screens

#### FocusNavigationHelper (`navigation/FocusNavigationHelper.kt`)
- Manages DPAD navigation
- Remembers last focused positions/views
- Handles left/right/up/down navigation
- Auto-focus restoration
- Focus memory per container

#### CacheManager (`cache/CacheManager.kt`)
- LruCache-based memory caching
- Categories: 100 items, persistent (24h)
- Channels: 500 items, 2h TTL
- Movies/Series: 1000 items each, 2h TTL
- Metadata: 200 items, 2h TTL
- Stream URLs: 5min TTL
- Thread-safe with ConcurrentHashMap
- Cache statistics and warming

### 2. UI Components

#### MainSideNavComponent (✅ COMPLETED)
**Purpose**: Main navigation sidebar (Search, Live TV, Movies, Series)

**Features**:
- Collapses to 60dp (icons only)
- Expands to 200dp on focus (shows labels)
- Netflix red active state with white borders
- Remembers active tab
- Smooth expand/collapse animations
- Focus-aware styling

**Usage**:
```kotlin
val sideNav = MainSideNavComponent(context)
sideNav.setOnTabSelectedListener { tab ->
    when (tab) {
        Tab.SEARCH -> showSearch()
        Tab.LIVE_TV -> showLiveTV()
        Tab.MOVIES -> showMovies()
        Tab.SERIES -> showSeries()
    }
}
sideNav.setActiveTab(Tab.LIVE_TV)
```

#### CategorySidebarComponent (TODO)
**Purpose**: Category list for filtering content

**Features**:
- Works with Live TV, Movies, and Series
- Fast RecyclerView with ViewHolder pattern
- Item view cache size: 20
- Prefetching enabled
- Remembers selected category
- Netflix-style item styling
- Smooth scrolling
- Category type indicators (movie/series)

**Performance**:
- Categories loaded once on startup
- Cached in CacheManager with 24h TTL
- No re-fetching on tab switch
- Instant category switching

**Layout**:
```
┌─────────────────────┐
│ All Categories   ▼  │
├─────────────────────┤
│ > Action           │ <- Focused (red bg, white border)
│   Comedy           │
│   Drama            │
│   Horror           │
│   Sci-Fi           │
│   ...              │
└─────────────────────┘
```

#### LiveTVComponent (TODO)
**Purpose**: Live TV channels display and playback

**Features**:
- Reuses existing LiveTVManager
- Row-based layout (Netflix-style horizontal scrolling)
- Player preview on left (70%)
- Category sidebar on right (30%)
- Fast channel loading with parallel API calls
- Aggressive channel caching
- Image preloading (5-10 items ahead)
- Smooth focus navigation

**Performance Optimizations**:
- RecyclerView cache size: 30
- Prefetch 5 items ahead
- Disable item animations
- Channel data cached per category
- Thumbnail preloading on scroll
- Direct Stalker portal calls

**Data Flow**:
```
User selects category → Check cache → If miss: Fetch in parallel → Cache → Display
                     → If hit: Display instantly
```

#### MoviesComponent (TODO)
**Purpose**: Movies browsing and playback

**Features**:
- Netflix-style horizontal rows per category
- "View All" button per row
- Fast category row loading
- Smart pagination (2 pages ahead)
- Metadata caching
- Quick movie detail view
- Direct playback support

**Performance Optimizations**:
- Row-level caching
- Parallel category loading (5 categories at once)
- ViewHolder recycling
- Image caching with Coil
- Lazy row loading (load on scroll)
- Prefetch metadata for visible items

**Layout**:
```
┌─────────────────────────────────────────────────────────┐
│ Action Movies                               [View All]  │
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐              │
│ │Movie│ │Movie│ │Movie│ │Movie│ │Movie│  ────→        │
│ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘              │
├─────────────────────────────────────────────────────────┤
│ Comedy Movies                               [View All]  │
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                      │
│ │Movie│ │Movie│ │Movie│ │Movie│  ────→                │
│ └─────┘ └─────┘ └─────┘ └─────┘                      │
└─────────────────────────────────────────────────────────┘
```

**Data Loading Strategy**:
```kotlin
// Load first 5 categories immediately
val categories = getCategories(type = "movie").take(5)
categories.forEach { category ->
    launch {
        val movies = loadMovies(category.id, page = 1)
        cache.cacheMovies(category.id, 1, movies)
        addRow(category.name, movies)
    }
}

// Load remaining categories on demand
recyclerView.addOnScrollListener {
    if (lastVisibleRow >= rowCount - 2) {
        loadNextCategories()
    }
}
```

#### SeriesComponent (TODO)
**Purpose**: TV series browsing and playback

**Features**:
- Similar to MoviesComponent
- Series metadata caching (seasons, episodes)
- Fast episode navigation
- Season overview
- Continue watching support

**Performance Optimizations**:
- Same as MoviesComponent
- Additional episode metadata caching
- Season data lazy loading

#### SearchComponent (TODO)
**Purpose**: Global search across Live TV, Movies, and Series

**Features**:
- Real-time search with debouncing (300ms)
- Search across all content types
- Fast results rendering
- Recent searches
- Search suggestions

**Performance**:
- Debounced input (avoid excessive API calls)
- Result caching (5min TTL)
- Parallel search (TV/Movies/Series simultaneously)
- Limit results per category (top 20)

## Page Structure & Navigation Flow

### Layout Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     MAIN ACTIVITY                             │
├────┬──────────┬──────────────────────────────────────────────┤
│    │          │                                               │
│ M  │ Category │                                               │
│ a  │ Sidebar  │           Active Component                    │
│ i  │ (280dp)  │           (Live TV / Movies / Series)         │
│ n  │          │                                               │
│    │          │                                               │
│ S  │          │                                               │
│ i  │          │                                               │
│ d  │          │                                               │
│ e  │          │                                               │
│    │          │                                               │
│ N  │          │                                               │
│ a  │          │                                               │
│ v  │          │                                               │
│    │          │                                               │
│ (  │          │                                               │
│ 6  │          │                                               │
│ 0  │          │                                               │
│ d  │          │                                               │
│ p  │          │                                               │
│ )  │          │                                               │
│    │          │                                               │
└────┴──────────┴──────────────────────────────────────────────┘
```

### Navigation Flow

```
                    ┌─────────────┐
                    │ Main SideNav│
                    │  (Focus)    │
                    └──────┬──────┘
                           │
           ┌───────────────┼───────────────┬──────────────┐
           │               │               │              │
      ┌────▼────┐    ┌─────▼─────┐  ┌─────▼─────┐  ┌────▼────┐
      │ Search  │    │  Live TV  │  │  Movies   │  │ Series  │
      └────┬────┘    └─────┬─────┘  └─────┬─────┘  └────┬────┘
           │               │               │              │
           │         ┌─────▼─────┐   ┌─────▼─────┐  ┌────▼────┐
           │         │ Category  │   │ Category  │  │Category │
           │         │ Sidebar   │   │ Sidebar   │  │Sidebar  │
           │         └─────┬─────┘   └─────┬─────┘  └────┬────┘
           │               │               │              │
           │         ┌─────▼─────┐   ┌─────▼─────┐  ┌────▼────┐
           │         │ Channels  │   │  Movie    │  │ Series  │
           │         │  (Rows)   │   │  Rows     │  │  Rows   │
           │         └─────┬─────┘   └─────┬─────┘  └────┬────┘
           │               │               │              │
           └───────────────┴───────────────┴──────────────┘
                           │
                    ┌──────▼──────┐
                    │   BACK      │
                    │  (History)  │
                    └─────────────┘
```

### Focus Navigation Rules

**Left/Right Navigation**:
- `LEFT` from content → Category Sidebar (or Main SideNav if no categories)
- `LEFT` from Category Sidebar → Main SideNav
- `LEFT` from Main SideNav → Wrap to content (or stay)
- `RIGHT` from Main SideNav → Category Sidebar (or content)
- `RIGHT` from Category Sidebar → Content
- `RIGHT` from content → Stay (horizontal scroll in lists)

**Up/Down Navigation**:
- `UP`/`DOWN` within each component scrolls items
- Remembers last focused position

**Back Button Behavior**:
1. From content → Category Sidebar
2. From Category Sidebar → Main SideNav
3. From Main SideNav → Previous tab or exit app

**Example Flow**:
```
User opens app
  → Main SideNav focused (Live TV tab active)
  → User presses RIGHT
  → Category Sidebar shows (first category focused)
  → User presses RIGHT
  → Channel list shows (first channel focused)
  → User presses BACK
  → Returns to Category Sidebar (same category focused)
  → User presses BACK
  → Returns to Main SideNav (Live TV tab focused)
```

## Implementation Plan

### Phase 1: Foundation (COMPLETED ✅)
- [x] Create NetflixTheme
- [x] Create NavigationHistoryManager
- [x] Create FocusNavigationHelper
- [x] Create CacheManager
- [x] Create MainSideNavComponent

### Phase 2: Category Sidebar
- [ ] Create CategorySidebarComponent
- [ ] Implement category loading on startup
- [ ] Integrate with CacheManager
- [ ] Add Netflix-style item styling
- [ ] Test focus navigation

### Phase 3: Live TV Component
- [ ] Create LiveTVComponent
- [ ] Integrate existing LiveTVManager
- [ ] Optimize channel loading (parallel calls)
- [ ] Implement aggressive caching
- [ ] Add image preloading
- [ ] Test performance

### Phase 4: Movies Component
- [ ] Create MoviesComponent
- [ ] Implement Netflix-style rows
- [ ] Add parallel category loading
- [ ] Implement smart pagination
- [ ] Optimize RecyclerView
- [ ] Test scrolling performance

### Phase 5: Series Component
- [ ] Create SeriesComponent
- [ ] Reuse MoviesComponent patterns
- [ ] Add season/episode handling
- [ ] Implement metadata caching
- [ ] Test episode navigation

### Phase 6: Search Component
- [ ] Create SearchComponent
- [ ] Implement debounced search
- [ ] Add result caching
- [ ] Optimize results rendering
- [ ] Test search performance

### Phase 7: MainActivity Refactoring
- [ ] Transform MainActivity to coordinator
- [ ] Integrate all components
- [ ] Setup navigation routing
- [ ] Implement shared resource management
- [ ] Remove old code
- [ ] Test full app flow

### Phase 8: Performance Optimization
- [ ] Measure component load times
- [ ] Profile RecyclerView performance
- [ ] Optimize image loading
- [ ] Test memory usage
- [ ] Verify cache effectiveness
- [ ] Fix any memory leaks

### Phase 9: Testing & Polish
- [ ] Test all navigation flows
- [ ] Test back button behavior
- [ ] Test focus restoration
- [ ] Verify consistent styling
- [ ] Performance benchmarks
- [ ] Fix any bugs

## Performance Targets

- **App Launch**: < 2 seconds to first content
- **Category Switch**: < 100ms
- **Content Loading**: First items visible in < 300ms
- **Scrolling**: 60 FPS smooth scrolling
- **Image Loading**: Preload 5-10 items ahead
- **Memory**: < 150MB total usage
- **Cache Hit Rate**: > 80% for categories, > 60% for content

## Code Structure

```
app/src/main/java/com/ronika/iptvnative/
├── MainActivity.kt (coordinator, ~500 lines)
├── components/
│   ├── MainSideNavComponent.kt (✅)
│   ├── CategorySidebarComponent.kt
│   ├── LiveTVComponent.kt
│   ├── MoviesComponent.kt
│   ├── SeriesComponent.kt
│   └── SearchComponent.kt
├── navigation/
│   ├── NavigationHistoryManager.kt (✅)
│   └── FocusNavigationHelper.kt (✅)
├── cache/
│   └── CacheManager.kt (✅)
├── theme/
│   └── NetflixTheme.kt (✅)
├── adapters/ (existing, will be optimized)
├── api/ (existing, direct calls)
├── database/ (existing)
└── managers/ (existing)
```

## Migration Strategy

1. **Build new components alongside old code** (no disruption)
2. **Test each component independently**
3. **Gradually migrate MainActivity** (one tab at a time)
4. **Remove old code only when new code is stable**
5. **Keep database and API layers unchanged** (proven to work)

## Next Steps

1. Implement CategorySidebarComponent
2. Test with existing categories
3. Create LiveTVComponent
4. Migrate Live TV tab
5. Continue with Movies and Series
6. Finally refactor MainActivity

---

**Current Status**: Phase 1 Complete - Foundation layer ready
**Next Task**: Phase 2 - CategorySidebarComponent implementation
**Estimated Completion**: 2-3 days for full refactoring
