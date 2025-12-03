package com.ronika.iptvnative.cache

import android.content.Context
import android.util.Log
import android.util.LruCache
import com.ronika.iptvnative.models.Channel
import com.ronika.iptvnative.models.Genre
import com.ronika.iptvnative.models.Movie
import com.ronika.iptvnative.models.Series
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.concurrent.ConcurrentHashMap

/**
 * High-performance caching system for IPTV content
 * Implements aggressive caching for fast UI rendering
 */
class CacheManager private constructor(private val context: Context) {
    
    companion object {
        private val TAG = "CacheManager"
        
        @Volatile
        private var instance: CacheManager? = null
        
        fun getInstance(context: Context): CacheManager {
            return instance ?: synchronized(this) {
                instance ?: CacheManager(context.applicationContext).also { instance = it }
            }
        }
        
        // Cache durations
        const val CACHE_DURATION_SHORT = 5 * 60 * 1000L // 5 minutes
        const val CACHE_DURATION_MEDIUM = 30 * 60 * 1000L // 30 minutes
        const val CACHE_DURATION_LONG = 2 * 60 * 60 * 1000L // 2 hours
        const val CACHE_DURATION_PERSISTENT = 24 * 60 * 60 * 1000L // 24 hours
        
        // Memory cache sizes (in items)
        const val CACHE_SIZE_CATEGORIES = 100
        const val CACHE_SIZE_CHANNELS = 500
        const val CACHE_SIZE_MOVIES = 1000
        const val CACHE_SIZE_SERIES = 1000
        const val CACHE_SIZE_METADATA = 200
    }
    
    /**
     * Cache entry wrapper with timestamp
     */
    private data class CacheEntry<T>(
        val data: T,
        val timestamp: Long = System.currentTimeMillis(),
        val duration: Long = CACHE_DURATION_MEDIUM
    ) {
        fun isValid(): Boolean {
            return (System.currentTimeMillis() - timestamp) < duration
        }
    }
    
    // Memory caches using LruCache for automatic memory management
    private val categoriesCache = LruCache<String, CacheEntry<List<Genre>>>(CACHE_SIZE_CATEGORIES)
    private val channelsCache = LruCache<String, CacheEntry<List<Channel>>>(CACHE_SIZE_CHANNELS)
    private val moviesCache = LruCache<String, CacheEntry<List<Movie>>>(CACHE_SIZE_MOVIES)
    private val seriesCache = LruCache<String, CacheEntry<List<Series>>>(CACHE_SIZE_SERIES)
    private val metadataCache = LruCache<String, CacheEntry<Map<String, Any>>>(CACHE_SIZE_METADATA)
    
    // Concurrent maps for thread-safe access patterns
    private val categoryTypeCache = ConcurrentHashMap<String, String>()
    private val streamUrlCache = ConcurrentHashMap<String, CacheEntry<String>>()
    
    // ==================== Categories ====================
    
    /**
     * Cache categories with persistent duration (loaded on startup)
     */
    fun cacheCategories(key: String, categories: List<Genre>) {
        Log.d(TAG, "Caching ${categories.size} categories with key: $key")
        categoriesCache.put(key, CacheEntry(categories, duration = CACHE_DURATION_PERSISTENT))
    }
    
    /**
     * Get cached categories
     */
    fun getCategories(key: String): List<Genre>? {
        val entry = categoriesCache.get(key)
        return if (entry?.isValid() == true) {
            Log.d(TAG, "Cache HIT for categories: $key")
            entry.data
        } else {
            if (entry != null) {
                Log.d(TAG, "Cache EXPIRED for categories: $key")
                categoriesCache.remove(key)
            } else {
                Log.d(TAG, "Cache MISS for categories: $key")
            }
            null
        }
    }
    
    /**
     * Cache category type (movie/series)
     */
    fun cacheCategoryType(categoryId: String, type: String) {
        categoryTypeCache[categoryId] = type
    }
    
    /**
     * Get cached category type
     */
    fun getCategoryType(categoryId: String): String? {
        return categoryTypeCache[categoryId]
    }
    
    // ==================== Channels ====================
    
    /**
     * Cache channels for a category
     */
    fun cacheChannels(categoryId: String, page: Int, channels: List<Channel>, duration: Long = CACHE_DURATION_LONG) {
        val key = "channels_${categoryId}_$page"
        Log.d(TAG, "Caching ${channels.size} channels for key: $key")
        channelsCache.put(key, CacheEntry(channels, duration = duration))
    }
    
    /**
     * Get cached channels for a category
     */
    fun getChannels(categoryId: String, page: Int): List<Channel>? {
        val key = "channels_${categoryId}_$page"
        val entry = channelsCache.get(key)
        return if (entry?.isValid() == true) {
            Log.d(TAG, "Cache HIT for channels: $key (${entry.data.size} items)")
            entry.data
        } else {
            if (entry != null) {
                Log.d(TAG, "Cache EXPIRED for channels: $key")
                channelsCache.remove(key)
            } else {
                Log.d(TAG, "Cache MISS for channels: $key")
            }
            null
        }
    }
    
    // ==================== Movies ====================
    
    /**
     * Cache movies for a category
     */
    fun cacheMovies(categoryId: String, page: Int, movies: List<Movie>, duration: Long = CACHE_DURATION_LONG) {
        val key = "movies_${categoryId}_$page"
        Log.d(TAG, "Caching ${movies.size} movies for key: $key")
        moviesCache.put(key, CacheEntry(movies, duration = duration))
    }
    
