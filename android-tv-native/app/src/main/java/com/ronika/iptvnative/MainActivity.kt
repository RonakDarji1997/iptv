package com.ronika.iptvnative

import android.content.Intent
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.app.AlertDialog
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.ScrollView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.Job
import android.net.Uri
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.ronika.iptvnative.adapters.CategoryAdapter
import com.ronika.iptvnative.adapters.ChannelAdapter
import com.ronika.iptvnative.adapters.ChannelRowAdapter
import com.ronika.iptvnative.api.ApiClient
import com.ronika.iptvnative.services.SubtitleService
import com.ronika.iptvnative.api.ChannelsRequest
import com.ronika.iptvnative.api.GenreRequest
import com.ronika.iptvnative.api.MoviesRequest
import com.ronika.iptvnative.models.Genre
import com.ronika.iptvnative.models.Channel
import com.ronika.iptvnative.models.Movie
import com.ronika.iptvnative.models.Series
import kotlinx.coroutines.launch
import com.ronika.iptvnative.managers.NavigationManager
import com.ronika.iptvnative.controllers.SidebarController

class MainActivity : ComponentActivity() {
    
    // UI Components - Top Navigation
    private lateinit var searchButton: android.widget.ImageView
    private lateinit var tvTab: android.widget.ImageView
    private lateinit var moviesTab: android.widget.ImageView
    private lateinit var showsTab: android.widget.ImageView
    private lateinit var sidebarContainer: LinearLayout
    // --- sidebar labels and profile name ---
    private lateinit var searchText: TextView
    private lateinit var tvText: TextView
    private lateinit var moviesText: TextView
    private lateinit var showsText: TextView
    private lateinit var profileNameText: TextView

    private lateinit var navigationManager: NavigationManager
    private var liveTVManager: LiveTVManager? = null
    
    // Direct Stalker client for VOD (no backend, no DB, no handshake)
    private val stalkerClient: com.ronika.iptvnative.api.StalkerClient by lazy {
        com.ronika.iptvnative.api.StalkerClient(
            portalUrl = "http://tv.stream4k.cc/stalker_portal/server/load.php",
            macAddress = "00:1a:79:17:f4:f5"
        )
    }
    
    // Cache for API responses to avoid redundant calls
    private data class CacheEntry<T>(
        val data: T,
        val timestamp: Long = System.currentTimeMillis()
    )
    
    private val contentCache = mutableMapOf<String, CacheEntry<List<Channel>>>()
    private val seriesCache = mutableMapOf<String, CacheEntry<List<Series>>>() // Cache for series metadata
    private val genresCache = mutableMapOf<String, CacheEntry<List<Genre>>>()
    private val CACHE_DURATION = 5 * 60 * 1000L // 5 minutes
    
    private fun <T> isCacheValid(entry: CacheEntry<T>?): Boolean {
        return entry != null && (System.currentTimeMillis() - entry.timestamp) < CACHE_DURATION
    }
    
    private fun clearCache() {
        contentCache.clear()
        seriesCache.clear()
        genresCache.clear()
    }
    
    // UI Components - Sidebar
    private lateinit var categorySidebar: LinearLayout
    private lateinit var categoryHeaderText: TextView
    private lateinit var categoriesRecycler: RecyclerView
    
    // UI Components - Content Area
    private lateinit var playerPreviewContainer: LinearLayout
    private lateinit var playerContainer: FrameLayout
    private lateinit var playerView: PlayerView
    private lateinit var contentHeader: LinearLayout
    private lateinit var contentListContainer: FrameLayout
    private lateinit var contentTitle: TextView
    private lateinit var contentSubtitle: TextView
    private lateinit var contentRecycler: RecyclerView
    private lateinit var emptyStateMessage: TextView
    private lateinit var loadingIndicator: ProgressBar
    
    // UI Components - Preview Panel
    private lateinit var previewPanel: ScrollView
    private lateinit var previewPoster: ImageView
    private lateinit var previewChannelName: TextView
    private lateinit var previewTime: TextView
    private lateinit var previewProgramInfo: TextView
    private lateinit var previewMetaRow: LinearLayout
    private lateinit var previewYear: TextView
    private lateinit var previewRating: TextView
    private lateinit var previewDuration: TextView
    private lateinit var previewGenres: TextView
    private lateinit var previewDescription: TextView
    private lateinit var previewCastContainer: LinearLayout
    private lateinit var previewActors: TextView
    private lateinit var previewDirectorContainer: LinearLayout
    private lateinit var previewDirector: TextView
    private lateinit var previewHint: TextView
    
    // Movie Details Header (above grid when browsing)
    private lateinit var movieDetailsHeaderGrid: LinearLayout
    private lateinit var detailPosterGrid: ImageView
    private lateinit var detailPosterTextGrid: TextView
    
    // Broadcast receiver for UI reload
    private lateinit var reloadReceiver: android.content.BroadcastReceiver
    private lateinit var detailTitleGrid: TextView
    private lateinit var detailYearGrid: TextView
    private lateinit var detailDurationGrid: TextView
    private lateinit var detailGenreGrid: TextView
    private lateinit var detailCastGrid: TextView
    private lateinit var detailDirectorGrid: TextView
    private lateinit var detailDescriptionGrid: TextView
    
    // Movie Details Overlay (fullscreen - shows for 3 seconds)
    private lateinit var movieDetailsHeader: LinearLayout
    private lateinit var detailPoster: ImageView
    private lateinit var detailPosterText: TextView
    private lateinit var detailTitle: TextView
    private lateinit var detailYear: TextView
    private lateinit var detailDuration: TextView
    private lateinit var detailGenre: TextView
    private lateinit var detailCast: TextView
    private lateinit var detailDirector: TextView
    private lateinit var detailDescription: TextView
    
    // Custom Player Controls
    private var progressContainer: LinearLayout? = null
    private var liveBadgeContainer: LinearLayout? = null
    private var rewindButton: View? = null
    private var forwardButton: View? = null
    private var fullscreenChannelName: TextView? = null
    
    // Players - Separate for Live TV and VOD
    private var livePlayer: ExoPlayer? = null
    private var vodPlayer: ExoPlayer? = null
    private var currentStreamUrl: String? = null
    private var currentPlayingChannel: Channel? = null
    private var currentPlayingCategoryId: String? = null  // Track which category has the playing channel
    
    // Live Subtitle Service (AI Generated)
    private var subtitleButton: ImageButton? = null
    private var liveSubtitleText: TextView? = null
    private var subtitleService: SubtitleService? = null
    private var isSubtitlesEnabled = false
    private var audioPermissionGranted = false
    private var currentPlayingCategoryIndex: Int = -1  // Track the index of the category that's playing
    private var isFullscreen = false
    private val controlsHideHandler = android.os.Handler(android.os.Looper.getMainLooper())
    private var controlsHideRunnable: Runnable? = null
    private var currentPlayingIndex = 0
    private var isOnMainNavigation = true
    
    // Series playback tracking
    private var isPlayingSeries = false
    private var currentSeriesId: String? = null
    private var currentSeriesName: String? = null
    private var currentSeriesPosterUrl: String? = null
    private var currentSeriesDescription: String? = null
    private var currentSeriesActors: String? = null
    private var currentSeriesDirector: String? = null
    private var currentSeriesYear: String? = null
    private var currentSeriesCountry: String? = null
    private var currentSeriesGenres: String? = null
    private var currentSeriesTotalSeasons: String? = null
    // Current episode tracking for navigation
    private var currentSeasonId: String? = null
    private var currentSeasonNumber: String? = null
    private var currentEpisodeId: String? = null
    private var currentEpisodeNumber: String? = null
    private var currentEpisodeName: String? = null
    
    // UI Components - Debug
    private lateinit var debugSelectedTab: TextView
    private lateinit var debugHoverTab: TextView
    private lateinit var debugSidebarState: TextView
    
    // Adapters
    private lateinit var categoryAdapter: CategoryAdapter
    private lateinit var channelAdapter: ChannelAdapter
    private lateinit var channelRowAdapter: ChannelRowAdapter
    private lateinit var movieCategoryRowAdapter: MovieCategoryRowAdapter
    
    // Netflix-style movie rows RecyclerView
    private lateinit var movieRowsRecycler: RecyclerView
    
