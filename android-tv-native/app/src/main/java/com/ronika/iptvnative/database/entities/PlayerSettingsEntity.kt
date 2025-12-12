package com.ronika.iptvnative.database.entities

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "player_settings")
data class PlayerSettingsEntity(
    @PrimaryKey val id: Int = 1, // Single row for global settings
    val showBitrateInfo: Boolean = true,
    val seekTimeSeconds: Int = 10, // 10 seconds to 600 seconds (10 min)
    // Remember the last-played live channel and provider so we can resume on app start
    val lastLiveChannelId: String? = null,
    val lastProviderId: String? = null
)

