package com.ronika.iptvnative.components

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.content.Context
import android.util.AttributeSet
import android.util.Log
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.core.view.children
import com.ronika.iptvnative.R
import com.ronika.iptvnative.services.OpenSubtitlesService
import com.ronika.iptvnative.utils.SRTParser
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.io.File

/**
 * Subtitle Side Navigation Component
 * Displays a 20% width side panel on the right with subtitle options:
 * - Off
 * - Upload SRT File
 * - OpenSubtitles list
 */
class SubtitleSideNavComponent @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : FrameLayout(context, attrs, defStyleAttr) {

    private val TAG = "SubtitleSideNav"
    
    // Views
    private lateinit var overlay: View
    private lateinit var panel: LinearLayout
    private lateinit var optionsContainer: LinearLayout
    private lateinit var optionOff: LinearLayout
    private lateinit var radioOff: RadioButton
    private lateinit var optionUpload: LinearLayout
    private lateinit var radioUpload: RadioButton
    private lateinit var opensubtitlesHeader: TextView
    private lateinit var opensubtitlesLoading: LinearLayout
    private lateinit var opensubtitlesListContainer: LinearLayout
    private lateinit var noSubtitlesMessage: TextView
    private lateinit var closeButton: TextView
    
    // Services
    private val openSubtitlesService = OpenSubtitlesService()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    
    // State
    private var isVisible = false
    private var currentSelection: SubtitleSelection = SubtitleSelection.Off
    private var subtitleList: List<OpenSubtitlesService.SubtitleItem> = emptyList()
    private var selectedRadioButton: RadioButton? = null
    
    // Movie/Series metadata for OpenSubtitles search
    private var movieTitle: String? = null
    private var imdbId: String? = null
    private var year: Int? = null
    private var season: Int? = null
    private var episode: Int? = null
    
    // Callbacks
    var onSubtitleSelected: ((SubtitleSelection) -> Unit)? = null
    var onClose: (() -> Unit)? = null
    var onUploadRequested: (() -> Unit)? = null
    var onShow: (() -> Unit)? = null
    
    sealed class SubtitleSelection {
        object Off : SubtitleSelection()
        data class Upload(val filePath: String) : SubtitleSelection()
        data class OpenSubtitle(val subtitle: OpenSubtitlesService.SubtitleItem) : SubtitleSelection()
    }
    
    init {
        LayoutInflater.from(context).inflate(R.layout.component_subtitle_sidenav, this, true)
        setupViews()
        setupListeners()
        
        // Make this component completely modal - trap all events
        isFocusable = true
        isFocusableInTouchMode = true
        isClickable = true
        
        // Set key listener to intercept ALL keys
        setOnKeyListener { _, keyCode, event ->
            if (!isVisible) return@setOnKeyListener false
            
            // Intercept ALL key events when visible
            when (event.action) {
                android.view.KeyEvent.ACTION_DOWN -> {
                    when (keyCode) {
                        android.view.KeyEvent.KEYCODE_BACK -> {
                            hide()
                            return@setOnKeyListener true
                        }
                        else -> {
                            // Let the focused child handle it, but don't propagate up
                            return@setOnKeyListener false
                        }
                    }
                }
                else -> return@setOnKeyListener false
            }
        }
        
        // Initially hidden
        visibility = View.GONE
    }
    
    private fun setupViews() {
        overlay = findViewById(R.id.subtitle_sidenav_overlay)
        panel = findViewById(R.id.subtitle_sidenav_panel)
        optionsContainer = findViewById(R.id.subtitle_options_container)
        optionOff = findViewById(R.id.subtitle_option_off)
        radioOff = findViewById(R.id.subtitle_radio_off)
        optionUpload = findViewById(R.id.subtitle_option_upload)
        radioUpload = findViewById(R.id.subtitle_radio_upload)
        opensubtitlesHeader = findViewById(R.id.opensubtitles_header)
        opensubtitlesLoading = findViewById(R.id.opensubtitles_loading)
        opensubtitlesListContainer = findViewById(R.id.opensubtitles_list_container)
        noSubtitlesMessage = findViewById(R.id.no_subtitles_message)
        closeButton = findViewById(R.id.subtitle_sidenav_close)
        
        selectedRadioButton = radioOff
    }
    
