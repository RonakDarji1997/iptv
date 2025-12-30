'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { ContentRow } from '@/components/ContentCard'
import { authService } from '@/services/authService'
import { contentService, Category, ContentItem } from '@/services/contentService'
import toast from 'react-hot-toast'
import { Loader, Heart, Clock, Play, Info, Volume2, VolumeX } from 'lucide-react'

interface CategoryWithContent extends Category {
  items: ContentItem[]
  hasMore: boolean
  loading: boolean
  loaded: boolean
}

interface FeaturedMovie {
  id: string
  name: string
  description: string
  poster: string
  backdrop: string
  year?: number
  rating?: number
  logo?: string
}

export default function MoviesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<CategoryWithContent[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [featuredMovie, setFeaturedMovie] = useState<FeaturedMovie | null>(null)
  const [trailerKey, setTrailerKey] = useState<string | null>(null)
  const [showTrailer, setShowTrailer] = useState(true)
  const [isMuted, setIsMuted] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const observerRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const heroContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      router.push('/auth/login')
      return
    }

    loadMovies()
  }, [router])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const loadMovies = async () => {
    try {
      setLoading(true)
      // Get movie categories - show immediately without content
      const cats = await contentService.getCategories('MOVIE')
      
      const categoriesInit = cats.map(cat => ({
        ...cat,
        items: [],
        hasMore: true,
        loading: false,
        loaded: false
      }))
      
      setCategories(categoriesInit)
      
      // Load featured movie from first category
      if (cats.length > 0) {
        loadFeaturedMovie(cats[0].category_id)
      }
    } catch (error: any) {
      toast.error('Failed to load categories')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const loadFeaturedMovie = async (categoryId: string) => {
    try {
      const result = await contentService.getVODContent(categoryId, 1)
      if (result.items.length > 0) {
        const movie = result.items[0]
        
        // Fetch TMDB data
        const tmdbRes = await fetch(`/api/tmdb?action=search&query=${encodeURIComponent(movie.name)}&type=movie`)
        const tmdbData = await tmdbRes.json()
        
        if (tmdbData.success && tmdbData.results?.[0]) {
          const tmdbMovie = tmdbData.results[0]
          
          // Fetch backdrop
          const backdropRes = await fetch(`/api/tmdb?action=images&id=${tmdbMovie.id}&type=movie`)
          const backdropData = await backdropRes.json()
          
          // Fetch logo
          const logoRes = await fetch(`/api/tmdb?action=logos&id=${tmdbMovie.id}&type=movie`)
          const logoData = await logoRes.json()
          
          // Fetch trailer
          const videoRes = await fetch(`/api/tmdb?action=videos&id=${tmdbMovie.id}&type=movie`)
          const videoData = await videoRes.json()
          
          const backdrop = backdropData.backdrops?.[0]?.file_path
          const logo = logoData.logos?.[0]?.file_path
          const trailer = videoData.videos?.find((v: any) => 
            v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser')
          )
          
          setFeaturedMovie({
            id: movie.id,
            name: movie.name,
            description: tmdbMovie.overview || movie.description || '',
            poster: movie.screenshot_uri || movie.imageUrl || '',
            backdrop: backdrop ? `https://image.tmdb.org/t/p/original${backdrop}` : (movie.screenshot_uri || movie.imageUrl || ''),
            year: tmdbMovie.release_date ? new Date(tmdbMovie.release_date).getFullYear() : undefined,
            rating: tmdbMovie.vote_average ? Math.round(tmdbMovie.vote_average * 10) / 10 : undefined,
            logo: logo ? `https://image.tmdb.org/t/p/w500${logo}` : undefined
          })
          
          if (trailer) {
            setTrailerKey(trailer.key)
          }
        } else {
          // Fallback to basic info
          setFeaturedMovie({
            id: movie.id,
            name: movie.name,
            description: movie.description || '',
            poster: movie.screenshot_uri || movie.imageUrl || '',
            backdrop: movie.screenshot_uri || movie.imageUrl || ''
          })
        }
      }
    } catch (error) {
      console.error('Failed to load featured movie:', error)
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

  const handleItemClick = (categoryId: string, movie: any) => {
    sessionStorage.setItem(`movie_${movie.id}`, JSON.stringify(movie));
    router.push(`/browse/movies/${categoryId}/${movie.id}`);
  }

  const handleViewAll = (categoryId: string) => {
    router.push(`/browse/movies/${categoryId}`)
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

        <div className="sticky top-14 z-10 bg-black pt-4 pb-3">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
              <div>
                <h1 className="text-3xl font-bold text-white">Movies</h1>
                <p className="text-gray-400 mt-1 text-sm">Discover your next favorite film</p>
              </div>
              
              {/* Quick Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => router.push('/favorites')}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                >
                  <Heart className="w-4 h-4" />
                  <span className="hidden sm:inline">My Favorites</span>
                </button>
                <button
                  onClick={() => router.push('/continue-watching')}
                  className="flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors"
                >
                  <Clock className="w-4 h-4" />
                  <span className="hidden sm:inline">Continue Watching</span>
                </button>
              </div>
            </div>
            
            <div className="relative w-full sm:w-64 mt-4">
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

        <div className="space-y-8 mt-20">
          {filteredCategories.map(category => {
            // Don't show category if it's loaded but has no items
            if (category.loaded && category.items.length === 0) {
              return null;
            }
            
            return (
              <div key={category.id} ref={setObserverRef(category.id)}>
                {category.loaded ? (
                  <ContentRow
                    title={category.name}
                    items={category.items}
                    type="movie"
                    onItemClick={(movie) => handleItemClick(category.category_id, movie)}
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
            );
          })}
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
                <p className="text-gray-400 text-lg">No movies available</p>
                <p className="text-gray-500 text-sm mt-2">
                  Add a provider and sync content to see movies
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
