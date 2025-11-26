package com.ronika.iptvnative

import android.graphics.Color
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.ronika.iptvnative.models.Channel
import com.ronika.iptvnative.models.Genre

/**
 * LiveCategoryAdapter - Horizontal slider for category pills
 */
class LiveCategoryAdapter(
    private val onCategoryClick: (Genre, Int) -> Unit
) : RecyclerView.Adapter<LiveCategoryAdapter.CategoryViewHolder>() {
    
    private var categories: List<Genre> = emptyList()
    private var activePosition: Int = -1
    
    fun setCategories(newCategories: List<Genre>) {
        categories = newCategories
        notifyDataSetChanged()
    }
    
    fun setActivePosition(position: Int) {
        val oldPosition = activePosition
        activePosition = position
        notifyItemChanged(oldPosition)
        notifyItemChanged(position)
    }
    
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): CategoryViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_live_category, parent, false)
        return CategoryViewHolder(view)
    }
    
    override fun onBindViewHolder(holder: CategoryViewHolder, position: Int) {
        val category = categories[position]
        holder.bind(category, position == activePosition)
        holder.itemView.setOnClickListener {
            onCategoryClick(category, position)
        }
    }
    
    override fun getItemCount(): Int = categories.size
    
    class CategoryViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val categoryName: TextView = itemView.findViewById(R.id.category_name)
        
        fun bind(category: Genre, isActive: Boolean) {
            categoryName.text = category.title
            
            // Set background based on selected state (focus handled by drawable selector)
            if (isActive) {
                categoryName.setBackgroundResource(R.drawable.category_selected)
                // Text color will be black when focused (from state list), white otherwise
                if (!categoryName.isFocused) {
                    categoryName.setTextColor(Color.WHITE)
                }
            } else {
                categoryName.setBackgroundResource(R.drawable.category_focus)
            }
        }
    }
}

/**
 * LiveChannelAdapter - Vertical grid for channels with single/double click detection
 */
class LiveChannelAdapter(
    private val onSingleClick: (Channel, Int) -> Unit,
    private val onDoubleClick: (Channel, Int) -> Unit
) : RecyclerView.Adapter<LiveChannelAdapter.ChannelViewHolder>() {
    
    private var channels: List<Channel> = emptyList()
    private var playingPosition: Int = -1
    
    fun setChannels(newChannels: List<Channel>) {
        channels = newChannels
        notifyDataSetChanged()
    }
    
    fun setPlayingPosition(position: Int) {
        val oldPosition = playingPosition
        playingPosition = position
        notifyItemChanged(oldPosition)
        notifyItemChanged(position)
    }
    
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ChannelViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_live_channel, parent, false)
        
        val holder = ChannelViewHolder(view)
        
        // Setup double-click detection once in ViewHolder creation
        var lastClickTime = 0L
        view.setOnClickListener {
            val position = holder.bindingAdapterPosition
            if (position != RecyclerView.NO_POSITION) {
                val channel = channels[position]
                val currentTime = System.currentTimeMillis()
                
                if (currentTime - lastClickTime < 300) {
                    // Double click detected
                    android.util.Log.d("LiveChannelAdapter", "Double click on ${channel.name}")
                    onDoubleClick(channel, position)
                    lastClickTime = 0L
                } else {
                    // Potential single click - wait to confirm
                    lastClickTime = currentTime
                    view.postDelayed({
                        if (lastClickTime != 0L && lastClickTime == currentTime) {
                            android.util.Log.d("LiveChannelAdapter", "Single click on ${channel.name}")
                            onSingleClick(channel, position)
                            lastClickTime = 0L
                        }
                    }, 300)
                }
            }
        }
        
        return holder
    }
    
    override fun onBindViewHolder(holder: ChannelViewHolder, position: Int) {
        val channel = channels[position]
        holder.bind(channel, position == playingPosition)
    }
    
    override fun getItemCount(): Int = channels.size
    
    class ChannelViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val channelNumber: TextView = itemView.findViewById(R.id.channel_number)
        private val channelName: TextView = itemView.findViewById(R.id.channel_name)
        private val nowPlaying: TextView = itemView.findViewById(R.id.now_playing)
        
        fun bind(channel: Channel, isPlaying: Boolean) {
            val channelNum = channel.number?.toIntOrNull() ?: 0
            channelNumber.text = String.format("%03d", channelNum)
            channelName.text = channel.name
            
            // EPG placeholder
            nowPlaying.text = "This Channel has No Guide"
            
            // Highlight playing channel with gold border
            if (isPlaying) {
                itemView.setBackgroundResource(R.drawable.channel_item_playing)
                channelName.setTextColor(Color.parseColor("#fbbf24")) // Yellow/gold
            } else {
                itemView.setBackgroundResource(R.drawable.channel_item_bg)
                channelName.setTextColor(Color.WHITE)
            }
        }
    }
}
