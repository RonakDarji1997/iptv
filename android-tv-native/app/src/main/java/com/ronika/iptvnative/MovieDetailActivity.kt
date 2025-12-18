package com.ronika.iptvnative

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.widget.*
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import coil.load
import coil.request.CachePolicy
import coil.transform.RoundedCornersTransformation
import coil.transform.CircleCropTransformation
import com.ronika.iptvnative.services.TmdbService
import kotlinx.coroutines.launch

class MovieDetailActivity : ComponentActivity() {

    // Hero section views
    private lateinit var backButton: Button
    private lateinit var backdropImage: ImageView
    private lateinit var movieTitle: TextView
    private lateinit var movieTagline: TextView
    private lateinit var ratingContainer: LinearLayout
    private lateinit var movieRating: TextView
    private lateinit var movieYear: TextView
    private lateinit var movieRuntime: TextView
    private lateinit var movieAge: TextView
    private lateinit var playButton: Button
    
    // Content section views
    private lateinit var progressContainer: LinearLayout
    private lateinit var watchProgress: ProgressBar
    private lateinit var progressText: TextView
    private lateinit var genresContainer: LinearLayout
    private lateinit var overviewContainer: LinearLayout
    private lateinit var movieDescription: TextView
    private lateinit var castContainer: LinearLayout
    private lateinit var castItemsContainer: LinearLayout
    private lateinit var infoGrid: LinearLayout
    private lateinit var directorContainer: LinearLayout
    private lateinit var movieDirector: TextView
    private lateinit var countryContainer: LinearLayout
    private lateinit var movieCountry: TextView
    private lateinit var productionContainer: LinearLayout
    private lateinit var movieProduction: TextView
    private lateinit var tmdbLoading: ProgressBar
    // CAST COMMENTED OUT
    // private lateinit var castRecycler: RecyclerView
    // private lateinit var castLabel: TextView

    // Data
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
    private var tmdbDetails: TmdbService.TmdbDetails? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        android.util.Log.e("MovieDetailActivity", "==========================================")
        android.util.Log.e("MovieDetailActivity", "MovieDetailActivity OPENED!")
        android.util.Log.e("MovieDetailActivity", "==========================================")
        
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

        android.util.Log.e("MovieDetailActivity", "Movie: $movieName, Year: $year, CMD: $cmd")

        initViews()
        
        // Hide content initially until we load data
        backdropImage.alpha = 0f
        movieTitle.alpha = 0f
        playButton.alpha = 0f
        
        loadTmdbData()

