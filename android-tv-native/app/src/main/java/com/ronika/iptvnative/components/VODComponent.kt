package com.ronika.iptvnative.components

import android.content.Context
import android.graphics.drawable.ColorDrawable
import android.util.AttributeSet
import android.util.Log
import android.view.KeyEvent
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.TextView
import android.widget.ImageView
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import coil.load
import coil.transform.RoundedCornersTransformation
import com.ronika.iptvnative.R
import com.ronika.iptvnative.api.StalkerClient
import com.ronika.iptvnative.database.AppDatabase
import com.ronika.iptvnative.repository.FavoriteRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

// Custom RecyclerView that intercepts navigation keys before default handling
class CustomGridRecyclerView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : RecyclerView(context, attrs, defStyleAttr) {
    
    var customKeyHandler: ((Int, KeyEvent) -> Boolean)? = null
    
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        // Intercept DPAD keys BEFORE RecyclerView processes them
        if (event.action == KeyEvent.ACTION_DOWN) {
            when (event.keyCode) {
                KeyEvent.KEYCODE_DPAD_UP,
                KeyEvent.KEYCODE_DPAD_DOWN,
                KeyEvent.KEYCODE_DPAD_LEFT,
                KeyEvent.KEYCODE_DPAD_RIGHT -> {
                    customKeyHandler?.let { handler ->
                        if (handler(event.keyCode, event)) {
                            return true // Event consumed
                        }
                    }
                }
            }
        }
        return super.dispatchKeyEvent(event)
    }
}

/**
 * VODComponent - Netflix-style grid for Movies and Series
 * Shows large backdrop image at top with thumbnail grid below
 */
class VODComponent @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : FrameLayout(context, attrs, defStyleAttr) {

    private val TAG = "VODComponent"
    
    // Views
    private lateinit var backdropImage: ImageView
    private lateinit var titleText: TextView
    private lateinit var yearText: TextView
    private lateinit var descriptionText: TextView
    private lateinit var thumbnailsRecycler: CustomGridRecyclerView
    private lateinit var categoryNameLabel: TextView
    private lateinit var gridLayoutManager: GridLayoutManager
    private var itemDecoration: RecyclerView.ItemDecoration? = null
    
    // State
    private var categoryName: String = ""
    private var vodType: VODType = VODType.MOVIES
    private var selectedPosition: Int = 0
    private var currentGenreId: String? = null
    private var onBackPressedCallback: ((String) -> Unit)? = null
    private var onPlayMovieCallback: ((VODItem) -> Unit)? = null
    private var onSeriesSelectedCallback: ((VODItem) -> Unit)? = null
    private var isDetailScreenVisible = false
    private var isFullscreenMode = false
    
    // Data
    private val allItems = mutableListOf<VODItem>()
    
    // Pagination
    private var currentPage = 1
    private var totalPages = 1
    private var isLoadingMore = false
    private var loadedPages = mutableSetOf<Int>()
    private lateinit var thumbnailAdapter: ThumbnailAdapter
    
    // API client - initialized lazily with provider credentials
    private var stalkerClient: StalkerClient? = null
    private var portalBaseUrl: String = ""
    
    // Database
    private val database = AppDatabase.getDatabase(context)
    private val providerDao = database.providerDao()
    private val categoryDao = database.categoryDao()
    
    private val scope = CoroutineScope(Dispatchers.Main)
    
    enum class VODType {
        MOVIES, SERIES
    }
    
    data class VODItem(
        val id: String,
        val name: String,
        val year: String?,
        val description: String?,
        val posterUrl: String?,
        val backdropUrl: String?,
        val cmd: String?,
        val director: String?,
        val actors: String?,
        val isSeries: Boolean = false
    )
    
    init {
        LayoutInflater.from(context).inflate(R.layout.component_vod, this, true)
        setupViews()
        initializeClient()
    }
    
