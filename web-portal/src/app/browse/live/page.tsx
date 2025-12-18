'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { Radio, Loader, Play, Maximize, Star, Heart } from 'lucide-react'
import { authService } from '@/services/authService'
import { contentService, Category, ContentItem } from '@/services/contentService'
import toast from 'react-hot-toast'
import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

// Cache provider URL in localStorage
const PROVIDER_URL_KEY = 'provider_url'
const PROVIDER_URL_TIMESTAMP_KEY = 'provider_url_timestamp'
const PROVIDER_ID_KEY = 'active_provider_id'
const CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours

let providerUrlPromise: Promise<string | null> | null = null
let providerDataPromise: Promise<{ url: string; id: string } | null> | null = null

async function getProviderData(): Promise<{ url: string; id: string } | null> {
  // If already fetching, wait for that promise
  if (providerDataPromise) return providerDataPromise

  providerDataPromise = (async () => {
    try {
      const response = await axios.get(`${API_URL}/sync/pull`, {
        headers: authService.getAuthHeader(),
      })
      const providers = response.data.data?.providers || []
      const activeProvider = providers.find((p: any) => p.is_active)
      
      if (activeProvider?.server_url && activeProvider?.id) {
        const data = { url: activeProvider.server_url, id: activeProvider.id }
        // Store in localStorage
        if (typeof window !== 'undefined') {
          localStorage.setItem(PROVIDER_URL_KEY, data.url)
          localStorage.setItem(PROVIDER_ID_KEY, data.id)
          localStorage.setItem(PROVIDER_URL_TIMESTAMP_KEY, Date.now().toString())
        }
        return data
      }
      return null
    } catch (error) {
      console.error('Failed to fetch provider data:', error)
      return null
    } finally {
      providerDataPromise = null
    }
  })()

  return providerDataPromise
}

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

  // Fetch fresh data
  const data = await getProviderData()
  return data?.url || null
}

// Helper function to build logo URL
async function buildLogoUrl(logo: string | undefined): Promise<string> {
  if (!logo) return ''
  if (logo.startsWith('http')) return logo
  
  const baseUrl = await getProviderUrl()
  if (!baseUrl) return ''
  
  // Extract just the filename from paths like "stalker_portal/misc/logos/320/70323.jpeg"
  const filename = logo.split('/').pop() || logo
  return `${baseUrl}/stalker_portal/misc/logos/320/${filename}`
}

function ChannelLogoImage({ logo, name }: { logo?: string; name: string }) {
  const [imageUrl, setImageUrl] = useState<string>('')

  useEffect(() => {
    buildLogoUrl(logo).then(setImageUrl)
  }, [logo])

  return (
    <div className="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-gray-700">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={name}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none'
          }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Radio className="w-6 h-6 text-gray-600" />
        </div>
      )}
    </div>
  )
}

