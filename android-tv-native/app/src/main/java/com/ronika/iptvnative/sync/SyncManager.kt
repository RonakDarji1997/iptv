package com.ronika.iptvnative.sync

import android.content.Context
import android.util.Log
import androidx.work.*
import com.ronika.iptvnative.api.ApiClient
import com.ronika.iptvnative.api.ApiCredentials
import com.ronika.iptvnative.api.ChannelsRequest
import com.ronika.iptvnative.api.GenreRequest
import com.ronika.iptvnative.api.MoviesRequest
import com.ronika.iptvnative.database.AppDatabase
import com.ronika.iptvnative.database.entities.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import java.util.UUID
import java.util.concurrent.TimeUnit

/**
 * SyncManager (deprecated)
 *
 * This project switched from an offline-first sync approach to direct live API calls.
 * The original SyncManager implementation has been intentionally disabled to avoid
 * accidental background sync runs. If you still need full sync functionality, restore
 * the original implementation from git history.
 */
@Deprecated("Sync disabled — use direct API calls via ApiClient instead")
class SyncManager(private val context: Context) {
    
    companion object {
        private const val TAG = "SyncManager"
        private const val PARALLEL_WORKERS = 150
        private const val INITIAL_ITEMS_PER_CATEGORY = 1000
        private const val BATCH_INSERT_SIZE = 100
    }
    
    private val database = AppDatabase.getDatabase(context)
    private val userDao = database.userDao()
    private val categoryDao = database.categoryDao()
    private val channelDao = database.channelDao()
    private val movieDao = database.movieDao()
    private val seriesDao = database.seriesDao()
    
    private var progressCallback: ((SyncProgress) -> Unit)? = null
    private var isSyncing = false
    
    data class SyncProgress(
        val phase: String, // "categories", "channels", "movies", "series"
        val currentItem: Int,
        val totalItems: Int,
        val message: String,
        val percentage: Int
    )
    
    fun setProgressCallback(callback: (SyncProgress) -> Unit) {
        progressCallback = callback
    }
    
    suspend fun performSync(): Result<String> = withContext(Dispatchers.IO) {
        // Intentionally disabled.
        Log.w(TAG, "DEPRECATED: performSync called but sync is disabled in this build.")
        return@withContext Result.failure(Exception("Sync disabled — app now uses live API calls via ApiClient"))
    }
    
    private suspend fun syncCategories() {
        try {
            // Fetch LIVE TV genres
            val genresResponse = ApiClient.apiService.getGenres(
                GenreRequest(
                    mac = ApiClient.macAddress,
                    url = ApiClient.portalUrl
                )
            )
            
            val liveCategories = genresResponse.genres.mapNotNull { genre ->
                if (genre.id.startsWith("*")) {
                    Log.d(TAG, "Skipping 'All' category")
                    return@mapNotNull null
                }
                
                val categoryName = genre.title ?: genre.name ?: "Unknown"
                val categoryAlias = genre.alias ?: categoryName
                
                CategoryEntity(
                    id = UUID.randomUUID().toString(),
                    externalId = genre.id,
                    name = categoryName,
                    alias = categoryAlias,
                    censored = genre.censored ?: 0,
                    type = "LIVE",
                    itemCount = 0
                )
            }
            
            // Fetch Movie categories
            val movieCategoriesResponse = ApiClient.apiService.getMovieCategories(
                ApiCredentials(
                    mac = ApiClient.macAddress,
                    url = ApiClient.portalUrl
                )
            )
            
            val movieCategories = movieCategoriesResponse.categories.mapNotNull { category ->
                if (category.id.startsWith("*")) return@mapNotNull null
                
                val categoryName = category.title ?: category.name ?: "Unknown"
                val categoryAlias = category.alias ?: categoryName
                
                Log.d(TAG, "Adding MOVIE category: id=${category.id}, name=$categoryName")
                
                CategoryEntity(
                    id = UUID.randomUUID().toString(),
                    externalId = category.id,
                    name = categoryName,
                    alias = categoryAlias,
                    censored = category.censored ?: 0,
                    type = "VOD", // Will be updated to MOVIE after detection
                    itemCount = 0
                )
            }
            
            // Fetch Series categories
            val seriesCategoriesResponse = ApiClient.apiService.getSeriesCategories(
                ApiCredentials(
                    mac = ApiClient.macAddress,
                    url = ApiClient.portalUrl
                )
            )
            
            val seriesCategories = seriesCategoriesResponse.categories.mapNotNull { category ->
                if (category.id.startsWith("*")) return@mapNotNull null
                
                val categoryName = category.title ?: category.name ?: "Unknown"
                val categoryAlias = category.alias ?: categoryName
                
                Log.d(TAG, "Adding SERIES category: id=${category.id}, name=$categoryName")
                
                CategoryEntity(
                    id = UUID.randomUUID().toString(),
                    externalId = category.id,
                    name = categoryName,
                    alias = categoryAlias,
                    censored = category.censored ?: 0,
                    type = "VOD", // Will be updated to SERIES after detection
                    itemCount = 0
                )
            }
            
            val allCategories = liveCategories + movieCategories + seriesCategories
            categoryDao.insertAll(allCategories)
            
            Log.d(TAG, "✓ Synced ${allCategories.size} categories (${liveCategories.size} LIVE, ${movieCategories.size} MOVIE, ${seriesCategories.size} SERIES)")
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to sync categories: ${e.message}", e)
            throw e
        }
    }
    
