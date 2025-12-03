package com.ronika.iptvnative.navigation

import android.util.Log
import java.util.Stack

/**
 * Manages navigation history to support proper back button behavior
 * Tracks where the user came from and where they should go on back press
 */
class NavigationHistoryManager {
    
    private val TAG = "NavigationHistory"
    
    // Stack to track navigation history
    private val historyStack = Stack<NavigationState>()
    
    // Current state
    private var currentState: NavigationState? = null
    
    /**
     * Represents a navigation state
     */
    data class NavigationState(
        val screen: Screen,
        val focusTarget: FocusTarget,
        val sourceSection: SourceSection = SourceSection.NONE,
        val extras: Map<String, Any> = emptyMap()
    )
    
    /**
     * Source section when navigating left to right
     */
    enum class SourceSection {
        NONE, LIVE_TV, MOVIES, SERIES, SEARCH, SETTINGS
    }
    
    /**
     * Available screens in the app
     */
    enum class Screen {
        MAIN_SIDENAV,
        CATEGORY_SIDEBAR,
        LIVE_TV,
        MOVIES,
        SERIES,
        SEARCH,
        MOVIE_DETAIL,
        SERIES_DETAIL,
        PLAYER_FULLSCREEN
    }
    
    /**
     * Focus targets within screens
     */
    sealed class FocusTarget {
        object SideNavSearch : FocusTarget()
        object SideNavLiveTV : FocusTarget()
        object SideNavMovies : FocusTarget()
        object SideNavSeries : FocusTarget()
        data class CategoryItem(val categoryIndex: Int) : FocusTarget()
        data class ContentItem(val itemIndex: Int) : FocusTarget()
        data class ChannelItem(val channelIndex: Int) : FocusTarget()
        object SearchInput : FocusTarget()
        object PlayerControls : FocusTarget()
        object None : FocusTarget()
    }
    
    /**
     * Navigate to a new state
     * @param state The new navigation state
     * @param addToHistory Whether to add current state to history
     */
    fun navigateTo(state: NavigationState, addToHistory: Boolean = true) {
        Log.d(TAG, "Navigating to: ${state.screen}, focus: ${state.focusTarget}")
        
        // Add current state to history if requested
        if (addToHistory && currentState != null) {
            historyStack.push(currentState)
            Log.d(TAG, "Added to history: ${currentState?.screen}, stack size: ${historyStack.size}")
        }
        
        currentState = state
    }
    
    /**
     * Navigate back to previous state
     * @return The previous state, or null if at root
     */
    fun navigateBack(): NavigationState? {
        if (historyStack.isEmpty()) {
            Log.d(TAG, "No history to go back to")
            return null
        }
        
        val previousState = historyStack.pop()
        Log.d(TAG, "Navigating back to: ${previousState.screen}, focus: ${previousState.focusTarget}")
        currentState = previousState
        return previousState
    }
    
    /**
     * Peek at the previous state without popping it
     */
    fun peekPrevious(): NavigationState? {
        return if (historyStack.isEmpty()) null else historyStack.peek()
    }
    
    /**
     * Get current navigation state
     */
    fun getCurrentState(): NavigationState? = currentState
    
    /**
     * Clear all navigation history
     */
    fun clearHistory() {
        Log.d(TAG, "Clearing navigation history")
        historyStack.clear()
        currentState = null
    }
    
    /**
     * Clear history up to a specific screen
     * Useful for resetting to a root screen
     */
    fun clearHistoryUntil(screen: Screen) {
        Log.d(TAG, "Clearing history until: $screen")
        while (historyStack.isNotEmpty() && historyStack.peek().screen != screen) {
            historyStack.pop()
        }
    }
    
    /**
     * Check if we can go back
     */
    fun canGoBack(): Boolean = historyStack.isNotEmpty()
    
    /**
     * Get the size of the history stack
     */
    fun getHistorySize(): Int = historyStack.size
    
    /**
     * Check if currently on a specific screen
     */
    fun isOnScreen(screen: Screen): Boolean = currentState?.screen == screen
    
    /**
     * Get a value from current state extras
     */
    fun <T> getExtra(key: String): T? {
        @Suppress("UNCHECKED_CAST")
        return currentState?.extras?.get(key) as? T
    }
}
