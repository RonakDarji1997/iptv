package com.ronika.iptvnative.components

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.AttributeSet
import android.util.Log
import android.view.KeyEvent
import android.view.LayoutInflater
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.ProgressBar
import android.widget.TextView
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionParameters
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import com.ronika.iptvnative.R
import com.ronika.iptvnative.repository.WatchProgressRepository
import com.ronika.iptvnative.services.SubtitleService
import com.ronika.iptvnative.utils.AppPreferences
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

/**
 * VODPlayerComponent - Handles movie/series playback with seek, restart, next, subtitle, and aspect ratio controls
 */
@UnstableApi
class VODPlayerComponent @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : FrameLayout(context, attrs, defStyleAttr) {

    private val TAG = "VODPlayer"
    
    // Views
    private lateinit var playerView: PlayerView
    private lateinit var loadingIndicator: ProgressBar
    private lateinit var errorText: TextView
    private lateinit var contentTitle: TextView
    private lateinit var restartButton: ImageButton
    private lateinit var subtitleButton: ImageButton
    private lateinit var nextButton: ImageButton
    private lateinit var aspectRatioButton: ImageButton
    private lateinit var subtitleText: TextView
    private lateinit var bitrateInfo: TextView
    
    // ExoPlayer
    private var player: ExoPlayer? = null
    
    // Subtitle service
    private val subtitleService = SubtitleService()
    private var subtitleStreamId: String? = null
    
    // Aspect ratio modes - using real aspect ratios
    data class AspectRatioOption(
        val name: String,
        val ratio: Float?,  // null = original/fit
        val resizeMode: Int
    )
    
    private val aspectRatioOptions = listOf(
        AspectRatioOption("16:9", 16f / 9f, AspectRatioFrameLayout.RESIZE_MODE_FIT),       // Standard HD/4K
        AspectRatioOption("4:3", 4f / 3f, AspectRatioFrameLayout.RESIZE_MODE_FIT),         // Legacy TV
        AspectRatioOption("21:9", 21f / 9f, AspectRatioFrameLayout.RESIZE_MODE_FIT),       // Ultra-wide/Cinema
        AspectRatioOption("1:1", 1f, AspectRatioFrameLayout.RESIZE_MODE_FIT),              // Square
        AspectRatioOption("Original", null, AspectRatioFrameLayout.RESIZE_MODE_FIT),      // Original aspect
        AspectRatioOption("Fill", null, AspectRatioFrameLayout.RESIZE_MODE_FILL),         // Stretch to fill
        AspectRatioOption("Zoom", null, AspectRatioFrameLayout.RESIZE_MODE_ZOOM)          // Zoom/Crop
    )
    private var currentAspectRatioIndex = 0
    
    // State
    private var currentMovieTitle: String = ""
    private var currentSeriesTitle: String? = null  // Store series name separately for progress tracking
    private var currentStreamUrl: String = ""
    private var hasSubtitles = false
    
    // Watch progress tracking
    private var currentContentId: String? = null
    private var currentContentType: String? = null
    private var currentPosterUrl: String? = null
    private var currentCmd: String? = null
    private var currentEpisodeId: String? = null
    private var currentSeasonId: String? = null  // Track seasonId for progress tracking
    private var currentSeasonNumber: Int? = null
    private var currentEpisodeNumber: Int? = null
    private val progressRepository = WatchProgressRepository(context)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val progressSaveHandler = Handler(Looper.getMainLooper())
    private val progressSaveRunnable = object : Runnable {
        override fun run() {
            saveWatchProgress()
            progressSaveHandler.postDelayed(this, 15000) // Save every 15 seconds
        }
    }
    
    // Callbacks
    private var onBackPressed: (() -> Unit)? = null
    private var onNextEpisode: (() -> Unit)? = null
    
    init {
        LayoutInflater.from(context).inflate(R.layout.component_vod_player, this, true)
        setupViews()
        setupPlayer()
    }

