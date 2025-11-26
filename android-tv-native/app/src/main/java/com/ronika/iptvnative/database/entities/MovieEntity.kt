package com.ronika.iptvnative.database.entities

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "movies",
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
data class MovieEntity(
    @PrimaryKey
    val id: String, // UUID
    val externalId: String, // Provider's movie ID
    val name: String,
    val originalName: String? = null,
    val description: String? = null,
    val poster: String? = null,
    val screenshot: String? = null,
    val year: String? = null,
    val director: String? = null,
    val actors: String? = null,
    val country: String? = null,
    val ratingImdb: Float? = null,
    val ratingKinopoisk: Float? = null,
    val kinopoiskId: String? = null,
    val genreId: String? = null,
    val genres: String? = null,
    val duration: Int? = null, // minutes
    val durationSecs: Int? = null, // seconds
    val addedAt: Long? = null,
    val lastPlayed: Long? = null,
    val isHd: Boolean = false,
    val highQuality: Boolean = false,
    val censored: Boolean = false,
    val cmd: String? = null, // Playback command
    val categoryId: String? = null,
    val categoryName: String? = null,
    val isActive: Boolean = true,
    val isFavorite: Boolean = false,
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis()
)
