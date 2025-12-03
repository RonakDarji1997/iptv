package com.ronika.iptvnative.navigation

import android.util.Log

/**
 * VOD Navigation Stack Manager
 * 
 * Manages navigation state for VOD content with proper back button handling.
 * 
 * Navigation Flow:
 * SIDENAV(MOVIES) -> CATEGORY(Action) -> VOD_GRID -> INFO -> PLAYER
 * 
 * Back Navigation:
 * PLAYER -> INFO -> VOD_GRID -> CATEGORY -> SIDENAV -> Exit Popup
 * 
 * When user selects new content, only the changing parts of the stack are updated.
 * SIDENAV and CATEGORY remain stable unless explicitly changed.
 */
class VODNavigationStack {
    
    private val TAG = "VODNavStack"
    
    /**
     * Navigation entry representing a single screen in the stack
     */
    data class NavEntry(
        val screen: Screen,
        val sectionType: SectionType? = null,
        val categoryId: String? = null,
        val categoryName: String? = null,
        val contentId: String? = null,
        val contentTitle: String? = null,
        val extras: Map<String, Any> = emptyMap()
    ) {
        override fun toString(): String {
            return when (screen) {
                Screen.SIDENAV -> "SIDENAV(${sectionType?.name ?: "?"})"
                Screen.CATEGORY -> "CATEGORY($categoryName)"
                Screen.VOD_GRID -> "VOD_GRID"
                Screen.INFO -> "INFO($contentTitle)"
                Screen.PLAYER -> "PLAYER"
            }
        }
    }
    
    enum class Screen {
        SIDENAV,    // Main side navigation (Live TV, Movies, Series, Search)
        CATEGORY,   // Category sidebar with category selected
        VOD_GRID,   // Grid of VOD items (channels for Live TV, thumbnails for VOD)
        INFO,       // Info/Detail screen before playing
        PLAYER      // Fullscreen video player
    }
    
    enum class SectionType {
        LIVE_TV,
        MOVIES,
        SERIES,
        SEARCH
    }
    
    // The navigation stack
    private val stack = mutableListOf<NavEntry>()
    
    // Current state
    private var currentSidenavSection: SectionType = SectionType.MOVIES
    private var currentCategoryId: String? = null
    private var currentCategoryName: String? = null
    
    /**
     * Initialize the stack with the starting sidenav section
     */
    fun initialize(section: SectionType) {
        stack.clear()
        currentSidenavSection = section
        stack.add(NavEntry(Screen.SIDENAV, sectionType = section))
        Log.d(TAG, "Initialized stack: ${stackToString()}")
    }
    
    /**
     * Navigate to a screen, managing the stack appropriately
     */
    fun navigateTo(screen: Screen, params: NavParams = NavParams()) {
        when (screen) {
            Screen.SIDENAV -> {
                // Going back to sidenav - clear everything above
                val section = params.sectionType ?: currentSidenavSection
                currentSidenavSection = section
                stack.clear()
                stack.add(NavEntry(Screen.SIDENAV, sectionType = section))
            }
            
            Screen.CATEGORY -> {
                // Entering a category - ensure SIDENAV is at base
                if (stack.isEmpty() || stack[0].screen != Screen.SIDENAV) {
                    stack.clear()
                    stack.add(NavEntry(Screen.SIDENAV, sectionType = currentSidenavSection))
                }
                
                // Remove everything from CATEGORY onwards
                removeFromScreen(Screen.CATEGORY)
                
                currentCategoryId = params.categoryId
                currentCategoryName = params.categoryName
                stack.add(NavEntry(
                    Screen.CATEGORY,
                    categoryId = params.categoryId,
                    categoryName = params.categoryName
                ))
            }
            
            Screen.VOD_GRID -> {
                // Entering VOD grid - ensure SIDENAV and CATEGORY are in place
                ensureBaseStack()
                removeFromScreen(Screen.VOD_GRID)
                stack.add(NavEntry(Screen.VOD_GRID))
            }
            
            Screen.INFO -> {
                // Entering info screen - ensure base + VOD_GRID
                ensureBaseStack()
                if (!hasScreen(Screen.VOD_GRID)) {
                    stack.add(NavEntry(Screen.VOD_GRID))
                }
                removeFromScreen(Screen.INFO)
                stack.add(NavEntry(
                    Screen.INFO,
                    contentId = params.contentId,
                    contentTitle = params.contentTitle
                ))
            }
            
            Screen.PLAYER -> {
                // Entering player - ensure full stack
                ensureBaseStack()
                if (!hasScreen(Screen.VOD_GRID)) {
                    stack.add(NavEntry(Screen.VOD_GRID))
                }
                if (!hasScreen(Screen.INFO)) {
                    stack.add(NavEntry(
                        Screen.INFO,
                        contentId = params.contentId,
                        contentTitle = params.contentTitle
                    ))
                }
                removeFromScreen(Screen.PLAYER)
                stack.add(NavEntry(Screen.PLAYER))
            }
        }
        
        Log.d(TAG, "Navigated to $screen: ${stackToString()}")
    }
    
