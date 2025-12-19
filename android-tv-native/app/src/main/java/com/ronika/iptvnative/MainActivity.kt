package com.ronika.iptvnative

import android.app.AlertDialog
import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.view.KeyEvent
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import com.ronika.iptvnative.api.StalkerClient
import com.ronika.iptvnative.components.MainSideNavComponent
import com.ronika.iptvnative.components.CategorySidebarComponent
import com.ronika.iptvnative.components.LiveTVChannelsComponent
import com.ronika.iptvnative.components.VODComponent
import com.ronika.iptvnative.components.VODPlayerComponent
import com.ronika.iptvnative.components.RefactoredSearchComponent
import com.ronika.iptvnative.components.PasswordDialogComponent
import com.ronika.iptvnative.components.SettingsComponent
import com.ronika.iptvnative.navigation.FocusNavigationHelper
import com.ronika.iptvnative.navigation.NavigationHistoryManager
import com.ronika.iptvnative.navigation.VODNavigationStack
import com.ronika.iptvnative.database.AppDatabase
import com.ronika.iptvnative.data.CategoryRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * MainActivity - Complete navigation flow coordinator
 * 
 * Navigation Flow:
 * 1. Start at MainSideNav (icons only, collapsed)
 * 2. Select Live TV/Movies/Series -> expands on focus
 * 3. DPAD Right -> CategorySidebar (focus first category)
 * 4. CategorySidebar: Up/Down to navigate categories
 * 5. DPAD Left or Back -> MainSideNav (focus on source: Live TV/Movies/Series)
 * 6. MainSideNav collapses when category sidebar has focus
 */
class MainActivity : ComponentActivity() {

    companion object {
        private const val REQUEST_CODE_MOVIE_DETAIL = 2001
    }

    private val TAG = "RefactoredMain"

    // Navigation helpers
    private lateinit var navigationHistory: NavigationHistoryManager
    private lateinit var focusHelper: FocusNavigationHelper
    private val vodNavStack = VODNavigationStack()  // New navigation stack for proper back handling
    
    // Components
    private lateinit var mainSideNav: MainSideNavComponent
    private lateinit var categorySidebar: CategorySidebarComponent
    private lateinit var liveTVChannels: LiveTVChannelsComponent
    private lateinit var vodComponent: VODComponent
    private lateinit var vodPlayer: VODPlayerComponent
    private lateinit var seriesDetail: com.ronika.iptvnative.components.SeriesDetailComponent
    private lateinit var searchComponent: RefactoredSearchComponent
    private lateinit var settingsComponent: SettingsComponent
    
    // Track current source section
    private var currentSourceSection = NavigationHistoryManager.SourceSection.LIVE_TV
    
    // Flag to prevent immediate navigation after returning from categories
    private var justReturnedFromCategories = false
    
    // Track if playing from series detail
    private var isPlayingFromSeries = false
    
    // Track movie details to return to
    private var lastMovieDetails: MovieDetails? = null
    
    data class MovieDetails(
        val id: String,
        val name: String,
        val posterUrl: String?,
        val description: String?,
        val actors: String?,
        val director: String?,
        val year: String?,
        val country: String?,
        val genres: String?,
        val cmd: String?
    )
    
    // Handler and runnable for managing focus enable delays
    private val mainHandler = android.os.Handler(android.os.Looper.getMainLooper())
    private var pendingEnableFocusRunnable: Runnable? = null
    
    // Track current episode for next episode functionality
    private var currentSeriesId: String? = null
    private var currentSeasonId: String? = null
    private var currentEpisodeId: String? = null
    
    // Track last played episode for focus restoration
    private var lastPlayedEpisodeId: String? = null
    
    // StalkerClient - initialized lazily from provider
    private var stalkerClient: StalkerClient? = null
    private val database by lazy { AppDatabase.getDatabase(this) }
    private val providerDao by lazy { database.providerDao() }
    
    private suspend fun initializeStalkerClient(): StalkerClient? {
        if (stalkerClient == null) {
            val provider = withContext(Dispatchers.IO) {
                providerDao.getActiveProvider()
            }
            if (provider != null) {
                stalkerClient = StalkerClient(
                    portalUrl = provider.serverUrl,
                    macAddress = provider.macAddress ?: "",
                    token = provider.token ?: "",
                    serialNumber = provider.serialNumber ?: ""
                )
                Log.d(TAG, "MainActivity: Initialized StalkerClient with provider: ${provider.name}")
            } else {
                Log.e(TAG, "MainActivity: No active provider found!")
            }
        }
        return stalkerClient
    }

    // Transcode backend helpers
    private fun getTranscodeBackendUrl(): String {
        val prefs = getSharedPreferences("iptv_prefs", MODE_PRIVATE)
        return prefs.getString("transcode_backend_url", "http://192.168.2.69:4000") ?: "http://192.168.2.69:4000"
    }

    private suspend fun checkTranscodeBackendHealth(backendUrl: String): Boolean = withContext(Dispatchers.IO) {
        try {
            val u = URL("${backendUrl.replace("/+$".toRegex(),"")}/health")
            val conn = u.openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.connectTimeout = 2000
            conn.readTimeout = 2000
            val code = try { conn.responseCode } catch (e: IOException) { -1 }
            conn.disconnect()
            return@withContext code == 200
        } catch (e: Exception) {
            return@withContext false
        }
    }

    private fun getDeviceTargetResolution(): String {
        // Return '2160' if device reports at least 3840x2160, otherwise '1080'
        return try {
            val metrics = resources.displayMetrics
            val w = metrics.widthPixels
            val h = metrics.heightPixels
            val max = Math.max(w, h)
            val min = Math.min(w, h)
            if (max >= 3840 && min >= 2160) "2160" else "1080"
        } catch (e: Exception) {
            "1080"
        }
    }

    private fun buildTranscodeEndpoint(originalUrl: String, mode: String = "downscale", target: String? = null): String {
        val backend = getTranscodeBackendUrl().replace("/+$".toRegex(), "")
        val encoded = try { URLEncoder.encode(originalUrl, "UTF-8") } catch (e: Exception) { originalUrl }
        val t = target ?: getDeviceTargetResolution()
        return "$backend/transcode?url=$encoded&target=$t&mode=$mode"
    }
    private var currentSeriesItem: VODComponent.VODItem? = null
    
    // Navigation stack for proper back button handling
    private enum class NavigationState {
        MAIN_SIDENAV,           // Main side navigation
        CATEGORY_SIDEBAR,       // Category sidebar
        SEARCH,                 // Search screen
        VOD_GRID,              // VOD thumbnail grid
        VOD_DETAIL,            // VOD detail screen (info page)
        SERIES_DETAIL,         // Series detail screen (info page)
        PLAYER                 // Fullscreen player
    }
    
    private val navigationStack = mutableListOf<NavigationState>()
    
    private fun pushNavigation(state: NavigationState) {
        // Prevent pushing the same state twice in a row
        val current = getCurrentNavigation()
        if (current == state) {
            Log.w(TAG, "Ignoring duplicate pushNavigation for $state, stack: $navigationStack")
            return
        }
        navigationStack.add(state)
        Log.d(TAG, "Navigation pushed: $state, stack: $navigationStack")
    }
    
    private fun popNavigation(): NavigationState? {
        if (navigationStack.size > 1) {
            val popped = navigationStack.removeAt(navigationStack.size - 1)
            Log.d(TAG, "Navigation popped: $popped, remaining: $navigationStack")
            return navigationStack.lastOrNull()
        }
        return null
    }
    
    private fun getCurrentNavigation(): NavigationState? = navigationStack.lastOrNull()
    
    private fun clearNavigationStack() {
        navigationStack.clear()
        navigationStack.add(NavigationState.MAIN_SIDENAV)
        Log.d(TAG, "Navigation stack cleared")
    }
    
    // Track where we came from for proper back navigation
    private enum class NavigationSource {
        CATEGORY,  // Came from category sidebar/VOD grid
        SEARCH     // Came from search
    }
    private var currentNavigationSource: NavigationSource = NavigationSource.CATEGORY
    
    // Flag to suppress tab listener during programmatic focus changes
    private var suppressTabListener = false
    
    /**
     * Schedule enableFocus with proper cancellation of previous pending calls
     */
    private fun scheduleEnableFocus(delayMs: Long = 150) {
        // Cancel any pending enableFocus call
        pendingEnableFocusRunnable?.let {
            mainHandler.removeCallbacks(it)
            Log.d(TAG, "Cancelled pending enableFocus")
        }
        
        // Schedule new enableFocus call
        pendingEnableFocusRunnable = Runnable {
            mainSideNav.enableFocus()
            suppressTabListener = false
            Log.d(TAG, "Main sidenav focus re-enabled (scheduled)")
            pendingEnableFocusRunnable = null
        }
        mainHandler.postDelayed(pendingEnableFocusRunnable!!, delayMs)
        Log.d(TAG, "Scheduled enableFocus in ${delayMs}ms")
    }
    
    /**
     * Cancel any pending enableFocus and immediately enable focus
     */
    private fun cancelAndEnableFocus() {
        pendingEnableFocusRunnable?.let {
            mainHandler.removeCallbacks(it)
            pendingEnableFocusRunnable = null
            Log.d(TAG, "Cancelled pending enableFocus")
        }
        mainSideNav.enableFocus()
        Log.d(TAG, "Main sidenav focus enabled immediately")
    }
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        
        // Set black background
        window.decorView.setBackgroundColor(android.graphics.Color.parseColor("#FF000000"))
        
        // Initialize navigation helpers
        navigationHistory = NavigationHistoryManager()
        focusHelper = FocusNavigationHelper()
        
        // Initialize VOD navigation stack with default section
        vodNavStack.initialize(VODNavigationStack.SectionType.MOVIES)
        
