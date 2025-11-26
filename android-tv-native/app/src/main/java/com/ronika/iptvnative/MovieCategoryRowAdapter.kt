package com.ronika.iptvnative

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.ronika.iptvnative.models.Movie

// Category Row Adapter (Netflix-style rows)
class MovieCategoryRowAdapter(
    private val onMovieClick: (Movie) -> Unit,
    private val onViewAllClick: (String, String) -> Unit // categoryId, categoryTitle
) : RecyclerView.Adapter<MovieCategoryRowAdapter.CategoryRowViewHolder>() {

    private val categoryRows = mutableListOf<CategoryRow>()

    data class CategoryRow(
        val categoryId: String,
        val categoryTitle: String,
        val movies: List<Movie>
    )

    fun setCategoryRows(rows: List<CategoryRow>) {
        android.util.Log.d("MovieCategoryRowAdapter", "setCategoryRows called with ${rows.size} rows")
        categoryRows.clear()
        categoryRows.addAll(rows)
        notifyDataSetChanged()
        android.util.Log.d("MovieCategoryRowAdapter", "notifyDataSetChanged called, categoryRows.size = ${categoryRows.size}")
    }
    
    fun addCategoryRow(row: CategoryRow) {
        val position = categoryRows.size
        categoryRows.add(row)
        notifyItemInserted(position)
        android.util.Log.d("MovieCategoryRowAdapter", "Added row at position $position, total rows = ${categoryRows.size}")
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): CategoryRowViewHolder {
        android.util.Log.d("MovieCategoryRowAdapter", "onCreateViewHolder called")
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_movie_category_row, parent, false)
        return CategoryRowViewHolder(view)
    }

    override fun onBindViewHolder(holder: CategoryRowViewHolder, position: Int) {
        android.util.Log.d("MovieCategoryRowAdapter", "onBindViewHolder called for position $position")
        holder.bind(categoryRows[position])
    }

    override fun getItemCount() = categoryRows.size

    inner class CategoryRowViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val categoryTitle: TextView = itemView.findViewById(R.id.category_title)
        private val categoryIndicator: TextView = itemView.findViewById(R.id.category_indicator)
        private val moviesRecycler: RecyclerView = itemView.findViewById(R.id.movies_recycler)
        
        private val movieAdapter = MovieThumbnailAdapter(onMovieClick) { categoryId, categoryTitle ->
            onViewAllClick(categoryId, categoryTitle)
        }

        init {
            moviesRecycler.apply {
                layoutManager = LinearLayoutManager(context, LinearLayoutManager.HORIZONTAL, false)
                adapter = movieAdapter
                setHasFixedSize(true)
                
                // Add child focus listener to change category title color
                setOnHierarchyChangeListener(object : ViewGroup.OnHierarchyChangeListener {
                    override fun onChildViewAdded(parent: View?, child: View?) {
                        child?.setOnFocusChangeListener { _, hasFocus ->
                            if (hasFocus) {
                                categoryTitle.setTextColor(android.graphics.Color.WHITE)
                                categoryIndicator.visibility = View.GONE
                            } else {
                                categoryTitle.setTextColor(android.graphics.Color.parseColor("#999999"))
                            }
                        }
                    }
                    override fun onChildViewRemoved(parent: View?, child: View?) {}
                })
            }
            
            // Category title focus handling
            categoryTitle.setOnFocusChangeListener { _, hasFocus ->
                if (hasFocus) {
                    categoryTitle.setTextColor(android.graphics.Color.WHITE)
                    categoryIndicator.visibility = View.VISIBLE
                } else {
                    categoryTitle.setTextColor(android.graphics.Color.parseColor("#999999"))
                    categoryIndicator.visibility = View.GONE
                }
            }
            
            // Category title click - navigate to category screen
            categoryTitle.setOnClickListener {
                if (bindingAdapterPosition != RecyclerView.NO_POSITION) {
                    val row = categoryRows[bindingAdapterPosition]
                    val intent = android.content.Intent(itemView.context, MovieCategoryActivity::class.java).apply {
                        putExtra("categoryId", row.categoryId)
                        putExtra("categoryTitle", row.categoryTitle)
                    }
                    itemView.context.startActivity(intent)
                }
            }
            
            // Handle DOWN key on category title - navigate to category screen
            categoryTitle.setOnKeyListener { _, keyCode, event ->
                if (event.action == android.view.KeyEvent.ACTION_DOWN && keyCode == android.view.KeyEvent.KEYCODE_DPAD_DOWN) {
                    if (bindingAdapterPosition != RecyclerView.NO_POSITION) {
                        val row = categoryRows[bindingAdapterPosition]
                        val intent = android.content.Intent(itemView.context, MovieCategoryActivity::class.java).apply {
                            putExtra("categoryId", row.categoryId)
                            putExtra("categoryTitle", row.categoryTitle)
                        }
                        itemView.context.startActivity(intent)
                    }
                    true
                } else {
                    false
                }
            }
        }

        fun bind(categoryRow: CategoryRow) {
            android.util.Log.d("MovieCategoryRowAdapter", "Binding category: ${categoryRow.categoryTitle} with ${categoryRow.movies.size} movies")
            categoryTitle.text = categoryRow.categoryTitle
            categoryTitle.setTextColor(android.graphics.Color.parseColor("#999999")) // Default grey
            categoryIndicator.visibility = View.GONE
            movieAdapter.setMovies(categoryRow.categoryId, categoryRow.categoryTitle, categoryRow.movies)
        }
    }
}

