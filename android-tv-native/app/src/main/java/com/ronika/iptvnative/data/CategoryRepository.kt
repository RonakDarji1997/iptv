package com.ronika.iptvnative.data

import android.content.Context
import android.util.Log
import com.ronika.iptvnative.api.StalkerClient
import com.ronika.iptvnative.models.Genre
import com.ronika.iptvnative.models.Category
import com.ronika.iptvnative.database.AppDatabase
import com.ronika.iptvnative.database.entities.CategoryEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.withTimeout
import java.util.UUID

/**
 * Manages category data - DB is source of truth, API used for sync
 * 
 * Flow:
 * 1. PortalSetupActivity saves all categories to DB during initial setup
 * 2. User selects which categories they want (saved as selectedIds in provider)
 * 3. getLiveTVGenres/getMovieCategories/getSeriesCategories reads from DB and filters by selectedIds
 * 4. syncCategories() syncs DB with API:
 *    - Adds new categories to DB
 *    - AUTO-ADDS new category IDs to provider's selected list (show everything unless explicitly deselected)
 *    - Removes deleted categories from DB
 */
class CategoryRepository(private val context: Context) {
    
    private val TAG = "CategoryRepository"
    
    // Database
    private val database = AppDatabase.getDatabase(context)
    private val categoryDao = database.categoryDao()
    private val providerDao = database.providerDao()
    
    // Stalker Portal client - initialized lazily with provider credentials
    private var stalkerClient: StalkerClient? = null
    
    /**
     * Get the active provider and create client if needed
     */
    private suspend fun getOrCreateClient(): StalkerClient {
        val provider = providerDao.getActiveProvider()
            ?: throw Exception("No active provider configured")
        
        // Return existing client if it matches the provider
        stalkerClient?.let { 
            if (it.portalUrl == provider.serverUrl) return it 
        }
        
        // Create new client with provider credentials
        val client = StalkerClient(
            portalUrl = provider.serverUrl,
            macAddress = provider.macAddress ?: "",
            token = provider.token ?: "",
            serialNumber = provider.serialNumber ?: ""
        )
        stalkerClient = client
        return client
    }
    
    /**
     * Get the active provider ID
     */
    private suspend fun getActiveProviderId(): String {
        val provider = providerDao.getActiveProvider()
        return provider?.id ?: "default"
    }
    
    /**
     * Get Live TV genres/categories from database
     * Only returns categories where isEnabled = true
     */
    suspend fun getLiveTVGenres(forceRefresh: Boolean = false): Result<List<String>> {
        return withContext(Dispatchers.IO) {
            try {
                // Get enabled LIVE categories from database
                val dbCategories = categoryDao.getEnabledCategoriesByType("LIVE")
                Log.d(TAG, "DB has ${dbCategories.size} enabled LIVE categories")
                
                if (dbCategories.isEmpty()) {
                    Log.w(TAG, "No Live TV categories in database - need to sync first")
                    return@withContext Result.success(emptyList())
                }
                
                // Move censored (adult) categories to bottom
                val nonCensored = dbCategories.filter { it.censored == 0 }.map { it.name }
                val censored = dbCategories.filter { it.censored == 1 }.map { it.name }
                val sortedNames = nonCensored + censored
                
                Log.d(TAG, "Returning ${sortedNames.size} Live TV genres (${nonCensored.size} normal + ${censored.size} adult)")
                Result.success(sortedNames)
            } catch (e: Exception) {
                Log.e(TAG, "Error getting Live TV genres", e)
                Result.failure(e)
            }
        }
    }
    
