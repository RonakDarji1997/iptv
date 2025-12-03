package com.ronika.iptvnative.adapters

import android.graphics.Color
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.ronika.iptvnative.R
import com.ronika.iptvnative.models.Genre
import com.ronika.iptvnative.theme.NetflixTheme

/**
 * Fast category adapter with optimized ViewHolder pattern
 * - Netflix-style focused/selected states
 * - Minimal view inflation
 * - Efficient binding
 */
class FastCategoryAdapter(
    private val onCategoryClick: (Genre, Int) -> Unit,
    private val onCategoryFocused: (Genre, Int) -> Unit
) : RecyclerView.Adapter<FastCategoryAdapter.CategoryViewHolder>() {
    
    private var categories: List<Genre> = emptyList()
    private var activePosition = -1
    
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): CategoryViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_category_fast, parent, false)
        return CategoryViewHolder(view)
    }
    
    override fun onBindViewHolder(holder: CategoryViewHolder, position: Int) {
        val category = categories[position]
        holder.bind(category, position, position == activePosition)
    }
    
    override fun getItemCount(): Int = categories.size
    
    /**
     * Update categories list
     */
    fun setCategories(newCategories: List<Genre>) {
        categories = newCategories
        notifyDataSetChanged()
    }
    
    /**
     * Set active category position
     */
    fun setActivePosition(position: Int) {
        val oldPosition = activePosition
        activePosition = position
        
        // Only notify changed items for efficiency
        if (oldPosition >= 0 && oldPosition < categories.size) {
            notifyItemChanged(oldPosition)
        }
        if (position >= 0 && position < categories.size) {
            notifyItemChanged(position)
        }
    }
    
    inner class CategoryViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val categoryName: TextView = itemView.findViewById(R.id.category_name)
        private val categoryIndicator: View = itemView.findViewById(R.id.category_indicator)
        
        fun bind(category: Genre, position: Int, isActive: Boolean) {
            // Set category name
            categoryName.text = category.title ?: category.name ?: "Unknown"
            
            // Apply Netflix styling based on state
            if (isActive) {
                // Active: Show red indicator, white text
                categoryIndicator.visibility = View.VISIBLE
                categoryIndicator.setBackgroundColor(Color.parseColor(NetflixTheme.RED_PRIMARY))
                categoryName.setTextColor(Color.parseColor(NetflixTheme.TEXT_WHITE))
                itemView.setBackgroundColor(Color.parseColor("#1A${NetflixTheme.RED_PRIMARY.substring(1)}")) // 10% red
            } else {
                // Inactive: Hide indicator, gray text
                categoryIndicator.visibility = View.GONE
                categoryName.setTextColor(Color.parseColor(NetflixTheme.TEXT_GRAY))
                itemView.setBackgroundColor(Color.TRANSPARENT)
            }
            
            // Click listener
            itemView.setOnClickListener {
                onCategoryClick(category, position)
            }
            
            // Focus listener
            itemView.setOnFocusChangeListener { view, hasFocus ->
                if (hasFocus) {
                    // Focused: Red background with white border
                    view.setBackgroundDrawable(NetflixTheme.createFocusedDrawable())
                    categoryName.setTextColor(Color.parseColor(NetflixTheme.TEXT_WHITE))
                    categoryIndicator.visibility = View.VISIBLE
                    onCategoryFocused(category, position)
                } else {
                    // Not focused: Restore active/inactive state
                    if (isActive) {
                        categoryIndicator.visibility = View.VISIBLE
                        categoryIndicator.setBackgroundColor(Color.parseColor(NetflixTheme.RED_PRIMARY))
                        categoryName.setTextColor(Color.parseColor(NetflixTheme.TEXT_WHITE))
                        itemView.setBackgroundColor(Color.parseColor("#1A${NetflixTheme.RED_PRIMARY.substring(1)}"))
                    } else {
                        categoryIndicator.visibility = View.GONE
                        categoryName.setTextColor(Color.parseColor(NetflixTheme.TEXT_GRAY))
                        itemView.setBackgroundColor(Color.TRANSPARENT)
                    }
                }
            }
            
            // Make focusable
            itemView.isFocusable = true
            itemView.isFocusableInTouchMode = true
        }
    }
    
    override fun getItemId(position: Int): Long {
        return categories[position].id.hashCode().toLong()
    }
}
