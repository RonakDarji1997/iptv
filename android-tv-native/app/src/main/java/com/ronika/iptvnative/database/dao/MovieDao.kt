package com.ronika.iptvnative.database.dao

import androidx.room.*
import com.ronika.iptvnative.database.entities.MovieEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface MovieDao {
    @Query("SELECT * FROM movies WHERE isActive = 1 ORDER BY addedAt DESC LIMIT :limit OFFSET :offset")
    suspend fun getMovies(limit: Int, offset: Int): List<MovieEntity>
    
    @Query("SELECT * FROM movies WHERE categoryId = :categoryId AND isActive = 1 ORDER BY addedAt DESC LIMIT :limit OFFSET :offset")
    suspend fun getMoviesByCategory(categoryId: String, limit: Int, offset: Int): List<MovieEntity>
    
    @Query("SELECT * FROM movies WHERE categoryId = :categoryId AND isActive = 1 ORDER BY addedAt DESC")
    fun getMoviesByCategoryFlow(categoryId: String): Flow<List<MovieEntity>>
    
    @Query("SELECT * FROM movies WHERE id = :id")
    suspend fun getMovieById(id: String): MovieEntity?
    
    @Query("SELECT * FROM movies WHERE isFavorite = 1 AND isActive = 1 ORDER BY addedAt DESC")
    suspend fun getFavoriteMovies(): List<MovieEntity>
    
    @Query("SELECT * FROM movies WHERE name LIKE '%' || :query || '%' AND isActive = 1 ORDER BY name ASC LIMIT 50")
    suspend fun searchMovies(query: String): List<MovieEntity>
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(movies: List<MovieEntity>)
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(movie: MovieEntity)
    
    @Update
    suspend fun update(movie: MovieEntity)
    
    @Query("UPDATE movies SET isFavorite = :isFavorite WHERE id = :movieId")
    suspend fun updateFavorite(movieId: String, isFavorite: Boolean)
    
    @Query("UPDATE movies SET lastPlayed = :timestamp WHERE id = :movieId")
    suspend fun updateLastPlayed(movieId: String, timestamp: Long)
    
    @Delete
    suspend fun delete(movie: MovieEntity)
    
    @Query("DELETE FROM movies")
    suspend fun deleteAll()
    
    @Query("SELECT COUNT(*) FROM movies WHERE isActive = 1")
    suspend fun getCount(): Int
    
    @Query("SELECT COUNT(*) FROM movies WHERE categoryId = :categoryId AND isActive = 1")
    suspend fun getCountByCategory(categoryId: String): Int
}