        // Focus play button after content is visible
        playButton.postDelayed({
            playButton.requestFocus()
        }, 300)
    }

    private fun initViews() {
        backButton = findViewById(R.id.back_button)
        backdropImage = findViewById(R.id.backdrop_image)
        movieTitle = findViewById(R.id.movie_title)
        movieTagline = findViewById(R.id.movie_tagline)
        ratingContainer = findViewById(R.id.rating_container)
        movieRating = findViewById(R.id.movie_rating)
        movieYear = findViewById(R.id.movie_year)
        movieRuntime = findViewById(R.id.movie_runtime)
        movieAge = findViewById(R.id.movie_age)
        playButton = findViewById(R.id.play_button)
        
        progressContainer = findViewById(R.id.progress_container)
        watchProgress = findViewById(R.id.watch_progress)
        progressText = findViewById(R.id.progress_text)
        genresContainer = findViewById(R.id.genres_container)
        overviewContainer = findViewById(R.id.overview_container)
        movieDescription = findViewById(R.id.movie_description)
        castContainer = findViewById(R.id.cast_container)
        castItemsContainer = findViewById(R.id.cast_items_container)
        infoGrid = findViewById(R.id.info_grid)
        directorContainer = findViewById(R.id.director_container)
        movieDirector = findViewById(R.id.movie_director)
        productionContainer = findViewById(R.id.production_container)
        movieProduction = findViewById(R.id.movie_production)
        tmdbLoading = findViewById(R.id.tmdb_loading)
        // CAST COMMENTED OUT
        // castRecycler = findViewById(R.id.cast_recycler)
        // castLabel = findViewById(R.id.cast_label)

        backButton.setOnClickListener {
            finish()
        }

        playButton.setOnClickListener {
            playMovie()
        }
        
        playButton.setOnFocusChangeListener { _, hasFocus ->
            android.util.Log.e("MovieDetailActivity", "Play button focus changed: $hasFocus")
        }
        
        android.util.Log.e("MovieDetailActivity", "Play button initialized, requesting focus...")
    }

    private fun displayBasicInfo() {
        // Show basic info while TMDB loads
        movieTitle.text = movieName
        if (year != null) {
            movieYear.text = year
        }
        
        // Show provider description if available
        if (!description.isNullOrEmpty()) {
            movieDescription.text = description
            overviewContainer.visibility = View.VISIBLE
        }
        
        // Show provider genres if available
        genres?.let { genreStr ->
            if (genreStr.isNotEmpty()) {
                genresContainer.removeAllViews()
                genreStr.split(",").take(5).forEach { genre ->
                    val chip = createGenreChip(genre.trim())
                    genresContainer.addView(chip)
                }
                genresContainer.visibility = View.VISIBLE
            }
        }
        
        // Show provider director
        if (!director.isNullOrEmpty()) {
            movieDirector.text = director
            directorContainer.visibility = View.VISIBLE
            infoGrid.visibility = View.VISIBLE
        }
        
        // Show provider country
        if (!country.isNullOrEmpty()) {
            movieCountry.text = country
            countryContainer.visibility = View.VISIBLE
            infoGrid.visibility = View.VISIBLE
        }
        
        // Load provider poster as backdrop fallback
        if (!posterUrl.isNullOrEmpty()) {
            val fullUrl = if (posterUrl!!.startsWith("http")) {
                posterUrl
            } else {
                "http://tv.stream4k.cc$posterUrl"
            }
            backdropImage.load(fullUrl) {
                crossfade(true)
                memoryCachePolicy(CachePolicy.ENABLED)
                diskCachePolicy(CachePolicy.ENABLED)
            }
        }
    }

    private fun loadTmdbData() {
        android.util.Log.e("MovieDetailActivity", "==========================================")
        android.util.Log.e("MovieDetailActivity", "loadTmdbData() STARTED for: $movieName")
        android.util.Log.e("MovieDetailActivity", "==========================================")
        
        tmdbLoading.visibility = View.VISIBLE
        
        lifecycleScope.launch {
            try {
                val yearInt = year?.toIntOrNull()
                android.util.Log.e("MovieDetailActivity", "Calling TmdbService.smartSearch for: $movieName, year: $yearInt")
                
                tmdbDetails = TmdbService.smartSearch(movieName, "movie", yearInt)
                
                if (tmdbDetails != null) {
                    android.util.Log.e("MovieDetailActivity", "TMDB data found! Title: ${tmdbDetails!!.title}")
                    displayTmdbData(tmdbDetails!!)
                } else {
                    android.util.Log.e("MovieDetailActivity", "NO TMDB data found, using provider data")
                    displayBasicInfo()
                }
                
                // Fade in content after data is loaded
                backdropImage.animate().alpha(1f).setDuration(300).start()
                movieTitle.animate().alpha(1f).setDuration(300).start()
                playButton.animate().alpha(1f).setDuration(300).start()
                
            } catch (e: Exception) {
                android.util.Log.e("MovieDetail", "Error loading TMDB data", e)
                // Show provider data on error
                displayBasicInfo()
                backdropImage.animate().alpha(1f).setDuration(300).start()
                movieTitle.animate().alpha(1f).setDuration(300).start()
                playButton.animate().alpha(1f).setDuration(300).start()
            } finally {
                tmdbLoading.visibility = View.GONE
            }
        }
    }

    private fun displayTmdbData(details: TmdbService.TmdbDetails) {
        android.util.Log.d("MovieDetail", "Displaying TMDB data for: ${details.title}")
        
        // Title (replace with TMDB title)
        movieTitle.text = details.title ?: movieName
        
        // Tagline
        if (!details.tagline.isNullOrEmpty()) {
            movieTagline.text = details.tagline
            movieTagline.visibility = View.VISIBLE
        }
        
        // Backdrop (replace provider image with TMDB)
        val backdropUrl = TmdbService.getBackdropUrl(details.backdropPath, "w1280")
        if (backdropUrl != null) {
            backdropImage.load(backdropUrl) {
                crossfade(true)
                memoryCachePolicy(CachePolicy.ENABLED)
                diskCachePolicy(CachePolicy.ENABLED)
            }
        }
        
        // Rating
        if (details.voteAverage > 0) {
            movieRating.text = String.format("%.1f", details.voteAverage)
            ratingContainer.visibility = View.VISIBLE
        }
        
        // Year (prefer TMDB year)
        val releaseYear = details.releaseDate?.substring(0, 4)
        if (releaseYear != null) {
            movieYear.text = releaseYear
        }
        
        // Runtime
        if (details.runtime != null && details.runtime > 0) {
            val hours = details.runtime / 60
            val mins = details.runtime % 60
            movieRuntime.text = "${hours}h ${mins}m"
            movieRuntime.visibility = View.VISIBLE
        }
        
        // Genres (replace with TMDB genres)
        if (details.genres.isNotEmpty()) {
            genresContainer.removeAllViews()
            details.genres.take(5).forEach { genre ->
                val chip = createGenreChip(genre.name)
                genresContainer.addView(chip)
            }
            genresContainer.visibility = View.VISIBLE
        }
        
        // Overview (prefer TMDB overview)
        if (details.overview.isNotEmpty()) {
            movieDescription.text = details.overview
            overviewContainer.visibility = View.VISIBLE
        }
        
        // CAST COMMENTED OUT
        /*
        // Cast (horizontal RecyclerView)
        val cast = details.credits?.cast?.take(8)
        if (cast != null && cast.isNotEmpty()) {
            castRecycler.layoutManager = LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false)
            castRecycler.adapter = CastAdapter(cast)
            castRecycler.visibility = View.VISIBLE
            castLabel.visibility = View.VISIBLE
        }
        */
        
        // Director from TMDB crew
        val tmdbDirector = details.credits?.crew?.find { it.job == "Director" }
        if (tmdbDirector != null) {
            movieDirector.text = tmdbDirector.name
            directorContainer.visibility = View.VISIBLE
            infoGrid.visibility = View.VISIBLE
        }
        
        // Production company
        if (details.productionCompanies.isNotEmpty()) {
            movieProduction.text = details.productionCompanies[0].name
            productionContainer.visibility = View.VISIBLE
            infoGrid.visibility = View.VISIBLE
        }
    }

    private fun createGenreChip(genreName: String): TextView {
        return TextView(this).apply {
            text = genreName
            setTextColor(Color.parseColor("#d4d4d8"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
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

    private fun createCastView(cast: TmdbService.CastMember): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(
                dpToPx(70),
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                setMargins(0, 0, dpToPx(10), 0)
            }
            
            // Profile image (Small, Round)
            val imageView = ImageView(this@MovieDetailActivity).apply {
                layoutParams = LinearLayout.LayoutParams(dpToPx(70), dpToPx(70))
                scaleType = ImageView.ScaleType.CENTER_CROP
                
                val profileUrl = TmdbService.getProfileUrl(cast.profilePath, "w185")
                if (profileUrl != null) {
                    load(profileUrl) {
                        crossfade(true)
                        transformations(RoundedCornersTransformation(dpToPx(35).toFloat())) // Fully round
                        memoryCachePolicy(CachePolicy.ENABLED)
                        diskCachePolicy(CachePolicy.ENABLED)
                        error(R.drawable.cast_profile_placeholder)
                    }
                } else {
                    setBackgroundResource(R.drawable.cast_profile_placeholder)
                }
            }
            addView(imageView)
            
            // Name only (smaller)
            val nameView = TextView(this@MovieDetailActivity).apply {
                text = cast.name
                setTextColor(Color.WHITE)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
                gravity = Gravity.CENTER
                maxLines = 1
                ellipsize = android.text.TextUtils.TruncateAt.END
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    setMargins(0, dpToPx(5), 0, 0)
                }
            }
            addView(nameView)
        }
    }

    private fun dpToPx(dp: Int): Int {
        return TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            dp.toFloat(),
            resources.displayMetrics
        ).toInt()
    }

    private fun playMovie() {
        android.util.Log.e("MovieDetailActivity", "==========================================")
        android.util.Log.e("MovieDetailActivity", "PLAY BUTTON CLICKED!")
        android.util.Log.e("MovieDetailActivity", "Movie: $movieName, ID: $movieId")
        android.util.Log.e("MovieDetailActivity", "CMD: $cmd")
        android.util.Log.e("MovieDetailActivity", "==========================================")

        // Create VODItem and send back to MainActivity to play
        val intent = Intent().apply {
            putExtra("ACTION", "PLAY_MOVIE")
            putExtra("MOVIE_ID", movieId)
            putExtra("MOVIE_NAME", movieName)
            putExtra("POSTER_URL", posterUrl)
            putExtra("CMD", cmd)
        }
        
        android.util.Log.e("MovieDetailActivity", "Setting result and finishing activity")
        setResult(RESULT_OK, intent)
        finish()
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            android.util.Log.e("MovieDetailActivity", "Back button pressed, finishing activity")
            finish()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }
    
    // CAST ADAPTER COMMENTED OUT
    /*
    // Cast Adapter
    inner class CastAdapter(private val cast: List<TmdbService.CastMember>) : 
        RecyclerView.Adapter<CastAdapter.CastViewHolder>() {
        
        inner class CastViewHolder(view: View) : RecyclerView.ViewHolder(view) {
            val castImage: ImageView = view.findViewById(R.id.cast_image)
            val castName: TextView = view.findViewById(R.id.cast_name)
        }
        
        override fun onCreateViewHolder(parent: android.view.ViewGroup, viewType: Int): CastViewHolder {
            val view = layoutInflater.inflate(R.layout.cast_item, parent, false)
            return CastViewHolder(view)
        }
        
        override fun onBindViewHolder(holder: CastViewHolder, position: Int) {
            val member = cast[position]
            holder.castName.text = member.name
            
            if (member.profilePath != null) {
                holder.castImage.load("https://image.tmdb.org/t/p/w185${member.profilePath}") {
                    crossfade(true)
                    transformations(CircleCropTransformation())
                    placeholder(R.drawable.sh)
                    error(R.drawable.sh)
                }
            } else {
                holder.castImage.setImageResource(R.drawable.sh)
            }
        }
        
        override fun getItemCount() = cast.size
    }
    */
}
