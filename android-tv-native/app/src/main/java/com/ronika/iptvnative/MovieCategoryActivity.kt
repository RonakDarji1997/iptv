package com.ronika.iptvnative

import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.widget.ProgressBar
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.ronika.iptvnative.adapters.MovieGridAdapter
import com.ronika.iptvnative.api.ApiClient
import com.ronika.iptvnative.api.MoviesRequest
import com.ronika.iptvnative.api.StalkerClient
import com.ronika.iptvnative.models.Channel
import com.ronika.iptvnative.models.Movie
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MovieCategoryActivity : ComponentActivity() {
    private lateinit var titleText: TextView
    private lateinit var moviesRecycler: RecyclerView
    private lateinit var loadingIndicator: ProgressBar
    private lateinit var movieAdapter: MovieGridAdapter
    
    private val stalkerClient by lazy { StalkerClient("http://tv.stream4k.cc/stalker_portal/server/load.php", "00:1a:79:17:f4:f5") }
    
    private var categoryId: String = ""
    private var categoryTitle: String = ""
    private var currentPage = 1
    private var isLoadingMore = false
    private var hasMorePages = true
    
    // Cache for series metadata to avoid refetching
    private val seriesMetadataCache = mutableMapOf<String, Map<String, Any>>()
    
    private fun buildImageUrl(imagePath: String?): String? {
        if (imagePath.isNullOrEmpty()) return null
        
        // If already a full URL, return as is
        if (imagePath.startsWith("http")) {
            return imagePath
        }
        
        // Use the correct domain for images (same as MainActivity)
        // Images must be loaded from tv.stream4k.cc, not the IP address
        return if (imagePath.startsWith("/")) {
            // imagePath like "/stalker_portal/screenshots/123.jpg"
            "http://tv.stream4k.cc$imagePath"
        } else {
            imagePath
        }
    }
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_movie_category)
        
        // Get category details from intent
        categoryId = intent.getStringExtra("categoryId") ?: ""
        categoryTitle = intent.getStringExtra("categoryTitle") ?: "Movies"
        
        // Initialize views
        titleText = findViewById(R.id.category_title_text)
        moviesRecycler = findViewById(R.id.movies_grid_recycler)
        loadingIndicator = findViewById(R.id.loading_indicator)
        
        titleText.text = categoryTitle
        
        // Setup grid adapter
        movieAdapter = MovieGridAdapter { movie ->
            onMovieClick(movie)
        }
        
        // Calculate grid columns
        val displayMetrics = resources.displayMetrics
        val screenWidthPx = displayMetrics.widthPixels
        val density = displayMetrics.density
        val cardWidthDp = 200f
        val cardMarginDp = 16f
        val itemTotalWidthDp = cardWidthDp + cardMarginDp
        val itemTotalWidthPx = (itemTotalWidthDp * density).toInt()
        val columns = (screenWidthPx / itemTotalWidthPx).coerceAtLeast(4)
        
        moviesRecycler.apply {
            layoutManager = GridLayoutManager(this@MovieCategoryActivity, columns)
            adapter = movieAdapter
            setHasFixedSize(true)
            setItemViewCacheSize(20) // Cache for grid view
            isNestedScrollingEnabled = false
            
            // Add scroll listener for lazy loading
            addOnScrollListener(object : RecyclerView.OnScrollListener() {
                override fun onScrolled(recyclerView: RecyclerView, dx: Int, dy: Int) {
                    super.onScrolled(recyclerView, dx, dy)
                    val layoutManager = recyclerView.layoutManager as GridLayoutManager
                    val visibleItemCount = layoutManager.childCount
                    val totalItemCount = layoutManager.itemCount
                    val firstVisibleItemPosition = layoutManager.findFirstVisibleItemPosition()
                    
                    if (!isLoadingMore && hasMorePages && dy > 0) {
                        if ((visibleItemCount + firstVisibleItemPosition) >= totalItemCount - 5) {
                            loadMoreMovies()
                        }
                    }
                }
            })
        }
        
        // Load first page
        loadMovies(1)
    }
    
    private fun loadMovies(page: Int) {
        if (isLoadingMore) return
        
        isLoadingMore = true
        if (page == 1) {
            loadingIndicator.visibility = View.VISIBLE
        }
        
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                val response = stalkerClient.getVodItems(categoryId, page, "vod")
                
                val movies = response.items.data
                
                withContext(Dispatchers.Main) {
                    if (page == 1) {
                        movieAdapter.setMovies(movies)
                        loadingIndicator.visibility = View.GONE
                        
                        // Focus on first movie
                        moviesRecycler.postDelayed({
                            moviesRecycler.getChildAt(0)?.requestFocus()
                        }, 100)
                    } else {
                        movieAdapter.addMovies(movies)
                    }
                    
                    currentPage = page
                    hasMorePages = movies.isNotEmpty()
                    isLoadingMore = false
                    
                    android.util.Log.d("MovieCategoryActivity", "Loaded page $page with ${movies.size} movies")
                }
            } catch (e: Exception) {
                android.util.Log.e("MovieCategoryActivity", "Error loading movies: ${e.message}", e)
                withContext(Dispatchers.Main) {
                    loadingIndicator.visibility = View.GONE
                    isLoadingMore = false
                }
            }
        }
    }
    
    private fun loadMoreMovies() {
        loadMovies(currentPage + 1)
    }
    
    private fun onMovieClick(movie: Movie) {
        // Check if this is a series (isSeries field is "1" for series)
        if (movie.isSeries == "1") {
            android.util.Log.d("MovieCategoryActivity", "Opening series detail: ${movie.name}")
            
            // If movie data is incomplete, fetch full series metadata from API
            if (movie.description.isNullOrBlank() || movie.actors.isNullOrBlank()) {
                // Check cache first
                val cachedData = seriesMetadataCache[movie.id]
                if (cachedData != null) {
                    android.util.Log.d("MovieCategoryActivity", "Using cached series metadata for: ${movie.name}")
                    val name = cachedData["name"] as? String ?: movie.name
                    val description = cachedData["description"] as? String ?: ""
                    val actors = cachedData["actors"] as? String ?: ""
                    val director = cachedData["director"] as? String ?: ""
                    val year = cachedData["year"] as? String ?: ""
                    val country = cachedData["country"] as? String ?: ""
                    val genres = cachedData["genres_str"] as? String ?: ""
                    val totalEpisodes = cachedData["total_episodes"] as? String ?: ""
                    val screenshotUri = cachedData["screenshot_uri"] as? String
                    val screenshot = cachedData["screenshot"] as? String
                    
                    val posterUrl = buildImageUrl(screenshotUri ?: screenshot ?: movie.getImageUrl()) ?: ""
                    
                    val intent = android.content.Intent(this, SeriesDetailActivity::class.java).apply {
                        putExtra("SERIES_ID", movie.id)
                        putExtra("SERIES_NAME", name)
                        putExtra("POSTER_URL", posterUrl)
                        putExtra("DESCRIPTION", description)
                        putExtra("ACTORS", actors)
                        putExtra("DIRECTOR", director)
                        putExtra("YEAR", year)
                        putExtra("COUNTRY", country)
                        putExtra("GENRES", genres)
                        putExtra("TOTAL_SEASONS", totalEpisodes)
                    }
                    startActivity(intent)
                    return
                }
                
                android.util.Log.d("MovieCategoryActivity", "Fetching full series metadata for: ${movie.name}")
                lifecycleScope.launch {
                    try {
                        // Fetch full movie/series info using getVodFileInfo
                        val fileInfo = withContext(Dispatchers.IO) {
                            stalkerClient.getVodFileInfo(movie.id)
                        }
                        
                        if (fileInfo != null) {
                            // Cache the fetched data
                            seriesMetadataCache[movie.id] = fileInfo
                            
                            // Extract metadata from file info
                            val name = fileInfo["name"] as? String ?: movie.name
                            val description = fileInfo["description"] as? String ?: ""
                            val actors = fileInfo["actors"] as? String ?: ""
                            val director = fileInfo["director"] as? String ?: ""
                            val year = fileInfo["year"] as? String ?: ""
                            val country = fileInfo["country"] as? String ?: ""
                            val genres = fileInfo["genres_str"] as? String ?: ""
                            val totalEpisodes = fileInfo["total_episodes"] as? String ?: ""
                            val screenshotUri = fileInfo["screenshot_uri"] as? String
                            val screenshot = fileInfo["screenshot"] as? String
                            
                            // Build proper image URL using the same method as MainActivity
                            val posterUrl = buildImageUrl(screenshotUri ?: screenshot ?: movie.getImageUrl()) ?: ""
                            android.util.Log.d("MovieCategoryActivity", "Fetched series metadata - Poster: $posterUrl")
                            
                            val intent = android.content.Intent(this@MovieCategoryActivity, SeriesDetailActivity::class.java).apply {
                                putExtra("SERIES_ID", movie.id)
                                putExtra("SERIES_NAME", name)
                                putExtra("POSTER_URL", posterUrl)
                                putExtra("DESCRIPTION", description)
                                putExtra("ACTORS", actors)
                                putExtra("DIRECTOR", director)
                                putExtra("YEAR", year)
                                putExtra("COUNTRY", country)
                                putExtra("GENRES", genres)
                                putExtra("TOTAL_SEASONS", totalEpisodes)
                            }
                            startActivity(intent)
                        } else {
                            // Fallback to movie data if API returns null
                            val posterUrl = buildImageUrl(movie.getImageUrl()) ?: ""
                            val intent = android.content.Intent(this@MovieCategoryActivity, SeriesDetailActivity::class.java).apply {
                                putExtra("SERIES_ID", movie.id)
                                putExtra("SERIES_NAME", movie.name)
                                putExtra("POSTER_URL", posterUrl)
                                putExtra("DESCRIPTION", movie.description ?: "")
                                putExtra("ACTORS", movie.actors ?: "")
                                putExtra("DIRECTOR", movie.director ?: "")
                                putExtra("YEAR", movie.year ?: "")
                                putExtra("COUNTRY", movie.country ?: "")
                                putExtra("GENRES", movie.genresStr ?: "")
                                putExtra("TOTAL_SEASONS", movie.totalEpisodes ?: "")
                            }
                            startActivity(intent)
                        }
                    } catch (e: Exception) {
                        android.util.Log.e("MovieCategoryActivity", "Error fetching series metadata: ${e.message}", e)
                        // Fallback to movie data
                        val posterUrl = buildImageUrl(movie.getImageUrl()) ?: ""
                        val intent = android.content.Intent(this@MovieCategoryActivity, SeriesDetailActivity::class.java).apply {
                            putExtra("SERIES_ID", movie.id)
                            putExtra("SERIES_NAME", movie.name)
                            putExtra("POSTER_URL", posterUrl)
                            putExtra("DESCRIPTION", movie.description ?: "")
                            putExtra("ACTORS", movie.actors ?: "")
                            putExtra("DIRECTOR", movie.director ?: "")
                            putExtra("YEAR", movie.year ?: "")
                            putExtra("COUNTRY", movie.country ?: "")
                            putExtra("GENRES", movie.genresStr ?: "")
                            putExtra("TOTAL_SEASONS", movie.totalEpisodes ?: "")
                        }
                        startActivity(intent)
                    }
                }
            } else {
                // Use existing movie data
                val posterUrl = buildImageUrl(movie.getImageUrl()) ?: ""
                android.util.Log.d("MovieCategoryActivity", "Using cached data - Poster: $posterUrl")
                
                val intent = android.content.Intent(this, SeriesDetailActivity::class.java).apply {
                    putExtra("SERIES_ID", movie.id)
                    putExtra("SERIES_NAME", movie.name)
                    putExtra("POSTER_URL", posterUrl)
                    putExtra("DESCRIPTION", movie.description ?: "")
                    putExtra("ACTORS", movie.actors ?: "")
                    putExtra("DIRECTOR", movie.director ?: "")
                    putExtra("YEAR", movie.year ?: "")
                    putExtra("COUNTRY", movie.country ?: "")
                    putExtra("GENRES", movie.genresStr ?: "")
                    putExtra("TOTAL_SEASONS", movie.totalEpisodes ?: "")
                }
                startActivity(intent)
            }
        } else {
            android.util.Log.d("MovieCategoryActivity", "Playing movie: ${movie.name}")
            
            // Launch MainActivity to play the movie
            val intent = android.content.Intent(this, MainActivity::class.java).apply {
                flags = android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP or android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP
                putExtra("playMovie", true)
                putExtra("movieId", movie.id)
                putExtra("movieName", movie.name)
                putExtra("movieCmd", movie.cmd ?: "")
                putExtra("movieLogo", movie.getImageUrl() ?: "")
                putExtra("categoryId", movie.categoryId)
            }
            android.util.Log.d("MovieCategoryActivity", "Launching MainActivity with movie data: ${movie.name}")
            startActivity(intent)
            finish()
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
