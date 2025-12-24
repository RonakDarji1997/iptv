package com.ronika.iptvnative

import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.ronika.iptvnative.sync.IPTVSyncService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Activity for cloud authentication
 * Allows users to login/register for cloud sync
 */
class CloudAuthActivity : AppCompatActivity() {
    
    companion object {
        private const val TAG = "CloudAuthActivity"
        const val EXTRA_IS_NEW_USER = "is_new_user"
        const val EXTRA_UPLOAD_EXISTING = "upload_existing"
    }
    
    private lateinit var etEmail: EditText
    private lateinit var etPassword: EditText
    private lateinit var btnLogin: Button
    private lateinit var btnRegister: Button
    private lateinit var btnSkip: Button
    private lateinit var progressBar: ProgressBar
    private lateinit var tvStatus: TextView
    private lateinit var tvInfo: TextView
    
    private var isNewUser = false
    private var uploadExisting = false
    private var showSkipOption = false
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_cloud_auth)
        
        isNewUser = intent.getBooleanExtra(EXTRA_IS_NEW_USER, false)
        uploadExisting = intent.getBooleanExtra(EXTRA_UPLOAD_EXISTING, false)
        showSkipOption = intent.getBooleanExtra("SHOW_SKIP_OPTION", false)
        
        initViews()
        setupListeners()
        
        // Show appropriate message
        if (isNewUser) {
            tvInfo.text = "🌟 New User Setup\n\nCreate an account to enable cloud sync and access your providers on any device."
        } else if (uploadExisting) {
            tvInfo.text = "☁️ Cloud Sync Setup\n\nLogin or register to backup your existing providers to the cloud."
        } else {
            tvInfo.text = "🔐 Cloud Authentication\n\nLogin to sync your data across devices."
        }
    }
    
    private fun initViews() {
        etEmail = findViewById(R.id.etEmail)
        etPassword = findViewById(R.id.etPassword)
        btnLogin = findViewById(R.id.btnLogin)
        btnRegister = findViewById(R.id.btnRegister)
        btnSkip = findViewById(R.id.btnSkip)
        progressBar = findViewById(R.id.progressBar)
        tvStatus = findViewById(R.id.tvStatus)
        tvInfo = findViewById(R.id.tvInfo)
        
        // Show skip button only if this is first-time setup
        btnSkip.visibility = if (showSkipOption) View.VISIBLE else View.GONE
    }
    
    private fun setupListeners() {
        btnLogin.setOnClickListener {
            authenticateUser(isRegistration = false)
        }
        
        btnRegister.setOnClickListener {
            authenticateUser(isRegistration = true)
        }
        
        btnSkip.setOnClickListener {
            // Mark as configured and go to portal setup
            val syncPrefs = getSharedPreferences("iptv_sync_prefs", MODE_PRIVATE)
            syncPrefs.edit().putBoolean("cloud_sync_configured", true).apply()
            
            val intent = android.content.Intent(this, PortalSetupActivity::class.java)
            intent.flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK or android.content.Intent.FLAG_ACTIVITY_CLEAR_TASK
            startActivity(intent)
            finish()
        }
    }
    
    private fun authenticateUser(isRegistration: Boolean) {
        val email = etEmail.text.toString().trim()
        val password = etPassword.text.toString().trim()
        
        if (email.isEmpty() || password.isEmpty()) {
            Toast.makeText(this, "Please enter email and password", Toast.LENGTH_SHORT).show()
            return
        }
        
        if (!android.util.Patterns.EMAIL_ADDRESS.matcher(email).matches()) {
            Toast.makeText(this, "Please enter a valid email", Toast.LENGTH_SHORT).show()
            return
        }
        
        if (password.length < 6) {
            Toast.makeText(this, "Password must be at least 6 characters", Toast.LENGTH_SHORT).show()
            return
        }
        
        showLoading(true)
        tvStatus.text = if (isRegistration) "Creating account..." else "Logging in..."
        
        lifecycleScope.launch {
            try {
                // Save cloud sync preference
                val prefs = getSharedPreferences("iptv_sync_prefs", MODE_PRIVATE)
                prefs.edit().putBoolean("cloud_sync_enabled", true).putBoolean("cloud_sync_configured", true).apply()
                
                // Login and fetch providers from cloud
                tvStatus.text = "☁️ Logging in and fetching providers..."
                val cloudSyncManager = com.ronika.iptvnative.managers.CloudSyncManager(this@CloudAuthActivity)
                val deviceId = android.provider.Settings.Secure.getString(
                    contentResolver,
                    android.provider.Settings.Secure.ANDROID_ID
                )
                
                // Use loginAndFetchProviders for new users signing in with cloud
                val linkResult = cloudSyncManager.loginAndFetchProviders(
                    email = email,
                    password = password,
                    deviceId = deviceId,
                    deviceName = android.os.Build.MODEL
                )
                
                if (linkResult.isFailure) {
                    val errorMsg = linkResult.exceptionOrNull()?.message ?: "Unknown error"
                    Log.e(TAG, "❌ Cloud login failed: $errorMsg")
                    withContext(Dispatchers.Main) {
                        tvStatus.text = "❌ Failed to login"
                        Toast.makeText(
                            this@CloudAuthActivity,
                            "Login failed: $errorMsg",
                            Toast.LENGTH_LONG
                        ).show()
                        showLoading(false)
                    }
                    return@launch
                }
                
                Log.d(TAG, "✅ Login successful - user and providers synced")
                
                // Small delay to ensure database writes are complete
                delay(100)
                
                tvStatus.text = "✅ Login successful!"
                
                withContext(Dispatchers.Main) {
                    Toast.makeText(
                        this@CloudAuthActivity,
                        "Cloud sync enabled successfully!",
                        Toast.LENGTH_SHORT
                    ).show()
                    
                    // After login, check if we have providers
                    val database = com.ronika.iptvnative.database.AppDatabase.getDatabase(this@CloudAuthActivity)
                    val providers = withContext(Dispatchers.IO) { database.providerDao().getAllProvidersList() }
                    
                    Log.d(TAG, "📊 Found ${providers.size} providers in database")
                    
                    if (providers.isNotEmpty()) {
                        // Route to PortalSetupActivity for category selection (step 2)
                        val intent = android.content.Intent(this@CloudAuthActivity, PortalSetupActivity::class.java)
                        intent.flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK or android.content.Intent.FLAG_ACTIVITY_CLEAR_TASK
                        intent.putExtra("from_cloud_sync", true)
                        intent.putExtra("provider_id", providers.first().id)
                        Log.d(TAG, "🚀 Starting PortalSetupActivity with provider_id=${providers.first().id}")
                        startActivity(intent)
                        finish()
                    } else {
                        // No providers in cloud - go to portal setup to add one
                        Log.d(TAG, "⚠️ No providers found - going to portal setup")
                        val intent = android.content.Intent(this@CloudAuthActivity, PortalSetupActivity::class.java)
                        intent.flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK or android.content.Intent.FLAG_ACTIVITY_CLEAR_TASK
                        startActivity(intent)
                        finish()
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Authentication error", e)
                withContext(Dispatchers.Main) {
                    tvStatus.text = "❌ Error: ${e.message}"
                    Toast.makeText(
                        this@CloudAuthActivity,
                        "Error: ${e.message}",
                        Toast.LENGTH_LONG
                    ).show()
                    showLoading(false)
                }
            }
        }
    }
    
    private fun showLoading(show: Boolean) {
        progressBar.visibility = if (show) View.VISIBLE else View.GONE
        btnLogin.isEnabled = !show
        btnRegister.isEnabled = !show
        etEmail.isEnabled = !show
        etPassword.isEnabled = !show
    }
}
