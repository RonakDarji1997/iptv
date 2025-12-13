'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { Radio, Loader, Play } from 'lucide-react'
import { authService } from '@/services/authService'
import { contentService, Category, ContentItem } from '@/services/contentService'
import toast from 'react-hot-toast'
import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

// Cache provider URL in localStorage
const PROVIDER_URL_KEY = 'provider_url'
const PROVIDER_URL_TIMESTAMP_KEY = 'provider_url_timestamp'
const CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours

let providerUrlPromise: Promise<string | null> | null = null

async function getProviderUrl(): Promise<string | null> {
  // Check localStorage first
  if (typeof window !== 'undefined') {
    const cached = localStorage.getItem(PROVIDER_URL_KEY)
    const timestamp = localStorage.getItem(PROVIDER_URL_TIMESTAMP_KEY)
    
    if (cached && timestamp) {
      const age = Date.now() - parseInt(timestamp)
      if (age < CACHE_DURATION) {
        return cached
      }
    }
  }

  // If already fetching, wait for that promise
  if (providerUrlPromise) return providerUrlPromise

  providerUrlPromise = (async () => {
    try {
      const response = await axios.get(`${API_URL}/sync/pull`, {
        headers: authService.getAuthHeader(),
      })
      const providers = response.data.data?.providers || []
      const activeProvider = providers.find((p: any) => p.is_active)
      
      if (activeProvider?.server_url) {
        const url = activeProvider.server_url
        // Store in localStorage
        if (typeof window !== 'undefined') {
          localStorage.setItem(PROVIDER_URL_KEY, url)
          localStorage.setItem(PROVIDER_URL_TIMESTAMP_KEY, Date.now().toString())
        }
        return url
      }
      return null
    } catch (error) {
      console.error('Failed to fetch provider URL:', error)
      return null
    } finally {
      providerUrlPromise = null
    }
  })()

  return providerUrlPromise
}

function ChannelThumbnail({ logo, name }: { logo?: string; name: string }) {
  const [imageUrl, setImageUrl] = useState<string>('')
  const [imageError, setImageError] = useState(false)

  useEffect(() => {
    if (!logo) return

    const buildUrl = async () => {
      if (logo.startsWith('http')) {
        setImageUrl(logo)
        return
      }

      const baseUrl = await getProviderUrl()
      if (!baseUrl) return

      const cleanPath = logo.startsWith('/') ? logo.slice(1) : logo
      setImageUrl(`${baseUrl}/${cleanPath}`)
    }

    buildUrl()
  }, [logo])

  return (
    <div className="relative group cursor-pointer transition-transform duration-300 hover:scale-105">
      <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-gradient-to-br from-gray-800 to-gray-900 shadow-lg border border-gray-700 group-hover:border-gray-500 transition-colors">
        {imageUrl && !imageError ? (
          <img 
            src={imageUrl}
            alt={name} 
            className="w-full h-full object-cover" 
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center p-4">
              <div className="w-16 h-16 mx-auto bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mb-3">
                <Radio className="w-8 h-8 text-white" />
              </div>
              <p className="text-white text-xs font-medium line-clamp-2">{name}</p>
            </div>
          </div>
        )}
        
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-opacity flex items-center justify-center opacity-0 group-hover:opacity-100">
          <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center">
            <Play className="w-6 h-6 text-black ml-1" fill="currentColor" />
          </div>
        </div>
      </div>
      
      {/* Channel name below thumbnail */}
      <div className="mt-2 px-1">
        <h3 className="text-white font-semibold text-sm line-clamp-2 leading-tight">
          {name}
        </h3>
      </div>
    </div>
  )
}

interface CategoryWithChannels extends Category {
  channels: ContentItem[]
  currentPage: number
  maxPage: number
  loading: boolean
  loaded: boolean
}