    private suspend fun syncChannels() {
        try {
            // Check if already synced
            val existingCount = channelDao.getCount()
            if (existingCount > 0) {
                Log.d(TAG, "✓ Channels already synced ($existingCount channels), skipping...")
                return
            }
            
            val liveCategories = categoryDao.getCategoriesByType("LIVE")
            var totalChannels = 0
            var processedCategories = 0
            
            for (category in liveCategories) {
                processedCategories++
                notifyProgress(SyncProgress(
                    "channels",
                    processedCategories,
                    liveCategories.size,
                    "Syncing channels: ${category.name}",
                    20 + (processedCategories * 20 / liveCategories.size)
                ))
                
                try {
                    var page = 1
                    var hasMore = true
                    
                    while (hasMore) {
                        val response = ApiClient.apiService.getChannels(
                            ChannelsRequest(
                                mac = ApiClient.macAddress,
                                url = ApiClient.portalUrl,
                                genre = category.externalId,
                                page = page
                            )
                        )
                        
                        val channels = response.channels.data.map { ch ->
                            ChannelEntity(
                                id = UUID.randomUUID().toString(),
                                externalId = ch.id,
                                name = ch.name ?: "Unknown",
                                number = ch.number,
                                logo = ch.logo,
                                cmd = ch.cmd,
                                categoryId = category.id,
                                categoryName = category.name
                            )
                        }
                        
                        channelDao.insertAll(channels)
                        totalChannels += channels.size
                        
                        // Check if there are more pages
                        hasMore = channels.size >= 14 && page < 10 // Limit to 10 pages per category
                        page++
                    }
                    
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to sync channels for category ${category.name}: ${e.message}")
                }
            }
            
            Log.d(TAG, "Synced $totalChannels channels across ${liveCategories.size} categories")
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to sync channels: ${e.message}", e)
            throw e
        }
    }
    