        // Initialize components
        initMainSideNav()
        initCategorySidebar()
        initLiveTVChannels()
        // Try to auto-open last-played channel (go to LiveTV and play)
        lifecycleScope.launch {
            try {
                // Request opening last-played channel in fullscreen
                mainHandler.post {
                    try {
                        liveTVChannels.openLastPlayedIfAvailable(autoFullscreen = true)
                    } catch (e: Exception) {
                        Log.w(TAG, "openLastPlayedIfAvailable failed: ${e.message}")
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Auto-open last-played channel error: ${e.message}")
            }
        }
        initVODComponent()
        initVODPlayer()
        initSeriesDetail()
        initSearchComponent()
        initSettingsComponent()
        
        // Don't auto-sync on app start - categories are saved during setup
        // User can manually sync via "Update Playlist" button in settings
        // syncVODCategories() // DISABLED - causes category count changes due to API variability
        
        // Sync with cloud on app load (bidirectional)
        // performInitialSync()
        
        // Check if user wants to enable cloud sync (for existing users)
        checkAndPromptCloudSync()
        
        // Initialize navigation stack
        navigationStack.add(NavigationState.MAIN_SIDENAV)
        
        // Set initial navigation state to main sidenav
        navigationHistory.navigateTo(
            NavigationHistoryManager.NavigationState(
                screen = NavigationHistoryManager.Screen.MAIN_SIDENAV,
                focusTarget = NavigationHistoryManager.FocusTarget.SideNavLiveTV,
                sourceSection = NavigationHistoryManager.SourceSection.LIVE_TV
            ),
            addToHistory = false
        )
        
        // Set initial focus on main sidenav after layout is complete
        mainSideNav.post {
            mainSideNav.requestFocusOnActiveTab()
            Log.d(TAG, "Initial focus set on MainSideNav")
        }
        
        Log.d(TAG, "Activity initialized with black bg and white text theme")
    }
    
    override fun onResume() {
        super.onResume()
        Log.d(TAG, "onResume: Refreshing categories from DB")
        // Refresh categories when returning from PortalSetupActivity (Manage Categories)
        // This ensures any changes to enabled/disabled categories are reflected
        if (::categorySidebar.isInitialized) {
            categorySidebar.refreshCategories()
        }
    }
    
    /**
     * Perform initial bidirectional sync on app load
     * 1. Pull from cloud (settings, passwords, etc.)
     * 2. Push local changes to cloud
     */
    private fun performInitialSync() {
        lifecycleScope.launch {
            try {
                val syncService = com.ronika.iptvnative.sync.IPTVSyncService(this@MainActivity)
                
                // Check if cloud sync is enabled and user is logged in
                if (!syncService.isLoggedIn()) {
                    Log.d(TAG, "⏭️ Skipping sync - user not logged in")
                    return@launch
                }
                
                val syncPrefs = getSharedPreferences("iptv_sync_prefs", MODE_PRIVATE)
                val cloudSyncEnabled = syncPrefs.getBoolean("cloud_sync_enabled", false)
                
                if (!cloudSyncEnabled) {
                    Log.d(TAG, "⏭️ Skipping sync - cloud sync disabled")
                    return@launch
                }
                
                Log.d(TAG, "🔄 Starting cloud pull sync (read-only)...")
                
                // Only pull from cloud on app load (download settings, passwords, etc.)
                // Do NOT push - that causes duplicates and should only happen on explicit "Update Playlist"
                Log.d(TAG, "⬇️ Pulling data from cloud...")
                syncService.syncFromCloud()
                
                // Also sync providers to get new ones added from other devices
                Log.d(TAG, "⬇️ Syncing providers from cloud...")
                val providersUpdated = syncService.syncProvidersFromBackend()
                
                if (providersUpdated) {
                    Log.d(TAG, "✅ Providers updated - refreshing UI...")
                    // Refresh UI on main thread
                    withContext(Dispatchers.Main) {
                        // Refresh settings component if initialized
                        if (::settingsComponent.isInitialized) {
                            settingsComponent.refresh()
                        }
                        // Refresh category sidebar
                        categorySidebar.refreshCategories()
                    }
                }
                
                Log.d(TAG, "✅ Cloud pull sync completed (no push to avoid duplicates)")
                
            } catch (e: Exception) {
                Log.e(TAG, "❌ Sync error (non-critical): ${e.message}", e)
            }
        }
    }
    
    /**
     * Check if user has providers and hasn't configured cloud sync yet
     * Show dialog to enable cloud sync
     */
    private fun checkAndPromptCloudSync() {
        lifecycleScope.launch {
            try {
                val syncPrefs = getSharedPreferences("iptv_sync_prefs", MODE_PRIVATE)
                val cloudSyncEnabled = syncPrefs.getBoolean("cloud_sync_enabled", false)
                val cloudSyncConfigured = syncPrefs.getBoolean("cloud_sync_configured", false)
                
                // Check if user is already logged in
                val syncService = com.ronika.iptvnative.sync.IPTVSyncService(this@MainActivity)
                val isLoggedIn = syncService.isLoggedIn()
                
                // Check if user has providers
                val database = com.ronika.iptvnative.database.AppDatabase.getDatabase(this@MainActivity)
                val providers = withContext(Dispatchers.IO) {
                    database.providerDao().getAllProvidersList()
                }
                
                // If user has providers but hasn't configured cloud sync yet AND is not logged in, show dialog
                if (providers.isNotEmpty() && !cloudSyncConfigured && !isLoggedIn) {
                    withContext(Dispatchers.Main) {
                        showCloudSyncDialog()
                    }
                }
                // Note: Auto-sync is now handled by performInitialSync()
            } catch (e: Exception) {
                Log.e(TAG, "Error checking cloud sync", e)
            }
        }
    }
    
    /**
     * Show dialog asking user if they want to enable cloud sync
     */
    private fun showCloudSyncDialog() {
        val dialog = CloudSyncDialog(this)
        dialog.showSimple(object : CloudSyncDialog.CloudSyncCallback {
            override fun onEnableCloudSync() {
                Log.d(TAG, "User wants to enable cloud sync")
                // Launch CloudAuthActivity to get credentials and upload data
                val intent = Intent(this@MainActivity, CloudAuthActivity::class.java)
                intent.putExtra(CloudAuthActivity.EXTRA_IS_NEW_USER, false)
                intent.putExtra(CloudAuthActivity.EXTRA_UPLOAD_EXISTING, true)
                startActivityForResult(intent, CloudSyncDialog.REQUEST_CODE_CLOUD_AUTH)
            }
            
            override fun onDeclineCloudSync() {
                Log.d(TAG, "User declined cloud sync")
                val syncPrefs = getSharedPreferences("iptv_sync_prefs", MODE_PRIVATE)
                syncPrefs.edit()
                    .putBoolean("cloud_sync_enabled", false)
                    .putBoolean("cloud_sync_configured", true)  // Mark as configured
                    .apply()
                
                Toast.makeText(
                    this@MainActivity,
                    "Cloud sync disabled. Data will be stored locally only.",
                    Toast.LENGTH_SHORT
                ).show()
            }
        })
    }
    
    /**
     * Sync providers to cloud (called when cloud sync is enabled)
     */
    private fun syncProvidersToCloud() {
        lifecycleScope.launch {
            try {
                Log.d(TAG, "☁️ Starting cloud sync for all providers...")
                val database = com.ronika.iptvnative.database.AppDatabase.getDatabase(this@MainActivity)
                val providers = withContext(Dispatchers.IO) {
                    database.providerDao().getAllProvidersList()
                }
                
                if (providers.isNotEmpty()) {
                    val syncService = com.ronika.iptvnative.sync.IPTVSyncService(this@MainActivity)
                    syncService.syncAllProviders(providers)
                    Log.d(TAG, "☁️ Cloud sync completed for ${providers.size} provider(s)")
                } else {
                    Log.d(TAG, "No providers to sync")
                }
            } catch (e: Exception) {
                Log.e(TAG, "⚠️ Cloud sync error (non-critical)", e)
            }
        }
    }
    
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        
        android.util.Log.e("MainActivity", "==========================================")
        android.util.Log.e("MainActivity", "onActivityResult called!")
        android.util.Log.e("MainActivity", "RequestCode: $requestCode, ResultCode: $resultCode")
        android.util.Log.e("MainActivity", "REQUEST_CODE_MOVIE_DETAIL: $REQUEST_CODE_MOVIE_DETAIL")
        android.util.Log.e("MainActivity", "RESULT_OK: $RESULT_OK")
        android.util.Log.e("MainActivity", "Data is null: ${data == null}")
        android.util.Log.e("MainActivity", "Condition check: ${requestCode == REQUEST_CODE_MOVIE_DETAIL} && ${resultCode == RESULT_OK}")
        android.util.Log.e("MainActivity", "==========================================")
        
        if (requestCode == CloudSyncDialog.REQUEST_CODE_CLOUD_AUTH && resultCode == RESULT_OK) {
            android.util.Log.e("MainActivity", "Cloud sync branch")
            // Cloud sync enabled successfully, start syncing
            syncProvidersToCloud()
        } else if (requestCode == REQUEST_CODE_MOVIE_DETAIL && resultCode == RESULT_OK) {
            android.util.Log.e("MainActivity", "Movie detail result received!")
            // MovieDetailActivity returned - play the movie
            data?.let {
                val action = it.getStringExtra("ACTION")
                android.util.Log.e("MainActivity", "Action: $action")
                
                if (action == "PLAY_MOVIE") {
                    val movieId = it.getStringExtra("MOVIE_ID") ?: return@let
                    val movieName = it.getStringExtra("MOVIE_NAME") ?: return@let
                    val posterUrl = it.getStringExtra("POSTER_URL")
                    val cmd = it.getStringExtra("CMD")
                    
                    android.util.Log.e("MainActivity", "Creating VODItem for: $movieName")
                    
                    // Hide VOD container immediately to prevent flickering before player starts
                    val vodContainer = findViewById<FrameLayout>(R.id.vodContainer)
                    vodContainer.visibility = android.view.View.GONE
                    
                    // Store movie details to return to after player
                    lastMovieDetails = MovieDetails(
                        id = movieId,
                        name = movieName,
                        posterUrl = posterUrl,
                        description = intent.getStringExtra("DESCRIPTION"),
                        actors = intent.getStringExtra("ACTORS"),
                        director = intent.getStringExtra("DIRECTOR"),
                        year = intent.getStringExtra("YEAR"),
                        country = intent.getStringExtra("COUNTRY"),
                        genres = intent.getStringExtra("GENRES"),
                        cmd = cmd
                    )
                    
                    // Create VODItem and play
                    val vodItem = VODComponent.VODItem(
                        id = movieId,
                        name = movieName,
                        posterUrl = posterUrl,
                        cmd = cmd,
                        year = null,
                        description = null,
                        backdropUrl = null,
                        director = null,
                        actors = null
                    )
                    
                    android.util.Log.e("MainActivity", "Calling playMovie with VODItem")
                    playMovie(vodItem)
                }
            }
        } else if (requestCode == REQUEST_CODE_MOVIE_DETAIL && resultCode == RESULT_CANCELED) {
            // User pressed back from MovieDetailActivity without playing - show VOD grid
            android.util.Log.e("MainActivity", "Back pressed from MovieDetailActivity - showing VOD grid")
            val vodContainer = findViewById<FrameLayout>(R.id.vodContainer)
            vodContainer.visibility = android.view.View.VISIBLE
        }
    }
    
