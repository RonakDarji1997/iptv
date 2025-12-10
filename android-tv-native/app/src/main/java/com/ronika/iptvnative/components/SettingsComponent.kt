package com.ronika.iptvnative.components

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.AttributeSet
import android.util.Log
import android.view.KeyEvent
import android.view.LayoutInflater
import android.view.View
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import com.ronika.iptvnative.R
import com.ronika.iptvnative.PortalSetupActivity
import com.ronika.iptvnative.database.AppDatabase
import com.ronika.iptvnative.database.entities.ProviderEntity
import com.ronika.iptvnative.sync.IPTVSyncService
import com.ronika.iptvnative.utils.AppPreferences
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Settings Component - Full settings UI with Playlist, Parental Control, and About sections
 * 
 * Navigation:
 * - Menu options (left side) -> Section content (right side)
 * - Back from section content -> Menu options
 * - Back from menu options -> Main sidenav
 */
class SettingsComponent @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : FrameLayout(context, attrs, defStyleAttr) {

    private val TAG = "SettingsComponent"
    
    private var onBackPressedCallback: (() -> Unit)? = null
    private var onManageCategoriesCallback: (() -> Unit)? = null
    private var onUpdatePlaylistCallback: (() -> Unit)? = null
    private var onProviderStatusChangedCallback: (() -> Unit)? = null
    
    // Track if focus is in content section
    private var isInContentSection = false
    
    // Menu items
    private lateinit var menuPlaylist: TextView
    private lateinit var menuParental: TextView
    private lateinit var menuPlayer: TextView
    private lateinit var menuAbout: TextView
    
    // Content sections
    private lateinit var contentPlaylist: ScrollView
    private lateinit var contentParental: ScrollView
    private lateinit var contentPlayer: ScrollView
    private lateinit var contentAbout: LinearLayout
    
    // Playlist section views
    private lateinit var btnManageCategories: LinearLayout
    private lateinit var btnSyncCategories: LinearLayout
    private lateinit var btnUpdatePlaylist: LinearLayout
    private lateinit var btnAddPlaylist: LinearLayout
    private lateinit var activePlaylistsContainer: LinearLayout
    private lateinit var lastUpdatedText: TextView
    private lateinit var syncStatusText: TextView
    
    // Player section views
    private lateinit var btnToggleBitrate: LinearLayout
    private lateinit var checkboxBitrate: android.widget.CheckBox
    private lateinit var seekTimeSlider: android.widget.SeekBar
    private lateinit var seekTimeValue: TextView
    
    // Parental section views
    private lateinit var parentalStatus: TextView
    private lateinit var btnChangePin: LinearLayout
    private lateinit var btnResetPin: LinearLayout
    
    // About section views (all portal info)
    private lateinit var appVersion: TextView
    private lateinit var aboutProviderName: TextView
    private lateinit var aboutProviderType: TextView
    private lateinit var aboutServerUrl: TextView
    private lateinit var aboutMacAddress: TextView
    private lateinit var aboutSerialNumber: TextView
    private lateinit var aboutCreatedAt: TextView
    
    private var currentSection = Section.PLAYLIST
    private var currentProvider: ProviderEntity? = null
    
    enum class Section {
        PLAYLIST, PARENTAL, PLAYER, ABOUT
    }
    
    private val database by lazy { AppDatabase.getDatabase(context) }
    private val coroutineScope = CoroutineScope(Dispatchers.Main)
    
    init {
        LayoutInflater.from(context).inflate(R.layout.component_settings, this, true)
        
        isFocusable = true
        isFocusableInTouchMode = true
        
        initViews()
        setupMenuListeners()
        setupButtonListeners()
        loadData()
        
        Log.d(TAG, "Settings component initialized")
    }
    
