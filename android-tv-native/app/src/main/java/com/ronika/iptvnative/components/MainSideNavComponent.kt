package com.ronika.iptvnative.components

import android.content.Context
import android.util.AttributeSet
import android.util.Log
import android.view.KeyEvent
import android.view.LayoutInflater
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import com.ronika.iptvnative.R
import com.ronika.iptvnative.navigation.FocusNavigationHelper
import com.ronika.iptvnative.navigation.NavigationHistoryManager
import com.ronika.iptvnative.theme.NetflixTheme

/**
 * Main side navigation component (Search, Live TV, Movies, Series)
 * - Collapses to icons only by default
 * - Expands on focus to show labels
 * - Netflix-style red active state with white borders
 * - Remembers active tab
 */
class MainSideNavComponent @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : FrameLayout(context, attrs, defStyleAttr) {
    
    private val TAG = "MainSideNav"
    
    // UI Components
    private lateinit var sidebarContainer: LinearLayout
    private lateinit var searchButton: ImageView
    private lateinit var tvButton: ImageView
    private lateinit var moviesButton: ImageView
    private lateinit var seriesButton: ImageView
    private lateinit var settingsButton: ImageView
    private lateinit var searchLabel: TextView
    private lateinit var tvLabel: TextView
    private lateinit var moviesLabel: TextView
    private lateinit var seriesLabel: TextView
    private lateinit var settingsLabel: TextView
    
    // State
    private var isExpanded = false
    private var activeTab: Tab = Tab.LIVE_TV
    private var isInitializing = true  // Prevent tab selection during init
    
    // Navigation
    private val focusHelper = FocusNavigationHelper()
    
    // Callbacks
    private var onTabSelected: ((Tab) -> Unit)? = null
    private var onExpandStateChanged: ((Boolean) -> Unit)? = null
    private var onNavigateRight: (() -> Unit)? = null
    
    enum class Tab {
        SEARCH, LIVE_TV, MOVIES, SERIES, SETTINGS
    }
    
    init {
        LayoutInflater.from(context).inflate(R.layout.component_main_sidenav, this, true)
        initViews()
        setupListeners()
        applyTheme()
        setActiveTab(Tab.LIVE_TV, notify = false)
        expand()  // Keep sidebar expanded for better performance
    }
    
    private fun initViews() {
        sidebarContainer = findViewById(R.id.sidebar_container)
        searchButton = findViewById(R.id.search_button)
        tvButton = findViewById(R.id.tab_tv)
        moviesButton = findViewById(R.id.tab_movies)
        seriesButton = findViewById(R.id.tab_shows)
        settingsButton = findViewById(R.id.tab_settings)
        searchLabel = findViewById(R.id.search_text)
        tvLabel = findViewById(R.id.tv_text)
        moviesLabel = findViewById(R.id.movies_text)
        seriesLabel = findViewById(R.id.shows_text)
        settingsLabel = findViewById(R.id.settings_text)
    }
    
    private fun setupListeners() {
        // Search button
        searchButton.setOnClickListener {
            setActiveTab(Tab.SEARCH)
            // Navigate to categories immediately on click
            onNavigateRight?.invoke()
        }
        
        searchButton.setOnFocusChangeListener { _, hasFocus ->
            if (hasFocus) {
                setActiveTab(Tab.SEARCH, notify = !isInitializing)
                applyFocusedStyle(searchButton, searchLabel)
                isInitializing = false
            } else {
                applyNormalStyle(searchButton, searchLabel, Tab.SEARCH)
            }
        }
        
        // Live TV button
        tvButton.setOnClickListener {
            setActiveTab(Tab.LIVE_TV)
            // Navigate to categories immediately on click
            onNavigateRight?.invoke()
        }
        
        tvButton.setOnFocusChangeListener { _, hasFocus ->
            if (hasFocus) {
                setActiveTab(Tab.LIVE_TV, notify = !isInitializing)
                applyFocusedStyle(tvButton, tvLabel)
                isInitializing = false
            } else {
                applyNormalStyle(tvButton, tvLabel, Tab.LIVE_TV)
            }
        }
        
        searchButton.setOnKeyListener { _, keyCode, event ->
            if (event.action == KeyEvent.ACTION_DOWN) {
                when (keyCode) {
                    KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                        searchButton.performClick()
                        true
                    }
                    KeyEvent.KEYCODE_DPAD_RIGHT -> {
                        onNavigateRight?.invoke()
                        true
                    }
                    else -> false
                }
            } else false
        }
        
