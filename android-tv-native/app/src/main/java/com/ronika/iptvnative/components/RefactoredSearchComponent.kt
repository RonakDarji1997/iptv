package com.ronika.iptvnative.components

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.util.AttributeSet
import android.util.Log
import android.view.KeyEvent
import android.view.LayoutInflater
import android.view.View
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.ronika.iptvnative.R
import com.ronika.iptvnative.api.StalkerClient
import com.ronika.iptvnative.database.AppDatabase
import com.ronika.iptvnative.database.dao.ProviderDao
import com.ronika.iptvnative.database.entities.ProviderEntity
import kotlinx.coroutines.*

/**
 * RefactoredSearchComponent - Modern search for the refactored architecture
 * - Multi-provider support with toggle buttons
 * - Parallel page loading for fast results
 * - Progressive result display
 * - Integrated with VODComponent and SeriesDetailComponent
 */
class RefactoredSearchComponent @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : FrameLayout(context, attrs, defStyleAttr) {

    private val TAG = "RefactoredSearch"

    // UI Components
    private lateinit var searchInput: EditText
    private lateinit var searchRecycler: RecyclerView
    private lateinit var searchProgress: ProgressBar
    private lateinit var searchEmpty: TextView
    private lateinit var searchError: TextView
    private lateinit var providerToggleContainer: LinearLayout

    // Adapter
    private lateinit var searchAdapter: SearchResultAdapter
    
    // Search results per provider
    private val providerSearchResults = mutableMapOf<String, MutableList<SearchResultItem>>()
    private val currentDisplayResults = mutableListOf<SearchResultItem>()

    // Data class to hold search result with provider info
    data class SearchResultItem(
        val vodItem: VODComponent.VODItem,
        val providerId: String,
        val providerName: String
    )

    // Coroutine
    private val searchScope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private var searchJob: Job? = null

    // Provider management
    private val providerDao: ProviderDao = AppDatabase.getDatabase(context).providerDao()
    private var activeProviders = listOf<ProviderEntity>()
    private var selectedProviderId: String? = null
    private val providerClients = mutableMapOf<String, StalkerClient>()
    private val providerButtons = mutableListOf<TextView>()

    // Callbacks
    private var onNavigateBack: (() -> Unit)? = null
    private var onMovieSelected: ((VODComponent.VODItem, String) -> Unit)? = null  // Now includes providerId
    private var onSeriesSelected: ((VODComponent.VODItem, String) -> Unit)? = null // Now includes providerId

    init {
        LayoutInflater.from(context).inflate(R.layout.component_refactored_search, this, true)
        initViews()
        setupRecyclerView()
        setupSearchInput()
        loadActiveProviders()
    }

    private fun initViews() {
        searchInput = findViewById(R.id.search_input)
        searchRecycler = findViewById(R.id.search_results_recycler)
        searchProgress = findViewById(R.id.search_progress)
        searchEmpty = findViewById(R.id.search_empty)
        searchError = findViewById(R.id.search_error)
        providerToggleContainer = findViewById(R.id.provider_toggle_container)
    }

    private fun loadActiveProviders() {
        searchScope.launch {
            activeProviders = withContext(Dispatchers.IO) {
                providerDao.getAllProvidersList()
                    .filter { it.isConfigured && it.isActive && it.token != null }
            }
            
            Log.d(TAG, "Found ${activeProviders.size} active providers")
            
            // Initialize clients for all providers
            activeProviders.forEach { provider ->
                providerClients[provider.id] = StalkerClient(
                    portalUrl = provider.serverUrl,
                    macAddress = provider.macAddress ?: "",
                    token = provider.token ?: "",
                    serialNumber = provider.serialNumber ?: ""
                )
            }
            
            // Set first provider as selected
            if (activeProviders.isNotEmpty()) {
                selectedProviderId = activeProviders.first().id
            }
            
            // Build provider toggle buttons if multiple providers (but keep hidden until search)
            buildProviderToggleButtons()
        }
    }

