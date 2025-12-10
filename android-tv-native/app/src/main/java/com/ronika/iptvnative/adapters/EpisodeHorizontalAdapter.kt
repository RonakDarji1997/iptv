package com.ronika.iptvnative.adapters

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
import androidx.cardview.widget.CardView
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.ronika.iptvnative.R
import com.ronika.iptvnative.models.Episode
import com.ronika.iptvnative.repository.WatchProgressRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class EpisodeHorizontalAdapter(
    private val episodes: List<Episode>,
    private val seriesId: String,
    private val providerId: String,
    private val seriesPosterUrl: String?,
    private val onEpisodeClick: (Episode) -> Unit
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
        val card: CardView = view as CardView
        val thumbnail: ImageView = view.findViewById(R.id.episode_thumbnail)
        val name: TextView = view.findViewById(R.id.episode_name)
        val duration: TextView = view.findViewById(R.id.episode_duration)
        val progressContainer: FrameLayout = view.findViewById(R.id.episode_progress_container)
        val progressBar: View = view.findViewById(R.id.episode_progress_bar)

        init {
            // Set foreground drawable for focus border
            card.foreground = androidx.core.content.ContextCompat.getDrawable(
                card.context,
                R.drawable.episode_card_bg
            )
            
            card.setOnClickListener {
                val position = bindingAdapterPosition
                if (position != RecyclerView.NO_POSITION) {
                    onEpisodeClick(episodes[position])
                }
            }
            
            card.setOnFocusChangeListener { _, hasFocus ->
                if (hasFocus) {
                    card.cardElevation = 16f
                    card.scaleX = 1.05f
                    card.scaleY = 1.05f
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
        
        holder.name.text = "E${episode.episodeNumber}. ${episode.name}"
        holder.duration.text = episode.duration
        
        // Load thumbnail - use series poster
        val imageUrl = seriesPosterUrl
        if (!imageUrl.isNullOrEmpty()) {
            val fullUrl = if (imageUrl.startsWith("http")) {
                imageUrl
            } else {
                "http://tv.stream4k.cc$imageUrl"
            }
            
            holder.thumbnail.load(fullUrl) {
                crossfade(false) // Disable for performance
                placeholder(R.drawable.ic_movie_placeholder)
                error(R.drawable.ic_movie_placeholder)
                size(250, 375) // Resize for episodes
                memoryCacheKey(fullUrl)
                diskCacheKey(fullUrl)
                allowHardware(true)
            }
        } else {
            holder.thumbnail.setImageResource(R.drawable.ic_movie_placeholder)
        }
        
        // Load watch progress for this specific episode
        CoroutineScope(Dispatchers.Main).launch {
            try {
                val repository = WatchProgressRepository(holder.itemView.context)
                val progress = withContext(Dispatchers.IO) {
                    // Check for progress using composite key: seasonId_episodeId
                    val compositeKey = "${episode.seasonId}_${episode.id}"
                    repository.getEpisodeProgress(seriesId, compositeKey, providerId)
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