    // Activity result launcher for MovieCategoryActivity
    private val movieCategoryResultLauncher = registerForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult()
    ) { result ->
        android.util.Log.d("MainActivity", "===== MovieCategoryActivity result received =====")
        android.util.Log.d("MainActivity", "Result code: ${result.resultCode}, OK=${android.app.Activity.RESULT_OK}")
        android.util.Log.d("MainActivity", "Result data: ${result.data}")
        
        if (result.resultCode == android.app.Activity.RESULT_OK) {
            result.data?.let { data ->
                val movieId = data.getStringExtra("movieId") ?: return@let
                val movieName = data.getStringExtra("movieName") ?: return@let
                val movieCmd = data.getStringExtra("movieCmd") ?: return@let
                val movieLogo = data.getStringExtra("movieLogo") ?: ""
                val categoryId = data.getStringExtra("categoryId") ?: ""
                
                android.util.Log.d("MainActivity", "✓ Received movie to play: $movieName")
                android.util.Log.d("MainActivity", "  - ID: $movieId")
                android.util.Log.d("MainActivity", "  - CMD: $movieCmd")
                android.util.Log.d("MainActivity", "  - selectedTab: $selectedTab")
                
                // Create channel object and play
                val channel = Channel(
                    id = movieId,
                    name = movieName,
                    number = "",
                    logo = movieLogo,
                    cmd = movieCmd,
                    genreId = categoryId
                )
                
                android.util.Log.d("MainActivity", "Calling onChannelSelected...")
                onChannelSelected(channel)
            }
        }
    }
    
    // State
    private var selectedTab = "TV"
    private var hoverTab = "TV"
    private var sidebarExpanded = true
    private var categories: List<Genre> = emptyList()
    private var selectedCategoryIndex = -1 // -1 means no category selected
    private var hasCategorySelected = false
    private var currentPage = 1
    private var isLoadingMore = false
    private var hasMorePages = true
    private val allChannels = mutableListOf<Channel>()
    private val allMovies = mutableListOf<Movie>() // Store full movie objects with metadata
    private val allSeries = mutableListOf<Series>() // Store full series objects with metadata
    private val seriesMap = mutableMapOf<String, Series>() // Map for instant series lookup by ID
    private var totalItemsCount = 0
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        
        // Keep screen on to prevent screensaver during playback
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        
        // Set API credentials with actual values
        // Using direct IP to bypass DNS issues (tv.stream4k.cc -> 172.66.167.27)
        ApiClient.setCredentials(
            mac = "00:1A:79:17:F4:F5",
            portal = "http://172.66.167.27/stalker_portal/server/load.php"
        )
        
        // Initialize views (must be done first)
        initializeViews()
        
        // Initialize user and database
        initializeUser()
        
        // Setup modern back press handling
        onBackPressedDispatcher.addCallback(this, object : androidx.activity.OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                handleBackButton()
            }
        })
        
        // Check if we're launching for series episode playback
        val playType = intent.getStringExtra("PLAY_TYPE")
        if (playType == "series") {
            handleSeriesPlayback()
            return // Skip normal UI setup
        }
        
        // Check if we're launching to play a movie from MovieCategoryActivity
        if (intent.getBooleanExtra("playMovie", false)) {
            handleMoviePlaybackIntent(intent)
        }
        
        // Setup adapters
        setupAdapters()
        
        // Setup listeners (keep logic outside of MainActivity for clarity)
        setupTabListeners()
        setupFocusListeners()
        
        android.util.Log.d("MainActivity", "✅ Focus listeners setup complete")
        
        // Load initial TV tab (selectedTab already defaults to "TV")
        switchTab("TV")
        
        // Set initial focus
        tvTab.requestFocus()
        updateDebugDisplay()
    }
    
    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent) // Update the activity's intent
        
        // Check if this is a series playback intent
        val playType = intent?.getStringExtra("PLAY_TYPE")
        if (playType == "series") {
            android.util.Log.d("MainActivity", "onNewIntent: Series playback requested")
            handleSeriesPlayback()
            return
        }
        
        // Handle movie playback if launched with movie data
        if (intent?.getBooleanExtra("playMovie", false) == true) {
            android.util.Log.d("MainActivity", "onNewIntent: Movie playback requested")
            handleMoviePlaybackIntent(intent)
        }
    }
    
    private fun handleSeriesPlayback() {
        val seriesId = intent.getStringExtra("SERIES_ID") ?: ""
        val seriesName = intent.getStringExtra("SERIES_NAME") ?: ""
        val seasonId = intent.getStringExtra("SEASON_ID") ?: ""
        val seasonNumber = intent.getStringExtra("SEASON_NUMBER") ?: ""
        val episodeId = intent.getStringExtra("EPISODE_ID") ?: ""
        val episodeNumber = intent.getStringExtra("EPISODE_NUMBER") ?: ""
        val episodeName = intent.getStringExtra("EPISODE_NAME") ?: ""
        val screenshot = intent.getStringExtra("SCREENSHOT_URL")
        val posterUrl = intent.getStringExtra("POSTER_URL")
        
        // Store series info for navigation back
        isPlayingSeries = true
        currentSeriesId = seriesId
        currentSeriesName = seriesName
        currentSeriesPosterUrl = posterUrl
        currentSeriesDescription = intent.getStringExtra("DESCRIPTION")
        currentSeriesActors = intent.getStringExtra("ACTORS")
        currentSeriesDirector = intent.getStringExtra("DIRECTOR")
        currentSeriesYear = intent.getStringExtra("YEAR")
        currentSeriesCountry = intent.getStringExtra("COUNTRY")
        currentSeriesGenres = intent.getStringExtra("GENRES")
        currentSeriesTotalSeasons = intent.getStringExtra("TOTAL_SEASONS")
        // Store current episode info for navigation
        currentSeasonId = seasonId
        currentSeasonNumber = seasonNumber
        currentEpisodeId = episodeId
        currentEpisodeNumber = episodeNumber
        currentEpisodeName = episodeName
        
        android.util.Log.d("MainActivity", "Series playback requested: $seriesName S${seasonNumber}E${episodeNumber}")
        android.util.Log.d("MainActivity", "SeriesId: $seriesId, SeasonId: $seasonId, EpisodeId: $episodeId")
        
        // Use the same fullscreen flow as movies
        android.util.Log.d("MainActivity", "Setting up fullscreen for series episode")
        sidebarContainer.visibility = View.GONE
        categorySidebar.visibility = View.GONE
        contentHeader.visibility = View.GONE
        contentListContainer.visibility = View.GONE
        previewPanel.visibility = View.GONE
        movieDetailsHeaderGrid.visibility = View.GONE
        
        // Make player/preview container take full screen
        playerPreviewContainer.visibility = View.VISIBLE
        val containerParams = playerPreviewContainer.layoutParams as LinearLayout.LayoutParams
        containerParams.weight = 1.0f
        playerPreviewContainer.layoutParams = containerParams
        
        // Show player in full screen
        playerContainer.visibility = View.VISIBLE
        val params = playerContainer.layoutParams as LinearLayout.LayoutParams
        params.weight = 1.0f
        playerContainer.layoutParams = params
        
        // Ensure PlayerView is visible
        playerView.visibility = View.VISIBLE
        
        // Set fullscreen flag
        isFullscreen = true
        
        // Fetch series file info and play using direct Stalker calls
        lifecycleScope.launch {
            try {
                android.util.Log.d("MainActivity", "Getting episode file info for series: $seriesId, season: $seasonId, episode: $episodeId")
                
                // Step 1: Get file info using direct Stalker call
                val fileInfo = stalkerClient.getEpisodeFileInfo(seriesId, seasonId, episodeId)
                
                if (fileInfo != null) {
                    // Get the file ID from the response
                    val fileId = fileInfo["id"] as? String
                    
                    if (fileId != null) {
                        android.util.Log.d("MainActivity", "Got file ID: $fileId")
                        
                        // Step 2: Construct the cmd parameter as /media/file_{id}.mpg
                        val cmd = "/media/file_${fileId}.mpg"
                        android.util.Log.d("MainActivity", "Constructed cmd: $cmd")
                        
                        // Step 3: Call create_link with the file cmd to get authenticated streaming URL
                        android.util.Log.d("MainActivity", "Calling create_link to get authenticated stream URL")
                        val streamUrlResponse = stalkerClient.getVodStreamUrl(cmd, type = "vod")
                        val streamUrl = streamUrlResponse.url
                        currentStreamUrl = streamUrl  // Track for subtitle service
                        
                        android.util.Log.d("MainActivity", "Got authenticated stream URL: $streamUrl")
                        
                        // Play the episode with authenticated URL
                        playSeriesEpisode(
                            streamUrl = streamUrl,
                            title = "$seriesName - $episodeName",
                            seasonNumber = seasonNumber,
                            episodeNumber = episodeNumber
                        )
                    } else {
                        android.util.Log.e("MainActivity", "No file ID in file info")
                        Toast.makeText(this@MainActivity, "Failed to get file ID", Toast.LENGTH_SHORT).show()
                    }
                } else {
                    android.util.Log.e("MainActivity", "No file info returned for episode")
                    android.widget.Toast.makeText(this@MainActivity, "Episode not available", android.widget.Toast.LENGTH_SHORT).show()
                    finish()
                }
            } catch (e: Exception) {
                android.util.Log.e("MainActivity", "Error loading series episode", e)
                android.widget.Toast.makeText(this@MainActivity, "Failed to load episode: ${e.message}", android.widget.Toast.LENGTH_SHORT).show()
                finish()
            }
        }
    }
    
    private fun handleMoviePlaybackIntent(intent: android.content.Intent) {
        val movieId = intent.getStringExtra("movieId") ?: return
        val movieName = intent.getStringExtra("movieName") ?: return
        val movieCmd = intent.getStringExtra("movieCmd") ?: return
        val movieLogo = intent.getStringExtra("movieLogo") ?: ""
        val categoryId = intent.getStringExtra("categoryId") ?: ""
        
        android.util.Log.d("MainActivity", "===== Movie playback from intent =====")
        android.util.Log.d("MainActivity", "Movie: $movieName")
        android.util.Log.d("MainActivity", "ID: $movieId, CMD: $movieCmd")
        
        // Switch to MOVIES tab first
        selectedTab = "MOVIES"
        
        // Create channel object and play
        val channel = Channel(
            id = movieId,
            name = movieName,
            number = "",
            logo = movieLogo,
            cmd = movieCmd,
            genreId = categoryId
        )
        
        // Play the movie using existing function
        lifecycleScope.launch {
            // Small delay to ensure UI is ready
            kotlinx.coroutines.delay(100)
            showMovieFullscreen(channel)
        }
    }
    
    private fun playSeriesEpisode(streamUrl: String, title: String, seasonNumber: String, episodeNumber: String) {
        android.util.Log.d("MainActivity", "===== playSeriesEpisode CALLED =====")
        android.util.Log.d("MainActivity", "Playing series episode: $title")
        android.util.Log.d("MainActivity", "Stream URL: $streamUrl")
        android.util.Log.d("MainActivity", "isPlayingSeries flag: $isPlayingSeries")
        android.util.Log.d("MainActivity", "isFullscreen flag: $isFullscreen")
        android.util.Log.d("MainActivity", "currentSeriesId: $currentSeriesId")
        android.util.Log.d("MainActivity", "currentSeriesName: $currentSeriesName")
        
        // Use the same playback logic as movies (VOD content)
        val isLive = false
        val contentType = "vod"
        val targetPlayer = vodPlayer
        
        try {
            android.util.Log.d("MainActivity", "Stopping all players...")
            livePlayer?.apply {
                stop()
                clearMediaItems()
            }
            vodPlayer?.apply {
                stop()
                clearMediaItems()
            }
                
            targetPlayer?.apply {
                currentStreamUrl = streamUrl  // Track for subtitle service
                android.util.Log.d("MainActivity", "Setting new media item...")
                val mediaItem = MediaItem.fromUri(streamUrl)
                setMediaItem(mediaItem)
                android.util.Log.d("MainActivity", "Preparing player...")
                prepare()
            }
            
            // Switch PlayerView to the appropriate player AFTER preparing media
            playerView.player = targetPlayer
            android.util.Log.d("MainActivity", "Switched PlayerView to VOD player")
            
            // Start playback
            targetPlayer?.apply {
                android.util.Log.d("MainActivity", "Starting playback...")
                playWhenReady = true
            }
            
            // Update player controls based on content type
            android.util.Log.d("MainActivity", "Calling updatePlayerControlsForContentType()")
            updatePlayerControlsForContentType()
            
            // Show player controller to display custom controls
            android.util.Log.d("MainActivity", "Calling showController()")
            playerView.showController()
            
            // Show episode navigation buttons for series
            android.util.Log.d("MainActivity", "Calling updateEpisodeNavigationVisibility()")
            updateEpisodeNavigationVisibility()
            
            // Log control visibility after setup
            val restartBtn = playerView.findViewById<ImageButton>(R.id.restart_button)
            val nextBtn = playerView.findViewById<ImageButton>(R.id.next_button)
            val progressBar = playerView.findViewById<LinearLayout>(R.id.progress_bar_container)
            val bottomControls = playerView.findViewById<LinearLayout>(R.id.bottom_controls_container)
            android.util.Log.d("MainActivity", "Controls after setup - restart: ${restartBtn?.visibility}, next: ${nextBtn?.visibility}, progress: ${progressBar?.visibility}, bottom: ${bottomControls?.visibility}")
            
            android.util.Log.d("MainActivity", "Player started successfully")
        } catch (e: Exception) {
            android.util.Log.e("MainActivity", "Error playing series episode: ${e.message}", e)
        }
    }
    
    private fun initializeViews() {
        // Top Navigation
        searchButton = findViewById(R.id.search_button)
        tvTab = findViewById(R.id.tab_tv)
        moviesTab = findViewById(R.id.tab_movies)
        showsTab = findViewById(R.id.tab_shows)
        sidebarContainer = findViewById(R.id.sidebar_container)
        
        // Sidebar
        categorySidebar = findViewById(R.id.category_sidebar)
        val sidebarDivider = findViewById<View>(R.id.sidebar_divider)
        // labels for expand/collapse
        searchText = findViewById(R.id.search_text)
        tvText = findViewById(R.id.tv_text)
        moviesText = findViewById(R.id.movies_text)
        showsText = findViewById(R.id.shows_text)
        profileNameText = findViewById(R.id.profile_name)
        categoryHeaderText = findViewById(R.id.category_header_text)
        categoriesRecycler = findViewById(R.id.categories_recycler)
        
        // Content Area
        playerPreviewContainer = findViewById(R.id.player_preview_container)
        playerContainer = findViewById(R.id.player_container)
        playerView = findViewById(R.id.player_view)
        
        // Configure SubtitleView for better visibility
        try {
            val subtitleView = playerView.subtitleView
            if (subtitleView != null) {
                subtitleView.setStyle(
                    androidx.media3.ui.CaptionStyleCompat(
                        android.graphics.Color.WHITE,
                        android.graphics.Color.BLACK,
                        android.graphics.Color.TRANSPARENT,
                        androidx.media3.ui.CaptionStyleCompat.EDGE_TYPE_DROP_SHADOW,
                        android.graphics.Color.BLACK,
                        android.graphics.Typeface.SANS_SERIF
                    )
                )
                subtitleView.setFixedTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 24f)
                subtitleView.setBottomPaddingFraction(0.1f)
                android.util.Log.d("MainActivity", "✅ SubtitleView configured with styling")
            } else {
                android.util.Log.w("MainActivity", "⚠️  SubtitleView is null")
            }
        } catch (e: Exception) {
            android.util.Log.e("MainActivity", "❌ Error configuring SubtitleView", e)
        }
        
        contentHeader = findViewById(R.id.content_header)
        contentListContainer = findViewById(R.id.content_list_container)
        contentTitle = findViewById(R.id.content_title)
        contentSubtitle = findViewById(R.id.content_subtitle)
        contentRecycler = findViewById(R.id.content_recycler)
        movieRowsRecycler = findViewById(R.id.movie_rows_recycler)
        emptyStateMessage = findViewById(R.id.empty_state_message)
        loadingIndicator = findViewById(R.id.loading_indicator)
        
        // Preview Panel
        previewPanel = findViewById(R.id.preview_panel)
        previewPoster = findViewById(R.id.preview_poster)
        previewChannelName = findViewById(R.id.preview_channel_name)
        previewTime = findViewById(R.id.preview_time)
        previewProgramInfo = findViewById(R.id.preview_program_info)
        previewMetaRow = findViewById(R.id.preview_meta_row)
        previewYear = findViewById(R.id.preview_year)
        previewRating = findViewById(R.id.preview_rating)
        previewDuration = findViewById(R.id.preview_duration)
        previewGenres = findViewById(R.id.preview_genres)
        previewDescription = findViewById(R.id.preview_description)
        previewCastContainer = findViewById(R.id.preview_cast_container)
        previewActors = findViewById(R.id.preview_actors)
        previewDirectorContainer = findViewById(R.id.preview_director_container)
        previewDirector = findViewById(R.id.preview_director)
        previewHint = findViewById(R.id.preview_hint)
        
        // Movie Details Header (Grid)
        movieDetailsHeaderGrid = findViewById(R.id.movie_details_header_grid)
        detailPosterGrid = findViewById(R.id.detail_poster_grid)
        detailPosterTextGrid = findViewById(R.id.detail_poster_text_grid)
        detailTitleGrid = findViewById(R.id.detail_title_grid)
        detailYearGrid = findViewById(R.id.detail_year_grid)
        detailDurationGrid = findViewById(R.id.detail_duration_grid)
        detailGenreGrid = findViewById(R.id.detail_genre_grid)
        detailCastGrid = findViewById(R.id.detail_cast_grid)
        detailDirectorGrid = findViewById(R.id.detail_director_grid)
        detailDescriptionGrid = findViewById(R.id.detail_description_grid)
        
        // Movie Details Overlay (Fullscreen)
        movieDetailsHeader = findViewById(R.id.movie_details_header)
        detailPoster = findViewById(R.id.detail_poster)
        detailPosterText = findViewById(R.id.detail_poster_text)
        detailTitle = findViewById(R.id.detail_title)
        detailYear = findViewById(R.id.detail_year)
        detailDuration = findViewById(R.id.detail_duration)
        detailGenre = findViewById(R.id.detail_genre)
        detailCast = findViewById(R.id.detail_cast)
        detailDirector = findViewById(R.id.detail_director)
        detailDescription = findViewById(R.id.detail_description)
        
        // Debug
        debugSelectedTab = findViewById(R.id.debug_selected_tab)
        debugHoverTab = findViewById(R.id.debug_hover_tab)
        debugSidebarState = findViewById(R.id.debug_sidebar_state)
        
        // Initialize players
        setupPlayers()

        // Initialize navigation manager (handles expand/collapse and styles)
        val sidebarFrame = findViewById<View>(R.id.sidebar_frame)
        navigationManager = NavigationManager(
            tvTab,
            moviesTab,
            showsTab,
            sidebarFrame,
            sidebarContainer,
            categorySidebar,
            sidebarDivider,
            searchText,
            tvText,
            moviesText,
            showsText,
            profileNameText
        )

        // Create SidebarController to keep MainActivity slim and move focus wiring
        val sidebarController = SidebarController(
            sidebarContainer,
            searchButton,
            tvTab,
            moviesTab,
            showsTab,
            searchText,
            tvText,
            moviesText,
            showsText,
            profileNameText,
            navigationManager
        )
        sidebarController.setup()

        // Register a small developer ADB-only hot-reload broadcast so we can quickly
        // apply UI state changes without reinstalling the whole app during dev.
        // Example (from host):
        // adb shell am broadcast -a com.ronika.iptvnative.RELOAD_UI --ez expand true
        // keep a reference so we can invoke controller APIs (like icon sizing)
        val sidebarControllerRef = sidebarController

        reloadReceiver = object : android.content.BroadcastReceiver() {
            override fun onReceive(context: android.content.Context?, intent: android.content.Intent?) {
                val expand = intent?.getBooleanExtra("expand", false) ?: false
                val collapsedDp = intent?.getIntExtra("collapsedDp", -1) ?: -1
                val expandedDp = intent?.getIntExtra("expandedDp", -1) ?: -1
                val categoryWidth = intent?.getIntExtra("categoryWidth", -1) ?: -1
                val iconSize = intent?.getIntExtra("iconSize", -1) ?: -1
                val fadeColor = intent?.getStringExtra("fadeColor")
                val spacing = intent?.getIntExtra("spacing", -1) ?: -1
                val sidebarBg = intent?.getStringExtra("sidebarBg")
                val activeStyle = intent?.getStringExtra("activeStyle")

                if (collapsedDp > 0 || expandedDp > 0 || categoryWidth > 0) {
                    navigationManager.updateSizes(
                        collapsedDp = if (collapsedDp > 0) collapsedDp else null,
                        expandedDp = if (expandedDp > 0) expandedDp else null,
                        categoryWidthDp = if (categoryWidth > 0) categoryWidth else null
                    )
                }
                if (iconSize > 0) {
                    sidebarControllerRef.updateIconSize(iconSize)
                }
                if (fadeColor != null) {
                    navigationManager.updateSidebarFade(fadeColor)
                }
                if (spacing > 0) {
                    sidebarControllerRef.updateSidebarSpacing(spacing)
                }
                if (sidebarBg != null) {
                    navigationManager.updateSidebarBackground(sidebarBg)
                }
                if (activeStyle != null) {
                    navigationManager.updateActiveItemStyle(activeStyle)
                }
                if (expand) navigationManager.expandSidebar()
                else navigationManager.collapseSidebar()
            }
        }
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(reloadReceiver, android.content.IntentFilter("com.ronika.iptvnative.RELOAD_UI"), android.content.Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(reloadReceiver, android.content.IntentFilter("com.ronika.iptvnative.RELOAD_UI"))
        }
        
        // Setup preview container focus behavior
        playerPreviewContainer.setOnFocusChangeListener { _, hasFocus ->
            if (hasFocus) {
                // White background when focused
                playerPreviewContainer.setBackgroundColor(android.graphics.Color.WHITE)
                // Show fullscreen hint
                if (selectedTab == "TV" && currentPlayingChannel != null) {
                    previewProgramInfo.text = "Press OK for fullscreen"
                }
            } else {
                // Transparent when not focused
                playerPreviewContainer.setBackgroundColor(android.graphics.Color.TRANSPARENT)
                // Restore normal preview info
                if (selectedTab == "TV" && currentPlayingChannel != null) {
                    previewProgramInfo.text = "Live TV"
                }
            }
        }
    }
    
    private fun setupPlayers() {
        // Setup Live TV Player
        livePlayer = ExoPlayer.Builder(this)
            .setSeekBackIncrementMs(10000)
            .setSeekForwardIncrementMs(10000)
            .build()
            .apply {
                // Add listener to track player state
                addListener(object : Player.Listener {
                    override fun onPlaybackStateChanged(playbackState: Int) {
                        when (playbackState) {
                            Player.STATE_IDLE -> android.util.Log.d("MainActivity", "Live Player: IDLE")
                            Player.STATE_BUFFERING -> android.util.Log.d("MainActivity", "Live Player: BUFFERING")
                            Player.STATE_READY -> android.util.Log.d("MainActivity", "Live Player: READY")
                            Player.STATE_ENDED -> android.util.Log.d("MainActivity", "Live Player: ENDED")
                        }
                    }
                    
                    override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                        android.util.Log.e("MainActivity", "Live Player error: ${error.message}", error)
                        android.util.Log.e("MainActivity", "Error type: ${error.errorCode}")
                        
                        // Try to recover from error
                        lifecycleScope.launch {
                            kotlinx.coroutines.delay(1000)
                            currentPlayingChannel?.let { channel ->
                                android.util.Log.d("MainActivity", "Attempting to recover playback")
                                playChannel(channel)
                            }
                        }
                    }
                    
                    override fun onIsPlayingChanged(isPlaying: Boolean) {
                        android.util.Log.d("MainActivity", "Live Player isPlaying: $isPlaying")
                    }
                })
            }
            
        // Setup VOD Player
        vodPlayer = ExoPlayer.Builder(this)
            .setSeekBackIncrementMs(10000)
            .setSeekForwardIncrementMs(10000)
            .build()
            .apply {
                addListener(object : Player.Listener {
                    override fun onPlaybackStateChanged(playbackState: Int) {
                        when (playbackState) {
                            Player.STATE_IDLE -> android.util.Log.d("MainActivity", "VOD Player: IDLE")
                            Player.STATE_BUFFERING -> android.util.Log.d("MainActivity", "VOD Player: BUFFERING")
                            Player.STATE_READY -> android.util.Log.d("MainActivity", "VOD Player: READY")
                            Player.STATE_ENDED -> android.util.Log.d("MainActivity", "VOD Player: ENDED")
                        }
                    }
                    
                    override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                        android.util.Log.e("MainActivity", "VOD Player error: ${error.message}", error)
                        android.util.Log.e("MainActivity", "Error type: ${error.errorCode}")
                    }
                    
                    override fun onIsPlayingChanged(isPlaying: Boolean) {
                        android.util.Log.d("MainActivity", "VOD Player isPlaying: $isPlaying")
                    }
                })
            }
        
        // Start with live player for TV tab
        playerView.player = livePlayer
        playerView.useController = true
        playerView.controllerAutoShow = true
        playerView.controllerShowTimeoutMs = 5000
        playerView.controllerHideOnTouch = false
        
        // Setup custom player controls after a short delay to ensure they're inflated
        playerView.post {
            setupCustomPlayerControls()
            setupPlayerControlsVisibility()
            startTimeUpdater()
        }
    }
    
    private fun setupCustomPlayerControls() {
        // Find new enhanced custom views
        val topInfoBar = playerView.findViewById<LinearLayout>(R.id.top_info_bar)
        val topGradient = playerView.findViewById<View>(R.id.top_gradient)
        val bottomGradient = playerView.findViewById<View>(R.id.bottom_gradient)
        val bottomControlsContainer = playerView.findViewById<LinearLayout>(R.id.bottom_controls_container)
        val contentTitle = playerView.findViewById<TextView>(R.id.content_title)
        val progressBarContainer = playerView.findViewById<LinearLayout>(R.id.progress_bar_container)
        val controlButtonsContainer = playerView.findViewById<LinearLayout>(R.id.control_buttons_container)
        val restartButton = playerView.findViewById<ImageButton>(R.id.restart_button)
        val nextButton = playerView.findViewById<ImageButton>(R.id.next_button)
        
        // Setup subtitle button and text
        subtitleButton = playerView.findViewById(R.id.subtitle_button)
        liveSubtitleText = findViewById(R.id.fullscreen_subtitle_text)  // Use fullscreen overlay, not player controls
        
        // Initialize subtitle service
        subtitleService = SubtitleService()
        
        // Setup subtitle button click listener with debouncing (1 second)
        var lastSubtitleToggleTime = 0L
        subtitleButton?.setOnClickListener {
            val now = System.currentTimeMillis()
            if (now - lastSubtitleToggleTime > 1000) { // Debounce: 1 second minimum between toggles
                lastSubtitleToggleTime = now
                toggleSubtitles()
            } else {
                android.util.Log.d("MainActivity", "⏭️ Ignoring rapid CC button click (debounced)")
            }
        }
        
        // Observe subtitle events
        lifecycleScope.launch {
            subtitleService?.subtitleFlow?.collect { event ->
                event?.let { handleSubtitleEvent(it) }
            }
        }
        
        liveBadgeContainer = playerView.findViewById(R.id.live_badge_container)
        val playPauseOverlay = playerView.findViewById<ImageView>(R.id.play_pause_overlay)
        val playerControlsRoot = playerView.findViewById<FrameLayout>(R.id.player_controls_root)
        
        // Clear old references (not used anymore)
        progressContainer = null
        rewindButton = null
        forwardButton = null
        fullscreenChannelName = null
        
        // Setup center click to toggle play/pause
        playerControlsRoot?.setOnClickListener {
            android.util.Log.d("MainActivity", "Player center clicked")
            if (isFullscreen) {
                // Only toggle play/pause if no control button has focus
                if (currentFocus == null || currentFocus == playerView || currentFocus == playerControlsRoot) {
                    playerView.player?.let { player ->
                        if (player.isPlaying) {
                            player.pause()
                        } else {
                            player.play()
                        }
                        showPlayPauseOverlay(player.isPlaying)
                    }
                }
            }
        }
        
        // Setup restart button
        restartButton?.setOnClickListener {
            android.util.Log.d("MainActivity", "Restart button clicked")
            playerView.player?.seekTo(0)
            playerView.player?.play()
            showPlayPauseOverlay(true)
            playerView.showController()
            scheduleControlsHide()
        }
        
        // Setup next button (for series)
        nextButton?.setOnClickListener {
            android.util.Log.d("MainActivity", "Next button clicked")
            playNextEpisode()
            playerView.showController()
            scheduleControlsHide()
        }
        
        // Setup key listeners for control buttons
        restartButton?.setOnKeyListener { _, keyCode, event ->
            if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
                android.util.Log.d("MainActivity", "⏯️ Restart button key: $keyCode")
                when (keyCode) {
                    KeyEvent.KEYCODE_DPAD_RIGHT -> {
                        if (isPlayingSeries) {
                            nextButton?.requestFocus()
                            true
                        } else {
                            false
                        }
                    }
                    KeyEvent.KEYCODE_DPAD_LEFT -> {
                        // Stay on restart button (leftmost)
                        true
                    }
                    KeyEvent.KEYCODE_DPAD_UP -> {
                        progressBarContainer?.requestFocus()
                        true
                    }
                    KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                        // Trigger click
                        restartButton?.performClick()
                        true
                    }
                    else -> false
                }
            } else {
                false
            }
        }
        
        nextButton?.setOnKeyListener { _, keyCode, event ->
            if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
                android.util.Log.d("MainActivity", "⏭️ Next button key: $keyCode")
                when (keyCode) {
                    KeyEvent.KEYCODE_DPAD_LEFT -> {
                        restartButton?.requestFocus()
                        true
                    }
                    KeyEvent.KEYCODE_DPAD_RIGHT -> {
                        // Navigate to subtitle button
                        val subtitleButton = playerView.findViewById<ImageButton>(R.id.subtitle_button)
                        subtitleButton?.requestFocus()
                        true
                    }
                    KeyEvent.KEYCODE_DPAD_UP -> {
                        progressBarContainer?.requestFocus()
                        true
                    }
                    KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                        // Trigger click
                        nextButton?.performClick()
                        true
                    }
                    else -> false
                }
            } else {
                false
            }
        }
        
        // Setup subtitle button key listener
        val subtitleButton = playerView.findViewById<ImageButton>(R.id.subtitle_button)
        subtitleButton?.setOnKeyListener { _, keyCode, event ->
            if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
                android.util.Log.d("MainActivity", "📺 Subtitle button key: $keyCode")
                when (keyCode) {
                    KeyEvent.KEYCODE_DPAD_LEFT -> {
                        // Navigate back to next button if visible, otherwise to restart
                        if (isPlayingSeries && nextButton?.visibility == View.VISIBLE) {
                            nextButton?.requestFocus()
                        } else {
                            restartButton?.requestFocus()
                        }
                        true
                    }
                    KeyEvent.KEYCODE_DPAD_RIGHT -> {
                        // Stay on subtitle button (rightmost)
                        true
                    }
                    KeyEvent.KEYCODE_DPAD_UP -> {
                        progressBarContainer?.requestFocus()
                        true
                    }
                    KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                        // Trigger click
                        subtitleButton?.performClick()
                        true
                    }
                    else -> false
                }
            } else {
                false
            }
        }
        
        // Setup progress bar container focus
        progressBarContainer?.isFocusable = true
        progressBarContainer?.isFocusableInTouchMode = true
        progressBarContainer?.setOnKeyListener { _, keyCode, event ->
            if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
                android.util.Log.d("MainActivity", "📏 Progress bar key: $keyCode")
                when (keyCode) {
                    KeyEvent.KEYCODE_DPAD_DOWN -> {
                        restartButton?.requestFocus()
                        true
                    }
                    KeyEvent.KEYCODE_DPAD_LEFT -> {
                        // Seek backward 10 seconds
                        playerView.player?.let { player ->
                            val newPos = (player.currentPosition - 10000).coerceAtLeast(0)
                            player.seekTo(newPos)
                            playerView.showController()
                            scheduleControlsHide()
                        }
                        true
                    }
                    KeyEvent.KEYCODE_DPAD_RIGHT -> {
                        // Seek forward 10 seconds
                        playerView.player?.let { player ->
                            val newPos = (player.currentPosition + 10000).coerceAtMost(player.duration)
                            player.seekTo(newPos)
                            playerView.showController()
                            scheduleControlsHide()
                        }
                        true
                    }
                    else -> false
                }
            } else {
                false
            }
        }
        
        // Setup player listener to update overlay icon
        playerView.player?.addListener(object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                playPauseOverlay?.setImageResource(
                    if (isPlaying) androidx.media3.ui.R.drawable.exo_icon_pause 
                    else androidx.media3.ui.R.drawable.exo_icon_play
                )
            }
        })
        
        // Show/hide next button based on series playback
        nextButton?.visibility = if (isPlayingSeries) View.VISIBLE else View.GONE
        
        // Ensure focus navigation works when next button is visible
        if (isPlayingSeries) {
            nextButton?.setNextFocusRightId(R.id.subtitle_button)
            restartButton?.setNextFocusRightId(R.id.next_button)
            nextButton?.requestLayout()
            restartButton?.requestLayout()
            android.util.Log.d("MainActivity", "🎯 [Line 1051] Focus set for SERIES: next→subtitle, restart→next (isPlayingSeries=$isPlayingSeries)")
        } else {
            restartButton?.setNextFocusRightId(R.id.subtitle_button)
            restartButton?.requestLayout()
            android.util.Log.d("MainActivity", "🎯 [Line 1051] Focus set for NON-SERIES: restart→subtitle (isPlayingSeries=$isPlayingSeries)")
        }
        
        // Update control visibility based on current channel
        updatePlayerControlsForContentType()
    }
    
    private fun showPlayPauseOverlay(isPlaying: Boolean) {
        val playPauseOverlay = playerView.findViewById<ImageView>(R.id.play_pause_overlay)
        playPauseOverlay?.let { overlay ->
            // Update icon based on playback state
            overlay.setImageResource(
                if (isPlaying) androidx.media3.ui.R.drawable.exo_icon_play 
                else androidx.media3.ui.R.drawable.exo_icon_pause
            )
            overlay.visibility = View.VISIBLE
            overlay.alpha = 0.9f
            
            overlay.postDelayed({
                overlay.animate().alpha(0f).setDuration(300).withEndAction {
                    overlay.visibility = View.GONE
                }
            }, 800)
        }
    }
    
    private fun playPreviousEpisode() {
        if (!isPlayingSeries || currentSeasonId == null || currentEpisodeNumber == null) {
            android.util.Log.d("MainActivity", "Cannot play previous episode - not in series mode")
            return
        }
        
        lifecycleScope.launch {
            try {
                val currentEpNum = currentEpisodeNumber?.toIntOrNull() ?: return@launch
                
                android.util.Log.d("MainActivity", "Loading previous episode before E$currentEpNum")
                
                // Load current season episodes directly from Stalker portal
                val responseMap = withContext(Dispatchers.IO) {
                    stalkerClient.getSeriesEpisodes(
                        currentSeriesId ?: "",
                        currentSeasonId ?: ""
                    )
                }
                
                android.util.Log.d("MainActivity", "Response keys: ${responseMap.keys}")
                
                // Parse the data - it could be a Map or List
                val episodesRaw = when (val data = responseMap["data"]) {
                    is List<*> -> data
                    is Map<*, *> -> (data as Map<String, Any>).values.toList()
                    else -> throw Exception("Unexpected data format: ${data?.javaClass?.name}")
                }
                
                // Debug: Log first episode to see available fields
                if (episodesRaw.isNotEmpty()) {
                    val firstEp = episodesRaw[0] as? Map<String, Any>
                    android.util.Log.d("MainActivity", "First episode keys: ${firstEp?.keys}")
                }
                
                // Convert to episode objects
                val sortedEpisodes = episodesRaw.mapNotNull { episodeItem ->
                    (episodeItem as? Map<String, Any>)?.let { ep ->
                        Triple(
                            ep["id"] as? String ?: "",
                            ep["name"] as? String ?: "",
                            ep["series_number"] as? String ?: ""
                        )
                    }
                }.sortedBy { it.third.toIntOrNull() ?: Int.MAX_VALUE }
                
                android.util.Log.d("MainActivity", "Found ${sortedEpisodes.size} episodes")
                android.util.Log.d("MainActivity", "Episode numbers: ${sortedEpisodes.map { it.third }}")
                
                // Find previous episode
                val currentIndex = sortedEpisodes.indexOfFirst { 
                    it.third.toIntOrNull() == currentEpNum 
                }
                
                android.util.Log.d("MainActivity", "Current episode E$currentEpNum is at index: $currentIndex, total: ${sortedEpisodes.size}")
                
                if (currentIndex > 0) {
                    val prevEpisode = sortedEpisodes[currentIndex - 1]
                    val (episodeId, episodeName, episodeNumber) = prevEpisode
                    
                    android.util.Log.d("MainActivity", "Found previous episode: $episodeName (E$episodeNumber)")
                    
                    // Update current episode tracking
                    currentEpisodeId = episodeId
                    currentEpisodeNumber = episodeNumber
                    currentEpisodeName = episodeName
                    
                    // Use the same flow as initial episode playback
                    // Step 1: Get file info
                    val fileInfo = withContext(Dispatchers.IO) {
                        stalkerClient.getEpisodeFileInfo(
                            currentSeriesId ?: "",
                            currentSeasonId ?: "",
                            episodeId
                        )
                    }
                    
                    if (fileInfo != null) {
                        val fileId = fileInfo["id"] as? String
                        
                        if (fileId != null) {
                            android.util.Log.d("MainActivity", "Got file ID: $fileId")
                            
                            // Step 2: Construct cmd parameter
                            val cmd = "/media/file_${fileId}.mpg"
                            android.util.Log.d("MainActivity", "Constructed cmd: $cmd")
                            
                            // Step 3: Get authenticated stream URL
                            val streamUrlResponse = withContext(Dispatchers.IO) {
                                stalkerClient.getVodStreamUrl(cmd, type = "vod")
                            }
                            val streamUrl = streamUrlResponse.url
                            
                            android.util.Log.d("MainActivity", "Got authenticated stream URL: $streamUrl")
                            
                            // Step 4: Play the episode
                            playSeriesEpisode(
                                streamUrl = streamUrl,
                                title = "$currentSeriesName - $episodeName",
                                seasonNumber = currentSeasonNumber ?: "",
                                episodeNumber = episodeNumber
                            )
                            
                            Toast.makeText(this@MainActivity, "Playing E$episodeNumber: $episodeName", Toast.LENGTH_SHORT).show()
                        } else {
                            android.util.Log.e("MainActivity", "No file ID in file info")
                            Toast.makeText(this@MainActivity, "Failed to get file ID", Toast.LENGTH_SHORT).show()
                        }
                    } else {
                        android.util.Log.e("MainActivity", "No file info returned")
                        Toast.makeText(this@MainActivity, "Unable to load episode", Toast.LENGTH_SHORT).show()
                    }
                } else {
                    android.util.Log.d("MainActivity", "Already at first episode")
                    Toast.makeText(this@MainActivity, "Already at first episode", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                android.util.Log.e("MainActivity", "Error loading previous episode", e)
                Toast.makeText(this@MainActivity, "Error loading previous episode", Toast.LENGTH_SHORT).show()
            }
        }
    }
    
    private fun playNextEpisode() {
        if (!isPlayingSeries || currentSeasonId == null || currentEpisodeNumber == null) {
            android.util.Log.d("MainActivity", "Cannot play next episode - not in series mode")
            return
        }
        
        lifecycleScope.launch {
            try {
                val currentEpNum = currentEpisodeNumber?.toIntOrNull() ?: return@launch
                
                android.util.Log.d("MainActivity", "Loading next episode after E$currentEpNum")
                
                // Load current season episodes directly from Stalker portal
                val responseMap = withContext(Dispatchers.IO) {
                    stalkerClient.getSeriesEpisodes(
                        currentSeriesId ?: "",
                        currentSeasonId ?: ""
                    )
                }
                
                android.util.Log.d("MainActivity", "Response keys: ${responseMap.keys}")
                
                // Parse the data - it could be a Map or List
                val episodesRaw = when (val data = responseMap["data"]) {
                    is List<*> -> data
                    is Map<*, *> -> (data as Map<String, Any>).values.toList()
                    else -> throw Exception("Unexpected data format: ${data?.javaClass?.name}")
                }
                
                // Debug: Log first episode to see available fields
                if (episodesRaw.isNotEmpty()) {
                    val firstEp = episodesRaw[0] as? Map<String, Any>
                    android.util.Log.d("MainActivity", "First episode keys: ${firstEp?.keys}")
                }
                
                // Convert to episode objects
                val sortedEpisodes = episodesRaw.mapNotNull { episodeItem ->
                    (episodeItem as? Map<String, Any>)?.let { ep ->
                        Triple(
                            ep["id"] as? String ?: "",
                            ep["name"] as? String ?: "",
                            ep["series_number"] as? String ?: ""
                        )
                    }
                }.sortedBy { it.third.toIntOrNull() ?: Int.MAX_VALUE }
                
                android.util.Log.d("MainActivity", "Found ${sortedEpisodes.size} episodes")
                android.util.Log.d("MainActivity", "Episode numbers: ${sortedEpisodes.map { it.third }}")
                
                // Find next episode
                val currentIndex = sortedEpisodes.indexOfFirst { 
                    it.third.toIntOrNull() == currentEpNum 
                }
                
                android.util.Log.d("MainActivity", "Current episode E$currentEpNum is at index: $currentIndex, total: ${sortedEpisodes.size}")
                
                if (currentIndex >= 0 && currentIndex < sortedEpisodes.size - 1) {
                    val nextEpisode = sortedEpisodes[currentIndex + 1]
                    val (episodeId, episodeName, episodeNumber) = nextEpisode
                    
                    android.util.Log.d("MainActivity", "Found next episode: $episodeName (E$episodeNumber)")
                    
                    // Update current episode tracking
                    currentEpisodeId = episodeId
                    currentEpisodeNumber = episodeNumber
                    currentEpisodeName = episodeName
                    
                    // Use the same flow as initial episode playback
                    // Step 1: Get file info
                    val fileInfo = withContext(Dispatchers.IO) {
                        stalkerClient.getEpisodeFileInfo(
                            currentSeriesId ?: "",
                            currentSeasonId ?: "",
                            episodeId
                        )
                    }
                    
                    if (fileInfo != null) {
                        val fileId = fileInfo["id"] as? String
                        
                        if (fileId != null) {
                            android.util.Log.d("MainActivity", "Got file ID: $fileId")
                            
                            // Step 2: Construct cmd parameter
                            val cmd = "/media/file_${fileId}.mpg"
                            android.util.Log.d("MainActivity", "Constructed cmd: $cmd")
                            
                            // Step 3: Get authenticated stream URL
                            val streamUrlResponse = withContext(Dispatchers.IO) {
                                stalkerClient.getVodStreamUrl(cmd, type = "vod")
                            }
                            val streamUrl = streamUrlResponse.url
                            
                            android.util.Log.d("MainActivity", "Got authenticated stream URL: $streamUrl")
                            
                            // Step 4: Play the episode
                            playSeriesEpisode(
                                streamUrl = streamUrl,
                                title = "$currentSeriesName - $episodeName",
                                seasonNumber = currentSeasonNumber ?: "",
                                episodeNumber = episodeNumber
                            )
                            
                            Toast.makeText(this@MainActivity, "Playing E$episodeNumber: $episodeName", Toast.LENGTH_SHORT).show()
                        } else {
                            android.util.Log.e("MainActivity", "No file ID in file info")
                            Toast.makeText(this@MainActivity, "Failed to get file ID", Toast.LENGTH_SHORT).show()
                        }
                    } else {
                        android.util.Log.e("MainActivity", "No file info returned")
                        Toast.makeText(this@MainActivity, "Unable to load episode", Toast.LENGTH_SHORT).show()
                    }
                } else {
                    android.util.Log.d("MainActivity", "Already at last episode")
                    Toast.makeText(this@MainActivity, "Already at last episode", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                android.util.Log.e("MainActivity", "Error loading next episode", e)
                Toast.makeText(this@MainActivity, "Error loading next episode: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }
    
    private fun updateEpisodeNavigationVisibility() {
        // Update controls to show/hide next button based on series playback
        updatePlayerControlsForContentType()
        android.util.Log.d("MainActivity", "Episode navigation visibility: ${if (isPlayingSeries) "VISIBLE" else "GONE"}")
    }
    
    private fun setupPlayerControlsVisibility() {
        // Show controls on any key press and schedule auto-hide
        playerView.setControllerVisibilityListener(
            androidx.media3.ui.PlayerView.ControllerVisibilityListener { visibility ->
                android.util.Log.d("MainActivity", "Controller visibility changed: $visibility")
                if (visibility == View.VISIBLE) {
                    scheduleControlsHide()
                    // Don't auto-focus - let user navigate with DOWN key
                    android.util.Log.d("MainActivity", "📺 Controls shown, waiting for user input")
                } else {
                    // Controls hidden - clear focus so MainActivity receives key events
                    android.util.Log.d("MainActivity", "🛡️ Controls hidden, clearing focus")
                    playerView.clearFocus()
                    cancelControlsHide()
                }
            }
        )
        
        // Set controller timeout to match our custom hide (3 seconds)
        playerView.controllerShowTimeoutMs = 3000
    }
    
    private fun startTimeUpdater() {
        // Time display removed from new controls - not needed anymore
    }
    
    private fun scheduleControlsHide() {
        // Cancel any existing hide task
        controlsHideRunnable?.let { controlsHideHandler.removeCallbacks(it) }
        
        // Schedule new hide task for 3 seconds
        controlsHideRunnable = Runnable {
            if (isFullscreen && playerView.player?.isPlaying == true) {
                playerView.hideController()
            }
        }
        controlsHideRunnable?.let { controlsHideHandler.postDelayed(it, 3000) }
    }
    
    private fun cancelControlsHide() {
        controlsHideRunnable?.let { controlsHideHandler.removeCallbacks(it) }
    }
    
    private fun updatePlayerControlsForContentType() {
        android.util.Log.d("MainActivity", "===== updatePlayerControlsForContentType CALLED =====")
        // If playing series, it's VOD content (not live) regardless of selectedTab
        val isLive = if (isPlayingSeries) {
            false
        } else {
            selectedTab == "TV" || currentPlayingChannel?.isLive == true
        }
        android.util.Log.d("MainActivity", "isLive: $isLive, selectedTab: $selectedTab, isFullscreen: $isFullscreen, isPlayingSeries: $isPlayingSeries")
        
        // Find new enhanced control elements
        val topGradient = playerView.findViewById<View>(R.id.top_gradient)
        val bottomGradient = playerView.findViewById<View>(R.id.bottom_gradient)
        val topInfoBar = playerView.findViewById<LinearLayout>(R.id.top_info_bar)
        val bottomControlsContainer = playerView.findViewById<LinearLayout>(R.id.bottom_controls_container)
        val contentTitle = playerView.findViewById<TextView>(R.id.content_title)
        val progressBarContainer = playerView.findViewById<LinearLayout>(R.id.progress_bar_container)
        val restartButton = playerView.findViewById<ImageButton>(R.id.restart_button)
        val nextButton = playerView.findViewById<ImageButton>(R.id.next_button)
        val liveBadgeContainer = playerView.findViewById<LinearLayout>(R.id.live_badge_container)
        
        android.util.Log.d("MainActivity", "Found views - topGradient: ${topGradient != null}, bottomGradient: ${bottomGradient != null}, topInfoBar: ${topInfoBar != null}")
        android.util.Log.d("MainActivity", "Found views - bottomControls: ${bottomControlsContainer != null}, restart: ${restartButton != null}, next: ${nextButton != null}, progress: ${progressBarContainer != null}")
        
        // Update content title with current playing content
        val titleText = when {
            isPlayingSeries -> {
                if (currentEpisodeName?.isNotEmpty() == true) {
                    "$currentSeriesName - $currentEpisodeName"
                } else {
                    currentSeriesName ?: currentPlayingChannel?.name ?: "Playing"
                }
            }
            else -> currentPlayingChannel?.name ?: "Playing"
        }
        contentTitle?.text = titleText
        
        // Show new enhanced controls only in fullscreen
        if (isFullscreen) {
            android.util.Log.d("MainActivity", "Showing controls - isLive: $isLive, isPlayingSeries: $isPlayingSeries")
            topGradient?.visibility = View.VISIBLE
            bottomGradient?.visibility = View.VISIBLE
            topInfoBar?.visibility = View.VISIBLE
            bottomControlsContainer?.visibility = if (isLive) View.GONE else View.VISIBLE
            
            // Show/hide progress bar vs LIVE badge
            progressBarContainer?.visibility = if (isLive) View.GONE else View.VISIBLE
            liveBadgeContainer?.visibility = if (isLive) View.VISIBLE else View.GONE
            
            // Show/hide buttons based on content type
            restartButton?.visibility = if (isLive) View.GONE else View.VISIBLE
            nextButton?.visibility = if (isPlayingSeries && !isLive) View.VISIBLE else View.GONE
            
            // Update focus navigation based on next button visibility
            if (isPlayingSeries && !isLive) {
                // Set up the focus chain: restart -> next -> subtitle
                restartButton?.setNextFocusRightId(R.id.next_button)
                nextButton?.setNextFocusRightId(R.id.subtitle_button)
                nextButton?.setNextFocusLeftId(R.id.restart_button)
                
                // Also update subtitle button to point back to next button
                val subtitleButton = findViewById<ImageButton>(R.id.subtitle_button)
                subtitleButton?.setNextFocusLeftId(R.id.next_button)
                
                // Force layout refresh
                restartButton?.requestLayout()
                nextButton?.requestLayout()
                subtitleButton?.requestLayout()
                
                android.util.Log.d("MainActivity", "🎯 [Line 1430] Focus chain for SERIES: restart→next→subtitle (isPlayingSeries=$isPlayingSeries, isLive=$isLive)")
                android.util.Log.d("MainActivity", "🔍 Verify: restartButton.nextFocusRightId=${restartButton?.nextFocusRightId} (should be ${R.id.next_button})")
                android.util.Log.d("MainActivity", "🔍 Verify: nextButton.nextFocusRightId=${nextButton?.nextFocusRightId} (should be ${R.id.subtitle_button})")
                android.util.Log.d("MainActivity", "🔍 Verify: subtitleButton.nextFocusLeftId=${subtitleButton?.nextFocusLeftId} (should be ${R.id.next_button})")
            } else {
                // For non-series: restart -> subtitle
                restartButton?.setNextFocusRightId(R.id.subtitle_button)
                val subtitleButton = findViewById<ImageButton>(R.id.subtitle_button)
                subtitleButton?.setNextFocusLeftId(R.id.restart_button)
                restartButton?.requestLayout()
                subtitleButton?.requestLayout()
                android.util.Log.d("MainActivity", "🎯 [Line 1430] Focus chain for NON-SERIES: restart→subtitle (isPlayingSeries=$isPlayingSeries, isLive=$isLive)")
            }
            
            android.util.Log.d("MainActivity", "Controls visibility set - restart: ${restartButton?.visibility}, next: ${nextButton?.visibility}, progress: ${progressBarContainer?.visibility}")
        } else {
            // Hide all enhanced controls when not in fullscreen
            topGradient?.visibility = View.GONE
            bottomGradient?.visibility = View.GONE
            topInfoBar?.visibility = View.GONE
            bottomControlsContainer?.visibility = View.GONE
        }
        
        android.util.Log.d("MainActivity", "Updated player controls - isLive: $isLive, isSeries: $isPlayingSeries, isFullscreen: $isFullscreen")
    }
    
    private fun setupAdapters() {
        // Category adapter
        categoryAdapter = CategoryAdapter { genre ->
            onCategorySelected(genre)
        }
        categoriesRecycler.apply {
            layoutManager = LinearLayoutManager(this@MainActivity)
            adapter = categoryAdapter
        }
        
        // Channel row adapter for Live TV
        channelRowAdapter = ChannelRowAdapter(
            onChannelSelected = { channel ->
                onChannelSelected(channel)
            },
            onChannelFocused = { channel ->
                // Show preview when hovering over a channel (without playing)
                if (selectedTab == "TV" && !isFullscreen) {
                    showPreviewForChannel(channel)
                }
            }
        )
        
        // Channel grid adapter for Movies/Series (legacy - kept for Series)
        channelAdapter = ChannelAdapter(
            onChannelSelected = { channel ->
                onChannelSelected(channel)
            },
            onChannelFocused = { channel ->
                // Show preview for movies/series when hovering
                if (selectedTab != "TV") {
                    showMoviePreview(channel)
                }
            }
        )
        
        // Netflix-style Movie Category Row Adapter
        movieCategoryRowAdapter = MovieCategoryRowAdapter(
            onMovieClick = { movie ->
                // Play movie
                val channel = Channel(
                    id = movie.id,
                    name = movie.name,
                    number = "",
                    logo = movie.getImageUrl() ?: "",
                    cmd = movie.cmd ?: "",
                    genreId = movie.categoryId
                )
                onChannelSelected(channel)
            },
            onViewAllClick = { categoryId, categoryTitle ->
                // Open category detail screen
                android.util.Log.d("MainActivity", "View All clicked for category: $categoryTitle")
                val intent = Intent(this@MainActivity, MovieCategoryActivity::class.java).apply {
                    putExtra("categoryId", categoryId)
                    putExtra("categoryTitle", categoryTitle)
                }
                movieCategoryResultLauncher.launch(intent)
            }
        )
        
        // Setup movie rows recycler
        movieRowsRecycler.apply {
            layoutManager = LinearLayoutManager(this@MainActivity)
            adapter = movieCategoryRowAdapter
            setHasFixedSize(false)
            isFocusable = false // Let children handle focus
            descendantFocusability = ViewGroup.FOCUS_AFTER_DESCENDANTS
            setItemViewCacheSize(5) // Cache 5 category rows
            isNestedScrollingEnabled = false // Better performance
            android.util.Log.d("MainActivity", "movieRowsRecycler setup complete with adapter and layoutManager")
        }
        
        // Will switch adapter based on selected tab
        setupContentAdapter()
    }
    
    private fun setupContentAdapter() {
        contentRecycler.apply {
            // Optimize view caching for better performance
            setItemViewCacheSize(10) // Cache 10 off-screen items
            setHasFixedSize(false) // Grid columns can change
            
            if (selectedTab == "TV") {
                // Use row layout for Live TV
                layoutManager = LinearLayoutManager(this@MainActivity)
                adapter = channelRowAdapter
                
                // Intercept key events to prevent LEFT from going to preview
                setOnKeyListener { _, keyCode, event ->
                    if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT && event.action == KeyEvent.ACTION_DOWN) {
                        // Let the main onKeyDown handler deal with it
                        return@setOnKeyListener false
                    }
                    false
                }
                
                // Add scroll listener for lazy loading
                clearOnScrollListeners()
                addOnScrollListener(object : RecyclerView.OnScrollListener() {
                    override fun onScrolled(recyclerView: RecyclerView, dx: Int, dy: Int) {
                        super.onScrolled(recyclerView, dx, dy)
                        val layoutManager = recyclerView.layoutManager as LinearLayoutManager
                        val visibleItemCount = layoutManager.childCount
                        val totalItemCount = layoutManager.itemCount
                        val firstVisibleItemPosition = layoutManager.findFirstVisibleItemPosition()
                        
                        if (!isLoadingMore && hasMorePages && dy > 0) {
                            if ((visibleItemCount + firstVisibleItemPosition) >= totalItemCount - 10) {
                                loadMoreContent()
                            }
                        }
                    }
                })
            } else {
                // Use grid layout for Movies/Series
                val displayMetrics = resources.displayMetrics
                val screenWidthPx = displayMetrics.widthPixels
                val density = displayMetrics.density
                
                // Calculate available width in pixels (check current visibility)
                val sidebarWidthPx = if (categorySidebar.visibility == View.VISIBLE) {
                    (360 * density).toInt() // 80dp main + 280dp categories
                } else {
                    (80 * density).toInt() // Only main sidebar
                }
                val paddingPx = (40 * density).toInt() // RecyclerView padding
                val availableWidthPx = screenWidthPx - sidebarWidthPx - paddingPx
                
                // Item dimensions (160dp card + 16dp margins = 176dp per item)
                val cardWidthDp = 160f
                val cardMarginDp = 8f * 2 // left + right margin (8dp each side)
                val itemTotalWidthDp = cardWidthDp + cardMarginDp
                val itemTotalWidthPx = (itemTotalWidthDp * density).toInt()
                
                // Calculate columns that fit in available width
                val columns = (availableWidthPx / itemTotalWidthPx).coerceAtLeast(3)
                
                android.util.Log.d("MainActivity", "Grid calculation: screenWidth=$screenWidthPx, available=$availableWidthPx, itemWidth=$itemTotalWidthPx, columns=$columns, categoriesVisible=${categorySidebar.visibility == View.VISIBLE}")
                
                layoutManager = GridLayoutManager(this@MainActivity, columns)
                adapter = channelAdapter
                
                // Disable item animations for smoother scrolling
                itemAnimator = null
                
                // Prevent focus from changing when items are added
                descendantFocusability = ViewGroup.FOCUS_BEFORE_DESCENDANTS
                isFocusable = false
                
                // Add scroll listener for smart prefetching
                clearOnScrollListeners()
                addOnScrollListener(object : RecyclerView.OnScrollListener() {
                    override fun onScrolled(recyclerView: RecyclerView, dx: Int, dy: Int) {
                        super.onScrolled(recyclerView, dx, dy)
                        val layoutManager = recyclerView.layoutManager as GridLayoutManager
                        val visibleItemCount = layoutManager.childCount
                        val totalItemCount = layoutManager.itemCount
                        val firstVisibleItemPosition = layoutManager.findFirstVisibleItemPosition()
                        
                        // Calculate current page based on scroll position (5 items per page)
                        val itemsPerPage = 5
                        val estimatedCurrentPage = (firstVisibleItemPosition / itemsPerPage) + 1
                        
                        // Smart prefetching: when user approaches a page, prefetch 2 pages ahead
                        if (!isLoadingMore && hasMorePages && dy > 0) {
                            // If approaching end of loaded content, prefetch next 2 pages
                            if ((visibleItemCount + firstVisibleItemPosition) >= totalItemCount - 10) {
                                android.util.Log.d("MainActivity", "Smart prefetch triggered at page ~$estimatedCurrentPage")
                                loadMoreContent()
                            }
                        }
                    }
                })
            }
        }
    }
    
    private fun setupTabListeners() {
        searchButton.setOnClickListener {
            showSearchDialog()
        }
        
        tvTab.setOnClickListener {
            android.util.Log.d("MainActivity", "📺 TV clicked - switching tab and hiding sidebar")
            switchTab("TV")
            hideSidebarAndShowContent()
        }
        
        moviesTab.setOnClickListener {
            android.util.Log.d("MainActivity", "🎬 MOVIES clicked - switching tab and hiding sidebar")
            switchTab("MOVIES")
            hideSidebarAndShowContent()
        }
        
        showsTab.setOnClickListener {
            android.util.Log.d("MainActivity", "📺 SHOWS clicked - switching tab and hiding sidebar")
            switchTab("SHOWS")
            hideSidebarAndShowContent()
        }
    }
    
    private fun hideSidebarAndShowContent() {
        // Set sidebar width to 0dp to prevent space reservation and keep it hidden
        val sidebarFrame = findViewById<FrameLayout>(R.id.sidebar_frame)
        sidebarFrame?.layoutParams = (sidebarFrame.layoutParams as? FrameLayout.LayoutParams)?.apply {
            width = 0
        }
        sidebarFrame?.visibility = View.GONE
        
        // Hide the sidebar overlay completely
        sidebarContainer.visibility = View.GONE
        categorySidebar.visibility = View.GONE
        
        // Show the main content area
        val mainContentArea = findViewById<LinearLayout>(R.id.main_content_area)
        mainContentArea?.visibility = View.VISIBLE
        
        // Restore normal backgrounds (not transparent)
        val mainContentLayout = findViewById<LinearLayout>(R.id.main_content_layout)
        mainContentLayout?.setBackgroundColor(android.graphics.Color.parseColor("#09090b"))
        mainContentArea?.setBackgroundColor(android.graphics.Color.parseColor("#09090b"))
        
        // Request focus on the content
        when (selectedTab) {
            "TV" -> {
                if (categoryAdapter.itemCount > 0) {
                    categoriesRecycler.requestFocus()
                }
            }
            "MOVIES" -> {
                if (contentListContainer.visibility == View.VISIBLE) {
                    contentRecycler.requestFocus()
                }
            }
            "SHOWS" -> {
                if (contentListContainer.visibility == View.VISIBLE) {
                    contentRecycler.requestFocus()
                }
            }
        }
        
        android.util.Log.d("MainActivity", "✅ Sidebar hidden, content shown for $selectedTab")
    }
    
    private fun setupFocusListeners() {
        searchButton.setOnFocusChangeListener { view, hasFocus ->
            android.util.Log.d("MainActivity", "🔍 SEARCH focus changed: hasFocus=$hasFocus")
            if (hasFocus) {
                view.setBackgroundResource(R.drawable.nav_item_focused)
                searchButton.imageTintList = android.content.res.ColorStateList.valueOf(android.graphics.Color.BLACK)
                android.util.Log.d("MainActivity", "🔍 SEARCH: Set BLACK tint, tintList=${searchButton.imageTintList}")
                navigationManager.expandSidebar()
            } else {
                view.setBackgroundResource(R.drawable.nav_item_normal)
                searchButton.imageTintList = android.content.res.ColorStateList.valueOf(android.graphics.Color.WHITE)
                android.util.Log.d("MainActivity", "🔍 SEARCH: Set WHITE tint, tintList=${searchButton.imageTintList}")
                sidebarContainer.postDelayed({
                    if (!isAnySidebarFocused()) navigationManager.collapseSidebar()
                }, 200)
            }
        }
        
        tvTab.setOnFocusChangeListener { view, hasFocus ->
            android.util.Log.d("MainActivity", "📺 TV focus changed: hasFocus=$hasFocus")
            if (hasFocus) {
                hoverTab = "TV"
                view.setBackgroundResource(R.drawable.nav_item_focused)
                tvTab.imageTintList = android.content.res.ColorStateList.valueOf(android.graphics.Color.BLACK)
                android.util.Log.d("MainActivity", "📺 TV: Set BLACK tint, tintList=${tvTab.imageTintList}")
                navigationManager.expandSidebar()
                updateDebugDisplay()
            } else {
                view.setBackgroundResource(R.drawable.nav_item_normal)
                tvTab.imageTintList = android.content.res.ColorStateList.valueOf(android.graphics.Color.WHITE)
                android.util.Log.d("MainActivity", "📺 TV: Set WHITE tint, tintList=${tvTab.imageTintList}")
                sidebarContainer.postDelayed({
                    if (!isAnySidebarFocused()) navigationManager.collapseSidebar()
                }, 200)
            }
        }
        
        tvTab.setOnKeyListener { _, keyCode, event ->
            if (event.action == android.view.KeyEvent.ACTION_DOWN && keyCode == android.view.KeyEvent.KEYCODE_DPAD_RIGHT) {
                android.util.Log.d("MainActivity", "📺 TV: Right D-pad pressed - switching and hiding sidebar")
                switchTab("TV")
                hideSidebarAndShowContent()
                return@setOnKeyListener true
            }
            false
        }
        
        moviesTab.setOnFocusChangeListener { view, hasFocus ->
            android.util.Log.d("MainActivity", "🎬 MOVIES focus changed: hasFocus=$hasFocus")
            if (hasFocus) {
                hoverTab = "MOVIES"
                view.setBackgroundResource(R.drawable.nav_item_focused)
                moviesTab.imageTintList = android.content.res.ColorStateList.valueOf(android.graphics.Color.BLACK)
                android.util.Log.d("MainActivity", "🎬 MOVIES: Set BLACK tint, tintList=${moviesTab.imageTintList}")
                navigationManager.expandSidebar()
                updateDebugDisplay()
            } else {
                view.setBackgroundResource(R.drawable.nav_item_normal)
                moviesTab.imageTintList = android.content.res.ColorStateList.valueOf(android.graphics.Color.WHITE)
                android.util.Log.d("MainActivity", "🎬 MOVIES: Set WHITE tint, tintList=${moviesTab.imageTintList}")
                sidebarContainer.postDelayed({
                    if (!isAnySidebarFocused()) navigationManager.collapseSidebar()
                }, 200)
            }
        }
        
        moviesTab.setOnKeyListener { _, keyCode, event ->
            if (event.action == android.view.KeyEvent.ACTION_DOWN && keyCode == android.view.KeyEvent.KEYCODE_DPAD_RIGHT) {
                android.util.Log.d("MainActivity", "🎬 MOVIES: Right D-pad pressed - switching and hiding sidebar")
                switchTab("MOVIES")
                hideSidebarAndShowContent()
                return@setOnKeyListener true
            }
            false
        }
        
        showsTab.setOnFocusChangeListener { view, hasFocus ->
            android.util.Log.d("MainActivity", "📺 SHOWS focus changed: hasFocus=$hasFocus")
            if (hasFocus) {
                hoverTab = "SHOWS"
                view.setBackgroundResource(R.drawable.nav_item_focused)
                showsTab.imageTintList = android.content.res.ColorStateList.valueOf(android.graphics.Color.BLACK)
                android.util.Log.d("MainActivity", "📺 SHOWS: Set BLACK tint, tintList=${showsTab.imageTintList}")
                navigationManager.expandSidebar()
                updateDebugDisplay()
            } else {
                view.setBackgroundResource(R.drawable.nav_item_normal)
                showsTab.imageTintList = android.content.res.ColorStateList.valueOf(android.graphics.Color.WHITE)
                android.util.Log.d("MainActivity", "📺 SHOWS: Set WHITE tint, tintList=${showsTab.imageTintList}")
                sidebarContainer.postDelayed({
                    if (!isAnySidebarFocused()) navigationManager.collapseSidebar()
                }, 200)
            }
        }
        
        showsTab.setOnKeyListener { _, keyCode, event ->
            if (event.action == android.view.KeyEvent.ACTION_DOWN && keyCode == android.view.KeyEvent.KEYCODE_DPAD_RIGHT) {
                android.util.Log.d("MainActivity", "📺 SHOWS: Right D-pad pressed - switching and hiding sidebar")
                switchTab("SHOWS")
                hideSidebarAndShowContent()
                return@setOnKeyListener true
            }
            false
        }
    }
    
    private fun isAnySidebarFocused(): Boolean {
        return searchButton.hasFocus() || tvTab.hasFocus() || moviesTab.hasFocus() || showsTab.hasFocus()
    }
    
    private fun switchTab(tab: String) {
        // Store previous tab to check if we're switching or returning
        val previousTab = selectedTab
        
        // Restore content alpha if it was dimmed
        categorySidebar.alpha = 1f
        findViewById<FrameLayout>(R.id.content_list_container)?.alpha = 1f
        findViewById<LinearLayout>(R.id.content_header)?.alpha = 1f
        
        // Stop live player if switching away from TV tab
        if (selectedTab == "TV" && tab != "TV") {
            android.util.Log.d("MainActivity", "Switching from TV to $tab - stopping live player")
            liveTVManager?.cleanup()
            livePlayer?.apply {
                stop()
                clearMediaItems()
            }
            currentPlayingChannel = null
        }
        
        // Stop VOD player if switching away from movies/shows
        if ((selectedTab == "MOVIES" || selectedTab == "SHOWS") && tab == "TV") {
            android.util.Log.d("MainActivity", "Switching to TV - stopping VOD player")
            vodPlayer?.apply {
                stop()
                clearMediaItems()
            }
        }
        
        selectedTab = tab
        
        // Only reset category selection if switching between DIFFERENT tabs
        // This preserves the selected category when returning to the same tab
        if (previousTab != tab) {
            selectedCategoryIndex = -1
            hasCategorySelected = false
            // Clear playing state when switching tabs
            currentPlayingChannel = null
            currentPlayingCategoryId = null
            currentPlayingCategoryIndex = -1
            currentPlayingIndex = 0
            // Clear adapters play positions
            channelRowAdapter.setPlayingPosition(-1)
            categoryAdapter.setActivePosition(-1)
        }
        
        // Handle TV tab with new LiveTVManager
        if (tab == "TV") {
            // Hide entire sidebar frame for full-screen Live TV
            findViewById<FrameLayout>(R.id.sidebar_frame)?.visibility = View.GONE
            categorySidebar.visibility = View.GONE
            
            // Show new Live TV UI and initialize manager if needed
            val liveTVContainer = findViewById<FrameLayout>(R.id.live_tv_container)
            liveTVContainer.visibility = View.VISIBLE
            
            // Hide main content area (the parent LinearLayout)
            findViewById<LinearLayout>(R.id.main_content_area)?.visibility = View.GONE
            
            // Initialize LiveTVManager if not already created
            if (liveTVManager == null) {
                liveTVManager = LiveTVManager(this)
            }
            
            // Load categories and channels
            liveTVManager?.loadCategories()
            
        } else {
            // Hide Live TV UI
            findViewById<FrameLayout>(R.id.live_tv_container)?.visibility = View.GONE
            
            // Show main content area (the parent LinearLayout)
            findViewById<LinearLayout>(R.id.main_content_area)?.visibility = View.VISIBLE
            
            if (tab == "MOVIES") {
                // For Movies: Hide sidebar container
                android.util.Log.d("MainActivity", "switchTab(MOVIES) - Hiding sidebar container")
                sidebarContainer.visibility = View.GONE
                categorySidebar.visibility = View.GONE
                android.util.Log.d("MainActivity", "switchTab(MOVIES) - sidebarContainer visibility after: ${sidebarContainer.visibility}")
                
                // Show content area children
                findViewById<LinearLayout>(R.id.player_preview_container)?.visibility = View.GONE
                findViewById<LinearLayout>(R.id.content_header)?.visibility = View.GONE
                findViewById<FrameLayout>(R.id.content_list_container)?.visibility = View.VISIBLE
            } else {
                // For Shows: Show sidebar frame and categories
                findViewById<FrameLayout>(R.id.sidebar_frame)?.visibility = View.VISIBLE
                sidebarContainer.visibility = View.GONE
                categorySidebar.visibility = View.VISIBLE
                
                // Show old content area children
                findViewById<LinearLayout>(R.id.player_preview_container)?.visibility = View.VISIBLE
                findViewById<LinearLayout>(R.id.content_header)?.visibility = View.VISIBLE
                findViewById<FrameLayout>(R.id.content_list_container)?.visibility = View.VISIBLE
            }
            
            setupContentAdapter() // Switch between row/grid adapter
            loadCategories()
        }
        
        updateTabStyles()
        updateDebugDisplay()
    }
    
    private fun updateTabStyles() {
        // No longer needed - focus listeners handle all icon styling
        // (white bg + black icon when focused, dark bg + white icon when not focused)
    }
    
    private fun updateDebugDisplay() {
        debugSelectedTab.text = "Selected: $selectedTab"
        debugHoverTab.text = "Hover: $hoverTab"
        debugSidebarState.text = "Sidebar: ${if (sidebarExpanded) "Expanded" else "Collapsed"}"
    }
    
    private fun toggleSidebar() {
        sidebarExpanded = !sidebarExpanded
        categorySidebar.visibility = if (sidebarExpanded) View.VISIBLE else View.GONE
        updateDebugDisplay()
    }
    
    private fun loadCategories() {
        android.util.Log.d("MainActivity", "loadCategories called for tab: $selectedTab")
        lifecycleScope.launch {
            try {
                android.util.Log.d("MainActivity", "Starting to load categories")
                loadingIndicator.visibility = View.VISIBLE
                
                when (selectedTab) {
                    "TV" -> {
                        android.util.Log.d("MainActivity", "Loading TV genres")
                        // Show player/preview container and "All Playlists" header for TV
                        playerPreviewContainer.visibility = View.VISIBLE
                        categoryHeaderText.visibility = View.VISIBLE
                        movieDetailsHeaderGrid.visibility = View.GONE
                        movieDetailsHeader.visibility = View.GONE
                        
                        val response = ApiClient.apiService.getGenres(
                            GenreRequest(ApiClient.macAddress, ApiClient.portalUrl)
                        )
                        // Filter out non-numeric category IDs
                        categories = response.genres.filter { genre ->
                            genre.id.toIntOrNull() != null
                        }
                        categoryAdapter.setCategories(categories)
                        
                        // Auto-select first category for TV and load channels
                        if (categories.isNotEmpty()) {
                            selectedCategoryIndex = 0
                            hasCategorySelected = true
                            categoryAdapter.setActivePosition(0)
                            // Start with fullscreen view - both sidebars hidden
                            sidebarContainer.visibility = View.GONE
                            categorySidebar.visibility = View.GONE
                            loadChannels(categories[0].id)
                            // Focus on first channel
                            contentRecycler.requestFocus()
                            contentRecycler.post {
                                contentRecycler.getChildAt(0)?.requestFocus()
                            }
                        }
                    }
                    "MOVIES" -> {
                        android.util.Log.d("MainActivity", "=== MOVIES TAB SELECTED ===")
                        
                        // Stop Live TV player
                        liveTVManager?.cleanup()
                        livePlayer?.apply {
                            stop()
                            clearMediaItems()
                        }
                        
                        // Hide player/preview container and "All Playlists" header for movies
                        playerPreviewContainer.visibility = View.GONE
                        categoryHeaderText.visibility = View.GONE
                        movieDetailsHeaderGrid.visibility = View.GONE
                        movieDetailsHeader.visibility = View.GONE
                        contentRecycler.visibility = View.GONE
                        emptyStateMessage.visibility = View.GONE
                        
                        // Show Netflix-style movie rows
                        android.util.Log.d("MainActivity", "Setting movieRowsRecycler to VISIBLE")
                        movieRowsRecycler.visibility = View.VISIBLE
                        contentRecycler.visibility = View.GONE
                        
                        // Debug parent hierarchy
                        var parent = movieRowsRecycler.parent as? View
                        var level = 1
                        while (parent != null && level < 5) {
                            android.util.Log.d("MainActivity", "Parent $level: ${parent.javaClass.simpleName} - visibility: ${parent.visibility}, width: ${parent.width}, height: ${parent.height}, measuredWidth: ${parent.measuredWidth}, measuredHeight: ${parent.measuredHeight}")
                            parent = parent.parent as? View
                            level++
                        }
                        
                        // Get all VOD categories (both movies and series come from type=vod)
                        val response = stalkerClient.getVodCategories(type = "vod")
                        android.util.Log.d("MainActivity", "Got ${response.genres.size} VOD categories")
                        
                        // Filter only non-numeric category IDs - show ALL categories including ADULT
                        categories = response.genres
                            .filter { it.id.toIntOrNull() != null }
                            .sortedWith(compareBy(
                                { (it.censored ?: 0) != 0 }, // Non-censored first (false < true), treat null as 0
                                { 
                                    // Sort English alphabet first, then non-English
                                    val name = (it.title ?: it.name ?: "").trim()
                                    val firstChar = name.firstOrNull() ?: ' '
                                    !firstChar.isLetter() || firstChar.code > 127 // Non-English/special chars = true (sorts after)
                                },
                                { (it.title ?: it.name ?: "").lowercase().trim() } // Then alphabetically within each group
                            ))
                        
                        android.util.Log.d("MainActivity", "Filtered to ${categories.size} categories (sorted: non-adult first, English alphabet, then other languages, all alphabetical)")
                        
                        // Load categories intelligently - check first page to determine content
                        loadMovieRows(categories, contentType = "movie")
                    }
                    "SHOWS" -> {
                        // For Series, use same Netflix-style rows as Movies, FULLY hide sidebars
                        sidebarContainer.visibility = View.GONE
                        categorySidebar.visibility = View.GONE
                        contentRecycler.visibility = View.GONE
                        emptyStateMessage.visibility = View.GONE
                        movieRowsRecycler.visibility = View.VISIBLE
                        categoryHeaderText.visibility = View.GONE
                        movieDetailsHeaderGrid.visibility = View.GONE
                        movieDetailsHeader.visibility = View.GONE
                        playerPreviewContainer.visibility = View.GONE
                        
                        // Get all VOD categories (both movies and series come from type=vod)
                        val response = stalkerClient.getVodCategories(type = "vod")
                        
                        // Filter only non-numeric category IDs - show ALL categories including ADULT
                        categories = response.genres
                            .filter { it.id.toIntOrNull() != null }
                            .sortedWith(compareBy(
                                { (it.censored ?: 0) != 0 }, // Non-censored first (false < true), treat null as 0
                                { 
                                    // Sort English alphabet first, then non-English
                                    val name = (it.title ?: it.name ?: "").trim()
                                    val firstChar = name.firstOrNull() ?: ' '
                                    !firstChar.isLetter() || firstChar.code > 127 // Non-English/special chars = true (sorts after)
                                },
                                { (it.title ?: it.name ?: "").lowercase().trim() } // Then alphabetically within each group
                            ))
                        
                        android.util.Log.d("MainActivity", "Filtered to ${categories.size} categories (sorted: non-adult first, English alphabet, then other languages, all alphabetical)")
                        
                        // Load categories intelligently - check first page to determine if movie or series
                        loadMovieRows(categories, contentType = "series")
                    }
                }
                
                android.util.Log.d("MainActivity", "Categories loaded successfully")
                loadingIndicator.visibility = View.GONE
            } catch (e: Exception) {
                android.util.Log.e("MainActivity", "Error loading categories: ${e.message}", e)
                e.printStackTrace()
                loadingIndicator.visibility = View.GONE
            }
        }
    }
    
    private fun loadMovieRows(categories: List<Genre>, contentType: String = "movie") {
        android.util.Log.d("MainActivity", "loadMovieRows - Loading ${contentType}s for ${categories.size} categories")
        
        // Clear existing rows immediately
        movieCategoryRowAdapter.setCategoryRows(emptyList())
        
        // Track if we've set focus on the first row
        var hasSetFocusOnFirstRow = false
        
        // Load categories SEQUENTIALLY (not parallel) to reduce lag
        // Load ALL categories but optimize rendering
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                // Process categories sequentially to avoid overwhelming the system
                categories.forEach { category ->
                    android.util.Log.d("MainActivity", "🚀 Loading category: ${category.title ?: category.name}")
                    try {
                        val response = stalkerClient.getVodItems(
                            categoryId = category.id,
                            page = 1,
                            type = "vod"
                        )
                        
                        android.util.Log.d("MainActivity", "Got ${response.items.data.size} items for ${category.title ?: category.name}")
                        
                        // Smart filtering: Check first page to determine content type
                        val filteredItems = if (contentType == "movie") {
                            response.items.data.filter { item ->
                                val isSeries = item.isSeries ?: "0"
                                isSeries == "0" // Only movies
                            }
                        } else {
                            response.items.data.filter { item ->
                                val isSeries = item.isSeries ?: "0"
                                isSeries != "0" // Only series
                            }
                        }
                        
                        android.util.Log.d("MainActivity", "Filtered to ${filteredItems.size} ${contentType}s (is_series=${if (contentType == "movie") "0" else "!=0"})")
                        
                        // If loading series, populate seriesMap with full metadata
                        if (contentType == "series" && filteredItems.isNotEmpty()) {
                                filteredItems.forEach { movie ->
                                    val series = Series(
                                        id = movie.id,
                                        name = movie.name,
                                        year = movie.year,
                                        poster = movie.poster,
                                        screenshot = movie.screenshot,
                                        screenshotUri = movie.screenshotUri,
                                        cover = movie.cover,
                                        coverBig = movie.coverBig,
                                        ratingImdb = movie.ratingImdb,
                                        categoryId = movie.categoryId,
                                        description = movie.description,
                                        actors = movie.actors,
                                        director = movie.director,
                                        country = movie.country,
                                        genresStr = movie.genresStr,
                                        originalName = movie.originalName,
                                        totalEpisodes = movie.totalEpisodes
                                    )
                                    seriesMap[series.id] = series
                                }
                                android.util.Log.d("MainActivity", "📚 Added ${filteredItems.size} series to seriesMap from category ${category.title}. Total in map: ${seriesMap.size}")
                        }
                        
                        if (filteredItems.isNotEmpty()) {
                            val newRow = MovieCategoryRowAdapter.CategoryRow(
                                categoryId = category.id,
                                categoryTitle = (category.title ?: category.name) ?: "Unknown",
                                movies = filteredItems // Show all items with optimized image loading
                            )
                            
                            // Add row to UI immediately as it loads
                            withContext(Dispatchers.Main) {
                                movieCategoryRowAdapter.addCategoryRow(newRow)
                                android.util.Log.d("MainActivity", "✅ Instantly added category row: ${newRow.categoryTitle} with ${newRow.movies.size} items")
                                
                                // Set focus on first row only once - focus first movie thumbnail
                                if (!hasSetFocusOnFirstRow) {
                                    hasSetFocusOnFirstRow = true
                                    movieRowsRecycler.postDelayed({
                                        val firstRowView = movieRowsRecycler.getChildAt(0)
                                        val moviesRecycler = firstRowView?.findViewById<RecyclerView>(R.id.movies_recycler)
                                        moviesRecycler?.postDelayed({
                                            moviesRecycler.getChildAt(0)?.requestFocus()
                                        }, 50)
                                    }, 100)
                                }
                            }
                        }
                    } catch (e: Exception) {
                        android.util.Log.e("MainActivity", "Error loading items for category ${category.title}: ${e.message}")
                    }
                }
                
                android.util.Log.d("MainActivity", "Finished loading movie rows")
                
            } catch (e: Exception) {
                android.util.Log.e("MainActivity", "Error loading movie rows: ${e.message}", e)
            }
        }
    }
    
    private fun onCategorySelected(genre: Genre) {
        selectedCategoryIndex = categories.indexOf(genre)
        hasCategorySelected = true
        contentTitle.text = genre.getDisplayName()
        
        // Don't set active position here - it will be set when channel actually plays
        // categoryAdapter.setActivePosition(selectedCategoryIndex)
        
        // Hide empty state, show content
        emptyStateMessage.visibility = View.GONE
        contentRecycler.visibility = View.VISIBLE
        
        // Progressive disclosure: Hide categories sidebar AND main sidebar after selection
        // This applies to TV, Movies, and Shows
        categorySidebar.visibility = View.GONE
        sidebarContainer.visibility = View.GONE
        
        // Recalculate grid layout with new available width (for Movies/Shows)
        if (selectedTab == "MOVIES" || selectedTab == "SHOWS") {
            setupContentAdapter()
        }
        
        // Reset pagination
        currentPage = 1
        hasMorePages = true
        allChannels.clear()
        allMovies.clear()
        allSeries.clear()
        seriesMap.clear()
        
        when (selectedTab) {
            "TV" -> loadChannels(genre.id)
            "MOVIES" -> loadMovies(genre.id)
            "SHOWS" -> loadSeries(genre.id)
        }
    }
    
    private fun loadChannels(genreId: String) {
        lifecycleScope.launch {
            try {
                loadingIndicator.visibility = View.VISIBLE
                allChannels.clear()
                currentPage = 1
                hasMorePages = true
                
                // Check cache first
                val cacheKey = "channels_$genreId"
                val cachedEntry = contentCache[cacheKey]
                
                if (isCacheValid(cachedEntry)) {
                    android.util.Log.d("MainActivity", "Using cached channels for genre: $genreId")
                    allChannels.addAll(cachedEntry!!.data)
                    totalItemsCount = allChannels.size
                    contentSubtitle.text = "$totalItemsCount channels"
                    channelRowAdapter.setChannels(allChannels)
                    
                    // Handle playing state same as before
                    val isPlayingCategory = currentPlayingCategoryId == genreId
                    if (isPlayingCategory && currentPlayingCategoryIndex >= 0) {
                        categoryAdapter.setActivePosition(currentPlayingCategoryIndex)
                    } else {
                        categoryAdapter.setActivePosition(-1)
                    }
                    
                    if (allChannels.isNotEmpty() && currentPlayingChannel == null) {
                        channelRowAdapter.setSelectedPosition(0)
                        channelRowAdapter.setPlayingPosition(0)
                        currentPlayingCategoryId = genreId
                        currentPlayingCategoryIndex = selectedCategoryIndex
                        categoryAdapter.setActivePosition(currentPlayingCategoryIndex)
                        playChannel(allChannels[0])
                        contentRecycler.post {
                            contentRecycler.getChildAt(0)?.requestFocus()
                        }
                    } else if (isPlayingCategory && currentPlayingIndex >= 0 && currentPlayingIndex < allChannels.size) {
                        channelRowAdapter.setSelectedPosition(0)
                        channelRowAdapter.setPlayingPosition(currentPlayingIndex)
                        contentRecycler.post {
                            contentRecycler.getChildAt(0)?.requestFocus()
                        }
                    } else {
                        channelRowAdapter.setSelectedPosition(0)
                        channelRowAdapter.setPlayingPosition(-1)
                        contentRecycler.post {
                            contentRecycler.getChildAt(0)?.requestFocus()
                        }
                    }
                    
                    loadingIndicator.visibility = View.GONE
                    return@launch
                }
                
                // Load first 5 pages if not in cache
                android.util.Log.d("MainActivity", "Loading channels from API for genre: $genreId")
                for (page in 1..5) {
                    val response = stalkerClient.getChannels(
                        genreId = genreId,
                        page = page
                    )
                    
                // Store total from first response
                if (page == 1) {
                    totalItemsCount = response.channels.total
                    // Update content header subtitle with count
                    contentSubtitle.text = "$totalItemsCount channels"
                }
                
                val channels = response.channels.data.map { channel ->
                    channel.copy(logo = buildChannelLogoUrl(channel.logo), isLive = true)
                }
                    if (channels.isEmpty()) {
                        hasMorePages = false
                        break
                    }
                    allChannels.addAll(channels)
                }
                
                currentPage = 6
                
                // Store in cache
                contentCache[cacheKey] = CacheEntry(allChannels.toList())
                android.util.Log.d("MainActivity", "Cached ${allChannels.size} channels for genre: $genreId")
                
                channelRowAdapter.setChannels(allChannels)
                contentSubtitle.text = "$totalItemsCount channels"
                
                // Check if this category has the currently playing channel
                val isPlayingCategory = currentPlayingCategoryId == genreId
                
                // Set category active icon if this is the playing category
                if (isPlayingCategory && currentPlayingCategoryIndex >= 0) {
                    categoryAdapter.setActivePosition(currentPlayingCategoryIndex)
                } else {
                    // Clear active position if this is not the playing category
                    categoryAdapter.setActivePosition(-1)
                }
                
                // Don't auto-play if content is already playing
                if (allChannels.isNotEmpty() && currentPlayingChannel == null) {
                    channelRowAdapter.setSelectedPosition(0)
                    channelRowAdapter.setPlayingPosition(0)
                    currentPlayingCategoryId = genreId
                    currentPlayingCategoryIndex = selectedCategoryIndex
                    categoryAdapter.setActivePosition(currentPlayingCategoryIndex)
                    playChannel(allChannels[0])
                    contentRecycler.post {
                        contentRecycler.getChildAt(0)?.requestFocus()
                    }
                } else if (isPlayingCategory && currentPlayingIndex >= 0 && currentPlayingIndex < allChannels.size) {
                    // This category has the playing channel - show play indicator
                    channelRowAdapter.setSelectedPosition(0)
                    channelRowAdapter.setPlayingPosition(currentPlayingIndex)
                    // Focus on first channel, not preview
                    contentRecycler.post {
                        contentRecycler.getChildAt(0)?.requestFocus()
                    }
                } else {
                    // Different category - clear play indicator
                    channelRowAdapter.setSelectedPosition(0)
                    channelRowAdapter.setPlayingPosition(-1)
                    // Focus on first channel, not preview
                    contentRecycler.post {
                        contentRecycler.getChildAt(0)?.requestFocus()
                    }
                }
                
                loadingIndicator.visibility = View.GONE
            } catch (e: Exception) {
                android.util.Log.e("MainActivity", "Error loading channels", e)
                loadingIndicator.visibility = View.GONE
            }
        }
    }
    
    private fun loadMovies(categoryId: String) {
        lifecycleScope.launch {
            try {
                loadingIndicator.visibility = View.VISIBLE
                allChannels.clear()
                currentPage = 1
                hasMorePages = true
                
                // Check cache first
                val cacheKey = "movies_$categoryId"
                val cachedEntry = contentCache[cacheKey]
                
                if (isCacheValid(cachedEntry)) {
                    android.util.Log.d("MainActivity", "Using cached movies for category: $categoryId")
                    allChannels.addAll(cachedEntry!!.data)
                    totalItemsCount = allChannels.size
                    contentSubtitle.text = "$totalItemsCount movies"
                    channelAdapter.setChannels(allChannels)
                    setupContentAdapter()
                    loadingIndicator.visibility = View.GONE
                    return@launch
                }
                
                // Load only first page (5 items) for fast initial display
                android.util.Log.d("MainActivity", "Loading movies from API for category: $categoryId")
                val firstResponse = stalkerClient.getVodItems(
                    categoryId = categoryId,
                    page = 1,
                    type = "vod"
                )
                
                totalItemsCount = firstResponse.items.total
                val firstMovies = firstResponse.items.data
                
                // Update subtitle immediately with total count
                contentSubtitle.text = "$totalItemsCount movies"
                
                if (firstMovies.isNotEmpty()) {
                    allMovies.addAll(firstMovies)
                    val movieChannels = firstMovies.map {
                        Channel(it.id, it.name, null, buildImageUrl(it.getImageUrl()), it.cmd, categoryId)
                    }
                    allChannels.addAll(movieChannels)
                    
                    // Show first page immediately
                    channelAdapter.setChannels(allChannels)
                    channelAdapter.setSelectedPosition(0)
                    loadingIndicator.visibility = View.GONE
                    currentPage = 1
                    
                    // Prefetch 2 pages ahead (pages 2 & 3) in background
                    launch(Dispatchers.IO) {
                        prefetchPages(categoryId, currentPage)
                    }
                    
                    
                    currentPage = 6
                } else {
                    hasMorePages = false
                    loadingIndicator.visibility = View.GONE
                }
            } catch (e: Exception) {
                android.util.Log.e("MainActivity", "Error loading movies", e)
                loadingIndicator.visibility = View.GONE
            }
        }
    }
    
    private fun loadSeries(categoryId: String) {
        lifecycleScope.launch {
            try {
                loadingIndicator.visibility = View.VISIBLE
                allChannels.clear()
                currentPage = 1
                hasMorePages = true
                
                // Check cache first
                val cacheKey = "series_$categoryId"
                val cachedEntry = contentCache[cacheKey]
                
                if (isCacheValid(cachedEntry)) {
                    android.util.Log.d("MainActivity", "Using cached series for category: $categoryId")
                    allChannels.addAll(cachedEntry!!.data)
                    
                    // Also restore seriesMap from cache
                    val cachedSeries = seriesCache[cacheKey]
                    if (cachedSeries != null) {
                        allSeries.addAll(cachedSeries.data)
                        cachedSeries.data.forEach { series ->
                            seriesMap[series.id] = series
                        }
                        android.util.Log.d("MainActivity", "📚 Restored ${seriesMap.size} series from cache to seriesMap")
                    }
                    
                    totalItemsCount = allChannels.size
                    contentSubtitle.text = "$totalItemsCount series"
                    channelAdapter.setChannels(allChannels)
                    setupContentAdapter()
                    loadingIndicator.visibility = View.GONE
                    return@launch
                }
                
                // Load first page and show immediately
                android.util.Log.d("MainActivity", "Loading series from API for category: $categoryId")
                val firstResponse = stalkerClient.getVodItems(
                    categoryId = categoryId,
                    page = 1,
                    type = "vod" // Both movies and series come from vod type
                )
                
                // Filter only series (is_series != "0") - need to check ALL pages for accurate count
                val firstSeries = firstResponse.items.data.filter { item ->
                    val isSeries = item.isSeries ?: "0"
                    isSeries != "0" // Only include series
                }
                
                // For accurate count, we need total from API but filter by is_series
                // Show approximate count initially, will update after loading
                totalItemsCount = firstSeries.size
                contentSubtitle.text = "Loading... (${firstSeries.size}+ series)"
                android.util.Log.d("MainActivity", "Filtered ${firstSeries.size} series from ${firstResponse.items.data.size} total items")
                
                // Log API response data for first few series
                android.util.Log.d("MainActivity", "=== SERIES API RESPONSE (First Page) ===")
                firstSeries.take(3).forEachIndexed { index, movie ->
                    android.util.Log.d("MainActivity", "--- Series ${index + 1} ---")
                    android.util.Log.d("MainActivity", "Raw ID: ${movie.id}")
                    android.util.Log.d("MainActivity", "Raw Name: ${movie.name}")
                    android.util.Log.d("MainActivity", "Raw Year: ${movie.year}")
                    android.util.Log.d("MainActivity", "Raw Poster: ${movie.poster}")
                    android.util.Log.d("MainActivity", "Raw Screenshot: ${movie.screenshot}")
                    android.util.Log.d("MainActivity", "Raw Screenshot URI: ${movie.screenshotUri}")
                    android.util.Log.d("MainActivity", "Raw Cover: ${movie.cover}")
                    android.util.Log.d("MainActivity", "Raw Cover Big: ${movie.coverBig}")
                    android.util.Log.d("MainActivity", "Raw Rating IMDB: ${movie.ratingImdb}")
                    android.util.Log.d("MainActivity", "Raw Category ID: ${movie.categoryId}")
                    android.util.Log.d("MainActivity", "Raw Description: ${movie.description}")
                    android.util.Log.d("MainActivity", "Raw Actors: ${movie.actors}")
                    android.util.Log.d("MainActivity", "Raw Director: ${movie.director}")
                    android.util.Log.d("MainActivity", "Raw Country: ${movie.country}")
                    android.util.Log.d("MainActivity", "Raw Genres: ${movie.genresStr}")
                    android.util.Log.d("MainActivity", "Raw Original Name: ${movie.originalName}")
                    android.util.Log.d("MainActivity", "Computed getImageUrl(): ${movie.getImageUrl()}")
                    android.util.Log.d("MainActivity", "Computed buildImageUrl(): ${buildImageUrl(movie.getImageUrl())}")
                }
                android.util.Log.d("MainActivity", "========================================")
                
                if (firstSeries.isNotEmpty()) {
                    // Convert Movie objects to Series and store in allSeries
                    val convertedSeries = firstSeries.map { movie ->
                        Series(
                            id = movie.id,
                            name = movie.name,
                            year = movie.year,
                            poster = movie.poster,
                            screenshot = movie.screenshot,
                            screenshotUri = movie.screenshotUri,
                            cover = movie.cover,
                            coverBig = movie.coverBig,
                            ratingImdb = movie.ratingImdb,
                            categoryId = movie.categoryId,
                            description = movie.description,
                            actors = movie.actors,
                            director = movie.director,
                            country = movie.country,
                            genresStr = movie.genresStr,
                            originalName = movie.originalName,
                            totalEpisodes = null
                        )
                    }
                    allSeries.addAll(convertedSeries)
                    // Also add to map for instant lookup
                    convertedSeries.forEach { series ->
                        seriesMap[series.id] = series
                    }
                    android.util.Log.d("MainActivity", "📚 Added ${convertedSeries.size} series to seriesMap. Total in map: ${seriesMap.size}")
                    
                    val seriesChannels = firstSeries.map {
                        Channel(it.id, it.name, null, buildImageUrl(it.getImageUrl()), it.cmd, categoryId)
                    }
                    allChannels.addAll(seriesChannels)
                    
                    // Show first page immediately
                    channelAdapter.setChannels(allChannels)
                    contentSubtitle.text = "$totalItemsCount series"
                    channelAdapter.setSelectedPosition(0)
                    loadingIndicator.visibility = View.GONE
                    
                    // Load remaining 4 pages in background (batch all at once)
                    val backgroundSeries = mutableListOf<com.ronika.iptvnative.models.Movie>()
                    for (page in 2..5) {
                        val response = stalkerClient.getVodItems(
                            categoryId = categoryId,
                            page = page,
                            type = "vod"
                        )
                        
                        // Filter only series (is_series != "0")
                        val series = response.items.data.filter { item ->
                            val isSeries = item.isSeries ?: "0"
                            isSeries != "0"
                        }
                        
                        if (series.isEmpty()) {
                            hasMorePages = false
                            break
                        }
                        
                        backgroundSeries.addAll(series)
                    }
                    
                    // Add all background series at once to prevent multiple focus changes
                    if (backgroundSeries.isNotEmpty()) {
                        // Convert Movie objects to Series and store
                        val convertedSeries = backgroundSeries.map { movie ->
                            Series(
                                id = movie.id,
                                name = movie.name,
                                year = movie.year,
                                poster = movie.poster,
                                screenshot = movie.screenshot,
                                screenshotUri = movie.screenshotUri,
                                cover = movie.cover,
                                coverBig = movie.coverBig,
                                ratingImdb = movie.ratingImdb,
                                categoryId = movie.categoryId,
                                description = movie.description,
                                actors = movie.actors,
                                director = movie.director,
                                country = movie.country,
                                genresStr = movie.genresStr,
                                originalName = movie.originalName,
                                totalEpisodes = null
                            )
                        }
                        allSeries.addAll(convertedSeries)
                        
                        val seriesChannels = backgroundSeries.map {
                            Channel(it.id, it.name, null, buildImageUrl(it.getImageUrl()), it.cmd, categoryId)
                        }
                        allChannels.addAll(seriesChannels)
                        
                        // Single update after all pages loaded
                        runOnUiThread {
                            channelAdapter.setChannels(allChannels)
                            // Update subtitle with final count
                            totalItemsCount = allSeries.size
                            contentSubtitle.text = "$totalItemsCount series"
                        }
                    }
                    
                    // Cache both channels and series data
                    val cacheKey = "series_$categoryId"
                    contentCache[cacheKey] = CacheEntry(allChannels.toList())
                    seriesCache[cacheKey] = CacheEntry(allSeries.toList())
                    android.util.Log.d("MainActivity", "Cached ${allChannels.size} channels and ${allSeries.size} series for category: $categoryId")
                    
                    currentPage = 6
                } else {
                    hasMorePages = false
                    loadingIndicator.visibility = View.GONE
                }
            } catch (e: Exception) {
                android.util.Log.e("MainActivity", "Error loading series", e)
                loadingIndicator.visibility = View.GONE
            }
        }
    }
    
    private fun loadMoreContent() {
        if (isLoadingMore || !hasMorePages || categories.isEmpty()) return
        
        isLoadingMore = true
        val selectedGenre = categories[selectedCategoryIndex]
        
        lifecycleScope.launch {
            try {
                when (selectedTab) {
                    "TV" -> {
                        val response = ApiClient.apiService.getChannels(
                            ChannelsRequest(
                                mac = ApiClient.macAddress,
                                url = ApiClient.portalUrl,
                                genre = selectedGenre.id,
                                page = currentPage
                            )
                        )
                        val channels = response.channels.data.map { channel ->
                            channel.copy(logo = buildChannelLogoUrl(channel.logo), isLive = true)
                        }
                        if (channels.isEmpty()) {
                            hasMorePages = false
                        } else {
                            allChannels.addAll(channels)
                            channelRowAdapter.setChannels(allChannels)
                            currentPage++
                            
                            // Update cache with new content
                            val cacheKey = "channels_${selectedGenre.id}"
                            contentCache[cacheKey] = CacheEntry(allChannels.toList())
                            android.util.Log.d("MainActivity", "Updated cache with ${allChannels.size} channels")
                        }
                    }
                    "MOVIES" -> {
                        val response = stalkerClient.getVodItems(
                            categoryId = selectedGenre.id,
                            page = currentPage,
                            type = "vod"
                        )
                        val movies = response.items.data
                        if (movies.isEmpty()) {
                            hasMorePages = false
                        } else {
                            allMovies.addAll(movies) // Store full movie objects
                            val movieChannels = movies.map {
                                Channel(it.id, it.name, null, buildImageUrl(it.getImageUrl()), it.cmd, selectedGenre.id)
                            }
                            allChannels.addAll(movieChannels)
                            channelAdapter.setChannels(allChannels)
                            currentPage++
                            
                            // Update cache with new content
                            val cacheKey = "movies_${selectedGenre.id}"
                            contentCache[cacheKey] = CacheEntry(allChannels.toList())
                            android.util.Log.d("MainActivity", "Updated cache with ${allChannels.size} movies")
                        }
                    }
                    "SHOWS" -> {
                        val response = stalkerClient.getVodItems(
                            categoryId = selectedGenre.id,
                            page = currentPage,
                            type = "series"
                        )
                        val seriesData = response.items.data
                        if (seriesData.isEmpty()) {
                            hasMorePages = false
                        } else {
                            // Convert Movie objects to Series objects (API returns same structure)
                            val series = seriesData.map { movie ->
                                Series(
                                    id = movie.id,
                                    name = movie.name,
                                    year = movie.year,
                                    poster = movie.poster,
                                    screenshot = movie.screenshot,
                                    screenshotUri = movie.screenshotUri,
                                    cover = movie.cover,
                                    coverBig = movie.coverBig,
                                    ratingImdb = movie.ratingImdb,
                                    categoryId = movie.categoryId,
                                    description = movie.description,
                                    actors = movie.actors,
                                    director = movie.director,
                                    country = movie.country,
                                    genresStr = movie.genresStr,
                                    originalName = movie.originalName,
                                    totalEpisodes = null
                                )
                            }
                            allSeries.addAll(series)
                            val seriesChannels = seriesData.map {
                                Channel(it.id, it.name, null, buildImageUrl(it.getImageUrl()), it.cmd, selectedGenre.id)
                            }
                            allChannels.addAll(seriesChannels)
                            channelAdapter.setChannels(allChannels)
                            currentPage++
                            
                            // Update cache with new content
                            val cacheKey = "series_${selectedGenre.id}"
                            contentCache[cacheKey] = CacheEntry(allChannels.toList())
                            android.util.Log.d("MainActivity", "Updated cache with ${allChannels.size} series")
                        }
                    }
                }
                isLoadingMore = false
            } catch (e: Exception) {
                android.util.Log.e("MainActivity", "Error loading more content", e)
                isLoadingMore = false
            }
        }
    }
    
    private suspend fun prefetchPages(categoryId: String, fromPage: Int) {
        try {
            // Prefetch 2 pages ahead
            val pagesToFetch = listOf(fromPage + 1, fromPage + 2)
            
            for (page in pagesToFetch) {
                if (!hasMorePages) break
                
                android.util.Log.d("MainActivity", "Prefetching page $page for category $categoryId")
                val response = stalkerClient.getVodItems(
                    categoryId = categoryId,
                    page = page,
                    type = "vod"
                )
                
                val items = response.items.data
                if (items.isEmpty()) {
                    hasMorePages = false
                    break
                }
                
                // Add to cache based on content type
                if (selectedTab == "MOVIES") {
                    allMovies.addAll(items)
                    val movieChannels = items.map {
                        Channel(it.id, it.name, null, buildImageUrl(it.getImageUrl()), it.cmd, categoryId)
                    }
                    allChannels.addAll(movieChannels)
                } else if (selectedTab == "SHOWS") {
                    // Filter for series
                    val seriesItems = items.filter { (it.isSeries ?: "0") != "0" }
                    val series = seriesItems.map { movie ->
                        Series(
                            id = movie.id,
                            name = movie.name,
                            year = movie.year,
                            poster = movie.poster,
                            screenshot = movie.screenshot,
                            screenshotUri = movie.screenshotUri,
                            cover = movie.cover,
                            coverBig = movie.coverBig,
                            ratingImdb = movie.ratingImdb,
                            categoryId = movie.categoryId,
                            description = movie.description,
                            actors = movie.actors,
                            director = movie.director,
                            country = movie.country,
                            genresStr = movie.genresStr,
                            originalName = movie.originalName,
                            totalEpisodes = null
                        )
                    }
                    allSeries.addAll(series)
                    // Also add to map for instant lookup
                    series.forEach { s ->
                        seriesMap[s.id] = s
                    }
                    android.util.Log.d("MainActivity", "📚 Added ${series.size} series to seriesMap. Total in map: ${seriesMap.size}")
                    val seriesChannels = seriesItems.map {
                        Channel(it.id, it.name, null, buildImageUrl(it.getImageUrl()), it.cmd, categoryId)
                    }
                    allChannels.addAll(seriesChannels)
                }
                
                android.util.Log.d("MainActivity", "Prefetched page $page: ${items.size} items")
            }
            
            // Update UI with prefetched content
            withContext(Dispatchers.Main) {
                channelAdapter.setChannels(allChannels)
                currentPage = fromPage + 2 // Update to last prefetched page
                
                // Cache the content after prefetch
                val cacheKey = when (selectedTab) {
                    "MOVIES" -> "movies_$categoryId"
                    "SHOWS" -> "series_$categoryId"
                    else -> return@withContext
                }
                contentCache[cacheKey] = CacheEntry(allChannels.toList())
                
                // Also cache series data if loading shows
                if (selectedTab == "SHOWS") {
                    seriesCache[cacheKey] = CacheEntry(allSeries.toList())
                    android.util.Log.d("MainActivity", "📚 Cached ${allSeries.size} series with metadata")
                }
                android.util.Log.d("MainActivity", "Cached ${allChannels.size} items for $selectedTab category: $categoryId")
            }
        } catch (e: Exception) {
            android.util.Log.e("MainActivity", "Error prefetching pages", e)
        }
    }
    
    private fun buildImageUrl(imagePath: String?): String? {
        if (imagePath.isNullOrEmpty()) return null
        
        // If already a full URL, return as is
        if (imagePath.startsWith("http")) {
            return imagePath
        }
        
        // Use the correct domain for images (same as MovieCategoryRowAdapter)
        // Images must be loaded from tv.stream4k.cc, not the IP address
        return if (imagePath.startsWith("/")) {
            // imagePath like "/stalker_portal/screenshots/123.jpg"
            "http://tv.stream4k.cc$imagePath"
        } else {
            imagePath
        }
    }
    
    private fun buildChannelLogoUrl(logo: String?): String? {
        if (logo.isNullOrEmpty()) return null
        
        // If already a full URL, return as is
        if (logo.startsWith("http")) {
            return logo
        }
        
        // Build full URL for channel logos
        val portalUrl = ApiClient.portalUrl
        val domainUrl = portalUrl.replace("/stalker_portal/?$".toRegex(), "")
        
        return if (logo.startsWith("/")) {
            "$domainUrl$logo"
        } else {
            "$domainUrl/stalker_portal/misc/logos/320/$logo"
        }
    }

    private fun onChannelSelected(channel: Channel) {
        // For TV channels, play the channel when user clicks on it
        if (selectedTab == "TV") {
            val channelIndex = allChannels.indexOf(channel)
            
            // If clicking on already playing channel (or from preview), toggle fullscreen
            if (currentPlayingChannel == channel) {
                toggleFullscreen()
                return
            }
            
            // Otherwise play the new channel
            currentPlayingIndex = channelIndex
            currentPlayingCategoryId = categories[selectedCategoryIndex].id
            currentPlayingCategoryIndex = selectedCategoryIndex
            playChannel(channel)
            
            // Update playing indicator in adapter
            if (channelIndex != -1) {
                channelRowAdapter.setSelectedPosition(channelIndex)
                channelRowAdapter.setPlayingPosition(channelIndex)
                categoryAdapter.setActivePosition(currentPlayingCategoryIndex)
            }
            
            // Show preview panel for the playing channel
            showPreviewForChannel(channel)
        } else if (selectedTab == "SHOWS") {
            // For series, open SeriesDetailActivity
            android.util.Log.d("MainActivity", "📺 Opening series - channel.id: ${channel.id}, channel.name: ${channel.name}")
            android.util.Log.d("MainActivity", "📺 seriesMap size: ${seriesMap.size}")
            
            // Look up full series data from seriesMap
            val series = seriesMap[channel.id]
            android.util.Log.d("MainActivity", "📺 Found series in map: ${series != null}")
            
            if (series != null) {
                android.util.Log.d("MainActivity", "📺 Series data - name: ${series.name}, screenshot_uri: ${series.screenshotUri}")
                android.util.Log.d("MainActivity", "📺 Series data - description: ${series.description}")
                android.util.Log.d("MainActivity", "📺 Series data - actors: ${series.actors}")
                android.util.Log.d("MainActivity", "📺 Series data - director: ${series.director}")
                android.util.Log.d("MainActivity", "📺 Series data - getImageUrl(): ${series.getImageUrl()}")
            }
            
            val posterUrl = buildImageUrl(series?.getImageUrl() ?: channel.logo)
            android.util.Log.d("MainActivity", "📺 Final poster URL: $posterUrl")
            
            val intent = Intent(this, SeriesDetailActivity::class.java).apply {
                putExtra("SERIES_ID", channel.id)
                putExtra("SERIES_NAME", channel.name)
                putExtra("POSTER_URL", posterUrl ?: "")
                putExtra("DESCRIPTION", series?.description ?: "")
                putExtra("ACTORS", series?.actors ?: "")
                putExtra("DIRECTOR", series?.director ?: "")  
                putExtra("YEAR", series?.year ?: "")
                putExtra("COUNTRY", series?.country ?: "")
                putExtra("GENRES", series?.genresStr ?: "")
                putExtra("TOTAL_SEASONS", series?.totalEpisodes ?: "Unknown")
            }
            startActivity(intent)
        } else {
            // For movies, show full-size image in player area
            showMovieFullscreen(channel)
        }
    }
    
    private fun showMoviePreview(channel: Channel) {
        // Show movie/show details in header above grid (not fullscreen overlay)
        movieDetailsHeaderGrid.visibility = View.VISIBLE
        
        // Find the full movie or series object by ID
        val movie = if (selectedTab == "MOVIES") allMovies.find { it.id == channel.id } else null
        val series = if (selectedTab == "SHOWS") allSeries.find { it.id == channel.id } else null
        
        // Log series data on hover/focus
        if (series != null) {
            android.util.Log.d("MainActivity", "=== SERIES HOVER DATA ===")
            android.util.Log.d("MainActivity", "ID: ${series.id}")
            android.util.Log.d("MainActivity", "Name: ${series.name}")
            android.util.Log.d("MainActivity", "Year: ${series.year}")
            android.util.Log.d("MainActivity", "Poster: ${series.poster}")
            android.util.Log.d("MainActivity", "Screenshot: ${series.screenshot}")
            android.util.Log.d("MainActivity", "Screenshot URI: ${series.screenshotUri}")
            android.util.Log.d("MainActivity", "Cover: ${series.cover}")
            android.util.Log.d("MainActivity", "Cover Big: ${series.coverBig}")
            android.util.Log.d("MainActivity", "Rating IMDB: ${series.ratingImdb}")
            android.util.Log.d("MainActivity", "Category ID: ${series.categoryId}")
            android.util.Log.d("MainActivity", "Description: ${series.description}")
            android.util.Log.d("MainActivity", "Actors: ${series.actors}")
            android.util.Log.d("MainActivity", "Director: ${series.director}")
            android.util.Log.d("MainActivity", "Country: ${series.country}")
            android.util.Log.d("MainActivity", "Genres: ${series.genresStr}")
            android.util.Log.d("MainActivity", "Original Name: ${series.originalName}")
            android.util.Log.d("MainActivity", "Total Episodes: ${series.totalEpisodes}")
            android.util.Log.d("MainActivity", "getImageUrl(): ${series.getImageUrl()}")
            android.util.Log.d("MainActivity", "buildImageUrl(): ${buildImageUrl(series.getImageUrl())}")
            android.util.Log.d("MainActivity", "========================")
        }
        
        // Title
        detailTitleGrid.text = channel.name
        
        // Load poster, or show title if no image available
        val imageUrl = movie?.getImageUrl() ?: series?.getImageUrl()
        val finalImageUrl = buildImageUrl(imageUrl)
        if (finalImageUrl != null) {
            detailPosterGrid.visibility = View.VISIBLE
            detailPosterTextGrid.visibility = View.GONE
            detailPosterGrid.load(finalImageUrl) {
                crossfade(200)
                placeholder(android.R.drawable.ic_menu_gallery)
                error(android.R.drawable.ic_menu_gallery)
                listener(
                    onError = { _, _ ->
                        // If image fails to load, show title instead
                        detailPosterGrid.visibility = View.GONE
                        detailPosterTextGrid.visibility = View.VISIBLE
                        detailPosterTextGrid.text = channel.name
                    }
                )
            }
        } else {
            // Show title as fallback when no poster is available
            detailPosterGrid.visibility = View.GONE
            detailPosterTextGrid.visibility = View.VISIBLE
            detailPosterTextGrid.text = channel.name
        }
        
        // Year
        val year = movie?.year ?: series?.year
        detailYearGrid.text = year ?: ""
        
        // Duration
        val duration = movie?.duration
        if (!duration.isNullOrEmpty()) {
            val totalMinutes = duration.toIntOrNull() ?: 0
            val hours = totalMinutes / 60
            val mins = totalMinutes % 60
            detailDurationGrid.text = if (hours > 0) "${hours}h ${mins}m" else "${mins}m"
        } else {
            // For series, could show episode count
            val episodes = series?.totalEpisodes
            detailDurationGrid.text = if (!episodes.isNullOrEmpty()) "$episodes Episodes" else ""
        }
        
        // Genre (combine country and genres)
        val genresStr = movie?.genresStr ?: series?.genresStr
        val country = movie?.country ?: series?.country
        val genreText = listOfNotNull(country, genresStr).joinToString(" | ")
        detailGenreGrid.text = genreText.ifEmpty { if (selectedTab == "MOVIES") "MOVIES" else "SERIES" }
        
        // Cast
        val actors = movie?.actors ?: series?.actors
        detailCastGrid.text = if (!actors.isNullOrEmpty()) "Cast:    $actors" else ""
        detailCastGrid.visibility = if (!actors.isNullOrEmpty()) View.VISIBLE else View.GONE
        
        // Director
        val director = movie?.director ?: series?.director
        detailDirectorGrid.text = if (!director.isNullOrEmpty()) "Director: $director" else ""
        detailDirectorGrid.visibility = if (!director.isNullOrEmpty()) View.VISIBLE else View.GONE
        
        // Description
        val description = movie?.description ?: series?.description
        detailDescriptionGrid.text = description ?: ""
        detailDescriptionGrid.visibility = if (!description.isNullOrEmpty()) View.VISIBLE else View.GONE
    }
    
    private fun showMovieFullscreen(channel: Channel) {
        // Hide other UI elements
        sidebarContainer.visibility = View.GONE
        categorySidebar.visibility = View.GONE
        contentHeader.visibility = View.GONE
        contentListContainer.visibility = View.GONE
        previewPanel.visibility = View.GONE
        movieDetailsHeaderGrid.visibility = View.GONE
        
        // Make player/preview container take full screen
        playerPreviewContainer.visibility = View.VISIBLE
        val containerParams = playerPreviewContainer.layoutParams as LinearLayout.LayoutParams
        containerParams.weight = 1.0f
        playerPreviewContainer.layoutParams = containerParams
        
        // Show player in full screen
        playerContainer.visibility = View.VISIBLE
        val params = playerContainer.layoutParams as LinearLayout.LayoutParams
        params.weight = 1.0f
        playerContainer.layoutParams = params
        
        // Ensure PlayerView is visible
        playerView.visibility = View.VISIBLE
        
        // Set fullscreen flag
        isFullscreen = true
        
        android.util.Log.d("MainActivity", "Showing movie fullscreen: ${channel.name}")
        
        // Show movie details overlay for 3 seconds then fade out
        showMovieInfoOverlay(channel)
        
        // Play the movie
        playChannel(channel)
    }
    
    private fun showMovieInfoOverlay(channel: Channel) {
        // Populate movie details
        val movie = if (selectedTab == "MOVIES") allMovies.find { it.id == channel.id } else null
        val series = if (selectedTab == "SHOWS") allSeries.find { it.id == channel.id } else null
        
        // Show the header with full opacity
        movieDetailsHeader.visibility = View.VISIBLE
        movieDetailsHeader.alpha = 1f
        
        // Update all the details
        detailTitle.text = channel.name
        
        // Load poster
        val imageUrl = movie?.getImageUrl() ?: series?.getImageUrl()
        val finalImageUrl = buildImageUrl(imageUrl)
        if (finalImageUrl != null) {
            detailPoster.visibility = View.VISIBLE
            detailPosterText.visibility = View.GONE
            detailPoster.load(finalImageUrl) {
                crossfade(200)
                placeholder(android.R.drawable.ic_menu_gallery)
                error(android.R.drawable.ic_menu_gallery)
                listener(
                    onError = { _, _ ->
                        detailPoster.visibility = View.GONE
                        detailPosterText.visibility = View.VISIBLE
                        detailPosterText.text = channel.name
                    }
                )
            }
        } else {
            detailPoster.visibility = View.GONE
            detailPosterText.visibility = View.VISIBLE
            detailPosterText.text = channel.name
        }
        
        // Year
        val year = movie?.year ?: series?.year
        detailYear.text = year ?: ""
        
        // Duration
        val duration = movie?.duration
        if (!duration.isNullOrEmpty()) {
            val totalMinutes = duration.toIntOrNull() ?: 0
            val hours = totalMinutes / 60
            val mins = totalMinutes % 60
            detailDuration.text = if (hours > 0) "${hours}h ${mins}m" else "${mins}m"
        } else {
            val episodes = series?.totalEpisodes
            detailDuration.text = if (!episodes.isNullOrEmpty()) "$episodes Episodes" else ""
        }
        
        // Genre
        val genresStr = movie?.genresStr ?: series?.genresStr
        val country = movie?.country ?: series?.country
        val genreText = listOfNotNull(country, genresStr).joinToString(" | ")
        detailGenre.text = genreText.ifEmpty { if (selectedTab == "MOVIES") "MOVIES" else "SERIES" }
        
        // Cast
        val actors = movie?.actors ?: series?.actors
        detailCast.text = if (!actors.isNullOrEmpty()) "Cast:    $actors" else ""
        detailCast.visibility = if (!actors.isNullOrEmpty()) View.VISIBLE else View.GONE
        
        // Director
        val director = movie?.director ?: series?.director
        detailDirector.text = if (!director.isNullOrEmpty()) "Director: $director" else ""
        detailDirector.visibility = if (!director.isNullOrEmpty()) View.VISIBLE else View.GONE
        
        // Description
        val description = movie?.description ?: series?.description
        detailDescription.text = description ?: ""
        detailDescription.visibility = if (!description.isNullOrEmpty()) View.VISIBLE else View.GONE
        
        // Auto-hide after 3 seconds with fade animation
        movieDetailsHeader.postDelayed({
            movieDetailsHeader.animate()
                .alpha(0f)
                .setDuration(500)
                .withEndAction {
                    movieDetailsHeader.visibility = View.GONE
                }
                .start()
        }, 3000)
    }
    
    private fun exitMovieFullscreen() {
        // Stop VOD playback
        android.util.Log.d("MainActivity", "===== exitMovieFullscreen CALLED =====")
        android.util.Log.d("MainActivity", "exitMovieFullscreen - selectedTab: $selectedTab")
        android.util.Log.d("MainActivity", "exitMovieFullscreen - isPlayingSeries: $isPlayingSeries")
        android.util.Log.d("MainActivity", "exitMovieFullscreen - currentSeriesId: $currentSeriesId")
        android.util.Log.d("MainActivity", "exitMovieFullscreen - currentSeriesName: $currentSeriesName")
        android.util.Log.d("MainActivity", "exitMovieFullscreen - All series data: id=$currentSeriesId, name=$currentSeriesName, poster=$currentSeriesPosterUrl")
        
        vodPlayer?.apply {
            stop()
            clearMediaItems()
        }
        
        // Check if we were playing a series - go back to series detail screen
        if (isPlayingSeries && currentSeriesId != null) {
            android.util.Log.d("MainActivity", "✓ Exiting SERIES playback - returning to SeriesDetailActivity")
            
            // Reset fullscreen state
            isFullscreen = false
            
            // Reset series tracking
            isPlayingSeries = false
            val seriesId = currentSeriesId
            val seriesName = currentSeriesName
            val posterUrl = currentSeriesPosterUrl
            val description = currentSeriesDescription
            val actors = currentSeriesActors
            val director = currentSeriesDirector
            val year = currentSeriesYear
            val country = currentSeriesCountry
            val genres = currentSeriesGenres
            val totalSeasons = currentSeriesTotalSeasons
            
            currentSeriesId = null
            currentSeriesName = null
            currentSeriesPosterUrl = null
            currentSeriesDescription = null
            currentSeriesActors = null
            currentSeriesDirector = null
            currentSeriesYear = null
            currentSeriesCountry = null
            currentSeriesGenres = null
            currentSeriesTotalSeasons = null
            
            // Simply finish this activity to return to SeriesDetailActivity which is already in the back stack
            finish()
            
            android.util.Log.d("MainActivity", "✓ Finished MainActivity, returning to SeriesDetailActivity")
            return
        }
        
        // Restore normal UI for MOVIES - show content WITHOUT sidebar
        android.util.Log.d("MainActivity", "✓ Exiting MOVIE playback - restoring movie list (NO sidebar)")
        
        sidebarContainer.visibility = View.GONE
        val sidebarFrame = findViewById<FrameLayout>(R.id.sidebar_frame)
        sidebarFrame?.visibility = View.GONE
        categorySidebar.visibility = View.GONE
        contentHeader.visibility = View.VISIBLE
        contentListContainer.visibility = View.VISIBLE
        
        // Hide player
        playerPreviewContainer.visibility = View.GONE
        val containerParams = playerPreviewContainer.layoutParams as LinearLayout.LayoutParams
        containerParams.weight = 0.55f
        playerPreviewContainer.layoutParams = containerParams
        
        isFullscreen = false
        
        // Recalculate grid for normal layout (with sidebars)
        if (selectedTab == "MOVIES" || selectedTab == "SHOWS") {
            setupContentAdapter()
        }
        
        // Focus on content, NOT sidebar
        contentRecycler.requestFocus()
        
        android.util.Log.d("MainActivity", "✓ Exited movie fullscreen - restored content WITHOUT sidebar")
        android.util.Log.d("MainActivity", "  - sidebarContainer: ${sidebarContainer.visibility}")
        android.util.Log.d("MainActivity", "  - sidebarFrame: ${sidebarFrame?.visibility}")
        android.util.Log.d("MainActivity", "  - contentHeader: ${contentHeader.visibility}")
        android.util.Log.d("MainActivity", "  - contentListContainer: ${contentListContainer.visibility}")
    }
    
    private fun toggleFullscreen() {
        isFullscreen = !isFullscreen
        
        if (isFullscreen) {
            // Hide UI elements for fullscreen
            sidebarContainer.visibility = View.GONE
            categorySidebar.visibility = View.GONE
            contentHeader.visibility = View.GONE
            contentListContainer.visibility = View.GONE
            previewPanel.visibility = View.GONE
            
            // Make player take full screen (100% width of player container)
            val params = playerContainer.layoutParams as LinearLayout.LayoutParams
            params.weight = 1.0f
            playerContainer.layoutParams = params
            
            // Make player/preview container take full height
            val containerParams = playerPreviewContainer.layoutParams as LinearLayout.LayoutParams
            containerParams.weight = 1.0f
            playerPreviewContainer.layoutParams = containerParams
            
            // Update player controls for fullscreen
            updatePlayerControlsForContentType()
            
            android.util.Log.d("MainActivity", "Entered fullscreen mode")
        } else {
            // Restore normal UI - but keep sidebars hidden for TV tab
            if (selectedTab != "TV") {
                sidebarContainer.visibility = View.VISIBLE
                categorySidebar.visibility = View.VISIBLE
            }
            contentHeader.visibility = View.VISIBLE
            contentListContainer.visibility = View.VISIBLE
            
            // Show preview panel for TV
            if (selectedTab == "TV") {
                previewPanel.visibility = View.VISIBLE
            }
            
            // Restore player size (70% width)
            val params = playerContainer.layoutParams as LinearLayout.LayoutParams
            params.weight = 0.7f
            playerContainer.layoutParams = params
            
            // Restore container height
            val containerParams = playerPreviewContainer.layoutParams as LinearLayout.LayoutParams
            containerParams.weight = 0.55f
            playerPreviewContainer.layoutParams = containerParams
            
            // Update player controls for normal view
            updatePlayerControlsForContentType()
            
            android.util.Log.d("MainActivity", "Exited fullscreen mode")
        }
    }
    
    private fun playNextChannel() {
        if (allChannels.isEmpty()) return
        
        currentPlayingIndex = (currentPlayingIndex + 1) % allChannels.size
        val channel = allChannels[currentPlayingIndex]
        
        playChannel(channel)
        channelRowAdapter.setPlayingPosition(currentPlayingIndex)
        channelRowAdapter.setSelectedPosition(currentPlayingIndex)
        
        // Update preview panel
        showPreviewForChannel(channel)
        
        // Scroll to show the current channel
        contentRecycler.smoothScrollToPosition(currentPlayingIndex)
        
        android.util.Log.d("MainActivity", "Playing next channel: ${channel.name}")
    }
    
    private fun playPreviousChannel() {
        if (allChannels.isEmpty()) return
        
        currentPlayingIndex = if (currentPlayingIndex - 1 < 0) allChannels.size - 1 else currentPlayingIndex - 1
        val channel = allChannels[currentPlayingIndex]
        
        playChannel(channel)
        channelRowAdapter.setPlayingPosition(currentPlayingIndex)
        channelRowAdapter.setSelectedPosition(currentPlayingIndex)
        
        // Update preview panel
        showPreviewForChannel(channel)
        
        // Scroll to show the current channel
        contentRecycler.smoothScrollToPosition(currentPlayingIndex)
        
        android.util.Log.d("MainActivity", "Playing previous channel: ${channel.name}")
    }
    
    private fun showPreviewForChannel(channel: Channel) {
        if (selectedTab == "TV" && !isFullscreen) {
            previewPanel.visibility = View.VISIBLE
            previewChannelName.text = channel.name
            previewTime.text = getCurrentTimeString()
            previewProgramInfo.text = if (channel.number != null) {
                "Channel #${channel.number} - Live TV"
            } else {
                "Live TV"
            }
        }
    }
    
    private fun getCurrentTimeString(): String {
        val calendar = java.util.Calendar.getInstance()
        val hour = calendar.get(java.util.Calendar.HOUR_OF_DAY)
        val minute = calendar.get(java.util.Calendar.MINUTE)
        return String.format("%02d:%02d", hour, minute)
    }
    
    private fun handleBackButton() {
        android.util.Log.d("MainActivity", "===== handleBackButton CALLED =====")
        android.util.Log.d("MainActivity", "handleBackButton - selectedTab: $selectedTab")
        android.util.Log.d("MainActivity", "handleBackButton - isPlayingSeries: $isPlayingSeries")
        android.util.Log.d("MainActivity", "handleBackButton - currentSeriesId: $currentSeriesId")
        
        val isInFullscreen = if (selectedTab == "TV") {
            liveTVManager?.isInFullscreen() ?: false
        } else {
            isFullscreen
        }
        
        android.util.Log.d("MainActivity", "handleBackButton - isInFullscreen: $isInFullscreen")
        
        // In video fullscreen - exit to preview/content view
        if (isInFullscreen) {
            android.util.Log.d("MainActivity", "✓ In fullscreen mode - calling exit function")
            if (selectedTab == "TV") {
                android.util.Log.d("MainActivity", "  -> Calling liveTVManager.exitFullscreen()")
                // Exit Live TV fullscreen - go back to channel list
                liveTVManager?.exitFullscreen()
                android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                    findViewById<RecyclerView>(R.id.live_channels_recycler)?.requestFocus()
                }, 150)
            } else {
                android.util.Log.d("MainActivity", "  -> Calling exitMovieFullscreen() for MOVIES/SHOWS")
                // Exit movie fullscreen view
                exitMovieFullscreen()
            }
            return
        }
        
        // In Live TV channel list view - go back to main sidebar (keep player running)
        if (selectedTab == "TV") {
            val liveTVContainer = findViewById<FrameLayout>(R.id.live_tv_container)
            val sidebarFrame = findViewById<FrameLayout>(R.id.sidebar_frame)
            val liveUIContainer = findViewById<LinearLayout>(R.id.live_ui_container)
            
            android.util.Log.d("MainActivity", "handleBackButton - Checking Live TV conditions:")
            android.util.Log.d("MainActivity", "  liveTVContainer visible: ${liveTVContainer?.visibility == View.VISIBLE} (value=${liveTVContainer?.visibility})")
            android.util.Log.d("MainActivity", "  sidebarFrame gone: ${sidebarFrame?.visibility == View.GONE} (value=${sidebarFrame?.visibility}, GONE=${View.GONE})")
            android.util.Log.d("MainActivity", "  liveUIContainer visible: ${liveUIContainer?.visibility == View.VISIBLE} (value=${liveUIContainer?.visibility})")
            
            if (liveTVContainer?.visibility == View.VISIBLE && 
                sidebarFrame?.visibility == View.GONE &&
                liveUIContainer?.visibility == View.VISIBLE) {
                android.util.Log.d("MainActivity", "✓ Showing main sidebar from Live TV")
                // Keep Live TV container visible (player keeps running)
                // Set width to 72dp when showing
                sidebarFrame.layoutParams = (sidebarFrame.layoutParams as FrameLayout.LayoutParams).apply {
                    width = (72 * resources.displayMetrics.density).toInt()
                }
                sidebarFrame.visibility = View.VISIBLE
                sidebarContainer.visibility = View.VISIBLE
                
                // Hide ALL other UI elements - only show main sidebar over Live TV
                categorySidebar.visibility = View.GONE
                findViewById<View>(R.id.sidebar_divider)?.visibility = View.GONE
                findViewById<LinearLayout>(R.id.player_preview_container)?.visibility = View.GONE
                findViewById<LinearLayout>(R.id.content_header)?.visibility = View.GONE
                findViewById<FrameLayout>(R.id.content_list_container)?.visibility = View.GONE
                
                // Get the parent LinearLayout that contains sidebar, category, and content
                val mainContentLayout = sidebarFrame.parent as? android.widget.LinearLayout
                
                // Make ALL backgrounds transparent so Live TV shows through
                mainContentLayout?.setBackgroundColor(android.graphics.Color.TRANSPARENT)
                sidebarFrame.setBackgroundColor(android.graphics.Color.TRANSPARENT)
                categorySidebar.setBackgroundColor(android.graphics.Color.TRANSPARENT)
                
                // Make root FrameLayout background transparent too
                val rootLayout = mainContentLayout?.parent as? android.widget.FrameLayout
                rootLayout?.setBackgroundColor(android.graphics.Color.TRANSPARENT)
                
                // Make Live TV UI container background transparent too
                findViewById<LinearLayout>(R.id.live_ui_container)?.setBackgroundColor(android.graphics.Color.TRANSPARENT)
                
                // Hide all children except sidebar_frame
                mainContentLayout?.let { parent ->
                    for (i in 0 until parent.childCount) {
                        val child = parent.getChildAt(i)
                        if (child.id != R.id.sidebar_frame) {
                            child.visibility = View.GONE
                        }
                    }
                }
                
                // Bring the entire main content layout to front so sidebar appears on top of Live TV
                mainContentLayout?.bringToFront()
                mainContentLayout?.requestLayout()
                
                // Request focus on the current tab instead of letting it default to search
                when (selectedTab) {
                    "TV" -> tvTab.requestFocus()
                    "MOVIES" -> moviesTab.requestFocus()
                    "SHOWS" -> showsTab.requestFocus()
                    else -> sidebarContainer.requestFocus()
                }
                
                android.util.Log.d("MainActivity", "Set visibilities and brought sidebar to front - sidebarFrame: ${sidebarFrame.visibility}, sidebarContainer: ${sidebarContainer.visibility}, focus on $selectedTab tab")
                return
            }
        }
        
        // Check if we're browsing content (Movies/Shows) - EXACT same logic as Live TV
        if (selectedTab == "MOVIES" || selectedTab == "SHOWS") {
            val sidebarFrame = findViewById<FrameLayout>(R.id.sidebar_frame)
            val mainContentArea = findViewById<LinearLayout>(R.id.main_content_area)
            val contentListContainer = findViewById<FrameLayout>(R.id.content_list_container)
            
            android.util.Log.d("MainActivity", "handleBackButton - Checking MOVIES/SHOWS conditions:")
            android.util.Log.d("MainActivity", "  mainContentArea visible: ${mainContentArea?.visibility == View.VISIBLE} (value=${mainContentArea?.visibility})")
            android.util.Log.d("MainActivity", "  sidebarFrame GONE: ${sidebarFrame?.visibility == View.GONE} (value=${sidebarFrame?.visibility}, GONE=${View.GONE})")
            android.util.Log.d("MainActivity", "  sidebarContainer visibility: ${sidebarContainer.visibility}")
            android.util.Log.d("MainActivity", "  contentListContainer visible: ${contentListContainer?.visibility == View.VISIBLE} (value=${contentListContainer?.visibility})")
            
            // EXACT same condition as Live TV: content visible, sidebar hidden, UI visible
            // Movies/Shows - show sidebar on back button
            if (mainContentArea?.visibility == View.VISIBLE && 
                sidebarContainer.visibility == View.GONE &&
                contentListContainer?.visibility == View.VISIBLE) {
                android.util.Log.d("MainActivity", "✓ Showing main sidebar from MOVIES/SHOWS")
                // Show sidebar
                sidebarFrame.layoutParams = (sidebarFrame.layoutParams as FrameLayout.LayoutParams).apply {
                    width = (72 * resources.displayMetrics.density).toInt()
                }
                sidebarFrame.visibility = View.VISIBLE
                sidebarContainer.visibility = View.VISIBLE
                
                // Request focus on the current tab
                when (selectedTab) {
                    "MOVIES" -> moviesTab.requestFocus()
                    "SHOWS" -> showsTab.requestFocus()
                    else -> sidebarContainer.requestFocus()
                }
                
                android.util.Log.d("MainActivity", "Sidebar shown, focus on $selectedTab tab")
                return
            }
        }
        
        // If on main sidebar only, exit app
        val sidebarFrameCheck = findViewById<FrameLayout>(R.id.sidebar_frame)
        if (sidebarContainer.visibility == View.VISIBLE && sidebarFrameCheck?.visibility == View.VISIBLE) {
            android.util.Log.d("MainActivity", "✓ Exiting app from main sidebar")
            finish()
            return
        }
        
        // Default: exit app (shouldn't reach here normally)
        android.util.Log.d("MainActivity", "✓ Default exit - finishing activity")
        finish()
    }
    
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        android.util.Log.d("MainActivity", "⌨️ Key pressed: $keyCode")
        
        // Show player controls on any key press when in fullscreen
        // CRITICAL: If playing series, always use isFullscreen variable (not liveTVManager)
        val isInFullscreen = if (isPlayingSeries) {
            isFullscreen
        } else if (selectedTab == "TV") {
            liveTVManager?.isInFullscreen() ?: false
        } else {
            isFullscreen
        }
        
        android.util.Log.d("MainActivity", "📍 State check - selectedTab: $selectedTab, isFullscreen: $isFullscreen, isInFullscreen: $isInFullscreen, isPlayingSeries: $isPlayingSeries, player: ${playerView.player != null}")
        
        if (isInFullscreen && playerView.player != null) {
            playerView.showController()
            scheduleControlsHide()
        }
        
        // BACK button is now handled by OnBackPressedCallback in onCreate
        // (removed old BACK button handling logic from here)
        
        // Handle custom player controls in fullscreen
        if (keyCode == KeyEvent.KEYCODE_BACK && false) {  // Disabled - using OnBackPressedCallback instead
            android.util.Log.d("MainActivity", "BACK pressed - selectedTab: $selectedTab, sidebarContainer visible: ${sidebarContainer.visibility == View.VISIBLE}")
            
            // If on main sidebar, exit app by calling finish()
            val sidebarFrame = findViewById<FrameLayout>(R.id.sidebar_frame)
            if (sidebarContainer.visibility == View.VISIBLE && sidebarFrame?.visibility == View.VISIBLE) {
                android.util.Log.d("MainActivity", "Exiting app from main sidebar")
                // On main navigation - exit app
                finish()
                return true
            }
            
            // In video fullscreen - exit to preview/content view
            if (isInFullscreen) {
                if (selectedTab == "TV") {
                    // Exit Live TV fullscreen - go back to channel list (not category sidebar)
                    liveTVManager?.exitFullscreen()
                    // Focus on channels list after a short delay to ensure UI is updated
                    android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                        findViewById<RecyclerView>(R.id.live_channels_recycler)?.requestFocus()
                    }, 150)
                } else {
                    // Exit movie fullscreen view
                    exitMovieFullscreen()
                }
                return true
            }
            
        // In Live TV channel list view - go back to main sidebar (keep player running)
        if (selectedTab == "TV") {
            val liveTVContainer = findViewById<FrameLayout>(R.id.live_tv_container)
            val sidebarFrame = findViewById<FrameLayout>(R.id.sidebar_frame)
            val liveUIContainer = findViewById<LinearLayout>(R.id.live_ui_container)
            
            android.util.Log.d("MainActivity", "BACK from Live TV - liveTVContainer visible: ${liveTVContainer?.visibility == View.VISIBLE}, sidebarFrame gone: ${sidebarFrame?.visibility == View.GONE}, liveUIContainer visible: ${liveUIContainer?.visibility == View.VISIBLE}")
            
            // If in Live TV mode (sidebar hidden), go back to main navigation
            if (liveTVContainer?.visibility == View.VISIBLE && 
                sidebarFrame?.visibility == View.GONE &&
                liveUIContainer?.visibility == View.VISIBLE) {
                android.util.Log.d("MainActivity", "Showing main sidebar from Live TV")
                // Keep Live TV container visible (player keeps running)
                // Set width to 72dp when showing
                sidebarFrame.layoutParams = (sidebarFrame.layoutParams as FrameLayout.LayoutParams).apply {
                    width = (72 * resources.displayMetrics.density).toInt()
                }
                // Just show main sidebar on top
                sidebarFrame.visibility = View.VISIBLE
                sidebarContainer.visibility = View.VISIBLE
                categorySidebar.visibility = View.GONE
                
                // Request focus on the TV tab since we're in Live TV section
                tvTab.requestFocus()
                
                return true
            }
        }
        
        // In Movies/Shows rows view OR series detail - go back to main sidebar
        if ((selectedTab == "MOVIES" || selectedTab == "SHOWS") && 
            (movieRowsRecycler.visibility == View.VISIBLE || contentListContainer.visibility == View.GONE) &&
            sidebarContainer.visibility == View.GONE) {
            android.util.Log.d("MainActivity", "BACK from ${selectedTab} - showing main sidebar")
            
            val sidebarFrame = findViewById<FrameLayout>(R.id.sidebar_frame)
            sidebarFrame?.visibility = View.VISIBLE
            sidebarContainer.visibility = View.VISIBLE
            
            // Show the content if hidden
            movieRowsRecycler.visibility = View.VISIBLE
            contentListContainer.visibility = View.VISIBLE
            contentHeader.visibility = View.VISIBLE
            
            // Focus on current tab
            when (selectedTab) {
                "MOVIES" -> moviesTab.requestFocus()
                "SHOWS" -> showsTab.requestFocus()
            }
            
            return true
        }            // In content view (Movies/Shows) with both sidebars hidden - show categories
            if (categorySidebar.visibility == View.GONE && 
                sidebarContainer.visibility == View.GONE) {
                // Show categories sidebar
                categorySidebar.visibility = View.VISIBLE
                
                // Clear channel selection for Live TV
                if (selectedTab == "TV") {
                    channelRowAdapter.clearSelection()
                }
                
                // Recalculate grid for Movies/Shows
                if (selectedTab == "MOVIES" || selectedTab == "SHOWS") {
                    setupContentAdapter()
                }
                
                // Move focus to the category that has the playing channel
                categoriesRecycler.requestFocus()
                categoriesRecycler.post {
                    // Focus on the category that has the playing channel
                    val categoryIndexToFocus = if (currentPlayingCategoryId != null) {
                        // Find the category with the playing channel
                        categories.indexOfFirst { it.id == currentPlayingCategoryId }
                    } else {
                        selectedCategoryIndex
                    }
                    val position = if (categoryIndexToFocus >= 0) categoryIndexToFocus else 0
                    val layoutManager = categoriesRecycler.layoutManager as? androidx.recyclerview.widget.LinearLayoutManager
                    layoutManager?.let {
                        val viewAtPosition = it.findViewByPosition(position)
                        viewAtPosition?.requestFocus()
                    }
                }
                return true
            }
            
            // In categories/movie rows with main sidebar hidden - show main sidebar ON TOP
            if (sidebarContainer.visibility == View.GONE &&
                (categorySidebar.visibility == View.VISIBLE || 
                 movieRowsRecycler.visibility == View.VISIBLE)) {
                android.util.Log.d("MainActivity", "Showing main sidebar on top of content")
                
                // Show main sidebar with transparent overlay (like Live TV)
                sidebarContainer.visibility = View.VISIBLE
                val sidebarFrame = findViewById<FrameLayout>(R.id.sidebar_frame)
                val mainContentLayout = sidebarFrame?.parent as? android.widget.LinearLayout
                
                // Make backgrounds transparent so content shows through
                mainContentLayout?.setBackgroundColor(android.graphics.Color.TRANSPARENT)
                sidebarFrame?.setBackgroundColor(android.graphics.Color.TRANSPARENT)
                sidebarFrame?.visibility = View.VISIBLE
                
                // Hide divider and player/preview container
                findViewById<View>(R.id.sidebar_divider)?.visibility = View.GONE
                findViewById<LinearLayout>(R.id.player_preview_container)?.visibility = View.GONE
                
                // Hide all other children except sidebar_frame to show content underneath
                mainContentLayout?.let { parent ->
                    for (i in 0 until parent.childCount) {
                        val child = parent.getChildAt(i)
                        if (child.id != R.id.sidebar_frame) {
                            child.visibility = View.GONE
                        }
                    }
                }
                
                // Bring sidebar to front so it overlays on top
                mainContentLayout?.bringToFront()
                mainContentLayout?.requestLayout()
                
                // Make root layout transparent too
                val rootLayout = mainContentLayout?.parent as? android.widget.FrameLayout
                rootLayout?.setBackgroundColor(android.graphics.Color.TRANSPARENT)
                
                // Focus on current tab
                when (selectedTab) {
                    "TV" -> tvTab.requestFocus()
                    "MOVIES" -> moviesTab.requestFocus()
                    "SHOWS" -> showsTab.requestFocus()
                }
                return true
            }
            
            // Otherwise, let system handle BACK (exit app)
        }
        
        // Handle custom player controls in fullscreen
        if (isInFullscreen) {
            android.util.Log.d("MainActivity", "🎮 Key event in fullscreen - keyCode: $keyCode, isPlayingSeries: $isPlayingSeries")
            val restartButton = playerView.findViewById<ImageButton>(R.id.restart_button)
            val nextButton = playerView.findViewById<ImageButton>(R.id.next_button)
            val progressBarContainer = playerView.findViewById<LinearLayout>(R.id.progress_bar_container)
            val bottomControlsContainer = playerView.findViewById<LinearLayout>(R.id.bottom_controls_container)
            
            val subtitleButton = playerView.findViewById<ImageButton>(R.id.subtitle_button)
            
            android.util.Log.d("MainActivity", "Controls found - restart: ${restartButton != null}, next: ${nextButton != null}, progress: ${progressBarContainer != null}, subtitle: ${subtitleButton != null}")
            android.util.Log.d("MainActivity", "Controls visibility - restart: ${restartButton?.visibility}, next: ${nextButton?.visibility}, progress: ${progressBarContainer?.visibility}")
            
            // Check if any control has focus
            val hasControlFocus = currentFocus == restartButton || currentFocus == nextButton || currentFocus == progressBarContainer || currentFocus == subtitleButton
            android.util.Log.d("MainActivity", "hasControlFocus: $hasControlFocus, currentFocus: ${currentFocus?.javaClass?.simpleName}")
            
            when (keyCode) {
                // CENTER/OK key - if no control has focus, toggle play/pause; otherwise let the button handle it
                KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                    android.util.Log.d("MainActivity", "⏯️ CENTER pressed - hasControlFocus: $hasControlFocus")
                    if (!hasControlFocus) {
                        // Toggle play/pause
                        playerView.player?.let { player ->
                            if (player.isPlaying) {
                                android.util.Log.d("MainActivity", "⏸️ Pausing")
                                player.pause()
                            } else {
                                android.util.Log.d("MainActivity", "▶️ Playing")
                                player.play()
                            }
                            showPlayPauseOverlay(player.isPlaying)
                        }
                        // Show controls after play/pause
                        playerView.showController()
                        return true
                    }
                    // Let focused button handle the click
                    return false
                }
                
                // LEFT key - seek backward 10 seconds (only when no control has focus)
                KeyEvent.KEYCODE_DPAD_LEFT -> {
                    if (!hasControlFocus && (selectedTab == "MOVIES" || selectedTab == "SHOWS" || isPlayingSeries)) {
                        android.util.Log.d("MainActivity", "⏪ Seeking back 10s")
                        playerView.player?.let { player ->
                            val newPos = (player.currentPosition - 10000).coerceAtLeast(0)
                            player.seekTo(newPos)
                            playerView.showController()
                            return true
                        }
                    }
                    // If control has focus, don't consume the event (let button handle it)
                    return false
                }
                
                // RIGHT key - seek forward 10 seconds (only when no control has focus)
                KeyEvent.KEYCODE_DPAD_RIGHT -> {
                    android.util.Log.d("MainActivity", "➡️ RIGHT key - hasControlFocus: $hasControlFocus, currentFocus: ${currentFocus?.javaClass?.simpleName}")
                    if (!hasControlFocus && (selectedTab == "MOVIES" || selectedTab == "SHOWS" || isPlayingSeries)) {
                        android.util.Log.d("MainActivity", "⏩ Seeking forward 10s")
                        playerView.player?.let { player ->
                            val newPos = (player.currentPosition + 10000).coerceAtMost(player.duration)
                            player.seekTo(newPos)
                            playerView.showController()
                            return true
                        }
                    }
                    // If control has focus, don't consume the event (let button handle it)
                    android.util.Log.d("MainActivity", "➡️ Letting button handle RIGHT key navigation")
                    return false
                }
                
                // DOWN key - give focus to restart button if no control has focus
                KeyEvent.KEYCODE_DPAD_DOWN -> {
                    if (!hasControlFocus) {
                        android.util.Log.d("MainActivity", "⬇️ DOWN key pressed, showing controls and giving focus")
                        // Show controls first
                        playerView.showController()
                        // Give focus to restart button after delay
                        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                            if (restartButton?.visibility == View.VISIBLE && restartButton.isFocusable) {
                                val gotFocus = restartButton.requestFocus()
                                android.util.Log.d("MainActivity", "🎯 Focus on restart button: $gotFocus")
                            }
                        }, 200)
                        return true
                    }
                    return false
                }
                
                // UP key - in Live TV, next channel; otherwise handle as normal
                KeyEvent.KEYCODE_DPAD_UP -> {
                    if (selectedTab == "TV") {
                        liveTVManager?.playNextChannel()
                        return true
                    }
                }
            }
            
            // Show controls on ANY key press if they're hidden (catch-all for all other keys)
            if (!playerView.isControllerFullyVisible) {
                android.util.Log.d("MainActivity", "🔑 Any key pressed in fullscreen, showing controls")
                playerView.showController()
                return true
            }
        }
        
        when (keyCode) {
            KeyEvent.KEYCODE_DPAD_RIGHT -> {
                // Navigate from icon sidebar to categories (also activates the tab)
                if (tvTab.hasFocus()) {
                    switchTab("TV")
                    // Focus will be set by loadCategories
                    return true
                } else if (moviesTab.hasFocus()) {
                    switchTab("MOVIES")
                    categoriesRecycler.requestFocus()
                    categoriesRecycler.post {
                        categoriesRecycler.getChildAt(0)?.requestFocus()
                    }
                    return true
                } else if (showsTab.hasFocus()) {
                    switchTab("SHOWS")
                    categoriesRecycler.requestFocus()
                    categoriesRecycler.post {
                        categoriesRecycler.getChildAt(0)?.requestFocus()
                    }
                    return true
                }
                // Navigate from categories to content
                if (categoriesRecycler.hasFocus()) {
                    // Get the currently focused category
                    val focusedChild = categoriesRecycler.focusedChild
                    if (focusedChild != null) {
                        val position = categoriesRecycler.getChildAdapterPosition(focusedChild)
                        if (position != RecyclerView.NO_POSITION && position < categories.size) {
                            // Select this category (will load content and hide sidebars)
                            onCategorySelected(categories[position])
                            return true
                        }
                    }
                    return true
                }
            }
            KeyEvent.KEYCODE_DPAD_LEFT -> {
                // Progressive LEFT navigation: Content → Categories → Main Sidebar
                
                // Level 3: From content back to categories
                val focusedChild = currentFocus
                var parent = focusedChild?.parent
                var isInContentRecycler = false
                while (parent != null) {
                    if (parent == contentRecycler) {
                        isInContentRecycler = true
                        break
                    }
                    parent = parent.parent
                }
                
                if (isInContentRecycler && hasCategorySelected) {
                    // For Movies/Shows: Check if we're in first column of the grid
                    if (selectedTab == "MOVIES" || selectedTab == "SHOWS") {
                        val gridLayoutManager = contentRecycler.layoutManager as? GridLayoutManager
                        val focusedPosition = contentRecycler.getChildAdapterPosition(focusedChild ?: return super.onKeyDown(keyCode, event))
                        
                        if (gridLayoutManager != null && focusedPosition != RecyclerView.NO_POSITION) {
                            val spanCount = gridLayoutManager.spanCount
                            val isFirstColumn = focusedPosition % spanCount == 0
                            
                            android.util.Log.d("MainActivity", "LEFT in grid: position=$focusedPosition, spanCount=$spanCount, isFirstColumn=$isFirstColumn")
                            
                            if (!isFirstColumn) {
                                // Not in first column, don't exit - let grid handle it
                                return super.onKeyDown(keyCode, event)
                            }
                        }
                        
                        // In first column - clear selection and exit to categories
                        channelAdapter.clearSelection()
                    }
                    
                    // For TV: Always allow LEFT to exit back to categories (even from first channel)
                    // Show categories sidebar
                    categorySidebar.visibility = View.VISIBLE
                    
                    // Clear channel selection for Live TV
                    if (selectedTab == "TV") {
                        channelRowAdapter.clearSelection()
                    }
                    
                    // Recalculate grid layout for Movies/Shows
                    if (selectedTab == "MOVIES" || selectedTab == "SHOWS") {
                        setupContentAdapter()
                    }
                    
                    // Move focus to the category that has the playing channel
                    categoriesRecycler.requestFocus()
                    categoriesRecycler.post {
                        val layoutManager = categoriesRecycler.layoutManager as? androidx.recyclerview.widget.LinearLayoutManager
                        layoutManager?.let {
                            // Focus on the category that has the playing channel
                            val categoryIndexToFocus = if (currentPlayingCategoryId != null) {
                                // Find the category with the playing channel
                                categories.indexOfFirst { it.id == currentPlayingCategoryId }
                            } else {
                                selectedCategoryIndex
                            }
                            val position = if (categoryIndexToFocus >= 0) categoryIndexToFocus else 0
                            val viewAtPosition = it.findViewByPosition(position)
                            viewAtPosition?.requestFocus()
                        }
                    }
                    return true
                }
                
                // Level 2: From categories back to main sidebar
                if (categoriesRecycler.hasFocus()) {
                    // Show main sidebar
                    sidebarContainer.visibility = View.VISIBLE
                    
                    // Focus on current tab
                    when (selectedTab) {
                        "TV" -> tvTab.requestFocus()
                        "MOVIES" -> moviesTab.requestFocus()
                        "SHOWS" -> showsTab.requestFocus()
                    }
                    return true
                }
            }
            KeyEvent.KEYCODE_DPAD_UP -> {
                // Navigate UP in main sidebar
                if (searchButton.hasFocus()) {
                    // Already at top, do nothing
                    return true
                } else if (tvTab.hasFocus()) {
                    // Go to search button
                    searchButton.requestFocus()
                    return true
                } else if (moviesTab.hasFocus()) {
                    tvTab.requestFocus()
                    return true
                } else if (showsTab.hasFocus()) {
                    moviesTab.requestFocus()
                    return true
                }
                
                // For Live TV: UP from first channel goes to preview
                if (selectedTab == "TV" && contentRecycler.hasFocus()) {
                    val focusedChild = currentFocus
                    var parent = focusedChild?.parent
                    var isInContentRecycler = false
                    while (parent != null) {
                        if (parent == contentRecycler) {
                            isInContentRecycler = true
                            break
                        }
                        parent = parent.parent
                    }
                    
                    if (isInContentRecycler) {
                        val focusedPosition = contentRecycler.getChildAdapterPosition(focusedChild ?: return super.onKeyDown(keyCode, event))
                        // Only allow UP from first channel (position 0)
                        if (focusedPosition == 0) {
                            // Focus on preview container
                            playerPreviewContainer.requestFocus()
                            return true
                        }
                    }
                }
                
                // Allow normal UP navigation within content
                return super.onKeyDown(keyCode, event)
            }
            KeyEvent.KEYCODE_DPAD_DOWN -> {
                // Navigate DOWN in main sidebar
                if (searchButton.hasFocus()) {
                    tvTab.requestFocus()
                    return true
                } else if (tvTab.hasFocus()) {
                    moviesTab.requestFocus()
                    return true
                } else if (moviesTab.hasFocus()) {
                    showsTab.requestFocus()
                    return true
                } else if (showsTab.hasFocus()) {
                    // Already at bottom, do nothing
                    return true
                }
                
                // For Live TV: DOWN from preview goes to first channel
                if (selectedTab == "TV" && playerPreviewContainer.hasFocus()) {
                    contentRecycler.requestFocus()
                    contentRecycler.post {
                        contentRecycler.getChildAt(0)?.requestFocus()
                    }
                    return true
                }
                
                // Allow normal DOWN navigation within content
                return super.onKeyDown(keyCode, event)
            }
            KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                // Handle CENTER on preview to toggle fullscreen
                if (playerPreviewContainer.hasFocus() && selectedTab == "TV" && currentPlayingChannel != null) {
                    toggleFullscreen()
                    return true
                }
                
                // Handle CENTER on main sidebar tabs to activate and move to content
                if (tvTab.hasFocus()) {
                    switchTab("TV")
                    // Focus will be set by loadCategories to first channel
                    return true
                }
                if (moviesTab.hasFocus()) {
                    switchTab("MOVIES")
                    // Focus on categories
                    categoriesRecycler.requestFocus()
                    categoriesRecycler.post {
                        categoriesRecycler.getChildAt(0)?.requestFocus()
                    }
                    return true
                }
                if (showsTab.hasFocus()) {
                    switchTab("SHOWS")
                    // Focus on categories
                    categoriesRecycler.requestFocus()
                    categoriesRecycler.post {
                        categoriesRecycler.getChildAt(0)?.requestFocus()
                    }
                    return true
                }
                
                // Handle CENTER on categories to activate and move to content
                if (categoriesRecycler.hasFocus()) {
                    // RIGHT key handler will take care of this
                    return super.onKeyDown(keyCode, event)
                }
                
                android.util.Log.d("MainActivity", "CENTER pressed on: $hoverTab")
                return super.onKeyDown(keyCode, event)
            }
        }
        
        return super.onKeyDown(keyCode, event)
    }
    
    private fun playChannel(channel: Channel) {
        currentPlayingChannel = channel
        
        // Reset series playback flag when playing movies or live TV
        isPlayingSeries = false
        
        val rawCmd = channel.cmd ?: ""
        android.util.Log.d("MainActivity", "Playing channel: ${channel.name}, CMD: $rawCmd")
        android.util.Log.d("MainActivity", "Movie/Channel ID: ${channel.id}")
        
        if (rawCmd.isEmpty()) {
            android.util.Log.e("MainActivity", "Empty CMD!")
            return
        }
        
        // Determine content type based on cmd format
        // Live TV: "ffrt http://..." or "ffmpeg http://..."
        // Movies/VOD: "/media/123456.mpg"
        val contentType = if (rawCmd.startsWith("ffrt") || rawCmd.startsWith("ffmpeg")) {
            "itv"
        } else {
            "vod"
        }
        
        val isLive = contentType == "itv"
        val targetPlayer = if (isLive) livePlayer else vodPlayer
        
        android.util.Log.d("MainActivity", "Content type: $contentType")
        
        // Get actual stream URL using direct Stalker portal call
        lifecycleScope.launch {
            try {
                var finalCmd = rawCmd
                
                var streamUrl = ""
                
                // For VOD, first get file info to get the file ID, then call create_link
                if (contentType == "vod") {
                    android.util.Log.d("MainActivity", "Getting VOD file info for movie ID: ${channel.id}")
                    try {
                        val fileInfo = stalkerClient.getVodFileInfo(channel.id)
                        if (fileInfo != null) {
                            // Get the file ID from the response
                            val fileId = fileInfo["id"] as? String
                            if (fileId != null) {
                                android.util.Log.d("MainActivity", "Got file ID: $fileId, calling create_link...")
                                
                                // Now call create_link with the file ID in the correct format
                                val vodCmd = "/media/file_$fileId.mpg"
                                val response = stalkerClient.getVodStreamUrl(vodCmd, "vod")
                                streamUrl = response.url
                                android.util.Log.d("MainActivity", "Got tokenized stream URL: $streamUrl")
                            } else {
                                android.util.Log.w("MainActivity", "No file ID in file info")
                            }
                        } else {
                            android.util.Log.w("MainActivity", "No file info returned")
                        }
                    } catch (e: Exception) {
                        android.util.Log.e("MainActivity", "Error getting file info: ${e.message}")
                    }
                } else {
                    // For live TV, use create_link
                    android.util.Log.d("MainActivity", "Requesting stream URL with CMD: $finalCmd")
                    val response = stalkerClient.getVodStreamUrl(finalCmd, contentType)
                    streamUrl = response.url
                }
                android.util.Log.d("MainActivity", "Got stream URL: $streamUrl")
                
                if (streamUrl.isEmpty()) {
                    android.util.Log.e("MainActivity", "Received empty stream URL")
                    return@launch
                }
                
                // Track stream URL for subtitle service
                currentStreamUrl = streamUrl
                
                // Prepare media item first
                val mediaItem = MediaItem.Builder()
                    .setUri(streamUrl)
                    .build()
                
                // Stop BOTH players to prevent overlapping audio
                android.util.Log.d("MainActivity", "Stopping all players...")
                livePlayer?.apply {
                    stop()
                    clearMediaItems()
                }
                vodPlayer?.apply {
                    stop()
                    clearMediaItems()
                }
                    
                targetPlayer?.apply {
                    android.util.Log.d("MainActivity", "Setting new media item...")
                    setMediaItem(mediaItem)
                    android.util.Log.d("MainActivity", "Preparing player...")
                    prepare()
                }
                
                // Switch PlayerView to the appropriate player AFTER preparing media
                // This ensures the surface is properly attached when playback starts
                playerView.player = targetPlayer
                android.util.Log.d("MainActivity", "Switched PlayerView to ${if (isLive) "Live" else "VOD"} player")
                
                // Start playback
                targetPlayer?.apply {
                    android.util.Log.d("MainActivity", "Starting playback...")
                    playWhenReady = true
                }
                
                // Update player controls based on content type
                updatePlayerControlsForContentType()
                
                android.util.Log.d("MainActivity", "Player started successfully")
            } catch (e: Exception) {
                android.util.Log.e("MainActivity", "Error getting stream URL: ${e.message}", e)
                e.printStackTrace()
            }
        }
    }
    
    private fun showSearchDialog() {
        val intent = Intent(this, SearchActivity::class.java)
        startActivity(intent)
    }
    
    override fun onPause() {
        super.onPause()
        // Pause players when app goes to background
        livePlayer?.pause()
        vodPlayer?.pause()
        
        // Stop subtitle polling and generation when paused
        subtitlePollingJob?.cancel()
        subtitleService?.stop()
    }
    
    override fun onStop() {
        super.onStop()
        // Stop players when app is no longer visible
        livePlayer?.stop()
        vodPlayer?.stop()
        
        // Stop subtitle polling and generation
        subtitlePollingJob?.cancel()
        subtitleService?.stop()
    }
    
    // ===== SUBTITLE SERVICE FUNCTIONS =====
    
    /**
     * Toggle live subtitles on/off
     */
    private fun toggleSubtitles() {
        if (isSubtitlesEnabled) {
            // Stop subtitles
            subtitleService?.stop()
            isSubtitlesEnabled = false
            subtitleButton?.alpha = 0.5f  // Dim button
            liveSubtitleText?.visibility = View.GONE
            android.widget.Toast.makeText(this, "Subtitles disabled", android.widget.Toast.LENGTH_SHORT).show()
        } else {
            // Player reference tracked via currentStreamUrl
            
            // Start subtitles (no permission needed in demo mode)
            startSubtitles()
        }
    }
    
    /**
     * Start subtitle service
     */
    // Track when subtitle request was made for proper sync
    private var subtitleRequestPosition: Long = 0
    private var subtitleRequestTime: Long = 0
    
    private fun startSubtitles() {
        isSubtitlesEnabled = true
        subtitleButton?.alpha = 1.0f  // Full brightness
        
        // Auto-detect language
        lifecycleScope.launch {
            val streamUrl = currentStreamUrl
            if (streamUrl == null) {
                android.util.Log.e("MainActivity", "❌ Cannot start subtitles: No stream URL")
                displaySubtitle("Error: No stream playing")
                return@launch
            }
            
            // Get current player position
            val currentPlayer = if (livePlayer?.isPlaying == true) livePlayer else vodPlayer
            if (currentPlayer == null) {
                android.util.Log.e("MainActivity", "❌ Cannot start subtitles: No active player")
                displaySubtitle("Error: No player active")
                return@launch
            }
            
            val currentPosition = currentPlayer.currentPosition
            
            // START FROM CURRENT POSITION: Backend generates 10 minutes of subtitles starting NOW
            // Since whisper-cli is 4x faster than real-time, subtitles will be ready before player reaches them
            // Example: Player at 5:00, request from 5:00, backend generates 5:00-15:00
            //          After 2.5 minutes, all subtitles for 10 minutes are ready
            val startPosition = currentPosition
            
            // Store request position and time for sync calculation
            subtitleRequestPosition = startPosition
            subtitleRequestTime = System.currentTimeMillis()
            
            val currentPositionSeconds = currentPosition / 1000
            val startPositionSeconds = startPosition / 1000
            
            android.util.Log.d("MainActivity", "📺 ===== STARTING SUBTITLES =====")
            android.util.Log.d("MainActivity", "📺 Stream URL: $streamUrl")
            android.util.Log.d("MainActivity", "📺 Current Position: ${currentPosition}ms (${currentPositionSeconds}s)")
            android.util.Log.d("MainActivity", "📺 Backend Start Position: ${startPosition}ms (${startPositionSeconds}s) [from current]")
            android.util.Log.d("MainActivity", "📺 Request Time: $subtitleRequestTime")
            android.util.Log.d("MainActivity", "📺 Player: ${if (livePlayer?.isPlaying == true) "LIVE" else "VOD"}")
            android.util.Log.d("MainActivity", "📺 Backend: $backendUrl")
            
            val language = "auto"
            subtitleService?.start(streamUrl, language, startPosition)
            
            android.util.Log.d("MainActivity", "✅ Subtitle service request sent, waiting for response...")
        }
        
        android.widget.Toast.makeText(this, "Subtitles starting... (Backend: $backendUrl)", android.widget.Toast.LENGTH_SHORT).show()
    }
    
    private val backendUrl = "192.168.2.69:8765"
    
    /**
     * Handle subtitle events from service
     */
    @UnstableApi
    private fun handleSubtitleEvent(event: SubtitleService.SubtitleEvent) {
        runOnUiThread {
            when (event) {
                is SubtitleService.SubtitleEvent.Started -> {
                    android.util.Log.d("MainActivity", "📺 Subtitles started: ${event.message}")
                    displaySubtitle(event.message)
                }
                is SubtitleService.SubtitleEvent.TrackReady -> {
                    val elapsedTime = System.currentTimeMillis() - subtitleRequestTime
                    android.util.Log.d("MainActivity", "✅ Backend confirmed track ready: ${event.subtitleUrl}")
                    android.util.Log.d("MainActivity", "📺 Elapsed time since request: ${elapsedTime}ms")
                    android.util.Log.d("MainActivity", "📺 Starting manual subtitle polling...")
                    startManualSubtitlePolling(event.subtitleUrl, elapsedTime)
                }
                is SubtitleService.SubtitleEvent.Subtitle -> {
                    android.util.Log.d("MainActivity", "📺 Subtitle received: ${event.text}")
                    displaySubtitle(event.text)
                }
                is SubtitleService.SubtitleEvent.Error -> {
                    android.util.Log.e("MainActivity", "❌ Subtitle error: ${event.message}")
                    displaySubtitle("Error: ${event.message}")
                    isSubtitlesEnabled = false
                    subtitleButton?.alpha = 0.5f
                }
                is SubtitleService.SubtitleEvent.Stopped -> {
                    android.util.Log.d("MainActivity", "🛑 Subtitles stopped")
                    liveSubtitleText?.visibility = View.GONE
                }
            }
        }
    }

    @UnstableApi
    private fun loadSubtitleTrack(subtitleUrl: String) {
        try {
            val currentPlayer = if (livePlayer?.isPlaying == true) livePlayer else vodPlayer
            
            if (currentPlayer == null) {
                android.util.Log.e("MainActivity", "❌ Cannot load subtitle: no active player")
                displaySubtitle("Error: Player not ready")
                return
            }
            
            android.util.Log.d("MainActivity", "📺 Loading subtitle track from: $subtitleUrl")
            android.util.Log.d("MainActivity", "📺 Current position: ${currentPlayer.currentPosition}ms")
            
            // Get current media item
            val currentMediaItem = currentPlayer.currentMediaItem
            if (currentMediaItem == null) {
                android.util.Log.e("MainActivity", "❌ No media item currently playing")
                return
            }
            
            // Save playback state
            val currentPosition = currentPlayer.currentPosition
            val isPlaying = currentPlayer.isPlaying
            
            android.util.Log.d("MainActivity", "📺 Creating subtitle configuration...")
            
            // Create subtitle configuration with proper flags
            val subtitleConfig = MediaItem.SubtitleConfiguration.Builder(Uri.parse(subtitleUrl))
                .setMimeType(MimeTypes.TEXT_VTT)
                .setLanguage("en")
                .setLabel("English")
                .setSelectionFlags(C.SELECTION_FLAG_DEFAULT or C.SELECTION_FLAG_FORCED)
                .build()
            
            // Create new media item with subtitle
            val newMediaItem = currentMediaItem.buildUpon()
                .setSubtitleConfigurations(listOf(subtitleConfig))
                .build()
            
            android.util.Log.d("MainActivity", "📺 Reloading player with subtitle track...")
            
            // Reload media item preserving position
            currentPlayer.setMediaItem(newMediaItem, currentPosition)
            currentPlayer.prepare()
            
            if (isPlaying) {
                currentPlayer.play()
            }
            
            // Force subtitle track selection
            lifecycleScope.launch {
                kotlinx.coroutines.delay(500) // Wait for player to be ready
                
                val params = currentPlayer.trackSelectionParameters
                currentPlayer.trackSelectionParameters = params
                    .buildUpon()
                    .setPreferredTextLanguage("en")
                    .setSelectUndeterminedTextLanguage(true)
                    .build()
                
                android.util.Log.d("MainActivity", "✅ Subtitle track selection parameters set")
                android.util.Log.d("MainActivity", "📺 Track selection params: ${currentPlayer.trackSelectionParameters}")
            }
            
            displaySubtitle("✅ Subtitles loading...")
            
        } catch (e: Exception) {
            android.util.Log.e("MainActivity", "❌ Error loading subtitle track", e)
            displaySubtitle("Error loading subtitles")
        }
    }
    
    /**
     * Display subtitle text with auto-hide
     */
    private fun displaySubtitle(text: String) {
        liveSubtitleText?.text = text
        liveSubtitleText?.visibility = View.VISIBLE
        
        // Auto-hide after 4 seconds
        liveSubtitleText?.removeCallbacks(hideSubtitleRunnable)
        liveSubtitleText?.postDelayed(hideSubtitleRunnable, 4000)
    }
    
    private var subtitlePollingJob: kotlinx.coroutines.Job? = null
    private var parsedSubtitles: List<SubtitleCue> = emptyList()
    
    data class SubtitleCue(val startTimeMs: Long, val endTimeMs: Long, val text: String)
    
    /**
     * Start polling VTT file and displaying subtitles manually
     */
    private fun startManualSubtitlePolling(subtitleUrl: String, backendProcessingTime: Long) {
        // Cancel any existing polling
        subtitlePollingJob?.cancel()
        
        android.util.Log.d("MainActivity", "🎬 Starting manual subtitle polling for: $subtitleUrl")
        android.util.Log.d("MainActivity", "🎬 Backend processing time: ${backendProcessingTime}ms")
        android.util.Log.d("MainActivity", "🎬 Subtitle base position: ${subtitleRequestPosition}ms")
        
        // Track last displayed subtitle to avoid redundant UI updates
        var lastDisplayedText: String? = null
        
        // Ensure subtitle view is properly positioned above all UI elements
        runOnUiThread {
            liveSubtitleText?.apply {
                elevation = 100f  // High elevation to ensure it's on top
                bringToFront()
            }
        }
        
        subtitlePollingJob = lifecycleScope.launch {
            var lastVttFetchTime = 0L
            try {
                while (isActive && isSubtitlesEnabled) {
                    // Fetch and parse VTT file ONLY every 5 seconds (not every 100ms!)
                    // This prevents performance degradation as VTT file grows
                    val currentTime = System.currentTimeMillis()
                    if (currentTime - lastVttFetchTime > 5000 || parsedSubtitles.isEmpty()) {
                        try {
                            val vttContent = fetchVttContent(subtitleUrl)
                            val newParsedSubtitles = parseVtt(vttContent)
                            // Only update if we got new subtitles (avoid flashing on empty parse)
                            if (newParsedSubtitles.isNotEmpty()) {
                                parsedSubtitles = newParsedSubtitles
                                lastVttFetchTime = currentTime
                                android.util.Log.d("MainActivity", "📝 Parsed ${parsedSubtitles.size} subtitle cues")
                            }
                        } catch (e: Exception) {
                            android.util.Log.e("MainActivity", "❌ Failed to fetch/parse VTT from $subtitleUrl: ${e.message}", e)
                            // Keep existing parsedSubtitles on error - don't clear them
                        }
                    }
                    
                    // Get current player position
                    val currentPlayer = if (livePlayer?.isPlaying == true) livePlayer else vodPlayer
                    val currentPlayerPosition = currentPlayer?.currentPosition ?: 0
                    
                    // ALWAYS AHEAD STRATEGY:
                    // Keep subtitles ahead and only show when player catches up to that exact position
                    // This ensures perfect sync - subtitles wait for the player
                    
                    val currentSubtitle = if (parsedSubtitles.isNotEmpty()) {
                        // Find subtitle that matches player's EXACT position (no offset)
                        // Only show when player reaches the subtitle's timestamp
                        val matchingCue = parsedSubtitles.firstOrNull { cue ->
                            currentPlayerPosition >= cue.startTimeMs && currentPlayerPosition < cue.endTimeMs
                        }
                        
                        // Debug logging (log occasionally)
                        if (System.currentTimeMillis() % 3000 < 500) {
                            val firstCue = parsedSubtitles.first()
                            val lastCue = parsedSubtitles.last()
                            val nextCue = parsedSubtitles.firstOrNull { it.startTimeMs > currentPlayerPosition }
                            val status = when {
                                matchingCue != null -> "✅ SHOWING"
                                currentPlayerPosition < firstCue.startTimeMs -> "⏸️ WAITING (${firstCue.startTimeMs - currentPlayerPosition}ms until first)"
                                nextCue != null -> "⏸️ WAITING (${nextCue.startTimeMs - currentPlayerPosition}ms until next)"
                                currentPlayerPosition > lastCue.endTimeMs -> "⏩ PAST END"
                                else -> "🔍 SEARCHING"
                            }
                            android.util.Log.d("MainActivity", "Player: ${currentPlayerPosition}ms | VTT: ${firstCue.startTimeMs}-${lastCue.endTimeMs}ms | $status")
                            if (matchingCue != null) {
                                android.util.Log.d("MainActivity", "   ↳ \"${matchingCue.text}\" [${matchingCue.startTimeMs}-${matchingCue.endTimeMs}ms]")
                            }
                        }
                        
                        matchingCue
                    } else {
                        null
                    }
                    
                    // Display subtitle if found - ONLY update UI when subtitle changes
                    val newText = currentSubtitle?.text
                    if (newText != lastDisplayedText) {
                        lastDisplayedText = newText
                        android.util.Log.d("MainActivity", "📺 Subtitle changed: ${newText ?: "(hidden)"}")
                        runOnUiThread {
                            android.util.Log.d("MainActivity", "📺 UI Thread: Updating subtitle text to: ${currentSubtitle?.text ?: "null"}")
                            if (currentSubtitle != null) {
                                if (liveSubtitleText != null) {
                                    liveSubtitleText?.apply {
                                        text = currentSubtitle.text
                                        visibility = View.VISIBLE
                                        android.util.Log.d("MainActivity", "📺 TextView updated: text='${text}', visibility=${visibility}")
                                    }
                                } else {
                                    android.util.Log.e("MainActivity", "❌ liveSubtitleText is null!")
                                }
                            } else {
                                liveSubtitleText?.visibility = View.GONE
                                android.util.Log.d("MainActivity", "📺 No subtitle to show, hiding TextView")
                            }
                        }
                    }
                    
                    // Poll every 100ms for instant subtitle updates
                    delay(100)
                }
            } catch (e: Exception) {
                android.util.Log.e("MainActivity", "Subtitle polling error", e)
            }
        }
    }
    
    private suspend fun fetchVttContent(url: String): String = withContext(kotlinx.coroutines.Dispatchers.IO) {
        java.net.URL(url).readText()
    }
    
    private fun parseVtt(vttContent: String): List<SubtitleCue> {
        val cues = mutableListOf<SubtitleCue>()
        val lines = vttContent.lines()
        var i = 0
        
        while (i < lines.size) {
            val line = lines[i].trim()
            
            // Look for timestamp line (e.g., "00:00:10.000 --> 00:00:13.000")
            if (line.contains("-->")) {
                val parts = line.split("-->").map { it.trim() }
                if (parts.size == 2) {
                    val startMs = parseVttTimestamp(parts[0])
                    val endMs = parseVttTimestamp(parts[1])
                    
                    // Next line(s) are the subtitle text
                    val textLines = mutableListOf<String>()
                    i++
                    while (i < lines.size && lines[i].trim().isNotEmpty() && !lines[i].contains("-->")) {
                        textLines.add(lines[i].trim())
                        i++
                    }
                    
                    if (textLines.isNotEmpty()) {
                        cues.add(SubtitleCue(startMs, endMs, textLines.joinToString(" ")))
                    }
                    continue
                }
            }
            i++
        }
        
        return cues
    }
    
    private fun parseVttTimestamp(timestamp: String): Long {
        // Parse format: "00:00:10.000" or "00:10.000"
        val parts = timestamp.split(":")
        return try {
            when (parts.size) {
                3 -> {
                    val hours = parts[0].toLong()
                    val minutes = parts[1].toLong()
                    val seconds = parts[2].replace(",", ".").toDouble()
                    (hours * 3600000 + minutes * 60000 + (seconds * 1000).toLong())
                }
                2 -> {
                    val minutes = parts[0].toLong()
                    val seconds = parts[1].replace(",", ".").toDouble()
                    (minutes * 60000 + (seconds * 1000).toLong())
                }
                else -> 0L
            }
        } catch (e: Exception) {
            0L
        }
    }
    
    private val hideSubtitleRunnable = Runnable {
        if (!isSubtitlesEnabled) {
            liveSubtitleText?.visibility = View.GONE
        }
    }
    
    // ===== LIFECYCLE =====
    
    override fun onDestroy() {
        super.onDestroy()
        // Unregister broadcast receiver to prevent leak
        try {
            unregisterReceiver(reloadReceiver)
        } catch (e: IllegalArgumentException) {
            // Receiver was not registered, ignore
        }
        
        // Stop subtitle polling
        subtitlePollingJob?.cancel()
        subtitlePollingJob = null
        
        // Cleanup subtitle service (this stops backend)
        subtitleService?.stop()
        subtitleService = null
        
        liveTVManager?.cleanup()
        liveTVManager = null
        livePlayer?.release()
        livePlayer = null
        vodPlayer?.release()
        vodPlayer = null
    }
    
    // ===== SYNC & USER INITIALIZATION =====
    
    private fun initializeUser() {
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                val db = com.ronika.iptvnative.database.AppDatabase.getDatabase(this@MainActivity)
                val userDao = db.userDao()
                
                var user = userDao.getUser()
                
                if (user == null) {
                    // Create user with hardcoded credentials
                    // Using direct IP to bypass DNS (tv.stream4k.cc -> 172.66.167.27)
                    user = com.ronika.iptvnative.database.entities.UserEntity(
                        username = "ronak",
                        email = "ronakdarji1997@gmail.com",
                        portalUrl = "http://172.66.167.27/stalker_portal/server/load.php",
                        mac = "00:1a:79:17:f4:f5",
                        bearerToken = "1E75E91204660B7A876055CE8830130E",
                        tokenExpiry = System.currentTimeMillis() + (365L * 24 * 60 * 60 * 1000) // 1 year
                    )
                    userDao.insertUser(user)
                    
                    // Set ApiClient credentials
                    com.ronika.iptvnative.api.ApiClient.portalUrl = user.portalUrl
                    com.ronika.iptvnative.api.ApiClient.macAddress = user.mac
                    com.ronika.iptvnative.api.ApiClient.bearerToken = user.bearerToken
                    
                    android.util.Log.d("MainActivity", "User initialized: ${user.username}")
                } else {
                    // Use existing user
                    com.ronika.iptvnative.api.ApiClient.portalUrl = user.portalUrl
                    com.ronika.iptvnative.api.ApiClient.macAddress = user.mac
                    com.ronika.iptvnative.api.ApiClient.bearerToken = user.bearerToken
                    
                    android.util.Log.d("MainActivity", "Using existing user: ${user.username}")
                }
                
            } catch (e: Exception) {
                android.util.Log.e("MainActivity", "Error initializing user: ${e.message}", e)
            }
        }
    }
    

    private fun showExitConfirmationDialog() {
        AlertDialog.Builder(this)
            .setTitle("Exit BeamTV?")
            .setMessage("Are you sure you want to exit?")
            .setPositiveButton("Yes") { _, _ ->
                // Exit the app
                finish()
            }
            .setNegativeButton("No") { dialog, _ ->
                // Dismiss the dialog
                dialog.dismiss()
            }
            .setCancelable(true)
            .show()
    }
    
    private fun Int.dpToPx(context: android.content.Context): Int {
        return (this * context.resources.displayMetrics.density).toInt()
    }
}
