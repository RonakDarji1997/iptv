package com.ronika.iptvnative.database.entities

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "user")
data class UserEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Int = 0,
    val username: String,
    val email: String,
    val password: String? = null, // Stored for token refresh
    val bearerToken: String,
    val tokenExpiry: Long, // Unix timestamp
    val lastSync: Long? = null, // Unix timestamp
    val cloudUserId: String? = null, // Cloud user ID from backend
    val cloudEnabled: Boolean = false, // Whether cloud sync is enabled
    val subscriptionEnabled: Boolean = false, // Whether subscription features are enabled
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis()
)
