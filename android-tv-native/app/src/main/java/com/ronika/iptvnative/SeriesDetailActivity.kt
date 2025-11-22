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
import com.ronika.iptvnative.adapters.EpisodeHorizontalAdapter
import com.ronika.iptvnative.api.ApiClient
import com.ronika.iptvnative.models.Episode
import com.ronika.iptvnative.models.Season
import kotlinx.coroutines.launch

class SeriesDetailActivity : ComponentActivity() {
    
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
        android.util.Log.d("SeriesDetail", "Loading poster from: $posterUrl")
        val currentPosterUrl = posterUrl
        if (!currentPosterUrl.isNullOrEmpty()) {
            val fullUrl = if (currentPosterUrl.startsWith("http")) {
                currentPosterUrl
            } else {
                val cleanUrl = ApiClient.portalUrl.replace("/stalker_portal/?", "").replace("/stalker_portal", "")
                val finalUrl = "$cleanUrl$currentPosterUrl"
                android.util.Log.d("SeriesDetail", "Constructed full URL: $finalUrl")
                finalUrl
            }
            posterImage.load(fullUrl) {
                crossfade(true)
                placeholder(R.drawable.placeholder_poster)
                error(R.drawable.placeholder_poster)
                listener(
                    onSuccess = { _, _ ->
                        android.util.Log.d("SeriesDetail", "Poster loaded successfully")
                    },
                    onError = { _, result ->
                        android.util.Log.e("SeriesDetail", "Failed to load poster: ${result.throwable.message}")
                    }
                )
            }
        } else {
            android.util.Log.d("SeriesDetail", "No poster URL provided")
        }
    }
    
    private fun loadAllSeasonsAndEpisodes() {
        lifecycleScope.launch {
            try {
                // Don't show loading indicator to prevent focus reset
                android.util.Log.d("SeriesDetail", "Loading seasons for series: $seriesId")
                
                val response = ApiClient.apiService.getSeriesSeasons(
                    com.ronika.iptvnative.api.SeriesSeasonsRequest(
                        mac = ApiClient.macAddress,
                        url = ApiClient.portalUrl,
                        seriesId = seriesId
                    )
                )
                
                android.util.Log.d("SeriesDetail", "Seasons loaded: ${response.seasons.size}")
                
                // Filter out ADULT and CELEBRITY seasons
                val filteredSeasons = response.seasons.filter { season ->
                    val name = (season.name ?: "").uppercase()
                    !name.contains("ADULT") && !name.contains("CELEBRITY")
                }
                
                seasons.clear()
                seasons.addAll(filteredSeasons.map { 
                    Season(
                        id = it.id,
                        name = it.name ?: "Season ${it.season_number ?: ""}",
                        seasonNumber = it.season_number ?: ""
                    )
                })
                
                // Load episodes for each season
                for (season in seasons) {
                    loadEpisodesForSeason(season)
                }
            } catch (e: Exception) {
                android.util.Log.e("SeriesDetail", "Error loading seasons", e)
                Toast.makeText(this@SeriesDetailActivity, "Failed to load seasons", Toast.LENGTH_SHORT).show()
            }
        }
    }
    
    private suspend fun loadEpisodesForSeason(season: Season) {
        try {
            android.util.Log.d("SeriesDetail", "Loading episodes for season: ${season.name}")
            
            val response = ApiClient.apiService.getSeriesEpisodes(
                com.ronika.iptvnative.api.SeriesEpisodesRequest(
                    mac = ApiClient.macAddress,
                    url = ApiClient.portalUrl,
                    seriesId = seriesId,
                    seasonId = season.id
                )
            )
            
            android.util.Log.d("SeriesDetail", "Episodes loaded: ${response.data.size}")
            
            val episodesList = response.data.sortedBy { 
                it.series_number?.toIntOrNull() ?: 0 
            }.map {
                Episode(
                    id = it.id,
                    name = it.name ?: "Episode ${it.series_number ?: ""}",
                    episodeNumber = it.series_number ?: "",
                    duration = it.time ?: "",
                    thumbnailUrl = posterUrl, // Use series poster for episodes
                    seasonId = season.id,
                    cmd = it.cmd ?: ""
                )
            }
            
            allEpisodesBySeason[season.id] = episodesList
            
            // Save first episode for play button
            if (firstEpisode == null && episodesList.isNotEmpty()) {
                firstEpisode = episodesList[0]
                runOnUiThread {
                    playButton.text = "▶  Play S${season.seasonNumber} E${episodesList[0].episodeNumber}"
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
            playEpisode(episode)
        }
        
        episodesRecycler.apply {
            layoutManager = LinearLayoutManager(this@SeriesDetailActivity, LinearLayoutManager.HORIZONTAL, false)
            adapter = episodeAdapter
            setHasFixedSize(true)
            // Prevent auto-focus switching
            descendantFocusability = ViewGroup.FOCUS_BEFORE_DESCENDANTS
        }
        
        seasonsEpisodesContainer.addView(seasonView)
    }
    
    private fun playEpisode(episode: Episode) {
        android.util.Log.d("SeriesDetail", "Playing episode: ${episode.name} (${episode.id})")
        
        // Find season number from episode's seasonId
        val season = seasons.find { it.id == episode.seasonId }
        val seasonNum = season?.seasonNumber ?: ""
        
        // Navigate to MainActivity with episodeId (NOT cmd) - MainActivity will fetch file info
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
            // DO NOT pass cmd - let MainActivity get file info first
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        startActivity(intent)
        finish()
    }
    
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            finish()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }
}
