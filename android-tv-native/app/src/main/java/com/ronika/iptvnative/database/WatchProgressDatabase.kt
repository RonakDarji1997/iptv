package com.ronika.iptvnative.database

import android.content.Context
import androidx.room.*

@Entity(
    tableName = "watch_progress",
    indices = [Index(value = ["content_id", "content_type", "episode_id"], unique = true)]
)
data class WatchProgress(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    
    @ColumnInfo(name = "content_id")
    val contentId: String,           // Movie ID or Series ID
    
    @ColumnInfo(name = "content_type")
    val contentType: String,         // "MOVIE" or "SERIES"
    
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
    
    @Query("SELECT * FROM watch_progress WHERE content_type = :type ORDER BY last_watched DESC LIMIT :limit")
    suspend fun getProgressByType(type: String, limit: Int = 20): List<WatchProgress>
    
    @Query("SELECT * FROM watch_progress WHERE content_id = :contentId AND content_type = :type")
    suspend fun getProgress(contentId: String, type: String): WatchProgress?
    
    @Query("SELECT * FROM watch_progress WHERE content_id = :contentId AND episode_id = :episodeId")
    suspend fun getEpisodeProgress(contentId: String, episodeId: String): WatchProgress?
    
    @Query("""
        SELECT * FROM watch_progress 
        WHERE content_type = 'SERIES' 
        AND id IN (
            SELECT MAX(id) 
            FROM watch_progress 
            WHERE content_type = 'SERIES' 
            GROUP BY content_id
        )
        ORDER BY last_watched DESC 
        LIMIT :limit
    """)
    suspend fun getLatestSeriesProgress(limit: Int = 20): List<WatchProgress>
    
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

@Database(entities = [WatchProgress::class], version = 2, exportSchema = false)
abstract class WatchProgressDatabase : RoomDatabase() {
    abstract fun watchProgressDao(): WatchProgressDao
    
    companion object {
        @Volatile
        private var INSTANCE: WatchProgressDatabase? = null
        
        fun getDatabase(context: Context): WatchProgressDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    WatchProgressDatabase::class.java,
                    "watch_progress_database"
                )
                    .fallbackToDestructiveMigration() // Drop and recreate on version change
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
