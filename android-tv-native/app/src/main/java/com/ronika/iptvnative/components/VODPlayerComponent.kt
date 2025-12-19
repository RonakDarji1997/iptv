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
import com.ronika.iptvnative.services.OpenSubtitlesService
import com.ronika.iptvnative.utils.AppPreferences
import com.ronika.iptvnative.utils.SRTParser
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
    private lateinit var subtitleSideNav: SubtitleSideNavComponent
    private var timeBar: androidx.media3.ui.DefaultTimeBar? = null
    private var exoPositionView: TextView? = null
    private var exoDurationView: TextView? = null
    private var progressBarContainer: View? = null
    
    // ExoPlayer
    private var player: ExoPlayer? = null
    private var attemptedTranscodeForCurrentStream: Boolean = false
    
    // Subtitle service
    private val subtitleService = SubtitleService()
    private val openSubtitlesService = OpenSubtitlesService()
    private var subtitleStreamId: String? = null
    private var currentSubtitleSource: SubtitleSource = SubtitleSource.Off
    
    enum class SubtitleSource {
        Off, WhisperGenerated, OpenSubtitles, Uploaded
    }
    
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
    private var currentProviderId: String? = null
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
    
    // Track if next button should be visible (for series with next episode)
    private var hasNextEpisode: Boolean = false
    
    init {
        LayoutInflater.from(context).inflate(R.layout.component_vod_player, this, true)
        setupViews()
        setupPlayer()
        checkSubtitleFeatureAccess()
    }
    
    private fun checkSubtitleFeatureAccess() {
        scope.launch {
            try {
                val cloudSyncManager = com.ronika.iptvnative.managers.CloudSyncManager(context)
                val hasSubscription = cloudSyncManager.isSubscriptionEnabled()
                
                // Show/hide subtitle button based on subscription
                subtitleButton.visibility = if (hasSubscription) View.VISIBLE else View.GONE
                
                Log.d(TAG, "Subtitle feature access: $hasSubscription")
            } catch (e: Exception) {
                Log.e(TAG, "Error checking subtitle access", e)
                // Default to hidden if check fails
                subtitleButton.visibility = View.GONE
            }
        }
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
        subtitleSideNav = findViewById(R.id.subtitle_sidenav)
        
        // Style the seek bar and keep references so we can explicitly show/hide them in sync
        timeBar = playerView.findViewById<androidx.media3.ui.DefaultTimeBar>(R.id.exo_progress)
        timeBar?.apply {
            // Set colors
            setPlayedColor(android.graphics.Color.parseColor("#FF3366")) // Pink played color
            setUnplayedColor(android.graphics.Color.parseColor("#33FFFFFF")) // Semi-transparent white
            setBufferedColor(android.graphics.Color.parseColor("#66FFFFFF")) // Buffered color
            setScrubberColor(android.graphics.Color.WHITE) // White thumb
        }
        // Keep references to the position/duration texts and the progress container
        progressBarContainer = playerView.findViewById(R.id.progress_bar_container)
        exoPositionView = playerView.findViewById(R.id.exo_position)
        exoDurationView = playerView.findViewById(R.id.exo_duration)
        
        setupControlListeners()
        setupFocusNavigation()
        
        // Enable focus for back button handling
        isFocusable = true
        isFocusableInTouchMode = true
        
        // Set PlayerView to handle key events
        playerView.isFocusable = true
        playerView.isFocusableInTouchMode = true

        // Keep overlays (title, buttons, bitrate, subtitles) in sync with controller visibility
        try {
            playerView.setControllerVisibilityListener(object : PlayerView.ControllerVisibilityListener {
                override fun onVisibilityChanged(visibility: Int) {
                    val isVisible = visibility == View.VISIBLE
                    Log.d(TAG, "🎮 Controller visibility changed - isVisible: $isVisible, hasNextEpisode: $hasNextEpisode, contentType: $currentContentType")
                    if (isVisible) {
                        // Show all overlays at the same time as progress bar
                        contentTitle.visibility = View.VISIBLE
                        restartButton.visibility = View.VISIBLE
                        subtitleButton.visibility = View.VISIBLE
                        // Restore next button visibility based on stored state
                        nextButton.visibility = if (hasNextEpisode) View.VISIBLE else View.GONE
                        Log.d(TAG, "🎮 Restoring nextButton to: ${if (hasNextEpisode) "VISIBLE" else "GONE"}")
                        aspectRatioButton.visibility = View.VISIBLE
                        // Ensure progress/timebar are visible as well and match timing
                        progressBarContainer?.visibility = View.VISIBLE
                        timeBar?.visibility = View.VISIBLE
                        exoPositionView?.visibility = View.VISIBLE
                        exoDurationView?.visibility = View.VISIBLE
                        // Bitrate info is controlled by preference; show only if configured
                        if (AppPreferences.shouldShowBitrate(context)) {
                            bitrateInfo.visibility = View.VISIBLE
                        }
                        // Ensure subtitle text is also visible only when applicable
                        if (!subtitleText.text.isNullOrEmpty()) {
                            subtitleText.visibility = View.VISIBLE
                        }
                        // Also ensure the controller root is visible and cancel any pending hide animation
                        try {
                            val controllerRoot = playerView.findViewById<View>(androidx.media3.ui.R.id.exo_controller)
                            controllerRoot?.animate()?.cancel()
                            controllerRoot?.visibility = View.VISIBLE
                            controllerRoot?.alpha = 1f
                        } catch (e: Exception) {
                            Log.w(TAG, "Could not force-show controller root: ${e.message}")
                        }
                    } else {
                        // Hide everything immediately to match the progress bar hide timing
                        Log.d(TAG, "🎮 Hiding all controls (nextButton state preserved: hasNextEpisode=$hasNextEpisode)")
                        contentTitle.visibility = View.GONE
                        restartButton.visibility = View.GONE
                        subtitleButton.visibility = View.GONE
                        nextButton.visibility = View.GONE
                        aspectRatioButton.visibility = View.GONE
                        bitrateInfo.visibility = View.GONE
                        subtitleText.visibility = View.GONE
                        // Hide progress elements together with other overlays
                        progressBarContainer?.visibility = View.GONE
                        timeBar?.visibility = View.GONE
                        exoPositionView?.visibility = View.GONE
                        exoDurationView?.visibility = View.GONE

                        // Force-hide the controller root immediately to avoid staggered fades
                        try {
                            val controllerRoot = playerView.findViewById<View>(androidx.media3.ui.R.id.exo_controller)
                            controllerRoot?.animate()?.cancel()
                            controllerRoot?.alpha = 0f
                            controllerRoot?.visibility = View.GONE
                            Log.d(TAG, "Forced controller root hidden to sync overlays")
                        } catch (e: Exception) {
                            Log.w(TAG, "Could not force-hide controller root: ${e.message}")
                        }
                    }
                }
            })
        } catch (e: Exception) {
            Log.w(TAG, "Could not register controller visibility listener: ${e.message}")
        }
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

                        // Try to request backend transcode ONCE per stream when decoder init fails
                        if (!attemptedTranscodeForCurrentStream) {
                            attemptedTranscodeForCurrentStream = true
                            Log.d(TAG, "Attempting transcode fallback for current stream")
                            // Launch coroutine to check backend and build transcode URL
                            scope.launch(Dispatchers.IO) {
                                try {
                                    val prefs = context.getSharedPreferences("iptv_prefs", Context.MODE_PRIVATE)
                                    val backend = prefs.getString("transcode_backend_url", "http://192.168.2.69:4000") ?: "http://192.168.2.69:4000"
                                    // Check health
                                    val healthUrl = backend.replace("/+$".toRegex(), "") + "/health"
                                    var backendOk = false
                                    try {
                                        val u = java.net.URL(healthUrl)
                                        val conn = u.openConnection() as java.net.HttpURLConnection
                                        conn.requestMethod = "GET"
                                        conn.connectTimeout = 2000
                                        conn.readTimeout = 2000
                                        backendOk = try { conn.responseCode == 200 } catch (e: Exception) { false }
                                        conn.disconnect()
                                    } catch (e: Exception) {
                                        backendOk = false
                                    }

                                    if (!backendOk) {
                                        Log.w(TAG, "Transcode backend not available: $backend")
                                        // Show original error message on main thread (centralized)
                                        launch(Dispatchers.Main) {
                                            showUnsupportedMessage()
                                        }
                                        return@launch
                                    }

                                    // Build target based on device capability
                                    val displayMetrics = context.resources.displayMetrics
                                    val w = displayMetrics.widthPixels
                                    val h = displayMetrics.heightPixels
                                    val deviceTarget = if (Math.max(w, h) >= 3840 && Math.min(w, h) >= 2160) "2160" else "1080"

                                    // Default to downscale for decoder init failures
                                    val mode = "downscale"
                                    val encoded = try { java.net.URLEncoder.encode(currentStreamUrl, "UTF-8") } catch (e: Exception) { currentStreamUrl }
                                    val finalUrl = backend.replace("/+$".toRegex(), "") + "/transcode?url=$encoded&target=$deviceTarget&mode=$mode"

                                    Log.d(TAG, "Transcode URL: $finalUrl")

                                    // Try to play the transcoded stream on main thread
                                    launch(Dispatchers.Main) {
                                        try {
                                            android.widget.Toast.makeText(context, "Attempting to transcode for device compatibility...", android.widget.Toast.LENGTH_SHORT).show()
                                            player?.stop()
                                            player?.clearMediaItems()
                                            val mi = MediaItem.fromUri(finalUrl)
                                            player?.setMediaItem(mi)
                                            player?.prepare()
                                            player?.play()
                                            Log.d(TAG, "Started playback with transcoded URL")
                                            errorText.visibility = GONE
                                        } catch (e: Exception) {
                                            Log.e(TAG, "Failed to play transcoded stream: ${e.message}", e)
                                            showUnsupportedMessage()
                                        }
                                    }
                                } catch (e: Exception) {
                                    Log.e(TAG, "Transcode fallback failed: ${e.message}", e)
                                    launch(Dispatchers.Main) {
                                        showUnsupportedMessage()
                                    }
                                }
                            }
                        } else {
                            // Centralized handling: try transcode if not already attempted
                            attemptTranscodeIfNotAttempted("downscale")
                        }
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
        
        // Subtitle button - opens side nav
        subtitleButton.setOnClickListener {
            Log.d(TAG, "SUBTITLE_CLICK Subtitle button CLICKED!")
            openSubtitleSideNav()
        }
        subtitleButton.setOnKeyListener { _, keyCode, event ->
            if (event.action == android.view.KeyEvent.ACTION_DOWN && 
                (keyCode == android.view.KeyEvent.KEYCODE_DPAD_CENTER || keyCode == android.view.KeyEvent.KEYCODE_ENTER)) {
                Log.d(TAG, "SUBTITLE_CLICK Subtitle button KEY pressed: $keyCode")
                openSubtitleSideNav()
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
                        // Add subtitle to cues list (matching mobile app logic)
                        val newCue = SubtitleCue(
                            startMs = (event.startTime * 1000).toLong(),
                            endMs = (event.endTime * 1000).toLong(),
                            text = event.text
                        )
                        subtitleCues = subtitleCues + newCue
                        Log.d(TAG, "📝 [Received] [${event.startTime.toInt()}s - ${event.endTime.toInt()}s] \"${event.text}\" (total: ${subtitleCues.size})")
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
        
        // Setup subtitle side nav callbacks
        subtitleSideNav.onShow = {
            // Pause player when side nav opens
            player?.pause()
        }
        
        subtitleSideNav.onSubtitleSelected = { selection ->
            handleSubtitleSelection(selection)
        }
        
        subtitleSideNav.onClose = {
            // Resume player when side nav closes
            player?.play()
        }
        
        subtitleSideNav.onUploadRequested = {
            // TODO: Implement file picker for Android TV
            // For now, show a message
            android.widget.Toast.makeText(
                context,
                "File upload not yet implemented on Android TV",
                android.widget.Toast.LENGTH_SHORT
            ).show()
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
    
    // Subtitle synchronization (matching mobile app logic)
    // Subtitles received via SSE are stored in memory and matched against player position
    private data class SubtitleCue(val startMs: Long, val endMs: Long, val text: String)
    private var subtitleCues: List<SubtitleCue> = emptyList()
    private var subtitlePollingHandler: Handler? = null
    private var subtitlePollingRunnable: Runnable? = null
    private var lastDisplayedCueIndex: Int = -1
    
    private fun startSubtitlePolling() {
        stopSubtitlePolling()
        
        subtitlePollingHandler = Handler(Looper.getMainLooper())
        subtitlePollingRunnable = object : Runnable {
            override fun run() {
                updateSubtitleDisplay()
                subtitlePollingHandler?.postDelayed(this, 100) // Poll every 100ms (matching mobile app)
            }
        }
        subtitlePollingHandler?.post(subtitlePollingRunnable!!)
        Log.d(TAG, "Started subtitle polling (checking player position against received subtitles)")
    }
    
    private fun stopSubtitlePolling() {
        // Stop subtitle display polling
        subtitlePollingRunnable?.let { subtitlePollingHandler?.removeCallbacks(it) }
        subtitlePollingHandler = null
        subtitlePollingRunnable = null
        lastDisplayedCueIndex = -1
        // Don't clear subtitleCues here - they should only be cleared when disabling subtitles
        hideSubtitleText()
        Log.d(TAG, "Stopped subtitle polling")
    }
    
    private fun updateSubtitleDisplay() {
        val currentPosition = player?.currentPosition
        if (currentPosition == null) {
            Log.w(TAG, "updateSubtitleDisplay: player currentPosition is null")
            return
        }
        
        if (subtitleCues.isEmpty()) {
            Log.w(TAG, "updateSubtitleDisplay: subtitleCues is empty")
            return
        }
        
        // Log every second to debug
        if (currentPosition % 1000 < 100) {
            Log.d(TAG, "🔍 Checking subtitles at ${currentPosition}ms, have ${subtitleCues.size} cues")
        }
        
        // Match player position with received subtitle timestamps (matching mobile app logic)
        val matchingCue = subtitleCues.find { cue ->
            currentPosition >= cue.startMs && currentPosition <= cue.endMs
        }
        
        if (matchingCue != null) {
            val cueIndex = subtitleCues.indexOf(matchingCue)
            if (cueIndex != lastDisplayedCueIndex) {
                lastDisplayedCueIndex = cueIndex
                subtitleText.text = matchingCue.text
                subtitleText.visibility = VISIBLE
                Log.d(TAG, "👁️ [Showing] [${currentPosition}ms / ${matchingCue.startMs}-${matchingCue.endMs}ms]: ${matchingCue.text}")
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

    private fun showUnsupportedMessage() {
        handler.post {
            errorText.text = "This video quality is not supported by your device.\nPlease try a different video."
            errorText.visibility = VISIBLE
            player?.stop()
        }
    }

    private fun attemptTranscodeIfNotAttempted(mode: String = "downscale") {
        if (attemptedTranscodeForCurrentStream) {
            showUnsupportedMessage()
            return
        }
        attemptedTranscodeForCurrentStream = true

        scope.launch(Dispatchers.IO) {
            try {
                val prefs = context.getSharedPreferences("iptv_prefs", Context.MODE_PRIVATE)
                val backend = prefs.getString("transcode_backend_url", "http://192.168.2.69:4000") ?: "http://192.168.2.69:4000"
                // Check health
                val healthUrl = backend.replace("/+$".toRegex(), "") + "/health"
                var backendOk = false
                try {
                    val u = java.net.URL(healthUrl)
                    val conn = u.openConnection() as java.net.HttpURLConnection
                    conn.requestMethod = "GET"
                    conn.connectTimeout = 2000
                    conn.readTimeout = 2000
                    backendOk = try { conn.responseCode == 200 } catch (e: Exception) { false }
                    conn.disconnect()
                } catch (e: Exception) {
                    backendOk = false
                }

                if (!backendOk) {
                    Log.w(TAG, "Transcode backend not available: $backend")
                    launch(Dispatchers.Main) {
                        showUnsupportedMessage()
                    }
                    return@launch
                }

                // Build target based on device capability
                val displayMetrics = context.resources.displayMetrics
                val w = displayMetrics.widthPixels
                val h = displayMetrics.heightPixels
                val deviceTarget = if (Math.max(w, h) >= 3840 && Math.min(w, h) >= 2160) "2160" else "1080"

                val encoded = try { java.net.URLEncoder.encode(currentStreamUrl, "UTF-8") } catch (e: Exception) { currentStreamUrl }
                val finalUrl = backend.replace("/+$".toRegex(), "") + "/transcode?url=$encoded&target=$deviceTarget&mode=$mode"

                Log.d(TAG, "Transcode URL: $finalUrl")

                // Try to play the transcoded stream on main thread
                launch(Dispatchers.Main) {
                    try {
                        android.widget.Toast.makeText(context, "Attempting to transcode for device compatibility...", android.widget.Toast.LENGTH_SHORT).show()
                        player?.stop()
                        player?.clearMediaItems()
                        val mi = MediaItem.fromUri(finalUrl)
                        player?.setMediaItem(mi)
                        player?.prepare()
                        player?.play()
                        Log.d(TAG, "Started playback with transcoded URL")
                        errorText.visibility = GONE
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to play transcoded stream: ${e.message}", e)
                        showUnsupportedMessage()
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Transcode fallback failed: ${e.message}", e)
                launch(Dispatchers.Main) {
                    showUnsupportedMessage()
                }
            }
        }
    }

    /**
     * Open subtitle side navigation
     */
    private fun openSubtitleSideNav() {
        // Pause player while browsing subtitles
        player?.pause()
        
        // For series: use the series title, not episode title
        // For movies: use the movie title
        val searchTitle = if (currentContentType == "SERIES" && currentSeriesTitle != null) {
            currentSeriesTitle!! // e.g., "Tyler Perry's Sistas"
        } else {
            currentMovieTitle // e.g., "The Matrix"
        }
        
        Log.d(TAG, "=".repeat(80))
        Log.d(TAG, "🎬 OPENING SUBTITLE SIDE NAV")
        Log.d(TAG, "=".repeat(80))
        Log.d(TAG, "📝 Content Type: $currentContentType")
        Log.d(TAG, "📝 Series Title (currentSeriesTitle): $currentSeriesTitle")
        Log.d(TAG, "📝 Episode/Movie Title (currentMovieTitle): $currentMovieTitle")
        Log.d(TAG, "📝 Search Title (will be sent): $searchTitle")
        Log.d(TAG, "📝 Season Number: $currentSeasonNumber")
        Log.d(TAG, "📝 Episode Number: $currentEpisodeNumber")
        Log.d(TAG, "=".repeat(80))
        
        // Show side nav with movie/series metadata
        subtitleSideNav.show(
            movieTitle = searchTitle,
            imdbId = null, // TODO: Pass IMDB ID if available from metadata
            year = null,   // TODO: Pass year if available
            season = currentSeasonNumber,
            episode = currentEpisodeNumber
        )
    }
    
    /**
     * Handle subtitle selection from side nav
     */
    private fun handleSubtitleSelection(selection: SubtitleSideNavComponent.SubtitleSelection) {
        when (selection) {
            is SubtitleSideNavComponent.SubtitleSelection.Off -> {
                disableSubtitles()
            }
            is SubtitleSideNavComponent.SubtitleSelection.Upload -> {
                loadUploadedSubtitles(selection.filePath)
            }
            is SubtitleSideNavComponent.SubtitleSelection.OpenSubtitle -> {
                loadOpenSubtitle(selection.subtitle)
            }
        }
    }
    
    /**
     * Disable all subtitles
     */
    private fun disableSubtitles(silent: Boolean = false) {
        Log.d(TAG, "🛑 Disabling subtitles")
        
        // Stop Whisper generation if running
        if (currentSubtitleSource == SubtitleSource.WhisperGenerated) {
            subtitleService.stop()
            subtitleStreamId = null
        }
        
        // Stop polling and clear cues
        stopSubtitlePolling()
        subtitleCues = emptyList() // Clear cues when disabling
        currentSubtitleSource = SubtitleSource.Off
        hasSubtitles = false
        subtitleButton.alpha = 0.6f
        
        if (!silent) {
            android.widget.Toast.makeText(context, "Subtitles OFF", android.widget.Toast.LENGTH_SHORT).show()
        }
    }
    
    /**
     * Load uploaded SRT file
     */
    private fun loadUploadedSubtitles(filePath: String) {
        Log.d(TAG, "📂 Loading uploaded SRT file: $filePath")
        
        // Stop any existing subtitle source (silently)
        disableSubtitles(silent = true)
        
        scope.launch(Dispatchers.IO) {
            try {
                val file = java.io.File(filePath)
                if (!file.exists()) {
                    launch(Dispatchers.Main) {
                        android.widget.Toast.makeText(
                            context,
                            "File not found",
                            android.widget.Toast.LENGTH_SHORT
                        ).show()
                    }
                    return@launch
                }
                
                val srtContent = file.readText()
                val parsedCues = SRTParser.parse(srtContent)
                
                launch(Dispatchers.Main) {
                    if (parsedCues.isEmpty()) {
                        android.widget.Toast.makeText(
                            context,
                            "No subtitles found in file",
                            android.widget.Toast.LENGTH_SHORT
                        ).show()
                    } else {
                        // Convert to our SubtitleCue format
                        subtitleCues = parsedCues.map { cue ->
                            SubtitleCue(
                                startMs = cue.startTimeMs,
                                endMs = cue.endTimeMs,
                                text = cue.text
                            )
                        }
                        
                        currentSubtitleSource = SubtitleSource.Uploaded
                        hasSubtitles = true
                        subtitleButton.alpha = 1.0f
                        
                        // Start polling to display subtitles
                        startSubtitlePolling()
                        
                        android.widget.Toast.makeText(
                            context,
                            "Loaded ${parsedCues.size} subtitles from file",
                            android.widget.Toast.LENGTH_SHORT
                        ).show()
                        
                        Log.d(TAG, "✅ Loaded ${parsedCues.size} subtitles from uploaded file")
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error loading uploaded subtitles", e)
                launch(Dispatchers.Main) {
                    android.widget.Toast.makeText(
                        context,
                        "Error loading subtitle file: ${e.message}",
                        android.widget.Toast.LENGTH_SHORT
                    ).show()
                }
            }
        }
    }
    
    /**
     * Load subtitle from OpenSubtitles
     */
    private fun loadOpenSubtitle(subtitle: OpenSubtitlesService.SubtitleItem) {
        Log.d(TAG, "🌐 Loading OpenSubtitle: ${subtitle.fileName}")
        
        // Stop any existing subtitle source (silently)
        disableSubtitles(silent = true)
        
        // Show loading message
        android.widget.Toast.makeText(
            context,
            "Downloading subtitle...",
            android.widget.Toast.LENGTH_SHORT
        ).show()
        
        scope.launch(Dispatchers.IO) {
            try {
                val srtContent = openSubtitlesService.downloadSubtitle(subtitle.id)
                
                if (srtContent == null) {
                    launch(Dispatchers.Main) {
                        android.widget.Toast.makeText(
                            context,
                            "Subtitle unavailable. Try another one.",
                            android.widget.Toast.LENGTH_LONG
                        ).show()
                        Log.w(TAG, "⚠️ Subtitle download returned null - may be rate limited or unavailable")
                    }
                    return@launch
                }
                
                val parsedCues = SRTParser.parse(srtContent)
                
                launch(Dispatchers.Main) {
                    if (parsedCues.isEmpty()) {
                        android.widget.Toast.makeText(
                            context,
                            "No subtitles found in downloaded file",
                            android.widget.Toast.LENGTH_SHORT
                        ).show()
                    } else {
                        // Convert to our SubtitleCue format
                        subtitleCues = parsedCues.map { cue ->
                            SubtitleCue(
                                startMs = cue.startTimeMs,
                                endMs = cue.endTimeMs,
                                text = cue.text
                            )
                        }
                        
                        // Log first few cues for debugging
                        Log.d(TAG, "📝 First 3 subtitle cues:")
                        subtitleCues.take(3).forEach { cue ->
                            Log.d(TAG, "  [${cue.startMs}ms - ${cue.endMs}ms] ${cue.text}")
                        }
                        
                        currentSubtitleSource = SubtitleSource.OpenSubtitles
                        hasSubtitles = true
                        subtitleButton.alpha = 1.0f
                        
                        // Start polling to display subtitles
                        startSubtitlePolling()
                        
                        android.widget.Toast.makeText(
                            context,
                            "Loaded ${parsedCues.size} subtitles from OpenSubtitles",
                            android.widget.Toast.LENGTH_SHORT
                        ).show()
                        
                        Log.d(TAG, "✅ Loaded ${parsedCues.size} subtitles from OpenSubtitles")
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error loading OpenSubtitle", e)
                launch(Dispatchers.Main) {
                    android.widget.Toast.makeText(
                        context,
                        "Error downloading subtitle: ${e.message}",
                        android.widget.Toast.LENGTH_SHORT
                    ).show()
                }
            }
        }
    }

    fun playMovie(streamUrl: String, title: String, startPosition: Long = 0L) {
        Log.d(TAG, "Playing movie: $title, starting at position: $startPosition ms")
        currentStreamUrl = streamUrl
        attemptedTranscodeForCurrentStream = false
        currentMovieTitle = title
        
        // Reset aspect ratio to default (16:9)
        currentAspectRatioIndex = 0
        applyAspectRatio()
        
        // FRESH START: Clear all subtitle state completely
        Log.d(TAG, "🧹 Fresh playback: Clearing all subtitle state")
        disableSubtitles(silent = true)
        currentSubtitleSource = SubtitleSource.Off
        hasSubtitles = false
        subtitleButton.alpha = 0.6f
        subtitleCues = emptyList()
        lastDisplayedCueIndex = -1
        
        contentTitle.text = title
        hasNextEpisode = false  // Clear state for movies
        nextButton.visibility = GONE // Hide next button for movies
        Log.d(TAG, "🎬 Movie playback - hasNextEpisode cleared, nextButton visibility: GONE")
        
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
        attemptedTranscodeForCurrentStream = false
        currentMovieTitle = title
        
        // Reset aspect ratio to default (16:9)
        currentAspectRatioIndex = 0
        applyAspectRatio()
        
        // FRESH START: Clear all subtitle state completely
        Log.d(TAG, "🧹 Fresh playback: Clearing all subtitle state")
        disableSubtitles(silent = true)
        currentSubtitleSource = SubtitleSource.Off
        hasSubtitles = false
        subtitleButton.alpha = 0.6f
        subtitleCues = emptyList()
        lastDisplayedCueIndex = -1
        
        // Prefer to show "Series Title — Episode X" when series title and episode number are available
        val displayTitle = if (!currentSeriesTitle.isNullOrBlank() && currentEpisodeNumber != null) {
            try {
                "${currentSeriesTitle} — Episode ${currentEpisodeNumber}"
            } catch (e: Exception) {
                title
            }
        } else {
            title
        }
        contentTitle.text = displayTitle
        hasNextEpisode = hasNext  // Store state for controller visibility listener
        nextButton.visibility = if (hasNext) VISIBLE else GONE
        Log.d(TAG, "📺 Series playback - hasNextEpisode set to: $hasNext, nextButton visibility: ${if (hasNext) "VISIBLE" else "GONE"}")
        
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
    
    fun getCurrentContentType(): String? = currentContentType
    fun getCurrentContentId(): String? = currentContentId
    fun getCurrentProviderId(): String? = currentProviderId

    private var seekSpeed = 10000L // Start with 10 seconds
    private var lastSeekTime = 0L
    private var seekCount = 0
    
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        // If subtitle side nav is visible, don't handle ANY keys - let side nav handle everything
        if (subtitleSideNav.visibility == VISIBLE) {
            Log.d(TAG, "🚫 Side nav is open - forwarding key to side nav")
            return subtitleSideNav.dispatchKeyEvent(event)
        }
        
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
                    // If subtitle button has focus, open subtitle sidenav
                    if (subtitleButton.hasFocus()) {
                        openSubtitleSideNav()
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
                            // For movies, store empty string so DB unique index that includes episode_id treats movie rows properly
                            currentEpisodeId ?: ""
                        }
                        progressRepository.saveProgress(
                            contentId = currentContentId!!,
                            contentType = currentContentType!!,
                            providerId = currentProviderId ?: "",
                            title = titleToSave,  // Use series title for series, movie title for movies
                            posterUrl = currentPosterUrl,
                            currentPosition = position,
                            duration = duration,
                            cmd = currentCmd ?: "",
                            episodeId = actualEpisodeId,  // Use composite key for series (empty string for movies)
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
        providerId: String,
        posterUrl: String?,
        cmd: String,
        episodeId: String? = null,
        seasonId: String? = null,
        seasonNumber: Int? = null,
        episodeNumber: Int? = null
    ) {
        this.currentContentId = contentId
        this.currentContentType = contentType
        this.currentProviderId = providerId
        this.currentPosterUrl = posterUrl
        this.currentCmd = cmd
        this.currentEpisodeId = episodeId
        this.currentSeasonId = seasonId
        this.currentSeasonNumber = seasonNumber
        this.currentEpisodeNumber = episodeNumber
        Log.d(TAG, "Set content info for progress tracking: $contentId ($contentType), provider=$providerId, seasonId=$seasonId")
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
