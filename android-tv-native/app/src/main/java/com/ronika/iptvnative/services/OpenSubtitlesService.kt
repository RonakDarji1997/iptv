package com.ronika.iptvnative.services

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * OpenSubtitles API Service
 * Fetches subtitles from OpenSubtitles.com API
 */
class OpenSubtitlesService {
    
    companion object {
        private const val TAG = "OpenSubtitlesService"
        // Use web-portal API as proxy to bypass Cloudflare blocking Android clients
        private const val BASE_URL = "http://web.iptv.ronika.co/api/subtitles"
        private const val API_KEY = "ZH6QVEIRr9uCCpV9bpqhfatDZ63U3TrS"
        private const val USER_AGENT = "streamHub v1.0.0"
    }
    
    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()
    
    data class SubtitleItem(
        val id: String,
        val language: String,
        val fileName: String,
        val downloadUrl: String,
        val format: String,
        val uploader: String,
        val downloads: Int,
        val rating: Double,
        val hearingImpaired: Boolean
    )
    
    /**
     * Search subtitles by IMDB ID
     */
    suspend fun searchByImdbId(
        imdbId: String,
        language: String = "en"
    ): List<SubtitleItem> = withContext(Dispatchers.IO) {
        try {
            // Remove 'tt' prefix if present
            val cleanImdbId = imdbId.removePrefix("tt")
            
            Log.d(TAG, "Searching subtitles for IMDB: $cleanImdbId, language: $language")
            
            val url = "$BASE_URL?action=search&imdbId=$cleanImdbId&languages=$language"
            
            val request = Request.Builder()
                .url(url)
                .get()
                .build()
            
            val response = client.newCall(request).execute()
            val responseBody = response.body?.string()
            
            if (!response.isSuccessful) {
                Log.e(TAG, "API request failed: ${response.code}, body: $responseBody")
                return@withContext emptyList()
            }
            
            if (responseBody == null) {
                Log.e(TAG, "Empty response body")
                return@withContext emptyList()
            }
            
            Log.d(TAG, "API Response: $responseBody")
            
            // Web-portal returns {success: true, subtitles: [...]}
            val jsonResponse = JSONObject(responseBody)
            val subtitlesArray = jsonResponse.optJSONArray("subtitles") ?: JSONArray()
            
            Log.d(TAG, "Found ${subtitlesArray.length()} subtitles")
            
            val subtitles = mutableListOf<SubtitleItem>()
            
            for (i in 0 until subtitlesArray.length()) {
                val item = subtitlesArray.getJSONObject(i)
                val fileId = item.optString("id", "")
                
                if (fileId.isNotEmpty()) {
                    subtitles.add(
                        SubtitleItem(
                            id = fileId,
                            language = item.optString("language", "en"),
                            fileName = item.optString("fileName", item.optString("releaseInfo", "Unknown")),
                            downloadUrl = "", // Will be fetched via web-portal
                            format = "srt",
                            uploader = item.optString("uploader", "Unknown"),
                            downloads = item.optInt("downloadCount", 0),
                            rating = item.optDouble("rating", 0.0),
                            hearingImpaired = false
                        )
                    )
                }
            }
            
            Log.d(TAG, "Found ${subtitles.size} subtitles")
            subtitles
            
        } catch (e: Exception) {
            Log.e(TAG, "Error searching subtitles", e)
            emptyList()
        }
    }
    
