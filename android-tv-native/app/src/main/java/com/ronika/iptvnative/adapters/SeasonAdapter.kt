package com.ronika.iptvnative.adapters

import android.graphics.Color
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.cardview.widget.CardView
import androidx.recyclerview.widget.RecyclerView
import com.ronika.iptvnative.R
import com.ronika.iptvnative.models.Season

class SeasonAdapter(
    private val onSeasonClick: (Season) -> Unit
) : RecyclerView.Adapter<SeasonAdapter.SeasonViewHolder>() {

    private val seasons = mutableListOf<Season>()
    private var selectedPosition = -1

    fun setSeasons(newSeasons: List<Season>) {
        seasons.clear()
        seasons.addAll(newSeasons)
        notifyDataSetChanged()
    }

    fun setSelectedPosition(position: Int) {
        val oldPosition = selectedPosition
        selectedPosition = position
        notifyItemChanged(oldPosition)
        notifyItemChanged(selectedPosition)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): SeasonViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_season, parent, false)
        return SeasonViewHolder(view)
    }

    override fun onBindViewHolder(holder: SeasonViewHolder, position: Int) {
        holder.bind(seasons[position], position == selectedPosition)
    }

    override fun getItemCount() = seasons.size

    inner class SeasonViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val card: CardView = itemView.findViewById(R.id.season_card)
        private val seasonName: TextView = itemView.findViewById(R.id.season_name)

        fun bind(season: Season, isSelected: Boolean) {
            seasonName.text = season.name
            
            // Update card appearance based on selection
            if (isSelected) {
                card.setCardBackgroundColor(Color.parseColor("#ef4444"))
                seasonName.setTextColor(Color.WHITE)
            } else {
                card.setCardBackgroundColor(Color.parseColor("#27272a"))
                seasonName.setTextColor(Color.parseColor("#a1a1aa"))
            }

            itemView.setOnClickListener {
                val oldPosition = selectedPosition
                selectedPosition = adapterPosition
                notifyItemChanged(oldPosition)
                notifyItemChanged(selectedPosition)
                onSeasonClick(season)
            }
            
            itemView.onFocusChangeListener = View.OnFocusChangeListener { _, hasFocus ->
                if (hasFocus) {
                    card.setCardBackgroundColor(Color.parseColor("#ef4444"))
                    seasonName.setTextColor(Color.WHITE)
                } else if (!isSelected) {
                    card.setCardBackgroundColor(Color.parseColor("#27272a"))
                    seasonName.setTextColor(Color.parseColor("#a1a1aa"))
                }
            }
        }
    }
}
