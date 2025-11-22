package com.ronika.iptvnative.managers

import android.content.Context
import android.view.View
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.content.ContextCompat
import coil.load
import com.ronika.iptvnative.R
import com.ronika.iptvnative.models.Channel
import com.ronika.iptvnative.models.Movie
import com.ronika.iptvnative.models.Series
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class UIManager(
    private val context: Context,
    private val contentTitle: TextView,
    private val contentSubtitle: TextView,
    private val emptyStateMessage: TextView,
    private val loadingIndicator: ProgressBar,
    private val previewPanel: ScrollView,
    private val movieDetailsHeaderGrid: LinearLayout,
    private val movieDetailsHeader: LinearLayout
) {
    
    // Preview panel views
    private lateinit var previewPoster: ImageView
    private lateinit var previewChannelName: TextView
    private lateinit var previewTime: TextView
    private lateinit var previewProgramInfo: TextView
    private lateinit var previewYear: TextView
    private lateinit var previewRating: TextView
    private lateinit var previewDuration: TextView
    private lateinit var previewGenres: TextView
    private lateinit var previewDescription: TextView
    private lateinit var previewActors: TextView
    private lateinit var previewDirector: TextView
    
    // Grid header views
    private lateinit var detailPosterGrid: ImageView
    private lateinit var detailPosterTextGrid: TextView
    private lateinit var detailTitleGrid: TextView
    private lateinit var detailYearGrid: TextView
    private lateinit var detailDurationGrid: TextView
    private lateinit var detailGenreGrid: TextView
    private lateinit var detailCastGrid: TextView
    private lateinit var detailDirectorGrid: TextView
    private lateinit var detailDescriptionGrid: TextView
    
    // Overlay views
    private lateinit var detailPoster: ImageView
    private lateinit var detailPosterText: TextView
    private lateinit var detailTitle: TextView
    private lateinit var detailYear: TextView
    private lateinit var detailDuration: TextView
    private lateinit var detailGenre: TextView
    private lateinit var detailCast: TextView
    private lateinit var detailDirector: TextView
    private lateinit var detailDescription: TextView
    
    private val baseUrl = "http://192.168.2.69:2005"
    
    fun initializePreviewViews(
        poster: ImageView, channelName: TextView, time: TextView, programInfo: TextView,
        year: TextView, rating: TextView, duration: TextView, genres: TextView,
        description: TextView, actors: TextView, director: TextView
    ) {
        previewPoster = poster
        previewChannelName = channelName
        previewTime = time
        previewProgramInfo = programInfo
        previewYear = year
        previewRating = rating
        previewDuration = duration
        previewGenres = genres
        previewDescription = description
        previewActors = actors
        previewDirector = director
    }
    
    fun initializeGridViews(
        poster: ImageView, posterText: TextView, title: TextView,
        year: TextView, duration: TextView, genre: TextView,
        cast: TextView, director: TextView, description: TextView
    ) {
        detailPosterGrid = poster
        detailPosterTextGrid = posterText
        detailTitleGrid = title
        detailYearGrid = year
        detailDurationGrid = duration
        detailGenreGrid = genre
        detailCastGrid = cast
        detailDirectorGrid = director
        detailDescriptionGrid = description
    }
    
    fun initializeOverlayViews(
        poster: ImageView, posterText: TextView, title: TextView,
        year: TextView, duration: TextView, genre: TextView,
        cast: TextView, director: TextView, description: TextView
    ) {
        detailPoster = poster
        detailPosterText = posterText
        detailTitle = title
        detailYear = year
        detailDuration = duration
        detailGenre = genre
        detailCast = cast
        detailDirector = director
        detailDescription = description
    }
    
    fun updateContentHeader(title: String, subtitle: String) {
        contentTitle.text = title
        contentSubtitle.text = subtitle
    }
    
    fun showLoading(show: Boolean) {
        loadingIndicator.visibility = if (show) View.VISIBLE else View.GONE
    }
    
    fun showEmptyState(show: Boolean, message: String = "No content available") {
        emptyStateMessage.visibility = if (show) View.VISIBLE else View.GONE
        emptyStateMessage.text = message
    }
    
    fun hideAllDetails() {
        previewPanel.visibility = View.GONE
        movieDetailsHeaderGrid.visibility = View.GONE
        movieDetailsHeader.visibility = View.GONE
    }
    
    fun showChannelPreview(channel: Channel) {
        previewPanel.visibility = View.VISIBLE
        
        // Update preview details
        previewChannelName.text = channel.name
        previewTime.text = getCurrentTimeString()
        previewProgramInfo.text = "Live TV"
        
        // Load channel logo
        val logoUrl = buildChannelLogoUrl(channel.logo)
        if (logoUrl != null) {
            previewPoster.load(logoUrl) {
                crossfade(200)
                placeholder(android.R.drawable.ic_menu_gallery)
                error(android.R.drawable.ic_menu_gallery)
            }
        } else {
            previewPoster.setImageResource(android.R.drawable.ic_menu_gallery)
        }
        
        // Hide movie-specific fields
        previewYear.visibility = View.GONE
        previewRating.visibility = View.GONE
        previewDuration.visibility = View.GONE
        previewGenres.visibility = View.GONE
        previewDescription.visibility = View.GONE
        previewActors.visibility = View.GONE
        previewDirector.visibility = View.GONE
    }
    
    fun showMoviePreview(
        channel: Channel,
        movie: Movie?,
        series: Series?,
        selectedTab: String
    ) {
        movieDetailsHeaderGrid.visibility = View.VISIBLE
        
        // Update title
        detailTitleGrid.text = channel.name
        
        // Load poster
        val imageUrl = movie?.getImageUrl() ?: series?.getImageUrl()
        val finalImageUrl = buildImageUrl(imageUrl)
        if (finalImageUrl != null) {
            detailPosterGrid.visibility = View.VISIBLE
            detailPosterTextGrid.visibility = View.GONE
            detailPosterGrid.load(finalImageUrl) {
                crossfade(200)
                placeholder(android.R.drawable.ic_menu_gallery)
                error(android.R.drawable.ic_menu_gallery)
                listener(
                    onError = { _, _ ->
                        detailPosterGrid.visibility = View.GONE
                        detailPosterTextGrid.visibility = View.VISIBLE
                        detailPosterTextGrid.text = channel.name
                    }
                )
            }
        } else {
            detailPosterGrid.visibility = View.GONE
            detailPosterTextGrid.visibility = View.VISIBLE
            detailPosterTextGrid.text = channel.name
        }
        
        // Year
        val year = movie?.year ?: series?.year
        detailYearGrid.text = year ?: ""
        
        // Duration
        val duration = movie?.duration
        if (!duration.isNullOrEmpty()) {
            val totalMinutes = duration.toIntOrNull() ?: 0
            val hours = totalMinutes / 60
            val mins = totalMinutes % 60
            detailDurationGrid.text = if (hours > 0) "${hours}h ${mins}m" else "${mins}m"
        } else {
            val episodes = series?.totalEpisodes
            detailDurationGrid.text = if (!episodes.isNullOrEmpty()) "$episodes Episodes" else ""
        }
        
        // Genre
        val genresStr = movie?.genresStr ?: series?.genresStr
        val country = movie?.country ?: series?.country
        val genreText = listOfNotNull(country, genresStr).joinToString(" | ")
        detailGenreGrid.text = genreText.ifEmpty { if (selectedTab == "MOVIES") "MOVIES" else "SERIES" }
        
        // Cast
        val actors = movie?.actors ?: series?.actors
        detailCastGrid.text = if (!actors.isNullOrEmpty()) "Cast:    $actors" else ""
        detailCastGrid.visibility = if (!actors.isNullOrEmpty()) View.VISIBLE else View.GONE
        
        // Director
        val director = movie?.director ?: series?.director
        detailDirectorGrid.text = if (!director.isNullOrEmpty()) "Director: $director" else ""
        detailDirectorGrid.visibility = if (!director.isNullOrEmpty()) View.VISIBLE else View.GONE
        
        // Description
        val description = movie?.description ?: series?.description
        detailDescriptionGrid.text = description ?: ""
        detailDescriptionGrid.visibility = if (!description.isNullOrEmpty()) View.VISIBLE else View.GONE
    }
    
    fun showMovieInfoOverlay(
        channel: Channel,
        movie: Movie?,
        series: Series?,
        selectedTab: String,
        onComplete: () -> Unit
    ) {
        // Show the header with full opacity
        movieDetailsHeader.visibility = View.VISIBLE
        movieDetailsHeader.alpha = 1f
        
        // Update all the details
        detailTitle.text = channel.name
        
        // Load poster
        val imageUrl = movie?.getImageUrl() ?: series?.getImageUrl()
        val finalImageUrl = buildImageUrl(imageUrl)
        if (finalImageUrl != null) {
            detailPoster.visibility = View.VISIBLE
            detailPosterText.visibility = View.GONE
            detailPoster.load(finalImageUrl) {
                crossfade(200)
                placeholder(android.R.drawable.ic_menu_gallery)
                error(android.R.drawable.ic_menu_gallery)
                listener(
                    onError = { _, _ ->
                        detailPoster.visibility = View.GONE
                        detailPosterText.visibility = View.VISIBLE
                        detailPosterText.text = channel.name
                    }
                )
            }
        } else {
            detailPoster.visibility = View.GONE
            detailPosterText.visibility = View.VISIBLE
            detailPosterText.text = channel.name
        }
        
        // Year
        val year = movie?.year ?: series?.year
        detailYear.text = year ?: ""
        
        // Duration
        val duration = movie?.duration
        if (!duration.isNullOrEmpty()) {
            val totalMinutes = duration.toIntOrNull() ?: 0
            val hours = totalMinutes / 60
            val mins = totalMinutes % 60
            detailDuration.text = if (hours > 0) "${hours}h ${mins}m" else "${mins}m"
        } else {
            val episodes = series?.totalEpisodes
            detailDuration.text = if (!episodes.isNullOrEmpty()) "$episodes Episodes" else ""
        }
        
        // Genre
        val genresStr = movie?.genresStr ?: series?.genresStr
        val country = movie?.country ?: series?.country
        val genreText = listOfNotNull(country, genresStr).joinToString(" | ")
        detailGenre.text = genreText.ifEmpty { if (selectedTab == "MOVIES") "MOVIES" else "SERIES" }
        
        // Cast
        val actors = movie?.actors ?: series?.actors
        detailCast.text = if (!actors.isNullOrEmpty()) "Cast:    $actors" else ""
        detailCast.visibility = if (!actors.isNullOrEmpty()) View.VISIBLE else View.GONE
        
        // Director
        val director = movie?.director ?: series?.director
        detailDirector.text = if (!director.isNullOrEmpty()) "Director: $director" else ""
        detailDirector.visibility = if (!director.isNullOrEmpty()) View.VISIBLE else View.GONE
        
        // Description
        val description = movie?.description ?: series?.description
        detailDescription.text = description ?: ""
        detailDescription.visibility = if (!description.isNullOrEmpty()) View.VISIBLE else View.GONE
        
        // Auto-hide after 3 seconds with fade animation
        movieDetailsHeader.postDelayed({
            movieDetailsHeader.animate()
                .alpha(0f)
                .setDuration(500)
                .withEndAction {
                    movieDetailsHeader.visibility = View.GONE
                    onComplete()
                }
                .start()
        }, 3000)
    }
    
    private fun buildImageUrl(imagePath: String?): String? {
        if (imagePath.isNullOrEmpty()) return null
        return when {
            imagePath.startsWith("http://") || imagePath.startsWith("https://") -> imagePath
            imagePath.startsWith("/") -> "$baseUrl$imagePath"
            else -> "$baseUrl/$imagePath"
        }
    }
    
    private fun buildChannelLogoUrl(logo: String?): String? {
        if (logo.isNullOrEmpty()) return null
        return when {
            logo.startsWith("http://") || logo.startsWith("https://") -> logo
            logo.startsWith("/") -> "$baseUrl$logo"
            else -> "$baseUrl/$logo"
        }
    }
    
    private fun getCurrentTimeString(): String {
        val sdf = SimpleDateFormat("HH:mm", Locale.getDefault())
        return sdf.format(Date())
    }
}
