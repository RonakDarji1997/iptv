package com.ronika.iptvnative.sync

import android.content.Context
import android.util.Log
import com.google.gson.Gson
import com.google.gson.annotations.SerializedName
import com.ronika.iptvnative.constants.ApiConstants
import com.ronika.iptvnative.database.entities.ProviderEntity
import com.ronika.iptvnative.database.entities.CategoryEntity
import com.ronika.iptvnative.database.entities.ChannelEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

/**
 * IPTV Sync Service
 * Syncs provider, category, and channel data to cloud backend
 * Supports multi-device synchronization
 */
class IPTVSyncService(private val context: Context) {
    
    companion object {
        private const val TAG = "IPTVSyncService"
        
        // Backend URL - Use production endpoint (includes /api for auth routes)
        private val BACKEND_URL = ApiConstants.BACKEND_URL
        
        // User credentials
        private const val USER_EMAIL = "ronakdarji1997@gmail.com"
        
        // Shared preferences
        private const val PREFS_NAME = "iptv_sync_prefs"
        private const val KEY_ACCESS_TOKEN = "access_token"
        private const val KEY_REFRESH_TOKEN = "refresh_token"
        private const val KEY_USER_ID = "user_id"
        private const val KEY_DEVICE_ID = "device_id"
    }
    
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val gson = Gson()
    
    /**
     * Refresh access token when it expires (401 error)
     * Uses stored email and password to get new token
     */
    private suspend fun refreshAccessToken(): Boolean = withContext(Dispatchers.IO) {
        try {
            Log.d(TAG, "🔄 Refreshing access token...")
            
            // Get stored credentials from database
            val database = com.ronika.iptvnative.database.AppDatabase.getDatabase(context)
            val user = database.userDao().getUser()
            
            if (user == null) {
                Log.e(TAG, "❌ No user found in database for token refresh")
                return@withContext false
            }
            
            if (user.email.isEmpty() || user.password.isNullOrEmpty()) {
                Log.e(TAG, "❌ User credentials not available for token refresh")
                return@withContext false
            }
            
            Log.d(TAG, "📧 Using credentials: ${user.email}")
            
            // Authenticate with stored credentials, forcing a refresh
            return@withContext ensureAuthenticated(user.email, user.password, forceRefresh = true)
        } catch (e: Exception) {
            Log.e(TAG, "❌ Token refresh failed: ${e.message}")
            e.printStackTrace()
            return@withContext false
        }
    }
    
    /**
     * Execute HTTP request with automatic token refresh on 401
     * @return Response code and body
     */
    private suspend fun executeWithRetry(
        urlString: String,
        method: String = "POST",
        body: String? = null,
        maxRetries: Int = 1
    ): Pair<Int, String> = withContext(Dispatchers.IO) {
        var attempts = 0
        var lastException: Exception? = null
        
        while (attempts <= maxRetries) {
            try {
                val accessToken = prefs.getString(KEY_ACCESS_TOKEN, null)
                if (accessToken == null) {
                    Log.e(TAG, "❌ No access token available")
                    return@withContext Pair(401, "No access token")
                }
                
                val connection = URL(urlString).openConnection() as HttpURLConnection
                connection.requestMethod = method
                connection.setRequestProperty("Authorization", "Bearer $accessToken")
                connection.setRequestProperty("Content-Type", "application/json")
                connection.connectTimeout = 10000
                connection.readTimeout = 10000
                
                if (body != null && (method == "POST" || method == "PUT")) {
                    connection.doOutput = true
                    connection.outputStream.use { os ->
                        os.write(body.toByteArray())
                    }
                }
                
                val responseCode = connection.responseCode
                val responseBody = if (responseCode in 200..299) {
                    connection.inputStream.bufferedReader().use { it.readText() }
                } else {
                    connection.errorStream?.bufferedReader()?.use { it.readText() } ?: ""
                }
                
                // If 401 and we haven't retried yet, refresh token and retry
                if (responseCode == 401 && attempts < maxRetries) {
                    Log.d(TAG, "⚠️ Got 401, refreshing token (attempt ${attempts + 1}/${maxRetries + 1})...")
                    if (refreshAccessToken()) {
                        Log.d(TAG, "✅ Token refreshed, retrying request...")
                        attempts++
                        continue
                    } else {
                        Log.e(TAG, "❌ Token refresh failed, cannot retry")
                        return@withContext Pair(401, "Token refresh failed")
                    }
                }
                
                return@withContext Pair(responseCode, responseBody)
                
            } catch (e: Exception) {
                Log.e(TAG, "❌ Request failed (attempt ${attempts + 1}): ${e.message}")
                lastException = e
                if (attempts >= maxRetries) {
                    throw e
                }
                attempts++
            }
        }
        
        throw lastException ?: Exception("Request failed after $maxRetries retries")
    }
    
    // Data classes for API
    data class SyncProviderRequest(
        @SerializedName("provider_id") val providerId: String,
        val name: String,
        val type: String,
        @SerializedName("server_url") val serverUrl: String?,
        @SerializedName("mac_address") val macAddress: String?,
        @SerializedName("serial_number") val serialNumber: String?,
        val token: String?,
        val username: String?,
        val password: String?,
        val configuration: Map<String, Any?>,
        @SerializedName("is_active") val isActive: Boolean,
        @SerializedName("is_configured") val isConfigured: Boolean,
        @SerializedName("include_tv") val includeTv: Boolean,
        @SerializedName("include_vod") val includeVod: Boolean,
        @SerializedName("adult_password") val adultPassword: String?
    )
    
    data class SyncCategoryRequest(
        @SerializedName("provider_id") val providerId: String,
        val categories: List<CategoryData>
    )
    
    data class CategoryData(
        @SerializedName("category_id") val categoryId: String,
        @SerializedName("external_id") val externalId: String?,
        val name: String,
        val type: String,
        @SerializedName("content_type") val contentType: String?,
        val censored: Int,
        @SerializedName("is_enabled") val isEnabled: Boolean
    )
    
    data class SyncChannelRequest(
        @SerializedName("category_id") val categoryId: String,
        val channels: List<ChannelData>
    )
    
    data class ChannelData(
        @SerializedName("channel_id") val channelId: String,
        @SerializedName("external_id") val externalId: String?,
        val name: String,
        val number: String?,
        val url: String?,
        val cmd: String?,
        val logo: String?,
        @SerializedName("category_id") val categoryId: String?,
        @SerializedName("epg_channel_id") val epgChannelId: String?,
        @SerializedName("is_active") val isActive: Boolean,
        @SerializedName("is_favorite") val isFavorite: Boolean
    )
    
