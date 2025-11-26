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
    private var token: String? = null
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
        .cookieJar(object : CookieJar {
            private val cookieStore = mutableMapOf<String, List<Cookie>>()
            
            override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
                cookieStore[url.host] = cookies
            }
            
            override fun loadForRequest(url: HttpUrl): List<Cookie> {
                return cookieStore[url.host] ?: emptyList()
            }
        })
        .build()
    
    private fun getBaseUrl(): String {
        return portalUrl.substringBeforeLast("/server/load.php")
    }
    
    private fun getCookie(): String {
        // MAC must be lowercase per Stalker protocol
        val baseCookie = "mac=00:1a:79:17:f4:f5; timezone=America/Toronto; adid=06c140f97c839eaaa4faef4cc08a5722"
        return if (token != null) {
            "$baseCookie; token=$token"
        } else {
            baseCookie
        }
    }
    
    /**
     * Perform handshake and get token
     */
    private suspend fun handshake(): Boolean = withContext(Dispatchers.IO) {
        try {
            val url = "http://tv.stream4k.cc/stalker_portal/server/load.php?type=stb&action=handshake&JsHttpRequest=1-xml"
            
            val request = Request.Builder()
                .url(url)
                .get()
               .addHeader("Cookie", "mac=00:1a:79:17:f4:f5; timezone=America/Toronto; adid=06c140f97c839eaaa4faef4cc08a5722")
                .addHeader("User-Agent", "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3")
                .addHeader("X-User-Agent", "Model: MAG270; Link: WiFi")
                .addHeader("Authorization", "Bearer 1E75E91204660B7A876055CE8830130E")
                .addHeader("Host", "tv.stream4k.cc")
                .build()
            
            Log.d(TAG, "Handshake request: ${request.method} ${request.url}")
            request.headers.forEach { Log.d(TAG, "Header: ${it.first}: ${it.second}") }
            
            val response = client.newCall(request).execute()
            val json = response.body?.string()
            Log.d(TAG, "Handshake response: $json")
            
            if (json != null && response.isSuccessful) {
                // Stalker wraps response in {"js": {...}}
                val wrapper = gson.fromJson(json, Map::class.java)
                val jsData = wrapper["js"] as? Map<*, *>
                token = jsData?.get("token") as? String
                Log.d(TAG, "Token: $token")
                return@withContext token != null
            }
            false
        } catch (e: Exception) {
            Log.e(TAG, "Handshake failed", e)
            false
        }
    }
    
    /**
     * Get live TV genres/categories
     */
    suspend fun getGenres(): GenresResponse = withContext(Dispatchers.IO) {
        if (token == null) {
            handshake()
        }

        val url = "http://tv.stream4k.cc/stalker_portal/server/load.php?type=itv&action=get_genres&JsHttpRequest=1-xml"
        
        val request = Request.Builder()
            .url(url)
            .get()
            .addHeader("Cookie", "mac=00:1a:79:17:f4:f5; timezone=America/Toronto; adid=06c140f97c839eaaa4faef4cc08a5722")
            .addHeader("User-Agent", "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3")
            .addHeader("X-User-Agent", "Model: MAG270; Link: WiFi")
            .addHeader("Authorization", "Bearer 1E75E91204660B7A876055CE8830130E")
            .addHeader("Host", "tv.stream4k.cc")
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
       if (token == null) {
            handshake()
        }
     
        val url = "http://tv.stream4k.cc/stalker_portal/server/load.php?type=itv&action=get_ordered_list&genre=$genreId&page=$page&p=$page&sortby=number&JsHttpRequest=1-xml"
        
        val request = Request.Builder()
            .url(url)
            .get()
           .addHeader("Cookie", "mac=00:1a:79:17:f4:f5; timezone=America/Toronto; adid=06c140f97c839eaaa4faef4cc08a5722")
            .addHeader("User-Agent", "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3")
            .addHeader("X-User-Agent", "Model: MAG270; Link: WiFi")
            .addHeader("Authorization", "Bearer 1E75E91204660B7A876055CE8830130E")
            .addHeader("Accept-Encoding", "gzip, deflate")
            .addHeader("Connection", "keep-alive")
            .addHeader("Host", "tv.stream4k.cc")
            .build()
        
        val response = client.newCall(request).execute()
        val json = response.body?.string() ?: throw Exception("Empty response")
        Log.d(TAG, "Channels page $page response (truncated): ${json.take(500)}")
        
        // Stalker wraps in {"js": {"data": [...], "total_items": N}}
        val wrapper = gson.fromJson(json, Map::class.java)
        val jsData = wrapper["js"] as? Map<*, *>
        val channelsJson = gson.toJson(jsData)
        
        gson.fromJson(channelsJson, ChannelsResponse::class.java)
    }
    
    /**
     * Get stream URL for a channel
     */
    suspend fun getStreamUrl(cmd: String): StreamUrlResponse = withContext(Dispatchers.IO) {
      if (token == null) {
            handshake()
        }

        
        val url = "http://tv.stream4k.cc/stalker_portal/server/load.php?type=itv&action=create_link&cmd=$cmd&forced_storage=undefined&disable_ad=0&JsHttpRequest=1-xml"
        
        val request = Request.Builder()
            .url(url)
            .get()
           .addHeader("Cookie", "mac=00:1a:79:17:f4:f5; timezone=America/Toronto; adid=06c140f97c839eaaa4faef4cc08a5722")
            .addHeader("User-Agent", "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3")
            .addHeader("X-User-Agent", "Model: MAG270; Link: WiFi")
            .addHeader("Authorization", "Bearer 1E75E91204660B7A876055CE8830130E")
            .addHeader("Host", "tv.stream4k.cc")
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
    
    private suspend fun ensureToken() {
        if (token == null) {
            handshake()
        }
    }
}