    /**
     * Search subtitles by query (movie/series title)
     */
    suspend fun searchByQuery(
        query: String,
        language: String = "en",
        year: Int? = null,
        season: Int? = null,
        episode: Int? = null
    ): List<SubtitleItem> = withContext(Dispatchers.IO) {
        try {
            Log.d(TAG, "=".repeat(80))
            Log.d(TAG, "🌐 API REQUEST - searchByQuery")
            Log.d(TAG, "=".repeat(80))
            Log.d(TAG, "📤 SENDING TO API:")
            Log.d(TAG, "📝   query: $query")
            Log.d(TAG, "📝   language: $language")
            Log.d(TAG, "📝   year: ${year ?: "(null)"}")
            Log.d(TAG, "📝   season: ${season ?: "(null)"}")
            Log.d(TAG, "📝   episode: ${episode ?: "(null)"}")
            
            var url = "$BASE_URL?action=search&query=${java.net.URLEncoder.encode(query, "UTF-8")}&languages=$language"
            
            if (year != null) {
                url += "&year=$year"
            }
            if (season != null) {
                url += "&seasonNumber=$season"
            }
            if (episode != null) {
                url += "&episodeNumber=$episode"
            }
            
            Log.d(TAG, "🔗 Full URL: $url")
            Log.d(TAG, "=".repeat(80))
            
            val request = Request.Builder()
                .url(url)
                .get()
                .build()
            
            val response = client.newCall(request).execute()
            val responseBody = response.body?.string()
            
            Log.d(TAG, "=".repeat(80))
            Log.d(TAG, "📥 API RESPONSE")
            Log.d(TAG, "📝 Response Code: ${response.code}")
            Log.d(TAG, "📝 Response Body Length: ${responseBody?.length ?: 0} chars")
            if (responseBody != null && responseBody.length < 500) {
                Log.d(TAG, "📝 Full Response: $responseBody")
            } else if (responseBody != null) {
                Log.d(TAG, "📝 Response Preview: ${responseBody.take(200)}...")
            }
            Log.d(TAG, "=".repeat(80))
            
            if (!response.isSuccessful) {
                Log.e(TAG, "API request failed: ${response.code}, body: $responseBody")
                return@withContext emptyList()
            }
            
            if (responseBody == null) {
                Log.e(TAG, "Empty response body")
                return@withContext emptyList()
            }
            
            val jsonResponse = JSONObject(responseBody)
            val subtitlesArray = jsonResponse.optJSONArray("subtitles") ?: JSONArray()
            
            Log.d(TAG, "📝 Parsing JSON response...")
            Log.d(TAG, "📝 Found ${subtitlesArray.length()} subtitle entries in JSON")
            
            val subtitles = mutableListOf<SubtitleItem>()
            
            for (i in 0 until subtitlesArray.length()) {
                val item = subtitlesArray.getJSONObject(i)
                val fileId = item.optString("id", "")
                
                if (fileId.isNotEmpty()) {
                    subtitles.add(
                        SubtitleItem(
                            id = fileId,
                            language = item.optString("language", "en"),
                            fileName = item.optString("fileName", item.optString("releaseInfo", "Unknown")),
                            downloadUrl = "",
                            format = "srt",
                            uploader = item.optString("uploader", "Unknown"),
                            downloads = item.optInt("downloadCount", 0),
                            rating = item.optDouble("rating", 0.0),
                            hearingImpaired = false
                        )
                    )
                }
            }
            
            Log.d(TAG, "=".repeat(80))
            Log.d(TAG, "✅ searchByQuery FINAL RESULT: ${subtitles.size} valid subtitles")
            if (subtitles.isNotEmpty()) {
                subtitles.take(3).forEach { sub ->
                    Log.d(TAG, "📝   - ID: ${sub.id}, File: ${sub.fileName}")
                }
            }
            Log.d(TAG, "=".repeat(80))
            subtitles
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error in searchByQuery", e)
            emptyList()
        }
    }
    
    /**
     * Download subtitle file content
     */
    suspend fun downloadSubtitle(fileId: String): String? = withContext(Dispatchers.IO) {
        try {
            Log.d(TAG, "Downloading subtitle with file_id: $fileId")
            
            // Web-portal expects GET request with action=download&fileId=<id>
            val downloadLinkUrl = "$BASE_URL?action=download&fileId=$fileId"
            
            val downloadRequest = Request.Builder()
                .url(downloadLinkUrl)
                .get()
                .build()
            
            val downloadResponse = client.newCall(downloadRequest).execute()
            val downloadBody = downloadResponse.body?.string()
            
            Log.d(TAG, "Download response code: ${downloadResponse.code}")
            
            if (!downloadResponse.isSuccessful || downloadBody == null) {
                Log.e(TAG, "Failed to download subtitle: ${downloadResponse.code}")
                return@withContext null
            }
            
            // Web-portal returns {success: true, content: "WEBVTT\n\n..."}
            val downloadJson = JSONObject(downloadBody)
            val success = downloadJson.optBoolean("success", false)
            val content = downloadJson.optString("content", "")
            
            if (!success || content.isEmpty()) {
                Log.e(TAG, "No subtitle content in response")
                return@withContext null
            }
            
            Log.d(TAG, "Downloaded subtitle successfully, size: ${content.length} bytes")
            content
            
        } catch (e: Exception) {
            Log.e(TAG, "Error downloading subtitle", e)
            null
        }
    }
}