    /**
     * Get cached movies for a category
     */
    fun getMovies(categoryId: String, page: Int): List<Movie>? {
        val key = "movies_${categoryId}_$page"
        val entry = moviesCache.get(key)
        return if (entry?.isValid() == true) {
            Log.d(TAG, "Cache HIT for movies: $key (${entry.data.size} items)")
            entry.data
        } else {
            if (entry != null) {
                Log.d(TAG, "Cache EXPIRED for movies: $key")
                moviesCache.remove(key)
            } else {
                Log.d(TAG, "Cache MISS for movies: $key")
            }
            null
        }
    }
    
    // ==================== Series ====================
    
    /**
     * Cache series for a category
     */
    fun cacheSeries(categoryId: String, page: Int, series: List<Series>, duration: Long = CACHE_DURATION_LONG) {
        val key = "series_${categoryId}_$page"
        Log.d(TAG, "Caching ${series.size} series for key: $key")
        seriesCache.put(key, CacheEntry(series, duration = duration))
    }
    
    /**
     * Get cached series for a category
     */
    fun getSeries(categoryId: String, page: Int): List<Series>? {
        val key = "series_${categoryId}_$page"
        val entry = seriesCache.get(key)
        return if (entry?.isValid() == true) {
            Log.d(TAG, "Cache HIT for series: $key (${entry.data.size} items)")
            entry.data
        } else {
            if (entry != null) {
                Log.d(TAG, "Cache EXPIRED for series: $key")
                seriesCache.remove(key)
            } else {
                Log.d(TAG, "Cache MISS for series: $key")
            }
            null
        }
    }
    
    // ==================== Metadata ====================
    
    /**
     * Cache movie/series metadata
     */
    fun cacheMetadata(itemId: String, metadata: Map<String, Any>, duration: Long = CACHE_DURATION_LONG) {
        Log.d(TAG, "Caching metadata for item: $itemId")
        metadataCache.put(itemId, CacheEntry(metadata, duration = duration))
    }
    
    /**
     * Get cached metadata
     */
    fun getMetadata(itemId: String): Map<String, Any>? {
        val entry = metadataCache.get(itemId)
        return if (entry?.isValid() == true) {
            Log.d(TAG, "Cache HIT for metadata: $itemId")
            entry.data
        } else {
            if (entry != null) {
                Log.d(TAG, "Cache EXPIRED for metadata: $itemId")
                metadataCache.remove(itemId)
            } else {
                Log.d(TAG, "Cache MISS for metadata: $itemId")
            }
            null
        }
    }
    
    // ==================== Stream URLs ====================
    
    /**
     * Cache stream URL (short duration as they may expire)
     */
    fun cacheStreamUrl(itemId: String, url: String) {
        Log.d(TAG, "Caching stream URL for item: $itemId")
        streamUrlCache[itemId] = CacheEntry(url, duration = CACHE_DURATION_SHORT)
    }
    
    /**
     * Get cached stream URL
     */
    fun getStreamUrl(itemId: String): String? {
        val entry = streamUrlCache[itemId]
        return if (entry?.isValid() == true) {
            Log.d(TAG, "Cache HIT for stream URL: $itemId")
            entry.data
        } else {
            if (entry != null) {
                Log.d(TAG, "Cache EXPIRED for stream URL: $itemId")
                streamUrlCache.remove(itemId)
            } else {
                Log.d(TAG, "Cache MISS for stream URL: $itemId")
            }
            null
        }
    }
    
    // ==================== Cache Management ====================
    
    /**
     * Clear all caches
     */
    fun clearAll() {
        Log.d(TAG, "Clearing all caches")
        categoriesCache.evictAll()
        channelsCache.evictAll()
        moviesCache.evictAll()
        seriesCache.evictAll()
        metadataCache.evictAll()
        categoryTypeCache.clear()
        streamUrlCache.clear()
    }
    
    /**
     * Clear caches for a specific category
     */
    fun clearCategory(categoryId: String) {
        Log.d(TAG, "Clearing cache for category: $categoryId")
        
        // Remove from channels cache
        val channelKeys = mutableListOf<String>()
        channelsCache.snapshot().keys.forEach { key ->
            if (key.startsWith("channels_$categoryId")) {
                channelKeys.add(key)
            }
        }
        channelKeys.forEach { channelsCache.remove(it) }
        
        // Remove from movies cache
        val movieKeys = mutableListOf<String>()
        moviesCache.snapshot().keys.forEach { key ->
            if (key.startsWith("movies_$categoryId")) {
                movieKeys.add(key)
            }
        }
        movieKeys.forEach { moviesCache.remove(it) }
        
        // Remove from series cache
        val seriesKeys = mutableListOf<String>()
        seriesCache.snapshot().keys.forEach { key ->
            if (key.startsWith("series_$categoryId")) {
                seriesKeys.add(key)
            }
        }
        seriesKeys.forEach { seriesCache.remove(it) }
        
        // Remove category type
        categoryTypeCache.remove(categoryId)
    }
    
    /**
     * Get cache statistics
     */
    fun getCacheStats(): CacheStats {
        return CacheStats(
            categoriesCount = categoriesCache.size(),
            channelsCount = channelsCache.size(),
            moviesCount = moviesCache.size(),
            seriesCount = seriesCache.size(),
            metadataCount = metadataCache.size(),
            streamUrlsCount = streamUrlCache.size
        )
    }
    
    data class CacheStats(
        val categoriesCount: Int,
        val channelsCount: Int,
        val moviesCount: Int,
        val seriesCount: Int,
        val metadataCount: Int,
        val streamUrlsCount: Int
    )
    
    /**
     * Preload cache in background
     * Call this on app startup
     */
    suspend fun warmupCache() {
        withContext(Dispatchers.IO) {
            Log.d(TAG, "Starting cache warmup...")
            // Cache warmup logic will be implemented by components
            Log.d(TAG, "Cache warmup complete")
        }
    }
}
