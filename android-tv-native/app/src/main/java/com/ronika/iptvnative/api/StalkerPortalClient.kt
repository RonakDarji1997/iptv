package com.ronika.iptvnative.api

import android.util.Log
import com.google.gson.Gson
import com.ronika.iptvnative.models.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.*
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.logging.HttpLoggingInterceptor
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

/**
 * Direct Stalker Portal Client
 * Handles handshake, token management, and all portal API calls
 * All credentials loaded from provider - no hardcoding
 */
class StalkerClient(
    val portalUrl: String,
    private val macAddress: String,
    private val token: String = "",
    private val serialNumber: String = ""
) {
    private val TAG = "StalkerClient"
    private val gson = Gson()
    
    // Computed values
    private val adid: String = md5(macAddress.replace(":", "").uppercase())
    
    init {
        Log.d(TAG, "Initialized with portal: $portalUrl, MAC: $macAddress, token: ${token.take(8)}...")
    }
    
    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.BODY
    }
    
    private val client = OkHttpClient.Builder()
        .addInterceptor(loggingInterceptor)
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()
    
    private fun md5(input: String): String {
        val md = MessageDigest.getInstance("MD5")
        val digest = md.digest(input.toByteArray())
        return digest.joinToString("") { "%02x".format(it) }
    }
    
    private fun getBaseUrl(): String {
        // Ensure URL ends properly for API calls
        val baseUrl = portalUrl.trimEnd('/')
        return if (baseUrl.contains("/stalker_portal")) {
            baseUrl.substringBefore("/stalker_portal") + "/stalker_portal"
        } else {
            "$baseUrl/stalker_portal"
        }
    }
    
    private fun buildRequest(url: String): Request {
        return Request.Builder()
            .url(url)
            .get()
            .addHeader("User-Agent", "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3")
            .addHeader("X-User-Agent", "Model: MAG270; Link: WiFi")
            .addHeader("Authorization", "Bearer $token")
            .addHeader("Cookie", "mac=$macAddress; timezone=America/Toronto; adid=$adid")
            .addHeader("Connection", "keep-alive")
            .build()
    }
    
    /**
     * Get live TV genres/categories
     */
    suspend fun getGenres(): GenresResponse = withContext(Dispatchers.IO) {
        val url = "${getBaseUrl()}/server/load.php?type=itv&action=get_genres&JsHttpRequest=1-xml"
        
        val request = buildRequest(url)
        
        Log.d(TAG, "Genres request: ${request.method} ${request.url}")

        val response = client.newCall(request).execute()
        val json = response.body?.string() ?: throw Exception("Empty response")
        Log.d(TAG, "Genres response: $json")

        // Stalker wraps in {"js": [...]}, but if error, show raw
        if (!response.isSuccessful) {
            throw Exception("HTTP ${response.code}: $json")
        }
        val wrapper = try { gson.fromJson(json, Map::class.java) } catch (e: Exception) {
            Log.e(TAG, "Genres parse error", e)
            throw e
        }
        val jsData = wrapper["js"]
        val genresJson = gson.toJson(jsData)

        GenresResponse(genres = gson.fromJson(genresJson, Array<Genre>::class.java).toList())
    }
    
    /**
     * Get channels for a genre
     */
    suspend fun getChannels(genreId: String, page: Int = 1): ChannelsResponse = withContext(Dispatchers.IO) {
        val url = "${getBaseUrl()}/server/load.php?type=itv&action=get_ordered_list&genre=$genreId&page=$page&p=$page&sortby=number&JsHttpRequest=1-xml"
        
        val request = buildRequest(url)
        
        val response = client.newCall(request).execute()
        val json = response.body?.string() ?: throw Exception("Empty response")
        Log.d(TAG, "Channels page $page response (truncated): ${json.take(500)}")
        
        // Stalker wraps in {"js": {"data": [...], "total_items": N}}
        val wrapper: Map<*, *> = gson.fromJson(json, Map::class.java)
        val jsData = wrapper["js"] as? Map<*, *> ?: throw Exception("No js data")
        val channelsArray = jsData["data"] as? List<*> ?: emptyList<Any>()
        val totalItemsRaw = jsData["total_items"]
        Log.d(TAG, "total_items raw value: $totalItemsRaw (type: ${totalItemsRaw?.javaClass?.name})")
        val totalItems = when (totalItemsRaw) {
            is String -> totalItemsRaw.toIntOrNull() ?: 0
            is Number -> totalItemsRaw.toInt()
            else -> 0
        }
        Log.d(TAG, "Parsed totalItems: $totalItems")
        
        // Convert to expected format
        val wrappedData = mutableMapOf<String, Any>()
        val channelsData = mutableMapOf<String, Any>()
        channelsData["data"] = channelsArray
        channelsData["total"] = totalItems
        wrappedData["channels"] = channelsData
        val channelsJson = gson.toJson(wrappedData)
        
        gson.fromJson(channelsJson, ChannelsResponse::class.java)
    }
    
    /**
     * Get stream URL for a channel
     */
    suspend fun getStreamUrl(cmd: String): StreamUrlResponse = withContext(Dispatchers.IO) {
        val url = "${getBaseUrl()}/server/load.php?type=itv&action=create_link&cmd=$cmd&forced_storage=undefined&disable_ad=0&JsHttpRequest=1-xml"
        
        val request = buildRequest(url)
        
        val response = client.newCall(request).execute()
        val json = response.body?.string() ?: throw Exception("Empty response")
        Log.d(TAG, "Stream URL response: $json")
        
        // Stalker wraps in {"js": {"cmd": "url"}}
        val wrapper = gson.fromJson(json, Map::class.java)
        val jsData = wrapper["js"] as? Map<*, *>
        val cmd = jsData?.get("cmd") as? String ?: throw Exception("No stream URL")
        
        StreamUrlResponse(url = cmd)
    }
    
    /**
     * Get VOD categories (movies/series)
     */
    suspend fun getVodCategories(type: String = "vod"): GenresResponse = withContext(Dispatchers.IO) {
        val url = "${getBaseUrl()}/server/load.php?type=$type&action=get_categories&JsHttpRequest=1-xml"

        val request = buildRequest(url)

        Log.d(TAG, "VOD categories request: ${request.method} ${request.url}")

        val response = client.newCall(request).execute()
        val json = response.body?.string() ?: throw Exception("Empty response")
        Log.d(TAG, "VOD categories FULL response: $json")

        if (!response.isSuccessful) {
            throw Exception("HTTP ${response.code}: $json")
        }

        val wrapper: Map<*, *> = gson.fromJson(json, Map::class.java)
        val jsData = wrapper["js"]

        // Check if jsData is a boolean (error/no data) - return empty list
        if (jsData is Boolean) {
            Log.w(TAG, "VOD categories returned boolean: $jsData - returning empty list")
            return@withContext GenresResponse(genres = emptyList())
        }

        // Check if jsData is an array (direct categories) or an object (paginated structure)
        val genres = if (jsData is List<*>) {
            // Direct array format
            val genresJson = gson.toJson(jsData)
            gson.fromJson(genresJson, Array<Genre>::class.java).toList()
        } else if (jsData is Map<*, *>) {
            // Check for paginated structure
            val data = jsData["data"] as? List<*> ?: jsData
            val genresJson = gson.toJson(data)
            gson.fromJson(genresJson, Array<Genre>::class.java).toList()
        } else {
            // Fallback - return empty list
            Log.w(TAG, "VOD categories returned unexpected type: ${jsData?.javaClass?.simpleName}")
            emptyList()
        }

        Log.d(TAG, "Total categories fetched: ${genres.size}")
        GenresResponse(genres = genres)
    }
    
    /**
     * Get VOD items (movies/series)
     */
    suspend fun getVodItems(categoryId: String, page: Int = 1, type: String = "vod"): ItemsResponse = withContext(Dispatchers.IO) {
        val url = "${getBaseUrl()}/server/load.php?type=$type&action=get_ordered_list&category=$categoryId&page=$page&p=$page&sortby=added&JsHttpRequest=1-xml"
        
        val request = buildRequest(url)
        
        val response = client.newCall(request).execute()
        val json = response.body?.string() ?: throw Exception("Empty response")
        Log.d(TAG, "VOD items page $page response (truncated): ${json.take(500)}")
        
        // Stalker wraps in {"js": {"data": [...], "total_items": N}}
        val wrapper: Map<*, *> = gson.fromJson(json, Map::class.java)
        val jsData = wrapper["js"] as? Map<*, *> ?: throw Exception("No js data")
        val itemsArray = jsData["data"] as? List<*> ?: emptyList<Any>()
        val totalItems = (jsData["total_items"] as? String)?.toIntOrNull() ?: 0
        
        // Convert to expected format
        val wrappedData = mutableMapOf<String, Any>()
        val itemsData = mutableMapOf<String, Any>()
        itemsData["data"] = itemsArray
        itemsData["total"] = totalItems
        wrappedData["items"] = itemsData
        val itemsJson = gson.toJson(wrappedData)
        
        gson.fromJson(itemsJson, ItemsResponse::class.java)
    }
    
    /**
     * Get VOD file info for a movie
     */
    suspend fun getVodFileInfo(movieId: String): Map<String, Any>? = withContext(Dispatchers.IO) {
        val url = "${getBaseUrl()}/server/load.php?action=get_ordered_list&type=vod&movie_id=$movieId&JsHttpRequest=1-xml"
        
        val request = buildRequest(url)
        
        val response = client.newCall(request).execute()
        val json = response.body?.string() ?: throw Exception("Empty response")
        Log.d(TAG, "VOD file info response: $json")
        
        val wrapper = gson.fromJson(json, Map::class.java) as Map<String, Any>
        val jsData = wrapper["js"] as? Map<*, *>
        val data = jsData?.get("data") as? List<*>
        
        data?.firstOrNull() as? Map<String, Any>
    }
    
    /**
     * Get VOD stream URL using file ID
     */
    suspend fun getVodStreamUrl(cmd: String, type: String = "vod", series: String? = null): StreamUrlResponse = withContext(Dispatchers.IO) {
        // Build URL with optional series parameter for episodes
        val baseUrl = "${getBaseUrl()}/server/load.php?type=$type&action=create_link&cmd=$cmd"
        val seriesParam = if (series != null) "&series=$series" else ""
        val url = "$baseUrl$seriesParam&force_ch_link_check=0&JsHttpRequest=1-xml"
        
        Log.d(TAG, "Getting VOD stream URL: $url")
        
        val request = buildRequest(url)
        
        val response = client.newCall(request).execute()
        val json = response.body?.string() ?: throw Exception("Empty response")
        Log.d(TAG, "VOD stream URL response: $json")
        
        val wrapper = gson.fromJson(json, Map::class.java)
        val jsData = wrapper["js"] as? Map<*, *>
        val cmd = jsData?.get("cmd") as? String ?: throw Exception("No stream URL")
        
        StreamUrlResponse(url = cmd)
    }
    
    /**
     * Get series seasons - use same approach as vod items
     */
    suspend fun getSeriesSeasons(seriesId: String): Map<String, Any> = withContext(Dispatchers.IO) {
        val url = "${getBaseUrl()}/server/load.php?action=get_ordered_list&type=vod&movie_id=$seriesId&JsHttpRequest=1-xml"
        
        val request = buildRequest(url)
        
        val response = client.newCall(request).execute()
        val json = response.body?.string() ?: throw Exception("Empty response")
        Log.d(TAG, "Series info response (truncated): ${json.take(500)}")
        
        val wrapper = gson.fromJson(json, Map::class.java) as Map<String, Any>
        wrapper["js"] as? Map<String, Any> ?: throw Exception("No js data")
    }
    
    /**
     * Get series episodes for a season
     */
    suspend fun getSeriesEpisodes(seriesId: String, seasonId: String): Map<String, Any> = withContext(Dispatchers.IO) {
        val url = "${getBaseUrl()}/server/load.php?action=get_ordered_list&type=vod&movie_id=$seriesId&season_id=$seasonId&p=1&JsHttpRequest=1-xml"
        
        val request = buildRequest(url)
        
        val response = client.newCall(request).execute()
        val json = response.body?.string() ?: throw Exception("Empty response")
        Log.d(TAG, "Series episodes response (truncated): ${json.take(500)}")
        
        val wrapper = gson.fromJson(json, Map::class.java) as Map<String, Any>
        wrapper["js"] as? Map<String, Any> ?: throw Exception("No js data")
    }
    
    /**
     * Get episode file info for series playback
     */
    suspend fun getEpisodeFileInfo(seriesId: String, seasonId: String, episodeId: String): Map<String, Any>? = withContext(Dispatchers.IO) {
        val url = "${getBaseUrl()}/server/load.php?action=get_ordered_list&type=vod&movie_id=$seriesId&season_id=$seasonId&episode_id=$episodeId&JsHttpRequest=1-xml"
        
        val request = buildRequest(url)
        
        val response = client.newCall(request).execute()
        val json = response.body?.string() ?: throw Exception("Empty response")
        Log.d(TAG, "Episode file info response: $json")
        
        val wrapper = gson.fromJson(json, Map::class.java) as Map<String, Any>
        val jsData = wrapper["js"] as? Map<*, *>
        val data = jsData?.get("data") as? List<*>
        
        data?.firstOrNull() as? Map<String, Any>
    }
    
    /**
     * Get short EPG for a channel (current and next programs)
     * Returns EPG data for the specified channel
     */
    suspend fun getShortEpg(channelId: String): EpgResponse = withContext(Dispatchers.IO) {
        val url = "${getBaseUrl()}/server/load.php?type=itv&action=get_short_epg&ch_id=$channelId&JsHttpRequest=1-xml"
        
        val request = buildRequest(url)
        
        val response = client.newCall(request).execute()
        val json = response.body?.string() ?: throw Exception("Empty response")
        
        // Stalker returns {"js": [...]} - js is directly an array
        val wrapper: Map<*, *> = gson.fromJson(json, Map::class.java)
        val jsData = wrapper["js"]
        
        // js can be an array directly or an object with data
        val epgData: List<*> = when (jsData) {
            is List<*> -> jsData
            is Map<*, *> -> jsData["data"] as? List<*> ?: emptyList<Any>()
            else -> emptyList<Any>()
        }
        
        val programs = epgData.mapNotNull { item ->
            val epgItem = item as? Map<*, *> ?: return@mapNotNull null
            EpgProgram(
                id = (epgItem["id"] as? String) ?: "",
                name = (epgItem["name"] as? String) ?: "No info",
                startTimestamp = when (val t = epgItem["start_timestamp"]) {
                    is String -> t.toLongOrNull() ?: 0L
                    is Number -> t.toLong()
                    else -> 0L
                },
                endTimestamp = when (val t = epgItem["stop_timestamp"]) {
                    is String -> t.toLongOrNull() ?: 0L
                    is Number -> t.toLong()
                    else -> 0L
                },
                duration = when (val d = epgItem["duration"]) {
                    is String -> d.toIntOrNull() ?: 0
                    is Number -> d.toInt()
                    else -> 0
                }
            )
        }
        
        EpgResponse(programs = programs)
    }
    
    /**
     * Search for movies and series
     */
    suspend fun searchContent(query: String, page: Int = 1): ItemsResponse = withContext(Dispatchers.IO) {
        val url = "${getBaseUrl()}/server/load.php?action=get_ordered_list&type=vod&category=0&search=$query&sortby=name&p=$page&JsHttpRequest=1-xml"
        
        val request = buildRequest(url)
        
        val response = client.newCall(request).execute()
        val json = response.body?.string() ?: throw Exception("Empty response")
        Log.d(TAG, "Search response (truncated): ${json.take(500)}")
        
        // Stalker wraps in {"js": {"data": [...], "total_items": N}}
        val wrapper: Map<*, *> = gson.fromJson(json, Map::class.java)
        val jsData = wrapper["js"] as? Map<*, *> ?: throw Exception("No js data")
        val itemsArray = jsData["data"] as? List<*> ?: emptyList<Any>()
        val totalItems = (jsData["total_items"] as? String)?.toIntOrNull() ?: 0
        
        // Convert to expected format
        val wrappedData = mutableMapOf<String, Any>()
        val itemsData = mutableMapOf<String, Any>()
        itemsData["data"] = itemsArray
        itemsData["total"] = totalItems
        wrappedData["items"] = itemsData
        val itemsJson = gson.toJson(wrappedData)
        
        gson.fromJson(itemsJson, ItemsResponse::class.java)
    }
}
