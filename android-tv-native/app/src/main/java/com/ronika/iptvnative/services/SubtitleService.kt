package com.ronika.iptvnative.services

import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Subtitle Service - Backend Stream Approach
 * 
 * Architecture:
 * 1. Android sends stream URL to backend
 * 2. Backend uses FFmpeg to listen to stream and extract audio
 * 3. Backend sends audio chunks to Whisper for transcription
 * 4. Backend generates VTT subtitle file
 * 5. Android loads subtitle track from backend URL
 */
class SubtitleService {
    
    companion object {
        private const val TAG = "SubtitleService"
    }
    
    private val scope = CoroutineScope(Dispatchers.IO)
    
    // Backend configuration
    private val backendUrl = "http://192.168.2.69:8770"
    
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(90, TimeUnit.SECONDS)  // Increased to 90s (backend waits 60s for first subtitle)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()
    
    // State
    private var isRunning = false
    private var currentStreamId: String? = null
    private var currentLanguage: String = "auto"
    
    // Events
    sealed class SubtitleEvent {
        data class Started(val message: String) : SubtitleEvent()
        data class TrackReady(val subtitleUrl: String) : SubtitleEvent()
        data class Subtitle(
            val text: String,
            val timestamp: Long,
            val language: String,
            val confidence: Float
        ) : SubtitleEvent()
        data class Error(val message: String) : SubtitleEvent()
        object Stopped : SubtitleEvent()
    }
    
    private val _subtitleFlow = MutableStateFlow<SubtitleEvent?>(null)
    val subtitleFlow: StateFlow<SubtitleEvent?> = _subtitleFlow
    
    /**
     * Start subtitle generation for a stream URL
     * Backend will listen to the stream and generate subtitles
     */
    fun start(streamUrl: String, language: String = "auto", startPosition: Long = 0): String? {
        if (isRunning) {
            Log.w(TAG, "Subtitle service already running - canceling old job and starting new one")
            stop() // Cancel old job
        }
        
        this.currentLanguage = language
        isRunning = true
        
        var resultStreamId: String? = null
        
        scope.launch {
            try {
                _subtitleFlow.emit(SubtitleEvent.Started("Requesting subtitle generation..."))
                
                // Request backend to start subtitle generation
                val streamId = requestSubtitleGeneration(streamUrl, language, startPosition)
                
                if (streamId != null) {
                    currentStreamId = streamId
                    val subtitleUrl = "$backendUrl/subtitle/$streamId.vtt"
                    
                    Log.d(TAG, "✅ Subtitle generation started")
                    Log.d(TAG, "Stream ID: $streamId")
                    Log.d(TAG, "Subtitle URL: $subtitleUrl")
                    
                    _subtitleFlow.emit(SubtitleEvent.TrackReady(subtitleUrl))
                    resultStreamId = streamId
                } else {
                    _subtitleFlow.emit(SubtitleEvent.Error("Failed to start subtitle generation"))
                    isRunning = false
                }
                
            } catch (e: Exception) {
                Log.e(TAG, "Error starting subtitles", e)
                _subtitleFlow.emit(SubtitleEvent.Error("Error: ${e.message}"))
                isRunning = false
            }
        }
        
        Log.d(TAG, "Subtitle service started for stream: $streamUrl")
        return resultStreamId
    }
    
    /**
     * Stop subtitle generation
     */
    fun stop() {
        if (!isRunning) {
            return
        }
        
        scope.launch {
            try {
                currentStreamId?.let { streamId ->
                    stopSubtitleGeneration(streamId)
                }
                
                _subtitleFlow.emit(SubtitleEvent.Stopped)
                
            } catch (e: Exception) {
                Log.e(TAG, "Error stopping subtitles", e)
            } finally {
                isRunning = false
                currentStreamId = null
            }
        }
        
        Log.d(TAG, "Subtitle service stopped")
    }
    
    /**
     * Request backend to start subtitle generation
     * POST /start-subtitle { streamUrl, language, startPosition }
     */
    private suspend fun requestSubtitleGeneration(streamUrl: String, language: String, startPosition: Long): String? {
        return try {
            val startPositionSeconds = startPosition / 1000
            Log.d(TAG, "🔢 Position conversion: ${startPosition}ms → ${startPositionSeconds}s")
            
            val json = JSONObject().apply {
                put("streamUrl", streamUrl)
                put("language", language)
                put("startPosition", startPositionSeconds) // Convert ms to seconds
            }
            
            Log.d(TAG, "📤 Sending to backend: $backendUrl/start-subtitle")
            Log.d(TAG, "📤 Request body: $json")
            
            val body = json.toString().toRequestBody("application/json".toMediaType())
            
            val request = Request.Builder()
                .url("$backendUrl/start-subtitle")
                .post(body)
                .build()
            
            val response = client.newCall(request).execute()
            
            if (response.isSuccessful) {
                val responseBody = response.body?.string()
                val responseJson = JSONObject(responseBody ?: "{}")
                
                Log.d(TAG, "📥 Backend response: $responseJson")
                
                responseJson.optString("streamId", null)
            } else {
                Log.e(TAG, "Backend error: ${response.code} ${response.message}")
                null
            }
            
        } catch (e: IOException) {
            Log.e(TAG, "Network error requesting subtitle generation", e)
            null
        } catch (e: Exception) {
            Log.e(TAG, "Error requesting subtitle generation", e)
            null
        }
    }
    
    /**
     * Request backend to stop subtitle generation
     * POST /stop-subtitle { streamId }
     */
    private suspend fun stopSubtitleGeneration(streamId: String) {
        try {
            val json = JSONObject().apply {
                put("streamId", streamId)
            }
            
            Log.d(TAG, "🛑 Sending stop request to backend: $backendUrl/stop-subtitle")
            Log.d(TAG, "🛑 Stream ID: $streamId")
            
            val body = json.toString().toRequestBody("application/json".toMediaType())
            
            val request = Request.Builder()
                .url("$backendUrl/stop-subtitle")
                .post(body)
                .build()
            
            val response = client.newCall(request).execute()
            
            if (response.isSuccessful) {
                Log.d(TAG, "✅ Subtitle generation stopped for stream: $streamId")
            } else {
                Log.e(TAG, "❌ Failed to stop subtitle generation: ${response.code}")
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error stopping subtitle generation", e)
        }
    }
    
    /**
     * Check if backend is available
     */
    suspend fun checkBackendHealth(): Boolean {
        return try {
            val request = Request.Builder()
                .url("$backendUrl/health")
                .get()
                .build()
            
            val response = client.newCall(request).execute()
            val isHealthy = response.isSuccessful
            
            if (isHealthy) {
                val body = response.body?.string()
                Log.d(TAG, "Backend health: $body")
            }
            
            isHealthy
            
        } catch (e: Exception) {
            Log.e(TAG, "Backend health check failed", e)
            false
        }
    }
}
