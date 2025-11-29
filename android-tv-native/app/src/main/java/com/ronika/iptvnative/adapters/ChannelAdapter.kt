package com.ronika.iptvnative.adapters

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import coil.load
import coil.request.ImageRequest
import com.ronika.iptvnative.R
import com.ronika.iptvnative.models.Channel

class ChannelAdapter(
    private val onChannelSelected: (Channel) -> Unit,
    private val onChannelFocused: ((Channel) -> Unit)? = null,
    private val showContentType: Boolean = false,
    private val getContentType: ((Channel) -> String?)? = null
) : RecyclerView.Adapter<ChannelAdapter.ChannelViewHolder>() {

    private var channels: List<Channel> = emptyList()
    private var selectedPosition: Int = 0
    
    init {
        setHasStableIds(true)
    }
    
    override fun getItemId(position: Int): Long {
        return channels[position].id.hashCode().toLong()
    }

    fun setChannels(newChannels: List<Channel>) {
        val oldSize = channels.size
        channels = newChannels
        // Only notify about new items to avoid full redraw
        if (newChannels.size > oldSize) {
            notifyItemRangeInserted(oldSize, newChannels.size - oldSize)
        } else {
            notifyDataSetChanged()
        }
    }

    fun setSelectedPosition(position: Int) {
        if (position == selectedPosition) return
        val oldPosition = selectedPosition
        selectedPosition = position
        // Only update old position if it was valid
        if (oldPosition >= 0 && oldPosition < channels.size) {
            notifyItemChanged(oldPosition)
        }
    }

    fun getSelectedPosition(): Int = selectedPosition
    
    fun clearSelection() {
        val oldPosition = selectedPosition
        selectedPosition = -1
        if (oldPosition >= 0 && oldPosition < channels.size) {
            notifyItemChanged(oldPosition)
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ChannelViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_channel, parent, false)
        return ChannelViewHolder(view)
    }

    override fun onBindViewHolder(holder: ChannelViewHolder, position: Int) {
        holder.bind(channels[position])
    }

    override fun getItemCount(): Int = channels.size

    inner class ChannelViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val channelLogo: ImageView = itemView.findViewById(R.id.channel_logo)
        private val channelName: TextView = itemView.findViewById(R.id.channel_name)
        private val contentTypeIndicator: TextView = itemView.findViewById(R.id.content_type_indicator)
        private val cardView = itemView as androidx.cardview.widget.CardView

        init {
            itemView.setOnClickListener {
                val position = adapterPosition
                if (position != RecyclerView.NO_POSITION) {
                    onChannelSelected(channels[position])
                }
            }

            itemView.setOnFocusChangeListener { _, hasFocus ->
                val position = adapterPosition
                if (position == RecyclerView.NO_POSITION) return@setOnFocusChangeListener
                
                if (hasFocus) {
                    onChannelFocused?.invoke(channels[position])
                }
                // Update style on focus change
                updateStyle()
            }
            
            // LEFT key handling is done in MainActivity - no need for listener here
        }

        fun bind(channel: Channel) {
            channelName.text = channel.name
            
            // Show content type indicator if enabled
            if (showContentType) {
                val contentType = getContentType?.invoke(channel)
                if (contentType != null) {
                    contentTypeIndicator.text = contentType
                    contentTypeIndicator.visibility = View.VISIBLE
                } else {
                    contentTypeIndicator.visibility = View.GONE
                }
            } else {
                contentTypeIndicator.visibility = View.GONE
            }
            
            // Load channel logo with enhanced caching and async priority
            if (!channel.logo.isNullOrEmpty()) {
                channelLogo.load(channel.logo) {
                    crossfade(false) // Disable crossfade for better performance
                    placeholder(R.drawable.ic_movie_placeholder)
                    error(R.drawable.ic_movie_placeholder)
                    memoryCacheKey(channel.logo) // Cache by URL
                    diskCacheKey(channel.logo) // Disk cache by URL
                    // Add priority for faster loading during navigation
                    // priority(Priority.HIGH)
                    // Ensure async loading (default, but explicit)
                    allowHardware(true) // Use hardware bitmaps for GPU acceleration
                    // Add listener to avoid blocking UI on errors
                    listener(
                        onError = { request, result ->
                            // Don't log coroutine cancellation errors - these are normal during tab switches
                            if (result.throwable.message?.contains("StandaloneCoroutine was cancelled") != true) {
                                android.util.Log.w("ChannelAdapter", "Failed to load image: ${request.data}", result.throwable)
                            }
                        }
                    )
                }
            } else {
                channelLogo.setImageResource(R.drawable.ic_movie_placeholder)
            }
            
            updateStyle()
        }

        private fun updateStyle() {
            val position = adapterPosition
            if (position == RecyclerView.NO_POSITION) return
            
            val shouldHighlight = itemView.hasFocus()
            
            // Only update border when focus state changes (avoid redundant calls)
            val currentForeground = cardView.foreground
            val needsUpdate = if (shouldHighlight) {
                currentForeground == null
            } else {
                currentForeground != null
            }
            
            if (needsUpdate) {
                val drawable = android.graphics.drawable.GradientDrawable()
                drawable.setStroke(6, android.graphics.Color.WHITE)
                drawable.cornerRadius = 24f
                cardView.foreground = if (shouldHighlight) drawable else null
            }
        }
    }
}
