package com.ronika.iptvnative

import android.content.Intent
import android.os.Bundle
import android.widget.ProgressBar
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.ronika.iptvnative.api.ApiClient
import com.ronika.iptvnative.api.MoviesRequest
import com.ronika.iptvnative.models.Channel
import com.ronika.iptvnative.models.Genre
import com.ronika.iptvnative.models.Movie
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MoviesActivity : ComponentActivity() {

    private lateinit var movieRowsRecycler: RecyclerView
    private lateinit var loadingIndicator: ProgressBar
    private lateinit var movieCategoryRowAdapter: MovieCategoryRowAdapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_movies)

        // Initialize views
        movieRowsRecycler = findViewById(R.id.movie_rows_recycler)
        loadingIndicator = findViewById(R.id.loading_indicator)

        // Setup navigation
        findViewById<android.widget.ImageView>(R.id.nav_tv).setOnClickListener {
            finish() // Go back to MainActivity (Live TV)
        }

        findViewById<android.widget.ImageView>(R.id.nav_shows).setOnClickListener {
            // TODO: Open Shows activity
        }

        findViewById<android.widget.ImageView>(R.id.nav_search).setOnClickListener {
            startActivity(Intent(this, SearchActivity::class.java))
        }

        // Setup adapter
        setupAdapter()

        // Load movie categories
        loadMovies()
    }

    private fun setupAdapter() {
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
                
                // Start player activity
                val intent = Intent(this, MainActivity::class.java).apply {
                    putExtra("play_movie", true)
                    putExtra("movie_id", channel.id)
                    putExtra("movie_name", channel.name)
                    putExtra("movie_cmd", channel.cmd)
                }
                startActivity(intent)
            },
            onViewAllClick = { categoryId, categoryTitle ->
                android.util.Log.d("MoviesActivity", "View All clicked for category: $categoryTitle")
                // TODO: Open category detail screen
            }
        )

        movieRowsRecycler.apply {
            layoutManager = LinearLayoutManager(this@MoviesActivity)
            adapter = movieCategoryRowAdapter
            setHasFixedSize(false)
        }

        android.util.Log.d("MoviesActivity", "Adapter setup complete")
    }

    private fun loadMovies() {
        android.util.Log.d("MoviesActivity", "Loading movie categories")
        
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                // Get categories
                val response = ApiClient.apiService.getMovieCategories(
                    ApiClient.getCredentials()
                )
                
                val categories = response.categories
                    .filter { it.id.toIntOrNull() != null }
                    .map { Genre(it.id, it.title, it.name, it.alias, it.censored) }
                
                android.util.Log.d("MoviesActivity", "Got ${categories.size} movie categories")
                
                // Load movies for each category incrementally
                for (category in categories.take(10)) {
                    android.util.Log.d("MoviesActivity", "Loading movies for: ${category.title ?: category.name}")
                    
                    try {
                        val moviesResponse = ApiClient.apiService.getMovies(
                            MoviesRequest(
                                mac = ApiClient.macAddress,
                                url = ApiClient.portalUrl,
                                category = category.id,
                                page = 1
                            )
                        )
                        
                        if (moviesResponse.items.data.isNotEmpty()) {
                            val newRow = MovieCategoryRowAdapter.CategoryRow(
                                categoryId = category.id,
                                categoryTitle = (category.title ?: category.name) ?: "Unknown",
                                movies = moviesResponse.items.data.take(25)
                            )
                            
                            // Add to UI immediately
                            withContext(Dispatchers.Main) {
                                movieCategoryRowAdapter.addCategoryRow(newRow)
                                loadingIndicator.visibility = android.view.View.GONE
                                android.util.Log.d("MoviesActivity", "Added row: ${category.title ?: category.name}")
                            }
                        }
                    } catch (e: Exception) {
                        android.util.Log.e("MoviesActivity", "Error loading category: ${e.message}")
                    }
                }
                
                withContext(Dispatchers.Main) {
                    loadingIndicator.visibility = android.view.View.GONE
                    android.util.Log.d("MoviesActivity", "Finished loading all movies")
                }
                
            } catch (e: Exception) {
                android.util.Log.e("MoviesActivity", "Error: ${e.message}", e)
                withContext(Dispatchers.Main) {
                    loadingIndicator.visibility = android.view.View.GONE
                }
            }
        }
    }
}
