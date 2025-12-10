package com.ronika.iptvnative.database.dao

import androidx.room.*
import com.ronika.iptvnative.database.entities.FavoriteEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface FavoriteDao {
    @Query("SELECT * FROM favorites ORDER BY addedAt DESC")
    suspend fun getAllFavorites(): List<FavoriteEntity>
    
    @Query("SELECT * FROM favorites ORDER BY addedAt DESC")
    fun getAllFavoritesFlow(): Flow<List<FavoriteEntity>>
    
    @Query("SELECT * FROM favorites WHERE itemType = :type AND providerId = :providerId ORDER BY addedAt DESC")
    suspend fun getFavoritesByType(type: String, providerId: String): List<FavoriteEntity>
    
    @Query("SELECT * FROM favorites WHERE itemId = :itemId AND itemType = :type AND providerId = :providerId")
    suspend fun getFavorite(itemId: String, type: String, providerId: String): FavoriteEntity?
    
    @Query("SELECT EXISTS(SELECT 1 FROM favorites WHERE itemId = :itemId AND itemType = :type AND providerId = :providerId)")
    suspend fun isFavorite(itemId: String, type: String, providerId: String): Boolean
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(favorite: FavoriteEntity)
    
    @Query("DELETE FROM favorites WHERE itemId = :itemId AND itemType = :type AND providerId = :providerId")
    suspend fun delete(itemId: String, type: String, providerId: String)
    
    @Delete
    suspend fun delete(favorite: FavoriteEntity)
    
    @Query("DELETE FROM favorites")
    suspend fun deleteAll()
}
