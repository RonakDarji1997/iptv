package com.ronika.iptvnative

import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.util.Log
import android.view.KeyEvent
import android.view.LayoutInflater
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import com.ronika.iptvnative.database.AppDatabase
import com.ronika.iptvnative.database.entities.CategoryEntity
import com.ronika.iptvnative.database.entities.ProviderEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.UUID

/**
 * PortalSetupActivity - Configuration screen for IPTV portals
 * 
 * Setup Steps (for Stalker Portal):
 * 1. Connect (handshake + profile) - Mark as complete on success
 * 2. Select Categories (TV + VOD side by side) - User selects which to include
 * 3. Adult Password (if censored content exists) - User sets password
 * 
 * Supports three portal types:
 * 1. M3U Playlist - URL input
 * 2. Xtream Codes - Server/Username/Password
 * 3. Stalker Portal - Server/MAC with multi-step setup
 */
class PortalSetupActivity : ComponentActivity() {

    companion object {
        private const val TAG = "PortalSetup"
        
        // Portal types
        const val PORTAL_TYPE_M3U = "m3u"
        const val PORTAL_TYPE_XTREAM = "xtream"
        const val PORTAL_TYPE_STALKER = "stalker"
        
        // Setup steps for Stalker
        const val SETUP_STEP_CONNECT = 1      // Step 1: Connect to portal
        const val SETUP_STEP_CATEGORIES = 2   // Step 2: Select categories
        const val SETUP_STEP_ADULT_PASS = 3   // Step 3: Set adult password (if needed)
        const val SETUP_STEP_COMPLETE = 4     // All steps done
        
        // Test data for pre-fill
        private const val TEST_SERVER = "http://tv.stream4k.cc"
        private const val TEST_MAC = "00:1a:79:17:f4:f5"
        private const val TEST_TOKEN = "1E75E91204660B7A876055CE8830130E"
        
        // Preferences keys (kept for backwards compatibility)
        private const val PREFS_NAME = "portal_config"
        private const val KEY_PORTAL_TYPE = "portal_type"
        private const val KEY_PORTAL_URL = "portal_url"
        private const val KEY_SERVER = "server"
        private const val KEY_USERNAME = "username"
        private const val KEY_PASSWORD = "password"
        private const val KEY_MAC_ADDRESS = "mac_address"
        private const val KEY_SERIAL = "serial_number"
        private const val KEY_STALKER_TOKEN = "stalker_token"
        private const val KEY_INCLUDE_TV = "include_tv"
        private const val KEY_INCLUDE_VOD = "include_vod"
        private const val KEY_IS_CONFIGURED = "is_configured"
        private const val KEY_SETUP_STEP = "setup_step"
        private const val KEY_ADULT_PASSWORD = "adult_password"
        private const val KEY_HAS_PENDING_SETUP = "has_pending_setup"
        private const val KEY_ACTIVE_PROVIDER_ID = "active_provider_id"
        
        /**
         * Check if portal is already configured
         */
        fun isPortalConfigured(context: Context): Boolean {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            return prefs.getBoolean(KEY_IS_CONFIGURED, false)
        }
        
        /**
         * Check if there's a pending setup (started but not completed)
         */
        fun hasPendingSetup(context: Context): Boolean {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            return prefs.getBoolean(KEY_HAS_PENDING_SETUP, false)
        }
        
        /**
         * Get current setup step
         */
        fun getCurrentSetupStep(context: Context): Int {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            return prefs.getInt(KEY_SETUP_STEP, SETUP_STEP_CONNECT)
        }
        
        /**
         * Clear pending setup (for canceling and starting fresh)
         */
        fun clearPendingSetup(context: Context) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().apply {
                putBoolean(KEY_HAS_PENDING_SETUP, false)
                putInt(KEY_SETUP_STEP, SETUP_STEP_CONNECT)
                remove(KEY_STALKER_TOKEN)
                apply()
            }
        }
        
