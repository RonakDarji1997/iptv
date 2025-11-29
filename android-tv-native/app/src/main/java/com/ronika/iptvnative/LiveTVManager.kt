package com.ronika.iptvnative

import android.view.View
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.lifecycle.lifecycleScope
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.ronika.iptvnative.api.StalkerClient
import com.ronika.iptvnative.api.ChannelsRequest
import com.ronika.iptvnative.api.GenreRequest
import com.ronika.iptvnative.api.StreamUrlRequest
import com.ronika.iptvnative.models.Channel
import com.ronika.iptvnative.models.Genre
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * LiveTVManager - Clean separation of Live TV logic from MainActivity
 * Handles player, category slider, channel grid, EPG timeline, and playback logic
 */
class LiveTVManager(private val activity: MainActivity) {

    // UI Components
    private val liveTVContainer: FrameLayout = activity.findViewById(R.id.live_tv_container)
    private val livePlayerView: PlayerView = activity.findViewById(R.id.live_player_view)
    private val channelInfoOverlay: LinearLayout = activity.findViewById(R.id.channel_info_overlay)
    private val channelNumber: TextView = activity.findViewById(R.id.channel_number)
    private val channelName: TextView = activity.findViewById(R.id.channel_name)
    private val epgTimelineRecycler: RecyclerView = activity.findViewById(R.id.epg_timeline_recycler)
    private val liveCategoriesRecycler: RecyclerView = activity.findViewById(R.id.live_categories_recycler)
    private val liveChannelsRecycler: RecyclerView = activity.findViewById(R.id.live_channels_recycler)
    private val liveEmptyState: TextView = activity.findViewById(R.id.live_empty_state)
    private val liveLoadingIndicator: ProgressBar = activity.findViewById(R.id.live_loading_indicator)

    // Player
    private var livePlayer: ExoPlayer? = null

    // Direct Stalker client (no backend, no DB, no handshake)
    private val stalkerClient: StalkerClient by lazy {
        StalkerClient(
            portalUrl = "http://tv.stream4k.cc/stalker_portal/server/load.php",
            macAddress = "00:1a:79:17:f4:f5"
        )
    }

    // Data
    private var categories: List<Genre> = emptyList()
    private var channels: List<Channel> = emptyList()
    private var selectedCategoryIndex: Int = -1
    private var currentPlayingChannel: Channel? = null
    private var isFullscreen: Boolean = false

    // Pagination state for channels
    private var channelsCurrentPage: Int = 1
    private var channelsHasMore: Boolean = true
    private var channelsIsLoading: Boolean = false

    // Adapters
    private lateinit var categoryAdapter: LiveCategoryAdapter
    private lateinit var channelAdapter: LiveChannelAdapter

    init {
        setupPlayer()
        setupRecyclerViews()
    }

    private fun setupPlayer() {
        // Create ExoPlayer instance
        livePlayer = ExoPlayer.Builder(activity).build()
        livePlayerView.player = livePlayer

        // Player should not have focus (channels get focus instead)
        livePlayerView.isFocusable = false
        livePlayerView.isFocusableInTouchMode = false

        // Hide VOD-only controls (restart button, top info bar, progress bar, time)
        livePlayerView.post {
            livePlayerView.findViewById<android.widget.ImageButton>(R.id.restart_button)?.visibility = View.GONE
            livePlayerView.findViewById<android.widget.ImageButton>(R.id.next_button)?.visibility = View.GONE
            livePlayerView.findViewById<View>(R.id.top_info_bar)?.visibility = View.GONE
            livePlayerView.findViewById<View>(R.id.top_gradient)?.visibility = View.GONE
            livePlayerView.findViewById<View>(R.id.bottom_gradient)?.visibility = View.GONE
            livePlayerView.findViewById<View>(R.id.bottom_controls_container)?.visibility = View.GONE
            livePlayerView.findViewById<TextView>(R.id.exo_position)?.visibility = View.GONE
            livePlayerView.findViewById<TextView>(R.id.exo_duration)?.visibility = View.GONE
            // Also hide the time separator "/" between position and duration
            livePlayerView.findViewById<View>(R.id.exo_position)?.parent?.let { parent ->
                if (parent is android.view.ViewGroup) {
                    // Find and hide all TextViews showing time in the time position container
                    for (i in 0 until parent.childCount) {
                        val child = parent.getChildAt(i)
                        if (child is TextView) {
                            child.visibility = View.GONE
                        }
                    }
                }
            }
        }

        // Player listener for diagnostic logging
        livePlayer?.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                when (playbackState) {
                    Player.STATE_READY -> android.util.Log.d("LiveTVManager", "Player ready")
                    Player.STATE_BUFFERING -> android.util.Log.d("LiveTVManager", "Player buffering")
                    Player.STATE_ENDED -> android.util.Log.d("LiveTVManager", "Player ended")
                    Player.STATE_IDLE -> android.util.Log.d("LiveTVManager", "Player idle")
                }
            }

