package com.ronika.iptvnative

import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import com.ronika.iptvnative.database.AppDatabase
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * LauncherActivity - Entry point that routes based on setup state
 * 
 * Flow:
 * 1. If providers exist -> Go to MainActivity
 * 2. If no providers but cloud sync configured -> Go to PortalSetupActivity
 * 3. If no providers and no cloud sync -> Show CloudAuthActivity (skippable)
 */
class LauncherActivity : ComponentActivity() {
    
    private val TAG = "LauncherActivity"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Log.d(TAG, "onCreate() called")
        
        lifecycleScope.launch {
            try {
                val syncPrefs = getSharedPreferences("iptv_sync_prefs", MODE_PRIVATE)
                val cloudSyncConfigured = syncPrefs.getBoolean("cloud_sync_configured", false)
                Log.d(TAG, "cloudSyncConfigured=$cloudSyncConfigured")
                
                // Check if providers exist
                Log.d(TAG, "Getting database instance...")
                val database = AppDatabase.getDatabase(this@LauncherActivity)
                Log.d(TAG, "Querying providers...")
                val providers = withContext(Dispatchers.IO) {
                    database.providerDao().getAllProvidersList()
                }
                Log.d(TAG, "Found ${providers.size} providers: ${providers.map { it.name }}")
                
                val intent = when {
                    // Has providers -> Go to main app
                    providers.isNotEmpty() -> {
                        Log.d(TAG, "Routing to MainActivity (providers exist)")
                        Intent(this@LauncherActivity, MainActivity::class.java)
                    }
                    // No providers but cloud sync was configured (user declined or logged in before)
                    cloudSyncConfigured -> {
                        Log.d(TAG, "Routing to PortalSetupActivity (cloud sync configured)")
                        Intent(this@LauncherActivity, PortalSetupActivity::class.java)
                    }
                    // First time - show cloud sync option (skippable)
                    else -> {
                        Log.d(TAG, "Routing to CloudAuthActivity (first time)")
                        Intent(this@LauncherActivity, CloudAuthActivity::class.java).apply {
                            putExtra(CloudAuthActivity.EXTRA_IS_NEW_USER, true)
                            putExtra(CloudAuthActivity.EXTRA_UPLOAD_EXISTING, false)
                            putExtra("SHOW_SKIP_OPTION", true)  // Allow skip
                        }
                    }
                }
                
                intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                startActivity(intent)
                finish()
            } catch (e: Exception) {
                Log.e(TAG, "Error in onCreate", e)
                // Default to CloudAuthActivity on error
                val intent = Intent(this@LauncherActivity, CloudAuthActivity::class.java).apply {
                    putExtra(CloudAuthActivity.EXTRA_IS_NEW_USER, true)
                    putExtra(CloudAuthActivity.EXTRA_UPLOAD_EXISTING, false)
                    putExtra("SHOW_SKIP_OPTION", true)
                }
                intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                startActivity(intent)
                finish()
            }
        }
    }
}
