package com.ronika.iptvnative

import android.content.Intent
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.widget.*
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import coil.load
import coil.request.CachePolicy
import com.ronika.iptvnative.R
import com.ronika.iptvnative.adapters.ChannelAdapter
import com.ronika.iptvnative.managers.ContentManager
import com.ronika.iptvnative.models.Channel
import com.ronika.iptvnative.models.Movie
import kotlinx.coroutines.launch

class MovieDetailActivity : ComponentActivity() {

    private lateinit var backButton: Button
    private lateinit var posterImage: ImageView
    private lateinit var movieTitle: TextView
    private lateinit var movieYear: TextView
    private lateinit var movieGenres: TextView
    private lateinit var movieCast: TextView
    private lateinit var movieDirector: TextView
    private lateinit var movieDescription: TextView
    private lateinit var playButton: Button

    // See More Section
    private lateinit var seeMoreSection: LinearLayout
    private lateinit var seeMoreTitle: TextView
    private lateinit var viewAllButton: Button
    private lateinit var seeMoreRecycler: RecyclerView
    private lateinit var channelAdapter: ChannelAdapter

    // Debug view
    private lateinit var debugStatus: TextView

    // Store the movies for "see more" section to access detailed info
    private var seeMoreMovies: List<Movie> = emptyList()

    private var movieId: String = ""
    private var movieName: String = ""
    private var posterUrl: String? = null
    private var description: String? = null
    private var actors: String? = null
    private var director: String? = null
    private var year: String? = null
    private var country: String? = null
    private var genres: String? = null
    private var cmd: String? = null

    // Category info for "See More" section
    private var categoryId: String? = null
    private var categoryTitle: String? = null

    // Navigation tracking
    private var isInSeeMoreMode: Boolean = false
    private var previousMovieData: MovieData? = null

    // Data class to store movie state for back navigation
    private data class MovieData(
        val movieId: String,
        val movieName: String,
        val posterUrl: String?,
        val description: String?,
        val actors: String?,
        val director: String?,
        val year: String?,
        val country: String?,
        val genres: String?,
        val cmd: String?
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_movie_detail)

        // Get data from intent
        movieId = intent.getStringExtra("MOVIE_ID") ?: ""
        movieName = intent.getStringExtra("MOVIE_NAME") ?: ""
        posterUrl = intent.getStringExtra("POSTER_URL")
        description = intent.getStringExtra("DESCRIPTION")
        actors = intent.getStringExtra("ACTORS")
        director = intent.getStringExtra("DIRECTOR")
        year = intent.getStringExtra("YEAR")
        country = intent.getStringExtra("COUNTRY")
        genres = intent.getStringExtra("GENRES")
        cmd = intent.getStringExtra("CMD")

        // Category info for "See More" section
        categoryId = intent.getStringExtra("CATEGORY_ID")
        categoryTitle = intent.getStringExtra("CATEGORY_TITLE")

        android.util.Log.d("MovieDetail", "===== RECEIVED INTENT DATA =====")
        android.util.Log.d("MovieDetail", "Movie ID: $movieId")
        android.util.Log.d("MovieDetail", "Movie Name: $movieName")
        android.util.Log.d("MovieDetail", "Poster URL: $posterUrl")
        android.util.Log.d("MovieDetail", "Description: $description")
        android.util.Log.d("MovieDetail", "Actors: $actors")
        android.util.Log.d("MovieDetail", "Director: $director")
        android.util.Log.d("MovieDetail", "Year: $year")
        android.util.Log.d("MovieDetail", "Country: $country")
        android.util.Log.d("MovieDetail", "Genres: $genres")
        android.util.Log.d("MovieDetail", "CMD: $cmd")
        android.util.Log.d("MovieDetail", "CATEGORY_ID: $categoryId")
        android.util.Log.d("MovieDetail", "CATEGORY_TITLE: $categoryTitle")
        android.util.Log.d("MovieDetail", "=================================")

        initViews()
        displayMovieInfo()

