package com.ronika.iptvnative.components

import android.content.Context
import android.util.AttributeSet
import android.util.Log
import android.view.KeyEvent
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.ronika.iptvnative.R
import coil.load
import coil.request.CachePolicy
import com.ronika.iptvnative.api.StalkerClient
import com.ronika.iptvnative.database.AppDatabase
import android.os.Handler
import android.os.Looper
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * LiveTVChannelsComponent - Embedded channels view for Live TV categories
 * Shows in the main activity's right section instead of a separate activity
 */
class LiveTVChannelsComponent @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : FrameLayout(context, attrs, defStyleAttr) {

    private val TAG = "LiveTVChannels"
    
    private lateinit var categoryNameLabel: TextView
    private lateinit var previewChannelName: TextView
    private lateinit var liveTVPlayer: LiveTVPlayerComponent
    private lateinit var liveTVPlayerFullscreen: LiveTVPlayerComponent
    private lateinit var channelsRecycler: RecyclerView
    private lateinit var timeHeaderContainer: LinearLayout
    private lateinit var timeHeaderScroll: android.widget.HorizontalScrollView
    private lateinit var timeCursor: View
    private lateinit var channelAdapter: ChannelAdapter
    private lateinit var mainContent: View
    private lateinit var fullscreenPlayerContainer: FrameLayout
    private lateinit var previewContainer: FrameLayout
    
    // Current/Next program views
    private lateinit var currentProgramContainer: LinearLayout
    private lateinit var currentProgramName: TextView
    private lateinit var currentProgramTime: TextView
    private lateinit var currentProgramProgress: android.widget.ProgressBar
    private lateinit var nextProgramContainer: LinearLayout
    private lateinit var nextProgramName: TextView
    private lateinit var nextProgramTime: TextView
    
    private var categoryName: String = ""
    private var selectedChannelPosition: Int = 0
    private var playingChannelPosition: Int = -1
    private var isFullscreen: Boolean = false
    private var onBackPressedCallback: ((String) -> Unit)? = null
    
    // Pagination
    private var currentPage = 1
    private var totalItems = 0
    private var totalPages = 1
    private var isLoadingMore = false
    private var allChannelsLoaded = false
    private var currentGenreId: String? = null
    private val allChannels = mutableListOf<ChannelItem>()
    
    // EPG cache - channelId -> epg slots with timestamps
    private val epgCache = mutableMapOf<String, List<EpgSlotWithTimestamp>>()
    private val epgLoadingSet = mutableSetOf<String>() // Track channels currently loading EPG
    
    // EPG timeline configuration
    private var epgStartTime: Long = 0 // Timestamp of EPG timeline start
    private val SLOT_WIDTH_DP = 200
    
    // Real-time update handler
    private val updateHandler = Handler(Looper.getMainLooper())
    private val UPDATE_INTERVAL_MS = 60000L // Update every minute
    private var lastEpgUpdateMinute = -1
    
    private val timeUpdateRunnable = object : Runnable {
        override fun run() {
            updateTimeDisplay()
            updateHandler.postDelayed(this, UPDATE_INTERVAL_MS)
        }
    }
    
    // API client - initialized lazily with provider credentials
    private var stalkerClient: StalkerClient? = null
    private var portalBaseUrl: String = ""
    
    // Database
    private val database = AppDatabase.getDatabase(context)
    private val categoryDao = database.categoryDao()
    private val providerDao = database.providerDao()
    
    // Coroutine scope
    private val scope = CoroutineScope(Dispatchers.Main)
    
    init {
        LayoutInflater.from(context).inflate(R.layout.component_live_tv_channels, this, true)
        setupViews()
        // Initialize API client with provider credentials
        reinitializeClient()
    }
    
    /**
     * Initialize or reinitialize the Stalker client with credentials from active provider
     * Call this when switching providers!
     */
    fun reinitializeClient() {
        scope.launch {
            reinitializeClientSync()
        }
    }
    
    // Current provider ID - set when showing a category
    private var currentProviderId: String? = null
    
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
            currentProviderId = provider.id
            portalBaseUrl = provider.serverUrl.trimEnd('/')
            stalkerClient = StalkerClient(
                portalUrl = provider.serverUrl,
                macAddress = provider.macAddress ?: "",
                token = provider.token ?: "",
                serialNumber = provider.serialNumber ?: ""
            )
            Log.d(TAG, "Initialized StalkerClient with provider: ${provider.name}, token: ${provider.token?.take(10)}...")
            
