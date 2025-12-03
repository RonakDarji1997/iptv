package com.ronika.iptvnative.theme

import android.graphics.Color
import android.graphics.drawable.GradientDrawable

/**
 * Netflix-style theme configuration
 * Red primary color with white text and borders
 */
object NetflixTheme {
    
    // Primary Colors
    const val RED_PRIMARY = "#E50914"  // Netflix red
    const val RED_PRIMARY_DARK = "#B20710"  // Darker red for pressed state
    const val RED_PRIMARY_LIGHT = "#FF0A16"  // Lighter red for hover
    
    // Background Colors - Pure black
    const val BACKGROUND_BLACK = "#FF000000"  // Pure black background
    const val BACKGROUND_DARK = "#FF000000"  // Pure black
    const val BACKGROUND_SEMI = "#FF000000"  // Pure black
    
    // Text Colors - Pure white
    const val TEXT_WHITE = "#FFFFFFFF"  // Pure white
    const val TEXT_GRAY = "#FFFFFFFF"  // Pure white
    const val TEXT_LIGHT_GRAY = "#FFFFFFFF"  // Pure white
    const val TEXT_DIM = "#FFFFFFFF"  // Pure white
    
    // Border Colors
    const val BORDER_WHITE = "#FFFFFFFF"
    const val BORDER_RED = RED_PRIMARY
    const val BORDER_GRAY = "#333333"
    
    // State Colors
    const val FOCUSED = RED_PRIMARY
    const val SELECTED = RED_PRIMARY
    const val NORMAL = BACKGROUND_DARK
    const val HOVER = "#1AFFFFFF"  // 10% white overlay
    
    // Dimensions (in dp)
    const val BORDER_WIDTH = 2
    const val BORDER_RADIUS = 4
    const val PADDING_SMALL = 8
    const val PADDING_MEDIUM = 16
    const val PADDING_LARGE = 24
    
    // Animation Durations (in ms)
    const val ANIMATION_FAST = 150L
    const val ANIMATION_NORMAL = 300L
    const val ANIMATION_SLOW = 500L
    
    /**
     * Create a focused state drawable with red background and white border
     */
    fun createFocusedDrawable(): GradientDrawable {
        return GradientDrawable().apply {
            setColor(Color.parseColor(RED_PRIMARY))
            setStroke(BORDER_WIDTH * 2, Color.parseColor(BORDER_WHITE))
            cornerRadius = BORDER_RADIUS.toFloat()
        }
    }
    
    /**
     * Create a normal state drawable with dark background and gray border
     */
    fun createNormalDrawable(): GradientDrawable {
        return GradientDrawable().apply {
            setColor(Color.parseColor(NORMAL))
            setStroke(BORDER_WIDTH, Color.parseColor(BORDER_GRAY))
            cornerRadius = BORDER_RADIUS.toFloat()
        }
    }
    
    /**
     * Create a selected state drawable with red background and white border
     */
    fun createSelectedDrawable(): GradientDrawable {
        return GradientDrawable().apply {
            setColor(Color.parseColor(RED_PRIMARY))
            setStroke(BORDER_WIDTH * 2, Color.parseColor(BORDER_WHITE))
            cornerRadius = BORDER_RADIUS.toFloat()
        }
    }
    
    /**
     * Create a hover state drawable with white overlay
     */
    fun createHoverDrawable(): GradientDrawable {
        return GradientDrawable().apply {
            setColor(Color.parseColor(HOVER))
            setStroke(BORDER_WIDTH, Color.parseColor(BORDER_WHITE))
            cornerRadius = BORDER_RADIUS.toFloat()
        }
    }
}
