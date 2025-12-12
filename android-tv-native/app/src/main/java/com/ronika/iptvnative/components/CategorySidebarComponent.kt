package com.ronika.iptvnative.components

import android.content.Context
import android.util.AttributeSet
import android.util.Log
import android.view.KeyEvent
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.ronika.iptvnative.R
import com.ronika.iptvnative.MainActivity
import com.ronika.iptvnative.database.AppDatabase
import com.ronika.iptvnative.database.entities.CategoryEntity
import com.ronika.iptvnative.database.entities.ProviderEntity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Category Sidebar Component - Provider Dropdown Style
 * Shows providers as collapsible dropdowns with categories grouped by Live/Movies/Series
 */
class CategorySidebarComponent @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : LinearLayout(context, attrs, defStyleAttr) {

    private val TAG = "CategorySidebar"
    
    private lateinit var categoryTitle: TextView
    private lateinit var providersContainer: LinearLayout
    private lateinit var providersScroll: ScrollView
    
    private val database = AppDatabase.getDatabase(context)
    private val componentScope = CoroutineScope(Dispatchers.Main)
    
    // Track expanded providers
    private val expandedProviders = mutableSetOf<String>()
    
    // Track all focusable views for navigation
    private val focusableViews = mutableListOf<View>()
    
    // Current section filter (from main sidenav)
    private var currentSection: Section = Section.LIVE_TV
    
    enum class Section {
        LIVE_TV, MOVIES, SERIES, SEARCH
    }
    
    // Data class to hold provider with its categories
    data class ProviderWithCategories(
        val provider: ProviderEntity,
        val liveCategories: List<String>,
        val movieCategories: List<String>,
        val seriesCategories: List<String>
    )
    
    private var providers: List<ProviderWithCategories> = emptyList()

    init {
        LayoutInflater.from(context).inflate(R.layout.component_category_sidebar, this, true)
        
        categoryTitle = findViewById(R.id.category_title)
        providersContainer = findViewById(R.id.providers_container)
        providersScroll = findViewById(R.id.providers_scroll)
        
        // Prevent entire component from taking focus on init
        isFocusable = false
        isFocusableInTouchMode = false
        
        // Load providers and their categories
        loadProviders()
    }
    
    /**
     * Load all configured and ACTIVE providers with their categories
     */
    private fun loadProviders() {
        componentScope.launch {
            try {
                val providersList = withContext(Dispatchers.IO) {
                    database.providerDao().getAllProvidersList()
                        .filter { provider ->
                            provider.isConfigured && provider.isActive && 
                            (provider.type == "m3u" || provider.token != null)
                        }
                }
                
                Log.d(TAG, "Found ${providersList.size} active configured providers")
                
                // Load categories for each provider (ALL categories, not just enabled)
                val providersWithCategories = providersList.map { provider ->
                    // Load only enabled categories for display. Categories' isEnabled flag
                    // is set during PortalSetup and indicates the user's selection.
                    val categories = withContext(Dispatchers.IO) {
                        val enabled = database.categoryDao().getEnabledCategoriesByProviderId(provider.id)
                        // For debugging: find disabled categories (if any) and log them
                        val all = database.categoryDao().getCategoriesByProviderId(provider.id)
                        val disabled = all.filter { it.isEnabled == false }
                        if (disabled.isNotEmpty()) {
                            Log.d(TAG, "⚠️ Disabled categories for provider ${provider.name}: ${disabled.map { it.name }}")
                        }
                        enabled
                    }
                    
                    Log.d(TAG, "📊 Total categories for provider ${provider.name}: ${categories.size}")
                    
                    val live = categories.filter { it.type.equals("live", ignoreCase = true) }
                    val movies = categories.filter { it.type.equals("movie", ignoreCase = true) }
                    val series = categories.filter { it.type.equals("series", ignoreCase = true) }
                    
                    Log.d(TAG, "Provider ${provider.name}: ${live.size} live, ${movies.size} movies, ${series.size} series")
                    
                    // Log adult/censored categories
                    val adultCategories = categories.filter { it.censored == 1 || it.name.contains("adult", ignoreCase = true) || it.name.contains("18+") }
                    if (adultCategories.isNotEmpty()) {
                        Log.d(TAG, "🔞 Adult/Censored categories found: ${adultCategories.map { "${it.name} (type=${it.type}, censored=${it.censored})" }}")
                    }
                    
                    // Sort each category type with adult categories at the bottom
                    val sortedLive = sortCategoriesByAdult(live)
                    val sortedMovies = sortCategoriesByAdult(movies)
                    val sortedSeries = sortCategoriesByAdult(series)
                    
                    ProviderWithCategories(provider, sortedLive.map { it.name }, sortedMovies.map { it.name }, sortedSeries.map { it.name })
                }
                
                providers = providersWithCategories
                
                withContext(Dispatchers.Main) {
                    buildProviderDropdowns()
                }
                
            } catch (e: Exception) {
                Log.e(TAG, "Error loading providers", e)
            }
        }
    }
    
