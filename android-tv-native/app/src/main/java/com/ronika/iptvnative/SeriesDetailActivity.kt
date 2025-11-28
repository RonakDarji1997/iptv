package com.ronika.iptvnative

import android.content.Intent
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import coil.load
import coil.request.CachePolicy
import com.ronika.iptvnative.adapters.EpisodeHorizontalAdapter
import com.ronika.iptvnative.api.ApiClient
import com.ronika.iptvnative.models.Episode
import com.ronika.iptvnative.models.Season
import kotlinx.coroutines.launch

class SeriesDetailActivity : ComponentActivity() {
    
    companion object {
        // Cache for series data to avoid reloading on reopen
        private data class SeriesCache(
            val seasons: List<Season>,
            val episodesBySeason: Map<String, List<Episode>>,
            val timestamp: Long = System.currentTimeMillis()
        )
        
        private val seriesDataCache = mutableMapOf<String, SeriesCache>()
        private const val CACHE_VALIDITY_MS = 30 * 60 * 1000L // 30 minutes
        
        fun clearCache() {
            seriesDataCache.clear()
        }
        
        fun clearOldCache() {
            val now = System.currentTimeMillis()
            seriesDataCache.entries.removeIf { (_, cache) ->
                now - cache.timestamp > CACHE_VALIDITY_MS
            }
        }
    }
    
    private lateinit var backButton: Button
    private lateinit var posterImage: ImageView
    private lateinit var seriesTitle: TextView
    private lateinit var seriesTotalSeasons: TextView
    private lateinit var seriesGenres: TextView
    private lateinit var seriesCast: TextView
    private lateinit var seriesDirector: TextView
    private lateinit var seriesDescription: TextView
    private lateinit var playButton: Button
    private lateinit var seasonsEpisodesContainer: LinearLayout
    private lateinit var loadingIndicator: ProgressBar
    private lateinit var episodesLoadingIndicator: ProgressBar
    
    private var seriesId: String = ""
    private var seriesName: String = ""
    private var posterUrl: String? = null
    private var description: String? = null
    private var actors: String? = null
    private var director: String? = null
    private var year: String? = null
    private var country: String? = null
    private var genres: String? = null
    private var totalSeasons: String? = null
    