            override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                android.util.Log.e("LiveTVManager", "Player error: ${error.message}")
            }
        })
    }

    private fun setupRecyclerViews() {
        // Category slider (horizontal)
        categoryAdapter = LiveCategoryAdapter { category, position ->
            onCategorySelected(category, position)
        }
        liveCategoriesRecycler.layoutManager = LinearLayoutManager(
            activity,
            LinearLayoutManager.HORIZONTAL,
            false
        )
        liveCategoriesRecycler.adapter = categoryAdapter

        // Channel grid (vertical)
        channelAdapter = LiveChannelAdapter(
            onSingleClick = { channel, position ->
                playChannelPreview(channel, position)
            },
            onDoubleClick = { channel, position ->
                playChannelFullscreen(channel, position)
            }
        )
        liveChannelsRecycler.layoutManager = LinearLayoutManager(activity)
        liveChannelsRecycler.adapter = channelAdapter
    }

    fun loadCategories() {
        activity.lifecycleScope.launch {
            try {
                // Ensure UI container is visible on initial load
                val liveUIContainer = activity.findViewById<LinearLayout>(R.id.live_ui_container)
                liveUIContainer?.visibility = View.VISIBLE
                isFullscreen = false

                liveLoadingIndicator.visibility = View.VISIBLE
                liveChannelsRecycler.visibility = View.GONE
                liveEmptyState.visibility = View.GONE

                // Direct portal call (no backend, no DB)
                val response = withContext(Dispatchers.IO) {
                    stalkerClient.getGenres()
                }

                // Filter out non-numeric category IDs
                categories = response.genres.filter { genre ->
                    genre.id.toIntOrNull() != null
                }

                categoryAdapter.setCategories(categories)

                // Auto-select first category
                if (categories.isNotEmpty()) {
                    selectedCategoryIndex = 0
                    categoryAdapter.setActivePosition(0)
                    loadChannels(categories[0].id)
                } else {
                    liveLoadingIndicator.visibility = View.GONE
                    liveEmptyState.visibility = View.VISIBLE
                    liveEmptyState.text = "No categories available"
                }

            } catch (e: Exception) {
                android.util.Log.e("LiveTVManager", "Error loading categories", e)
                liveLoadingIndicator.visibility = View.GONE
                liveEmptyState.visibility = View.VISIBLE
                liveEmptyState.text = "Error loading categories: ${e.message}"
            }
        }
    }

    private fun onCategorySelected(category: Genre, position: Int) {
        if (selectedCategoryIndex == position) return // Already selected

        selectedCategoryIndex = position
        categoryAdapter.setActivePosition(position)
        loadChannels(category.id)
    }

    private fun loadChannels(categoryId: String) {
        activity.lifecycleScope.launch {
            try {
                liveLoadingIndicator.visibility = View.VISIBLE
                liveChannelsRecycler.visibility = View.GONE
                liveEmptyState.visibility = View.GONE

                // Reset pagination state for the new category
                channelsCurrentPage = 1
                channelsHasMore = true
                channelsIsLoading = true

                // Load first page - direct portal call
                val response = stalkerClient.getChannels(
                    genreId = categoryId,
                    page = channelsCurrentPage
                )

                channels = response.channels.data

                if (channels.isNotEmpty()) {
                    channelAdapter.setChannels(channels)
                    liveLoadingIndicator.visibility = View.GONE
                    liveChannelsRecycler.visibility = View.VISIBLE

                    // Auto-play first channel
                    playChannelPreview(channels[0], 0)

                    // Focus first channel and set up navigation to currently selected category
                    liveChannelsRecycler.post {
                        val firstChannelView = liveChannelsRecycler.getChildAt(0)
                        firstChannelView?.requestFocus()

                        // Set up custom key listener on the channels RecyclerView
                        liveChannelsRecycler.setOnKeyListener { _, keyCode, event ->
                            if (keyCode == android.view.KeyEvent.KEYCODE_DPAD_UP &&
                                event.action == android.view.KeyEvent.ACTION_DOWN) {
                                // Only intercept if we're on the first channel (position 0)
                                val layoutManager = liveChannelsRecycler.layoutManager as? androidx.recyclerview.widget.LinearLayoutManager
                                val focusedChild = liveChannelsRecycler.focusedChild
                                val focusedPosition = if (focusedChild != null) {
                                    liveChannelsRecycler.getChildAdapterPosition(focusedChild)
                                } else -1

                                if (focusedPosition == 0) {
                                    // We're on first channel, navigate to selected category
                                    liveCategoriesRecycler.post {
                                        liveCategoriesRecycler.scrollToPosition(selectedCategoryIndex)
                                        liveCategoriesRecycler.postDelayed({
                                            val categoryViewHolder = liveCategoriesRecycler.findViewHolderForAdapterPosition(selectedCategoryIndex)
                                            categoryViewHolder?.itemView?.requestFocus()
                                        }, 50)
                                    }
                                    true // Consume the event
                                } else {
                                    false // Let normal navigation handle it
                                }
                            } else {
                                false // Let other keys pass through
                            }
                        }

                        // Setup infinite scroll listener to load next pages
                        liveChannelsRecycler.clearOnScrollListeners()
                        liveChannelsRecycler.addOnScrollListener(object : RecyclerView.OnScrollListener() {
                            override fun onScrolled(recyclerView: RecyclerView, dx: Int, dy: Int) {
                                super.onScrolled(recyclerView, dx, dy)

                                val layoutManager = recyclerView.layoutManager as? LinearLayoutManager ?: return
                                val totalItemCount = layoutManager.itemCount
                                val lastVisible = layoutManager.findLastVisibleItemPosition()

                                // If we're close to the end of the list, try to load the next page
                                if (!channelsIsLoading && channelsHasMore && lastVisible >= totalItemCount - 2) {
                                    loadMoreChannels(categoryId)
                                }
                            }
                        })
                    }
                } else {
                    liveLoadingIndicator.visibility = View.GONE
                    liveEmptyState.visibility = View.VISIBLE
                    liveEmptyState.text = "No channels in this category"
                    channelsHasMore = false
                }

            } catch (e: Exception) {
                android.util.Log.e("LiveTVManager", "Error loading channels", e)
                liveLoadingIndicator.visibility = View.GONE
                liveEmptyState.visibility = View.VISIBLE
                liveEmptyState.text = "Error loading channels: ${e.message}"
                channelsHasMore = false
            } finally {
                channelsIsLoading = false
            }
        }
    }

    private fun loadMoreChannels(categoryId: String) {
        // Guard - prevent parallel loads
        if (!channelsHasMore || channelsIsLoading) return

        activity.lifecycleScope.launch {
            try {
                channelsIsLoading = true

                val nextPage = channelsCurrentPage + 1
                android.util.Log.d("LiveTVManager", "Loading channels page $nextPage for category $categoryId")

                // Direct portal call
                val response = stalkerClient.getChannels(
                    genreId = categoryId,
                    page = nextPage
                )

                val newChannels = response.channels.data

                if (newChannels.isNullOrEmpty()) {
                    channelsHasMore = false
                } else {
                    channels = channels + newChannels
                    channelsCurrentPage = nextPage
                    channelAdapter.setChannels(channels)
                }

            } catch (e: Exception) {
                android.util.Log.e("LiveTVManager", "Error loading more channels", e)
                channelsHasMore = false
            } finally {
                channelsIsLoading = false
            }
        }
    }
    private fun playChannelPreview(channel: Channel, position: Int) {
        android.util.Log.d("LiveTVManager", "Playing preview for channel: ${channel.name}")

        isFullscreen = false

        // Show UI container for preview mode
        val liveUIContainer = activity.findViewById<LinearLayout>(R.id.live_ui_container)
        liveUIContainer?.visibility = View.VISIBLE

        // Check if it's a different channel
        val isDifferentChannel = currentPlayingChannel?.id != channel.id

        currentPlayingChannel = channel
        channelAdapter.setPlayingPosition(position)
        
        // Hide channel info overlay for preview (show only on fullscreen)
        channelInfoOverlay.visibility = View.GONE
        
        // Load EPG for this channel
        loadEPGForChannel(channel)
        
        // Stop current stream if switching channels
        if (isDifferentChannel) {
            livePlayer?.apply {
                stop()
                clearMediaItems()
            }
        }
        
        // Play the stream
        playChannelStream(channel)
    }
    
    private fun playChannelFullscreen(channel: Channel, position: Int) {
        android.util.Log.d("LiveTVManager", "Playing fullscreen for channel: ${channel.name}")
        
        isFullscreen = true
        
        // Hide entire UI container for true fullscreen
        val liveUIContainer = activity.findViewById<LinearLayout>(R.id.live_ui_container)
        liveUIContainer?.visibility = View.GONE
        channelInfoOverlay.visibility = View.GONE
        
        // Check if it's a different channel before updating
        val isDifferentChannel = currentPlayingChannel?.id != channel.id
        
        // Update current channel and playing position
        currentPlayingChannel = channel
        channelAdapter.setPlayingPosition(position)
        
        // If it's a different channel, stop current and load new stream
        // If same channel, just hide UI
        if (isDifferentChannel) {
            // Stop current stream first to prevent overlap
            livePlayer?.apply {
                stop()
                clearMediaItems()
            }
            playChannelStream(channel)
        }
    }
    
    fun exitFullscreen() {
        if (isFullscreen) {
            android.util.Log.d("LiveTVManager", "Exiting fullscreen mode")
            isFullscreen = false
            
            // Show UI container again
            val liveUIContainer = activity.findViewById<LinearLayout>(R.id.live_ui_container)
            liveUIContainer?.visibility = View.VISIBLE
            
            // Focus on current playing channel
            val playingPosition = channels.indexOfFirst { it.id == currentPlayingChannel?.id }
            if (playingPosition >= 0) {
                liveChannelsRecycler.post {
                    liveChannelsRecycler.scrollToPosition(playingPosition)
                    val viewHolder = liveChannelsRecycler.findViewHolderForAdapterPosition(playingPosition)
                    viewHolder?.itemView?.requestFocus()
                }
            }
        }
    }
    
    fun isInFullscreen(): Boolean = isFullscreen
    
    fun playNextChannel() {
        if (channels.isEmpty() || !isFullscreen) return
        
        val currentPosition = channels.indexOfFirst { it.id == currentPlayingChannel?.id }
        if (currentPosition == -1) return
        
        // UP key goes to next channel (forward)
        val nextPosition = (currentPosition + 1) % channels.size
        val nextChannel = channels[nextPosition]
        
        android.util.Log.d("LiveTVManager", "Next channel: ${nextChannel.name}")
        playChannelFullscreen(nextChannel, nextPosition)
    }
    
    fun playPreviousChannel() {
        if (channels.isEmpty() || !isFullscreen) return
        
        val currentPosition = channels.indexOfFirst { it.id == currentPlayingChannel?.id }
        if (currentPosition == -1) return
        
        // DOWN key goes to previous channel (backward)
        // If on first channel, do nothing
        if (currentPosition == 0) {
            android.util.Log.d("LiveTVManager", "Already on first channel, ignoring DOWN")
            return
        }
        
        val prevPosition = currentPosition - 1
        val prevChannel = channels[prevPosition]
        
        android.util.Log.d("LiveTVManager", "Previous channel: ${prevChannel.name}")
        playChannelFullscreen(prevChannel, prevPosition)
    }
    
    private fun playChannelStream(channel: Channel) {
        // Create link and play
        activity.lifecycleScope.launch {
            try {
                // Direct portal call
                val streamResponse = stalkerClient.getStreamUrl(channel.cmd ?: "")
                
                val streamUrl = streamResponse.url
                android.util.Log.d("LiveTVManager", "Stream URL: $streamUrl")
                
                // Play stream
                val mediaItem = MediaItem.fromUri(streamUrl)
                livePlayer?.apply {
                    setMediaItem(mediaItem)
                    prepare()
                    play()
                }
                
            } catch (e: Exception) {
                android.util.Log.e("LiveTVManager", "Error getting stream URL for channel", e)
            }
        }
    }
    
    private fun loadEPGForChannel(channel: Channel) {
        // TODO: Implement EPG loading
        // For now, show placeholder
        android.util.Log.d("LiveTVManager", "EPG loading for channel ${channel.id} - not implemented yet")
        
        // Hide EPG section for now
        epgTimelineRecycler.visibility = View.GONE
        activity.findViewById<TextView>(R.id.epg_header)?.visibility = View.GONE
    }
    
    fun stopPlayer() {
        livePlayer?.apply {
            stop()
            clearMediaItems()
        }
    }
    
    fun cleanup() {
        livePlayer?.apply {
            stop()
            clearMediaItems()
            release()
        }
        livePlayer = null
    }
}
