package com.ronika.iptvnative.database

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.ronika.iptvnative.database.dao.*
import com.ronika.iptvnative.database.entities.*

@Database(
    entities = [
        ProviderEntity::class,
        CategoryEntity::class,
        ChannelEntity::class,
        MovieEntity::class,
        SeriesEntity::class,
        FavoriteEntity::class,
        UserEntity::class,
        PlayerSettingsEntity::class
    ],
    version = 8,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    
    abstract fun providerDao(): ProviderDao
    abstract fun categoryDao(): CategoryDao
    abstract fun channelDao(): ChannelDao
    abstract fun movieDao(): MovieDao
    abstract fun seriesDao(): SeriesDao
    abstract fun favoriteDao(): FavoriteDao
    abstract fun userDao(): UserDao
    abstract fun playerSettingsDao(): PlayerSettingsDao
    
    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null
        
        // Migration from version 6 to 7: Add player_settings table
        private val MIGRATION_6_7 = object : Migration(6, 7) {
            override fun migrate(database: SupportSQLiteDatabase) {
                // Create player_settings table
                database.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS `player_settings` (
                        `id` INTEGER NOT NULL,
                        `showBitrateInfo` INTEGER NOT NULL,
                        `seekTimeSeconds` INTEGER NOT NULL,
                        PRIMARY KEY(`id`)
                    )
                    """.trimIndent()
                )
                
                // Insert default settings
                database.execSQL(
                    """
                    INSERT OR REPLACE INTO `player_settings` (`id`, `showBitrateInfo`, `seekTimeSeconds`)
                    VALUES (1, 1, 10)
                    """.trimIndent()
                )
            }
        }
        
        // Migration from version 7 to 8: Update categories unique index to include type
        // This allows same externalId for LIVE and VOD (MOVIE/SERIES) categories
        private val MIGRATION_7_8 = object : Migration(7, 8) {
            override fun migrate(database: SupportSQLiteDatabase) {
                // Drop old unique index on (externalId, providerId)
                database.execSQL("DROP INDEX IF EXISTS `index_categories_externalId_providerId`")
                
                // Create new unique index on (externalId, providerId, type)
                database.execSQL(
                    """
                    CREATE UNIQUE INDEX IF NOT EXISTS `index_categories_externalId_providerId_type` 
                    ON `categories` (`externalId`, `providerId`, `type`)
                    """.trimIndent()
                )
            }
        }
        
        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "iptv_database"
                )
                    .addMigrations(MIGRATION_6_7, MIGRATION_7_8)
                    .fallbackToDestructiveMigration()
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
