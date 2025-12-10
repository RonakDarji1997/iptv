package com.ronika.iptvnative.database.entities

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Provider entity - stores IPTV provider configurations
 * Supports multiple providers (M3U, Xtream, Stalker)
 */
@Entity(tableName = "providers")
data class ProviderEntity(
    @PrimaryKey
    val id: String, // UUID
    
    // User association (optional - for cloud sync)
    val userId: Int? = null,
    
    // Provider type: "m3u", "xtream", "stalker"
    val type: String,
    
    // Display name for the provider
    val name: String,
    
    // Connection details
    val serverUrl: String,
    val macAddress: String? = null,        // For Stalker
    val serialNumber: String? = null,      // For Stalker (generated)
    val username: String? = null,          // For Xtream/Stalker
    val password: String? = null,          // For Xtream/Stalker
    
    // Authentication
    val token: String? = null,             // Bearer token for Stalker
    val tokenExpiry: Long? = null,         // Token expiration timestamp
    
    // Setup state
    val setupStep: Int = 1,                // 1=connect, 2=categories, 3=adult_pass, 4=complete
    val isActive: Boolean = true,          // Currently active provider
    val isConfigured: Boolean = false,     // Fully configured
    
    // Content settings
    val includeTv: Boolean = true,
    val includeVod: Boolean = true,
    val adultPassword: String? = null,     // Password for adult content
    
    // Selected category IDs (comma-separated)
    val selectedLiveTvCategories: String? = null,   // e.g. "1,2,3,5,8"
    val selectedMovieCategories: String? = null,    // e.g. "42,43,44"
    val selectedSeriesCategories: String? = null,   // e.g. "10,11,12"
    
    // Timestamps
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis(),
    val lastSyncAt: Long? = null
)
