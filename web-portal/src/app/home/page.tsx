'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Play, Star, Heart, Clock, History, Volume2, VolumeX, Maximize } from 'lucide-react'
import Navbar from '@/components/Navbar'
import { authService } from '@/services/authService'
import { contentService } from '@/services/contentService'
import Image from 'next/image'
import toast from 'react-hot-toast'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

interface WatchProgress {
  id: string
  content_id: string
  content_name: string
  content_type: string
  content_poster?: string
  current_position: number
  duration: number
  last_watched_at: string
  series_id?: string
  season_number?: number
  episode_number?: number
}

interface WatchHistoryItem {
  id: string
  content_id: string
  content_name: string
  content_type: string
  content_poster?: string
  watched_at: string
  series_name?: string
  season_number?: number
  episode_number?: number
}

interface FavoriteItem {
  id: string
  content_id: string
  content_name: string
  content_type: string
  content_poster?: string
  category_id?: string
  metadata?: any
}

interface ChannelAnalytics {
  channel_id: string
  channel_name: string
  channel_logo?: string
  channel_number?: string
  play_count: number
  last_watched_at: string
  cmd?: string
  channel_cmd?: string
}

export default function HomePage() {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [continueWatching, setContinueWatching] = useState<WatchProgress[]>([])
  const [favoriteVOD, setFavoriteVOD] = useState<FavoriteItem[]>([])
  const [watchHistory, setWatchHistory] = useState<WatchHistoryItem[]>([])
  const [favoriteChannels, setFavoriteChannels] = useState<ChannelAnalytics[]>([])
  const [favoriteChannel, setFavoriteChannel] = useState<ChannelAnalytics | null>(null)
  const [streamUrl, setStreamUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingStream, setLoadingStream] = useState(false)
  const [isMuted, setIsMuted] = useState(true)

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      router.push('/auth/login')
      return
    }

    loadHomeData()
  }, [router])

  const loadHomeData = async () => {
    try {
      setLoading(true)
      
      const [continueWatchingData, favoritesData, historyData, topChannelsData, favoriteChannelData] = await Promise.all([
        contentService.getContinueWatching(50), // Get more to deduplicate
        contentService.getFavoriteCategories(10), // Get all favorites, we'll filter VOD
        contentService.getWatchHistory(10),
        contentService.getTopChannels(8),
        contentService.getFavoriteChannel(),
      ])

      // Deduplicate continue watching - keep only latest episode per series/movie
      const deduplicatedContinueWatching = continueWatchingData.reduce((acc: WatchProgress[], current: WatchProgress) => {
        // For series, use series_id as the key, for movies use content_id
        const key = current.series_id || current.content_id
        const existing = acc.find(item => (item.series_id || item.content_id) === key)
        
        if (!existing) {
          acc.push(current)
        } else {
          // Keep the one with most recent watch time
          const currentDate = new Date(current.last_watched_at).getTime()
          const existingDate = new Date(existing.last_watched_at).getTime()
          if (currentDate > existingDate) {
            const index = acc.indexOf(existing)
            acc[index] = current
          }
        }
        return acc
      }, [])

      setContinueWatching(deduplicatedContinueWatching)
      
      // Filter favorites for VOD only (movies/series)
      const vodFavorites = favoritesData.filter(
        (f: any) => f.content_type === 'MOVIE' || f.content_type === 'SERIES' || f.content_type === 'VOD'
      )
      setFavoriteVOD(vodFavorites)
      
      setWatchHistory(historyData)
      setFavoriteChannels(topChannelsData)
      
      // Set favorite channel directly - we'll load the stream when needed
      if (favoriteChannelData) {
        setFavoriteChannel(favoriteChannelData)
      }
    } catch (error) {
      console.error('Failed to load home data:', error)
      toast.error('Failed to load home page data')
    } finally {
      setLoading(false)
    }
  }

  // Load stream when favorite channel is available
  useEffect(() => {
    if (favoriteChannel) {
      // Analytics data uses channel_cmd field
      const cmd = favoriteChannel.channel_cmd || favoriteChannel.cmd || favoriteChannel.channel_id
      if (cmd) {
        loadChannelStream(cmd)
      }
    }
  }, [favoriteChannel])

  const loadChannelStream = async (cmd: string) => {
    try {
      setLoadingStream(true)
      setStreamUrl(null)
      
      const token = authService.getToken()
      const response = await fetch(`${API_URL}/stalker-proxy/channel-stream?cmd=${encodeURIComponent(cmd)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const data = await response.json()
      if (data.success && data.stream && data.stream.cmd) {
        // Use original stream - no transcode for live TV
        setStreamUrl(data.stream.cmd)
      }
    } catch (error) {
      console.error('Failed to load channel stream:', error)
    } finally {
      setLoadingStream(false)
    }
  }

  const toggleMute = () => {
    const video = videoRef.current
    if (!video) return
    
    const newMutedState = !isMuted
    video.muted = newMutedState
    setIsMuted(newMutedState)
  }

  const getProgressPercentage = (progress: WatchProgress) => {
    return Math.round((progress.current_position / progress.duration) * 100)
  }

  const handleContinueWatching = (item: WatchProgress) => {
    console.log('[ContinueWatching] Clicked item:', item);
    
    if (item.content_type === 'MOVIE') {
      router.push(`/browse/movies/category/${item.content_id}`)
    } else if (item.content_type === 'SERIES' || item.content_type === 'EPISODE') {
      // For series/episodes, use series_id if available, otherwise use content_id
      const seriesIdToUse = item.series_id || item.content_id;
      console.log('[ContinueWatching] Navigating to series:', seriesIdToUse);
      // Use 0 as category ID since we don't have it (similar to search results)
      router.push(`/browse/series/0/${seriesIdToUse}`)
    } else if (item.content_type === 'LIVE') {
      router.push(`/browse/live`)
    }
  }

  const handleVODClick = (item: FavoriteItem) => {
    if (item.content_type === 'MOVIE') {
      router.push(`/browse/movies/category/${item.content_id}`)
    } else if (item.content_type === 'SERIES' || item.content_type === 'VOD') {
      // Use 0 as category ID for favorites too
      router.push(`/browse/series/0/${item.content_id}`)
    }
  }

  const handleHistoryClick = (item: WatchHistoryItem) => {
    if (item.content_type === 'MOVIE') {
      router.push(`/browse/movies/category/${item.content_id}`)
    } else if (item.content_type === 'SERIES') {
      // Use 0 as category ID for history
      router.push(`/browse/series/0/${item.content_id}`)
    } else if (item.content_type === 'LIVE') {
      router.push(`/browse/live`)
    }
  }

  const handleChannelClick = (channel: ChannelAnalytics) => {
    router.push(`/browse/live`)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black pb-24">
        <Navbar />
        <div className="container mx-auto px-4 py-8 md:pt-24">
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-400">Loading your content...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-black overflow-y-auto overflow-x-hidden">
      <Navbar />
      
      <div className="container mx-auto px-4 pt-20 md:pt-20 pb-24 space-y-8"
        style={{ 
          WebkitOverflowScrolling: 'touch'
        }}
      >
        {/* Favorite Channel Live Preview */}
        {favoriteChannel && (
          <section className="space-y-3">
            <div className="flex items-center space-x-2">
              <Heart className="w-4 h-4 text-red-500" fill="currentColor" />
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">{favoriteChannel.channel_name}</h2>
            </div>

            <div 
              onClick={() => {
                if (favoriteChannel.cmd) {
                  const params = new URLSearchParams({
                    cmd: favoriteChannel.cmd,
                    name: favoriteChannel.channel_name,
                  })
                  if (favoriteChannel.channel_number) {
                    params.append('num', favoriteChannel.channel_number)
                  }
                  router.push(`/player/live?${params.toString()}`)
                }
              }}
              className="relative aspect-video rounded-xl overflow-hidden bg-gray-900 border border-gray-800 cursor-pointer group"
            >
              {streamUrl && (
                <video
                  ref={videoRef}
                  src={streamUrl}
                  autoPlay
                  muted={isMuted}
                  playsInline
                  className="w-full h-full object-contain"
                  onError={(e) => console.error('Video playback error:', e)}
                />
              )}
              
              {loadingStream && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
              
              {/* Mute/Unmute Button */}
              {streamUrl && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleMute()
                  }}
                  className="absolute top-4 right-4 p-3 bg-black/60 hover:bg-black/80 rounded-lg transition-colors z-10"
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? (
                    <VolumeX className="w-5 h-5 text-white" />
                  ) : (
                    <Volume2 className="w-5 h-5 text-white" />
                  )}
                </button>
              )}
              
              {/* Channel Info Overlay - Shows on hover */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {favoriteChannel.channel_logo && (
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-800 flex-shrink-0">
                        <Image
                          src={favoriteChannel.channel_logo}
                          alt={favoriteChannel.channel_name}
                          width={48}
                          height={48}
                          className="object-contain p-1"
                          unoptimized
                        />
                      </div>
                    )}
                    <div>
                      <h3 className="text-white font-bold text-lg">{favoriteChannel.channel_name}</h3>
                      <p className="text-gray-400 text-sm">
                        {favoriteChannel.channel_number ? `Channel ${favoriteChannel.channel_number}` : 'Live Now'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (favoriteChannel.cmd) {
                        const params = new URLSearchParams({
                          cmd: favoriteChannel.cmd,
                          name: favoriteChannel.channel_name,
                        })
                        if (favoriteChannel.channel_number) {
                          params.append('num', favoriteChannel.channel_number)
                        }
                        router.push(`/player/live?${params.toString()}`)
                      }
                    }}
                    className="p-3 bg-black/60 hover:bg-black/80 rounded-lg transition-colors"
                    title="Watch Fullscreen"
                  >
                    <Maximize className="w-5 h-5 text-white" />
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Continue Watching Section */}
        {continueWatching.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">CONTINUE WATCHING</h2>
            </div>

            <div className="relative overflow-hidden">
              <div 
                className="flex space-x-3 overflow-x-auto scrollbar-hide pb-2 snap-x snap-mandatory"
                style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x' }}
              >
                {continueWatching.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleContinueWatching(item)}
                    className="group cursor-pointer flex-shrink-0 w-32 sm:w-36 md:w-40 snap-start"
                  >
                    <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-gray-800 mb-2">
                      {item.content_poster ? (
                        <Image
                          src={item.content_poster}
                          alt={item.content_name}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform duration-300"
                          unoptimized
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-900">
                          <Play className="w-8 h-8 text-gray-500" />
                        </div>
                      )}
                      
                      {/* Progress Bar - Only for Movies */}
                      {item.content_type === 'MOVIE' && (
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-700">
                          <div
                            className="h-full bg-red-600"
                            style={{ width: `${getProgressPercentage(item)}%` }}
                          />
                        </div>
                      )}

                      {/* Play Overlay */}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Play className="w-10 h-10 text-white" fill="white" />
                      </div>

                      {/* Continue label */}
                      <div className="absolute top-2 left-2 bg-black/80 px-2 py-0.5 rounded text-[10px] text-white">
                        Continue
                      </div>
                    </div>

                    <h3 className="text-xs font-medium text-white line-clamp-1">
                      {item.content_name}
                    </h3>
                    {item.season_number && item.episode_number && (
                      <p className="text-[10px] text-gray-500">
                        S{item.season_number} E{item.episode_number}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Favorite VOD Section */}
        {favoriteVOD.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center space-x-2">
              <Star className="w-4 h-4 text-blue-500" />
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">FAVORITE VOD</h2>
            </div>

            <div className="relative overflow-hidden">
              <div 
                className="flex space-x-3 overflow-x-auto scrollbar-hide pb-2 snap-x snap-mandatory"
                style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x' }}
              >
                {favoriteVOD.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleVODClick(item)}
                    className="group cursor-pointer flex-shrink-0 w-32 sm:w-36 md:w-40 snap-start"
                  >
                    <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-gray-800 mb-2">
                      {item.content_poster ? (
                        <Image
                          src={item.content_poster}
                          alt={item.content_name}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform duration-300"
                          unoptimized
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-700 to-blue-900">
                          <Star className="w-8 h-8 text-blue-400" fill="currentColor" />
                        </div>
                      )}

                      {/* Play Overlay */}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Play className="w-10 h-10 text-white" fill="white" />
                      </div>
                    </div>

                    <h3 className="text-xs font-medium text-white line-clamp-1">
                      {item.content_name}
                    </h3>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Watch History Section */}
        {watchHistory.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center space-x-2">
              <History className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">WATCH HISTORY</h2>
            </div>

            <div className="relative overflow-hidden">
              <div 
                className="flex space-x-3 overflow-x-auto scrollbar-hide pb-2 snap-x snap-mandatory"
                style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x' }}
              >
                {watchHistory.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleHistoryClick(item)}
                    className="group cursor-pointer flex-shrink-0 w-32 sm:w-36 md:w-40 snap-start"
                  >
                    <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-gray-800 mb-2">
                      {item.content_poster ? (
                        <Image
                          src={item.content_poster}
                          alt={item.content_name}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform duration-300"
                          unoptimized
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-900">
                          <History className="w-8 h-8 text-gray-500" />
                        </div>
                      )}

                      {/* Play Overlay */}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Play className="w-10 h-10 text-white" fill="white" />
                      </div>
                    </div>

                    <h3 className="text-xs font-medium text-white line-clamp-1">
                      {item.series_name || item.content_name}
                    </h3>
                    {item.season_number && item.episode_number && (
                      <p className="text-[10px] text-gray-500">
                        S{item.season_number} E{item.episode_number}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Favorite Channels Section */}
        {favoriteChannels.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center space-x-2">
              <Heart className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">FAVORITE CHANNEL</h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {favoriteChannels.slice(0, 8).map((channel, index) => (
                <div
                  key={`${channel.channel_id}-${index}`}
                  onClick={() => handleChannelClick(channel)}
                  className="group cursor-pointer bg-gray-900/40 border border-gray-800 rounded-lg p-3 hover:bg-gray-800/60 hover:border-gray-700 transition-all"
                >
                  <div className="flex items-center space-x-3">
                    {channel.channel_logo ? (
                      <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-gray-800 flex-shrink-0">
                        <Image
                          src={channel.channel_logo}
                          alt={channel.channel_name}
                          fill
                          className="object-contain p-1"
                          unoptimized
                        />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-red-600 to-pink-600 flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-bold text-lg">
                          {channel.channel_name.charAt(0)}
                        </span>
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-white line-clamp-1">
                        {channel.channel_name}
                      </h3>
                      <p className="text-xs text-gray-500">
                        {channel.channel_number ? `CH ${channel.channel_number}` : `${channel.play_count} plays`}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Empty State */}
        {continueWatching.length === 0 && favoriteVOD.length === 0 && watchHistory.length === 0 && favoriteChannels.length === 0 && (
          <div className="text-center py-20">
            <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <Play className="w-12 h-12 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Welcome to StreamHub</h2>
            <p className="text-gray-400 mb-6">Start exploring content to see your personalized home</p>
            <div className="flex flex-wrap justify-center gap-4">
              <button
                onClick={() => router.push('/browse/live')}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                Browse Live TV
              </button>
              <button
                onClick={() => router.push('/browse/movies')}
                className="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
              >
                Browse Movies
              </button>
              <button
                onClick={() => router.push('/browse/series')}
                className="px-6 py-3 bg-pink-600 hover:bg-pink-700 rounded-lg transition-colors"
              >
                Browse Series
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
