package com.ronika.iptvnative.managers

import android.animation.ValueAnimator
import android.content.res.Resources
import android.util.TypedValue
import android.view.View
import android.view.animation.DecelerateInterpolator
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import com.ronika.iptvnative.R

class NavigationManager(
    private val tvTab: ImageView,
    private val moviesTab: ImageView,
    private val showsTab: ImageView,
    private val sidebarFrame: View,
    private val sidebarContainer: LinearLayout,
    private val categorySidebar: LinearLayout,
    private val sidebarDivider: View?,
    // labels that are shown when expanded
    private val searchLabel: TextView?,
    private val tvLabel: TextView?,
    private val moviesLabel: TextView?,
    private val showsLabel: TextView?,
    private val profileNameLabel: TextView?
) {
    
    var selectedTab = "TV"
    var isSidebarVisible = true
    var isSidebarExpanded = false
    
    private val tabViews = mapOf(
        "TV" to tvTab,
        "MOVIES" to moviesTab,
        "SHOWS" to showsTab
    )

    // sizes in dp (adjusted for a slimmer collapsed nav and narrower expanded width)
    private var collapsedDp = 64
    private var expandedDp = 240
    private var categoryWidthDp = 200

    /**
     * Runtime updates to sizes for quick dev iterations.
     * Accepts nulls to leave existing values.
     */
    fun updateSizes(collapsedDp: Int? = null, expandedDp: Int? = null, categoryWidthDp: Int? = null) {
        collapsedDp?.let { this.collapsedDp = it }
        expandedDp?.let { this.expandedDp = it }
        categoryWidthDp?.let { this.categoryWidthDp = it }

        android.util.Log.d("NavigationManager", "updateSizes collapsed=$collapsedDp expanded=$expandedDp category=$categoryWidthDp")
        // if collapsed currently set the width to the new collapsed width
        val newWidth = if (isSidebarExpanded) dpToPx(this.expandedDp) else dpToPx(this.collapsedDp)
        setSidebarWidth(newWidth)

        // update the category sidebar width (only take effect when visible)
        val lp = categorySidebar.layoutParams
        lp.width = dpToPx(this.categoryWidthDp)
        categorySidebar.layoutParams = lp
    }
    
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
        // selected uses a subtle colored background with cyan border
        view.background = ContextCompat.getDrawable(view.context, R.drawable.nav_item_selected)
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

    fun expandSidebar(animated: Boolean = true) {
        if (isSidebarExpanded) return
        isSidebarExpanded = true
        // show labels, fade in
        listOf(searchLabel, tvLabel, moviesLabel, showsLabel, profileNameLabel).forEach { it?.let { v ->
              v.alpha = 0f
              v.visibility = View.VISIBLE
              // fade to fully visible
              v.animate().alpha(1f).setDuration(180).start()
        } }

        // show category sidebar & divider when expanded
        categorySidebar.visibility = View.VISIBLE
        sidebarDivider?.visibility = View.VISIBLE
        val from = sidebarFrame.width
        val to = dpToPx(expandedDp)
        android.util.Log.d("NavigationManager", "expandSidebar: expanded (to=$to)")
        if (!animated) {
            setSidebarWidth(to)
            return
        }

        animateSidebarWidth(from, to)
    }

    fun collapseSidebar(animated: Boolean = true) {
        if (!isSidebarExpanded) return
        isSidebarExpanded = false

        // fade out labels, then hide
        listOf(searchLabel, tvLabel, moviesLabel, showsLabel, profileNameLabel).forEach { it?.let { v ->
            v.animate().alpha(0f).setDuration(160).withEndAction { v.visibility = View.GONE }.start()
        } }

        // hide category sidebar & divider when collapsed
        categorySidebar.visibility = View.GONE
        sidebarDivider?.visibility = View.GONE
        val from = sidebarFrame.width
        val to = dpToPx(collapsedDp)
        android.util.Log.d("NavigationManager", "collapseSidebar: collapsed (to=$to)")
        if (!animated) {
            setSidebarWidth(to)
            return
        }

        animateSidebarWidth(from, to)
    }

    private fun animateSidebarWidth(from: Int, to: Int) {
        val animator = ValueAnimator.ofInt(from, to)
        animator.duration = 220
        animator.interpolator = DecelerateInterpolator()
        animator.addUpdateListener { anim ->
            val updated = anim.animatedValue as Int
            val lp = sidebarFrame.layoutParams
            lp.width = updated
            sidebarFrame.layoutParams = lp
        }
        animator.start()
    }

    private fun setSidebarWidth(px: Int) {
        val lp = sidebarFrame.layoutParams
        lp.width = px
        sidebarFrame.layoutParams = lp
    }

    private fun dpToPx(dp: Int): Int {
        return TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            dp.toFloat(),
            sidebarContainer.context.resources.displayMetrics
        ).toInt()
    }

    /**
     * Update sidebar fade color (right side gradient overlay)
     */
    fun updateSidebarFade(fadeColor: String) {
        val fadeView = sidebarContainer.findViewWithTag<View>("sidebar_fade_overlay")
        if (fadeView != null) {
            try {
                fadeView.setBackgroundColor(android.graphics.Color.parseColor(fadeColor))
            } catch (_: Exception) {}
        }
    }

    /**
     * Update sidebar background color
     */
    fun updateSidebarBackground(bgColor: String) {
        try {
            sidebarContainer.setBackgroundColor(android.graphics.Color.parseColor(bgColor))
        } catch (_: Exception) {}
    }

    /**
     * Update active item style ("square" = white square, "default" = normal)
     */
    fun updateActiveItemStyle(style: String) {
        tabViews[selectedTab]?.let { tab ->
            if (style == "square") {
                tab.setBackgroundResource(R.drawable.nav_item_active_square)
            } else {
                tab.setBackgroundResource(R.drawable.nav_item_normal)
            }
        }
    }
}
