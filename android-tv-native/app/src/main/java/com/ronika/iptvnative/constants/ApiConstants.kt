package com.ronika.iptvnative.constants

/**
 * API Configuration Constants
 * Matches mobile app endpoint configuration
 */
object ApiConstants {
    // Backend base URL (for auth, sync, etc.)
    const val BACKEND_BASE_URL = "http://api.iptv.ronika.co"
    
    // Backend API base URL for Stalker proxy endpoints (matching mobile app)
    const val BACKEND_URL = "http://api.iptv.ronika.co/api"
    
    // Subtitle/Whisper service URL (matching mobile app)
    const val SUBTITLE_SERVICE_URL = "http://api.iptv.ronika.co/subtitle"
    
    // Default Stalker portal configuration
    const val DEFAULT_MAC_ADDRESS = "00:1a:79:17:f4:f5"
    const val DEFAULT_SERIAL_NUMBER = "058357N656529"
    
    // Request timeouts (in seconds)
    const val CONNECT_TIMEOUT = 30L
    const val READ_TIMEOUT = 30L
    const val WRITE_TIMEOUT = 30L
    
    // SSE timeout (no timeout for streaming)
    const val SSE_READ_TIMEOUT = 0L
}
