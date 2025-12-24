'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { ContentCard } from '@/components/ContentCard'
import { authService } from '@/services/authService'
import { cache } from '@/utils/cache'
import toast from 'react-hot-toast'
import { Loader, Search as SearchIcon, Tv, Play } from 'lucide-react'
import Image from 'next/image'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

interface SearchItem {
  id: string
  name: string
  o_name?: string
  screenshot_uri?: string
  cover_big?: string
  is_series?: string | number
  year?: string
  genre_name?: string
  rating_imdb?: string
}

interface ChannelItem {
  id: string
  name: string
  cmd: string
  number?: string
  logo?: string
  genre_title?: string
}

// Debounce helper
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

export default function SearchPage() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchItem[]>([])
  const [channels, setChannels] = useState<ChannelItem[]>([])
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      router.push('/auth/login')
      return
    }
  }, [router])

  const performSearch = useCallback(
    debounce(async (searchQuery: string) => {
      if (!searchQuery.trim() || searchQuery.length < 2) {
        setResults([])
        setHasSearched(false)
        return
      }

      setLoading(true)
      setHasSearched(true)

      try {
        const token = authService.getToken()
        
        // Use cache for search results with shorter TTL (1 minute)
        const cacheKey = `search:${searchQuery.toLowerCase()}`
        const data = await cache.getOrFetch(
          cacheKey,
          async () => {
            const response = await fetch(
              `${API_URL}/stalker-proxy/search?search=${encodeURIComponent(searchQuery)}`,
              { headers: { Authorization: `Bearer ${token}` } }
            )
            
            if (!response.ok) {
              throw new Error('Search failed')
            }
            
            return response.json()
          },
          60 * 1000 // 1 minute TTL for search results
        )

        setResults(data.items || [])
      } catch (error) {
        console.error('Search error:', error)
        toast.error('Search failed. Please try again.')
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 500),
    []
  )

  const handleTextChange = (text: string) => {
    setQuery(text)
    performSearch(text)
  }

  const handleResultClick = (item: SearchItem) => {
    const isSeries = item.is_series === '1' || item.is_series === 1

    if (isSeries) {
      // Store series data in sessionStorage
      sessionStorage.setItem(`series_${item.id}`, JSON.stringify(item))
      router.push(`/browse/series/0/${item.id}`)
    } else {
      // Store movie data in sessionStorage
      sessionStorage.setItem(`movie_${item.id}`, JSON.stringify(item))
      router.push(`/browse/movies/0/${item.id}`)
    }
  }

  const handleChannelClick = (channel: ChannelItem) => {
    // Navigate to live player without channel list context (hide prev/next)
    const params = new URLSearchParams({
      cmd: channel.cmd,
      name: channel.name,
      fromSearch: 'true' // Flag to hide prev/next buttons
    })
    if (channel.number) {
      params.append('num', channel.number)
    }
    router.push(`/player/live?${params.toString()}`)
  }

  return (
    <div className="min-h-screen bg-black">
      <Navbar />

      <div className="mt-20 md:mt-24 pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-6 mt-4">
            <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">Search</h1>
            <p className="text-gray-400 text-sm md:text-base">Search for movies and series</p>
          </div>

          {/* Search Input */}
          <div className="mb-8 sticky top-16 md:top-20 z-30 bg-black pb-4">
            <div className="relative">
              <SearchIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => handleTextChange(e.target.value)}
                placeholder="Search movies, series..."
                autoFocus
                className="w-full bg-gray-900 text-white pl-12 pr-4 py-3 md:py-4 rounded-lg border border-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm md:text-base"
              />
            </div>
          </div>

          {/* Results */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader className="w-12 h-12 text-blue-500 animate-spin mb-4" />
              <p className="text-gray-400">Searching...</p>
            </div>
          ) : hasSearched && results.length === 0 && channels.length === 0 ? (
            <div className="text-center py-20">
              <SearchIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-white mb-2">No results found</h3>
              <p className="text-gray-400">Try a different search term</p>
            </div>
          ) : (channels.length > 0 || results.length > 0) ? (
            <div className="space-y-8">
              {/* Channels Section */}
              {channels.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Tv className="w-5 h-5 text-blue-500" />
                    <h2 className="text-xl font-bold text-white">Channels</h2>
                    <span className="text-gray-400 text-sm">({channels.length})</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {channels.map((channel) => (
                      <div
                        key={channel.id}
                        onClick={() => handleChannelClick(channel)}
                        className="group cursor-pointer bg-gray-900/40 border border-gray-800 rounded-lg overflow-hidden hover:bg-gray-800/60 hover:border-blue-500 transition-all"
                      >
                        <div className="aspect-video relative bg-gray-800 flex items-center justify-center">
                          {channel.logo ? (
                            <Image
                              src={channel.logo}
                              alt={channel.name}
                              fill
                              className="object-contain p-2"
                              unoptimized
                            />
                          ) : (
                            <Tv className="w-8 h-8 text-gray-600" />
                          )}
                          {/* Play overlay */}
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Play className="w-10 h-10 text-white" fill="white" />
                          </div>
                          {/* Channel number badge */}
                          {channel.number && (
                            <div className="absolute top-2 left-2 bg-blue-600 px-2 py-1 rounded text-xs font-bold">
                              {channel.number}
                            </div>
                          )}
                        </div>
                        <div className="p-3">
                          <h3 className="text-sm font-medium text-white truncate">{channel.name}</h3>
                          {channel.genre_title && (
                            <p className="text-xs text-gray-500 mt-1 truncate">{channel.genre_title}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* VOD Section */}
              {results.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <SearchIcon className="w-5 h-5 text-yellow-500" />
                    <h2 className="text-xl font-bold text-white">Movies & Series</h2>
                    <span className="text-gray-400 text-sm">({results.length})</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {results.map((item) => {
                      const isSeries = item.is_series === '1' || item.is_series === 1
                      return (
                        <div key={item.id} className="relative">
                          <ContentCard
                            id={item.id}
                            title={item.name}
                            imageUrl={item.screenshot_uri || item.cover_big}
                            type={isSeries ? 'series' : 'movie'}
                            onClick={() => handleResultClick(item)}
                          />
                          {/* Type Badge */}
                          <div className="absolute top-2 right-2 bg-black/80 backdrop-blur-sm px-2 py-1 rounded text-xs font-semibold">
                            {isSeries ? 'SERIES' : 'MOVIE'}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-20">
              <SearchIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-white mb-2">Start searching</h3>
              <p className="text-gray-400">Enter at least 2 characters to search</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
