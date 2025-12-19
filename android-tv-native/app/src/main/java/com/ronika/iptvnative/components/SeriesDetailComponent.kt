package com.ronika.iptvnative.components

import android.content.Context
import android.util.AttributeSet
import android.util.Log
import android.view.KeyEvent
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import coil.imageLoader
import coil.load
import com.ronika.iptvnative.R
import com.ronika.iptvnative.adapters.EpisodeHorizontalAdapter
import com.ronika.iptvnative.database.AppDatabase
import com.ronika.iptvnative.database.dao.ProviderDao
import com.ronika.iptvnative.models.Episode
import com.ronika.iptvnative.models.Season
import com.ronika.iptvnative.repository.FavoriteRepository
import com.ronika.iptvnative.services.TmdbService
import kotlinx.coroutines.*

class SeriesDetailComponent @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : FrameLayout(context, attrs, defStyleAttr) {

    private val TAG = "SeriesDetail"
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    
    // Views
    private lateinit var container: ViewGroup
    private lateinit var backdropArea: FrameLayout
    private lateinit var infoArea: LinearLayout
    private lateinit var backdropImage: ImageView
    private lateinit var titleText: TextView
    private lateinit var yearText: TextView
    private lateinit var seasonsText: TextView
    private lateinit var ratingText: TextView
    private lateinit var descriptionText: TextView
    private lateinit var seriesDescription: TextView
    private lateinit var actionButtonsContainer: LinearLayout
    private lateinit var playButton: Button
    private lateinit var favoriteButton: Button
    private lateinit var episodesTab: TextView
    private lateinit var seasonSelector: Spinner
    private lateinit var episodeDescription: TextView
    private lateinit var episodesRecycler: RecyclerView
    private lateinit var loadingIndicator: ProgressBar
    private lateinit var tmdbLoading: ProgressBar
    private lateinit var contentScroll: ScrollView
    private lateinit var genresContainer: LinearLayout
    
    // Data
    private var seriesId: String = ""
    private var seriesName: String = ""
    private var seriesYear: String? = null
    private var posterUrl: String? = null
    private val seasons = mutableListOf<Season>()
    private val allEpisodesBySeason = mutableMapOf<String, List<Episode>>()
    private var firstEpisode: Episode? = null
    private var firstSeason: Season? = null
    private var currentSeasonIndex = 0
    private var currentFocusedEpisode: Episode? = null
    
    // TMDB Data
    private var tmdbTvId: Int? = null
    private val tmdbSeasonData = mutableMapOf<Int, TmdbService.TmdbSeason>()
    
    // Track currently playing episode
    private var currentPlayingSeasonId: String? = null
    private var currentPlayingEpisodeId: String? = null
    
    // Favourite state
    private var isFavorited = false
    private val favoriteRepository = FavoriteRepository(context)
    
    // Public getters for series info
    fun getCurrentSeriesName(): String = seriesName
    fun getCurrentSeriesId(): String = seriesId
    fun getCurrentPosterUrl(): String? = posterUrl
    
    // Focus on specific episode (for returning from player)
    fun focusOnEpisode(episodeId: String) {
        post {
            val adapter = episodeAdapter ?: return@post
            val episodes = adapter.episodes
            val position = episodes.indexOfFirst { it.id == episodeId }
            if (position >= 0) {
                Log.d(TAG, "📍 Focusing on episode at position $position (ID: $episodeId)")
                episodesRecycler.scrollToPosition(position)
                episodesRecycler.post {
                    val viewHolder = episodesRecycler.findViewHolderForAdapterPosition(position)
                    viewHolder?.itemView?.requestFocus()
                    Log.d(TAG, "📍 Episode focused successfully")
                }
            } else {
                Log.w(TAG, "📍 Episode ID $episodeId not found in current episode list")
            }
        }
    }
    
    // Animation state
    private var isBackdropHidden = false
    
    // Episode adapter
    private var episodeAdapter: EpisodeHorizontalAdapter? = null
    
    // Callbacks
    private var onBackPressed: (() -> Unit)? = null
    private var onPlayEpisode: ((String, String, String, String, String, String) -> Unit)? = null
    
    // API client - initialized lazily from provider
    private var stalkerClient: com.ronika.iptvnative.api.StalkerClient? = null
    private var portalBaseUrl: String = ""
    private val providerDao: ProviderDao = AppDatabase.getDatabase(context).providerDao()
    
    // Track which provider this component is using
    private var currentProviderId: String? = null
    
    /**
     * Initialize the client with a specific provider.
     * This should be called before showSeries() when you know which provider to use.
     */
    fun initializeWithProvider(providerId: String) {
        currentProviderId = providerId
        // Reset client so it gets re-initialized with the correct provider
        stalkerClient = null
        portalBaseUrl = ""
        Log.d(TAG, "SeriesDetail: Set to use provider: $providerId")
    }
    
