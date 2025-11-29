package com.ronika.iptvnative.database.entities

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "categories",
    indices = [Index(value = ["externalId"], unique = true)]
)
data class CategoryEntity(
    @PrimaryKey
    val id: String, // UUID
    val externalId: String, // Provider's category ID
    val name: String,
    val title: String? = null, // Alternative name
    val contentType: String, // "movie" or "series"
    val itemCount: Int = 0,
    val lastUpdated: Long = System.currentTimeMillis(),
    val alias: String? = null,
    val censored: Int = 0, // 0 = not censored, 1 = adult content
    val type: String, // LIVE, MOVIE, SERIES
    val parentId: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis()
)
