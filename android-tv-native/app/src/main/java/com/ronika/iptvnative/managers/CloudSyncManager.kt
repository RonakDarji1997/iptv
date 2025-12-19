package com.ronika.iptvnative.managers

import android.content.Context
import android.util.Log
import com.ronika.iptvnative.api.ApiClient
import com.ronika.iptvnative.database.AppDatabase
import com.ronika.iptvnative.database.WatchProgress
import com.ronika.iptvnative.database.WatchProgressDatabase
import com.ronika.iptvnative.database.entities.FavoriteEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * CloudSyncManager - Handles bidirectional sync between local TV database and cloud backend
 * 
 * Features:
 * - Syncs watch progress (continue watching) and favorites
 * - Falls back to local data when cloud unavailable
 * - Only syncs when cloud is enabled for user
 */
class CloudSyncManager(private val context: Context) {
    
    private val TAG = "CloudSyncManager"
    private val database = AppDatabase.getDatabase(context)
    private val watchProgressDb = WatchProgressDatabase.getDatabase(context)
    private val userDao = database.userDao()
    private val favoriteDao = database.favoriteDao()
    private val watchProgressDao = watchProgressDb.watchProgressDao()
    private val apiClient = ApiClient.getInstance(context)
    
    /**
     * Check if cloud sync is enabled for current user
     */
    suspend fun isCloudEnabled(): Boolean {
        return withContext(Dispatchers.IO) {
            val user = userDao.getCurrentUser()
            user?.cloudEnabled == true
        }
    }
    
    /**
     * Check if subscription features are enabled
     */
    suspend fun isSubscriptionEnabled(): Boolean {
        return withContext(Dispatchers.IO) {
            val user = userDao.getCurrentUser()
            user?.subscriptionEnabled == true
        }
    }
    
    /**
     * Link TV device to cloud account
     * Creates user on backend and updates local user with cloud ID
     */
    suspend fun linkToCloud(
        email: String,
        password: String,
        deviceId: String,
        deviceName: String
    ): Result<CloudLinkResult> {
        return withContext(Dispatchers.IO) {
            try {
                val baseUrl = apiClient.getBaseUrl()
                val url = URL("$baseUrl/api/tv/link-account")
                val connection = url.openConnection() as HttpURLConnection
                
                connection.requestMethod = "POST"
                connection.setRequestProperty("Content-Type", "application/json")
                connection.doOutput = true
                
                // Get current provider info to send to cloud
                val provider = database.providerDao().getActiveProvider()
                
                val requestBody = JSONObject().apply {
                    put("email", email)
                    put("password", password)
                    put("deviceId", deviceId)
                    put("deviceName", deviceName)
                    
                    if (provider != null) {
                        put("provider", JSONObject().apply {
                            put("localProviderId", provider.id)
                            put("name", provider.name)
                            put("type", provider.type)
                            put("serverUrl", provider.serverUrl)
                            put("macAddress", provider.macAddress)
                            put("serialNumber", provider.serialNumber)
                            put("username", provider.username)
                            put("password", provider.password)
                            put("configuration", JSONObject(provider.configuration ?: "{}"))
                        })
                    }
                }
                
                connection.outputStream.use { os ->
                    os.write(requestBody.toString().toByteArray())
                }
                
                val responseCode = connection.responseCode
                if (responseCode == HttpURLConnection.HTTP_OK) {
                    val response = connection.inputStream.bufferedReader().use { it.readText() }
                    val json = JSONObject(response)
                    
                    val cloudUserId = json.getJSONObject("user").getString("cloudUserId")
                    val subscriptionEnabled = json.getJSONObject("user").getBoolean("subscriptionEnabled")
                    
                    // Update local user with cloud info
                    val currentUser = userDao.getCurrentUser()
                    if (currentUser != null) {
                        val updatedUser = currentUser.copy(
                            cloudUserId = cloudUserId,
                            cloudEnabled = true,
                            subscriptionEnabled = subscriptionEnabled,
                            email = email,
                            password = password,
                            updatedAt = System.currentTimeMillis()
                        )
                        userDao.update(updatedUser)
                        
                        Log.d(TAG, "✅ Successfully linked to cloud. User ID: $cloudUserId")
                        
                        // Initial sync to cloud
                        syncToCloud()
                        
                        Result.success(CloudLinkResult(
                            cloudUserId = cloudUserId,
                            subscriptionEnabled = subscriptionEnabled
                        ))
                    } else {
                        Result.failure(Exception("No local user found"))
                    }
                } else {
                    val error = connection.errorStream?.bufferedReader()?.use { it.readText() } 
                        ?: "Unknown error"
                    Log.e(TAG, "❌ Failed to link account: $error")
                    Result.failure(Exception(error))
                }
            } catch (e: Exception) {
                Log.e(TAG, "❌ Exception linking to cloud", e)
                Result.failure(e)
            }
        }
    }
    
