package com.ronika.iptvnative.database

import android.content.Context
import androidx.room.*

@Entity(
    tableName = "watch_progress",
    indices = [
        Index(value = ["content_id", "content_type", "provider_id"], unique = true),
        Index(value = ["provider_id"]),
        Index(value = ["content_id", "episode_id", "provider_id"])
    ]
)
data class WatchProgress(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    
    @ColumnInfo(name = "content_id")
    val contentId: String,           // Movie ID or Series ID
    
    @ColumnInfo(name = "content_type")
    val contentType: String,         // "MOVIE" or "SERIES"
    
    @ColumnInfo(name = "provider_id")
    val providerId: String,          // Provider ID for filtering
    
    @ColumnInfo(name = "title")
    val title: String,
    
    @ColumnInfo(name = "poster_url")
    val posterUrl: String?,
    
    @ColumnInfo(name = "episode_id")
    val episodeId: String? = null,   // For series only
    
    @ColumnInfo(name = "episode_number")
    val episodeNumber: Int? = null,  // For series only
    
    @ColumnInfo(name = "season_number")
    val seasonNumber: Int? = null,   // For series only
    
    @ColumnInfo(name = "current_position")
    val currentPosition: Long,       // Position in milliseconds
    
    @ColumnInfo(name = "duration")
    val duration: Long,              // Total duration in milliseconds
    
    @ColumnInfo(name = "last_watched")
    val lastWatched: Long,           // Timestamp in milliseconds
    
    @ColumnInfo(name = "cmd")
    val cmd: String                  // Play command
) {
    val progressPercentage: Int
        get() = if (duration > 0) ((currentPosition * 100) / duration).toInt() else 0
}

@Dao
interface WatchProgressDao {
    @Query("SELECT * FROM watch_progress ORDER BY last_watched DESC")
    suspend fun getAllProgress(): List<WatchProgress>
    
    @Query("SELECT * FROM watch_progress WHERE content_type = :type AND provider_id = :providerId ORDER BY last_watched DESC LIMIT :limit")
    suspend fun getProgressByType(type: String, providerId: String, limit: Int = 20): List<WatchProgress>
    
    @Query("SELECT * FROM watch_progress WHERE content_id = :contentId AND content_type = :type AND provider_id = :providerId")
    suspend fun getProgress(contentId: String, type: String, providerId: String): WatchProgress?
    
    @Query("SELECT * FROM watch_progress WHERE content_id = :contentId AND episode_id = :episodeId AND provider_id = :providerId")
    suspend fun getEpisodeProgress(contentId: String, episodeId: String, providerId: String): WatchProgress?
    
    @Query("""
        SELECT * FROM watch_progress 
        WHERE content_type = 'SERIES' 
        AND provider_id = :providerId
        AND id IN (
            SELECT MAX(id) 
            FROM watch_progress 
            WHERE content_type = 'SERIES' 
            AND provider_id = :providerId
            GROUP BY content_id
        )
        ORDER BY last_watched DESC 
        LIMIT :limit
    """)
    suspend fun getLatestSeriesProgress(providerId: String, limit: Int = 20): List<WatchProgress>
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertProgress(progress: WatchProgress): Long
    
    @Update
    suspend fun updateProgress(progress: WatchProgress)
    
    @Query("DELETE FROM watch_progress WHERE content_id = :contentId")
    suspend fun deleteProgress(contentId: String)
    
    @Query("DELETE FROM watch_progress WHERE id = :id")
    suspend fun deleteProgressById(id: Long)
    
    @Query("DELETE FROM watch_progress WHERE last_watched < :timestamp")
    suspend fun deleteOldProgress(timestamp: Long)
}

@Database(entities = [WatchProgress::class], version = 4, exportSchema = false)
abstract class WatchProgressDatabase : RoomDatabase() {
    abstract fun watchProgressDao(): WatchProgressDao
    
    companion object {
        @Volatile
        private var INSTANCE: WatchProgressDatabase? = null
        
        // Migration from version 2 to 3: Add provider_id field
        private val MIGRATION_2_3 = object : androidx.room.migration.Migration(2, 3) {
            override fun migrate(database: androidx.sqlite.db.SupportSQLiteDatabase) {
                // Add provider_id column with empty string as default for existing rows
                database.execSQL("ALTER TABLE `watch_progress` ADD COLUMN `provider_id` TEXT NOT NULL DEFAULT ''")
                
                // Drop old unique index
                database.execSQL("DROP INDEX IF EXISTS `index_watch_progress_content_id_content_type_episode_id`")
                
                // Create new unique index with provider_id
                database.execSQL(
                    """CREATE UNIQUE INDEX IF NOT EXISTS `index_watch_progress_content_id_content_type_episode_id_provider_id` 
                    ON `watch_progress` (`content_id`, `content_type`, `episode_id`, `provider_id`)"""
                )
                
                // Create index on provider_id for filtering
                database.execSQL(
                    "CREATE INDEX IF NOT EXISTS `index_watch_progress_provider_id` ON `watch_progress` (`provider_id`)"
                )
            }
        }
        
        // Migration from version 3 to 4: Fix unique index for movies (exclude episode_id from unique constraint)
        private val MIGRATION_3_4 = object : androidx.room.migration.Migration(3, 4) {
            override fun migrate(database: androidx.sqlite.db.SupportSQLiteDatabase) {
                // Step 1: Remove duplicate entries for movies FIRST (keep most recent by id)
                database.execSQL(
                    """DELETE FROM watch_progress 
                    WHERE id NOT IN (
                        SELECT MAX(id) 
                        FROM watch_progress 
                        WHERE episode_id IS NULL OR episode_id = ''
                        GROUP BY content_id, content_type, provider_id
                    ) AND (episode_id IS NULL OR episode_id = '')"""
                )
                
                // Step 2: Drop old unique index that includes episode_id (causes issues with NULL values)
                database.execSQL("DROP INDEX IF EXISTS `index_watch_progress_content_id_content_type_episode_id_provider_id`")
                
                // Step 3: Create new unique index WITHOUT episode_id for movies
                // This ensures one progress entry per movie per provider
                database.execSQL(
                    """CREATE UNIQUE INDEX IF NOT EXISTS `index_watch_progress_content_id_content_type_provider_id` 
                    ON `watch_progress` (`content_id`, `content_type`, `provider_id`)"""
                )
                
                // Step 4: Create additional index on episode_id for series lookups
                database.execSQL(
                    """CREATE INDEX IF NOT EXISTS `index_watch_progress_content_id_episode_id_provider_id` 
                    ON `watch_progress` (`content_id`, `episode_id`, `provider_id`)"""
                )
            }
        }
        
        fun getDatabase(context: Context): WatchProgressDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    WatchProgressDatabase::class.java,
                    "watch_progress_database"
                )
                    .addMigrations(MIGRATION_2_3, MIGRATION_3_4)
                    .fallbackToDestructiveMigration() // Only as last resort
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