    /**
     * Build the UI for provider dropdowns or direct categories
     */
    private fun buildProviderDropdowns() {
        providersContainer.removeAllViews()
        focusableViews.clear()
        
        // Check if there are any categories to display
        val hasCategories = providers.any { providerData ->
            when (currentSection) {
                Section.LIVE_TV -> providerData.liveCategories.isNotEmpty()
                Section.MOVIES -> providerData.movieCategories.isNotEmpty()
                Section.SERIES -> providerData.seriesCategories.isNotEmpty()
                Section.SEARCH -> false
            }
        }
        
        if (!hasCategories) {
            // Show empty state message
            showEmptyState()
            return
        }
        
        // If only one provider, show categories directly without dropdown
        if (providers.size == 1) {
            addDirectCategories(providers.first())
        } else {
            // Multiple providers - show dropdowns
            providers.forEach { providerData ->
                addProviderDropdown(providerData)
            }
        }
        
        Log.d(TAG, "Built ${providers.size} provider(s), ${focusableViews.size} focusable views")
    }
    
    /**
     * Show empty state when no categories are found
     */
    private fun showEmptyState() {
        val emptyView = TextView(context).apply {
            text = when (currentSection) {
                Section.LIVE_TV -> "No Live TV channels available"
                Section.MOVIES -> "No movies available"
                Section.SERIES -> "No series available"
                Section.SEARCH -> "No content available"
            }
            textSize = 16f
            setTextColor(0xFF999999.toInt())
            gravity = android.view.Gravity.CENTER
            setPadding(16, 32, 16, 16)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }
        providersContainer.addView(emptyView)
        Log.d(TAG, "Showing empty state for section: $currentSection")
    }
    
    /**
     * Sort category names with adult/censored categories at the bottom
     */
    // Sort category entities with adult/censored categories at the bottom
    private fun sortCategoriesByAdult(categories: List<CategoryEntity>): List<CategoryEntity> {
        val (adultCategories, normalCategories) = categories.partition { it.censored == 1 }
        return normalCategories + adultCategories
    }
    
    /**
     * Add categories directly without provider header (for single provider)
     */
    private fun addDirectCategories(providerData: ProviderWithCategories) {
        val provider = providerData.provider
        
        // Get categories based on current section (already sorted with adult at bottom)
        val categories = when (currentSection) {
            Section.LIVE_TV -> providerData.liveCategories
            Section.MOVIES -> {
                // Add Continue Watching and Favourites at the top
                listOf("▶️ Continue Watching", "⭐ Favourites") + providerData.movieCategories
            }
            Section.SERIES -> {
                // Add Continue Watching and Favourites at the top
                listOf("▶️ Continue Watching", "⭐ Favourites") + providerData.seriesCategories
            }
            Section.SEARCH -> emptyList() // Search doesn't have categories in sidebar
        }
        
        // Get content type for click handler
        val contentType = when (currentSection) {
            Section.LIVE_TV -> "live"
            Section.MOVIES -> "movie"
            Section.SERIES -> "series"
            Section.SEARCH -> return // No categories to add for search
        }
        
        categories.forEach { categoryName ->
            val categoryView = createCategoryView(categoryName, provider, contentType)
            providersContainer.addView(categoryView)
            focusableViews.add(categoryView)
        }
        
        Log.d(TAG, "Added ${categories.size} direct categories for ${provider.name}")
    }
    
    /**
     * Create a category view item (same style as dropdown categories)
     */
    private fun createCategoryView(categoryName: String, provider: ProviderEntity, contentType: String): View {
        // Use the same layout as dropdown categories
        val textView = LayoutInflater.from(context)
            .inflate(R.layout.item_category_simple, null) as TextView
        
        textView.text = categoryName
        
        // Set layout params
        textView.layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        )
        
        textView.isFocusable = true
        textView.isFocusableInTouchMode = true
            
        textView.setOnFocusChangeListener { _, hasFocus ->
            textView.setTextColor(if (hasFocus) 0xFF000000.toInt() else 0xFFFFFFFF.toInt())
            if (hasFocus) {
                textView.isSelected = true
                scrollToView(textView)
            } else {
                textView.isSelected = false
            }
        }
        