    private fun initViews() {
        // Menu items
        menuPlaylist = findViewById(R.id.menu_playlist)
        menuParental = findViewById(R.id.menu_parental)
        menuPlayer = findViewById(R.id.menu_player)
        menuAbout = findViewById(R.id.menu_about)
        
        // Content sections
        contentPlaylist = findViewById(R.id.content_playlist)
        contentParental = findViewById(R.id.content_parental)
        contentPlayer = findViewById(R.id.content_player)
        contentAbout = findViewById(R.id.content_about)
        
        // Playlist section views
        btnManageCategories = findViewById(R.id.btn_manage_categories)
        btnSyncCategories = findViewById(R.id.btn_sync_categories)
        btnUpdatePlaylist = findViewById(R.id.btn_update_playlist)
        btnAddPlaylist = findViewById(R.id.btn_add_playlist)
        activePlaylistsContainer = findViewById(R.id.active_playlists_container)
        lastUpdatedText = findViewById(R.id.last_updated_text)
        syncStatusText = findViewById(R.id.sync_status_text)
        
        // Player section
        btnToggleBitrate = findViewById(R.id.btn_toggle_bitrate)
        checkboxBitrate = findViewById(R.id.checkbox_bitrate)
        seekTimeSlider = findViewById(R.id.seek_time_slider)
        seekTimeValue = findViewById(R.id.seek_time_value)
        
        // Parental section
        parentalStatus = findViewById(R.id.parental_status)
        btnChangePin = findViewById(R.id.btn_change_pin)
        btnResetPin = findViewById(R.id.btn_reset_pin)
        
        // About section (all portal info)
        appVersion = findViewById(R.id.app_version)
        aboutProviderName = findViewById(R.id.about_provider_name)
        aboutProviderType = findViewById(R.id.about_provider_type)
        aboutServerUrl = findViewById(R.id.about_server_url)
        aboutMacAddress = findViewById(R.id.about_mac_address)
        aboutSerialNumber = findViewById(R.id.about_serial_number)
        aboutCreatedAt = findViewById(R.id.about_created_at)
    }
    
    private fun setupMenuListeners() {
        // Menu click switches section and moves focus to content
        menuPlaylist.setOnClickListener { 
            switchSection(Section.PLAYLIST)
            moveToSectionContent()
        }
        menuPlaylist.setOnFocusChangeListener { _, hasFocus ->
            menuPlaylist.setTextColor(if (hasFocus) 0xFF000000.toInt() else 0xFFFFFFFF.toInt())
            if (hasFocus) {
                updateMenuHighlight(Section.PLAYLIST)
                switchSection(Section.PLAYLIST)
                isInContentSection = false
            }
        }
        
        menuParental.setOnClickListener { 
            checkPasswordAndShowParental()
        }
        menuParental.setOnKeyListener { _, keyCode, event ->
            if (event.action == android.view.KeyEvent.ACTION_DOWN && 
                (keyCode == android.view.KeyEvent.KEYCODE_DPAD_CENTER || keyCode == android.view.KeyEvent.KEYCODE_ENTER)) {
                checkPasswordAndShowParental()
                true
            } else {
                false
            }
        }
        menuParental.setOnFocusChangeListener { _, hasFocus ->
            menuParental.setTextColor(if (hasFocus) 0xFF000000.toInt() else 0xFFFFFFFF.toInt())
            if (hasFocus) {
                updateMenuHighlight(Section.PARENTAL)
                // Don't auto-switch, require click
                isInContentSection = false
            }
        }
        
        menuPlayer.setOnClickListener { 
            switchSection(Section.PLAYER)
            moveToSectionContent()
        }
        menuPlayer.setOnFocusChangeListener { _, hasFocus ->
            menuPlayer.setTextColor(if (hasFocus) 0xFF000000.toInt() else 0xFFFFFFFF.toInt())
            if (hasFocus) {
                updateMenuHighlight(Section.PLAYER)
                switchSection(Section.PLAYER)
                isInContentSection = false
            }
        }
        
        menuAbout.setOnClickListener { 
            switchSection(Section.ABOUT)
            // About doesn't have focusable content, just scroll
        }
        menuAbout.setOnFocusChangeListener { _, hasFocus ->
            menuAbout.setTextColor(if (hasFocus) 0xFF000000.toInt() else 0xFFFFFFFF.toInt())
            if (hasFocus) {
                updateMenuHighlight(Section.ABOUT)
                switchSection(Section.ABOUT)
                isInContentSection = false
            }
        }
    }
    