    private fun setupListeners() {
        // Close when clicking overlay
        overlay.setOnClickListener {
            hide()
        }
        
        // Off option
        optionOff.setOnClickListener {
            selectOption(SubtitleSelection.Off, radioOff)
        }
        
        optionOff.setOnFocusChangeListener { _, hasFocus ->
            if (hasFocus) {
                optionOff.isSelected = true
            } else {
                optionOff.isSelected = false
            }
        }
        
        // Upload option
        optionUpload.setOnClickListener {
            onUploadRequested?.invoke()
        }
        
        optionUpload.setOnFocusChangeListener { _, hasFocus ->
            if (hasFocus) {
                optionUpload.isSelected = true
            } else {
                optionUpload.isSelected = false
            }
        }
        
        // Close button
        closeButton.setOnClickListener {
            hide()
        }
        
        closeButton.setOnFocusChangeListener { _, hasFocus ->
            if (hasFocus) {
                closeButton.isSelected = true
            } else {
                closeButton.isSelected = false
            }
        }
    }
    
    /**
     * Show the side navigation with animation
     */
    fun show(
        movieTitle: String? = null,
        imdbId: String? = null,
        year: Int? = null,
        season: Int? = null,
        episode: Int? = null
    ) {
        Log.d(TAG, "🎬 show() called - clearing all states and flags")
        
        this.movieTitle = movieTitle
        this.imdbId = imdbId
        this.year = year
        this.season = season
        this.episode = episode
        
        // CRITICAL: Clear all focus states and selection flags before showing
        clearAllFocusStates()
        
        visibility = View.VISIBLE
        isVisible = true
        
        // Notify callback (e.g., to pause player)
        onShow?.invoke()
        
        // Calculate 35% of screen width for better readability on TV
        val screenWidth = resources.displayMetrics.widthPixels
        val panelWidth = (screenWidth * 0.35).toInt()
        
        // Set panel width
        panel.layoutParams = (panel.layoutParams as FrameLayout.LayoutParams).apply {
            width = panelWidth
        }
        
        // Animate panel slide in from right
        panel.translationX = panelWidth.toFloat()
        panel.animate()
            .translationX(0f)
            .setDuration(300)
            .start()
        
        // Fade in overlay
        overlay.alpha = 0f
        overlay.animate()
            .alpha(1f)
            .setDuration(300)
            .start()
        
        // Request focus on currently selected option or first option
        post {
            // Force this component to be focusable and request focus
            isFocusable = true
            isFocusableInTouchMode = true
            requestFocus()
            requestFocusFromTouch()
            
            Log.d(TAG, "🎯 Requesting focus on option after clearing states")
            
            // Then request focus on currently selected option
            postDelayed({
                val focusTarget = when (currentSelection) {
                    is SubtitleSelection.Off -> optionOff
                    is SubtitleSelection.Upload -> optionUpload
                    is SubtitleSelection.OpenSubtitle -> {
                        // Find the OpenSubtitle option in the list if it exists
                        val subtitle = (currentSelection as SubtitleSelection.OpenSubtitle).subtitle
                        val index = subtitleList.indexOfFirst { it.id == subtitle.id }
                        if (index >= 0 && index < opensubtitlesListContainer.childCount) {
                            opensubtitlesListContainer.getChildAt(index)
                        } else {
                            optionOff // Fallback if subtitle not found
                        }
                    }
                }
                
                // Clear focus on target first, then request again (ensures clean state)
                focusTarget.clearFocus()
                focusTarget.isFocusable = true
                focusTarget.isFocusableInTouchMode = true
                focusTarget.requestFocus()
                focusTarget.requestFocusFromTouch()
                
                Log.d(TAG, "✅ Focus requested on: ${focusTarget.javaClass.simpleName}, hasFocus: ${focusTarget.hasFocus()}")
            }, 150)
        }
        
        // Load OpenSubtitles if we have metadata
        if (imdbId != null || movieTitle != null) {
            loadOpenSubtitles()
        }
    }
    
    /**
     * Clear all focus states, selection flags, and reset focusability
     */
    private fun clearAllFocusStates() {
        Log.d(TAG, "🧹 Clearing all focus states and flags")
        
        // Clear focus from all option containers
        optionOff.clearFocus()
        optionUpload.clearFocus()
        closeButton.clearFocus()
        
        // Reset selection states
        optionOff.isSelected = false
        optionUpload.isSelected = false
        closeButton.isSelected = false
        
        // Clear focus from all OpenSubtitle items
        for (i in 0 until opensubtitlesListContainer.childCount) {
            val child = opensubtitlesListContainer.getChildAt(i)
            child.clearFocus()
            child.isSelected = false
        }
        
        // Reset focusability flags on all options
        optionOff.isFocusable = true
        optionOff.isFocusableInTouchMode = true
        optionUpload.isFocusable = true
        optionUpload.isFocusableInTouchMode = true
        closeButton.isFocusable = true
        closeButton.isFocusableInTouchMode = true
        
        // Clear any pending focus runnables
        handler?.removeCallbacksAndMessages(null)
        
        Log.d(TAG, "✅ All focus states cleared")
    }
    
