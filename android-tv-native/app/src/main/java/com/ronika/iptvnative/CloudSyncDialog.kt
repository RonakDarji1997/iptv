package com.ronika.iptvnative

import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.view.LayoutInflater
import android.widget.TextView

/**
 * Dialog to ask users if they want to enable cloud sync
 * Shows benefits and risks of enabling sync
 */
class CloudSyncDialog(private val context: Context) {
    
    companion object {
        const val REQUEST_CODE_CLOUD_AUTH = 1001
    }
    
    interface CloudSyncCallback {
        fun onEnableCloudSync()
        fun onDeclineCloudSync()
    }
    
    fun show(callback: CloudSyncCallback) {
        val builder = AlertDialog.Builder(context)
        val inflater = LayoutInflater.from(context)
        val dialogView = inflater.inflate(R.layout.dialog_cloud_sync, null)
        
        builder.setView(dialogView)
        
        val dialog = builder.create()
        
        // Setup buttons
        dialogView.findViewById<TextView>(R.id.btnEnableSync)?.setOnClickListener {
            dialog.dismiss()
            callback.onEnableCloudSync()
        }
        
        dialogView.findViewById<TextView>(R.id.btnDecline)?.setOnClickListener {
            dialog.dismiss()
            callback.onDeclineCloudSync()
        }
        
        dialog.setCancelable(false)
        dialog.show()
    }
    
    /**
     * Show simple confirmation dialog for existing users
     */
    fun showSimple(callback: CloudSyncCallback) {
        AlertDialog.Builder(context)
            .setTitle("Enable Cloud Sync?")
            .setMessage("""
                📱 Multi-Device Sync: Access your providers on any device
                ☁️ Cloud Backup: Never lose your configuration
                ⚙️ Settings Sync: Your preferences everywhere
                📺 Channel Favorites: Synced across devices
                
                ⚠️ Important: Without cloud sync, data is stored locally only.
                If you uninstall the app or reset the device, all data will be lost.
                
                Would you like to enable cloud sync?
            """.trimIndent())
            .setPositiveButton("Enable Cloud Sync") { dialog, _ ->
                dialog.dismiss()
                callback.onEnableCloudSync()
            }
            .setNegativeButton("Keep Local Only") { dialog, _ ->
                dialog.dismiss()
                callback.onDeclineCloudSync()
            }
            .setCancelable(false)
            .show()
    }
}
