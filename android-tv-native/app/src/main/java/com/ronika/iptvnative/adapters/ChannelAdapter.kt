package com.ronika.iptvnative.adapters

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.ronika.iptvnative.R
import com.ronika.iptvnative.models.Channel

class ChannelAdapter(
    private val onChannelSelected: (Channel) -> Unit,
    private val onChannelFocused: ((Channel) -> Unit)? = null
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
            
            // Load channel logo using Coil with caching
            if (!channel.logo.isNullOrEmpty()) {
                channelLogo.load(channel.logo) {
                    crossfade(false) // Disable crossfade for better performance
                    placeholder(android.R.drawable.ic_menu_gallery)
                    error(android.R.drawable.ic_menu_gallery)
                    memoryCacheKey(channel.logo) // Cache by URL
                    diskCacheKey(channel.logo) // Disk cache by URL
                }
            } else {
                channelLogo.setImageResource(android.R.drawable.ic_menu_gallery)
            }
            
            updateStyle()
        }

        private fun updateStyle() {
            val position = adapterPosition
            if (position == RecyclerView.NO_POSITION) return
            
            val shouldHighlight = itemView.hasFocus()
            
            // Only update border when focus state changes
            if (shouldHighlight) {
                if (cardView.foreground == null) {
                    val drawable = android.graphics.drawable.GradientDrawable()
                    drawable.setStroke(6, android.graphics.Color.WHITE)
                    drawable.cornerRadius = 24f
                    cardView.foreground = drawable
                }
            } else {
                if (cardView.foreground != null) {
                    cardView.foreground = null
                }
            }
        }
    }
}
