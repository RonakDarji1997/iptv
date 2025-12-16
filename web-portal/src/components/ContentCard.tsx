'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { Play, Info } from 'lucide-react'
import axios from 'axios'
import { authService } from '@/services/authService'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

interface ContentCardProps {
  id: string
  title: string
  imageUrl?: string
  logo?: string
  screenshot?: string
  type: 'movie' | 'series' | 'live'
  subtitle?: string
  onClick?: () => void
  tmdb?: {
    posterUrl: string | null
    rating: number
    voteCount: number
  }
}

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

export function ContentCard({ id, title, imageUrl, logo, screenshot, type, subtitle, onClick, tmdb }: ContentCardProps) {
  const [imageError, setImageError] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [finalImageUrl, setFinalImageUrl] = useState<string | undefined>()

  useEffect(() => {
    const buildImageUrl = async () => {
      // Prioritize TMDB poster if available
      if (tmdb?.posterUrl) {
        setFinalImageUrl(tmdb.posterUrl)
        return
      }
      
      const path = logo || screenshot || imageUrl
      if (!path) return
      
      if (path.startsWith('http')) {
        setFinalImageUrl(path)
        return
      }

      const baseUrl = await getProviderUrl()
      if (!baseUrl) return

      const cleanPath = path.startsWith('/') ? path.slice(1) : path
      setFinalImageUrl(`${baseUrl}/${cleanPath}`)
    }

    buildImageUrl()
  }, [logo, screenshot, imageUrl, tmdb])

  const placeholderGradients = [
    'from-purple-600 to-pink-600',
    'from-blue-600 to-cyan-600',
    'from-green-600 to-teal-600',
    'from-orange-600 to-red-600',
    'from-indigo-600 to-purple-600',
  ]

  const gradientIndex = parseInt(id.slice(-1), 16) % placeholderGradients.length
  const gradient = placeholderGradients[gradientIndex]

  return (
    <div
      className="relative group cursor-pointer transition-transform duration-300 hover:scale-105"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
    >
      <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-gray-800 shadow-lg">
        
        {/* Rating Badge */}
        {tmdb && tmdb.rating > 0 && (
          <div className="absolute top-2 right-2 z-10 bg-black/80 backdrop-blur-sm px-2 py-1 rounded-full flex items-center gap-1">
            <span className="text-yellow-500 text-sm">⭐</span>
            <span className="text-white text-xs font-bold">{tmdb.rating.toFixed(1)}</span>
          </div>
        )}
        
        {finalImageUrl && !imageError ? (
          <img
            src={finalImageUrl}
            alt={title}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${gradient} flex items-center justify-center`}>
            <div className="text-white text-center p-4">
              <p className="font-bold text-lg line-clamp-3">{title}</p>
            </div>
          </div>
        )}

        {/* Hover Overlay */}
        {isHovered && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center space-y-3 transition-opacity duration-300">
            <button className="flex items-center space-x-2 px-6 py-3 bg-gray-800/80 text-white rounded-full hover:bg-gray-700 transition-colors">
              <Info className="w-5 h-5" />
              <span className="font-semibold">Info</span>
            </button>
          </div>
        )}
      </div>

      {/* Title */}
      <div className="mt-2 px-1">
        <h3 className="text-white font-semibold text-xs line-clamp-2">{title}</h3>
        {subtitle && (
          <p className="text-gray-400 text-[10px] mt-1">{subtitle}</p>
        )}
      </div>
    </div>
  )
}

interface ContentRowProps {
  title: string
  items: Array<{
    id: string
    name?: string
    title?: string
    logo?: string
    screenshot_uri?: string
    imageUrl?: string
    subtitle?: string
    tmdb?: {
      posterUrl: string | null
      rating: number
      voteCount: number
    }
  }>
  type: 'movie' | 'series' | 'live'
  onItemClick?: (item: any) => void
  showViewAll?: boolean
  onViewAll?: () => void
}

export function ContentRow({ title, items, type, onItemClick, showViewAll, onViewAll }: ContentRowProps) {
  return (
    <div className="mb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white text-xl font-bold">{title}</h2>
          {showViewAll && (
            <button
              onClick={onViewAll}
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors font-semibold"
            >
              View All →
            </button>
          )}
        </div>
        
        <div className="flex space-x-4 overflow-x-auto pb-4 scrollbar-hide -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8">
          {items.map((item) => (
            <div key={item.id} className="flex-none w-40 sm:w-48">
              <ContentCard
                id={item.id}
                title={item.name || item.title || 'Untitled'}
                logo={item.logo}
                screenshot={item.screenshot_uri}
                imageUrl={item.imageUrl}
                type={type}
                subtitle={item.subtitle}
                tmdb={item.tmdb}
                onClick={() => onItemClick?.(item)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
