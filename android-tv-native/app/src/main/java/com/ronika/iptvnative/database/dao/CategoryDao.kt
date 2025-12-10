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
    
    @Query("SELECT * FROM categories WHERE externalId = :externalId AND providerId = :providerId AND type = :type LIMIT 1")
    suspend fun getCategoryByUniqueKey(externalId: String, providerId: String, type: String): CategoryEntity?
    
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
    
    // Upsert: Insert or update based on unique constraint (externalId, providerId, type)
    @Transaction
    suspend fun upsertCategories(categories: List<CategoryEntity>) {
        categories.forEach { category ->
            val existing = getCategoryByUniqueKey(category.externalId, category.providerId, category.type)
            if (existing != null) {
                // Update existing with new data but keep original ID and createdAt
                val updated = category.copy(id = existing.id, createdAt = existing.createdAt)
                update(updated)
            } else {
                insert(category)
            }
        }
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
    
    @Query("SELECT COUNT(*) FROM categories")
    suspend fun getTotalCount(): Int
    
    @Query("""
        SELECT externalId, providerId, type, COUNT(*) as count 
        FROM categories 
        GROUP BY externalId, providerId, type 
        HAVING count > 1
    """)
    suspend fun findDuplicateGroups(): List<DuplicateGroup>
    
    data class DuplicateGroup(
        val externalId: String,
        val providerId: String,
        val type: String,
        val count: Int
    )
}