        textView.setOnClickListener {
            onCategoryClicked(categoryName, provider.id, contentType)
        }
        
        textView.setOnKeyListener { view, keyCode, event ->
            if (event.action == KeyEvent.ACTION_DOWN) {
                when (keyCode) {
                    KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_DPAD_RIGHT -> {
                        onCategoryClicked(categoryName, provider.id, contentType)
                        true
                    }
                    KeyEvent.KEYCODE_DPAD_LEFT -> {
                        onNavigateBackCallback?.invoke()
                        true
                    }
                    KeyEvent.KEYCODE_DPAD_UP -> {
                        // Find previous focusable sibling
                        val parent = view.parent as? ViewGroup
                        if (parent != null) {
                            val index = parent.indexOfChild(view)
                            if (index == 0) {
                                // At first item, block UP to prevent focus escape
                                Log.d(TAG, "Blocking UP at first category")
                                true
                            } else {
                                false // Allow normal navigation
                            }
                        } else false
                    }
                    KeyEvent.KEYCODE_DPAD_DOWN -> {
                        // Find next focusable sibling
                        val parent = view.parent as? ViewGroup
                        if (parent != null) {
                            val index = parent.indexOfChild(view)
                            if (index == parent.childCount - 1) {
                                // At last item, block DOWN to prevent focus escape
                                Log.d(TAG, "Blocking DOWN at last category")
                                true
                            } else {
                                false // Allow normal navigation
                            }
                        } else false
                    }
                    else -> false
                }
            } else false
        }
        
