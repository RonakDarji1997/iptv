package com.ronika.iptvnative.adapters

import android.graphics.Color
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.cardview.widget.CardView
import androidx.recyclerview.widget.RecyclerView
import com.ronika.iptvnative.R
import com.ronika.iptvnative.models.Episode

class EpisodeAdapter(
    private val onEpisodeClick: (Episode) -> Unit
) : RecyclerView.Adapter<EpisodeAdapter.EpisodeViewHolder>() {

    private val episodes = mutableListOf<Episode>()

    fun setEpisodes(newEpisodes: List<Episode>) {
        episodes.clear()
        episodes.addAll(newEpisodes)
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): EpisodeViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_episode, parent, false)
        return EpisodeViewHolder(view)
    }

    override fun onBindViewHolder(holder: EpisodeViewHolder, position: Int) {
        holder.bind(episodes[position])
    }

    override fun getItemCount() = episodes.size

    inner class EpisodeViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val card: CardView = itemView.findViewById(R.id.episode_card)
        private val episodeThumbnail: android.widget.ImageView = itemView.findViewById(R.id.episode_thumbnail)
        private val episodeName: TextView = itemView.findViewById(R.id.episode_name)
        private val episodeTime: TextView = itemView.findViewById(R.id.episode_time)

        fun bind(episode: Episode) {
            episodeName.text = "E${episode.episodeNumber}. ${episode.name}"
            
            if (episode.duration.isNotEmpty()) {
                episodeTime.visibility = View.VISIBLE
                episodeTime.text = episode.duration
            } else {
                episodeTime.visibility = View.GONE
            }

            // Load thumbnail if available
            // TODO: Add thumbnail URL to Episode model and load with Coil
            episodeThumbnail.setBackgroundColor(Color.parseColor("#09090b"))

            itemView.setOnClickListener {
                onEpisodeClick(episode)
            }
            
            itemView.onFocusChangeListener = View.OnFocusChangeListener { _, hasFocus ->
                if (hasFocus) {
                    card.setCardBackgroundColor(Color.parseColor("#09090b"))
                    episodeName.setTextColor(Color.WHITE)
                    episodeTime.setTextColor(Color.parseColor("#a1a1aa"))
                    card.cardElevation = 8f
                } else {
                    card.setCardBackgroundColor(Color.parseColor("#09090b"))
                    episodeName.setTextColor(Color.WHITE)
                    episodeTime.setTextColor(Color.parseColor("#71717a"))
                    card.cardElevation = 2f
                }
            }
        }
    }
}
