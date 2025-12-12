package com.ronika.iptvnative.components

import android.content.Context
import android.net.Uri
import android.util.AttributeSet
import android.util.Log
import android.view.KeyEvent
import android.view.LayoutInflater
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.ProgressBar
import android.widget.TextView
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.common.util.Util
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.common.TrackSelectionParameters
import androidx.media3.ui.PlayerView
import com.ronika.iptvnative.R
import com.ronika.iptvnative.api.StalkerClient
import com.ronika.iptvnative.utils.AppPreferences
import com.ronika.iptvnative.database.AppDatabase
import com.ronika.iptvnative.database.entities.ProviderEntity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import coil.ImageLoader
import coil.request.ImageRequest

/**
 * LiveTVPlayerComponent - Handles preview and fullscreen playback for Live TV channels
 */
class LiveTVPlayerComponent @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : FrameLayout(context, attrs, defStyleAttr) {

    private val TAG = "LiveTVPlayer"
    
    // Views
    private lateinit var playerView: PlayerView
    private lateinit var loadingIndicator: ProgressBar
    private lateinit var channelNameOverlay: TextView
    private lateinit var errorText: TextView
    private var bitrateInfo: TextView? = null
    // Bottom overlay views
    private var bottomInfoOverlay: FrameLayout? = null
    private var channelLogoSmall: ImageView? = null
    private var bottomChannelTitle: TextView? = null
    private var bottomProgramTime: TextView? = null
    private var currentProgramProgress: ProgressBar? = null
    private var bottomProgramTitle: TextView? = null
    private var bottomProgramDesc: TextView? = null
    private var bottomNextProgram: TextView? = null
    private var bottomBadges: View? = null
    private var badgeResolution: TextView? = null
    private var badgeFps: TextView? = null
    private var badgeAudio: TextView? = null
    
    // ExoPlayer
    private var player: ExoPlayer? = null
    
    // State
    private var isFullscreen = false
    private var currentChannelIndex = -1
    private var channels: List<LiveTVChannelsComponent.ChannelItem> = emptyList()
    private var loadingJob: Job? = null
    
    // Callbacks
    private var onFullscreenToggle: ((Boolean) -> Unit)? = null
    private var onChannelChange: ((Int) -> Unit)? = null
    private var onBackPressed: (() -> Unit)? = null
    
    // API - initialized lazily with provider credentials
    private var stalkerClient: StalkerClient? = null
    private var currentProvider: ProviderEntity? = null
    
    // Database
    private val database = AppDatabase.getDatabase(context)
    private val providerDao = database.providerDao()
    
    private val scope = CoroutineScope(Dispatchers.Main)

    init {
        LayoutInflater.from(context).inflate(R.layout.component_live_tv_player, this, true)
        setupViews()
        setupPlayer()
        initializeClient()
    }
    
    /**
     * Initialize or reinitialize the Stalker client with credentials from active provider
     */
    private fun initializeClient() {
        scope.launch {
            val provider = withContext(Dispatchers.IO) {
                providerDao.getActiveProvider()
            }
            if (provider != null) {
                currentProvider = provider
                stalkerClient = StalkerClient(
                    portalUrl = provider.serverUrl,
                    macAddress = provider.macAddress ?: "",
                    token = provider.token ?: "",
                    serialNumber = provider.serialNumber ?: ""
                )
                Log.d(TAG, "LiveTVPlayer: Initialized StalkerClient with provider: ${provider.name}")
            } else {
                Log.e(TAG, "LiveTVPlayer: No active provider found!")
            }
        }
    }
    
    /**
     * Initialize with a specific provider ID
     */
    suspend fun initializeWithProvider(providerId: String?) {
        val provider = withContext(Dispatchers.IO) {
            if (providerId != null) {
                providerDao.getProviderById(providerId)
            } else {
                providerDao.getActiveProvider()
            }
        }
        if (provider != null) {
            stalkerClient = StalkerClient(
                portalUrl = provider.serverUrl,
                macAddress = provider.macAddress ?: "",
                token = provider.token ?: "",
                serialNumber = provider.serialNumber ?: ""
            )
            Log.d(TAG, "LiveTVPlayer: Initialized StalkerClient with provider: ${provider.name}")
        } else {
            Log.e(TAG, "LiveTVPlayer: Provider not found: $providerId")
        }
    }