    private var seasons = mutableListOf<Season>()
    private var allEpisodesBySeason = mutableMapOf<String, List<Episode>>()
    private var firstEpisode: Episode? = null
    private var lastPlayedEpisodeId: String? = null
    private val episodeViewHolders = mutableMapOf<String, View>()
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_series_detail)
        
        // Get data from intent
        seriesId = intent.getStringExtra("SERIES_ID") ?: ""
        seriesName = intent.getStringExtra("SERIES_NAME") ?: ""
        posterUrl = intent.getStringExtra("POSTER_URL")
        description = intent.getStringExtra("DESCRIPTION")
        actors = intent.getStringExtra("ACTORS")
        director = intent.getStringExtra("DIRECTOR")
        year = intent.getStringExtra("YEAR")
        country = intent.getStringExtra("COUNTRY")
        genres = intent.getStringExtra("GENRES")
        totalSeasons = intent.getStringExtra("TOTAL_SEASONS")
        
        android.util.Log.d("SeriesDetail", "===== RECEIVED INTENT DATA =====")
        android.util.Log.d("SeriesDetail", "Series ID: $seriesId")
        android.util.Log.d("SeriesDetail", "Series Name: $seriesName")
        android.util.Log.d("SeriesDetail", "Poster URL: $posterUrl")
        android.util.Log.d("SeriesDetail", "Description: $description")
        android.util.Log.d("SeriesDetail", "Actors: $actors")
        android.util.Log.d("SeriesDetail", "Director: $director")
        android.util.Log.d("SeriesDetail", "Year: $year")
        android.util.Log.d("SeriesDetail", "Country: $country")
        android.util.Log.d("SeriesDetail", "Genres: $genres")
        android.util.Log.d("SeriesDetail", "Total Seasons: $totalSeasons")
        android.util.Log.d("SeriesDetail", "=================================")
        
        initViews()
        displaySeriesInfo()
        loadAllSeasonsAndEpisodes()
    }
    
    private fun initViews() {
        backButton = findViewById(R.id.back_button)
        posterImage = findViewById(R.id.poster_image)
        seriesTitle = findViewById(R.id.series_title)
        seriesTotalSeasons = findViewById(R.id.series_total_seasons)
        seriesGenres = findViewById(R.id.series_genres)
        seriesCast = findViewById(R.id.series_cast)
        seriesDirector = findViewById(R.id.series_director)
        seriesDescription = findViewById(R.id.series_description)
        playButton = findViewById(R.id.play_button)
        seasonsEpisodesContainer = findViewById(R.id.seasons_episodes_container)
        loadingIndicator = findViewById(R.id.loading_indicator)
        episodesLoadingIndicator = findViewById(R.id.episodes_loading_indicator)
        
        backButton.setOnClickListener {
            finish()
        }
        
        playButton.setOnClickListener {
            firstEpisode?.let { episode ->
                playEpisode(episode)
            }
        }
    }
    
    private fun displaySeriesInfo() {
        seriesTitle.text = seriesName
        
        // Total Seasons
        seriesTotalSeasons.text = totalSeasons ?: "Unknown Seasons"
        
        // Genres
        seriesGenres.text = genres ?: "Unknown Genre"
        
        // Cast
        if (!actors.isNullOrEmpty()) {
            seriesCast.visibility = View.VISIBLE
            seriesCast.text = "Cast: $actors"
        } else {
            seriesCast.visibility = View.GONE
        }
        
        // Director
        if (!director.isNullOrEmpty()) {
            seriesDirector.visibility = View.VISIBLE
            seriesDirector.text = "Director: $director"
        } else {
            seriesDirector.visibility = View.GONE
        }
        
        // Description
        if (!description.isNullOrEmpty()) {
            seriesDescription.visibility = View.VISIBLE
            seriesDescription.text = description
        } else {
            seriesDescription.visibility = View.GONE
        }
        
        // Poster image - load from screenshot_uri
        val currentPosterUrl = posterUrl
        android.util.Log.d("SeriesDetail", "Loading poster from: $currentPosterUrl")
        if (!currentPosterUrl.isNullOrEmpty()) {
            val fullUrl = if (currentPosterUrl.startsWith("http")) {
                currentPosterUrl
            } else {
                val cleanUrl = ApiClient.portalUrl.replace("/stalker_portal/?", "").replace("/stalker_portal", "").replace("/server/load.php", "")
                val finalUrl = "$cleanUrl$currentPosterUrl"
                android.util.Log.d("SeriesDetail", "Constructed full URL: $finalUrl")
                finalUrl
            }
            posterImage.load(fullUrl) {
                crossfade(false) // Disable for performance
                size(400, 600) // Optimize size for series detail poster
                memoryCachePolicy(CachePolicy.ENABLED)
                diskCachePolicy(CachePolicy.ENABLED)
                placeholder(R.drawable.placeholder_poster)
                error(R.drawable.placeholder_poster)
                allowHardware(true) // GPU acceleration
            }
        } else {
            android.util.Log.d("SeriesDetail", "No poster URL provided")
        }
    }
    
    private fun loadAllSeasonsAndEpisodes() {
        lifecycleScope.launch {
            // Clear old cache entries
            clearOldCache()
            
            // Check cache first
            val cached = seriesDataCache[seriesId]
            if (cached != null) {
                android.util.Log.d("SeriesDetail", "⚡ INSTANT LOAD from cache for series: $seriesId")
                
                // Restore from cache
                seasons.clear()
                seasons.addAll(cached.seasons)
                allEpisodesBySeason.clear()
                allEpisodesBySeason.putAll(cached.episodesBySeason)
                
                // Derive first episode from cached data
                firstEpisode = cached.episodesBySeason.values.firstOrNull()?.firstOrNull()
                
                // Update play button
                if (firstEpisode != null) {
                    val firstSeason = seasons.firstOrNull()
                    playButton.text = "▶  Play S${firstSeason?.seasonNumber ?: "1"} E${firstEpisode?.episodeNumber}"
                }
                
                // Display all seasons immediately
                for (season in cached.seasons) {
                    val episodes = cached.episodesBySeason[season.id] ?: emptyList()
                    addSeasonSection(season, episodes)
                }
                
                // Focus play button
                playButton.postDelayed({
                    playButton.requestFocus()
                }, 100)
                
                return@launch
            }
            
            try {
                // Not in cache - load from network
                android.util.Log.d("SeriesDetail", "📡 Loading from network for series: $seriesId using direct Stalker call")
                
                // Use direct Stalker portal call
                val stalkerClient = com.ronika.iptvnative.api.StalkerClient(
                    ApiClient.portalUrl,
                    ApiClient.macAddress
                )
                
                val jsData = stalkerClient.getSeriesSeasons(seriesId)
                val dataList = jsData["data"] as? List<*> ?: emptyList<Any>()
                
                android.util.Log.d("SeriesDetail", "Seasons loaded: ${dataList.size}")
                
                // Convert to Season objects and filter out ADULT/CELEBRITY
                val seasonsList = dataList.mapNotNull { item ->
                    val seasonMap = item as? Map<*, *> ?: return@mapNotNull null
                    val id = seasonMap["id"]?.toString() ?: return@mapNotNull null
                    val name = seasonMap["name"]?.toString() ?: ""
                    val seasonNumber = seasonMap["season_number"]?.toString() ?: ""
                    
                    // Filter out ADULT and CELEBRITY
                    if (name.uppercase().contains("ADULT") || name.uppercase().contains("CELEBRITY")) {
                        return@mapNotNull null
                    }
                    
                    Season(
                        id = id,
                        name = name.ifEmpty { "Season $seasonNumber" },
                        seasonNumber = seasonNumber
                    )
                }
                
                seasons.clear()
                seasons.addAll(seasonsList)
                
                // Load episodes for each season
                for (season in seasons) {
                    loadEpisodesForSeason(season)
                }
                
                // Save to cache after all episodes loaded
                android.util.Log.d("SeriesDetail", "💾 Saving to cache for instant future loads")
                seriesDataCache[seriesId] = SeriesCache(
                    seasons = seasons.toList(),
                    episodesBySeason = allEpisodesBySeason.toMap()
                )
            } catch (e: Exception) {
                android.util.Log.e("SeriesDetail", "Error loading seasons", e)
                Toast.makeText(this@SeriesDetailActivity, "Failed to load seasons", Toast.LENGTH_SHORT).show()
            }
        }
    }
    
    private suspend fun loadEpisodesForSeason(season: Season) {
        try {
            android.util.Log.d("SeriesDetail", "Loading episodes for season: ${season.name} using direct Stalker call")
            
            // Use direct Stalker portal call
            val stalkerClient = com.ronika.iptvnative.api.StalkerClient(
                ApiClient.portalUrl,
                ApiClient.macAddress
            )
            
            val jsData = stalkerClient.getSeriesEpisodes(seriesId, season.id)
            val dataList = jsData["data"] as? List<*> ?: emptyList<Any>()
            
            android.util.Log.d("SeriesDetail", "Episodes loaded: ${dataList.size}")
            
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
                    thumbnailUrl = posterUrl, // Use series poster for episodes
                    seasonId = season.id,
                    cmd = null  // Don't store cmd, we'll fetch it during playback
                )
            }.sortedBy { it.episodeNumber.toIntOrNull() ?: 0 }
            
            allEpisodesBySeason[season.id] = episodesList
            
            // Save first episode for play button
            if (firstEpisode == null && episodesList.isNotEmpty()) {
                firstEpisode = episodesList[0]
                runOnUiThread {
                    playButton.text = "▶  Play S${season.seasonNumber} E${episodesList[0].episodeNumber}"
                    // Request focus on play button when first episode is loaded
                    playButton.postDelayed({
                        playButton.requestFocus()
                    }, 100)
                }
            }
            
            // Add season section to UI
            runOnUiThread {
                addSeasonSection(season, episodesList)
            }
            
        } catch (e: Exception) {
            android.util.Log.e("SeriesDetail", "Error loading episodes for season ${season.name}", e)
        }
    }
    
    private fun addSeasonSection(season: Season, episodes: List<Episode>) {
        // Inflate season section
        val seasonView = layoutInflater.inflate(R.layout.item_season_section, seasonsEpisodesContainer, false) as LinearLayout
        
        val seasonTitle = seasonView.findViewById<TextView>(R.id.season_title)
        val episodesRecycler = seasonView.findViewById<RecyclerView>(R.id.season_episodes_recycler)
        
        seasonTitle.text = season.name
        
        // Setup horizontal episodes recycler
        val episodeAdapter = EpisodeHorizontalAdapter(episodes, posterUrl) { episode ->
            lastPlayedEpisodeId = episode.id
            playEpisode(episode)
        }
        
        episodesRecycler.apply {
            layoutManager = LinearLayoutManager(this@SeriesDetailActivity, LinearLayoutManager.HORIZONTAL, false)
            adapter = episodeAdapter
            setHasFixedSize(true)
            // Prevent auto-focus switching
            descendantFocusability = ViewGroup.FOCUS_BEFORE_DESCENDANTS
            
            // Store episode views for focus restoration
            addOnChildAttachStateChangeListener(object : RecyclerView.OnChildAttachStateChangeListener {
                override fun onChildViewAttachedToWindow(view: View) {
                    val position = getChildAdapterPosition(view)
                    if (position >= 0 && position < episodes.size) {
                        episodeViewHolders[episodes[position].id] = view
                    }
                }
                
                override fun onChildViewDetachedFromWindow(view: View) {
                    val position = getChildAdapterPosition(view)
                    if (position >= 0 && position < episodes.size) {
                        episodeViewHolders.remove(episodes[position].id)
                    }
                }
            })
        }
        
        seasonsEpisodesContainer.addView(seasonView)
    }
    
    private fun playEpisode(episode: Episode) {
        android.util.Log.d("SeriesDetail", "Playing episode: ${episode.name} (${episode.id})")
        
        // Find season number from episode's seasonId
        val season = seasons.find { it.id == episode.seasonId }
        val seasonNum = season?.seasonNumber ?: ""
        
        // Return to MainActivity with episode data - DON'T use FLAG_ACTIVITY_CLEAR_TOP
        // This allows MainActivity to receive the intent in onNewIntent() and play the episode
        val intent = Intent(this, MainActivity::class.java).apply {
            putExtra("PLAY_TYPE", "series")
            putExtra("SERIES_ID", seriesId)
            putExtra("SERIES_NAME", seriesName)
            putExtra("SCREENSHOT_URL", posterUrl)
            putExtra("POSTER_URL", posterUrl) // For back navigation
            putExtra("DESCRIPTION", description)
            putExtra("ACTORS", actors)
            putExtra("DIRECTOR", director)
            putExtra("YEAR", year)
            putExtra("COUNTRY", country)
            putExtra("GENRES", genres)
            putExtra("TOTAL_SEASONS", totalSeasons)
            putExtra("SEASON_ID", episode.seasonId)
            putExtra("SEASON_NUMBER", seasonNum)
            putExtra("EPISODE_ID", episode.id)
            putExtra("EPISODE_NUMBER", episode.episodeNumber)
            putExtra("EPISODE_NAME", episode.name)
            // Use SINGLE_TOP so MainActivity receives in onNewIntent
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        startActivity(intent)
        // Don't call finish() - keep SeriesDetailActivity in back stack for proper back navigation
    }
    
    override fun onResume() {
        super.onResume()
        // Restore focus to last played episode if returning from playback
        lastPlayedEpisodeId?.let { episodeId ->
            episodeViewHolders[episodeId]?.postDelayed({
                episodeViewHolders[episodeId]?.requestFocus()
                android.util.Log.d("SeriesDetail", "Focus restored to episode: $episodeId")
            }, 200)
        }
    }
    
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            finish()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }
}
