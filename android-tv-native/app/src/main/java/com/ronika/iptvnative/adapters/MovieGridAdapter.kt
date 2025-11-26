package com.ronika.iptvnative.adapters

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.ronika.iptvnative.R
import com.ronika.iptvnative.models.Movie

class MovieGridAdapter(
    private val onMovieClick: (Movie) -> Unit
) : RecyclerView.Adapter<MovieGridAdapter.MovieViewHolder>() {

    private val movies = mutableListOf<Movie>()

    fun setMovies(newMovies: List<Movie>) {
        movies.clear()
        movies.addAll(newMovies)
        notifyDataSetChanged()
    }

    fun addMovies(newMovies: List<Movie>) {
        val startPosition = movies.size
        movies.addAll(newMovies)
        notifyItemRangeInserted(startPosition, newMovies.size)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): MovieViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_movie_grid, parent, false)
        return MovieViewHolder(view)
    }

    override fun onBindViewHolder(holder: MovieViewHolder, position: Int) {
        holder.bind(movies[position])
    }

    override fun getItemCount() = movies.size

    inner class MovieViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val poster: ImageView = itemView.findViewById(R.id.movie_poster)
        private val title: TextView = itemView.findViewById(R.id.movie_title)
        private val year: TextView = itemView.findViewById(R.id.movie_year)

        init {
            // Add focus change listener for visual feedback
            itemView.setOnFocusChangeListener { view, hasFocus ->
                if (hasFocus) {
                    view.animate().scaleX(1.05f).scaleY(1.05f).setDuration(150).start()
                    view.elevation = 8f
                } else {
                    view.animate().scaleX(1.0f).scaleY(1.0f).setDuration(150).start()
                    view.elevation = 0f
                }
            }

            itemView.setOnClickListener {
                if (bindingAdapterPosition != RecyclerView.NO_POSITION) {
                    onMovieClick(movies[bindingAdapterPosition])
                }
            }
        }

        fun bind(movie: Movie) {
            title.text = movie.name
            year.text = movie.year ?: ""

            // Construct full image URL
            val imageUrl = movie.getImageUrl()
            val fullUrl = if (imageUrl != null && !imageUrl.startsWith("http")) {
                val baseUrl = com.ronika.iptvnative.api.ApiClient.portalUrl
                    .substringBefore("/server/load.php")
                    .substringBefore("/stalker_portal")
                "$baseUrl$imageUrl"
            } else {
                imageUrl
            }

            poster.load(fullUrl) {
                placeholder(R.drawable.ic_movie_placeholder)
                error(R.drawable.ic_movie_placeholder)
                crossfade(true)
            }
        }
    }
}
