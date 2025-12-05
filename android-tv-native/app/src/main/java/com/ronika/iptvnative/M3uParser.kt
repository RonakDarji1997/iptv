package com.ronika.iptvnative

import android.util.Log

data class M3uChannel(
    val name: String,
    val url: String,
    val groupTitle: String = "",
    val tvgId: String = "",
    val tvgLogo: String = ""
)

class M3uParser {
    companion object {
        private const val TAG = "M3uParser"
        
        fun parse(content: String): List<M3uChannel> {
            val channels = mutableListOf<M3uChannel>()
            val lines = content.trim().lines()
            
            if (lines.isEmpty() || !lines[0].startsWith("#EXTM3U")) {
                Log.e(TAG, "Invalid M3U file - missing #EXTM3U header")
                return emptyList()
            }
            
            var currentName = ""
            var currentGroupTitle = ""
            var currentTvgId = ""
            var currentTvgLogo = ""
            
            for (i in 1 until lines.size) {
                val line = lines[i].trim()
                
                when {
                    line.startsWith("#EXTINF:") -> {
                        // Parse metadata line
                        // Format: #EXTINF:-1 tvg-id="abc" tvg-name="ABC" group-title="News",Channel Name
                        
                        // Extract group-title
                        currentGroupTitle = extractAttribute(line, "group-title")
                        
                        // Extract tvg-id
                        currentTvgId = extractAttribute(line, "tvg-id")
                        
                        // Extract tvg-logo
                        currentTvgLogo = extractAttribute(line, "tvg-logo")
                        
                        // Extract channel name (after the last comma)
                        val commaIndex = line.lastIndexOf(',')
                        currentName = if (commaIndex != -1 && commaIndex < line.length - 1) {
                            line.substring(commaIndex + 1).trim()
                        } else {
                            "Unknown Channel"
                        }
                    }
                    
                    line.isNotEmpty() && !line.startsWith("#") -> {
                        // This is a stream URL
                        if (currentName.isNotEmpty()) {
                            channels.add(
                                M3uChannel(
                                    name = currentName,
                                    url = line,
                                    groupTitle = currentGroupTitle,
                                    tvgId = currentTvgId,
                                    tvgLogo = currentTvgLogo
                                )
                            )
                            
                            Log.d(TAG, "📺 Parsed: $currentName | Group: $currentGroupTitle | URL: ${line.take(50)}...")
                        }
                        
                        // Reset for next channel
                        currentName = ""
                        currentGroupTitle = ""
                        currentTvgId = ""
                        currentTvgLogo = ""
                    }
                }
            }
            
            Log.d(TAG, "✅ Parsed ${channels.size} channels from M3U")
            return channels
        }
        
        private fun extractAttribute(line: String, attribute: String): String {
            val pattern = """$attribute="([^"]*)"""".toRegex()
            val match = pattern.find(line)
            return match?.groupValues?.getOrNull(1) ?: ""
        }
        
        /**
         * Classify channels into Live TV, Movies, and Series based on group-title
         */
        fun classifyChannels(channels: List<M3uChannel>): Triple<List<M3uChannel>, List<M3uChannel>, List<M3uChannel>> {
            val liveChannels = mutableListOf<M3uChannel>()
            val movieChannels = mutableListOf<M3uChannel>()
            val seriesChannels = mutableListOf<M3uChannel>()
            
            val movieKeywords = listOf("movie", "movies", "film", "films", "cinema", "cine")
            val seriesKeywords = listOf("series", "tv shows", "shows", "tvshows", "episodes")
            
            for (channel in channels) {
                val group = channel.groupTitle.lowercase()
                val name = channel.name.lowercase()
                
                when {
                    // Check if it's a series
                    seriesKeywords.any { group.contains(it) || name.contains(it) } -> {
                        seriesChannels.add(channel)
                    }
                    // Check if it's a movie
                    movieKeywords.any { group.contains(it) || name.contains(it) } -> {
                        movieChannels.add(channel)
                    }
                    // Default to live TV
                    else -> {
                        liveChannels.add(channel)
                    }
                }
            }
            
            Log.d(TAG, "📊 Classification: Live=${liveChannels.size}, Movies=${movieChannels.size}, Series=${seriesChannels.size}")
            
            return Triple(liveChannels, movieChannels, seriesChannels)
        }
        
        /**
         * Group channels by category (group-title)
         */
        fun groupByCategory(channels: List<M3uChannel>): Map<String, List<M3uChannel>> {
            return channels.groupBy { 
                it.groupTitle.ifEmpty { "Uncategorized" }
            }
        }
    }
}
