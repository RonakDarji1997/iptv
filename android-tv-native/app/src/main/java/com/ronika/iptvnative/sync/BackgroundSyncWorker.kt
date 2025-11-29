package com.ronika.iptvnative.sync

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.ronika.iptvnative.database.AppDatabase
import com.ronika.iptvnative.database.entities.MovieEntity
import com.ronika.iptvnative.database.entities.SeriesEntity
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import java.util.UUID

class BackgroundSyncWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {
    
    companion object {
        private const val TAG = "BackgroundSync"
        private const val PARALLEL_WORKERS = 150
        private const val BATCH_INSERT_SIZE = 100
    }
    
    override suspend fun doWork(): Result {
        val categoryId = inputData.getString("categoryId") ?: return Result.failure()
        val categoryExternalId = inputData.getString("categoryExternalId") ?: return Result.failure()
        val startPage = inputData.getInt("startPage", 1)
        val totalItems = inputData.getInt("totalItems", 0)
        
        val db = AppDatabase.getDatabase(applicationContext)
        val categoryDao = db.categoryDao()
        val movieDao = db.movieDao()
        val seriesDao = db.seriesDao()
        
        try {
        } catch (e: Exception) {
            Log.e(TAG, "✗ Background sync failed: $categoryExternalId", e)
            return Result.retry()
        }
        // Background syncs have been deprecated. Keep a no-op worker to avoid crashes
        // if any legacy scheduling code accidentally enqueues this worker.
        Log.w(TAG, "BackgroundSyncWorker invoked but background sync is disabled. Returning success.")
        return Result.success()
    }
}