    private suspend fun initializeClient() {
        if (stalkerClient == null) {
            val provider = withContext(Dispatchers.IO) {
                // Use specific provider if set, otherwise fall back to active provider
                if (currentProviderId != null) {
                    providerDao.getProviderById(currentProviderId!!)
                } else {
                    providerDao.getActiveProvider()
                }
            }
            if (provider != null) {
                portalBaseUrl = provider.serverUrl.trimEnd('/')
                stalkerClient = com.ronika.iptvnative.api.StalkerClient(
                    portalUrl = provider.serverUrl,
                    macAddress = provider.macAddress ?: "",
                    token = provider.token ?: "",
                    serialNumber = provider.serialNumber ?: ""
                )
                Log.d(TAG, "SeriesDetail: Initialized StalkerClient with provider: ${provider.name} (id: ${provider.id})")
            } else {
                Log.e(TAG, "SeriesDetail: No provider found! currentProviderId=$currentProviderId")
            }
        }
    }
    
    /**
     * Get the current StalkerClient for use by external callers (e.g., MainActivity for playback)
     * This ensures the same provider is used for both loading series data and playing episodes
     */
    fun getStalkerClient(): com.ronika.iptvnative.api.StalkerClient? = stalkerClient
    
    /**
     * Get the portal base URL for building image URLs
     */
    fun getPortalBaseUrl(): String = portalBaseUrl
    
    init {
        LayoutInflater.from(context).inflate(R.layout.screen_series_detail, this, true)
        setupViews()
    }
    
    private fun setupViews() {
        container = findViewById(R.id.series_detail_container)
        contentScroll = findViewById(R.id.series_content_scroll)
        backdropArea = findViewById(R.id.series_backdrop_area)
        infoArea = findViewById(R.id.series_info_area)
        backdropImage = findViewById(R.id.series_detail_backdrop)
        titleText = findViewById(R.id.series_detail_title)
        yearText = findViewById(R.id.series_detail_year)
        seasonsText = findViewById(R.id.series_detail_seasons)
        ratingText = findViewById(R.id.series_detail_rating)
        descriptionText = findViewById(R.id.series_detail_description)
        seriesDescription = findViewById(R.id.series_detail_description)
        actionButtonsContainer = findViewById(R.id.series_action_buttons_container)
        playButton = findViewById(R.id.series_detail_play_button)
        favoriteButton = findViewById(R.id.series_detail_favorite_button)
        episodesTab = findViewById(R.id.series_episodes_tab)
        seasonSelector = findViewById(R.id.series_season_selector)
        episodeDescription = findViewById(R.id.series_episode_description)
        episodesRecycler = findViewById(R.id.series_episodes_recycler)
        loadingIndicator = findViewById(R.id.series_detail_loading)
        tmdbLoading = findViewById(R.id.tmdb_loading)
        genresContainer = findViewById(R.id.series_genres_container)
        
        // Set fade gradient sizes to 40% of screen
        post {
            val displayMetrics = context.resources.displayMetrics
            val screenWidth = displayMetrics.widthPixels
            val screenHeight = displayMetrics.heightPixels
            
            // Left fade is 40% of screen width
            val fadeLeft = findViewById<View>(R.id.fade_left)
            val fadeLeftParams = fadeLeft.layoutParams
            fadeLeftParams.width = (screenWidth * 0.4f).toInt()
            fadeLeft.layoutParams = fadeLeftParams
            
            // Bottom fade is 40% of screen height
            val fadeBottom = findViewById<View>(R.id.fade_bottom)
            val fadeBottomParams = fadeBottom.layoutParams
            fadeBottomParams.height = (screenHeight * 0.4f).toInt()
            fadeBottom.layoutParams = fadeBottomParams
            
            android.util.Log.d("SeriesDetail", "Fade overlays set - L: ${fadeLeftParams.width}px, B: ${fadeBottomParams.height}px")
        }
        
        // Setup RecyclerView with proper focus handling
        episodesRecycler.layoutManager = LinearLayoutManager(context, LinearLayoutManager.HORIZONTAL, false)
        episodesRecycler.isFocusable = false
        episodesRecycler.isFocusableInTouchMode = false
        episodesRecycler.descendantFocusability = android.view.ViewGroup.FOCUS_AFTER_DESCENDANTS
        
        // Setup button focus navigation
        playButton.nextFocusRightId = R.id.series_detail_favorite_button
        favoriteButton.nextFocusLeftId = R.id.series_detail_play_button
        playButton.nextFocusDownId = R.id.series_season_selector
        favoriteButton.nextFocusDownId = R.id.series_season_selector
        seasonSelector.nextFocusDownId = R.id.series_episodes_recycler
        
        setupButtonListeners()
        setupFocusListeners()
    }
    
    private fun setupButtonListeners() {
        playButton.setOnClickListener {
            firstEpisode?.let { episode ->
                firstSeason?.let { season ->
                    Log.d(TAG, "Playing first episode: ${episode.name}")
                    currentPlayingSeasonId = episode.seasonId
                    currentPlayingEpisodeId = episode.id
                    onPlayEpisode?.invoke(
                        seriesId,
                        episode.seasonId,
                        episode.id,
                        season.seasonNumber,
                        episode.episodeNumber,
                        episode.name
                    )
                }
            }
        }
        
        favoriteButton.setOnClickListener {
            scope.launch {
                try {
                    isFavorited = favoriteRepository.toggleFavorite(
                        itemId = seriesId,
                        type = FavoriteRepository.TYPE_SERIES,
                        providerId = currentProviderId ?: "",
                        name = seriesName,
                        poster = posterUrl,
                        cmd = null
                    )
                    withContext(Dispatchers.Main) {
                        updateFavoriteButtonUI()
                    }
                    Log.d(TAG, "Toggled favorite for series $seriesId: isFavorited=$isFavorited")
                } catch (e: Exception) {
                    Log.e(TAG, "Error toggling favorite", e)
                }
            }
        }
        
        // Season selector listener
        seasonSelector.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                if (position != currentSeasonIndex && seasons.isNotEmpty()) {
                    currentSeasonIndex = position
                    loadEpisodesForSeason(position)
                }
            }
            
