package com.ronika.iptvnative.database.dao

import androidx.room.*
import com.ronika.iptvnative.database.entities.ProviderEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface ProviderDao {
    
    @Query("SELECT * FROM providers ORDER BY createdAt DESC")
    fun getAllProviders(): Flow<List<ProviderEntity>>
    
    @Query("SELECT * FROM providers ORDER BY createdAt DESC")
    suspend fun getAllProvidersList(): List<ProviderEntity>
    
    @Query("SELECT * FROM providers WHERE id = :id")
    suspend fun getProviderById(id: String): ProviderEntity?
    
    @Query("SELECT * FROM providers WHERE isActive = 1 LIMIT 1")
    suspend fun getActiveProvider(): ProviderEntity?
    
    @Query("SELECT * FROM providers WHERE isActive = 1")
    suspend fun getActiveProviders(): List<ProviderEntity>
    
    @Query("SELECT * FROM providers WHERE isActive = 1")
    fun getActiveProvidersFlow(): Flow<List<ProviderEntity>>
    
    @Query("SELECT * FROM providers WHERE isActive = 1 LIMIT 1")
    fun getActiveProviderFlow(): Flow<ProviderEntity?>
    
    @Query("SELECT COUNT(*) FROM providers WHERE isActive = 1")
    suspend fun getActiveProviderCount(): Int
    
    @Query("SELECT adultPassword FROM providers WHERE adultPassword IS NOT NULL AND adultPassword != '' LIMIT 1")
    suspend fun getAnyAdultPassword(): String?
    
    @Query("UPDATE providers SET isActive = :isActive WHERE id = :providerId")
    suspend fun updateProviderIsActive(providerId: String, isActive: Boolean)
    
    @Query("SELECT * FROM providers WHERE setupStep < 4 ORDER BY createdAt DESC LIMIT 1")
    suspend fun getPendingSetupProvider(): ProviderEntity?
    
    @Query("SELECT * FROM providers WHERE isConfigured = 1 ORDER BY createdAt DESC")
    suspend fun getConfiguredProviders(): List<ProviderEntity>
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertProvider(provider: ProviderEntity)
    
    @Update
    suspend fun updateProvider(provider: ProviderEntity)
    
    @Delete
    suspend fun deleteProvider(provider: ProviderEntity)
    
    @Query("DELETE FROM providers WHERE id = :id")
    suspend fun deleteProviderById(id: String)
    
    @Query("UPDATE providers SET isActive = 0")
    suspend fun deactivateAllProviders()
    
    @Query("UPDATE providers SET isActive = 1 WHERE id = :id")
    suspend fun activateProvider(id: String)
    
    @Query("UPDATE providers SET token = :token, updatedAt = :timestamp WHERE id = :id")
    suspend fun updateToken(id: String, token: String, timestamp: Long = System.currentTimeMillis())
    
    @Query("UPDATE providers SET setupStep = :step, updatedAt = :timestamp WHERE id = :id")
    suspend fun updateSetupStep(id: String, step: Int, timestamp: Long = System.currentTimeMillis())
    
    @Query("UPDATE providers SET isConfigured = 1, setupStep = 4, updatedAt = :timestamp WHERE id = :id")
    suspend fun markAsConfigured(id: String, timestamp: Long = System.currentTimeMillis())
    
    @Query("""
        UPDATE providers 
        SET selectedLiveTvCategories = :liveTv, 
            selectedMovieCategories = :movies, 
            selectedSeriesCategories = :series,
            updatedAt = :timestamp 
        WHERE id = :providerId
    """)
    suspend fun updateSelectedCategories(
        providerId: String, 
        liveTv: String, 
        movies: String, 
        series: String,
        timestamp: Long = System.currentTimeMillis()
    )
    
    @Query("UPDATE providers SET adultPassword = :pin, updatedAt = :timestamp WHERE id = :providerId")
    suspend fun updateAdultPassword(
        providerId: String,
        pin: String?,
        timestamp: Long = System.currentTimeMillis()
    )
    
    @Query("SELECT COUNT(*) FROM providers")
    suspend fun getProviderCount(): Int
    
    @Query("SELECT macAddress FROM providers WHERE macAddress IS NOT NULL")
    suspend fun getAllUsedMacAddresses(): List<String>
    
    @Query("SELECT * FROM providers WHERE type = 'stalker' AND isConfigured = 0 AND token IS NULL ORDER BY createdAt DESC LIMIT 1")
    suspend fun getPendingStalkerProvider(): ProviderEntity?
    
    /**
     * Set a provider as the active one (deactivates all others first)
     */
    @Transaction
    suspend fun setActiveProvider(providerId: String) {
        deactivateAllProviders()
        activateProvider(providerId)
    }
}
