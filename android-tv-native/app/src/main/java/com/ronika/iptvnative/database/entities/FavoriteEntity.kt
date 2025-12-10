package com.ronika.iptvnative.database.entities

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "favorites",
    indices = [
        Index(value = ["itemId", "itemType", "providerId"], unique = true),
        Index(value = ["providerId"])
    ]
)
data class FavoriteEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Int = 0,
    val itemId: String, // Channel/Movie/Series ID
    val itemType: String, // LIVE, MOVIE, SERIES
    val providerId: String, // Provider ID for filtering
    val itemName: String = "", // Name of the item
    val itemPoster: String? = null, // Poster URL
    val itemCmd: String? = null, // Playback command (for movies)
    val addedAt: Long = System.currentTimeMillis()
)