    private fun setupViews() {
        playerView = findViewById(R.id.player_view)
        loadingIndicator = findViewById(R.id.loading_indicator)
        channelNameOverlay = findViewById(R.id.channel_name_overlay)
        errorText = findViewById(R.id.error_text)
        bitrateInfo = findViewById(R.id.bitrate_info)
        bottomInfoOverlay = findViewById(R.id.bottom_info_overlay)
        channelLogoSmall = findViewById(R.id.channel_logo_small)
        bottomChannelTitle = findViewById(R.id.bottom_channel_title)
        bottomProgramTime = findViewById(R.id.bottom_program_time)
        currentProgramProgress = findViewById(R.id.current_program_progress)
        bottomProgramTitle = findViewById(R.id.bottom_program_title)
        bottomProgramDesc = findViewById(R.id.bottom_program_desc)
        bottomNextProgram = findViewById(R.id.bottom_next_program)
        bottomBadges = findViewById(R.id.bottom_badges)
        badgeResolution = findViewById(R.id.badge_resolution)
        badgeFps = findViewById(R.id.badge_fps)
        badgeAudio = findViewById(R.id.badge_audio)
        
        // Keep screen on during playback to prevent screensaver
        playerView.keepScreenOn = true
        
        // Hide controls in preview, show in fullscreen
        playerView.useController = false
        
        // Set focus handling for fullscreen mode
        isFocusable = true
        isFocusableInTouchMode = true
    }

