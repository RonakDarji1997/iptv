package com.ronika.iptvnative.database.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.ronika.iptvnative.database.entities.PlayerSettingsEntity

@Dao
interface PlayerSettingsDao {
    
    @Query("SELECT * FROM player_settings WHERE id = 1 LIMIT 1")
    suspend fun getPlayerSettings(): PlayerSettingsEntity?
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSettings(settings: PlayerSettingsEntity)
    
    @Update
    suspend fun updateSettings(settings: PlayerSettingsEntity)
    
    @Query("UPDATE player_settings SET showBitrateInfo = :show WHERE id = 1")
    suspend fun updateShowBitrate(show: Boolean)
    
    @Query("UPDATE player_settings SET seekTimeSeconds = :seconds WHERE id = 1")
    suspend fun updateSeekTime(seconds: Int)
}
