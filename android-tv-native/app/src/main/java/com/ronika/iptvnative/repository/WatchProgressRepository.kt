package com.ronika.iptvnative.repository

import android.content.Context
import android.util.Log
import com.ronika.iptvnative.database.WatchProgress
import com.ronika.iptvnative.database.WatchProgressDatabase
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class WatchProgressRepository(context: Context) {
    private val watchProgressDao = WatchProgressDatabase.getDatabase(context).watchProgressDao()
    
    companion object {
        private const val TAG = "WatchProgressRepository"
    }
    
    suspend fun saveProgress(
        contentId: String,
        contentType: String,
        providerId: String,
        title: String,
        posterUrl: String?,
        currentPosition: Long,
        duration: Long,
        cmd: String,
        episodeId: String? = null,
        episodeNumber: Int? = null,
        seasonNumber: Int? = null
    ) {
        withContext(Dispatchers.IO) {
            // Only save if watched more than 5% and less than 95%
            val percentage: Int = if (duration > 0) {
                ((currentPosition * 100) / duration).toInt()
            } else {
                0
            }
            
            when {
                percentage in 5..95 -> {
                    Log.d(TAG, "Saving progress: $title ($contentType, provider=$providerId) - $percentage% watched")
                    // Check if entry exists
                    val existing = if (episodeId != null) {
                        watchProgressDao.getEpisodeProgress(contentId, episodeId, providerId)
                    } else {
                        watchProgressDao.getProgress(contentId, contentType, providerId)
                    }
                    
                    Log.d(TAG, "Existing entry found: ${existing != null}")
                    
                    val progress = if (existing != null) {
                        // Update existing entry with same id
                        existing.copy(
                            title = title,
                            posterUrl = posterUrl,
                            currentPosition = currentPosition,
                            duration = duration,
                            lastWatched = System.currentTimeMillis(),
                            cmd = cmd
                        )
                    } else {
                        // Create new entry
                        WatchProgress(
                            contentId = contentId,
                            contentType = contentType,
                            providerId = providerId,
                            title = title,
                            posterUrl = posterUrl,
                            episodeId = episodeId,
                            episodeNumber = episodeNumber,
                            seasonNumber = seasonNumber,
                            currentPosition = currentPosition,
                            duration = duration,
                            lastWatched = System.currentTimeMillis(),
                            cmd = cmd
                        )
                    }
                    val insertedId = watchProgressDao.insertProgress(progress)
                    Log.d(TAG, "Progress saved with ID: $insertedId")
                }
                percentage >= 95 -> {
                    // If watched more than 95%, remove from continue watching
                    if (episodeId != null) {
                        val existing = watchProgressDao.getEpisodeProgress(contentId, episodeId, providerId)
                        existing?.let { watchProgressDao.deleteProgressById(it.id) }
                    } else {
                        watchProgressDao.deleteProgress(contentId)
                    }
                }
                else -> {
                    // Less than 5%, don't save
                }
            }
        }
    }
    
    suspend fun getProgress(contentId: String, contentType: String, providerId: String): WatchProgress? = 
        withContext(Dispatchers.IO) {
            watchProgressDao.getProgress(contentId, contentType, providerId)
        }
    
    suspend fun getEpisodeProgress(contentId: String, episodeId: String, providerId: String): WatchProgress? =
        withContext(Dispatchers.IO) {
            watchProgressDao.getEpisodeProgress(contentId, episodeId, providerId)
        }
    
    suspend fun getContinueWatchingMovies(providerId: String, limit: Int = 20): List<WatchProgress> =
        withContext(Dispatchers.IO) {
            val movies = watchProgressDao.getProgressByType("MOVIE", providerId, limit)
            Log.d(TAG, "Retrieved ${movies.size} Continue Watching movies from DB for provider $providerId")
            movies.forEach { 
                Log.d(TAG, "  - ${it.title}: ${it.progressPercentage}% (${it.contentId})") 
            }
            movies
        }
    
    suspend fun getContinueWatchingSeries(providerId: String, limit: Int = 20): List<WatchProgress> =
        withContext(Dispatchers.IO) {
            // Get only one entry per series (latest watched episode)
            watchProgressDao.getLatestSeriesProgress(providerId, limit)
        }
    
    suspend fun getAllContinueWatching(): List<WatchProgress> =
        withContext(Dispatchers.IO) {
            watchProgressDao.getAllProgress()
        }
    
    suspend fun deleteProgress(contentId: String) {
        withContext(Dispatchers.IO) {
            watchProgressDao.deleteProgress(contentId)
        }
    }
    
    suspend fun deleteProgressById(id: Long) {
        withContext(Dispatchers.IO) {
            watchProgressDao.deleteProgressById(id)
        }
    }
    
    // Clean up entries older than 30 days
    suspend fun cleanOldProgress() {
        withContext(Dispatchers.IO) {
            val thirtyDaysAgo = System.currentTimeMillis() - (30L * 24 * 60 * 60 * 1000)
            watchProgressDao.deleteOldProgress(thirtyDaysAgo)
        }
    }
}
