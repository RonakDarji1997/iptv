package com.ronika.iptvnative.managers

import android.content.Context
import android.view.View
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import com.ronika.iptvnative.models.Channel

class PlayerManager(
    private val context: Context,
    private val playerView: PlayerView,
    private val playerContainer: FrameLayout,
    private val playerPreviewContainer: LinearLayout,
    private val liveIndicator: TextView
) {
    
    // Players
    var livePlayer: ExoPlayer? = null
    var vodPlayer: ExoPlayer? = null
    private var currentPlayer: ExoPlayer? = null
    var isFullscreen = false
    
    // Current state
    var currentChannel: Channel? = null
    
    fun initialize() {
        // Initialize live TV player
        livePlayer = ExoPlayer.Builder(context).build()
        
        // Initialize VOD player
        vodPlayer = ExoPlayer.Builder(context).build()
        
        // Add player listeners
        livePlayer?.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                android.util.Log.d("PlayerManager", "Live player state: $playbackState")
                when (playbackState) {
                    Player.STATE_BUFFERING -> {
                        android.util.Log.d("PlayerManager", "Live player buffering")
                    }
                    Player.STATE_READY -> {
                        android.util.Log.d("PlayerManager", "Live player ready")
                    }
                    Player.STATE_ENDED -> {
                        android.util.Log.d("PlayerManager", "Live player ended")
                    }
                    Player.STATE_IDLE -> {
                        android.util.Log.d("PlayerManager", "Live player idle")
                    }
                }
            }
        })
        
        vodPlayer?.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                android.util.Log.d("PlayerManager", "VOD player state: $playbackState")
            }
        })
    }
    
    fun playChannel(channel: Channel, baseUrl: String, isLiveTV: Boolean) {
        android.util.Log.d("PlayerManager", "Playing channel: ${channel.name}, isLiveTV: $isLiveTV")
        
        currentChannel = channel
        
        // Determine stream URL
        val streamUrl = if (channel.cmd?.startsWith("http") == true) {
            channel.cmd ?: ""
        } else {
            "$baseUrl${channel.cmd ?: ""}"
        }
        
        android.util.Log.d("PlayerManager", "Stream URL: $streamUrl")
        
        // Update live indicator visibility
        liveIndicator.visibility = if (isLiveTV) View.VISIBLE else View.GONE
        
        // Select appropriate player
        val targetPlayer = if (isLiveTV) livePlayer else vodPlayer
        val otherPlayer = if (isLiveTV) vodPlayer else livePlayer
        
        // Stop other player
        otherPlayer?.apply {
            stop()
            clearMediaItems()
        }
        
        // Setup and play
        targetPlayer?.apply {
            stop()
            clearMediaItems()
            setMediaItem(MediaItem.fromUri(streamUrl))
            prepare()
            playWhenReady = true
        }
        
        // Switch player view
        targetPlayer?.let { player ->
            playerView.player = player
            currentPlayer = player
        }
        
        // Show player
        playerContainer.visibility = View.VISIBLE
    }
    
    fun stopPlayback() {
        livePlayer?.apply {
            stop()
            clearMediaItems()
        }
        vodPlayer?.apply {
            stop()
            clearMediaItems()
        }
        playerView.player = null
        currentPlayer = null
        currentChannel = null
    }
    
    fun toggleFullscreen(
        onEnterFullscreen: () -> Unit,
        onExitFullscreen: () -> Unit
    ) {
        if (isFullscreen) {
            exitFullscreen(onExitFullscreen)
        } else {
            enterFullscreen(onEnterFullscreen)
        }
    }
    
    private fun enterFullscreen(onEnterFullscreen: () -> Unit) {
        isFullscreen = true
        
        // Make player/preview container take full screen
        playerPreviewContainer.visibility = View.VISIBLE
        val containerParams = playerPreviewContainer.layoutParams as LinearLayout.LayoutParams
        containerParams.weight = 1.0f
        playerPreviewContainer.layoutParams = containerParams
        
        // Show player in full screen
        playerContainer.visibility = View.VISIBLE
        val params = playerContainer.layoutParams as LinearLayout.LayoutParams
        params.weight = 1.0f
        playerContainer.layoutParams = params
        
        playerView.visibility = View.VISIBLE
        
        onEnterFullscreen()
    }
    
    private fun exitFullscreen(onExitFullscreen: () -> Unit) {
        isFullscreen = false
        
        // Reset player container to normal size
        val containerParams = playerPreviewContainer.layoutParams as LinearLayout.LayoutParams
        containerParams.weight = 0.4f
        playerPreviewContainer.layoutParams = containerParams
        
        val params = playerContainer.layoutParams as LinearLayout.LayoutParams
        params.weight = 0.6f
        playerContainer.layoutParams = params
        
        onExitFullscreen()
    }
    
    fun release() {
        livePlayer?.release()
        vodPlayer?.release()
        livePlayer = null
        vodPlayer = null
        currentPlayer = null
    }
}
