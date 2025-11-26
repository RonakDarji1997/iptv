package com.ronika.iptvnative.database.dao

import androidx.room.*
import com.ronika.iptvnative.database.entities.UserEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface UserDao {
    @Query("SELECT * FROM user LIMIT 1")
    suspend fun getUser(): UserEntity?
    
    @Query("SELECT * FROM user LIMIT 1")
    fun getUserFlow(): Flow<UserEntity?>
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertUser(user: UserEntity): Long
    
    @Update
    suspend fun updateUser(user: UserEntity)
    
    @Query("UPDATE user SET bearerToken = :token, tokenExpiry = :expiry WHERE id = :userId")
    suspend fun updateToken(userId: Int, token: String, expiry: Long)
    
    @Query("UPDATE user SET lastSync = :timestamp WHERE id = :userId")
    suspend fun updateLastSync(userId: Int, timestamp: Long)
    
    @Query("DELETE FROM user")
    suspend fun deleteAll()
}