    private fun syncVODCategories() {
        lifecycleScope.launch {
            try {
                Log.d(TAG, "Starting category sync for ALL providers on app load...")
                val repository = CategoryRepository(this@MainActivity)
                
                // Sync ALL providers' categories
                val result = repository.syncAllProviderCategories()
                
                if (result.isSuccess) {
                    Log.d(TAG, "All provider categories synced successfully")
                    // Refresh sidebar to show updated categories
                    if (::categorySidebar.isInitialized) {
                        categorySidebar.refreshCategories()
                    }
                } else {
                    Log.e(TAG, "Category sync failed", result.exceptionOrNull())
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error during category sync", e)
            }
        }
    }
    
    private fun initMainSideNav() {
        mainSideNav = MainSideNavComponent(this)
        val container = findViewById<FrameLayout>(R.id.sideNavContainer)
        container.addView(mainSideNav)
        
        // Tab selection: update categories and track source
        mainSideNav.setOnTabSelectedListener { tab ->
            // Check if we should suppress this tab selection
            if (suppressTabListener) {
                Log.d(TAG, "Tab listener suppressed for: $tab")
                return@setOnTabSelectedListener
            }
            Log.d(TAG, "Main nav tab selected: $tab")
            
            val liveTVContainer = findViewById<FrameLayout>(R.id.liveTVContainer)
            val vodContainer = findViewById<FrameLayout>(R.id.vodContainer)
            val searchContainer = findViewById<FrameLayout>(R.id.searchContainer)
            
            // Hide containers based on tab
            when (tab) {
                MainSideNavComponent.Tab.LIVE_TV -> {
                    // Reset VOD component to clear any previous content
                    vodComponent.resetToInitialState()
                    vodContainer.visibility = android.view.View.GONE
                    vodComponent.visibility = android.view.View.GONE
                    searchContainer.visibility = android.view.View.GONE
                    
                    // Hide settings
                    val settingsContainer = findViewById<FrameLayout>(R.id.settingsContainer)
                    settingsContainer.visibility = android.view.View.GONE
                    
                    // Show category sidebar
                    val categorySidebarContainer = findViewById<FrameLayout>(R.id.categorySidebarContainer)
                    categorySidebarContainer.visibility = android.view.View.VISIBLE
                    
                    // Reset navigation source when switching away from search
                    if (currentNavigationSource == NavigationSource.SEARCH) {
                        currentNavigationSource = NavigationSource.CATEGORY
                        Log.d(TAG, "Reset navigation source from SEARCH to CATEGORY")
                    }
                    
                    // Clear navigation stack for fresh start
                    clearNavigationStack()
                    
                    // Don't auto-show LiveTV - only show when category is clicked
                }
                MainSideNavComponent.Tab.MOVIES, MainSideNavComponent.Tab.SERIES -> {
                    Log.d(TAG, "Movies/Series tab selected, current navigationSource: $currentNavigationSource")
                    liveTVChannels.stopPreview()
                    liveTVContainer.visibility = android.view.View.GONE
                    searchContainer.visibility = android.view.View.GONE
                    
                    // Hide settings
                    val settingsContainer = findViewById<FrameLayout>(R.id.settingsContainer)
                    settingsContainer.visibility = android.view.View.GONE
                    
                    // Show category sidebar
                    val categorySidebarContainer = findViewById<FrameLayout>(R.id.categorySidebarContainer)
                    categorySidebarContainer.visibility = android.view.View.VISIBLE
                    
                    // Reset VOD component when switching tabs to clear any previous content (from search, etc.)
                    vodComponent.resetToInitialState()
                    vodContainer.visibility = android.view.View.GONE
                    vodComponent.visibility = android.view.View.GONE
                    
                    // ALWAYS reset navigation source to CATEGORY when clicking Movies/Series tab
                    Log.d(TAG, "Resetting navigation source from $currentNavigationSource to CATEGORY")
                    currentNavigationSource = NavigationSource.CATEGORY
                    
                    // Clear navigation stack for fresh start
                    clearNavigationStack()
                    
                    Log.d(TAG, "VOD component reset for tab switch: $tab, navigationSource now: $currentNavigationSource")
                    // Don't auto-show VOD - only show when category is clicked
                }
                MainSideNavComponent.Tab.SEARCH -> {
                    liveTVChannels.stopPreview()
                    liveTVContainer.visibility = android.view.View.GONE
                    
                    // Hide settings
                    val settingsContainer = findViewById<FrameLayout>(R.id.settingsContainer)
                    settingsContainer.visibility = android.view.View.GONE
                    
                    // Reset VOD component when switching to search (unless coming back from search detail)
                    if (currentNavigationSource != NavigationSource.SEARCH) {
                        vodComponent.resetToInitialState()
                        clearNavigationStack()
                    }
                    vodContainer.visibility = android.view.View.GONE
                    vodComponent.visibility = android.view.View.GONE
                    
                    // Hide category sidebar for search
                    val categorySidebarContainer = findViewById<FrameLayout>(R.id.categorySidebarContainer)
                    categorySidebarContainer.visibility = android.view.View.GONE
                    
                    // Show search on the right side taking full remaining space
                    val params = searchContainer.layoutParams as android.widget.LinearLayout.LayoutParams
                    params.weight = 1f
                    params.width = 0
                    searchContainer.layoutParams = params
                    searchContainer.visibility = android.view.View.VISIBLE
                    
                    // Only clear search if we're NOT coming from a search result detail view
                    // (i.e., don't clear when hiding movie/series detail to return to search)
                    if (currentNavigationSource != NavigationSource.SEARCH) {
                        searchComponent.clearSearch()
                        Log.d(TAG, "Search tab selected, clearing search (new search)")
                    } else {
                        Log.d(TAG, "Search tab selected, preserving search results (returning from detail)")
                    }
                }
                MainSideNavComponent.Tab.SETTINGS -> {
                    Log.d(TAG, "Settings tab selected")
                    liveTVChannels.stopPreview()
                    liveTVContainer.visibility = android.view.View.GONE
                    
                    // Reset and hide VOD
                    vodComponent.resetToInitialState()
                    vodContainer.visibility = android.view.View.GONE
                    vodComponent.visibility = android.view.View.GONE
                    
                    // Hide category sidebar for settings
                    val categorySidebarContainer = findViewById<FrameLayout>(R.id.categorySidebarContainer)
                    categorySidebarContainer.visibility = android.view.View.GONE
                    
                    // Hide search
                    searchContainer.visibility = android.view.View.GONE
                    
                    // Show settings container
                    val settingsContainer = findViewById<FrameLayout>(R.id.settingsContainer)
                    val params = settingsContainer.layoutParams as android.widget.LinearLayout.LayoutParams
                    params.weight = 1f
                    params.width = 0
                    settingsContainer.layoutParams = params
                    settingsContainer.visibility = android.view.View.VISIBLE
                    
                    // Refresh settings data
                    settingsComponent.refresh()
                    
                    // Clear navigation stack for fresh start
                    clearNavigationStack()
                }
            }
            
            Log.d(TAG, "Containers visibility updated for tab: $tab")
            
            // Update current source section
            currentSourceSection = when (tab) {
                MainSideNavComponent.Tab.LIVE_TV -> NavigationHistoryManager.SourceSection.LIVE_TV
                MainSideNavComponent.Tab.MOVIES -> NavigationHistoryManager.SourceSection.MOVIES
                MainSideNavComponent.Tab.SERIES -> NavigationHistoryManager.SourceSection.SERIES
                MainSideNavComponent.Tab.SEARCH -> NavigationHistoryManager.SourceSection.SEARCH
                MainSideNavComponent.Tab.SETTINGS -> NavigationHistoryManager.SourceSection.SETTINGS
            }
            
            // Switch category sidebar to show relevant categories
            val section = when (tab) {
                MainSideNavComponent.Tab.LIVE_TV -> CategorySidebarComponent.Section.LIVE_TV
                MainSideNavComponent.Tab.MOVIES -> CategorySidebarComponent.Section.MOVIES
                MainSideNavComponent.Tab.SERIES -> CategorySidebarComponent.Section.SERIES
                MainSideNavComponent.Tab.SEARCH -> CategorySidebarComponent.Section.SEARCH
                MainSideNavComponent.Tab.SETTINGS -> CategorySidebarComponent.Section.SEARCH // No categories for settings
            }
            categorySidebar.switchToSection(section)
        }
        
        // Navigate right: move focus to category sidebar or show search fullscreen
        mainSideNav.setOnNavigateRightListener {
            // Check if we just returned from categories - if so, ignore this call
            if (justReturnedFromCategories) {
                Log.d(TAG, "Ignoring navigation right - just returned from categories")
                justReturnedFromCategories = false
                return@setOnNavigateRightListener
            }
            
            // Check if already on category sidebar
            if (navigationHistory.isOnScreen(NavigationHistoryManager.Screen.CATEGORY_SIDEBAR)) {
                Log.d(TAG, "Ignoring navigation right - already on category sidebar")
                return@setOnNavigateRightListener
            }
            
            // If on search tab, move focus to search input
            if (mainSideNav.getActiveTab() == MainSideNavComponent.Tab.SEARCH) {
                Log.d(TAG, "Moving focus to search input")
                searchComponent.requestSearchFocus()
                return@setOnNavigateRightListener
            }
            
            // If on settings tab, move focus to settings content
            if (mainSideNav.getActiveTab() == MainSideNavComponent.Tab.SETTINGS) {
                Log.d(TAG, "Moving focus to settings content")
                // Ensure settings is visible
                val settingsContainer = findViewById<FrameLayout>(R.id.settingsContainer)
                if (settingsContainer.visibility == android.view.View.VISIBLE) {
                    settingsComponent.requestInitialFocus()
                } else {
                    Log.d(TAG, "Settings container not visible, cannot focus")
                }
                return@setOnNavigateRightListener
            }
            
            Log.d(TAG, "Navigating right to category sidebar from ${mainSideNav.getActiveTab()}")
            
            // Collapse main sidenav to icons only
            mainSideNav.collapse()
            
            // Make category sidebar visible BEFORE trying to focus it
            val categorySidebarContainer = findViewById<FrameLayout>(R.id.categorySidebarContainer)
            categorySidebarContainer.visibility = android.view.View.VISIBLE
            
            // If VOD has content and we're on Movies/Series, show the VOD grid
            val activeTab = mainSideNav.getActiveTab()
            val vodContainer = findViewById<FrameLayout>(R.id.vodContainer)
            if ((activeTab == MainSideNavComponent.Tab.MOVIES || activeTab == MainSideNavComponent.Tab.SERIES) 
                && vodComponent.hasContent()) {
                Log.d(TAG, "VOD has content, showing grid alongside category sidebar")
                
                // Show VOD container with 70% width
                val params = vodContainer.layoutParams as android.widget.LinearLayout.LayoutParams
                params.weight = 0.7f
                params.width = 0
                vodContainer.layoutParams = params
                vodContainer.visibility = android.view.View.VISIBLE
                vodComponent.visibility = android.view.View.VISIBLE
            }
            
            // Focus first category
            categorySidebar.focusFirstCategory()
            
            // Track navigation state in BOTH systems
            pushNavigation(NavigationState.CATEGORY_SIDEBAR)  // Push to simple navigation stack
            
            navigationHistory.navigateTo(
                NavigationHistoryManager.NavigationState(
                    screen = NavigationHistoryManager.Screen.CATEGORY_SIDEBAR,
                    focusTarget = NavigationHistoryManager.FocusTarget.CategoryItem(0),
                    sourceSection = currentSourceSection
                )
            )
            Log.d(TAG, "Navigation history updated, current screen: CATEGORY_SIDEBAR, stack: $navigationStack, history size: ${navigationHistory.getHistorySize()}")
        }
        
        // Expand state changed
        mainSideNav.setOnExpandStateChangedListener { expanded ->
            Log.d(TAG, "MainSideNav expanded: $expanded")
        }
    }
    
    private fun initCategorySidebar() {
        categorySidebar = CategorySidebarComponent(this)
        val container = findViewById<FrameLayout>(R.id.categorySidebarContainer)
        container.addView(categorySidebar)
        
        // Initialize with Live TV categories
        categorySidebar.switchToSection(CategorySidebarComponent.Section.LIVE_TV)
        
        // Set callback for navigation back to main sidenav
        categorySidebar.setOnNavigateBackListener {
            Log.d(TAG, "Navigating back to main sidenav from categories, source: $currentSourceSection")
            
            // Set flag to prevent immediate re-navigation
            justReturnedFromCategories = true
            
            // Cancel any pending enableFocus and immediately enable focus
            cancelAndEnableFocus()
            
            // Return focus to main sidenav on the source item
            val tab = when (currentSourceSection) {
                NavigationHistoryManager.SourceSection.LIVE_TV -> MainSideNavComponent.Tab.LIVE_TV
                NavigationHistoryManager.SourceSection.MOVIES -> MainSideNavComponent.Tab.MOVIES
                NavigationHistoryManager.SourceSection.SERIES -> MainSideNavComponent.Tab.SERIES
                NavigationHistoryManager.SourceSection.SEARCH -> MainSideNavComponent.Tab.SEARCH
                else -> MainSideNavComponent.Tab.LIVE_TV
            }
            
            Log.d(TAG, "Returning focus to tab: $tab")
            
            // Expand main sidenav
            mainSideNav.expand()
            
            // Set active tab WITHOUT notifying (prevents switching categories)
            mainSideNav.setActiveTab(tab, notify = false)
            // Request focus which will trigger focus listener and update currentSourceSection
            mainSideNav.requestFocusOnActiveTab()
            
            // Track navigation back
            navigationHistory.navigateBack()
            
            // Clear the flag after a short delay to allow normal navigation
            mainSideNav.postDelayed({
                justReturnedFromCategories = false
                Log.d(TAG, "Cleared justReturnedFromCategories flag")
            }, 300)
        }
        
        // Don't add key listener - let back button be handled by Activity
    }
    
    private fun initLiveTVChannels() {
        liveTVChannels = LiveTVChannelsComponent(this)
        val container = findViewById<FrameLayout>(R.id.liveTVContainer)
        container.addView(liveTVChannels)
        
        // Set back callback to minimize to sidebar view
        liveTVChannels.setOnBackPressedListener { categoryName ->
            Log.d(TAG, "Back pressed in LiveTV channels, minimizing to sidebar view, category: $categoryName")
            
            // Show sidebar components
            val sideNavContainer = findViewById<FrameLayout>(R.id.sideNavContainer)
            val categorySidebarContainer = findViewById<FrameLayout>(R.id.categorySidebarContainer)
            
            sideNavContainer.visibility = android.view.View.VISIBLE
            categorySidebarContainer.visibility = android.view.View.VISIBLE
            
            // Resize LiveTV container to share space with sidebars (not fullscreen)
            val liveTVContainer = findViewById<FrameLayout>(R.id.liveTVContainer)
            val params = liveTVContainer.layoutParams as android.widget.LinearLayout.LayoutParams
            params.weight = 0.7f  // Take 70% of space, leave 30% for sidebars
            params.width = 0
            liveTVContainer.layoutParams = params
            liveTVContainer.visibility = android.view.View.VISIBLE
            
            // Keep LiveTV visible but in small mode
            liveTVChannels.setFullscreen(false)
            
            // Return focus to the category we were watching
            categorySidebar.focusCategory(categoryName)
            
            Log.d(TAG, "LiveTV minimized, focus returned to category: $categoryName")
        }
    }
    
    private fun initVODComponent() {
        vodComponent = VODComponent(this)
        val container = findViewById<FrameLayout>(R.id.vodContainer)
        container.addView(vodComponent)

        // Update navigation stack when VOD detail is shown/hidden inside the component
        vodComponent.setOnDetailShownListener { _ ->
            pushNavigation(NavigationState.VOD_DETAIL)
        }
        vodComponent.setOnDetailHiddenListener {
            popNavigation()
        }
        
        // Set back callback to return to source (category or search)
        vodComponent.setOnBackPressedListener { categoryName ->
            val currentState = getCurrentNavigation()
            Log.d(TAG, "Back pressed in VOD, current state: $currentState, category: $categoryName, navigationSource: $currentNavigationSource")
            
            // Check where we're coming back FROM (before popping)
            val stateWeAreIn = currentState
            
            // Pop current state
            val previousState = popNavigation()
            Log.d(TAG, "Popped state, was in: $stateWeAreIn, now at: $previousState")
            
            when (previousState) {
                NavigationState.SEARCH -> {
                    // Return to search (came from search flow)
                    Log.d(TAG, "Returning to search from VOD")
                    hideVODAndShowSearch()
                }
                NavigationState.VOD_GRID -> {
                    // Return to VOD grid (thumbnail view) from detail
                    Log.d(TAG, "Returning to VOD grid from detail")
                    
                    // Suppress tab listener
                    suppressTabListener = true
                    
                    // Show sidebar components but disable main sidenav focus
                    val sideNavContainer = findViewById<FrameLayout>(R.id.sideNavContainer)
                    val categorySidebarContainer = findViewById<FrameLayout>(R.id.categorySidebarContainer)
                    
                    // Disable focus on main sidenav buttons to prevent focus stealing
                    mainSideNav.disableFocus()
                    mainSideNav.collapse()
                    
                    sideNavContainer.visibility = android.view.View.VISIBLE
                    categorySidebarContainer.visibility = android.view.View.VISIBLE
                    
                    // Resize VOD container to share space with sidebars
                    val vodContainer = findViewById<FrameLayout>(R.id.vodContainer)
                    val params = vodContainer.layoutParams as android.widget.LinearLayout.LayoutParams
                    params.weight = 0.7f
                    params.width = 0
                    vodContainer.layoutParams = params
                    vodContainer.visibility = android.view.View.VISIBLE
                    
                    vodComponent.setFullscreen(false)
                    
                    // Return focus to the category
                    categorySidebar.focusCategory(categoryName)
                    
                    // Re-enable main sidenav focus after settling
                    scheduleEnableFocus(150)
                    
                    Log.d(TAG, "VOD minimized, focus returned to category: $categoryName")
                }
                NavigationState.CATEGORY_SIDEBAR -> {
                    // Return to category sidebar from VOD grid
                    Log.d(TAG, "Returning to category sidebar from VOD grid")
                    
                    // Suppress tab listener FIRST, before any visibility/focus changes
                    suppressTabListener = true
                    Log.d(TAG, "Tab listener suppressed")
                    
                    // Show BOTH sidebars but disable focus on main sidenav to prevent focus stealing
                    val sideNavContainer = findViewById<FrameLayout>(R.id.sideNavContainer)
                    val categorySidebarContainer = findViewById<FrameLayout>(R.id.categorySidebarContainer)
                    
                    // Disable focus on main sidenav buttons BEFORE making visible
                    mainSideNav.disableFocus()
                    mainSideNav.collapse()
                    
                    sideNavContainer.visibility = android.view.View.VISIBLE
                    categorySidebarContainer.visibility = android.view.View.VISIBLE
                    
                    // Keep VOD visible but resize to 70% to share space with sidebars
                    val vodContainer = findViewById<FrameLayout>(R.id.vodContainer)
                    val params = vodContainer.layoutParams as android.widget.LinearLayout.LayoutParams
                    params.weight = 0.7f
                    params.width = 0
                    vodContainer.layoutParams = params
                    vodContainer.visibility = android.view.View.VISIBLE
                    
                    vodComponent.setFullscreen(false)
                    
                    // Request focus on category sidebar IMMEDIATELY, not in post
                    categorySidebar.focusCategory(categoryName)
                    Log.d(TAG, "Focus set to category: $categoryName, VOD grid still visible at 70% width")
                    
                    // Re-enable main sidenav focus and tab listener after everything is settled
                    scheduleEnableFocus(150)
                    
                    Log.d(TAG, "Sidebars shown with VOD grid visible")
                }
                NavigationState.MAIN_SIDENAV -> {
                    // Backing from VOD grid to main navigation
                    // Check navigation source to determine correct destination
                    if (currentNavigationSource == NavigationSource.SEARCH) {
                        Log.d(TAG, "Backing from VOD grid (search source) to search")
                        hideVODAndShowSearch()
                    } else {
                        Log.d(TAG, "Backing from VOD grid (category source) to category sidebar")
                        
                        // Suppress tab listener FIRST, before any visibility/focus changes
                        suppressTabListener = true
                        Log.d(TAG, "Tab listener suppressed")
                        
                        // Show BOTH sidebars but disable focus on main sidenav to prevent focus stealing
                        val sideNavContainer = findViewById<FrameLayout>(R.id.sideNavContainer)
                        val categorySidebarContainer = findViewById<FrameLayout>(R.id.categorySidebarContainer)
                        
                        // Disable focus on main sidenav buttons BEFORE making visible
                        mainSideNav.disableFocus()
                        mainSideNav.collapse()
                        
                        sideNavContainer.visibility = android.view.View.VISIBLE
                        categorySidebarContainer.visibility = android.view.View.VISIBLE
                        
                        // Keep VOD visible but resize to 70% to share space with sidebars
                        val vodContainer = findViewById<FrameLayout>(R.id.vodContainer)
                        val params = vodContainer.layoutParams as android.widget.LinearLayout.LayoutParams
                        params.weight = 0.7f
                        params.width = 0
                        vodContainer.layoutParams = params
                        vodContainer.visibility = android.view.View.VISIBLE
                        
                        vodComponent.setFullscreen(false)
                        
                        // Request focus on category sidebar IMMEDIATELY
                        categorySidebar.focusCategory(categoryName)
                        Log.d(TAG, "Focus set to category: $categoryName, VOD grid still visible at 70% width")
                        
                        // Re-enable main sidenav focus and tab listener after everything is settled
                        scheduleEnableFocus(150)
                        
                        Log.d(TAG, "Sidebars shown with VOD grid visible")
                    }
                }
                else -> {
                    Log.w(TAG, "Unexpected navigation state: $previousState")
                }
            }
        }
        
        // Set play movie callback
        vodComponent.setOnPlayMovieListener { vodItem ->
            Log.d(TAG, "Playing movie: ${vodItem.name} (ID: ${vodItem.id}, CMD: ${vodItem.cmd})")
            playMovie(vodItem)
        }
        
        // Set series selection callback
        vodComponent.setOnSeriesSelectedListener { seriesItem ->
            Log.d(TAG, "Series selected: ${seriesItem.name} (ID: ${seriesItem.id})")
            showSeriesDetail(seriesItem)
        }
    }
    
    private fun initSeriesDetail() {
        seriesDetail = com.ronika.iptvnative.components.SeriesDetailComponent(this)
        val container = findViewById<FrameLayout>(R.id.seriesDetailContainer)
        container.addView(seriesDetail)
        
        // Set back callback
        seriesDetail.setOnBackPressedListener {
            val currentState = getCurrentNavigation()
            Log.d(TAG, "Back pressed in series detail, current state: $currentState")
            
            // Pop current state
            val previousState = popNavigation()
            
            when (previousState) {
                NavigationState.SEARCH -> {
                    // Return to search
                    Log.d(TAG, "Returning to search from series detail")
                    hideSeriesDetailAndShowSearch()
                }
                NavigationState.VOD_GRID -> {
                    // Return to VOD grid
                    Log.d(TAG, "Returning to VOD grid from series detail")
                    hideSeriesDetail()
                }
                else -> {
                    Log.w(TAG, "Unexpected navigation state: $previousState")
                }
            }
        }
        
        // Set play episode callback
        seriesDetail.setOnPlayEpisodeListener { seriesId, seasonId, episodeId, seasonNum, episodeNum, episodeName ->
            Log.d(TAG, "Playing episode: S${seasonNum}E${episodeNum} - $episodeName")
            playSeriesEpisode(seriesId, seasonId, episodeId, seasonNum, episodeNum, episodeName)
        }
    }
    
    private fun showSeriesDetail(seriesItem: com.ronika.iptvnative.components.VODComponent.VODItem) {
        Log.d(TAG, "Showing series detail for: ${seriesItem.name}")
        
        // Log current navigation state before pushing
        val beforeState = getCurrentNavigation()
        Log.d(TAG, "Navigation state before showing series detail: $beforeState")
        
        // Store series info for later use in playback
        currentSeriesItem = seriesItem
        
        // Push SERIES_DETAIL state to navigation stack
        pushNavigation(NavigationState.SERIES_DETAIL)
        Log.d(TAG, "Pushed SERIES_DETAIL to navigation stack")
        
        // Hide VOD container
        val vodContainer = findViewById<FrameLayout>(R.id.vodContainer)
        vodContainer.visibility = android.view.View.GONE
        
        // Show series detail container
        val seriesContainer = findViewById<FrameLayout>(R.id.seriesDetailContainer)
        seriesContainer.visibility = android.view.View.VISIBLE
        
        // Get category name from VOD component
        val categoryName = currentSourceSection.name.replace("_", " ")
        
        // Initialize SeriesDetail with the same provider that VODComponent is using
        val providerId = vodComponent.getCurrentProviderId()
        if (providerId != null) {
            seriesDetail.initializeWithProvider(providerId)
            Log.d(TAG, "Initialized series detail with provider: $providerId")
        } else {
            Log.w(TAG, "No provider ID from VODComponent, using default")
        }
        
        // Show series with data
        seriesDetail.showSeries(
            id = seriesItem.id,
            name = seriesItem.name,
            year = seriesItem.year,
            description = seriesItem.description,
            posterUrl = seriesItem.posterUrl,
            director = seriesItem.director,
            actors = seriesItem.actors,
            categoryName = categoryName
        )
    }
    
    private fun hideSeriesDetail() {
        Log.d(TAG, "Hiding series detail, returning to VOD grid fullscreen")
        
        // Hide series detail container
        val seriesContainer = findViewById<FrameLayout>(R.id.seriesDetailContainer)
        seriesContainer.visibility = android.view.View.GONE
        
        // Hide sidebar components to show VOD fullscreen
        val sideNavContainer = findViewById<FrameLayout>(R.id.sideNavContainer)
        val categorySidebarContainer = findViewById<FrameLayout>(R.id.categorySidebarContainer)
        
        sideNavContainer.visibility = android.view.View.GONE
        categorySidebarContainer.visibility = android.view.View.GONE
        
        // Make VOD container fullscreen
        val vodContainer = findViewById<FrameLayout>(R.id.vodContainer)
        val params = vodContainer.layoutParams as android.widget.LinearLayout.LayoutParams
        params.weight = 1f
        params.width = 0
        vodContainer.layoutParams = params
        vodContainer.visibility = android.view.View.VISIBLE
        
        vodComponent.setFullscreen(false)
        
        // Focus the VOD grid
        vodContainer.post {
            vodComponent.requestFocus()
        }
        
        Log.d(TAG, "Series detail hidden, showing VOD grid fullscreen")
    }
    
    private fun playSeriesEpisode(
        seriesId: String,
        seasonId: String,
        episodeId: String,
        seasonNum: String,
        episodeNum: String,
        episodeName: String
    ) {
        Log.d(TAG, "🎬 ===== STARTING EPISODE PLAYBACK =====")
        Log.d(TAG, "🎬 Series ID: $seriesId, Season: $seasonNum, Episode: $episodeNum")
        Log.d(TAG, "🎬 Episode Name: $episodeName")
        
        lifecycleScope.launch {
            try {
                // IMPORTANT: Use StalkerClient from SeriesDetailComponent to ensure we use the same provider
                // that loaded the series data. This prevents cross-provider issues.
                val client = seriesDetail.getStalkerClient() ?: initializeStalkerClient()
                if (client == null) {
                    Log.e(TAG, "🎬 Failed to get StalkerClient!")
                    return@launch
                }
                Log.d(TAG, "🎬 Using StalkerClient from SeriesDetailComponent")
                
                // Get episode file info
                Log.d(TAG, "🎬 Step 1: Getting episode file info...")
                val episodeInfo = client.getEpisodeFileInfo(seriesId, seasonId, episodeId)
                
                if (episodeInfo != null) {
                    val fileId = episodeInfo["id"]?.toString()
                    Log.d(TAG, "🎬 Episode file ID: $fileId")
                    
                    if (fileId != null) {
                        // Construct cmd
                        val vodCmd = "/media/file_$fileId.mpg"
                        Log.d(TAG, "🎬 Constructed VOD CMD: $vodCmd")
                        
                        // Get tokenized stream URL with series parameter for episode
                        Log.d(TAG, "🎬 Step 2: Getting tokenized stream URL with series=$episodeNum...")
                        val response = client.getVodStreamUrl(vodCmd, "vod", series = episodeNum)
                        
                        Log.d(TAG, "🎬 Stream URL obtained: ${response.url}")
                        
                        // Hide series detail and show player
                        val seriesContainer = findViewById<FrameLayout>(R.id.seriesDetailContainer)
                        seriesContainer.visibility = android.view.View.GONE
                        
                        // Push PLAYER state to navigation stack
                        pushNavigation(NavigationState.PLAYER)
                        
                        val playerContainer = findViewById<FrameLayout>(R.id.vodPlayerContainer)
                        playerContainer.visibility = android.view.View.VISIBLE
                        
                        val title = "S${seasonNum}E${episodeNum} - $episodeName"
                        isPlayingFromSeries = true
                        
                        // Track current episode
                        currentSeriesId = seriesId
                        currentSeasonId = seasonId
                        currentEpisodeId = episodeId
                        lastPlayedEpisodeId = episodeId  // Store for focus restoration
                        
                        // Check for saved progress for this specific episode
                        val repository = com.ronika.iptvnative.repository.WatchProgressRepository(applicationContext)
                        val compositeKey = "${seasonId}_${episodeId}"  // Match the composite key format
                        val progress = repository.getEpisodeProgress(seriesId, compositeKey, vodComponent.getCurrentProviderId() ?: "")
                        val startPosition = progress?.currentPosition ?: 0L
                        
                        // Play series FIRST
                        vodPlayer.playSeries(response.url, title, hasNext = true, startPosition = startPosition)
                        
                        // THEN set series metadata AFTER playSeries so it doesn't get cleared
                        // Get series info from SeriesDetailComponent
                        val currentSeriesName = seriesDetail.getCurrentSeriesName()
                        val currentPosterUrl = seriesDetail.getCurrentPosterUrl()
                        
                        Log.d(TAG, "🎬 DEBUG: Got series name from SeriesDetail: $currentSeriesName")
                        
                        if (currentSeriesName.isNotEmpty()) {
                            vodPlayer.setSeriesTitle(currentSeriesName)
                            Log.d(TAG, "🎬 Set series title for subtitle search: $currentSeriesName")
                        } else {
                            Log.e(TAG, "🎬 ERROR: Series name is empty!")
                        }
                        
                        // Set content info for progress tracking AFTER playSeries
                        if (currentSeriesName.isNotEmpty()) {
                            vodPlayer.setContentInfo(
                                contentId = seriesId,
                                contentType = "SERIES",
                                posterUrl = currentPosterUrl,
                                cmd = vodCmd,
                                providerId = vodComponent.getCurrentProviderId() ?: "",
                                episodeId = episodeId,
                                seasonId = seasonId,  // Pass seasonId for progress tracking
                                seasonNumber = seasonNum.toIntOrNull(),
                                episodeNumber = episodeNum.toIntOrNull()
                            )
                            Log.d(TAG, "🎬 Set content info after playSeries - seriesId: $seriesId, type: SERIES, name: $currentSeriesName")
                        } else {
                            Log.e(TAG, "🎬 ERROR: Cannot set content info - series name is empty!")
                        }
                        
                        Log.d(TAG, "🎬 Episode playback started successfully, stack: $navigationStack")
                    } else {
                        Log.e(TAG, "🎬 Failed: No file ID in episode info")
                    }
                } else {
                    Log.e(TAG, "🎬 Failed: No episode file info returned")
                }
                
            } catch (e: Exception) {
                Log.e(TAG, "🎬 Error playing episode: ${e.message}", e)
                android.widget.Toast.makeText(
                    this@MainActivity,
                    "Failed to play episode",
                    android.widget.Toast.LENGTH_SHORT
                ).show()
            }
        }
    }
    
    private fun initVODPlayer() {
        vodPlayer = VODPlayerComponent(this)
        val container = findViewById<FrameLayout>(R.id.vodPlayerContainer)
        container.addView(vodPlayer)
        
        // Set back callback to return to appropriate detail/info screen based on content type
        vodPlayer.setOnBackPressedListener {
            val currentState = getCurrentNavigation()
            val contentType = vodPlayer.getCurrentContentType()
            Log.d(TAG, "Back pressed in player, current state: $currentState, contentType: $contentType")
            
            // Pop player state
            popNavigation()
            
            Log.d(TAG, "Hiding player")
            hidePlayer()
            
            // Hide all other components first
            val sideNavContainer = findViewById<FrameLayout>(R.id.sideNavContainer)
            val categorySidebarContainer = findViewById<FrameLayout>(R.id.categorySidebarContainer)
            val vodContainer = findViewById<FrameLayout>(R.id.vodContainer)
            val seriesContainer = findViewById<FrameLayout>(R.id.seriesDetailContainer)
            
            sideNavContainer.visibility = android.view.View.GONE
            categorySidebarContainer.visibility = android.view.View.GONE
            vodContainer.visibility = android.view.View.GONE
            seriesContainer.visibility = android.view.View.GONE
            
            // Navigate to appropriate info screen based on content type
            when (contentType) {
                "MOVIE" -> {
                    // Check if we came from MovieDetailActivity (separate activity)
                    if (lastMovieDetails != null) {
                        Log.d(TAG, "Returning to MovieDetailActivity (re-launching it)")
                        // Re-launch MovieDetailActivity since it finished when it sent the play intent
                        val details = lastMovieDetails!!
                        val intent = Intent(this, MovieDetailActivity::class.java).apply {
                            putExtra("MOVIE_ID", details.id)
                            putExtra("MOVIE_NAME", details.name)
                            putExtra("POSTER_URL", details.posterUrl)
                            putExtra("DESCRIPTION", details.description)
                            putExtra("ACTORS", details.actors)
                            putExtra("DIRECTOR", details.director)
                            putExtra("YEAR", details.year)
                            putExtra("COUNTRY", details.country)
                            putExtra("GENRES", details.genres)
                            putExtra("CMD", details.cmd)
                        }
                        startActivityForResult(intent, REQUEST_CODE_MOVIE_DETAIL)
                        lastMovieDetails = null // Clear after navigation
                    } else {
                        // Show movie detail/info screen inline in VODComponent
                        Log.d(TAG, "Navigating to movie detail/info screen in VODComponent")
                        vodContainer.visibility = android.view.View.VISIBLE
                        vodComponent.post {
                            vodComponent.ensureDetailScreenVisible()
                            vodComponent.refreshProgress()
                            vodComponent.focusPlayButton()
                        }
                    }
                }
                "SERIES" -> {
                    // Show series detail/info screen
                    Log.d(TAG, "Navigating back to series detail/info screen")
                    
                    // Show series detail container
                    seriesContainer.visibility = android.view.View.VISIBLE
                    
                    // Request focus on series detail to restore proper navigation
                    seriesDetail.post {
                        seriesDetail.visibility = android.view.View.VISIBLE
                        
                        // Try to focus on the last played episode, otherwise just focus the container
                        if (lastPlayedEpisodeId != null) {
                            Log.d(TAG, "🎯 Restoring focus to last played episode: $lastPlayedEpisodeId")
                            seriesDetail.focusOnEpisode(lastPlayedEpisodeId!!)
                        } else {
                            seriesDetail.requestFocus()
                            Log.d(TAG, "Series detail container shown and focused")
                        }
                    }
                }
                else -> {
                    Log.w(TAG, "Unknown content type, defaulting to VOD component")
                    vodContainer.visibility = android.view.View.VISIBLE
                }
            }
        }
        
        // Set next episode callback
        vodPlayer.setOnNextEpisodeListener {
            Log.d(TAG, "Next episode requested")
            playNextEpisode()
        }
    }
    
    private fun playMovie(vodItem: VODComponent.VODItem) {
        val movieId = vodItem.id
        val title = vodItem.name
        val cmd = vodItem.cmd
        
        Log.d(TAG, "🎬 ===== STARTING MOVIE PLAYBACK =====")
        Log.d(TAG, "🎬 Movie ID: $movieId, Title: $title")
        Log.d(TAG, "🎬 Original CMD: $cmd")
        
        // Get stream URL in background
        lifecycleScope.launch {
            try {
                // Check if M3U provider - play directly without API calls
                val providerId = vodComponent.getCurrentProviderId()
                val provider = if (providerId != null) {
                    withContext(Dispatchers.IO) {
                        com.ronika.iptvnative.database.AppDatabase.getDatabase(applicationContext)
                            .providerDao().getProviderById(providerId)
                    }
                } else null
                
                if (provider?.type == "m3u") {
                    Log.d(TAG, "🎬 M3U provider detected - playing direct URL: $cmd")
                    
                    // Hide all other components and show player
                    val sideNavContainer = findViewById<FrameLayout>(R.id.sideNavContainer)
                    val categorySidebarContainer = findViewById<FrameLayout>(R.id.categorySidebarContainer)
                    val vodContainer = findViewById<FrameLayout>(R.id.vodContainer)
                    val vodPlayerContainer = findViewById<FrameLayout>(R.id.vodPlayerContainer)
                    
                    sideNavContainer.visibility = android.view.View.GONE
                    categorySidebarContainer.visibility = android.view.View.GONE
                    vodContainer.visibility = android.view.View.GONE
                    
                    // Push PLAYER state to navigation stack
                    pushNavigation(NavigationState.PLAYER)
                    
                    // Show player fullscreen
                    vodPlayerContainer.visibility = android.view.View.VISIBLE
                    isPlayingFromSeries = false
                    
                    // Set content info for progress tracking
                    vodPlayer.setContentInfo(
                        contentId = movieId,
                        contentType = "MOVIE",
                        posterUrl = vodItem.posterUrl,
                        cmd = cmd ?: "",
                        providerId = vodComponent.getCurrentProviderId() ?: ""
                    )
                    
                    // Play M3U movie directly with URL from cmd
                    val streamUrl = cmd ?: ""
                    if (streamUrl.isNotEmpty()) {
                        try {
                            val lower = streamUrl.lowercase()
                            val needsDownscale = Regex("(2160|4k|uhd)", RegexOption.IGNORE_CASE).containsMatchIn(lower)
                            val needsUpscale = Regex("\\b(480|360|240|576)\\b").containsMatchIn(lower)
                            val deviceTarget = getDeviceTargetResolution()
                            val deviceSupports4k = deviceTarget == "2160"

                            if (needsDownscale || needsUpscale) {
                                // If the stream is 4K but the device supports 4K, no downscale necessary
                                if (needsDownscale && deviceSupports4k) {
                                    vodPlayer.playMovie(streamUrl, title, 0L)
                                    Log.d(TAG, "🎬 Device supports 4K and stream is 4K — playing original")
                                } else {
                                    val mode = if (needsUpscale) "upscale" else "downscale"
                                    val backend = getTranscodeBackendUrl()
                                    val backendAvailable = checkTranscodeBackendHealth(backend)
                                    if (!backendAvailable) {
                                        withContext(Dispatchers.Main) {
                                            android.widget.Toast.makeText(this@MainActivity, "Transcode service unavailable", android.widget.Toast.LENGTH_SHORT).show()
                                        }
                                        return@launch
                                    }
                                    // Request target based on device capability (1080 or 2160)
                                    val finalUrl = buildTranscodeEndpoint(streamUrl, mode, deviceTarget)
                                    vodPlayer.playMovie(finalUrl, title, 0L)
                                    Log.d(TAG, "🎬 M3U movie playback started via transcode backend: $finalUrl")
                                }
                            } else {
                                vodPlayer.playMovie(streamUrl, title, 0L)
                                Log.d(TAG, "🎬 M3U movie playback started")
                            }
                        } catch (e: Exception) {
                            Log.w(TAG, "Transcode decision failed, playing original: ${e.message}")
                            vodPlayer.playMovie(streamUrl, title, 0L)
                        }
                    } else {
                        Log.e(TAG, "🎬 M3U movie has no URL")
                        android.widget.Toast.makeText(this@MainActivity, "Invalid stream URL", android.widget.Toast.LENGTH_SHORT).show()
                    }
                    return@launch
                }
                
                // Stalker provider - get stream URL from API
                Log.d(TAG, "🎬 Step 1: Getting file info for movie ID: $movieId")
                
                // IMPORTANT: Use StalkerClient from VODComponent to ensure we use the same provider
                // that loaded the movie list. This prevents cross-provider issues.
                val client = vodComponent.getStalkerClient() ?: initializeStalkerClient()
                if (client == null) {
                    Log.e(TAG, "🎬 Failed to get StalkerClient!")
                    return@launch
                }
                Log.d(TAG, "🎬 Using StalkerClient from VODComponent, providerId: $providerId")
                
                val fileInfo = client.getVodFileInfo(movieId)
                Log.d(TAG, "🎬 File info response: $fileInfo")
                
                if (fileInfo != null) {
                    // Step 2: Get the file ID from the response
                    val fileId = fileInfo["id"] as? String
                    Log.d(TAG, "🎬 Extracted file ID: $fileId")
                    
                    if (fileId != null) {
                        Log.d(TAG, "🎬 Step 2: Got file ID: $fileId, calling create_link...")
                        
                        // Step 3: Construct cmd parameter in the correct format
                        val vodCmd = "/media/file_$fileId.mpg"
                        Log.d(TAG, "🎬 Constructed VOD CMD: $vodCmd")
                        
                        // Step 4: Get authenticated stream URL using create_link
                        Log.d(TAG, "🎬 Step 3: Getting tokenized stream URL...")
                        val response = client.getVodStreamUrl(vodCmd, "vod")
                        val streamUrl = response.url
                        Log.d(TAG, "🎬 Got tokenized stream URL: $streamUrl")
                        
                        // Step 5: Hide all other components and show player
                        val sideNavContainer = findViewById<FrameLayout>(R.id.sideNavContainer)
                        val categorySidebarContainer = findViewById<FrameLayout>(R.id.categorySidebarContainer)
                        val vodContainer = findViewById<FrameLayout>(R.id.vodContainer)
                        val vodPlayerContainer = findViewById<FrameLayout>(R.id.vodPlayerContainer)
                        
                        sideNavContainer.visibility = android.view.View.GONE
                        categorySidebarContainer.visibility = android.view.View.GONE
                        vodContainer.visibility = android.view.View.GONE
                        
                        // Push PLAYER state to navigation stack
                        pushNavigation(NavigationState.PLAYER)
                        
                        // Show player fullscreen
                        vodPlayerContainer.visibility = android.view.View.VISIBLE
                        isPlayingFromSeries = false
                        
                        // Set content info for progress tracking
                        vodPlayer.setContentInfo(
                            contentId = movieId,
                            contentType = "MOVIE",
                            posterUrl = vodItem.posterUrl,
                            cmd = cmd ?: "",
                            providerId = vodComponent.getCurrentProviderId() ?: ""
                        )
                        
                        // Check for saved progress and seek to it
                        val repository = com.ronika.iptvnative.repository.WatchProgressRepository(applicationContext)
                        val progress = repository.getProgress(movieId, "MOVIE", vodComponent.getCurrentProviderId() ?: "")
                        val startPosition = progress?.currentPosition ?: 0L
                        
                        try {
                            val lower = streamUrl.lowercase()
                            val needsDownscale = Regex("(2160|4k|uhd)", RegexOption.IGNORE_CASE).containsMatchIn(lower)
                            val needsUpscale = Regex("\\b(480|360|240|576)\\b").containsMatchIn(lower)

                            if (needsDownscale || needsUpscale) {
                                val deviceTarget = getDeviceTargetResolution()
                                val deviceSupports4k = deviceTarget == "2160"

                                if (needsDownscale && deviceSupports4k) {
                                    // device supports 4k and source is 4k -> play original
                                    vodPlayer.playMovie(streamUrl, title, startPosition)
                                    Log.d(TAG, "🎬 Device supports 4K and stream is 4K — playing original, stack: $navigationStack")
                                } else {
                                    val mode = if (needsUpscale) "upscale" else "downscale"
                                    val backend = getTranscodeBackendUrl()
                                    val backendAvailable = checkTranscodeBackendHealth(backend)
                                    if (!backendAvailable) {
                                        withContext(Dispatchers.Main) {
                                            android.widget.Toast.makeText(this@MainActivity, "Transcode service unavailable", android.widget.Toast.LENGTH_SHORT).show()
                                        }
                                        return@launch
                                    }
                                    val finalUrl = buildTranscodeEndpoint(streamUrl, mode, deviceTarget)
                                    vodPlayer.playMovie(finalUrl, title, startPosition)
                                    Log.d(TAG, "🎬 Movie playback started via transcode backend: $finalUrl, stack: $navigationStack")
                                }
                            } else {
                                vodPlayer.playMovie(streamUrl, title, startPosition)
                                Log.d(TAG, "🎬 Movie playback started successfully, stack: $navigationStack")
                            }
                        } catch (e: Exception) {
                            Log.w(TAG, "Transcode decision failed, playing original: ${e.message}")
                            vodPlayer.playMovie(streamUrl, title, startPosition)
                            Log.d(TAG, "🎬 Movie playback started successfully, stack: $navigationStack")
                        }
                    } else {
                        Log.w(TAG, "🎬 No file ID in file info response")
                        android.widget.Toast.makeText(this@MainActivity, "Failed to get file info", android.widget.Toast.LENGTH_SHORT).show()
                    }
                } else {
                    Log.w(TAG, "🎬 No file info returned from getVodFileInfo")
                    android.widget.Toast.makeText(this@MainActivity, "Failed to get file info", android.widget.Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Log.e(TAG, "🎬 Error loading movie: ${e.message}", e)
                android.widget.Toast.makeText(this@MainActivity, "Error: ${e.message}", android.widget.Toast.LENGTH_SHORT).show()
            }
        }
    }
    
    private fun playNextEpisode() {
        // Request series detail component to play next episode
        if (currentSeriesId != null && currentSeasonId != null && currentEpisodeId != null) {
            Log.d(TAG, "Playing next episode after: $currentEpisodeId")
            seriesDetail.playNextEpisodeAfter(currentEpisodeId!!)
        } else {
            Log.w(TAG, "Cannot play next episode - current episode not tracked")
        }
    }
    
    private fun hidePlayer() {
        Log.d(TAG, "hidePlayer() called - navigation stack: $navigationStack")
        
        // Stop player and hide container
        vodPlayer.stop()
        val vodPlayerContainer = findViewById<FrameLayout>(R.id.vodPlayerContainer)
        vodPlayerContainer.visibility = android.view.View.GONE
        Log.d(TAG, "Player container hidden")

        // Ensure no leftover PLAYER states remain on the navigation stack (clean duplicates)
        try {
            val before = navigationStack.toList()
            val removed = navigationStack.removeAll { it == NavigationState.PLAYER }
            if (removed) {
                Log.d(TAG, "Removed PLAYER states from navigation stack. before: $before, after: $navigationStack")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error cleaning PLAYER states from navigation stack", e)
        }
        
        // Clean up flags
        isPlayingFromSeries = false
        Log.d(TAG, "Player hidden, navigation handled by back callback")
    }
    
    fun showLiveTVCategory(categoryName: String, providerId: String? = null) {
        Log.d(TAG, "Showing LiveTV category: $categoryName, providerId: $providerId")
        
        // Check if category is censored
        lifecycleScope.launch {
            val repository = CategoryRepository(applicationContext)
            val isCensored = repository.isCategoryCensored(categoryName, "LIVE")
            
            if (isCensored) {
                // Show password dialog
                PasswordDialogComponent(this@MainActivity, 
                    onPasswordCorrect = {
                        showLiveTVCategoryContent(categoryName, providerId)
                    },
                    onCancel = {
                        // Return focus to category sidebar
                        categorySidebar.requestFocus()
                    }
                ).show()
            } else {
                showLiveTVCategoryContent(categoryName, providerId)
            }
        }
    }
    
    private fun showLiveTVCategoryContent(categoryName: String, providerId: String? = null) {
        // Hide VOD container
        val vodContainer = findViewById<FrameLayout>(R.id.vodContainer)
        vodContainer.visibility = android.view.View.GONE
        
        // Make container fullscreen by hiding sidebar components
        val sideNavContainer = findViewById<FrameLayout>(R.id.sideNavContainer)
        val categorySidebarContainer = findViewById<FrameLayout>(R.id.categorySidebarContainer)
        
        sideNavContainer.visibility = android.view.View.GONE
        categorySidebarContainer.visibility = android.view.View.GONE
        
        // Make LiveTV container visible and fullscreen
        val container = findViewById<FrameLayout>(R.id.liveTVContainer)
        val params = container.layoutParams as android.widget.LinearLayout.LayoutParams
        params.weight = 1f
        params.width = 0
        container.layoutParams = params
        container.visibility = android.view.View.VISIBLE
        
        // Reinitialize client with the specific provider's credentials, THEN show category
        lifecycleScope.launch {
            liveTVChannels.initializeWithProvider(providerId)
            liveTVChannels.showCategory(categoryName, providerId)
            liveTVChannels.setFullscreen(true)
            Log.d(TAG, "LiveTV component shown in fullscreen mode")
        }
    }
    
    fun showMoviesCategory(categoryName: String, providerId: String? = null) {
        Log.d(TAG, "Showing Movies category: $categoryName, providerId: $providerId")
        
        // Check if this is "Continue Watching" category (with or without emoji)
        val cleanCategoryName = categoryName.replace("▶️ ", "").replace("⭐ ", "")
        if (cleanCategoryName == "Continue Watching") {
            showContinueWatchingMovies()
        } else if (cleanCategoryName == "Favourites") {
            showFavouriteMovies()
        } else {
            // Check if category is censored
            lifecycleScope.launch {
                val repository = CategoryRepository(applicationContext)
                val isCensored = repository.isCategoryCensored(categoryName, "MOVIE")
                
                if (isCensored) {
                    // Show password dialog
                    PasswordDialogComponent(this@MainActivity, 
                        onPasswordCorrect = {
                            showVODCategory(categoryName, VODComponent.VODType.MOVIES, providerId)
                        },
                        onCancel = {
                            // Return focus to category sidebar
                            categorySidebar.requestFocus()
                        }
                    ).show()
                } else {
                    showVODCategory(categoryName, VODComponent.VODType.MOVIES, providerId)
                }
            }
        }
    }
    
    fun showSeriesCategory(categoryName: String, providerId: String? = null) {
        Log.d(TAG, "Showing Series category: $categoryName, providerId: $providerId")
        
        // Check if this is "Continue Watching" category (with or without emoji)
        val cleanCategoryName = categoryName.replace("▶️ ", "").replace("⭐ ", "")
        if (cleanCategoryName == "Continue Watching") {
            showContinueWatchingSeries()
        } else if (cleanCategoryName == "Favourites") {
            showFavouriteSeries()
        } else {
            // Check if category is censored
            lifecycleScope.launch {
                val repository = CategoryRepository(applicationContext)
                val isCensored = repository.isCategoryCensored(categoryName, "SERIES")
                
                if (isCensored) {
                    // Show password dialog
                    PasswordDialogComponent(this@MainActivity, 
                        onPasswordCorrect = {
                            showVODCategory(categoryName, VODComponent.VODType.SERIES, providerId)
                        },
                        onCancel = {
                            // Return focus to category sidebar
                            categorySidebar.requestFocus()
                        }
                    ).show()
                } else {
                    showVODCategory(categoryName, VODComponent.VODType.SERIES, providerId)
                }
            }
        }
    }
    
    private fun showVODCategory(categoryName: String, vodType: VODComponent.VODType, providerId: String? = null) {
        Log.d(TAG, "showVODCategory called for $categoryName, setting navigationSource to CATEGORY")
        // Mark that we came from category
        currentNavigationSource = NavigationSource.CATEGORY
        
        // Push VOD_GRID state to navigation stack
        pushNavigation(NavigationState.VOD_GRID)
        Log.d(TAG, "Pushed VOD_GRID to stack, navigationSource: $currentNavigationSource")
        
        // Hide LiveTV container
        val liveTVContainer = findViewById<FrameLayout>(R.id.liveTVContainer)
        liveTVContainer.visibility = android.view.View.GONE
        
        // Make container fullscreen by hiding sidebar components
        val sideNavContainer = findViewById<FrameLayout>(R.id.sideNavContainer)
        val categorySidebarContainer = findViewById<FrameLayout>(R.id.categorySidebarContainer)
        
        sideNavContainer.visibility = android.view.View.GONE
        categorySidebarContainer.visibility = android.view.View.GONE
        
        // Make VOD container visible and fullscreen
        val container = findViewById<FrameLayout>(R.id.vodContainer)
        val params = container.layoutParams as android.widget.LinearLayout.LayoutParams
        params.weight = 1f
        params.width = 0
        container.layoutParams = params
        container.visibility = android.view.View.VISIBLE
        
        // Reinitialize client with the specific provider, THEN show category
        lifecycleScope.launch {
            vodComponent.initializeWithProvider(providerId)
            vodComponent.showCategory(categoryName, vodType, providerId)
            vodComponent.setFullscreen(false)  // NOT fullscreen - allows grid -> detail -> grid flow
            Log.d(TAG, "VOD component shown for $vodType category: $categoryName")
        }
    }
    
    private fun showContinueWatchingMovies() {
        Log.d(TAG, "📺📺📺 ========== LOADING CONTINUE WATCHING MOVIES ==========")
        
        // Mark that we came from category
        currentNavigationSource = NavigationSource.CATEGORY
        pushNavigation(NavigationState.VOD_GRID)
        
        // Hide LiveTV container
        val liveTVContainer = findViewById<FrameLayout>(R.id.liveTVContainer)
        liveTVContainer.visibility = android.view.View.GONE
        
        // Make container fullscreen by hiding sidebar components (same as showVODCategory)
        val sideNavContainer = findViewById<FrameLayout>(R.id.sideNavContainer)
        val categorySidebarContainer = findViewById<FrameLayout>(R.id.categorySidebarContainer)
        
        sideNavContainer.visibility = android.view.View.GONE
        categorySidebarContainer.visibility = android.view.View.GONE
        
        // Make VOD container visible and fullscreen
        val container = findViewById<FrameLayout>(R.id.vodContainer)
        val params = container.layoutParams as android.widget.LinearLayout.LayoutParams
        params.weight = 1f
        params.width = 0
        container.layoutParams = params
        container.visibility = android.view.View.VISIBLE
        
        // Load continue watching items from database
        lifecycleScope.launch {
            try {
                // Get active provider ID
                val database = com.ronika.iptvnative.database.AppDatabase.getDatabase(applicationContext)
                val activeProvider = database.providerDao().getActiveProvider()
                val providerId = activeProvider?.id ?: vodComponent.getCurrentProviderId() ?: ""
                
                Log.d(TAG, "📺 Loading Continue Watching movies for provider: $providerId")
                Log.d(TAG, "📺 Active provider: ${activeProvider?.name} (${activeProvider?.id})")
                
                val repository = com.ronika.iptvnative.repository.WatchProgressRepository(applicationContext)
                val progressList = repository.getContinueWatchingMovies(providerId)
                
                Log.d(TAG, "📺 Continue Watching query returned ${progressList.size} items")
                
                // Convert WatchProgress to VODItem
                val vodItems = progressList.map { progress ->
                    VODComponent.VODItem(
                        id = progress.contentId,
                        name = progress.title,
                        year = null,
                        description = "Resume from ${formatTime(progress.currentPosition)}",
                        posterUrl = progress.posterUrl,
                        backdropUrl = null,
                        cmd = progress.cmd,
                        director = null,
                        actors = null,
                        isSeries = false
                    )
                }
                
                vodComponent.showItems(vodItems, "Continue Watching", VODComponent.VODType.MOVIES)
                vodComponent.setFullscreen(false)  // NOT fullscreen - allows grid -> detail -> grid flow
                Log.d(TAG, "Continue Watching movies loaded: ${vodItems.size} items")
            } catch (e: Exception) {
                Log.e(TAG, "Error loading Continue Watching movies: ${e.message}", e)
            }
        }
    }
    
    private fun showContinueWatchingSeries() {
        Log.d(TAG, "Loading Continue Watching series")
        
        // Mark that we came from category
        currentNavigationSource = NavigationSource.CATEGORY
        pushNavigation(NavigationState.VOD_GRID)
        
        // Hide LiveTV container
        val liveTVContainer = findViewById<FrameLayout>(R.id.liveTVContainer)
        liveTVContainer.visibility = android.view.View.GONE
        
        // Make container fullscreen by hiding sidebar components (same as showVODCategory)
        val sideNavContainer = findViewById<FrameLayout>(R.id.sideNavContainer)
        val categorySidebarContainer = findViewById<FrameLayout>(R.id.categorySidebarContainer)
        
        sideNavContainer.visibility = android.view.View.GONE
        categorySidebarContainer.visibility = android.view.View.GONE
        
        // Make VOD container visible and fullscreen
        val container = findViewById<FrameLayout>(R.id.vodContainer)
        val params = container.layoutParams as android.widget.LinearLayout.LayoutParams
        params.weight = 1f
        params.width = 0
        container.layoutParams = params
        container.visibility = android.view.View.VISIBLE
        
        // Load continue watching items from database
        lifecycleScope.launch {
            try {
                // Get active provider ID
                val database = com.ronika.iptvnative.database.AppDatabase.getDatabase(applicationContext)
                val activeProvider = database.providerDao().getActiveProvider()
                val providerId = activeProvider?.id ?: vodComponent.getCurrentProviderId() ?: ""
                
                Log.d(TAG, "Loading Continue Watching series for provider: $providerId")
                
                val repository = com.ronika.iptvnative.repository.WatchProgressRepository(applicationContext)
                val progressList = repository.getContinueWatchingSeries(providerId)
                
                // Convert WatchProgress to VODItem
                val vodItems = progressList.map { progress ->
                    val episodeInfo = if (progress.seasonNumber != null && progress.episodeNumber != null) {
                        "S${progress.seasonNumber}E${progress.episodeNumber} - "
                    } else ""
                    
                    VODComponent.VODItem(
                        id = progress.contentId,
                        name = progress.title,
                        year = null,
                        description = "${episodeInfo}Resume from ${formatTime(progress.currentPosition)}",
                        posterUrl = progress.posterUrl,
                        backdropUrl = null,
                        cmd = progress.cmd,
                        director = null,
                        actors = null,
                        isSeries = true
                    )
                }
                
                vodComponent.showItems(vodItems, "Continue Watching", VODComponent.VODType.SERIES)
                vodComponent.setFullscreen(false)  // NOT fullscreen - allows grid -> detail -> grid flow
                Log.d(TAG, "Continue Watching series loaded: ${vodItems.size} items")
            } catch (e: Exception) {
                Log.e(TAG, "Error loading Continue Watching series: ${e.message}", e)
            }
        }
    }
    
    private fun showFavouriteMovies() {
        Log.d(TAG, "Loading Favourite movies")
        
        // Mark that we came from category
        currentNavigationSource = NavigationSource.CATEGORY
        pushNavigation(NavigationState.VOD_GRID)
        
        // Hide LiveTV container
        val liveTVContainer = findViewById<FrameLayout>(R.id.liveTVContainer)
        liveTVContainer.visibility = android.view.View.GONE
        
        // Make container fullscreen by hiding sidebar components
        val sideNavContainer = findViewById<FrameLayout>(R.id.sideNavContainer)
        val categorySidebarContainer = findViewById<FrameLayout>(R.id.categorySidebarContainer)
        
        sideNavContainer.visibility = android.view.View.GONE
        categorySidebarContainer.visibility = android.view.View.GONE
        
        // Make VOD container visible and fullscreen
        val container = findViewById<FrameLayout>(R.id.vodContainer)
        val params = container.layoutParams as android.widget.LinearLayout.LayoutParams
        params.weight = 1f
        params.width = 0
        container.layoutParams = params
        container.visibility = android.view.View.VISIBLE
        
        // Load favourite movies from database
        lifecycleScope.launch {
            try {
                // Get active provider ID
                val database = com.ronika.iptvnative.database.AppDatabase.getDatabase(applicationContext)
                val activeProvider = database.providerDao().getActiveProvider()
                val providerId = activeProvider?.id ?: vodComponent.getCurrentProviderId() ?: ""
                
                Log.d(TAG, "Loading Favourite movies for provider: $providerId")
                
                val repository = com.ronika.iptvnative.repository.FavoriteRepository(applicationContext)
                val favourites = repository.getFavoriteMovies(providerId)
                
                // Convert to VODItem
                val vodItems = favourites.map { movie ->
                    VODComponent.VODItem(
                        id = movie.id,
                        name = movie.name,
                        year = null,
                        description = null,
                        posterUrl = movie.posterUrl,
                        backdropUrl = null,
                        cmd = movie.cmd,
                        director = null,
                        actors = null,
                        isSeries = false
                    )
                }
                
                vodComponent.showItems(vodItems, "Favourites", VODComponent.VODType.MOVIES)
                vodComponent.setFullscreen(false)
                Log.d(TAG, "Favourite movies loaded: ${vodItems.size} items")
            } catch (e: Exception) {
                Log.e(TAG, "Error loading Favourite movies: ${e.message}", e)
            }
        }
    }
    
    private fun showFavouriteSeries() {
        Log.d(TAG, "Loading Favourite series")
        
        // Mark that we came from category
        currentNavigationSource = NavigationSource.CATEGORY
        pushNavigation(NavigationState.VOD_GRID)
        
        // Hide LiveTV container
        val liveTVContainer = findViewById<FrameLayout>(R.id.liveTVContainer)
        liveTVContainer.visibility = android.view.View.GONE
        
        // Make container fullscreen by hiding sidebar components
        val sideNavContainer = findViewById<FrameLayout>(R.id.sideNavContainer)
        val categorySidebarContainer = findViewById<FrameLayout>(R.id.categorySidebarContainer)
        
        sideNavContainer.visibility = android.view.View.GONE
        categorySidebarContainer.visibility = android.view.View.GONE
        
        // Make VOD container visible and fullscreen
        val container = findViewById<FrameLayout>(R.id.vodContainer)
        val params = container.layoutParams as android.widget.LinearLayout.LayoutParams
        params.weight = 1f
        params.width = 0
        container.layoutParams = params
        container.visibility = android.view.View.VISIBLE
        
        // Load favourite series from database
        lifecycleScope.launch {
            try {
                // Get active provider ID
                val database = com.ronika.iptvnative.database.AppDatabase.getDatabase(applicationContext)
                val activeProvider = database.providerDao().getActiveProvider()
                val providerId = activeProvider?.id ?: vodComponent.getCurrentProviderId() ?: ""
                
                Log.d(TAG, "Loading Favourite series for provider: $providerId")
                
                val repository = com.ronika.iptvnative.repository.FavoriteRepository(applicationContext)
                val favourites = repository.getFavoriteSeries(providerId)
                
                // Convert to VODItem
                val vodItems = favourites.map { series ->
                    VODComponent.VODItem(
                        id = series.id,
                        name = series.name,
                        year = null,
                        description = null,
                        posterUrl = series.posterUrl,
                        backdropUrl = null,
                        cmd = null,
                        director = null,
                        actors = null,
                        isSeries = true
                    )
                }
                
                vodComponent.showItems(vodItems, "Favourites", VODComponent.VODType.SERIES)
                vodComponent.setFullscreen(false)
                Log.d(TAG, "Favourite series loaded: ${vodItems.size} items")
            } catch (e: Exception) {
                Log.e(TAG, "Error loading Favourite series: ${e.message}", e)
            }
        }
    }
    
    private fun formatTime(milliseconds: Long): String {
        val seconds = milliseconds / 1000
        val minutes = seconds / 60
        val hours = minutes / 60
        
        return if (hours > 0) {
            String.format("%d:%02d:%02d", hours, minutes % 60, seconds % 60)
        } else {
            String.format("%d:%02d", minutes, seconds % 60)
        }
    }
    
    private fun initSearchComponent() {
        searchComponent = RefactoredSearchComponent(this)
        val container = findViewById<FrameLayout>(R.id.searchContainer)
        container.addView(searchComponent)
        
        // Set callback for navigation back to main sidenav
        searchComponent.setOnNavigateBackListener {
            Log.d(TAG, "Navigating back from search to main sidenav")
            mainSideNav.requestFocusOnActiveTab()
        }
        
        // Set callback for movie selected
        searchComponent.setOnMovieSelectedListener { vodItem, providerId ->
            Log.d(TAG, "Movie selected from search: ${vodItem.name}, provider: $providerId")
            showMovieDetailFromSearchNew(vodItem, providerId)
        }
        
        // Set callback for series selected
        searchComponent.setOnSeriesSelectedListener { vodItem, providerId ->
            Log.d(TAG, "Series selected from search: ${vodItem.name}, provider: $providerId")
            showSeriesDetailFromSearchNew(vodItem, providerId)
        }
        
        Log.d(TAG, "Refactored search component initialized")
    }
    
    private fun initSettingsComponent() {
        settingsComponent = SettingsComponent(this)
        val container = findViewById<FrameLayout>(R.id.settingsContainer)
        container.addView(settingsComponent)
        
        // Set back callback to return to main sidenav
        settingsComponent.setOnBackPressedListener {
            Log.d(TAG, "Back pressed in settings, returning to main sidenav")
            
            // Hide settings container
            val settingsContainer = findViewById<FrameLayout>(R.id.settingsContainer)
            settingsContainer.visibility = android.view.View.GONE
            
            // Return focus to main sidenav
            mainSideNav.requestFocusOnActiveTab()
        }
        
        // Set update playlist callback to full resync categories (re-fetches page 1 for each to classify)
        settingsComponent.setOnUpdatePlaylistListener {
            Log.d(TAG, "Update playlist requested from settings - doing full resync for ALL providers")
            lifecycleScope.launch {
                try {
                    // First, clean local database duplicates
                    Log.d(TAG, "🧹 Cleaning local database duplicates before sync...")
                    cleanLocalDatabaseDuplicates()
                    
                    val categoryRepository = CategoryRepository(this@MainActivity)
                    // Full resync ALL providers: deletes all categories, re-fetches from API, checks is_series for each
                    // Run full resync for the active provider only
                    val result = categoryRepository.fullResync()
                    
                    withContext(Dispatchers.Main) {
                        if (result.isSuccess) {
                            android.widget.Toast.makeText(
                                this@MainActivity,
                                "All providers resynced!",
                                android.widget.Toast.LENGTH_SHORT
                            ).show()
                            // Refresh settings to show updated data
                            settingsComponent.refresh()
                            // Also refresh category sidebar
                            categorySidebar.refreshCategories()
                        } else {
                            android.widget.Toast.makeText(
                                this@MainActivity,
                                "Failed to update playlist: ${result.exceptionOrNull()?.message}",
                                android.widget.Toast.LENGTH_LONG
                            ).show()
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error updating playlist", e)
                    withContext(Dispatchers.Main) {
                        android.widget.Toast.makeText(
                            this@MainActivity,
                            "Error: ${e.message}",
                            android.widget.Toast.LENGTH_LONG
                        ).show()
                    }
                }
            }
        }
        
        // Set provider status changed callback to refresh categories and search
        settingsComponent.setOnProviderStatusChangedListener {
            Log.d(TAG, "Provider status changed - refreshing category sidebar and search")
            categorySidebar.refreshCategories()
            if (::searchComponent.isInitialized) {
                searchComponent.refreshProviders()
            }
        }
        
        Log.d(TAG, "Settings component initialized")
    }
    
    /**
     * Clean local database duplicates (same as server cleanup logic)
     * Keeps only the first occurrence of each category (by name + type + providerId)
     */
    private suspend fun cleanLocalDatabaseDuplicates() = withContext(Dispatchers.IO) {
        try {
            val database = com.ronika.iptvnative.database.AppDatabase.getDatabase(this@MainActivity)
            val allCategories = database.categoryDao().getAllCategories()
            
            Log.d(TAG, "📊 Total categories before cleanup: ${allCategories.size}")
            
            // Group by unique key (name + type + providerId)
            val grouped = allCategories.groupBy { "${it.name}_${it.type}_${it.providerId}" }
            
            // Find duplicates
            val duplicatesToDelete = mutableListOf<com.ronika.iptvnative.database.entities.CategoryEntity>()
            grouped.forEach { (key, categories) ->
                if (categories.size > 1) {
                    // Keep first, delete rest
                    duplicatesToDelete.addAll(categories.drop(1))
                    Log.d(TAG, "🗑️ Found ${categories.size} duplicates of: ${categories[0].name} (${categories[0].type})")
                }
            }
            
            if (duplicatesToDelete.isNotEmpty()) {
                duplicatesToDelete.forEach { category ->
                    database.categoryDao().delete(category)
                }
                Log.d(TAG, "✅ Deleted ${duplicatesToDelete.size} duplicate categories")
            } else {
                Log.d(TAG, "✅ No duplicates found in local database")
            }
            
            val finalCount = database.categoryDao().getAllCategories().size
            Log.d(TAG, "📊 Total categories after cleanup: $finalCount")
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error cleaning local database duplicates", e)
        }
    }
    
    private fun showSearchFullscreen() {
        Log.d(TAG, "Showing search fullscreen (for movie/series navigation)")
        
        // Hide all sidebars and content
        val sideNavContainer = findViewById<FrameLayout>(R.id.sideNavContainer)
        val categorySidebarContainer = findViewById<FrameLayout>(R.id.categorySidebarContainer)
        val liveTVContainer = findViewById<FrameLayout>(R.id.liveTVContainer)
        val vodContainer = findViewById<FrameLayout>(R.id.vodContainer)
        
        sideNavContainer.visibility = android.view.View.GONE
        categorySidebarContainer.visibility = android.view.View.GONE
        liveTVContainer.visibility = android.view.View.GONE
        vodContainer.visibility = android.view.View.GONE
        
        // Show search container fullscreen
        val searchContainer = findViewById<FrameLayout>(R.id.searchContainer)
        val params = searchContainer.layoutParams as android.widget.LinearLayout.LayoutParams
        params.weight = 1f
        params.width = 0
        searchContainer.layoutParams = params
        searchContainer.visibility = android.view.View.VISIBLE
        
        Log.d(TAG, "Search shown in fullscreen mode")
    }
    
    private fun hideSearchFullscreen() {
        Log.d(TAG, "Hiding search fullscreen, returning to sidenav")
        
        // Reset navigation source
        currentNavigationSource = NavigationSource.CATEGORY
        
        // Resize search container to share space with sidebars
        val searchContainer = findViewById<FrameLayout>(R.id.searchContainer)
        val params = searchContainer.layoutParams as android.widget.LinearLayout.LayoutParams
        params.weight = 0.7f
        params.width = 0
        searchContainer.layoutParams = params
        searchContainer.visibility = android.view.View.VISIBLE
        
        // Show main sidenav and category sidebar
        val sideNavContainer = findViewById<FrameLayout>(R.id.sideNavContainer)
        val categorySidebarContainer = findViewById<FrameLayout>(R.id.categorySidebarContainer)
        
        sideNavContainer.visibility = android.view.View.VISIBLE
        categorySidebarContainer.visibility = android.view.View.VISIBLE
        
        // Set active tab to search WITHOUT notifying
        mainSideNav.setActiveTab(MainSideNavComponent.Tab.SEARCH, notify = false)
        mainSideNav.requestFocusOnActiveTab()
        
        Log.d(TAG, "Returned to main sidenav with search visible on right")
    }
    
    private fun showMovieDetailFromSearchNew(vodItem: VODComponent.VODItem, providerId: String) {
        Log.d(TAG, "Showing movie detail from search: ${vodItem.name}, provider: $providerId")
        
        // Push SEARCH state if not already there, then push VOD_DETAIL
        val currentState = getCurrentNavigation()
        if (currentState != NavigationState.SEARCH) {
            pushNavigation(NavigationState.SEARCH)
        }
        // Push VOD_DETAIL so when we back, we pop this and return to SEARCH
        pushNavigation(NavigationState.VOD_DETAIL)
        
        // Mark that we came from search
        currentNavigationSource = NavigationSource.SEARCH
        
        // Clear focus from mainSideNav to prevent focus change triggering tab listener
        mainSideNav.clearFocus()
        
        // Hide search and reset its dimensions - set GONE first, THEN reset params
        val searchContainer = findViewById<FrameLayout>(R.id.searchContainer)
        searchContainer.visibility = android.view.View.GONE
        val searchParams = searchContainer.layoutParams as android.widget.LinearLayout.LayoutParams
        searchParams.weight = 0f
        searchParams.width = 0
        searchContainer.layoutParams = searchParams
        searchContainer.requestLayout()
        
        // Hide ALL sidebars (main sidenav too)
        val sideNavContainer = findViewById<FrameLayout>(R.id.sideNavContainer)
        val categorySidebarContainer = findViewById<FrameLayout>(R.id.categorySidebarContainer)
        sideNavContainer.visibility = android.view.View.GONE
        categorySidebarContainer.visibility = android.view.View.GONE
        
        // Show VOD container fullscreen
        val vodContainer = findViewById<FrameLayout>(R.id.vodContainer)
        val params = vodContainer.layoutParams as android.widget.LinearLayout.LayoutParams
        params.weight = 1f
        params.width = 0
        vodContainer.layoutParams = params
        vodContainer.visibility = android.view.View.VISIBLE
        
        // Initialize VOD with the correct provider before showing detail
        lifecycleScope.launch {
            vodComponent.initializeWithProvider(providerId)
            withContext(Dispatchers.Main) {
                // Show item detail directly (VODItem already in correct format)
                vodComponent.showItemDetail(vodItem, "Search Results", VODComponent.VODType.MOVIES)
                vodComponent.setFullscreen(true)
                
                // Request focus on VOD component to prevent focus going back to sidebar
                vodComponent.requestFocus()
            }
        }
    }
    
    private fun showMovieDetailFromSearch(movie: com.ronika.iptvnative.models.Movie) {
        Log.d(TAG, "Showing movie detail from search: ${movie.name}")
        
        // Mark that we came from search
        currentNavigationSource = NavigationSource.SEARCH
        
        // Hide search and show VOD fullscreen
        val searchContainer = findViewById<FrameLayout>(R.id.searchContainer)
        searchContainer.visibility = android.view.View.GONE
        
        // Hide sidebars
        val sideNavContainer = findViewById<FrameLayout>(R.id.sideNavContainer)
        val categorySidebarContainer = findViewById<FrameLayout>(R.id.categorySidebarContainer)
        sideNavContainer.visibility = android.view.View.GONE
        categorySidebarContainer.visibility = android.view.View.GONE
        
        // Show VOD container fullscreen
        val vodContainer = findViewById<FrameLayout>(R.id.vodContainer)
        val params = vodContainer.layoutParams as android.widget.LinearLayout.LayoutParams
        params.weight = 1f
        params.width = 0
        vodContainer.layoutParams = params
        vodContainer.visibility = android.view.View.VISIBLE
        
        // Build image URLs
        val imageUrl = movie.screenshotUri ?: movie.screenshot ?: movie.coverBig ?: movie.cover ?: movie.poster
        val fullImageUrl = if (imageUrl?.startsWith("http") == true) imageUrl else "http://tv.stream4k.cc$imageUrl"
        
        // Create VOD item
        val vodItem = VODComponent.VODItem(
            id = movie.id,
            name = movie.name,
            posterUrl = fullImageUrl,
            backdropUrl = fullImageUrl,
            description = movie.description,
            year = movie.year,
            director = movie.director,
            actors = movie.actors,
            cmd = movie.cmd ?: ""
        )
        
        // Show item detail directly
        vodComponent.showItemDetail(vodItem, "Search Results", VODComponent.VODType.MOVIES)
        vodComponent.setFullscreen(true)
    }
    
    private fun showSeriesDetailFromSearchNew(vodItem: VODComponent.VODItem, providerId: String) {
        Log.d(TAG, "Showing series detail from search: ${vodItem.name}, provider: $providerId, current stack: $navigationStack")
        
        // Push SEARCH state first, then SERIES_DETAIL
        pushNavigation(NavigationState.SEARCH)
        pushNavigation(NavigationState.SERIES_DETAIL)
        
        // Mark that we came from search
        currentNavigationSource = NavigationSource.SEARCH
        
        // Clear focus from mainSideNav to prevent focus change triggering tab listener
        mainSideNav.clearFocus()
        
        // Hide search and reset its dimensions - set GONE first, THEN reset params
        val searchContainer = findViewById<FrameLayout>(R.id.searchContainer)
        searchContainer.visibility = android.view.View.GONE
        val searchParams = searchContainer.layoutParams as android.widget.LinearLayout.LayoutParams
        searchParams.weight = 0f
        searchParams.width = 0
        searchContainer.layoutParams = searchParams
        searchContainer.requestLayout()
        
        // Hide ALL sidebars (main sidenav too)
        val sideNavContainer = findViewById<FrameLayout>(R.id.sideNavContainer)
        val categorySidebarContainer = findViewById<FrameLayout>(R.id.categorySidebarContainer)
        sideNavContainer.visibility = android.view.View.GONE
        categorySidebarContainer.visibility = android.view.View.GONE
        
        // Show series detail container fullscreen
        val seriesContainer = findViewById<FrameLayout>(R.id.seriesDetailContainer)
        seriesContainer.visibility = android.view.View.VISIBLE
        
        // Initialize series detail with the correct provider before showing
        lifecycleScope.launch {
            seriesDetail.initializeWithProvider(providerId)
            withContext(Dispatchers.Main) {
                // Show series detail (VODItem already has proper URLs)
                seriesDetail.showSeries(
                    id = vodItem.id,
                    name = vodItem.name,
                    year = vodItem.year ?: "",
                    description = vodItem.description ?: "",
                    posterUrl = vodItem.posterUrl,
                    director = vodItem.director ?: "",
                    actors = vodItem.actors ?: "",
                    categoryName = "Search Results"
                )
                
                // Request focus on series detail to prevent focus going back to sidebar
                seriesDetail.requestFocus()
            }
        }
        
        Log.d(TAG, "Series detail shown, navigation stack: $navigationStack")
    }
    
    private fun showSeriesDetailFromSearch(movie: com.ronika.iptvnative.models.Movie) {
        Log.d(TAG, "Showing series detail from search: ${movie.name}")
        
        // Mark that we came from search
        currentNavigationSource = NavigationSource.SEARCH
        
        // Hide search
        val searchContainer = findViewById<FrameLayout>(R.id.searchContainer)
        searchContainer.visibility = android.view.View.GONE
        
        // Show series detail container
        val seriesContainer = findViewById<FrameLayout>(R.id.seriesDetailContainer)
        seriesContainer.visibility = android.view.View.VISIBLE
        
        // Build image URL
        val imageUrl = movie.screenshotUri ?: movie.screenshot ?: movie.coverBig ?: movie.cover ?: movie.poster
        val fullImageUrl = if (imageUrl?.startsWith("http") == true) imageUrl else "http://tv.stream4k.cc$imageUrl"
        
        // Show series detail
        seriesDetail.showSeries(
            id = movie.id,
            name = movie.name,
            year = movie.year,
            description = movie.description,
            posterUrl = fullImageUrl,
            director = movie.director,
            actors = movie.actors,
            categoryName = "Search Results"
        )
    }
    
    private fun hideVODAndShowSearch() {
        Log.d(TAG, "=== hideVODAndShowSearch START ===")
        Log.d(TAG, "Current navigation source: $currentNavigationSource")
        
        // Hide VOD container
        val vodContainer = findViewById<FrameLayout>(R.id.vodContainer)
        vodContainer.visibility = android.view.View.GONE
        Log.d(TAG, "VOD container hidden")
        
        // Show main sidenav, hide category sidebar
        val sideNavContainer = findViewById<FrameLayout>(R.id.sideNavContainer)
        val categorySidebarContainer = findViewById<FrameLayout>(R.id.categorySidebarContainer)
        sideNavContainer.visibility = android.view.View.VISIBLE
        categorySidebarContainer.visibility = android.view.View.GONE
        Log.d(TAG, "Sidebars configured: main=${sideNavContainer.visibility}, category=${categorySidebarContainer.visibility}")
        
        // Show search container with proper weight (takes remaining space after sidenav)
        val searchContainer = findViewById<FrameLayout>(R.id.searchContainer)
        val params = searchContainer.layoutParams as android.widget.LinearLayout.LayoutParams
        params.weight = 1.0f
        params.width = 0
        searchContainer.layoutParams = params
        searchContainer.visibility = android.view.View.VISIBLE
        searchContainer.requestLayout()
        Log.d(TAG, "Search container shown: visibility=${searchContainer.visibility}, weight=${params.weight}")
        
        // Restore focus to search results (don't clear search!)
        searchComponent.post {
            Log.d(TAG, "Restoring focus to search component")
            searchComponent.restoreFocusToResults()
        }
        
        Log.d(TAG, "=== hideVODAndShowSearch COMPLETE - search should now be visible with sidenav ===")
    }
    
    private fun hideSeriesDetailAndShowSearch() {
        Log.d(TAG, "=== hideSeriesDetailAndShowSearch START ===")
        Log.d(TAG, "Current navigation source: $currentNavigationSource")
        
        // Hide series detail container
        val seriesContainer = findViewById<FrameLayout>(R.id.seriesDetailContainer)
        seriesContainer.visibility = android.view.View.GONE
        
        // Show main sidenav, hide category sidebar
        val sideNavContainer = findViewById<FrameLayout>(R.id.sideNavContainer)
        val categorySidebarContainer = findViewById<FrameLayout>(R.id.categorySidebarContainer)
        sideNavContainer.visibility = android.view.View.VISIBLE
        categorySidebarContainer.visibility = android.view.View.GONE
        
        // Show search container with proper weight (takes remaining space after sidenav)
        val searchContainer = findViewById<FrameLayout>(R.id.searchContainer)
        val params = searchContainer.layoutParams as android.widget.LinearLayout.LayoutParams
        params.weight = 1.0f
        params.width = 0
        searchContainer.layoutParams = params
        searchContainer.visibility = android.view.View.VISIBLE
        searchContainer.requestLayout()
        Log.d(TAG, "Search container shown: visibility=${searchContainer.visibility}, weight=${params.weight}")
        
        // Restore focus to search results (don't clear search!)
        searchComponent.post {
            Log.d(TAG, "Restoring focus to search component")
            searchComponent.restoreFocusToResults()
        }
        
        Log.d(TAG, "=== hideSeriesDetailAndShowSearch COMPLETE - search should now be visible with sidenav ===")
    }
    
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        // Back button handling: handle search, categories, and main sidenav
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            val currentState = navigationHistory.getCurrentState()
            Log.d(TAG, "Back pressed, current screen: ${currentState?.screen}, history size: ${navigationHistory.getHistorySize()}")
            
            // Check if search has focus (textbox or results)
            val searchContainer = findViewById<FrameLayout>(R.id.searchContainer)
            if (searchContainer.visibility == android.view.View.VISIBLE && 
                (searchComponent.hasFocus() || searchComponent.findFocus() != null)) {
                Log.d(TAG, "Back pressed in search, returning focus to main sidenav")
                mainSideNav.requestFocusOnActiveTab()
                return true  // Consume the event
            }
            
            // Check if we're in category sidebar
            if (navigationHistory.isOnScreen(NavigationHistoryManager.Screen.CATEGORY_SIDEBAR)) {
                // Check if VOD grid is visible - if so, focus should go to category sidebar, not main sidenav
                val vodContainer = findViewById<FrameLayout>(R.id.vodContainer)
                if (vodContainer.visibility == android.view.View.VISIBLE && getCurrentNavigation() == NavigationState.VOD_GRID) {
                    Log.d(TAG, "Back pressed from VOD grid - returning focus to category sidebar")
                    
                    // Make sure category sidebar is visible before requesting focus
                    val sideNavContainer = findViewById<FrameLayout>(R.id.sideNavContainer)
                    val categorySidebarContainer = findViewById<FrameLayout>(R.id.categorySidebarContainer)
                    
                    Log.d(TAG, "Making sidebars visible: sideNav=${sideNavContainer.visibility}, categorySidebar=${categorySidebarContainer.visibility}")
                    
                    mainSideNav.disableFocus()
                    mainSideNav.collapse()
                    
                    sideNavContainer.visibility = android.view.View.VISIBLE
                    categorySidebarContainer.visibility = android.view.View.VISIBLE
                    
                    Log.d(TAG, "Sidebars now visible: sideNav=${sideNavContainer.visibility}, categorySidebar=${categorySidebarContainer.visibility}")
                    
                    // Resize VOD to 70% width to show sidebar
                    val params = vodContainer.layoutParams as android.widget.LinearLayout.LayoutParams
                    params.weight = 0.7f
                    params.width = 0
                    vodContainer.layoutParams = params
                    
                    Log.d(TAG, "VOD resized to 70%, requesting focus on category sidebar")
                    
                    // Return focus to category sidebar
                    val focusSuccess = categorySidebar.requestFocus()
                    Log.d(TAG, "Category sidebar focus request: $focusSuccess")
                    
                    // Re-enable main sidenav after a delay
                    scheduleEnableFocus(150)
                    return true
                }
                
                Log.d(TAG, "Back pressed in category sidebar, navigating to main sidenav")
                // Return focus to main sidenav on the source item
                val tab = when (currentSourceSection) {
                    NavigationHistoryManager.SourceSection.LIVE_TV -> MainSideNavComponent.Tab.LIVE_TV
                    NavigationHistoryManager.SourceSection.MOVIES -> MainSideNavComponent.Tab.MOVIES
                    NavigationHistoryManager.SourceSection.SERIES -> MainSideNavComponent.Tab.SERIES
                    NavigationHistoryManager.SourceSection.SEARCH -> MainSideNavComponent.Tab.SEARCH
                    else -> MainSideNavComponent.Tab.LIVE_TV
                }
                
                Log.d(TAG, "Returning focus to tab: $tab")
                
                // Set active tab WITHOUT notifying (prevents switching categories)
                mainSideNav.setActiveTab(tab, notify = false)
                // Request focus which will trigger focus listener and update currentSourceSection
                mainSideNav.requestFocusOnActiveTab()
                
                // Track navigation back
                navigationHistory.navigateBack()
                return true  // Consume the event
            } else {
                // We're at main sidenav level - show exit confirmation dialog
                Log.d(TAG, "Back pressed at main sidenav, showing exit dialog")
                showExitConfirmationDialog()
                return true
            }
        }
        
        return super.onKeyDown(keyCode, event)
    }
    
    private fun showExitConfirmationDialog() {
        val dialog = AlertDialog.Builder(this, R.style.ExitDialogTheme)
            .setTitle("Exit App")
            .setMessage("Are you sure you want to exit?")
            .setPositiveButton("Yes") { _, _ ->
                Log.d(TAG, "User confirmed exit")
                finish()
            }
            .setNegativeButton("No") { dialog, _ ->
                Log.d(TAG, "User cancelled exit")
                dialog.dismiss()
                // Return focus to main sidenav
                mainSideNav.requestFocusOnActiveTab()
            }
            .setCancelable(true)
            .create()
        
        dialog.setOnCancelListener {
            // Return focus to main sidenav when dialog is cancelled (back pressed on dialog)
            mainSideNav.requestFocusOnActiveTab()
        }
        
        dialog.show()
    }
    
    override fun onPause() {
        super.onPause()
        Log.d(TAG, "App paused - stopping all playback immediately")
        // Stop all playback immediately when app goes to background (Home button, etc)
        vodPlayer.stop()
        liveTVChannels.stopAllPlayback()
    }
    
    override fun onStop() {
        super.onStop()
        Log.d(TAG, "App stopped - ensuring playback is stopped")
        // Ensure playback is fully stopped
        vodPlayer.stop()
        liveTVChannels.stopAllPlayback()
    }
    
    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "App destroyed - cleaning up all resources")
        // Clean up all resources
        vodPlayer.release()
        liveTVChannels.stopAllPlayback()
        seriesDetail.cleanup()
    }
}