    /**
     * Disable cloud sync
     */
    suspend fun unlinkFromCloud(): Result<Unit> {
        return withContext(Dispatchers.IO) {
            try {
                val user = userDao.getCurrentUser() ?: return@withContext Result.failure(
                    Exception("No user found")
                )
                
                // Call backend to disable cloud sync
                val baseUrl = apiClient.getBaseUrl()
                val url = URL("$baseUrl/api/tv/unlink-account")
                val connection = url.openConnection() as HttpURLConnection
                
                connection.requestMethod = "POST"
                connection.setRequestProperty("Authorization", "Bearer ${user.bearerToken}")
                
                if (connection.responseCode == HttpURLConnection.HTTP_OK) {
                    // Update local user
                    val updatedUser = user.copy(
                        cloudEnabled = false,
                        updatedAt = System.currentTimeMillis()
                    )
                    userDao.update(updatedUser)
                    
                    Log.d(TAG, "✅ Cloud sync disabled")
                    Result.success(Unit)
                } else {
                    Result.failure(Exception("Failed to unlink from cloud"))
                }
            } catch (e: Exception) {
                Log.e(TAG, "❌ Exception unlinking from cloud", e)
                Result.failure(e)
            }
        }
    }
    
    /**
     * Sync local data to cloud (favorites, watch history)
     */
    suspend fun syncToCloud() {
        if (!isCloudEnabled()) {
            Log.d(TAG, "Cloud sync disabled, skipping upload")
            return
        }
        
        withContext(Dispatchers.IO) {
            try {
                val user = userDao.getCurrentUser() ?: return@withContext
                val baseUrl = apiClient.getBaseUrl()
                
                // Sync favorites
                syncFavoritesToCloud(user.bearerToken, baseUrl)
                
                // Sync watch progress
                syncWatchProgressToCloud(user.bearerToken, baseUrl)
                
                Log.d(TAG, "✅ Data synced to cloud")
            } catch (e: Exception) {
                Log.e(TAG, "❌ Error syncing to cloud", e)
                // Don't throw - allow app to continue with local data
            }
        }
    }
    
    /**
     * Sync cloud data to local database
     */
    suspend fun syncFromCloud() {
        if (!isCloudEnabled()) {
            Log.d(TAG, "Cloud sync disabled, skipping download")
            return
        }
        
        withContext(Dispatchers.IO) {
            try {
                val user = userDao.getCurrentUser() ?: return@withContext
                val baseUrl = apiClient.getBaseUrl()
                
                // Sync favorites from cloud
                syncFavoritesFromCloud(user.bearerToken, baseUrl)
                
                // Sync watch progress from cloud
                syncWatchProgressFromCloud(user.bearerToken, baseUrl)
                
                // Update last sync time
                val updatedUser = user.copy(
                    lastSync = System.currentTimeMillis()
                )
                userDao.update(updatedUser)
                
                Log.d(TAG, "✅ Data synced from cloud")
            } catch (e: Exception) {
                Log.e(TAG, "❌ Error syncing from cloud", e)
                // Don't throw - use local data as fallback
            }
        }
    }
    
