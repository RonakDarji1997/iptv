package com.ronika.iptvnative.database.dao

import androidx.room.*
import com.ronika.iptvnative.database.entities.CategoryEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface CategoryDao {
    @Query("SELECT * FROM categories WHERE type = :type ORDER BY name ASC")
    suspend fun getCategoriesByType(type: String): List<CategoryEntity>
    
    @Query("SELECT * FROM categories WHERE type = :type ORDER BY name ASC")
    fun getCategoriesByTypeFlow(type: String): Flow<List<CategoryEntity>>
    
    @Query("SELECT * FROM categories WHERE id = :id")
    suspend fun getCategoryById(id: String): CategoryEntity?
    
    @Query("SELECT * FROM categories ORDER BY type, name ASC")
    suspend fun getAllCategories(): List<CategoryEntity>
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(categories: List<CategoryEntity>)
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(category: CategoryEntity)
    
    @Update
    suspend fun update(category: CategoryEntity)
    
    @Delete
    suspend fun delete(category: CategoryEntity)
    
    @Query("DELETE FROM categories")
    suspend fun deleteAll()
    
    @Query("SELECT COUNT(*) FROM categories WHERE type = :type")
    suspend fun getCountByType(type: String): Int
    
    @Query("UPDATE categories SET type = :type WHERE id = :categoryId")
    suspend fun updateCategoryType(categoryId: String, type: String)
}
