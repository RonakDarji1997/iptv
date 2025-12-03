package com.ronika.iptvnative.navigation

import android.util.Log
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup

/**
 * Helper class for managing focus navigation across components
 * Handles DPAD navigation and remembers focus positions
 */
class FocusNavigationHelper {
    
    private val TAG = "FocusNavigation"
    
    // Map to store last focused positions in different containers
    private val lastFocusedPositions = mutableMapOf<String, Int>()
    
    // Map to store last focused views in containers
    private val lastFocusedViews = mutableMapOf<String, View>()
    
    /**
     * Handle DPAD key event for custom navigation
     * @return true if event was handled, false otherwise
     */
    fun handleDpadNavigation(
        view: View,
        keyCode: Int,
        event: KeyEvent,
        onLeft: (() -> Boolean)? = null,
        onRight: (() -> Boolean)? = null,
        onUp: (() -> Boolean)? = null,
        onDown: (() -> Boolean)? = null
    ): Boolean {
        if (event.action != KeyEvent.ACTION_DOWN) return false
        
        return when (keyCode) {
            KeyEvent.KEYCODE_DPAD_LEFT -> {
                Log.d(TAG, "LEFT pressed on ${view.javaClass.simpleName}")
                onLeft?.invoke() ?: false
            }
            KeyEvent.KEYCODE_DPAD_RIGHT -> {
                Log.d(TAG, "RIGHT pressed on ${view.javaClass.simpleName}")
                onRight?.invoke() ?: false
            }
            KeyEvent.KEYCODE_DPAD_UP -> {
                Log.d(TAG, "UP pressed on ${view.javaClass.simpleName}")
                onUp?.invoke() ?: false
            }
            KeyEvent.KEYCODE_DPAD_DOWN -> {
                Log.d(TAG, "DOWN pressed on ${view.javaClass.simpleName}")
                onDown?.invoke() ?: false
            }
            else -> false
        }
    }
    
    /**
     * Remember the last focused position in a container
     */
    fun rememberFocusPosition(containerKey: String, position: Int) {
        Log.d(TAG, "Remembering focus position for $containerKey: $position")
        lastFocusedPositions[containerKey] = position
    }
    
    /**
     * Get the last focused position in a container
     */
    fun getLastFocusPosition(containerKey: String, default: Int = 0): Int {
        return lastFocusedPositions[containerKey] ?: default
    }
    
    /**
     * Remember the last focused view in a container
     */
    fun rememberFocusView(containerKey: String, view: View) {
        Log.d(TAG, "Remembering focus view for $containerKey: ${view.javaClass.simpleName}")
        lastFocusedViews[containerKey] = view
    }
    
    /**
     * Get the last focused view in a container
     */
    fun getLastFocusView(containerKey: String): View? {
        return lastFocusedViews[containerKey]
    }
    
    /**
     * Restore focus to the last focused view or position in a container
     */
    fun restoreFocus(containerKey: String, defaultView: View? = null): Boolean {
        val lastView = lastFocusedViews[containerKey]
        return if (lastView != null && lastView.isFocusable) {
            Log.d(TAG, "Restoring focus to remembered view in $containerKey")
            lastView.requestFocus()
            true
        } else if (defaultView != null) {
            Log.d(TAG, "Restoring focus to default view in $containerKey")
            defaultView.requestFocus()
            true
        } else {
            Log.d(TAG, "Could not restore focus in $containerKey")
            false
        }
    }
    
    /**
     * Clear focus memory for a container
     */
    fun clearFocusMemory(containerKey: String) {
        Log.d(TAG, "Clearing focus memory for $containerKey")
        lastFocusedPositions.remove(containerKey)
        lastFocusedViews.remove(containerKey)
    }
    
    /**
     * Clear all focus memory
     */
    fun clearAllFocusMemory() {
        Log.d(TAG, "Clearing all focus memory")
        lastFocusedPositions.clear()
        lastFocusedViews.clear()
    }
    
    /**
     * Setup focus listeners for a container to automatically remember positions
     */
    fun setupAutoFocusMemory(container: ViewGroup, containerKey: String) {
        for (i in 0 until container.childCount) {
            val child = container.getChildAt(i)
            child.setOnFocusChangeListener { view, hasFocus ->
                if (hasFocus) {
                    rememberFocusPosition(containerKey, i)
                    rememberFocusView(containerKey, view)
                }
            }
        }
    }
    
    /**
     * Find and focus the first focusable view in a ViewGroup
     */
    fun focusFirstFocusable(viewGroup: ViewGroup): Boolean {
        for (i in 0 until viewGroup.childCount) {
            val child = viewGroup.getChildAt(i)
            if (child.isFocusable) {
                Log.d(TAG, "Focusing first focusable: ${child.javaClass.simpleName}")
                return child.requestFocus()
            }
            if (child is ViewGroup && focusFirstFocusable(child)) {
                return true
            }
        }
        return false
    }
    
    /**
     * Navigate to sibling view in a direction
     */
    fun navigateToSibling(
        currentView: View,
        direction: Direction
    ): Boolean {
        val parent = currentView.parent as? ViewGroup ?: return false
        val currentIndex = parent.indexOfChild(currentView)
        
        val targetIndex = when (direction) {
            Direction.LEFT, Direction.UP -> currentIndex - 1
            Direction.RIGHT, Direction.DOWN -> currentIndex + 1
        }
        
        if (targetIndex < 0 || targetIndex >= parent.childCount) {
            return false
        }
        
        val targetView = parent.getChildAt(targetIndex)
        if (targetView.isFocusable) {
            return targetView.requestFocus()
        }
        
        return false
    }
    
    enum class Direction {
        LEFT, RIGHT, UP, DOWN
    }
}
