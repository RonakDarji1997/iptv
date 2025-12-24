package com.ronika.iptvnative.adapters

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.cardview.widget.CardView
import androidx.recyclerview.widget.RecyclerView
import coil.load
import coil.request.CachePolicy
import com.ronika.iptvnative.R
import com.ronika.iptvnative.models.Episode
import com.ronika.iptvnative.repository.WatchProgressRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class EpisodeHorizontalAdapter(
    val episodes: List<Episode>,
    private val seriesId: String,
    private val providerId: String,
    private val seriesPosterUrl: String?,
    private val seasonNumber: String = "1",
    private val onEpisodeClick: (Episode) -> Unit,
    private val onEpisodeFocused: ((Episode) -> Unit)? = null
) : RecyclerView.Adapter<EpisodeHorizontalAdapter.EpisodeViewHolder>() {
    
    init {
        android.util.Log.d("EpisodeAdapter", "Series poster URL for episodes: $seriesPosterUrl")
    }
    
    // Method to refresh all progress bars
    fun refreshProgress() {
        android.util.Log.d("EpisodeAdapter", "Refreshing progress for all episodes")
        notifyDataSetChanged()
    }

    inner class EpisodeViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val container: FrameLayout = view.findViewById(R.id.episode_container)
        val card: CardView = view.findViewById(R.id.episode_card)
        val thumbnail: ImageView = view.findViewById(R.id.episode_thumbnail)
        val name: TextView = view.findViewById(R.id.episode_name)
        val title: TextView = view.findViewById(R.id.episode_title)
        val duration: TextView = view.findViewById(R.id.episode_duration)
        val infoBelow: View = view.findViewById(R.id.episode_info_below)
        val progressContainer: FrameLayout = view.findViewById(R.id.episode_progress_container)
        val progressBar: View = view.findViewById(R.id.episode_progress_bar)

        init {
            container.setOnClickListener {
                val position = bindingAdapterPosition
                if (position != RecyclerView.NO_POSITION) {
                    onEpisodeClick(episodes[position])
                }
            }
            
            container.setOnFocusChangeListener { _, hasFocus ->
                if (hasFocus) {
                    card.cardElevation = 16f
                    card.scaleX = 1.05f
                    card.scaleY = 1.05f
                    
                    // Notify parent component about focused episode
                    val position = bindingAdapterPosition
                    if (position != RecyclerView.NO_POSITION) {
                        onEpisodeFocused?.invoke(episodes[position])
                    }
                } else {
                    card.cardElevation = 4f
                    card.scaleX = 1.0f
                    card.scaleY = 1.0f
                }
            }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): EpisodeViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_episode_horizontal, parent, false)
        return EpisodeViewHolder(view)
    }

    override fun onBindViewHolder(holder: EpisodeViewHolder, position: Int) {
        val episode = episodes[position]
        
        // Use season number passed to adapter
        holder.name.text = "S${seasonNumber} E${episode.episodeNumber}"
        holder.title.text = episode.name ?: "Episode ${episode.episodeNumber}"
        holder.duration.text = episode.duration
        
        // Load thumbnail - prioritize TMDB image if available, fallback to series poster
        val imageUrl = episode.tmdbImageUrl ?: seriesPosterUrl
        if (!imageUrl.isNullOrEmpty()) {
            val fullUrl = if (imageUrl.startsWith("http")) {
                imageUrl
            } else {
                "http://tv.stream4k.cc$imageUrl"
            }
            
            // CRITICAL: Clear drawable completely to prevent stale images from RecyclerView pool
            holder.thumbnail.setImageDrawable(null)
            
            // Use unique cache keys including timestamp to prevent cross-series conflicts
            val uniqueCacheKey = "${seriesId}_${episode.seasonId}_${episode.id}_${System.currentTimeMillis()}"
            
            android.util.Log.e("EpisodeAdapter", "🎬 Loading S${seasonNumber}E${episode.episodeNumber} - URL: $fullUrl - Key: $uniqueCacheKey")
            
            holder.thumbnail.load(fullUrl) {
                crossfade(false) // Disable for performance
                placeholder(R.drawable.ic_movie_placeholder)
                error(R.drawable.ic_movie_placeholder)
                size(250, 375) // Resize for episodes
                memoryCacheKey(uniqueCacheKey)
                diskCacheKey(uniqueCacheKey)
                // DISABLED = Always fetch fresh, never use cache
                memoryCachePolicy(CachePolicy.DISABLED)
                diskCachePolicy(CachePolicy.DISABLED)
                allowHardware(true)
                listener(
                    onSuccess = { _, result ->
                        android.util.Log.e("EpisodeAdapter", "✅ Loaded S${seasonNumber}E${episode.episodeNumber} successfully from $fullUrl")
                    },
                    onError = { _, error ->
                        android.util.Log.e("EpisodeAdapter", "❌ Failed S${seasonNumber}E${episode.episodeNumber}: ${error.throwable.message}")
                    }
                )
            }
        } else {
            holder.thumbnail.setImageDrawable(null)
            holder.thumbnail.setImageResource(R.drawable.ic_movie_placeholder)
        }
        
        // Load watch progress for this specific episode
        CoroutineScope(Dispatchers.Main).launch {
            try {
                val repository = WatchProgressRepository(holder.itemView.context)
                val progress = withContext(Dispatchers.IO) {
                    // Try to find progress in two ways:
                    // 1. First try with just episode ID (for cloud-synced data)
                    var prog = repository.getEpisodeProgress(seriesId, episode.id, providerId)
                    android.util.Log.d("EpisodeAdapter", "🔍 Query 1: seriesId=$seriesId, episodeId=${episode.id}, providerId=$providerId, found=${prog != null}")
                    if (prog != null) {
                        android.util.Log.d("EpisodeAdapter", "   ✅ Found: contentId=${prog.contentId}, episodeId=${prog.episodeId}, progress=${prog.progressPercentage}%")
                    }
                    
                    // 2. If not found, try with composite key: seasonId_episodeId (for local playback data)
                    if (prog == null) {
                        val compositeKey = "${episode.seasonId}_${episode.id}"
                        prog = repository.getEpisodeProgress(seriesId, compositeKey, providerId)
                        android.util.Log.d("EpisodeAdapter", "🔍 Query 2: seriesId=$seriesId, compositeKey=$compositeKey, providerId=$providerId, found=${prog != null}")
                    }
                    
                    prog
                }
                
                if (progress != null && progress.currentPosition > 0) {
                    val percentage = progress.progressPercentage
                    holder.progressContainer.visibility = View.VISIBLE
                    
                    // Update progress bar width based on percentage after layout is measured
                    holder.progressContainer.post {
                        val containerWidth = holder.progressContainer.width
                        if (containerWidth > 0) {
                            val layoutParams = holder.progressBar.layoutParams
                            layoutParams.width = (containerWidth * percentage / 100)
                            holder.progressBar.layoutParams = layoutParams
                            android.util.Log.d("EpisodeAdapter", "Episode ${episode.episodeNumber}: ${percentage}% progress, width: ${layoutParams.width}px (container: ${containerWidth}px)")
                        } else {
                            android.util.Log.w("EpisodeAdapter", "Episode ${episode.episodeNumber}: Container width is 0, retrying...")
                            // If container width is 0, wait a bit and try again
                            holder.progressContainer.postDelayed({
                                val retryWidth = holder.progressContainer.width
                                if (retryWidth > 0) {
                                    val layoutParams = holder.progressBar.layoutParams
                                    layoutParams.width = (retryWidth * percentage / 100)
                                    holder.progressBar.layoutParams = layoutParams
                                    android.util.Log.d("EpisodeAdapter", "Episode ${episode.episodeNumber}: ${percentage}% progress on retry, width: ${layoutParams.width}px")
                                }
                            }, 100)
                        }
                    }
                } else {
                    holder.progressContainer.visibility = View.GONE
                }
            } catch (e: Exception) {
                android.util.Log.e("EpisodeAdapter", "Error loading progress for episode ${episode.id}", e)
                holder.progressContainer.visibility = View.GONE
            }
        }
    }

    override fun getItemCount() = episodes.size
}