    /**
     * Get Movie categories from database
     * Only returns categories where isEnabled = true
     */
    suspend fun getMovieCategories(forceRefresh: Boolean = false): Result<List<String>> {
        return withContext(Dispatchers.IO) {
            try {
                // Get enabled MOVIE categories from database
                val dbCategories = categoryDao.getEnabledCategoriesByType("MOVIE")
                Log.d(TAG, "DB has ${dbCategories.size} enabled MOVIE categories")
                
                if (dbCategories.isEmpty()) {
                    Log.w(TAG, "No movie categories in database - need to sync first")
                    return@withContext Result.success(emptyList())
                }
                
                // Sort: non-censored first, then censored (adult) at the end
                val sorted = dbCategories.sortedBy { it.censored }
                val names = sorted.map { it.name }
                
                Log.d(TAG, "Returning ${names.size} movie categories")
                Result.success(names)
            } catch (e: Exception) {
                Log.e(TAG, "Error getting movie categories", e)
                Result.failure(e)
            }
        }
    }
    
    /**
     * Get Series categories from database
     * Only returns categories where isEnabled = true
     */
    suspend fun getSeriesCategories(forceRefresh: Boolean = false): Result<List<String>> {
        return withContext(Dispatchers.IO) {
            try {
                // Get enabled SERIES categories from database
                val dbCategories = categoryDao.getEnabledCategoriesByType("SERIES")
                Log.d(TAG, "DB has ${dbCategories.size} enabled SERIES categories")
                
                if (dbCategories.isEmpty()) {
                    Log.w(TAG, "No series categories in database - need to sync first")
                    return@withContext Result.success(emptyList())
                }
                
                // Sort: non-censored first, then censored (adult) at the end
                val sorted = dbCategories.sortedBy { it.censored }
                val names = sorted.map { it.name }
                
                Log.d(TAG, "Returning ${names.size} series categories")
                Result.success(names)
            } catch (e: Exception) {
                Log.e(TAG, "Error getting series categories", e)
                Result.failure(e)
            }
        }
    }
    
    /**
     * Sync categories for ALL configured providers on app startup
     * - Adds new categories from API that don't exist in DB
     * - Removes categories from DB that no longer exist in API
     * Called on app load to keep ALL providers in sync
     */
    suspend fun syncAllProviderCategories(): Result<Unit> {
        return withContext(Dispatchers.IO) {
            try {
                val allProviders = providerDao.getAllProvidersList()
                    .filter { it.isConfigured && it.token != null }
                
                Log.d(TAG, "Starting category sync for ${allProviders.size} providers...")
                
                for (provider in allProviders) {
                    try {
                        Log.d(TAG, "Syncing categories for provider: ${provider.name} (${provider.id})")
                        
                        // Create client for this provider
                        val client = StalkerClient(
                            provider.serverUrl,
                            provider.macAddress ?: "",
                            provider.token ?: "",
                            provider.serialNumber ?: ""
                        )
                        
                        // Sync Live TV categories for this provider
                        syncLiveTVCategoriesForProvider(client, provider.id)
                        
                        // Sync VOD categories for this provider
                        syncVODCategoriesForProvider(client, provider.id)
                        
                        Log.d(TAG, "Completed sync for provider: ${provider.name}")
                    } catch (e: Exception) {
                        Log.e(TAG, "Error syncing provider ${provider.name}", e)
                        // Continue with other providers
                    }
                }
                
                Log.d(TAG, "Category sync ALL providers completed")
                Result.success(Unit)
            } catch (e: Exception) {
                Log.e(TAG, "Error during category sync all providers", e)
                Result.failure(e)
            }
        }
    }
    