        // Focus play button
        playButton.postDelayed({
            playButton.requestFocus()
        }, 100)
    }

    private fun initViews() {
        backButton = findViewById(R.id.back_button)
        posterImage = findViewById(R.id.poster_image)
        movieTitle = findViewById(R.id.movie_title)
        movieYear = findViewById(R.id.movie_year)
        movieGenres = findViewById(R.id.movie_genres)
        movieCast = findViewById(R.id.movie_cast)
        movieDirector = findViewById(R.id.movie_director)
        movieDescription = findViewById(R.id.movie_description)
        playButton = findViewById(R.id.play_button)

        // See More Section
        seeMoreSection = findViewById(R.id.see_more_section)
        seeMoreTitle = findViewById(R.id.see_more_title)
        viewAllButton = findViewById(R.id.view_all_button)
        seeMoreRecycler = findViewById(R.id.see_more_recycler)

        // Debug view
        debugStatus = findViewById(R.id.debug_status)

        backButton.setOnClickListener {
            finish()
        }

        playButton.setOnClickListener {
            playMovie()
        }

        // View All button
        viewAllButton.setOnClickListener {
            // TODO: Implement openCategoryView() method
            // openCategoryView()
        }

        // Setup RecyclerView for "See More" movies
        setupSeeMoreRecyclerView()

        // Load "See More" movies if category info is available
        if (!categoryId.isNullOrEmpty() && !categoryTitle.isNullOrEmpty()) {
            android.util.Log.d("MovieDetail", "initViews - category info available, calling loadSeeMoreMovies")
            loadSeeMoreMovies()
        } else {
            android.util.Log.d("MovieDetail", "initViews - category info missing, not calling loadSeeMoreMovies")
            // Temporarily show section for debugging even without category info
            seeMoreTitle.text = "Debug: No category info"
            seeMoreSection.visibility = View.VISIBLE
        }
    }

    private fun displayMovieInfo() {
        movieTitle.text = movieName

        // Year
        movieYear.text = year ?: "Unknown Year"

        // Genres
        movieGenres.text = genres ?: "Unknown Genre"

        // Cast
        if (!actors.isNullOrEmpty()) {
            movieCast.visibility = View.VISIBLE
            movieCast.text = "Cast: $actors"
        } else {
            movieCast.visibility = View.GONE
        }

        // Director
        if (!director.isNullOrEmpty()) {
            movieDirector.visibility = View.VISIBLE
            movieDirector.text = "Director: $director"
        } else {
            movieDirector.visibility = View.GONE
        }

        // Description
        if (!description.isNullOrEmpty()) {
            movieDescription.visibility = View.VISIBLE
            movieDescription.text = description
        } else {
            movieDescription.visibility = View.GONE
        }

        // Poster image - load from screenshot_uri
        val currentPosterUrl = posterUrl
        android.util.Log.d("MovieDetail", "Loading poster from: $currentPosterUrl")
        if (!currentPosterUrl.isNullOrEmpty()) {
            val fullUrl = if (currentPosterUrl.startsWith("http")) {
                currentPosterUrl
            } else {
                val cleanUrl = "http://tv.stream4k.cc".replace("/stalker_portal/?", "").replace("/stalker_portal", "").replace("/server/load.php", "")
                val finalUrl = "$cleanUrl$currentPosterUrl"
                android.util.Log.d("MovieDetail", "Constructed full URL: $finalUrl")
                finalUrl
            }
            posterImage.load(fullUrl) {
                crossfade(false) // Disable for performance
                size(400, 600) // Optimize size for movie detail poster
                memoryCachePolicy(CachePolicy.ENABLED)
                diskCachePolicy(CachePolicy.ENABLED)
                placeholder(R.drawable.ic_movie_placeholder)
                error(R.drawable.ic_movie_placeholder)
                allowHardware(true) // GPU acceleration
            }
        } else {
            android.util.Log.d("MovieDetail", "No poster URL provided")
        }
    }

    private fun playMovie() {
        android.util.Log.d("MovieDetail", "===== playMovie() CALLED =====")
        android.util.Log.d("MovieDetail", "Playing movie: $movieName ($movieId)")

        // Return to MainActivity with movie data - DON'T use FLAG_ACTIVITY_CLEAR_TOP
        // This allows MainActivity to receive the intent in onNewIntent() and play the movie
        val intent = Intent(this, MainActivity::class.java).apply {
            putExtra("PLAY_TYPE", "movie")
            putExtra("MOVIE_ID", movieId)
            putExtra("MOVIE_NAME", movieName)
            putExtra("SCREENSHOT_URL", posterUrl)
            putExtra("POSTER_URL", posterUrl) // For back navigation
            putExtra("DESCRIPTION", description)
            putExtra("ACTORS", actors)
            putExtra("DIRECTOR", director)
            putExtra("YEAR", year)
            putExtra("COUNTRY", country)
            putExtra("GENRES", genres)
            putExtra("CMD", cmd)
            // Use SINGLE_TOP so MainActivity receives in onNewIntent
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }

        android.util.Log.d("MovieDetail", "Sending intent to MainActivity with extras:")
        android.util.Log.d("MovieDetail", "  PLAY_TYPE: movie")
        android.util.Log.d("MovieDetail", "  MOVIE_ID: $movieId")
        android.util.Log.d("MovieDetail", "  MOVIE_NAME: $movieName")
        android.util.Log.d("MovieDetail", "  CMD: $cmd")
        android.util.Log.d("MovieDetail", "  POSTER_URL: $posterUrl")

        startActivity(intent)
        // Don't call finish() - keep MovieDetailActivity in back stack for proper back navigation
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (isInSeeMoreMode && previousMovieData != null) {
                // Restore previous movie data
                android.util.Log.d("MovieDetail", "Restoring previous movie data: ${previousMovieData?.movieName}")
                restorePreviousMovieData()
                return true
            } else {
                // Go back to main activity with movie rows
                val intent = Intent(this, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
                    putExtra("SELECT_TAB", "MOVIES") // Go to movies tab since we're in movie detail
                }
                startActivity(intent)
                finish()
                return true
            }
        }
        return super.onKeyDown(keyCode, event)
    }

    private fun setupSeeMoreRecyclerView() {
        channelAdapter = ChannelAdapter(
            onChannelSelected = { channel ->
                // Open detail for the selected movie
                openMovieDetail(channel)
            },
            onChannelFocused = { channel ->
                // Optional: handle focus changes
            }
        )

        seeMoreRecycler.apply {
            layoutManager = LinearLayoutManager(this@MovieDetailActivity, LinearLayoutManager.HORIZONTAL, false)
            adapter = channelAdapter
            setHasFixedSize(true)
        }
    }

    private fun loadSeeMoreMovies() {
        android.util.Log.d("MovieDetail", "loadSeeMoreMovies called - categoryId: $categoryId, categoryTitle: $categoryTitle")
        debugStatus.text = "DEBUG: loadSeeMoreMovies called - catId: $categoryId, catTitle: $categoryTitle"
        if (categoryId.isNullOrEmpty() || categoryTitle.isNullOrEmpty()) {
            android.util.Log.d("MovieDetail", "loadSeeMoreMovies - category info missing, hiding section")
            debugStatus.text = "DEBUG: Category info missing - section hidden"
            seeMoreSection.visibility = View.GONE
            return
        }

        // Update the section title
        seeMoreTitle.text = "See more in $categoryTitle"
        debugStatus.text = "DEBUG: Loading movies for '$categoryTitle'"

        // Show the section
        seeMoreSection.visibility = View.VISIBLE
        android.util.Log.d("MovieDetail", "loadSeeMoreMovies - section visibility set to VISIBLE")

        lifecycleScope.launch {
            android.util.Log.d("MovieDetail", "loadSeeMoreMovies - starting API call for category: $categoryId")
            try {
                val contentManager = ContentManager(this@MovieDetailActivity, lifecycleScope)
                val movies = mutableListOf<Movie>()

                // Load first page
                android.util.Log.d("MovieDetail", "loadSeeMoreMovies - loading page 1")
                val result1 = contentManager.loadMovies(categoryId!!, 1)
                android.util.Log.d("MovieDetail", "loadSeeMoreMovies - page 1 result: success=${result1.isSuccess}")
                if (result1.isSuccess) {
                    val page1Movies = result1.getOrNull() ?: emptyList()
                    android.util.Log.d("MovieDetail", "loadSeeMoreMovies - page 1 returned ${page1Movies.size} movies")
                    movies.addAll(page1Movies)
                } else {
                    android.util.Log.e("MovieDetail", "loadSeeMoreMovies - page 1 failed: ${result1.exceptionOrNull()?.message}")
                }

                // Load second page if we need more movies
                if (movies.size < 25) {
                    val result2 = contentManager.loadMovies(categoryId!!, 2)
                    if (result2.isSuccess) {
                        movies.addAll(result2.getOrNull() ?: emptyList())
                    }
                }

                // Take first 25 movies, excluding the current movie
                val filteredMovies = movies
                    .filter { it.id != movieId }
                    .take(25)

                // Store the movies for later access to detailed info
                seeMoreMovies = filteredMovies

                // Convert to Channel objects for the adapter
                val channels = filteredMovies.map { movie ->
                    Channel(
                        id = movie.id,
                        name = movie.name,
                        number = null,
                        logo = buildImageUrl(movie.getImageUrl()),
                        cmd = movie.cmd,
                        genreId = movie.categoryId,
                        isLive = false
                    )
                }

                android.util.Log.d("MovieDetail", "loadSeeMoreMovies - loaded ${movies.size} total movies, filtered to ${filteredMovies.size}, created ${channels.size} channels")
                channelAdapter.setChannels(channels)
                debugStatus.text = "DEBUG: Loaded ${channels.size} movies for '$categoryTitle'"

                android.util.Log.d("MovieDetail", "Loaded ${channels.size} movies for 'See more in $categoryTitle'")

            } catch (e: Exception) {
                android.util.Log.e("MovieDetail", "Error loading see more movies", e)
                // Don't hide the section completely - just show empty state
                // seeMoreSection.visibility = View.GONE
                android.util.Log.d("MovieDetail", "Keeping section visible despite error for debugging")
            }
        }
    }

    private fun openMovieDetail(channel: Channel) {
        // Find the movie object with detailed info
        val selectedMovie = seeMoreMovies.find { it.id == channel.id }
        if (selectedMovie != null) {
            // Save current movie data for back navigation
            if (!isInSeeMoreMode) {
                previousMovieData = MovieData(
                    movieId = movieId,
                    movieName = movieName,
                    posterUrl = posterUrl,
                    description = description,
                    actors = actors,
                    director = director,
                    year = year,
                    country = country,
                    genres = genres,
                    cmd = cmd
                )
                isInSeeMoreMode = true
                android.util.Log.d("MovieDetail", "Saved previous movie data for back navigation: $movieName")
            }
            // Update current activity with new movie data
            updateMovieData(selectedMovie)
        }
    }

    private fun updateMovieData(movie: Movie) {
        // Update all movie data from the Movie object
        movieId = movie.id
        movieName = movie.name
        posterUrl = movie.getImageUrl()
        cmd = movie.cmd
        description = movie.description
        actors = movie.actors
        director = movie.director
        year = movie.year
        country = movie.country
        genres = movie.genresStr

        // Update UI with new movie info
        displayMovieInfo()

        // Reload see more section (this will exclude the new current movie)
        loadSeeMoreMovies()

        // Scroll to top
        window.decorView.scrollTo(0, 0)

        // Focus play button
        playButton.postDelayed({
            playButton.requestFocus()
        }, 100)
    }

    private fun restorePreviousMovieData() {
        previousMovieData?.let { data ->
            // Restore all movie data
            movieId = data.movieId
            movieName = data.movieName
            posterUrl = data.posterUrl
            description = data.description
            actors = data.actors
            director = data.director
            year = data.year
            country = data.country
            genres = data.genres
            cmd = data.cmd

            // Update UI
            displayMovieInfo()

            // Reload see more section
            loadSeeMoreMovies()

            // Scroll to top
            window.decorView.scrollTo(0, 0)

            // Focus play button
            playButton.postDelayed({
                playButton.requestFocus()
            }, 100)

            // Reset navigation state
            isInSeeMoreMode = false
            previousMovieData = null

            android.util.Log.d("MovieDetail", "Restored to previous movie: $movieName")
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
}