    /**
     * Hide the side navigation with animation
     */
    fun hide() {
        if (!isVisible) return
        
        val screenWidth = resources.displayMetrics.widthPixels
        val panelWidth = (screenWidth * 0.35).toInt()
        
        // Animate panel slide out to right
        panel.animate()
            .translationX(panelWidth.toFloat())
            .setDuration(300)
            .start()
        
        // Fade out overlay
        overlay.animate()
            .alpha(0f)
            .setDuration(300)
            .withEndAction {
                visibility = View.GONE
                isVisible = false
                onClose?.invoke()
            }
            .start()
    }
    
    /**
     * Load subtitles from OpenSubtitles
     */
    private fun loadOpenSubtitles() {
        // Show loading
        opensubtitlesLoading.visibility = View.VISIBLE
        opensubtitlesHeader.visibility = View.GONE
        opensubtitlesListContainer.visibility = View.GONE
        noSubtitlesMessage.visibility = View.GONE
        
        Log.d(TAG, "=".repeat(80))
        Log.d(TAG, "🔍 SEARCHING OPENSUBTITLES")
        Log.d(TAG, "=".repeat(80))
        Log.d(TAG, "📝 Title: $movieTitle")
        Log.d(TAG, "📝 IMDB ID: ${imdbId ?: "(null)"}")
        Log.d(TAG, "📝 Year: ${year ?: "(null)"}")
        Log.d(TAG, "📝 Season: ${season ?: "(null)"}")
        Log.d(TAG, "📝 Episode: ${episode ?: "(null)"}")
        Log.d(TAG, "=".repeat(80))
        
        scope.launch {
            try {
                // Try IMDB ID first if available, otherwise use title search
                val subtitles = if (!imdbId.isNullOrBlank()) {
                    Log.d(TAG, "Searching by IMDB ID: $imdbId")
                    openSubtitlesService.searchByImdbId(imdbId!!)
                } else if (!movieTitle.isNullOrBlank()) {
                    Log.d(TAG, "Searching by title: $movieTitle")
                    openSubtitlesService.searchByQuery(
                        query = movieTitle!!,
                        year = year,
                        season = season,
                        episode = episode
                    )
                } else {
                    Log.w(TAG, "No search criteria available")
                    emptyList()
                }
                
                Log.d(TAG, "=".repeat(80))
                Log.d(TAG, "📝 SUBTITLE SEARCH RESULTS")
                Log.d(TAG, "📝 Found ${subtitles.size} subtitles")
                if (subtitles.isNotEmpty()) {
                    Log.d(TAG, "📝 First few results:")
                    subtitles.take(3).forEach { sub ->
                        Log.d(TAG, "📝   - ${sub.fileName} (${sub.language})")
                    }
                }
                Log.d(TAG, "=".repeat(80))
                subtitleList = subtitles
                
                // Hide loading
                opensubtitlesLoading.visibility = View.GONE
                
                if (subtitles.isEmpty()) {
                    noSubtitlesMessage.text = "No subtitles found for \"$movieTitle\""
                    noSubtitlesMessage.visibility = View.VISIBLE
                } else {
                    opensubtitlesHeader.visibility = View.VISIBLE
                    opensubtitlesListContainer.visibility = View.VISIBLE
                    displayOpenSubtitles(subtitles)
                    
                    // Restore selection if we previously selected an OpenSubtitle
                    if (currentSelection is SubtitleSelection.OpenSubtitle) {
                        val selectedSubtitle = (currentSelection as SubtitleSelection.OpenSubtitle).subtitle
                        val index = subtitleList.indexOfFirst { it.id == selectedSubtitle.id }
                        if (index >= 0 && index < opensubtitlesListContainer.childCount) {
                            val itemView = opensubtitlesListContainer.getChildAt(index)
                            val radio = itemView.findViewById<RadioButton>(R.id.subtitle_item_radio)
                            radio?.isChecked = true
                            selectedRadioButton = radio
                        }
                    }
                }
                
            } catch (e: Exception) {
                Log.e(TAG, "Error loading OpenSubtitles: ${e.message}", e)
                opensubtitlesLoading.visibility = View.GONE
                noSubtitlesMessage.text = "Error: ${e.message ?: "Unknown error"}"
                noSubtitlesMessage.visibility = View.VISIBLE
            }
        }
    }
    