        return textView
    }
    
    /**
     * Add a provider dropdown to the container
     */
    private fun addProviderDropdown(providerData: ProviderWithCategories) {
        val provider = providerData.provider
        val dropdownView = LayoutInflater.from(context)
            .inflate(R.layout.item_provider_dropdown, providersContainer, false)
        
        val providerHeader = dropdownView.findViewById<LinearLayout>(R.id.provider_header)
        val providerName = dropdownView.findViewById<TextView>(R.id.provider_name)
        val expandIcon = dropdownView.findViewById<ImageView>(R.id.expand_icon)
        val categoriesContainer = dropdownView.findViewById<LinearLayout>(R.id.categories_container)
        
        // Set provider name
        providerName.text = provider.name
        
        // Track if expanded
        val isExpanded = expandedProviders.contains(provider.id)
        categoriesContainer.visibility = if (isExpanded) View.VISIBLE else View.GONE
        expandIcon.rotation = if (isExpanded) 180f else 0f
        
        // Add provider header to focusable list
        focusableViews.add(providerHeader)
        
        // Setup header click/enter to expand/collapse
        providerHeader.setOnClickListener {
            toggleProvider(provider.id, categoriesContainer, expandIcon)
        }
        
        providerHeader.setOnKeyListener { _, keyCode, event ->
            if (event.action == KeyEvent.ACTION_DOWN) {
                when (keyCode) {
                    KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                        toggleProvider(provider.id, categoriesContainer, expandIcon)
                        true
                    }
                    KeyEvent.KEYCODE_DPAD_RIGHT -> {
                        // Expand and focus first category
                        if (!expandedProviders.contains(provider.id)) {
                            toggleProvider(provider.id, categoriesContainer, expandIcon)
                        }
                        // Focus first item inside
                        focusFirstInContainer(categoriesContainer)
                        true
                    }
                    KeyEvent.KEYCODE_DPAD_LEFT -> {
                        // Block left - we're at leftmost
                        true
                    }
                    KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN -> {
                        // Let default navigation handle it
                        false
                    }
                    else -> false
                }
            } else false
        }
        
        // Focus change for styling
        providerHeader.setOnFocusChangeListener { _, hasFocus ->
            providerName.setTextColor(if (hasFocus) 0xFF000000.toInt() else 0xFFFFFFFF.toInt())
            expandIcon.setColorFilter(if (hasFocus) 0xFF000000.toInt() else 0xFFFFFFFF.toInt())
        }
        
        // Build category sections based on current section filter
        Log.d(TAG, "Building categories for provider ${provider.name}, section: $currentSection")
        when (currentSection) {
            Section.LIVE_TV -> {
                if (providerData.liveCategories.isNotEmpty()) {
                    buildCategorySection(
                        dropdownView.findViewById(R.id.live_tv_section),
                        dropdownView.findViewById(R.id.live_tv_header),
                        dropdownView.findViewById(R.id.live_tv_categories),
                        "📺 Live TV",
                        providerData.liveCategories,
                        provider.id,
                        "live"
                    )
                }
            }
            Section.MOVIES -> {
                if (providerData.movieCategories.isNotEmpty()) {
                    // Add Continue Watching and Favourites at the top (categories already sorted with adult at bottom)
                    val categoriesWithExtras = listOf("▶️ Continue Watching", "⭐ Favourites") + providerData.movieCategories
                    Log.d(TAG, "🎬 Movies: Added ${categoriesWithExtras.size} categories (including Continue Watching & Favourites)")
                    buildCategorySection(
                        dropdownView.findViewById(R.id.movies_section),
                        dropdownView.findViewById(R.id.movies_header),
                        dropdownView.findViewById(R.id.movies_categories),
                        "🎬 Movies",
                        categoriesWithExtras,
                        provider.id,
                        "movie"
                    )
                }
            }
            Section.SERIES -> {
                if (providerData.seriesCategories.isNotEmpty()) {
                    // Add Continue Watching and Favourites at the top (categories already sorted with adult at bottom)
                    val categoriesWithExtras = listOf("▶️ Continue Watching", "⭐ Favourites") + providerData.seriesCategories
                    Log.d(TAG, "📺 Series: Added ${categoriesWithExtras.size} categories (including Continue Watching & Favourites)")
                    buildCategorySection(
                        dropdownView.findViewById(R.id.series_section),
                        dropdownView.findViewById(R.id.series_header),
                        dropdownView.findViewById(R.id.series_categories),
                        "📺 Series",
                        categoriesWithExtras,
                        provider.id,
                        "series"
                    )
                }
            }
            Section.SEARCH -> {
                // No categories for search
            }
        }
        
        providersContainer.addView(dropdownView)
    }
    
    /**
     * Build a category section (Live TV, Movies, or Series)
     * Note: Header is hidden since we show only one section type at a time
     */
    private fun buildCategorySection(
        sectionLayout: LinearLayout,
        headerView: TextView,
        categoriesLayout: LinearLayout,
        headerText: String,
        categories: List<String>,
        providerId: String,
        contentType: String
    ) {
        sectionLayout.visibility = View.VISIBLE
        // Hide section header since we only show one section at a time
        headerView.visibility = View.GONE
        categoriesLayout.removeAllViews()
        
        // Add category items directly (no header)
        categories.forEach { categoryName ->
            val categoryView = createCategoryItem(categoryName, providerId, contentType)
            categoriesLayout.addView(categoryView)
            focusableViews.add(categoryView)
        }
    }
    
    /**
     * Create a single category item view
     */
    private fun createCategoryItem(
        categoryName: String,
        providerId: String,
        contentType: String
    ): View {
        // The layout IS the TextView directly
        val textView = LayoutInflater.from(context)
            .inflate(R.layout.item_category_simple, null) as TextView
        
        textView.text = categoryName
        
        // Set layout params
        textView.layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        )
        
        textView.isFocusable = true
        textView.isFocusableInTouchMode = true
        
        // Click handler
        textView.setOnClickListener {
            onCategoryClicked(categoryName, providerId, contentType)
        }
        
        // Key handler
        textView.setOnKeyListener { view, keyCode, event ->
            if (event.action == KeyEvent.ACTION_DOWN) {
                when (keyCode) {
                    KeyEvent.KEYCODE_DPAD_LEFT -> true // Block left
                    KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                        onCategoryClicked(categoryName, providerId, contentType)
                        true
                    }
                    KeyEvent.KEYCODE_DPAD_UP -> {
                        // Find previous focusable sibling in dropdown
                        val parent = view.parent as? ViewGroup
                        if (parent != null) {
                            val index = parent.indexOfChild(view)
                            if (index == 0) {
                                // At first item in dropdown, block UP
                                Log.d(TAG, "Blocking UP at first dropdown category")
                                true
                            } else {
                                false // Allow normal navigation
                            }
                        } else false
                    }
                    KeyEvent.KEYCODE_DPAD_DOWN -> {
                        // Find next focusable sibling in dropdown
                        val parent = view.parent as? ViewGroup
                        if (parent != null) {
                            val index = parent.indexOfChild(view)
                            if (index == parent.childCount - 1) {
                                // At last item in dropdown, block DOWN
                                Log.d(TAG, "Blocking DOWN at last dropdown category")
                                true
                            } else {
                                false // Allow normal navigation
                            }
                        } else false
                    }
                    else -> false
                }
            } else false
        }
        
        // Focus change for styling
        textView.setOnFocusChangeListener { _, hasFocus ->
            textView.setTextColor(if (hasFocus) 0xFF000000.toInt() else 0xFFFFFFFF.toInt())
            if (hasFocus) {
                textView.isSelected = true
                // Scroll into view
                scrollToView(textView)
            } else {
                textView.isSelected = false
            }
        }
        
        return textView
    }
    
    /**
     * Toggle provider expansion
     */
    private fun toggleProvider(providerId: String, container: LinearLayout, icon: ImageView) {
        if (expandedProviders.contains(providerId)) {
            expandedProviders.remove(providerId)
            container.visibility = View.GONE
            icon.animate().rotation(0f).setDuration(200).start()
            Log.d(TAG, "Collapsed provider: $providerId")
        } else {
            expandedProviders.add(providerId)
            container.visibility = View.VISIBLE
            icon.animate().rotation(180f).setDuration(200).start()
            Log.d(TAG, "Expanded provider: $providerId")
        }
    }
    
    /**
     * Focus first focusable item inside a container
     */
    private fun focusFirstInContainer(container: ViewGroup) {
        for (i in 0 until container.childCount) {
            val child = container.getChildAt(i)
            if (child.isFocusable && child.visibility == View.VISIBLE) {
                child.requestFocus()
                return
            }
            if (child is ViewGroup) {
                focusFirstInContainer(child)
                return
            }
        }
    }
    
    /**
     * Scroll to make a view visible
     */
    private fun scrollToView(view: View) {
        providersScroll.post {
            val scrollY = view.top - providersScroll.height / 4
            providersScroll.smoothScrollTo(0, scrollY.coerceAtLeast(0))
        }
    }
    
    /**
     * Handle category click
     */
    private fun onCategoryClicked(categoryName: String, providerId: String, contentType: String) {
        Log.d(TAG, "Category clicked: $categoryName, provider: $providerId, type: $contentType")
        
        // Pass providerId directly to MainActivity - component will use it
        when (contentType) {
            "live" -> (context as? MainActivity)?.showLiveTVCategory(categoryName, providerId)
            "movie" -> (context as? MainActivity)?.showMoviesCategory(categoryName, providerId)
            "series" -> (context as? MainActivity)?.showSeriesCategory(categoryName, providerId)
        }
    }
    
    /**
     * Switch to section (called from MainActivity when main sidenav changes)
     */
    fun switchToSection(section: Section) {
        if (currentSection == section && providers.isNotEmpty()) {
            Log.d(TAG, "switchToSection: skipping, already on $section with ${providers.size} providers")
            return
        }
        
        Log.d(TAG, "Switching to section: $section")
        currentSection = section
        
        categoryTitle.text = when (section) {
            Section.LIVE_TV -> "Live TV"
            Section.MOVIES -> "Movies"
            Section.SERIES -> "Series"
            Section.SEARCH -> "Search"
        }
        
        // Rebuild dropdowns with new section filter
        buildProviderDropdowns()
    }
    
    /**
     * Get current section
     */
    fun getCurrentSection(): Section = currentSection
    
    /**
     * Request focus on first provider
     */
    fun focusFirstCategory() {
        providersContainer.post {
            if (focusableViews.isNotEmpty()) {
                focusableViews[0].requestFocus()
                Log.d(TAG, "Focus requested on first provider")
            }
        }
    }
    
    /**
     * Focus on a specific category
     */
    fun focusCategory(categoryName: String) {
        // Find and focus the category
        providersContainer.post {
            for (view in focusableViews) {
                val textView = view.findViewById<TextView>(R.id.category_name)
                if (textView?.text == categoryName) {
                    view.requestFocus()
                    scrollToView(view)
                    return@post
                }
            }
            // Fallback to first
            focusFirstCategory()
        }
    }
    
    /**
     * Refresh providers and categories
     */
    fun refreshCategories() {
        Log.d(TAG, "Refreshing categories")
        loadProviders()
    }
    
    /**
     * Callback for navigation back
     */
    private var onNavigateBackCallback: (() -> Unit)? = null
    
    fun setOnNavigateBackListener(callback: () -> Unit) {
        onNavigateBackCallback = callback
    }
    
    /**
     * Handle key events for navigation
     */
    fun handleKeyEvent(keyCode: Int, event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN) {
            when (keyCode) {
                KeyEvent.KEYCODE_DPAD_LEFT -> {
                    // Block LEFT - we're leftmost
                    Log.d(TAG, "LEFT blocked - sidebar is leftmost")
                    return true
                }
            }
        }
        return false
    }
}
