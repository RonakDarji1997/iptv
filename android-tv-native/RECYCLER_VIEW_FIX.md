# RecyclerView Adapter Fixes for VOD Content Issue

## Problem
When scrolling down in VOD content, the same content shows again and again. When navigating through rows, clicking on a movie, going back, and then scrolling down and clicking another movie, the movie name and image don't match.

## Root Cause
The RecyclerView adapters were reusing ViewHolders without proper data management:
1. No stable IDs - RecyclerView couldn't track which items were which
2. ViewHolders being recycled but old data not being cleared
3. Image loaders not being canceled when ViewHolders are recycled

## Solution Applied
For all adapters (MovieCategoryRowAdapter, MovieThumbnailAdapter, MovieGridAdapter, VODComponent.ThumbnailAdapter, SearchResultAdapter):

1. **Enable stable IDs**: Added `setHasStableIds(true)` in adapter init
2. **Override getItemId()**: Return unique hash based on item ID
3. **Add onViewRecycled()**: Clear old data and cancel image loads
4. **Add logging**: Track what's being bound to help debug issues

## Files Modified
- `MovieCategoryRowAdapter.kt` - Main movies screen row adapter
- `MovieGridAdapter.kt` - Grid view for category pages
- `VODComponent.kt` - VOD thumbnail adapter
- `RefactoredSearchComponent.kt` - Search results adapter
