'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Play, Star, Calendar, Clock, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { authService } from '@/services/authService';
import { UpscaledImage } from '@/components/UpscaledImage';
import { cache } from '@/utils/cache';
import { API_URL } from '@/config/constants';

interface MovieInfo {
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
  time?: string;
  age?: string;
  country?: string;
  files?: any[];
}

export default function MovieDetailPage() {
  const params = useParams();
  const router = useRouter();
  const movieId = params.movieId as string;
  
  const [movieInfo, setMovieInfo] = useState<MovieInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [providerUrl, setProviderUrl] = useState<string | null>(null);
  const [playLoading, setPlayLoading] = useState(false);

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
        const response = await fetch(`${API_URL}/sync/pull`, {
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
    // Try to get movie data from sessionStorage or localStorage cache
    const getMovieInfo = () => {
      try {
        // Check sessionStorage first (from click)
        const sessionData = sessionStorage.getItem(`movie_${movieId}`);
        if (sessionData) {
          const movie = JSON.parse(sessionData);
          setMovieInfo(movie);
          setLoading(false);
          return;
        }

        // Fallback: check localStorage cache (from content list)
        const CONTENT_CACHE_KEY = 'iptv_content_cache';
        const cached = localStorage.getItem(CONTENT_CACHE_KEY);
        if (cached) {
          const contentData = JSON.parse(cached);
          const allItems = contentData.data?.content || [];
          const movie = allItems.find((item: any) => item.id === movieId);
          if (movie) {
            setMovieInfo(movie);
            setLoading(false);
            return;
          }
        }

        // If no data found, show error
        toast.error('Movie information not found');
        setLoading(false);
      } catch (error) {
        console.error('Failed to load movie info:', error);
        toast.error('Failed to load movie information');
        setLoading(false);
      }
    };

    getMovieInfo();
  }, [movieId]);

  const handlePlay = async () => {
    if (!movieInfo || playLoading) return;

    setPlayLoading(true);
    try {
      const token = authService.getToken();
      
      // Step 1: Get vod-info to get the file id (with cache)
      const vodInfoCacheKey = `vod-info:${movieId}`;
      const vodInfoData = await cache.getOrFetch(
        vodInfoCacheKey,
        async () => {
          const response = await fetch(`${API_URL}/stalker-proxy/vod-info/${movieId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          return response.json();
        },
        10 * 60 * 1000 // 10 minutes TTL
      );
      
      if (!vodInfoData.success || !vodInfoData.info) {
        toast.error('Failed to get file information');
        return;
      }

      const fileId = vodInfoData.info.id;
      if (!fileId) {
        toast.error('No playable file found');
        return;
      }

      // Step 2: Create streaming link using the file id in proper format
      const cmd = `/media/file_${fileId}.mpg`;
      
      const response = await fetch(`${API_URL}/stalker-proxy/create-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          cmd: cmd,
          movie: movieId,
          forced_storage: 'undefined',
          disable_ad: '0',
          download: '0',
        }),
      });

      const data = await response.json();
      if (data.success && data.link && data.link.cmd) {
        // Navigate to player with stream URL
        const streamUrl = encodeURIComponent(data.link.cmd);
        router.push(`/player/vod?url=${streamUrl}&title=${encodeURIComponent(movieInfo.name)}`);
      } else {
        toast.error('Failed to create stream link');
      }
    } catch (error) {
      console.error('Failed to play movie:', error);
      toast.error('Failed to start playback');
    } finally {
      setPlayLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!movieInfo) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white text-xl">Movie not found</div>
      </div>
    );
  }

  const backdropUrl = providerUrl && movieInfo.screenshot_uri 
    ? `${providerUrl}${movieInfo.screenshot_uri}`
    : null;
  
  const posterUrl = providerUrl && (movieInfo.cover_big || movieInfo.screenshot_uri)
    ? `${providerUrl}${movieInfo.cover_big || movieInfo.screenshot_uri}`
    : null;

  const rating = movieInfo.rating_imdb || movieInfo.rating_kinopoisk;
  const duration = movieInfo.time;
  const genres = movieInfo.genre_name?.split(',').map(g => g.trim()).join(', ');

  return (
    <div className="min-h-screen bg-black text-white">
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
            alt={movieInfo.name}
            className="w-full h-full object-cover"
            scale={2}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
      </div>

      {/* Content Section */}
      <div className="relative -mt-32 px-6 lg:px-12 pb-20">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Poster */}
            <div className="flex-shrink-0">
              {posterUrl ? (
                <UpscaledImage
                  src={posterUrl}
                  alt={movieInfo.name}
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
              <h1 className="text-4xl lg:text-5xl font-bold mb-2">{movieInfo.name}</h1>
              {movieInfo.o_name && movieInfo.o_name !== movieInfo.name && (
                <p className="text-xl text-gray-400 mb-4">{movieInfo.o_name}</p>
              )}

              {/* Meta Information */}
              <div className="flex flex-wrap items-center gap-4 mb-6 text-gray-300">
                {movieInfo.year && (
                  <div className="flex items-center gap-2">
                    <Calendar size={18} />
                    <span>{movieInfo.year}</span>
                  </div>
                )}
                {rating && (
                  <div className="flex items-center gap-2">
                    <Star size={18} className="text-yellow-500" />
                    <span>{rating}</span>
                  </div>
                )}
                {duration && (
                  <div className="flex items-center gap-2">
                    <Clock size={18} />
                    <span>{duration}</span>
                  </div>
                )}
                {movieInfo.age && (
                  <div className="px-2 py-1 border border-gray-500 rounded text-sm">
                    {movieInfo.age}
                  </div>
                )}
              </div>

              {/* Genres */}
              {genres && (
                <div className="mb-6">
                  <span className="text-gray-400">{genres}</span>
                </div>
              )}

              {/* Play Button */}
              <button
                onClick={handlePlay}
                disabled={playLoading}
                className="bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-600 text-black font-semibold px-8 py-3 rounded-lg flex items-center gap-2 transition-colors mb-8"
              >
                <Play size={24} fill="currentColor" />
                {playLoading ? 'Loading...' : 'Play'}
              </button>

              {/* Description */}
              {movieInfo.description && (
                <div className="mb-6">
                  <h2 className="text-2xl font-semibold mb-3">Overview</h2>
                  <p className="text-gray-300 leading-relaxed">{movieInfo.description}</p>
                </div>
              )}

              {/* Cast & Crew */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {movieInfo.director && (
                  <div>
                    <h3 className="text-lg font-semibold mb-2">Director</h3>
                    <p className="text-gray-300">{movieInfo.director}</p>
                  </div>
                )}
                {movieInfo.actors && (
                  <div>
                    <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                      <Users size={20} />
                      Cast
                    </h3>
                    <p className="text-gray-300">{movieInfo.actors}</p>
                  </div>
                )}
                {movieInfo.country && (
                  <div>
                    <h3 className="text-lg font-semibold mb-2">Country</h3>
                    <p className="text-gray-300">{movieInfo.country}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
