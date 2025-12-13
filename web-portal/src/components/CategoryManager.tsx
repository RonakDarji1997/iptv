'use client'

import { useEffect, useState } from 'react'
import { X, Check, Loader, Tv, Film, PlaySquare } from 'lucide-react'
import toast from 'react-hot-toast'
import { providerService, Provider, Category } from '@/services/providerService'

interface CategoryManagerProps {
  provider: Provider
  onClose: () => void
}

export default function CategoryManager({ provider, onClose }: CategoryManagerProps) {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadCategories()
  }, [])

  const loadCategories = async () => {
    try {
      setLoading(true)
      const data = await providerService.getCategories(provider.id)
      setCategories(data)
    } catch (error: any) {
      toast.error('Failed to load categories')
    } finally {
      setLoading(false)
    }
  }

  const toggleCategory = async (categoryId: string, currentState: boolean) => {
    const newState = !currentState

    // Optimistic update
    setCategories((prev) =>
      prev.map((cat) =>
        cat.id === categoryId ? { ...cat, isEnabled: newState, is_enabled: newState } : cat
      )
    )

    try {
      await providerService.updateCategory(provider.id, categoryId, newState)
    } catch (error: any) {
      // Revert on error
      setCategories((prev) =>
        prev.map((cat) =>
          cat.id === categoryId ? { ...cat, isEnabled: currentState, is_enabled: currentState } : cat
        )
      )
      toast.error('Failed to update category')
    }
  }

  const selectAll = (type: 'CHANNEL' | 'MOVIE' | 'SERIES', enabled: boolean) => {
    const updates = categories
      .filter((cat) => cat.type === type)
      .map((cat) => ({ categoryId: cat.id, isEnabled: enabled }))

    // Optimistic update
    setCategories((prev) =>
      prev.map((cat) =>
        cat.type === type ? { ...cat, isEnabled: enabled } : cat
      )
    )

    // Update all in parallel
    Promise.all(
      updates.map((update) =>
        providerService.updateCategory(provider.id, update.categoryId, update.isEnabled)
      )
    ).catch(() => {
      toast.error('Failed to update categories')
      loadCategories() // Reload on error
    })
  }

  const liveCategories = categories
    .filter((c) => c.type === 'CHANNEL' || c.type === 'LIVE')
    .sort((a, b) => {
      // Move censored categories to the end
      if (a.censored !== b.censored) {
        return (a.censored || 0) - (b.censored || 0)
      }
      // Sort alphabetically by name
      return a.name.localeCompare(b.name)
    })
  
  const movieCategories = categories
    .filter((c) => c.type === 'MOVIE' || c.type === 'VOD')
    .sort((a, b) => {
      // Move censored categories to the end
      if (a.censored !== b.censored) {
        return (a.censored || 0) - (b.censored || 0)
      }
      // Sort alphabetically by name
      return a.name.localeCompare(b.name)
    })
  
  const seriesCategories = categories
    .filter((c) => c.type === 'SERIES')
    .sort((a, b) => {
      // Move censored categories to the end
      if (a.censored !== b.censored) {
        return (a.censored || 0) - (b.censored || 0)
      }
      // Sort alphabetically by name
      return a.name.localeCompare(b.name)
    })

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-gray-900 border border-white/20 rounded-2xl p-8 max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold">Manage Categories</h2>
            <p className="text-gray-400">{provider.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {loading ? (
          <div className="text-center py-20">
            <Loader className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
            <p className="text-gray-400">Loading categories...</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-6">
            {/* Live TV Categories */}
            <CategorySection
              title="Live TV"
              icon={<Tv className="w-6 h-6 text-blue-500" />}
              categories={liveCategories}
              onToggle={toggleCategory}
              onSelectAll={(enabled) => selectAll('CHANNEL', enabled)}
            />

            {/* Movie Categories */}
            <CategorySection
              title="Movies"
              icon={<Film className="w-6 h-6 text-purple-500" />}
              categories={movieCategories}
              onToggle={toggleCategory}
              onSelectAll={(enabled) => selectAll('MOVIE', enabled)}
            />

            {/* Series Categories */}
            <CategorySection
              title="Series"
              icon={<PlaySquare className="w-6 h-6 text-green-500" />}
              categories={seriesCategories}
              onToggle={toggleCategory}
              onSelectAll={(enabled) => selectAll('SERIES', enabled)}
            />
          </div>
        )}

        {/* Close Button */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

interface CategorySectionProps {
  title: string
  icon: React.ReactNode
  categories: Category[]
  onToggle: (id: string, currentState: boolean) => void
  onSelectAll: (enabled: boolean) => void
}

function CategorySection({
  title,
  icon,
  categories,
  onToggle,
  onSelectAll,
}: CategorySectionProps) {
  const allSelected = categories.every((c) => (c.isEnabled ?? c.is_enabled ?? true))
  const noneSelected = categories.every((c) => !(c.isEnabled ?? c.is_enabled ?? true))

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          {icon}
          <h3 className="text-lg font-bold">{title}</h3>
        </div>
        <span className="text-sm text-gray-400">{categories.length}</span>
      </div>

      {/* Select/Deselect All */}
      <div className="flex space-x-2 mb-4">
        <button
          onClick={() => onSelectAll(true)}
          disabled={allSelected}
          className="flex-1 px-3 py-1.5 text-xs bg-green-600 hover:bg-green-700 disabled:bg-green-900 disabled:opacity-50 rounded transition-colors"
        >
          Select All
        </button>
        <button
          onClick={() => onSelectAll(false)}
          disabled={noneSelected}
          className="flex-1 px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 disabled:bg-red-900 disabled:opacity-50 rounded transition-colors"
        >
          Deselect All
        </button>
      </div>

      {/* Category List */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {categories.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">No categories</p>
        ) : (
          categories.map((category) => {
            const isEnabled = category.isEnabled ?? category.is_enabled ?? true
            const isCensored = category.censored === 1
            return (
              <button
                key={category.id}
                onClick={() => onToggle(category.id, isEnabled)}
                className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors text-left ${
                  isCensored 
                    ? 'bg-red-900/20 hover:bg-red-900/30 border border-red-500/20' 
                    : 'bg-white/5 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center space-x-2 flex-1">
                  <span className="text-sm truncate">{category.name}</span>
                  {isCensored && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded uppercase font-semibold">
                      18+
                    </span>
                  )}
                </div>
                <div
                  className={`w-5 h-5 rounded flex items-center justify-center ml-2 ${
                    isEnabled
                      ? 'bg-green-500'
                      : 'bg-gray-700 border border-gray-600'
                  }`}
                >
                  {isEnabled && <Check className="w-4 h-4" />}
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
