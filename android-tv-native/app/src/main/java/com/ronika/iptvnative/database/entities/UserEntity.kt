package com.ronika.iptvnative.database.entities

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "user")
data class UserEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Int = 0,
    val username: String,
    val email: String,
    val portalUrl: String,
    val mac: String,
    val bearerToken: String,
    val tokenExpiry: Long, // Unix timestamp
    val lastSync: Long? = null, // Unix timestamp
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis()
)