    private fun setupButtonListeners() {
        // Track when buttons are focused
        val contentFocusListener = View.OnFocusChangeListener { _, hasFocus ->
            if (hasFocus) isInContentSection = true
        }
        
        btnManageCategories.onFocusChangeListener = contentFocusListener
        btnSyncCategories.onFocusChangeListener = contentFocusListener
        btnUpdatePlaylist.onFocusChangeListener = contentFocusListener
        btnAddPlaylist.onFocusChangeListener = contentFocusListener
        btnToggleBitrate.onFocusChangeListener = contentFocusListener
        seekTimeSlider.onFocusChangeListener = contentFocusListener
        btnChangePin.onFocusChangeListener = contentFocusListener
        btnResetPin.onFocusChangeListener = contentFocusListener
        
        // Playlist buttons
        btnManageCategories.setOnClickListener {
            // Open category selection (step 2 page)
            currentProvider?.let { provider ->
                val intent = Intent(context, PortalSetupActivity::class.java).apply {
                    putExtra("provider_id", provider.id)
                    putExtra("edit_categories", true)
                    putExtra("from_settings", true)
                }
                context.startActivity(intent)
            } ?: run {
                Toast.makeText(context, "No playlist configured", Toast.LENGTH_SHORT).show()
            }
        }
        
        btnSyncCategories.setOnClickListener {
            currentProvider?.let { provider ->
                syncCategoriesFromServer(provider.id)
            } ?: run {
                Toast.makeText(context, "No playlist configured", Toast.LENGTH_SHORT).show()
            }
        }
        
        btnUpdatePlaylist.setOnClickListener {
            Toast.makeText(context, "Updating playlist...", Toast.LENGTH_SHORT).show()
            onUpdatePlaylistCallback?.invoke()
        }
        
        btnAddPlaylist.setOnClickListener {
            // Launch portal setup for new playlist (step 1)
            val intent = Intent(context, PortalSetupActivity::class.java).apply {
                putExtra("add_new", true)
            }
            context.startActivity(intent)
        }
        
        // Player Settings buttons
        btnToggleBitrate.setOnClickListener {
            toggleBitrateDisplay()
        }
        
        // Seek time slider (10 sec to 10 min)
        seekTimeSlider.setOnSeekBarChangeListener(object : android.widget.SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(seekBar: android.widget.SeekBar?, progress: Int, fromUser: Boolean) {
                val seconds = 10 + progress // 0-590 -> 10-600
                updateSeekTimeDisplay(seconds)
            }
            
            override fun onStartTrackingTouch(seekBar: android.widget.SeekBar?) {}
            
            override fun onStopTrackingTouch(seekBar: android.widget.SeekBar?) {
                val seconds = 10 + (seekBar?.progress ?: 0)
                coroutineScope.launch {
                    AppPreferences.setSeekTimeSeconds(context, seconds)
                    Log.d(TAG, "Seek time saved: $seconds seconds")
                }
            }
        })
        
        // Parental buttons
        btnChangePin.setOnClickListener {
            showChangePinDialog()
        }
        
