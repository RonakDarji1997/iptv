package com.ronika.iptvnative.managers

import android.view.View
import android.widget.ImageView
import android.widget.LinearLayout
import androidx.core.content.ContextCompat
import com.ronika.iptvnative.R

class NavigationManager(
    private val tvTab: ImageView,
    private val moviesTab: ImageView,
    private val showsTab: ImageView,
    private val sidebarContainer: LinearLayout,
    private val categorySidebar: LinearLayout
) {
    
    var selectedTab = "TV"
    var isSidebarVisible = true
    
    private val tabViews = mapOf(
        "TV" to tvTab,
        "MOVIES" to moviesTab,
        "SHOWS" to showsTab
    )
    
    fun setupTabListeners(
        onTabSwitch: (String) -> Unit
    ) {
        tvTab.setOnClickListener {
            onTabSwitch("TV")
        }
        
        moviesTab.setOnClickListener {
            onTabSwitch("MOVIES")
        }
        
        showsTab.setOnClickListener {
            onTabSwitch("SHOWS")
        }
    }
    
    fun switchTab(tab: String) {
        if (selectedTab == tab) return
        
        selectedTab = tab
        updateTabStyles()
    }
    
    fun updateTabStyles() {
        tabViews.forEach { (tab, view) ->
            if (tab == selectedTab) {
                applySelectedStyle(view, tab)
            } else {
                applyUnselectedStyle(view, tab)
            }
        }
    }
    
    private fun applySelectedStyle(view: View, tab: String) {
        view.background = ContextCompat.getDrawable(view.context, R.drawable.tab_selected)
        if (view is ImageView) {
            view.setColorFilter(android.graphics.Color.BLACK)
        }
    }
    
    private fun applyUnselectedStyle(view: View, tab: String) {
        view.background = ContextCompat.getDrawable(view.context, R.drawable.nav_item_normal)
        if (view is ImageView) {
            view.setColorFilter(android.graphics.Color.WHITE)
        }
    }
    
    fun toggleSidebar() {
        isSidebarVisible = !isSidebarVisible
        sidebarContainer.visibility = if (isSidebarVisible) View.VISIBLE else View.GONE
        categorySidebar.visibility = if (isSidebarVisible) View.VISIBLE else View.GONE
    }
    
    fun showSidebar() {
        isSidebarVisible = true
        sidebarContainer.visibility = View.VISIBLE
        categorySidebar.visibility = View.VISIBLE
    }
    
    fun hideSidebar() {
        isSidebarVisible = false
        sidebarContainer.visibility = View.GONE
        categorySidebar.visibility = View.GONE
    }
}
