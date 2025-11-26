package com.ronika.iptvnative.database.dao

import androidx.room.*
import com.ronika.iptvnative.database.entities.ChannelEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface ChannelDao {
    @Query("SELECT * FROM channels WHERE isActive = 1 ORDER BY name ASC")
    suspend fun getAllChannels(): List<ChannelEntity>
    
    @Query("SELECT * FROM channels WHERE isActive = 1 ORDER BY name ASC")
    fun getAllChannelsFlow(): Flow<List<ChannelEntity>>
    
    @Query("SELECT * FROM channels WHERE categoryId = :categoryId AND isActive = 1 ORDER BY name ASC")
    suspend fun getChannelsByCategory(categoryId: String): List<ChannelEntity>
    
    @Query("SELECT * FROM channels WHERE categoryId = :categoryId AND isActive = 1 ORDER BY name ASC")
    fun getChannelsByCategoryFlow(categoryId: String): Flow<List<ChannelEntity>>
    
    @Query("SELECT * FROM channels WHERE id = :id")
    suspend fun getChannelById(id: String): ChannelEntity?
    
    @Query("SELECT * FROM channels WHERE isFavorite = 1 AND isActive = 1 ORDER BY name ASC")
    suspend fun getFavoriteChannels(): List<ChannelEntity>
    
    @Query("SELECT * FROM channels WHERE name LIKE '%' || :query || '%' AND isActive = 1 ORDER BY name ASC")
    suspend fun searchChannels(query: String): List<ChannelEntity>
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(channels: List<ChannelEntity>)
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(channel: ChannelEntity)
    
    @Update
    suspend fun update(channel: ChannelEntity)
    
    @Query("UPDATE channels SET isFavorite = :isFavorite WHERE id = :channelId")
    suspend fun updateFavorite(channelId: String, isFavorite: Boolean)
    
    @Delete
    suspend fun delete(channel: ChannelEntity)
    
    @Query("DELETE FROM channels")
    suspend fun deleteAll()
    
    @Query("SELECT COUNT(*) FROM channels WHERE isActive = 1")
    suspend fun getCount(): Int
    
    @Query("SELECT COUNT(*) FROM channels WHERE categoryId = :categoryId AND isActive = 1")
    suspend fun getCountByCategory(categoryId: String): Int
}
