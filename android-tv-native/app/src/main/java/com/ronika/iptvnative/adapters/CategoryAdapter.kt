package com.ronika.iptvnative.adapters

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.RecyclerView
import com.ronika.iptvnative.R
import com.ronika.iptvnative.models.Genre

class CategoryAdapter(
    private val onCategorySelected: (Genre) -> Unit
) : RecyclerView.Adapter<CategoryAdapter.CategoryViewHolder>() {

    private var categories: List<Genre> = emptyList()
    private var selectedPosition: Int = -1
    private var activePosition: Int = -1

    fun setCategories(newCategories: List<Genre>) {
        categories = newCategories
        notifyDataSetChanged()
    }

    fun setSelectedPosition(position: Int) {
        if (position == selectedPosition) return
        val oldPosition = selectedPosition
        selectedPosition = position
        if (oldPosition >= 0) notifyItemChanged(oldPosition)
        if (selectedPosition >= 0) notifyItemChanged(selectedPosition)
    }

    fun setActivePosition(position: Int) {
        val oldPosition = activePosition
        activePosition = position
        if (oldPosition >= 0) notifyItemChanged(oldPosition)
        if (activePosition >= 0) notifyItemChanged(activePosition)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): CategoryViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_category, parent, false)
        return CategoryViewHolder(view)
    }

    override fun onBindViewHolder(holder: CategoryViewHolder, position: Int) {
        val category = categories[position]
        holder.bind(category, position == selectedPosition)
    }

    override fun getItemCount(): Int = categories.size

    inner class CategoryViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val container: LinearLayout = itemView as LinearLayout
        private val playIndicator: ImageView = itemView.findViewById(R.id.play_indicator)
        private val categoryName: TextView = itemView.findViewById(R.id.category_name)

        init {
            itemView.setOnClickListener {
                val position = adapterPosition
                if (position != RecyclerView.NO_POSITION) {
                    setSelectedPosition(position)
                    setActivePosition(position)
                    onCategorySelected(categories[position])
                }
            }

            // Focus change listener to show hover state
            itemView.setOnFocusChangeListener { _, hasFocus ->
                val position = adapterPosition
                if (position == RecyclerView.NO_POSITION) return@setOnFocusChangeListener
                
                // Just update the style, don't change selectedPosition
                // selectedPosition will be set when category is actually selected (clicked or RIGHT pressed)
                updateStyle()
            }
        }

        fun bind(category: Genre, isSelected: Boolean) {
            val position = adapterPosition
            categoryName.text = category.getDisplayName()
            
            // Show play indicator if this is the active category
            playIndicator.visibility = if (position == activePosition) View.VISIBLE else View.GONE
            
            updateStyle()
        }
        
        private fun updateStyle() {
            val position = adapterPosition
            if (position == RecyclerView.NO_POSITION) return
            
            if (container.hasFocus()) {
                // White bg with black text only when focused
                container.setBackgroundResource(R.drawable.category_selected)
                categoryName.setTextColor(ContextCompat.getColor(itemView.context, android.R.color.black))
            } else {
                // Normal state - transparent bg, grey text
                container.setBackgroundResource(android.R.drawable.screen_background_dark_transparent)
                categoryName.setTextColor(ContextCompat.getColor(itemView.context, android.R.color.darker_gray))
            }
        }
    }
}
