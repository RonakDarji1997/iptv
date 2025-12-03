package com.ronika.iptvnative.database.entities

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "categories",
    indices = [
        Index(value = ["externalId", "providerId"], unique = true),
        Index(value = ["providerId"])
    ],
    foreignKeys = [
        ForeignKey(
            entity = ProviderEntity::class,
            parentColumns = ["id"],
            childColumns = ["providerId"],
            onDelete = ForeignKey.CASCADE
        )
    ]
)
data class CategoryEntity(
    @PrimaryKey
    val id: String, // UUID
    val providerId: String, // Foreign key to provider
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
    val isEnabled: Boolean = true, // User can enable/disable categories
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis()
)