            override fun onNothingSelected(parent: AdapterView<*>?) {}
        }
        
        // Handle back button
        container.isFocusable = true
        container.isFocusableInTouchMode = true
    }
    
    private fun setupFocusListeners() {
        // When episodes recycler gets focus, hide backdrop/info with animation
        episodesRecycler.setOnFocusChangeListener { _, hasFocus ->
            if (hasFocus && !isBackdropHidden) {
                hideBackdropArea()
            }
        }
        
        // Season selector: hide buttons/description and animate episodes up
        seasonSelector.setOnFocusChangeListener { view, hasFocus ->
            if (hasFocus) {
                // Change text color to black on focus
                (view as? Spinner)?.let { spinner ->
                    (spinner.selectedView as? TextView)?.setTextColor(android.graphics.Color.BLACK)
                }
                
                // Hide title, year, rating, buttons and description with animation
                titleText.animate()
                    .alpha(0f)
                    .setDuration(200)
                    .withEndAction {
                        titleText.visibility = View.GONE
                    }
                    .start()
                
                yearText.animate()
                    .alpha(0f)
                    .setDuration(200)
                    .withEndAction {
                        yearText.visibility = View.GONE
                    }
                    .start()
                
                seasonsText.animate()
                    .alpha(0f)
                    .setDuration(200)
                    .withEndAction {
                        seasonsText.visibility = View.GONE
                    }
                    .start()
                
                ratingText.animate()
                    .alpha(0f)
                    .setDuration(200)
                    .withEndAction {
                        ratingText.visibility = View.GONE
                    }
                    .start()
                
                actionButtonsContainer.animate()
                    .alpha(0f)
                    .setDuration(200)
                    .withEndAction {
                        actionButtonsContainer.visibility = View.GONE
                    }
                    .start()
                    
                seriesDescription.animate()
                    .alpha(0f)
                    .setDuration(200)
                    .withEndAction {
                        seriesDescription.visibility = View.GONE
                    }
                    .start()
                    
            } else {
                // Restore white text when not focused
                (view as? Spinner)?.let { spinner ->
                    (spinner.selectedView as? TextView)?.setTextColor(android.graphics.Color.WHITE)
                }
                
                // Don't show anything when losing focus
                // They will only show when buttons themselves get focus
            }
        }
        
        // When buttons get focus, show buttons/description with animation
        val showButtonsListener = View.OnFocusChangeListener { _, hasFocus ->
            if (hasFocus) {
                // Show title, year, rating
                titleText.visibility = View.VISIBLE
                titleText.animate()
                    .alpha(1f)
                    .setDuration(200)
                    .start()
                
                yearText.visibility = View.VISIBLE
                yearText.animate()
                    .alpha(1f)
                    .setDuration(200)
                    .start()
                
                seasonsText.visibility = View.VISIBLE
                seasonsText.animate()
                    .alpha(1f)
                    .setDuration(200)
                    .start()
                
                ratingText.visibility = View.VISIBLE
                ratingText.animate()
                    .alpha(1f)
                    .setDuration(200)
                    .start()
                
                // Show buttons and description with animation
                actionButtonsContainer.visibility = View.VISIBLE
                actionButtonsContainer.animate()
                    .alpha(1f)
                    .setDuration(200)
                    .start()
                    
                seriesDescription.visibility = View.VISIBLE
                seriesDescription.animate()
                    .alpha(1f)
                    .setDuration(200)
                    .start()
                    
                // Also show backdrop if hidden
                if (isBackdropHidden) {
                    showBackdropArea()
                }
            }
        }
        
        playButton.onFocusChangeListener = showButtonsListener
        favoriteButton.onFocusChangeListener = showButtonsListener
    }
    
    private fun hideBackdropArea() {
        isBackdropHidden = true
        backdropArea.animate()
            .alpha(0f)
            .translationY(-100f)
            .setDuration(300)
            .withEndAction {
                backdropArea.visibility = View.GONE
            }
            .start()
            
        infoArea.animate()
            .alpha(0f)
            .translationY(-50f)
            .setDuration(300)
            .withEndAction {
                infoArea.visibility = View.GONE
            }
            .start()
    }
    
    private fun showBackdropArea() {
        isBackdropHidden = false
        backdropArea.visibility = View.VISIBLE
        backdropArea.alpha = 0f
        backdropArea.translationY = -100f
        backdropArea.animate()
            .alpha(1f)
            .translationY(0f)
            .setDuration(300)
            .start()
            
        infoArea.visibility = View.VISIBLE
        infoArea.alpha = 0f
        infoArea.translationY = -50f
        infoArea.animate()
            .alpha(1f)
            .translationY(0f)
            .setDuration(300)
            .start()
    }
    
    private fun loadEpisodesForSeason(seasonIndex: Int) {
        if (seasonIndex < 0 || seasonIndex >= seasons.size) return
        
        val season = seasons[seasonIndex]
        val episodes = allEpisodesBySeason[season.id] ?: emptyList()
        
        // Update adapter
        episodeAdapter = EpisodeHorizontalAdapter(
            episodes = episodes,
            seriesId = seriesId,
            providerId = currentProviderId ?: "",
            seriesPosterUrl = posterUrl,
            seasonNumber = season.seasonNumber,
            onEpisodeClick = { episode ->
                Log.d(TAG, "Playing episode: ${episode.name}")
                currentPlayingSeasonId = episode.seasonId
                currentPlayingEpisodeId = episode.id
                onPlayEpisode?.invoke(
                    seriesId,
                    episode.seasonId,
                    episode.id,
                    season.seasonNumber,
                    episode.episodeNumber,
                    episode.name
                )
            },
            onEpisodeFocused = { episode ->
                // Show episode description when focused (Prime-like behavior)
                if (!episode.tmdbDescription.isNullOrEmpty()) {
                    episodeDescription.text = episode.tmdbDescription
                    episodeDescription.visibility = View.VISIBLE
                } else {
                    episodeDescription.visibility = View.GONE
                }
            }
        )
        
        episodesRecycler.adapter = episodeAdapter
        
        // Don't auto-focus episodes on initial load to prevent scroll down
        // User can navigate down to episodes manually
        android.util.Log.e("SeriesDetail", "Episodes adapter set, not requesting focus to prevent scroll")
    }
    
    private fun updateEpisodeDescription(episode: Episode, seasonNumber: String) {
        currentFocusedEpisode = episode
        
        // Try to get TMDB description
        val seasonNum = seasonNumber.toIntOrNull() ?: 1
        val episodeNum = extractEpisodeNumber(episode.name) ?: episode.episodeNumber.toIntOrNull() ?: 1
        
        val tmdbEpisode = tmdbSeasonData[seasonNum]?.episodes?.find { it.episodeNumber == episodeNum }
        
        if (tmdbEpisode != null && !tmdbEpisode.overview.isNullOrBlank()) {
            episodeDescription.text = tmdbEpisode.overview
            episodeDescription.visibility = View.VISIBLE
        } else {
            episodeDescription.visibility = View.GONE
        }
    }
    
    fun showSeries(
        id: String,
        name: String,
        year: String?,
        description: String?,
        posterUrl: String?,
        director: String?,
        actors: String?,
        categoryName: String
    ) {
        this.seriesId = id
        this.seriesName = name
        this.seriesYear = year
        this.posterUrl = posterUrl
        
        // 🧹 CLEAR OLD DATA FIRST to prevent stale data
        Log.d(TAG, "🧹 Clearing old episode data before loading new series: $name")
        
        // Show loading state IMMEDIATELY
        loadingIndicator.visibility = View.VISIBLE
        container.visibility = View.VISIBLE
        
        // Hide all content until data is ready
        backdropArea.visibility = View.GONE
        infoArea.visibility = View.GONE
        episodesRecycler.visibility = View.GONE
        
        // Clear Coil cache for previous series
        try {
            context.imageLoader.memoryCache?.clear()
            context.imageLoader.diskCache?.clear()
        } catch (e: Exception) {
            Log.w(TAG, "Cache clear failed: ${e.message}")
        }
        
        seasons.clear()
        allEpisodesBySeason.clear()
        episodesRecycler.adapter = null
        episodeAdapter = null
        firstEpisode = null
        firstSeason = null
        
        // CRITICAL: Reset ALL TMDB data to prevent using previous series data
        tmdbTvId = null
        tmdbSeasonData.clear()
        Log.d(TAG, "🔄 Reset tmdbTvId and season cache for new series")
        
        // Scroll to top preparation
        contentScroll.scrollTo(0, 0)
        contentScroll.post {
            contentScroll.scrollTo(0, 0)
            contentScroll.smoothScrollTo(0, 0)
        }
        
        // Request focus on Play button to show top content
        playButton.post {
            playButton.requestFocus()
        }
        
        // Set info
        titleText.text = name
        yearText.text = year ?: ""
        descriptionText.text = description ?: "No description available"
        
        // Hide rating initially, will be set by TMDB if available
        ratingText.visibility = View.GONE
        
        // Load TMDB data FIRST to get TV ID, then load seasons
        scope.launch {
            try {
                // CRITICAL: Load TMDB first to populate tmdbTvId before loading episodes
                loadTmdbData()
                
                // Now load seasons and episodes with TMDB TV ID available
                loadSeasonsAndEpisodes()
                
                // Now show all content at once with fade-in animation
                withContext(Dispatchers.Main) {
                    backdropArea.visibility = View.VISIBLE
                    infoArea.visibility = View.VISIBLE
                    episodesRecycler.visibility = View.VISIBLE
                    
                    // Smooth fade-in animation
                    backdropArea.alpha = 0f
                    infoArea.alpha = 0f
                    episodesRecycler.alpha = 0f
                    
                    backdropArea.animate().alpha(1f).setDuration(300).start()
                    infoArea.animate().alpha(1f).setDuration(300).start()
                    episodesRecycler.animate().alpha(1f).setDuration(300).start()
                }
                
                // Check for saved progress after loading episodes
                checkSeriesProgress()
            } catch (e: Exception) {
                Log.e(TAG, "Error loading series data", e)
                withContext(Dispatchers.Main) {
                    Toast.makeText(context, "Failed to load series data", Toast.LENGTH_SHORT).show()
                }
            } finally {
                loadingIndicator.visibility = View.GONE
            }
        }
    }
    
    private suspend fun loadTmdbData() {
        android.util.Log.e("SeriesDetailComponent", "==========================================")
        android.util.Log.e("SeriesDetailComponent", "loadTmdbData() STARTED for: $seriesName")
        android.util.Log.e("SeriesDetailComponent", "==========================================")
        
        withContext(Dispatchers.Main) {
            tmdbLoading.visibility = View.VISIBLE
        }
        
        try {
            val yearInt = seriesYear?.toIntOrNull()
            android.util.Log.e("SeriesDetailComponent", "Calling TmdbService.smartSearch for: $seriesName, year: $yearInt")
            
            val tmdbDetails = TmdbService.smartSearch(seriesName, "tv", yearInt)
            
            if (tmdbDetails != null) {
                android.util.Log.e("SeriesDetailComponent", "TMDB data found! Title: ${tmdbDetails.title}, TV ID: ${tmdbDetails.id}")
                withContext(Dispatchers.Main) {
                    displayTmdbData(tmdbDetails)
                }
            } else {
                android.util.Log.e("SeriesDetailComponent", "NO TMDB data found, using provider data")
                // Load provider backdrop if TMDB not found
                withContext(Dispatchers.Main) {
                    val fullPosterUrl = if (posterUrl?.startsWith("http") == true) {
                        posterUrl
                    } else if (portalBaseUrl.isNotEmpty()) {
                        "$portalBaseUrl$posterUrl"
                    } else {
                        posterUrl ?: ""
                    }
                    backdropImage.load(fullPosterUrl) {
                        crossfade(300)
                        placeholder(R.drawable.ic_movie_placeholder)
                        error(R.drawable.ic_movie_placeholder)
                    }
                }
            }
            
            // Fade in content after TMDB check completes
            withContext(Dispatchers.Main) {
                backdropImage.animate().alpha(1f).setDuration(300).start()
                titleText.animate().alpha(1f).setDuration(300).start()
                playButton.animate().alpha(1f).setDuration(300).start()
            }
            
        } catch (e: Exception) {
            android.util.Log.e("SeriesDetailComponent", "Error loading TMDB data", e)
            // Show provider data on error
            withContext(Dispatchers.Main) {
                backdropImage.animate().alpha(1f).setDuration(300).start()
                titleText.animate().alpha(1f).setDuration(300).start()
                playButton.animate().alpha(1f).setDuration(300).start()
            }
        } finally {
            withContext(Dispatchers.Main) {
                tmdbLoading.visibility = View.GONE
            }
        }
    }
    
    private fun displayTmdbData(details: TmdbService.TmdbDetails) {
        android.util.Log.d("SeriesDetailComponent", "Displaying TMDB data for: ${details.title}")
        
        // Store TMDB TV ID for season lookups
        tmdbTvId = details.id
        
        // Title (replace with TMDB title)
        titleText.text = details.title ?: seriesName
        
        // Year and seasons combined
        val yearSeasonsText = buildString {
            if (!details.releaseDate.isNullOrEmpty()) {
                append(details.releaseDate.substring(0, 4))
            } else if (!seriesYear.isNullOrEmpty()) {
                append(seriesYear)
            }
            if (isNotEmpty() && seasons.size > 0) {
                append("  •  ")
            }
            if (seasons.size > 0) {
                append("${seasons.size} ${if (seasons.size == 1) "Season" else "Seasons"}")
            }
        }
        yearText.text = yearSeasonsText
        
        // Description - use TMDB overview
        if (!details.overview.isNullOrEmpty()) {
            descriptionText.text = details.overview
        }
        
        // Genres (from TMDB)
        if (details.genres.isNotEmpty()) {
            genresContainer.removeAllViews()
            details.genres.take(5).forEach { genre ->
                val chip = createGenreChip(genre.name)
                genresContainer.addView(chip)
            }
            genresContainer.visibility = View.VISIBLE
        } else {
            genresContainer.visibility = View.GONE
        }
        
        // Rating badge (if available)
        val rating = details.voteAverage
        if (rating != null && rating > 0) {
            ratingText.text = String.format("★ %.1f", rating)
            ratingText.visibility = View.VISIBLE
            android.util.Log.d("SeriesDetailComponent", "TMDB rating: $rating")
        }
        
        // Genres
        if (!details.genres.isNullOrEmpty()) {
            val genreText = details.genres.joinToString(" • ")
            android.util.Log.d("SeriesDetailComponent", "Genres: $genreText")
            // You can display genres in the UI if needed
        }
        
        // Load TMDB backdrop
        if (!details.backdropPath.isNullOrEmpty()) {
            val backdropUrl = "https://image.tmdb.org/t/p/original${details.backdropPath}"
            android.util.Log.d("SeriesDetailComponent", "Loading TMDB backdrop: $backdropUrl")
            backdropImage.load(backdropUrl) {
                crossfade(300)
                placeholder(R.drawable.ic_movie_placeholder)
                error(R.drawable.ic_movie_placeholder)
            }
        }
    }
    
    private suspend fun loadTmdbSeasonData(tvId: Int, seasonNumber: Int) {
        // Check if already cached
        if (tmdbSeasonData.containsKey(seasonNumber)) return
        
        try {
            android.util.Log.d("SeriesDetailComponent", "Loading TMDB season data for TV ID: $tvId, Season: $seasonNumber")
            val seasonData = TmdbService.getSeasonDetails(tvId, seasonNumber)
            if (seasonData != null) {
                tmdbSeasonData[seasonNumber] = seasonData
                android.util.Log.d("SeriesDetailComponent", "TMDB season data loaded: ${seasonData.episodes?.size} episodes")
            }
        } catch (e: Exception) {
            android.util.Log.e("SeriesDetailComponent", "Failed to load TMDB season data", e)
        }
    }
    
    private suspend fun checkSeriesProgress() {
        withContext(Dispatchers.IO) {
            try {
                val repository = com.ronika.iptvnative.repository.WatchProgressRepository(context)
                val progress = repository.getProgress(seriesId, "SERIES", currentProviderId ?: "")
                
                withContext(Dispatchers.Main) {
                    if (progress != null && progress.currentPosition > 0) {
                        val percentage = progress.progressPercentage
                        val episodeName = progress.episodeNumber?.let { "E$it" } ?: "Episode"
                        val seasonName = progress.seasonNumber?.let { "S$it" } ?: "Season"
                        playButton.text = "▶ Resume $seasonName$episodeName"
                        
                        Log.d(TAG, "Found progress for series: $seasonName $episodeName at $percentage%")
                    } else {
                        // No progress, show first episode info
                        if (firstEpisode != null && firstSeason != null) {
                            val seasonNum = firstSeason?.seasonNumber ?: "1"
                            val episodeNum = firstEpisode?.episodeNumber ?: "1"
                            playButton.text = "▶ Play S${seasonNum}E${episodeNum}"
                        } else {
                            playButton.text = "▶ Play"
                        }
                    }
                    playButton.isEnabled = true
                    
                    // Request focus on play button
                    playButton.postDelayed({
                        playButton.requestFocus()
                    }, 200)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error checking series progress", e)
            }
        }
    }
    
    private suspend fun loadSeasonsAndEpisodes() {
        initializeClient()
        val client = stalkerClient
        if (client == null) {
            Log.e(TAG, "StalkerClient not initialized!")
            return
        }
        
        withContext(Dispatchers.IO) {
            try {
                Log.d(TAG, "Loading seasons for series: $seriesId")
                
                // Get seasons
                val jsData = client.getSeriesSeasons(seriesId)
                val dataList = jsData["data"] as? List<*> ?: emptyList<Any>()
                
                Log.d(TAG, "Seasons loaded: ${dataList.size}")
                
                // Convert to Season objects
                val seasonsList = dataList.mapNotNull { item ->
                    val seasonMap = item as? Map<*, *> ?: return@mapNotNull null
                    val id = seasonMap["id"]?.toString() ?: return@mapNotNull null
                    val name = seasonMap["name"]?.toString() ?: ""
                    val seasonNumber = seasonMap["season_number"]?.toString() ?: ""
                    
                    Season(
                        id = id,
                        name = name.ifEmpty { "Season $seasonNumber" },
                        seasonNumber = seasonNumber
                    )
                }
                
                seasons.clear()
                seasons.addAll(seasonsList)
                
                // Update seasons count
                withContext(Dispatchers.Main) {
                    seasonsText.text = "${seasons.size} Season${if (seasons.size != 1) "s" else ""}"
                }
                
                // Load episodes for each season
                for (season in seasons) {
                    loadEpisodesForSeasonData(season)
                }
                
                // Setup season spinner after loading all seasons
                withContext(Dispatchers.Main) {
                    setupSeasonSpinner()
                }
                
            } catch (e: Exception) {
                Log.e(TAG, "Error loading seasons", e)
                throw e
            }
        }
    }
    
    private fun setupSeasonSpinner() {
        if (seasons.isEmpty()) return
        
        val seasonNames = seasons.map { it.name }
        val adapter = ArrayAdapter(context, android.R.layout.simple_spinner_item, seasonNames)
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        seasonSelector.adapter = adapter
        
        // Load first season by default
        if (seasons.isNotEmpty()) {
            currentSeasonIndex = 0
            loadEpisodesForSeason(0)
        }
    }
    
    /**
     * Get TMDB episode data for a provider episode
     * Matches by episode number extracted from name or episode_num field
     */
    private fun getTmdbEpisodeData(episodeName: String, episodeNum: String, seasonNumber: Int): TmdbService.TmdbEpisode? {
        val tmdbSeason = tmdbSeasonData[seasonNumber]
        
        if (tmdbSeason == null) {
            Log.w(TAG, "❌ No TMDB season data for season $seasonNumber")
            return null
        }
        
        // Try to extract episode number
        var episodeNumber: Int? = null
        
        // Strategy 1: From episode_num field (most reliable)
        episodeNum.toIntOrNull()?.let { 
            episodeNumber = it
            Log.d(TAG, "✓ Got episode number from field: $it")
        }
        
        // Strategy 2: Extract from name (e.g., "Episode 1", "E01", "Ep. 5")
        if (episodeNumber == null) {
            val match = Regex("""(?:Episode|E|Ep\.?)\s*(\d+)""", RegexOption.IGNORE_CASE).find(episodeName)
            match?.groupValues?.get(1)?.toIntOrNull()?.let { 
                episodeNumber = it
                Log.d(TAG, "✓ Extracted episode number from name: $it")
            }
        }
        
        if (episodeNumber == null) {
            Log.w(TAG, "❌ Could not extract episode number from: episodeNum='$episodeNum', name='$episodeName'")
            return null
        }
        
        // Find matching TMDB episode
        val tmdbEpisode = tmdbSeason.episodes?.find { it.episodeNumber == episodeNumber }
        
        if (tmdbEpisode != null) {
            Log.d(TAG, "✅ Matched TMDB episode: S${seasonNumber}E${episodeNumber} - ${tmdbEpisode.name}")
        } else {
            Log.w(TAG, "❌ No TMDB match for S${seasonNumber}E${episodeNumber}. Available episodes: ${tmdbSeason.episodes?.map { it.episodeNumber }}")
        }
        
        return tmdbEpisode
    }
    
    private fun extractEpisodeNumber(name: String): Int? {
        val match = Regex("""(?:Episode|E|Ep\.?)\s*(\d+)""", RegexOption.IGNORE_CASE).find(name)
        return match?.groupValues?.get(1)?.toIntOrNull()
    }
    
    private suspend fun loadEpisodesForSeasonData(season: Season) {
        val client = stalkerClient ?: return
        
        // Extract season number and load TMDB data if available
        val seasonNumberMatch = season.name.let { Regex("""Season\s+(\d+)""", RegexOption.IGNORE_CASE).find(it) }
        val seasonNumber = seasonNumberMatch?.groupValues?.get(1)?.toIntOrNull() ?: season.seasonNumber.toIntOrNull() ?: 1
        
        Log.d(TAG, "🎬 Loading episodes for ${season.name} (Season #$seasonNumber), TMDB TV ID: $tmdbTvId")
        
        // CRITICAL: Await TMDB data loading before loading episodes
        if (tmdbTvId != null && seasonNumber > 0) {
            Log.d(TAG, "📡 Loading TMDB season data for TV ID $tmdbTvId, Season $seasonNumber")
            loadTmdbSeasonData(tmdbTvId!!, seasonNumber)  // This is a suspend function, it will be awaited
            Log.d(TAG, "✅ TMDB season data loaded. Episodes in cache: ${tmdbSeasonData[seasonNumber]?.episodes?.size ?: 0}")
        } else {
            Log.w(TAG, "⚠️ Cannot load TMDB data: tmdbTvId=$tmdbTvId, seasonNumber=$seasonNumber")
        }
        
        withContext(Dispatchers.IO) {
            try {
                Log.d(TAG, "Loading episodes for season: ${season.name}")
                
                val jsData = client.getSeriesEpisodes(seriesId, season.id)
                val dataList = jsData["data"] as? List<*> ?: emptyList<Any>()
                
                Log.d(TAG, "Episodes loaded: ${dataList.size}")
                
                // Convert to Episode objects with TMDB data
                val episodesList = dataList.mapNotNull { item ->
                    val episodeMap = item as? Map<*, *> ?: return@mapNotNull null
                    val id = episodeMap["id"]?.toString() ?: return@mapNotNull null
                    val name = episodeMap["name"]?.toString() ?: ""
                    val seriesNumber = episodeMap["series_number"]?.toString() ?: ""
                    val time = episodeMap["time"]?.toString() ?: ""
                    
                    // Get TMDB episode data if available
                    val tmdbEpisode = getTmdbEpisodeData(name, seriesNumber, seasonNumber)
                    val thumbnail = if (tmdbEpisode?.stillPath != null) {
                        "https://image.tmdb.org/t/p/w300${tmdbEpisode.stillPath}"
                    } else {
                        posterUrl
                    }
                    
                    Log.d(TAG, "Episode S${seasonNumber}E${seriesNumber}: name='${name}', TMDB found=${tmdbEpisode != null}, has_image=${tmdbEpisode?.stillPath != null}, has_desc=${!tmdbEpisode?.overview.isNullOrEmpty()}")
                    
                    Episode(
                        id = id,
                        name = name.ifEmpty { "Episode $seriesNumber" },
                        episodeNumber = seriesNumber,
                        duration = time,
                        thumbnailUrl = thumbnail,
                        seasonId = season.id,
                        cmd = null,
                        tmdbImageUrl = if (tmdbEpisode?.stillPath != null) "https://image.tmdb.org/t/p/w300${tmdbEpisode.stillPath}" else null,
                        tmdbDescription = tmdbEpisode?.overview
                    )
                }.sortedBy { it.episodeNumber.toIntOrNull() ?: 0 }
                
                allEpisodesBySeason[season.id] = episodesList
                
                // Save first episode reference
                if (firstEpisode == null && episodesList.isNotEmpty()) {
                    firstEpisode = episodesList[0]
                    firstSeason = season
                }
                
                // Store episodes in map for later access
                allEpisodesBySeason[season.id] = episodesList
                
                // OLD: Add season section to UI (now using RecyclerView)
                // withContext(Dispatchers.Main) {
                //     addSeasonSection(season, episodesList)
                // }
                
            } catch (e: Exception) {
                Log.e(TAG, "Error loading episodes for season ${season.name}", e)
            }
        }
    }
    
    // OLD: Store adapters for progress refresh (no longer used with RecyclerView approach)
    // private val episodeAdapters = mutableListOf<EpisodeHorizontalAdapter>()
    
    // OLD: addSeasonSection - now using RecyclerView with horizontal layout
    /*
    private fun addSeasonSection(season: Season, episodes: List<Episode>) {
        ...
    }
    */
    
    fun hide() {
        container.visibility = View.GONE
        
        // Clear data
        seasons.clear()
        allEpisodesBySeason.clear()
        episodeAdapter = null
        episodesRecycler.adapter = null
        firstEpisode = null
        firstSeason = null
        isFavorited = false
    }
    
    private fun updateFavoriteButtonUI() {
        if (isFavorited) {
            favoriteButton.text = "Favorited"
            favoriteButton.setCompoundDrawablesWithIntrinsicBounds(R.drawable.ic_favorite_filled, 0, 0, 0)
            favoriteButton.compoundDrawableTintList = androidx.core.content.ContextCompat.getColorStateList(context, R.color.button_text_color)
        } else {
            favoriteButton.text = "Favorite"
            favoriteButton.setCompoundDrawablesWithIntrinsicBounds(R.drawable.ic_favorite_outline, 0, 0, 0)
            favoriteButton.compoundDrawableTintList = androidx.core.content.ContextCompat.getColorStateList(context, R.color.button_text_color)
        }
    }
    
    fun setOnBackPressedListener(callback: () -> Unit) {
        onBackPressed = callback
    }
    
    fun setOnPlayEpisodeListener(callback: (String, String, String, String, String, String) -> Unit) {
        onPlayEpisode = callback
    }
    
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN && event.keyCode == KeyEvent.KEYCODE_BACK) {
            if (container.visibility == View.VISIBLE) {
                Log.d(TAG, "Back pressed in series detail")
                // With single-page design, just hide and go back
                hide()
                onBackPressed?.invoke()
                return true
            }
        }
        return super.dispatchKeyEvent(event)
    }
    
    // OLD: focusFirstEpisode - now using RecyclerView
    /*
    private fun focusFirstEpisode() {
        if (seasonsContainer.childCount > 0) {
            val firstSeasonView = seasonsContainer.getChildAt(0) as? LinearLayout
            val episodesContainer = firstSeasonView?.findViewById<LinearLayout>(R.id.season_episodes_container)
            episodesContainer?.postDelayed({
                episodesContainer.getChildAt(0)?.requestFocus()
            }, 100)
        }
    }
    */
    
    // OLD: focusPlayingEpisode - needs RecyclerView implementation
    /*
    fun focusPlayingEpisode() {
        ...old season container logic...
    }
    */
    
    fun playNextEpisodeAfter(currentEpisodeId: String) {
        Log.d(TAG, "Looking for next episode after: $currentEpisodeId")
        
        // Find current episode and play next one
        for (seasonId in allEpisodesBySeason.keys) {
            val episodes = allEpisodesBySeason[seasonId] ?: continue
            val currentIndex = episodes.indexOfFirst { it.id == currentEpisodeId }
            
            if (currentIndex >= 0) {
                // Found current episode
                if (currentIndex + 1 < episodes.size) {
                    // Play next episode in same season
                    val nextEpisode = episodes[currentIndex + 1]
                    val season = seasons.find { it.id == seasonId }
                    
                    if (season != null) {
                        Log.d(TAG, "Playing next episode: ${nextEpisode.name}")
                        onPlayEpisode?.invoke(
                            seriesId,
                            nextEpisode.seasonId,
                            nextEpisode.id,
                            season.seasonNumber,
                            nextEpisode.episodeNumber,
                            nextEpisode.name
                        )
                        return
                    }
                } else {
                    // Try to find next season
                    val currentSeasonIndex = seasons.indexOfFirst { it.id == seasonId }
                    if (currentSeasonIndex >= 0 && currentSeasonIndex + 1 < seasons.size) {
                        val nextSeason = seasons[currentSeasonIndex + 1]
                        val nextSeasonEpisodes = allEpisodesBySeason[nextSeason.id]
                        
                        if (nextSeasonEpisodes != null && nextSeasonEpisodes.isNotEmpty()) {
                            val firstEpisodeNextSeason = nextSeasonEpisodes[0]
                            Log.d(TAG, "Playing first episode of next season: ${firstEpisodeNextSeason.name}")
                            onPlayEpisode?.invoke(
                                seriesId,
                                firstEpisodeNextSeason.seasonId,
                                firstEpisodeNextSeason.id,
                                nextSeason.seasonNumber,
                                firstEpisodeNextSeason.episodeNumber,
                                firstEpisodeNextSeason.name
                            )
                            return
                        }
                    }
                }
                
                Log.d(TAG, "No next episode available")
                return
            }
        }
        
        Log.w(TAG, "Could not find current episode to determine next")
    }
    
    private fun dpToPx(dp: Int): Int {
        return (dp * context.resources.displayMetrics.density).toInt()
    }
    
    private fun createGenreChip(genreName: String): TextView {
        return TextView(context).apply {
            text = genreName
            setTextColor(android.graphics.Color.parseColor("#d4d4d8"))
            setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 14f)
            setPadding(dpToPx(12), dpToPx(6), dpToPx(12), dpToPx(6))
            setBackgroundResource(R.drawable.genre_chip_bg)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                setMargins(0, 0, dpToPx(8), 0)
            }
        }
    }
    
    fun cleanup() {
        scope.cancel()
    }
}
