'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { ContentRow } from '@/components/ContentCard'
import { authService } from '@/services/authService'
import { contentService, Category, ContentItem } from '@/services/contentService'
import toast from 'react-hot-toast'
import { Loader } from 'lucide-react'

interface CategoryWithContent extends Category {
  items: ContentItem[]
  hasMore: boolean
  loading: boolean
  loaded: boolean
}

export default function SeriesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<CategoryWithContent[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const observerRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      router.push('/auth/login')
      return
    }

    loadSeries()
  }, [router])

  const loadSeries = async () => {
    try {
      setLoading(true)
      // Get series categories - show immediately without content
      const cats = await contentService.getCategories('SERIES')
      
      const categoriesInit = cats.map(cat => ({
        ...cat,
        items: [],
        hasMore: true,
        loading: false,
        loaded: false
      }))
      
      setCategories(categoriesInit)
    } catch (error: any) {
      toast.error('Failed to load categories')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const loadCategoryContent = useCallback(async (categoryId: string) => {
    const category = categories.find(c => c.id === categoryId)
    if (!category || category.loaded || category.loading) return

    setCategories(prev => prev.map(cat => 
      cat.id === categoryId ? { ...cat, loading: true } : cat
    ))

    try {
      // Load first 2 pages in parallel
      const items = await contentService.loadInitialContent(category.category_id, false)
      
      setCategories(prev => prev.map(cat => {
        if (cat.id === categoryId) {
          return {
            ...cat,
            items,
            hasMore: items.length >= 28,
            loading: false,
            loaded: true
          }
        }
        return cat
      }))
    } catch (error) {
      console.error('Failed to load category content:', error)
      setCategories(prev => prev.map(cat => 
        cat.id === categoryId ? { ...cat, loading: false } : cat
      ))
    }
  }, [categories])

  // Set up intersection observers for each category
  useEffect(() => {
    const observers = new Map<string, IntersectionObserver>()

    categories.forEach(category => {
      const element = observerRefs.current.get(category.id)
      if (!element) return

      const observer = new IntersectionObserver(
        entries => {
          if (entries[0].isIntersecting && !category.loaded && !category.loading) {
            // Load immediately without waiting
            loadCategoryContent(category.id)
          }
        },
        { threshold: 0, rootMargin: '800px' } // Much larger preload area
      )

      observer.observe(element)
      observers.set(category.id, observer)
    })

    return () => {
      observers.forEach(observer => observer.disconnect())
    }
  }, [categories, loadCategoryContent])

  const setObserverRef = (categoryId: string) => (el: HTMLDivElement | null) => {
    if (el) {
      observerRefs.current.set(categoryId, el)
    } else {
      observerRefs.current.delete(categoryId)
    }
  }

  const handleItemClick = (categoryId: string, series: any) => {
    sessionStorage.setItem(`series_${series.id}`, JSON.stringify(series));
    router.push(`/browse/series/${categoryId}/${series.id}`);
  }

  const handleViewAll = (categoryId: string) => {
    router.push(`/browse/series/${categoryId}`)
  }

  // Filter categories based on search query
  const filteredCategories = categories.filter(cat => 
    cat.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-black">
        <Navbar />
        <div className="pt-16 flex items-center justify-center h-screen">
          <Loader className="w-12 h-12 text-blue-500 animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black pb-20">
      <Navbar />
      
      <div>
        <div className="sticky top-14 z-10 bg-black pt-4">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
              <div>
                <h1 className="text-3xl font-bold text-white">TV Series</h1>
                <p className="text-gray-400 mt-1 text-sm">Binge-worthy shows just for you</p>
              </div>
              <div className="relative w-full sm:w-64">
                <input
                  type="text"
                  placeholder="Search categories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-gray-800 text-white px-4 py-2 pr-10 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-8 mt-20">
          {filteredCategories.map(category => (
            <div key={category.id} ref={setObserverRef(category.id)}>
              {category.loaded ? (
                <ContentRow
                  title={category.name}
                  items={category.items}
                  type="series"
                  onItemClick={(series) => handleItemClick(category.category_id, series)}
                  showViewAll={category.hasMore}
                  onViewAll={() => handleViewAll(category.category_id)}
                />
              ) : category.loading ? (
                <div className="mb-12">
                  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <h2 className="text-white text-xl font-bold mb-4">{category.name}</h2>
                    <div className="flex items-center justify-center py-12">
                      <Loader className="w-8 h-8 text-blue-500 animate-spin" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mb-12">
                  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <h2 className="text-white text-xl font-bold mb-4">{category.name}</h2>
                    <div className="flex space-x-4 overflow-x-auto pb-4 scrollbar-hide -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8">
                      {[...Array(6)].map((_, i) => (
                        <div key={i} className="flex-none w-40 sm:w-48 aspect-[2/3] bg-gray-800 rounded-lg animate-pulse" />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {filteredCategories.length === 0 && (
          <div className="text-center py-20">
            {searchQuery ? (
              <>
                <p className="text-gray-400 text-lg">No categories found</p>
                <p className="text-gray-500 text-sm mt-2">
                  No categories match &quot;{searchQuery}&quot;
                </p>
              </>
            ) : (
              <>
                <p className="text-gray-400 text-lg">No series available</p>
                <p className="text-gray-500 text-sm mt-2">
                  Add a provider and sync content to see series
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
