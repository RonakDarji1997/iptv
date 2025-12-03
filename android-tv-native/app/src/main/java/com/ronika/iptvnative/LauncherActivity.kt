package com.ronika.iptvnative

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity

/**
 * LauncherActivity - Entry point that routes to Portal Setup or Main Activity
 * 
 * Checks if portal is already configured:
 * - If configured: Go directly to MainActivity
 * - If not configured: Show PortalSetupActivity
 */
class LauncherActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Check if portal is configured
        val isConfigured = PortalSetupActivity.isPortalConfigured(this)
        
        val intent = if (isConfigured) {
            // Portal is configured, go to main app
            Intent(this, MainActivity::class.java)
        } else {
            // Portal not configured, show setup screen
            Intent(this, PortalSetupActivity::class.java)
        }
        
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(intent)
        finish()
    }
}