    private fun buildProviderToggleButtons() {
        providerToggleContainer.removeAllViews()
        providerButtons.clear()
        
        if (activeProviders.size <= 1) {
            // Single provider - hide toggle buttons permanently
            providerToggleContainer.visibility = View.GONE
            return
        }
        
        // Multiple providers - build buttons but keep hidden until search
        // Will be shown after search results come back
        providerToggleContainer.visibility = View.GONE
        
        activeProviders.forEachIndexed { index, provider ->
            val button = createProviderButton(provider, index)
            providerToggleContainer.addView(button)
            providerButtons.add(button)
            
            // Select first button by default
            if (index == 0) {
                updateButtonSelected(button, true)
            }
        }
    }
    
    private fun showProviderToggles() {
        if (activeProviders.size > 1 && providerButtons.isNotEmpty()) {
            providerToggleContainer.visibility = View.VISIBLE
        }
    }
    
    private fun hideProviderToggles() {
        providerToggleContainer.visibility = View.GONE
    }

    private fun createProviderButton(provider: ProviderEntity, index: Int): TextView {
        return TextView(context).apply {
            text = provider.name
            textSize = 16f
            setTextColor(Color.WHITE)
            typeface = Typeface.DEFAULT_BOLD
            background = resources.getDrawable(R.drawable.provider_toggle_bg, null)
            setPadding(48, 20, 48, 20)
            isFocusable = true
            isFocusableInTouchMode = true
            
            val params = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            if (index > 0) {
                params.marginStart = 24
            }
            layoutParams = params
            
            setOnClickListener {
                selectProvider(provider.id)
            }
            
            setOnFocusChangeListener { _, hasFocus ->
                if (hasFocus) {
                    updateButtonSelected(this, true)
                    selectProvider(provider.id)
                } else if (selectedProviderId != provider.id) {
                    updateButtonSelected(this, false)
                }
            }
            
            setOnKeyListener { _, keyCode, event ->
                if (event.action == KeyEvent.ACTION_DOWN) {
                    when (keyCode) {
                        KeyEvent.KEYCODE_DPAD_UP -> {
                            searchInput.requestFocus()
                            true
                        }
                        KeyEvent.KEYCODE_DPAD_DOWN -> {
                            // Navigate to results
                            if (currentDisplayResults.isNotEmpty()) {
                                searchRecycler.requestFocus()
                            }
                            true
                        }
                        KeyEvent.KEYCODE_DPAD_LEFT -> {
                            if (index > 0) {
                                providerButtons[index - 1].requestFocus()
                                true
                            } else {
                                // Block left on first button - only back allowed
                                true
                            }
                        }
                        KeyEvent.KEYCODE_DPAD_RIGHT -> {
                            if (index < providerButtons.size - 1) {
                                providerButtons[index + 1].requestFocus()
                                true
                            } else {
                                false
                            }
                        }
                        KeyEvent.KEYCODE_BACK -> {
                            onNavigateBack?.invoke()
                            true
                        }
                        else -> false
                    }
                } else false
            }
        }
    }

    private fun updateButtonSelected(button: TextView, isSelected: Boolean) {
        button.isSelected = isSelected
        if (isSelected) {
            button.setTextColor(Color.BLACK)
        } else {
            button.setTextColor(Color.WHITE)
        }
    }

    private fun selectProvider(providerId: String) {
        if (selectedProviderId == providerId) return
        
        selectedProviderId = providerId
        Log.d(TAG, "Selected provider: $providerId")
        
        // Update button styles
        activeProviders.forEachIndexed { index, provider ->
            val button = providerButtons.getOrNull(index)
            button?.let {
                updateButtonSelected(it, provider.id == providerId)
            }
        }
        
        // Show results for selected provider
        displayResultsForProvider(providerId)
    }

    private fun displayResultsForProvider(providerId: String) {
        currentDisplayResults.clear()
        providerSearchResults[providerId]?.let {
            currentDisplayResults.addAll(it)
        }
        searchAdapter.submitList(currentDisplayResults.toList())
        
        if (currentDisplayResults.isEmpty() && searchInput.text.length >= 2) {
            searchEmpty.visibility = View.VISIBLE
            searchEmpty.text = "No results found"
        } else if (currentDisplayResults.isNotEmpty()) {
            searchEmpty.visibility = View.GONE
        }
        
        Log.d(TAG, "Displaying ${currentDisplayResults.size} results for provider $providerId")
    }

