'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { ContentCard } from '@/components/ContentCard'
import { authService } from '@/services/authService'
import { contentService, ContentItem } from '@/services/contentService'
import toast from 'react-hot-toast'
import { Loader, ArrowLeft } from 'lucide-react'

export default function CategoryMoviesPage() {
  const router = useRouter()
  const params = useParams()
  const categoryId = params.categoryId as string
  const [loading, setLoading] = useState(true)
  const [categoryName, setCategoryName] = useState('')
  const [movies, setMovies] = useState<ContentItem[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [maxPage, setMaxPage] = useState(1)
  const [loadingMore, setLoadingMore] = useState(false)
  const observerTarget = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      router.push('/auth/login')
      return
    }

    loadInitialMovies()
  }, [router, categoryId])

  const loadInitialMovies = async () => {
    try {
      setLoading(true)
      
      // Get category name
      const categories = await contentService.getCategories('MOVIE')
      const category = categories.find(c => c.category_id === categoryId)
      setCategoryName(category?.name || 'Movies')

      // Load first page
      const result = await contentService.getVODContent(categoryId, 1)
      setMovies(result.items)
      setMaxPage(result.maxPage)
      setCurrentPage(1)
    } catch (error) {
      toast.error('Failed to load movies')
      console.error('Failed to load movies:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadMoreMovies = useCallback(async () => {
    if (loadingMore || currentPage >= maxPage) return

    try {
      setLoadingMore(true)
      const nextPage = currentPage + 1
      const result = await contentService.getVODContent(categoryId, nextPage)
      
      setMovies(prev => [...prev, ...result.items])
      setCurrentPage(nextPage)
    } catch (error) {
      console.error('Failed to load more movies:', error)
    } finally {
      setLoadingMore(false)
    }
  }, [categoryId, currentPage, maxPage, loadingMore])

  // Intersection Observer for lazy loading
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          loadMoreMovies()
        }
      },
      { threshold: 0.1, rootMargin: '400px' } // Trigger earlier for faster scrolling
    )

    if (observerTarget.current) {
      observer.observe(observerTarget.current)
    }

    return () => observer.disconnect()
  }, [loadMoreMovies])

  const handleMovieClick = (movie: any) => {
    sessionStorage.setItem(`movie_${movie.id}`, JSON.stringify(movie));
    router.push(`/browse/movies/${categoryId}/${movie.id}`);
  }

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
      
      <div className="pt-8 md:pt-24 pb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header with back button */}
          <div className="mb-8">
            <button
              onClick={() => router.back()}
              className="flex items-center text-gray-400 hover:text-white transition-colors mb-4"
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              Back
            </button>
            <h1 className="text-3xl font-bold text-white">{categoryName}</h1>
            <p className="text-gray-400 mt-1 text-sm">
              {movies.length} {movies.length === 1 ? 'movie' : 'movies'}
              {currentPage < maxPage && ' (loading more...)'}
            </p>
          </div>

          {/* Movies Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {movies.map(movie => (
              <div key={movie.id}>
                <ContentCard
                  id={movie.id}
                  title={movie.name || movie.title || 'Untitled'}
                  logo={movie.logo}
                  screenshot={movie.screenshot_uri}
                  imageUrl={movie.imageUrl}
                  type="movie"
                  onClick={() => handleMovieClick(movie)}
                />
              </div>
            ))}
          </div>

          {/* Loading indicator */}
          {loadingMore && (
            <div className="flex justify-center py-8">
              <Loader className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
          )}

          {/* Intersection observer target */}
          <div ref={observerTarget} className="h-4" />

          {/* No more content indicator */}
          {currentPage >= maxPage && movies.length > 0 && (
            <div className="text-center py-8 text-gray-500">
              No more movies to load
            </div>
          )}

          {/* Empty state */}
          {movies.length === 0 && (
            <div className="text-center py-20">
              <p className="text-gray-500">No movies found in this category</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