    private fun setupViews() {
        playerView = findViewById(R.id.player_view)
        loadingIndicator = findViewById(R.id.loading_indicator)
        errorText = findViewById(R.id.error_text)
        subtitleText = findViewById(R.id.subtitle_text)
        
        // Keep screen on during playback to prevent screensaver
        playerView.keepScreenOn = true
        
        // Configure subtitle view for ExoPlayer's built-in rendering
        playerView.subtitleView?.apply {
            setStyle(androidx.media3.ui.CaptionStyleCompat(
                android.graphics.Color.WHITE,              // foreground
                android.graphics.Color.parseColor("#99000000"), // background (semi-transparent black)
                android.graphics.Color.TRANSPARENT,        // window
                androidx.media3.ui.CaptionStyleCompat.EDGE_TYPE_DROP_SHADOW,
                android.graphics.Color.BLACK,              // edge color
                null                                       // typeface
            ))
            setFractionalTextSize(0.05f) // 5% of video height
            setApplyEmbeddedStyles(false) // Use our custom style
            setApplyEmbeddedFontSizes(false)
        }
        
        // Get custom control views
        contentTitle = playerView.findViewById(R.id.content_title)
        restartButton = playerView.findViewById(R.id.restart_button)
        subtitleButton = playerView.findViewById(R.id.subtitle_button)
        nextButton = playerView.findViewById(R.id.next_button)
        aspectRatioButton = playerView.findViewById(R.id.aspect_ratio_button)
        bitrateInfo = playerView.findViewById(R.id.bitrate_info)
        
        // Style the seek bar
        val timeBar = playerView.findViewById<androidx.media3.ui.DefaultTimeBar>(R.id.exo_progress)
        timeBar?.apply {
            // Set colors
            setPlayedColor(android.graphics.Color.parseColor("#FF3366")) // Pink played color
            setUnplayedColor(android.graphics.Color.parseColor("#33FFFFFF")) // Semi-transparent white
            setBufferedColor(android.graphics.Color.parseColor("#66FFFFFF")) // Buffered color
            setScrubberColor(android.graphics.Color.WHITE) // White thumb
        }
        
        setupControlListeners()
        setupFocusNavigation()
        
        // Enable focus for back button handling
        isFocusable = true
        isFocusableInTouchMode = true
        
        // Set PlayerView to handle key events
        playerView.isFocusable = true
        playerView.isFocusableInTouchMode = true
    }
    
    private fun setupFocusNavigation() {
        // Default setup - will be overridden in playMovie/playSeries
        // All buttons can go up to seek bar (handled in dispatchKeyEvent)
        restartButton.nextFocusUpId = View.NO_ID
        subtitleButton.nextFocusUpId = View.NO_ID
        nextButton.nextFocusUpId = View.NO_ID
        aspectRatioButton.nextFocusUpId = View.NO_ID
    }

