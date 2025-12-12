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
    version = 12,
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
        
        // Migration from version 9 to 10: Add password field to user table
        // Allows storing user credentials for automatic token refresh
        private val MIGRATION_9_10 = object : Migration(9, 10) {
            override fun migrate(database: SupportSQLiteDatabase) {
                // Check if password column already exists
                val cursor = database.query("PRAGMA table_info(user)")
                var passwordColumnExists = false
                while (cursor.moveToNext()) {
                    val columnName = cursor.getString(cursor.getColumnIndex("name"))
                    if (columnName == "password") {
                        passwordColumnExists = true
                        break
                    }
                }
                cursor.close()

                // Add password column if it doesn't exist
                if (!passwordColumnExists) {
                    database.execSQL("ALTER TABLE `user` ADD COLUMN `password` TEXT")
                }
            }
        }
        
        // Migration from version 10 to 11: Add providerId field to favorites table
        // Makes favorites provider-specific to support multiple providers
        private val MIGRATION_10_11 = object : Migration(10, 11) {
            override fun migrate(database: SupportSQLiteDatabase) {
                // Add providerId column with empty string as default for existing rows
                database.execSQL("ALTER TABLE `favorites` ADD COLUMN `providerId` TEXT NOT NULL DEFAULT ''")
                
                // Drop old unique index
                database.execSQL("DROP INDEX IF EXISTS `index_favorites_itemId_itemType`")
                
                // Create new unique index with providerId
                database.execSQL(
                    """CREATE UNIQUE INDEX IF NOT EXISTS `index_favorites_itemId_itemType_providerId` 
                    ON `favorites` (`itemId`, `itemType`, `providerId`)"""
                )
                
                // Create index on providerId for filtering
                database.execSQL(
                    "CREATE INDEX IF NOT EXISTS `index_favorites_providerId` ON `favorites` (`providerId`)"
                )
            }
        }

        // Migration from version 11 to 12: Add last-played columns to player_settings
        private val MIGRATION_11_12 = object : Migration(11, 12) {
            override fun migrate(database: SupportSQLiteDatabase) {
                // Check existing columns in player_settings
                val cursor = database.query("PRAGMA table_info(player_settings)")
                var hasLastLive = false
                var hasLastProvider = false
                while (cursor.moveToNext()) {
                    val columnName = cursor.getString(cursor.getColumnIndex("name"))
                    if (columnName == "lastLiveChannelId") hasLastLive = true
                    if (columnName == "lastProviderId") hasLastProvider = true
                }
                cursor.close()

                if (!hasLastLive) {
                    database.execSQL("ALTER TABLE `player_settings` ADD COLUMN `lastLiveChannelId` TEXT")
                }
                if (!hasLastProvider) {
                    database.execSQL("ALTER TABLE `player_settings` ADD COLUMN `lastProviderId` TEXT")
                }
            }
        }

        // Migration from version 8 to 9: Add userId column to providers table
        // Links providers to users for cloud sync without deleting existing data
        private val MIGRATION_8_9 = object : Migration(8, 9) {
            override fun migrate(database: SupportSQLiteDatabase) {
                // Check if userId column already exists before adding
                val cursor = database.query("PRAGMA table_info(providers)")
                var hasUserId = false
                while (cursor.moveToNext()) {
                    val columnName = cursor.getString(cursor.getColumnIndex("name"))
                    if (columnName == "userId") {
                        hasUserId = true
                        break
                    }
                }
                cursor.close()
                
                // Add userId column only if it doesn't exist
                if (!hasUserId) {
                    database.execSQL("ALTER TABLE `providers` ADD COLUMN `userId` INTEGER")
                }
                
                // Update user table schema (remove portalUrl and mac, add password)
                database.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS `user_new` (
                        `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        `username` TEXT NOT NULL,
                        `email` TEXT NOT NULL,
                        `password` TEXT,
                        `bearerToken` TEXT NOT NULL,
                        `tokenExpiry` INTEGER NOT NULL,
                        `lastSync` INTEGER,
                        `createdAt` INTEGER NOT NULL,
                        `updatedAt` INTEGER NOT NULL
                    )
                    """.trimIndent()
                )
                
                // Copy existing user data (if any) - password will be null for existing users
                database.execSQL(
                    """
                    INSERT INTO `user_new` (id, username, email, password, bearerToken, tokenExpiry, lastSync, createdAt, updatedAt)
                    SELECT id, username, email, NULL, bearerToken, tokenExpiry, lastSync, createdAt, updatedAt FROM `user`
                    """.trimIndent()
                )
                
                // Drop old table and rename new one
                database.execSQL("DROP TABLE `user`")
                database.execSQL("ALTER TABLE `user_new` RENAME TO `user`")
            }
        }
        
        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "iptv_database"
                )
                        .addMigrations(MIGRATION_6_7, MIGRATION_7_8, MIGRATION_8_9, MIGRATION_9_10, MIGRATION_10_11, MIGRATION_11_12)
                        .fallbackToDestructiveMigration()
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
