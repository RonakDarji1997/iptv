package com.ronika.iptvnative

import android.os.Bundle
import android.util.Log
import android.view.KeyEvent
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView

/**
 * LiveTVChannelsActivity - Shows channels for a selected Live TV category
 * 
 * Layout:
 * - Top 50%: Video preview + Category name (top right) + Channel name (bottom)
 * - Bottom 50%: Scrollable channel list (rows)
 * 
 * Navigation:
 * - UP/DOWN: Navigate through channel rows
 * - CENTER: First click = Update preview, Second click = Go fullscreen
 * - BACK: Return to category sidebar with focus on selected category
 */
class LiveTVChannelsActivity : ComponentActivity() {

    private val TAG = "LiveTVChannels"
    
    private lateinit var categoryNameLabel: TextView
    private lateinit var previewChannelName: TextView
    private lateinit var videoPreview: View
    private lateinit var channelsRecycler: RecyclerView
    private lateinit var channelAdapter: ChannelAdapter
    private lateinit var timeHeaderContainer: android.widget.LinearLayout
    private lateinit var timeHeaderScroll: android.widget.HorizontalScrollView
    private lateinit var timeCursor: View
    
    private var categoryName: String = ""
    private var selectedChannelPosition: Int = 0
    private var isPreviewActive: Boolean = false
    
    // EPG timeline configuration
    private val EPG_START_HOUR = 12
    private val EPG_START_MINUTE = 30
    private val SLOT_WIDTH_DP = 200 // Width for 30 minutes
    
    // Generate dummy EPG slots with variable durations (30min, 1hr, 2hr)
    private fun generateDummyEpgSlots(): List<EpgSlot> {
        val slots = mutableListOf<EpgSlot>()
        val durations = listOf(30, 60, 120, 30, 60, 30, 120, 60, 30, 60) // minutes
        val programNames = listOf(
            "Morning News", "Talk Show", "Movie: Action Hero", "Series Episode",
            "Documentary Special", "Live Sports", "Prime Time Movie", "News Hour",
            "Late Night Show", "Music Concert"
        )
        
        var currentTime = 12 * 60 + 30 // Start at 12:30 in minutes
        
        for (i in durations.indices) {
            val hour = (currentTime / 60) % 24
            val minute = currentTime % 60
            
            val nextTime = currentTime + durations[i]
            val nextHour = (nextTime / 60) % 24
            val nextMinute = nextTime % 60
            
            slots.add(EpgSlot(
                startTime = String.format("%02d:%02d", hour, minute),
                endTime = String.format("%02d:%02d", nextHour, nextMinute),
                programName = programNames.getOrNull(i) ?: "No information",
                durationMinutes = durations[i]
            ))
            
            currentTime = nextTime
        }
        return slots
    }
    