    @androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
    private fun setupPlayer() {
        Log.d(TAG, "setupPlayer() called - initializing ExoPlayer")
        
        player = ExoPlayer.Builder(context).build().apply {
            playWhenReady = true
            playerView.player = this
            
            // Configure adaptive quality based on device capabilities
            Log.d(TAG, "Configuring adaptive quality...")
            val displayMetrics = context.resources.displayMetrics
            val screenWidth = displayMetrics.widthPixels
            val screenHeight = displayMetrics.heightPixels
            
            // Determine max quality based on screen resolution
            val (maxWidth, maxHeight, qualityLabel, maxBitrate) = when {
                screenHeight <= 720 -> {
                    Tuple4(1280, 720, "720p", 3_000_000)
                }
                screenHeight <= 1080 -> {
                    Tuple4(1920, 1080, "1080p", 8_000_000)
                }
                screenHeight <= 1440 -> {
                    Tuple4(2560, 1440, "1440p", 16_000_000)
                }
                else -> {
                    Tuple4(3840, 2160, "4K", 25_000_000)
                }
            }
            
            Log.d(TAG, "📺 Device screen: ${screenWidth}x${screenHeight}")
            Log.d(TAG, "📺 Setting max video quality: $qualityLabel ($maxWidth x $maxHeight) @ ${maxBitrate / 1_000_000}Mbps")
            
            // Set track selection parameters with strict constraints
            // The issue is that maxVideoSize is a preference, not a hard limit
            // We need to be more aggressive about limiting resolution
            trackSelectionParameters = TrackSelectionParameters.Builder(context)
                .setMaxVideoSize(maxWidth, maxHeight)
                .setMaxVideoBitrate(maxBitrate)
                .setViewportSize(maxWidth, maxHeight, true)  // Use max resolution as viewport
                .setForceHighestSupportedBitrate(false)
                .setForceLowestBitrate(false)
                .build()
            
            Log.d(TAG, "✅ Adaptive quality configured - max ${maxWidth}x${maxHeight} @ ${maxBitrate / 1_000_000}Mbps")
            
            addListener(object : Player.Listener {
                override fun onPlaybackStateChanged(playbackState: Int) {
                    when (playbackState) {
                        Player.STATE_IDLE -> {
                            Log.d(TAG, "Player IDLE")
                        }
                        Player.STATE_BUFFERING -> {
                            Log.d(TAG, "Player BUFFERING")
                            loadingIndicator.visibility = VISIBLE
                        }
                        Player.STATE_READY -> {
                            Log.d(TAG, "Player READY")
                            loadingIndicator.visibility = GONE
                            errorText.visibility = GONE
                            // Update bitrate info when ready
                            updateBitrateInfo()
                        }
                        Player.STATE_ENDED -> {
                            Log.d(TAG, "Player ENDED")
                            // Auto-play next episode if available
                            onNextEpisode?.invoke()
                        }
                    }
                }
                
                override fun onTracksChanged(tracks: androidx.media3.common.Tracks) {
                    super.onTracksChanged(tracks)
                    // Update bitrate display when tracks change (e.g., quality adaptation)
                    updateBitrateInfo()
                }
                
                override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                    Log.e(TAG, "Playback error: ${error.message}", error)
                    loadingIndicator.visibility = GONE
                    
                    val errorMessage = error.message ?: ""
                    
                    // Check if error is due to video exceeding device capabilities
                    if (errorMessage.contains("NO_EXCEEDS_CAPABILITIES") || 
                        errorMessage.contains("DecoderInitializationException") ||
                        error.errorCode == androidx.media3.common.PlaybackException.ERROR_CODE_DECODER_INIT_FAILED) {
                        
                        Log.w(TAG, "Video quality exceeds device capabilities - device cannot decode this format")
                        errorText.text = "This video quality is not supported by your device.\nPlease try a different video."
                        errorText.visibility = VISIBLE
                        
                        // Stop playback attempt
                        player?.stop()
                    } else {
                        Log.w(TAG, "Player error - ExoPlayer will attempt to recover: $errorMessage")
                        
                        // Only show error for non-recoverable issues
                        if (error.errorCode != androidx.media3.common.PlaybackException.ERROR_CODE_DECODING_FAILED) {
                            errorText.text = "Playback error: ${error.message}"
                            errorText.visibility = VISIBLE
                        }
                    }
                }
            })
        }
    }
    
    private data class Tuple4<A, B, C, D>(val first: A, val second: B, val third: C, val fourth: D)

    private fun setupControlListeners() {
        // Restart button
        restartButton.setOnClickListener {
            player?.seekTo(0)
            player?.play()
            Log.d(TAG, "Restarted playback")
        }
        
        // Subtitle button
        subtitleButton.setOnClickListener {
            Log.d(TAG, "SUBTITLE_CLICK Subtitle button CLICKED!")
            toggleSubtitles()
        }
        subtitleButton.setOnKeyListener { _, keyCode, event ->
            if (event.action == android.view.KeyEvent.ACTION_DOWN && 
                (keyCode == android.view.KeyEvent.KEYCODE_DPAD_CENTER || keyCode == android.view.KeyEvent.KEYCODE_ENTER)) {
                Log.d(TAG, "SUBTITLE_CLICK Subtitle button KEY pressed: $keyCode")
                toggleSubtitles()
                true
            } else {
                false
            }
        }
        
        // Next button (for series)
        nextButton.setOnClickListener {
            onNextEpisode?.invoke()
        }
        
        // Aspect ratio button
        aspectRatioButton.setOnClickListener {
            cycleAspectRatio()
        }
        
        // Listen for subtitle events
        scope.launch {
            subtitleService.subtitleFlow.collectLatest { event ->
                when (event) {
                    is SubtitleService.SubtitleEvent.Connected -> {
                        Log.d(TAG, "🔗 Subtitle service connected: ${event.videoId}")
                    }
                    is SubtitleService.SubtitleEvent.Progress -> {
                        Log.d(TAG, "⏳ Progress: ${event.percent.toInt()}% (${event.processedSeconds}/${event.totalDuration}s)")
                    }
                    is SubtitleService.SubtitleEvent.Subtitle -> {
                        // Show subtitle text overlay
                        Log.d(TAG, "📝 [Showing] [${event.startTime.toInt()}s - ${event.endTime.toInt()}s] \"${event.text}\"")
                        showSubtitleText(event.text)
                    }
                    is SubtitleService.SubtitleEvent.Complete -> {
                        Log.d(TAG, "✅ ${event.message}")
                    }
                    is SubtitleService.SubtitleEvent.Error -> {
                        Log.e(TAG, "❌ Subtitle error: ${event.message}")
                        android.widget.Toast.makeText(context, "Subtitle error: ${event.message}", android.widget.Toast.LENGTH_SHORT).show()
                    }
                    is SubtitleService.SubtitleEvent.Stopped -> {
                        Log.d(TAG, "🛑 Subtitle generation stopped")
                        hideSubtitleText()
                    }
                    null -> {}
                }
            }
        }
    }
    
    private fun cycleAspectRatio() {
        currentAspectRatioIndex = (currentAspectRatioIndex + 1) % aspectRatioOptions.size
        applyAspectRatio()
        
        val option = aspectRatioOptions[currentAspectRatioIndex]
        Log.d(TAG, "Aspect ratio changed to: ${option.name}")
        android.widget.Toast.makeText(context, "Aspect: ${option.name}", android.widget.Toast.LENGTH_SHORT).show()
    }
    
    private fun applyAspectRatio() {
        val option = aspectRatioOptions[currentAspectRatioIndex]
        
        // Apply resize mode
        playerView.resizeMode = option.resizeMode
        
        // Apply fixed aspect ratio if specified (for 16:9, 4:3, 21:9, 1:1)
        if (option.ratio != null) {
            // Find the content frame and set aspect ratio
            try {
                val aspectFrame = playerView.findViewById<AspectRatioFrameLayout>(
                    androidx.media3.ui.R.id.exo_content_frame
                )
                aspectFrame?.setAspectRatio(option.ratio)
                Log.d(TAG, "Set fixed aspect ratio: ${option.ratio}")
            } catch (e: Exception) {
                Log.w(TAG, "Could not set fixed aspect ratio: ${e.message}")
            }
        } else {
            // Reset to natural aspect ratio (video's original)
            try {
                val aspectFrame = playerView.findViewById<AspectRatioFrameLayout>(
                    androidx.media3.ui.R.id.exo_content_frame
                )
                // Get video's natural aspect ratio
                player?.let { p ->
                    val format = p.videoFormat
                    if (format != null && format.width > 0 && format.height > 0) {
                        val naturalRatio = format.width.toFloat() / format.height.toFloat()
                        aspectFrame?.setAspectRatio(naturalRatio)
                        Log.d(TAG, "Reset to natural aspect ratio: $naturalRatio")
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Could not reset aspect ratio: ${e.message}")
            }
        }
    }
    
    // VTT subtitle parsing and display
    private data class SubtitleCue(val startMs: Long, val endMs: Long, val text: String)
    private var subtitleCues: List<SubtitleCue> = emptyList()
    private var subtitlePollingHandler: Handler? = null
    private var subtitlePollingRunnable: Runnable? = null
    private var vttRefreshHandler: Handler? = null
    private var vttRefreshRunnable: Runnable? = null
    private var currentSubtitleUrl: String? = null
    private var lastDisplayedCueIndex: Int = -1
    
    private fun loadSubtitleTrack(subtitleUrl: String) {
        Log.d(TAG, "Loading VTT subtitles from: $subtitleUrl")
        currentSubtitleUrl = subtitleUrl
        
        // Start polling for subtitle display immediately
        startSubtitlePolling()
        
        // Start VTT refresh polling (fetches VTT every 5 seconds to get new cues)
        startVttRefreshPolling(subtitleUrl)
    }
    
    private fun startVttRefreshPolling(subtitleUrl: String) {
        stopVttRefreshPolling()
        
        vttRefreshHandler = Handler(Looper.getMainLooper())
        vttRefreshRunnable = object : Runnable {
            override fun run() {
                fetchAndParseVtt(subtitleUrl)
                vttRefreshHandler?.postDelayed(this, 2000) // Refresh VTT every 2 seconds for real-time subtitles
            }
        }
        // Initial fetch immediately
        vttRefreshHandler?.post(vttRefreshRunnable!!)
        Log.d(TAG, "Started VTT refresh polling (every 2s)")
    }
    
    private fun stopVttRefreshPolling() {
        vttRefreshRunnable?.let { vttRefreshHandler?.removeCallbacks(it) }
        vttRefreshHandler = null
        vttRefreshRunnable = null
    }
    
    private fun fetchAndParseVtt(subtitleUrl: String) {
        scope.launch(Dispatchers.IO) {
            try {
                val vttContent = java.net.URL(subtitleUrl).readText()
                val newCues = parseVttContent(vttContent)
                if (newCues.size != subtitleCues.size) {
                    Log.d(TAG, "VTT refreshed: ${newCues.size} cues (was ${subtitleCues.size}), content length: ${vttContent.length}")
                    if (newCues.isNotEmpty()) {
                        val firstCue = newCues.first()
                        val lastCue = newCues.last()
                        Log.d(TAG, "First cue: ${firstCue.startMs}ms-${firstCue.endMs}ms: ${firstCue.text}")
                        Log.d(TAG, "Last cue: ${lastCue.startMs}ms-${lastCue.endMs}ms: ${lastCue.text}")
                        
                        // Show toast only on first load
                        if (subtitleCues.isEmpty()) {
                            handler.post {
                                val firstMin = firstCue.startMs / 60000
                                val firstSec = (firstCue.startMs % 60000) / 1000
                                android.widget.Toast.makeText(
                                    context,
                                    "✅ ${newCues.size} subtitles loaded (starts at ${firstMin}:${firstSec.toString().padStart(2, '0')})",
                                    android.widget.Toast.LENGTH_LONG
                                ).show()
                            }
                        }
                    }
                }
                subtitleCues = newCues
            } catch (e: Exception) {
                Log.e(TAG, "Failed to fetch VTT file: ${e.message}")
            }
        }
    }
    
    private fun parseVttContent(vttContent: String): List<SubtitleCue> {
        val cues = mutableListOf<SubtitleCue>()
        val lines = vttContent.lines()
        var i = 0
        
        while (i < lines.size) {
            val line = lines[i].trim()
            
            // Look for timestamp line: 00:00:01.000 --> 00:00:03.000
            if (line.contains("-->")) {
                val parts = line.split("-->")
                if (parts.size == 2) {
                    val startMs = parseVttTimestamp(parts[0].trim())
                    val endMs = parseVttTimestamp(parts[1].trim())
                    
                    // Collect text lines until empty line or end
                    val textLines = mutableListOf<String>()
                    i++
                    while (i < lines.size && lines[i].trim().isNotEmpty()) {
                        textLines.add(lines[i].trim())
                        i++
                    }
                    
                    if (textLines.isNotEmpty() && startMs >= 0 && endMs >= 0) {
                        cues.add(SubtitleCue(startMs, endMs, textLines.joinToString("\n")))
                    }
                }
            }
            i++
        }
        
        return cues
    }
    
    private fun parseVttTimestamp(timestamp: String): Long {
        // Parse formats: HH:MM:SS.mmm or MM:SS.mmm
        return try {
            val cleanTimestamp = timestamp.replace(",", ".")
            val parts = cleanTimestamp.split(":")
            when (parts.size) {
                3 -> {
                    // HH:MM:SS.mmm
                    val hours = parts[0].toLong()
                    val minutes = parts[1].toLong()
                    val secondsParts = parts[2].split(".")
                    val seconds = secondsParts[0].toLong()
                    val millis = if (secondsParts.size > 1) secondsParts[1].padEnd(3, '0').take(3).toLong() else 0L
                    hours * 3600000 + minutes * 60000 + seconds * 1000 + millis
                }
                2 -> {
                    // MM:SS.mmm
                    val minutes = parts[0].toLong()
                    val secondsParts = parts[1].split(".")
                    val seconds = secondsParts[0].toLong()
                    val millis = if (secondsParts.size > 1) secondsParts[1].padEnd(3, '0').take(3).toLong() else 0L
                    minutes * 60000 + seconds * 1000 + millis
                }
                else -> -1L
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse timestamp: $timestamp", e)
            -1L
        }
    }
    
    private fun startSubtitlePolling() {
        stopSubtitlePolling()
        
        subtitlePollingHandler = Handler(Looper.getMainLooper())
        subtitlePollingRunnable = object : Runnable {
            override fun run() {
                updateSubtitleDisplay()
                subtitlePollingHandler?.postDelayed(this, 100) // Poll every 100ms
            }
        }
        subtitlePollingHandler?.post(subtitlePollingRunnable!!)
        Log.d(TAG, "Started subtitle polling")
    }
    
    private fun stopSubtitlePolling() {
        // Stop VTT refresh polling
        stopVttRefreshPolling()
        
        // Stop subtitle display polling
        subtitlePollingRunnable?.let { subtitlePollingHandler?.removeCallbacks(it) }
        subtitlePollingHandler = null
        subtitlePollingRunnable = null
        lastDisplayedCueIndex = -1
        subtitleCues = emptyList()
        currentSubtitleUrl = null
        hideSubtitleText()
        Log.d(TAG, "Stopped subtitle polling")
    }
    
    private fun updateSubtitleDisplay() {
        val currentPosition = player?.currentPosition ?: return
        
        if (subtitleCues.isEmpty()) return
        
        // Simple: match player position with VTT timestamps
        val matchingCue = subtitleCues.find { cue ->
            currentPosition >= cue.startMs && currentPosition <= cue.endMs
        }
        
        if (matchingCue != null) {
            val cueIndex = subtitleCues.indexOf(matchingCue)
            if (cueIndex != lastDisplayedCueIndex) {
                lastDisplayedCueIndex = cueIndex
                subtitleText.text = matchingCue.text
                subtitleText.visibility = VISIBLE
                Log.d(TAG, "✅ [${matchingCue.startMs}-${matchingCue.endMs}ms]: ${matchingCue.text}")
            }
        } else {
            if (subtitleText.visibility == VISIBLE) {
                subtitleText.visibility = GONE
                lastDisplayedCueIndex = -1
            }
        }
    }
    
    private fun showSubtitleText(text: String) {
        handler.post {
            subtitleText.text = text
            subtitleText.visibility = VISIBLE
            
            // Auto-hide after 4 seconds
            handler.removeCallbacksAndMessages("subtitle_hide")
            handler.postDelayed({
                subtitleText.visibility = GONE
            }, 4000)
        }
    }
    
    private fun hideSubtitleText() {
        handler.post {
            subtitleText.visibility = GONE
        }
    }
    
    private val handler = Handler(Looper.getMainLooper())

    private fun generateVideoId(): String {
        val title = currentSeriesTitle ?: currentMovieTitle
        val sanitized = title.replace(Regex("[^a-zA-Z0-9]"), "_")
        return "tv_$sanitized"
    }

    private fun toggleSubtitles() {
        hasSubtitles = !hasSubtitles
        Log.d(TAG, "🎬 CC button toggled: ${!hasSubtitles} → $hasSubtitles")
        subtitleButton.alpha = if (hasSubtitles) 1.0f else 0.6f
        
        if (hasSubtitles) {
            // Start subtitle generation
            val currentPosition = player?.currentPosition ?: 0L
            val currentPositionSec = currentPosition / 1000
            val videoId = generateVideoId()
            
            // Cancel previous generation if running
            if (subtitleStreamId != null) {
                Log.d(TAG, "🔄 Cancelling previous generation...")
                subtitleService.stop()
                stopSubtitlePolling()
            }
            
            Log.d(TAG, "  ▶️ Starting generation from: ${currentPositionSec}s")
            subtitleStreamId = subtitleService.start(currentStreamUrl, videoId, "auto", currentPosition)
            android.widget.Toast.makeText(context, "Starting subtitles...", android.widget.Toast.LENGTH_SHORT).show()
        } else {
            // Stop subtitle generation and polling
            Log.d(TAG, "🛑 Stopping subtitle service")
            subtitleService.stop()
            subtitleStreamId = null
            stopSubtitlePolling()
            android.widget.Toast.makeText(context, "Subtitles OFF", android.widget.Toast.LENGTH_SHORT).show()
        }
    }

    fun playMovie(streamUrl: String, title: String, startPosition: Long = 0L) {
        Log.d(TAG, "Playing movie: $title, starting at position: $startPosition ms")
        currentStreamUrl = streamUrl
        currentMovieTitle = title
        
        // Reset aspect ratio to default (16:9)
        currentAspectRatioIndex = 0
        applyAspectRatio()
        
        // Stop any existing subtitles and polling
        if (hasSubtitles || subtitleStreamId != null) {
            Log.d(TAG, "🧹 Cleanup: Cancelling subtitle generation for new playback")
            subtitleService.stop()
            stopSubtitlePolling()
            hasSubtitles = false
            subtitleButton.alpha = 0.6f
            subtitleStreamId = null
        }
        
        contentTitle.text = title
        nextButton.visibility = GONE // Hide next button for movies
        
        // Update focus navigation for movies (no next button): restart <-> subtitle <-> aspectRatio
        restartButton.nextFocusRightId = R.id.subtitle_button
        restartButton.nextFocusLeftId = View.NO_ID
        subtitleButton.nextFocusLeftId = R.id.restart_button
        subtitleButton.nextFocusRightId = R.id.aspect_ratio_button
        aspectRatioButton.nextFocusLeftId = R.id.subtitle_button
        aspectRatioButton.nextFocusRightId = View.NO_ID
        nextButton.nextFocusLeftId = View.NO_ID
        nextButton.nextFocusRightId = View.NO_ID
        
        player?.apply {
            stop()
            clearMediaItems()
            val mediaItem = MediaItem.fromUri(streamUrl)
            setMediaItem(mediaItem)
            prepare()
            
            // Seek to saved position if available
            if (startPosition > 0) {
                seekTo(startPosition)
            }
            
            play()
        }
        
        // Start tracking watch progress
        startProgressTracking()
        
        visibility = VISIBLE
        playerView.showController()
    }

    fun playSeries(streamUrl: String, title: String, hasNext: Boolean = false, startPosition: Long = 0L) {
        Log.d(TAG, "Playing series: $title, starting at position: $startPosition ms")
        currentStreamUrl = streamUrl
        currentMovieTitle = title
        
        // Reset aspect ratio to default (16:9)
        currentAspectRatioIndex = 0
        applyAspectRatio()
        
        // Stop any existing subtitles and polling
        if (hasSubtitles || subtitleStreamId != null) {
            Log.d(TAG, "🧹 Cleanup: Cancelling subtitle generation for new playback")
            subtitleService.stop()
            stopSubtitlePolling()
            hasSubtitles = false
            subtitleButton.alpha = 0.6f
            subtitleStreamId = null
        }
        
        contentTitle.text = title
        nextButton.visibility = if (hasNext) VISIBLE else GONE
        
        // Update focus navigation for series: restart -> next -> subtitle -> aspectRatio
        restartButton.nextFocusRightId = R.id.next_button
        restartButton.nextFocusLeftId = View.NO_ID
        nextButton.nextFocusLeftId = R.id.restart_button
        nextButton.nextFocusRightId = R.id.subtitle_button
        subtitleButton.nextFocusLeftId = R.id.next_button
        subtitleButton.nextFocusRightId = R.id.aspect_ratio_button
        aspectRatioButton.nextFocusLeftId = R.id.subtitle_button
        aspectRatioButton.nextFocusRightId = View.NO_ID
        
        player?.apply {
            stop()
            clearMediaItems()
            val mediaItem = MediaItem.fromUri(streamUrl)
            setMediaItem(mediaItem)
            prepare()
            
            // Seek to saved position if available
            if (startPosition > 0) {
                seekTo(startPosition)
            }
            
            play()
        }
        
        // Start tracking watch progress
        startProgressTracking()
        
        visibility = VISIBLE
        playerView.showController()
    }

    fun setOnBackPressedListener(callback: () -> Unit) {
        onBackPressed = callback
    }
    
    fun setOnNextEpisodeListener(callback: () -> Unit) {
        onNextEpisode = callback
    }

    private var seekSpeed = 10000L // Start with 10 seconds
    private var lastSeekTime = 0L
    private var seekCount = 0
    
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        // Handle back button
        if (event.action == KeyEvent.ACTION_DOWN && event.keyCode == KeyEvent.KEYCODE_BACK) {
            Log.d(TAG, "Back pressed in player - saving progress immediately")
            pause()
            // Save progress immediately before exiting
            saveWatchProgress()
            onBackPressed?.invoke()
            return true
        }
        
        // Check if any button has focus
        val buttonHasFocus = restartButton.hasFocus() || subtitleButton.hasFocus() || nextButton.hasFocus() || aspectRatioButton.hasFocus()
        
        if (event.action == KeyEvent.ACTION_DOWN) {
            when (event.keyCode) {
                KeyEvent.KEYCODE_DPAD_CENTER -> {
                    // If restart button has focus, restart the movie
                    if (restartButton.hasFocus()) {
                        player?.seekTo(0)
                        player?.play()
                        Log.d(TAG, "Restarted playback from 00:00")
                        return true
                    }
                    // If subtitle button has focus, toggle subtitles
                    if (subtitleButton.hasFocus()) {
                        toggleSubtitles()
                        return true
                    }
                    // If aspect ratio button has focus, cycle aspect ratio
                    if (aspectRatioButton.hasFocus()) {
                        cycleAspectRatio()
                        return true
                    }
                    // If next button has focus, go to next episode
                    if (nextButton.hasFocus()) {
                        onNextEpisode?.invoke()
                        return true
                    }
                    // Otherwise, play/pause
                    player?.let {
                        if (it.isPlaying) {
                            it.pause()
                            Log.d(TAG, "Paused playback")
                        } else {
                            it.play()
                            Log.d(TAG, "Resumed playback")
                        }
                        playerView.showController()
                        return true
                    }
                }
                
                KeyEvent.KEYCODE_DPAD_LEFT -> {
                    // If button has focus, let default navigation handle it
                    if (buttonHasFocus) {
                        return super.dispatchKeyEvent(event)
                    }
                    
                    // Otherwise, seek backward
                    val currentTime = System.currentTimeMillis()
                    if (currentTime - lastSeekTime < 1000) {
                        seekCount++
                        if (seekCount > 6) {
                            seekSpeed = 30000L // 30 seconds
                        }
                    } else {
                        seekCount = 0
                        seekSpeed = 10000L // Reset to 10 seconds
                    }
                    lastSeekTime = currentTime
                    
                    player?.let {
                        val newPosition = (it.currentPosition - seekSpeed).coerceAtLeast(0)
                        it.seekTo(newPosition)
                        playerView.showController()
                        Log.d(TAG, "Seek backward ${seekSpeed/1000}s to ${newPosition/1000}s")
                    }
                    return true
                }
                
                KeyEvent.KEYCODE_DPAD_RIGHT -> {
                    // If button has focus, let default navigation handle it
                    if (buttonHasFocus) {
                        return super.dispatchKeyEvent(event)
                    }
                    
                    // Otherwise, seek forward
                    val currentTime = System.currentTimeMillis()
                    if (currentTime - lastSeekTime < 1000) {
                        seekCount++
                        if (seekCount > 6) {
                            seekSpeed = 30000L // 30 seconds
                        }
                    } else {
                        seekCount = 0
                        seekSpeed = 10000L // Reset to 10 seconds
                    }
                    lastSeekTime = currentTime
                    
                    player?.let {
                        val newPosition = (it.currentPosition + seekSpeed).coerceAtMost(it.duration)
                        it.seekTo(newPosition)
                        playerView.showController()
                        Log.d(TAG, "Seek forward ${seekSpeed/1000}s to ${newPosition/1000}s")
                    }
                    return true
                }
                
                KeyEvent.KEYCODE_DPAD_DOWN -> {
                    if (!buttonHasFocus) {
                        restartButton.requestFocus()
                        playerView.showController()
                        Log.d(TAG, "Focused restart button")
                        return true
                    }
                }
                
                KeyEvent.KEYCODE_DPAD_UP -> {
                    if (buttonHasFocus) {
                        // Focus back to player view for seek bar interaction
                        playerView.requestFocus()
                        playerView.showController()
                        Log.d(TAG, "Focused seek bar area")
                        return true
                    }
                }
            }
        }
        
        return super.dispatchKeyEvent(event)
    }

    fun pause() {
        player?.pause()
    }

    fun resume() {
        player?.play()
    }

    private fun saveWatchProgress() {
        player?.let { p ->
            if (currentContentId == null || currentContentType == null) {
                Log.w(TAG, "Cannot save progress - contentId or contentType is null")
                return@let
            }
            
            val position = p.currentPosition
            val duration = p.duration
            val percentage = if (duration > 0) ((position * 100) / duration).toInt() else 0
            
            Log.d(TAG, "saveWatchProgress called: pos=$position, dur=$duration, pct=$percentage%")
            
            if (duration > 0 && position > 0) {
                scope.launch {
                    try {
                        // For series: Use seriesTitle if available, otherwise use currentMovieTitle
                        val titleToSave = if (currentContentType == "SERIES" && currentSeriesTitle != null) {
                            currentSeriesTitle!!
                        } else {
                            currentMovieTitle
                        }
                        
                        Log.d(TAG, "Calling repository.saveProgress for $titleToSave ($currentContentType)")
                        // For series: Use seasonId as the key, but store actual episodeId in a custom field
                        // This way we have one entry per season, but know which episode to show progress on
                        val actualEpisodeId = if (currentContentType == "SERIES" && currentSeasonId != null) {
                            "${currentSeasonId}_${currentEpisodeId}"  // Composite key: season_episode
                        } else {
                            currentEpisodeId
                        }
                        progressRepository.saveProgress(
                            contentId = currentContentId!!,
                            contentType = currentContentType!!,
                            title = titleToSave,  // Use series title for series, movie title for movies
                            posterUrl = currentPosterUrl,
                            currentPosition = position,
                            duration = duration,
                            cmd = currentCmd ?: "",
                            episodeId = actualEpisodeId,  // Use composite key for series
                            episodeNumber = currentEpisodeNumber,
                            seasonNumber = currentSeasonNumber
                        )
                        Log.d(TAG, "Saved watch progress: $currentMovieTitle at ${position}ms / ${duration}ms (${percentage}%)")
                    } catch (e: Exception) {
                        Log.e(TAG, "Error saving watch progress: ${e.message}", e)
                    }
                }
            } else {
                Log.w(TAG, "Not saving progress - invalid duration or position")
            }
        }
    }
    
    private fun startProgressTracking() {
        progressSaveHandler.removeCallbacks(progressSaveRunnable)
        progressSaveHandler.postDelayed(progressSaveRunnable, 15000)
        Log.d(TAG, "Started watch progress tracking")
    }
    
    private fun stopProgressTracking() {
        progressSaveHandler.removeCallbacks(progressSaveRunnable)
        saveWatchProgress() // Final save on stop
        Log.d(TAG, "Stopped watch progress tracking")
    }
    
    fun setSeriesTitle(title: String) {
        currentSeriesTitle = title
        Log.d(TAG, "Set series title for progress tracking: $title")
    }
    
    fun setContentInfo(
        contentId: String,
        contentType: String,
        posterUrl: String?,
        cmd: String,
        episodeId: String? = null,
        seasonId: String? = null,
        seasonNumber: Int? = null,
        episodeNumber: Int? = null
    ) {
        this.currentContentId = contentId
        this.currentContentType = contentType
        this.currentPosterUrl = posterUrl
        this.currentCmd = cmd
        this.currentEpisodeId = episodeId
        this.currentSeasonId = seasonId
        this.currentSeasonNumber = seasonNumber
        this.currentEpisodeNumber = episodeNumber
        Log.d(TAG, "Set content info for progress tracking: $contentId ($contentType), seasonId=$seasonId")
    }

    fun stop() {
        // Stop subtitle service
        if (hasSubtitles || subtitleStreamId != null) {
            Log.d(TAG, "🧹 Player stop: Cancelling subtitle generation")
            subtitleService.stop()
            stopSubtitlePolling()
            hasSubtitles = false
            subtitleStreamId = null
        }
        
        // Save progress before stopping
        saveWatchProgress()
        stopProgressTracking()
        player?.apply {
            stop()
            clearMediaItems()
        }
        Log.d(TAG, "Player stopped and media cleared")
    }

    /**
     * Update bitrate information display
     */
    private fun updateBitrateInfo() {
        // Check if user wants to see bitrate info
        if (!AppPreferences.shouldShowBitrate(context)) {
            bitrateInfo.visibility = GONE
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
                            bitrateInfo.post {
                                bitrateInfo.text = "$resolution • $bitrateText • $codecName"
                                bitrateInfo.visibility = VISIBLE
                            }
                            
                            Log.d(TAG, "📊 Bitrate Info: $resolution (${width}x${height}) • $bitrateText • $codecName")
                            break
                        }
                    }
                } ?: run {
                    // No video track found
                    bitrateInfo.post {
                        bitrateInfo.visibility = GONE
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error updating bitrate info: ${e.message}", e)
                bitrateInfo.post {
                    bitrateInfo.visibility = GONE
                }
            }
        }
    }

    fun release() {
        // Stop subtitle service and polling
        if (hasSubtitles || subtitleStreamId != null) {
            Log.d(TAG, "🧹 Player release: Cancelling subtitle generation")
            subtitleService.stop()
            stopSubtitlePolling()
            hasSubtitles = false
            subtitleStreamId = null
        }
        
        // Save progress before releasing
        saveWatchProgress()
        stopProgressTracking()
        player?.apply {
            stop()
            clearMediaItems()
            release()
        }
        player = null
        Log.d(TAG, "Player released completely")
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        release()
    }
}
