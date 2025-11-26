package com.ronika.iptvnative.database.entities

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "favorites",
    indices = [
        Index(value = ["itemId", "itemType"], unique = true)
    ]
)
data class FavoriteEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Int = 0,
    val itemId: String, // Channel/Movie/Series ID
    val itemType: String, // LIVE, MOVIE, SERIES
    val addedAt: Long = System.currentTimeMillis()
)
