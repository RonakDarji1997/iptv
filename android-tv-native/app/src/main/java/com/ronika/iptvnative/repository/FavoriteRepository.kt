package com.ronika.iptvnative.repository

import android.content.Context
import android.util.Log
import com.ronika.iptvnative.database.AppDatabase
import com.ronika.iptvnative.database.entities.FavoriteEntity
import kotlinx.coroutines.flow.Flow

/**
 * Repository for managing favorite movies and series
 */
class FavoriteRepository(context: Context) {
    
    private val TAG = "FavoriteRepository"
    private val favoriteDao = AppDatabase.getDatabase(context).favoriteDao()
    private val movieDao = AppDatabase.getDatabase(context).movieDao()
    private val seriesDao = AppDatabase.getDatabase(context).seriesDao()
    
    companion object {
        const val TYPE_MOVIE = "MOVIE"
        const val TYPE_SERIES = "SERIES"
        const val TYPE_LIVE = "LIVE"
    }
    
    /**
     * Check if an item is a favorite
     */
    suspend fun isFavorite(itemId: String, type: String): Boolean {
        return favoriteDao.isFavorite(itemId, type)
    }
    
    /**
     * Add an item to favorites with full details
     */
    suspend fun addFavorite(itemId: String, type: String, name: String = "", poster: String? = null, cmd: String? = null) {
        val favorite = FavoriteEntity(
            itemId = itemId,
            itemType = type,
            itemName = name,
            itemPoster = poster,
            itemCmd = cmd,
            addedAt = System.currentTimeMillis()
        )
        favoriteDao.insert(favorite)
        Log.d(TAG, "Added favorite: $name (id=$itemId, type=$type)")
    }
    
    /**
     * Remove an item from favorites
     */
    suspend fun removeFavorite(itemId: String, type: String) {
        favoriteDao.delete(itemId, type)
        Log.d(TAG, "Removed favorite: id=$itemId, type=$type")
    }
    
    /**
     * Toggle favorite status - returns new favorite state
     */
    suspend fun toggleFavorite(itemId: String, type: String, name: String = "", poster: String? = null, cmd: String? = null): Boolean {
        val isFav = isFavorite(itemId, type)
        if (isFav) {
            removeFavorite(itemId, type)
            return false
        } else {
            addFavorite(itemId, type, name, poster, cmd)
            return true
        }
    }
    
    /**
     * Get all favorites as a Flow
     */
    fun getAllFavoritesFlow(): Flow<List<FavoriteEntity>> {
        return favoriteDao.getAllFavoritesFlow()
    }
    
    /**
     * Get favorites by type
     */
    suspend fun getFavoritesByType(type: String): List<FavoriteEntity> {
        return favoriteDao.getFavoritesByType(type)
    }
    
    /**
     * Get favorite movies with their full details (from FavoriteEntity directly)
     */
    suspend fun getFavoriteMovies(): List<MovieWithFavorite> {
        val favorites = favoriteDao.getFavoritesByType(TYPE_MOVIE)
        Log.d(TAG, "Getting favorite movies: ${favorites.size} found")
        return favorites.map { fav ->
            MovieWithFavorite(
                id = fav.itemId,
                name = fav.itemName,
                posterUrl = fav.itemPoster,
                cmd = fav.itemCmd,
                categoryId = null,
                addedAt = fav.addedAt
            )
        }
    }
    
    /**
     * Get favorite series with their full details (from FavoriteEntity directly)
     */
    suspend fun getFavoriteSeries(): List<SeriesWithFavorite> {
        val favorites = favoriteDao.getFavoritesByType(TYPE_SERIES)
        Log.d(TAG, "Getting favorite series: ${favorites.size} found")
        return favorites.map { fav ->
            SeriesWithFavorite(
                id = fav.itemId,
                name = fav.itemName,
                posterUrl = fav.itemPoster,
                categoryId = null,
                addedAt = fav.addedAt
            )
        }
    }
    
    /**
     * Delete all favorites
     */
    suspend fun deleteAll() {
        favoriteDao.deleteAll()
    }
}

data class MovieWithFavorite(
    val id: String,
    val name: String,
    val posterUrl: String?,
    val cmd: String?,
    val categoryId: String?,
    val addedAt: Long
)

data class SeriesWithFavorite(
    val id: String,
    val name: String,
    val posterUrl: String?,
    val categoryId: String?,
    val addedAt: Long
)
