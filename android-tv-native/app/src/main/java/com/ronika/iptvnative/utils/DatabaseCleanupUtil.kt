package com.ronika.iptvnative.utils

import android.content.Context
import android.util.Log
import com.ronika.iptvnative.database.AppDatabase
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

object DatabaseCleanupUtil {
    private const val TAG = "DatabaseCleanup"
    
    /**
     * Remove duplicate categories from the database
     * Keeps the first occurrence of each duplicate set
     * Duplicates are defined as: same name + type + providerId
     * 
     * @return Pair of (duplicatesFound, duplicatesRemoved)
     */
    suspend fun removeDuplicateCategories(context: Context): Pair<Int, Int> = withContext(Dispatchers.IO) {
        val db = AppDatabase.getDatabase(context)
        val categoryDao = db.categoryDao()
        
        try {
            // Get all categories
            val allCategories = categoryDao.getAllCategories()
            val totalBefore = allCategories.size
            
            Log.d(TAG, "🔍 Checking ${totalBefore} categories for duplicates...")
            
            // Group by name + type + providerId (user-visible duplicates)
            val grouped = allCategories.groupBy { 
                "${it.name}_${it.type}_${it.providerId}" 
            }
            
            var duplicatesFound = 0
            var duplicatesRemoved = 0
            
            // Find and remove duplicates
            grouped.forEach { (key, categories) ->
                if (categories.size > 1) {
                    duplicatesFound += categories.size - 1
                    
                    // Keep the first one, delete the rest
                    val toKeep = categories.first()
                    val toDelete = categories.drop(1)
                    
                    Log.d(TAG, "🔄 Found ${categories.size} duplicates for: ${toKeep.name} (${toKeep.type}, provider=${toKeep.providerId})")
                    Log.d(TAG, "   Keeping: id=${toKeep.id}, externalId=${toKeep.externalId}")
                    
                    toDelete.forEach { duplicate ->
                        Log.d(TAG, "   Deleting: id=${duplicate.id}, externalId=${duplicate.externalId}")
                        categoryDao.delete(duplicate)
                        duplicatesRemoved++
                    }
                }
            }
            
            val totalAfter = categoryDao.getTotalCount()
            
            if (duplicatesRemoved > 0) {
                Log.d(TAG, "✅ Cleanup complete!")
                Log.d(TAG, "   Categories before: $totalBefore")
                Log.d(TAG, "   Categories after: $totalAfter")
                Log.d(TAG, "   Duplicates removed: $duplicatesRemoved")
            } else {
                Log.d(TAG, "✅ No duplicates found! Database is clean.")
            }
            
            Pair(duplicatesFound, duplicatesRemoved)
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error removing duplicates", e)
            Pair(0, 0)
        }
    }
    
    /**
     * Log statistics about duplicate categories without removing them
     * Duplicates are defined as: same name + type + providerId
     */
    suspend fun checkForDuplicates(context: Context): String = withContext(Dispatchers.IO) {
        val db = AppDatabase.getDatabase(context)
        val categoryDao = db.categoryDao()
        
        try {
            val allCategories = categoryDao.getAllCategories()
            
            Log.d(TAG, "📊 Total categories: ${allCategories.size}")
            
            // Group by name + type + providerId (user-visible duplicates)
            val grouped = allCategories.groupBy { "${it.name}_${it.type}_${it.providerId}" }
            val duplicates = grouped.filter { it.value.size > 1 }
            
            Log.d(TAG, "Duplicate groups found: ${duplicates.size}")
            
            // Show sample categories
            allCategories.take(5).forEach { cat ->
                Log.d(TAG, "Sample: id=${cat.id}, externalId=${cat.externalId}, name=${cat.name}, providerId=${cat.providerId}, type=${cat.type}")
            }
            
            if (duplicates.isEmpty()) {
                "✅ No duplicates found! Total categories: ${allCategories.size}"
            } else {
                val duplicateCount = duplicates.values.sumOf { it.size - 1 }
                buildString {
                    appendLine("⚠️ Found duplicates:")
                    appendLine("Total categories: ${allCategories.size}")
                    appendLine("Duplicate groups: ${duplicates.size}")
                    appendLine("Total duplicates: $duplicateCount")
                    appendLine()
                    duplicates.entries.take(10).forEach { (key, categories) ->
                        appendLine("  ${categories.first().name} (${categories.first().type}): ${categories.size} copies")
                        categories.forEach { cat ->
                            appendLine("    - id=${cat.id}, externalId=${cat.externalId}")
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error checking duplicates", e)
            "❌ Error checking duplicates: ${e.message}"
        }
    }
}
