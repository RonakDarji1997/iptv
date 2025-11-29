package com.ronika.iptvnative.managers

import android.content.Context
import com.ronika.iptvnative.models.Channel
import com.ronika.iptvnative.models.Genre
import com.ronika.iptvnative.models.Movie
import com.ronika.iptvnative.models.Series
import kotlinx.coroutines.CoroutineScope

class ContentManager(
    private val context: Context,
    private val scope: CoroutineScope
) {
    
    // Direct Stalker client for VOD (no backend, no DB, no handshake)
    private val stalkerClient: com.ronika.iptvnative.api.StalkerClient by lazy {
        com.ronika.iptvnative.api.StalkerClient(
            portalUrl = "http://tv.stream4k.cc/stalker_portal/server/load.php",
            macAddress = "00:1a:79:17:f4:f5"
        )
    }
    
    // Data storage
    val allChannels = mutableListOf<Channel>()
    val allMovies = mutableListOf<Movie>()
    val allSeries = mutableListOf<Series>()
    
    // Pagination
    var currentPage = 1
    var hasMorePages = true
    var isLoadingMore = false
    
    suspend fun loadGenres(tab: String): Result<List<Genre>> {
        return try {
            android.util.Log.d("ContentManager", "Loading genres for tab: $tab")
            val response = stalkerClient.getVodCategories(type = "vod")
            
            if (response.genres != null) {
                android.util.Log.d("ContentManager", "Loaded ${response.genres.size} genres")
                Result.success(response.genres)
            } else {
                android.util.Log.e("ContentManager", "No genres in response")
                Result.failure(Exception("No genres found"))
            }
        } catch (e: Exception) {
            android.util.Log.e("ContentManager", "Error loading genres", e)
            Result.failure(e)
        }
    }
    
    suspend fun loadChannels(genreId: String): Result<List<Channel>> {
        return try {
            android.util.Log.d("ContentManager", "Loading channels for genre: $genreId")
            
            val response = stalkerClient.getChannels(genreId = genreId, page = 1)
            
            if (response.channels != null && response.channels.data != null) {
                allChannels.clear()
                allChannels.addAll(response.channels.data)
                android.util.Log.d("ContentManager", "Loaded ${response.channels.data.size} channels")
                Result.success(response.channels.data)
            } else {
                android.util.Log.e("ContentManager", "No channels in response")
                Result.failure(Exception("No channels found"))
            }
        } catch (e: Exception) {
            android.util.Log.e("ContentManager", "Error loading channels", e)
            Result.failure(e)
        }
    }
    
    suspend fun loadMovies(categoryId: String, page: Int = 1): Result<List<Movie>> {
        return try {
            android.util.Log.d("ContentManager", "Loading movies - category: $categoryId, page: $page")

            val response = stalkerClient.getVodItems(categoryId, page, "vod")

            if (response.items != null && response.items.data != null) {
                if (page == 1) {
                    allMovies.clear()
                }
                allMovies.addAll(response.items.data)

                hasMorePages = response.items.data.size >= 20
                android.util.Log.d("ContentManager", "Loaded ${response.items.data.size} movies, hasMorePages: $hasMorePages")
                Result.success(response.items.data)
            } else {
                android.util.Log.e("ContentManager", "No movies in response")
                Result.failure(Exception("No movies found"))
            }
        } catch (e: Exception) {
            android.util.Log.e("ContentManager", "Error loading movies", e)
            Result.failure(e)
        }
    }
    
    suspend fun loadSeries(categoryId: String, page: Int = 1): Result<List<Series>> {
        return try {
            android.util.Log.d("ContentManager", "Loading series - category: $categoryId, page: $page")

            val response = stalkerClient.getVodItems(categoryId, page, "series")

            if (response.items != null && response.items.data != null) {
                val seriesList = response.items.data.map { movie ->
                    Series(
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
                        totalEpisodes = movie.duration
                    )
                }

                if (page == 1) {
                    allSeries.clear()
                }
                allSeries.addAll(seriesList)

                hasMorePages = seriesList.size >= 20
                android.util.Log.d("ContentManager", "Loaded ${seriesList.size} series, hasMorePages: $hasMorePages")
                Result.success(seriesList)
            } else {
                android.util.Log.e("ContentManager", "No series in response")
                Result.failure(Exception("No series found"))
            }
        } catch (e: Exception) {
            android.util.Log.e("ContentManager", "Error loading series", e)
            Result.failure(e)
        }
    }
    
    fun resetPagination() {
        currentPage = 1
        hasMorePages = true
        isLoadingMore = false
    }
    
    fun clearAll() {
        allChannels.clear()
        allMovies.clear()
        allSeries.clear()
        resetPagination()
    }
}
