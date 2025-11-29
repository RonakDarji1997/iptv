package com.ronika.iptvnative.adapters

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.ronika.iptvnative.R
import com.ronika.iptvnative.models.Channel

class ChannelRowAdapter(
    private val onChannelSelected: (Channel) -> Unit,
    private val onChannelFocused: ((Channel) -> Unit)? = null
) : RecyclerView.Adapter<ChannelRowAdapter.ChannelRowViewHolder>() {

    private var channels: List<Channel> = emptyList()
    private var selectedPosition: Int = -1
    private var playingPosition: Int = -1

    fun setChannels(newChannels: List<Channel>) {
        channels = newChannels
        notifyDataSetChanged()
    }

    fun setSelectedPosition(position: Int) {
        if (position == selectedPosition) return
        val oldPosition = selectedPosition
        selectedPosition = position
        if (oldPosition >= 0) notifyItemChanged(oldPosition)
        if (selectedPosition >= 0) notifyItemChanged(selectedPosition)
    }

    fun setPlayingPosition(position: Int) {
        val oldPosition = playingPosition
        playingPosition = position
        if (oldPosition >= 0) notifyItemChanged(oldPosition)
        if (playingPosition >= 0) notifyItemChanged(playingPosition)
    }

    fun getSelectedPosition(): Int = selectedPosition
    fun getPlayingPosition(): Int = playingPosition
    
    fun clearSelection() {
        if (selectedPosition >= 0) {
            val oldPosition = selectedPosition
            selectedPosition = -1
            notifyItemChanged(oldPosition)
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ChannelRowViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_channel_row, parent, false)
        return ChannelRowViewHolder(view)
    }

    override fun onBindViewHolder(holder: ChannelRowViewHolder, position: Int) {
        holder.bind(channels[position], position == selectedPosition)
    }

    override fun getItemCount(): Int = channels.size

    inner class ChannelRowViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val container: LinearLayout = itemView as LinearLayout
        private val playIndicator: ImageView = itemView.findViewById(R.id.play_indicator)
        private val channelNumber: TextView = itemView.findViewById(R.id.channel_number)
        private val channelLogo: ImageView = itemView.findViewById(R.id.channel_logo)
        private val channelName: TextView = itemView.findViewById(R.id.channel_name)

        init {
            // Only trigger channel play on actual click/enter, not on focus
            itemView.setOnClickListener {
                val position = adapterPosition
                if (position != RecyclerView.NO_POSITION) {
                    onChannelSelected(channels[position])
                }
            }

            // Just update visual style on focus, don't trigger playback
            itemView.setOnFocusChangeListener { _, hasFocus ->
                val position = adapterPosition
                if (position == RecyclerView.NO_POSITION) return@setOnFocusChangeListener
                
                if (hasFocus) {
                    setSelectedPosition(position)
                    // Notify listener to show preview
                    onChannelFocused?.invoke(channels[position])
                }
                updateStyle()
            }
        }

        fun bind(channel: Channel, isSelected: Boolean) {
            val position = adapterPosition
            channelNumber.text = channel.number ?: (position + 1).toString()
            channelName.text = channel.name
            
            // Show play indicator if this is the playing channel
            playIndicator.visibility = if (position == playingPosition) View.VISIBLE else View.GONE
            
            // Load channel logo
            if (!channel.logo.isNullOrEmpty()) {
                channelLogo.load(channel.logo) {
                    crossfade(true)
                    placeholder(R.drawable.ic_movie_placeholder)
                    error(R.drawable.ic_movie_placeholder)
                }
            } else {
                channelLogo.setImageResource(R.drawable.ic_movie_placeholder)
            }
            
            updateStyle()
        }

        private fun updateStyle() {
            val position = adapterPosition
            if (position == RecyclerView.NO_POSITION) return
            
            val isFocusedOrSelected = container.hasFocus() || position == selectedPosition
            
            if (isFocusedOrSelected) {
                // White background for focused or selected item
                container.setBackgroundResource(R.drawable.category_selected)
                channelNumber.setTextColor(ContextCompat.getColor(itemView.context, android.R.color.black))
                channelName.setTextColor(ContextCompat.getColor(itemView.context, android.R.color.black))
            } else {
                // Normal state
                container.setBackgroundResource(android.R.drawable.screen_background_dark_transparent)
                channelNumber.setTextColor(ContextCompat.getColor(itemView.context, android.R.color.darker_gray))
                channelName.setTextColor(ContextCompat.getColor(itemView.context, android.R.color.white))
            }
        }
    }
}