    /**
     * Display OpenSubtitles list with language filtering
     */
    private fun displayOpenSubtitles(subtitles: List<OpenSubtitlesService.SubtitleItem>) {
        opensubtitlesListContainer.removeAllViews()
        
        // Priority languages to show first
        val priorityLanguages = listOf("en", "es", "fr", "de", "pt", "ar", "hi")
        
        // Separate subtitles by priority
        val prioritySubs = subtitles.filter { it.language.lowercase() in priorityLanguages }
            .sortedWith(compareBy<OpenSubtitlesService.SubtitleItem> { 
                priorityLanguages.indexOf(it.language.lowercase())
            }.thenByDescending { it.downloads })
            .take(10)
        
        val otherSubs = subtitles.filter { it.language.lowercase() !in priorityLanguages }
            .sortedByDescending { it.downloads }
            .take(5)
        
        // Display priority language subtitles
        prioritySubs.forEach { subtitle ->
            addSubtitleItem(subtitle)
        }
        
        // If there are other languages, show them under "Others"
        if (otherSubs.isNotEmpty()) {
            // Add "Others" header if we have priority subs
            if (prioritySubs.isNotEmpty()) {
                val headerView = TextView(context).apply {
                    text = "Other Languages"
                    textSize = 14f
                    setTextColor(0xFF888888.toInt())
                    setPadding(16, 24, 16, 8)
                }
                opensubtitlesListContainer.addView(headerView)
            }
            
            otherSubs.forEach { subtitle ->
                addSubtitleItem(subtitle)
            }
        }
    }
    
    /**
     * Add a subtitle item to the list
     */
    private fun addSubtitleItem(subtitle: OpenSubtitlesService.SubtitleItem) {
        val itemView = LayoutInflater.from(context).inflate(
            R.layout.item_subtitle_option,
            opensubtitlesListContainer,
            false
        ) as LinearLayout
        
        val radio = itemView.findViewById<RadioButton>(R.id.subtitle_item_radio)
        val titleText = itemView.findViewById<TextView>(R.id.subtitle_item_title)
        val infoText = itemView.findViewById<TextView>(R.id.subtitle_item_info)
        
        radio.isChecked = false
        titleText.text = subtitle.fileName
        infoText.text = "${subtitle.language.uppercase()} • ${subtitle.downloads} downloads"
        
        itemView.setOnClickListener {
            selectOption(SubtitleSelection.OpenSubtitle(subtitle), radio)
        }
        
        itemView.setOnFocusChangeListener { _, hasFocus ->
            if (hasFocus) {
                itemView.isSelected = true
            } else {
                itemView.isSelected = false
            }
        }
        
        // Keep focus within side nav panel
        itemView.nextFocusLeftId = itemView.id
        itemView.nextFocusRightId = itemView.id
        
        opensubtitlesListContainer.addView(itemView)
    }

    
    /**
     * Select a subtitle option
     */
    private fun selectOption(selection: SubtitleSelection, radioButton: RadioButton) {
        // Uncheck previous selection
        selectedRadioButton?.isChecked = false
        
        // Check new selection
        radioButton.isChecked = true
        selectedRadioButton = radioButton
        
        currentSelection = selection
        
        // Notify callback
        onSubtitleSelected?.invoke(selection)
        
        // Don't auto-close - let user press back button to close and return to player
        // hide()
    }
    
    /**
     * Handle uploaded SRT file
     */
    fun handleUploadedFile(filePath: String) {
        selectOption(SubtitleSelection.Upload(filePath), radioUpload)
    }
    
    
    override fun onInterceptTouchEvent(ev: android.view.MotionEvent): Boolean {
        // When visible, intercept all touch events to prevent them from reaching VOD player
        return isVisible
    }
    
    override fun dispatchKeyEvent(event: android.view.KeyEvent): Boolean {
        // When side nav is visible, intercept ALL key events to prevent them from reaching VOD player
        if (!isVisible) {
            return super.dispatchKeyEvent(event)
        }
        
        Log.d(TAG, "🔑 Key event intercepted: keyCode=${event.keyCode}, action=${event.action}")
        
        // Handle back button to close
        if (event.action == android.view.KeyEvent.ACTION_DOWN &&
            event.keyCode == android.view.KeyEvent.KEYCODE_BACK
        ) {
            hide()
            return true
        }
        
        // For navigation keys, let them be handled by children but ALWAYS return true to block propagation
        when (event.keyCode) {
            android.view.KeyEvent.KEYCODE_DPAD_UP,
            android.view.KeyEvent.KEYCODE_DPAD_DOWN,
            android.view.KeyEvent.KEYCODE_DPAD_CENTER,
            android.view.KeyEvent.KEYCODE_ENTER -> {
                // Let the children handle it
                super.dispatchKeyEvent(event)
                // Always return true to prevent propagation to parent (VOD player)
                return true
            }
            android.view.KeyEvent.KEYCODE_DPAD_LEFT,
            android.view.KeyEvent.KEYCODE_DPAD_RIGHT -> {
                // Block left/right completely
                return true
            }
            else -> {
                // Block all other keys
                return true
            }
        }
    }
}
