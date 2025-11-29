package com.ronika.iptvnative.api

import android.util.Log
import com.google.gson.Gson
import com.ronika.iptvnative.models.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.*
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.logging.HttpLoggingInterceptor
import java.util.concurrent.TimeUnit

/**
 * Direct Stalker Portal Client
 * Handles handshake, token management, and all portal API calls
 * No backend, no Room DB — direct portal communication only
 */
class StalkerClient(
    private val portalUrl: String,
    private val macAddress: String
) {
    private val TAG = "StalkerClient"
    private val gson = Gson()
    
    init {
        Log.d(TAG, "Initialized with portal: $portalUrl, MAC: $macAddress")
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
    
    private fun getBaseUrl(): String {
        return portalUrl.substringBeforeLast("/server/load.php")
    }
    
    /**
     * Get live TV genres/categories
     */
    suspend fun getGenres(): GenresResponse = withContext(Dispatchers.IO) {
        val url = "http://tv.stream4k.cc/stalker_portal/server/load.php?type=itv&action=get_genres&JsHttpRequest=1-xml"
        
        val request = Request.Builder()
            .url(url)
            .get()
            .addHeader("User-Agent", "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3")
            .addHeader("X-User-Agent", "Model: MAG270; Link: WiFi")
            .addHeader("Authorization", "Bearer 1E75E91204660B7A876055CE8830130E")
            .addHeader("Cookie", "mac=00:1a:79:17:f4:f5; timezone=America/Toronto; adid=06c140f97c839eaaa4faef4cc08a5722")
            .addHeader("Connection", "keep-alive")
            .build()
        
        Log.d(TAG, "Genres request: ${request.method} ${request.url}")
        request.headers.forEach { Log.d(TAG, "Header: ${it.first}: ${it.second}") }

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
        val url = "http://tv.stream4k.cc/stalker_portal/server/load.php?type=itv&action=get_ordered_list&genre=$genreId&page=$page&p=$page&sortby=number&JsHttpRequest=1-xml"
        
        val request = Request.Builder()
            .url(url)
            .get()
            .addHeader("User-Agent", "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3")
            .addHeader("X-User-Agent", "Model: MAG270; Link: WiFi")
            .addHeader("Authorization", "Bearer 1E75E91204660B7A876055CE8830130E")
            .addHeader("Cookie", "mac=00:1a:79:17:f4:f5; timezone=America/Toronto; adid=06c140f97c839eaaa4faef4cc08a5722")
            .addHeader("Connection", "keep-alive")
            .build()
        
        val response = client.newCall(request).execute()
        val json = response.body?.string() ?: throw Exception("Empty response")
        Log.d(TAG, "Channels page $page response (truncated): ${json.take(500)}")
        
        // Stalker wraps in {"js": {"data": [...], "total_items": N}}
        val wrapper: Map<*, *> = gson.fromJson(json, Map::class.java)
        val jsData = wrapper["js"] as? Map<*, *> ?: throw Exception("No js data")
        val channelsArray = jsData["data"] as? List<*> ?: emptyList<Any>()
        val totalItems = (jsData["total_items"] as? String)?.toIntOrNull() ?: 0
        
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
        val url = "http://tv.stream4k.cc/stalker_portal/server/load.php?type=itv&action=create_link&cmd=$cmd&forced_storage=undefined&disable_ad=0&JsHttpRequest=1-xml"
        
        val request = Request.Builder()
            .url(url)
            .get()
            .addHeader("User-Agent", "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3")
            .addHeader("X-User-Agent", "Model: MAG270; Link: WiFi")
            .addHeader("Authorization", "Bearer 1E75E91204660B7A876055CE8830130E")
            .addHeader("Cookie", "mac=00:1a:79:17:f4:f5; timezone=America/Toronto; adid=06c140f97c839eaaa4faef4cc08a5722")
            .addHeader("Connection", "keep-alive")
            .build()
        
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
        // Try without pagination first - some APIs return all data at once
        val url = "http://tv.stream4k.cc/stalker_portal/server/load.php?type=$type&action=get_categories&JsHttpRequest=1-xml"

        val request = Request.Builder()
            .url(url)
            .get()
            .addHeader("User-Agent", "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3")
            .addHeader("X-User-Agent", "Model: MAG270; Link: WiFi")
            .addHeader("Authorization", "Bearer 1E75E91204660B7A876055CE8830130E")
            .addHeader("Cookie", "mac=00:1a:79:17:f4:f5; timezone=America/Toronto; adid=06c140f97c839eaaa4faef4cc08a5722")
            .addHeader("Connection", "keep-alive")
            .build()

        Log.d(TAG, "VOD categories request: ${request.method} ${request.url}")

        val response = client.newCall(request).execute()
        val json = response.body?.string() ?: throw Exception("Empty response")
        Log.d(TAG, "VOD categories FULL response: $json")

        if (!response.isSuccessful) {
            throw Exception("HTTP ${response.code}: $json")
        }

        val wrapper: Map<*, *> = gson.fromJson(json, Map::class.java)
        val jsData = wrapper["js"]

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
            // Fallback
            val genresJson = gson.toJson(jsData)
            gson.fromJson(genresJson, Array<Genre>::class.java).toList()
        }

        Log.d(TAG, "Total categories fetched: ${genres.size}")
        GenresResponse(genres = genres)
    }    /**
     * Get VOD items (movies/series)
     */
    suspend fun getVodItems(categoryId: String, page: Int = 1, type: String = "vod"): ItemsResponse = withContext(Dispatchers.IO) {
        val url = "http://tv.stream4k.cc/stalker_portal/server/load.php?type=$type&action=get_ordered_list&category=$categoryId&page=$page&p=$page&sortby=added&JsHttpRequest=1-xml"
        
        val request = Request.Builder()
            .url(url)
            .get()
            .addHeader("User-Agent", "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3")
            .addHeader("X-User-Agent", "Model: MAG270; Link: WiFi")
            .addHeader("Authorization", "Bearer 1E75E91204660B7A876055CE8830130E")
            .addHeader("Cookie", "mac=00:1a:79:17:f4:f5; timezone=America/Toronto; adid=06c140f97c839eaaa4faef4cc08a5722")
            .addHeader("Connection", "keep-alive")
            .build()
        
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
        val url = "http://tv.stream4k.cc/stalker_portal/server/load.php?action=get_ordered_list&type=vod&movie_id=$movieId&JsHttpRequest=1-xml"
        
        val request = Request.Builder()
            .url(url)
            .get()
            .addHeader("User-Agent", "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3")
            .addHeader("X-User-Agent", "Model: MAG270; Link: WiFi")
            .addHeader("Authorization", "Bearer 1E75E91204660B7A876055CE8830130E")
            .addHeader("Cookie", "mac=00:1a:79:17:f4:f5; timezone=America/Toronto; adid=06c140f97c839eaaa4faef4cc08a5722")
            .addHeader("Connection", "keep-alive")
            .build()
        
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
    suspend fun getVodStreamUrl(cmd: String, type: String = "vod"): StreamUrlResponse = withContext(Dispatchers.IO) {
        val url = "http://tv.stream4k.cc/stalker_portal/server/load.php?type=$type&action=create_link&cmd=$cmd&forced_storage=undefined&disable_ad=0&JsHttpRequest=1-xml"
        
        val request = Request.Builder()
            .url(url)
            .get()
            .addHeader("User-Agent", "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3")
            .addHeader("X-User-Agent", "Model: MAG270; Link: WiFi")
            .addHeader("Authorization", "Bearer 1E75E91204660B7A876055CE8830130E")
            .addHeader("Cookie", "mac=00:1a:79:17:f4:f5; timezone=America/Toronto; adid=06c140f97c839eaaa4faef4cc08a5722")
            .addHeader("Connection", "keep-alive")
            .build()
        
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
        val url = "http://tv.stream4k.cc/stalker_portal/server/load.php?action=get_ordered_list&type=vod&movie_id=$seriesId&JsHttpRequest=1-xml"
        
        val request = Request.Builder()
            .url(url)
            .get()
            .addHeader("User-Agent", "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3")
            .addHeader("X-User-Agent", "Model: MAG270; Link: WiFi")
            .addHeader("Authorization", "Bearer 1E75E91204660B7A876055CE8830130E")
            .addHeader("Cookie", "mac=00:1a:79:17:f4:f5; timezone=America/Toronto; adid=06c140f97c839eaaa4faef4cc08a5722")
            .addHeader("Connection", "keep-alive")
            .build()
        
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
        val url = "http://tv.stream4k.cc/stalker_portal/server/load.php?action=get_ordered_list&type=vod&movie_id=$seriesId&season_id=$seasonId&p=1&JsHttpRequest=1-xml"
        
        val request = Request.Builder()
            .url(url)
            .get()
            .addHeader("User-Agent", "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3")
            .addHeader("X-User-Agent", "Model: MAG270; Link: WiFi")
            .addHeader("Authorization", "Bearer 1E75E91204660B7A876055CE8830130E")
            .addHeader("Cookie", "mac=00:1a:79:17:f4:f5; timezone=America/Toronto; adid=06c140f97c839eaaa4faef4cc08a5722")
            .addHeader("Connection", "keep-alive")
            .build()
        
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
        val url = "http://tv.stream4k.cc/stalker_portal/server/load.php?action=get_ordered_list&type=vod&movie_id=$seriesId&season_id=$seasonId&episode_id=$episodeId&JsHttpRequest=1-xml"
        
        val request = Request.Builder()
            .url(url)
            .get()
            .addHeader("User-Agent", "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3")
            .addHeader("X-User-Agent", "Model: MAG270; Link: WiFi")
            .addHeader("Authorization", "Bearer 1E75E91204660B7A876055CE8830130E")
            .addHeader("Cookie", "mac=00:1a:79:17:f4:f5; timezone=America/Toronto; adid=06c140f97c839eaaa4faef4cc08a5722")
            .addHeader("Connection", "keep-alive")
            .build()
        
        val response = client.newCall(request).execute()
        val json = response.body?.string() ?: throw Exception("Empty response")
        Log.d(TAG, "Episode file info response: $json")
        
        val wrapper = gson.fromJson(json, Map::class.java) as Map<String, Any>
        val jsData = wrapper["js"] as? Map<*, *>
        val data = jsData?.get("data") as? List<*>
        
        data?.firstOrNull() as? Map<String, Any>
    }
    
    /**
     * Search for movies and series
     */
    suspend fun searchContent(query: String, page: Int = 1): ItemsResponse = withContext(Dispatchers.IO) {
        val url = "http://tv.stream4k.cc/stalker_portal/server/load.php?action=get_ordered_list&type=vod&category=0&search=$query&sortby=name&p=$page&JsHttpRequest=1-xml"
        
        val request = Request.Builder()
            .url(url)
            .get()
            .addHeader("User-Agent", "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3")
            .addHeader("X-User-Agent", "Model: MAG270; Link: WiFi")
            .addHeader("Authorization", "Bearer 1E75E91204660B7A876055CE8830130E")
            .addHeader("Cookie", "mac=00:1a:79:17:f4:f5; timezone=America/Toronto; adid=06c140f97c839eaaa4faef4cc08a5722")
            .addHeader("Connection", "keep-alive")
            .build()
        
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