    private fun setupRecyclerView() {
        searchAdapter = SearchResultAdapter(
            onItemSelected = { item ->
                handleItemSelected(item)
            }
        )

        searchRecycler.apply {
            layoutManager = GridLayoutManager(context, 5)
            adapter = searchAdapter
            isFocusable = false
            
            // Block left key on leftmost column to prevent going to sidenav
            addOnItemTouchListener(object : RecyclerView.SimpleOnItemTouchListener() {})
        }
        
        // Add key listener to block left navigation from search results
        searchRecycler.setOnKeyListener { _, keyCode, event ->
            if (event.action == KeyEvent.ACTION_DOWN && keyCode == KeyEvent.KEYCODE_DPAD_LEFT) {
                // Check if we're on the leftmost column (position % 5 == 0)
                val layoutManager = searchRecycler.layoutManager as? GridLayoutManager
                val focusedChild = searchRecycler.focusedChild
                if (focusedChild != null && layoutManager != null) {
                    val position = searchRecycler.getChildAdapterPosition(focusedChild)
                    if (position % 5 == 0) {
                        // Block left on leftmost column
                        return@setOnKeyListener true
                    }
                }
            }
            false
        }
    }

    private fun setupSearchInput() {
        searchInput.addTextChangedListener(object : android.text.TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: android.text.Editable?) {
                val query = s.toString()
                performSearch(query)
            }
        })

        searchInput.setOnKeyListener { _, keyCode, event ->
            if (event.action == KeyEvent.ACTION_DOWN) {
                when (keyCode) {
                    KeyEvent.KEYCODE_DPAD_UP -> {
                        // If multiple providers, go to provider buttons
                        if (activeProviders.size > 1 && providerButtons.isNotEmpty()) {
                            val selectedIndex = activeProviders.indexOfFirst { it.id == selectedProviderId }
                            if (selectedIndex >= 0 && selectedIndex < providerButtons.size) {
                                providerButtons[selectedIndex].requestFocus()
                            } else {
                                providerButtons.first().requestFocus()
                            }
                            return@setOnKeyListener true
                        }
                    }
                    KeyEvent.KEYCODE_DPAD_DOWN -> {
                        if (currentDisplayResults.isNotEmpty()) {
                            searchRecycler.requestFocus()
                            searchRecycler.post {
                                searchRecycler.getChildAt(0)?.requestFocus()
                            }
                            return@setOnKeyListener true
                        }
                    }
                    KeyEvent.KEYCODE_DPAD_LEFT -> {
                        // Block left - only back allowed to navigate back
                        return@setOnKeyListener true
                    }
                    KeyEvent.KEYCODE_BACK -> {
                        onNavigateBack?.invoke()
                        return@setOnKeyListener true
                    }
                }
            }
            false
        }
    }

    private fun performSearch(query: String) {
        searchJob?.cancel()

        if (query.length < 2) {
            providerSearchResults.clear()
            currentDisplayResults.clear()
            searchAdapter.submitList(currentDisplayResults.toList())
            searchEmpty.visibility = View.VISIBLE
            searchEmpty.text = "Type at least 2 characters to search"
            searchError.visibility = View.GONE
            searchProgress.visibility = View.GONE
            hideProviderToggles()
            return
        }

        searchEmpty.visibility = View.GONE
        searchError.visibility = View.GONE
        searchProgress.visibility = View.VISIBLE

        searchJob = searchScope.launch {
            delay(300) // Debounce

            try {
                Log.d(TAG, "Searching for: $query across ${activeProviders.size} providers")
                
                // Clear previous results
                providerSearchResults.clear()
                currentDisplayResults.clear()
                searchAdapter.submitList(currentDisplayResults.toList())
                
                // Search all providers in parallel with more workers
                val providerJobs = activeProviders.map { provider ->
                    async(Dispatchers.IO) {
                        searchProvider(provider, query)
                    }
                }
                
                // Wait for all provider searches to complete
                providerJobs.forEach { it.await() }
                
                // Display results for selected provider
                withContext(Dispatchers.Main) {
                    searchProgress.visibility = View.GONE
                    selectedProviderId?.let { displayResultsForProvider(it) }
                    
                    // Show provider toggles if we have results and multiple providers
                    if (providerSearchResults.isNotEmpty()) {
                        showProviderToggles()
                    }
                    
                    if (currentDisplayResults.isEmpty()) {
                        searchEmpty.visibility = View.VISIBLE
                        searchEmpty.text = "No results found"
                    }
                }

            } catch (e: Exception) {
                Log.e(TAG, "Search error: ${e.message}", e)
                withContext(Dispatchers.Main) {
                    searchProgress.visibility = View.GONE
                    searchError.text = "Search failed: ${e.message}"
                    searchError.visibility = View.VISIBLE
                }
            }
        }
    }

    private suspend fun searchProvider(provider: ProviderEntity, query: String) {
        val client = providerClients[provider.id] ?: return
        val portalBaseUrl = provider.serverUrl.trimEnd('/')
        val results = mutableListOf<SearchResultItem>()
        
        try {
            // Load 8 pages in parallel for faster results
            val pagesToLoad = (1..8).toList()
            
            val deferredResults = pagesToLoad.map { page ->
                searchScope.async(Dispatchers.IO) {
                    try {
                        val response = client.searchContent(query, page)
                        response.items.data
                    } catch (e: Exception) {
                        Log.e(TAG, "Error loading page $page for ${provider.name}: ${e.message}")
                        emptyList()
                    }
                }
            }
            
            deferredResults.forEach { deferred ->
                try {
                    val movies = deferred.await()
                    
                    if (movies.isNotEmpty()) {
                        val items = movies.map { movie ->
                            val imageUrl = movie.screenshotUri ?: movie.screenshot ?: 
                                          movie.coverBig ?: movie.cover ?: movie.poster
                            val fullImageUrl = buildImageUrl(imageUrl, portalBaseUrl)

                            SearchResultItem(
                                vodItem = VODComponent.VODItem(
                                    id = movie.id,
                                    name = movie.name,
                                    year = movie.year,
                                    description = movie.description,
                                    posterUrl = fullImageUrl,
                                    backdropUrl = fullImageUrl,
                                    cmd = movie.cmd ?: "",
                                    director = movie.director,
                                    actors = movie.actors,
                                    isSeries = movie.isSeries != null && movie.isSeries != "0"
                                ),
                                providerId = provider.id,
                                providerName = provider.name
                            )
                        }
                        results.addAll(items)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error processing results for ${provider.name}: ${e.message}")
                }
            }
            
            // Store results for this provider
            providerSearchResults[provider.id] = results
            
            Log.d(TAG, "Provider ${provider.name}: ${results.size} results")
            
            // If this is the selected provider, update UI progressively
            if (provider.id == selectedProviderId) {
                withContext(Dispatchers.Main) {
                    displayResultsForProvider(provider.id)
                }
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Search failed for provider ${provider.name}: ${e.message}")
        }
    }

    private fun handleItemSelected(item: SearchResultItem) {
        Log.d(TAG, "Item selected: ${item.vodItem.name}, isSeries=${item.vodItem.isSeries}, provider=${item.providerId}")

        if (item.vodItem.isSeries) {
            Log.d(TAG, "Invoking onSeriesSelected for: ${item.vodItem.name}")
            onSeriesSelected?.invoke(item.vodItem, item.providerId)
        } else {
            Log.d(TAG, "Invoking onMovieSelected for: ${item.vodItem.name}")
            onMovieSelected?.invoke(item.vodItem, item.providerId)
        }
    }

    private fun buildImageUrl(imagePath: String?, portalBaseUrl: String): String? {
        if (imagePath.isNullOrEmpty()) return null
        if (imagePath.startsWith("http")) return imagePath
        return if (imagePath.startsWith("/") && portalBaseUrl.isNotEmpty()) {
            "$portalBaseUrl$imagePath"
        } else {
            imagePath
        }
    }

    fun requestSearchFocus() {
        searchInput.requestFocus()
        Log.d(TAG, "Focus requested on search input")
    }

    fun clearSearch() {
        searchInput.text.clear()
        providerSearchResults.clear()
        currentDisplayResults.clear()
        searchAdapter.submitList(currentDisplayResults.toList())
        searchEmpty.visibility = View.VISIBLE
        searchEmpty.text = "Type at least 2 characters to search"
        searchError.visibility = View.GONE
        searchProgress.visibility = View.GONE
        Log.d(TAG, "Search cleared")
    }
    
    fun refreshProviders() {
        loadActiveProviders()
    }

    fun restoreFocusToResults() {
        // If we have search results, focus on the first item
        if (currentDisplayResults.isNotEmpty() && searchRecycler.visibility == View.VISIBLE) {
            searchRecycler.requestFocus()
            searchRecycler.post {
                searchRecycler.layoutManager?.scrollToPosition(0)
                searchRecycler.getChildAt(0)?.requestFocus()
            }
            Log.d(TAG, "Focus restored to search results (${currentDisplayResults.size} items)")
        } else {
            // Otherwise focus on search input
            searchInput.requestFocus()
            Log.d(TAG, "Focus restored to search input")
        }
    }

    fun setOnNavigateBackListener(listener: () -> Unit) {
        onNavigateBack = listener
    }

    fun setOnMovieSelectedListener(listener: (VODComponent.VODItem, String) -> Unit) {
        onMovieSelected = listener
    }

    fun setOnSeriesSelectedListener(listener: (VODComponent.VODItem, String) -> Unit) {
        onSeriesSelected = listener
    }

    fun cleanup() {
        searchJob?.cancel()
        searchScope.cancel()
        Log.d(TAG, "Cleanup completed")
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        cleanup()
    }

    /**
     * Adapter for search results
     */
    inner class SearchResultAdapter(
        private val onItemSelected: (SearchResultItem) -> Unit
    ) : RecyclerView.Adapter<SearchResultAdapter.ViewHolder>() {

        private var items = listOf<SearchResultItem>()

        fun submitList(newItems: List<SearchResultItem>) {
            items = newItems
            notifyDataSetChanged()
        }

        override fun onCreateViewHolder(parent: android.view.ViewGroup, viewType: Int): ViewHolder {
            val view = LayoutInflater.from(parent.context)
                .inflate(R.layout.item_vod_thumbnail, parent, false)
            return ViewHolder(view)
        }

        override fun onBindViewHolder(holder: ViewHolder, position: Int) {
            holder.bind(items[position])
        }

        override fun getItemCount() = items.size

        inner class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
            private val posterImage: android.widget.ImageView = view.findViewById(R.id.poster_image)
            private val titleText: TextView = view.findViewById(R.id.title_overlay)
            private val typeBadge: TextView = view.findViewById(R.id.type_badge)

            init {
                view.setOnClickListener {
                    val position = bindingAdapterPosition
                    if (position != RecyclerView.NO_POSITION) {
                        onItemSelected(items[position])
                    }
                }
                
                // Block left navigation on leftmost column
                view.setOnKeyListener { _, keyCode, event ->
                    if (event.action == KeyEvent.ACTION_DOWN) {
                        when (keyCode) {
                            KeyEvent.KEYCODE_DPAD_LEFT -> {
                                val position = bindingAdapterPosition
                                if (position != RecyclerView.NO_POSITION && position % 5 == 0) {
                                    // Block left on leftmost column
                                    true
                                } else {
                                    false
                                }
                            }
                            KeyEvent.KEYCODE_BACK -> {
                                onNavigateBack?.invoke()
                                true
                            }
                            else -> false
                        }
                    } else false
                }
            }

            fun bind(item: SearchResultItem) {
                titleText.text = item.vodItem.name
                
                // Show series/movie badge
                if (item.vodItem.isSeries) {
                    typeBadge.text = "SERIES"
                    typeBadge.setBackgroundColor(0xCC2196F3.toInt()) // Blue for series
                    typeBadge.visibility = View.VISIBLE
                } else {
                    typeBadge.text = "MOVIE"
                    typeBadge.setBackgroundColor(0xCCE91E63.toInt()) // Pink for movies
                    typeBadge.visibility = View.VISIBLE
                }
                
                // Load image using Coil
                posterImage.load(item.vodItem.posterUrl) {
                    crossfade(300)
                    placeholder(android.R.color.darker_gray)
                    error(android.R.color.darker_gray)
                }
            }

            private fun android.widget.ImageView.load(
                url: String?,
                builder: coil.request.ImageRequest.Builder.() -> Unit = {}
            ) {
                val request = coil.request.ImageRequest.Builder(context)
                    .data(url)
                    .target(this)
                    .apply(builder)
                    .build()
                coil.ImageLoader(context).enqueue(request)
            }
        }
    }
}
