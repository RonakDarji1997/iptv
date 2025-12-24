package com.ronika.iptvnative.managers

import android.content.Context
import android.util.Log
import com.ronika.iptvnative.constants.ApiConstants
import com.ronika.iptvnative.database.AppDatabase
import com.ronika.iptvnative.database.WatchProgress
import com.ronika.iptvnative.database.WatchProgressDatabase
import com.ronika.iptvnative.database.entities.FavoriteEntity
import com.ronika.iptvnative.database.entities.UserEntity
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
    
    companion object {
        @Volatile
        private var instance: CloudSyncManager? = null
        
        fun getInstance(context: Context): CloudSyncManager {
            return instance ?: synchronized(this) {
                instance ?: CloudSyncManager(context.applicationContext).also { instance = it }
            }
        }
    }
    
    private val TAG = "CloudSyncManager"
    private val database = AppDatabase.getDatabase(context)
    private val watchProgressDb = WatchProgressDatabase.getDatabase(context)
    private val userDao = database.userDao()
    private val favoriteDao = database.favoriteDao()
    private val watchProgressDao = watchProgressDb.watchProgressDao()
    
    /**
     * Check if cloud sync is enabled for current user
     */
    suspend fun isCloudEnabled(): Boolean {
        return withContext(Dispatchers.IO) {
            val user = userDao.getUser()
            user?.cloudEnabled == true
        }
    }
    
    /**
     * Check if subscription features are enabled
     */
    suspend fun isSubscriptionEnabled(): Boolean {
        return withContext(Dispatchers.IO) {
            val user = userDao.getUser()
            user?.subscriptionEnabled == true
        }
    }
    
    /**
     * Link TV device to cloud account
     * This is for EXISTING users who want to enable cloud sync
     * For NEW users signing in with cloud, use loginAndFetchProviders() instead
     */
    suspend fun linkToCloud(
        email: String,
        password: String,
        deviceId: String,
        deviceName: String
    ): Result<CloudLinkResult> {
        return withContext(Dispatchers.IO) {
            try {
                Log.d(TAG, "🔐 Linking existing local setup to cloud for email: $email")
                val baseUrl = ApiConstants.BACKEND_URL
                
                // Step 1: Login to get bearer token
                Log.d(TAG, "🔑 Step 1: Login to get bearer token...")
                val authUrl = URL("$baseUrl/auth/register")
                val authConnection = authUrl.openConnection() as HttpURLConnection
                
                authConnection.requestMethod = "POST"
                authConnection.setRequestProperty("Content-Type", "application/json")
                authConnection.doOutput = true
                
                val authRequestBody = JSONObject().apply {
                    put("email", email)
                    put("password", password)
                    put("deviceId", deviceId)
                    put("deviceName", deviceName)
                }
                
                authConnection.outputStream.use { os ->
                    os.write(authRequestBody.toString().toByteArray())
                }
                
                val authResponseCode = authConnection.responseCode
                if (authResponseCode != HttpURLConnection.HTTP_OK) {
                    val error = authConnection.errorStream?.bufferedReader()?.use { it.readText() } 
                        ?: "Login failed"
                    Log.e(TAG, "❌ Failed to login: $error")
                    return@withContext Result.failure(Exception(error))
                }
                
                val authResponse = authConnection.inputStream.bufferedReader().use { it.readText() }
                val authJson = JSONObject(authResponse)
                
                val bearerToken = authJson.getString("accessToken")
                val cloudUserId = authJson.getString("userId")
                
                Log.d(TAG, "🎫 Bearer token obtained")
                Log.d(TAG, "👤 Cloud User ID: $cloudUserId")
                
                // Calculate token expiry (7 days from now)
                val tokenExpiry = System.currentTimeMillis() + (7 * 24 * 60 * 60 * 1000)
                
                // Step 2: Link TV device and sync local provider to cloud
                Log.d(TAG, "📡 Step 2: Syncing local provider to cloud...")
                val provider = database.providerDao().getActiveProvider()
                
                if (provider != null) {
                    val linkUrl = URL("$baseUrl/tv/link-account")
                    val linkConnection = linkUrl.openConnection() as HttpURLConnection
                    
                    linkConnection.requestMethod = "POST"
                    linkConnection.setRequestProperty("Content-Type", "application/json")
                    linkConnection.setRequestProperty("Authorization", "Bearer $bearerToken")
                    linkConnection.doOutput = true
                    
                    val linkRequestBody = JSONObject().apply {
                        put("email", email)
                        put("password", password)
                        put("deviceId", deviceId)
                        put("deviceName", deviceName)
                        put("provider", JSONObject().apply {
                            put("localProviderId", provider.id)
                            put("name", provider.name)
                            put("type", provider.type)
                            put("serverUrl", provider.serverUrl)
                            put("macAddress", provider.macAddress)
                            put("serialNumber", provider.serialNumber)
                            put("username", provider.username)
                            put("password", provider.password)
                            put("configuration", JSONObject(null ?: "{}"))
                        })
                    }
                    
                    linkConnection.outputStream.use { os ->
                        os.write(linkRequestBody.toString().toByteArray())
                    }
                    
                    val linkResponseCode = linkConnection.responseCode
                    if (linkResponseCode != HttpURLConnection.HTTP_OK) {
                        val error = linkConnection.errorStream?.bufferedReader()?.use { it.readText() } 
                            ?: "TV link failed"
                        Log.e(TAG, "❌ Failed to link TV: $error")
                        return@withContext Result.failure(Exception(error))
                    }
                    
                    Log.d(TAG, "✅ Local provider synced to cloud")
                }
                
                // Update or create local user with cloud credentials
                val currentUser = userDao.getUser()
                
                val userToSave = if (currentUser != null) {
                    currentUser.copy(
                        cloudUserId = cloudUserId,
                        cloudEnabled = true,
                        email = email,
                        password = password,
                        bearerToken = bearerToken,
                        tokenExpiry = tokenExpiry,
                        updatedAt = System.currentTimeMillis()
                    )
                } else {
                    UserEntity(
                        username = email.substringBefore('@'),
                        email = email,
                        password = password,
                        bearerToken = bearerToken,
                        tokenExpiry = tokenExpiry,
                        cloudUserId = cloudUserId,
                        cloudEnabled = true,
                        subscriptionEnabled = false,
                        lastSync = System.currentTimeMillis(),
                        createdAt = System.currentTimeMillis(),
                        updatedAt = System.currentTimeMillis()
                    )
                }
                
                if (currentUser != null) {
                    userDao.updateUser(userToSave)
                    Log.d(TAG, "💾 User updated with cloud credentials")
                } else {
                    userDao.insertUser(userToSave)
                    Log.d(TAG, "💾 User created with cloud credentials")
                }
                
                // Sync local data to cloud
                Log.d(TAG, "🔄 Syncing local favorites and progress to cloud...")
                syncToCloud()
                
                Log.d(TAG, "✅ Successfully linked to cloud")
                Result.success(CloudLinkResult(
                    cloudUserId = cloudUserId,
                    subscriptionEnabled = false
                ))
            } catch (e: Exception) {
                Log.e(TAG, "❌ Exception linking to cloud", e)
                Result.failure(e)
            }
        }
    }
    
    /**
     * Login with cloud credentials and fetch providers
     * This is for NEW users signing in with cloud from the start
     * No TV link needed - just login, get token, fetch providers
     */
    suspend fun loginAndFetchProviders(
        email: String,
        password: String,
        deviceId: String,
        deviceName: String
    ): Result<CloudLinkResult> {
        return withContext(Dispatchers.IO) {
            try {
                Log.d(TAG, "🔐 Logging in with cloud credentials: $email")
                val baseUrl = ApiConstants.BACKEND_URL
                
                // Step 1: Login to get bearer token
                Log.d(TAG, "🔑 Authenticating...")
                val authUrl = URL("$baseUrl/auth/register")
                val authConnection = authUrl.openConnection() as HttpURLConnection
                
                authConnection.requestMethod = "POST"
                authConnection.setRequestProperty("Content-Type", "application/json")
                authConnection.doOutput = true
                
                val authRequestBody = JSONObject().apply {
                    put("email", email)
                    put("password", password)
                    put("deviceId", deviceId)
                    put("deviceName", deviceName)
                }
                
                authConnection.outputStream.use { os ->
                    os.write(authRequestBody.toString().toByteArray())
                }
                
                val authResponseCode = authConnection.responseCode
                if (authResponseCode != HttpURLConnection.HTTP_OK) {
                    val error = authConnection.errorStream?.bufferedReader()?.use { it.readText() } 
                        ?: "Login failed"
                    Log.e(TAG, "❌ Failed to login: $error")
                    return@withContext Result.failure(Exception(error))
                }
                
                val authResponse = authConnection.inputStream.bufferedReader().use { it.readText() }
                val authJson = JSONObject(authResponse)
                
                val bearerToken = authJson.getString("accessToken")
                val cloudUserId = authJson.getString("userId")
                val isNewUser = authJson.getBoolean("isNewUser")
                
                Log.d(TAG, "✅ Authentication successful")
                Log.d(TAG, "👤 Cloud User ID: $cloudUserId, New User: $isNewUser")
                
                // Calculate token expiry (7 days from now)
                val tokenExpiry = System.currentTimeMillis() + (7 * 24 * 60 * 60 * 1000)
                
                // Create local user with cloud credentials
                val user = UserEntity(
                    username = email.substringBefore('@'),
                    email = email,
                    password = password,
                    bearerToken = bearerToken,
                    tokenExpiry = tokenExpiry,
                    cloudUserId = cloudUserId,
                    cloudEnabled = true,
                    subscriptionEnabled = false,
                    lastSync = System.currentTimeMillis(),
                    createdAt = System.currentTimeMillis(),
                    updatedAt = System.currentTimeMillis()
                )
                
                userDao.insertUser(user)
                Log.d(TAG, "💾 User created in local database")
                
                // Step 2: Fetch providers from cloud
                Log.d(TAG, "📥 Fetching providers from cloud...")
                syncProvidersFromCloud(bearerToken, baseUrl)
                
                Log.d(TAG, "✅ Login complete - providers synced")
                Result.success(CloudLinkResult(
                    cloudUserId = cloudUserId,
                    subscriptionEnabled = false
                ))
            } catch (e: Exception) {
                Log.e(TAG, "❌ Exception during login", e)
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
                val user = userDao.getUser() ?: return@withContext Result.failure(
                    Exception("No user found")
                )
                
                // Call backend to disable cloud sync
                val baseUrl = ApiConstants.BACKEND_URL
                val url = URL("$baseUrl/tv/unlink-account")
                val connection = url.openConnection() as HttpURLConnection
                
                connection.requestMethod = "POST"
                connection.setRequestProperty("Authorization", "Bearer ${user.bearerToken}")
                
                if (connection.responseCode == HttpURLConnection.HTTP_OK) {
                    // Update local user
                    val updatedUser = user.copy(
                        cloudEnabled = false,
                        updatedAt = System.currentTimeMillis()
                    )
                    userDao.updateUser(updatedUser)
                    
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
        Log.d(TAG, "🔵 syncToCloud() called, cloud enabled: ${isCloudEnabled()}")
        if (!isCloudEnabled()) {
            Log.d(TAG, "Cloud sync disabled, skipping upload")
            return
        }
        
        withContext(Dispatchers.IO) {
            try {
                val user = userDao.getUser()
                Log.d(TAG, "🔵 User found: ${user != null}, token: ${user?.bearerToken?.take(20)}...")
                if (user == null) {
                    Log.e(TAG, "❌ No user found, cannot sync to cloud")
                    return@withContext
                }
                val baseUrl = ApiConstants.BACKEND_URL
                Log.d(TAG, "🔵 Syncing to: $baseUrl")
                
                // Sync favorites
                syncFavoritesToCloud(user.bearerToken, baseUrl)
                
                // Sync watch progress
                syncWatchProgressToCloud(user.bearerToken, baseUrl)
                
                Log.d(TAG, "✅ Data synced to cloud")
            } catch (e: Exception) {
                Log.e(TAG, "❌ Error syncing to cloud: ${e.message}", e)
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
                val user = userDao.getUser()
                if (user == null) {
                    Log.w(TAG, "⚠️ No user found in database, cannot sync from cloud")
                    return@withContext
                }
                Log.d(TAG, "👤 Syncing for user: ${user.email}, cloudId: ${user.cloudUserId}")
                val baseUrl = ApiConstants.BACKEND_URL
                
                // Sync favorites from cloud
                syncFavoritesFromCloud(user.bearerToken, baseUrl)
                
                // Sync watch progress from cloud
                syncWatchProgressFromCloud(user.bearerToken, baseUrl)
                
                // Update last sync time
                val updatedUser = user.copy(
                    lastSync = System.currentTimeMillis()
                )
                userDao.updateUser(updatedUser)
                
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
                val url = URL("$baseUrl/favorites")
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
                    put("contentPoster", fav.itemPoster ?: "")
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
        Log.d(TAG, "⬇️ Fetching favorites from cloud...")
        val url = URL("$baseUrl/favorites")
        val connection = url.openConnection() as HttpURLConnection
        
        connection.requestMethod = "GET"
        connection.setRequestProperty("Authorization", "Bearer $token")
        
        val responseCode = connection.responseCode
        Log.d(TAG, "📥 Favorites response code: $responseCode")
        
        if (responseCode == HttpURLConnection.HTTP_OK) {
            val response = connection.inputStream.bufferedReader().use { it.readText() }
            Log.d(TAG, "📄 Cloud favorites response: $response")
            val json = JSONObject(response)
            val favoritesArray = json.getJSONArray("favorites")
            Log.d(TAG, "🔢 Cloud has ${favoritesArray.length()} favorites")
            
            // Clear existing favorites and insert cloud data
            favoriteDao.deleteAll()
            Log.d(TAG, "🗑️ Deleted all local favorites")
            
            for (i in 0 until favoritesArray.length()) {
                val favJson = favoritesArray.getJSONObject(i)
                // Backend returns: content_id, content_type, content_name, content_poster, provider_id
                val favorite = FavoriteEntity(
                    itemId = favJson.getString("content_id"),
                    itemType = favJson.getString("content_type").lowercase(),
                    itemName = favJson.getString("content_name"),
                    itemPoster = favJson.optString("content_poster"),
                    providerId = favJson.optString("provider_id", ""),
                    addedAt = System.currentTimeMillis() // Backend uses created_at timestamp
                )
                Log.d(TAG, "➕ Inserting favorite: ${favorite.itemName} (${favorite.itemType})")
                  favoriteDao.insert(favorite)
                Log.d(TAG, "✓ Favorite inserted successfully")
              }
              
              Log.d(TAG, "✅ ${favoritesArray.length()} favorites synced from cloud")
          }
      }    private suspend fun syncWatchProgressToCloud(token: String, baseUrl: String) {
        val progressList = watchProgressDao.getAllProgress()
        var synced = 0
        
        Log.d(TAG, "🚀 Starting watch progress cloud sync - found ${progressList.size} items to sync")
        
        // Backend expects individual POST calls for each progress item
        progressList.forEach { progress ->
            var requestBody: JSONObject? = null
            try {
                val url = URL("$baseUrl/progress")
                val connection = url.openConnection() as HttpURLConnection
                
                connection.requestMethod = "POST"
                connection.setRequestProperty("Content-Type", "application/json")
                connection.setRequestProperty("Authorization", "Bearer $token")
                connection.doOutput = true
                
                // Match backend schema: contentId, contentType, contentName, contentPoster, 
                // seriesId, seasonNumber, episodeNumber, currentPosition, duration
                requestBody = JSONObject().apply {
                    // For episodes: contentId = episodeId, seriesId = contentId (from our DB)
                    // For movies: contentId = movieId
                    if (progress.contentType.equals("EPISODE", ignoreCase = true)) {
                        put("contentId", progress.episodeId)  // Backend expects episodeId as contentId
                        put("seriesId", progress.contentId)    // Backend expects seriesId separately
                        put("contentType", "episode")          // Backend uses lowercase
                        put("seasonNumber", progress.seasonNumber ?: 0)
                        put("episodeNumber", progress.episodeNumber ?: 0)
                    } else {
                        put("contentId", progress.contentId)   // For movies, contentId is movieId
                        put("contentType", progress.contentType.lowercase()) // movie, livetv
                    }
                    put("contentName", progress.title)
                    put("contentPoster", progress.posterUrl ?: "")
                    // Backend stores in seconds, convert from milliseconds
                    put("currentPosition", progress.currentPosition / 1000)
                    put("duration", progress.duration / 1000)
                }
                
                Log.d(TAG, "📤 Syncing to cloud: ${requestBody.toString()}")
                
                connection.outputStream.use { os ->
                    os.write(requestBody.toString().toByteArray())
                }
                
                val responseCode = connection.responseCode
                if (responseCode == HttpURLConnection.HTTP_OK || 
                    responseCode == HttpURLConnection.HTTP_CREATED) {
                    synced++
                    val responseBody = connection.inputStream.bufferedReader().use { it.readText() }
                    Log.d(TAG, "✅ Synced ${progress.contentType} progress to cloud (${progress.title})")
                    Log.d(TAG, "📥 Server response: $responseBody")
                } else {
                    val errorBody = connection.errorStream?.bufferedReader()?.use { it.readText() } ?: "No error details"
                    Log.e(TAG, "❌ Failed to sync progress: HTTP $responseCode")
                    Log.e(TAG, "❌ Error details: $errorBody")
                    Log.e(TAG, "❌ Request was: ${requestBody.toString()}")
                }
            } catch (e: Exception) {
                Log.e(TAG, "❌ Exception syncing progress ${progress.contentId}: ${e.message}", e)
                if (requestBody != null) {
                    Log.e(TAG, "❌ Failed request body: ${requestBody.toString()}")
                }
            }
        }
        
        Log.d(TAG, "✅ $synced/${progressList.size} watch progress items synced to cloud")
    }
    
    private suspend fun syncWatchProgressFromCloud(token: String, baseUrl: String) {
        Log.d(TAG, "⬇️ Fetching watch progress from cloud...")
        val url = URL("$baseUrl/progress")
        val connection = url.openConnection() as HttpURLConnection
        
        connection.requestMethod = "GET"
        connection.setRequestProperty("Authorization", "Bearer $token")
        
        val responseCode = connection.responseCode
        Log.d(TAG, "📥 Watch progress response code: $responseCode")
        
        if (responseCode == HttpURLConnection.HTTP_OK) {
            val response = connection.inputStream.bufferedReader().use { it.readText() }
            Log.d(TAG, "📄 Cloud watch progress response: $response")
            val json = JSONObject(response)
            val progressArray = json.getJSONArray("progress")
            Log.d(TAG, "🔢 Cloud has ${progressArray.length()} watch progress items")
            
            // Get active provider ID (we only support one provider for now)
            val activeProvider = database.providerDao().getActiveProvider()
            val providerId = activeProvider?.id ?: ""
            Log.d(TAG, "📺 Using provider ID for synced progress: $providerId")
            
            var insertedCount = 0
            for (i in 0 until progressArray.length()) {
                val progressJson = progressArray.getJSONObject(i)
                // Backend returns: content_id, content_type, content_name, content_poster,
                // series_id, season_number, episode_number, current_position, duration, last_watched_at
                
                val contentType = progressJson.getString("content_type")
                val isEpisode = contentType == "EPISODE" || contentType == "SERIES"
                
                // For episodes, use series_id as contentId, episode's content_id as episodeId
                // For movies, use content_id as contentId
                val contentId = if (isEpisode && progressJson.has("series_id")) {
                    progressJson.optString("series_id", progressJson.getString("content_id"))
                } else {
                    progressJson.getString("content_id")
                }
                
                val episodeId = if (isEpisode) {
                    progressJson.getString("content_id") // This is the actual episode ID
                } else {
                    progressJson.getString("content_id")
                }
                
                // Clean up old duplicate entries for episodes
                // Before fix: episodes had contentId=episode_id
                // After fix: episodes have contentId=series_id
                // Delete old entries where contentId=episode_id to prevent duplicates
                if (isEpisode && progressJson.has("series_id")) {
                    val oldContentId = progressJson.getString("content_id") // This is the episode ID
                    watchProgressDao.deleteByContentIdAndType(oldContentId, "EPISODE")
                    Log.d(TAG, "🧹 Cleaned up old episode entry with contentId=$oldContentId")
                    
                    // Also delete existing entry with correct contentId to force update with new values
                    val existingProgress = watchProgressDao.getEpisodeProgress(contentId, episodeId, providerId)
                    if (existingProgress != null) {
                        watchProgressDao.deleteProgressById(existingProgress.id)
                        Log.d(TAG, "🧹 Deleted existing entry to update with fresh cloud data")
                    }
                }
                
                val progress = WatchProgress(
                    contentId = contentId,
                    contentType = contentType,
                    providerId = providerId,
                    title = progressJson.optString("content_name", ""),
                    posterUrl = progressJson.optString("content_poster", ""),
                    episodeId = episodeId,
                    episodeNumber = progressJson.optInt("episode_number", 0).takeIf { it > 0 },
                    seasonNumber = progressJson.optInt("season_number", 0).takeIf { it > 0 },
                    // Backend stores in seconds, convert to milliseconds for Android
                    currentPosition = progressJson.getLong("current_position") * 1000,
                    duration = progressJson.getLong("duration") * 1000,
                    lastWatched = System.currentTimeMillis(), // Use current time or parse last_watched_at
                    cmd = "" // Not stored in backend
                )
                Log.d(TAG, "➕ Inserting watch progress: ${progress.title} (${progress.contentType}) - ContentID: $contentId, EpisodeID: $episodeId - Position: ${progress.currentPosition}/${progress.duration}")
                watchProgressDao.insertProgress(progress)
                insertedCount++
                Log.d(TAG, "✓ Watch progress inserted successfully")
            }
            
            Log.d(TAG, "✅ $insertedCount watch progress items synced from cloud")
        }
    }
    
    /**
     * Sync providers and categories from cloud and save to local database
     */
    private suspend fun syncProvidersFromCloud(token: String, baseUrl: String) {
        try {
            Log.d(TAG, "⬇️ Pulling data from cloud (providers + categories)...")
            val url = URL("$baseUrl/sync/pull")
            val connection = url.openConnection() as HttpURLConnection
            
            connection.requestMethod = "GET"
            connection.setRequestProperty("Authorization", "Bearer $token")
            
            val responseCode = connection.responseCode
            Log.d(TAG, "📥 Pull response code: $responseCode")
            
            if (responseCode == HttpURLConnection.HTTP_OK) {
                val response = connection.inputStream.bufferedReader().use { it.readText() }
                val json = JSONObject(response)
                
                if (!json.getBoolean("success")) {
                    Log.e(TAG, "❌ API returned success=false")
                    return
                }
                
                val data = json.getJSONObject("data")
                val providersArray = data.getJSONArray("providers")
                val categoriesArray = data.getJSONArray("categories")
                
                Log.d(TAG, "🔢 Cloud has ${providersArray.length()} providers, ${categoriesArray.length()} categories")
                
                val providerDao = database.providerDao()
                val categoryDao = database.categoryDao()
                
                // Map to store cloud provider_id -> backend id mapping
                val providerIdMap = mutableMapOf<String, String>()
                
                // Insert providers
                var insertedProviders = 0
                for (i in 0 until providersArray.length()) {
                    val provJson = providersArray.getJSONObject(i)
                    
                    val backendId = provJson.getString("id") // Backend's UUID
                    val providerId = provJson.getString("provider_id") // Our generated ID
                    providerIdMap[backendId] = providerId
                    
                    val config = provJson.optJSONObject("configuration") ?: JSONObject()
                    val setupStep = config.optInt("setupStep", 4)
                    val isConfigured = provJson.optBoolean("is_configured", false)
                    
                    // Map backend fields to ProviderEntity
                    val provider = com.ronika.iptvnative.database.entities.ProviderEntity(
                        id = providerId,
                        userId = null,
                        type = provJson.getString("type"),
                        name = provJson.getString("name"),
                        serverUrl = provJson.getString("server_url"),
                        macAddress = provJson.optString("mac_address", null),
                        serialNumber = provJson.optString("serial_number", null),
                        username = provJson.optString("username", null),
                        password = provJson.optString("password", null),
                        token = provJson.optString("token", null),
                        tokenExpiry = null,
                        setupStep = setupStep,
                        isActive = provJson.optBoolean("is_active", true),
                        isConfigured = isConfigured,
                        includeTv = provJson.optBoolean("include_tv", true),
                        includeVod = provJson.optBoolean("include_vod", true),
                        adultPassword = provJson.optString("adult_password", "0000"),
                        selectedLiveTvCategories = null,
                        selectedMovieCategories = null,
                        selectedSeriesCategories = null,
                        createdAt = System.currentTimeMillis(),
                        updatedAt = System.currentTimeMillis()
                    )
                    
                    Log.d(TAG, "➕ Inserting provider: ${provider.name} (setupStep=$setupStep, isConfigured=$isConfigured)")
                    providerDao.insertProvider(provider)
                    insertedProviders++
                }
                
                // Insert categories
                var insertedCategories = 0
                for (i in 0 until categoriesArray.length()) {
                    val catJson = categoriesArray.getJSONObject(i)
                    
                    val backendProviderId = catJson.getString("provider_id")
                    val localProviderId = providerIdMap[backendProviderId]
                    
                    if (localProviderId == null) {
                        Log.w(TAG, "⚠️ Skipping category - provider not found: $backendProviderId")
                        continue
                    }
                    
                    val category = com.ronika.iptvnative.database.entities.CategoryEntity(
                        id = catJson.getString("id"),
                        providerId = localProviderId, // Use our local provider ID
                        externalId = catJson.getString("category_id"), // Use category_id as externalId
                        name = catJson.getString("name"),
                        type = catJson.getString("type"),
                        contentType = catJson.getString("content_type"),
                        censored = catJson.optInt("censored", 0),
                        isEnabled = catJson.optBoolean("is_enabled", true),
                        createdAt = System.currentTimeMillis(),
                        updatedAt = System.currentTimeMillis()
                    )
                    
                    categoryDao.insert(category)
                    insertedCategories++
                }
                
                Log.d(TAG, "✅ Synced $insertedProviders providers and $insertedCategories categories from cloud")
            } else {
                Log.e(TAG, "❌ Failed to pull data: $responseCode")
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to sync data from cloud", e)
        }
    }
    
    /**
     * Fetch series-specific progress from cloud for a given contentId (series ID)
     * Uses endpoint: GET /api/progress/{contentId}
     */
    suspend fun syncSeriesProgressFromCloud(seriesId: String): List<WatchProgress> {
        return withContext(Dispatchers.IO) {
            try {
                val user = userDao.getUser()
                if (user == null || !user.cloudEnabled || user.bearerToken.isEmpty()) {
                    Log.d(TAG, "Cloud not enabled or no token, skipping series progress sync")
                    return@withContext emptyList()
                }
                
                Log.d(TAG, "🔄 Fetching progress for series: $seriesId")
                
                val url = URL("${ApiConstants.BACKEND_URL}/progress/$seriesId")
                val connection = url.openConnection() as HttpURLConnection
                
                connection.requestMethod = "GET"
                connection.setRequestProperty("Authorization", "Bearer ${user.bearerToken}")
                connection.setRequestProperty("Content-Type", "application/json")
                
                val responseCode = connection.responseCode
                Log.d(TAG, "📥 Series progress response code: $responseCode")
                
                if (responseCode == HttpURLConnection.HTTP_OK) {
                    val response = connection.inputStream.bufferedReader().use { it.readText() }
                    Log.d(TAG, "📄 Series progress response: $response")
                    val json = JSONObject(response)
                    
                    // Handle null progress (no episodes watched for this series)
                    if (json.isNull("progress")) {
                        Log.d(TAG, "⚠️ No episodes watched for series $seriesId")
                        return@withContext emptyList()
                    }
                    
                    val progressArray = json.getJSONArray("progress")
                    Log.d(TAG, "🔢 Found ${progressArray.length()} episodes with progress")
                    
                    // Get active provider ID
                    val activeProvider = database.providerDao().getActiveProvider()
                    val providerId = activeProvider?.id ?: ""
                    
                    val progressList = mutableListOf<WatchProgress>()
                    
                    for (i in 0 until progressArray.length()) {
                        val progressJson = progressArray.getJSONObject(i)
                        
                        val progress = WatchProgress(
                            contentId = seriesId,
                            contentType = progressJson.getString("content_type"),
                            providerId = providerId,
                            title = progressJson.optString("content_name", ""),
                            posterUrl = progressJson.optString("content_poster", ""),
                            episodeId = progressJson.getString("episode_id"),
                            episodeNumber = progressJson.optInt("episode_number", 0).takeIf { it > 0 },
                            seasonNumber = progressJson.optInt("season_number", 0).takeIf { it > 0 },
                            currentPosition = progressJson.getLong("current_position"),
                            duration = progressJson.getLong("duration"),
                            lastWatched = System.currentTimeMillis(),
                            cmd = ""
                        )
                        
                        Log.d(TAG, "➕ Inserting episode progress: S${progress.seasonNumber}E${progress.episodeNumber} - ${progress.progressPercentage}%")
                        watchProgressDao.insertProgress(progress)
                        progressList.add(progress)
                    }
                    
                    Log.d(TAG, "✅ ${progressList.size} episode progress items synced from cloud")
                    return@withContext progressList
                } else {
                    Log.e(TAG, "❌ Failed to fetch series progress: $responseCode")
                    return@withContext emptyList()
                }
            } catch (e: Exception) {
                Log.e(TAG, "❌ Error fetching series progress", e)
                return@withContext emptyList()
            }
        }
    }
    
    /**
     * Fetch progress for a single episode from cloud
     * Uses endpoint: GET /api/progress/{episodeId}
     */
    suspend fun fetchEpisodeProgress(seriesId: String, episodeId: String) {
        withContext(Dispatchers.IO) {
            try {
                val user = userDao.getUser()
                if (user == null || !user.cloudEnabled || user.bearerToken.isEmpty()) {
                    return@withContext
                }
                
                val url = URL("${ApiConstants.BACKEND_URL}/progress/$episodeId")
                val connection = url.openConnection() as HttpURLConnection
                
                connection.requestMethod = "GET"
                connection.setRequestProperty("Authorization", "Bearer ${user.bearerToken}")
                connection.setRequestProperty("Content-Type", "application/json")
                
                val responseCode = connection.responseCode
                
                if (responseCode == HttpURLConnection.HTTP_OK) {
                    val response = connection.inputStream.bufferedReader().use { it.readText() }
                    val json = JSONObject(response)
                    
                    // Handle null progress (episode not watched)
                    if (json.isNull("progress") || json.optJSONObject("progress") == null) {
                        Log.d(TAG, "⚪ No progress for episode $episodeId")
                        return@withContext
                    }
                    
                    val progressJson = json.getJSONObject("progress")
                    
                    // Get active provider ID - use empty string to match query behavior
                    val providerId = ""
                    
                    val progress = WatchProgress(
                        contentId = seriesId,
                        contentType = "EPISODE",
                        providerId = providerId,
                        title = progressJson.optString("content_name", ""),
                        posterUrl = progressJson.optString("content_poster", ""),
                        episodeId = episodeId,
                        episodeNumber = progressJson.optInt("episode_number", 0).takeIf { it > 0 },
                        seasonNumber = progressJson.optInt("season_number", 0).takeIf { it > 0 },
                        currentPosition = progressJson.getLong("current_position"),
                        duration = progressJson.getLong("duration"),
                        lastWatched = System.currentTimeMillis(),
                        cmd = ""
                    )
                    
                    Log.d(TAG, "📥 Episode $episodeId progress: ${progress.progressPercentage}% (contentId=${progress.contentId}, episodeId=${progress.episodeId}, providerId=${progress.providerId})")
                    watchProgressDao.insertProgress(progress)
                } else if (responseCode == HttpURLConnection.HTTP_NOT_FOUND) {
                    // Episode not watched, that's fine
                    Log.d(TAG, "⚪ Episode $episodeId not watched yet")
                } else {
                    Log.e(TAG, "❌ Failed to fetch episode progress: $responseCode")
                }
            } catch (e: Exception) {
                Log.e(TAG, "❌ Error fetching episode progress for $episodeId", e)
            }
        }
    }
    
    data class CloudLinkResult(
        val cloudUserId: String,
        val subscriptionEnabled: Boolean
    )
}
