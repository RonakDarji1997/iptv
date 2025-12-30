'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Play, Star, CheckCircle, Plus, Volume2, VolumeX, Maximize } from 'lucide-react';
import toast from 'react-hot-toast';
import { authService } from '@/services/authService';
import { UpscaledImage } from '@/components/UpscaledImage';
import FavoriteButton from '@/components/FavoriteButton';
import ProgressBar from '@/components/ProgressBar';
import { cache } from '@/utils/cache';
import { API_URL } from '@/config/constants';
import { isMobileApp, playVideoNative, listenToNative } from '@/utils/mobileDetection';

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
  season_number?: number;
}

interface Episode {
  id: string;
  name: string;
  episode_num?: string;
  series_name?: string;
  season_name?: string;
  time?: string;
}

interface TMDBEpisode {
  id: number;
  name: string;
  overview: string;
  episode_number: number;
  still_path: string | null;
  air_date: string;
  vote_average: number;
  runtime: number | null;
}

export default function SeriesDetailPage() {
  const params = useParams();
  const router = useRouter();
  const seriesId = params.seriesId as string;
  
  const [seriesInfo, setSeriesInfo] = useState<SeriesInfo | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [episodes, setEpisodes] = useState<{ [seasonId: string]: Episode[] }>({});
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [providerUrl, setProviderUrl] = useState<string | null>(null);
  const [tmdbData, setTmdbData] = useState<any>(null);
  const [tmdbSeasons, setTmdbSeasons] = useState<{ [seasonNumber: number]: any }>({});
  const [loadingTmdb, setLoadingTmdb] = useState(false);
  const [episodeProgress, setEpisodeProgress] = useState<{ [episodeId: string]: number }>({});
  const [nextUnwatchedEpisode, setNextUnwatchedEpisode] = useState<{ seasonId: string; episode: Episode; index: number } | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc'); // desc = newest first
  const [showSeasonDropdown, setShowSeasonDropdown] = useState(false);
  const [seriesImdbId, setSeriesImdbId] = useState<string | null>(null);
  const [seriesLogo, setSeriesLogo] = useState<string | null>(null);
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [showTrailer, setShowTrailer] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const trailerContainerRef = useRef<HTMLDivElement>(null);
  const hideControlsTimerRef = useRef<NodeJS.Timeout | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Listen for NEXT_EPISODE message from mobile app
  useEffect(() => {
    console.log('[Series] useEffect for NEXT_EPISODE listener, isMobileApp():', isMobileApp());
    if (!isMobileApp()) return;

    console.log('[Series] Setting up NEXT_EPISODE listener');
    const cleanup = listenToNative((type, data) => {
      console.log('[Series] listenToNative callback fired, type:', type, 'data:', data);
      if (type === 'NEXT_EPISODE') {
        console.log('[Series] Received NEXT_EPISODE message from mobile');
        
        // Get the stored episode playlist
        const playlistData = sessionStorage.getItem('episode_playlist');
        if (!playlistData) {
          console.warn('[Series] No episode playlist found in sessionStorage');
          toast.error('Unable to play next episode');
          return;
        }

        try {
          const playlist = JSON.parse(playlistData);
          const { episodes, currentIndex, seasonId } = playlist;
          
          if (!episodes || currentIndex === undefined) {
            console.warn('[Series] Invalid playlist data');
            toast.error('Unable to play next episode');
            return;
          }

          const nextIndex = currentIndex + 1;
          if (nextIndex >= episodes.length) {
            console.log('[Series] No more episodes in this season');
            toast('No more episodes in this season');
            return;
          }

          const nextEpisode = episodes[nextIndex];
          console.log('[Series] Playing next episode:', nextEpisode);
          
          // Call the playEpisode function with the next episode
          // handlePlayEpisode signature: (seasonId, episodeId, episodeName, episodeList?, currentIndex?)
          handlePlayEpisode(seasonId, nextEpisode.id, nextEpisode.name, episodes, nextIndex);
        } catch (error) {
          console.error('[Series] Error playing next episode:', error);
          toast.error('Failed to play next episode');
        }
      }
    });

    return cleanup;
  }, [episodes, seasons, seriesInfo, seriesImdbId]);

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
        setShowControls(true);
        
        if (hideControlsTimerRef.current) {
          clearTimeout(hideControlsTimerRef.current);
        }
        
        hideControlsTimerRef.current = setTimeout(() => {
          setShowControls(false);
        }, 3000);
      } else {
        setShowControls(true);
        if (hideControlsTimerRef.current) {
          clearTimeout(hideControlsTimerRef.current);
        }
      }
    };

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

  useEffect(() => {
    const fetchSeriesData = async () => {
      try {
        const token = authService.getToken();
        let foundSeriesInfo = null;
        
        // Try to get series data from sessionStorage or localStorage cache
        const sessionData = sessionStorage.getItem(`series_${seriesId}`);
        if (sessionData) {
          const series = JSON.parse(sessionData);
          setSeriesInfo(series);
          foundSeriesInfo = series;
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
              foundSeriesInfo = series;
            }
          }
          
          // API Fallback: If still no series info, fetch from API
          if (!foundSeriesInfo) {
            console.log('[SeriesDetail] Cache miss, fetching from API:', seriesId);
            try {
              const response = await fetch(`${API_URL}/stalker-proxy/vod-info/${seriesId}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              const data = await response.json();
              console.log('[SeriesDetail] API response:', data);
              if (data.success && data.info) {
                const seriesData = data.info;
                const series = {
                  id: seriesId,
                  name: seriesData.name || seriesData.o_name || 'Unknown',
                  o_name: seriesData.o_name,
                  description: seriesData.description,
                  year: seriesData.year,
                  director: seriesData.director,
                  actors: seriesData.actors,
                  rating_imdb: seriesData.rating_imdb,
                  rating_kinopoisk: seriesData.rating_kinopoisk,
                  genre_name: seriesData.genre_name,
                  screenshot_uri: seriesData.screenshot_uri,
                  cover_big: seriesData.cover_big,
                };
                console.log('[SeriesDetail] Parsed series data:', series);
                setSeriesInfo(series);
                // Cache it for next time
                sessionStorage.setItem(`series_${seriesId}`, JSON.stringify(series));
              } else {
                console.error('[SeriesDetail] API response missing info:', data);
              }
            } catch (error) {
              console.error('Failed to fetch series info from API:', error);
            }
          }
        }

        // Fetch seasons with cache
        const seasonsCacheKey = `series-seasons:${seriesId}`;
        const seasonsData = await cache.getOrFetch(
          seasonsCacheKey,
          async () => {
            const response = await fetch(`${API_URL}/stalker-proxy/series/seasons/${seriesId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            return response.json();
          },
          10 * 60 * 1000 // 10 minutes TTL
        );
        
        if (seasonsData.success && seasonsData.seasons) {
          setSeasons(seasonsData.seasons);
          // Auto-select first season
          if (seasonsData.seasons.length > 0) {
            const firstSeasonId = seasonsData.seasons[0].id;
            setSelectedSeasonId(firstSeasonId);
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

  // Fetch TMDB data when series info is loaded
  useEffect(() => {
    const fetchTmdbData = async () => {
      if (!seriesInfo) return;
      
      setLoadingTmdb(true);
      try {
        const title = seriesInfo.name || seriesInfo.o_name || '';
        const response = await fetch(
          `/api/tmdb?action=smart-search&title=${encodeURIComponent(title)}&type=tv`
        );
        const data = await response.json();
        if (data.success && data.details) {
          setTmdbData(data.details);
          
          // Fetch trailer video
          if (data.details.id) {
            try {
              const videosResponse = await fetch(
                `/api/tmdb?action=videos&type=tv&id=${data.details.id}`
              );
              const videosData = await videosResponse.json();
              if (videosData.success && videosData.videos && videosData.videos.length > 0) {
                const youtubeTrailer = videosData.videos.find((v: any) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));
                if (youtubeTrailer) {
                  console.log('[Series Detail] Trailer key:', youtubeTrailer.key);
                  setTrailerKey(youtubeTrailer.key);
                }
              }
            } catch (error) {
              console.error('[Series Detail] Failed to fetch trailer:', error);
            }
          }
          
          // Fetch logos
          if (data.details.id) {
            try {
              const logosResponse = await fetch(
                `/api/tmdb?action=logos&type=tv&id=${data.details.id}`
              );
              const logosData = await logosResponse.json();
              if (logosData.success && logosData.logos && logosData.logos.length > 0) {
                const logoPath = logosData.logos[0].file_path;
                const logoUrl = `https://image.tmdb.org/t/p/w500${logoPath}`;
                console.log('[Series Detail] Logo URL:', logoUrl);
                setSeriesLogo(logoUrl);
              }
            } catch (error) {
              console.error('[Series Detail] Failed to fetch logo:', error);
            }
          }
          
          // Fetch IMDb ID for subtitle support
          if (data.details.id) {
            try {
              const externalIdsResponse = await fetch(
                `/api/tmdb?action=externalIds&type=tv&id=${data.details.id}`
              );
              const externalIdsData = await externalIdsResponse.json();
              if (externalIdsData.success && externalIdsData.data?.imdb_id) {
                const imdbId = externalIdsData.data.imdb_id;
                console.log('[Series Detail] IMDb ID:', imdbId);
                setSeriesImdbId(imdbId);
              }
            } catch (error) {
              console.error('[Series Detail] Failed to fetch IMDb ID:', error);
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch TMDB data:', error);
      } finally {
        setLoadingTmdb(false);
      }
    };

    fetchTmdbData();
  }, [seriesInfo]);

  // Fetch TMDB season data when a season is selected
  useEffect(() => {
    const fetchTmdbSeason = async () => {
      if (!tmdbData?.id || !selectedSeasonId) return;

      const selectedSeason = seasons.find(s => s.id === selectedSeasonId);
      if (!selectedSeason) return;

      // Extract season number from season name (e.g., "Season 1" -> 1)
      const seasonNumberMatch = selectedSeason.name.match(/Season\s+(\d+)/i);
      const seasonNumber = seasonNumberMatch 
        ? parseInt(seasonNumberMatch[1]) 
        : (selectedSeason.season_number || 1);

      // Check if already cached
      if (tmdbSeasons[seasonNumber]) return;

      try {
        const response = await fetch(
          `/api/tmdb?action=season&tvId=${tmdbData.id}&seasonNumber=${seasonNumber}`
        );
        const data = await response.json();
        if (data.success && data.season) {
          setTmdbSeasons(prev => ({ ...prev, [seasonNumber]: data.season }));
        }
      } catch (error) {
        console.error('Failed to fetch TMDB season data:', error);
      }
    };

    fetchTmdbSeason();
  }, [tmdbData, selectedSeasonId, seasons]);

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
            `${API_URL}/stalker-proxy/series/episodes/${seriesId}/${seasonId}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          return response.json();
        },
        10 * 60 * 1000 // 10 minutes TTL
      );
      
      if (data.success && data.episodes) {
        setEpisodes(prev => ({ ...prev, [seasonId]: data.episodes }));
        
        // Fetch progress for each episode
        fetchEpisodesProgress(data.episodes, seasonId);
      }
    } catch (error) {
      console.error('Failed to fetch episodes:', error);
      toast.error('Failed to load episodes');
    }
  };

  const fetchEpisodesProgress = async (episodeList: Episode[], seasonId: string) => {
    try {
      const token = authService.getToken();
      const progressPromises = episodeList.map(async (episode) => {
        try {
          const response = await fetch(`${API_URL}/progress/${episode.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.progress) {
              const percentage = (data.progress.current_position / data.progress.duration) * 100;
              return { id: episode.id, percentage, episode };
            }
          }
        } catch (error) {
          console.error(`Failed to fetch progress for episode ${episode.id}:`, error);
        }
        return null;
      });

      const results = await Promise.all(progressPromises);
      const progressMap: { [key: string]: number } = {};
      results.forEach(result => {
        if (result) {
          progressMap[result.id] = result.percentage;
        }
      });
      
      setEpisodeProgress(prev => ({ ...prev, ...progressMap }));
      
      // Find next unwatched episode
      updateNextUnwatchedEpisode(episodeList, progressMap, seasonId);
    } catch (error) {
      console.error('Failed to fetch episodes progress:', error);
    }
  };

  const updateNextUnwatchedEpisode = (episodeList: Episode[], progressMap: { [key: string]: number }, seasonId: string) => {
    // Episodes are in reverse order, so we need to reverse to find the first unwatched
    const orderedEpisodes = [...episodeList].reverse();
    
    for (let i = 0; i < orderedEpisodes.length; i++) {
      const episode = orderedEpisodes[i];
      const progress = progressMap[episode.id] || 0;
      
      // If episode is not completed (less than 95%), this is the next one to watch
      if (progress < 95) {
        setNextUnwatchedEpisode({ seasonId, episode, index: i });
        return;
      }
    }
    
    // All episodes watched, set to first episode
    if (orderedEpisodes.length > 0) {
      setNextUnwatchedEpisode({ seasonId, episode: orderedEpisodes[0], index: 0 });
    }
  };

  const toggleSeason = (seasonId: string) => {
    setSelectedSeasonId(seasonId);
    
    if (!episodes[seasonId]) {
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
            `${API_URL}/stalker-proxy/episode-info/${seriesId}/${seasonId}/${episodeId}`,
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
      
      const linkResponse = await fetch(`${API_URL}/stalker-proxy/create-link`, {
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
        const streamUrl = linkData.link.cmd; // This is the actual stream URL
        const title = `${seriesInfo?.name} - ${episodeName}`;
        
        // Get current episode data from the list
        const currentEpisode = episodeList?.[currentIndex || 0];
        const currentSeason = seasons.find(s => s.id === seasonId);
        
        // Extract episode number - use currentIndex + 1 as fallback if episode_num doesn't exist
        const episodeNumber = currentEpisode?.episode_num || (currentIndex !== undefined ? currentIndex + 1 : 1);
        
        // Pass episode navigation data via sessionStorage
        if (episodeList && currentIndex !== undefined && currentEpisode) {
          sessionStorage.setItem('episode_playlist', JSON.stringify({
            episodes: episodeList,
            currentIndex,
            seasonId,
            seriesId,
            seriesName: seriesInfo?.name,
            currentEpisode
          }));
        }
        
        // Get poster from TMDB data or series info
        const poster = tmdbData?.poster_path
          ? `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}`
          : (providerUrl && (seriesInfo?.cover_big || seriesInfo?.screenshot_uri)
            ? `${providerUrl}${seriesInfo.cover_big || seriesInfo.screenshot_uri}`
            : '');
        
        // Store IMDb ID for subtitle fetching in player
        if (seriesImdbId) {
          sessionStorage.setItem('current_imdb_id', seriesImdbId);
          console.log('[Episode Play] Stored IMDb ID for subtitles:', seriesImdbId);
        } else {
          // Clear any old IMDb ID to prevent loading wrong subtitles
          sessionStorage.removeItem('current_imdb_id');
          console.log('[Episode Play] No IMDb ID available for series');
        }
        
        console.log('[Episode Play] Passing metadata:', {
          title,
          streamUrl,
          poster,
          seriesId,
          seasonNumber: currentSeason?.season_number,
          episodeNumber: episodeNumber,
          imdbId: seriesImdbId
        });
        
        // Fetch saved position for this episode
        let savedPosition = 0;
        try {
          const progressResponse = await fetch(`${API_URL}/progress/${episodeId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          
          if (progressResponse.ok) {
            const progressData = await progressResponse.json();
            if (progressData.success && progressData.progress) {
              savedPosition = progressData.progress.current_position;
              console.log('[Episode Play] Found saved position:', savedPosition);
            }
          }
        } catch (error) {
          console.error('[Episode Play] Failed to fetch saved position:', error);
        }
        
        // On mobile, open native player directly without navigating
        if (isMobileApp()) {
          console.log('[Series] Opening native VOD player with URL:', streamUrl);
          playVideoNative('vod', {
            url: streamUrl,
            title: title,
            contentId: episodeId,
            contentType: 'episode',
            savedPosition: savedPosition,
            subtitles: [],
            selectedSubtitle: null,
            isSeries: true,
            seriesId: seriesId,
            seasonNumber: currentSeason?.season_number || null,
            episodeNumber: episodeNumber,
            totalEpisodes: episodeList?.length || 0,
            imdbId: seriesImdbId,
            poster: poster || undefined,
          });
        } else {
          // On web, navigate to player page
          const encodedUrl = encodeURIComponent(streamUrl);
          const encodedTitle = encodeURIComponent(title);
          const playerUrl = `/player/vod?url=${encodedUrl}&title=${encodedTitle}&isSeries=true&contentId=${episodeId}&contentType=episode&seriesId=${seriesId}&seasonNumber=${currentSeason?.season_number || ''}&episodeNumber=${episodeNumber}&poster=${encodeURIComponent(poster)}${seriesImdbId ? `&imdbId=${seriesImdbId}` : ''}`;
          router.push(playerUrl);
        }
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

  const backdropUrl = tmdbData?.backdrop_path
    ? `https://image.tmdb.org/t/p/w1280${tmdbData.backdrop_path}`
    : (providerUrl && seriesInfo.screenshot_uri 
      ? `${providerUrl}${seriesInfo.screenshot_uri}`
      : null);
  
  const posterUrl = tmdbData?.poster_path
    ? `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}`
    : (providerUrl && (seriesInfo.cover_big || seriesInfo.screenshot_uri)
      ? `${providerUrl}${seriesInfo.cover_big || seriesInfo.screenshot_uri}`
      : null);

  const rating = tmdbData?.vote_average?.toFixed(1) || seriesInfo.rating_imdb || seriesInfo.rating_kinopoisk;
  const voteCount = tmdbData?.vote_count;
  const genres = tmdbData?.genres?.map((g: any) => g.name).join(', ') || seriesInfo.genre_name?.split(',').map(g => g.trim()).join(', ');
  const overview = tmdbData?.overview || seriesInfo.description;
  const releaseYear = tmdbData?.first_air_date ? new Date(tmdbData.first_air_date).getFullYear() : seriesInfo.year;

  // Get current season's TMDB data
  const selectedSeason = seasons.find(s => s.id === selectedSeasonId);
  const seasonNumberMatch = selectedSeason?.name.match(/Season\s+(\d+)/i);
  const currentSeasonNumber = seasonNumberMatch 
    ? parseInt(seasonNumberMatch[1]) 
    : (selectedSeason?.season_number || 1);
  const tmdbSeasonData = tmdbSeasons[currentSeasonNumber];

  // Debug logging
  console.log('[Series Detail] Selected season:', selectedSeason?.name);
  console.log('[Series Detail] Current season number:', currentSeasonNumber);
  console.log('[Series Detail] TMDB season data available:', !!tmdbSeasonData);
  console.log('[Series Detail] Episodes count in TMDB:', tmdbSeasonData?.episodes?.length);
  if (selectedSeasonId && episodes[selectedSeasonId]) {
    console.log('[Series Detail] Provider episodes count:', episodes[selectedSeasonId].length);
    console.log('[Series Detail] First episode:', episodes[selectedSeasonId][0]);
  }

  // Helper to get episode thumbnail from TMDB
  const getEpisodeThumbnail = (episode: Episode, episodeIndex: number): string | null => {
    if (!tmdbSeasonData?.episodes) {
      console.log('[Episode Thumbnail] No TMDB season data available');
      return null;
    }
    
    // Strategy 1: Try to match by episode number from episode_num field
    let episodeNumber: number | null = null;
    
    if (episode.episode_num) {
      const match = episode.episode_num.match(/\d+/);
      if (match) {
        episodeNumber = parseInt(match[0]);
      }
    }
    
    // Strategy 2: Try to extract from episode name (e.g., "Episode 1", "1.", "E01")
    if (!episodeNumber) {
      const nameMatch = episode.name.match(/(?:Episode|E|Ep\.?)\s*(\d+)/i);
      if (nameMatch) {
        episodeNumber = parseInt(nameMatch[1]);
      }
    }
    
    // Strategy 3: Use the index position (reversed episodes, so we need to calculate)
    // Assuming episodes are reversed, the first in the list should be the last episode
    if (!episodeNumber && selectedSeasonId && episodes[selectedSeasonId]) {
      const totalEpisodes = episodes[selectedSeasonId].length;
      episodeNumber = totalEpisodes - episodeIndex;
    }
    
    console.log('[Episode Thumbnail] Episode:', episode.name, 'Calculated number:', episodeNumber, 'Index:', episodeIndex);
    
    if (!episodeNumber) return null;
    
    const tmdbEpisode = tmdbSeasonData.episodes.find((e: TMDBEpisode) => e.episode_number === episodeNumber);
    
    if (tmdbEpisode?.still_path) {
      console.log('[Episode Thumbnail] Found TMDB episode:', tmdbEpisode.name, 'Still:', tmdbEpisode.still_path);
      return `https://image.tmdb.org/t/p/w300${tmdbEpisode.still_path}`;
    }
    
    console.log('[Episode Thumbnail] No match found for episode number:', episodeNumber);
    return null;
  };

  // Helper to get episode overview from TMDB
  const getEpisodeOverview = (episode: Episode, episodeIndex: number): string | null => {
    if (!tmdbSeasonData?.episodes) return null;
    
    let episodeNumber: number | null = null;
    
    if (episode.episode_num) {
      const match = episode.episode_num.match(/\d+/);
      if (match) {
        episodeNumber = parseInt(match[0]);
      }
    }
    
    if (!episodeNumber) {
      const nameMatch = episode.name.match(/(?:Episode|E|Ep\.?)\s*(\d+)/i);
      if (nameMatch) {
        episodeNumber = parseInt(nameMatch[1]);
      }
    }
    
    if (!episodeNumber && selectedSeasonId && episodes[selectedSeasonId]) {
      const totalEpisodes = episodes[selectedSeasonId].length;
      episodeNumber = totalEpisodes - episodeIndex;
    }
    
    if (!episodeNumber) return null;
    
    const tmdbEpisode = tmdbSeasonData.episodes.find((e: TMDBEpisode) => e.episode_number === episodeNumber);
    return tmdbEpisode?.overview || null;
  };

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      {/* Back Button */}
      <button
        onClick={() => {
          if (window.history.state && window.history.state.idx > 0) {
            router.back();
          } else {
            router.push('/browse/series');
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
              title="Series Trailer"
            />
            {/* Fade overlay */}
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
              alt={seriesInfo.name}
              className="w-full h-full object-cover object-top"
            />
          ) : (
            <UpscaledImage
              src={backdropUrl}
              alt={seriesInfo.name}
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
            {/* Series Logo/Title */}
            {seriesLogo ? (
              <img 
                src={seriesLogo} 
                alt={seriesInfo.name}
                className="h-8 sm:h-10 lg:h-12 w-auto mb-3 drop-shadow-2xl"
                style={{ filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.9))' }}
              />
            ) : (
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-3 drop-shadow-2xl">
                {seriesInfo.name}
              </h1>
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
              {genres && (
                <span className="text-gray-300 hidden sm:inline">{genres.split(',')[0]}</span>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => {
                  if (nextUnwatchedEpisode) {
                    handlePlayEpisode(
                      nextUnwatchedEpisode.seasonId,
                      nextUnwatchedEpisode.episode.id,
                      nextUnwatchedEpisode.episode.name,
                      episodes[nextUnwatchedEpisode.seasonId] ? [...episodes[nextUnwatchedEpisode.seasonId]].reverse() : [],
                      nextUnwatchedEpisode.index
                    );
                  }
                }}
                disabled={!nextUnwatchedEpisode}
                className="flex items-center gap-2 bg-white text-black px-6 py-2.5 rounded font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play size={20} fill="currentColor" />
                <span>
                  {nextUnwatchedEpisode && episodeProgress[nextUnwatchedEpisode.episode.id] > 0 && episodeProgress[nextUnwatchedEpisode.episode.id] < 95
                    ? `Continue`
                    : 'Start'
                  } | S{currentSeasonNumber}E{nextUnwatchedEpisode?.index ? nextUnwatchedEpisode.index + 1 : 1}
                </span>
              </button>
              
              <FavoriteButton
                contentType="SERIES"
                contentId={seriesId}
                contentName={seriesInfo.name}
                contentPoster={posterUrl || undefined}
                className="bg-gray-800/70 backdrop-blur-sm hover:bg-gray-700/70 p-2.5 rounded-full"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Content Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        {/* Overview */}
        {overview && (
          <p className="text-gray-300 text-sm sm:text-base mb-8 max-w-3xl leading-relaxed">
            {overview}
          </p>
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

        {/* Season Selector - Desktop: Tabs, Mobile: Dropdown */}
        <div className="mb-6">
          {/* Desktop Tabs - hidden on mobile */}
          <div className="hidden md:flex items-center gap-6 border-b border-gray-800">
            {seasons.map((season) => (
              <button
                key={season.id}
                onClick={() => toggleSeason(season.id)}
                className={`px-4 py-3 font-semibold transition-colors relative ${
                  selectedSeasonId === season.id
                    ? 'text-white'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {season.name}
                {selectedSeasonId === season.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-500 rounded-t" />
                )}
              </button>
            ))}
            <button 
              onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
              className="ml-auto text-yellow-500 hover:text-yellow-400 flex items-center gap-2 text-sm font-semibold"
            >
              SORT <span className="text-xs">{sortOrder === 'desc' ? '↓' : '↑'}</span>
            </button>
          </div>

          {/* Mobile Dropdown */}
          <div className="md:hidden">
            <div className="flex items-center gap-3 mb-4">
              <div className="relative flex-1">
                <button
                  onClick={() => setShowSeasonDropdown(!showSeasonDropdown)}
                  className="w-full px-4 py-3 bg-gray-900 rounded-lg border border-gray-800 text-left font-semibold flex items-center justify-between"
                >
                  <span>{selectedSeason?.name || 'Select Season'}</span>
                  <span className="text-gray-400">{showSeasonDropdown ? '▲' : '▼'}</span>
                </button>
                
                {showSeasonDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-gray-900 rounded-lg border border-gray-800 shadow-xl z-10 max-h-64 overflow-y-auto">
                    {seasons.map((season) => (
                      <button
                        key={season.id}
                        onClick={() => {
                          toggleSeason(season.id);
                          setShowSeasonDropdown(false);
                        }}
                        className={`w-full px-4 py-3 text-left transition-colors ${
                          selectedSeasonId === season.id
                            ? 'bg-blue-600 text-white'
                            : 'hover:bg-gray-800 text-gray-300'
                        }`}
                      >
                        {season.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              <button 
                onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                className="px-4 py-3 bg-gray-900 rounded-lg border border-gray-800 text-yellow-500 hover:text-yellow-400 font-semibold"
              >
                {sortOrder === 'desc' ? '↓' : '↑'}
              </button>
            </div>
          </div>
        </div>

        {/* Episodes Grid */}
        {selectedSeasonId && episodes[selectedSeasonId] ? (
          <div className="space-y-4">
            {(() => {
              const episodeList = [...episodes[selectedSeasonId]];
              const sortedEpisodes = sortOrder === 'desc' ? episodeList.reverse() : episodeList;
              
              return sortedEpisodes.map((episode, displayIndex) => {
                // Calculate the actual episode index for TMDB matching
                const actualIndex = sortOrder === 'desc' ? displayIndex : episodeList.length - 1 - displayIndex;
                const thumbnail = getEpisodeThumbnail(episode, actualIndex);
                const episodeOverview = getEpisodeOverview(episode, actualIndex);
                const progress = episodeProgress[episode.id];
                const isWatched = progress >= 95;
                const isInProgress = progress > 0 && progress < 95;

                return (
                  <div
                    key={episode.id}
                    onClick={() =>
                      handlePlayEpisode(
                        selectedSeasonId,
                        episode.id,
                        episode.name,
                        sortedEpisodes,
                        displayIndex
                      )
                    }
                    className="group cursor-pointer"
                  >
                    <div className="flex gap-4 bg-gray-900/30 hover:bg-gray-800/50 rounded-lg overflow-hidden transition-all duration-200">
                      {/* Episode Thumbnail */}
                      <div className="relative flex-shrink-0 w-40 sm:w-56 aspect-video bg-gray-800">
                        {thumbnail ? (
                          <img
                            src={thumbnail}
                            alt={episode.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Play size={32} className="text-gray-600" />
                          </div>
                        )}
                        
                        {/* Watched/Progress Indicator */}
                        {isWatched && (
                          <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm rounded-full p-1">
                            <CheckCircle size={16} className="text-green-500" />
                          </div>
                        )}
                        
                        {/* Progress Bar on Thumbnail */}
                        {isInProgress && (
                          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-700">
                            <div
                              className="h-full bg-red-600"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        )}

                        {/* Play Overlay */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                          <div className="w-12 h-12 rounded-full border-2 border-white flex items-center justify-center">
                            <Play size={20} fill="white" className="text-white ml-0.5" />
                          </div>
                        </div>

                        {/* Episode Runtime */}
                        {episode.time && (
                          <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-sm px-2 py-0.5 rounded text-xs">
                            {episode.time}
                          </div>
                        )}
                      </div>

                      {/* Episode Info */}
                      <div className="flex-1 py-3 pr-4 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="font-semibold text-base sm:text-lg truncate">
                            {episode.name}
                          </h3>
                        </div>
                        
                        {episodeOverview && (
                          <p className="text-sm text-gray-400 line-clamp-2 sm:line-clamp-3">
                            {episodeOverview}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        ) : (
          <div className="text-center py-12 text-gray-400">
            Loading episodes...
          </div>
        )}
      </div>
    </div>
  );
}
