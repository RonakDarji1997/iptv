'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Play, Star, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { authService } from '@/services/authService';
import { UpscaledImage } from '@/components/UpscaledImage';
import { cache } from '@/utils/cache';

interface SeriesInfo {
  id: string;
  name: string;
  o_name?: string;
  description?: string;
  year?: string;
  director?: string;
  actors?: string;
  rating_imdb?: string;
  rating_kinopoisk?: string;
  genre_name?: string;
  screenshot_uri?: string;
  cover_big?: string;
  age?: string;
  country?: string;
}

interface Season {
  id: string;
  name: string;
  series_name?: string;
}

interface Episode {
  id: string;
  name: string;
  episode_num?: string;
  series_name?: string;
  season_name?: string;
  time?: string;
}

export default function SeriesDetailPage() {
  const params = useParams();
  const router = useRouter();
  const seriesId = params.seriesId as string;
  
  const [seriesInfo, setSeriesInfo] = useState<SeriesInfo | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [episodes, setEpisodes] = useState<{ [seasonId: string]: Episode[] }>({});
  const [expandedSeasons, setExpandedSeasons] = useState<{ [seasonId: string]: boolean }>({});
  const [loading, setLoading] = useState(true);
  const [providerUrl, setProviderUrl] = useState<string | null>(null);

  useEffect(() => {
    const fetchProviderUrl = async () => {
      try {
        const PROVIDER_URL_KEY = 'stalker_provider_url';
        const PROVIDER_URL_TIMESTAMP_KEY = 'stalker_provider_url_timestamp';
        const CACHE_DURATION = 24 * 60 * 60 * 1000;

        const cached = localStorage.getItem(PROVIDER_URL_KEY);
        const timestamp = localStorage.getItem(PROVIDER_URL_TIMESTAMP_KEY);
        const now = Date.now();

        if (cached && timestamp) {
          const age = now - parseInt(timestamp);
          if (age < CACHE_DURATION) {
            setProviderUrl(cached);
            return;
          }
        }

        const token = authService.getToken();
        const response = await fetch('http://localhost:3000/sync/pull', {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        const data = await response.json();
        const providers = data.data?.providers || [];
        const activeProvider = providers.find((p: any) => p.is_active);
        
        if (activeProvider) {
          const url = activeProvider.server_url;
          localStorage.setItem(PROVIDER_URL_KEY, url);
          localStorage.setItem(PROVIDER_URL_TIMESTAMP_KEY, now.toString());
          setProviderUrl(url);
        }
      } catch (error) {
        console.error('Failed to fetch provider URL:', error);
      }
    };

    fetchProviderUrl();
  }, []);

  useEffect(() => {
    const fetchSeriesData = async () => {
      try {
        // Try to get series data from sessionStorage or localStorage cache
        const sessionData = sessionStorage.getItem(`series_${seriesId}`);
        if (sessionData) {
          const series = JSON.parse(sessionData);
          setSeriesInfo(series);
        } else {
          // Fallback: check localStorage cache
          const CONTENT_CACHE_KEY = 'iptv_content_cache';
          const cached = localStorage.getItem(CONTENT_CACHE_KEY);
          if (cached) {
            const contentData = JSON.parse(cached);
            const allItems = contentData.data?.content || [];
            const series = allItems.find((item: any) => item.id === seriesId);
            if (series) {
              setSeriesInfo(series);
            }
          }
        }

        const token = authService.getToken();

        // Fetch seasons with cache
        const seasonsCacheKey = `series-seasons:${seriesId}`;
        const seasonsData = await cache.getOrFetch(
          seasonsCacheKey,
          async () => {
            const response = await fetch(`http://localhost:3000/stalker-proxy/series/seasons/${seriesId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            return response.json();
          },
          10 * 60 * 1000 // 10 minutes TTL
        );
        
        if (seasonsData.success && seasonsData.seasons) {
          setSeasons(seasonsData.seasons);
          // Auto-expand first season
          if (seasonsData.seasons.length > 0) {
            const firstSeasonId = seasonsData.seasons[0].id;
            setExpandedSeasons({ [firstSeasonId]: true });
            fetchEpisodes(firstSeasonId);
          }
        }
      } catch (error) {
        console.error('Failed to fetch series data:', error);
        toast.error('Failed to load series information');
      } finally {
        setLoading(false);
      }
    };

    fetchSeriesData();
  }, [seriesId]);

  const fetchEpisodes = async (seasonId: string) => {
    if (episodes[seasonId]) return; // Already loaded

    try {
      const token = authService.getToken();
      
      // Use cache for episodes
      const episodesCacheKey = `series-episodes:${seriesId}:${seasonId}`;
      const data = await cache.getOrFetch(
        episodesCacheKey,
        async () => {
          const response = await fetch(
            `http://localhost:3000/stalker-proxy/series/episodes/${seriesId}/${seasonId}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          return response.json();
        },
        10 * 60 * 1000 // 10 minutes TTL
      );
      
      if (data.success && data.episodes) {
        setEpisodes(prev => ({ ...prev, [seasonId]: data.episodes }));
      }
    } catch (error) {
      console.error('Failed to fetch episodes:', error);
      toast.error('Failed to load episodes');
    }
  };

  const toggleSeason = (seasonId: string) => {
    const isExpanding = !expandedSeasons[seasonId];
    setExpandedSeasons(prev => ({ ...prev, [seasonId]: isExpanding }));
    
    if (isExpanding && !episodes[seasonId]) {
      fetchEpisodes(seasonId);
    }
  };

  const handlePlayEpisode = async (seasonId: string, episodeId: string, episodeName: string, episodeList?: any[], currentIndex?: number) => {
    try {
      const token = authService.getToken();
      
      // Step 1: Get episode-info to get the file id (with cache)
      const episodeInfoCacheKey = `episode-info:${seriesId}:${seasonId}:${episodeId}`;
      const infoData = await cache.getOrFetch(
        episodeInfoCacheKey,
        async () => {
          const response = await fetch(
            `http://localhost:3000/stalker-proxy/episode-info/${seriesId}/${seasonId}/${episodeId}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          return response.json();
        },
        10 * 60 * 1000 // 10 minutes TTL
      );
      
      if (!infoData.success || !infoData.info) {
        toast.error('No playable file found');
        return;
      }

      const fileId = infoData.info.id;
      if (!fileId) {
        toast.error('No playable file found');
        return;
      }

      // Step 2: Create streaming link using the file id in proper format
      const cmd = `/media/file_${fileId}.mpg`;
      
      const linkResponse = await fetch('http://localhost:3000/stalker-proxy/create-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          cmd: cmd,
          // Don't send series parameter for episodes
          forced_storage: 'undefined',
          disable_ad: '0',
          download: '0',
        }),
      });

      const linkData = await linkResponse.json();
      
      if (linkData.success && linkData.link && linkData.link.cmd) {
        const streamUrl = encodeURIComponent(linkData.link.cmd);
        const title = encodeURIComponent(`${seriesInfo?.name} - ${episodeName}`);
        
        // Pass episode navigation data via sessionStorage
        if (episodeList && currentIndex !== undefined) {
          sessionStorage.setItem('episode_playlist', JSON.stringify({
            episodes: episodeList,
            currentIndex,
            seasonId,
            seriesId,
            seriesName: seriesInfo?.name
          }));
        }
        
        router.push(`/player/vod?url=${streamUrl}&title=${title}&isSeries=true`);
      } else {
        toast.error('Failed to create stream link');
      }
    } catch (error) {
      console.error('Failed to play episode:', error);
      toast.error('Failed to start playback');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!seriesInfo) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white text-xl">Series not found</div>
      </div>
    );
  }

  const backdropUrl = providerUrl && seriesInfo.screenshot_uri 
    ? `${providerUrl}${seriesInfo.screenshot_uri}`
    : null;
  
  const posterUrl = providerUrl && (seriesInfo.cover_big || seriesInfo.screenshot_uri)
    ? `${providerUrl}${seriesInfo.cover_big || seriesInfo.screenshot_uri}`
    : null;

  const rating = seriesInfo.rating_imdb || seriesInfo.rating_kinopoisk;
  const genres = seriesInfo.genre_name?.split(',').map(g => g.trim()).join(', ');

  return (
    <div className="min-h-screen bg-black text-white pb-20">
      {/* Back Button */}
      <button
        onClick={() => router.back()}
        className="absolute top-6 left-6 z-20 bg-black/50 hover:bg-black/70 rounded-full p-3 transition-colors"
      >
        <ArrowLeft size={24} />
      </button>

      {/* Hero/Backdrop Section */}
      <div className="relative w-full h-[50vh] lg:h-[60vh]">
        {backdropUrl ? (
          <UpscaledImage
            src={backdropUrl}
            alt={seriesInfo.name}
            className="w-full h-full object-cover"
            scale={2}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
      </div>

      {/* Content Section */}
      <div className="relative -mt-32 px-6 lg:px-12">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row gap-8 mb-12">
            {/* Poster */}
            <div className="flex-shrink-0">
              {posterUrl ? (
                <UpscaledImage
                  src={posterUrl}
                  alt={seriesInfo.name}
                  className="w-48 lg:w-64 h-auto rounded-lg shadow-2xl"
                  scale={2}
                />
              ) : (
                <div className="w-48 lg:w-64 aspect-[2/3] bg-gradient-to-br from-gray-700 to-gray-800 rounded-lg shadow-2xl flex items-center justify-center">
                  <Play size={48} className="text-gray-500" />
                </div>
              )}
            </div>

            {/* Info Section */}
            <div className="flex-1">
              <h1 className="text-4xl lg:text-5xl font-bold mb-2">{seriesInfo.name}</h1>
              {seriesInfo.o_name && seriesInfo.o_name !== seriesInfo.name && (
                <p className="text-xl text-gray-400 mb-4">{seriesInfo.o_name}</p>
              )}

              {/* Meta Information */}
              <div className="flex flex-wrap items-center gap-4 mb-6 text-gray-300">
                {seriesInfo.year && (
                  <div className="flex items-center gap-2">
                    <Calendar size={18} />
                    <span>{seriesInfo.year}</span>
                  </div>
                )}
                {rating && (
                  <div className="flex items-center gap-2">
                    <Star size={18} className="text-yellow-500" />
                    <span>{rating}</span>
                  </div>
                )}
                {seriesInfo.age && (
                  <div className="px-2 py-1 border border-gray-500 rounded text-sm">
                    {seriesInfo.age}
                  </div>
                )}
                <div className="text-sm bg-yellow-500/20 text-yellow-500 px-3 py-1 rounded">
                  {seasons.length} Season{seasons.length !== 1 ? 's' : ''}
                </div>
              </div>

              {/* Genres */}
              {genres && (
                <div className="mb-6">
                  <span className="text-gray-400">{genres}</span>
                </div>
              )}

              {/* Description */}
              {seriesInfo.description && (
                <div className="mb-6">
                  <h2 className="text-2xl font-semibold mb-3">Overview</h2>
                  <p className="text-gray-300 leading-relaxed">{seriesInfo.description}</p>
                </div>
              )}

              {/* Cast & Crew */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {seriesInfo.director && (
                  <div>
                    <h3 className="text-lg font-semibold mb-2">Director</h3>
                    <p className="text-gray-300">{seriesInfo.director}</p>
                  </div>
                )}
                {seriesInfo.actors && (
                  <div>
                    <h3 className="text-lg font-semibold mb-2">Cast</h3>
                    <p className="text-gray-300">{seriesInfo.actors}</p>
                  </div>
                )}
                {seriesInfo.country && (
                  <div>
                    <h3 className="text-lg font-semibold mb-2">Country</h3>
                    <p className="text-gray-300">{seriesInfo.country}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Seasons & Episodes */}
          <div className="space-y-4">
            <h2 className="text-3xl font-bold mb-6">Seasons & Episodes</h2>
            
            {seasons.map((season) => (
              <div key={season.id} className="bg-gray-900/50 rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSeason(season.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-left">
                      <h3 className="text-xl font-semibold">{season.name}</h3>
                      {episodes[season.id] && (
                        <p className="text-sm text-gray-400 mt-1">
                          {episodes[season.id].length} Episode{episodes[season.id].length !== 1 ? 's' : ''}
                        </p>
                      )}
                    </div>
                  </div>
                  {expandedSeasons[season.id] ? (
                    <ChevronUp size={24} className="text-gray-400" />
                  ) : (
                    <ChevronDown size={24} className="text-gray-400" />
                  )}
                </button>

                {expandedSeasons[season.id] && (
                  <div className="border-t border-gray-800">
                    {episodes[season.id] ? (
                      <div className="divide-y divide-gray-800">
                        {[...episodes[season.id]].reverse().map((episode, index) => (
                          <button
                            key={episode.id}
                            onClick={() => handlePlayEpisode(season.id, episode.id, episode.name, [...episodes[season.id]].reverse(), index)}
                            className="w-full flex items-center justify-between p-4 hover:bg-gray-800/50 transition-colors group"
                          >
                            <div className="flex items-center gap-4 flex-1 text-left">
                              <div className="w-12 h-12 bg-gray-800 rounded flex items-center justify-center group-hover:bg-yellow-500 transition-colors">
                                <Play size={20} className="group-hover:text-black" />
                              </div>
                              <div className="flex-1">
                                <h4 className="font-medium">{episode.name}</h4>
                                {episode.time && (
                                  <p className="text-sm text-gray-400 mt-1">{episode.time}</p>
                                )}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="p-8 text-center text-gray-400">
                        Loading episodes...
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