    // Dummy channel data with EPG
    private val dummyChannels = listOf(
        Channel(1, "BBC News", "https://dummy.url/bbc", generateDummyEpgSlots()),
        Channel(2, "CNN International", "https://dummy.url/cnn", generateDummyEpgSlots()),
        Channel(3, "Sky News", "https://dummy.url/sky", generateDummyEpgSlots()),
        Channel(4, "Al Jazeera", "https://dummy.url/aljazeera", generateDummyEpgSlots()),
        Channel(5, "Fox News", "https://dummy.url/fox", generateDummyEpgSlots()),
        Channel(6, "MSNBC", "https://dummy.url/msnbc", generateDummyEpgSlots()),
        Channel(7, "Bloomberg", "https://dummy.url/bloomberg", generateDummyEpgSlots()),
        Channel(8, "CNBC", "https://dummy.url/cnbc", generateDummyEpgSlots()),
        Channel(9, "Euronews", "https://dummy.url/euronews", generateDummyEpgSlots()),
        Channel(10, "France 24", "https://dummy.url/france24", generateDummyEpgSlots())
    )
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_live_tv_channels)
        
        // Get category name from intent
        categoryName = intent.getStringExtra("CATEGORY_NAME") ?: "Live TV"
        
        // Initialize views
        categoryNameLabel = findViewById(R.id.category_name_label)
        previewChannelName = findViewById(R.id.preview_channel_name)
        videoPreview = findViewById(R.id.video_preview)
        channelsRecycler = findViewById(R.id.channels_recycler)
        timeHeaderContainer = findViewById(R.id.time_header_container)
        timeHeaderScroll = findViewById(R.id.time_header_scroll)
        timeCursor = findViewById(R.id.time_cursor)
        
        // Set category name
        categoryNameLabel.text = categoryName
        
        // Setup time header
        setupTimeHeader()
        
        // Setup channel list
        channelAdapter = ChannelAdapter(dummyChannels) { position ->
            onChannelSelected(position)
        }
        
        channelsRecycler.apply {
            layoutManager = LinearLayoutManager(this@LiveTVChannelsActivity)
            adapter = channelAdapter
            setHasFixedSize(true)
        }
        
        // Set initial preview and focus on first channel info
        channelsRecycler.post {
            updatePreview(0)
            val firstRow = channelsRecycler.getChildAt(0)
            firstRow?.findViewById<android.widget.LinearLayout>(R.id.channel_info)?.requestFocus()
        }
        
        Log.d(TAG, "LiveTVChannelsActivity initialized for category: $categoryName")
    }
    
    private fun onChannelSelected(position: Int) {
        selectedChannelPosition = position
        
        if (isPreviewActive) {
            // Second click - go fullscreen
            Log.d(TAG, "Going fullscreen for channel: ${dummyChannels[position].name}")
            goFullscreen()
        } else {
            // First click - update preview
            Log.d(TAG, "Updating preview for channel: ${dummyChannels[position].name}")
            updatePreview(position)
            isPreviewActive = true
        }
    }
    
    private fun updatePreview(position: Int) {
        val channel = dummyChannels[position]
        previewChannelName.text = channel.name
        selectedChannelPosition = position
        // TODO: Update video preview with actual stream
        Log.d(TAG, "Preview updated to: ${channel.name}")
    }
    
    private fun goFullscreen() {
        // TODO: Launch fullscreen player activity
        Log.d(TAG, "TODO: Launch fullscreen player for channel: ${dummyChannels[selectedChannelPosition].name}")
    }
    
    /**
     * Setup the time header with time markers showing all 30-minute intervals
     */
    private fun setupTimeHeader() {
        timeHeaderContainer.removeAllViews()
        
        // Calculate total duration covered by EPG
        val slots = dummyChannels.firstOrNull()?.epgSlots ?: return
        var totalMinutes = 0
        for (slot in slots) {
            totalMinutes += slot.durationMinutes
        }
        
        // Generate time markers for every 30-minute interval
        val intervalMinutes = 30
        val numIntervals = (totalMinutes / intervalMinutes) + 1
        
        var currentTime = EPG_START_HOUR * 60 + EPG_START_MINUTE
        
        for (i in 0 until numIntervals) {
            val hour = (currentTime / 60) % 24
            val minute = currentTime % 60
            val timeString = String.format("%02d:%02d", hour, minute)
            
            val timeMarker = TextView(this).apply {
                text = timeString
                textSize = 14f
                setTextColor(0xFFFFFFFF.toInt())
                typeface = android.graphics.Typeface.DEFAULT_BOLD
                setPadding(16, 0, 16, 0)
                
                // Each marker represents 30 minutes = 200dp
                val widthPx = (SLOT_WIDTH_DP * resources.displayMetrics.density).toInt()
                layoutParams = android.widget.LinearLayout.LayoutParams(widthPx, android.widget.LinearLayout.LayoutParams.WRAP_CONTENT)
            }
            timeHeaderContainer.addView(timeMarker)
            
            currentTime += intervalMinutes
        }
        
        // Position the current time cursor
        positionTimeCursor()
    }
    
    /**
     * Position the red vertical cursor at the current time
     */
    private fun positionTimeCursor() {
        val calendar = java.util.Calendar.getInstance()
        val currentHour = calendar.get(java.util.Calendar.HOUR_OF_DAY)
        val currentMinute = calendar.get(java.util.Calendar.MINUTE)
        
        // Calculate minutes since EPG start time
        val epgStartMinutes = EPG_START_HOUR * 60 + EPG_START_MINUTE
        val currentMinutes = currentHour * 60 + currentMinute
        val minutesSinceStart = currentMinutes - epgStartMinutes
        
        if (minutesSinceStart >= 0) {
            // Calculate cursor position (200dp per 30 minutes)
            val positionDp = (minutesSinceStart / 30f * SLOT_WIDTH_DP)
            val positionPx = (positionDp * resources.displayMetrics.density).toInt()
            
            // Position the cursor
            val layoutParams = timeCursor.layoutParams as android.widget.FrameLayout.LayoutParams
            layoutParams.leftMargin = positionPx
            timeCursor.layoutParams = layoutParams
            
            Log.d(TAG, "Current time cursor positioned at: ${currentHour}:${currentMinute} (${positionPx}px from start)")
        } else {
            // Current time is before EPG start - hide cursor
            timeCursor.visibility = View.GONE
            Log.d(TAG, "Current time is before EPG start time, cursor hidden")
        }
    }
    
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        when (keyCode) {
            KeyEvent.KEYCODE_BACK -> {
                Log.d(TAG, "Back pressed, returning to category sidebar with animation")
                // Set result to indicate back was pressed (not finished)
                setResult(RESULT_OK)
                finish()
                // Use custom animation for smooth transition back
                overridePendingTransition(0, R.anim.slide_out_right)
                return true
            }
        }
        return super.onKeyDown(keyCode, event)
    }
    
    /**
     * Channel data class
     */
    data class Channel(
        val number: Int,
        val name: String,
        val url: String,
        val epgSlots: List<EpgSlot>
    )
    
    /**
     * EPG Slot data class - represents a time slot with program info
     */
    data class EpgSlot(
        val startTime: String,
        val endTime: String,
        val programName: String,
        val durationMinutes: Int = 30
    )
    
    /**
     * Channel adapter for RecyclerView
     */
    inner class ChannelAdapter(
        private val channels: List<Channel>,
        private val onChannelClick: (Int) -> Unit
    ) : RecyclerView.Adapter<ChannelAdapter.ChannelViewHolder>() {
        
        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ChannelViewHolder {
            val view = LayoutInflater.from(parent.context)
                .inflate(R.layout.item_channel_row, parent, false)
            return ChannelViewHolder(view)
        }
        
        override fun onBindViewHolder(holder: ChannelViewHolder, position: Int) {
            holder.bind(channels[position])
        }
        
        override fun getItemCount() = channels.size
        
        inner class ChannelViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
            private val channelNumber: TextView = itemView.findViewById(R.id.channel_number)
            private val channelName: TextView = itemView.findViewById(R.id.channel_name)
            private val channelInfo: android.widget.LinearLayout = itemView.findViewById(R.id.channel_info)
            private val epgContainer: android.widget.LinearLayout = itemView.findViewById(R.id.epg_container)
            private val epgScrollView: android.widget.HorizontalScrollView = itemView.findViewById(R.id.epg_scroll_view)
            
            init {
                // Make row non-focusable, only channel info and EPG slots are focusable
                itemView.isFocusable = false
                itemView.isFocusableInTouchMode = false
                
                // Channel info click handler
                channelInfo.setOnClickListener {
                    val pos = bindingAdapterPosition
                    if (pos != RecyclerView.NO_POSITION) {
                        onChannelClick(pos)
                    }
                }
                
                // Channel info focus styling
                channelInfo.setOnFocusChangeListener { _, hasFocus ->
                    if (hasFocus) {
                        channelInfo.setBackgroundResource(R.drawable.channel_row_focused)
                        channelNumber.setTextColor(0xFF000000.toInt())
                        channelName.setTextColor(0xFF000000.toInt())
                        // Update preview when focused
                        val pos = bindingAdapterPosition
                        if (pos != RecyclerView.NO_POSITION) {
                            updatePreview(pos)
                        }
                        isPreviewActive = false
                    } else {
                        channelInfo.setBackgroundResource(R.drawable.channel_row_normal)
                        channelNumber.setTextColor(0xFFFFFFFF.toInt())
                        channelName.setTextColor(0xFFFFFFFF.toInt())
                    }
                }
                
                // Handle navigation from channel info to EPG
                channelInfo.setOnKeyListener { _, keyCode, event ->
                    if (event.action == KeyEvent.ACTION_DOWN && keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) {
                        if (epgContainer.childCount > 0) {
                            epgContainer.getChildAt(0)?.requestFocus()
                            return@setOnKeyListener true
                        }
                    }
                    false
                }
                
                // Sync EPG scroll with time header scroll
                epgScrollView.setOnScrollChangeListener { _, scrollX, _, _, _ ->
                    timeHeaderScroll.scrollTo(scrollX, 0)
                }
            }
            
            fun bind(channel: Channel) {
                channelNumber.text = channel.number.toString()
                channelName.text = channel.name
                
                // Clear existing EPG slots
                epgContainer.removeAllViews()
                
                // Add EPG slots with variable widths based on duration
                for ((index, slot) in channel.epgSlots.withIndex()) {
                    // Calculate width: 200dp per 30 minutes
                    val widthDp = (slot.durationMinutes / 30f * 200f).toInt()
                    val widthPx = (widthDp * itemView.context.resources.displayMetrics.density).toInt()
                    
                    val slotView = android.widget.LinearLayout(itemView.context).apply {
                        orientation = android.widget.LinearLayout.VERTICAL
                        layoutParams = android.widget.LinearLayout.LayoutParams(
                            widthPx,
                            android.widget.LinearLayout.LayoutParams.MATCH_PARENT
                        )
                        setPadding(16, 8, 16, 8)
                        isFocusable = true
                        isFocusableInTouchMode = true
                        setBackgroundResource(R.drawable.channel_row_normal)
                    }
                    
                    // Add time header - show start time only
                    val timeHeader = TextView(itemView.context).apply {
                        text = slot.startTime
                        textSize = 12f
                        setTextColor(0x99FFFFFF.toInt())
                        typeface = android.graphics.Typeface.DEFAULT_BOLD
                    }
                    slotView.addView(timeHeader)
                    
                    // Add separator line
                    val separator = View(itemView.context).apply {
                        layoutParams = android.widget.LinearLayout.LayoutParams(
                            android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                            2
                        ).apply {
                            setMargins(0, 4, 0, 4)
                        }
                        setBackgroundColor(0x33FFFFFF.toInt())
                    }
                    slotView.addView(separator)
                    
                    // Add program name
                    val programText = TextView(itemView.context).apply {
                        text = slot.programName
                        textSize = 13f
                        setTextColor(0xB3FFFFFF.toInt())
                        maxLines = 2
                        ellipsize = android.text.TextUtils.TruncateAt.END
                    }
                    slotView.addView(programText)
                    
                    // EPG slot focus styling
                    slotView.setOnFocusChangeListener { view, hasFocus ->
                        if (hasFocus) {
                            view.setBackgroundResource(R.drawable.channel_row_focused)
                            timeHeader.setTextColor(0xFF000000.toInt())
                            programText.setTextColor(0xFF000000.toInt())
                        } else {
                            view.setBackgroundResource(R.drawable.channel_row_normal)
                            timeHeader.setTextColor(0x99FFFFFF.toInt())
                            programText.setTextColor(0xB3FFFFFF.toInt())
                        }
                    }
                    
                    // Handle navigation within EPG and back to channel info
                    slotView.setOnKeyListener { _, keyCode, event ->
                        if (event.action == KeyEvent.ACTION_DOWN) {
                            when (keyCode) {
                                KeyEvent.KEYCODE_DPAD_LEFT -> {
                                    if (index == 0) {
                                        // First EPG slot - go back to channel info
                                        channelInfo.requestFocus()
                                        return@setOnKeyListener true
                                    }
                                }
                            }
                        }
                        false
                    }
                    
                    epgContainer.addView(slotView)
                }
            }
        }
    }
}
