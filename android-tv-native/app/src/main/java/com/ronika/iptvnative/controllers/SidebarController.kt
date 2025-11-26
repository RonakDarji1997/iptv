package com.ronika.iptvnative.controllers

import android.view.View
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import com.ronika.iptvnative.managers.NavigationManager

/**
 * Small controller to encapsulate all sidebar focus and click wiring.
 * Keeps MainActivity smaller and easier to maintain.
 */
class SidebarController(
    private val sidebarContainer: LinearLayout,
    private val searchButton: ImageView,
    private val tvTab: ImageView,
    private val moviesTab: ImageView,
    private val showsTab: ImageView,
    private val searchLabel: TextView?,
    private val tvLabel: TextView?,
    private val moviesLabel: TextView?,
    private val showsLabel: TextView?,
    private val profileNameLabel: TextView?,
    private val navigationManager: NavigationManager
) {

    fun setup() {
        // Click listeners keep behavior simple (delegates to manager where appropriate)
        searchButton.setOnClickListener { /* existing search handler likely in activity */ }
        tvTab.setOnClickListener { navigationManager.switchTab("TV") }
        moviesTab.setOnClickListener { navigationManager.switchTab("MOVIES") }
        showsTab.setOnClickListener { navigationManager.switchTab("SHOWS") }

        // Focus listeners expand / collapse sidebar using the NavigationManager
        val expandOnFocus = View.OnFocusChangeListener { v, hasFocus ->
            android.util.Log.d("SidebarController", "Focus changed on ${v.id}: hasFocus=$hasFocus")
            if (hasFocus) {
                android.util.Log.d("SidebarController", "Expanding sidebar")
                navigationManager.expandSidebar()
            } else {
                // Post a short delay to allow focus to move between sidebar items
                sidebarContainer.postDelayed({
                    if (!isAnySidebarFocused()) {
                        android.util.Log.d("SidebarController", "Collapsing sidebar")
                        navigationManager.collapseSidebar()
                    }
                }, 180)
            }
        }

        // Wire hover for the actionable views
        listOf(searchButton, tvTab, moviesTab, showsTab).forEach { 
            android.util.Log.d("SidebarController", "Setting focus listener on ${it.id}")
            it.onFocusChangeListener = expandOnFocus 
        }
    }

    /** Update sidebar icon sizes at runtime (dp) */
    fun updateIconSize(dp: Int) {
        fun applySize(v: View) {
            val lp = v.layoutParams
            val px = (dp * v.resources.displayMetrics.density).toInt()
            lp.width = px
            lp.height = px
            v.layoutParams = lp
            // small padding adjustment
            if (v is ImageView) {
                val pad = (dp * 0.15f * v.resources.displayMetrics.density).toInt()
                v.setPadding(pad, pad, pad, pad)
            }
        }

        applySize(searchButton)
        applySize(tvTab)
        applySize(moviesTab)
        applySize(showsTab)
        // profile handled by MainActivity if needed
    }

    /** Update sidebar spacing (vertical padding between items) */
    fun updateSidebarSpacing(dp: Int) {
        val px = (dp * sidebarContainer.resources.displayMetrics.density).toInt()
        for (i in 0 until sidebarContainer.childCount) {
            val child = sidebarContainer.getChildAt(i)
            if (i > 0) child.setPadding(0, px, 0, 0)
        }
    }

    private fun isAnySidebarFocused(): Boolean {
        return searchButton.hasFocus() || tvTab.hasFocus() || moviesTab.hasFocus() || showsTab.hasFocus()
    }
}