    private suspend fun syncFavoritesToCloud(token: String, baseUrl: String) {
        val favorites = favoriteDao.getAllFavorites()
        val provider = database.providerDao().getActiveProvider()
        var synced = 0
        
        // Backend expects individual POST calls for each favorite
        favorites.forEach { fav ->
            try {
                val url = URL("$baseUrl/api/favorites")
                val connection = url.openConnection() as HttpURLConnection
                
                connection.requestMethod = "POST"
                connection.setRequestProperty("Content-Type", "application/json")
                connection.setRequestProperty("Authorization", "Bearer $token")
                connection.doOutput = true
                
                // Match backend schema: contentType, contentId, contentName, contentPoster, providerId, categoryId, metadata
                val requestBody = JSONObject().apply {
                    put("contentType", fav.itemType.uppercase()) // MOVIE, SERIES, LIVETV
                    put("contentId", fav.itemId)
                    put("contentName", fav.itemName)
                    put("contentPoster", fav.posterUrl ?: "")
                    put("providerId", provider?.id ?: fav.providerId)
                    put("categoryId", "")
                    put("metadata", JSONObject().apply {
                        put("addedAt", fav.addedAt)
                    })
                }
                
                connection.outputStream.use { os ->
                    os.write(requestBody.toString().toByteArray())
                }
                
                if (connection.responseCode == HttpURLConnection.HTTP_OK || 
                    connection.responseCode == HttpURLConnection.HTTP_CREATED) {
                    synced++
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to sync favorite ${fav.itemId}", e)
            }
        }
        
        Log.d(TAG, "✅ $synced/${favorites.size} favorites synced to cloud")
    }
    
    private suspend fun syncFavoritesFromCloud(token: String, baseUrl: String) {
        val url = URL("$baseUrl/api/favorites")
        val connection = url.openConnection() as HttpURLConnection
        
        connection.requestMethod = "GET"
        connection.setRequestProperty("Authorization", "Bearer $token")
        
        if (connection.responseCode == HttpURLConnection.HTTP_OK) {
            val response = connection.inputStream.bufferedReader().use { it.readText() }
            val json = JSONObject(response)
            val favoritesArray = json.getJSONArray("favorites")
            
            // Clear existing favorites and insert cloud data
            favoriteDao.deleteAll()
            
            for (i in 0 until favoritesArray.length()) {
                val favJson = favoritesArray.getJSONObject(i)
                // Backend returns: content_id, content_type, content_name, content_poster, provider_id
                val favorite = FavoriteEntity(
                    itemId = favJson.getString("content_id"),
                    itemType = favJson.getString("content_type").lowercase(),
                    itemName = favJson.getString("content_name"),
                    posterUrl = favJson.optString("content_poster"),
                    providerId = favJson.optString("provider_id", ""),
                    addedAt = System.currentTimeMillis() // Backend uses created_at timestamp
                )
                favoriteDao.insert(favorite)
            }
            
            Log.d(TAG, "✅ ${favoritesArray.length()} favorites synced from cloud")
        }
    }
                    providerId = favJson.getString("providerId"),
                    addedAt = favJson.optLong("addedAt", System.currentTimeMillis())
                )
                favoriteDao.insert(favorite)
            }
            
            Log.d(TAG, "✅ ${favoritesArray.length()} favorites synced from cloud")
        }
    }
    
    private suspend fun syncWatchProgressToCloud(token: String, baseUrl: String) {
        val progressList = watchProgressDao.getAllProgress()
        var synced = 0
        
        // Backend expects individual POST calls for each progress item
        progressList.forEach { progress ->
            try {
                val url = URL("$baseUrl/api/progress")
                val connection = url.openConnection() as HttpURLConnection
                
                connection.requestMethod = "POST"
                connection.setRequestProperty("Content-Type", "application/json")
                connection.setRequestProperty("Authorization", "Bearer $token")
                connection.doOutput = true
                
                // Match backend schema: contentId, contentType, contentName, contentPoster, 
                // seriesId, seasonNumber, episodeNumber, currentPosition, duration
                val requestBody = JSONObject().apply {
                    put("contentId", progress.contentId)
                    put("contentType", progress.contentType.uppercase()) // MOVIE, SERIES, LIVETV
                    put("contentName", progress.title)
                    put("contentPoster", progress.posterUrl ?: "")
                    // For series, contentId is episode ID, seriesId is show ID
                    if (progress.contentType.equals("SERIES", ignoreCase = true)) {
                        // Extract series ID from contentId if available (format: seriesId_episodeId)
                        val seriesId = progress.contentId.split("_").firstOrNull() ?: progress.contentId
                        put("seriesId", seriesId)
                        put("seasonNumber", progress.seasonNumber ?: 0)
                        put("episodeNumber", progress.episodeNumber ?: 0)
                    }
                    put("currentPosition", progress.currentPosition)
                    put("duration", progress.duration)
                }
                
                connection.outputStream.use { os ->
                    os.write(requestBody.toString().toByteArray())
                }
                
                if (connection.responseCode == HttpURLConnection.HTTP_OK || 
                    connection.responseCode == HttpURLConnection.HTTP_CREATED) {
                    synced++
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to sync progress ${progress.contentId}", e)
            }
        }
        
        Log.d(TAG, "✅ $synced/${progressList.size} watch progress items synced to cloud")
    }
    
    private suspend fun syncWatchProgressFromCloud(token: String, baseUrl: String) {
        val url = URL("$baseUrl/api/progress")
        val connection = url.openConnection() as HttpURLConnection
        
        connection.requestMethod = "GET"
        connection.setRequestProperty("Authorization", "Bearer $token")
        
        if (connection.responseCode == HttpURLConnection.HTTP_OK) {
            val response = connection.inputStream.bufferedReader().use { it.readText() }
            val json = JSONObject(response)
            val progressArray = json.getJSONArray("progress")
            
            for (i in 0 until progressArray.length()) {
                val progressJson = progressArray.getJSONObject(i)
                // Backend returns: content_id, content_type, content_name, content_poster,
                // series_id, season_number, episode_number, current_position, duration, last_watched_at
                
                val progress = WatchProgress(
                    contentId = progressJson.getString("content_id"),
                    contentType = progressJson.getString("content_type").lowercase(),
                    providerId = "", // Not stored in backend watch_progress
                    title = progressJson.optString("content_name", ""),
                    posterUrl = progressJson.optString("content_poster", ""),
                    episodeId = progressJson.getString("content_id"), // For series, this is episode ID
                    episodeNumber = progressJson.optInt("episode_number", 0).takeIf { it > 0 },
                    seasonNumber = progressJson.optInt("season_number", 0).takeIf { it > 0 },
                    currentPosition = progressJson.getLong("current_position"),
                    duration = progressJson.getLong("duration"),
                    lastWatched = System.currentTimeMillis(), // Use current time or parse last_watched_at
                    cmd = "" // Not stored in backend
                )
                watchProgressDao.insertProgress(progress)
            }
            
            Log.d(TAG, "✅ ${progressArray.length()} watch progress items synced from cloud")
        }
    }
    
    data class CloudLinkResult(
        val cloudUserId: String,
        val subscriptionEnabled: Boolean
    )
}
