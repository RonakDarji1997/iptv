package com.ronika.iptvnative

import android.content.Intent
import android.os.Bundle
import android.view.KeyEvent
import android.widget.EditText
import android.widget.ProgressBar
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.ronika.iptvnative.adapters.ChannelAdapter
import com.ronika.iptvnative.api.StalkerClient
import com.ronika.iptvnative.models.Channel
import com.ronika.iptvnative.models.Movie
import kotlinx.coroutines.launch
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay

class SearchActivity : ComponentActivity() {
    
    private lateinit var searchInput: EditText
    private lateinit var searchRecycler: RecyclerView
    private lateinit var searchProgress: ProgressBar
    private lateinit var searchEmpty: TextView
    private lateinit var searchError: TextView
    
    private lateinit var searchAdapter: ChannelAdapter
    private val searchResults = mutableListOf<Channel>()
    private val searchMovies = mutableListOf<Movie>() // Store full movie objects for series detection
    
    private var searchJob: Job? = null
    
    private val stalkerClient by lazy { StalkerClient("http://tv.stream4k.cc/stalker_portal/server/load.php", "00:1a:79:17:f4:f5") }
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_search)
        
        searchInput = findViewById(R.id.search_input)
        searchRecycler = findViewById(R.id.search_results_recycler)
        searchProgress = findViewById(R.id.search_progress)
        searchEmpty = findViewById(R.id.search_empty)
        searchError = findViewById(R.id.search_error)
        
        setupRecyclerView()
        setupSearchInput()
        
        // Handle back button to return to MainActivity with sidebar visible
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // Return to MainActivity with sidebar visible
                val intent = Intent(this@SearchActivity, MainActivity::class.java).apply {
                    putExtra("SHOW_SIDEBAR_FROM_SEARCH", true)
                    flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
                }
                startActivity(intent)
                finish()
            }
        })
        
        // Auto-focus on search input
        searchInput.requestFocus()
    }
    
    private fun setupRecyclerView() {
        searchAdapter = ChannelAdapter(
            onChannelSelected = { channel ->
                handleChannelSelected(channel)
            },
            onChannelFocused = { channel ->
                // No preview needed
            },
            showContentType = true,
            getContentType = { channel ->
                // Find the corresponding movie object to check if it's a series
                val movie = searchMovies.find { it.id == channel.id }
                movie?.let {
                    if (it.isSeries == "0") "MOVIE" else "SERIES"
                }
            }
        )
        
        searchRecycler.apply {
            layoutManager = GridLayoutManager(this@SearchActivity, 5)
            adapter = searchAdapter
            isFocusable = false
        }
    }
    
    private fun setupSearchInput() {
        searchInput.addTextChangedListener(object : android.text.TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: android.text.Editable?) {
                val query = s.toString()
                performSearch(query)
            }
        })
        
        searchInput.setOnKeyListener { _, keyCode, event ->
            if (event.action == KeyEvent.ACTION_DOWN) {
                when (keyCode) {
                    KeyEvent.KEYCODE_DPAD_DOWN -> {
                        if (searchResults.isNotEmpty()) {
                            searchRecycler.requestFocus()
                            searchRecycler.post {
                                searchRecycler.getChildAt(0)?.requestFocus()
                            }
                            return@setOnKeyListener true
                        }
                    }
                }
            }
            false
        }
    }
    
    private fun performSearch(query: String) {
        // Cancel previous search
        searchJob?.cancel()
        
        if (query.length < 2) {
            searchResults.clear()
            searchMovies.clear()
            searchAdapter.setChannels(searchResults)
            searchEmpty.visibility = android.view.View.VISIBLE
            searchEmpty.text = "Type at least 2 characters to search"
            searchError.visibility = android.view.View.GONE
            searchProgress.visibility = android.view.View.GONE
            return
        }
        
        searchEmpty.visibility = android.view.View.GONE
        searchError.visibility = android.view.View.GONE
        searchProgress.visibility = android.view.View.VISIBLE
        
        searchJob = lifecycleScope.launch {
            // Debounce: wait 300ms before searching
            delay(300)
            
            try {
                android.util.Log.d("SearchActivity", "Searching for: $query")
                
                searchResults.clear()
                searchMovies.clear()
                
                // Load first 5 pages to get more search results
                var hasMorePages = true
                var totalLoaded = 0
                
                for (page in 1..5) {
                    if (!hasMorePages) break
                    
                    android.util.Log.d("SearchActivity", "Loading search page $page for: $query")
                    val response = stalkerClient.searchContent(query, page)
                    
                    android.util.Log.d("SearchActivity", "Search page $page results: ${response.items.data.size} items")
                    
                    // Convert Movie objects to Channel objects and store full movie data
                    val channels = response.items.data.map { movie ->
                        searchMovies.add(movie) // Store full movie object
                        
                        val imageUrl = movie.screenshotUri ?: movie.screenshot ?: movie.coverBig ?: movie.cover ?: movie.poster
                        val fullImageUrl = buildImageUrl(imageUrl)
                        android.util.Log.d("SearchActivity", "Movie: ${movie.name}, Image URL: $imageUrl, Full URL: $fullImageUrl, isSeries: ${movie.isSeries}")
                        
                        Channel(
                            id = movie.id,
                            name = movie.name,
                            number = null,
                            logo = fullImageUrl,
                            cmd = movie.cmd,
                            genreId = movie.categoryId,
                            isLive = false
                        )
                    }
                    
                    if (channels.isEmpty()) {
                        hasMorePages = false
                        break
                    }
                    
                    searchResults.addAll(channels)
                    totalLoaded += channels.size
                    
                    android.util.Log.d("SearchActivity", "Total search results so far: $totalLoaded items")
                }
                
                searchAdapter.setChannels(searchResults)
                
                searchProgress.visibility = android.view.View.GONE
                
                if (searchResults.isEmpty()) {
                    searchEmpty.visibility = android.view.View.VISIBLE
                    searchEmpty.text = "No results found"
                } else {
                    searchEmpty.visibility = android.view.View.GONE
                    android.util.Log.d("SearchActivity", "Search completed: ${searchResults.size} total results")
                }
                
            } catch (e: Exception) {
                android.util.Log.e("SearchActivity", "Search error: ${e.message}", e)
                searchProgress.visibility = android.view.View.GONE
                searchError.text = "Search failed: ${e.message}"
                searchError.visibility = android.view.View.VISIBLE
            }
        }
    }
    
    private fun handleChannelSelected(channel: Channel) {
        android.util.Log.d("SearchActivity", "Channel selected: ${channel.name}, isLive=${channel.isLive}")
        
        // Find the corresponding movie object to check if it's a series
        val movie = searchMovies.find { it.id == channel.id }
        
        if (movie != null) {
            val isSeries = movie.isSeries ?: "0"
            android.util.Log.d("SearchActivity", "Movie found: ${movie.name}, isSeries=${isSeries}")
            
            if (isSeries == "0") {
                // It's a movie - play directly like in movie tab
                android.util.Log.d("SearchActivity", "Playing movie directly: ${movie.name}")
                playMovieFromSearch(movie)
            } else {
                // It's a series - go to SeriesDetailActivity
                android.util.Log.d("SearchActivity", "Opening series: ${movie.name}")
                openSeriesFromSearch(movie)
            }
        } else {
            android.util.Log.e("SearchActivity", "Movie not found for channel: ${channel.id}")
        }
    }
    
    private fun playMovieFromSearch(movie: Movie) {
        // Open MovieDetailActivity instead of playing directly
        val posterUrl = buildImageUrl(movie.getImageUrl()) ?: ""
        val intent = Intent(this, MovieDetailActivity::class.java).apply {
            putExtra("MOVIE_ID", movie.id)
            putExtra("MOVIE_NAME", movie.name)
            putExtra("POSTER_URL", posterUrl)
            putExtra("DESCRIPTION", movie.description ?: "")
            putExtra("ACTORS", movie.actors ?: "")
            putExtra("DIRECTOR", movie.director ?: "")
            putExtra("YEAR", movie.year ?: "")
            putExtra("COUNTRY", movie.country ?: "")
            putExtra("GENRES", movie.genresStr ?: "")
            putExtra("CMD", movie.cmd)
            putExtra("CATEGORY_ID", movie.categoryId ?: "")
            putExtra("CATEGORY_TITLE", "Search Results") // Default title for search results
            putExtra("FROM_SEARCH", true) // Flag to indicate we came from search
        }
        startActivity(intent)
        // Don't finish() here - user should be able to back to search
    }
    
    private fun openSeriesFromSearch(movie: Movie) {
        // Convert Movie to Series object for SeriesDetailActivity
        val series = com.ronika.iptvnative.models.Series(
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
        
        val intent = Intent(this, SeriesDetailActivity::class.java).apply {
            putExtra("SERIES_ID", series.id)
            putExtra("SERIES_NAME", series.name)
            putExtra("POSTER_URL", buildImageUrl(series.getImageUrl()) ?: "")
            putExtra("DESCRIPTION", series.description ?: "")
            putExtra("ACTORS", series.actors ?: "")
            putExtra("DIRECTOR", series.director ?: "")
            putExtra("YEAR", series.year ?: "")
            putExtra("COUNTRY", series.country ?: "")
            putExtra("GENRES", series.genresStr ?: "")
            putExtra("TOTAL_SEASONS", series.totalEpisodes ?: "Unknown")
            putExtra("FROM_SEARCH", true) // Flag to indicate we came from search
        }
        startActivity(intent)
        // Don't finish() here - user should be able to back to search
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
}