    private suspend fun syncMovies() {
        try {
            val vodCategories = categoryDao.getCategoriesByType("VOD")
            var totalMovies = 0
            var totalSeries = 0
            
            Log.d(TAG, "═══════════════════════════════════════════════")
            Log.d(TAG, "→ VOD QUICK SYNC START: ${vodCategories.size} categories")
            Log.d(TAG, "→ MODE: Max $INITIAL_ITEMS_PER_CATEGORY items per category")
            Log.d(TAG, "═══════════════════════════════════════════════")
            
            // Process each category
            vodCategories.forEachIndexed { index, category ->
                val categoryNum = index + 1
                
                // Check if category already synced
                val existingMoviesInCategory = movieDao.getCountByCategory(category.id)
                val existingSeriesInCategory = seriesDao.getCountByCategory(category.id)
                val categoryAlreadySynced = existingMoviesInCategory > 0 || existingSeriesInCategory > 0
                
                if (categoryAlreadySynced) {
                    Log.d(TAG, "│")
                    Log.d(TAG, "├─[$categoryNum/${vodCategories.size}] ${category.name} (id=${category.externalId})")
                    Log.d(TAG, "│  ✓ Already synced (${existingMoviesInCategory}M + ${existingSeriesInCategory}S), skipping")
                    totalMovies += existingMoviesInCategory
                    totalSeries += existingSeriesInCategory
                    return@forEachIndexed
                }
                
                Log.d(TAG, "│")
                Log.d(TAG, "├─[$categoryNum/${vodCategories.size}] ${category.name} (id=${category.externalId})")
                Log.d(TAG, "│  → Fetching page 1...")
                    
                    try {
                        // Fetch first page to get total_items
                        val firstPageResponse = ApiClient.apiService.getMovies(
                            MoviesRequest(
                                mac = ApiClient.macAddress,
                                url = ApiClient.portalUrl,
                                category = category.externalId,
                                page = 1
                            )
                        )
                        
                        val totalItems = firstPageResponse.items.total
                        val itemsPerPage = firstPageResponse.items.data.size
                        
                        if (itemsPerPage <= 0) {
                            Log.d(TAG, "│  ✗ Empty category, skipping")
                            return@forEachIndexed
                        }
                        
                        // Limit to first 1000 items for quick sync
                        val maxItems = minOf(totalItems, INITIAL_ITEMS_PER_CATEGORY)
                        val quickSyncPages = (maxItems + itemsPerPage - 1) / itemsPerPage
                        val totalPages = (totalItems + itemsPerPage - 1) / itemsPerPage
                        val hasMoreItems = totalItems > INITIAL_ITEMS_PER_CATEGORY
                        
                        Log.d(TAG, "│  ← Response: $totalItems items, syncing first $maxItems ($quickSyncPages pages)")
                        if (hasMoreItems) {
                            Log.d(TAG, "│  ℹ️  Remaining ${totalItems - maxItems} items → background sync")
                        }
                        
                        // Detect type from first item
                        val firstItem = firstPageResponse.items.data.firstOrNull()
                        val detectedType = if (firstItem?.isSeries == "1") "SERIES" else "MOVIE"
                        Log.d(TAG, "│  ✓ Type: $detectedType (is_series=${firstItem?.isSeries})")
                        
                        var categoryMovies = 0
                        var categorySeries = 0
                        
                        // Batch buffers
                        val moviesBatch = mutableListOf<MovieEntity>()
                        val seriesBatch = mutableListOf<SeriesEntity>()
                        
                        // Process first page items
                        firstPageResponse.items.data.forEach { item ->
                            if (item.isSeries == "1") {
                                seriesBatch.add(SeriesEntity(
                                    id = UUID.randomUUID().toString(),
                                    externalId = item.id,
                                    name = item.name ?: "Unknown",
                                    originalName = item.originalName,
                                    description = item.description,
                                    poster = item.screenshotUri,
                                    year = item.year,
                                    director = item.director,
                                    actors = item.actors,
                                    genres = item.genresStr,
                                    ratingImdb = item.ratingImdb?.toFloatOrNull(),
                                    episodeCount = 0,
                                    categoryId = category.id,
                                    categoryName = category.name,
                                    seasonsJson = null
                                ))
                                categorySeries++
                            } else {
                                moviesBatch.add(MovieEntity(
                                    id = UUID.randomUUID().toString(),
                                    externalId = item.id,
                                    name = item.name ?: "Unknown",
                                    originalName = item.originalName,
                                    description = item.description,
                                    poster = item.screenshotUri,
                                    year = item.year,
                                    director = item.director,
                                    actors = item.actors,
                                    genres = item.genresStr,
                                    ratingImdb = item.ratingImdb?.toFloatOrNull(),
                                    duration = item.duration?.toIntOrNull(),
                                    cmd = item.cmd,
                                    categoryId = category.id,
                                    categoryName = category.name
                                ))
                                categoryMovies++
                            }
                        }
                        
                        // Fetch remaining pages (up to 1000 items total)
                        if (quickSyncPages > 1) {
                            (2..quickSyncPages).chunked(PARALLEL_WORKERS).forEach { pageChunk ->
                            coroutineScope {
                                val responses = pageChunk.map { page ->
                                    async {
                                        ApiClient.apiService.getMovies(
                                            MoviesRequest(
                                                mac = ApiClient.macAddress,
                                                url = ApiClient.portalUrl,
                                                category = category.externalId,
                                                page = page
                                            )
                                        )
                                    }
                                }.awaitAll()
                                
                                Log.d(TAG, "│  ⚡ Fetched ${responses.size} pages in parallel")
                                
                                responses.forEach { pageResponse ->
                                    pageResponse.items.data.forEach { item ->
                                        if (item.isSeries == "1") {
                                            seriesBatch.add(SeriesEntity(
                                            id = UUID.randomUUID().toString(),
                                            externalId = item.id,
                                            name = item.name ?: "Unknown",
                                            originalName = item.originalName,
                                            description = item.description,
                                            poster = item.screenshotUri,
                                            year = item.year,
                                            director = item.director,
                                            actors = item.actors,
                                            genres = item.genresStr,
                                            ratingImdb = item.ratingImdb?.toFloatOrNull(),
                                            episodeCount = 0,
                                            categoryId = category.id,
                                            categoryName = category.name,
                                            seasonsJson = null
                                            ))
                                            categorySeries++
                                        } else {
                                            moviesBatch.add(MovieEntity(
                                                id = UUID.randomUUID().toString(),
                                                externalId = item.id,
                                                name = item.name ?: "Unknown",
                                                originalName = item.originalName,
                                                description = item.description,
                                                poster = item.screenshotUri,
                                                year = item.year,
                                                director = item.director,
                                                actors = item.actors,
                                                genres = item.genresStr,
                                                ratingImdb = item.ratingImdb?.toFloatOrNull(),
                                                duration = item.duration?.toIntOrNull(),
                                                cmd = item.cmd,
                                                categoryId = category.id,
                                                categoryName = category.name
                                            ))
                                            categoryMovies++
                                        }
                                        
                                        // Batch insert every 100 items
                                        if (moviesBatch.size >= BATCH_INSERT_SIZE) {
                                            movieDao.insertAll(moviesBatch.toList())
                                            moviesBatch.clear()
                                        }
                                        if (seriesBatch.size >= BATCH_INSERT_SIZE) {
                                            seriesDao.insertAll(seriesBatch.toList())
                                            seriesBatch.clear()
                                        }
                                    }
                                }
                            }
                        }
                        }
                        
                        // Insert remaining items in batches
                        if (moviesBatch.isNotEmpty()) {
                            movieDao.insertAll(moviesBatch)
                        }
                        if (seriesBatch.isNotEmpty()) {
                            seriesDao.insertAll(seriesBatch)
                        }
                        
                        totalMovies += categoryMovies
                        totalSeries += categorySeries
                        
                        // Update category type
                        categoryDao.updateCategoryType(category.id, detectedType)
                        Log.d(TAG, "│  ✓ Saved ${categoryMovies}M + ${categorySeries}S → Type: $detectedType")
                        
                        // Schedule background sync for remaining items
                        if (hasMoreItems) {
                            scheduleBackgroundSync(category.id, category.externalId, quickSyncPages + 1, totalItems)
                        }
                        
                    } catch (e: Exception) {
                        Log.e(TAG, "│  ✗ ERROR: ${e.message}")
                    }
            }
            
            Log.d(TAG, "═══════════════════════════════════════════════")
            Log.d(TAG, "✓ VOD quick sync complete ($totalMovies movies, $totalSeries series)")
            Log.d(TAG, "ℹ️  Background workers will complete remaining items")
            Log.d(TAG, "═══════════════════════════════════════════════")
            
        } catch (e: Exception) {
            Log.e(TAG, "✗ ERROR: Failed to sync VOD: ${e.message}", e)
            throw e
        }
    }
    
    private suspend fun syncSeries() {
        // Series are now synced together with movies in syncMovies()
        Log.d(TAG, "✓ Series sync completed (processed with movies)")
    }
    
    private fun scheduleBackgroundSync(categoryId: String, categoryExternalId: String, startPage: Int, totalItems: Int) {
        val workRequest = OneTimeWorkRequestBuilder<BackgroundSyncWorker>()
            .setInputData(
                workDataOf(
                    "categoryId" to categoryId,
                    "categoryExternalId" to categoryExternalId,
                    "startPage" to startPage,
                    "totalItems" to totalItems
                )
            )
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build()
            )
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 1, TimeUnit.MINUTES)
            .addTag("background_vod_sync_$categoryId")
            .build()
        
        WorkManager.getInstance(context).enqueueUniqueWork(
            "sync_category_$categoryId",
            ExistingWorkPolicy.KEEP,
            workRequest
        )
        
        Log.d(TAG, "│  ⏰ Background sync scheduled (${totalItems - INITIAL_ITEMS_PER_CATEGORY} items remaining)")
    }
    
    private fun notifyProgress(progress: SyncProgress) {
        progressCallback?.invoke(progress)
    }
}
