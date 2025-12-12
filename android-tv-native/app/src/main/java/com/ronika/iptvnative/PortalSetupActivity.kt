package com.ronika.iptvnative

import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.app.AlertDialog
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
import com.ronika.iptvnative.database.entities.ChannelEntity
import com.ronika.iptvnative.database.entities.ProviderEntity
import com.ronika.iptvnative.models.Movie
import com.ronika.iptvnative.sync.IPTVSyncService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import java.net.HttpURLConnection
import java.net.URL
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
        private const val REQUEST_CODE_CLOUD_AUTH = 1001
        
        // Portal types
        const val PORTAL_TYPE_M3U = "m3u"
        const val PORTAL_TYPE_XTREAM = "xtream"
        const val PORTAL_TYPE_STALKER = "stalker"
        
        // Setup steps for Stalker
        const val SETUP_STEP_CONNECT = 1      // Step 1: Connect to portal
        const val SETUP_STEP_CATEGORIES = 2   // Step 2: Select categories
        const val SETUP_STEP_ADULT_PASS = 3   // Step 3: Set adult password (if needed)
        const val SETUP_STEP_COMPLETE = 4     // All steps done
        
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
            // Check if any configured providers exist in database
            return try {
                val database = AppDatabase.getDatabase(context)
                val providerCount = runBlocking {
                    database.providerDao().getProviderCount()
                }
                providerCount > 0
            } catch (e: Exception) {
                // Fallback to SharedPreferences if database check fails
                val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                prefs.getBoolean(KEY_IS_CONFIGURED, false)
            }
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
        
        // Check if coming from cloud sync (after login)
        val fromCloudSync = intent.getBooleanExtra("from_cloud_sync", false)
        val cloudProviderId = intent.getStringExtra("provider_id")
        
        if (fromCloudSync && cloudProviderId != null) {
            // Direct to category selection for provider from cloud
            lifecycleScope.launch {
                val provider = withContext(Dispatchers.IO) {
                    providerDao.getProviderById(cloudProviderId)
                }
                
                if (provider != null) {
                    currentProviderId = provider.id
                    Log.d(TAG, "Cloud sync: Showing category selection for ${provider.name}")
                    showCategorySelectionForm(provider)
                } else {
                    Toast.makeText(this@PortalSetupActivity, "Provider not found", Toast.LENGTH_SHORT).show()
                    finish()
                }
            }
            return
        }
        
        // Check if coming from settings to edit categories
        val editCategories = intent.getBooleanExtra("edit_categories", false)
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
                // No pending provider - however, if we have configured providers with categories, go
                // straight to category selection (resume step 2) rather than showing type selection
                val configuredProviders = withContext(Dispatchers.IO) { providerDao.getConfiguredProviders() }
                val providerWithCategories = configuredProviders.firstOrNull { p ->
                    runBlocking { categoryDao.getCategoriesByProviderId(p.id).isNotEmpty() }
                }
                if (providerWithCategories != null) {
                    currentProviderId = providerWithCategories.id
                    Log.d(TAG, "Found configured provider with categories: ${providerWithCategories.name}, resuming category selection")
                    showCategorySelectionForm(providerWithCategories)
                    return@launch
                }
                // No providers with categories - start fresh from Step 1
                showSelectTypeForm()
            }
        }
        
        // Debug logging: print any extras so we can verify invocation from CloudAuth
        val fromCloudSyncExtra = intent.getBooleanExtra("from_cloud_sync", false)
        val providerIdExtra = intent.getStringExtra("provider_id")
        Log.d(TAG, "Portal setup activity initialized (from_cloud_sync=$fromCloudSyncExtra, provider_id=$providerIdExtra)")
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
                Log.d(TAG, "📡 Fetching Live TV genres from API...")
                val tvGenres = authClient.getGenres(provider.token ?: "")
                Log.d(TAG, "📺 API returned ${tvGenres.size} Live TV genres")
                
                // Apply existing state if editing, otherwise default to selected
                for (genre in tvGenres) {
                    if (isEditingFromSettings && existingStateMap.containsKey(genre.id)) {
                        genre.isSelected = existingStateMap[genre.id] ?: true
                    }
                    // Default isSelected is true from StalkerCategory
                }
                liveTvCategories.addAll(tvGenres)
                Log.d(TAG, "✅ Added ${tvGenres.size} Live TV genres to list")
                
                // Get VOD categories
                Log.d(TAG, "📡 Fetching VOD categories from API...")
                val vodCategories = authClient.getVodCategories(provider.token ?: "")
                Log.d(TAG, "🎬 API returned ${vodCategories.size} VOD categories")
                Log.d(TAG, "🔍 Starting is_series classification for ${vodCategories.size} categories...")
                
                // Classify each category by checking is_series field from API
                val token = provider.token ?: ""
                val classifiedCategories = coroutineScope {
                    vodCategories.map { category ->
                        async(Dispatchers.IO) {
                            // Apply existing state if editing
                            if (isEditingFromSettings && existingStateMap.containsKey(category.id)) {
                                category.isSelected = existingStateMap[category.id] ?: true
                            }
                            
                            // Check is_series from API with timeout
                            var isSeries = false
                            try {
                                isSeries = withTimeout(5000L) {
                                    authClient.isCategorySeries(token, category.id)
                                }
                                Log.d(TAG, "✓ Category '${category.title}': is_series=$isSeries")
                            } catch (e: Exception) {
                                Log.w(TAG, "✗ Category '${category.title}' check failed, defaulting to movie: ${e.message}")
                                isSeries = false
                            }
                            
                            category.isSeries = isSeries
                            category
                        }
                    }.awaitAll()
                }
                
                // Separate into movies and series
                Log.d(TAG, "📊 Classifying ${classifiedCategories.size} VOD categories...")
                for (category in classifiedCategories) {
                    if (category.isSeries) {
                        seriesCategories.add(category)
                    } else {
                        movieCategories.add(category)
                    }
                }
                
                Log.d(TAG, "✅ Classification complete: ${movieCategories.size} Movies, ${seriesCategories.size} Series")
                Log.d(TAG, "📊 TOTAL CATEGORIES: Live=${liveTvCategories.size}, Movies=${movieCategories.size}, Series=${seriesCategories.size}, GRAND TOTAL=${liveTvCategories.size + movieCategories.size + seriesCategories.size}")
                
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
                    btnNext.isFocusable = true
                    Log.d(TAG, "✅ Categories loaded, Next button enabled and focusable")
                    
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
            Log.d(TAG, "🔘 Next button clicked in category selection!")
            // Collect selected categories and save
            val selectedLive = liveTvCategories.filter { it.isSelected }.map { it.id }
            val selectedMovies = movieCategories.filter { it.isSelected }.map { it.id }
            val selectedSeries = seriesCategories.filter { it.isSelected }.map { it.id }
            
            Log.d(TAG, "Selected - Live: ${selectedLive.size}, Movies: ${selectedMovies.size}, Series: ${selectedSeries.size}")
            
            // Save selected categories to database
            Log.d(TAG, "💾 Starting category save process...")
            Log.d(TAG, "💾 Categories to save: Live=${liveTvCategories.size}, Movies=${movieCategories.size}, Series=${seriesCategories.size}")
            lifecycleScope.launch {
                withContext(Dispatchers.IO) {
                    // First, save ALL category data to CategoryEntity table
                    // This ensures categories are in DB when MainActivity loads
                    
                    // Clear existing categories for this provider
                    Log.d(TAG, "🗑️  Clearing existing categories for provider ${provider.id}")
                    categoryDao.deleteByProviderId(provider.id)
                    Log.d(TAG, "🗑️  Existing categories cleared")
                    
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
                    
                    // Check for duplicate externalIds
                    val liveExternalIds = liveTvEntities.map { it.externalId }
                    val liveDuplicates = liveExternalIds.groupingBy { it }.eachCount().filter { it.value > 1 }
                    if (liveDuplicates.isNotEmpty()) {
                        Log.w(TAG, "⚠️ Found ${liveDuplicates.size} duplicate externalIds in Live TV categories: $liveDuplicates")
                        val duplicateCategories = liveTvEntities.filter { liveDuplicates.containsKey(it.externalId) }
                        Log.w(TAG, "⚠️ Duplicate categories: ${duplicateCategories.map { "${it.name} (id=${it.externalId})" }}")
                    }
                    
                    Log.d(TAG, "💾 Inserting ${liveTvEntities.size} Live TV categories...")
                    categoryDao.insertAll(liveTvEntities)
                    val enabledLive = liveTvEntities.count { it.isEnabled }
                    Log.d(TAG, "✅ Saved ${liveTvEntities.size} Live TV categories to DB ($enabledLive enabled)")
                    
                    // Verify insert for THIS provider only
                    val verifyLive = categoryDao.getCategoriesByProviderAndType(provider.id, "LIVE").size
                    Log.d(TAG, "✔️  Verification: DB now has $verifyLive LIVE categories for provider ${provider.id}")
                    
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
                    Log.d(TAG, "💾 Inserting ${movieEntities.size} Movie categories...")
                    categoryDao.insertAll(movieEntities)
                    val enabledMovies = movieEntities.count { it.isEnabled }
                    Log.d(TAG, "✅ Saved ${movieEntities.size} Movie categories to DB ($enabledMovies enabled)")
                    
                    // Verify insert for THIS provider only
                    val verifyMovies = categoryDao.getCategoriesByProviderAndType(provider.id, "MOVIE").size
                    Log.d(TAG, "✔️  Verification: DB now has $verifyMovies MOVIE categories for provider ${provider.id}")
                    
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
                    Log.d(TAG, "💾 Inserting ${seriesEntities.size} Series categories...")
                    categoryDao.insertAll(seriesEntities)
                    val enabledSeries = seriesEntities.count { it.isEnabled }
                    Log.d(TAG, "✅ Saved ${seriesEntities.size} Series categories to DB ($enabledSeries enabled)")
                    
                    // Verify insert for THIS provider only
                    val verifySeries = categoryDao.getCategoriesByProviderAndType(provider.id, "SERIES").size
                    Log.d(TAG, "✔️  Verification: DB now has $verifySeries SERIES categories for provider ${provider.id}")
                    
                    // Final verification
                    val totalInDb = verifyLive + verifyMovies + verifySeries
                    val totalExpected = liveTvEntities.size + movieEntities.size + seriesEntities.size
                    Log.d(TAG, "")
                    Log.d(TAG, "╔═══════════════════════════════════════════╗")
                    Log.d(TAG, "║       CATEGORY SAVE SUMMARY              ║")
                    Log.d(TAG, "╠═══════════════════════════════════════════╣")
                    Log.d(TAG, "║ Live TV:  ${liveTvEntities.size.toString().padStart(3)} → DB: ${verifyLive.toString().padStart(3)} ($enabledLive enabled)    ║")
                    Log.d(TAG, "║ Movies:   ${movieEntities.size.toString().padStart(3)} → DB: ${verifyMovies.toString().padStart(3)} ($enabledMovies enabled)    ║")
                    Log.d(TAG, "║ Series:   ${seriesEntities.size.toString().padStart(3)} → DB: ${verifySeries.toString().padStart(3)} ($enabledSeries enabled)    ║")
                    Log.d(TAG, "║ ─────────────────────────────────────── ║")
                    Log.d(TAG, "║ TOTAL:    ${totalExpected.toString().padStart(3)} → DB: ${totalInDb.toString().padStart(3)}                ║")
                    Log.d(TAG, "╚═══════════════════════════════════════════╝")
                    Log.d(TAG, "")
                    
                    if (totalInDb != totalExpected) {
                        Log.e(TAG, "⚠️  WARNING: Category count mismatch! Expected $totalExpected but DB has $totalInDb")
                        Log.e(TAG, "⚠️  Missing: ${totalExpected - totalInDb} categories")
                    } else {
                        Log.d(TAG, "✅ All categories saved successfully!")
                    }
                    
                    // isEnabled flag is now stored in CategoryEntity, no need to store comma-separated IDs
                    providerDao.updateSetupStep(provider.id, SETUP_STEP_ADULT_PASS)
                    Log.d(TAG, "✅ Provider setup step updated to ADULT_PASS")
                    
                    // VOD content will be fetched later by MainActivity when user first accesses the app
                    Log.d(TAG, "📝 Categories saved. VOD content will be fetched when app starts.")
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
            
            // Check if this is the last item in the column
            val isLastItem = (index == categories.size - 1)
            
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
                        KeyEvent.KEYCODE_DPAD_DOWN -> {
                            // If last item in column, move to Select All button (first button)
                            if (isLastItem) {
                                val btnSelectAll = findViewById<Button>(R.id.btn_select_all)
                                btnSelectAll?.requestFocus()
                                Log.d(TAG, "📍 DOWN key from last category - moving to Select All button")
                                true
                            } else {
                                false // Allow default behavior
                            }
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
        
        // Setup cloud sync button
        val btnCloudSync = findViewById<Button>(R.id.btnCloudSync)
        btnCloudSync?.setOnClickListener {
            Log.d(TAG, "Cloud sync button clicked")
            val intent = Intent(this, CloudAuthActivity::class.java)
            intent.putExtra(CloudAuthActivity.EXTRA_IS_NEW_USER, false)
            intent.putExtra(CloudAuthActivity.EXTRA_UPLOAD_EXISTING, true)
            intent.putExtra("SHOW_SKIP_OPTION", false) // No skip when accessing from setup page
            startActivityForResult(intent, REQUEST_CODE_CLOUD_AUTH)
        }
        
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
                
                // Step 2: Get profile to verify connection and check for errors
                val profileResult = authClient.getProfile(token)
                
                if (!profileResult.success) {
                    val errorMessage = profileResult.error ?: "Failed to get profile"
                    Log.e(TAG, "Profile failed: $errorMessage")
                    runOnUiThread {
                        showErrorDialog("Connection Failed", errorMessage)
                        connectButton.isEnabled = true
                        connectButton.text = "Connect"
                    }
                    return@launch
                }
                
                // Check for specific errors in profile response
                val profile = profileResult.profile
                if (profile != null) {
                    val error = profile.optString("error", null)
                    val errorMessage = profile.optString("msg", null) ?: profile.optString("message", null)
                    
                    if (!error.isNullOrEmpty() || !errorMessage.isNullOrEmpty()) {
                        val fullError = buildString {
                            if (!error.isNullOrEmpty()) append(error)
                            if (!errorMessage.isNullOrEmpty()) {
                                if (isNotEmpty()) append(": ")
                                append(errorMessage)
                            }
                        }
                        Log.e(TAG, "Profile contains error: $fullError")
                        runOnUiThread {
                            showErrorDialog("Portal Error", fullError.ifEmpty { "Unknown error from portal" })
                            connectButton.isEnabled = true
                            connectButton.text = "Connect"
                        }
                        return@launch
                    }
                }
                
                Log.d(TAG, "Profile retrieved successfully - no errors detected")
                
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
        Log.d(TAG, "📥 Downloading M3U playlist from: $url")
        Toast.makeText(this, "Downloading playlist...", Toast.LENGTH_SHORT).show()
        
        lifecycleScope.launch {
            try {
                // Download M3U content
                val m3uContent = withContext(Dispatchers.IO) {
                    val connection = java.net.URL(url).openConnection() as java.net.HttpURLConnection
                    connection.connectTimeout = 15000
                    connection.readTimeout = 15000
                    connection.inputStream.bufferedReader().use { it.readText() }
                }
                
                Log.d(TAG, "✅ Downloaded ${m3uContent.length} bytes")
                
                // Parse M3U
                val channels = M3uParser.parse(m3uContent)
                
                if (channels.isEmpty()) {
                    runOnUiThread {
                        Toast.makeText(this@PortalSetupActivity, "No channels found in playlist", Toast.LENGTH_LONG).show()
                    }
                    return@launch
                }
                
                Log.d(TAG, "📺 Parsed ${channels.size} channels")
                
                // Create provider
                val provider = ProviderEntity(
                    id = UUID.randomUUID().toString(),
                    name = "M3U Playlist",
                    type = PORTAL_TYPE_M3U,
                    serverUrl = url,
                    setupStep = SETUP_STEP_CATEGORIES,
                    isActive = true,
                    includeTv = true,
                    includeVod = true
                )
                
                withContext(Dispatchers.IO) {
                    providerDao.insertProvider(provider)
                }
                
                currentProviderId = provider.id
                
                Log.d(TAG, "✅ Provider created: ${provider.id}")
                
                // Sync to cloud backend
                try {
                    val syncService = com.ronika.iptvnative.sync.IPTVSyncService(this@PortalSetupActivity)
                    syncService.syncProvider(provider)
                    Log.d(TAG, "☁️ M3U Provider synced to cloud")
                } catch (e: Exception) {
                    Log.e(TAG, "⚠️ Cloud sync failed (continuing anyway)", e)
                }
                
                // Process categories and channels
                showCategorySelectionFromM3u(provider, channels)
                
            } catch (e: Exception) {
                Log.e(TAG, "❌ Failed to download/parse M3U", e)
                runOnUiThread {
                    Toast.makeText(this@PortalSetupActivity, "Failed to load playlist: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
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
            
            // Sync to cloud backend
            try {
                val syncService = com.ronika.iptvnative.sync.IPTVSyncService(this@PortalSetupActivity)
                syncService.syncProvider(provider)
                Log.d(TAG, "☁️ Provider synced to cloud")
            } catch (e: Exception) {
                Log.e(TAG, "⚠️ Cloud sync failed (continuing anyway)", e)
            }
            
            runOnUiThread {
                Toast.makeText(this@PortalSetupActivity, "Connected! Step 1 of 3 complete.", Toast.LENGTH_SHORT).show()
                // Go to step 2 - category selection
                showCategorySelectionForm(provider)
            }
        }
    }
    
    private suspend fun showCategorySelectionFromM3u(provider: ProviderEntity, channels: List<M3uChannel>) {
        Log.d(TAG, "🎬 Converting M3U channels to categories for provider: ${provider.id}")
        
        // Classify channels
        val (liveChannels, movieChannels, seriesChannels) = M3uParser.classifyChannels(channels)
        
        // Group by category
        val liveGroups = M3uParser.groupByCategory(liveChannels)
        val movieGroups = M3uParser.groupByCategory(movieChannels)
        val seriesGroups = M3uParser.groupByCategory(seriesChannels)
        
        val liveCategories = mutableListOf<CategoryEntity>()
        val movieCategories = mutableListOf<CategoryEntity>()
        val seriesCategories = mutableListOf<CategoryEntity>()
        
        // Convert live channels to categories
        liveGroups.forEach { (groupName, channelList) ->
            liveCategories.add(
                CategoryEntity(
                    id = UUID.randomUUID().toString(),
                    externalId = groupName.hashCode().toString(),
                    name = groupName,
                    providerId = provider.id,
                    contentType = "live",
                    type = "LIVE",
                    censored = 0
                )
            )
        }
        
        // Convert movie channels to categories
        movieGroups.forEach { (groupName, channelList) ->
            movieCategories.add(
                CategoryEntity(
                    id = UUID.randomUUID().toString(),
                    externalId = groupName.hashCode().toString(),
                    name = groupName,
                    providerId = provider.id,
                    contentType = "movie",
                    type = "MOVIE",
                    censored = 0
                )
            )
        }
        
        // Convert series channels to categories
        seriesGroups.forEach { (groupName, channelList) ->
            seriesCategories.add(
                CategoryEntity(
                    id = UUID.randomUUID().toString(),
                    externalId = groupName.hashCode().toString(),
                    name = groupName,
                    providerId = provider.id,
                    contentType = "series",
                    type = "SERIES",
                    censored = 0
                )
            )
        }
        
        Log.d(TAG, "📊 Created categories: Live=${liveCategories.size}, Movies=${movieCategories.size}, Series=${seriesCategories.size}")
        
        // Save categories and channels to database
        withContext(Dispatchers.IO) {
            val categoryDao = database.categoryDao()
            val channelDao = database.channelDao()
            
            // Save and process live channels
            liveGroups.forEach { (groupName, channelList) ->
                val category = liveCategories.find { it.name == groupName } ?: return@forEach
                categoryDao.insert(category)
                
                channelList.forEachIndexed { index, channel ->
                    val channelEntity = ChannelEntity(
                        id = UUID.randomUUID().toString(),
                        externalId = channel.tvgId.ifEmpty { "${channel.name.hashCode()}_${index}" },
                        name = channel.name,
                        number = (index + 1).toString(),
                        categoryId = category.id,
                        categoryName = category.name,
                        cmd = channel.url,
                        logo = channel.tvgLogo.ifEmpty { null },
                        providerId = provider.id,
                        isActive = true
                    )
                    channelDao.insert(channelEntity)
                }
            }
            
            // Save and process movie channels
            movieGroups.forEach { (groupName, channelList) ->
                val category = movieCategories.find { it.name == groupName } ?: return@forEach
                categoryDao.insert(category)
                
                channelList.forEachIndexed { index, channel ->
                    val channelEntity = ChannelEntity(
                        id = UUID.randomUUID().toString(),
                        externalId = channel.tvgId.ifEmpty { "${channel.name.hashCode()}_${index}" },
                        name = channel.name,
                        number = (index + 1).toString(),
                        categoryId = category.id,
                        categoryName = category.name,
                        cmd = channel.url,
                        logo = channel.tvgLogo.ifEmpty { null },
                        providerId = provider.id,
                        isActive = true
                    )
                    channelDao.insert(channelEntity)
                }
            }
            
            // Save and process series channels
            seriesGroups.forEach { (groupName, channelList) ->
                val category = seriesCategories.find { it.name == groupName } ?: return@forEach
                categoryDao.insert(category)
                
                channelList.forEachIndexed { index, channel ->
                    val channelEntity = ChannelEntity(
                        id = UUID.randomUUID().toString(),
                        externalId = channel.tvgId.ifEmpty { "${channel.name.hashCode()}_${index}" },
                        name = channel.name,
                        number = (index + 1).toString(),
                        categoryId = category.id,
                        categoryName = category.name,
                        cmd = channel.url,
                        logo = channel.tvgLogo.ifEmpty { null },
                        providerId = provider.id,
                        isActive = true
                    )
                    channelDao.insert(channelEntity)
                }
            }
        }
        
        Log.d(TAG, "✅ Saved ${channels.size} channels to database")
        
        // Mark provider as configured and active
        withContext(Dispatchers.IO) {
            val updatedProvider = provider.copy(
                isConfigured = true,
                isActive = true,
                setupStep = 4 // Complete
            )
            providerDao.updateProvider(updatedProvider)
            Log.d(TAG, "✅ Provider marked as configured")
        }
        
        // M3U setup complete - navigate to main
        withContext(Dispatchers.Main) {
            Toast.makeText(this@PortalSetupActivity, "M3U playlist loaded successfully!", Toast.LENGTH_SHORT).show()
            navigateToMain()
        }
    }
    
    private fun showErrorDialog(title: String, message: String) {
        android.app.AlertDialog.Builder(this)
            .setTitle(title)
            .setMessage(message)
            .setPositiveButton("OK") { dialog, _ ->
                dialog.dismiss()
            }
            .setCancelable(true)
            .show()
    }
    
    private fun navigateToMain() {
        val intent = Intent(this, MainActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(intent)
        finish()
    }
    
    /**
     * Check if user is setting up first provider and show cloud auth option
     */
    private fun checkAndShowCloudAuthForNewUser() {
        lifecycleScope.launch {
            try {
                val providers = withContext(Dispatchers.IO) {
                    providerDao.getAllProvidersList()
                }
                
                val syncPrefs = getSharedPreferences("iptv_sync_prefs", MODE_PRIVATE)
                val cloudSyncConfigured = syncPrefs.getBoolean("cloud_sync_configured", false)
                
                // If no providers and cloud sync not configured, show option
                if (providers.isEmpty() && !cloudSyncConfigured) {
                    withContext(Dispatchers.Main) {
                        showCloudAuthOptionDialog()
                    }
                } else {
                    // Just show type selection
                    showSelectTypeForm()
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error checking cloud auth", e)
                showSelectTypeForm()
            }
        }
    }
    
    /**
     * Show dialog asking new user if they want to use cloud sync
     */
    private fun showCloudAuthOptionDialog() {
        AlertDialog.Builder(this)
            .setTitle("☁️ Cloud Sync")
            .setMessage("""
                Would you like to enable cloud sync?
                
                ✅ Benefits:
                • Access providers on multiple devices
                • Automatic backup of configuration
                • Settings synced everywhere
                
                You can set this up now or skip and enable it later.
            """.trimIndent())
            .setPositiveButton("Setup Cloud Sync") { dialog, _ ->
                dialog.dismiss()
                val intent = Intent(this@PortalSetupActivity, CloudAuthActivity::class.java)
                intent.putExtra(CloudAuthActivity.EXTRA_IS_NEW_USER, true)
                intent.putExtra(CloudAuthActivity.EXTRA_UPLOAD_EXISTING, false)
                startActivityForResult(intent, REQUEST_CODE_CLOUD_AUTH)
            }
            .setNegativeButton("Skip") { dialog, _ ->
                dialog.dismiss()
                val syncPrefs = getSharedPreferences("iptv_sync_prefs", MODE_PRIVATE)
                syncPrefs.edit().putBoolean("cloud_sync_configured", true).apply()
                showSelectTypeForm()
            }
            .setCancelable(false)
            .show()
    }
    
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        
        if (requestCode == REQUEST_CODE_CLOUD_AUTH) {
            val syncPrefs = getSharedPreferences("iptv_sync_prefs", MODE_PRIVATE)
            syncPrefs.edit().putBoolean("cloud_sync_configured", true).apply()
            
            if (resultCode == RESULT_OK) {
                // Cloud sync enabled, check if data was pulled
                lifecycleScope.launch {
                    val providers = withContext(Dispatchers.IO) {
                        providerDao.getAllProvidersList()
                    }
                    
                    if (providers.isNotEmpty()) {
                        // Data was restored from cloud, finish setup
                        Toast.makeText(
                            this@PortalSetupActivity,
                            "✅ Providers restored from cloud!",
                            Toast.LENGTH_LONG
                        ).show()
                        finish()
                    } else {
                        // No data in cloud, continue with setup
                        showSelectTypeForm()
                    }
                }
            } else {
                // User cancelled or error, continue with setup
                showSelectTypeForm()
            }
        }
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
