package com.ronika.iptvnative.sync

import android.content.Context
import android.util.Log
import androidx.work.*
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
        // Deprecated - sync disabled
        Log.d(TAG, "syncCategories: Sync disabled")
    }
    
    private suspend fun syncChannels() {
        // Deprecated - sync disabled
        Log.d(TAG, "syncChannels: Sync disabled")
    }
    
    private suspend fun syncMovies() {
        // Deprecated - sync disabled
        Log.d(TAG, "syncMovies: Sync disabled")
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