export default function LiveTVPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<CategoryWithChannels[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const observerTarget = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      router.push('/auth/login')
      return
    }

    loadCategories()
  }, [router])

  const loadCategories = async () => {
    try {
      setLoading(true)
      const cats = await contentService.getCategories('LIVE')
      
      // Just load categories, don't fetch channels yet
      const categoriesInit = cats.map(cat => ({
        ...cat,
        channels: [],
        currentPage: 0,
        maxPage: 10,
        loading: false,
        loaded: false
      }))
      
      setCategories(categoriesInit)
      if (categoriesInit.length > 0) {
        setSelectedCategory(categoriesInit[0].id)
        // Load first category's channels immediately
        loadCategoryChannels(categoriesInit[0].id, categoriesInit)
      }
    } catch (error: any) {
      toast.error('Failed to load categories')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const loadCategoryChannels = async (categoryId: string, currentCats?: CategoryWithChannels[]) => {
    const cats = currentCats || categories
    const category = cats.find(c => c.id === categoryId)
    
    if (!category || category.loaded || category.loading) return

    setCategories(prev => prev.map(cat => 
      cat.id === categoryId ? { ...cat, loading: true } : cat
    ))

    try {
      // Load first 2 pages instantly
      const [page1, page2] = await Promise.all([
        contentService.getLiveChannels(category.category_id, 1),
        contentService.getLiveChannels(category.category_id, 2)
      ])

      setCategories(prev => prev.map(cat => {
        if (cat.id === categoryId) {
          return {
            ...cat,
            channels: [...page1.items, ...page2.items],
            currentPage: 2,
            maxPage: page1.maxPage,
            loading: false,
            loaded: true
          }
        }
        return cat
      }))
    } catch (error) {
      console.error('Failed to load channels:', error)
      setCategories(prev => prev.map(cat => 
        cat.id === categoryId ? { ...cat, loading: false } : cat
      ))
    }
  }

  const handleCategoryChange = (categoryId: string) => {
    setSelectedCategory(categoryId)
    loadCategoryChannels(categoryId)
  }

  const loadMoreChannels = useCallback(async () => {
    const currentCat = categories.find(c => c.id === selectedCategory)
    if (!currentCat || currentCat.loading || currentCat.currentPage >= currentCat.maxPage) {
      return
    }

    setCategories(prev => prev.map(cat => 
      cat.id === selectedCategory ? { ...cat, loading: true } : cat
    ))

    try {
      const nextPage = currentCat.currentPage + 1
      const result = await contentService.getLiveChannels(currentCat.category_id, nextPage)
      
      setCategories(prev => prev.map(cat => {
        if (cat.id === selectedCategory) {
          return {
            ...cat,
            channels: [...cat.channels, ...result.items],
            currentPage: nextPage,
            maxPage: result.maxPage,
            loading: false
          }
        }
        return cat
      }))
    } catch (error) {
      console.error('Failed to load more channels:', error)
      setCategories(prev => prev.map(cat => 
        cat.id === selectedCategory ? { ...cat, loading: false } : cat
      ))
    }
  }, [categories, selectedCategory])

  // Intersection Observer for lazy loading
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          loadMoreChannels()
        }
      },
      { threshold: 0.1 }
    )

    if (observerTarget.current) {
      observer.observe(observerTarget.current)
    }

    return () => observer.disconnect()
  }, [loadMoreChannels])

  const handleChannelClick = (cmd: string, name: string, num?: string) => {
    // Navigate to live player with channel info
    const params = new URLSearchParams({
      cmd,
      name: encodeURIComponent(name),
    });
    if (num) {
      params.append('num', num);
    }
    router.push(`/player/live?${params.toString()}`);
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

  const currentCategory = categories.find(cat => cat.id === selectedCategory)
  const filteredChannels = currentCategory?.channels || []

  return (
    <div className="min-h-screen bg-black pb-20">
      <Navbar />
      
      <div>
        <div className="sticky top-14 z-10 bg-black pt-4">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Title and Search - Responsive Layout */}
            <div className="mb-4">
              {/* Title */}
              <div className="mb-3 sm:mb-4">
                <h1 className="text-2xl sm:text-3xl font-bold text-white">Live TV</h1>
                <p className="text-gray-400 mt-1 text-sm">Watch your favorite channels live</p>
              </div>
              
              {/* Search - Full width on mobile, right-aligned on desktop */}
              <div className="sm:float-right sm:ml-4">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search categories..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-gray-800 text-white px-4 py-2 pr-10 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64"
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
              
              {/* Clear float */}
              <div className="clear-both"></div>
            </div>

            {/* Category Filter */}
            <div className="flex space-x-2 overflow-x-auto pb-2 scrollbar-hide">
              {categories.filter(cat => 
                cat.name.toLowerCase().includes(searchQuery.toLowerCase())
              ).map(category => (
                <button
                  key={category.id}
                  onClick={() => handleCategoryChange(category.id)}
                  className={`px-6 py-2 rounded-full whitespace-nowrap transition-colors ${
                    selectedCategory === category.id
                      ? 'bg-white text-black'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-20">
          {/* Loading state for category switch */}
          {currentCategory && !currentCategory.loaded && currentCategory.loading ? (
            <div className="flex justify-center py-20">
              <Loader className="w-12 h-12 text-blue-500 animate-spin" />
            </div>
          ) : (
            <>
              {/* Channel Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {filteredChannels.map(channel => (
                  <div
                    key={channel.id}
                    onClick={() => handleChannelClick(
                      channel.cmd || channel.id,
                      channel.name || channel.title || '', 
                      (channel as any).num
                    )}
                  >
                    <ChannelThumbnail 
                      logo={channel.logo} 
                      name={channel.name || channel.title || 'Unknown Channel'} 
                    />
                  </div>
                ))}
              </div>

              {/* Loading indicator for lazy load */}
              {currentCategory?.loading && (
                <div className="flex justify-center py-8">
                  <Loader className="w-8 h-8 text-blue-500 animate-spin" />
                </div>
              )}

              {/* Intersection observer target */}
              <div ref={observerTarget} className="h-4" />

              {filteredChannels.length === 0 && (
                <div className="text-center py-20">
                  <Radio className="w-16 h-16 text-gray-700 mx-auto mb-4" />
                  <p className="text-gray-400 text-lg">No channels available</p>
                  <p className="text-gray-500 text-sm mt-2">
                    Add a provider and sync content to see live TV channels
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