    data class ApiResponse(
        val success: Boolean,
        val message: String?,
        val data: Any?
    )
    
    /**
     * Check if user is logged in
     */
    fun isLoggedIn(): Boolean {
        return prefs.getString(KEY_ACCESS_TOKEN, null) != null
    }
    
    /**
     * Get device ID (generate if doesn't exist)
     */
    private fun getDeviceId(): String {
        var deviceId = prefs.getString(KEY_DEVICE_ID, null)
        if (deviceId == null) {
            deviceId = android.provider.Settings.Secure.getString(
                context.contentResolver,
                android.provider.Settings.Secure.ANDROID_ID
            ) ?: "unknown-device"
            prefs.edit().putString(KEY_DEVICE_ID, deviceId).apply()
        }
        return deviceId ?: "unknown-device"
    }
    
    /**
     * Login or register user
     * This should be called on first launch or when token expires
     * @param forceRefresh If true, ignore existing token and get a new one
     */
    suspend fun ensureAuthenticated(email: String? = null, password: String? = null, forceRefresh: Boolean = false): Boolean = withContext(Dispatchers.IO) {
        try {
            if (!forceRefresh && isLoggedIn()) {
                return@withContext true
            }
            
            // Use provided credentials or fall back to stored values
            val userEmail = email ?: prefs.getString("user_email", null) ?: USER_EMAIL
            val userPassword = password ?: prefs.getString("user_password", null)
            
            if (userPassword == null) {
                Log.e(TAG, "❌ No password provided for authentication")
                return@withContext false
            }
            
            Log.d(TAG, "🔐 Authenticating user: $userEmail")
            
            // Generate username from email (part before @)
            val username = userEmail.substringBefore('@')
            
            val url = URL("$BACKEND_URL/auth/register")
            val connection = url.openConnection() as HttpURLConnection
            
            try {
                connection.requestMethod = "POST"
                connection.setRequestProperty("Content-Type", "application/json")
                connection.doOutput = true
                connection.connectTimeout = 10000
                connection.readTimeout = 10000
                
                val loginData = mapOf(
                    "email" to userEmail,
                    "password" to userPassword,
                    "deviceId" to getDeviceId(),
                    "deviceName" to "Android TV"
                )
                
                connection.outputStream.use { os ->
                    os.write(gson.toJson(loginData).toByteArray())
                }
                
                if (connection.responseCode == 200 || connection.responseCode == 201) {
                    val response = connection.inputStream.bufferedReader().use { it.readText() }
                    Log.d(TAG, "📥 Auth response: $response")
                    
                    val authResponse = gson.fromJson(response, Map::class.java)
                    
                    // Backend returns: {accessToken, refreshToken, userId}
                    val accessToken = authResponse["accessToken"] as? String
                    val refreshToken = authResponse["refreshToken"] as? String
                    val userId = authResponse["userId"] as? String
                    
                    if (accessToken == null || userId == null) {
                        Log.e(TAG, "❌ Invalid auth response - missing accessToken or userId")
                        return@withContext false
                    }
                    
                    Log.d(TAG, "💾 Saving tokens - accessToken length: ${accessToken.length}, userId: $userId")
                    
                    // Save credentials synchronously with commit()
                    val editor = prefs.edit()
                    editor.putString(KEY_ACCESS_TOKEN, accessToken)
                    editor.putString(KEY_REFRESH_TOKEN, refreshToken)
                    editor.putString(KEY_USER_ID, userId)
                    editor.putString("user_email", userEmail)
                    editor.putString("user_password", userPassword)
                    val committed = editor.commit()
                    
                    Log.d(TAG, "✅ Tokens saved (committed: $committed)")
                    
                    // Verify token was written
                    val verifyToken = prefs.getString(KEY_ACCESS_TOKEN, null)
                    Log.d(TAG, "🔍 Verification read - token exists: ${verifyToken != null}, length: ${verifyToken?.length}")
                    
                    if (!committed || verifyToken == null) {
                        Log.e(TAG, "❌ Token save verification failed!")
                        return@withContext false
                    }
                    
                    true
                } else {
                    Log.e(TAG, "❌ Authentication failed: ${connection.responseCode}")
                    false
                }
            } finally {
                connection.disconnect()
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Authentication error", e)
            false
        }
    }
    
    /**
     * Sync provider to backend
     */
    suspend fun syncProvider(provider: ProviderEntity): Boolean = withContext(Dispatchers.IO) {
        try {
            if (!isLoggedIn()) {
                if (!ensureAuthenticated()) {
                    Log.e(TAG, "Not authenticated, skipping sync")
                    return@withContext false
                }
            }
            
            val syncRequest = SyncProviderRequest(
                providerId = provider.id,
                name = provider.name,
                type = provider.type,
                serverUrl = provider.serverUrl,
                macAddress = provider.macAddress,
                serialNumber = provider.serialNumber,
                token = provider.token,
                username = provider.username,
                password = provider.password,
                configuration = mapOf(
                    "setupStep" to provider.setupStep,
                    "lastSync" to System.currentTimeMillis()
                ),
                isActive = provider.isActive,
                isConfigured = provider.isConfigured,
                includeTv = provider.includeTv,
                includeVod = provider.includeVod,
                adultPassword = provider.adultPassword
            )
            
            val (responseCode, responseBody) = executeWithRetry(
                "$BACKEND_URL/sync/providers",
                "POST",
                gson.toJson(syncRequest)
            )
            
            if (responseCode in 200..299) {
                Log.d(TAG, "✅ Provider synced: ${provider.name}")
                true
            } else {
                Log.e(TAG, "❌ Provider sync failed: $responseCode")
                false
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Provider sync error", e)
            false
        }
    }
    
    /**
     * Sync categories to backend
     */
    suspend fun syncCategories(providerId: String, categories: List<CategoryEntity>): Boolean = withContext(Dispatchers.IO) {
        try {
            if (!isLoggedIn()) {
                return@withContext false
            }
            
            val url = URL("$BACKEND_URL/sync/categories")
            val connection = url.openConnection() as HttpURLConnection
            
            try {
                connection.requestMethod = "POST"
                connection.setRequestProperty("Content-Type", "application/json")
                connection.setRequestProperty("Authorization", "Bearer ${prefs.getString(KEY_ACCESS_TOKEN, "")}")
                connection.doOutput = true
                connection.connectTimeout = 15000
                connection.readTimeout = 15000
                
                val categoryData = categories
                    .filter { it.id.isNotEmpty() } // Filter out categories with empty/null IDs
                    .map { cat ->
                        CategoryData(
                            categoryId = cat.id,
                            externalId = cat.externalId,
                            name = cat.name,
                            type = cat.type,
                            contentType = cat.contentType,
                            censored = cat.censored,
                            isEnabled = cat.isEnabled
                        )
                    }
                
                val syncRequest = SyncCategoryRequest(
                    providerId = providerId,
                    categories = categoryData
                )
                
                connection.outputStream.use { os ->
                    os.write(gson.toJson(syncRequest).toByteArray())
                }
                
                if (connection.responseCode in 200..299) {
                    Log.d(TAG, "✅ Categories synced: ${categories.size} items")
                    true
                } else {
                    Log.e(TAG, "❌ Categories sync failed: ${connection.responseCode}")
                    false
                }
            } finally {
                connection.disconnect()
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Categories sync error", e)
            false
        }
    }
    
    /**
     * Sync all providers from database
     * Call this on app startup
     */
    suspend fun syncAllProviders(providers: List<ProviderEntity>): Boolean = withContext(Dispatchers.IO) {
        try {
            if (!ensureAuthenticated()) {
                Log.e(TAG, "Cannot sync - not authenticated")
                return@withContext false
            }
            
            var success = true
            providers.forEach { provider ->
                if (!syncProvider(provider)) {
                    success = false
                }
            }
            
            Log.d(TAG, if (success) "✅ All providers synced" else "⚠️ Some providers failed to sync")
            success
        } catch (e: Exception) {
            Log.e(TAG, "❌ Sync all providers error", e)
            false
        }
    }
    
    /**
     * Sync channels to backend
     */
    suspend fun syncChannels(providerId: String, channels: List<ChannelEntity>): Boolean = withContext(Dispatchers.IO) {
        try {
            if (!isLoggedIn()) {
                return@withContext false
            }
            
            val url = URL("$BACKEND_URL/sync/channels")
            val connection = url.openConnection() as HttpURLConnection
            
            try {
                connection.requestMethod = "POST"
                connection.setRequestProperty("Content-Type", "application/json")
                connection.setRequestProperty("Authorization", "Bearer ${prefs.getString(KEY_ACCESS_TOKEN, "")}")
                connection.doOutput = true
                connection.connectTimeout = 15000
                connection.readTimeout = 15000
                
                val channelData = channels.map { ch ->
                    ChannelData(
                        channelId = ch.id,
                        externalId = ch.externalId,
                        name = ch.name,
                        number = ch.number ?: "",
                        url = ch.cmd ?: "",
                        cmd = ch.cmd ?: "",
                        logo = ch.logo,
                        categoryId = ch.categoryId ?: "",
                        epgChannelId = ch.epgChannelId,
                        isActive = ch.isActive,
                        isFavorite = ch.isFavorite
                    )
                }
                
                val syncRequest = mapOf(
                    "providerId" to providerId,
                    "channels" to channelData
                )
                
                connection.outputStream.use { os ->
                    os.write(gson.toJson(syncRequest).toByteArray())
                }
                
                if (connection.responseCode in 200..299) {
                    Log.d(TAG, "✅ Channels synced: ${channels.size} items")
                    true
                } else {
                    Log.e(TAG, "❌ Channels sync failed: ${connection.responseCode}")
                    false
                }
            } finally {
                connection.disconnect()
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Channels sync error", e)
            false
        }
    }
    
    /**
     * Sync watch progress to backend
     */
    suspend fun syncWatchProgress(
        contentId: String,
        contentType: String,
        providerId: String,
        position: Long,
        duration: Long,
        completed: Boolean
    ): Boolean = withContext(Dispatchers.IO) {
        try {
            if (!isLoggedIn()) {
                return@withContext false
            }
            
            val url = URL("$BACKEND_URL/sync/progress")
            val connection = url.openConnection() as HttpURLConnection
            
            try {
                connection.requestMethod = "POST"
                connection.setRequestProperty("Content-Type", "application/json")
                connection.setRequestProperty("Authorization", "Bearer ${prefs.getString(KEY_ACCESS_TOKEN, "")}")
                connection.doOutput = true
                connection.connectTimeout = 15000
                connection.readTimeout = 15000
                
                val progressData = mapOf(
                    "contentId" to contentId,
                    "contentType" to contentType,
                    "providerId" to providerId,
                    "position" to position,
                    "duration" to duration,
                    "completed" to completed
                )
                
                connection.outputStream.use { os ->
                    os.write(gson.toJson(progressData).toByteArray())
                }
                
                if (connection.responseCode in 200..299) {
                    Log.d(TAG, "✅ Progress synced: $contentType $contentId")
                    true
                } else {
                    Log.e(TAG, "❌ Progress sync failed: ${connection.responseCode}")
                    false
                }
            } finally {
                connection.disconnect()
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Progress sync error", e)
            false
        }
    }
    
    /**
     * Sync user settings to backend
     */
    suspend fun syncSettings(settings: Map<String, Any>): Boolean = withContext(Dispatchers.IO) {
        try {
            if (!isLoggedIn()) {
                return@withContext false
            }
            
            val url = URL("$BACKEND_URL/sync/settings")
            val connection = url.openConnection() as HttpURLConnection
            
            try {
                connection.requestMethod = "POST"
                connection.setRequestProperty("Content-Type", "application/json")
                connection.setRequestProperty("Authorization", "Bearer ${prefs.getString(KEY_ACCESS_TOKEN, "")}")
                connection.doOutput = true
                connection.connectTimeout = 15000
                connection.readTimeout = 15000
                
                val settingsData = mapOf("settings" to settings)
                
                connection.outputStream.use { os ->
                    os.write(gson.toJson(settingsData).toByteArray())
                }
                
                if (connection.responseCode in 200..299) {
                    Log.d(TAG, "✅ Settings synced: ${settings.size} items")
                    true
                } else {
                    Log.e(TAG, "❌ Settings sync failed: ${connection.responseCode}")
                    false
                }
            } finally {
                connection.disconnect()
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Settings sync error", e)
            false
        }
    }
    
    /**
     * Sync everything - providers, categories, channels
     * Comprehensive sync for all data
     */
    suspend fun syncEverything(context: Context): Boolean = withContext(Dispatchers.IO) {
        try {
            if (!ensureAuthenticated()) {
                Log.e(TAG, "Cannot sync everything - not authenticated")
                return@withContext false
            }
            
            Log.d(TAG, "🔄 Starting comprehensive sync...")
            val database = com.ronika.iptvnative.database.AppDatabase.getDatabase(context)
            
            // Sync all providers
            val providers = database.providerDao().getAllProvidersList()
            Log.d(TAG, "📦 Syncing ${providers.size} providers...")
            providers.forEach { provider ->
                syncProvider(provider)
                
                // Sync categories for this provider
                val categories = database.categoryDao().getCategoriesByProviderId(provider.id)
                if (categories.isNotEmpty()) {
                    Log.d(TAG, "📂 Syncing ${categories.size} categories for ${provider.name}...")
                    syncCategories(provider.id, categories)
                    
                    // Sync channels for each category
                    categories.forEach { category ->
                        val channels = database.channelDao().getChannelsByCategory(category.id)
                        if (channels.isNotEmpty()) {
                            Log.d(TAG, "📺 Syncing ${channels.size} channels for category ${category.name}...")
                            syncChannels(provider.id, channels)
                        }
                    }
                }
            }
            
            Log.d(TAG, "✅ Comprehensive sync completed")
            true
        } catch (e: Exception) {
            Log.e(TAG, "❌ Comprehensive sync error", e)
            false
        }
    }
    
    /**
     * Pull all data from backend and save to local database
     * Returns true if data was available and downloaded
     */
    suspend fun pullAllData(context: Context): Boolean = withContext(Dispatchers.IO) {
        try {
            val token = prefs.getString(KEY_ACCESS_TOKEN, null)
            Log.d(TAG, "🔍 Checking auth - token exists: ${token != null}, token value: ${token?.take(20)}...")
            
            if (!isLoggedIn()) {
                Log.e(TAG, "Cannot pull data - not authenticated (token is null)")
                return@withContext false
            }
            
            Log.d(TAG, "📥 Pulling all data from cloud via GET /sync/pull...")
            
            val (responseCode, response) = executeWithRetry(
                "$BACKEND_URL/sync/pull",
                "GET"
            )
            
            if (responseCode in 200..299) {
                    val jsonResponse = gson.fromJson(response, com.google.gson.JsonObject::class.java)
                    
                    if (jsonResponse.get("success").asBoolean) {
                        val data = jsonResponse.getAsJsonObject("data")
                        
                        val database = com.ronika.iptvnative.database.AppDatabase.getDatabase(context)
                        
                        // Parse and insert providers
                        // Create mapping: backend UUID -> provider_id
                        val providerIdMap = mutableMapOf<String, String>()
                        
                        val providersArray = data.getAsJsonArray("providers")
                        if (providersArray != null && providersArray.size() > 0) {
                            Log.d(TAG, "📦 Found ${providersArray.size()} providers in cloud")
                            
                            val providers = mutableListOf<com.ronika.iptvnative.database.entities.ProviderEntity>()
                            for (i in 0 until providersArray.size()) {
                                val p = providersArray[i].asJsonObject
                                
                                val backendId = p.get("id")?.takeIf { !it.isJsonNull }?.asString ?: ""
                                val providerId = p.get("provider_id")?.takeIf { !it.isJsonNull }?.asString ?: ""
                                
                                // Map backend UUID to provider_id for category lookup
                                providerIdMap[backendId] = providerId
                                
                                val macAddress = p.get("mac_address")?.takeIf { !it.isJsonNull }?.asString
                                val token = p.get("token")?.takeIf { !it.isJsonNull }?.asString ?: ""
                                val serverUrl = p.get("server_url")?.takeIf { !it.isJsonNull }?.asString ?: ""
                                
                                // Provider is configured if it has MAC, token, and valid server URL
                                val isConfigured = !macAddress.isNullOrEmpty() && 
                                                   token.isNotEmpty() && 
                                                   serverUrl.isNotEmpty() && 
                                                   serverUrl != "pending"
                                
                                val provider = com.ronika.iptvnative.database.entities.ProviderEntity(
                                    id = providerId,
                                    name = p.get("name")?.takeIf { !it.isJsonNull }?.asString ?: "",
                                    type = p.get("type")?.takeIf { !it.isJsonNull }?.asString ?: "",
                                    serverUrl = serverUrl,
                                    macAddress = macAddress,
                                    serialNumber = p.get("serial_number")?.takeIf { !it.isJsonNull }?.asString,
                                    token = token,
                                    username = p.get("username")?.takeIf { !it.isJsonNull }?.asString,
                                    password = p.get("password")?.takeIf { !it.isJsonNull }?.asString,
                                    setupStep = if (isConfigured) 4 else 2, // Step 4 if configured, else category selection
                                    isActive = p.get("is_active")?.asBoolean ?: true,
                                    isConfigured = isConfigured, // Auto-detect based on credentials
                                    includeTv = p.get("include_tv")?.asBoolean ?: true,
                                    includeVod = p.get("include_vod")?.asBoolean ?: true,
                                    adultPassword = p.get("adult_password")?.takeIf { !it.isJsonNull }?.asString
                                )
                                providers.add(provider)
                            }
                            
                            // Get user ID for linking providers
                            val user = database.userDao().getUser()
                            val userId = user?.id
                            
                            // Check for duplicates before inserting
                            val existingProviders = database.providerDao().getAllProvidersList()
                            
                            var insertedCount = 0
                            var updatedCount = 0
                            
                            providers.forEach { provider ->
                                // Check if provider already exists by ID
                                val existingProvider = existingProviders.find { it.id == provider.id }
                                
                                if (existingProvider == null) {
                                    // Check if same credentials exist (different ID = multiple accounts on same portal)
                                    val sameCredentials = existingProviders.any { existing ->
                                        existing.macAddress == provider.macAddress &&
                                        existing.serverUrl == provider.serverUrl &&
                                        existing.token == provider.token
                                    }
                                    
                                    if (!sameCredentials) {
                                        // New provider - insert it
                                        val providerWithUser = provider.copy(userId = userId)
                                        database.providerDao().insertProvider(providerWithUser)
                                        insertedCount++
                                        Log.d(TAG, "✅ Inserted new provider: ${provider.name} (MAC: ${provider.macAddress})")
                                    } else {
                                        Log.d(TAG, "⏭️ Skipped provider with same credentials: ${provider.name}")
                                    }
                                } else {
                                    // Provider exists - update if not configured or if data changed
                                    if (!existingProvider.isConfigured || 
                                        existingProvider.name != provider.name ||
                                        existingProvider.serverUrl != provider.serverUrl ||
                                        existingProvider.macAddress != provider.macAddress ||
                                        existingProvider.token != provider.token) {
                                        
                                        // Keep existing user preferences, but update configuration status
                                        val updatedProvider = provider.copy(
                                            userId = existingProvider.userId,
                                            isConfigured = provider.isConfigured, // Use auto-detected status
                                            isActive = provider.isActive || existingProvider.isActive,
                                            setupStep = provider.setupStep // Update setup step based on configuration
                                        )
                                        database.providerDao().updateProvider(updatedProvider)
                                        updatedCount++
                                        Log.d(TAG, "🔄 Updated provider: ${provider.name} (configured: ${updatedProvider.isConfigured})")
                                    } else {
                                        Log.d(TAG, "⏭️ Skipped configured provider: ${provider.name}")
                                    }
                                }
                            }
                            
                            Log.d(TAG, "✅ Provider sync complete: $insertedCount new, $updatedCount updated, ${providers.size - insertedCount - updatedCount} skipped")
                        }
                        
                        // Parse and insert categories
                        val categoriesArray = data.getAsJsonArray("categories")
                        if (categoriesArray != null && categoriesArray.size() > 0) {
                            Log.d(TAG, "📂 Found ${categoriesArray.size()} categories in cloud")
                            
                            // Get existing categories to avoid duplicates
                            val existingCategories = database.categoryDao().getAllCategories()
                            
                            val categories = mutableListOf<com.ronika.iptvnative.database.entities.CategoryEntity>()
                            for (i in 0 until categoriesArray.size()) {
                                val c = categoriesArray[i].asJsonObject
                                
                                // Backend returns provider_id as UUID, map it to provider_id string
                                val backendProviderId = c.get("provider_id")?.asString ?: ""
                                val mappedProviderId = providerIdMap[backendProviderId] ?: backendProviderId
                                
                                val categoryExternalId = c.get("id")?.asString ?: ""
                                val categoryName = c.get("name")?.asString ?: ""
                                val categoryType = c.get("type")?.asString ?: "live"
                                
                                // Check if category already exists (by externalId + providerId + type)
                                val isDuplicate = existingCategories.any { existing ->
                                    existing.externalId == categoryExternalId &&
                                    existing.providerId == mappedProviderId &&
                                    existing.type == categoryType
                                }
                                
                                if (!isDuplicate) {
                                    // Generate unique ID combining provider, external ID, and type
                                    val uniqueId = "${mappedProviderId}_${categoryExternalId}_${categoryType}"
                                    
                                    val category = com.ronika.iptvnative.database.entities.CategoryEntity(
                                        id = uniqueId,
                                        providerId = mappedProviderId,
                                        externalId = categoryExternalId,
                                        name = categoryName,
                                        type = categoryType,
                                        contentType = categoryType,
                                        censored = 0,
                                        isEnabled = true
                                    )
                                    categories.add(category)
                                }
                            }
                            
                            if (categories.isNotEmpty()) {
                                database.categoryDao().upsertCategories(categories)
                                Log.d(TAG, "✅ Upserted ${categories.size} categories from cloud")

                                // Mark providers which had categories as configured and set setup step to category selection
                                val providerIds = categories.map { it.providerId }.distinct()
                                providerIds.forEach { pid ->
                                    try {
                                        val existingProvider = database.providerDao().getProviderById(pid)
                                        if (existingProvider != null) {
                                            val updatedProvider = existingProvider.copy(
                                                isConfigured = true,
                                                setupStep = 2 // SETUP_STEP_CATEGORIES
                                            )
                                            database.providerDao().updateProvider(updatedProvider)
                                            Log.d(TAG, "🔁 Updated provider ${existingProvider.name} to isConfigured=true, setupStep=2")
                                        }
                                    } catch (e: Exception) {
                                        Log.w(TAG, "⚠️ Failed to update provider setup state for $pid", e)
                                    }
                                }
                            } else {
                                Log.d(TAG, "⏭️  No categories to sync from cloud")
                            }
                        }
                        
                        // Parse and insert channels
                        val channelsArray = data.getAsJsonArray("channels")
                        if (channelsArray != null && channelsArray.size() > 0) {
                            Log.d(TAG, "📺 Found ${channelsArray.size()} channels in cloud")
                            
                            val channels = mutableListOf<com.ronika.iptvnative.database.entities.ChannelEntity>()
                            for (i in 0 until channelsArray.size()) {
                                val ch = channelsArray[i].asJsonObject
                                
                                // Find provider ID from category
                                val categoryId = ch.get("category_id")?.asString
                                var providerId = ""
                                if (categoryId != null) {
                                    val category = database.categoryDao().getCategoryById(categoryId)
                                    providerId = category?.providerId ?: ""
                                }
                                
                                val channel = com.ronika.iptvnative.database.entities.ChannelEntity(
                                    id = ch.get("id")?.asString ?: "",
                                    providerId = providerId,
                                    externalId = ch.get("id")?.asString ?: "",
                                    name = ch.get("name")?.asString ?: "",
                                    number = ch.get("stream_url")?.asString,
                                    logo = ch.get("logo_url")?.asString,
                                    cmd = ch.get("stream_url")?.asString,
                                    categoryId = categoryId,
                                    categoryName = null,
                                    epgChannelId = ch.get("epg_channel_id")?.asString,
                                    isActive = true,
                                    isFavorite = ch.get("is_favorite")?.asBoolean ?: false,
                                    createdAt = System.currentTimeMillis(),
                                    updatedAt = System.currentTimeMillis()
                                )
                                channels.add(channel)
                            }
                            
                            database.channelDao().insertAll(channels)
                            Log.d(TAG, "✅ Inserted ${channels.size} channels")
                        }
                        
                        // Parse and restore settings
                        val settingsObj = data.getAsJsonObject("settings")
                        if (settingsObj != null) {
                            Log.d(TAG, "⚙️ Restoring settings...")
                            val settingsPrefs = context.getSharedPreferences("app_settings", Context.MODE_PRIVATE)
                            val editor = settingsPrefs.edit()
                            
                            for (entry in settingsObj.entrySet()) {
                                val key = entry.key
                                val value = entry.value
                                
                                when {
                                    value.isJsonPrimitive -> {
                                        val primitive = value.asJsonPrimitive
                                        when {
                                            primitive.isBoolean -> editor.putBoolean(key, primitive.asBoolean)
                                            primitive.isNumber -> editor.putInt(key, primitive.asInt)
                                            primitive.isString -> editor.putString(key, primitive.asString)
                                        }
                                    }
                                }
                            }
                            editor.apply()
                            Log.d(TAG, "✅ Settings restored")
                        }
                        
                        // If no categories from cloud, fetch from Stalker API for each provider
                        if ((categoriesArray == null || categoriesArray.size() == 0) && 
                            providersArray != null && providersArray.size() > 0) {
                            Log.d(TAG, "📡 No categories in cloud, fetching from Stalker API...")
                            fetchCategoriesFromStalker(database)
                        }
                        
                        Log.d(TAG, "✅ All data pulled from cloud successfully")
                        return@withContext providersArray?.size() ?: 0 > 0
                    } else {
                        Log.e(TAG, "❌ Pull data response not successful")
                        return@withContext false
                    }
                } else {
                    Log.e(TAG, "❌ Pull data failed: $responseCode")
                    return@withContext false
                }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Pull data error", e)
            false
        }
    }
    
    /**
     * Fetch categories from Stalker API for providers that don't have categories
     */
    private suspend fun fetchCategoriesFromStalker(database: com.ronika.iptvnative.database.AppDatabase) = withContext(Dispatchers.IO) {
        try {
            val providers = database.providerDao().getAllProvidersList()
            
            for (provider in providers) {
                var providerHasNewCategories = false
                if (provider.type == "stalker" && provider.isConfigured) {
                    Log.d(TAG, "🔍 Fetching categories for provider: ${provider.name}")
                    
                    // Check if provider already has categories
                    val existingCategories = database.categoryDao().getCategoriesByProviderId(provider.id)
                    if (existingCategories.isNotEmpty()) {
                        Log.d(TAG, "  ✓ Provider ${provider.name} already has ${existingCategories.size} categories")
                        continue
                    }
                    
                    // Create Stalker client with existing credentials
                    val stalkerClient = com.ronika.iptvnative.api.StalkerClient(
                        portalUrl = provider.serverUrl,
                        macAddress = provider.macAddress ?: "",
                        token = provider.token ?: "",
                        serialNumber = provider.serialNumber ?: ""
                    )
                    
                    // Fetch Live TV categories
                    if (provider.includeTv) {
                        try {
                            val genresResponse = stalkerClient.getGenres()
                            Log.d(TAG, "  📺 Fetched ${genresResponse.genres.size} live TV categories")
                            
                            val categories = genresResponse.genres.map { genre ->
                                com.ronika.iptvnative.database.entities.CategoryEntity(
                                    id = "live_${provider.id}_${genre.id ?: "unknown"}",
                                    providerId = provider.id,
                                    externalId = genre.id ?: "",
                                    name = genre.title ?: genre.name ?: "Unknown",
                                    type = "live",
                                    contentType = "live",
                                    censored = genre.censored ?: 0,
                                    isEnabled = true
                                )
                            }
                            
                            if (categories.isNotEmpty()) {
                                database.categoryDao().upsertCategories(categories)
                                Log.d(TAG, "  ✅ Saved ${categories.size} live TV categories")
                                providerHasNewCategories = true
                                
                                // Sync to cloud to update external_id
                                try {
                                    syncCategoriesToCloud(provider.id, categories)
                                } catch (e: Exception) {
                                    Log.e(TAG, "  ⚠️ Failed to sync live categories to cloud: ${e.message}")
                                }
                            }
                        } catch (e: Exception) {
                            Log.e(TAG, "  ❌ Failed to fetch live TV categories: ${e.message}")
                        }
                    }
                    
                    // Fetch VOD categories
                    if (provider.includeVod) {
                        try {
                            val vodResponse = stalkerClient.getVodCategories("vod")
                            Log.d(TAG, "  🎬 Fetched ${vodResponse.genres.size} VOD categories")
                            
                            val vodCategories = vodResponse.genres.map { genre ->
                                com.ronika.iptvnative.database.entities.CategoryEntity(
                                    id = "vod_${provider.id}_${genre.id ?: "unknown"}",
                                    providerId = provider.id,
                                    externalId = genre.id ?: "",
                                    name = genre.title ?: genre.name ?: "Unknown",
                                    type = "vod",
                                    contentType = "movie",
                                    censored = genre.censored ?: 0,
                                    isEnabled = true
                                )
                            }
                            
                            if (vodCategories.isNotEmpty()) {
                                database.categoryDao().upsertCategories(vodCategories)
                                Log.d(TAG, "  ✅ Saved ${vodCategories.size} VOD categories")
                                providerHasNewCategories = true
                                
                                // Sync to cloud to update external_id
                                try {
                                    syncCategoriesToCloud(provider.id, vodCategories)
                                } catch (e: Exception) {
                                    Log.e(TAG, "  ⚠️ Failed to sync VOD categories to cloud: ${e.message}")
                                }
                            }
                        } catch (e: Exception) {
                            Log.e(TAG, "  ❌ Failed to fetch VOD categories: ${e.message}")
                        }
                    }
                    
                    // Fetch Series categories
                    if (provider.includeVod) {
                        try {
                            val seriesResponse = stalkerClient.getVodCategories("series")
                            Log.d(TAG, "  📺 Fetched ${seriesResponse.genres.size} series categories")
                            
                            val seriesCategories = seriesResponse.genres.map { genre ->
                                com.ronika.iptvnative.database.entities.CategoryEntity(
                                    id = "series_${provider.id}_${genre.id ?: "unknown"}",
                                    providerId = provider.id,
                                    externalId = genre.id ?: "",
                                    name = genre.title ?: genre.name ?: "Unknown",
                                    type = "series",
                                    contentType = "series",
                                    censored = genre.censored ?: 0,
                                    isEnabled = true
                                )
                            }
                            
                            if (seriesCategories.isNotEmpty()) {
                                database.categoryDao().upsertCategories(seriesCategories)
                                Log.d(TAG, "  ✅ Saved ${seriesCategories.size} series categories")
                                providerHasNewCategories = true
                                
                                // Sync to cloud to update external_id
                                try {
                                    syncCategoriesToCloud(provider.id, seriesCategories)
                                } catch (e: Exception) {
                                    Log.e(TAG, "  ⚠️ Failed to sync series categories to cloud: ${e.message}")
                                }
                            }
                        } catch (e: Exception) {
                            Log.e(TAG, "  ❌ Failed to fetch series categories: ${e.message}")
                        }
                    }
                    // If we saved categories for this provider, ensure provider is updated to configured + setupStep=2
                    if (providerHasNewCategories) {
                        try {
                            val existingProvider = database.providerDao().getProviderById(provider.id)
                            if (existingProvider != null) {
                                val updatedProvider = existingProvider.copy(isConfigured = true, setupStep = 2)
                                database.providerDao().updateProvider(updatedProvider)
                                Log.d(TAG, "🔁 Updated provider ${existingProvider.name} to isConfigured=true, setupStep=2 (via Stalker fetch)")
                            }
                        } catch (e: Exception) {
                            Log.w(TAG, "⚠️ Failed to update provider after Stalker category fetch: ${provider.name}", e)
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error fetching categories from Stalker: ${e.message}")
        }
    }
    
    /**
     * Sync categories to cloud backend
     */
    private suspend fun syncCategoriesToCloud(providerId: String, categories: List<com.ronika.iptvnative.database.entities.CategoryEntity>) {
        try {
            val categoryDataList = categories.map { category ->
                CategoryData(
                    categoryId = category.id,
                    externalId = category.externalId,
                    name = category.name,
                    type = category.type,
                    contentType = category.contentType,
                    censored = category.censored,
                    isEnabled = category.isEnabled
                )
            }
            
            syncCategories(providerId, categories)
            Log.d(TAG, "✅ Synced ${categories.size} categories to cloud for provider $providerId")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to sync categories to cloud: ${e.message}")
        }
    }
    
    /**
     * Sync providers from backend to local database
     * Downloads all providers for the authenticated user
     */
    suspend fun syncProvidersFromBackend(): Boolean = withContext(Dispatchers.IO) {
        try {
            Log.d(TAG, "⬇️ Syncing providers from backend...")
            
            val accessToken = prefs.getString(KEY_ACCESS_TOKEN, null)
            if (accessToken == null) {
                Log.e(TAG, "❌ Not authenticated")
                return@withContext false
            }
            
            val url = URL("$BACKEND_URL/sync/pull")
            val connection = url.openConnection() as HttpURLConnection
            
            try {
                connection.requestMethod = "GET"
                connection.setRequestProperty("Authorization", "Bearer $accessToken")
                connection.connectTimeout = 30000
                connection.readTimeout = 30000
                
                val responseCode = connection.responseCode
                if (responseCode == 200) {
                    val responseBody = connection.inputStream.bufferedReader().use { it.readText() }
                    val response = gson.fromJson(responseBody, PullSyncResponse::class.java)
                    
                    val database = com.ronika.iptvnative.database.AppDatabase.getDatabase(context)
                    val providers = response.data?.providers ?: emptyList()
                    
                    var newProviders = 0
                    var updatedProviders = 0
                    
                    for (providerData in providers) {
                        // Check if provider already exists
                        val existing = database.providerDao().getProviderById(providerData.id)
                        
                        if (existing == null) {
                            // New provider - insert it
                            val entity = ProviderEntity(
                                id = providerData.id,
                                name = providerData.name,
                                type = providerData.type,
                                serverUrl = providerData.serverUrl ?: "",
                                macAddress = providerData.macAddress,
                                serialNumber = providerData.serialNumber,
                                token = providerData.token,
                                createdAt = System.currentTimeMillis(),
                                isActive = providerData.isActive ?: true
                            )
                            database.providerDao().insertProvider(entity)
                            newProviders++
                            Log.d(TAG, "✅ Added new provider: ${providerData.name} (${providerData.type})")
                        } else {
                            // Existing provider - update if any field changed
                            val needsUpdate = existing.name != providerData.name ||
                                            existing.serverUrl != (providerData.serverUrl ?: "") ||
                                            existing.macAddress != providerData.macAddress ||
                                            existing.serialNumber != providerData.serialNumber ||
                                            existing.token != providerData.token ||
                                            existing.isActive != (providerData.isActive ?: true)
                            
                            if (needsUpdate) {
                                val updated = existing.copy(
                                    name = providerData.name,
                                    serverUrl = providerData.serverUrl ?: existing.serverUrl,
                                    macAddress = providerData.macAddress ?: existing.macAddress,
                                    serialNumber = providerData.serialNumber ?: existing.serialNumber,
                                    token = providerData.token ?: existing.token,
                                    isActive = providerData.isActive ?: existing.isActive
                                )
                                database.providerDao().updateProvider(updated)
                                updatedProviders++
                                Log.d(TAG, "✅ Updated provider: ${providerData.name}")
                            }
                        }
                    }
                    
                    Log.d(TAG, "✅ Synced providers: $newProviders new, $updatedProviders updated")
                    return@withContext true
                } else {
                    val errorBody = connection.errorStream?.bufferedReader()?.use { it.readText() } ?: ""
                    Log.e(TAG, "❌ Failed to sync providers: $responseCode - $errorBody")
                    return@withContext false
                }
            } finally {
                connection.disconnect()
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error syncing providers", e)
            return@withContext false
        }
    }
    
    /**
     * Sync provider categories from backend (full-sync endpoint)
     * This calls the /api/sync/full-sync/:providerId endpoint which:
     * 1. Fetches categories from Stalker portal
     * 2. Detects movie vs series
     * 3. Saves to backend database
     * 4. Returns stats
     */
    suspend fun syncProviderCategories(providerId: String): Boolean = withContext(Dispatchers.IO) {
        try {
            Log.d(TAG, "🔄 Syncing categories for provider: $providerId")
            
            val accessToken = prefs.getString(KEY_ACCESS_TOKEN, null)
            if (accessToken == null) {
                Log.e(TAG, "❌ Not authenticated")
                return@withContext false
            }
            
            // Get provider UUID from database
            val database = com.ronika.iptvnative.database.AppDatabase.getDatabase(context)
            val provider = database.providerDao().getProviderById(providerId)
            if (provider == null) {
                Log.e(TAG, "❌ Provider not found: $providerId")
                return@withContext false
            }
            
            // Call backend full-sync endpoint
            val url = URL("$BACKEND_URL/sync/full-sync/${provider.id}")
            val connection = url.openConnection() as HttpURLConnection
            
            try {
                connection.requestMethod = "POST"
                connection.setRequestProperty("Content-Type", "application/json")
                connection.setRequestProperty("Authorization", "Bearer $accessToken")
                connection.doOutput = true
                connection.connectTimeout = 300000 // 5 minutes for category detection
                connection.readTimeout = 300000
                
                val responseCode = connection.responseCode
                val responseBody = if (responseCode == 200) {
                    connection.inputStream.bufferedReader().use { it.readText() }
                } else {
                    connection.errorStream?.bufferedReader()?.use { it.readText() } ?: ""
                }
                
                if (responseCode == 200) {
                    val response = gson.fromJson(responseBody, SyncStatsResponse::class.java)
                    Log.d(TAG, "✅ Categories synced: ${response.stats?.categories} total")
                    Log.d(TAG, "   - Live TV: ${response.stats?.live}")
                    Log.d(TAG, "   - Movies: ${response.stats?.movies}")
                    Log.d(TAG, "   - Series: ${response.stats?.series}")
                    
                    // Now pull the categories from backend to local DB
                    downloadCategoriesFromBackend(providerId)
                    
                    return@withContext true
                } else {
                    Log.e(TAG, "❌ Failed to sync categories: $responseCode - $responseBody")
                    return@withContext false
                }
            } finally {
                connection.disconnect()
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error syncing categories", e)
            return@withContext false
        }
    }
    
    /**
     * Download categories from backend to local database
     */
    private suspend fun downloadCategoriesFromBackend(providerId: String) = withContext(Dispatchers.IO) {
        try {
            Log.d(TAG, "⬇️ Downloading categories from backend...")
            
            val accessToken = prefs.getString(KEY_ACCESS_TOKEN, null) ?: return@withContext
            
            val url = URL("$BACKEND_URL/sync/pull")
            val connection = url.openConnection() as HttpURLConnection
            
            try {
                connection.requestMethod = "GET"
                connection.setRequestProperty("Authorization", "Bearer $accessToken")
                connection.connectTimeout = 30000
                connection.readTimeout = 30000
                
                val responseCode = connection.responseCode
                if (responseCode == 200) {
                    val responseBody = connection.inputStream.bufferedReader().use { it.readText() }
                    val response = gson.fromJson(responseBody, PullSyncResponse::class.java)
                    
                    // Filter categories for this provider and save to local DB
                    val database = com.ronika.iptvnative.database.AppDatabase.getDatabase(context)
                    val categories = response.data?.categories?.filter { it.providerId == providerId } ?: emptyList()
                    
                    val entities = categories.map { category ->
                        CategoryEntity(
                            id = category.categoryId,
                            providerId = providerId,
                            externalId = category.categoryId,
                            name = category.name,
                            type = category.type,
                            contentType = category.contentType ?: "LIVE",
                            censored = category.censored,
                            isEnabled = category.isEnabled
                        )
                    }
                    
                    if (entities.isNotEmpty()) {
                        database.categoryDao().upsertCategories(entities)
                    }
                    
                    Log.d(TAG, "✅ Downloaded ${categories.size} categories to local DB")
                } else {
                    Log.e(TAG, "❌ Failed to download categories: $responseCode")
                }
            } finally {
                connection.disconnect()
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error downloading categories", e)
        }
    }
    
    /**
     * Sync FROM cloud TO local database
     * Downloads providers, settings, passwords, categories from cloud
     * Uses pullAllData which already checks for duplicates
     */
    suspend fun syncFromCloud() = withContext(Dispatchers.IO) {
        try {
            Log.d(TAG, "⬇️ Starting sync from cloud...")
            
            // Use pullAllData which handles duplicate checking
            val hasData = pullAllData(context)
            
            if (hasData) {
                Log.d(TAG, "✅ Sync from cloud completed - data merged")
            } else {
                Log.d(TAG, "⏭️ Sync from cloud completed - no new data")
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to sync from cloud: ${e.message}", e)
        }
    }
    
    /**
     * Sync TO server FROM local database
     * Uploads all local providers and categories to server
     * This is useful when user wants to backup their current data
     */
    suspend fun syncToServer(): Boolean = withContext(Dispatchers.IO) {
        try {
            if (!ensureAuthenticated()) {
                Log.e(TAG, "Cannot sync to server - not authenticated")
                return@withContext false
            }
            
            Log.d(TAG, "⬆️ Starting sync to server...")
            
            val database = com.ronika.iptvnative.database.AppDatabase.getDatabase(context)
            
            // Get all local providers
            val providers = database.providerDao().getAllProvidersList()
            Log.d(TAG, "📤 Syncing ${providers.size} providers to server...")
            
            var successCount = 0
            for (provider in providers) {
                val success = syncProvider(provider)
                if (success) {
                    successCount++
                    
                    // Sync categories for this provider
                    val categories = database.categoryDao().getCategoriesByProviderId(provider.id)
                    if (categories.isNotEmpty()) {
                        syncCategories(provider.id, categories)
                        Log.d(TAG, "📤 Synced ${categories.size} categories for ${provider.name}")
                    }
                }
            }
            
            Log.d(TAG, "✅ Sync to server completed - ${successCount}/${providers.size} providers synced")
            return@withContext successCount > 0
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to sync to server: ${e.message}", e)
            return@withContext false
        }
    }
    
    // Data classes for sync responses
    data class SyncStatsResponse(
        val success: Boolean,
        val stats: SyncStats?
    )
    
    data class SyncStats(
        val categories: Int,
        val live: Int,
        val movies: Int,
        val series: Int
    )
    
    data class PullSyncResponse(
        val success: Boolean,
        val data: PullSyncData?
    )
    
    data class PullSyncData(
        val providers: List<ProviderData>?,
        val categories: List<CategoryPullData>?,
        val channels: List<ChannelData>?,
        val settings: Map<String, Any>?,
        val progress: List<Any>?
    )
    
    data class ProviderData(
        val id: String,
        @SerializedName("provider_id") val providerId: String,
        @SerializedName("user_id") val userId: String?,
        val name: String,
        val type: String,
        @SerializedName("server_url") val serverUrl: String?,
        @SerializedName("mac_address") val macAddress: String?,
        @SerializedName("serial_number") val serialNumber: String?,
        val token: String?,
        val username: String?,
        val password: String?,
        @SerializedName("is_active") val isActive: Boolean?,
        @SerializedName("is_configured") val isConfigured: Boolean?,
        @SerializedName("created_at") val createdAt: String?,
        @SerializedName("synced_at") val syncedAt: String?
    )
    
    data class CategoryPullData(
        val id: String,
        @SerializedName("category_id") val categoryId: String,
        @SerializedName("provider_id") val providerId: String,
        val name: String,
        val type: String,
        @SerializedName("content_type") val contentType: String?,
        val censored: Int,
        @SerializedName("is_enabled") val isEnabled: Boolean,
        @SerializedName("sort_order") val sortOrder: Int?
    )
}