    @androidx.annotation.OptIn(UnstableApi::class)
    private fun setupPlayer() {
        player = ExoPlayer.Builder(context).build().apply {
            playWhenReady = true
            playerView.player = this
            
            // Configure adaptive quality based on device capabilities
            configureAdaptiveQuality()
            
            addListener(object : Player.Listener {
                override fun onPlaybackStateChanged(playbackState: Int) {
                    val stateStr = when (playbackState) {
                        Player.STATE_IDLE -> "IDLE"
                        Player.STATE_BUFFERING -> "BUFFERING"
                        Player.STATE_READY -> "READY"
                        Player.STATE_ENDED -> "ENDED"
                        else -> "UNKNOWN"
                    }
                    Log.d(TAG, "Playback state changed to: $stateStr")
                    
                    when (playbackState) {
                        Player.STATE_BUFFERING -> showLoading(true)
                        Player.STATE_READY -> {
                            showLoading(false)
                            hideError()
                            Log.d(TAG, "Player is READY - video should be visible now")
                            // Update bitrate info when ready
                            updateBitrateInfo()
                        }
                        Player.STATE_ENDED -> {
                            Log.w(TAG, "Playback ended")
                        }
                    }
                }
                
                override fun onTracksChanged(tracks: androidx.media3.common.Tracks) {
                    super.onTracksChanged(tracks)
                    // Update bitrate display when tracks change (e.g., quality adaptation)
                    updateBitrateInfo()
                }
                
                override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                    Log.e(TAG, "Player error: ${error.message}", error)
                    // Let ExoPlayer handle codec/format errors through adaptive quality selection
                    // Only show error for network or other fatal issues
                    when (error.errorCode) {
                        androidx.media3.common.PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED,
                        androidx.media3.common.PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT,
                        androidx.media3.common.PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS -> {
                            showError("Network error")
                        }
                        else -> {
                            Log.d(TAG, "Non-fatal error, letting ExoPlayer handle it")
                            // ExoPlayer will try to recover automatically
                        }
                    }
                }
            })
        }
    }
    
    /**
     * Configure adaptive quality selection based on device screen resolution
     */
    @androidx.annotation.OptIn(UnstableApi::class)
    private fun ExoPlayer.configureAdaptiveQuality() {
        val displayMetrics = context.resources.displayMetrics
        val screenWidth = displayMetrics.widthPixels
        val screenHeight = displayMetrics.heightPixels
        
        // Determine max resolution based on screen size
        val (maxWidth, maxHeight, maxBitrate) = when {
            screenHeight >= 2160 -> Triple(3840, 2160, 20_000_000) // 4K
            screenHeight >= 1440 -> Triple(2560, 1440, 10_000_000) // 1440p
            screenHeight >= 1080 -> Triple(1920, 1080, 5_000_000)  // 1080p
            else -> Triple(1280, 720, 2_500_000)                    // 720p
        }
        
        Log.d(TAG, "Screen: ${screenWidth}x${screenHeight}, Max quality: ${maxWidth}x${maxHeight}, Max bitrate: ${maxBitrate / 1_000_000}Mbps")
        
        trackSelectionParameters = TrackSelectionParameters.Builder(context)
            .setMaxVideoSize(maxWidth, maxHeight)
            .setMaxVideoBitrate(maxBitrate)
            .build()
    }

    fun setChannels(channelList: List<LiveTVChannelsComponent.ChannelItem>) {
        channels = channelList
    }

    /**
     * Resume last-played live channel if available in settings and current provider.
     * By default resumes into preview mode (no automatic fullscreen).
     */
    fun resumeLastPlayedIfAvailable(autoFullscreen: Boolean = false) {
        scope.launch {
            try {
                val (savedProviderId, savedChannelId) = AppPreferences.getLastPlayedChannel(context)
                if (savedChannelId.isNullOrEmpty()) return@launch

                // Only resume if provider matches current provider
                if (savedProviderId != null && currentProvider?.id != null && savedProviderId != currentProvider?.id) {
                    Log.d(TAG, "Saved provider does not match current provider - skipping resume")
                    return@launch
                }

                // Find channel index
                val idx = channels.indexOfFirst { it.id == savedChannelId }
                if (idx >= 0) {
                    // Start playback in preview or fullscreen per caller preference
                    if (autoFullscreen) {
                        currentChannelIndex = idx
                        goFullscreen()
                        loadAndPlayStream(channels[idx])
                    } else {
                        playInPreview(idx)
                    }
                } else {
                    Log.d(TAG, "Saved channel id not found in current channel list: $savedChannelId")
                }
            } catch (e: Exception) {
                Log.w(TAG, "resumeLastPlayedIfAvailable error: ${e.message}")
            }
        }
    }

    fun setCallbacks(
        fullscreenToggle: (Boolean) -> Unit,
        channelChange: (Int) -> Unit,
        backPressed: () -> Unit
    ) {
        onFullscreenToggle = fullscreenToggle
        onChannelChange = channelChange
        onBackPressed = backPressed
    }

    /**
     * Play channel in preview mode (small player)
     */
    fun playInPreview(channelIndex: Int) {
        if (channelIndex < 0 || channelIndex >= channels.size) {
            Log.e(TAG, "Invalid channel index: $channelIndex (channels size: ${channels.size})")
            return
        }
        
        currentChannelIndex = channelIndex
        isFullscreen = false
        
        val channel = channels[channelIndex]
        Log.d(TAG, "playInPreview called - Channel: ${channel.name}, Index: $channelIndex")
        
        // Update UI for preview
        playerView.useController = false
        channelNameOverlay.visibility = GONE
        
        // Load and play stream
        loadAndPlayStream(channel)
        
        onChannelChange?.invoke(channelIndex)
    }

    /**
     * Go fullscreen with current channel
     */
    fun goFullscreen() {
        if (currentChannelIndex < 0) return
        
        isFullscreen = true
        
        val channel = channels[currentChannelIndex]
        Log.d(TAG, "Going fullscreen: ${channel.name}")
        
        // Update UI for fullscreen - NO CONTROLS for live TV
        playerView.useController = false
        showChannelName(channel.name)
        
        requestFocus()
        
        onFullscreenToggle?.invoke(true)
    }

    /**
     * Exit fullscreen, back to preview mode (keep playing)
     */
    fun exitFullscreen() {
        isFullscreen = false
        playerView.useController = false
        channelNameOverlay.visibility = GONE
        
        Log.d(TAG, "Exiting fullscreen, keeping channel in preview")
        
        onFullscreenToggle?.invoke(false)
    }
    
    /**
     * Stop playback completely
     */
    fun stopPlayback() {
        player?.stop()
        player?.clearMediaItems()
        currentChannelIndex = -1
        Log.d(TAG, "Playback stopped")
    }

    /**
     * Play next channel (fullscreen only)
     */
    fun playNextChannel() {
        if (!isFullscreen || currentChannelIndex >= channels.size - 1) return
        
        val nextIndex = currentChannelIndex + 1
        currentChannelIndex = nextIndex
        
        val channel = channels[nextIndex]
        Log.d(TAG, "Playing next channel: ${channel.name}")
        
        showChannelName(channel.name)
        loadAndPlayStream(channel)
        
        onChannelChange?.invoke(nextIndex)
    }

    /**
     * Play previous channel (fullscreen only)
     */
    fun playPreviousChannel() {
        if (!isFullscreen || currentChannelIndex <= 0) return
        
        val prevIndex = currentChannelIndex - 1
        currentChannelIndex = prevIndex
        
        val channel = channels[prevIndex]
        Log.d(TAG, "Playing previous channel: ${channel.name}")
        
        showChannelName(channel.name)
        loadAndPlayStream(channel)
        
        onChannelChange?.invoke(prevIndex)
    }

    private fun loadAndPlayStream(channel: LiveTVChannelsComponent.ChannelItem) {
        // Cancel any existing loading
        loadingJob?.cancel()
        
        showLoading(true)
        hideError()
        
        Log.d(TAG, "loadAndPlayStream called for: ${channel.name}, url: ${channel.url}")
        
        loadingJob = scope.launch {
            try {
                // Extract cmd from channel URL
                val cmd = channel.url.replace("ffrt ", "").trim()
                
                // Check if M3U provider - direct play without API call
                if (currentProvider?.type == "m3u") {
                    Log.d(TAG, "M3U provider detected - playing direct URL: $cmd")
                    withContext(Dispatchers.Main) {
                        playStream(cmd)
                        // Persist last-played channel (safe write, won't overwrite other settings)
                        try {
                            scope.launch {
                                AppPreferences.setLastPlayedChannel(context, currentProvider?.id, channel.id)
                            }
                        } catch (e: Exception) {
                            Log.w(TAG, "Failed to persist last-played channel: ${e.message}")
                        }
                    }
                    return@launch
                }
                
                // Stalker provider - get stream URL from API
                Log.d(TAG, "Getting stream URL for cmd: $cmd")
                
                val client = stalkerClient
                if (client == null) {
                    Log.e(TAG, "StalkerClient not initialized!")
                    withContext(Dispatchers.Main) {
                        showError("Client not ready")
                        showLoading(false)
                    }
                    return@launch
                }
                
                // Get stream URL from Stalker API
                val response = withContext(Dispatchers.IO) {
                    client.getStreamUrl(cmd)
                }
                
                val streamUrl = response.url
                Log.d(TAG, "Received stream URL: $streamUrl")
                
                // Play stream
                withContext(Dispatchers.Main) {
                    // Update bottom overlay with EPG/metadata
                    try {
                        updateBottomOverlay(channel)
                    } catch (e: Exception) {
                        Log.w(TAG, "Failed to update bottom overlay: ${e.message}")
                    }
                    playStream(streamUrl)

                    // Persist last-played channel (safe write, won't overwrite other settings)
                    try {
                        scope.launch {
                            AppPreferences.setLastPlayedChannel(context, currentProvider?.id, channel.id)
                        }
                    } catch (e: Exception) {
                        Log.w(TAG, "Failed to persist last-played channel: ${e.message}")
                    }
                }
                
            } catch (e: Exception) {
                Log.e(TAG, "Error loading stream: ${e.message}", e)
                withContext(Dispatchers.Main) {
                    showError("Failed to load stream")
                    showLoading(false)
                }
            }
        }
    }

    private fun playStream(url: String) {
        try {
            Log.d(TAG, "playStream called with URL: $url")
            
            if (player == null) {
                Log.e(TAG, "Player is null! Reinitializing...")
                setupPlayer()
            }
            
            val mediaItem = MediaItem.fromUri(Uri.parse(url))
            player?.setMediaItem(mediaItem)
            player?.prepare()
            player?.play()
            
            // Ensure player view is visible
            playerView.visibility = VISIBLE
            
            Log.d(TAG, "MediaItem set, player prepared and started. Player state: ${player?.playbackState}")
        } catch (e: Exception) {
            Log.e(TAG, "Error playing stream: ${e.message}", e)
            showError("Playback error")
        }
    }

    private fun showLoading(show: Boolean) {
        loadingIndicator.visibility = if (show) VISIBLE else GONE
    }

    private fun showError(message: String) {
        errorText.text = message
        errorText.visibility = VISIBLE
    }

    private fun hideError() {
        errorText.visibility = GONE
    }

    private fun showChannelName(name: String) {
        channelNameOverlay.text = name
        channelNameOverlay.visibility = VISIBLE
        
        // Auto-hide after 3 seconds
        channelNameOverlay.postDelayed({
            channelNameOverlay.visibility = GONE
        }, 3000)
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        Log.d(TAG, "onKeyDown: keyCode=$keyCode, isFullscreen=$isFullscreen")
        
        if (!isFullscreen) return super.onKeyDown(keyCode, event)
        
        return when (keyCode) {
            KeyEvent.KEYCODE_DPAD_UP -> {
                Log.d(TAG, "UP key pressed - playing next channel")
                playNextChannel()
                true
            }
            KeyEvent.KEYCODE_DPAD_DOWN -> {
                Log.d(TAG, "DOWN key pressed - playing previous channel")
                playPreviousChannel()
                true
            }
            KeyEvent.KEYCODE_BACK -> {
                Log.d(TAG, "BACK key pressed - exiting fullscreen")
                exitFullscreen()
                onBackPressed?.invoke()
                true
            }
            else -> super.onKeyDown(keyCode, event)
        }
    }

    fun pause() {
        player?.pause()
    }

    fun resume() {
        player?.play()
    }

    /**
     * Update bitrate information display
     */
    private fun updateBitrateInfo() {
        if (!isFullscreen) return // Only show in fullscreen mode
        
        val bitrateView = bitrateInfo ?: return
        
        // Check if user wants to see bitrate info
        if (!AppPreferences.shouldShowBitrate(context)) {
            bitrateView.visibility = GONE
            return
        }
        
        player?.let { exoPlayer ->
            try {
                // Get current video format from selected tracks
                val currentTracks = exoPlayer.currentTracks
                val videoTrack = currentTracks.groups.firstOrNull { group ->
                    group.type == androidx.media3.common.C.TRACK_TYPE_VIDEO && group.isSelected
                }
                
                videoTrack?.let { track ->
                    // Get the selected format
                    for (i in 0 until track.length) {
                        if (track.isTrackSelected(i)) {
                            val format = track.getTrackFormat(i)
                            
                            // Extract info
                            val width = format.width
                            val height = format.height
                            val bitrate = format.bitrate
                            val codecs = format.codecs
                            
                            // Format resolution label
                            val resolution = when {
                                height >= 2160 -> "4K"
                                height >= 1440 -> "1440p"
                                height >= 1080 -> "1080p"
                                height >= 720 -> "720p"
                                height >= 480 -> "480p"
                                else -> "${height}p"
                            }
                            
                            // Format bitrate (convert from bps to Mbps)
                            val bitrateText = if (bitrate > 0) {
                                String.format("%.1f Mbps", bitrate / 1_000_000.0)
                            } else {
                                "N/A"
                            }
                            
                            // Extract codec name (e.g., "avc1.64001f" -> "H.264")
                            val codecName = when {
                                codecs?.startsWith("avc") == true -> "H.264"
                                codecs?.startsWith("hev") == true || codecs?.startsWith("hvc") == true -> "H.265"
                                codecs?.startsWith("vp9") == true -> "VP9"
                                codecs?.startsWith("av01") == true -> "AV1"
                                else -> codecs?.split('.')?.firstOrNull()?.uppercase() ?: "N/A"
                            }
                            
                            // Update UI
                            bitrateView.post {
                                bitrateView.text = "$resolution • $bitrateText • $codecName"
                                bitrateView.visibility = VISIBLE
                            }
                            
                            Log.d(TAG, "📊 Bitrate Info: $resolution (${width}x${height}) • $bitrateText • $codecName")
                            break
                        }
                    }
                } ?: run {
                    // No video track found
                    bitrateView.post {
                        bitrateView.visibility = GONE
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error updating bitrate info: ${e.message}", e)
                bitrateView.post {
                    bitrateView.visibility = GONE
                }
            }
        }
    }

    /**
     * Update bottom overlay with channel logo, EPG and badges
     */
    private fun updateBottomOverlay(channel: LiveTVChannelsComponent.ChannelItem) {
        // Only show overlay in fullscreen mode
        if (!isFullscreen) return

        bottomInfoOverlay?.visibility = VISIBLE

        // Load logo if present (safe nullable handling)
        if (!channel.logo.isNullOrEmpty()) {
            channelLogoSmall?.let { imgView ->
                try {
                    val request = ImageRequest.Builder(context)
                        .data(channel.logo)
                        .target(imgView)
                        .placeholder(R.drawable.ic_tv_placeholder)
                        .error(R.drawable.ic_tv_placeholder)
                        .build()
                    ImageLoader(context).enqueue(request)
                } catch (e: Exception) {
                    imgView.setImageResource(R.drawable.ic_tv_placeholder)
                }
            } ?: run {
                // imageView missing, skip
            }
        } else {
            channelLogoSmall?.setImageResource(R.drawable.ic_tv_placeholder)
        }

        bottomChannelTitle?.text = channel.name

        // EPG - find current slot using timestamps if available
        try {
            val nowSec = System.currentTimeMillis() / 1000L
            val slot = channel.epgSlotsWithTimestamp.firstOrNull { s ->
                nowSec >= s.startTimestamp && nowSec <= s.endTimestamp
            }

            if (slot != null) {
                bottomProgramTitle?.text = slot.programName
                bottomProgramDesc?.text = "" // Short description not available here
                bottomProgramTime?.text = "${slot.startTime} — ${slot.endTime} • ${slot.durationMinutes} min"

                // Progress
                val duration = (slot.endTimestamp - slot.startTimestamp).toDouble()
                val elapsed = (nowSec - slot.startTimestamp).toDouble()
                val pct = if (duration > 0) ((elapsed / duration) * 100.0).toInt() else 0
                currentProgramProgress?.progress = pct.coerceIn(0, 100)
            } else {
                // Fallback to first epg slot
                val next = channel.epgSlotsWithTimestamp.firstOrNull()
                if (next != null) {
                    bottomProgramTitle?.text = next.programName
                    bottomProgramDesc?.text = ""
                    bottomProgramTime?.text = "${next.startTime} — ${next.endTime} • ${next.durationMinutes} min"
                    currentProgramProgress?.progress = 0
                } else {
                    bottomProgramTitle?.text = "No information"
                    bottomProgramDesc?.text = ""
                    bottomProgramTime?.text = ""
                    currentProgramProgress?.progress = 0
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "EPG parse error: ${e.message}")
            bottomProgramTitle?.text = "No information"
            bottomProgramDesc?.text = ""
            bottomProgramTime?.text = ""
            currentProgramProgress?.progress = 0
        }

        // Next program
        try {
            val nowSec = System.currentTimeMillis() / 1000L
            val next = channel.epgSlotsWithTimestamp
                .filter { it.startTimestamp > nowSec }
                .minByOrNull { it.startTimestamp }

            if (next != null) {
                bottomNextProgram?.text = "Next: ${next.startTime} — ${next.endTime}  ${next.programName}"
                bottomNextProgram?.visibility = VISIBLE
            } else {
                bottomNextProgram?.visibility = GONE
            }
        } catch (e: Exception) {
            bottomNextProgram?.visibility = GONE
        }

        // Apply badges from current selected track(s)
        applyFormatBadges()

        // Auto-hide overlay after a short time in preview, keep visible in fullscreen for a bit
        bottomInfoOverlay?.removeCallbacks(hideBottomRunnable)
        val hideDelay = 3_000L
        bottomInfoOverlay?.postDelayed(hideBottomRunnable, hideDelay)
    }

    private val hideBottomRunnable = Runnable {
        bottomInfoOverlay?.visibility = GONE
    }

    private fun applyFormatBadges() {
        try {
            player?.let { exoPlayer ->
                val currentTracks = exoPlayer.currentTracks
                val videoGroup = currentTracks.groups.firstOrNull { group ->
                    group.type == androidx.media3.common.C.TRACK_TYPE_VIDEO && group.isSelected
                }

                var resolutionText: String? = null
                var fpsVal: Float? = null
                var audioChannels: Int? = null

                videoGroup?.let { group ->
                    for (i in 0 until group.length) {
                        if (group.isTrackSelected(i)) {
                            val format = group.getTrackFormat(i)
                            val height = format.height
                            val fps = format.frameRate
                            resolutionText = when {
                                height >= 2160 -> "4K"
                                height >= 1440 -> "1440p"
                                height >= 1080 -> "1080p"
                                height >= 720 -> "720p"
                                height >= 480 -> "480p"
                                else -> "SD"
                            }
                            fpsVal = fps
                            break
                        }
                    }
                }

                // Audio channels from audio track if available
                val audioGroup = currentTracks.groups.firstOrNull { g ->
                    g.type == androidx.media3.common.C.TRACK_TYPE_AUDIO && g.isSelected
                }
                audioGroup?.let { g ->
                    for (i in 0 until g.length) {
                        if (g.isTrackSelected(i)) {
                            val af = g.getTrackFormat(i)
                            audioChannels = af.channelCount
                            break
                        }
                    }
                }

                // Determine badge booleans before entering UI closure
                val showResolution = !resolutionText.isNullOrEmpty()
                val fpsLocal = fpsVal
                val audioLocal = audioChannels
                val showFps = fpsLocal != null && fpsLocal >= 50f
                val showAudio = audioLocal != null && audioLocal >= 2

                // Update badges on UI thread
                bottomInfoOverlay?.post {
                    if (showResolution) {
                        badgeResolution?.text = resolutionText
                        badgeResolution?.visibility = VISIBLE
                    } else {
                        badgeResolution?.visibility = GONE
                    }

                    if (showFps) {
                        badgeFps?.visibility = VISIBLE
                    } else {
                        badgeFps?.visibility = GONE
                    }

                    if (showAudio) {
                        badgeAudio?.visibility = VISIBLE
                    } else {
                        badgeAudio?.visibility = GONE
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "applyFormatBadges error: ${e.message}")
            badgeResolution?.visibility = GONE
            badgeFps?.visibility = GONE
            badgeAudio?.visibility = GONE
        }
    }

    fun release() {
        loadingJob?.cancel()
        player?.release()
        player = null
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        release()
    }
}