        btnResetPin.setOnClickListener {
            showResetPinDialog()
        }
    }
    
    private fun moveToSectionContent() {
        when (currentSection) {
            Section.PLAYLIST -> {
                // Focus first playlist item if available, otherwise Manage Categories
                if (activePlaylistsContainer.childCount > 0) {
                    activePlaylistsContainer.getChildAt(0).requestFocus()
                } else {
                    btnManageCategories.requestFocus()
                }
            }
            Section.PARENTAL -> btnChangePin.requestFocus()
            Section.PLAYER -> btnToggleBitrate.requestFocus()
            Section.ABOUT -> {
                // About is non-focusable, stay on menu
                menuAbout.requestFocus()
            }
        }
        isInContentSection = true
    }
    
    private fun moveToMenuOption() {
        when (currentSection) {
            Section.PLAYLIST -> menuPlaylist.requestFocus()
            Section.PARENTAL -> menuParental.requestFocus()
            Section.PLAYER -> menuPlayer.requestFocus()
            Section.ABOUT -> menuAbout.requestFocus()
        }
        isInContentSection = false
    }
    
    private fun switchSection(section: Section) {
        currentSection = section
        
        contentPlaylist.visibility = if (section == Section.PLAYLIST) View.VISIBLE else View.GONE
        contentParental.visibility = if (section == Section.PARENTAL) View.VISIBLE else View.GONE
        contentPlayer.visibility = if (section == Section.PLAYER) View.VISIBLE else View.GONE
        contentAbout.visibility = if (section == Section.ABOUT) View.VISIBLE else View.GONE
        
        updateMenuHighlight(section)
    }
    
    private fun updateMenuHighlight(section: Section) {
        menuPlaylist.isSelected = section == Section.PLAYLIST
        menuParental.isSelected = section == Section.PARENTAL
        menuPlayer.isSelected = section == Section.PLAYER
        menuAbout.isSelected = section == Section.ABOUT
    }
    
    private fun populateActivePlaylists(providers: List<ProviderEntity>) {
        Log.d(TAG, "populateActivePlaylists called with ${providers.size} providers")
        activePlaylistsContainer.removeAllViews()
        
        if (providers.isEmpty()) {
            Log.d(TAG, "No providers to show")
            // No playlists - show a message
            val noPlaylistText = TextView(context).apply {
                text = "No playlists configured"
                setTextColor(0xFF888888.toInt())
                textSize = 14f
                setPadding(0, 0, 0, 16)
            }
            activePlaylistsContainer.addView(noPlaylistText)
            return
        }
        
        for ((index, provider) in providers.withIndex()) {
            Log.d(TAG, "Adding provider: ${provider.name} (isActive: ${provider.isActive}, isConfigured: ${provider.isConfigured})")
            val itemView = LayoutInflater.from(context).inflate(R.layout.item_playlist_toggle, activePlaylistsContainer, false)
            
            // Generate unique IDs for focus navigation
            itemView.id = View.generateViewId()
            
            val checkbox = itemView.findViewById<android.widget.CheckBox>(R.id.playlist_checkbox)
            val nameText = itemView.findViewById<TextView>(R.id.playlist_name)
            val typeBadge = itemView.findViewById<TextView>(R.id.playlist_type_badge)
            val urlText = itemView.findViewById<TextView>(R.id.playlist_url)
            val deleteBtn = itemView.findViewById<android.widget.ImageView>(R.id.btn_delete_playlist)
            
            nameText.text = provider.name
            urlText.text = provider.serverUrl
            checkbox.isChecked = provider.isActive
            
            // Set type badge
            typeBadge.text = provider.type.uppercase()
            
            // Handle item click to toggle
            itemView.setOnClickListener {
                toggleProvider(provider, checkbox)
            }
            
            // Handle delete button
            deleteBtn.setOnClickListener {
                showDeleteConfirmation(provider)
            }
            
            deleteBtn.setOnFocusChangeListener { _, hasFocus ->
                if (hasFocus) isInContentSection = true
            }
            
            // Handle D-pad navigation
            itemView.setOnKeyListener { _, keyCode, event ->
                if (event.action == KeyEvent.ACTION_DOWN) {
                    when (keyCode) {
                        KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                            toggleProvider(provider, checkbox)
                            true
                        }
                        KeyEvent.KEYCODE_DPAD_RIGHT -> {
                            deleteBtn.requestFocus()
                            true
                        }
                        else -> false
                    }
                } else false
            }
            
            // Handle focus change
            itemView.onFocusChangeListener = View.OnFocusChangeListener { _, hasFocus ->
                if (hasFocus) isInContentSection = true
            }
            
            activePlaylistsContainer.addView(itemView)
        }
        
        // Set up navigation between playlist items
        for (i in 0 until activePlaylistsContainer.childCount) {
            val currentItem = activePlaylistsContainer.getChildAt(i)
            
            if (i > 0) {
                val prevItem = activePlaylistsContainer.getChildAt(i - 1)
                currentItem.nextFocusUpId = prevItem.id
            }
            // First item: don't set nextFocusUpId - will be blocked by dispatchKeyEvent
            
            if (i < activePlaylistsContainer.childCount - 1) {
                val nextItem = activePlaylistsContainer.getChildAt(i + 1)
                currentItem.nextFocusDownId = nextItem.id
            } else {
                // Last item navigates DOWN to btnManageCategories
                currentItem.nextFocusDownId = btnManageCategories.id
                btnManageCategories.nextFocusUpId = currentItem.id
            }
        }
    }
    
    private fun toggleProvider(provider: ProviderEntity, checkbox: android.widget.CheckBox) {
        coroutineScope.launch {
            val activeCount = withContext(Dispatchers.IO) {
                database.providerDao().getActiveProviderCount()
            }
            
            // Prevent disabling if it's the only active provider
            if (provider.isActive && activeCount <= 1) {
                Toast.makeText(context, "At least one playlist must be active", Toast.LENGTH_SHORT).show()
                return@launch
            }
            
            // Toggle the provider
            val newState = !provider.isActive
            withContext(Dispatchers.IO) {
                database.providerDao().updateProviderIsActive(provider.id, newState)
            }
            
            checkbox.isChecked = newState
            
            val message = if (newState) "Playlist enabled" else "Playlist disabled"
            Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
            
            // Notify that provider status changed so categories can update
            onProviderStatusChangedCallback?.invoke()
        }
    }
    
    private fun showDeleteConfirmation(provider: ProviderEntity) {
        AlertDialog.Builder(context)
            .setTitle("Delete Playlist")
            .setMessage("Are you sure you want to delete '${provider.name}'? This cannot be undone.")
            .setPositiveButton("Delete") { _, _ ->
                deleteProvider(provider)
            }
            .setNegativeButton("Cancel", null)
            .show()
    }
    
    private fun deleteProvider(provider: ProviderEntity) {
        coroutineScope.launch {
            val providerCount = withContext(Dispatchers.IO) {
                database.providerDao().getProviderCount()
            }
            
            // Delete the provider
            withContext(Dispatchers.IO) {
                database.providerDao().deleteProviderById(provider.id)
                
                // If this was the only active provider, activate another one
                if (provider.isActive) {
                    val remaining = database.providerDao().getAllProvidersList()
                    if (remaining.isNotEmpty() && remaining.none { it.isActive }) {
                        database.providerDao().updateProviderIsActive(remaining.first().id, true)
                    }
                }
            }
            
            // Check if this was the last provider
            if (providerCount <= 1) {
                // Clear the "configured" flag so app starts from Step 1
                PortalSetupActivity.clearConfiguration(context)
                
                Toast.makeText(context, "All playlists removed. Restarting setup...", Toast.LENGTH_SHORT).show()
                
                // Navigate to PortalSetupActivity
                val intent = Intent(context, PortalSetupActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                }
                context.startActivity(intent)
                (context as? Activity)?.finish()
            } else {
                Toast.makeText(context, "Playlist deleted", Toast.LENGTH_SHORT).show()
                loadData()
            }
        }
    }
    
    private fun checkPasswordAndShowParental() {
        coroutineScope.launch {
            // Check if any password is set globally
            val existingPassword = withContext(Dispatchers.IO) {
                database.providerDao().getAnyAdultPassword()
            }
            
            if (existingPassword.isNullOrEmpty()) {
                // No password set, go directly to settings
                switchSection(Section.PARENTAL)
                moveToSectionContent()
            } else {
                // Password is set, require it to access parental settings
                showPasswordVerificationDialog {
                    switchSection(Section.PARENTAL)
                    moveToSectionContent()
                }
            }
        }
    }
    
    private fun showPasswordVerificationDialog(onSuccess: () -> Unit) {
        val inputLayout = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(50, 20, 50, 20)
        }
        
        val pinInput = EditText(context).apply {
            hint = "Enter current PIN"
            inputType = android.text.InputType.TYPE_CLASS_NUMBER or android.text.InputType.TYPE_NUMBER_VARIATION_PASSWORD
        }
        
        inputLayout.addView(pinInput)
        
        AlertDialog.Builder(context)
            .setTitle("Enter Parental PIN")
            .setMessage("Enter your PIN to access parental control settings")
            .setView(inputLayout)
            .setPositiveButton("Verify") { _, _ ->
                val enteredPin = pinInput.text.toString()
                
                coroutineScope.launch {
                    val existingPassword = withContext(Dispatchers.IO) {
                        database.providerDao().getAnyAdultPassword()
                    }
                    
                    if (enteredPin == existingPassword) {
                        onSuccess()
                    } else {
                        Toast.makeText(context, "Incorrect PIN", Toast.LENGTH_SHORT).show()
                    }
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }
    
    private fun showChangePinDialog() {
        val inputLayout = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(50, 20, 50, 20)
        }
        
        val currentPinInput = EditText(context).apply {
            hint = "Current PIN (if set)"
            inputType = android.text.InputType.TYPE_CLASS_NUMBER or android.text.InputType.TYPE_NUMBER_VARIATION_PASSWORD
        }
        
        val newPinInput = EditText(context).apply {
            hint = "New PIN (4 digits)"
            inputType = android.text.InputType.TYPE_CLASS_NUMBER or android.text.InputType.TYPE_NUMBER_VARIATION_PASSWORD
        }
        
        val confirmPinInput = EditText(context).apply {
            hint = "Confirm PIN"
            inputType = android.text.InputType.TYPE_CLASS_NUMBER or android.text.InputType.TYPE_NUMBER_VARIATION_PASSWORD
        }
        
        inputLayout.addView(currentPinInput)
        inputLayout.addView(newPinInput)
        inputLayout.addView(confirmPinInput)
        
        AlertDialog.Builder(context)
            .setTitle("Change Parental PIN")
            .setView(inputLayout)
            .setPositiveButton("Save") { _, _ ->
                val currentPin = currentPinInput.text.toString()
                val newPin = newPinInput.text.toString()
                val confirmPin = confirmPinInput.text.toString()
                
                coroutineScope.launch {
                    // Get existing global password
                    val existingPassword = withContext(Dispatchers.IO) {
                        database.providerDao().getAnyAdultPassword()
                    }
                    
                    // Validate current PIN if one exists
                    if (!existingPassword.isNullOrEmpty() && existingPassword != currentPin) {
                        Toast.makeText(context, "Current PIN is incorrect", Toast.LENGTH_SHORT).show()
                        return@launch
                    }
                    
                    if (newPin.length != 4) {
                        Toast.makeText(context, "PIN must be 4 digits", Toast.LENGTH_SHORT).show()
                        return@launch
                    }
                    
                    if (newPin != confirmPin) {
                        Toast.makeText(context, "PINs don't match", Toast.LENGTH_SHORT).show()
                        return@launch
                    }
                    
                    // Update PIN for ALL providers (global PIN)
                    withContext(Dispatchers.IO) {
                        val allProviders = database.providerDao().getAllProvidersList()
                        for (provider in allProviders) {
                            database.providerDao().updateAdultPassword(provider.id, newPin)
                        }
                    }
                    Toast.makeText(context, "PIN updated for all playlists", Toast.LENGTH_SHORT).show()
                    loadData()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }
    
    private fun showResetPinDialog() {
        coroutineScope.launch {
            val existingPassword = withContext(Dispatchers.IO) {
                database.providerDao().getAnyAdultPassword()
            }
            
            if (existingPassword.isNullOrEmpty()) {
                Toast.makeText(context, "No PIN is set", Toast.LENGTH_SHORT).show()
                return@launch
            }
            
            val inputLayout = LinearLayout(context).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(50, 20, 50, 20)
            }
            
            val currentPinInput = EditText(context).apply {
                hint = "Enter current PIN to remove"
                inputType = android.text.InputType.TYPE_CLASS_NUMBER or android.text.InputType.TYPE_NUMBER_VARIATION_PASSWORD
            }
            
            inputLayout.addView(currentPinInput)
            
            AlertDialog.Builder(context)
                .setTitle("Remove Parental PIN")
                .setMessage("This will remove parental protection from adult content for all playlists.")
                .setView(inputLayout)
                .setPositiveButton("Remove") { _, _ ->
                    val currentPin = currentPinInput.text.toString()
                    
                    coroutineScope.launch {
                        val existingPwd = withContext(Dispatchers.IO) {
                            database.providerDao().getAnyAdultPassword()
                        }
                        
                        if (existingPwd != currentPin) {
                            Toast.makeText(context, "Incorrect PIN", Toast.LENGTH_SHORT).show()
                            return@launch
                        }
                        
                        // Remove PIN from ALL providers
                        withContext(Dispatchers.IO) {
                            val allProviders = database.providerDao().getAllProvidersList()
                            for (provider in allProviders) {
                                database.providerDao().updateAdultPassword(provider.id, null)
                            }
                        }
                        Toast.makeText(context, "PIN removed from all playlists", Toast.LENGTH_SHORT).show()
                        loadData()
                    }
                }
                .setNegativeButton("Cancel", null)
                .show()
        }
    }
    
    private fun loadData() {
        coroutineScope.launch {
            try {
                // Load provider data
                val provider = withContext(Dispatchers.IO) {
                    database.providerDao().getActiveProvider()
                }
                currentProvider = provider
                
                val allProviders = withContext(Dispatchers.IO) {
                    database.providerDao().getAllProvidersList()
                }
                Log.d(TAG, "All providers: ${allProviders.size}, configured: ${allProviders.count { it.isConfigured }}")
                
                // Filter to only show configured (connected) providers
                val configuredProviders = allProviders.filter { it.isConfigured }
                Log.d(TAG, "Configured providers to show: ${configuredProviders.map { it.name }}")
                
                // Load player settings
                checkboxBitrate.isChecked = AppPreferences.shouldShowBitrate(context)
                val seekTimeSeconds = AppPreferences.getSeekTimeSeconds(context)
                seekTimeSlider.progress = seekTimeSeconds - 10 // Convert back to 0-590
                updateSeekTimeDisplay(seekTimeSeconds)
                
                // Update UI
                updatePlaylistSection(provider, configuredProviders.size)
                populateActivePlaylists(configuredProviders)
                updateParentalSection(provider)
                updateAboutSection(provider)
                
            } catch (e: Exception) {
                Log.e(TAG, "Error loading settings data", e)
            }
        }
    }
    
    private fun updateSeekTimeDisplay(seconds: Int) {
        when {
            seconds < 60 -> seekTimeValue.text = "$seconds sec"
            seconds % 60 == 0 -> seekTimeValue.text = "${seconds / 60} min"
            else -> {
                val minutes = seconds / 60
                val remainingSeconds = seconds % 60
                seekTimeValue.text = "${minutes}:${remainingSeconds.toString().padStart(2, '0')} min"
            }
        }
    }
    
    private fun updatePlaylistSection(provider: ProviderEntity?, providerCount: Int) {
        if (provider != null) {
            provider.lastSyncAt?.let {
                val date = SimpleDateFormat("MMM dd, yyyy HH:mm", Locale.getDefault()).format(Date(it))
                lastUpdatedText.text = "Last updated: $date"
            }
        }
    }
    
    private fun updateParentalSection(provider: ProviderEntity?) {
        // Check global password status (any provider)
        coroutineScope.launch {
            val existingPassword = withContext(Dispatchers.IO) {
                database.providerDao().getAnyAdultPassword()
            }
            
            if (!existingPassword.isNullOrEmpty()) {
                parentalStatus.text = "PIN Protected"
                parentalStatus.setTextColor(0xFF4CAF50.toInt())
            } else {
                parentalStatus.text = "Not Set"
                parentalStatus.setTextColor(0xFFFF5722.toInt())
            }
        }
    }
    
    private fun updateAboutSection(provider: ProviderEntity?) {
        // App version
        try {
            val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            appVersion.text = "v${packageInfo.versionName}"
        } catch (e: Exception) {
            appVersion.text = "v1.0.0"
        }
        
        // Provider info (all portal details)
        if (provider != null) {
            aboutProviderName.text = provider.name
            aboutProviderType.text = provider.type.uppercase()
            aboutServerUrl.text = provider.serverUrl
            aboutMacAddress.text = provider.macAddress ?: "-"
            aboutSerialNumber.text = provider.serialNumber ?: "-"
            
            val createdDate = SimpleDateFormat("MMM dd, yyyy HH:mm", Locale.getDefault()).format(Date(provider.createdAt))
            aboutCreatedAt.text = createdDate
        } else {
            aboutProviderName.text = "-"
            aboutProviderType.text = "-"
            aboutServerUrl.text = "-"
            aboutMacAddress.text = "-"
            aboutSerialNumber.text = "-"
            aboutCreatedAt.text = "-"
        }
    }
    
    fun setOnBackPressedListener(callback: () -> Unit) {
        onBackPressedCallback = callback
    }
    
    fun setOnManageCategoriesListener(callback: () -> Unit) {
        onManageCategoriesCallback = callback
    }
    
    fun setOnUpdatePlaylistListener(callback: () -> Unit) {
        onUpdatePlaylistCallback = callback
    }
    
    fun setOnProviderStatusChangedListener(callback: () -> Unit) {
        onProviderStatusChangedCallback = callback
    }
    
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN) {
            when (event.keyCode) {
                KeyEvent.KEYCODE_BACK -> {
                    val focusedView = findFocus()
                    val isOnMenu = focusedView == menuPlaylist || focusedView == menuParental || focusedView == menuPlayer || focusedView == menuAbout
                    
                    if (isInContentSection && !isOnMenu) {
                        // Back from content section -> menu option
                        Log.d(TAG, "Back from content to menu")
                        moveToMenuOption()
                        return true
                    } else {
                        // Back from menu -> main sidenav
                        Log.d(TAG, "Back from menu to sidenav")
                        onBackPressedCallback?.invoke()
                        return true
                    }
                }
                KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                    // If menu item is focused, move to content
                    val focusedView = findFocus()
                    if (focusedView == menuPlaylist || focusedView == menuParental || focusedView == menuPlayer || focusedView == menuAbout) {
                        if (event.keyCode == KeyEvent.KEYCODE_DPAD_RIGHT || 
                            event.keyCode == KeyEvent.KEYCODE_DPAD_CENTER ||
                            event.keyCode == KeyEvent.KEYCODE_ENTER) {
                            // Parental requires password check first
                            if (focusedView == menuParental) {
                                checkPasswordAndShowParental()
                                return true
                            }
                            moveToSectionContent()
                            return true
                        }
                    }
                }
                KeyEvent.KEYCODE_DPAD_LEFT -> {
                    // If content button is focused, move back to menu
                    val focusedView = findFocus()
                    val isOnMenu = focusedView == menuPlaylist || focusedView == menuParental || focusedView == menuPlayer || focusedView == menuAbout
                    if (!isOnMenu) {
                        moveToMenuOption()
                        return true
                    }
                }
                KeyEvent.KEYCODE_DPAD_DOWN -> {
                    // Prevent focus from escaping to main sidenav when at bottom
                    val focusedView = findFocus()
                    val isOnMenu = focusedView == menuPlaylist || focusedView == menuParental || focusedView == menuPlayer || focusedView == menuAbout
                    
                    // If on menu About (bottom item), consume to prevent escape
                    if (focusedView == menuAbout || 
                        // Last items in each section - btnAddPlaylist is now at bottom
                        focusedView == btnResetPin ||
                        focusedView == btnAddPlaylist) {
                        return true  // Consume event, don't let focus escape
                    }
                }
                KeyEvent.KEYCODE_DPAD_UP -> {
                    // Prevent focus from escaping upward
                    val focusedView = findFocus()
                    if (focusedView == menuPlaylist ||
                        focusedView == btnChangePin) {
                        return true  // Consume event at top items
                    }
                    
                    // Check if focus is on first playlist item (top of playlist section)
                    if (activePlaylistsContainer.childCount > 0) {
                        val firstPlaylistItem = activePlaylistsContainer.getChildAt(0)
                        if (focusedView == firstPlaylistItem || firstPlaylistItem?.findFocus() != null) {
                            return true // Consume event at top of playlist list
                        }
                    } else if (focusedView == btnManageCategories) {
                        // No playlists, btnManageCategories is top
                        return true
                    }
                }
            }
        }
        return super.dispatchKeyEvent(event)
    }
    
    fun requestInitialFocus() {
        post {
            menuPlaylist.requestFocus()
            isInContentSection = false
            Log.d(TAG, "Settings menu playlist focused: ${menuPlaylist.isFocused}")
        }
    }
    
    fun refresh() {
        loadData()
    }
    
    private fun syncCategoriesFromServer(providerId: String) {
        syncStatusText.text = "Syncing with server..."
        syncStatusText.setTextColor(0xFFFFA500.toInt()) // Orange
        
        coroutineScope.launch {
            try {
                val syncService = IPTVSyncService(context)
                
                // Step 1: Upload local data to server (all providers and categories)
                syncStatusText.text = "Uploading local data to server..."
                val uploadSuccess = syncService.syncToServer()
                
                // Step 2: Download any new data from server (merge without duplicates)
                syncStatusText.text = "Downloading data from server..."
                syncService.syncFromCloud()
                
                withContext(Dispatchers.Main) {
                    if (uploadSuccess) {
                        syncStatusText.text = "Sync completed successfully!"
                        syncStatusText.setTextColor(0xFF4CAF50.toInt()) // Green
                        Toast.makeText(context, "All data synced with server!", Toast.LENGTH_SHORT).show()
                        
                        // Reset status text after 3 seconds
                        postDelayed({
                            syncStatusText.text = "Sync with server (backup & restore)"
                            syncStatusText.setTextColor(0xFF888888.toInt())
                        }, 3000)
                        
                        // Refresh provider list and UI
                        loadData()
                        onProviderStatusChangedCallback?.invoke()
                    } else {
                        syncStatusText.text = "Sync failed - check authentication"
                        syncStatusText.setTextColor(0xFFF44336.toInt()) // Red
                        Toast.makeText(context, "Sync failed - please login first", Toast.LENGTH_SHORT).show()
                        
                        postDelayed({
                            syncStatusText.text = "Sync with server (backup & restore)"
                            syncStatusText.setTextColor(0xFF888888.toInt())
                        }, 3000)
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error syncing", e)
                withContext(Dispatchers.Main) {
                    syncStatusText.text = "Sync error: ${e.message}"
                    syncStatusText.setTextColor(0xFFF44336.toInt())
                    Toast.makeText(context, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
                    
                    postDelayed({
                        syncStatusText.text = "Sync with server (backup & restore)"
                        syncStatusText.setTextColor(0xFF888888.toInt())
                    }, 3000)
                }
            }
        }
    }
    
    private fun toggleBitrateDisplay() {
        val newState = !checkboxBitrate.isChecked
        checkboxBitrate.isChecked = newState
        
        coroutineScope.launch {
            AppPreferences.setShowBitrate(context, newState)
        }
        
        val message = if (newState) {
            "Bitrate info will be displayed during playback"
        } else {
            "Bitrate info hidden"
        }
        Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
        Log.d(TAG, "Bitrate display toggled: $newState")
    }
}