// Movie Thumbnail Adapter (Horizontal scrolling)
class MovieThumbnailAdapter(
    private val onMovieClick: (Movie) -> Unit,
    private val onViewAllClick: (String, String) -> Unit
) : RecyclerView.Adapter<RecyclerView.ViewHolder>() {

    private val movies = mutableListOf<Movie>()
    private var categoryId: String = ""
    private var categoryTitle: String = ""
    
    companion object {
        const val VIEW_TYPE_MOVIE = 0
        const val VIEW_TYPE_VIEW_ALL = 1
        const val MAX_MOVIES = 25
    }

    fun setMovies(catId: String, catTitle: String, movieList: List<Movie>) {
        categoryId = catId
        categoryTitle = catTitle
        movies.clear()
        movies.addAll(movieList.take(MAX_MOVIES))
        notifyDataSetChanged()
    }

    override fun getItemViewType(position: Int): Int {
        return if (position < movies.size) VIEW_TYPE_MOVIE else VIEW_TYPE_VIEW_ALL
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
        return if (viewType == VIEW_TYPE_MOVIE) {
            val view = LayoutInflater.from(parent.context)
                .inflate(R.layout.item_movie_thumbnail, parent, false)
            MovieViewHolder(view)
        } else {
            val view = LayoutInflater.from(parent.context)
                .inflate(R.layout.item_view_all_button, parent, false)
            ViewAllViewHolder(view)
        }
    }

    override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
        when (holder) {
            is MovieViewHolder -> holder.bind(movies[position])
            is ViewAllViewHolder -> holder.bind()
        }
    }

    override fun getItemCount() = movies.size + 1 // +1 for "View All" button

    inner class MovieViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val poster: ImageView = itemView.findViewById(R.id.movie_poster)
        private val title: TextView = itemView.findViewById(R.id.movie_title)
        private val year: TextView = itemView.findViewById(R.id.movie_year)

        init {
            // Add focus change listener for visual feedback
            itemView.setOnFocusChangeListener { view, hasFocus ->
                if (hasFocus) {
                    view.animate().scaleX(1.1f).scaleY(1.1f).setDuration(200).start()
                    view.elevation = 8f
                } else {
                    view.animate().scaleX(1.0f).scaleY(1.0f).setDuration(200).start()
                    view.elevation = 0f
                }
            }
            
            // Block LEFT navigation on first item
            itemView.setOnKeyListener { _, keyCode, event ->
                if (event.action == android.view.KeyEvent.ACTION_DOWN && keyCode == android.view.KeyEvent.KEYCODE_DPAD_LEFT) {
                    // Check if this is the first item (position 0)
                    if (bindingAdapterPosition == 0) {
                        true // Consume the event, prevent navigation
                    } else {
                        false // Allow normal navigation
                    }
                } else {
                    false
                }
            }
            
            // Handle click to play movie
            itemView.setOnClickListener {
                if (bindingAdapterPosition < movies.size) {
                    onMovieClick(movies[bindingAdapterPosition])
                }
            }
        }

        fun bind(movie: Movie) {
            title.text = movie.name
            year.text = movie.year
            
            // Construct full image URL
            val imageUrl = movie.getImageUrl()
            val fullUrl = if (imageUrl != null && !imageUrl.startsWith("http")) {
                // Extract base URL from portalUrl (remove /server/load.php and /stalker_portal)
                val baseUrl = com.ronika.iptvnative.api.ApiClient.portalUrl
                    .substringBefore("/server/load.php")
                    .substringBefore("/stalker_portal")
                "$baseUrl$imageUrl"
            } else {
                imageUrl
            }
            
            android.util.Log.d("MovieThumbnail", "Loading image for ${movie.name}: $fullUrl")
            
            // Load poster image using Coil
            poster.load(fullUrl) {
                placeholder(R.drawable.ic_movie_placeholder)
                error(R.drawable.ic_movie_placeholder)
                crossfade(true)
            }
        }
    }

    inner class ViewAllViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        init {
            // Add focus change listener for visual feedback
            itemView.setOnFocusChangeListener { view, hasFocus ->
                if (hasFocus) {
                    view.animate().scaleX(1.1f).scaleY(1.1f).setDuration(200).start()
                    view.elevation = 8f
                } else {
                    view.animate().scaleX(1.0f).scaleY(1.0f).setDuration(200).start()
                    view.elevation = 0f
                }
            }
            
            // Block RIGHT navigation on View All button (it's the last item)
            itemView.setOnKeyListener { _, keyCode, event ->
                if (event.action == android.view.KeyEvent.ACTION_DOWN && keyCode == android.view.KeyEvent.KEYCODE_DPAD_RIGHT) {
                    true // Consume the event, prevent navigation beyond View All
                } else {
                    false
                }
            }
        }
        
        fun bind() {
            itemView.setOnClickListener {
                // Navigate to category screen with all movies
                val intent = android.content.Intent(itemView.context, MovieCategoryActivity::class.java).apply {
                    putExtra("categoryId", categoryId)
                    putExtra("categoryTitle", categoryTitle)
                }
                itemView.context.startActivity(intent)
            }
        }
    }
}