    /**
     * Initialize or reinitialize the Stalker client with credentials from active provider
     */
    private fun initializeClient() {
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
            portalBaseUrl = provider.serverUrl.removeSuffix("/")
            stalkerClient = StalkerClient(
                portalUrl = provider.serverUrl,
                macAddress = provider.macAddress ?: "",
                token = provider.token ?: "",
                serialNumber = provider.serialNumber ?: ""
            )
            Log.d(TAG, "VODComponent: Initialized StalkerClient with provider: ${provider.name}")
        } else {
            Log.e(TAG, "VODComponent: Provider not found: $providerId")
        }
    }
    
    /**
     * Public method to reinitialize client - call before showing category from different provider
     */
    fun reinitializeClient() {
        scope.launch {
            reinitializeClientSync()
        }
    }
    
    /**
     * Synchronously reinitialize client - can be awaited from coroutine
     */
    suspend fun reinitializeClientSync() {
        val provider = withContext(Dispatchers.IO) {
            providerDao.getActiveProvider()
        }
        if (provider != null) {
            portalBaseUrl = provider.serverUrl.removeSuffix("/")
            stalkerClient = StalkerClient(
                portalUrl = provider.serverUrl,
                macAddress = provider.macAddress ?: "",
                token = provider.token ?: "",
                serialNumber = provider.serialNumber ?: ""
            )
            Log.d(TAG, "VODComponent: Initialized StalkerClient with provider: ${provider.name}")
        } else {
            Log.e(TAG, "VODComponent: No active provider found!")
        }
    }
    
    /**
     * Get the current StalkerClient for use by external callers (e.g., MainActivity for playback)
     * This ensures the same provider is used for both loading content and playing
     */
    fun getStalkerClient(): StalkerClient? = stalkerClient
    
    /**
     * Get the current provider ID
     */
    fun getCurrentProviderId(): String? = currentProviderId
    
    /**
     * Get the portal base URL for building image URLs
     */
    fun getPortalBaseUrl(): String = portalBaseUrl
    
    /**
     * Build full image URL from relative path using provider's base URL
     */
    private fun buildImageUrl(relativePath: String?): String? {
        if (relativePath == null) return null
        return if (relativePath.startsWith("http")) relativePath else "$portalBaseUrl$relativePath"
    }
    
    private lateinit var loadingIndicator: android.widget.ProgressBar
    private var pendingFocusRunnable: Runnable? = null
    
    // Detail screen views
    private lateinit var vodGridContainer: ViewGroup
    private lateinit var vodDetailContainer: ViewGroup
    private lateinit var detailCategoryName: TextView
    private lateinit var detailTitle: TextView
    private lateinit var detailYear: TextView
    private lateinit var detailDescription: TextView
    private lateinit var detailCast: TextView
    private lateinit var detailPosterImage: ImageView
    private lateinit var detailPlayButton: android.widget.Button
    private lateinit var detailFavoriteButton: android.widget.Button
    private var currentDetailItem: VODItem? = null
    private var currentItemFavorited = false
    private val favoriteRepository = FavoriteRepository(context)
    
    private fun setupViews() {
        backdropImage = findViewById(R.id.backdrop_image)
        titleText = findViewById(R.id.title_text)
        yearText = findViewById(R.id.year_text)
        descriptionText = findViewById(R.id.description_text)
        thumbnailsRecycler = findViewById(R.id.thumbnails_recycler)
        categoryNameLabel = findViewById(R.id.category_name_label)
        loadingIndicator = findViewById(R.id.loading_indicator)
        
        // Detail screen views
        vodGridContainer = findViewById(R.id.vod_grid_container)
        vodDetailContainer = findViewById(R.id.vod_detail_container)
        detailCategoryName = findViewById(R.id.detail_category_name)
        detailTitle = findViewById(R.id.detail_title)
        detailYear = findViewById(R.id.detail_year)
        detailDescription = findViewById(R.id.detail_description)
        detailCast = findViewById(R.id.detail_cast)
        detailPosterImage = findViewById(R.id.detail_poster_image)
        detailPlayButton = findViewById(R.id.detail_play_button)
        detailFavoriteButton = findViewById(R.id.detail_favorite_button)
        
        setupDetailScreenListeners()
        
        // Setup grid with calculated columns based on item size
        thumbnailAdapter = ThumbnailAdapter(emptyList()) { position ->
            onItemSelected(position)
        }
        
        // Calculate column count based on fixed item width + spacing
        // Item width: 140dp + 6dp padding = 146dp per item
        // Fullscreen: 15dp spacing (7.5dp each side = 30dp total between items)
        // Small screen: 10dp spacing (5dp each side = 20dp total between items)
        val displayMetrics = context.resources.displayMetrics
        val itemWidthDp = 146 // 140dp thumbnail + 6dp padding
        val spacingDp = 15    // Fullscreen spacing (will adjust dynamically)
        val itemWidthPx = (itemWidthDp * displayMetrics.density).toInt()
        val spacingPx = (spacingDp * displayMetrics.density).toInt()
        val totalItemWidth = itemWidthPx + (spacingPx * 2) // spacing on both sides
        
        // Calculate columns based on screen width
        val screenWidthPx = displayMetrics.widthPixels
        val columnCount = (screenWidthPx / totalItemWidth).coerceAtLeast(2)
        
        Log.d(TAG, "Grid setup: screen=${screenWidthPx}px, itemWidth=${itemWidthPx}px, spacing=${spacingPx}px, columns=$columnCount")
        
        gridLayoutManager = GridLayoutManager(context, columnCount)
        
        // Set custom key handler for navigation
        thumbnailsRecycler.customKeyHandler = { keyCode, event ->
            val currentView = thumbnailsRecycler.focusedChild
            if (currentView != null) {
                val currentPosition = thumbnailsRecycler.getChildAdapterPosition(currentView)
                if (currentPosition != RecyclerView.NO_POSITION) {
                    val spanCount = columnCount
                    val totalItems = thumbnailAdapter.itemCount
                    
                    val nextPosition = when (keyCode) {
                        android.view.KeyEvent.KEYCODE_DPAD_DOWN -> {
                            (currentPosition + spanCount).coerceAtMost(totalItems - 1)
                        }
                        android.view.KeyEvent.KEYCODE_DPAD_UP -> {
                            (currentPosition - spanCount).coerceAtLeast(0)
                        }
                        android.view.KeyEvent.KEYCODE_DPAD_RIGHT -> {
                            (currentPosition + 1).coerceAtMost(totalItems - 1)
                        }
                        android.view.KeyEvent.KEYCODE_DPAD_LEFT -> {
                            (currentPosition - 1).coerceAtLeast(0)
                        }
                        else -> currentPosition
                    }
                    
                    if (nextPosition != currentPosition) {
                        Log.d(TAG, "🔍 Moving focus from $currentPosition to $nextPosition")
                        thumbnailsRecycler.scrollToPosition(nextPosition)
                        thumbnailsRecycler.post {
                            gridLayoutManager.findViewByPosition(nextPosition)?.requestFocus()
                            Log.d(TAG, "✅ Focused position $nextPosition")
                        }
                        true // Consume the event
                    } else {
                        false
                    }
                } else {
                    false
                }
            } else {
                false
            }
        }
        
        thumbnailsRecycler.apply {
            layoutManager = gridLayoutManager
            adapter = thumbnailAdapter
            setHasFixedSize(true)
            setItemViewCacheSize(50)
            itemAnimator = null
            
            // Disable automatic focus search on all children
            addOnChildAttachStateChangeListener(object : RecyclerView.OnChildAttachStateChangeListener {
                override fun onChildViewAttachedToWindow(view: View) {
                    view.nextFocusUpId = View.NO_ID
                    view.nextFocusDownId = View.NO_ID
                    view.nextFocusLeftId = View.NO_ID
                    view.nextFocusRightId = View.NO_ID
                }
                override fun onChildViewDetachedFromWindow(view: View) {}
            })
            
            // Add spacing between items (15dp for fullscreen, will adjust for small screen)
            val spacingDp = 15  // Fullscreen spacing
            val spacingPx = (spacingDp * displayMetrics.density).toInt()
            itemDecoration = object : RecyclerView.ItemDecoration() {
                override fun getItemOffsets(outRect: android.graphics.Rect, view: View, parent: RecyclerView, state: RecyclerView.State) {
                    outRect.left = spacingPx
                    outRect.right = spacingPx
                    outRect.top = spacingPx
                    outRect.bottom = spacingPx
                }
            }
            addItemDecoration(itemDecoration!!)
            
            // Add scroll listener for smart pre-loading
            addOnScrollListener(object : RecyclerView.OnScrollListener() {
                override fun onScrolled(recyclerView: RecyclerView, dx: Int, dy: Int) {
                    super.onScrolled(recyclerView, dx, dy)
                    
                    val lastVisiblePosition = gridLayoutManager.findLastVisibleItemPosition()
                    val totalItemCount = gridLayoutManager.itemCount
                    
                    // Pre-load when user is 2 pages away from the end
                    val itemsPerPage = 14
                    val currentViewingPage = (lastVisiblePosition / itemsPerPage) + 1
                    
                    // Load next 5 pages in parallel when on page 2
                    if (currentViewingPage >= 2 && !isLoadingMore) {
                        loadNextBatch(currentViewingPage)
                    }
                }
            })
        }
    }
    
    fun showCategory(categoryName: String, vodType: VODType, providerId: String? = null) {
        this.categoryName = categoryName
        this.vodType = vodType
        // Store the provider ID for later use
        if (providerId != null) {
            this.currentProviderId = providerId
        }
        categoryNameLabel.text = categoryName
        visibility = VISIBLE
        
        Log.d(TAG, "Showing $vodType category: $categoryName")
        
        // Reset state
        selectedPosition = 0
        currentPage = 1
        totalPages = 1
        isLoadingMore = false
        loadedPages.clear()
        allItems.clear()
        currentGenreId = null
        
        // Make sure detail screen is hidden and grid is ready to show
        isDetailScreenVisible = false
        vodDetailContainer.visibility = GONE
        vodGridContainer.visibility = VISIBLE
        vodGridContainer.alpha = 1f
        
        // Reset container focusability for normal grid operation
        vodGridContainer.isFocusable = false
        vodGridContainer.isFocusableInTouchMode = false
        
        // Load content
        loadContent()
    }
    
    // Show custom items (e.g. Continue Watching)
    fun showItems(items: List<VODItem>, categoryName: String, vodType: VODType) {
        this.categoryName = categoryName
        this.vodType = vodType
        categoryNameLabel.text = categoryName
        visibility = VISIBLE
        
        Log.d(TAG, "Showing $vodType custom items: $categoryName (${items.size} items)")
        
        // Reset state
        selectedPosition = 0
        currentPage = 1
        totalPages = 1
        isLoadingMore = false
        loadedPages.clear()
        allItems.clear()
        currentGenreId = null
        
        // Make sure detail screen is hidden and grid is ready to show
        isDetailScreenVisible = false
        vodDetailContainer.visibility = GONE
        vodGridContainer.visibility = VISIBLE
        vodGridContainer.alpha = 1f
        
        if (items.isEmpty()) {
            // Show empty state message
            titleText.text = "No Content"
            descriptionText.text = "Nothing in Continue Watching yet. Start watching movies or series to see them here."
            thumbnailsRecycler.visibility = GONE
            
            // Make the container focusable so back button works in empty state
            vodGridContainer.isFocusable = true
            vodGridContainer.isFocusableInTouchMode = true
            vodGridContainer.requestFocus()
        } else {
            // Reset container focusability for normal grid operation
            vodGridContainer.isFocusable = false
            vodGridContainer.isFocusableInTouchMode = false
            
            // Set items directly without loading from API
            allItems.addAll(items)
            thumbnailAdapter.updateItems(allItems)
            thumbnailsRecycler.visibility = VISIBLE
            
            thumbnailsRecycler.post {
                thumbnailsRecycler.scrollToPosition(0)
                thumbnailsRecycler.getChildAt(0)?.requestFocus()
            }
        }
    }
    
    private fun loadContent() {
        loadingIndicator.visibility = VISIBLE
        thumbnailsRecycler.visibility = VISIBLE // Make sure recycler is visible
        scope.launch {
            try {
                // Look up genre ID from category name
                val genreId = lookupGenreId(categoryName, vodType)
                
                if (genreId != null) {
                    currentGenreId = genreId
                    Log.d(TAG, "Loading $vodType for category: $categoryName, genreId: $genreId")
                    
                    // Load first 5 pages in parallel
                    loadPagesInParallel(1, 5)
                } else {
                    Log.e(TAG, "Could not find genre ID for category: $categoryName")
                    loadingIndicator.visibility = GONE
                    thumbnailsRecycler.visibility = GONE
                    // Show error message to user
                    withContext(Dispatchers.Main) {
                        titleText.text = "No Content Available"
                        descriptionText.text = "This category doesn't have any content available."
                    }
                }
                
            } catch (e: Exception) {
                Log.e(TAG, "Error loading content: ${e.message}", e)
                loadingIndicator.visibility = GONE
                thumbnailsRecycler.visibility = GONE
                // Show error message to user
                withContext(Dispatchers.Main) {
                    titleText.text = "Error Loading Content"
                    descriptionText.text = "Failed to load content. Please try again."
                }
            }
        }
    }
    
    private suspend fun lookupGenreId(categoryName: String, vodType: VODType): String? {
        return withContext(Dispatchers.IO) {
            try {
                // Use current provider ID (set when category was clicked)
                val providerId = currentProviderId
                if (providerId == null) {
                    Log.e(TAG, "No provider ID set when looking up genre ID")
                    return@withContext null
                }
                val category = categoryDao.getCategoryByNameAndProvider(categoryName, providerId)
                Log.d(TAG, "lookupGenreId: name=$categoryName, providerId=$providerId, found=${category?.externalId}")
                category?.externalId
            } catch (e: Exception) {
                Log.e(TAG, "Error looking up genre ID: ${e.message}", e)
                null
            }
        }
    }
    
    private fun loadPagesInParallel(startPage: Int, count: Int) {
        val pagesToLoad = (startPage until startPage + count)
            .filter { it <= totalPages || totalPages == 1 }
            .filter { !loadedPages.contains(it) }
        
        if (pagesToLoad.isEmpty()) return
        
        val client = stalkerClient ?: return
        
        isLoadingMore = true
        Log.d(TAG, "Loading pages in parallel: $pagesToLoad")
        
        scope.launch {
            try {
                val deferredResults = pagesToLoad.map { page ->
                    scope.async(Dispatchers.IO) {
                        try {
                            // Both movies and series use 'vod' type
                            val response = client.getVodItems(currentGenreId!!, page, "vod")
                            
                            // Update total pages from first response
                            if (page == startPage && totalPages == 1) {
                                val maxPageItems = 14
                                val totalItems = response.items.totalItems?.toIntOrNull() ?: response.items.total
                                totalPages = if (totalItems > 0) {
                                    (totalItems + maxPageItems - 1) / maxPageItems
                                } else 1
                                Log.d(TAG, "Total items: $totalItems, Total pages: $totalPages")
                            }
                            
                            page to response.items.data.map { apiItem ->
                                val relativeImageUrl = apiItem.getImageUrl() ?: ""
                                val fullImageUrl = if (relativeImageUrl.isNotEmpty() && relativeImageUrl.startsWith("/")) {
                                    "$portalBaseUrl$relativeImageUrl"
                                } else {
                                    relativeImageUrl
                                }
                                Log.d(TAG, "Movie: ${apiItem.name}, Full ImageURL: $fullImageUrl")
                                VODItem(
                                    id = apiItem.id,
                                    name = apiItem.name,
                                    year = apiItem.year ?: "",
                                    description = apiItem.description ?: "",
                                    posterUrl = fullImageUrl,
                                    backdropUrl = fullImageUrl,
                                    cmd = apiItem.cmd ?: "",
                                    director = apiItem.director,
                                    actors = apiItem.actors
                                )
                            }
                        } catch (e: Exception) {
                            Log.e(TAG, "Error loading page $page: ${e.message}", e)
                            page to emptyList<VODItem>()
                        }
                    }
                }
                
                val results = deferredResults.awaitAll()
                
                results.forEach { (page, items) ->
                    if (items.isNotEmpty()) {
                        allItems.addAll(items)
                        loadedPages.add(page)
                    }
                }
                
                // Sort by page order
                thumbnailAdapter.updateItems(allItems)
                
                // Show first item details
                if (allItems.isNotEmpty() && selectedPosition == 0) {
                    updateBackdrop(allItems[0])
                }
                
                // Hide loading indicator
                loadingIndicator.visibility = GONE
                
                // Focus first item
                thumbnailsRecycler.post {
                    thumbnailsRecycler.postDelayed({
                        thumbnailsRecycler.getChildAt(0)?.requestFocus()
                    }, 150)
                }
                
                isLoadingMore = false
                Log.d(TAG, "Loaded ${allItems.size} items across ${loadedPages.size} pages")
                
            } catch (e: Exception) {
                Log.e(TAG, "Error in parallel loading: ${e.message}", e)
                isLoadingMore = false
            }
        }
    }
    
    private fun loadNextBatch(currentViewingPage: Int) {
        if (isLoadingMore || currentGenreId == null) return
        
        // Calculate next batch to load
        val nextBatchStart = currentViewingPage + 3
        val nextBatchEnd = nextBatchStart + 5
        
        val pagesToLoad = (nextBatchStart..nextBatchEnd).filter { it <= totalPages && !loadedPages.contains(it) }
        
        if (pagesToLoad.isNotEmpty()) {
            Log.d(TAG, "Pre-loading next batch: $pagesToLoad")
            loadPagesInParallel(pagesToLoad.first(), pagesToLoad.size)
        }
    }
    
    private fun onItemSelected(position: Int) {
        selectedPosition = position
        if (position < allItems.size) {
            val item = allItems[position]
            // For series, skip detail screen and go directly to series detail
            if (vodType == VODType.SERIES) {
                onSeriesSelectedCallback?.invoke(item)
            } else {
                showDetailScreen(item)
            }
        }
    }
    
    private fun updateBackdrop(item: VODItem) {
        titleText.text = item.name
        yearText.text = item.year ?: ""
        descriptionText.text = item.description ?: ""
        
        // Load backdrop image
        val imageUrl = item.backdropUrl?.takeIf { it.isNotEmpty() }
        backdropImage.load(imageUrl) {
            crossfade(200)
            placeholder(android.R.color.black)
            error(android.R.color.black)
        }
    }
    
    private fun showDetailScreen(item: VODItem) {
        currentDetailItem = item
        isDetailScreenVisible = true
        
        // Check if there's saved progress for this item
        scope.launch {
            val repository = com.ronika.iptvnative.repository.WatchProgressRepository(context)
            val contentType = if (vodType == VODType.SERIES) "SERIES" else "MOVIE"
            val progress = repository.getProgress(item.id, contentType)
            
            Log.d(TAG, "Checking progress for ${item.name} ($contentType): ${progress?.progressPercentage}%")
            
            withContext(Dispatchers.Main) {
                if (progress != null && progress.currentPosition > 0) {
                    val percentage = progress.progressPercentage
                    detailPlayButton.text = "▶ Resume ($percentage%)"
                } else {
                    detailPlayButton.text = "▶ Play"
                }
            }
        }
        
        // Check favorite status
        scope.launch {
            try {
                val type = if (item.isSeries) FavoriteRepository.TYPE_SERIES else FavoriteRepository.TYPE_MOVIE
                currentItemFavorited = favoriteRepository.isFavorite(item.id, type)
                withContext(Dispatchers.Main) {
                    updateFavoriteButtonUI()
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error checking favorite status", e)
            }
        }
        
        // Populate detail screen with data
        detailCategoryName.text = categoryNameLabel.text
        detailTitle.text = item.name
        detailYear.text = item.year ?: ""
        detailDescription.text = item.description ?: "No description available"
        
        // Format cast/director info
        val castInfo = buildString {
            item.director?.takeIf { it.isNotBlank() }?.let { 
                append("Director: $it") 
            }
            if (isNotEmpty() && item.actors?.isNotBlank() == true) {
                append("  •  ")
            }
            item.actors?.takeIf { it.isNotBlank() }?.let { 
                append("Cast: $it") 
            }
        }
        detailCast.text = castInfo.ifEmpty { "" }
        detailCast.visibility = if (castInfo.isEmpty()) GONE else VISIBLE
        
        // Load backdrop image (use backdropUrl for fullscreen background)
        val backdropUrl = item.backdropUrl?.takeIf { it.isNotEmpty() } ?: item.posterUrl
        detailPosterImage.load(backdropUrl) {
            crossfade(300)
            placeholder(android.R.color.darker_gray)
            error(android.R.color.darker_gray)
        }
        
        // Animate transition
        vodGridContainer.animate()
            .alpha(0f)
            .setDuration(300)
            .withEndAction {
                vodGridContainer.visibility = GONE
                vodDetailContainer.visibility = VISIBLE
                vodDetailContainer.alpha = 0f
                vodDetailContainer.requestFocus()  // Request focus on container for back button handling
                vodDetailContainer.animate()
                    .alpha(1f)
                    .setDuration(300)
                    .withEndAction {
                        detailPlayButton.requestFocus()
                    }
                    .start()
            }
            .start()
    }
    
    private fun updateFavoriteButtonUI() {
        if (currentItemFavorited) {
            detailFavoriteButton.text = "❤ Favourited"
            detailFavoriteButton.setBackgroundColor(0xFF444444.toInt())
        } else {
            detailFavoriteButton.text = "♡ Favourite"
            detailFavoriteButton.setBackgroundColor(0xFF333333.toInt())
        }
    }
    
    private fun hideDetailScreen() {
        isDetailScreenVisible = false
        vodDetailContainer.animate()
            .alpha(0f)
            .setDuration(300)
            .withEndAction {
                vodDetailContainer.visibility = GONE
                vodGridContainer.visibility = VISIBLE
                vodGridContainer.alpha = 0f
                vodGridContainer.animate()
                    .alpha(1f)
                    .setDuration(300)
                    .withEndAction {
                        // Restore focus to previously selected thumbnail
                        thumbnailsRecycler.post {
                            val layoutManager = thumbnailsRecycler.layoutManager as? GridLayoutManager
                            layoutManager?.findViewByPosition(selectedPosition)?.requestFocus()
                        }
                    }
                    .start()
            }
            .start()
    }
    
    private fun setupDetailScreenListeners() {
        // Play button click handler
        detailPlayButton.setOnClickListener {
            currentDetailItem?.let { item ->
                if (vodType == VODType.SERIES) {
                    // For series, show series detail with seasons/episodes
                    Log.d(TAG, "Open series detail: ${item.name}, ID: ${item.id}")
                    onSeriesSelectedCallback?.invoke(item)
                } else {
                    // For movies, play directly
                    Log.d(TAG, "Play video: ${item.name}, ID: ${item.id}, cmd: ${item.cmd}")
                    onPlayMovieCallback?.invoke(item)
                }
            }
        }
        
        // Favorite button click handler
        detailFavoriteButton.setOnClickListener {
            currentDetailItem?.let { item ->
                Log.d(TAG, "Toggle favorite for: ${item.name}")
                CoroutineScope(Dispatchers.Main).launch {
                    try {
                        val type = if (item.isSeries) FavoriteRepository.TYPE_SERIES else FavoriteRepository.TYPE_MOVIE
                        currentItemFavorited = favoriteRepository.toggleFavorite(
                            itemId = item.id, 
                            type = type,
                            name = item.name,
                            poster = item.posterUrl,
                            cmd = item.cmd
                        )
                        updateFavoriteButtonUI()
                        Log.d(TAG, "Favorite toggled for ${item.name}: isFavorited=$currentItemFavorited")
                    } catch (e: Exception) {
                        Log.e(TAG, "Error toggling favorite", e)
                    }
                }
            }
        }
        
        // Handle back button in detail screen
        vodDetailContainer.isFocusable = true
        vodDetailContainer.isFocusableInTouchMode = true
        vodDetailContainer.setOnKeyListener { _, keyCode, event ->
            if (event.action == KeyEvent.ACTION_DOWN && keyCode == KeyEvent.KEYCODE_BACK) {
                hideDetailScreen()
                true
            } else {
                false
            }
        }
    }
    
    fun setFullscreen(fullscreen: Boolean) {
        isFullscreenMode = fullscreen
        Log.d(TAG, "Fullscreen mode: $fullscreen")
        
        // Recalculate columns and spacing when changing fullscreen mode
        if (!fullscreen) {
            // Switching to sidebar mode (70% width), need fewer columns and smaller spacing
            post {
                updateSpacing(10) // 10dp spacing for small screen
                adjustGridColumns()
            }
        } else {
            // Fullscreen mode, use larger spacing
            post {
                updateSpacing(15) // 15dp spacing for fullscreen
                adjustGridColumns()
            }
        }
    }
    
    /**
     * Update item spacing decoration
     */
    private fun updateSpacing(spacingDp: Int) {
        val displayMetrics = context.resources.displayMetrics
        val spacingPx = (spacingDp * displayMetrics.density).toInt()
        
        // Remove old decoration and add new one with updated spacing
        itemDecoration?.let { thumbnailsRecycler.removeItemDecoration(it) }
        
        itemDecoration = object : RecyclerView.ItemDecoration() {
            override fun getItemOffsets(outRect: android.graphics.Rect, view: View, parent: RecyclerView, state: RecyclerView.State) {
                outRect.left = spacingPx
                outRect.right = spacingPx
                outRect.top = spacingPx
                outRect.bottom = spacingPx
            }
        }
        thumbnailsRecycler.addItemDecoration(itemDecoration!!)
        Log.d(TAG, "Updated spacing to ${spacingDp}dp (${spacingPx}px)")
    }
    
    /**
     * Adjust grid columns based on current container width
     */
    private fun adjustGridColumns() {
        val currentWidth = width
        if (currentWidth <= 0) {
            Log.d(TAG, "Container width not yet measured, skipping column adjustment")
            return
        }
        
        // Calculate columns based on fixed item size + spacing
        val displayMetrics = context.resources.displayMetrics
        val itemWidthDp = 146 // 140dp thumbnail + 6dp padding
        val spacingDp = if (isFullscreenMode) 15 else 10  // Dynamic spacing based on mode
        val itemWidthPx = (itemWidthDp * displayMetrics.density).toInt()
        val spacingPx = (spacingDp * displayMetrics.density).toInt()
        val totalItemWidth = itemWidthPx + (spacingPx * 2) // spacing on both sides
        
        // Calculate columns that fit in current width
        val adjustedColumns = (currentWidth / totalItemWidth).coerceAtLeast(2)
        
        if (gridLayoutManager.spanCount != adjustedColumns) {
            Log.d(TAG, "Adjusting grid columns from ${gridLayoutManager.spanCount} to $adjustedColumns (containerWidth: ${currentWidth}px, spacing: ${spacingDp}dp)")
            gridLayoutManager.spanCount = adjustedColumns
            thumbnailAdapter.notifyDataSetChanged()
        }
    }
    
    /**
     * Check if VOD component has content loaded
     */
    fun hasContent(): Boolean {
        return allItems.isNotEmpty() && vodGridContainer.visibility == VISIBLE
    }
    
    /**
     * Get current category name
     */
    fun getCategoryName(): String {
        return categoryName
    }
    
    /**
     * Reset the VOD component to initial state (hide detail screen, clear grid)
     */
    fun resetToInitialState() {
        Log.d(TAG, "Resetting VOD component to initial state")
        
        // Hide detail screen if visible
        if (isDetailScreenVisible) {
            isDetailScreenVisible = false
            vodDetailContainer.visibility = GONE
        }
        
        // Hide grid container
        vodGridContainer.visibility = GONE
        
        // Clear all items
        allItems.clear()
        thumbnailAdapter.updateItems(emptyList())
        
        // Reset pagination
        currentPage = 1
        loadedPages.clear()
        isLoadingMore = false
        
        // Reset fullscreen mode
        isFullscreenMode = false
        
        // Reset current detail item
        currentDetailItem = null
        
        Log.d(TAG, "VOD component reset complete")
    }
    
    /**
     * Show a single item directly in detail view (e.g., from search results)
     */
    fun showItemDetail(item: VODItem, categoryName: String, vodType: VODType) {
        this.categoryName = categoryName
        this.vodType = vodType
        categoryNameLabel.text = categoryName
        visibility = VISIBLE
        
        Log.d(TAG, "Showing single item detail: ${item.name}")
        
        // Show detail screen directly
        vodGridContainer.visibility = GONE
        showDetailScreen(item)
    }
    
    fun setOnBackPressedListener(callback: (String) -> Unit) {
        onBackPressedCallback = callback
    }
    
    fun setOnPlayMovieListener(callback: (VODItem) -> Unit) {
        onPlayMovieCallback = callback
    }
    
    fun setOnSeriesSelectedListener(callback: (VODItem) -> Unit) {
        onSeriesSelectedCallback = callback
    }
    
    fun onPlayerBackPressed(): Boolean {
        if (isDetailScreenVisible) {
            // Player back -> Detail screen (detail is already showing, just need to ensure it's visible)
            return true // Consumed, detail screen is already there
        }
        return false
    }
    
    fun focusPlayButton() {
        if (isDetailScreenVisible) {
            detailPlayButton.requestFocus()
            Log.d(TAG, "Focused play button in detail screen")
        }
    }
    
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN && event.keyCode == KeyEvent.KEYCODE_BACK) {
            // If detail screen is visible, go back to grid OR invoke callback if fullscreen
            if (isDetailScreenVisible) {
                // If in fullscreen mode (e.g., from search), invoke callback instead of showing grid
                if (isFullscreenMode) {
                    Log.d(TAG, "Back pressed from fullscreen detail - invoking callback")
                    onBackPressedCallback?.invoke(categoryName)
                    return true
                } else {
                    Log.d(TAG, "Back pressed from detail screen - returning to grid")
                    hideDetailScreen()
                    return true
                }
            } else {
                // Back from grid -> Category sidenav (only when at position 0 or empty)
                if (selectedPosition == 0 || allItems.isEmpty()) {
                    Log.d(TAG, "Back pressed from VOD grid (position: $selectedPosition, empty: ${allItems.isEmpty()}) - returning to category nav")
                    onBackPressedCallback?.invoke(categoryName)
                    return true
                }
            }
        }
        return super.dispatchKeyEvent(event)
    }
    
    // Adapter for thumbnail grid
    inner class ThumbnailAdapter(
        private var items: List<VODItem>,
        private val onItemClick: (Int) -> Unit
    ) : RecyclerView.Adapter<ThumbnailAdapter.ThumbnailViewHolder>() {
        
        fun updateItems(newItems: List<VODItem>) {
            items = newItems
            notifyDataSetChanged()
        }
        
        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ThumbnailViewHolder {
            val view = LayoutInflater.from(parent.context)
                .inflate(R.layout.item_vod_thumbnail, parent, false)
            return ThumbnailViewHolder(view)
        }
        
        override fun onBindViewHolder(holder: ThumbnailViewHolder, position: Int) {
            holder.bind(items[position], position)
        }
        
        override fun getItemCount() = items.size
        
        inner class ThumbnailViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
            private val posterImage: ImageView = itemView.findViewById(R.id.poster_image)
            private val titleOverlay: TextView = itemView.findViewById(R.id.title_overlay)
            private val progressContainer: View = itemView.findViewById(R.id.progress_container)
            private val progressBar: View = itemView.findViewById(R.id.progress_bar)
            
            init {
                itemView.isFocusable = true
                itemView.isFocusableInTouchMode = true
                
                itemView.setOnClickListener {
                    onItemClick(adapterPosition)
                }
                
                itemView.setOnFocusChangeListener { _, hasFocus ->
                    val position = bindingAdapterPosition
                    if (hasFocus) {
                        Log.d(TAG, "🎯 FOCUS GAINED - Position: $position, Item: ${if (position >= 0 && position < items.size) items[position].name else "INVALID"}")
                        itemView.elevation = 12f
                        // Update backdrop immediately on focus
                        if (position != RecyclerView.NO_POSITION && position < items.size) {
                            selectedPosition = position
                            Log.d(TAG, "📺 Updating backdrop to: ${items[position].name}")
                            updateBackdrop(items[position])
                        } else {
                            Log.e(TAG, "⚠️ Invalid position on focus: $position, itemCount: ${items.size}")
                        }
                    } else {
                        Log.d(TAG, "❌ FOCUS LOST - Position: $position, Item: ${if (position >= 0 && position < items.size) items[position].name else "INVALID"}")
                        itemView.elevation = 0f
                    }
                }
            }
            
            fun bind(item: VODItem, position: Int) {
                titleOverlay.text = item.name
                
                // Load poster image with Coil
                val imageUrl = item.posterUrl?.takeIf { it.isNotEmpty() }
                Log.d(TAG, "Loading image for ${item.name}: ${imageUrl ?: "no url"}")
                
                posterImage.load(imageUrl) {
                    crossfade(true)
                    placeholder(android.R.color.darker_gray)
                    error(android.R.color.darker_gray)
                    transformations(RoundedCornersTransformation(8f))
                }
                
                // Load and show progress bar if exists (only for movies, not series)
                if (item.isSeries) {
                    // Don't show progress bar for series in Continue Watching
                    progressContainer.visibility = View.GONE
                } else {
                    // Show progress bar for movies
                    scope.launch {
                        try {
                            val repository = com.ronika.iptvnative.repository.WatchProgressRepository(context)
                            val progress = repository.getProgress(item.id, "MOVIE")
                            
                            withContext(Dispatchers.Main) {
                                if (progress != null && progress.currentPosition > 0 && progress.duration > 0) {
                                    val percentage = (progress.currentPosition * 100 / progress.duration).toInt()
                                    
                                    // Show progress bar
                                    progressContainer.visibility = View.VISIBLE
                                    
                                    // Wait for layout to get correct width
                                    progressContainer.post {
                                        val containerWidth = progressContainer.width
                                        if (containerWidth > 0) {
                                            val layoutParams = progressBar.layoutParams
                                            layoutParams.width = (containerWidth * percentage / 100)
                                            progressBar.layoutParams = layoutParams
                                            Log.d(TAG, "Progress for ${item.name}: $percentage% (${layoutParams.width}px / ${containerWidth}px)")
                                        }
                                    }
                                } else {
                                    progressContainer.visibility = View.GONE
                                }
                            }
                        } catch (e: Exception) {
                            Log.e(TAG, "Error loading progress for ${item.name}: ${e.message}")
                            withContext(Dispatchers.Main) {
                                progressContainer.visibility = View.GONE
                            }
                        }
                    }
                }
            }
        }
    }
}
