package com.ronika.iptvnative.components

import android.content.Context
import android.util.AttributeSet
import android.util.Log
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView

/**
 * Custom RecyclerView that prevents focus from escaping during vertical navigation.
 * Uses multiple strategies to trap focus:
 * 1. Override focusSearch to block focus leaving the RecyclerView
 * 2. Override addFocusables to limit focusable candidates to children
 * 3. Handle key events with debouncing to prevent fast scroll focus escape
 */
class BoundaryBlockingRecyclerView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : RecyclerView(context, attrs, defStyleAttr) {

    private val TAG = "BoundaryBlockingRV"
    private var lastKeyTime = 0L
    private val KEY_DEBOUNCE_MS = 30L // Minimum time between key presses
    
    init {
        // Log when this RecyclerView loses focus
        setOnFocusChangeListener { _, hasFocus ->
            Log.d(TAG, "RecyclerView focus changed: hasFocus=$hasFocus")
        }
    }

    /**
     * Override focusSearch to completely block focus from leaving this RecyclerView
     * for UP/DOWN directions.
     */
    override fun focusSearch(focused: View?, direction: Int): View? {
        // Only intercept vertical navigation
        if (direction != View.FOCUS_UP && direction != View.FOCUS_DOWN) {
            return super.focusSearch(focused, direction)
        }
        
        // Find next focus within our children
        val nextFocus = super.focusSearch(focused, direction)
        
        // Check if next focus is one of our children
        if (nextFocus != null && isViewMyChild(nextFocus)) {
            return nextFocus
        }
        
        // Focus would escape - block it
        Log.d(TAG, "Blocking focus escape: direction=$direction")
        return focused
    }
    
    /**
     * Override addFocusables to only add our own children as focusable candidates.
     */
    override fun addFocusables(views: ArrayList<View>?, direction: Int, focusableMode: Int) {
        // Only intercept vertical navigation
        if (direction != View.FOCUS_UP && direction != View.FOCUS_DOWN) {
            super.addFocusables(views, direction, focusableMode)
            return
        }
        
        // Only add our own children
        views?.let { viewList ->
            for (i in 0 until childCount) {
                val child = getChildAt(i)
                if (child.visibility == View.VISIBLE) {
                    child.addFocusables(viewList, direction, focusableMode)
                }
            }
        }
    }
    
    /**
     * Check if a view is a child (or descendant) of this RecyclerView
     */
    private fun isViewMyChild(view: View): Boolean {
        var current: View? = view
        while (current != null) {
            val parent = current.parent
            if (parent == this) return true
            current = if (parent is View) parent else null
        }
        return false
    }
    
    /**
     * Handle key events with debouncing to prevent fast scroll focus escape
     */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN) {
            when (event.keyCode) {
                KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN -> {
                    val now = System.currentTimeMillis()
                    
                    // Check if we're scrolling (layout in progress)
                    if (isComputingLayout) {
                        Log.d(TAG, "Consuming key during layout computation")
                        return true
                    }
                    
                    // Debounce rapid key presses
                    if (now - lastKeyTime < KEY_DEBOUNCE_MS) {
                        Log.d(TAG, "Debouncing rapid key press")
                        return true
                    }
                    lastKeyTime = now
                    
                    // Get current focused child position
                    val lm = layoutManager as? LinearLayoutManager
                    val focusedChild = focusedChild
                    if (lm != null && focusedChild != null) {
                        val position = getChildAdapterPosition(focusedChild)
                        val itemCount = adapter?.itemCount ?: 0
                        
                        // Block at boundaries
                        if (event.keyCode == KeyEvent.KEYCODE_DPAD_UP && position == 0) {
                            Log.d(TAG, "At top boundary, blocking UP")
                            return true
                        }
                        if (event.keyCode == KeyEvent.KEYCODE_DPAD_DOWN && position >= itemCount - 1) {
                            Log.d(TAG, "At bottom boundary, blocking DOWN")
                            return true
                        }
                    }
                }
            }
        }
        
        return super.dispatchKeyEvent(event)
    }
}