function ChannelThumbnail({ logo, name }: { logo?: string; name: string }) {
  const [imageUrl, setImageUrl] = useState<string>('')
  const [imageError, setImageError] = useState(false)

  useEffect(() => {
    buildLogoUrl(logo).then(setImageUrl)
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
  totalItems: number
  loading: boolean
  loaded: boolean
}

export default function LiveTVPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<CategoryWithChannels[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [selectedChannel, setSelectedChannel] = useState<ContentItem | null>(null)
  const [selectedChannelLogoUrl, setSelectedChannelLogoUrl] = useState<string>('')
  const [streamUrl, setStreamUrl] = useState<string | null>(null)
  const [isLoadingStream, setIsLoadingStream] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'categories' | 'channels'>('categories')
  const [favoriteChannels, setFavoriteChannels] = useState<Set<string>>(new Set())
  const [favoriteCategories, setFavoriteCategories] = useState<Set<string>>(new Set())
  const [homePageFavoriteChannelId, setHomePageFavoriteChannelId] = useState<string | null>(null)
  const [showMobileOverlay, setShowMobileOverlay] = useState(true)
  const observerTarget = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Load favorites from database
  useEffect(() => {
    const loadFavorites = async () => {
      try {
        const [favoritesResponse, settingsResponse] = await Promise.all([
          axios.get(`${API_URL}/favorites`, {
            headers: authService.getAuthHeader(),
          }),
          axios.get(`${API_URL}/user-settings`, {
            headers: authService.getAuthHeader(),
          })
        ])
        
        if (favoritesResponse.data.success) {
          const channelFavs = favoritesResponse.data.favorites
            .filter((f: any) => f.content_type === 'CHANNEL')
            .map((f: any) => f.content_id)
          const categoryFavs = favoritesResponse.data.favorites
            .filter((f: any) => f.content_type === 'CATEGORY')
            .map((f: any) => f.content_id)
          setFavoriteChannels(new Set(channelFavs))
          setFavoriteCategories(new Set(categoryFavs))
        }
        
        if (settingsResponse.data.success && settingsResponse.data.settings?.favorite_channel_id) {
          setHomePageFavoriteChannelId(settingsResponse.data.settings.favorite_channel_id)
        }
      } catch (e) {
        console.error('Failed to load favorites:', e)
      }
    }
    loadFavorites()
  }, [])

  // Auto-hide mobile overlay after 3.5 seconds
  useEffect(() => {
    if (selectedChannel) {
      setShowMobileOverlay(true)
      const timer = setTimeout(() => {
        setShowMobileOverlay(false)
      }, 3500)
      return () => clearTimeout(timer)
    }
  }, [selectedChannel])

  // Restore selected channel on mount (coming back from fullscreen)
  useEffect(() => {
    const savedChannel = sessionStorage.getItem('live_tv_selected_channel')
    const savedCategory = sessionStorage.getItem('live_tv_selected_category')
    const savedViewMode = sessionStorage.getItem('live_tv_view_mode')
    
    if (savedChannel) {
      try {
        const channel = JSON.parse(savedChannel)
        setSelectedChannel(channel)
      } catch (e) {
        console.error('Failed to restore channel:', e)
      }
    }
    
    if (savedCategory) {
      setSelectedCategory(savedCategory)
    }
    
    if (savedViewMode) {
      setViewMode(savedViewMode as 'categories' | 'channels')
    }
  }, [])

  // Save selected channel to sessionStorage
  useEffect(() => {
    if (selectedChannel) {
      sessionStorage.setItem('live_tv_selected_channel', JSON.stringify(selectedChannel))
    } else {
      sessionStorage.removeItem('live_tv_selected_channel')
    }
  }, [selectedChannel])

  // Save selected category to sessionStorage
  useEffect(() => {
    if (selectedCategory) {
      sessionStorage.setItem('live_tv_selected_category', selectedCategory)
    }
  }, [selectedCategory])

  // Save view mode to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('live_tv_view_mode', viewMode)
  }, [viewMode])

  // Update logo URL when selected channel changes
  useEffect(() => {
    if (selectedChannel?.logo) {
      buildLogoUrl(selectedChannel.logo).then(setSelectedChannelLogoUrl)
    } else {
      setSelectedChannelLogoUrl('')
    }
  }, [selectedChannel])

  // Load stream when channel is selected
  useEffect(() => {
    if (selectedChannel) {
      loadStream(selectedChannel)
    } else {
      setStreamUrl(null)
    }
  }, [selectedChannel])

  const loadStream = async (channel: ContentItem) => {
    try {
      setIsLoadingStream(true)
      setStreamUrl(null)
      
      const token = authService.getToken()
      const cmd = channel.cmd || channel.id
      
      const response = await fetch(`${API_URL}/stalker-proxy/channel-stream?cmd=${encodeURIComponent(cmd)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const data = await response.json()
      if (data.success && data.stream && data.stream.cmd) {
        setStreamUrl(data.stream.cmd)
      } else {
        toast.error('Failed to load stream')
      }
    } catch (error) {
      console.error('Failed to load stream:', error)
      toast.error('Failed to start playback')
    } finally {
      setIsLoadingStream(false)
    }
  }

  const toggleFavorite = async (channel: ContentItem) => {
    const channelId = channel.id
    const isFavorite = favoriteChannels.has(channelId)
    
    try {
      if (isFavorite) {
        await axios.delete(`${API_URL}/favorites/by-content/CHANNEL/${channelId}`, {
          headers: authService.getAuthHeader(),
        })
        const newFavorites = new Set(favoriteChannels)
        newFavorites.delete(channelId)
        setFavoriteChannels(newFavorites)
        toast.success('Removed from favorites')
      } else {
        const logoUrl = await buildLogoUrl((channel as any).logo || '')
        const metadata = {
          logo: logoUrl,
          cmd: channel.cmd,
          categoryName: categories.find(c => c.id === selectedCategory)?.name,
          num: (channel as any).num
        }
        await axios.post(`${API_URL}/favorites`, {
          contentType: 'CHANNEL',
          contentId: channelId,
          contentName: channel.name || channel.title,
          contentPoster: logoUrl,
          categoryId: selectedCategory,
          metadata
        }, {
          headers: authService.getAuthHeader(),
        })
        const newFavorites = new Set(favoriteChannels)
        newFavorites.add(channelId)
        setFavoriteChannels(newFavorites)
        toast.success('Added to favorites')
      }
    } catch (error) {
      console.error('Failed to toggle favorite:', error)
      toast.error('Failed to update favorites')
    }
  }

  const setAsHomePageFavorite = async (channel: ContentItem) => {
    const channelId = channel.id
    
    try {
      // First track the channel in analytics to have the data
      const providerData = await getProviderData()
      const logoUrl = await buildLogoUrl((channel as any).logo || '')
      
      await axios.post(`${API_URL}/channel-analytics/track`, {
        providerId: providerData?.id,
        channelId,
        channelName: channel.name || channel.title,
        channelLogo: logoUrl,
        channelCmd: channel.cmd,
        channelNumber: (channel as any).num,
        categoryId: selectedCategory,
        categoryName: categories.find(c => c.id === selectedCategory)?.name,
        watchTime: 0
      }, {
        headers: authService.getAuthHeader(),
      })
      
      // Set as homepage favorite
      await axios.post(`${API_URL}/user-settings/favorite-channel`, {
        channelId
      }, {
        headers: authService.getAuthHeader(),
      })
      
      setHomePageFavoriteChannelId(channelId)
      toast.success('Set as homepage favorite channel! 🏠', { duration: 3000 })
    } catch (error) {
      console.error('Failed to set homepage favorite:', error)
      toast.error('Failed to set as homepage favorite')
    }
  }

  const toggleCategoryFavorite = async (category: Category) => {
    const categoryId = category.id
    const isFavorite = favoriteCategories.has(categoryId)
    
    try {
      if (isFavorite) {
        await axios.delete(`${API_URL}/favorites/by-content/CATEGORY/${categoryId}`, {
          headers: authService.getAuthHeader(),
        })
        const newFavorites = new Set(favoriteCategories)
        newFavorites.delete(categoryId)
        setFavoriteCategories(newFavorites)
        toast.success('Category removed from favorites')
      } else {
        await axios.post(`${API_URL}/favorites`, {
          contentType: 'CATEGORY',
          contentId: categoryId,
          contentName: category.name,
          metadata: { category_id: category.category_id }
        }, {
          headers: authService.getAuthHeader(),
        })
        const newFavorites = new Set(favoriteCategories)
        newFavorites.add(categoryId)
        setFavoriteCategories(newFavorites)
        toast.success('Category added to favorites')
      }
    } catch (error) {
      console.error('Failed to toggle category favorite:', error)
      toast.error('Failed to update category favorites')
    }
  }

  const updateChannelStats = async (channel: ContentItem) => {
    try {
      const providerData = await getProviderData()
      const logoUrl = await buildLogoUrl((channel as any).logo || '')
      
      await axios.post(`${API_URL}/channel-analytics/track`, {
        providerId: providerData?.id,
        channelId: channel.id,
        channelName: channel.name || channel.title,
        channelLogo: logoUrl,
        channelCmd: channel.cmd,
        channelNumber: (channel as any).num,
        categoryId: selectedCategory,
        categoryName: categories.find(c => c.id === selectedCategory)?.name,
        watchTime: 0
      }, {
        headers: authService.getAuthHeader(),
      })
    } catch (error) {
      console.error('Failed to track channel play:', error)
    }
  }

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      router.push('/auth/login')
      return
    }

    loadCategories()
  }, [router])

  // Load selected category channels after categories are loaded
  useEffect(() => {
    if (categories.length > 0 && selectedCategory && viewMode === 'channels') {
      const category = categories.find(c => c.id === selectedCategory)
      if (category && !category.loaded) {
        loadCategoryChannels(selectedCategory)
      }
    }
  }, [categories, selectedCategory, viewMode])

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
        totalItems: 0,
        loading: false,
        loaded: false
      }))
      
      setCategories(categoriesInit)
      // Don't auto-select or auto-load anything on page load
      // if (categoriesInit.length > 0) {
      //   setSelectedCategory(categoriesInit[0].id)
      //   loadCategoryChannels(categoriesInit[0].id, categoriesInit)
      // }
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
      // Load only first page initially
      const page1 = await contentService.getLiveChannels(category.category_id, 1)

      setCategories(prev => prev.map(cat => {
        if (cat.id === categoryId) {
          return {
            ...cat,
            channels: page1.items,
            currentPage: 1,
            maxPage: page1.maxPage,
            totalItems: page1.totalItems || page1.items.length,
            loading: false,
            loaded: true
          }
        }
        return cat
      }))
      
      // Don't auto-select first channel anymore
      // if (allChannels.length > 0 && !selectedChannel) {
      //   setSelectedChannel(allChannels[0])
      // }
    } catch (error) {
      console.error('Failed to load channels:', error)
      setCategories(prev => prev.map(cat => 
        cat.id === categoryId ? { ...cat, loading: false } : cat
      ))
    }
  }

  const handleCategoryChange = (categoryId: string) => {
    setSelectedCategory(categoryId)
    setViewMode('channels')
    loadCategoryChannels(categoryId)
    
    // Don't auto-select first channel when switching categories
    // Let user explicitly click a channel
    // const category = categories.find(c => c.id === categoryId)
    // if (category && category.channels.length > 0) {
    //   setSelectedChannel(category.channels[0])
    // }
  }

  const handleBackToCategories = () => {
    setViewMode('categories')
    // Don't clear selected channel - keep it playing
    // setSelectedChannel(null)
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
    <div className="h-screen bg-black flex flex-col overflow-hidden">
      <Navbar />
      
      <div className="flex-1 overflow-hidden pt-16 pb-0 lg:pb-20">
        <div className="h-full px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto flex flex-col pb-0 lg:pb-6">
          <div className="mb-4 mt-6 flex-shrink-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Live TV</h1>
            <p className="text-gray-400 mt-1 text-sm">Watch your favorite channels live</p>
          </div>

          {/* Split Screen Layout - Takes remaining height */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0">
            {/* Left Panel: Categories or Channels */}
            <div className="bg-gray-900 rounded-lg overflow-hidden flex flex-col">
              {viewMode === 'categories' ? (
                // Categories List
                <div className="p-4 flex flex-col h-full">
                  <h2 className="text-lg font-semibold text-white mb-4 flex-shrink-0">Categories</h2>
                  <div className="space-y-2 flex-1 overflow-y-auto">
                    {categories
                      .filter(cat => cat.name.toLowerCase().includes(searchQuery.toLowerCase()))
                      .sort((a, b) => {
                        const aFav = favoriteCategories.has(a.id)
                        const bFav = favoriteCategories.has(b.id)
                        if (aFav && !bFav) return -1
                        if (!aFav && bFav) return 1
                        return 0
                      })
                      .map(category => (
                      <div
                        key={category.id}
                        className="w-full text-left px-4 py-3 rounded-lg transition-colors bg-gray-800 text-gray-300 hover:bg-gray-700 flex items-center justify-between group cursor-pointer"
                        onClick={() => handleCategoryChange(category.id)}
                      >
                        <div className="flex-1">
                          <div className="font-medium">{category.name}</div>
                          {category.loaded && category.totalItems && (
                            <div className="text-xs text-gray-400 mt-1">
                              {category.totalItems} channels
                            </div>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleCategoryFavorite(category)
                          }}
                          className="ml-2 p-2 hover:bg-gray-600 rounded-lg transition-colors"
                          title={favoriteCategories.has(category.id) ? 'Remove from favorites' : 'Add to favorites'}
                        >
                          <Star 
                            className={`w-5 h-5 ${favoriteCategories.has(category.id) ? 'text-yellow-500 fill-yellow-500' : 'text-gray-400'}`}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                // Channels List with Back Button
                <div className="flex flex-col h-full">
                  {/* Fixed Header with Back Button */}
                  <div className="bg-gray-900 border-b border-gray-800 p-4 flex-shrink-0">
                    <button
                      onClick={handleBackToCategories}
                      className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-3"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                      <span>Back to Categories</span>
                    </button>
                    <h2 className="text-xl font-bold text-white">{currentCategory?.name}</h2>
                    <p className="text-sm text-gray-400 mt-1">
                      {currentCategory?.totalItems || filteredChannels.length} channels
                    </p>
                  </div>

                  {/* Channels List */}
                  <div className="p-4 flex-1 overflow-y-auto">
                    {currentCategory && !currentCategory.loaded && currentCategory.loading ? (
                      <div className="flex justify-center py-20">
                        <Loader className="w-12 h-12 text-blue-500 animate-spin" />
                      </div>
                    ) : (
                      <>
                        <div className="space-y-2">
                          {filteredChannels.map((channel, index) => {
                            return (
                              <div
                                key={channel.id}
                                onClick={async () => {
                                  setSelectedChannel(channel)
                                  updateChannelStats(channel)
                                  // Build and set logo URL
                                  if (channel.logo) {
                                    const url = await buildLogoUrl(channel.logo)
                                    setSelectedChannelLogoUrl(url)
                                  }
                                }}
                                className={`flex items-center gap-4 p-3 rounded-lg transition-colors cursor-pointer ${
                                  selectedChannel?.id === channel.id
                                    ? 'bg-blue-600'
                                    : 'bg-gray-800 hover:bg-gray-700'
                                }`}
                              >
                                {/* Channel Number */}
                                <div className="flex-shrink-0 w-10 text-center">
                                  <span className="text-gray-400 font-medium text-sm">
                                    {(channel as any).num || index + 1}
                                  </span>
                                </div>

                                {/* Channel Logo */}
                                <ChannelLogoImage logo={channel.logo} name={channel.name || channel.title || ''} />

                                {/* Channel Info */}
                                <div className="flex-1 min-w-0">
                                  <h3 className="text-white font-medium truncate text-sm">
                                    {channel.name || channel.title || 'Unknown Channel'}
                                  </h3>
                                </div>
                              </div>
                            )
                          })}
                        </div>

                        {/* Intersection observer target */}
                        <div ref={observerTarget} className="h-4" />

                        {filteredChannels.length === 0 && (
                          <div className="text-center py-20">
                            <Radio className="w-16 h-16 text-gray-700 mx-auto mb-4" />
                            <p className="text-gray-400 text-lg">No channels available</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Right Panel: Preview Player (Desktop) / Top (Mobile) */}
            <div className="bg-gray-900 rounded-lg p-0 lg:p-6 order-first lg:order-last flex flex-col overflow-y-auto">
              {selectedChannel ? (
                <div className="flex flex-col h-full">
                  {/* Video Player */}
                  <div className="relative aspect-video bg-black rounded-none lg:rounded-lg overflow-hidden mb-0 lg:mb-4 flex-shrink-0">
                    {isLoadingStream ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <Loader className="w-12 h-12 text-blue-500 animate-spin" />
                      </div>
                    ) : streamUrl ? (
                      <>
                        <video
                          ref={videoRef}
                          src={streamUrl}
                          className="w-full h-full"
                          autoPlay
                          playsInline
                          controls={false}
                          onError={() => toast.error('Failed to play stream')}
                        />
                        {/* Mobile: Channel info overlay inside player - auto-hides after 3.5s */}
                        <div 
                          className={`lg:hidden absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 via-black/40 to-transparent p-3 transition-opacity duration-500 ${
                            showMobileOverlay ? 'opacity-100' : 'opacity-0 pointer-events-none'
                          }`}
                          onClick={() => setShowMobileOverlay(true)}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 mr-2">
                              <h2 className="text-sm font-bold text-white drop-shadow-lg">{selectedChannel.name || selectedChannel.title}</h2>
                              <p className="text-gray-300 text-[10px] mt-0.5 drop-shadow-lg">
                                {currentCategory?.name} • {(selectedChannel as any).num ? `Ch ${(selectedChannel as any).num}` : 'Live'}
                              </p>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleFavorite(selectedChannel)
                              }}
                              className="p-1.5 bg-black/50 hover:bg-black/70 rounded-lg transition-colors backdrop-blur-sm"
                              title={favoriteChannels.has(selectedChannel.id) ? 'Remove from favorites' : 'Add to favorites'}
                            >
                              <Star 
                                className={`w-5 h-5 ${favoriteChannels.has(selectedChannel.id) ? 'text-yellow-500 fill-yellow-500' : 'text-white'}`}
                              />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setAsHomePageFavorite(selectedChannel)
                              }}
                              className="p-1.5 bg-black/50 hover:bg-black/70 rounded-lg transition-colors backdrop-blur-sm"
                              title={homePageFavoriteChannelId === selectedChannel.id ? 'Homepage favorite ✓' : 'Set as homepage favorite'}
                            >
                              <Heart 
                                className={`w-5 h-5 ${homePageFavoriteChannelId === selectedChannel.id ? 'text-red-500 fill-red-500' : 'text-white'}`}
                              />
                            </button>
                          </div>
                        </div>
                        {/* Fullscreen button - bottom right on mobile, top right on desktop */}
                        <button
                          onClick={() => handleChannelClick(
                            selectedChannel.cmd || selectedChannel.id,
                            selectedChannel.name || selectedChannel.title || '',
                            (selectedChannel as any).num
                          )}
                          className="absolute bottom-4 right-4 lg:top-4 lg:bottom-auto p-3 bg-black bg-opacity-50 hover:bg-opacity-70 rounded-lg transition-all group"
                          title="Open Fullscreen"
                        >
                          <Maximize className="w-6 h-6 text-white" />
                        </button>
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-800">
                        <div className="text-center">
                          <Radio className="w-24 h-24 text-gray-600 mx-auto mb-4" />
                          <p className="text-gray-400">Loading stream...</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Desktop: Channel info below video */}
                  <div className="hidden lg:flex items-start justify-between mb-4 flex-shrink-0">
                    <div className="flex-1">
                      <h2 className="text-xl font-bold text-white">{selectedChannel.name || selectedChannel.title}</h2>
                      <p className="text-gray-400 text-sm mt-1">
                        {currentCategory?.name} • {(selectedChannel as any).num ? `Ch ${(selectedChannel as any).num}` : 'Live'}
                      </p>
                    </div>
                    <div className="flex items-center space-x-2 ml-2">
                      <button
                        onClick={() => toggleFavorite(selectedChannel)}
                        className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
                        title={favoriteChannels.has(selectedChannel.id) ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        <Star 
                          className={`w-6 h-6 ${favoriteChannels.has(selectedChannel.id) ? 'text-yellow-500 fill-yellow-500' : 'text-gray-400'}`}
                        />
                      </button>
                      <button
                        onClick={() => setAsHomePageFavorite(selectedChannel)}
                        className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
                        title={homePageFavoriteChannelId === selectedChannel.id ? 'Homepage favorite ✓' : 'Set as homepage favorite'}
                      >
                        <Heart 
                          className={`w-6 h-6 ${homePageFavoriteChannelId === selectedChannel.id ? 'text-red-500 fill-red-500' : 'text-gray-400'}`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* EPG Section - Hidden on mobile */}
                  <div className="hidden md:block bg-gray-800 rounded-lg p-4 flex-shrink-0">
                    <h3 className="text-white font-semibold mb-3">Program Guide</h3>
                    <div className="space-y-2">
                      <div className="text-sm text-gray-400">
                        <span className="text-blue-400">Now:</span> Currently Playing
                      </div>
                      <div className="text-sm text-gray-500">
                        EPG data coming soon...
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <Radio className="w-16 h-16 text-gray-700 mx-auto mb-4" />
                    <p className="text-gray-400">Select a category and channel to start watching</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
