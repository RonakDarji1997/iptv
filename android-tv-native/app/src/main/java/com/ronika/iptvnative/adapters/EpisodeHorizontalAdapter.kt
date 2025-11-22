package com.ronika.iptvnative.adapters

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.cardview.widget.CardView
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.ronika.iptvnative.R
import com.ronika.iptvnative.api.ApiClient
import com.ronika.iptvnative.models.Episode

class EpisodeHorizontalAdapter(
    private val episodes: List<Episode>,
    private val seriesPosterUrl: String?,
    private val onEpisodeClick: (Episode) -> Unit
) : RecyclerView.Adapter<EpisodeHorizontalAdapter.EpisodeViewHolder>() {

    inner class EpisodeViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val card: CardView = view as CardView
        val thumbnail: ImageView = view.findViewById(R.id.episode_thumbnail)
        val name: TextView = view.findViewById(R.id.episode_name)
        val duration: TextView = view.findViewById(R.id.episode_duration)

        init {
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
                val cleanUrl = ApiClient.portalUrl.replace("/stalker_portal/?", "").replace("/stalker_portal", "")
                "$cleanUrl$imageUrl"
            }
            
            holder.thumbnail.load(fullUrl) {
                crossfade(true)
                placeholder(R.drawable.placeholder_poster)
                error(R.drawable.placeholder_poster)
            }
        } else {
            holder.thumbnail.setImageResource(R.drawable.placeholder_poster)
        }
    }

    override fun getItemCount() = episodes.size
}