    /**
     * Sync Live TV categories for a specific provider
     * CONSERVATIVE SYNC: Only deletes categories confirmed NOT in API response
     * Safety: Won't delete if API returns empty or error
     */
    private suspend fun syncLiveTVCategoriesForProvider(client: StalkerClient, providerId: String) {
        Log.d(TAG, "🔄 Syncing Live TV categories for provider: $providerId")
        
        try {
            // Fetch from API
            val response = client.getGenres()
            val apiGenres = response.genres.filter { it.id != "*" && it.id != "dvb" }
            val apiIds = apiGenres.map { it.id }.toSet()
            
            Log.d(TAG, "📡 API returned ${apiGenres.size} Live TV categories for provider $providerId")
            
            // Safety check: Don't proceed if API returned empty or suspiciously few categories
            if (apiGenres.isEmpty()) {
                Log.w(TAG, "⚠️ API returned 0 Live TV categories - skipping sync to prevent data loss")
                return
            }
            
            // Get existing from DB for THIS provider only
            val dbCategories = categoryDao.getCategoriesByProviderAndType(providerId, "LIVE")
            val dbIds = dbCategories.map { it.externalId }.toSet()
            
            Log.d(TAG, "💾 DB has ${dbCategories.size} Live TV categories for provider $providerId")
            
            // Check if IDs match exactly - skip if no changes
            if (apiIds == dbIds) {
                Log.d(TAG, "✅ Live TV categories unchanged for provider $providerId (${apiIds.size} categories match)")
                return
            }
            
            // Find new categories to add (in API but not in DB)
            val newGenres = apiGenres.filter { !dbIds.contains(it.id) }
            if (newGenres.isNotEmpty()) {
                Log.d(TAG, "➕ Adding ${newGenres.size} new Live TV categories: ${newGenres.map { it.title }}")
                val entities = newGenres.map { genre ->
                    CategoryEntity(
                        id = UUID.randomUUID().toString(),
                        providerId = providerId,
                        externalId = genre.id,
                        name = genre.getDisplayName(),
                        title = genre.title,
                        contentType = "live",
                        type = "LIVE",
                        alias = genre.alias,
                        censored = genre.censored ?: 0,
                        isEnabled = true
                    )
                }
                categoryDao.insertAll(entities)
                Log.d(TAG, "✅ Added ${newGenres.size} new Live TV categories for provider $providerId")
            }
            
            // Find categories to remove (in DB but NOT in API)
            // Only delete if we're CERTAIN they don't exist in API
            val removedIds = dbIds - apiIds
            if (removedIds.isNotEmpty()) {
                // Get names for logging
                val removedCategories = dbCategories.filter { removedIds.contains(it.externalId) }
                Log.d(TAG, "➖ Removing ${removedIds.size} stale Live TV categories not in API: ${removedCategories.map { it.name }}")
                
                for (externalId in removedIds) {
                    categoryDao.deleteByExternalIdAndProvider(externalId, providerId)
                }
                Log.d(TAG, "✅ Removed ${removedIds.size} stale Live TV categories for provider $providerId")
            } else {
                Log.d(TAG, "✅ No Live TV categories to remove - all DB categories exist in API")
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error syncing Live TV categories for provider $providerId - skipping to prevent data loss", e)
            // Don't throw - just skip this provider's sync
        }
    }
    
    /**
     * Sync VOD categories for a specific provider
     * CONSERVATIVE SYNC: Only deletes categories confirmed NOT in API response
     * Safety: Won't delete if API returns empty or error
     */
    private suspend fun syncVODCategoriesForProvider(client: StalkerClient, providerId: String) {
        Log.d(TAG, "🔄 Syncing VOD categories for provider: $providerId")
        
        try {
            val response = client.getVodCategories()
            val apiCategories = response.genres.filter { it.id != "*" && it.id != "dvb" }
            val apiIds = apiCategories.map { it.id }.toSet()
            
            Log.d(TAG, "📡 API returned ${apiCategories.size} VOD categories for provider $providerId")
            
            // Safety check: Don't proceed if API returned empty or suspiciously few categories
            if (apiCategories.isEmpty()) {
                Log.w(TAG, "⚠️ API returned 0 VOD categories - skipping sync to prevent data loss")
                return
            }
            
            // Get existing VOD categories (both MOVIE and SERIES) for this provider
            val dbMovies = categoryDao.getCategoriesByProviderAndType(providerId, "MOVIE")
            val dbSeries = categoryDao.getCategoriesByProviderAndType(providerId, "SERIES")
            val dbVOD = dbMovies + dbSeries
            val dbIds = dbVOD.map { it.externalId }.toSet()
            
            Log.d(TAG, "💾 DB has ${dbVOD.size} VOD categories for provider $providerId (${dbMovies.size} movies, ${dbSeries.size} series)")
            
            // Check if IDs match exactly - skip if no changes
            if (apiIds == dbIds) {
                Log.d(TAG, "✅ VOD categories unchanged for provider $providerId (${apiIds.size} categories match)")
                return
            }
            
            // Find new categories to add (in API but not in DB)
            val newCategories = apiCategories.filter { !dbIds.contains(it.id) }
            if (newCategories.isNotEmpty()) {
                Log.d(TAG, "➕ Found ${newCategories.size} new VOD categories to classify: ${newCategories.map { it.title }}")
                
                // Identify each new category as movie or series
                val categorizedNew = coroutineScope {
                    newCategories.map { genre ->
                        async(Dispatchers.IO) {
                            try {
                                // Use timeout to prevent hanging
                                withTimeout(5000L) {
                                    val itemsResponse = client.getVodItems(genre.id, page = 1)
                                    val items = itemsResponse.items.data
                                    
                                    if (items.isEmpty()) {
                                        Log.d(TAG, "Category ${genre.title} is empty, defaulting to MOVIE")
                                        CategoryEntity(
                                            id = UUID.randomUUID().toString(),
                                            providerId = providerId,
                                            externalId = genre.id,
                                            name = genre.getDisplayName(),
                                            title = genre.title,
                                            contentType = "movie",
                                            type = "MOVIE",
                                            alias = genre.alias,
                                            censored = genre.censored ?: 0,
                                            isEnabled = true
                                        )
                                    } else {
                                        val isSeries = items.take(3).any { it.isSeries == "1" }
                                        val type = if (isSeries) "SERIES" else "MOVIE"
                                        val contentType = if (isSeries) "series" else "movie"
                                        
                                        Log.d(TAG, "✓ ${genre.title} classified as $type")
                                        CategoryEntity(
                                            id = UUID.randomUUID().toString(),
                                            providerId = providerId,
                                            externalId = genre.id,
                                            name = genre.getDisplayName(),
                                            title = genre.title,
                                            contentType = contentType,
                                            type = type,
                                            alias = genre.alias,
                                            censored = genre.censored ?: 0,
                                            isEnabled = true
                                        )
                                    }
                                }
                            } catch (e: Exception) {
                                Log.e(TAG, "Error identifying category ${genre.title}: ${e.message}")
                                null
                            }
                        }
                    }.awaitAll()
                }
                
                val entitiesToInsert = categorizedNew.filterNotNull()
                if (entitiesToInsert.isNotEmpty()) {
                    categoryDao.insertAll(entitiesToInsert)
                    val movieCount = entitiesToInsert.count { it.type == "MOVIE" }
                    val seriesCount = entitiesToInsert.count { it.type == "SERIES" }
                    Log.d(TAG, "✅ Added ${entitiesToInsert.size} new VOD categories ($movieCount movies, $seriesCount series)")
                } else {
                    Log.w(TAG, "⚠️ Failed to classify any of the ${newCategories.size} new categories")
                }
            }
            
            // Find categories to remove (in DB but NOT in API)
            // Only delete if we're CERTAIN they don't exist in API
            val removedIds = dbIds.subtract(apiIds)
            if (removedIds.isNotEmpty()) {
                // Get names for logging
                val removedCategories = dbVOD.filter { removedIds.contains(it.externalId) }
                Log.d(TAG, "➖ Removing ${removedIds.size} stale VOD categories not in API: ${removedCategories.map { "${it.name} (${it.type})" }}")
                
                for (externalId in removedIds) {
                    categoryDao.deleteByExternalIdAndProvider(externalId, providerId)
                }
                Log.d(TAG, "✅ Removed ${removedIds.size} stale VOD categories for provider $providerId")
            } else {
                Log.d(TAG, "✅ No VOD categories to remove - all DB categories exist in API")
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error syncing VOD categories for provider $providerId - skipping to prevent data loss", e)
            // Don't throw - just skip this provider's sync
        }
    }
    
    /**
     * Sync all categories from API to database (for active provider only)
     * - Adds new categories from API that don't exist in DB
     * - Removes categories from DB that no longer exist in API
     * Called on app load to keep DB in sync with portal
     * @deprecated Use syncAllProviderCategories() instead
     */
    suspend fun syncCategories(): Result<Unit> {
        return withContext(Dispatchers.IO) {
            try {
                Log.d(TAG, "Starting category sync with API...")
                val client = getOrCreateClient()
                val activeProviderId = getActiveProviderId()
                
                // Sync Live TV categories
                syncLiveTVCategories(client, activeProviderId)
                
                // Sync VOD categories (movies + series)
                syncVODCategoriesInternal(client, activeProviderId)
                
                Log.d(TAG, "Category sync completed successfully")
                Result.success(Unit)
            } catch (e: Exception) {
                Log.e(TAG, "Error syncing categories", e)
                Result.failure(e)
            }
        }
    }
    
    /**
     * Sync Live TV categories with API
     * New categories are added with isEnabled = true (shown by default)
     */
    private suspend fun syncLiveTVCategories(client: StalkerClient, providerId: String) {
        Log.d(TAG, "Syncing Live TV categories...")
        
        // Fetch from API
        val response = client.getGenres()
        val apiGenres = response.genres.filter { it.id != "*" && it.id != "dvb" }
        val apiIds = apiGenres.map { it.id }.toSet()
        
        Log.d(TAG, "API has ${apiGenres.size} Live TV categories")
        
        // Get existing from DB
        val dbCategories = categoryDao.getCategoriesByType("LIVE")
        val dbIds = dbCategories.map { it.externalId }.toSet()
        
        Log.d(TAG, "DB has ${dbCategories.size} Live TV categories")
        
        // Check if counts match - skip if no changes
        if (apiIds == dbIds) {
            Log.d(TAG, "Live TV categories unchanged, skipping sync")
            return
        }
        
        // Find new categories to add (isEnabled = true by default)
        val newGenres = apiGenres.filter { !dbIds.contains(it.id) }
        if (newGenres.isNotEmpty()) {
            val entities = newGenres.map { genre ->
                CategoryEntity(
                    id = UUID.randomUUID().toString(),
                    providerId = providerId,
                    externalId = genre.id,
                    name = genre.getDisplayName(),
                    title = genre.title,
                    contentType = "live",
                    type = "LIVE",
                    alias = genre.alias,
                    censored = genre.censored ?: 0,
                    isEnabled = true // New categories shown by default
                )
            }
            categoryDao.insertAll(entities)
            Log.d(TAG, "Added ${newGenres.size} new Live TV categories (isEnabled=true)")
            // Verify insert
            val verifyCount = categoryDao.getCountByType("LIVE")
            Log.d(TAG, "Verify: DB now has $verifyCount LIVE categories after insert")
        }
        
        // Find categories to remove (exist in DB but not in API)
        val removedIds = dbIds - apiIds
        if (removedIds.isNotEmpty()) {
            val categoriesToRemove = dbCategories.filter { removedIds.contains(it.externalId) }
            categoriesToRemove.forEach { categoryDao.delete(it) }
            Log.d(TAG, "Removed ${removedIds.size} deleted Live TV categories")
        }
    }
    
    /**
     * Sync VOD categories (movies + series) with API
     * New categories are added with isEnabled = true (shown by default)
     */
    private suspend fun syncVODCategoriesInternal(client: StalkerClient, providerId: String) {
        Log.d(TAG, "Syncing VOD categories...")
        
        // Fetch from API
        val response = client.getVodCategories()
        val apiCategories = response.genres.filter { it.id != "*" && it.id != "dvb" }
        val apiIds = apiCategories.map { it.id }.toSet()
        
        Log.d(TAG, "API has ${apiCategories.size} VOD categories")
        
        // Get existing from DB (both MOVIE and SERIES)
        val dbMovies = categoryDao.getCategoriesByType("MOVIE")
        val dbSeries = categoryDao.getCategoriesByType("SERIES")
        val dbVOD = dbMovies + dbSeries
        val dbIds = dbVOD.map { it.externalId }.toSet()
        
        Log.d(TAG, "DB has ${dbVOD.size} VOD categories (${dbMovies.size} movies, ${dbSeries.size} series)")
        
        // Check if counts match - skip if no changes
        if (apiIds == dbIds) {
            Log.d(TAG, "VOD categories unchanged, skipping sync")
            return
        }
        
        // Find new categories to add (isEnabled = true by default)
        val newCategories = apiCategories.filter { !dbIds.contains(it.id) }
        if (newCategories.isNotEmpty()) {
            Log.d(TAG, "Found ${newCategories.size} new VOD categories to identify...")
            
            // Identify each new category as movie or series
            val categorizedNew = coroutineScope {
                newCategories.map { genre ->
                    async(Dispatchers.IO) {
                        try {
                            val itemsResponse = client.getVodItems(genre.id, page = 1)
                            val items = itemsResponse.items.data
                            
                            if (items.isEmpty()) {
                                Log.d(TAG, "Category ${genre.title} is empty, skipping")
                                null
                            } else {
                                val isSeries = items.take(3).any { it.isSeries == "1" }
                                val type = if (isSeries) "SERIES" else "MOVIE"
                                val contentType = if (isSeries) "series" else "movie"
                                
                                CategoryEntity(
                                    id = UUID.randomUUID().toString(),
                                    providerId = providerId,
                                    externalId = genre.id,
                                    name = genre.getDisplayName(),
                                    title = genre.title,
                                    contentType = contentType,
                                    type = type,
                                    alias = genre.alias,
                                    censored = genre.censored ?: 0,
                                    isEnabled = true // New categories shown by default
                                )
                            }
                        } catch (e: Exception) {
                            Log.e(TAG, "Error identifying category ${genre.title}", e)
                            null
                        }
                    }
                }.awaitAll()
            }
            
            val entitiesToInsert = categorizedNew.filterNotNull()
            if (entitiesToInsert.isNotEmpty()) {
                categoryDao.insertAll(entitiesToInsert)
                val movieCount = entitiesToInsert.count { it.type == "MOVIE" }
                val seriesCount = entitiesToInsert.count { it.type == "SERIES" }
                Log.d(TAG, "Added ${entitiesToInsert.size} new VOD categories (isEnabled=true) - $movieCount movies, $seriesCount series")
            }
        }
        
        // Find categories to remove (exist in DB but not in API)
        val removedIds = dbIds - apiIds
        if (removedIds.isNotEmpty()) {
            val categoriesToRemove = dbVOD.filter { removedIds.contains(it.externalId) }
            categoriesToRemove.forEach { categoryDao.delete(it) }
            Log.d(TAG, "Removed ${removedIds.size} deleted VOD categories")
        }
    }
    
    /**
     * Sync VOD categories from API to database on app load
     * @deprecated Use syncCategories() instead
     */
    suspend fun syncVODCategories(): Result<Unit> {
        return syncCategories()
    }
    
    /**
     * Full resync - re-fetches from API and re-classifies VOD categories
     * PRESERVES isEnabled state from existing categories
     * Used when user wants to fix misclassified categories
     */
    suspend fun fullResync(): Result<Unit> {
        return withContext(Dispatchers.IO) {
            try {
                Log.d(TAG, "Starting FULL resync - preserving isEnabled state...")
                val client = getOrCreateClient()
                val activeProviderId = getActiveProviderId()
                
                // Get existing isEnabled states BEFORE deleting
                val existingCategories = categoryDao.getCategoriesByProviderId(activeProviderId)
                val enabledStateMap = existingCategories.associate { it.externalId to it.isEnabled }
                Log.d(TAG, "Preserved isEnabled state for ${enabledStateMap.size} categories")
                
                // Delete all categories for this provider
                categoryDao.deleteByProviderId(activeProviderId)
                Log.d(TAG, "Deleted all categories for provider $activeProviderId")
                
                // Re-sync Live TV categories (preserving isEnabled)
                fullResyncLiveTVCategories(client, activeProviderId, enabledStateMap)
                
                // Re-sync VOD categories with fresh classification (preserving isEnabled)
                fullResyncVODCategories(client, activeProviderId, enabledStateMap)
                
                Log.d(TAG, "Full resync completed successfully")
                Result.success(Unit)
            } catch (e: Exception) {
                Log.e(TAG, "Error during full resync", e)
                Result.failure(e)
            }
        }
    }
    
    /**
     * Full resync ALL configured providers - re-fetches from API for each provider
     * PRESERVES isEnabled state from existing categories
     */
    suspend fun fullResyncAllProviders(): Result<Unit> {
        return withContext(Dispatchers.IO) {
            try {
                val allProviders = providerDao.getAllProvidersList()
                    .filter { it.isConfigured && it.token != null }
                
                Log.d(TAG, "Starting FULL resync for ${allProviders.size} providers...")
                
                for (provider in allProviders) {
                    try {
                        Log.d(TAG, "Resyncing provider: ${provider.name} (${provider.id})")
                        
                        // Create client for this provider (token is passed in constructor)
                        val client = StalkerClient(
                            provider.serverUrl,
                            provider.macAddress ?: "",
                            provider.token ?: "",
                            provider.serialNumber ?: ""
                        )
                        
                        // Get existing isEnabled states BEFORE deleting
                        val existingCategories = categoryDao.getCategoriesByProviderId(provider.id)
                        val enabledStateMap = existingCategories.associate { it.externalId to it.isEnabled }
                        Log.d(TAG, "Preserved isEnabled state for ${enabledStateMap.size} categories")
                        
                        // Delete all categories for this provider
                        categoryDao.deleteByProviderId(provider.id)
                        
                        // Re-sync Live TV categories (preserving isEnabled)
                        fullResyncLiveTVCategories(client, provider.id, enabledStateMap)
                        
                        // Re-sync VOD categories with fresh classification (preserving isEnabled)
                        fullResyncVODCategories(client, provider.id, enabledStateMap)
                        
                        Log.d(TAG, "Completed resync for provider: ${provider.name}")
                    } catch (e: Exception) {
                        Log.e(TAG, "Error resyncing provider ${provider.name}", e)
                        // Continue with other providers
                    }
                }
                
                Log.d(TAG, "Full resync ALL providers completed")
                Result.success(Unit)
            } catch (e: Exception) {
                Log.e(TAG, "Error during full resync all providers", e)
                Result.failure(e)
            }
        }
    }
    
    /**
     * Full resync of Live TV categories - preserves isEnabled state
     */
    private suspend fun fullResyncLiveTVCategories(client: StalkerClient, providerId: String, enabledStateMap: Map<String, Boolean>) {
        Log.d(TAG, "Full resync Live TV categories...")
        
        val response = client.getGenres()
        val apiGenres = response.genres.filter { it.id != "*" && it.id != "dvb" }
        
        val entities = apiGenres.map { genre ->
            CategoryEntity(
                id = UUID.randomUUID().toString(),
                providerId = providerId,
                externalId = genre.id,
                name = genre.getDisplayName(),
                title = genre.title,
                contentType = "live",
                type = "LIVE",
                alias = genre.alias,
                censored = genre.censored ?: 0,
                // Preserve existing isEnabled state, default to true for new categories
                isEnabled = enabledStateMap[genre.id] ?: true
            )
        }
        
        categoryDao.insertAll(entities)
        val preserved = entities.count { enabledStateMap.containsKey(it.externalId) }
        val newCount = entities.size - preserved
        Log.d(TAG, "Added ${entities.size} Live TV categories ($preserved preserved state, $newCount new)")
    }
    
    /**
     * Full resync of VOD categories - fetches page 1 for EACH category to check is_series
     * PRESERVES isEnabled state from existing categories
     */
    private suspend fun fullResyncVODCategories(client: StalkerClient, providerId: String, enabledStateMap: Map<String, Boolean> = emptyMap()) {
        Log.d(TAG, "Full resync VOD categories - fetching page 1 for each to check is_series...")
        
        // Fetch all categories from API
        val response = client.getVodCategories()
        val apiCategories = response.genres.filter { it.id != "*" && it.id != "dvb" }
        
        Log.d(TAG, "API has ${apiCategories.size} VOD categories to classify")
        
        // Classify each category by fetching page 1 and checking is_series
        val categorizedEntities = coroutineScope {
            apiCategories.map { genre ->
                async(Dispatchers.IO) {
                    try {
                        val itemsResponse = client.getVodItems(genre.id, page = 1)
                        val items = itemsResponse.items.data
                        
                        // Preserve existing isEnabled state, default to true for new categories
                        val isEnabled = enabledStateMap[genre.id] ?: true
                        
                        if (items.isEmpty()) {
                            Log.d(TAG, "Category ${genre.title} is empty, defaulting to MOVIE")
                            // Empty categories default to MOVIE
                            CategoryEntity(
                                id = UUID.randomUUID().toString(),
                                providerId = providerId,
                                externalId = genre.id,
                                name = genre.getDisplayName(),
                                title = genre.title,
                                contentType = "movie",
                                type = "MOVIE",
                                alias = genre.alias,
                                censored = genre.censored ?: 0,
                                isEnabled = isEnabled
                            )
                        } else {
                            // Check is_series on first 3 items
                            val isSeries = items.take(3).any { it.isSeries == "1" }
                            val type = if (isSeries) "SERIES" else "MOVIE"
                            val contentType = if (isSeries) "series" else "movie"
                            
                            Log.d(TAG, "Category ${genre.title}: is_series=${isSeries} -> $type (isEnabled=$isEnabled)")
                            
                            CategoryEntity(
                                id = UUID.randomUUID().toString(),
                                providerId = providerId,
                                externalId = genre.id,
                                name = genre.getDisplayName(),
                                title = genre.title,
                                contentType = contentType,
                                type = type,
                                alias = genre.alias,
                                censored = genre.censored ?: 0,
                                isEnabled = isEnabled
                            )
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Error classifying category ${genre.title}, defaulting to MOVIE", e)
                        val isEnabled = enabledStateMap[genre.id] ?: true
                        // On error, default to MOVIE
                        CategoryEntity(
                            id = UUID.randomUUID().toString(),
                            providerId = providerId,
                            externalId = genre.id,
                            name = genre.getDisplayName(),
                            title = genre.title,
                            contentType = "movie",
                            type = "MOVIE",
                            alias = genre.alias,
                            censored = genre.censored ?: 0,
                            isEnabled = isEnabled
                        )
                    }
                }
            }.awaitAll()
        }
        
        // Insert all categories
        categoryDao.insertAll(categorizedEntities)
        
        val movieCount = categorizedEntities.count { it.type == "MOVIE" }
        val seriesCount = categorizedEntities.count { it.type == "SERIES" }
        val disabledCount = categorizedEntities.count { !it.isEnabled }
        Log.d(TAG, "Full resync complete: ${categorizedEntities.size} VOD categories ($movieCount movies, $seriesCount series, $disabledCount disabled)")
    }
    
    /**
     * Clear all cached data from database
     */
    suspend fun clearCache() {
        withContext(Dispatchers.IO) {
            categoryDao.deleteAll()
            Log.d(TAG, "Database cache cleared")
        }
    }
    
    /**
     * Check if a category is censored (adult content)
     * @param categoryName The name of the category
     * @param type The type: "LIVE", "MOVIE", or "SERIES"
     * @return true if the category is censored/adult
     */
    suspend fun isCategoryCensored(categoryName: String, type: String): Boolean {
        return withContext(Dispatchers.IO) {
            val category = categoryDao.getCategoryByName(categoryName, type)
            category?.censored == 1
        }
    }
}
