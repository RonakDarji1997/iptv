package com.ronika.iptvnative.services

import android.util.Log
import com.ronika.iptvnative.constants.ApiConstants
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import okhttp3.*
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Subtitle Service - SSE Streaming Approach (matches mobile app)
 * 
 * Architecture:
 * 1. Connect to backend SSE endpoint: /api/subtitles/generate-stream
 * 2. Receive real-time subtitle and progress events
 * 3. Cancel generation via DELETE: /api/subtitles/generate/{videoId}
 */
class SubtitleService {
    
    companion object {
        private const val TAG = "SubtitleService"
    }
    
    private val scope = CoroutineScope(Dispatchers.IO)
    
    // Backend configuration
    private val backendUrl = ApiConstants.SUBTITLE_SERVICE_URL
    
    private val client = OkHttpClient.Builder()
        .connectTimeout(ApiConstants.CONNECT_TIMEOUT, TimeUnit.SECONDS)
        .readTimeout(ApiConstants.SSE_READ_TIMEOUT, TimeUnit.SECONDS)  // No timeout for SSE
        .writeTimeout(ApiConstants.WRITE_TIMEOUT, TimeUnit.SECONDS)
        .build()
    
    // State
    private var eventSource: EventSource? = null
    private var currentVideoId: String? = null
    
    // Events
    sealed class SubtitleEvent {
        data class Connected(val videoId: String) : SubtitleEvent()
        data class Progress(
            val percent: Double,
            val processedSeconds: Long,
            val totalDuration: Long,
            val estimatedTime: Long
        ) : SubtitleEvent()
        data class Subtitle(
            val index: Int,
            val startTime: Double,
            val endTime: Double,
            val text: String
        ) : SubtitleEvent()
        data class Complete(val message: String) : SubtitleEvent()
        data class Error(val message: String) : SubtitleEvent()
        object Stopped : SubtitleEvent()
    }
    
    private val _subtitleFlow = MutableStateFlow<SubtitleEvent?>(null)
    val subtitleFlow: StateFlow<SubtitleEvent?> = _subtitleFlow
    
    /**
     * Start subtitle generation with SSE streaming
     */
    fun start(streamUrl: String, videoId: String, language: String = "auto", startPosition: Long = 0): String {
        // Close any existing connection
        close()
        
        currentVideoId = videoId
        val startPositionSec = startPosition / 1000
        
        Log.d(TAG, "🎬 Starting subtitle generation")
        Log.d(TAG, "  - videoId: $videoId")
        Log.d(TAG, "  - startPosition: ${startPositionSec}s")
        
        // Build SSE URL
        val url = HttpUrl.Builder()
            .scheme("http")
            .host("api.iptv.ronika.co")
            .addPathSegments("subtitle/api/subtitles/generate-stream")
            .addQueryParameter("streamUrl", streamUrl)
            .addQueryParameter("videoId", videoId)
            .addQueryParameter("language", language)
            .addQueryParameter("model", "tiny")
            .addQueryParameter("startPosition", startPositionSec.toString())
            .build()
        
        val request = Request.Builder()
            .url(url)
            .get()
            .build()
        
        eventSource = EventSources.createFactory(client)
            .newEventSource(request, object : EventSourceListener() {
                override fun onOpen(eventSource: EventSource, response: Response) {
                    Log.d(TAG, "✅ SSE connection opened")
                }
                
                override fun onEvent(
                    eventSource: EventSource,
                    id: String?,
                    type: String?,
                    data: String
                ) {
                    scope.launch {
                        try {
                            val json = JSONObject(data)
                            when (json.optString("type")) {
                                "connected" -> {
                                    Log.d(TAG, "🔗 Connected")
                                    _subtitleFlow.emit(SubtitleEvent.Connected(videoId))
                                }
                                "progress" -> {
                                    val percent = json.optDouble("percent", 0.0)
                                    val processed = json.optLong("processedSeconds", 0)
                                    val total = json.optLong("totalDuration", 0)
                                    val estimated = json.optLong("estimatedTime", 0)
                                    
                                    Log.d(TAG, "⏳ Progress: ${percent.toInt()}% ($processed/${total}s)")
                                    _subtitleFlow.emit(
                                        SubtitleEvent.Progress(percent, processed, total, estimated)
                                    )
                                }
                                "subtitle" -> {
                                    val index = json.optInt("index", 0)
                                    val startTime = json.optDouble("startTime", 0.0)
                                    val endTime = json.optDouble("endTime", 0.0)
                                    val text = json.optString("text", "")
                                    
                                    Log.d(TAG, "📝 [Received] [${startTime.toInt()}s - ${endTime.toInt()}s] \"$text\"")
                                    _subtitleFlow.emit(
                                        SubtitleEvent.Subtitle(index, startTime, endTime, text)
                                    )
                                }
                                "complete" -> {
                                    Log.d(TAG, "✅ [Subtitles] Generation complete!")
                                    _subtitleFlow.emit(SubtitleEvent.Complete("Generation complete"))
                                    close()
                                }
                                "error" -> {
                                    val message = json.optString("message", "Unknown error")
                                    Log.e(TAG, "❌ [Subtitles] Error: $message")
                                    _subtitleFlow.emit(SubtitleEvent.Error(message))
                                    close()
                                }
                            }
                        } catch (e: Exception) {
                            Log.e(TAG, "Error parsing SSE event", e)
                        }
                    }
                }
                
                override fun onClosed(eventSource: EventSource) {
                    Log.d(TAG, "SSE connection closed")
                    scope.launch {
                        _subtitleFlow.emit(SubtitleEvent.Stopped)
                    }
                }
                
                override fun onFailure(eventSource: EventSource, t: Throwable?, response: Response?) {
                    // Ignore "Socket closed" errors - these happen during normal cleanup
                    val errorMessage = t?.message ?: "Connection failed"
                    if (errorMessage.contains("Socket closed", ignoreCase = true)) {
                        Log.d(TAG, "SSE connection closed normally")
                        return
                    }
                    
                    Log.e(TAG, "SSE connection failed", t)
                    scope.launch {
                        _subtitleFlow.emit(SubtitleEvent.Error(errorMessage))
                    }
                }
            })
        
        return videoId
    }
    
    /**
     * Stop subtitle generation
     */
    fun stop() {
        currentVideoId?.let { videoId ->
            scope.launch {
                try {
                    Log.d(TAG, "🛑 Sending cancel request for videoId: $videoId")
                    
                    val request = Request.Builder()
                        .url("$backendUrl/api/subtitles/generate/$videoId")
                        .delete()
                        .build()
                    
                    val response = client.newCall(request).execute()
                    Log.d(TAG, "🛑 Cancel response: ${response.code}")
                    
                    if (response.isSuccessful) {
                        Log.d(TAG, "✅ Subtitle generation cancelled")
                    } else {
                        Log.e(TAG, "❌ Failed to cancel: ${response.code}")
                    }
                    
                    _subtitleFlow.emit(SubtitleEvent.Stopped)
                } catch (e: Exception) {
                    Log.e(TAG, "Error canceling generation", e)
                }
            }
        }
        close()
    }
    
    private fun close() {
        Log.d(TAG, "🧹 Closing SSE connection")
        eventSource?.cancel()
        eventSource = null
        currentVideoId = null
    }
}