        /**
         * Clear all configuration (when no providers remain)
         */
        fun clearConfiguration(context: Context) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().apply {
                putBoolean(KEY_IS_CONFIGURED, false)
                putBoolean(KEY_HAS_PENDING_SETUP, false)
                putInt(KEY_SETUP_STEP, SETUP_STEP_CONNECT)
                remove(KEY_STALKER_TOKEN)
                apply()
            }
        }
        
        /**
         * Get saved portal configuration
         */
        fun getPortalConfig(context: Context): PortalConfig? {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            if (!prefs.getBoolean(KEY_IS_CONFIGURED, false) && !prefs.getBoolean(KEY_HAS_PENDING_SETUP, false)) return null
            
            val type = prefs.getString(KEY_PORTAL_TYPE, null) ?: return null
            
            return PortalConfig(
                type = type,
                url = prefs.getString(KEY_PORTAL_URL, null),
                server = prefs.getString(KEY_SERVER, null),
                username = prefs.getString(KEY_USERNAME, null),
                password = prefs.getString(KEY_PASSWORD, null),
                macAddress = prefs.getString(KEY_MAC_ADDRESS, null),
                serialNumber = prefs.getString(KEY_SERIAL, null),
                stalkerToken = prefs.getString(KEY_STALKER_TOKEN, null),
                includeTv = prefs.getBoolean(KEY_INCLUDE_TV, true),
                includeVod = prefs.getBoolean(KEY_INCLUDE_VOD, true),
                setupStep = prefs.getInt(KEY_SETUP_STEP, SETUP_STEP_CONNECT),
                adultPassword = prefs.getString(KEY_ADULT_PASSWORD, null)
            )
        }
    }
    
    data class PortalConfig(
        val type: String,
        val url: String? = null,
        val server: String? = null,
        val username: String? = null,
        val password: String? = null,
        val macAddress: String? = null,
        val serialNumber: String? = null,
        val stalkerToken: String? = null,
        val includeTv: Boolean = true,
        val includeVod: Boolean = true,
        val setupStep: Int = SETUP_STEP_CONNECT,
        val adultPassword: String? = null
    )
    
    // Current form step
    private enum class FormStep {
        SELECT_TYPE,
        M3U_CONFIG,
        XTREAM_CONFIG,
        STALKER_CONFIG,
        CATEGORY_SELECTION,  // Step 2
        ADULT_PASSWORD       // Step 3
    }
    
    private var currentStep = FormStep.SELECT_TYPE
    private var selectedPortalType: String? = null
    
    // Generated device identifiers
    private lateinit var generatedMac: String
    private lateinit var generatedSerial: String
    
    // Database
    private val database by lazy { AppDatabase.getDatabase(this) }
    private val providerDao by lazy { database.providerDao() }
    private val categoryDao by lazy { database.categoryDao() }
    
    // Current provider being configured
    private var currentProviderId: String? = null
    
    // Flag when editing from settings (for proper back navigation)
    private var isEditingFromSettings = false
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_portal_setup)
        
        // Set black background
        window.decorView.setBackgroundColor(Color.parseColor("#FF000000"))
        
        // Generate device identifiers
        generateDeviceIdentifiers()
        
        // Check if coming from settings to add new playlist
        val addNew = intent.getBooleanExtra("add_new", false)
        if (addNew) {
            // Start fresh provider setup - show type selection
            Log.d(TAG, "Adding new playlist - starting fresh setup")
            showSelectTypeForm()
            return
        }
        
        // Check if coming from settings to edit categories
        val editCategories = intent.getBooleanExtra("edit_categories", false)
        val fromSettings = intent.getBooleanExtra("from_settings", false)
        val editProviderId = intent.getStringExtra("provider_id")
        
        if (editCategories && editProviderId != null) {
            // Direct to category selection for existing provider
            lifecycleScope.launch {
                val provider = withContext(Dispatchers.IO) {
                    providerDao.getProviderById(editProviderId)
                }
                
                if (provider != null) {
                    currentProviderId = provider.id
                    // Mark that we're coming from settings for back navigation
                    isEditingFromSettings = true
                    showCategorySelectionForm(provider)
                } else {
                    Toast.makeText(this@PortalSetupActivity, "Provider not found", Toast.LENGTH_SHORT).show()
                    finish()
                }
            }
            return
        }
        
        // Check for pending setup in database
        lifecycleScope.launch {
            val pendingProvider = withContext(Dispatchers.IO) {
                providerDao.getPendingSetupProvider()
            }
            
            if (pendingProvider != null) {
                currentProviderId = pendingProvider.id
                Log.d(TAG, "Found pending provider: ${pendingProvider.name} at step ${pendingProvider.setupStep}")
                
                when (pendingProvider.setupStep) {
                    SETUP_STEP_CATEGORIES -> {
                        // Resume from step 2 - show category selection
                        Toast.makeText(this@PortalSetupActivity, "Resuming setup: Category Selection", Toast.LENGTH_SHORT).show()
                        showCategorySelectionForm(pendingProvider)
                    }
                    SETUP_STEP_ADULT_PASS -> {
                        // Resume from step 3 - show adult password screen
                        Toast.makeText(this@PortalSetupActivity, "Resuming setup: Adult Password", Toast.LENGTH_SHORT).show()
                        showAdultPasswordForm(pendingProvider)
                    }
                    else -> {
                        // Start fresh from step 1
                        showSelectTypeForm()
                    }
                }
            } else {
                // No pending setup - start fresh from Step 1
                showSelectTypeForm()
            }
        }
        
        Log.d(TAG, "Portal setup activity initialized")
    }
    
    private suspend fun seedTestProvider() {
        Log.d(TAG, "Seeding test provider for development...")
        
        val testProvider = ProviderEntity(
            id = UUID.randomUUID().toString(),
            name = "Test Provider - Stream4K",
            type = PORTAL_TYPE_STALKER,
            serverUrl = TEST_SERVER,
            macAddress = TEST_MAC,
            serialNumber = generatedSerial,
            token = TEST_TOKEN,
            username = null,
            password = null,
            setupStep = SETUP_STEP_CATEGORIES, // Step 1 complete, ready for step 2
            isActive = true,
            includeTv = true,
            includeVod = true
        )
        
        withContext(Dispatchers.IO) {
            providerDao.insertProvider(testProvider)
        }
        
        currentProviderId = testProvider.id
        
        // Save to prefs for backwards compatibility
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().apply {
            putString(KEY_ACTIVE_PROVIDER_ID, testProvider.id)
            putString(KEY_PORTAL_TYPE, PORTAL_TYPE_STALKER)
            putString(KEY_SERVER, TEST_SERVER)
            putString(KEY_MAC_ADDRESS, TEST_MAC)
            putString(KEY_SERIAL, generatedSerial)
            putString(KEY_STALKER_TOKEN, TEST_TOKEN)
            putInt(KEY_SETUP_STEP, SETUP_STEP_CATEGORIES)
            putBoolean(KEY_HAS_PENDING_SETUP, true)
            apply()
        }
        
        runOnUiThread {
            Toast.makeText(this@PortalSetupActivity, "Test provider loaded. Starting Step 2...", Toast.LENGTH_SHORT).show()
            showCategorySelectionForm(testProvider)
        }
    }
    
    private fun showCategorySelectionForm(provider: ProviderEntity) {
        currentStep = FormStep.CATEGORY_SELECTION
        
        // Switch to category selection layout
        setContentView(R.layout.activity_category_selection)
        window.decorView.setBackgroundColor(Color.BLACK)
        
        val liveContainer = findViewById<LinearLayout>(R.id.live_categories_container)
        val moviesContainer = findViewById<LinearLayout>(R.id.movies_categories_container)
        val seriesContainer = findViewById<LinearLayout>(R.id.series_categories_container)
        val loadingView = findViewById<FrameLayout>(R.id.loading_indicator)
        val btnNext = findViewById<Button>(R.id.btn_next)
        val btnSelectAll = findViewById<Button>(R.id.btn_select_all)
        val btnDeselectAll = findViewById<Button>(R.id.btn_deselect_all)
        val liveTvCountLabel = findViewById<TextView>(R.id.live_tv_count)
        val moviesCountLabel = findViewById<TextView>(R.id.movies_count)
        val seriesCountLabel = findViewById<TextView>(R.id.series_count)
        
        // Track selected categories
        val liveTvCategories = mutableListOf<StalkerCategory>()
        val movieCategories = mutableListOf<StalkerCategory>()
        val seriesCategories = mutableListOf<StalkerCategory>()
        
        // Show loading
        loadingView.visibility = View.VISIBLE
        btnNext.isEnabled = false
        
        // Helper function to update all checkboxes
        fun updateAllCheckboxes(selected: Boolean) {
            liveTvCategories.forEach { it.isSelected = selected }
            movieCategories.forEach { it.isSelected = selected }
            seriesCategories.forEach { it.isSelected = selected }
            
            // Update UI
            for (i in 0 until liveContainer.childCount) {
                liveContainer.getChildAt(i).findViewById<CheckBox>(R.id.checkbox)?.isChecked = selected
            }
            for (i in 0 until moviesContainer.childCount) {
                moviesContainer.getChildAt(i).findViewById<CheckBox>(R.id.checkbox)?.isChecked = selected
            }
            for (i in 0 until seriesContainer.childCount) {
                seriesContainer.getChildAt(i).findViewById<CheckBox>(R.id.checkbox)?.isChecked = selected
            }
        }
        
        // Select/Deselect all buttons
        btnSelectAll.setOnClickListener { updateAllCheckboxes(true) }
        btnDeselectAll.setOnClickListener { updateAllCheckboxes(false) }
        
        // Fetch categories from server
        lifecycleScope.launch {
            try {
                // If editing from settings, load existing category states from DB
                val existingCategories = if (isEditingFromSettings) {
                    withContext(Dispatchers.IO) {
                        categoryDao.getCategoriesByProviderId(provider.id)
                    }
                } else {
                    emptyList()
                }
                
                // Create a map of externalId -> isEnabled for quick lookup
                val existingStateMap = existingCategories.associate { it.externalId to it.isEnabled }
                Log.d(TAG, "Loaded ${existingCategories.size} existing categories from DB (editing: $isEditingFromSettings)")
                
                val authClient = StalkerAuthClient(
                    provider.serverUrl,
                    provider.macAddress ?: "",
                    provider.serialNumber ?: generatedSerial
                )
                
                // Get TV genres
                val tvGenres = authClient.getGenres(provider.token ?: "")
                Log.d(TAG, "TV Genres: ${tvGenres.size} items")
                
                // Apply existing state if editing, otherwise default to selected
                for (genre in tvGenres) {
                    if (isEditingFromSettings && existingStateMap.containsKey(genre.id)) {
                        genre.isSelected = existingStateMap[genre.id] ?: true
                    }
                    // Default isSelected is true from StalkerCategory
                }
                liveTvCategories.addAll(tvGenres)
                
                // Get VOD categories
                val vodCategories = authClient.getVodCategories(provider.token ?: "")
                Log.d(TAG, "VOD Categories: ${vodCategories.size} items - checking is_series for each...")
                
                // Classify each category by fetching page 1 and checking is_series field
                val token = provider.token ?: ""
                val classifiedCategories = coroutineScope {
                    vodCategories.map { category ->
                        async(Dispatchers.IO) {
                            try {
                                // Apply existing state if editing
                                if (isEditingFromSettings && existingStateMap.containsKey(category.id)) {
                                    category.isSelected = existingStateMap[category.id] ?: true
                                }
                                
                                // Check is_series by fetching page 1 of this category
                                val isSeries = authClient.isCategorySeries(token, category.id)
                                category.isSeries = isSeries
                                Log.d(TAG, "Category ${category.title}: is_series=$isSeries")
                                category
                            } catch (e: Exception) {
                                Log.e(TAG, "Error checking category ${category.title}, defaulting to movie", e)
                                category.isSeries = false
                                category
                            }
                        }
                    }.awaitAll()
                }
                
                // Separate into movies and series
                for (category in classifiedCategories) {
                    if (category.isSeries) {
                        seriesCategories.add(category)
                    } else {
                        movieCategories.add(category)
                    }
                }
                
                Log.d(TAG, "Movies: ${movieCategories.size}, Series: ${seriesCategories.size}")
                
                // Sort categories: deselected first (at top), then selected
                val sortedLive = liveTvCategories.sortedBy { it.isSelected }
                val sortedMovies = movieCategories.sortedBy { it.isSelected }
                val sortedSeries = seriesCategories.sortedBy { it.isSelected }
                
                // Replace lists with sorted versions
                liveTvCategories.clear()
                liveTvCategories.addAll(sortedLive)
                movieCategories.clear()
                movieCategories.addAll(sortedMovies)
                seriesCategories.clear()
                seriesCategories.addAll(sortedSeries)
                
                // Count deselected for UI feedback
                val deselectedLive = liveTvCategories.count { !it.isSelected }
                val deselectedMovies = movieCategories.count { !it.isSelected }
                val deselectedSeries = seriesCategories.count { !it.isSelected }
                
                runOnUiThread {
                    loadingView.visibility = View.GONE
                    btnNext.isEnabled = true
                    
                    // Update count labels with deselected info
                    if (deselectedLive > 0) {
                        liveTvCountLabel.text = "${liveTvCategories.size} categories ($deselectedLive hidden)"
                    } else {
                        liveTvCountLabel.text = "${liveTvCategories.size} categories"
                    }
                    
                    if (deselectedMovies > 0) {
                        moviesCountLabel.text = "${movieCategories.size} categories ($deselectedMovies hidden)"
                    } else {
                        moviesCountLabel.text = "${movieCategories.size} categories"
                    }
                    
                    if (deselectedSeries > 0) {
                        seriesCountLabel.text = "${seriesCategories.size} categories ($deselectedSeries hidden)"
                    } else {
                        seriesCountLabel.text = "${seriesCategories.size} categories"
                    }
                    
                    // Populate Live TV column
                    populateCategoryColumn(liveContainer, liveTvCategories, "live")
                    
                    // Populate Movies column
                    populateCategoryColumn(moviesContainer, movieCategories, "movies")
                    
                    // Populate Series column
                    populateCategoryColumn(seriesContainer, seriesCategories, "series")
                    
                    // Set initial focus to first Live TV item
                    liveContainer.getChildAt(0)?.requestFocus()
                }
                
            } catch (e: Exception) {
                Log.e(TAG, "Error fetching categories", e)
                runOnUiThread {
                    loadingView.visibility = View.GONE
                    Toast.makeText(this@PortalSetupActivity, "Error loading categories: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
        
        // Next button click
        btnNext.setOnClickListener {
            // Collect selected categories and save
            val selectedLive = liveTvCategories.filter { it.isSelected }.map { it.id }
            val selectedMovies = movieCategories.filter { it.isSelected }.map { it.id }
            val selectedSeries = seriesCategories.filter { it.isSelected }.map { it.id }
            
            Log.d(TAG, "Selected - Live: ${selectedLive.size}, Movies: ${selectedMovies.size}, Series: ${selectedSeries.size}")
            
            // Save selected categories to database
            lifecycleScope.launch {
                withContext(Dispatchers.IO) {
                    // First, save ALL category data to CategoryEntity table
                    // This ensures categories are in DB when MainActivity loads
                    
                    // Clear existing categories for this provider
                    categoryDao.deleteByProviderId(provider.id)
                    
                    // Save Live TV categories with isEnabled based on selection
                    val liveTvEntities = liveTvCategories.map { cat ->
                        CategoryEntity(
                            id = UUID.randomUUID().toString(),
                            providerId = provider.id,
                            externalId = cat.id,
                            name = cat.title,
                            title = cat.title,
                            contentType = "live",
                            type = "LIVE",
                            alias = cat.alias,
                            censored = if (cat.censored) 1 else 0,
                            isEnabled = cat.isSelected // Store selection state in isEnabled
                        )
                    }
                    categoryDao.insertAll(liveTvEntities)
                    val enabledLive = liveTvEntities.count { it.isEnabled }
                    Log.d(TAG, "Saved ${liveTvEntities.size} Live TV categories to DB ($enabledLive enabled)")
                    
                    // Save Movie categories with isEnabled based on selection
                    val movieEntities = movieCategories.map { cat ->
                        CategoryEntity(
                            id = UUID.randomUUID().toString(),
                            providerId = provider.id,
                            externalId = cat.id,
                            name = cat.title,
                            title = cat.title,
                            contentType = "movie",
                            type = "MOVIE",
                            alias = cat.alias,
                            censored = if (cat.censored) 1 else 0,
                            isEnabled = cat.isSelected // Store selection state in isEnabled
                        )
                    }
                    categoryDao.insertAll(movieEntities)
                    val enabledMovies = movieEntities.count { it.isEnabled }
                    Log.d(TAG, "Saved ${movieEntities.size} Movie categories to DB ($enabledMovies enabled)")
                    
                    // Save Series categories with isEnabled based on selection
                    val seriesEntities = seriesCategories.map { cat ->
                        CategoryEntity(
                            id = UUID.randomUUID().toString(),
                            providerId = provider.id,
                            externalId = cat.id,
                            name = cat.title,
                            title = cat.title,
                            contentType = "series",
                            type = "SERIES",
                            alias = cat.alias,
                            censored = if (cat.censored) 1 else 0,
                            isEnabled = cat.isSelected // Store selection state in isEnabled
                        )
                    }
                    categoryDao.insertAll(seriesEntities)
                    val enabledSeries = seriesEntities.count { it.isEnabled }
                    Log.d(TAG, "Saved ${seriesEntities.size} Series categories to DB ($enabledSeries enabled)")
                    
                    // isEnabled flag is now stored in CategoryEntity, no need to store comma-separated IDs
                    providerDao.updateSetupStep(provider.id, SETUP_STEP_ADULT_PASS)
                    Log.d(TAG, "Saved category selections for provider: ${provider.id}")
                }
                
                runOnUiThread {
                    Toast.makeText(this@PortalSetupActivity, "Categories saved!", Toast.LENGTH_SHORT).show()
                    
                    // If editing from settings, just finish and go back
                    if (isEditingFromSettings) {
                        finish()
                    } else {
                        // Check if adult password is already set globally (in any provider)
                        lifecycleScope.launch {
                            val existingPassword = withContext(Dispatchers.IO) {
                                providerDao.getAnyAdultPassword()
                            }
                            
                            if (existingPassword != null) {
                                // Password already exists, copy it to this provider and skip setup
                                withContext(Dispatchers.IO) {
                                    providerDao.updateAdultPassword(provider.id, existingPassword)
                                }
                                Log.d(TAG, "Adult password already set globally, skipping setup")
                                saveAdultPasswordAndComplete(provider.id, existingPassword)
                            } else {
                                // No password set, show the form
                                showAdultPasswordForm(provider)
                            }
                        }
                    }
                }
            }
        }
    }
    
    private fun populateCategoryColumn(container: LinearLayout, categories: List<StalkerCategory>, columnType: String) {
        container.removeAllViews()
        
        for ((index, category) in categories.withIndex()) {
            val itemView = LayoutInflater.from(this).inflate(R.layout.item_category_checkbox, container, false)
            
            val checkbox = itemView.findViewById<CheckBox>(R.id.checkbox)
            val nameText = itemView.findViewById<TextView>(R.id.category_name)
            val adultBadge = itemView.findViewById<TextView>(R.id.adult_badge)
            
            nameText.text = category.title
            checkbox.isChecked = category.isSelected
            
            // Show adult badge if censored
            if (category.censored) {
                adultBadge.visibility = View.VISIBLE
            }
            
            // Handle item click to toggle checkbox
            itemView.setOnClickListener {
                category.isSelected = !category.isSelected
                checkbox.isChecked = category.isSelected
            }
            
            // Handle focus change to ensure scrolling
            itemView.setOnFocusChangeListener { v, hasFocus ->
                if (hasFocus) {
                    // Scroll to make this item visible
                    val scrollView = container.parent as? android.widget.ScrollView
                    scrollView?.post {
                        scrollView.smoothScrollTo(0, v.top - 50)
                    }
                }
            }
            
            // Handle D-pad center/enter to toggle
            itemView.setOnKeyListener { v, keyCode, event ->
                if (event.action == KeyEvent.ACTION_DOWN) {
                    when (keyCode) {
                        KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_BUTTON_A -> {
                            category.isSelected = !category.isSelected
                            checkbox.isChecked = category.isSelected
                            true
                        }
                        KeyEvent.KEYCODE_DPAD_LEFT -> {
                            // Move to previous column
                            moveToColumn(columnType, -1, index)
                            true
                        }
                        KeyEvent.KEYCODE_DPAD_RIGHT -> {
                            // Move to next column
                            moveToColumn(columnType, 1, index)
                            true
                        }
                        else -> false
                    }
                } else false
            }
            
            // Store category reference in tag for later access
            itemView.tag = category
            
            container.addView(itemView)
        }
    }
    
    private fun moveToColumn(currentColumn: String, direction: Int, currentIndex: Int) {
        val columns = listOf("live", "movies", "series")
        val currentPos = columns.indexOf(currentColumn)
        val newPos = (currentPos + direction).coerceIn(0, columns.size - 1)
        
        if (newPos == currentPos) return // Already at edge
        
        val targetContainerId = when (columns[newPos]) {
            "live" -> R.id.live_categories_container
            "movies" -> R.id.movies_categories_container
            "series" -> R.id.series_categories_container
            else -> return
        }
        
        val targetContainer = findViewById<LinearLayout>(targetContainerId)
        val targetIndex = currentIndex.coerceAtMost(targetContainer.childCount - 1).coerceAtLeast(0)
        
        if (targetContainer.childCount > 0) {
            targetContainer.getChildAt(targetIndex)?.requestFocus()
        }
    }
    
    private fun showAdultPasswordForm(provider: ProviderEntity) {
        currentStep = FormStep.ADULT_PASSWORD
        
        // Switch to adult password layout
        setContentView(R.layout.activity_adult_password)
        window.decorView.setBackgroundColor(Color.BLACK)
        
        val inputPin = findViewById<EditText>(R.id.input_pin)
        val inputPinConfirm = findViewById<EditText>(R.id.input_pin_confirm)
        val errorMessage = findViewById<TextView>(R.id.error_message)
        val btnSkip = findViewById<Button>(R.id.btn_skip)
        val btnSave = findViewById<Button>(R.id.btn_save)
        
        // Focus on PIN input
        inputPin.requestFocus()
        
        // Handle Save button click
        btnSave.setOnClickListener {
            val pin = inputPin.text.toString()
            val confirmPin = inputPinConfirm.text.toString()
            
            // Clear previous error
            errorMessage.visibility = View.GONE
            
            // Validate PIN
            if (pin.isEmpty()) {
                errorMessage.text = "Please enter a PIN"
                errorMessage.visibility = View.VISIBLE
                inputPin.requestFocus()
                return@setOnClickListener
            }
            
            if (pin.length != 4) {
                errorMessage.text = "PIN must be 4 digits"
                errorMessage.visibility = View.VISIBLE
                inputPin.requestFocus()
                return@setOnClickListener
            }
            
            if (pin != confirmPin) {
                errorMessage.text = "PINs don't match"
                errorMessage.visibility = View.VISIBLE
                inputPinConfirm.requestFocus()
                return@setOnClickListener
            }
            
            // Save PIN and complete setup
            saveAdultPasswordAndComplete(provider.id, pin)
        }
        
        // Handle Skip button click
        btnSkip.setOnClickListener {
            // Skip setting PIN, complete setup without it
            saveAdultPasswordAndComplete(provider.id, null)
        }
        
        // Handle enter key on confirm field
        inputPinConfirm.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_DONE) {
                btnSave.performClick()
                true
            } else {
                false
            }
        }
        
        Log.d(TAG, "Showing adult password form for provider: ${provider.id}")
    }
    
    private fun saveAdultPasswordAndComplete(providerId: String, pin: String?) {
        lifecycleScope.launch {
            withContext(Dispatchers.IO) {
                // Save adult password
                providerDao.updateAdultPassword(providerId, pin)
                // Mark setup as complete
                providerDao.markAsConfigured(providerId)
                Log.d(TAG, "Provider setup complete: $providerId (PIN ${if (pin != null) "set" else "skipped"})")
            }
            
            // Update prefs
            val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().apply {
                if (pin != null) {
                    putString(KEY_ADULT_PASSWORD, pin)
                }
                putInt(KEY_SETUP_STEP, SETUP_STEP_COMPLETE)
                putBoolean(KEY_HAS_PENDING_SETUP, false)
                putBoolean(KEY_IS_CONFIGURED, true)
                apply()
            }
            
            runOnUiThread {
                val message = if (pin != null) "Adult PIN set. Setup complete!" else "Setup complete!"
                Toast.makeText(this@PortalSetupActivity, message, Toast.LENGTH_SHORT).show()
                navigateToMain()
            }
        }
    }
    
    private suspend fun markProviderSetupComplete(providerId: String) {
        withContext(Dispatchers.IO) {
            providerDao.updateSetupStep(providerId, SETUP_STEP_COMPLETE)
        }
        
        // Also update prefs
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().apply {
            putInt(KEY_SETUP_STEP, SETUP_STEP_COMPLETE)
            putBoolean(KEY_HAS_PENDING_SETUP, false)
            putBoolean(KEY_IS_CONFIGURED, true)
            apply()
        }
        
        Log.d(TAG, "Provider setup marked as complete: $providerId")
    }
    
    private fun generateDeviceIdentifiers() {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        
        // Serial number is device-wide (same for all providers)
        generatedSerial = prefs.getString(KEY_SERIAL, null) ?: run {
            val serial = generateSerialNumber()
            prefs.edit().putString(KEY_SERIAL, serial).apply()
            serial
        }
        
        // MAC will be generated fresh for each new provider (done in showStalkerForm)
        // Just initialize with a placeholder here
        generatedMac = ""
        
        Log.d(TAG, "Device serial: $generatedSerial")
    }
    
    private fun generateRandomMac(): String {
        // Use 00:1A:79 prefix (common STB vendor prefix)
        val random = java.util.Random()
        val bytes = ByteArray(3)
        random.nextBytes(bytes)
        return String.format("00:1A:79:%02X:%02X:%02X", 
            bytes[0].toInt() and 0xFF,
            bytes[1].toInt() and 0xFF,
            bytes[2].toInt() and 0xFF
        )
    }
    
    private fun generateSerialNumber(): String {
        // Generate serial like real STB: 6 digits + letter + 6 digits
        val random = java.util.Random()
        val part1 = String.format("%06d", random.nextInt(1000000))
        val letter = ('A'..'Z').random()
        val part2 = String.format("%06d", random.nextInt(1000000))
        return "$part1$letter$part2"
    }
    
    private fun showSelectTypeForm() {
        currentStep = FormStep.SELECT_TYPE
        
        val formContainer = findViewById<FrameLayout>(R.id.form_container)
        formContainer.removeAllViews()
        
        val form = LayoutInflater.from(this).inflate(R.layout.form_playlist_type, formContainer, false)
        formContainer.addView(form)
        
        // Update left panel
        updateLeftPanel(R.drawable.ic_add, "Add Playlist", "Select the type of playlist you want to add")
        
        // Setup option clicks
        val optionM3u = form.findViewById<LinearLayout>(R.id.option_m3u)
        val optionXtream = form.findViewById<LinearLayout>(R.id.option_xtream)
        val optionStalker = form.findViewById<LinearLayout>(R.id.option_stalker)
        val btnCancel = form.findViewById<TextView>(R.id.btn_cancel)
        
        optionM3u.setOnClickListener {
            selectedPortalType = PORTAL_TYPE_M3U
            showM3uForm()
        }
        
        optionXtream.setOnClickListener {
            selectedPortalType = PORTAL_TYPE_XTREAM
            showXtreamForm()
        }
        
        optionStalker.setOnClickListener {
            selectedPortalType = PORTAL_TYPE_STALKER
            showStalkerForm()
        }
        
        btnCancel.setOnClickListener {
            finish()
        }
        
        // Set focus on first option
        optionM3u.requestFocus()
        
        Log.d(TAG, "Showing select type form")
    }
    
    private fun showM3uForm() {
        currentStep = FormStep.M3U_CONFIG
        
        val formContainer = findViewById<FrameLayout>(R.id.form_container)
        formContainer.removeAllViews()
        
        val form = LayoutInflater.from(this).inflate(R.layout.form_m3u_playlist, formContainer, false)
        formContainer.addView(form)
        
        // Update left panel
        updateLeftPanel(R.drawable.ic_add, "M3U Playlist", "Enter the URL of your M3U playlist")
        
        val inputUrl = form.findViewById<EditText>(R.id.input_url)
        val btnPaste = form.findViewById<LinearLayout>(R.id.btn_paste)
        val btnSelectLocal = form.findViewById<LinearLayout>(R.id.btn_select_local)
        val btnNext = form.findViewById<TextView>(R.id.btn_next)
        val btnBack = form.findViewById<TextView>(R.id.btn_back)
        
        // Paste from clipboard
        btnPaste.setOnClickListener {
            val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val clip = clipboard.primaryClip
            if (clip != null && clip.itemCount > 0) {
                val pastedText = clip.getItemAt(0).text?.toString() ?: ""
                inputUrl.setText(pastedText)
                Toast.makeText(this, "Pasted from clipboard", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(this, "Clipboard is empty", Toast.LENGTH_SHORT).show()
            }
        }
        
        // Select local file (TODO: implement file picker)
        btnSelectLocal.setOnClickListener {
            Toast.makeText(this, "Local file selection coming soon", Toast.LENGTH_SHORT).show()
        }
        
        // Next button
        btnNext.setOnClickListener {
            val url = inputUrl.text.toString().trim()
            if (url.isEmpty()) {
                Toast.makeText(this, "Please enter a playlist URL", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            
            saveM3uConfig(url)
        }
        
        // Back button
        btnBack.setOnClickListener {
            showSelectTypeForm()
        }
        
        // Set focus on URL input
        inputUrl.requestFocus()
        
        Log.d(TAG, "Showing M3U form")
    }
    
    private fun showXtreamForm() {
        currentStep = FormStep.XTREAM_CONFIG
        
        val formContainer = findViewById<FrameLayout>(R.id.form_container)
        formContainer.removeAllViews()
        
        val form = LayoutInflater.from(this).inflate(R.layout.form_xtream_codes, formContainer, false)
        formContainer.addView(form)
        
        // Update left panel
        updateLeftPanel(R.drawable.ic_add, "Xtream Codes", "Enter your Xtream Codes credentials")
        
        val inputServer = form.findViewById<EditText>(R.id.input_server)
        val inputUsername = form.findViewById<EditText>(R.id.input_username)
        val inputPassword = form.findViewById<EditText>(R.id.input_password)
        val checkboxTv = form.findViewById<CheckBox>(R.id.checkbox_tv_channels)
        val checkboxVod = form.findViewById<CheckBox>(R.id.checkbox_vod)
        val toggleTv = form.findViewById<LinearLayout>(R.id.toggle_tv_channels)
        val toggleVod = form.findViewById<LinearLayout>(R.id.toggle_vod)
        val btnNext = form.findViewById<TextView>(R.id.btn_next)
        val btnBack = form.findViewById<TextView>(R.id.btn_back)
        
        // Set default checkbox states
        checkboxTv.isChecked = true
        checkboxVod.isChecked = true
        
        // Toggle checkboxes when row is clicked
        toggleTv.setOnClickListener {
            checkboxTv.isChecked = !checkboxTv.isChecked
        }
        toggleVod.setOnClickListener {
            checkboxVod.isChecked = !checkboxVod.isChecked
        }
        
        // Next button
        btnNext.setOnClickListener {
            val server = inputServer.text.toString().trim()
            val username = inputUsername.text.toString().trim()
            val password = inputPassword.text.toString().trim()
            
            if (server.isEmpty()) {
                Toast.makeText(this, "Please enter server address", Toast.LENGTH_SHORT).show()
                inputServer.requestFocus()
                return@setOnClickListener
            }
            if (username.isEmpty()) {
                Toast.makeText(this, "Please enter username", Toast.LENGTH_SHORT).show()
                inputUsername.requestFocus()
                return@setOnClickListener
            }
            if (password.isEmpty()) {
                Toast.makeText(this, "Please enter password", Toast.LENGTH_SHORT).show()
                inputPassword.requestFocus()
                return@setOnClickListener
            }
            
            saveXtreamConfig(server, username, password, checkboxTv.isChecked, checkboxVod.isChecked)
        }
        
        // Back button
        btnBack.setOnClickListener {
            showSelectTypeForm()
        }
        
        // Set focus on server input
        inputServer.requestFocus()
        
        Log.d(TAG, "Showing Xtream form")
    }
    
    private fun showStalkerForm() {
        currentStep = FormStep.STALKER_CONFIG
        
        val formContainer = findViewById<FrameLayout>(R.id.form_container)
        formContainer.removeAllViews()
        
        val form = LayoutInflater.from(this).inflate(R.layout.form_stalker_portal, formContainer, false)
        formContainer.addView(form)
        
        // Update left panel
        updateLeftPanel(R.drawable.ic_add, "Stalker Portal", "Enter your Stalker Portal credentials")
        
        val inputServer = form.findViewById<EditText>(R.id.input_server)
        val inputMacAddress = form.findViewById<EditText>(R.id.input_mac_address)
        val inputUsername = form.findViewById<EditText>(R.id.input_username)
        val inputPassword = form.findViewById<EditText>(R.id.input_password)
        val checkboxTv = form.findViewById<CheckBox>(R.id.checkbox_tv_channels)
        val checkboxVod = form.findViewById<CheckBox>(R.id.checkbox_vod)
        val toggleTv = form.findViewById<LinearLayout>(R.id.toggle_tv_channels)
        val toggleVod = form.findViewById<LinearLayout>(R.id.toggle_vod)
        val btnConnect = form.findViewById<Button>(R.id.btn_connect)
        val btnBack = form.findViewById<Button>(R.id.btn_back)
        
        // Check for existing pending stalker provider (not connected yet) or create new one
        lifecycleScope.launch {
            val pendingProvider = withContext(Dispatchers.IO) {
                providerDao.getPendingStalkerProvider()
            }
            
            if (pendingProvider != null) {
                // Reuse existing pending provider
                currentProviderId = pendingProvider.id
                generatedMac = pendingProvider.macAddress ?: ""
                inputMacAddress.setText(generatedMac)
                // Pre-fill server if it was saved
                if (pendingProvider.serverUrl.isNotEmpty() && pendingProvider.serverUrl != "pending") {
                    inputServer.setText(pendingProvider.serverUrl)
                }
                Log.d(TAG, "Reusing pending stalker provider: ${pendingProvider.id}, MAC: $generatedMac")
            } else {
                // Create new provider with unique MAC
                val usedMacs = withContext(Dispatchers.IO) {
                    providerDao.getAllUsedMacAddresses()
                }
                
                // Generate a new MAC that's not already used
                var newMac = generateRandomMac()
                while (usedMacs.contains(newMac.uppercase())) {
                    newMac = generateRandomMac()
                }
                generatedMac = newMac
                
                // Create provider entry immediately to reserve this MAC
                val newProviderId = UUID.randomUUID().toString()
                val newProvider = ProviderEntity(
                    id = newProviderId,
                    type = PORTAL_TYPE_STALKER,
                    name = "New Stalker Portal",
                    serverUrl = "pending",
                    macAddress = generatedMac,
                    serialNumber = generatedSerial,
                    setupStep = SETUP_STEP_CONNECT,
                    isActive = false,
                    isConfigured = false
                )
                
                withContext(Dispatchers.IO) {
                    providerDao.insertProvider(newProvider)
                }
                
                currentProviderId = newProviderId
                inputMacAddress.setText(generatedMac)
                Log.d(TAG, "Created new stalker provider: $newProviderId, MAC: $generatedMac")
            }
        }
        
        // Set default checkbox states
        checkboxTv.isChecked = true
        checkboxVod.isChecked = true
        
        // Toggle checkboxes when row is clicked
        toggleTv.setOnClickListener {
            checkboxTv.isChecked = !checkboxTv.isChecked
        }
        toggleVod.setOnClickListener {
            checkboxVod.isChecked = !checkboxVod.isChecked
        }
        
        // Connect button - performs Stalker auth flow
        btnConnect.setOnClickListener {
            val server = inputServer.text.toString().trim()
            val macAddress = inputMacAddress.text.toString().trim().uppercase()
            val username = inputUsername.text.toString().trim()
            val password = inputPassword.text.toString().trim()
            
            if (server.isEmpty()) {
                Toast.makeText(this, "Please enter server address", Toast.LENGTH_SHORT).show()
                inputServer.requestFocus()
                return@setOnClickListener
            }
            
            if (macAddress.isEmpty()) {
                Toast.makeText(this, "Please enter MAC address", Toast.LENGTH_SHORT).show()
                inputMacAddress.requestFocus()
                return@setOnClickListener
            }
            
            // Validate MAC format
            if (!isValidMacAddress(macAddress)) {
                Toast.makeText(this, "Invalid MAC address format. Use XX:XX:XX:XX:XX:XX", Toast.LENGTH_SHORT).show()
                inputMacAddress.requestFocus()
                return@setOnClickListener
            }
            
            // Save MAC if user edited it
            generatedMac = macAddress
            getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_MAC_ADDRESS, macAddress)
                .apply()
            
            // Perform Stalker authentication
            performStalkerAuth(
                server = server,
                macAddress = macAddress,
                username = username,
                password = password,
                includeTv = checkboxTv.isChecked,
                includeVod = checkboxVod.isChecked,
                connectButton = btnConnect
            )
        }
        
        // Back button
        btnBack.setOnClickListener {
            showSelectTypeForm()
        }
        
        // Set focus on server input
        inputServer.requestFocus()
        
        Log.d(TAG, "Showing Stalker form")
    }
    
    private fun isValidMacAddress(mac: String): Boolean {
        val macPattern = Regex("^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$")
        return macPattern.matches(mac)
    }
    
    private fun performStalkerAuth(
        server: String,
        macAddress: String,
        username: String,
        password: String,
        includeTv: Boolean,
        includeVod: Boolean,
        connectButton: Button
    ) {
        // Disable button and show loading state
        connectButton.isEnabled = false
        connectButton.text = "Connecting..."
        
        lifecycleScope.launch {
            try {
                val authClient = StalkerAuthClient(server, macAddress, generatedSerial)
                
                // Step 1: Handshake to get token (also resolves redirects)
                val handshakeResult = authClient.performHandshake()
                
                // Get the resolved URL (after any redirects)
                val resolvedServer = handshakeResult.resolvedUrl ?: server
                if (resolvedServer != server) {
                    Log.d(TAG, "URL was redirected: $server -> $resolvedServer")
                }
                
                if (!handshakeResult.success) {
                    runOnUiThread {
                        Toast.makeText(this@PortalSetupActivity, handshakeResult.error ?: "Handshake failed", Toast.LENGTH_LONG).show()
                        connectButton.isEnabled = true
                        connectButton.text = "Connect"
                    }
                    return@launch
                }
                
                val token = handshakeResult.token ?: run {
                    runOnUiThread {
                        Toast.makeText(this@PortalSetupActivity, "No token received from server", Toast.LENGTH_LONG).show()
                        connectButton.isEnabled = true
                        connectButton.text = "Connect"
                    }
                    return@launch
                }
                
                Log.d(TAG, "Handshake successful, token received")
                
                // Step 2: Get profile to verify connection
                val profileResult = authClient.getProfile(token)
                
                if (!profileResult.success) {
                    runOnUiThread {
                        Toast.makeText(this@PortalSetupActivity, profileResult.error ?: "Failed to get profile", Toast.LENGTH_LONG).show()
                        connectButton.isEnabled = true
                        connectButton.text = "Connect"
                    }
                    return@launch
                }
                
                Log.d(TAG, "Profile retrieved successfully")
                
                // Save configuration with token and RESOLVED URL
                saveStalkerConfig(
                    server = resolvedServer,  // Use resolved URL after redirects
                    macAddress = macAddress,
                    username = username,
                    password = password,
                    token = token,
                    includeTv = includeTv,
                    includeVod = includeVod
                )
                
            } catch (e: Exception) {
                Log.e(TAG, "Stalker auth error", e)
                runOnUiThread {
                    Toast.makeText(this@PortalSetupActivity, "Connection error: ${e.message}", Toast.LENGTH_LONG).show()
                    connectButton.isEnabled = true
                    connectButton.text = "Connect"
                }
            }
        }
    }
    
    private fun updateLeftPanel(iconRes: Int, title: String, subtitle: String) {
        val icon = findViewById<ImageView>(R.id.panel_icon)
        val titleView = findViewById<TextView>(R.id.panel_title)
        val subtitleView = findViewById<TextView>(R.id.panel_subtitle)
        
        icon.setImageResource(iconRes)
        titleView.text = title
        subtitleView.text = subtitle
    }
    
    private fun saveM3uConfig(url: String) {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().apply {
            putString(KEY_PORTAL_TYPE, PORTAL_TYPE_M3U)
            putString(KEY_PORTAL_URL, url)
            putBoolean(KEY_IS_CONFIGURED, true)
            apply()
        }
        
        Log.d(TAG, "M3U config saved: $url")
        Toast.makeText(this, "M3U playlist configured!", Toast.LENGTH_SHORT).show()
        
        // Navigate to main app
        navigateToMain()
    }
    
    private fun saveXtreamConfig(server: String, username: String, password: String, includeTv: Boolean, includeVod: Boolean) {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().apply {
            putString(KEY_PORTAL_TYPE, PORTAL_TYPE_XTREAM)
            putString(KEY_SERVER, server)
            putString(KEY_USERNAME, username)
            putString(KEY_PASSWORD, password)
            putBoolean(KEY_INCLUDE_TV, includeTv)
            putBoolean(KEY_INCLUDE_VOD, includeVod)
            putBoolean(KEY_IS_CONFIGURED, true)
            apply()
        }
        
        Log.d(TAG, "Xtream config saved: $server")
        Toast.makeText(this, "Xtream Codes configured!", Toast.LENGTH_SHORT).show()
        
        // Navigate to main app
        navigateToMain()
    }
    
    private fun saveStalkerConfig(
        server: String,
        macAddress: String,
        username: String,
        password: String,
        token: String,
        includeTv: Boolean,
        includeVod: Boolean
    ) {
        lifecycleScope.launch {
            // Create provider entity
            val provider = ProviderEntity(
                id = UUID.randomUUID().toString(),
                name = "Stalker - ${server.substringAfter("://").substringBefore("/")}",
                type = PORTAL_TYPE_STALKER,
                serverUrl = server,
                macAddress = macAddress,
                serialNumber = generatedSerial,
                token = token,
                username = username.takeIf { it.isNotBlank() },
                password = password.takeIf { it.isNotBlank() },
                setupStep = SETUP_STEP_CATEGORIES, // Step 1 complete
                isActive = true,
                includeTv = includeTv,
                includeVod = includeVod
            )
            
            // Save to database
            withContext(Dispatchers.IO) {
                // Deactivate all other providers
                providerDao.deactivateAllProviders()
                // Insert new provider
                providerDao.insertProvider(provider)
            }
            
            currentProviderId = provider.id
            
            // Save to prefs for backwards compatibility
            val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().apply {
                putString(KEY_ACTIVE_PROVIDER_ID, provider.id)
                putString(KEY_PORTAL_TYPE, PORTAL_TYPE_STALKER)
                putString(KEY_SERVER, server)
                putString(KEY_USERNAME, username)
                putString(KEY_PASSWORD, password)
                putString(KEY_MAC_ADDRESS, macAddress)
                putString(KEY_SERIAL, generatedSerial)
                putString(KEY_STALKER_TOKEN, token)
                putBoolean(KEY_INCLUDE_TV, includeTv)
                putBoolean(KEY_INCLUDE_VOD, includeVod)
                putInt(KEY_SETUP_STEP, SETUP_STEP_CATEGORIES)
                putBoolean(KEY_HAS_PENDING_SETUP, true)
                putBoolean(KEY_IS_CONFIGURED, false)
                apply()
            }
            
            Log.d(TAG, "Stalker Step 1 complete: $server with MAC $macAddress, token: $token")
            
            runOnUiThread {
                Toast.makeText(this@PortalSetupActivity, "Connected! Step 1 of 3 complete.", Toast.LENGTH_SHORT).show()
                // Go to step 2 - category selection
                showCategorySelectionForm(provider)
            }
        }
    }
    
    private fun navigateToMain() {
        val intent = Intent(this, MainActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(intent)
        finish()
    }
    
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            // If editing from settings, allow back to return to settings
            if (isEditingFromSettings) {
                finish()
                return true
            }
            
            when (currentStep) {
                FormStep.SELECT_TYPE -> {
                    // Exit app
                    finish()
                    return true
                }
                FormStep.M3U_CONFIG, FormStep.XTREAM_CONFIG, FormStep.STALKER_CONFIG -> {
                    // Go back to select type
                    showSelectTypeForm()
                    return true
                }
                FormStep.CATEGORY_SELECTION -> {
                    // Can't go back from category selection (step 1 already complete)
                    Toast.makeText(this, "Please complete setup or cancel", Toast.LENGTH_SHORT).show()
                    return true
                }
                FormStep.ADULT_PASSWORD -> {
                    // Can't go back from adult password (step 2 already complete)
                    Toast.makeText(this, "Please complete setup or skip", Toast.LENGTH_SHORT).show()
                    return true
                }
            }
        }
        return super.onKeyDown(keyCode, event)
    }
}
