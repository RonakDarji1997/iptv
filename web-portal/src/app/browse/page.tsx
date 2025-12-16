'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import HeroCarousel from '@/components/HeroCarousel'
import { ContentRow } from '@/components/ContentCard'
import ContentInfoModal from '@/components/ContentInfoModal'
import { authService } from '@/services/authService'
import { contentService, ContentItem, ContentCategory } from '@/services/contentService'
import toast from 'react-hot-toast'

export default function BrowsePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [featuredContent, setFeaturedContent] = useState<ContentItem[]>([])
  const [movies, setMovies] = useState<ContentCategory[]>([])
  const [series, setSeries] = useState<ContentCategory[]>([])
  const [liveTV, setLiveTV] = useState<ContentCategory[]>([])
  const [selectedContent, setSelectedContent] = useState<ContentItem | null>(null)
  const [modalType, setModalType] = useState<'movie' | 'series' | 'live'>('movie')

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      router.push('/auth/login')
      return
    }

    loadContent()
  }, [router])

  const loadContent = async () => {
    try {
      setLoading(true)
      const [featured, moviesData, seriesData, liveData] = await Promise.all([
        contentService.getFeaturedContent(),
        contentService.getMovies(),
        contentService.getSeries(),
        contentService.getLiveTV(),
      ])

      // Enrich first few items of each movie category with TMDB data
      const enrichedMovies = await Promise.all(
        moviesData.map(async (category) => {
          const items = category.items || []
          // Enrich first 10 visible items
          const enrichedItems = await contentService.enrichBatchWithTMDB(items, 'movie')
          return { ...category, items: enrichedItems }
        })
      )

      // Enrich series categories
      const enrichedSeries = await Promise.all(
        seriesData.map(async (category) => {
          const items = category.items || []
          const enrichedItems = await contentService.enrichBatchWithTMDB(items, 'tv')
          return { ...category, items: enrichedItems }
        })
      )

      setFeaturedContent(featured)
      setMovies(enrichedMovies)
      setSeries(enrichedSeries)
      setLiveTV(liveData) // Live TV doesn't need TMDB enrichment
    } catch (error: any) {
      toast.error('Failed to load content')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handlePlayClick = (id: string) => {
    toast.success(`Playing content: ${id}`)
    // Implement play functionality
  }

  const handleInfoClick = (item: ContentItem, type: 'movie' | 'series' | 'live') => {
    setSelectedContent(item)
    setModalType(type)
  }

  const closeModal = () => {
    setSelectedContent(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black">
        <Navbar />
        <div className="pt-16 flex items-center justify-center h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
        </div>
      </div>
    )
  }

  const heroSlides = featuredContent.map(item => ({
    id: item.id,
    title: item.title || item.name || 'Untitled',
    description: item.description || '',
    imageUrl: item.tmdb?.backdropUrl || (item as any).screenshot || '/placeholder.jpg',
  }));
  
  return (
    <div className="min-h-screen bg-black pb-20">
      <Navbar />
      
      <div className="md:pt-16">
        {/* Hero Carousel */}
        <HeroCarousel
          slides={heroSlides}
          onPlayClick={handlePlayClick}
          onInfoClick={handleInfoClick}
        />

        {/* Content Sections */}
        <div className="py-12 space-y-8">
          {/* Movies */}
          {movies.slice(0, 2).map(category => (
            <ContentRow
              key={category.id}
              title={category.name}
              items={category.items || []}
              type="movie"
              onItemClick={(item) => handleInfoClick(item, 'movie')}
            />
          ))}

          {/* Series */}
          {series.slice(0, 1).map(category => (
            <ContentRow
              key={category.id}
              title={category.name}
              items={category.items || []}
              type="series"
              onItemClick={(item) => handleInfoClick(item, 'series')}
            />
          ))}

          {/* Live TV */}
          {liveTV.slice(0, 1).map(category => (
            <ContentRow
              key={category.id}
              title={category.name}
              items={category.items || []}
              type="live"
              onItemClick={(item) => handleInfoClick(item, 'live')}
            />
          ))}

          {/* More Movies */}
          {movies.slice(2).map(category => (
            <ContentRow
              key={category.id}
              title={category.name}
              items={category.items || []}
              type="movie"
              onItemClick={(item) => handleInfoClick(item, 'movie')}
            />
          ))}
        </div>
      </div>

      {/* Content Info Modal */}
      {selectedContent && (
        <ContentInfoModal
          isOpen={!!selectedContent}
          onClose={closeModal}
          content={selectedContent}
          type={modalType}
        />
      )}
    </div>
  )
}
