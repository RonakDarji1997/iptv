package com.ronika.iptvnative.database.dao

import androidx.room.*
import com.ronika.iptvnative.database.entities.CategoryEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface CategoryDao {
    @Query("SELECT * FROM categories WHERE type = :type ORDER BY name ASC")
    suspend fun getCategoriesByType(type: String): List<CategoryEntity>
    
    @Query("SELECT * FROM categories WHERE type = :type AND isEnabled = 1 ORDER BY name ASC")
    suspend fun getEnabledCategoriesByType(type: String): List<CategoryEntity>
    
    @Query("SELECT * FROM categories WHERE type = :type ORDER BY name ASC")
    fun getCategoriesByTypeFlow(type: String): Flow<List<CategoryEntity>>
    
    @Query("SELECT * FROM categories WHERE id = :id")
    suspend fun getCategoryById(id: String): CategoryEntity?
    
    @Query("SELECT * FROM categories WHERE externalId = :externalId AND type = :type LIMIT 1")
    suspend fun getCategoryByExternalId(externalId: String, type: String): CategoryEntity?
    
    @Query("SELECT * FROM categories ORDER BY type, name ASC")
    suspend fun getAllCategories(): List<CategoryEntity>
    
    @Query("SELECT * FROM categories WHERE name = :name LIMIT 1")
    suspend fun getCategoryByName(name: String): CategoryEntity?
    
    @Query("SELECT * FROM categories WHERE name = :name AND type = :type LIMIT 1")
    suspend fun getCategoryByName(name: String, type: String): CategoryEntity?
    
    @Query("SELECT * FROM categories WHERE name = :name AND providerId = :providerId LIMIT 1")
    suspend fun getCategoryByNameAndProvider(name: String, providerId: String): CategoryEntity?
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(categories: List<CategoryEntity>)
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(category: CategoryEntity)
    
    // Alias for insertAll to match MainActivity usage
    @Transaction
    suspend fun insertCategories(categories: List<CategoryEntity>) {
        insertAll(categories)
    }
    
    @Update
    suspend fun update(category: CategoryEntity)
    
    @Update
    suspend fun updateAll(categories: List<CategoryEntity>)
    
    @Delete
    suspend fun delete(category: CategoryEntity)
    
    @Query("DELETE FROM categories")
    suspend fun deleteAll()
    
    @Query("DELETE FROM categories WHERE providerId = :providerId")
    suspend fun deleteByProviderId(providerId: String)
    
    @Query("SELECT * FROM categories WHERE providerId = :providerId ORDER BY type, name ASC")
    suspend fun getCategoriesByProviderId(providerId: String): List<CategoryEntity>
    
    @Query("SELECT * FROM categories WHERE providerId = :providerId AND isEnabled = 1 ORDER BY type, name ASC")
    suspend fun getEnabledCategoriesByProviderId(providerId: String): List<CategoryEntity>
    
    @Query("UPDATE categories SET isEnabled = :isEnabled WHERE externalId = :externalId AND type = :type")
    suspend fun updateEnabledByExternalId(externalId: String, type: String, isEnabled: Boolean)
    
    // Alias for deleteAll to match MainActivity usage
    @Transaction
    suspend fun clearAllCategories() {
        deleteAll()
    }
    
    @Query("SELECT COUNT(*) FROM categories WHERE type = :type")
    suspend fun getCountByType(type: String): Int
    
    @Query("UPDATE categories SET type = :type WHERE id = :categoryId")
    suspend fun updateCategoryType(categoryId: String, type: String)
    
    @Query("SELECT * FROM categories WHERE providerId = :providerId AND type = :type ORDER BY name ASC")
    suspend fun getCategoriesByProviderAndType(providerId: String, type: String): List<CategoryEntity>
    
    @Query("SELECT * FROM categories WHERE providerId = :providerId AND contentType = :contentType ORDER BY name ASC")
    suspend fun getCategoriesByProviderAndContentType(providerId: String, contentType: String): List<CategoryEntity>
    
    @Query("DELETE FROM categories WHERE externalId = :externalId AND providerId = :providerId")
    suspend fun deleteByExternalIdAndProvider(externalId: String, providerId: String)
    
    @Query("SELECT * FROM categories WHERE name IN (:names)")
    suspend fun getCategoriesByNames(names: List<String>): List<CategoryEntity>
}
