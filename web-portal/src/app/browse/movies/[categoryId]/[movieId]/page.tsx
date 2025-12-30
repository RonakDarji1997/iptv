'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Play, Star, Calendar, Clock, Users, Volume2, VolumeX, Maximize } from 'lucide-react';
import toast from 'react-hot-toast';
import { authService } from '@/services/authService';
import { UpscaledImage } from '@/components/UpscaledImage';
import FavoriteButton from '@/components/FavoriteButton';
import ProgressBar from '@/components/ProgressBar';
import { cache } from '@/utils/cache';
import { API_URL } from '@/config/constants';
import { isMobileApp, playVideoNative } from '@/utils/mobileDetection';

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
  const [tmdbData, setTmdbData] = useState<any>(null);
  const [loadingTmdb, setLoadingTmdb] = useState(false);
  const [watchProgress, setWatchProgress] = useState<number>(0);
  const [movieImdbId, setMovieImdbId] = useState<string | null>(null);
  const [movieLogo, setMovieLogo] = useState<string | null>(null);
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [showTrailer, setShowTrailer] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const trailerContainerRef = useRef<HTMLDivElement>(null);
  const hideControlsTimerRef = useRef<NodeJS.Timeout | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

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

  // Handle fullscreen changes and auto-hide controls
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isNowFullscreen = !!document.fullscreenElement;
      setIsFullscreen(isNowFullscreen);
      
      if (isNowFullscreen) {
        // Show controls initially
        setShowControls(true);
        
        // Hide controls after 3 seconds
        if (hideControlsTimerRef.current) {
          clearTimeout(hideControlsTimerRef.current);
        }
        
        hideControlsTimerRef.current = setTimeout(() => {
          setShowControls(false);
        }, 3000);
      } else {
        // Always show controls when not fullscreen
        setShowControls(true);
        if (hideControlsTimerRef.current) {
          clearTimeout(hideControlsTimerRef.current);
        }
      }
    };

    // Mouse movement to show controls temporarily in fullscreen
    const handleMouseMove = () => {
      if (document.fullscreenElement) {
        setShowControls(true);
        
        if (hideControlsTimerRef.current) {
          clearTimeout(hideControlsTimerRef.current);
        }
        
        hideControlsTimerRef.current = setTimeout(() => {
          setShowControls(false);
        }, 3000);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('mousemove', handleMouseMove);
    
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('mousemove', handleMouseMove);
      if (hideControlsTimerRef.current) {
        clearTimeout(hideControlsTimerRef.current);
      }
    };
  }, []);

  // Fetch watch progress
  useEffect(() => {
    const fetchProgress = async () => {
      try {
        const token = authService.getToken();
        const response = await fetch(`${API_URL}/progress/${movieId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.progress) {
            const percentage = (data.progress.current_position / data.progress.duration) * 100;
            setWatchProgress(percentage);
          }
        }
      } catch (error) {
        console.error('Failed to fetch watch progress:', error);
      }
    };

    if (movieId) {
      fetchProgress();
    }
  }, [movieId]);

  useEffect(() => {
    // Try to get movie data from sessionStorage or localStorage cache, with API fallback
    const getMovieInfo = async () => {
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

        // API Fallback: Fetch movie files from vod-info endpoint
        console.log('[MovieDetail] ========== STARTING API FETCH ==========');
        console.log('[MovieDetail] Cache miss, fetching files from API:', movieId);
        const token = authService.getToken();
        
        const response = await fetch(`${API_URL}/stalker-proxy/vod-info/${movieId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        console.log('[MovieDetail] Response status:', response.status, response.statusText);
        
        if (response.ok) {
          const data = await response.json();
          console.log('[MovieDetail] API response:', data);
          
          if (data.success && data.files && data.files.length > 0) {
            // API returns files array, we need to construct movie object
            // Use generic name since API doesn't have movie metadata
            const movie = {
              id: movieId,
              name: 'Movie', // Generic name, TMDB will override this
              files: data.files,
            };
            console.log('[MovieDetail] Constructed movie with files:', movie);
            
            setMovieInfo(movie);
            // Cache it for next time
            sessionStorage.setItem(`movie_${movieId}`, JSON.stringify(movie));
            setLoading(false);
            return;
          } else {
            console.error('[MovieDetail] No files in API response:', data);
          }
        } else {
          console.error('[MovieDetail] HTTP error:', response.status);
        }

        console.log('[MovieDetail] ========== ALL FETCH ATTEMPTS FAILED ==========');

        // If all attempts failed, show error
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

  // Fetch TMDB data when movie info is loaded
  useEffect(() => {
    const fetchTmdbData = async () => {
      if (!movieInfo) return;
      
      setLoadingTmdb(true);
      console.log('[MovieDetail] Fetching TMDB data for:', movieInfo.name);
      
      try {
        const title = movieInfo.name || movieInfo.o_name || '';
        const response = await fetch(
          `/api/tmdb?action=smart-search&title=${encodeURIComponent(title)}&type=movie`
        );
        const data = await response.json();
        
        if (data.success && data.details) {
          console.log('[MovieDetail] TMDB data loaded successfully:', {
            title: data.details.title,
            hasBackdrop: !!data.details.backdrop_path,
            hasPoster: !!data.details.poster_path,
            rating: data.details.vote_average,
            genres: data.details.genres?.map((g: any) => g.name),
          });
          setTmdbData(data.details);
          
          // Fetch trailer video
          if (data.details.id) {
            try {
              const videosResponse = await fetch(
                `/api/tmdb?action=videos&type=movie&id=${data.details.id}`
              );
              const videosData = await videosResponse.json();
              if (videosData.success && videosData.videos && videosData.videos.length > 0) {
                // Get first YouTube trailer
                const youtubeTrailer = videosData.videos.find((v: any) => v.site === 'YouTube' && v.type === 'Trailer');
                if (youtubeTrailer) {
                  console.log('[MovieDetail] Trailer key:', youtubeTrailer.key);
                  setTrailerKey(youtubeTrailer.key);
                }
              }
            } catch (error) {
              console.error('[MovieDetail] Failed to fetch trailer:', error);
            }
          }
          
          // Fetch logos
          if (data.details.id) {
            try {
              const logosResponse = await fetch(
                `/api/tmdb?action=logos&type=movie&id=${data.details.id}`
              );
              const logosData = await logosResponse.json();
              if (logosData.success && logosData.logos && logosData.logos.length > 0) {
                const logoPath = logosData.logos[0].file_path;
                const logoUrl = `https://image.tmdb.org/t/p/w500${logoPath}`;
                console.log('[MovieDetail] Logo URL:', logoUrl);
                setMovieLogo(logoUrl);
              }
            } catch (error) {
              console.error('[MovieDetail] Failed to fetch logo:', error);
            }
          }
          
          // Fetch IMDb ID for subtitle support
          if (data.details.id) {
            try {
              const externalIdsResponse = await fetch(
                `/api/tmdb?action=externalIds&type=movie&id=${data.details.id}`
              );
              const externalIdsData = await externalIdsResponse.json();
              if (externalIdsData.success && externalIdsData.data?.imdb_id) {
                const imdbId = externalIdsData.data.imdb_id;
                console.log('[MovieDetail] IMDb ID:', imdbId);
                setMovieImdbId(imdbId);
              }
            } catch (error) {
              console.error('[MovieDetail] Failed to fetch IMDb ID:', error);
            }
          }
        } else {
          console.log('[MovieDetail] TMDB data not found, using provider data');
        }
      } catch (error) {
        console.error('[MovieDetail] Failed to fetch TMDB data:', error);
      } finally {
        setLoadingTmdb(false);
      }
    };

    fetchTmdbData();
  }, [movieInfo]);

  const handlePlay = async () => {
    if (!movieInfo || playLoading) return;

    setPlayLoading(true);
    try {
      const token = authService.getToken();
      
      // Step 1: Get files list (use from movieInfo if available, otherwise fetch)
      let files = movieInfo.files;
      
      if (!files || files.length === 0) {
        console.log('[Movie Play] No files in movieInfo, fetching from API');
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
        
        if (!vodInfoData.success || !vodInfoData.files || vodInfoData.files.length === 0) {
          toast.error('No playable file found');
          return;
        }
        
        files = vodInfoData.files;
      }

      // Use the first file (highest quality usually)
      if (!files || files.length === 0) {
        toast.error('No playable files available');
        return;
      }
      
      const fileId = files[0].id;
      console.log('[Movie Play] Using file ID:', fileId, 'from', files.length, 'available files');
      
      if (!fileId) {
        toast.error('No playable file found');
        return;
      }

      // Step 2: Create streaming link using the file id in proper format
      const cmd = `/media/file_${fileId}.mpg`;
      
      console.log('[Movie Play] Creating stream link with:', { cmd, movieId, fileId });
      
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
      console.log('[Movie Play] Create-link response:', data);
      
      if (data.success && data.link && data.link.cmd) {
        const streamUrl = data.link.cmd;
        console.log('[Movie Play] ✅ Stream URL:', streamUrl);
        
        // Store IMDb ID in session storage for subtitle search
        if (movieImdbId) {
          sessionStorage.setItem('current_imdb_id', movieImdbId);
          console.log('[Movie Play] Stored IMDb ID for subtitles:', movieImdbId);
        } else {
          // Clear any old IMDb ID to prevent loading wrong subtitles
          sessionStorage.removeItem('current_imdb_id');
          console.log('[Movie Play] No IMDb ID available');
        }
        
        // Navigate to player with stream URL and poster
        const poster = tmdbData?.poster_path 
          ? `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}`
          : (providerUrl && movieInfo.cover_big 
            ? `${providerUrl}${movieInfo.cover_big}`
            : '');
        
        console.log('[Movie Play] Navigating to player with URL:', `/player/vod?url=${encodeURIComponent(streamUrl)}&title=${encodeURIComponent(movieInfo.name)}`);
        
        // On mobile, open native player directly without navigating
        if (isMobileApp()) {
          console.log('[Movie] Opening native VOD player - loading progress first');
          
          let savedPosition = 0;
          try {
            console.log('[Movie] Loading progress for:', movieId);
            
            const progressResponse = await fetch(`${API_URL}/progress/${movieId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            
            if (progressResponse.ok) {
              const progressData = await progressResponse.json();
              if (progressData.success && progressData.progress) {
                savedPosition = progressData.progress.current_position;
                const percentage = (savedPosition / progressData.progress.duration) * 100;
                console.log(`[Movie] ✅ Found saved position: ${savedPosition}s (${percentage.toFixed(1)}%)`);
              } else {
                console.log('[Movie] No saved progress found');
              }
            }
          } catch (error) {
            console.error('[Movie] Failed to load progress:', error);
          }
          
          console.log('[Movie] Playing with savedPosition:', savedPosition);
          playVideoNative('vod', {
            url: streamUrl,
            title: movieInfo.name,
            contentId: movieId,
            contentType: 'movie',
            savedPosition: savedPosition,
            subtitles: [],
            selectedSubtitle: null,
            isSeries: false,
            seriesId: null,
            seasonNumber: null,
            episodeNumber: null,
            imdbId: movieImdbId,
            poster: poster || undefined,
          });
        } else {
          // On web, navigate to player page
          router.push(`/player/vod?url=${encodeURIComponent(streamUrl)}&title=${encodeURIComponent(movieInfo.name)}&contentId=${movieId}&contentType=movie&poster=${encodeURIComponent(poster)}`);
        }
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
      <div className="min-h-screen bg-black flex flex-col items-center justify-center">
        <div className="text-white text-xl mb-6">Movie not found</div>
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-black px-6 py-3 rounded-lg font-semibold transition-colors"
        >
          <ArrowLeft size={20} />
          Go Back
        </button>
      </div>
    );
  }

  // TMDB data with fallback and logging
  const backdropUrl = tmdbData?.backdrop_path
    ? `https://image.tmdb.org/t/p/w1280${tmdbData.backdrop_path}`
    : (providerUrl && movieInfo.screenshot_uri 
      ? `${providerUrl}${movieInfo.screenshot_uri}`
      : null);
  
  const posterUrl = tmdbData?.poster_path
    ? `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}`
    : (providerUrl && (movieInfo.cover_big || movieInfo.screenshot_uri)
      ? `${providerUrl}${movieInfo.cover_big || movieInfo.screenshot_uri}`
      : null);

  const rating = tmdbData?.vote_average?.toFixed(1) || movieInfo.rating_imdb || movieInfo.rating_kinopoisk;
  const voteCount = tmdbData?.vote_count;
  
  // Runtime formatting - TMDB gives minutes, convert to hours/minutes
  const runtime = tmdbData?.runtime 
    ? `${Math.floor(tmdbData.runtime / 60)}h ${tmdbData.runtime % 60}m`
    : movieInfo.time;
  
  const genres = tmdbData?.genres?.map((g: any) => g.name).join(', ') || movieInfo.genre_name?.split(',').map((g: string) => g.trim()).join(', ');
  const overview = tmdbData?.overview || movieInfo.description;
  const releaseYear = tmdbData?.release_date ? new Date(tmdbData.release_date).getFullYear() : movieInfo.year;
  const tagline = tmdbData?.tagline;

  // Log data sources
  console.log('[MovieDetail] Data sources:', {
    movieTitle: movieInfo.name,
    tmdbAvailable: !!tmdbData,
    usingTmdbBackdrop: !!tmdbData?.backdrop_path,
    usingTmdbPoster: !!tmdbData?.poster_path,
    usingTmdbRating: !!tmdbData?.vote_average,
    usingTmdbGenres: !!tmdbData?.genres,
    usingTmdbOverview: !!tmdbData?.overview,
    fallbackToProvider: !tmdbData,
  });

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      {/* Back Button */}
      <button
        onClick={() => {
          // Check if we came from within the app
          if (window.history.state && window.history.state.idx > 0) {
            router.back();
          } else {
            // If no history, go to movies browse page
            router.push('/browse/movies');
          }
        }}
        className={`fixed top-6 left-6 z-50 bg-black/70 hover:bg-black/90 backdrop-blur-sm rounded-full p-3 transition-all duration-500 ${
          isFullscreen && !showControls ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        <ArrowLeft size={24} />
      </button>

      {/* Hero Section with Trailer or Backdrop */}
      <div ref={trailerContainerRef} className="relative w-full h-[70vh] sm:h-[80vh] overflow-hidden">
        {trailerKey && showTrailer ? (
          <>
            {/* YouTube Trailer Embed */}
            <iframe
              ref={iframeRef}
              src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&mute=1&controls=0&showinfo=0&rel=0&loop=1&playlist=${trailerKey}&modestbranding=1&playsinline=1&enablejsapi=1&disablekb=1&fs=0&iv_load_policy=3&autohide=1&cc_load_policy=0&color=white&origin=${typeof window !== 'undefined' ? window.location.origin : ''}`}
              className="absolute top-0 left-0 w-full h-full pointer-events-none"
              allow="autoplay; encrypted-media"
              style={{ border: 'none', objectFit: 'cover' }}
              title="Movie Trailer"
            />
            {/* Fade overlay to hide YouTube branding */}
            <div className={`absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/30 pointer-events-none transition-opacity duration-500 ${
              isFullscreen && !showControls ? 'opacity-0' : 'opacity-100'
            }`} />
            
            {/* Trailer Controls */}
            <div className={`absolute top-6 right-6 z-40 flex gap-2 transition-opacity duration-500 ${
              isFullscreen && !showControls ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}>
              <button
                onClick={() => {
                  const newMutedState = !isMuted;
                  setIsMuted(newMutedState);
                  // Use YouTube iframe API to toggle mute without restarting
                  if (iframeRef.current && iframeRef.current.contentWindow) {
                    const command = newMutedState ? '{"event":"command","func":"mute","args":""}' : '{"event":"command","func":"unMute","args":""}';
                    iframeRef.current.contentWindow.postMessage(command, '*');
                  }
                }}
                className="p-3 bg-black/70 hover:bg-black/90 backdrop-blur-sm rounded-full transition-colors"
              >
                {isMuted ? <VolumeX size={20} className="text-white" /> : <Volume2 size={20} className="text-white" />}
              </button>
              <button
                onClick={() => {
                  if (trailerContainerRef.current) {
                    if (!document.fullscreenElement) {
                      trailerContainerRef.current.requestFullscreen();
                    } else {
                      document.exitFullscreen();
                    }
                  }
                }}
                className="p-3 bg-black/70 hover:bg-black/90 backdrop-blur-sm rounded-full transition-colors"
              >
                <Maximize size={20} className="text-white" />
              </button>
            </div>
          </>
        ) : backdropUrl ? (
          tmdbData?.backdrop_path ? (
            <img
              src={backdropUrl}
              alt={movieInfo.name}
              className="w-full h-full object-cover object-top"
            />
          ) : (
            <UpscaledImage
              src={backdropUrl}
              alt={movieInfo.name}
              className="w-full h-full object-cover object-top"
              scale={2}
            />
          )
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900" />
        )}
        <div className={`absolute inset-0 bg-gradient-to-t from-black via-black/70 to-transparent transition-opacity duration-500 ${ 
          isFullscreen && !showControls ? 'opacity-0' : 'opacity-100'
        }`} />
        
        {/* Title and Meta Info Overlay */}
        <div className={`absolute bottom-0 left-0 right-0 transition-opacity duration-500 ${
          isFullscreen && !showControls ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-6 sm:pb-8">
            {/* Movie Title or Logo */}
            {movieLogo ? (
              <img 
                src={movieLogo} 
                alt={movieInfo.name}
                className="h-16 sm:h-20 lg:h-28 w-auto mb-3 drop-shadow-2xl"
                style={{ filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.9))' }}
              />
            ) : (
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-3 drop-shadow-2xl">
                {movieInfo.name}
              </h1>
            )}
            {movieInfo.o_name && movieInfo.o_name !== movieInfo.name && !movieLogo && (
              <p className="text-xl sm:text-2xl text-gray-300 mb-3">{movieInfo.o_name}</p>
            )}
            
            {/* Tagline */}
            {tagline && (
              <p className="text-gray-400 italic text-sm sm:text-base mb-3">{tagline}</p>
            )}
            
            {/* Meta Row */}
            <div className="flex flex-wrap items-center gap-3 text-sm sm:text-base mb-4">
              {rating && parseFloat(rating) > 0 && (
                <div className="flex items-center gap-1.5 bg-yellow-500/20 backdrop-blur-sm px-2.5 py-1 rounded">
                  <img src="https://upload.wikimedia.org/wikipedia/commons/6/69/IMDB_Logo_2016.svg" alt="IMDb" className="h-4" />
                  <span className="text-white font-bold">{rating}</span>
                </div>
              )}
              {releaseYear && (
                <span className="text-gray-300">{releaseYear}</span>
              )}
              {runtime && (
                <div className="flex items-center gap-1.5 text-gray-300">
                  <Clock size={16} />
                  <span>{runtime}</span>
                </div>
              )}
              {movieInfo.age && (
                <div className="px-2 py-1 border border-gray-400 rounded text-xs text-gray-300">
                  {movieInfo.age}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handlePlay}
                disabled={playLoading}
                className="flex items-center gap-2 bg-white text-black px-6 py-2.5 rounded font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play size={20} fill="currentColor" />
                <span>{playLoading ? 'Loading...' : watchProgress > 5 ? 'Continue' : 'Play'}</span>
              </button>
              
              <FavoriteButton
                contentType="MOVIE"
                contentId={movieId}
                contentName={movieInfo.name}
                contentPoster={posterUrl || undefined}
                className="bg-gray-800/70 backdrop-blur-sm hover:bg-gray-700/70 p-2.5 rounded-full"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Content Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        {/* Watch Progress */}
        {watchProgress > 0 && watchProgress < 95 && (
          <div className="mb-6">
            <ProgressBar percentage={watchProgress} showLabel className="max-w-md" />
          </div>
        )}

        {/* Genres */}
        {genres && (
          <div className="flex flex-wrap gap-2 mb-6">
            {genres.split(', ').map((genre: string, index: number) => (
              <span
                key={index}
                className="px-3 py-1 bg-gray-800/50 backdrop-blur-sm rounded-full text-sm text-gray-300"
              >
                {genre}
              </span>
            ))}
          </div>
        )}

        {/* Overview */}
        {overview && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-3">Overview</h2>
            <p className="text-gray-300 text-sm sm:text-base leading-relaxed max-w-4xl">
              {overview}
            </p>
          </div>
        )}

        {/* Cast Section */}
        {tmdbData?.credits?.cast && tmdbData.credits.cast.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-4">Cast</h2>
            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
              {tmdbData.credits.cast.slice(0, 10).map((actor: any) => (
                <div key={actor.id} className="flex-shrink-0 w-32 text-center">
                  {actor.profile_path ? (
                    <img
                      src={`https://image.tmdb.org/t/p/w185${actor.profile_path}`}
                      alt={actor.name}
                      className="w-32 h-32 rounded-full object-cover mb-2"
                    />
                  ) : (
                    <div className="w-32 h-32 rounded-full bg-gray-800 flex items-center justify-center mb-2">
                      <span className="text-gray-500 text-2xl">
                        {actor.name.charAt(0)}
                      </span>
                    </div>
                  )}
                  <p className="text-sm font-semibold truncate">{actor.name}</p>
                  <p className="text-xs text-gray-400 truncate">{actor.character}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Additional Info Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {movieInfo.director && (
            <div>
              <h3 className="text-sm font-semibold text-gray-400 mb-1">Director</h3>
              <p className="text-white">{movieInfo.director}</p>
            </div>
          )}
          {movieInfo.country && (
            <div>
              <h3 className="text-sm font-semibold text-gray-400 mb-1">Country</h3>
              <p className="text-white">{movieInfo.country}</p>
            </div>
          )}
          {tmdbData?.production_companies && tmdbData.production_companies.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-400 mb-1">Production</h3>
              <p className="text-white">{tmdbData.production_companies[0].name}</p>
            </div>
          )}
        </div>

        {/* IMDb Link */}
        {movieImdbId && (
          <div className="mb-8">
            <a
              href={`https://www.imdb.com/title/${movieImdbId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-yellow-500 hover:text-yellow-400 transition-colors font-semibold"
            >
              <span>View on IMDb</span>
              <span>→</span>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
