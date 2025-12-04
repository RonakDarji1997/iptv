package com.ronika.iptvnative.utils

import android.content.Context
import com.ronika.iptvnative.database.AppDatabase
import com.ronika.iptvnative.database.entities.PlayerSettingsEntity
import kotlinx.coroutines.runBlocking

/**
 * App-wide preferences manager using Room database
 */
object AppPreferences {
    
    private fun getDatabase(context: Context) = AppDatabase.getDatabase(context)
    
    /**
     * Get player settings, creating default if not exists
     */
    private fun getPlayerSettings(context: Context): PlayerSettingsEntity = runBlocking {
        val dao = getDatabase(context).playerSettingsDao()
        var settings = dao.getPlayerSettings()
        
        if (settings == null) {
            // Create default settings
            settings = PlayerSettingsEntity()
            dao.insertSettings(settings)
        }
        
        settings
    }
    
    /**
     * Check if bitrate info should be displayed
     */
    fun shouldShowBitrate(context: Context): Boolean {
        return getPlayerSettings(context).showBitrateInfo
    }
    
    /**
     * Set whether to show bitrate info
     */
    suspend fun setShowBitrate(context: Context, show: Boolean) {
        val dao = getDatabase(context).playerSettingsDao()
        val settings = dao.getPlayerSettings() ?: PlayerSettingsEntity()
        dao.insertSettings(settings.copy(showBitrateInfo = show))
    }
    
    /**
     * Get seek time in seconds
     */
    fun getSeekTimeSeconds(context: Context): Int {
        return getPlayerSettings(context).seekTimeSeconds
    }
    
    /**
     * Set seek time in seconds (10-600)
     */
    suspend fun setSeekTimeSeconds(context: Context, seconds: Int) {
        val dao = getDatabase(context).playerSettingsDao()
        val settings = dao.getPlayerSettings() ?: PlayerSettingsEntity()
        dao.insertSettings(settings.copy(seekTimeSeconds = seconds))
    }
}
