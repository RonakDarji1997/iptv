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
import coil.load
import com.ronika.iptvnative.R
import com.ronika.iptvnative.adapters.EpisodeHorizontalAdapter
import com.ronika.iptvnative.database.AppDatabase
import com.ronika.iptvnative.database.dao.ProviderDao
import com.ronika.iptvnative.models.Episode
import com.ronika.iptvnative.models.Season
import com.ronika.iptvnative.repository.FavoriteRepository
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
    private lateinit var backdropImage: ImageView
    private lateinit var categoryText: TextView
    private lateinit var titleText: TextView
    private lateinit var yearText: TextView
    private lateinit var seasonsText: TextView
    private lateinit var descriptionText: TextView
    private lateinit var castText: TextView
    private lateinit var playButton: Button
    private lateinit var favoriteButton: Button
    private lateinit var seasonsContainer: LinearLayout
    private lateinit var loadingIndicator: ProgressBar
    
    // Data
    private var seriesId: String = ""
    private var seriesName: String = ""
    private var posterUrl: String? = null
    private val seasons = mutableListOf<Season>()
    private val allEpisodesBySeason = mutableMapOf<String, List<Episode>>()
    private var firstEpisode: Episode? = null
    private var firstSeason: Season? = null
    
    // Track currently playing episode
    private var currentPlayingSeasonId: String? = null
    private var currentPlayingEpisodeId: String? = null
    
    // Favourite state
    private var isFavorited = false
    private val favoriteRepository = FavoriteRepository(context)
    
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
        backdropImage = findViewById(R.id.series_detail_backdrop)
        categoryText = findViewById(R.id.series_detail_category)
        titleText = findViewById(R.id.series_detail_title)
        yearText = findViewById(R.id.series_detail_year)
        seasonsText = findViewById(R.id.series_detail_seasons)
        descriptionText = findViewById(R.id.series_detail_description)
        castText = findViewById(R.id.series_detail_cast)
        playButton = findViewById(R.id.series_detail_play_button)
        favoriteButton = findViewById(R.id.series_detail_favorite_button)
        seasonsContainer = findViewById(R.id.series_seasons_container)
        loadingIndicator = findViewById(R.id.series_detail_loading)
        
        // Buttons are hidden in XML - episodes are shown by default
        // No need to interact with them anymore
        
        // Setup button focus navigation (kept for compatibility)
        playButton.nextFocusRightId = R.id.series_detail_favorite_button
        favoriteButton.nextFocusLeftId = R.id.series_detail_play_button
        
        playButton.setOnClickListener {
            firstEpisode?.let { episode ->
                firstSeason?.let { season ->
                    Log.d(TAG, "Playing first episode: ${episode.name}")
                    // Track playing episode
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
        
        // Handle down key from buttons to focus first episode
        playButton.setOnKeyListener { _, keyCode, event ->
            if (event.action == android.view.KeyEvent.ACTION_DOWN && keyCode == android.view.KeyEvent.KEYCODE_DPAD_DOWN) {
                focusFirstEpisode()
                true
            } else {
                false
            }
        }
        
        favoriteButton.setOnKeyListener { _, keyCode, event ->
            if (event.action == android.view.KeyEvent.ACTION_DOWN && keyCode == android.view.KeyEvent.KEYCODE_DPAD_DOWN) {
                focusFirstEpisode()
                true
            } else {
                false
            }
        }
        
        // Handle back button
        container.isFocusable = true
        container.isFocusableInTouchMode = true
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
        this.posterUrl = posterUrl
        
        // Show container
        container.visibility = View.VISIBLE
        container.requestFocus()
        
        // Set info
        categoryText.text = categoryName
        titleText.text = name
        yearText.text = year ?: ""
        descriptionText.text = description ?: "No description available"
        
        // Cast
        val castInfo = buildString {
            if (!director.isNullOrBlank()) {
                append("Director: $director")
            }
            if (isNotEmpty() && !actors.isNullOrBlank()) {
                append("  •  ")
            }
            if (!actors.isNullOrBlank()) {
                append("Cast: $actors")
            }
        }
        castText.text = castInfo.ifEmpty { "" }
        castText.visibility = if (castInfo.isEmpty()) View.GONE else View.VISIBLE
        
        // Load backdrop - use dynamic base URL from provider
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
        
        // Auto-load seasons and episodes (always show by default)
        loadingIndicator.visibility = View.VISIBLE
        playButton.isEnabled = false
        
        // Check favorite status
        scope.launch {
            try {
                isFavorited = favoriteRepository.isFavorite(id, FavoriteRepository.TYPE_SERIES, currentProviderId ?: "")
                withContext(Dispatchers.Main) {
                    updateFavoriteButtonUI()
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error checking favorite status", e)
            }
        }
        
        scope.launch {
            try {
                loadSeasonsAndEpisodes()
                
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
                        playButton.text = "▶ Resume $seasonName $episodeName ($percentage%)"
                        
                        Log.d(TAG, "Found progress for series: $seasonName $episodeName at $percentage%")
                    } else {
                        playButton.text = "▶ Play"
                    }
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
                    loadEpisodesForSeason(season)
                }
                
            } catch (e: Exception) {
                Log.e(TAG, "Error loading seasons", e)
                throw e
            }
        }
    }
    
    private suspend fun loadEpisodesForSeason(season: Season) {
        val client = stalkerClient ?: return
        withContext(Dispatchers.IO) {
            try {
                Log.d(TAG, "Loading episodes for season: ${season.name}")
                
                val jsData = client.getSeriesEpisodes(seriesId, season.id)
                val dataList = jsData["data"] as? List<*> ?: emptyList<Any>()
                
                Log.d(TAG, "Episodes loaded: ${dataList.size}")
                
                // Convert to Episode objects
                val episodesList = dataList.mapNotNull { item ->
                    val episodeMap = item as? Map<*, *> ?: return@mapNotNull null
                    val id = episodeMap["id"]?.toString() ?: return@mapNotNull null
                    val name = episodeMap["name"]?.toString() ?: ""
                    val seriesNumber = episodeMap["series_number"]?.toString() ?: ""
                    val time = episodeMap["time"]?.toString() ?: ""
                    
                    Episode(
                        id = id,
                        name = name.ifEmpty { "Episode $seriesNumber" },
                        episodeNumber = seriesNumber,
                        duration = time,
                        thumbnailUrl = posterUrl,
                        seasonId = season.id,
                        cmd = null
                    )
                }.sortedBy { it.episodeNumber.toIntOrNull() ?: 0 }
                
                allEpisodesBySeason[season.id] = episodesList
                
                // Save first episode reference
                if (firstEpisode == null && episodesList.isNotEmpty()) {
                    firstEpisode = episodesList[0]
                    firstSeason = season
                }
                
                // Add season section to UI
                withContext(Dispatchers.Main) {
                    addSeasonSection(season, episodesList)
                }
                
            } catch (e: Exception) {
                Log.e(TAG, "Error loading episodes for season ${season.name}", e)
            }
        }
    }
    
    // Store adapters for progress refresh
    private val episodeAdapters = mutableListOf<EpisodeHorizontalAdapter>()
    
    private fun addSeasonSection(season: Season, episodes: List<Episode>) {
        // Inflate season section
        val seasonView = LayoutInflater.from(context).inflate(
            R.layout.item_season_section,
            seasonsContainer,
            false
        ) as LinearLayout
        
        val seasonTitle = seasonView.findViewById<TextView>(R.id.season_title)
        val episodesRecycler = seasonView.findViewById<RecyclerView>(R.id.season_episodes_recycler)
        
        // Show season name with episode count
        val episodeCount = episodes.size
        seasonTitle.text = "${season.name} ($episodeCount ${if (episodeCount == 1) "Episode" else "Episodes"})"
        
        // Setup horizontal episodes recycler
        val episodeAdapter = EpisodeHorizontalAdapter(episodes, seriesId, currentProviderId ?: "", posterUrl) { episode ->
            Log.d(TAG, "Episode clicked: ${episode.name}")
            // Track playing episode
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
        
        // Store adapter for later refresh
        episodeAdapters.add(episodeAdapter)
        
        episodesRecycler.apply {
            layoutManager = LinearLayoutManager(context, LinearLayoutManager.HORIZONTAL, false)
            adapter = episodeAdapter
            setHasFixedSize(true)
            descendantFocusability = ViewGroup.FOCUS_BEFORE_DESCENDANTS
        }
        
        seasonsContainer.addView(seasonView)
        
        // Focus first episode of first season
        if (seasonsContainer.childCount == 1) {
            episodesRecycler.postDelayed({
                episodesRecycler.layoutManager?.findViewByPosition(0)?.requestFocus()
                Log.d(TAG, "Auto-focused first episode")
            }, 150)
        }
    }
    
    fun hide() {
        container.visibility = View.GONE
        
        // Clear data
        seasons.clear()
        allEpisodesBySeason.clear()
        seasonsContainer.removeAllViews()
        episodeAdapters.clear()
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
                hide()
                onBackPressed?.invoke()
                return true
            }
        }
        return super.dispatchKeyEvent(event)
    }
    
    private fun focusFirstEpisode() {
        // Find first season's recycler view and focus first item
        if (seasonsContainer.childCount > 0) {
            val firstSeasonView = seasonsContainer.getChildAt(0) as? LinearLayout
            val recycler = firstSeasonView?.findViewById<RecyclerView>(R.id.season_episodes_recycler)
            recycler?.postDelayed({
                recycler.layoutManager?.findViewByPosition(0)?.requestFocus()
            }, 100)
        }
    }
    
    fun focusPlayingEpisode() {
        // Refresh progress bars for all episodes
        Log.d(TAG, "Refreshing progress bars after returning from player")
        for (adapter in episodeAdapters) {
            adapter.refreshProgress()
        }
        
        // Focus the episode that was being played when returning from fullscreen
        if (currentPlayingSeasonId == null || currentPlayingEpisodeId == null) {
            // No episode tracked, focus first episode
            focusFirstEpisode()
            return
        }
        
        // Find the season container with the playing episode
        for (i in 0 until seasonsContainer.childCount) {
            val seasonView = seasonsContainer.getChildAt(i) as? LinearLayout ?: continue
            val recycler = seasonView.findViewById<RecyclerView>(R.id.season_episodes_recycler) ?: continue
            
            // Check if this season contains the playing episode
            val episodes = allEpisodesBySeason[currentPlayingSeasonId] ?: continue
            val episodeIndex = episodes.indexOfFirst { it.id == currentPlayingEpisodeId }
            
            if (episodeIndex >= 0) {
                // Found the episode, focus it
                recycler.postDelayed({
                    recycler.scrollToPosition(episodeIndex)
                    recycler.layoutManager?.findViewByPosition(episodeIndex)?.requestFocus()
                    Log.d(TAG, "Focused playing episode at position $episodeIndex")
                }, 150)
                return
            }
        }
        
        // Fallback: focus first episode
        focusFirstEpisode()
    }
    
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
    
    fun cleanup() {
        scope.cancel()
    }
}
