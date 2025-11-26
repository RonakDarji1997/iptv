package com.ronika.iptvnative.database.entities

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "series",
    indices = [
        Index(value = ["externalId"], unique = true),
        Index(value = ["categoryId"]),
        Index(value = ["name"])
    ],
    foreignKeys = [
        ForeignKey(
            entity = CategoryEntity::class,
            parentColumns = ["id"],
            childColumns = ["categoryId"],
            onDelete = ForeignKey.SET_NULL
        )
    ]
)
data class SeriesEntity(
    @PrimaryKey
    val id: String, // UUID
    val externalId: String, // Provider's series ID
    val name: String,
    val originalName: String? = null,
    val description: String? = null,
    val poster: String? = null,
    val screenshot: String? = null,
    val year: String? = null,
    val yearEnd: String? = null,
    val director: String? = null,
    val actors: String? = null,
    val country: String? = null,
    val ratingImdb: Float? = null,
    val ratingKinopoisk: Float? = null,
    val kinopoiskId: String? = null,
    val genreId: String? = null,
    val genres: String? = null,
    val episodeCount: Int = 0,
    val addedAt: Long? = null,
    val lastPlayed: Long? = null,
    val isHd: Boolean = false,
    val highQuality: Boolean = false,
    val censored: Boolean = false,
    val cmd: String? = null,
    val categoryId: String? = null,
    val categoryName: String? = null,
    val seasonsJson: String? = null, // JSON array of seasons
    val isActive: Boolean = true,
    val isFavorite: Boolean = false,
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis()
)
