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
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
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
    private var currentPlayingChannel: Channel? = null
    private var currentPlayingCategoryId: String? = null  // Track which category has the playing channel
    private var currentPlayingCategoryIndex: Int = -1  // Track the index of the category that's playing
    private var isFullscreen = false
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
    private var totalItemsCount = 0
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        
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
        
        // Setup adapters
        setupAdapters()
        
        // Setup listeners (keep logic outside of MainActivity for clarity)
        setupTabListeners()
        
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
        
        // Fetch series file info and play
        lifecycleScope.launch {
            try {
                android.util.Log.d("MainActivity", "Fetching series file info for episode: $episodeId")
                
                val fileInfo = ApiClient.apiService.getSeriesFileInfo(
                    com.ronika.iptvnative.api.SeriesFileInfoRequest(
                        mac = ApiClient.macAddress,
                        url = ApiClient.portalUrl,
                        seriesId = seriesId,
                        seasonId = seasonId,
                        episodeId = episodeId
                    )
                )
                
                android.util.Log.d("MainActivity", "File info received: id=${fileInfo.fileInfo?.id}")
                
                val fileId = fileInfo.fileInfo?.id
                if (fileId != null) {
                    val cmd = "/media/file_${fileId}.mpg"
                    android.util.Log.d("MainActivity", "Constructed cmd: $cmd")
                    
                    // Get stream URL with series type and episode number
                    val streamResponse = ApiClient.apiService.getStreamUrl(
                        com.ronika.iptvnative.api.StreamUrlRequest(
                            mac = ApiClient.macAddress,
                            url = ApiClient.portalUrl,
                            cmd = cmd,
                            type = "series",
                            episodeNumber = episodeNumber
                        )
                    )
                    
                    val streamUrl = streamResponse.url
                    android.util.Log.d("MainActivity", "Got stream URL: $streamUrl")
                    
                    // Play the episode
                    playSeriesEpisode(
                        streamUrl = streamUrl,
                        title = "$seriesName - $episodeName",
                        seasonNumber = seasonNumber,
                        episodeNumber = episodeNumber
                    )
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
    
    private fun playSeriesEpisode(streamUrl: String, title: String, seasonNumber: String, episodeNumber: String) {
        android.util.Log.d("MainActivity", "Playing series episode: $title")
        android.util.Log.d("MainActivity", "Stream URL: $streamUrl")
        
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
            updatePlayerControlsForContentType()
            
            // Show episode navigation buttons for series
            updateEpisodeNavigationVisibility()
            
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
        // Find custom control views
        progressContainer = playerView.findViewById(R.id.progress_container)
        liveBadgeContainer = playerView.findViewById(R.id.live_badge_container)
        rewindButton = playerView.findViewById(R.id.exo_rew)
        forwardButton = playerView.findViewById(R.id.exo_ffwd)
        fullscreenChannelName = playerView.findViewById(R.id.fullscreen_channel_name)
        
        // Find additional custom views
        val platformBadge = playerView.findViewById<TextView>(R.id.platform_badge)
        val resolutionBadge = playerView.findViewById<TextView>(R.id.resolution_badge)
        val fpsBadge = playerView.findViewById<TextView>(R.id.fps_badge)
        val audioBadge = playerView.findViewById<TextView>(R.id.audio_badge)
        val restartButton = playerView.findViewById<ImageButton>(R.id.restart_button)
        val playPauseOverlay = playerView.findViewById<ImageView>(R.id.play_pause_overlay)
        
        // Setup restart button
        restartButton?.setOnClickListener {
            playerView.player?.seekTo(0)
            playerView.player?.play()
            showPlayPauseOverlay(true)
        }
        
        // Setup episode navigation buttons (for series only)
        val episodeNavContainer = playerView.findViewById<LinearLayout>(R.id.episode_navigation_container)
        val prevEpisodeButton = playerView.findViewById<Button>(R.id.prev_episode_button)
        val nextEpisodeButton = playerView.findViewById<Button>(R.id.next_episode_button)
        
        prevEpisodeButton?.setOnClickListener {
            playPreviousEpisode()
        }
        
        nextEpisodeButton?.setOnClickListener {
            playNextEpisode()
        }
        
        // Setup key listeners to prevent player from seeking when buttons have focus
        prevEpisodeButton?.setOnKeyListener { _, keyCode, event ->
            if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
                when (keyCode) {
                    KeyEvent.KEYCODE_DPAD_RIGHT -> {
                        nextEpisodeButton?.requestFocus()
                        true // Consume the event
                    }
                    KeyEvent.KEYCODE_DPAD_LEFT -> {
                        // Stay on previous button (wraps around)
                        false // Let default behavior handle it
                    }
                    else -> false
                }
            } else {
                false
            }
        }
        
        nextEpisodeButton?.setOnKeyListener { _, keyCode, event ->
            if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
                when (keyCode) {
                    KeyEvent.KEYCODE_DPAD_LEFT -> {
                        prevEpisodeButton?.requestFocus()
                        true // Consume the event
                    }
                    KeyEvent.KEYCODE_DPAD_RIGHT -> {
                        // Stay on next button (wraps around)
                        false // Let default behavior handle it
                    }
                    else -> false
                }
            } else {
                false
            }
        }
        
        // Show/hide episode navigation based on playback type
        episodeNavContainer?.visibility = if (isPlayingSeries) View.VISIBLE else View.GONE
        
        // Setup player listener to update overlay icon
        playerView.player?.addListener(object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                // Update overlay icon based on playing state
                playPauseOverlay?.setImageResource(
                    if (isPlaying) androidx.media3.ui.R.drawable.exo_icon_pause 
                    else androidx.media3.ui.R.drawable.exo_icon_play
                )
            }
        })
        
        // Update platform badge based on content
        platformBadge?.text = when (selectedTab) {
            "TV" -> "LIVE TV"
            "MOVIES" -> ""
            "SHOWS" -> ""
            else -> "IPTV PLAYER"
        }
        
        // Update control visibility based on current channel
        updatePlayerControlsForContentType()
    }
    
    private fun showPlayPauseOverlay(show: Boolean) {
        val playPauseOverlay = playerView.findViewById<ImageView>(R.id.play_pause_overlay)
        playPauseOverlay?.let { overlay ->
            if (show) {
                // Update icon based on current playback state
                val isPlaying = playerView.player?.isPlaying == true
                overlay.setImageResource(
                    if (isPlaying) androidx.media3.ui.R.drawable.exo_icon_pause 
                    else androidx.media3.ui.R.drawable.exo_icon_play
                )
                overlay.visibility = View.VISIBLE
                overlay.alpha = 0.9f
                
                // Hide after 1 second
                overlay.postDelayed({
                    overlay.animate().alpha(0f).setDuration(300).withEndAction {
                        overlay.visibility = View.GONE
                    }
                }, 1000)
            } else {
                overlay.visibility = View.GONE
            }
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
                
                // Load current season episodes to find previous
                val response = ApiClient.apiService.getSeriesEpisodes(
                    com.ronika.iptvnative.api.SeriesEpisodesRequest(
                        mac = ApiClient.macAddress,
                        url = ApiClient.portalUrl,
                        seriesId = currentSeriesId ?: "",
                        seasonId = currentSeasonId ?: "",
                        page = 1
                    )
                )
                
                val episodes = response.data.sortedBy { 
                    it.series_number?.toIntOrNull() ?: Int.MAX_VALUE 
                }
                
                // Find previous episode
                val currentIndex = episodes.indexOfFirst { 
                    it.series_number?.toIntOrNull() == currentEpNum 
                }
                
                if (currentIndex > 0) {
                    val prevEpisode = episodes[currentIndex - 1]
                    playEpisode(prevEpisode)
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
                
                // Load current season episodes to find next
                val response = ApiClient.apiService.getSeriesEpisodes(
                    com.ronika.iptvnative.api.SeriesEpisodesRequest(
                        mac = ApiClient.macAddress,
                        url = ApiClient.portalUrl,
                        seriesId = currentSeriesId ?: "",
                        seasonId = currentSeasonId ?: "",
                        page = 1
                    )
                )
                
                val episodes = response.data.sortedBy { 
                    it.series_number?.toIntOrNull() ?: Int.MAX_VALUE 
                }
                
                // Find next episode
                val currentIndex = episodes.indexOfFirst { 
                    it.series_number?.toIntOrNull() == currentEpNum 
                }
                
                if (currentIndex >= 0 && currentIndex < episodes.size - 1) {
                    val nextEpisode = episodes[currentIndex + 1]
                    playEpisode(nextEpisode)
                } else {
                    android.util.Log.d("MainActivity", "Already at last episode")
                    Toast.makeText(this@MainActivity, "Already at last episode", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                android.util.Log.e("MainActivity", "Error loading next episode", e)
                Toast.makeText(this@MainActivity, "Error loading next episode", Toast.LENGTH_SHORT).show()
            }
        }
    }
    
    private fun playEpisode(episodeData: com.ronika.iptvnative.api.SeriesEpisode) {
        lifecycleScope.launch {
            try {
                // Update current episode tracking
                currentEpisodeId = episodeData.id
                currentEpisodeNumber = episodeData.series_number
                currentEpisodeName = episodeData.name
                
                android.util.Log.d("MainActivity", "Playing episode: ${episodeData.name} (E${episodeData.series_number})")
                
                // Fetch file info for the episode
                val fileInfo = ApiClient.apiService.getSeriesFileInfo(
                    com.ronika.iptvnative.api.SeriesFileInfoRequest(
                        mac = ApiClient.macAddress,
                        url = ApiClient.portalUrl,
                        seriesId = currentSeriesId ?: "",
                        seasonId = currentSeasonId ?: "",
                        episodeId = episodeData.id
                    )
                )
                
                val fileId = fileInfo.fileInfo?.id
                if (fileId != null) {
                    val cmd = "/media/file_${fileId}.mpg"
                    android.util.Log.d("MainActivity", "Got file ID: $fileId, cmd: $cmd")
                    
                    // Get stream URL from backend API (same as initial playback)
                    val streamResponse = ApiClient.apiService.getStreamUrl(
                        com.ronika.iptvnative.api.StreamUrlRequest(
                            mac = ApiClient.macAddress,
                            url = ApiClient.portalUrl,
                            cmd = cmd,
                            type = "series",
                            episodeNumber = episodeData.series_number ?: ""
                        )
                    )
                    
                    val streamUrl = streamResponse.url
                    android.util.Log.d("MainActivity", "Got stream URL: $streamUrl")
                    
                    // Update VOD info
                    val vodInfoContainer = playerView.findViewById<LinearLayout>(R.id.vod_info_container)
                    val channelNameText = playerView.findViewById<TextView>(R.id.fullscreen_channel_name)
                    channelNameText?.text = "${currentSeriesName} - S${currentSeasonNumber}E${episodeData.series_number}: ${episodeData.name}"
                    
                    // Play the new episode
                    val mediaItem = MediaItem.fromUri(streamUrl)
                    vodPlayer?.setMediaItem(mediaItem)
                    vodPlayer?.prepare()
                    vodPlayer?.play()
                    
                    // Ensure episode navigation remains visible
                    updateEpisodeNavigationVisibility()
                    
                    Toast.makeText(this@MainActivity, "Playing E${episodeData.series_number}: ${episodeData.name}", Toast.LENGTH_SHORT).show()
                } else {
                    Toast.makeText(this@MainActivity, "Unable to load episode stream", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                android.util.Log.e("MainActivity", "Error playing episode", e)
                Toast.makeText(this@MainActivity, "Error playing episode", Toast.LENGTH_SHORT).show()
            }
        }
    }
    
    private fun updateEpisodeNavigationVisibility() {
        val episodeNavContainer = playerView.findViewById<LinearLayout>(R.id.episode_navigation_container)
        val prevButton = playerView.findViewById<Button>(R.id.prev_episode_button)
        
        episodeNavContainer?.visibility = if (isPlayingSeries) View.VISIBLE else View.GONE
        
        // Request focus on the previous button when navigation becomes visible
        if (isPlayingSeries && episodeNavContainer?.visibility == View.VISIBLE) {
            episodeNavContainer?.post {
                prevButton?.requestFocus()
                android.util.Log.d("MainActivity", "Requested focus on previous episode button")
            }
        }
        
        android.util.Log.d("MainActivity", "Episode navigation visibility: ${if (isPlayingSeries) "VISIBLE" else "GONE"}")
    }
    
    private fun setupPlayerControlsVisibility() {
        // Show controls on any key press
        playerView.setControllerVisibilityListener(
            androidx.media3.ui.PlayerView.ControllerVisibilityListener { visibility ->
                android.util.Log.d("MainActivity", "Controller visibility changed: $visibility")
            }
        )
    }
    
    private fun startTimeUpdater() {
        val timeDisplay = playerView.findViewById<TextView>(R.id.time_display)
        
        // Update time every second
        val handler = android.os.Handler(mainLooper)
        val runnable = object : Runnable {
            override fun run() {
                val calendar = java.util.Calendar.getInstance()
                val dayOfWeek = when (calendar.get(java.util.Calendar.DAY_OF_WEEK)) {
                    java.util.Calendar.MONDAY -> "Mon"
                    java.util.Calendar.TUESDAY -> "Tue"
                    java.util.Calendar.WEDNESDAY -> "Wed"
                    java.util.Calendar.THURSDAY -> "Thu"
                    java.util.Calendar.FRIDAY -> "Fri"
                    java.util.Calendar.SATURDAY -> "Sat"
                    java.util.Calendar.SUNDAY -> "Sun"
                    else -> ""
                }
                val month = when (calendar.get(java.util.Calendar.MONTH)) {
                    java.util.Calendar.JANUARY -> "Jan"
                    java.util.Calendar.FEBRUARY -> "Feb"
                    java.util.Calendar.MARCH -> "Mar"
                    java.util.Calendar.APRIL -> "Apr"
                    java.util.Calendar.MAY -> "May"
                    java.util.Calendar.JUNE -> "Jun"
                    java.util.Calendar.JULY -> "Jul"
                    java.util.Calendar.AUGUST -> "Aug"
                    java.util.Calendar.SEPTEMBER -> "Sep"
                    java.util.Calendar.OCTOBER -> "Oct"
                    java.util.Calendar.NOVEMBER -> "Nov"
                    java.util.Calendar.DECEMBER -> "Dec"
                    else -> ""
                }
                val day = calendar.get(java.util.Calendar.DAY_OF_MONTH)
                val hour = calendar.get(java.util.Calendar.HOUR)
                val minute = calendar.get(java.util.Calendar.MINUTE)
                val amPm = if (calendar.get(java.util.Calendar.AM_PM) == java.util.Calendar.AM) "a.m." else "p.m."
                
                val timeString = String.format("%s, %s %d, %d:%02d %s", dayOfWeek, month, day, if (hour == 0) 12 else hour, minute, amPm)
                timeDisplay?.text = timeString
                
                handler.postDelayed(this, 1000)
            }
        }
        handler.post(runnable)
    }
    
    private fun updatePlayerControlsForContentType() {
        val isLive = selectedTab == "TV" || currentPlayingChannel?.isLive == true
        
        // Find VOD-specific elements
        val topGradient = playerView.findViewById<View>(R.id.top_gradient)
        val topInfoBar = playerView.findViewById<View>(R.id.top_info_bar)
        val vodInfoContainer = playerView.findViewById<View>(R.id.vod_info_container)
        val qualityBadgesContainer = playerView.findViewById<View>(R.id.quality_badges_container)
        val restartButton = playerView.findViewById<ImageButton>(R.id.restart_button)
        val platformBadge = playerView.findViewById<TextView>(R.id.platform_badge)
        
        // Update platform badge based on current content
        platformBadge?.text = when (selectedTab) {
            "TV" -> "LIVE TV"
            "MOVIES" -> "MOVIES"
            "SHOWS" -> "TV SERIES"
            else -> "IPTV PLAYER"
        }
        
        // Show/hide progress bar vs LIVE badge
        progressContainer?.visibility = if (isLive) View.GONE else View.VISIBLE
        liveBadgeContainer?.visibility = if (isLive) View.VISIBLE else View.GONE
        
        // Keep all top info hidden for clean UI
        topGradient?.visibility = View.GONE
        topInfoBar?.visibility = View.GONE
        vodInfoContainer?.visibility = View.GONE
        qualityBadgesContainer?.visibility = View.GONE
        
        // Show/hide seek and restart buttons for live content
        rewindButton?.visibility = if (isLive) View.GONE else View.VISIBLE
        forwardButton?.visibility = if (isLive) View.GONE else View.VISIBLE
        restartButton?.visibility = if (isLive) View.GONE else View.VISIBLE
        
        // Show/hide episode navigation for series only
        val episodeNavContainer = playerView.findViewById<LinearLayout>(R.id.episode_navigation_container)
        episodeNavContainer?.visibility = if (isPlayingSeries && !isLive) View.VISIBLE else View.GONE
        
        // Update channel name in player controls
        fullscreenChannelName?.text = currentPlayingChannel?.name ?: ""
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
                // TODO: Open CategoryDetailActivity
            }
        )
        
        // Setup movie rows recycler
        movieRowsRecycler.apply {
            layoutManager = LinearLayoutManager(this@MainActivity)
            adapter = movieCategoryRowAdapter
            setHasFixedSize(false)
            isFocusable = false // Let children handle focus
            descendantFocusability = ViewGroup.FOCUS_AFTER_DESCENDANTS
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
                
                // Add scroll listener for lazy loading
                clearOnScrollListeners()
                addOnScrollListener(object : RecyclerView.OnScrollListener() {
                    override fun onScrolled(recyclerView: RecyclerView, dx: Int, dy: Int) {
                        super.onScrolled(recyclerView, dx, dy)
                        val layoutManager = recyclerView.layoutManager as GridLayoutManager
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
            }
        }
    }
    
    private fun setupTabListeners() {
        searchButton.setOnClickListener {
            showSearchDialog()
        }
        
        tvTab.setOnClickListener {
            switchTab("TV")
        }
        
        moviesTab.setOnClickListener {
            switchTab("MOVIES")
        }
        
        showsTab.setOnClickListener {
            switchTab("SHOWS")
        }
    }
    
    private fun setupFocusListeners() {
        searchButton.setOnFocusChangeListener { view, hasFocus ->
            if (hasFocus) {
                view.setBackgroundResource(R.drawable.nav_item_focused)
                navigationManager.expandSidebar()
                searchButton.setColorFilter(android.graphics.Color.BLACK)
            } else {
                view.setBackgroundResource(R.drawable.nav_item_normal)
                searchButton.setColorFilter(android.graphics.Color.WHITE)
                // collapse after a short delay if nothing inside sidebar is focused
                sidebarContainer.postDelayed({
                    if (!isAnySidebarFocused()) navigationManager.collapseSidebar()
                }, 200)
            }
        }
        
        tvTab.setOnFocusChangeListener { view, hasFocus ->
            if (hasFocus) {
                hoverTab = "TV"
                view.setBackgroundResource(R.drawable.nav_item_focused)
                // Black icon on white background
                tvTab.setColorFilter(android.graphics.Color.BLACK)
                navigationManager.expandSidebar()
                updateDebugDisplay()
            } else {
                applySelectedStyle(view, "TV")
                sidebarContainer.postDelayed({
                    if (!isAnySidebarFocused()) navigationManager.collapseSidebar()
                }, 200)
            }
        }
        
        moviesTab.setOnFocusChangeListener { view, hasFocus ->
            if (hasFocus) {
                hoverTab = "MOVIES"
                view.setBackgroundResource(R.drawable.nav_item_focused)
                // Black icon on white background
                moviesTab.setColorFilter(android.graphics.Color.BLACK)
                navigationManager.expandSidebar()
                updateDebugDisplay()
            } else {
                applySelectedStyle(view, "MOVIES")
                sidebarContainer.postDelayed({
                    if (!isAnySidebarFocused()) navigationManager.collapseSidebar()
                }, 200)
            }
        }
        
        showsTab.setOnFocusChangeListener { view, hasFocus ->
            if (hasFocus) {
                hoverTab = "SHOWS"
                view.setBackgroundResource(R.drawable.nav_item_focused)
                // Black icon on white background
                showsTab.setColorFilter(android.graphics.Color.BLACK)
                navigationManager.expandSidebar()
                updateDebugDisplay()
            } else {
                applySelectedStyle(view, "SHOWS")
                sidebarContainer.postDelayed({
                    if (!isAnySidebarFocused()) navigationManager.collapseSidebar()
                }, 200)
            }
        }
    }
    
    private fun applySelectedStyle(view: View, tab: String) {
        val imageView = view as android.widget.ImageView
            if (tab == selectedTab) {
            view.setBackgroundResource(R.drawable.nav_item_selected)
            // Black icon on white background for selected tab
            imageView.setColorFilter(android.graphics.Color.BLACK)
        } else {
            view.setBackgroundResource(R.drawable.nav_item_normal)
            // White icon on dark background for normal tabs
            imageView.setColorFilter(android.graphics.Color.WHITE)
        }
    }

    private fun isAnySidebarFocused(): Boolean {
        return searchButton.hasFocus() || tvTab.hasFocus() || moviesTab.hasFocus() || showsTab.hasFocus()
    }
    
    private fun switchTab(tab: String) {
        // Store previous tab to check if we're switching or returning
        val previousTab = selectedTab
        
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
                // For Movies: Hide sidebar completely for full width
                findViewById<FrameLayout>(R.id.sidebar_frame)?.visibility = View.GONE
                sidebarContainer.visibility = View.GONE
                categorySidebar.visibility = View.GONE
                
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
        // Apply styles to all tabs based on selected state
        applySelectedStyle(tvTab, "TV")
        applySelectedStyle(moviesTab, "MOVIES")
        applySelectedStyle(showsTab, "SHOWS")
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
                        
                        val response = ApiClient.apiService.getMovieCategories(
                            ApiClient.getCredentials()
                        )
                        android.util.Log.d("MainActivity", "Got ${response.categories.size} movie categories")
                        
                        // Filter out non-numeric category IDs
                        categories = response.categories
                            .filter { it.id.toIntOrNull() != null }
                            .map { Genre(it.id, it.title, it.name, it.alias, it.censored) }
                        
                        android.util.Log.d("MainActivity", "Filtered to ${categories.size} movie categories")
                        
                        // Load movies for each category (Netflix-style)
                        loadMovieRows(categories)
                    }
                    "SHOWS" -> {
                        // Hide player/preview container and "All Playlists" header for series
                        playerPreviewContainer.visibility = View.GONE
                        categoryHeaderText.visibility = View.GONE
                        movieDetailsHeaderGrid.visibility = View.GONE
                        movieDetailsHeader.visibility = View.GONE
                        val response = ApiClient.apiService.getSeriesCategories(
                            ApiClient.getCredentials()
                        )
                        // Filter out non-numeric category IDs
                        categories = response.categories
                            .filter { it.id.toIntOrNull() != null }
                            .map { Genre(it.id, it.title, it.name, it.alias, it.censored) }
                        categoryAdapter.setCategories(categories)
                        
                        // DON'T auto-select - show empty state and focus on first category
                        if (categories.isNotEmpty()) {
                            contentRecycler.visibility = View.GONE
                            emptyStateMessage.visibility = View.VISIBLE
                            emptyStateMessage.text = "Select a category to see series"
                            // Focus on first category with white bar but don't select
                            categoriesRecycler.requestFocus()
                            categoriesRecycler.post {
                                categoriesRecycler.getChildAt(0)?.requestFocus()
                            }
                        }
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
    
    private fun loadMovieRows(categories: List<Genre>) {
        android.util.Log.d("MainActivity", "loadMovieRows - Loading movies for ${categories.size} categories")
        
        // Clear existing rows immediately
        movieCategoryRowAdapter.setCategoryRows(emptyList())
        
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                // Load movies for each category and update UI immediately
                for (category in categories.take(10)) { // Load first 10 categories
                    android.util.Log.d("MainActivity", "Loading movies for category: ${category.title ?: category.name}")
                    try {
                        val moviesResponse = ApiClient.apiService.getMovies(
                            MoviesRequest(
                                mac = ApiClient.macAddress,
                                url = ApiClient.portalUrl,
                                category = category.id,
                                page = 1
                            )
                        )
                        
                        android.util.Log.d("MainActivity", "Got ${moviesResponse.items.data.size} movies for ${category.title ?: category.name}")
                        
                        if (moviesResponse.items.data.isNotEmpty()) {
                            val newRow = MovieCategoryRowAdapter.CategoryRow(
                                categoryId = category.id,
                                categoryTitle = (category.title ?: category.name) ?: "Unknown",
                                movies = moviesResponse.items.data.take(25) // Max 25 movies per row
                            )
                            
                            // Add row to adapter immediately on main thread
                            withContext(Dispatchers.Main) {
                                val isFirstRow = movieCategoryRowAdapter.itemCount == 0
                                movieCategoryRowAdapter.addCategoryRow(newRow)
                                android.util.Log.d("MainActivity", "Added category row: ${category.title ?: category.name}")
                                android.util.Log.d("MainActivity", "RecyclerView state - visibility: ${movieRowsRecycler.visibility}, width: ${movieRowsRecycler.width}, height: ${movieRowsRecycler.height}, childCount: ${movieRowsRecycler.childCount}")
                                
                                // Focus first category title immediately after first row is added
                                if (isFirstRow) {
                                    movieRowsRecycler.postDelayed({
                                        val firstRow = movieRowsRecycler.getChildAt(0)
                                        if (firstRow != null) {
                                            val categoryTitle = firstRow.findViewById<TextView>(R.id.category_title)
                                            categoryTitle?.requestFocus()
                                            android.util.Log.d("MainActivity", "Auto-focused first category title")
                                        }
                                    }, 100)
                                }
                            }
                        }
                    } catch (e: Exception) {
                        android.util.Log.e("MainActivity", "Error loading movies for category ${category.title}: ${e.message}")
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
                
                // Load first 5 pages
                for (page in 1..5) {
                    val response = ApiClient.apiService.getChannels(
                        ChannelsRequest(
                            mac = ApiClient.macAddress,
                            url = ApiClient.portalUrl,
                            genre = genreId,
                            page = page
                        )
                    )
                    
                    // Store total from first response
                    if (page == 1) {
                        totalItemsCount = response.channels.total
                        // Update header with total count
                        categoryHeaderText.text = "All Playlists ($totalItemsCount)"
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
                
                // Load first page and show immediately
                val firstResponse = ApiClient.apiService.getMovies(
                    MoviesRequest(
                        mac = ApiClient.macAddress,
                        url = ApiClient.portalUrl,
                        category = categoryId,
                        page = 1,
                        type = "vod"
                    )
                )
                
                totalItemsCount = firstResponse.items.total
                val firstMovies = firstResponse.items.data
                
                if (firstMovies.isNotEmpty()) {
                    allMovies.addAll(firstMovies)
                    val movieChannels = firstMovies.map {
                        Channel(it.id, it.name, null, buildImageUrl(it.getImageUrl()), it.cmd, categoryId)
                    }
                    allChannels.addAll(movieChannels)
                    
                    // Show first page immediately
                    channelAdapter.setChannels(allChannels)
                    contentSubtitle.text = "$totalItemsCount movies"
                    channelAdapter.setSelectedPosition(0)
                    loadingIndicator.visibility = View.GONE
                    
                    // Load remaining 4 pages in background (batch all at once)
                    val backgroundMovies = mutableListOf<com.ronika.iptvnative.models.Movie>()
                    for (page in 2..5) {
                        val response = ApiClient.apiService.getMovies(
                            MoviesRequest(
                                mac = ApiClient.macAddress,
                                url = ApiClient.portalUrl,
                                category = categoryId,
                                page = page,
                                type = "vod"
                            )
                        )
                        
                        val movies = response.items.data
                        if (movies.isEmpty()) {
                            hasMorePages = false
                            break
                        }
                        
                        backgroundMovies.addAll(movies)
                    }
                    
                    // Add all background movies at once to prevent multiple focus changes
                    if (backgroundMovies.isNotEmpty()) {
                        allMovies.addAll(backgroundMovies)
                        val movieChannels = backgroundMovies.map {
                            Channel(it.id, it.name, null, buildImageUrl(it.getImageUrl()), it.cmd, categoryId)
                        }
                        allChannels.addAll(movieChannels)
                        
                        // Single update after all pages loaded
                        runOnUiThread {
                            channelAdapter.setChannels(allChannels)
                        }
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
                
                // Load first page and show immediately
                val firstResponse = ApiClient.apiService.getSeries(
                    MoviesRequest(
                        mac = ApiClient.macAddress,
                        url = ApiClient.portalUrl,
                        category = categoryId,
                        page = 1,
                        type = "vod"
                    )
                )
                
                totalItemsCount = firstResponse.items.total
                val firstSeries = firstResponse.items.data
                
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
                        val response = ApiClient.apiService.getSeries(
                            MoviesRequest(
                                mac = ApiClient.macAddress,
                                url = ApiClient.portalUrl,
                                category = categoryId,
                                page = page,
                                type = "vod"
                            )
                        )
                        
                        val series = response.items.data
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
                        }
                    }
                    
                    
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
                        }
                    }
                    "MOVIES" -> {
                        val response = ApiClient.apiService.getMovies(
                            MoviesRequest(
                                mac = ApiClient.macAddress,
                                url = ApiClient.portalUrl,
                                category = selectedGenre.id,
                                page = currentPage,
                                type = "vod"
                            )
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
                        }
                    }
                    "SHOWS" -> {
                        val response = ApiClient.apiService.getSeries(
                            MoviesRequest(
                                mac = ApiClient.macAddress,
                                url = ApiClient.portalUrl,
                                category = selectedGenre.id,
                                page = currentPage,
                                type = "vod"
                            )
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
    
    private fun buildImageUrl(imagePath: String?): String? {
        if (imagePath.isNullOrEmpty()) return null
        
        // If already a full URL, return as is
        if (imagePath.startsWith("http")) {
            return imagePath
        }
        
        // Build full URL from portal
        val portalUrl = ApiClient.portalUrl
        val domainUrl = portalUrl.replace("/stalker_portal/?$".toRegex(), "")
        
        return if (imagePath.startsWith("/")) {
            "$domainUrl$imagePath"
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
            val series = allSeries.find { it.id == channel.id }
            val posterUrl = buildImageUrl(series?.getImageUrl())
            android.util.Log.d("MainActivity", "Opening series: ${series?.name}")
            android.util.Log.d("MainActivity", "Poster URL: $posterUrl")
            val intent = Intent(this, SeriesDetailActivity::class.java).apply {
                putExtra("SERIES_ID", channel.id)
                putExtra("SERIES_NAME", channel.name)
                putExtra("POSTER_URL", posterUrl)
                putExtra("DESCRIPTION", series?.description)
                putExtra("ACTORS", series?.actors)
                putExtra("DIRECTOR", series?.director)
                putExtra("YEAR", series?.year)
                putExtra("COUNTRY", series?.country)
                putExtra("GENRES", series?.genresStr)
                putExtra("TOTAL_SEASONS", "${series?.totalEpisodes ?: "Unknown"}")
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
        android.util.Log.d("MainActivity", "Exiting movie fullscreen - stopping VOD player")
        vodPlayer?.apply {
            stop()
            clearMediaItems()
        }
        
        // Check if we were playing a series - navigate back to SeriesDetailActivity
        if (isPlayingSeries && currentSeriesId != null) {
            android.util.Log.d("MainActivity", "Returning to SeriesDetailActivity for series: $currentSeriesName")
            val intent = Intent(this, SeriesDetailActivity::class.java).apply {
                putExtra("SERIES_ID", currentSeriesId)
                putExtra("SERIES_NAME", currentSeriesName)
                putExtra("POSTER_URL", currentSeriesPosterUrl)
                putExtra("DESCRIPTION", currentSeriesDescription)
                putExtra("ACTORS", currentSeriesActors)
                putExtra("DIRECTOR", currentSeriesDirector)
                putExtra("YEAR", currentSeriesYear)
                putExtra("COUNTRY", currentSeriesCountry)
                putExtra("GENRES", currentSeriesGenres)
                putExtra("TOTAL_SEASONS", currentSeriesTotalSeasons)
                flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            }
            startActivity(intent)
            
            // Reset series tracking
            isPlayingSeries = false
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
            return
        }
        
        // Restore normal UI (but keep categories hidden for fullscreen movies)
        sidebarContainer.visibility = View.GONE // Keep main sidebar hidden
        categorySidebar.visibility = View.GONE // Keep categories hidden
        contentHeader.visibility = View.VISIBLE
        contentListContainer.visibility = View.VISIBLE
        
        // Restore container height for movies/series (hide player)
        playerPreviewContainer.visibility = View.GONE
        val containerParams = playerPreviewContainer.layoutParams as LinearLayout.LayoutParams
        containerParams.weight = 0.55f
        playerPreviewContainer.layoutParams = containerParams
        
        isFullscreen = false
        
        // Recalculate grid for fullscreen layout (no sidebars)
        if (selectedTab == "MOVIES" || selectedTab == "SHOWS") {
            setupContentAdapter()
        }
        
        // Return focus to selected movie
        contentRecycler.post {
            val selectedPos = channelAdapter.getSelectedPosition()
            val layoutManager = contentRecycler.layoutManager as? androidx.recyclerview.widget.GridLayoutManager
            layoutManager?.let {
                val viewAtPosition = it.findViewByPosition(selectedPos)
                viewAtPosition?.requestFocus()
            }
        }
        
        android.util.Log.d("MainActivity", "Exited movie fullscreen")
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
        
        val isInFullscreen = if (selectedTab == "TV") {
            liveTVManager?.isInFullscreen() ?: false
        } else {
            isFullscreen
        }
        
        android.util.Log.d("MainActivity", "handleBackButton - isInFullscreen: $isInFullscreen")
        
        // In video fullscreen - exit to preview/content view
        if (isInFullscreen) {
            if (selectedTab == "TV") {
                // Exit Live TV fullscreen - go back to channel list
                liveTVManager?.exitFullscreen()
                android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                    findViewById<RecyclerView>(R.id.live_channels_recycler)?.requestFocus()
                }, 150)
            } else {
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
                
                android.util.Log.d("MainActivity", "Set visibilities and brought sidebar to front - sidebarFrame: ${sidebarFrame.visibility}, sidebarContainer: ${sidebarContainer.visibility}")
                sidebarContainer.requestFocus()
                return
            }
        }
        
        // If on main sidebar, exit app
        val sidebarFrame = findViewById<FrameLayout>(R.id.sidebar_frame)
        if (sidebarContainer.visibility == View.VISIBLE && sidebarFrame?.visibility == View.VISIBLE) {
            android.util.Log.d("MainActivity", "Exiting app from main sidebar")
            finish()
            return
        }
        
        // Default: exit app (shouldn't reach here normally)
        finish()
    }
    
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        android.util.Log.d("MainActivity", "Key pressed: $keyCode")
        
        // Show player controls on any key press when in fullscreen
        val isInFullscreen = if (selectedTab == "TV") {
            liveTVManager?.isInFullscreen() ?: false
        } else {
            isFullscreen
        }
        
        if (isInFullscreen && playerView.player != null) {
            playerView.showController()
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
                    // Just show main sidebar on top
                    sidebarFrame.visibility = View.VISIBLE
                    sidebarContainer.visibility = View.VISIBLE
                    categorySidebar.visibility = View.GONE
                    
                    // Focus on the main navigation sidebar
                    sidebarContainer.requestFocus()
                    
                    return true
                }
            }
            
            // In content view (Movies/Shows) with both sidebars hidden - show categories
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
            
            // In categories with main sidebar hidden - show main sidebar
            if (categorySidebar.visibility == View.VISIBLE && 
                sidebarContainer.visibility == View.GONE) {
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
            
            // Otherwise, let system handle BACK (exit app)
        }
        
        // Handle custom player controls in fullscreen
        if (isInFullscreen) {
            when (keyCode) {
                // UP key - next channel in Live TV, focus restart button in VOD
                KeyEvent.KEYCODE_DPAD_UP -> {
                    if (selectedTab == "TV") {
                        // Live TV: UP goes to next channel
                        liveTVManager?.playNextChannel()
                        return true
                    } else {
                        // VOD: focus restart button
                        val restartButton = playerView.findViewById<ImageButton>(R.id.restart_button)
                        restartButton?.requestFocus()
                        return true
                    }
                }
                
                // DOWN key - previous channel in Live TV
                KeyEvent.KEYCODE_DPAD_DOWN -> {
                    if (selectedTab == "TV") {
                        // Live TV: DOWN goes to previous channel
                        liveTVManager?.playPreviousChannel()
                        return true
                    }
                }
                
                // LEFT key - rewind 10 seconds
                KeyEvent.KEYCODE_DPAD_LEFT -> {
                    if (selectedTab == "MOVIES" || selectedTab == "SHOWS") {
                        rewindButton?.performClick()
                        return true
                    }
                }
                
                // RIGHT key - forward 10 seconds
                KeyEvent.KEYCODE_DPAD_RIGHT -> {
                    if (selectedTab == "MOVIES" || selectedTab == "SHOWS") {
                        forwardButton?.performClick()
                        return true
                    }
                }
                
                // CENTER/OK key - toggle play/pause with overlay
                KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                    playerView.player?.let { player ->
                        if (player.isPlaying) {
                            player.pause()
                        } else {
                            player.play()
                        }
                        showPlayPauseOverlay(true)
                        return true
                    }
                }
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
        
        // Get actual stream URL from backend API
        lifecycleScope.launch {
            try {
                // For VOD content, we need to get movie info first
                var finalCmd = rawCmd
                if (contentType == "vod") {
                    android.util.Log.d("MainActivity", "VOD detected - getting movie info for ID: ${channel.id}")
                    try {
                        val movieInfoResponse = ApiClient.apiService.getMovieInfo(
                            mapOf(
                                "mac" to ApiClient.macAddress,
                                "url" to ApiClient.portalUrl,
                                "movieId" to channel.id
                            )
                        )
                        val fileInfo = movieInfoResponse.fileInfo
                        if (fileInfo != null && fileInfo.id != null) {
                            finalCmd = "/media/file_${fileInfo.id}.mpg"
                            android.util.Log.d("MainActivity", "Got movie file info - new CMD: $finalCmd")
                        } else {
                            android.util.Log.w("MainActivity", "No file info found, using original CMD")
                        }
                    } catch (e: Exception) {
                        android.util.Log.e("MainActivity", "Error getting movie info: ${e.message}")
                        // Continue with original CMD
                    }
                }
                
                android.util.Log.d("MainActivity", "Requesting stream URL from API with CMD: $finalCmd")
                val response = ApiClient.apiService.getStreamUrl(
                    com.ronika.iptvnative.api.StreamUrlRequest(
                        mac = ApiClient.macAddress,
                        url = ApiClient.portalUrl,
                        cmd = finalCmd,
                        type = contentType
                    )
                )
                
                val streamUrl = response.url
                android.util.Log.d("MainActivity", "Got stream URL: $streamUrl")
                
                if (streamUrl.isEmpty()) {
                    android.util.Log.e("MainActivity", "Received empty stream URL")
                    return@launch
                }
                
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
    }
    
    override fun onStop() {
        super.onStop()
        // Stop players when app is no longer visible
        livePlayer?.stop()
        vodPlayer?.stop()
    }
    
    override fun onDestroy() {
        super.onDestroy()
        // Unregister broadcast receiver to prevent leak
        try {
            unregisterReceiver(reloadReceiver)
        } catch (e: IllegalArgumentException) {
            // Receiver was not registered, ignore
        }
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
}