            // Also initialize the player components with the same provider
            liveTVPlayer.initializeWithProvider(providerId)
            liveTVPlayerFullscreen.initializeWithProvider(providerId)
        } else {
            Log.e(TAG, "Provider not found: $providerId")
        }
    }
    
    /**
     * Synchronously reinitialize client - can be called from coroutine
     */
    suspend fun reinitializeClientSync() {
        val provider = withContext(Dispatchers.IO) {
            providerDao.getActiveProvider()
        }
        if (provider != null) {
            portalBaseUrl = provider.serverUrl.trimEnd('/')
            stalkerClient = StalkerClient(
                portalUrl = provider.serverUrl,
                macAddress = provider.macAddress ?: "",
                token = provider.token ?: "",
                serialNumber = provider.serialNumber ?: ""
            )
            Log.d(TAG, "Initialized StalkerClient with provider: ${provider.name}, token: ${provider.token?.take(10)}...")
        } else {
            Log.e(TAG, "No active provider found!")
        }
    }
    
    /**
     * Build logo URL from logo filename using the portal base URL
     */
    private fun buildLogoUrl(logo: String): String {
        return if (portalBaseUrl.isNotEmpty()) {
            "$portalBaseUrl/stalker_portal/misc/logos/320/$logo"
        } else {
            // Fallback - should not happen if client is properly initialized
            "/stalker_portal/misc/logos/320/$logo"
        }
    }
    
    private fun setupViews() {
        categoryNameLabel = findViewById(R.id.category_name_label)
        previewChannelName = findViewById(R.id.preview_channel_name)
        liveTVPlayer = findViewById(R.id.live_tv_player)
        liveTVPlayerFullscreen = findViewById(R.id.live_tv_player_fullscreen)
        channelsRecycler = findViewById(R.id.channels_recycler)
        timeHeaderContainer = findViewById(R.id.time_header_container)
        timeHeaderScroll = findViewById(R.id.time_header_scroll)
        timeCursor = findViewById(R.id.time_cursor)
        mainContent = findViewById(R.id.main_content)
        fullscreenPlayerContainer = findViewById(R.id.fullscreen_player_container)
        previewContainer = findViewById(R.id.preview_container)
        
        // Current/Next program views
        currentProgramContainer = findViewById(R.id.current_program_container)
        currentProgramName = findViewById(R.id.current_program_name)
        currentProgramTime = findViewById(R.id.current_program_time)
        currentProgramProgress = findViewById(R.id.current_program_progress)
        nextProgramContainer = findViewById(R.id.next_program_container)
        nextProgramName = findViewById(R.id.next_program_name)
        nextProgramTime = findViewById(R.id.next_program_time)
        
        // Setup preview player callbacks (NO fullscreen callback to prevent loops)
        liveTVPlayer.setCallbacks(
            fullscreenToggle = { _ ->
                // Do nothing - we handle fullscreen manually
            },
            channelChange = { _ ->
                // Do nothing - we handle channel changes manually
            },
            backPressed = {
                // Preview player doesn't handle back
            }
        )
        
        // Setup fullscreen player callbacks (NO fullscreen callback to prevent loops)
        liveTVPlayerFullscreen.setCallbacks(
            fullscreenToggle = { _ ->
                // Do nothing - we handle fullscreen manually
            },
            channelChange = { channelIndex ->
                handleChannelChange(channelIndex)
            },
            backPressed = {
                handlePlayerBackPressed()
            }
        )
        
        // Setup recycler
        channelAdapter = ChannelAdapter(emptyList()) { position ->
            onChannelSelected(position)
        }
        
        channelsRecycler.apply {
            layoutManager = LinearLayoutManager(context)
            adapter = channelAdapter
            setHasFixedSize(true)
            setItemViewCacheSize(20)
            recycledViewPool.setMaxRecycledViews(0, 30)
            descendantFocusability = ViewGroup.FOCUS_AFTER_DESCENDANTS
            isFocusable = false
            
            // Add scroll listener for dynamic loading (channels + EPG)
            addOnScrollListener(object : RecyclerView.OnScrollListener() {
                override fun onScrolled(recyclerView: RecyclerView, dx: Int, dy: Int) {
                    super.onScrolled(recyclerView, dx, dy)
                    
                    val layoutManager = recyclerView.layoutManager as? LinearLayoutManager
                    if (layoutManager != null) {
                        val lastVisiblePosition = layoutManager.findLastVisibleItemPosition()
                        val totalItemCount = layoutManager.itemCount
                        
                        // Load more channels when within 5 items of the end
                        if (!isLoadingMore && !allChannelsLoaded && lastVisiblePosition >= totalItemCount - 5) {
                            loadNextPageIfNeeded()
                        }
                        
                        // Load EPG for visible channels as user scrolls
                        loadEpgForVisibleChannels()
                    }
                }
            })
            
            // Custom key listener to prevent navigation outside bounds
            setOnKeyListener { _, keyCode, event ->
                if (event.action == android.view.KeyEvent.ACTION_DOWN) {
                    val layoutManager = this.layoutManager as? LinearLayoutManager
                    val focusedChild = this.focusedChild
                    if (layoutManager != null && focusedChild != null) {
                        val position = layoutManager.getPosition(focusedChild)
                        when (keyCode) {
                            android.view.KeyEvent.KEYCODE_DPAD_UP -> {
                                if (position <= 0) {
                                    return@setOnKeyListener true // Block up at first item
                                }
                            }
                            android.view.KeyEvent.KEYCODE_DPAD_DOWN -> {
                                if (position >= (this.adapter?.itemCount ?: 0) - 1) {
                                    return@setOnKeyListener true // Block down at last item
                                }
                            }
                        }
                    }
                }
                false
            }
        }
    }
    
    fun showCategory(categoryName: String, providerId: String? = null) {
        this.categoryName = categoryName
        // Store the provider ID for later use
        if (providerId != null) {
            this.currentProviderId = providerId
        }
        categoryNameLabel.text = categoryName
        visibility = VISIBLE
        
        // Reset state when switching categories
        selectedChannelPosition = 0
        playingChannelPosition = -1  // Reset - no auto-play on category switch
        isFullscreen = false
        
        // Stop any current playback
        liveTVPlayer.stopPlayback()
        liveTVPlayerFullscreen.stopPlayback()
        
        // Clear preview
        previewChannelName.text = ""
        
        // Reset pagination
        currentPage = 1
        totalItems = 0
        totalPages = 1
        allChannelsLoaded = false
        isLoadingMore = false
        allChannels.clear()
        
        // Clear EPG cache for new category
        epgCache.clear()
        epgLoadingSet.clear()
        
        // Clear adapter immediately so old channels don't show
        channelAdapter.updateChannels(emptyList())
        
        // Fetch all channels in parallel
        scope.launch {
            try {
                // Check if this is an M3U provider
                val provider = withContext(Dispatchers.IO) {
                    currentProviderId?.let { database.providerDao().getProviderById(it) }
                }
                
                // Look up genre ID from category name
                val genreId = lookupGenreId(categoryName)
                
                if (genreId != null) {
                    currentGenreId = genreId
                    Log.d(TAG, "Fetching channels for category: $categoryName, genreId: $genreId, provider type: ${provider?.type}")
                    
                    // M3U providers load from database, Stalker providers use API
                    if (provider?.type == "m3u") {
                        // Load channels directly from database for M3U
                        val dbChannels = withContext(Dispatchers.IO) {
                            database.channelDao().getChannelsByCategory(genreId)
                        }
                        
                        Log.d(TAG, "Loaded ${dbChannels.size} M3U channels from database")
                        
                        val channelItems = dbChannels.map { dbChannel ->
                            ChannelItem(
                                id = dbChannel.externalId,
                                number = dbChannel.number?.toIntOrNull() ?: 0,
                                name = dbChannel.name,
                                url = dbChannel.cmd ?: "",
                                logo = dbChannel.logo,
                                epgSlots = emptyList()
                            )
                        }
                        
                        allChannels.addAll(channelItems)
                        totalItems = channelItems.size
                        totalPages = 1
                        allChannelsLoaded = true
                        
                        Log.d(TAG, "Setting up UI with ${allChannels.size} channels")
                        
                        withContext(Dispatchers.Main) {
                            // Update adapter
                            channelAdapter.updateChannels(allChannels)
                            Log.d(TAG, "Adapter updated with channels")
                            
                            // Setup time header
                            setupTimeHeader()
                            
                            // Setup players
                            liveTVPlayer.setChannels(allChannels.toList())
                            liveTVPlayerFullscreen.setChannels(allChannels.toList())
                            Log.d(TAG, "Players configured with channels")
                            
                            // Focus first channel
                            channelsRecycler.post {
                                updatePreview(0)
                                val firstRow = channelsRecycler.getChildAt(0)
                                firstRow?.findViewById<LinearLayout>(R.id.channel_info)?.requestFocus()
                                Log.d(TAG, "Focused first channel")
                            }
                        }
                        
                        return@launch
                    }
                    
                    // Stalker provider - use API
                    // Ensure client is initialized
                    val client = stalkerClient
                    if (client == null) {
                        Log.e(TAG, "StalkerClient not initialized yet!")
                        return@launch
                    }
                    
                    // Fetch first page to get total count
                    val firstResponse = withContext(Dispatchers.IO) {
                        client.getChannels(genreId, page = 1)
                    }
                    
                    totalItems = firstResponse.channels.total
                    val maxPageItems = 14 // From API response
                    totalPages = if (totalItems > 0) (totalItems + maxPageItems - 1) / maxPageItems else 1
                    
                    Log.d(TAG, "Total items: $totalItems, Total pages: $totalPages")
                    
                    // Convert first page channels - no EPG initially (loads async)
                    val firstPageChannels = firstResponse.channels.data.map { apiChannel ->
                        val logoUrl = apiChannel.logo?.let { logo ->
                            buildLogoUrl(logo)
                        }
                        ChannelItem(
                            id = apiChannel.id,
                            number = apiChannel.number?.toIntOrNull() ?: 0,
                            name = apiChannel.name,
                            url = apiChannel.cmd ?: "",
                            logo = logoUrl,
                            epgSlots = emptyList()  // EPG loads in background
                        )
                    }
                    
                    // Add to all channels list
                    allChannels.addAll(firstPageChannels)
                    
                    // Update adapter with first page immediately
                    channelAdapter.updateChannels(allChannels.toMutableList())
                    
                    // Setup time header with current time
                    setupTimeHeader()
                    
                    // Setup player with channels
                    liveTVPlayer.setChannels(allChannels.toList())
                    liveTVPlayerFullscreen.setChannels(allChannels.toList())
                    
                    // Load EPG for visible channels in background
                    loadEpgForVisibleChannels()
                    
                    // Request focus on first channel after layout
                    channelsRecycler.post {
                        channelsRecycler.postDelayed({
                            val firstRow = channelsRecycler.getChildAt(0)
                            firstRow?.findViewById<LinearLayout>(R.id.channel_info)?.apply {
                                requestFocus()
                                Log.d(TAG, "Requested focus on first channel")
                            }
                        }, 100)
                    }
                    
                    Log.d(TAG, "Loaded page 1: ${firstPageChannels.size} channels")
                    
                    // Load first few pages in parallel for quick initial load
                    // Then load more as user scrolls (pagination)
                    if (totalPages > 1) {
                        val initialPagesToLoad = minOf(5, totalPages) // Load first 5 pages initially
                        loadPagesInParallel(genreId, 2, initialPagesToLoad)
                    } else {
                        allChannelsLoaded = true
                    }
                } else {
                    Log.e(TAG, "Could not find genre ID for category: $categoryName")
                    loadDummyChannels()
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error fetching channels: ${e.message}", e)
                loadDummyChannels()
            }
        }
    }
    
    private fun loadPagesInParallel(genreId: String, fromPage: Int, toPage: Int) {
        scope.launch {
            try {
                isLoadingMore = true
                Log.d(TAG, "Loading pages in parallel: $fromPage to $toPage")
                
                val client = stalkerClient ?: return@launch
                
                // Load pages in parallel
                val pagesDeferred = (fromPage..toPage).map { page ->
                    scope.async(Dispatchers.IO) {
                        try {
                            val response = client.getChannels(genreId, page = page)
                            response.channels.data.map { apiChannel ->
                                val logoUrl = apiChannel.logo?.let { logo ->
                                    buildLogoUrl(logo)
                                }
                                ChannelItem(
                                    id = apiChannel.id,
                                    number = apiChannel.number?.toIntOrNull() ?: 0,
                                    name = apiChannel.name,
                                    url = apiChannel.cmd ?: "",
                                    logo = logoUrl,
                                    epgSlots = emptyList()  // EPG loads separately
                                )
                            }
                        } catch (e: Exception) {
                            Log.e(TAG, "Error loading page $page: ${e.message}")
                            emptyList()
                        }
                    }
                }
                
                // Await all pages
                val allPages = pagesDeferred.awaitAll()
                val newChannels = allPages.flatten()
                
                // Add to all channels list
                allChannels.addAll(newChannels)
                channelAdapter.updateChannels(allChannels.toMutableList())
                
                // Update player with all channels
                liveTVPlayer.setChannels(allChannels.toList())
                liveTVPlayerFullscreen.setChannels(allChannels.toList())
                
                currentPage = toPage
                isLoadingMore = false
                
                if (currentPage >= totalPages) {
                    allChannelsLoaded = true
                }
                
                Log.d(TAG, "Loaded pages $fromPage-$toPage. Total channels: ${allChannels.size}")
                
                // Load EPG for visible channels in background
                loadEpgForVisibleChannels()
            } catch (e: Exception) {
                Log.e(TAG, "Error loading pages in parallel: ${e.message}", e)
                isLoadingMore = false
            }
        }
    }
    
    private fun loadMorePagesIfNeeded() {
        if (isLoadingMore || allChannelsLoaded || currentGenreId == null) return
        
        val nextPage = currentPage + 1
        if (nextPage > totalPages) {
            allChannelsLoaded = true
            return
        }
        
        // Load next 5 pages in parallel
        val pagesToLoad = minOf(5, totalPages - currentPage)
        val toPage = currentPage + pagesToLoad
        
        Log.d(TAG, "Loading more pages: $nextPage to $toPage (total: $totalPages)")
        loadPagesInParallel(currentGenreId!!, nextPage, toPage)
    }
    
    private fun loadNextPageIfNeeded() {
        if (isLoadingMore || allChannelsLoaded || currentGenreId == null) return
        
        val nextPage = currentPage + 1
        if (nextPage > totalPages) {
            allChannelsLoaded = true
            return
        }
        
        val client = stalkerClient ?: return
        
        scope.launch {
            try {
                isLoadingMore = true
                Log.d(TAG, "Loading next page: $nextPage")
                
                val response = withContext(Dispatchers.IO) {
                    client.getChannels(currentGenreId!!, page = nextPage)
                }
                
                val newChannels = response.channels.data.map { apiChannel ->
                    val logoUrl = apiChannel.logo?.let { logo ->
                        buildLogoUrl(logo)
                    }
                    ChannelItem(
                        id = apiChannel.id,
                        number = apiChannel.number?.toIntOrNull() ?: 0,
                        name = apiChannel.name,
                        url = apiChannel.cmd ?: "",
                        logo = logoUrl,
                        epgSlots = emptyList()  // EPG loads separately
                    )
                }
                
                allChannels.addAll(newChannels)
                channelAdapter.updateChannels(allChannels.toMutableList())
                
                currentPage = nextPage
                isLoadingMore = false
                
                if (currentPage >= totalPages) {
                    allChannelsLoaded = true
                }
                
                Log.d(TAG, "Loaded page $nextPage: ${newChannels.size} channels. Total: ${allChannels.size}")
                
                // Load EPG for visible channels
                loadEpgForVisibleChannels()
            } catch (e: Exception) {
                Log.e(TAG, "Error loading page $nextPage: ${e.message}", e)
                isLoadingMore = false
            }
        }
    }
    
    private suspend fun lookupGenreId(categoryName: String): String? {
        return withContext(Dispatchers.IO) {
            try {
                // Use current provider ID (set when category was clicked)
                val providerId = currentProviderId
                if (providerId == null) {
                    Log.e(TAG, "No provider ID set when looking up genre ID")
                    return@withContext null
                }
                val category = categoryDao.getCategoryByNameAndProvider(categoryName, providerId)
                
                // For M3U providers, use category.id (UUID) since channels are linked by categoryId
                // For Stalker providers, use category.externalId (API genre ID)
                val provider = database.providerDao().getProviderById(providerId)
                val genreId = if (provider?.type == "m3u") category?.id else category?.externalId
                
                Log.d(TAG, "lookupGenreId: name=$categoryName, providerId=$providerId, provider type=${provider?.type}, found=$genreId")
                genreId
            } catch (e: Exception) {
                Log.e(TAG, "Error looking up genre ID: ${e.message}", e)
                null
            }
        }
    }
    
    private fun loadDummyChannels() {
        val dummyChannels = generateDummyChannels()
        channelAdapter.updateChannels(dummyChannels)
        setupTimeHeader()
        channelsRecycler.post {
            updatePreview(0)
            val firstRow = channelsRecycler.getChildAt(0)
            firstRow?.findViewById<LinearLayout>(R.id.channel_info)?.requestFocus()
        }
        Log.d(TAG, "Loaded dummy channels as fallback")
    }
    
    fun hide() {
        visibility = GONE
        stopTimeUpdates()
        Log.d(TAG, "Hiding LiveTV channels")
    }
    
    fun setFullscreen(fullscreen: Boolean) {
        // Currently just a flag - layout is controlled by parent
        // Could be used for adjusting padding/margins if needed
        Log.d(TAG, "Fullscreen mode: $fullscreen")
    }
    
    /**
     * Stop preview playback - called when leaving LiveTV section entirely
     */
    fun stopPreview() {
        if (playingChannelPosition >= 0) {
            Log.d(TAG, "Stopping preview playback")
            liveTVPlayer.stopPlayback()
            playingChannelPosition = -1
            channelAdapter.notifyDataSetChanged()
        }
        stopTimeUpdates()
    }
    
    /**
     * Stop all LiveTV playback - both preview and fullscreen
     * Called when app is paused/stopped/destroyed
     */
    fun stopAllPlayback() {
        Log.d(TAG, "Stopping all LiveTV playback (preview + fullscreen)")
        liveTVPlayer.stopPlayback()
        liveTVPlayerFullscreen.stopPlayback()
        stopTimeUpdates()
        if (playingChannelPosition >= 0) {
            playingChannelPosition = -1
            channelAdapter.notifyDataSetChanged()
        }
    }
    
    /**
     * Start real-time updates for EPG cursor and time display
     */
    private fun startTimeUpdates() {
        updateHandler.removeCallbacks(timeUpdateRunnable)
        updateHandler.post(timeUpdateRunnable)
        Log.d(TAG, "Started EPG time updates (every ${UPDATE_INTERVAL_MS/1000}s)")
    }
    
    /**
     * Stop real-time updates
     */
    private fun stopTimeUpdates() {
        updateHandler.removeCallbacks(timeUpdateRunnable)
        Log.d(TAG, "Stopped EPG time updates")
    }
    
    /**
     * Update time cursor and check if EPG needs to slide
     */
    private fun updateTimeDisplay() {
        val now = System.currentTimeMillis()
        val calendar = java.util.Calendar.getInstance()
        calendar.timeInMillis = now
        val currentMinute = calendar.get(java.util.Calendar.MINUTE)
        val currentHour = calendar.get(java.util.Calendar.HOUR_OF_DAY)
        
        Log.d(TAG, "Time update: $currentHour:" + String.format("%02d", currentMinute))
        
        // Check if we need to slide EPG (when we cross into a new 30-min slot)
        val currentSlotMinute = currentHour * 60 + (if (currentMinute >= 30) 30 else 0)
        if (lastEpgUpdateMinute != -1 && currentSlotMinute != lastEpgUpdateMinute) {
            Log.d(TAG, "Crossed into new 30-min slot, refreshing EPG timeline")
            setupTimeHeader() // This will recalculate epgStartTime and rebuild the header
            startTimeUpdates() // Restart updates
        }
        lastEpgUpdateMinute = currentSlotMinute
        
        // Update cursor position
        positionTimeCursor()
        
        // Update current program progress if playing
        if (playingChannelPosition >= 0) {
            updatePreviewProgramInfo(playingChannelPosition)
        }
    }
    
    fun setOnBackPressedListener(callback: (String) -> Unit) {
        onBackPressedCallback = callback
    }
    
    /**
     * Setup time header with current time slots (30-min intervals)
     * Shows times like: 11:00 p.m., 11:30 p.m., 12:00 a.m., etc.
     * Starts from current 30-minute slot based on system time
     */
    private fun setupTimeHeader() {
        timeHeaderContainer.removeAllViews()
        
        // Get current time
        val now = System.currentTimeMillis()
        val calendar = java.util.Calendar.getInstance()
        calendar.timeInMillis = now
        
        val currentHour = calendar.get(java.util.Calendar.HOUR_OF_DAY)
        val currentMinute = calendar.get(java.util.Calendar.MINUTE)
        
        Log.d(TAG, "Current system time: $currentHour:${String.format("%02d", currentMinute)}")
        
        // Round DOWN to current 30-min slot start
        // e.g., 11:51 -> 11:30, 11:15 -> 11:00
        val roundedMinute = if (currentMinute >= 30) 30 else 0
        calendar.set(java.util.Calendar.MINUTE, roundedMinute)
        calendar.set(java.util.Calendar.SECOND, 0)
        calendar.set(java.util.Calendar.MILLISECOND, 0)
        
        epgStartTime = calendar.timeInMillis
        
        Log.d(TAG, "EPG starts at: ${java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault()).format(java.util.Date(epgStartTime))}")
        
        // Generate 8 time slots (4 hours of EPG)
        for (i in 0 until 8) {
            val slotCalendar = java.util.Calendar.getInstance()
            slotCalendar.timeInMillis = epgStartTime
            slotCalendar.add(java.util.Calendar.MINUTE, i * 30)
            
            val hour = slotCalendar.get(java.util.Calendar.HOUR_OF_DAY)
            val minute = slotCalendar.get(java.util.Calendar.MINUTE)
            
            // Format as 12-hour time with AM/PM
            val hour12 = if (hour == 0) 12 else if (hour > 12) hour - 12 else hour
            val amPm = if (hour < 12) "a.m." else "p.m."
            val timeString = String.format("%d:%02d %s", hour12, minute, amPm)
            
            val timeMarker = TextView(context).apply {
                text = timeString
                textSize = 12f
                setTextColor(0xFFFFFFFF.toInt())
                typeface = android.graphics.Typeface.DEFAULT_BOLD
                gravity = android.view.Gravity.START
                
                val widthPx = (SLOT_WIDTH_DP * resources.displayMetrics.density).toInt()
                layoutParams = LinearLayout.LayoutParams(widthPx, LinearLayout.LayoutParams.WRAP_CONTENT)
            }
            timeHeaderContainer.addView(timeMarker)
        }
        
        positionTimeCursor()
        
        // Start real-time updates for cursor position
        startTimeUpdates()
    }
    
    /**
     * Position the red vertical time cursor at current time
     */
    private fun positionTimeCursor() {
        val now = System.currentTimeMillis()
        val minutesSinceEpgStart = ((now - epgStartTime) / 60000).toInt()
        
        // Position cursor: 370dp (channel info + margin) + time offset within EPG
        val channelInfoWidth = 370 // 350dp channel info + 20dp margin
        val positionDp = channelInfoWidth + (minutesSinceEpgStart / 30f * SLOT_WIDTH_DP)
        val positionPx = (positionDp * resources.displayMetrics.density).toInt()
        
        val layoutParams = timeCursor.layoutParams as android.widget.FrameLayout.LayoutParams
        layoutParams.leftMargin = positionPx
        timeCursor.layoutParams = layoutParams
        timeCursor.visibility = View.VISIBLE
        
        val calendar = java.util.Calendar.getInstance()
        Log.d(TAG, "Time cursor at: ${calendar.get(java.util.Calendar.HOUR_OF_DAY)}:${String.format("%02d", calendar.get(java.util.Calendar.MINUTE))}, minutes since EPG start: $minutesSinceEpgStart, position: ${positionPx}px")
    }
    
    private fun onChannelSelected(position: Int) {
        // Guard against empty or invalid position
        if (allChannels.isEmpty() || position < 0 || position >= allChannels.size) {
            Log.w(TAG, "onChannelSelected: Invalid position $position (channels: ${allChannels.size})")
            return
        }
        
        selectedChannelPosition = position
        
        if (playingChannelPosition == position && !isFullscreen) {
            // Channel is playing in preview, go fullscreen
            Log.d(TAG, "Going fullscreen with channel: ${allChannels[position].name}")
            
            // Directly trigger fullscreen mode (don't call liveTVPlayer.goFullscreen as it triggers callback loop)
            handleFullscreenChange(true)
        } else {
            // Play channel in preview
            Log.d(TAG, "Playing channel in preview: ${allChannels[position].name}")
            playingChannelPosition = position
            
            // Update preview name immediately
            updatePreview(position)
            
            // Start playback
            liveTVPlayer.playInPreview(position)
            
            // Update play icons
            channelAdapter.notifyDataSetChanged()
            
            // Keep focus on the channel row after starting playback
            channelsRecycler.post {
                val viewHolder = channelsRecycler.findViewHolderForAdapterPosition(position)
                viewHolder?.itemView?.findViewById<LinearLayout>(R.id.channel_info)?.requestFocus()
            }
        }
    }
    
    private fun handleFullscreenChange(fullscreen: Boolean) {
        isFullscreen = fullscreen
        
        if (fullscreen) {
            // Get current playback position from preview player before switching
            val currentChannel = playingChannelPosition
            
            if (currentChannel >= 0) {
                // Start fullscreen player and set fullscreen state
                liveTVPlayerFullscreen.playInPreview(currentChannel)
                liveTVPlayerFullscreen.goFullscreen() // Set fullscreen state to enable key handling
                
                // Pause preview player to save resources
                liveTVPlayer.pause()
            }
            
            // Show fullscreen container, hide all other UI
            fullscreenPlayerContainer.visibility = VISIBLE
            mainContent.visibility = GONE
            
            // Request focus on the player so it can receive key events
            liveTVPlayerFullscreen.requestFocus()
            
            Log.d(TAG, "Entered fullscreen mode, channel: $currentChannel")
        } else {
            // Exit fullscreen state on player
            liveTVPlayerFullscreen.exitFullscreen()
            
            // Return to preview - resume preview player
            fullscreenPlayerContainer.visibility = GONE
            mainContent.visibility = VISIBLE
            
            // Resume preview player (it was paused during fullscreen)
            liveTVPlayer.resume()
            
            // Stop fullscreen player to save resources
            liveTVPlayerFullscreen.pause()
            
            Log.d(TAG, "Exited fullscreen mode, resumed preview")
        }
    }
    
    private fun handleChannelChange(channelIndex: Int) {
        playingChannelPosition = channelIndex
        selectedChannelPosition = channelIndex
        updatePreview(channelIndex)
        channelAdapter.notifyDataSetChanged() // Update play icons
        
        // Just update the state - preview will be reloaded when exiting fullscreen
        // No need to update preview player here to avoid callback loops
        
        // Scroll to the playing channel
        channelsRecycler.post {
            channelsRecycler.scrollToPosition(channelIndex)
        }
    }
    
    private fun handlePlayerBackPressed() {
        // Return from fullscreen to preview mode
        isFullscreen = false
        
        Log.d(TAG, "Back from fullscreen, channel position: $playingChannelPosition")
        
        // Hide fullscreen container, show main UI with preview
        fullscreenPlayerContainer.visibility = GONE
        mainContent.visibility = VISIBLE
        
        // Make sure preview player is showing the correct channel
        // (it may have been changed while in fullscreen)
        liveTVPlayer.playInPreview(playingChannelPosition)
        
        // Stop fullscreen player
        liveTVPlayerFullscreen.exitFullscreen()
        liveTVPlayerFullscreen.pause()
        
        // Update preview info to show current channel
        updatePreview(playingChannelPosition)
        
        channelsRecycler.post {
            val layoutManager = channelsRecycler.layoutManager as? LinearLayoutManager
            layoutManager?.scrollToPositionWithOffset(playingChannelPosition, 100)
            
            channelsRecycler.postDelayed({
                // Find and focus the channel row
                val viewHolder = channelsRecycler.findViewHolderForAdapterPosition(playingChannelPosition)
                viewHolder?.itemView?.findViewById<LinearLayout>(R.id.channel_info)?.requestFocus()
                Log.d(TAG, "Restored focus to channel $playingChannelPosition, preview reloaded")
            }, 100)
        }
    }
    
    private fun updatePreview(position: Int) {
        if (position < allChannels.size) {
            previewChannelName.text = allChannels[position].name
            selectedChannelPosition = position
            updatePreviewProgramInfo(position)
        }
    }
    
    /**
     * Update the current/next program info display in the preview section
     */
    private fun updatePreviewProgramInfo(position: Int) {
        if (position < 0 || position >= allChannels.size) {
            currentProgramContainer.visibility = View.GONE
            nextProgramContainer.visibility = View.GONE
            return
        }
        
        val channel = allChannels[position]
        val epgSlots = channel.epgSlotsWithTimestamp
        
        if (epgSlots.isEmpty()) {
            Log.d(TAG, "No EPG data for channel: ${channel.name}")
            currentProgramContainer.visibility = View.GONE
            nextProgramContainer.visibility = View.GONE
            return
        }
        
        val now = System.currentTimeMillis() / 1000
        val calendar = java.util.Calendar.getInstance()
        Log.d(TAG, "Current time for EPG lookup: ${calendar.get(java.util.Calendar.HOUR_OF_DAY)}:${String.format("%02d", calendar.get(java.util.Calendar.MINUTE))} (epoch: $now)")
        
        // Log all EPG slots for debugging
        epgSlots.forEachIndexed { index, slot ->
            Log.d(TAG, "EPG[$index]: ${slot.programName} | ${slot.startTime}-${slot.endTime} | start=${slot.startTimestamp} end=${slot.endTimestamp}")
        }
        
        // Find current program (program where now is between start and end)
        val currentProgram = epgSlots.find { it.startTimestamp <= now && it.endTimestamp > now }
        
        if (currentProgram != null) {
            Log.d(TAG, "Found current program: ${currentProgram.programName}")
            currentProgramContainer.visibility = View.VISIBLE
            currentProgramName.text = currentProgram.programName
            
            // Format time range
            val timeFormat = java.text.SimpleDateFormat("h:mm a", java.util.Locale.getDefault())
            val startTimeStr = timeFormat.format(java.util.Date(currentProgram.startTimestamp * 1000))
            val endTimeStr = timeFormat.format(java.util.Date(currentProgram.endTimestamp * 1000))
            currentProgramTime.text = "$startTimeStr - $endTimeStr"
            
            // Calculate progress percentage
            val totalDuration = currentProgram.endTimestamp - currentProgram.startTimestamp
            val elapsed = now - currentProgram.startTimestamp
            val progress = if (totalDuration > 0) {
                ((elapsed.toFloat() / totalDuration) * 100).toInt().coerceIn(0, 100)
            } else 0
            currentProgramProgress.progress = progress
            
            Log.d(TAG, "Current program: ${currentProgram.programName}, progress: $progress%")
        } else {
            Log.d(TAG, "No current program found (now=$now is outside all EPG slot ranges)")
            currentProgramContainer.visibility = View.GONE
        }
        
        // Find next program (first program that starts after now)
        val nextProgram = if (currentProgram != null) {
            // If we have a current program, next is the one after it
            val currentIndex = epgSlots.indexOf(currentProgram)
            if (currentIndex < epgSlots.size - 1) epgSlots[currentIndex + 1] else null
        } else {
            // If no current, next is first program that starts in future
            epgSlots.find { it.startTimestamp > now }
        }
        
        if (nextProgram != null) {
            nextProgramContainer.visibility = View.VISIBLE
            nextProgramName.text = nextProgram.programName
            
            // Format time range
            val timeFormat = java.text.SimpleDateFormat("h:mm a", java.util.Locale.getDefault())
            val startTimeStr = timeFormat.format(java.util.Date(nextProgram.startTimestamp * 1000))
            val endTimeStr = timeFormat.format(java.util.Date(nextProgram.endTimestamp * 1000))
            nextProgramTime.text = "$startTimeStr - $endTimeStr"
            Log.d(TAG, "Next program: ${nextProgram.programName}")
        } else {
            nextProgramContainer.visibility = View.GONE
        }
    }
    
    private fun generateDummyChannels(): List<ChannelItem> {
        val channels = mutableListOf<ChannelItem>()
        for (i in 1..10) {
            channels.add(ChannelItem("$i", i, "Channel $i", "https://dummy.url/$i", null, emptyList()))
        }
        return channels
    }
    
    /**
     * Load EPG for visible channels in the RecyclerView
     * Uses parallel processing for speed
     */
    private fun loadEpgForVisibleChannels() {
        val layoutManager = channelsRecycler.layoutManager as? LinearLayoutManager ?: return
        val firstVisible = layoutManager.findFirstVisibleItemPosition()
        val lastVisible = layoutManager.findLastVisibleItemPosition()
        
        if (firstVisible == RecyclerView.NO_POSITION) return
        
        // Load EPG for visible channels + some buffer
        val start = maxOf(0, firstVisible - 5)
        val end = minOf(allChannels.size - 1, lastVisible + 10)
        
        val channelsToLoad = (start..end)
            .mapNotNull { pos -> allChannels.getOrNull(pos) }
            .filter { channel -> 
                // Skip if already cached or currently loading
                !epgCache.containsKey(channel.id) && !epgLoadingSet.contains(channel.id)
            }
            .take(10) // Limit batch size
        
        if (channelsToLoad.isEmpty()) return
        
        Log.d(TAG, "Loading EPG for ${channelsToLoad.size} channels")
        
        // Mark as loading
        channelsToLoad.forEach { epgLoadingSet.add(it.id) }
        
        val client = stalkerClient ?: return
        
        scope.launch {
            // Load EPG for multiple channels in parallel
            val epgDeferred = channelsToLoad.map { channel ->
                async(Dispatchers.IO) {
                    try {
                        val epgResponse = client.getShortEpg(channel.id)
                        channel.id to convertEpgPrograms(epgResponse.programs)
                    } catch (e: Exception) {
                        Log.e(TAG, "Error loading EPG for ${channel.name}: ${e.message}")
                        channel.id to emptyList<EpgSlotWithTimestamp>()
                    }
                }
            }
            
            // Await all EPG results
            val results = epgDeferred.awaitAll()
            
            // Update cache and channels
            results.forEach { (channelId, epgSlots) ->
                epgCache[channelId] = epgSlots
                epgLoadingSet.remove(channelId)
                
                // Update channel in list if EPG was loaded
                if (epgSlots.isNotEmpty()) {
                    allChannels.find { it.id == channelId }?.let { channel ->
                        channel.epgSlotsWithTimestamp = epgSlots
                        // Also update legacy epgSlots for adapter
                        channel.epgSlots = epgSlots.map { 
                            EpgSlot(it.startTime, it.endTime, it.programName, it.durationMinutes) 
                        }
                    }
                }
            }
            
            // Notify adapter of changes for visible items only
            channelAdapter.notifyItemRangeChanged(start, end - start + 1)
            
            // Update preview info if playing channel got EPG data
            if (playingChannelPosition >= 0 && playingChannelPosition < allChannels.size) {
                val playingChannel = allChannels[playingChannelPosition]
                if (results.any { it.first == playingChannel.id && it.second.isNotEmpty() }) {
                    updatePreviewProgramInfo(playingChannelPosition)
                }
            }
            
            Log.d(TAG, "EPG loaded for ${results.count { it.second.isNotEmpty() }} channels")
        }
    }
    
    /**
     * Convert EPG programs from API to EpgSlot format
     */
    private fun convertEpgPrograms(programs: List<com.ronika.iptvnative.models.EpgProgram>): List<EpgSlotWithTimestamp> {
        if (programs.isEmpty()) return emptyList()
        
        val now = System.currentTimeMillis() / 1000
        
        return programs
            .filter { it.endTimestamp > now } // Only future/current programs
            .take(8) // Limit to 8 slots for UI
            .map { program ->
                val startTime = java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault())
                    .format(java.util.Date(program.startTimestamp * 1000))
                val endTime = java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault())
                    .format(java.util.Date(program.endTimestamp * 1000))
                val durationMinutes = ((program.endTimestamp - program.startTimestamp) / 60).toInt()
                
                EpgSlotWithTimestamp(
                    startTime = startTime,
                    endTime = endTime,
                    programName = program.name.ifBlank { "No information" },
                    durationMinutes = durationMinutes,
                    startTimestamp = program.startTimestamp,
                    endTimestamp = program.endTimestamp
                )
            }
    }
    
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN && event.keyCode == KeyEvent.KEYCODE_BACK) {
            // If in fullscreen, let the player handle it (will exit to preview)
            if (isFullscreen) {
                // Player's onKeyDown will handle this and call handlePlayerBackPressed
                return super.dispatchKeyEvent(event)
            }
            
            // When going back to category sidebar from channel list, KEEP preview playing
            // Don't stop playback - user is still in LiveTV section, just minimized
            Log.d(TAG, "Back pressed from channel list - returning to category nav, keeping preview")
            
            onBackPressedCallback?.invoke(categoryName)
            return true
        }
        return super.dispatchKeyEvent(event)
    }
    
    // Data classes
    data class ChannelItem(
        val id: String,  // Channel ID for EPG lookup
        val number: Int,
        val name: String,
        val url: String,
        val logo: String? = null,
        var epgSlots: List<EpgSlot> = emptyList(),  // Now mutable, starts empty
        var epgSlotsWithTimestamp: List<EpgSlotWithTimestamp> = emptyList()  // For progress calculation
    )
    
    data class EpgSlot(
        val startTime: String,
        val endTime: String,
        val programName: String,
        val durationMinutes: Int = 30
    )
    
    data class EpgSlotWithTimestamp(
        val startTime: String,
        val endTime: String,
        val programName: String,
        val durationMinutes: Int = 30,
        val startTimestamp: Long = 0,  // Unix timestamp in seconds
        val endTimestamp: Long = 0     // Unix timestamp in seconds
    )
    
    // Adapter
    inner class ChannelAdapter(
        private var channels: List<ChannelItem>,
        private val onChannelClick: (Int) -> Unit
    ) : RecyclerView.Adapter<ChannelAdapter.ChannelViewHolder>() {
        
        fun updateChannels(newChannels: List<ChannelItem>) {
            val oldSize = channels.size
            channels = newChannels
            if (oldSize == 0) {
                notifyDataSetChanged()
            } else if (newChannels.size > oldSize) {
                notifyItemRangeInserted(oldSize, newChannels.size - oldSize)
            }
        }
        
        fun getChannels() = channels
        
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
            private val playIcon: ImageView = itemView.findViewById(R.id.play_icon)
            private val channelNumber: TextView = itemView.findViewById(R.id.channel_number)
            private val channelLogo: ImageView = itemView.findViewById(R.id.channel_logo)
            private val channelName: TextView = itemView.findViewById(R.id.channel_name)
            private val channelInfo: LinearLayout = itemView.findViewById(R.id.channel_info)
            private val epgContainer: LinearLayout = itemView.findViewById(R.id.epg_container)
            private val epgScrollView: android.widget.HorizontalScrollView = itemView.findViewById(R.id.epg_scroll_view)
            
            init {
                itemView.isFocusable = false
                itemView.isFocusableInTouchMode = false
                
                channelInfo.setOnClickListener {
                    val pos = bindingAdapterPosition
                    if (pos != RecyclerView.NO_POSITION) {
                        onChannelClick(pos)
                    }
                }
                
                channelInfo.setOnFocusChangeListener { _, hasFocus ->
                    if (hasFocus) {
                        channelInfo.setBackgroundResource(R.drawable.channel_row_focused)
                        channelNumber.setTextColor(0xFF000000.toInt())
                        channelName.setTextColor(0xFF000000.toInt())
                        
                        // Scroll to keep focused item consistently positioned
                        val pos = bindingAdapterPosition
                        if (pos != RecyclerView.NO_POSITION) {
                            val layoutManager = channelsRecycler.layoutManager as? LinearLayoutManager
                            layoutManager?.scrollToPositionWithOffset(pos, 100)
                        }
                    } else {
                        channelInfo.setBackgroundResource(R.drawable.channel_row_normal)
                        channelNumber.setTextColor(0xFFFFFFFF.toInt())
                        channelName.setTextColor(0xFFFFFFFF.toInt())
                    }
                }
                
                channelInfo.setOnKeyListener { view, keyCode, event ->
                    if (event.action == KeyEvent.ACTION_DOWN) {
                        val pos = bindingAdapterPosition
                        when (keyCode) {
                            KeyEvent.KEYCODE_DPAD_UP -> {
                                if (pos == 0) {
                                    return@setOnKeyListener true
                                }
                                // Manually move focus to previous item
                                val targetPos = pos - 1
                                channelsRecycler.post {
                                    val targetView = channelsRecycler.findViewHolderForAdapterPosition(targetPos)?.itemView
                                    targetView?.findViewById<LinearLayout>(R.id.channel_info)?.requestFocus()
                                }
                                return@setOnKeyListener true
                            }
                            KeyEvent.KEYCODE_DPAD_DOWN -> {
                                if (pos == channels.size - 1) {
                                    return@setOnKeyListener true
                                }
                                // Manually move focus to next item
                                val targetPos = pos + 1
                                channelsRecycler.post {
                                    val targetView = channelsRecycler.findViewHolderForAdapterPosition(targetPos)?.itemView
                                    targetView?.findViewById<LinearLayout>(R.id.channel_info)?.requestFocus()
                                }
                                return@setOnKeyListener true
                            }
                            KeyEvent.KEYCODE_DPAD_RIGHT -> {
                                // Focus first EPG slot if available
                                if (epgContainer.childCount > 0) {
                                    val firstSlot = epgContainer.getChildAt(0)
                                    if (firstSlot.isFocusable) {
                                        firstSlot.requestFocus()
                                        return@setOnKeyListener true
                                    }
                                }
                            }
                        }
                    }
                    false
                }
                
                epgScrollView.setOnScrollChangeListener { _, scrollX, _, _, _ ->
                    timeHeaderScroll.scrollTo(scrollX, 0)
                }
            }
            
            private fun setupEpgSlotFocus(slotView: LinearLayout, slotIndex: Int) {
                slotView.isFocusable = true
                slotView.isFocusableInTouchMode = true
                
                slotView.setOnFocusChangeListener { view, hasFocus ->
                    if (hasFocus) {
                        view.setBackgroundResource(R.drawable.epg_slot_focused)
                        // Scroll to show this slot
                        epgScrollView.post {
                            val scrollX = view.left - 50
                            epgScrollView.smoothScrollTo(scrollX.coerceAtLeast(0), 0)
                        }
                    } else {
                        view.setBackgroundResource(R.drawable.epg_slot_border)
                    }
                }
                
                slotView.setOnKeyListener { view, keyCode, event ->
                    if (event.action == KeyEvent.ACTION_DOWN) {
                        when (keyCode) {
                            KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN -> {
                                // Go back to channel info for up/down
                                channelInfo.requestFocus()
                                return@setOnKeyListener true
                            }
                            KeyEvent.KEYCODE_DPAD_LEFT -> {
                                if (slotIndex > 0) {
                                    // Focus previous slot
                                    epgContainer.getChildAt(slotIndex - 1)?.requestFocus()
                                } else {
                                    // At first slot, go back to channel info
                                    channelInfo.requestFocus()
                                }
                                return@setOnKeyListener true
                            }
                            KeyEvent.KEYCODE_DPAD_RIGHT -> {
                                if (slotIndex < epgContainer.childCount - 1) {
                                    // Focus next slot
                                    epgContainer.getChildAt(slotIndex + 1)?.requestFocus()
                                }
                                return@setOnKeyListener true
                            }
                        }
                    }
                    false
                }
            }
            
            fun bind(channel: ChannelItem) {
                val position = bindingAdapterPosition
                
                channelNumber.text = channel.number.toString()
                channelName.text = channel.name
                
                // Show play icon if this channel is playing
                playIcon.visibility = if (position == playingChannelPosition) View.VISIBLE else View.GONE
                
                // Load channel logo with Coil
                if (!channel.logo.isNullOrEmpty()) {
                    channelLogo.load(channel.logo) {
                        crossfade(true)
                        placeholder(R.drawable.ic_tv_placeholder)
                        error(R.drawable.ic_tv_placeholder)
                        memoryCachePolicy(CachePolicy.ENABLED)
                        diskCachePolicy(CachePolicy.ENABLED)
                    }
                } else {
                    channelLogo.setImageResource(R.drawable.ic_tv_placeholder)
                }
                
                epgContainer.removeAllViews()
                
                // If no EPG, show "No information" placeholder
                if (channel.epgSlots.isEmpty()) {
                    val placeholderSlot = TextView(itemView.context).apply {
                        text = "No information"
                        textSize = 11f
                        setTextColor(0x80FFFFFF.toInt())
                        gravity = android.view.Gravity.CENTER_VERTICAL
                        setPadding(16, 0, 16, 0)
                        layoutParams = LinearLayout.LayoutParams(
                            LinearLayout.LayoutParams.WRAP_CONTENT,
                            LinearLayout.LayoutParams.MATCH_PARENT
                        )
                    }
                    epgContainer.addView(placeholderSlot)
                } else {
                    channel.epgSlots.forEachIndexed { index, slot ->
                        // Calculate width based on duration (30 min = 1 slot width)
                        val widthDp = (slot.durationMinutes / 30f * SLOT_WIDTH_DP).toInt()
                        val widthPx = (widthDp * itemView.context.resources.displayMetrics.density).toInt()
                        
                        val slotView = LinearLayout(itemView.context).apply {
                            orientation = LinearLayout.VERTICAL
                            gravity = android.view.Gravity.CENTER_VERTICAL
                            layoutParams = LinearLayout.LayoutParams(widthPx, LinearLayout.LayoutParams.MATCH_PARENT).apply {
                                marginEnd = 0 // No gap between slots
                            }
                            setPadding(12, 4, 12, 4)
                            // Light grey border, rounded corners
                            setBackgroundResource(R.drawable.epg_slot_border)
                        }
                        
                        // Time label
                        val timeText = TextView(itemView.context).apply {
                            text = slot.startTime
                            textSize = 10f
                            setTextColor(0xAAFFFFFF.toInt())
                            maxLines = 1
                        }
                        slotView.addView(timeText)
                        
                        // Program name
                        val programText = TextView(itemView.context).apply {
                            text = slot.programName
                            textSize = 12f
                            setTextColor(0xFFFFFFFF.toInt())
                            maxLines = 1
                            ellipsize = android.text.TextUtils.TruncateAt.END
                        }
                        slotView.addView(programText)
                        
                        // Setup focusable EPG slot with navigation
                        setupEpgSlotFocus(slotView, index)
                        
                        epgContainer.addView(slotView)
                    }
                }
            }
        }
    }
}
