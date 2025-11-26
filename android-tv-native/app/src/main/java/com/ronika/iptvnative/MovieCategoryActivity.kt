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
    
    private var categoryId: String = ""
    private var categoryTitle: String = ""
    private var currentPage = 1
    private var isLoadingMore = false
    private var hasMorePages = true
    
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
            
            // Add scroll listener for lazy loading
            addOnScrollListener(object : RecyclerView.OnScrollListener() {
                override fun onScrolled(recyclerView: RecyclerView, dx: Int, dy: Int) {
                    super.onScrolled(recyclerView, dx, dy)
                    val layoutManager = recyclerView.layoutManager as GridLayoutManager
                    val visibleItemCount = layoutManager.childCount
                    val totalItemCount = layoutManager.itemCount
                    val firstVisibleItemPosition = layoutManager.findFirstVisibleItemPosition()
                    
                    if (!isLoadingMore && hasMorePages && dy > 0) {
                        if ((visibleItemCount + firstVisibleItemPosition) >= totalItemCount - 10) {
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
                val response = ApiClient.apiService.getMovies(
                    MoviesRequest(
                        mac = ApiClient.macAddress,
                        url = ApiClient.portalUrl,
                        category = categoryId,
                        page = page
                    )
                )
                
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
        val channel = Channel(
            id = movie.id,
            name = movie.name,
            number = "",
            logo = movie.getImageUrl() ?: "",
            cmd = movie.cmd ?: "",
            genreId = movie.categoryId
        )
        
        // TODO: Play movie
        android.util.Log.d("MovieCategoryActivity", "Play movie: ${movie.name}")
    }
    
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            finish()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }
}