    /**
     * Pop the top of the stack (handle back press)
     * Returns the new current screen, or null if we should exit
     */
    fun pop(): NavEntry? {
        if (stack.size <= 1) {
            // We're at SIDENAV - should show exit popup
            Log.d(TAG, "Pop at SIDENAV - should exit")
            return null
        }
        
        val popped = stack.removeAt(stack.size - 1)
        val current = stack.lastOrNull()
        
        Log.d(TAG, "Popped $popped, now at: ${stackToString()}")
        return current
    }
    
    /**
     * Get the current screen (top of stack)
     */
    fun current(): NavEntry? = stack.lastOrNull()
    
    /**
     * Get the previous screen (one below top)
     */
    fun previous(): NavEntry? = if (stack.size > 1) stack[stack.size - 2] else null
    
    /**
     * Check if a screen is in the stack
     */
    fun hasScreen(screen: Screen): Boolean = stack.any { it.screen == screen }
    
    /**
     * Get the full stack for debugging
     */
    fun getStack(): List<NavEntry> = stack.toList()
    
    /**
     * Get stack size
     */
    fun size(): Int = stack.size
    
    /**
     * Check if we're at the root (should show exit popup on back)
     */
    fun isAtRoot(): Boolean = stack.size <= 1 && stack.firstOrNull()?.screen == Screen.SIDENAV
    
    /**
     * Get current sidenav section
     */
    fun getCurrentSection(): SectionType = currentSidenavSection
    
    /**
     * Get current category info
     */
    fun getCurrentCategory(): Pair<String?, String?> = Pair(currentCategoryId, currentCategoryName)
    
    /**
     * Update sidenav section without changing stack
     */
    fun updateSection(section: SectionType) {
        currentSidenavSection = section
        // Update the sidenav entry if it exists
        val sidenavIndex = stack.indexOfFirst { it.screen == Screen.SIDENAV }
        if (sidenavIndex >= 0) {
            stack[sidenavIndex] = stack[sidenavIndex].copy(sectionType = section)
        }
        Log.d(TAG, "Updated section to $section: ${stackToString()}")
    }
    
    // Helper functions
    
    private fun ensureBaseStack() {
        if (stack.isEmpty() || stack[0].screen != Screen.SIDENAV) {
            stack.add(0, NavEntry(Screen.SIDENAV, sectionType = currentSidenavSection))
        }
        if (stack.size < 2 || stack[1].screen != Screen.CATEGORY) {
            if (currentCategoryId != null) {
                // Insert CATEGORY after SIDENAV
                val insertIndex = 1
                if (stack.size > insertIndex && stack[insertIndex].screen != Screen.CATEGORY) {
                    stack.add(insertIndex, NavEntry(
                        Screen.CATEGORY,
                        categoryId = currentCategoryId,
                        categoryName = currentCategoryName
                    ))
                } else if (stack.size <= insertIndex) {
                    stack.add(NavEntry(
                        Screen.CATEGORY,
                        categoryId = currentCategoryId,
                        categoryName = currentCategoryName
                    ))
                }
            }
        }
    }
    
    private fun removeFromScreen(screen: Screen) {
        val index = stack.indexOfFirst { it.screen == screen }
        if (index >= 0) {
            // Remove this screen and everything after it
            while (stack.size > index) {
                stack.removeAt(stack.size - 1)
            }
        }
    }
    
    private fun stackToString(): String {
        return stack.joinToString(" -> ") { it.toString() }
    }
    
    /**
     * Parameters for navigation
     */
    data class NavParams(
        val sectionType: SectionType? = null,
        val categoryId: String? = null,
        val categoryName: String? = null,
        val contentId: String? = null,
        val contentTitle: String? = null,
        val extras: Map<String, Any> = emptyMap()
    )
}
