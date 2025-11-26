package com.ronika.iptvnative.database.entities

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "channels",
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
data class ChannelEntity(
    @PrimaryKey
    val id: String, // UUID
    val externalId: String, // Provider's channel ID
    val name: String,
    val number: String? = null,
    val logo: String? = null,
    val cmd: String? = null, // Stream command
    val categoryId: String? = null,
    val categoryName: String? = null,
    val epgChannelId: String? = null,
    val isActive: Boolean = true,
    val isFavorite: Boolean = false,
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis()
)
