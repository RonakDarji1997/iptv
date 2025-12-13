'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { ContentCard } from '@/components/ContentCard'
import { authService } from '@/services/authService'
import { contentService, ContentItem } from '@/services/contentService'
import toast from 'react-hot-toast'
import { Loader, ArrowLeft } from 'lucide-react'

export default function CategorySeriesPage() {
  const router = useRouter()
  const params = useParams()
  const categoryId = params.categoryId as string
  const [loading, setLoading] = useState(true)
  const [categoryName, setCategoryName] = useState('')
  const [series, setSeries] = useState<ContentItem[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [maxPage, setMaxPage] = useState(1)
  const [loadingMore, setLoadingMore] = useState(false)
  const observerTarget = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      router.push('/auth/login')
      return
    }

    loadInitialSeries()
  }, [router, categoryId])

  const loadInitialSeries = async () => {
    try {
      setLoading(true)
      
      // Get category name
      const categories = await contentService.getCategories('SERIES')
      const category = categories.find(c => c.category_id === categoryId)
      setCategoryName(category?.name || 'Series')

      // Load first page
      const result = await contentService.getVODContent(categoryId, 1)
      setSeries(result.items)
      setMaxPage(result.maxPage)
      setCurrentPage(1)
    } catch (error) {
      toast.error('Failed to load series')
      console.error('Failed to load series:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadMoreSeries = useCallback(async () => {
    if (loadingMore || currentPage >= maxPage) return

    try {
      setLoadingMore(true)
      const nextPage = currentPage + 1
      const result = await contentService.getVODContent(categoryId, nextPage)
      
      setSeries(prev => [...prev, ...result.items])
      setCurrentPage(nextPage)
    } catch (error) {
      console.error('Failed to load more series:', error)
    } finally {
      setLoadingMore(false)
    }
  }, [categoryId, currentPage, maxPage, loadingMore])

  // Intersection Observer for lazy loading
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          loadMoreSeries()
        }
      },
      { threshold: 0.1, rootMargin: '400px' } // Trigger earlier for faster scrolling
    )

    if (observerTarget.current) {
      observer.observe(observerTarget.current)
    }

    return () => observer.disconnect()
  }, [loadMoreSeries])

  const handleSeriesClick = (series: any) => {
    sessionStorage.setItem(`series_${series.id}`, JSON.stringify(series));
    router.push(`/browse/series/${categoryId}/${series.id}`);
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
              {series.length} {series.length === 1 ? 'series' : 'series'}
              {currentPage < maxPage && ' (loading more...)'}
            </p>
          </div>

          {/* Series Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {series.map(show => (
              <div key={show.id}>
                <ContentCard
                  id={show.id}
                  title={show.name || show.title || 'Untitled'}
                  logo={show.logo}
                  screenshot={show.screenshot_uri}
                  imageUrl={show.imageUrl}
                  type="series"
                  onClick={() => handleSeriesClick(show)}
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
          {currentPage >= maxPage && series.length > 0 && (
            <div className="text-center py-8 text-gray-500">
              No more series to load
            </div>
          )}

          {/* Empty state */}
          {series.length === 0 && (
            <div className="text-center py-20">
              <p className="text-gray-500">No series found in this category</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
