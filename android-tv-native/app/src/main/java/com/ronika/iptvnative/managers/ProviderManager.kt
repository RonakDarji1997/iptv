package com.ronika.iptvnative.managers

import android.content.Context
import android.util.Log
import com.ronika.iptvnative.api.StalkerClient
import com.ronika.iptvnative.database.AppDatabase
import com.ronika.iptvnative.database.entities.ProviderEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext

/**
 * Singleton manager for provider credentials
 * All API clients should use this to get provider credentials instead of hardcoding
 */
object ProviderManager {
    
    private const val TAG = "ProviderManager"
    
    private var cachedProvider: ProviderEntity? = null
    private var cachedClient: StalkerClient? = null
    
    /**
     * Initialize with context - call this early in app lifecycle
     */
    suspend fun initialize(context: Context) {
        withContext(Dispatchers.IO) {
            val database = AppDatabase.getDatabase(context)
            cachedProvider = database.providerDao().getActiveProvider()
            Log.d(TAG, "Initialized with provider: ${cachedProvider?.name}")
        }
    }
    
    /**
     * Get the active provider (blocking for Java compat)
     */
    fun getActiveProviderBlocking(context: Context): ProviderEntity? {
        cachedProvider?.let { return it }
        
        return runBlocking {
            val database = AppDatabase.getDatabase(context)
            val provider = database.providerDao().getActiveProvider()
            cachedProvider = provider
            provider
        }
    }
    
    /**
     * Get the active provider (suspend)
     */
    suspend fun getActiveProvider(context: Context): ProviderEntity? {
        cachedProvider?.let { return it }
        
        return withContext(Dispatchers.IO) {
            val database = AppDatabase.getDatabase(context)
            val provider = database.providerDao().getActiveProvider()
            cachedProvider = provider
            provider
        }
    }
    
    /**
     * Get or create a StalkerClient for the active provider
     */
    suspend fun getStalkerClient(context: Context): StalkerClient {
        val provider = getActiveProvider(context)
            ?: throw Exception("No active provider configured")
        
        // Return cached client if same provider
        cachedClient?.let { client ->
            if (client.portalUrl == provider.serverUrl) {
                return client
            }
        }
        
        // Create new client
        val client = StalkerClient(
            portalUrl = provider.serverUrl,
            macAddress = provider.macAddress ?: "",
            token = provider.token ?: "",
            serialNumber = provider.serialNumber ?: ""
        )
        cachedClient = client
        Log.d(TAG, "Created StalkerClient for ${provider.name}: ${provider.serverUrl}")
        return client
    }
    
    /**
     * Get StalkerClient (blocking for Java compat)
     */
    fun getStalkerClientBlocking(context: Context): StalkerClient {
        return runBlocking { getStalkerClient(context) }
    }
    
    /**
     * Get the base URL for the active provider
     */
    fun getBaseUrl(context: Context): String {
        val provider = getActiveProviderBlocking(context)
        val serverUrl = provider?.serverUrl ?: "http://tv.stream4k.cc"
        return serverUrl.trimEnd('/').let {
            if (it.contains("/stalker_portal")) {
                it.substringBefore("/stalker_portal")
            } else {
                it
            }
        }
    }
    
    /**
     * Get image URL with correct base
     */
    fun getImageUrl(context: Context, imagePath: String): String {
        if (imagePath.startsWith("http")) return imagePath
        val baseUrl = getBaseUrl(context)
        return "$baseUrl$imagePath"
    }
    
    /**
     * Get the token for the active provider
     */
    fun getToken(context: Context): String {
        return getActiveProviderBlocking(context)?.token ?: ""
    }
    
    /**
     * Get the MAC address for the active provider
     */
    fun getMacAddress(context: Context): String {
        return getActiveProviderBlocking(context)?.macAddress ?: ""
    }
    
    /**
     * Clear cached data (call when provider changes)
     */
    fun clearCache() {
        cachedProvider = null
        cachedClient = null
        Log.d(TAG, "Cache cleared")
    }
    
    /**
     * Refresh the cached provider from database
     */
    suspend fun refresh(context: Context) {
        clearCache()
        initialize(context)
    }
}
