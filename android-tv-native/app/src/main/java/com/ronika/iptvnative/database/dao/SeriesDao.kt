package com.ronika.iptvnative.database.dao

import androidx.room.*
import com.ronika.iptvnative.database.entities.SeriesEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface SeriesDao {
    @Query("SELECT * FROM series WHERE isActive = 1 ORDER BY addedAt DESC LIMIT :limit OFFSET :offset")
    suspend fun getSeries(limit: Int, offset: Int): List<SeriesEntity>
    
    @Query("SELECT * FROM series WHERE categoryId = :categoryId AND isActive = 1 ORDER BY addedAt DESC LIMIT :limit OFFSET :offset")
    suspend fun getSeriesByCategory(categoryId: String, limit: Int, offset: Int): List<SeriesEntity>
    
    @Query("SELECT * FROM series WHERE categoryId = :categoryId AND isActive = 1 ORDER BY addedAt DESC")
    fun getSeriesByCategoryFlow(categoryId: String): Flow<List<SeriesEntity>>
    
    @Query("SELECT * FROM series WHERE id = :id")
    suspend fun getSeriesById(id: String): SeriesEntity?
    
    @Query("SELECT * FROM series WHERE isFavorite = 1 AND isActive = 1 ORDER BY addedAt DESC")
    suspend fun getFavoriteSeries(): List<SeriesEntity>
    
    @Query("SELECT * FROM series WHERE name LIKE '%' || :query || '%' AND isActive = 1 ORDER BY name ASC LIMIT 50")
    suspend fun searchSeries(query: String): List<SeriesEntity>
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(series: List<SeriesEntity>)
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(series: SeriesEntity)
    
    @Update
    suspend fun update(series: SeriesEntity)
    
    @Query("UPDATE series SET isFavorite = :isFavorite WHERE id = :seriesId")
    suspend fun updateFavorite(seriesId: String, isFavorite: Boolean)
    
    @Query("UPDATE series SET lastPlayed = :timestamp WHERE id = :seriesId")
    suspend fun updateLastPlayed(seriesId: String, timestamp: Long)
    
    @Delete
    suspend fun delete(series: SeriesEntity)
    
    @Query("DELETE FROM series")
    suspend fun deleteAll()
    
    @Query("SELECT COUNT(*) FROM series WHERE isActive = 1")
    suspend fun getCount(): Int
    
    @Query("SELECT COUNT(*) FROM series WHERE categoryId = :categoryId AND isActive = 1")
    suspend fun getCountByCategory(categoryId: String): Int
}
