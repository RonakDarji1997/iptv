package com.ronika.iptvnative.utils

import android.util.Log

/**
 * SRT Subtitle Parser
 * Parses SRT (SubRip) subtitle files into subtitle cues
 */
object SRTParser {
    
    private const val TAG = "SRTParser"
    
    data class SubtitleCue(
        val index: Int,
        val startTimeMs: Long,
        val endTimeMs: Long,
        val text: String
    )
    
    /**
     * Parse SRT content into subtitle cues
     */
    fun parse(srtContent: String): List<SubtitleCue> {
        try {
            val cues = mutableListOf<SubtitleCue>()
            val blocks = srtContent.trim().split("\n\n")
            
            for (block in blocks) {
                if (block.trim().isEmpty()) continue
                
                val lines = block.trim().split("\n")
                if (lines.size < 3) continue
                
                try {
                    // Line 1: Index
                    val index = lines[0].trim().toIntOrNull() ?: continue
                    
                    // Line 2: Timestamps
                    val timeRange = lines[1].trim()
                    val times = timeRange.split("-->")
                    if (times.size != 2) continue
                    
                    val startTime = parseTimestamp(times[0].trim())
                    val endTime = parseTimestamp(times[1].trim())
                    
                    if (startTime < 0 || endTime < 0) continue
                    
                    // Lines 3+: Text
                    val text = lines.drop(2).joinToString("\n").trim()
                    
                    if (text.isNotEmpty()) {
                        cues.add(
                            SubtitleCue(
                                index = index,
                                startTimeMs = startTime,
                                endTimeMs = endTime,
                                text = text
                            )
                        )
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Failed to parse subtitle block: $block", e)
                }
            }
            
            Log.d(TAG, "Parsed ${cues.size} subtitle cues")
            return cues.sortedBy { it.startTimeMs }
            
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing SRT content", e)
            return emptyList()
        }
    }
    
    /**
     * Parse SRT timestamp to milliseconds
     * Format: HH:MM:SS,mmm or HH:MM:SS.mmm
     */
    private fun parseTimestamp(timestamp: String): Long {
        try {
            // Replace comma with dot for consistency
            val normalized = timestamp.replace(',', '.')
            
            // Split into time and milliseconds
            val parts = normalized.split('.')
            if (parts.isEmpty()) return -1
            
            val timePart = parts[0]
            val millisPart = if (parts.size > 1) parts[1].take(3).padEnd(3, '0') else "000"
            
            // Split time into hours, minutes, seconds
            val timeParts = timePart.split(':')
            if (timeParts.size != 3) return -1
            
            val hours = timeParts[0].toLongOrNull() ?: return -1
            val minutes = timeParts[1].toLongOrNull() ?: return -1
            val seconds = timeParts[2].toLongOrNull() ?: return -1
            val millis = millisPart.toLongOrNull() ?: return -1
            
            return (hours * 3600000) + (minutes * 60000) + (seconds * 1000) + millis
            
        } catch (e: Exception) {
            Log.w(TAG, "Failed to parse timestamp: $timestamp", e)
            return -1
        }
    }
    
    /**
     * Convert subtitle cues to SRT format
     */
    fun toSRT(cues: List<SubtitleCue>): String {
        val builder = StringBuilder()
        
        cues.forEachIndexed { index, cue ->
            builder.append("${index + 1}\n")
            builder.append("${formatTimestamp(cue.startTimeMs)} --> ${formatTimestamp(cue.endTimeMs)}\n")
            builder.append("${cue.text}\n")
            builder.append("\n")
        }
        
        return builder.toString()
    }
    
    /**
     * Format milliseconds to SRT timestamp
     * Format: HH:MM:SS,mmm
     */
    private fun formatTimestamp(millis: Long): String {
        val hours = millis / 3600000
        val minutes = (millis % 3600000) / 60000
        val seconds = (millis % 60000) / 1000
        val milliseconds = millis % 1000
        
        return String.format("%02d:%02d:%02d,%03d", hours, minutes, seconds, milliseconds)
    }
}
