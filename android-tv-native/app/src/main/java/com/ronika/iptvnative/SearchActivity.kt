package com.ronika.iptvnative

import android.content.Intent
import android.os.Bundle
import android.view.KeyEvent
import android.widget.EditText
import android.widget.ProgressBar
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.ronika.iptvnative.adapters.ChannelAdapter
import com.ronika.iptvnative.api.ApiClient
import com.ronika.iptvnative.models.Channel
import kotlinx.coroutines.launch
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay

class SearchActivity : ComponentActivity() {
    
    private lateinit var searchInput: EditText
    private lateinit var searchRecycler: RecyclerView
    private lateinit var searchProgress: ProgressBar
    private lateinit var searchEmpty: TextView
    private lateinit var searchError: TextView
    
    private lateinit var searchAdapter: ChannelAdapter
    private val searchResults = mutableListOf<Channel>()
    
    private var searchJob: Job? = null
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_search)
        
        searchInput = findViewById(R.id.search_input)
        searchRecycler = findViewById(R.id.search_results_recycler)
        searchProgress = findViewById(R.id.search_progress)
        searchEmpty = findViewById(R.id.search_empty)
        searchError = findViewById(R.id.search_error)
        
        setupRecyclerView()
        setupSearchInput()
        
        // Auto-focus on search input
        searchInput.requestFocus()
    }
    
    private fun setupRecyclerView() {
        searchAdapter = ChannelAdapter(
            onChannelSelected = { channel ->
                handleChannelSelected(channel)
            },
            onChannelFocused = { channel ->
                // No preview needed
            }
        )
        
        searchRecycler.apply {
            layoutManager = GridLayoutManager(this@SearchActivity, 5)
            adapter = searchAdapter
            isFocusable = false
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
                    KeyEvent.KEYCODE_DPAD_DOWN -> {
                        if (searchResults.isNotEmpty()) {
                            searchRecycler.requestFocus()
                            searchRecycler.post {
                                searchRecycler.getChildAt(0)?.requestFocus()
                            }
                            return@setOnKeyListener true
                        }
                    }
                }
            }
            false
        }
    }
    
    private fun performSearch(query: String) {
        // Cancel previous search
        searchJob?.cancel()
        
        if (query.length < 2) {
            searchResults.clear()
            searchAdapter.setChannels(searchResults)
            searchEmpty.visibility = android.view.View.VISIBLE
            searchEmpty.text = "Type at least 2 characters to search"
            searchError.visibility = android.view.View.GONE
            searchProgress.visibility = android.view.View.GONE
            return
        }
        
        searchEmpty.visibility = android.view.View.GONE
        searchError.visibility = android.view.View.GONE
        searchProgress.visibility = android.view.View.VISIBLE
        
        searchJob = lifecycleScope.launch {
            // Debounce: wait 300ms before searching
            delay(300)
            
            try {
                android.util.Log.d("SearchActivity", "Searching for: $query")
                val credentials = ApiClient.getCredentials()
                android.util.Log.d("SearchActivity", "Using credentials: mac=${credentials.mac}, url=${credentials.url}")
                
                val response = ApiClient.apiService.searchContent(
                    com.ronika.iptvnative.api.SearchRequest(
                        mac = credentials.mac,
                        url = credentials.url,
                        query = query,
                        page = 1
                    )
                )
                
                android.util.Log.d("SearchActivity", "Search results: ${response.data.size} items")
                
                searchResults.clear()
                // Convert Movie objects to Channel objects
                val channels = response.data.map { movie ->
                    Channel(
                        id = movie.id,
                        name = movie.name,
                        number = null,
                        logo = movie.screenshotUri,
                        cmd = movie.cmd,
                        genreId = movie.categoryId,
                        isLive = false
                    )
                }
                searchResults.addAll(channels)
                searchAdapter.setChannels(searchResults)
                
                searchProgress.visibility = android.view.View.GONE
                
                if (searchResults.isEmpty()) {
                    searchEmpty.visibility = android.view.View.VISIBLE
                    searchEmpty.text = "No results found"
                } else {
                    searchEmpty.visibility = android.view.View.GONE
                }
                
            } catch (e: Exception) {
                android.util.Log.e("SearchActivity", "Search error: ${e.message}", e)
                searchProgress.visibility = android.view.View.GONE
                searchError.text = "Search failed: ${e.message}"
                searchError.visibility = android.view.View.VISIBLE
            }
        }
    }
    
    private fun handleChannelSelected(channel: Channel) {
        android.util.Log.d("SearchActivity", "Channel selected: ${channel.name}, isLive=${channel.isLive}")
        
        // Check if it's a series by checking the stored data
        val movie = searchResults.find { it.id == channel.id }
        
        // For now, return to MainActivity and let it handle the playback
        val resultIntent = Intent().apply {
            putExtra("CHANNEL_ID", channel.id)
            putExtra("CHANNEL_NAME", channel.name)
            putExtra("CHANNEL_CMD", channel.cmd)
            putExtra("CHANNEL_LOGO", channel.logo)
        }
        setResult(RESULT_OK, resultIntent)
        finish()
    }
    
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        when (keyCode) {
            KeyEvent.KEYCODE_BACK -> {
                finish()
                return true
            }
            KeyEvent.KEYCODE_DPAD_UP -> {
                if (searchRecycler.hasFocus()) {
                    val firstVisiblePosition = (searchRecycler.layoutManager as? GridLayoutManager)?.findFirstVisibleItemPosition() ?: -1
                    if (firstVisiblePosition in 0..4) { // First row (5 columns)
                        searchInput.requestFocus()
                        return true
                    }
                }
            }
        }
        return super.onKeyDown(keyCode, event)
    }
}
