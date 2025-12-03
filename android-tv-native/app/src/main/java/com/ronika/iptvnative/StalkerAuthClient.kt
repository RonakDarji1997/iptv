package com.ronika.iptvnative

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.logging.HttpLoggingInterceptor
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

/**
 * StalkerAuthClient - Handles Stalker Portal authentication flow
 * Uses exact same headers/params as working StalkerPortalClient
 * 
 * Authentication Steps:
 * 1. Handshake: GET /stalker_portal/server/load.php?type=stb&action=handshake&token=&prehash=...
 *    - Cookie: mac=XX:XX:XX:XX:XX:XX; timezone=...; adid=...
 *    - Returns token for Bearer auth
 * 2. Get Profile: GET /stalker_portal/server/load.php?type=stb&action=get_profile
 *    - Uses Bearer token from handshake
 * 3. All subsequent calls use Bearer token
 */
class StalkerAuthClient(
    private var serverUrl: String,
    private val macAddress: String,
    private val serialNumber: String
) {
    companion object {
        private const val TAG = "StalkerAuth"
    }
    
    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.BODY
    }
    
    // Client that follows redirects (for resolving final URL)
    private val clientWithRedirects = OkHttpClient.Builder()
        .addInterceptor(loggingInterceptor)
        .followRedirects(true)
        .followSslRedirects(true)
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()
    
    // Client that doesn't follow redirects (for checking)
    private val clientNoRedirects = OkHttpClient.Builder()
        .followRedirects(false)
        .followSslRedirects(false)
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()
    
    private val client = clientWithRedirects
    
    // Track the resolved URL after redirect check
    private var resolvedUrl: String? = null
    
    data class AuthResult(
        val success: Boolean,
        val token: String? = null,
        val error: String? = null,
        val resolvedUrl: String? = null  // The final URL after redirects
    )
    
    data class ProfileResult(
        val success: Boolean,
        val profile: JSONObject? = null,
        val error: String? = null
    )
    
    /**
     * Resolve URL redirects to get the final portal URL
     * Many portals redirect from short URLs to the actual server
     */
    suspend fun resolveRedirects(): String = withContext(Dispatchers.IO) {
        try {
            var url = serverUrl.trim().trimEnd('/')
            
            // Try to access the portal URL and follow redirects
            val testUrl = if (url.contains("/stalker_portal") || url.contains("/portal")) {
                url
            } else {
                "$url/stalker_portal/server/load.php"
            }
            
            Log.d(TAG, "Resolving redirects for: $testUrl")
            
            val request = Request.Builder()
                .url(testUrl)
                .head()  // HEAD request to check without downloading body
                .addHeader("User-Agent", "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3")
                .build()
            
            val response = clientWithRedirects.newCall(request).execute()
            val finalUrl = response.request.url.toString()
            
            Log.d(TAG, "Original URL: $serverUrl")
            Log.d(TAG, "Final URL after redirects: $finalUrl")
            
            // Extract base URL from final URL
            val resolvedBase = if (finalUrl.contains("/stalker_portal")) {
                finalUrl.substringBefore("/stalker_portal")
            } else if (finalUrl.contains("/portal")) {
                finalUrl.substringBefore("/portal")
            } else if (finalUrl.contains("/server/")) {
                finalUrl.substringBefore("/server/")
            } else {
                finalUrl.trimEnd('/')
            }
            
            // Update serverUrl if different
            if (resolvedBase != serverUrl.trimEnd('/')) {
                Log.d(TAG, "URL was redirected from $serverUrl to $resolvedBase")
                resolvedUrl = resolvedBase
            }
            
            response.close()
            resolvedUrl ?: serverUrl.trimEnd('/')
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to resolve redirects", e)
            serverUrl.trimEnd('/')
        }
    }
    
    /**
     * Get the resolved URL (after redirects) or original URL
     */
    fun getResolvedUrl(): String {
        return resolvedUrl ?: serverUrl.trimEnd('/')
    }
    
    /**
     * Get the base URL for the Stalker portal API
     */
    private fun getBaseUrl(): String {
        var url = (resolvedUrl ?: serverUrl).trim()
        // Remove trailing slash
        if (url.endsWith("/")) {
            url = url.dropLast(1)
        }
        // Add stalker_portal path if not present
        if (!url.contains("/stalker_portal") && !url.contains("/portal")) {
            url = "$url/stalker_portal"
        }
        return url
    }
    
    /**
     * Generate prehash for handshake - SHA1 of MAC address
     */
    private fun generatePrehash(): String {
        val md = MessageDigest.getInstance("SHA-1")
        val digest = md.digest(macAddress.toByteArray())
        return digest.joinToString("") { "%02x".format(it) }
    }
    
    /**
     * Generate adid - MD5 of MAC address
     */
    private fun generateAdid(): String {
        val md = MessageDigest.getInstance("MD5")
        val digest = md.digest(macAddress.toByteArray())
        return digest.joinToString("") { "%02x".format(it) }
    }
    
    /**
     * Get cookies string - exact format from working client
     */
    private fun getCookies(): String {
        val adid = generateAdid()
        return "mac=$macAddress; timezone=America/Toronto; adid=$adid"
    }
    
    /**
     * Step 1: Perform handshake to get authentication token
     * First resolves any URL redirects, then performs handshake
     * Exact format from RTF: GET /stalker_portal/server/load.php?type=stb&action=handshake&token=&prehash=...
     */
    suspend fun performHandshake(): AuthResult = withContext(Dispatchers.IO) {
        try {
            // First, resolve any redirects to get the actual portal URL
            resolveRedirects()
            
            val baseUrl = getBaseUrl()
            val prehash = generatePrehash()
            
            // Build handshake URL - exact format
            val handshakeUrl = "$baseUrl/server/load.php?type=stb&action=handshake&token=&prehash=$prehash"
            
            Log.d(TAG, "Performing handshake: $handshakeUrl")
            
            val request = Request.Builder()
                .url(handshakeUrl)
                .get()
                .addHeader("User-Agent", "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3")
                .addHeader("X-User-Agent", "Model: MAG270; Link: WiFi")
                .addHeader("Cookie", getCookies())
                // Note: OkHttp adds Accept-Encoding: gzip automatically and handles decompression
                .addHeader("Connection", "keep-alive")
                .build()
            
            Log.d(TAG, "Handshake request headers:")
            request.headers.forEach { Log.d(TAG, "  ${it.first}: ${it.second}") }
            
            val response = client.newCall(request).execute()
            val json = response.body?.string() ?: throw Exception("Empty response")
            
            Log.d(TAG, "Handshake response code: ${response.code}")
            Log.d(TAG, "Handshake response: $json")
            
            if (!response.isSuccessful) {
                return@withContext AuthResult(success = false, error = "HTTP ${response.code}: $json", resolvedUrl = getResolvedUrl())
            }
            
            // Parse response - format: {"js": {"token": "...", "random": "...", "not_valid": 0}}
            val jsonResponse = JSONObject(json)
            val js = jsonResponse.optJSONObject("js")
            
            if (js != null) {
                val token = js.optString("token", null)
                if (!token.isNullOrEmpty()) {
                    Log.d(TAG, "Handshake successful, token: $token, resolvedUrl: ${getResolvedUrl()}")
                    return@withContext AuthResult(success = true, token = token, resolvedUrl = getResolvedUrl())
                }
            }
            
            // Check for error
            val error = jsonResponse.optString("error", null)
            if (!error.isNullOrEmpty()) {
                return@withContext AuthResult(success = false, error = error, resolvedUrl = getResolvedUrl())
            }
            
            return@withContext AuthResult(success = false, error = "No token in response", resolvedUrl = getResolvedUrl())
            
        } catch (e: Exception) {
            Log.e(TAG, "Handshake exception", e)
            return@withContext AuthResult(success = false, error = e.message ?: "Connection failed", resolvedUrl = getResolvedUrl())
        }
    }
    
    /**
     * Step 2: Get profile using the token
     * Exact format from RTF with all parameters
     */
    suspend fun getProfile(token: String): ProfileResult = withContext(Dispatchers.IO) {
        try {
            val baseUrl = getBaseUrl()
            val prehash = generatePrehash()
            
            // Build profile URL with exact parameters from RTF
            // ver, sn, stb_type, client_type, image_version, device_id, device_id2, auth_second_step, hw_version, not_valid_token, metrics, hw_version_2, timestamp, api_signature, prehash
            val timestamp = (System.currentTimeMillis() / 1000).toString()
            val ver = "ImageDescription%3A%200.2.18-r22-pub-270%3B%20ImageDate%3A%20Tue%20Dec%2019%2011%3A33%3A53%20EET%202017%3B%20PORTAL%20version%3A%205.6.1%3B%20API%20Version%3A%20JS%20API%20version%3A%20328%3B%20STB%20API%20version%3A%20134%3B%20Player%20Engine%20version%3A%200x566"
            
            // Build metrics JSON - URL encoded
            // {"mac":"00:1A:79:02:71:11","sn":"058357N656529","model":"MAG270","type":"STB","uid":"","random":"..."}
            val random = prehash  // Use prehash as random value
            val metricsJson = """{"mac":"$macAddress","sn":"$serialNumber","model":"MAG270","type":"STB","uid":"","random":"$random"}"""
            val metricsEncoded = java.net.URLEncoder.encode(metricsJson, "UTF-8")
            
            val profileUrl = buildString {
                append("$baseUrl/server/load.php?type=stb&action=get_profile")
                append("&ver=$ver")
                append("&sn=$serialNumber")
                append("&stb_type=MAG270")
                append("&client_type=STB")
                append("&image_version=0.2.18")
                append("&device_id=")
                append("&device_id2=")
                append("&auth_second_step=1")
                append("&hw_version=1.7-BD-00")
                append("&not_valid_token=0")
                append("&metrics=$metricsEncoded")
                append("&hw_version_2=ecf87650406bba50b0801a4347093864b89b38e6")
                append("&timestamp=$timestamp")
                append("&api_signature=262")
                append("&prehash=$prehash")
            }
            
            Log.d(TAG, "Getting profile: $profileUrl")
            
            val request = Request.Builder()
                .url(profileUrl)
                .get()
                .addHeader("User-Agent", "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3")
                .addHeader("X-User-Agent", "Model: MAG270; Link: WiFi")
                .addHeader("Authorization", "Bearer $token")
                .addHeader("Cookie", getCookies())
                // Note: OkHttp adds Accept-Encoding: gzip automatically and handles decompression
                .addHeader("Connection", "keep-alive")
                .build()
            
            Log.d(TAG, "Profile request headers:")
            request.headers.forEach { Log.d(TAG, "  ${it.first}: ${it.second}") }
            
            val response = client.newCall(request).execute()
            val json = response.body?.string() ?: throw Exception("Empty response")
            
            Log.d(TAG, "Profile response code: ${response.code}")
            Log.d(TAG, "Profile response: $json")
            
            if (!response.isSuccessful) {
                return@withContext ProfileResult(success = false, error = "HTTP ${response.code}")
            }
            
            // Parse response
            val jsonResponse = JSONObject(json)
            val js = jsonResponse.optJSONObject("js")
            
            if (js != null) {
                Log.d(TAG, "Profile retrieved successfully")
                return@withContext ProfileResult(success = true, profile = js)
            }
            
            // Check for error
            val error = jsonResponse.optString("error", null)
            if (!error.isNullOrEmpty()) {
                return@withContext ProfileResult(success = false, error = error)
            }
            
            // Profile might be in different format
            return@withContext ProfileResult(success = true, profile = jsonResponse)
            
        } catch (e: Exception) {
            Log.e(TAG, "Profile exception", e)
            return@withContext ProfileResult(success = false, error = e.message ?: "Connection failed")
        }
    }
    
    /**
     * Get TV genres/categories
     */
    suspend fun getGenres(token: String): List<StalkerCategory> = withContext(Dispatchers.IO) {
        val categories = mutableListOf<StalkerCategory>()
        
        try {
            val baseUrl = getBaseUrl()
            val url = "$baseUrl/server/load.php?type=itv&action=get_genres&JsHttpRequest=1-xml"
            
            Log.d(TAG, "Getting TV genres: $url")
            
            val request = Request.Builder()
                .url(url)
                .get()
                .addHeader("User-Agent", "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3")
                .addHeader("X-User-Agent", "Model: MAG270; Link: WiFi")
                .addHeader("Authorization", "Bearer $token")
                .addHeader("Cookie", getCookies())
                .addHeader("Connection", "keep-alive")
                .build()
            
            val response = client.newCall(request).execute()
            val json = response.body?.string() ?: throw Exception("Empty response")
            
            Log.d(TAG, "TV genres response: $json")
            
            if (response.isSuccessful) {
                val jsonResponse = JSONObject(json)
                val js = jsonResponse.opt("js")
                
                val genresArray = when (js) {
                    is JSONArray -> js
                    is JSONObject -> js.optJSONArray("data")
                    else -> null
                }
                
                if (genresArray != null) {
                    for (i in 0 until genresArray.length()) {
                        val genre = genresArray.getJSONObject(i)
                        categories.add(StalkerCategory(
                            id = genre.optString("id", ""),
                            title = genre.optString("title", ""),
                            alias = genre.optString("alias", ""),
                            censored = genre.optString("censored", "0") == "1",
                            type = "itv"
                        ))
                    }
                }
            }
            
            Log.d(TAG, "Retrieved ${categories.size} TV genres")
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get TV genres", e)
        }
        
        return@withContext categories
    }
    
    /**
     * Get VOD categories
     */
    suspend fun getVodCategories(token: String): List<StalkerCategory> = withContext(Dispatchers.IO) {
        val categories = mutableListOf<StalkerCategory>()
        
        try {
            val baseUrl = getBaseUrl()
            val url = "$baseUrl/server/load.php?type=vod&action=get_categories&JsHttpRequest=1-xml"
            
            Log.d(TAG, "Getting VOD categories: $url")
            
            val request = Request.Builder()
                .url(url)
                .get()
                .addHeader("User-Agent", "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3")
                .addHeader("X-User-Agent", "Model: MAG270; Link: WiFi")
                .addHeader("Authorization", "Bearer $token")
                .addHeader("Cookie", getCookies())
                .addHeader("Connection", "keep-alive")
                .build()
            
            val response = client.newCall(request).execute()
            val json = response.body?.string() ?: throw Exception("Empty response")
            
            Log.d(TAG, "VOD categories response: $json")
            
            if (response.isSuccessful) {
                val jsonResponse = JSONObject(json)
                val js = jsonResponse.opt("js")
                
                // Handle boolean response (no data)
                if (js is Boolean) {
                    Log.w(TAG, "VOD categories returned boolean: $js")
                    return@withContext categories
                }
                
                val categoriesArray = when (js) {
                    is JSONArray -> js
                    is JSONObject -> js.optJSONArray("data") ?: JSONArray().apply {
                        // If no data array, try to parse js directly
                        if (js.has("id")) put(js)
                    }
                    else -> null
                }
                
                if (categoriesArray != null) {
                    for (i in 0 until categoriesArray.length()) {
                        val category = categoriesArray.getJSONObject(i)
                        categories.add(StalkerCategory(
                            id = category.optString("id", ""),
                            title = category.optString("title", ""),
                            alias = category.optString("alias", ""),
                            censored = category.optString("censored", "0") == "1",
                            type = "vod"
                        ))
                    }
                }
            }
            
            Log.d(TAG, "Retrieved ${categories.size} VOD categories")
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get VOD categories", e)
        }
        
        return@withContext categories
    }
    
    /**
     * Get stream URL for a channel
     */
    suspend fun getStreamUrl(token: String, cmd: String): String? = withContext(Dispatchers.IO) {
        try {
            val baseUrl = getBaseUrl()
            val url = "$baseUrl/server/load.php?type=itv&action=create_link&cmd=$cmd&forced_storage=undefined&disable_ad=0&JsHttpRequest=1-xml"
            
            Log.d(TAG, "Getting stream URL: $url")
            
            val request = Request.Builder()
                .url(url)
                .get()
                .addHeader("User-Agent", "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3")
                .addHeader("X-User-Agent", "Model: MAG270; Link: WiFi")
                .addHeader("Authorization", "Bearer $token")
                .addHeader("Cookie", getCookies())
                .addHeader("Connection", "keep-alive")
                .build()
            
            val response = client.newCall(request).execute()
            val json = response.body?.string() ?: throw Exception("Empty response")
            
            Log.d(TAG, "Stream URL response: $json")
            
            if (response.isSuccessful) {
                val jsonResponse = JSONObject(json)
                val js = jsonResponse.optJSONObject("js")
                val streamCmd = js?.optString("cmd", null)
                
                // Clean up URL (remove "ffmpeg " prefix if present)
                return@withContext streamCmd?.removePrefix("ffmpeg ")?.trim()
            }
            
            return@withContext null
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get stream URL", e)
            return@withContext null
        }
    }
    
    /**
     * Check if a VOD category contains series by fetching first page
     * Returns true if first item has is_series flag
     */
    suspend fun isCategorySeries(token: String, categoryId: String): Boolean = withContext(Dispatchers.IO) {
        try {
            val baseUrl = getBaseUrl()
            val url = "$baseUrl/server/load.php?type=vod&action=get_ordered_list&category=$categoryId&sortby=added&p=1&JsHttpRequest=1-xml"
            
            Log.d(TAG, "Checking if category $categoryId is series: $url")
            
            val request = Request.Builder()
                .url(url)
                .get()
                .addHeader("User-Agent", "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3")
                .addHeader("X-User-Agent", "Model: MAG270; Link: WiFi")
                .addHeader("Authorization", "Bearer $token")
                .addHeader("Cookie", getCookies())
                .addHeader("Connection", "keep-alive")
                .build()
            
            val response = client.newCall(request).execute()
            val json = response.body?.string() ?: throw Exception("Empty response")
            
            if (response.isSuccessful) {
                val jsonResponse = JSONObject(json)
                val js = jsonResponse.optJSONObject("js")
                val dataArray = js?.optJSONArray("data")
                
                if (dataArray != null && dataArray.length() > 0) {
                    val firstItem = dataArray.getJSONObject(0)
                    val isSeries = firstItem.optString("is_series", "0") == "1"
                    Log.d(TAG, "Category $categoryId is_series: $isSeries")
                    return@withContext isSeries
                }
            }
            
            return@withContext false
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to check if category is series", e)
            return@withContext false
        }
    }
}

/**
 * Data class representing a Stalker portal category
 */
data class StalkerCategory(
    val id: String,
    val title: String,
    val alias: String = "",
    val censored: Boolean = false,
    val type: String = "itv", // "itv" for TV, "vod" for movies, "series" for series
    var isSeries: Boolean = false,
    var isSelected: Boolean = true // Default selected
)