        tvButton.setOnKeyListener { _, keyCode, event ->
            if (event.action == KeyEvent.ACTION_DOWN) {
                when (keyCode) {
                    KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                        tvButton.performClick()
                        true
                    }
                    KeyEvent.KEYCODE_DPAD_RIGHT -> {
                        onNavigateRight?.invoke()
                        true
                    }
                    else -> false
                }
            } else false
        }
        
        // Movies button
        moviesButton.setOnClickListener {
            Log.d(TAG, "Movies button clicked, navigating right")
            setActiveTab(Tab.MOVIES)
            // Navigate to categories immediately on click
            onNavigateRight?.invoke()
        }
        
        moviesButton.setOnFocusChangeListener { _, hasFocus ->
            if (hasFocus) {
                setActiveTab(Tab.MOVIES, notify = !isInitializing)
                applyFocusedStyle(moviesButton, moviesLabel)
                isInitializing = false
            } else {
                applyNormalStyle(moviesButton, moviesLabel, Tab.MOVIES)
            }
        }
        
        moviesButton.setOnKeyListener { view, keyCode, event ->
            Log.d(TAG, "Movies button setOnKeyListener: keyCode=$keyCode, action=${event.action}, view.isFocused=${view.isFocused}")
            if (event.action == KeyEvent.ACTION_DOWN) {
                when (keyCode) {
                    KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                        Log.d(TAG, "Movies button CENTER/ENTER pressed, performing click")
                        moviesButton.performClick()
                        true
                    }
                    KeyEvent.KEYCODE_DPAD_RIGHT -> {
                        Log.d(TAG, "Movies button RIGHT pressed, invoking navigate right")
                        onNavigateRight?.invoke()
                        true
                    }
                    else -> false
                }
            } else false
        }
        
        // Series button
        seriesButton.setOnClickListener {
            setActiveTab(Tab.SERIES)
            // Navigate to categories immediately on click
            onNavigateRight?.invoke()
        }
        
        seriesButton.setOnFocusChangeListener { _, hasFocus ->
            if (hasFocus) {
                setActiveTab(Tab.SERIES, notify = !isInitializing)
                applyFocusedStyle(seriesButton, seriesLabel)
                isInitializing = false
            } else {
                applyNormalStyle(seriesButton, seriesLabel, Tab.SERIES)
            }
        }
        
        seriesButton.setOnKeyListener { _, keyCode, event ->
            if (event.action == KeyEvent.ACTION_DOWN) {
                when (keyCode) {
                    KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                        seriesButton.performClick()
                        true
                    }
                    KeyEvent.KEYCODE_DPAD_RIGHT -> {
                        onNavigateRight?.invoke()
                        true
                    }
                    else -> false
                }
            } else false
        }
        
        // Settings button
        settingsButton.setOnClickListener {
            setActiveTab(Tab.SETTINGS)
            onTabSelected?.invoke(Tab.SETTINGS)
        }
        
        settingsButton.setOnFocusChangeListener { _, hasFocus ->
            if (hasFocus) {
                setActiveTab(Tab.SETTINGS, notify = !isInitializing)
                applyFocusedStyle(settingsButton, settingsLabel)
                isInitializing = false
            } else {
                applyNormalStyle(settingsButton, settingsLabel, Tab.SETTINGS)
            }
        }
        
        settingsButton.setOnKeyListener { _, keyCode, event ->
            if (event.action == KeyEvent.ACTION_DOWN) {
                when (keyCode) {
                    KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                        settingsButton.performClick()
                        true
                    }
                    KeyEvent.KEYCODE_DPAD_RIGHT -> {
                        // Navigate right to settings content
                        onNavigateRight?.invoke()
                        true
                    }
                    KeyEvent.KEYCODE_DPAD_DOWN -> {
                        // Block DOWN on last item
                        true
                    }
                    else -> false
                }
            } else false
        }
    }
    
    private fun applyTheme() {
        // Set sidebar background
        sidebarContainer.setBackgroundColor(android.graphics.Color.parseColor(NetflixTheme.BACKGROUND_BLACK))
    }
    
    private fun applyFocusedStyle(button: ImageView, label: TextView) {
        // Black icon on white background when focused (like macOS dock)
        button.imageTintList = android.content.res.ColorStateList.valueOf(
            android.graphics.Color.parseColor("#000000")
        )
        button.elevation = 8f
        label.setTextColor(android.graphics.Color.parseColor(NetflixTheme.TEXT_WHITE))
    }
    
    private fun applyNormalStyle(button: ImageView, label: TextView, tab: Tab) {
        // White icon on transparent background when not focused
        button.imageTintList = android.content.res.ColorStateList.valueOf(
            android.graphics.Color.parseColor("#FFFFFF")
        )
        button.elevation = 0f
        label.setTextColor(android.graphics.Color.parseColor(NetflixTheme.TEXT_GRAY))
    }
    
    /**
     * Set the active tab
     */
    fun setActiveTab(tab: Tab, notify: Boolean = true) {
        // During initialization, only allow setting the initial tab (LIVE_TV)
        // Ignore focus changes to other tabs until initialization is complete
        if (isInitializing && tab != Tab.LIVE_TV) {
            Log.d(TAG, "Ignoring tab change to $tab during initialization")
            return
        }
        
        Log.d(TAG, "Setting active tab: $tab")
        activeTab = tab
        
        // Update styles for all tabs
        applyNormalStyle(searchButton, searchLabel, Tab.SEARCH)
        applyNormalStyle(tvButton, tvLabel, Tab.LIVE_TV)
        applyNormalStyle(moviesButton, moviesLabel, Tab.MOVIES)
        applyNormalStyle(seriesButton, seriesLabel, Tab.SERIES)
        applyNormalStyle(settingsButton, settingsLabel, Tab.SETTINGS)
        
        // Notify callback
        if (notify) {
            onTabSelected?.invoke(tab)
        }
    }
    
    /**
     * Get the active tab
     */
    fun getActiveTab(): Tab = activeTab
    
    /**
     * Expand the sidebar to show labels
     */
    fun expand() {
        if (isExpanded) return
        
        isExpanded = true
        searchLabel.visibility = View.VISIBLE
        tvLabel.visibility = View.VISIBLE
        moviesLabel.visibility = View.VISIBLE
        seriesLabel.visibility = View.VISIBLE
        settingsLabel.visibility = View.VISIBLE
        
        onExpandStateChanged?.invoke(true)
    }
    
    /**
     * Collapse the sidebar to show only icons
     */
    fun collapse() {
        if (!isExpanded) return
        
        isExpanded = false
        searchLabel.visibility = View.GONE
        tvLabel.visibility = View.GONE
        moviesLabel.visibility = View.GONE
        seriesLabel.visibility = View.GONE
        settingsLabel.visibility = View.GONE
        
        onExpandStateChanged?.invoke(false)
    }
    
    /**
     * Request focus on the active tab
     */
    fun requestFocusOnActiveTab() {
        when (activeTab) {
            Tab.SEARCH -> searchButton.requestFocus()
            Tab.LIVE_TV -> tvButton.requestFocus()
            Tab.MOVIES -> moviesButton.requestFocus()
            Tab.SERIES -> seriesButton.requestFocus()
            Tab.SETTINGS -> settingsButton.requestFocus()
        }
    }
    
    /**
     * Set tab selected callback
     */
    fun setOnTabSelectedListener(listener: (Tab) -> Unit) {
        onTabSelected = listener
    }
    
    /**
     * Set navigate right callback
     */
    fun setOnNavigateRightListener(listener: () -> Unit) {
        onNavigateRight = listener
    }
    
    /**
     * Set expand state changed callback
     */
    fun setOnExpandStateChangedListener(listener: (Boolean) -> Unit) {
        onExpandStateChanged = listener
    }
    
    /**
     * Show or hide the sidebar
     */
    override fun setVisibility(visibility: Int) {
        super.setVisibility(visibility)
        if (visibility == View.GONE) {
            collapse()
        }
    }
}
