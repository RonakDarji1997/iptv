'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Play, Pause, Volume2, VolumeX, Maximize, Rewind, FastForward, Loader, SkipBack, SkipForward, Subtitles } from 'lucide-react';
import toast from 'react-hot-toast';
import Hls from 'hls.js';
import { authService } from '@/services/authService';
import { cache } from '@/utils/cache';
import { apiCache } from '@/utils/api-cache';
import { API_URL } from '@/config/constants';

import { isMobileApp, playVideoNative, listenToNative } from '@/utils/mobileDetection';

// Subtitle type definition
interface Subtitle {
  id: string;
  language: string;
  languageName: string;
  fileName: string;
  downloadCount: number;
  rating: number;
  uploader: string;
  releaseInfo?: string;
  fileId: number;
  isCustom?: boolean;
  customUrl?: string;
  seasonNumber?: number;
  episodeNumber?: number;
}

function VODPlayerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const streamUrl = searchParams.get('url');
  const title = searchParams.get('title');
  const isSeries = searchParams.get('isSeries') === 'true';
  const contentId = searchParams.get('contentId');
  const contentType = searchParams.get('contentType'); // 'movie' or 'episode'
  const seriesId = searchParams.get('seriesId');
  const seasonNumber = searchParams.get('seasonNumber');
  const episodeNumber = searchParams.get('episodeNumber');
  const imdbId = searchParams.get('imdbId');
  const poster = searchParams.get('poster');

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [episodePlaylist, setEpisodePlaylist] = useState<any>(null);
  const [isLoadingNext, setIsLoadingNext] = useState(false);
  const [showSeekFeedback, setShowSeekFeedback] = useState<'forward' | 'backward' | null>(null);
  const seekFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  
  // Track if native player was already opened to prevent auto-play on return
  const nativePlayerOpenedRef = useRef<boolean>(false);
  
  // Progress tracking
  const progressSaveIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const lastProgressSaveRef = useRef<number>(0);
  const durationRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);
  const posterUrlRef = useRef<string | null>(poster); // Store poster URL for progress saving
  
  // Listen for messages from native mobile app
  useEffect(() => {
    if (!isMobileApp()) return;

    console.log('[VOD] Setting up native message listener');
    const cleanup = listenToNative((type, data) => {
      switch (type) {
        case 'VIDEO_PROGRESS':
          // Native player sending progress updates
          if (data.contentId === contentId && data.duration > 0) {
            saveWatchProgress(data.currentTime, data.duration);
          }
          break;
        
        case 'VIDEO_ENDED':
          // Native player finished video
          if (data.contentId === contentId) {
            saveWatchProgress(data.duration, data.duration);
            saveToWatchHistory();
          }
          break;
        
        case 'VIDEO_CLOSED':
          // User closed native player - don't navigate, just log
          // The WebView navigation will be handled by the native app
          console.log('[VOD] Native player closed');
          break;
        
        default:
          console.log('[VOD] Unhandled native message:', type, data);
      }
    });

    return cleanup;
  }, [contentId, router]);
  
  // Subtitle state
  const [availableSubtitles, setAvailableSubtitles] = useState<Subtitle[]>([]);
  const [selectedSubtitle, setSelectedSubtitle] = useState<Subtitle | null>(null);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const [subtitleSearch, setSubtitleSearch] = useState('');
  const [loadingSubtitles, setLoadingSubtitles] = useState(false);
  const [subtitleTrack, setSubtitleTrack] = useState<string | null>(null);
  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const [savedPosition, setSavedPosition] = useState<number>(0);
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [videoAspectRatio, setVideoAspectRatio] = useState<number>(16/9); // Default to 16:9

  // Subtitle functions (defined before useEffect that uses them)
  const selectSubtitle = async (subtitle: Subtitle) => {
    try {
      // Handle custom uploaded subtitles differently
      if (subtitle.isCustom && subtitle.customUrl) {
        console.log('[Subtitles] Loading custom subtitle:', subtitle.fileName);
        
        // Disable existing track first
        const video = videoRef.current;
        if (video && video.textTracks.length > 0) {
          for (let i = 0; i < video.textTracks.length; i++) {
            video.textTracks[i].mode = 'hidden';
          }
        }
        
        setSubtitleTrack(subtitle.customUrl);
        setSelectedSubtitle(subtitle);
        setShowSubtitleMenu(false);
        
        // Wait for track to be added and enable it
        setTimeout(() => {
          const video = videoRef.current;
          if (video && video.textTracks.length > 0) {
            for (let i = 0; i < video.textTracks.length; i++) {
              const track = video.textTracks[i];
              if (track.kind === 'subtitles') {
                track.mode = 'showing';
                console.log('[Subtitles] Custom subtitle enabled');
                toast.success(`Custom subtitle loaded: ${subtitle.fileName}`);
                break;
              }
            }
          }
        }, 300);
        
        return;
      }
      
      // Regular OpenSubtitles download flow
      console.log('[Subtitles] Downloading:', subtitle.fileName, 'fileId:', subtitle.fileId);
      
      // Call API route to download subtitle with caching
      const data = await apiCache.fetch(`/api/subtitles?action=download&fileId=${subtitle.fileId}`);
      
      const srtContent = data.content;
      
      if (!srtContent) {
        toast.error('Failed to download subtitle');
        return;
      }

      // Create blob URL for subtitle (VTT format)
      const blob = new Blob([srtContent], { type: 'text/vtt;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      
      // Disable existing track first
      const video = videoRef.current;
      if (video && video.textTracks.length > 0) {
        for (let i = 0; i < video.textTracks.length; i++) {
          video.textTracks[i].mode = 'hidden';
        }
      }
      
      setSubtitleTrack(url);
      setSelectedSubtitle(subtitle);
      setShowSubtitleMenu(false);
      
      // Wait for track to be added and enable it
      setTimeout(() => {
        const video = videoRef.current;
        if (video && video.textTracks.length > 0) {
          // Find the subtitle track and enable it
          for (let i = 0; i < video.textTracks.length; i++) {
            const track = video.textTracks[i];
            if (track.kind === 'subtitles') {
              track.mode = 'showing';
              
              // Add event listener to check when cues are loaded
              if (track.cues && track.cues.length > 0) {
                console.log('[Subtitles] Text track enabled:', track.mode, 'cues:', track.cues.length);
                toast.success(`Subtitle loaded: ${subtitle.languageName}`)
              } else {
                // Wait for cues to load
                track.addEventListener('load', () => {
                  console.log('[Subtitles] Cues loaded:', track.cues?.length);
                  toast.success(`Subtitle loaded: ${subtitle.languageName}`);
                });
                track.addEventListener('error', (e) => {
                  console.error('[Subtitles] Track load error:', e);
                  toast.error('Failed to load subtitle track');
                });
              }
              break;
            }
          }
        }
      }, 300);
      
      console.log('[Subtitles] Loaded:', subtitle.fileName);
    } catch (error: any) {
      // Handle 406 (Not Acceptable) silently - usually quota/limit issues
      if (error.message?.includes('406')) {
        console.log('[Subtitles] Subtitle not available (406)');
        toast('Subtitles could not be loaded at this time', {
          icon: 'ℹ️',
        });
      } else {
        console.error('[Subtitles] Download error:', error);
        toast.error('Failed to load subtitle');
      }
    }
  };

  const disableSubtitles = () => {
    // Disable text track
    const video = videoRef.current;
    if (video && video.textTracks.length > 0) {
      const track = video.textTracks[0];
      track.mode = 'hidden';
      console.log('[Subtitles] Text track disabled');
    }
    
    if (subtitleTrack) {
      URL.revokeObjectURL(subtitleTrack);
    }
    setSubtitleTrack(null);
    setSelectedSubtitle(null);
    setShowSubtitleMenu(false);
    toast.success('Subtitles disabled');
  };

  // Progress tracking functions
  const saveWatchProgress = async (position: number, totalDuration: number) => {
    if (!contentId) {
      console.warn('[Progress] ⚠️ No contentId, skipping save');
      return;
    }
    
    if (!contentId) {
      console.warn('[Progress] ⏭️ No contentId, skipping save');
      return;
    }
    
    if (!totalDuration || totalDuration <= 0) {
      console.warn('[Progress] ⚠️ Invalid duration:', totalDuration, 'skipping save');
      return;
    }
    
    if (position < 0) {
      console.warn('[Progress] ⚠️ Negative position:', position, 'skipping save');
      return;
    }
    
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
      const payload = {
        contentId,
        contentType: contentType || 'movie',
        contentName: title ? decodeURIComponent(title) : undefined,
        contentPoster: posterUrlRef.current || undefined,
        seriesId: seriesId || undefined,
        seasonNumber: seasonNumber || undefined,
        episodeNumber: episodeNumber || undefined,
        currentPosition: Math.floor(position),
        duration: Math.floor(totalDuration),
      };
      
      console.log('[Progress] 💾 Saving progress:', payload, 'to', `${apiUrl}/progress`);
      
      const response = await fetch(`${apiUrl}/progress`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authService.getAuthHeader(),
        },
        body: JSON.stringify(payload),
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('[Progress] ✅ Save successful:', data);
      } else {
        console.error('[Progress] ❌ Save failed:', response.status, await response.text());
      }
    } catch (error) {
      console.error('[Progress] Failed to save:', error);
    }
  };

  const handleBack = async () => {
    console.log('[Progress] 🔙 Back button clicked, saving progress...');
    
    const video = videoRef.current;
    if (video && contentId && durationRef.current > 0) {
      const currentPosition = video.currentTime;
      console.log('[Progress] 📍 Position at back:', currentPosition, '/', durationRef.current);
      // Wait for progress to save before navigating
      await saveWatchProgress(currentPosition, durationRef.current);
      // Small delay to ensure the request completes
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    router.back();
  };

  const saveToWatchHistory = async () => {
    if (!contentId || !title) return;
    
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
      const payload: any = {
        contentType: contentType || 'movie',
        contentId,
        contentName: title,
      };
      
      // Add series-specific data for episodes
      if (contentType === 'episode' && seriesId) {
        payload.seriesId = seriesId;
        payload.seasonNumber = seasonNumber ? parseInt(seasonNumber) : undefined;
        payload.episodeNumber = episodeNumber ? parseInt(episodeNumber) : undefined;
      }
      
      await fetch(`${apiUrl}/watch-history`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authService.getAuthHeader(),
        },
        body: JSON.stringify(payload),
      });
      console.log('[History] Saved:', title);
    } catch (error) {
      console.error('[History] Failed to save:', error);
    }
  };

  // Load episode playlist for series
  useEffect(() => {
    if (isSeries) {
      const playlistData = sessionStorage.getItem('episode_playlist');
      if (playlistData) {
        setEpisodePlaylist(JSON.parse(playlistData));
      }
    }
  }, [isSeries]);

  // Fetch poster if not provided in URL params
  useEffect(() => {
    const fetchPoster = async () => {
      if (posterUrlRef.current || !contentId || contentType === 'episode') {
        // Already have poster, or no contentId, or is episode (episodes use series poster)
        return;
      }

      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
        console.log('[Poster] Fetching poster for contentId:', contentId);
        
        // Fetch movie info from stalker-proxy
        const response = await fetch(`${apiUrl}/stalker-proxy/vod-info/${contentId}`, {
          headers: authService.getAuthHeader(),
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.info) {
            const movieInfo = data.info;
            
            // Try TMDB first if we have TMDB data in the response
            if (data.tmdb?.poster_path) {
              const tmdbPoster = `https://image.tmdb.org/t/p/w500${data.tmdb.poster_path}`;
              posterUrlRef.current = tmdbPoster;
              console.log('[Poster] ✅ Using TMDB poster:', tmdbPoster);
            }
            // Fall back to provider poster
            else if (movieInfo.cover_big) {
              // Get provider URL from localStorage cache
              const PROVIDER_URL_KEY = 'stalker_provider_url';
              const cachedProviderUrl = localStorage.getItem(PROVIDER_URL_KEY);
              
              if (cachedProviderUrl) {
                const providerPoster = `${cachedProviderUrl}${movieInfo.cover_big}`;
                posterUrlRef.current = providerPoster;
                console.log('[Poster] ✅ Using provider poster:', providerPoster);
              }
            }
          }
        }
      } catch (error) {
        console.error('[Poster] Failed to fetch:', error);
      }
    };

    fetchPoster();
  }, [contentId, contentType]);

  // Load watch progress on mount
  useEffect(() => {
    const loadProgress = async () => {
      if (!contentId) {
        console.log('[Progress] No contentId, skipping progress load');
        setProgressLoaded(true);
        return;
      }

      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
        console.log('[Progress] 📥 Loading progress for:', contentId);
        
        const response = await fetch(`${apiUrl}/progress/${contentId}`, {
          headers: authService.getAuthHeader(),
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.progress) {
            const position = data.progress.current_position;
            const percentage = (position / data.progress.duration) * 100;
            console.log(`[Progress] ✅ Found saved position: ${position}s (${percentage.toFixed(1)}%)`);
            
            // Only resume if not near the end (< 95% watched)
            if (position > 0 && position < data.progress.duration * 0.95) {
              setSavedPosition(position);
              console.log('[Progress] Will resume from:', position);
            } else {
              console.log('[Progress] Skipping resume (video completed or at start)');
              setSavedPosition(0);
            }
          } else {
            console.log('[Progress] No saved progress found');
            setSavedPosition(0);
          }
        } else {
          console.log('[Progress] API returned:', response.status);
          setSavedPosition(0);
        }
      } catch (error) {
        console.error('[Progress] Failed to load:', error);
        setSavedPosition(0);
      } finally {
        setProgressLoaded(true);
      }
    };

    loadProgress();
  }, [contentId]);

  // Initialize HLS.js for HLS streams
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl || !progressLoaded) return;

    const videoUrl = decodeURIComponent(streamUrl);
    const isHLS = videoUrl.includes('.m3u8');
    
    console.log('[HLS] Video source:', videoUrl.substring(0, 100), 'isHLS:', isHLS);

    // CHECK: If running in mobile app, delegate to native player with loaded progress
    if (isMobileApp()) {
      console.log('[VOD Mobile] Opening native player with savedPosition:', savedPosition);
      playVideoNative('vod', {
        url: videoUrl,
        title: title || 'Video',
        contentId: contentId || '',
        contentType: contentType,
        savedPosition: savedPosition,
        subtitles: availableSubtitles,
        selectedSubtitle: selectedSubtitle,
        isSeries: isSeries,
        seriesId: seriesId,
        seasonNumber: seasonNumber,
        episodeNumber: episodeNumber,
        imdbId: imdbId,
        poster: poster || undefined,
      });
      return; // Don't initialize HLS.js - native player will handle it
    }

    // Clean up existing HLS instance
    if (hlsRef.current) {
      console.log('[HLS] Destroying existing instance');
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (isHLS && Hls.isSupported()) {
      console.log('[HLS] Initializing hls.js');
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
      });

      hls.loadSource(videoUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log('[HLS] Manifest parsed, ready to play');
        if (savedPosition > 0) {
          console.log('[HLS] Restoring position:', savedPosition);
          video.currentTime = savedPosition;
          setSavedPosition(0);
        }
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('[HLS] Error:', data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.log('[HLS] Fatal network error, trying to recover');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log('[HLS] Fatal media error, trying to recover');
              hls.recoverMediaError();
              break;
            default:
              console.log('[HLS] Fatal error, destroying');
              hls.destroy();
              setError('Failed to load video stream');
              break;
          }
        }
      });

      hlsRef.current = hls;
    } else if (isHLS && video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS support
      console.log('[HLS] Using native HLS support (Safari)');
      video.src = videoUrl;
    } else {
      // Regular video file
      console.log('[HLS] Using regular video source');
      video.src = videoUrl;
    }

    // Detect video aspect ratio when metadata loads
    const handleLoadedMetadata = () => {
      const aspectRatio = video.videoWidth / video.videoHeight;
      console.log('[Video] Detected aspect ratio:', aspectRatio, `(${video.videoWidth}x${video.videoHeight})`);
      setVideoAspectRatio(aspectRatio);
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      if (hlsRef.current) {
        console.log('[HLS] Cleanup - destroying instance');
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [streamUrl, savedPosition, progressLoaded]);



  // Load subtitles when player mounts
  useEffect(() => {
    const loadSubtitles = async () => {
      if (!title) return;

      try {
        setLoadingSubtitles(true);
        
        // Try to get IMDb ID from URL params first, then fall back to session storage
        const imdbId = searchParams.get('imdbId') || sessionStorage.getItem('current_imdb_id');
        
        if (!imdbId) {
          console.log('[Subtitles] No IMDb ID available');
          return;
        }
        
        console.log('[Subtitles] Searching by IMDb ID:', imdbId, '(source:', searchParams.get('imdbId') ? 'URL' : 'sessionStorage', ')');
        console.log('[Subtitles] Content info - isSeries:', isSeries, 'Season:', seasonNumber, 'Episode:', episodeNumber);
        
        // Build API URL with optional season/episode for TV series
        let apiUrl = `/api/subtitles?action=search&imdbId=${imdbId}&languages=en,es,fr`;
        if (isSeries && seasonNumber) {
          apiUrl += `&seasonNumber=${seasonNumber}`;
          if (episodeNumber) {
            apiUrl += `&episodeNumber=${episodeNumber}`;
          }
          console.log('[Subtitles] Searching for TV episode S' + seasonNumber + 'E' + episodeNumber);
        }
        
        console.log('[Subtitles] API URL:', apiUrl);
        
        // Call our API route with caching
        const data = await apiCache.fetch(apiUrl);
        const subtitles: Subtitle[] = data.subtitles || [];
        
        console.log('[Subtitles] Found', subtitles.length, 'subtitles');
        setAvailableSubtitles(subtitles);
      } catch (error) {
        console.error('[Subtitles] Error loading:', error);
      } finally {
        setLoadingSubtitles(false);
      }
    };

    loadSubtitles();
  }, [title, imdbId, isSeries, seasonNumber, episodeNumber]);

  // Load saved progress and start periodic saving
  useEffect(() => {
    if (!contentId || !videoRef.current) return;

    // Load saved progress on mount
    const loadProgress = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
        console.log('[Progress] 📥 Loading progress for contentId:', contentId);
        
        const response = await fetch(`${apiUrl}/progress/${contentId}`, {
          headers: authService.getAuthHeader(),
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log('[Progress] 📊 Loaded data:', data);
          
          if (data.success && data.progress && videoRef.current) {
            const position = data.progress.current_position;
            const percentage = (position / data.progress.duration) * 100;
            console.log(`[Progress] Found saved position: ${position}s (${percentage.toFixed(1)}%)`);
            
            // Only resume if not near the end (< 95% watched)
            if (position > 0 && position < data.progress.duration * 0.95) {
              videoRef.current.currentTime = position;
              console.log('[Progress] ▶️ Resumed playback from:', position);
            } else {
              console.log('[Progress] ⏭️ Skipping resume (video completed or at start)');
            }
          } else {
            console.log('[Progress] No saved progress found');
          }
        } else {
          console.error('[Progress] ❌ Load failed:', response.status, await response.text());
        }
      } catch (error) {
        console.error('[Progress] Failed to load:', error);
      }
    };

    loadProgress();

    // Save progress every 10 seconds while playing
    console.log('[Progress] ⏰ Starting auto-save timer (every 10s)');
    progressSaveIntervalRef.current = setInterval(() => {
      if (videoRef.current && isPlaying && durationRef.current > 0) {
        const currentPos = videoRef.current.currentTime;
        // Only save if position changed significantly (> 5 seconds)
        if (Math.abs(currentPos - lastProgressSaveRef.current) > 5) {
          console.log('[Progress] ⏱️ Auto-save triggered (interval)');
          saveWatchProgress(currentPos, durationRef.current);
          lastProgressSaveRef.current = currentPos;
        }
      }
    }, 10000); // Every 10 seconds

    return () => {
      console.log('[Progress] 🔚 Component unmounting - saving final progress');
      isMountedRef.current = false;
      if (progressSaveIntervalRef.current) {
        clearInterval(progressSaveIntervalRef.current);
      }
      // Save final progress on unmount - use ref to ensure duration is available
      if (videoRef.current && durationRef.current > 0) {
        const finalPosition = videoRef.current.currentTime;
        console.log('[Progress] 💾 Unmount save at position:', finalPosition, '/ duration:', durationRef.current);
        saveWatchProgress(finalPosition, durationRef.current);
      } else {
        console.warn('[Progress] ⚠️ Cannot save on unmount - videoRef:', !!videoRef.current, 'duration:', durationRef.current);
      }
    };
  }, [contentId, isPlaying, duration]);

  useEffect(() => {
    if (!streamUrl) {
      setError('No stream URL provided');
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    // Event listeners
    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleDurationChange = () => {
      const dur = video.duration;
      setDuration(dur);
      durationRef.current = dur;
      console.log('[Progress] 📏 Duration loaded:', dur);
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleVolumeChange = () => {
      setVolume(video.volume);
      setIsMuted(video.muted);
    };
    const handleWaiting = () => setIsBuffering(true);
    const handleCanPlay = () => {
      setIsBuffering(false);
      
      // Restore saved position after quality change
      if (savedPosition > 0 && video.currentTime === 0) {
        console.log('[Player] Restoring position:', savedPosition);
        video.currentTime = savedPosition;
        setSavedPosition(0);
      }
    };
    const handleError = (e: Event) => {
      const video = e.target as HTMLVideoElement;
      const error = video.error;
      console.error('[Video Error]', {
        code: error?.code,
        message: error?.message,
        src: video.src,
        networkState: video.networkState,
        readyState: video.readyState
      });
      
      setError('Failed to load video stream');
    };
    const handleEnded = async () => {
      // Save to watch history when video completes
      await saveToWatchHistory();
      
      // Save final progress (100% watched)
      if (durationRef.current > 0) {
        await saveWatchProgress(durationRef.current, durationRef.current);
      }
      
      // Auto-play next episode when current ends
      if (isSeries && episodePlaylist) {
        playNextEpisode();
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('volumechange', handleVolumeChange);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('error', handleError);
    video.addEventListener('ended', handleEnded);

    // Fullscreen change
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('volumechange', handleVolumeChange);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('error', handleError);
      video.removeEventListener('ended', handleEnded);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [streamUrl, isSeries, episodePlaylist]);

  // Auto-hide controls
  useEffect(() => {
    if (!showControls) return;

    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }

    // Don't hide controls if subtitle menu is open
    if (showSubtitleMenu) return;

    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, 3000);

    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [showControls, isPlaying, showSubtitleMenu]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          handleSeek(-10);
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleSeek(10);
          break;
        case ' ':
          e.preventDefault();
          togglePlayPause();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [duration]);

  const handleMouseMove = () => {
    setShowControls(true);
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const clickX = e.clientX - rect.left;
    const containerWidth = rect.width;
    
    // Left third for backward, right third for forward
    if (clickX < containerWidth / 3) {
      handleSeek(-10);
    } else if (clickX > (containerWidth * 2) / 3) {
      handleSeek(10);
    }
  };

  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          // Ignore AbortError when component unmounts
          if (error.name !== 'AbortError') {
            console.error('[Player] Play error:', error);
          }
        });
      }
    }
  };

  const handleSeek = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.currentTime + seconds, duration));
    
    // Show feedback animation
    setShowSeekFeedback(seconds > 0 ? 'forward' : 'backward');
    if (seekFeedbackTimeoutRef.current) {
      clearTimeout(seekFeedbackTimeoutRef.current);
    }
    seekFeedbackTimeoutRef.current = setTimeout(() => {
      setShowSeekFeedback(null);
    }, 500);
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    video.currentTime = pos * duration;
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;

    const newVolume = parseFloat(e.target.value);
    video.volume = newVolume;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const toggleFullscreen = async () => {
    const container = containerRef.current;
    if (!container) return;

    try {
      if (!isFullscreen) {
        await container.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.error('Fullscreen error:', error);
    }
  };

  const playNextEpisode = async () => {
    if (!episodePlaylist || isLoadingNext) return;
    const { episodes, currentIndex, seasonId, seriesId, seriesName } = episodePlaylist;
    const nextIndex = currentIndex + 1;
    
    if (nextIndex >= episodes.length) {
      toast.error('No more episodes');
      return;
    }
    
    await playEpisodeAtIndex(nextIndex);
  };

  const playPreviousEpisode = async () => {
    if (!episodePlaylist || isLoadingNext) return;
    const { episodes, currentIndex } = episodePlaylist;
    const prevIndex = currentIndex - 1;
    
    if (prevIndex < 0) {
      toast.error('This is the first episode');
      return;
    }
    
    await playEpisodeAtIndex(prevIndex);
  };

  const playEpisodeAtIndex = async (index: number) => {
    if (!episodePlaylist) return;
    const { episodes, seasonId, seriesId, seriesName } = episodePlaylist;
    const episode = episodes[index];
    
    setIsLoadingNext(true);
    try {
      const token = authService.getToken();
      
      // Use cache for episode info
      const episodeCacheKey = `episode-info:${seriesId}:${seasonId}:${episode.id}`;
      const infoData = await cache.getOrFetch(
        episodeCacheKey,
        async () => {
          const response = await fetch(
            `${API_URL}/stalker-proxy/episode-info/${seriesId}/${seasonId}/${episode.id}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          return response.json();
        },
        10 * 60 * 1000 // 10 minutes TTL
      );
      
      if (!infoData.success || !infoData.info) {
        toast.error('Failed to load episode');
        return;
      }

      const fileId = infoData.info.id;
      const cmd = `/media/file_${fileId}.mpg`;
      
      // Create stream link (don't cache this as it may expire)
      const linkResponse = await fetch(`${API_URL}/stalker-proxy/create-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          cmd,
          forced_storage: 'undefined',
          disable_ad: '0',
          download: '0',
        }),
      });

      const linkData = await linkResponse.json();
      
      if (linkData.success && linkData.link && linkData.link.cmd) {
        const streamUrl = encodeURIComponent(linkData.link.cmd);
        const title = encodeURIComponent(`${seriesName} - ${episode.name}`);
        
        // Get season info for proper tracking
        const seasonData = episodePlaylist.seasonId; // This should contain season info
        
        // Update playlist with new index
        const updatedPlaylist = {
          ...episodePlaylist,
          currentIndex: index,
          currentEpisode: episode
        };
        sessionStorage.setItem('episode_playlist', JSON.stringify(updatedPlaylist));
        
        // Update state immediately before navigation
        setEpisodePlaylist(updatedPlaylist);
        
        // Reset subtitles when switching episodes
        setSelectedSubtitle(null);
        setAvailableSubtitles([]);
        
        // Include contentId and tracking params for next episode
        // Use index + 1 as fallback if episode_num is not available
        const episodeNumber = episode.episode_num || (index + 1);
        router.replace(`/player/vod?url=${streamUrl}&title=${title}&isSeries=true&contentId=${episode.id}&contentType=episode&seriesId=${seriesId}&seasonNumber=${episode.season || 1}&episodeNumber=${episodeNumber}`);
      }
    } catch (error) {
      console.error('Failed to load episode:', error);
      toast.error('Failed to load episode');
    } finally {
      setIsLoadingNext(false);
    }
  };

  const formatTime = (seconds: number): string => {
    if (isNaN(seconds)) return '0:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <p className="text-white text-xl mb-4">{error}</p>
          <button
            onClick={handleBack}
            className="bg-yellow-500 hover:bg-yellow-600 text-black px-6 py-3 rounded-lg font-semibold"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!streamUrl) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-screen bg-black"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden'
      }}
      onMouseMove={handleMouseMove}
      onClick={(e) => {
        // Show controls on click, but don't toggle play/pause
        const target = e.target as HTMLElement;
        // Ignore clicks on control elements
        if (!target.closest('[data-controls]')) {
          handleMouseMove();
        }
      }}
      onTouchStart={(e) => {
        handleMouseMove();
        setIsDraggingProgress(false);
      }}
      onTouchEnd={(e) => {
        // Just show controls on touch, don't toggle play/pause
        if (!isDraggingProgress) {
          const target = e.target as HTMLElement;
          // Only show controls if not tapping on a control element
          if (!target.closest('[data-controls]')) {
            handleMouseMove();
          }
        }
        setIsDraggingProgress(false);
      }}
      onTouchMove={(e) => {
        // Only prevent scrolling if not interacting with controls
        const target = e.target as HTMLElement;
        const isControl = target.closest('[data-controls]');
        if (!isControl) {
          e.preventDefault();
        }
      }}
    >
      {/* Subtitle styling */}
      <style jsx global>{`
        video::cue {
          font-size: 1.3rem;
          font-weight: 700;
          line-height: 1.4;
          background-color: rgba(0, 0, 0, 0.85);
          color: white;
          padding: 0.3em 0.6em;
          text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.9);
        }
        
        /* Position subtitles based on aspect ratio */
        video {
          ${videoAspectRatio > 2 ? `
            /* Ultra-wide video (e.g., 21:9, 2.39:1) - position higher */
            --subtitle-bottom: 20%;
          ` : videoAspectRatio > 1.85 ? `
            /* Wide video (e.g., 2.35:1, 2.4:1) - position higher */
            --subtitle-bottom: 18%;
          ` : videoAspectRatio < 1.5 ? `
            /* Narrow video (e.g., 4:3, 1.33:1) - position lower */
            --subtitle-bottom: 12%;
          ` : `
            /* Standard widescreen (e.g., 16:9, 1.78:1) - default position */
            --subtitle-bottom: 15%;
          `}
        }
        
        video::cue {
          position: relative;
          bottom: var(--subtitle-bottom, 8%);
        }
        
        @media (max-width: 768px) {
          video::cue {
            font-size: 1.1rem;
          }
        }
      `}</style>

      {/* Video Element */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        style={{ 
          pointerEvents: 'auto'
        }}
        autoPlay
        crossOrigin="anonymous"
        playsInline
        disablePictureInPicture
      >
        {/* Subtitle track */}
        {subtitleTrack && (
          <track
            kind="subtitles"
            src={subtitleTrack}
            srcLang={selectedSubtitle?.language || 'en'}
            label={selectedSubtitle?.languageName || 'English'}
            default
          />
        )}
      </video>

      {/* Buffering Indicator */}
      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Loader className="w-16 h-16 text-white animate-spin" />
        </div>
      )}

      {/* Seek Feedback Animation */}
      {showSeekFeedback && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-black/70 rounded-full p-6 animate-pulse">
            <span className="material-symbols-outlined text-white text-6xl">
              {showSeekFeedback === 'forward' ? 'forward_10' : 'replay_10'}
            </span>
          </div>
        </div>
      )}

      {/* On-Screen Playback Controls */}
      {showControls && !isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center gap-12 pointer-events-none" data-controls="true">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleSeek(-10);
            }}
            className="pointer-events-auto bg-black/50 hover:bg-black/70 rounded-full p-6 transition-all transform hover:scale-110"
            title="Rewind 10s"
          >
            <span className="material-symbols-outlined text-white text-5xl">
              replay_10
            </span>
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              togglePlayPause();
            }}
            className="pointer-events-auto bg-black/50 hover:bg-black/70 rounded-full p-6 transition-all transform hover:scale-110"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause size={64} className="text-white" />
            ) : (
              <Play size={64} className="text-white" fill="white" />
            )}
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              handleSeek(10);
            }}
            className="pointer-events-auto bg-black/50 hover:bg-black/70 rounded-full p-6 transition-all transform hover:scale-110"
            title="Forward 10s"
          >
            <span className="material-symbols-outlined text-white text-5xl">
              forward_10
            </span>
          </button>
        </div>
      )}



      {/* Top Bar */}
      <div
        data-controls="true"
        className={`absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent p-4 sm:p-6 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          pointerEvents: showControls ? 'auto' : 'none'
        }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          <button
            onClick={handleBack}
            className="flex items-center gap-1 sm:gap-2 text-white hover:text-yellow-500 transition-colors flex-shrink-0"
          >
            <ArrowLeft size={20} className="sm:w-6 sm:h-6" />
            <span className="text-sm sm:text-lg font-semibold">Back</span>
          </button>
          {title && (
            <div className="flex-1 text-center px-2">
              <h1 className="text-white text-sm sm:text-xl font-semibold truncate">{decodeURIComponent(title)}</h1>
            </div>
          )}
          <div className="w-12 sm:w-20 flex-shrink-0" /> {/* Spacer for centering */}
        </div>
      </div>

      {/* Bottom Controls */}
      <div
        data-controls="true"
        className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-4 sm:px-6 pt-6 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          pointerEvents: showControls ? 'auto' : 'none',
          paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))'
        }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        {/* Progress Bar */}
        <div
          className="w-full bg-gray-600 rounded-full mb-4 cursor-pointer group relative"
          onClick={(e) => {
            e.stopPropagation();
            handleProgressClick(e);
          }}
          onTouchStart={(e) => {
            e.stopPropagation();
            setIsDraggingProgress(true);
            const touch = e.touches[0];
            const rect = e.currentTarget.getBoundingClientRect();
            const pos = (touch.clientX - rect.left) / rect.width;
            if (videoRef.current) {
              videoRef.current.currentTime = pos * duration;
            }
          }}
          onTouchMove={(e) => {
            e.stopPropagation();
            setIsDraggingProgress(true);
            const touch = e.touches[0];
            const rect = e.currentTarget.getBoundingClientRect();
            const pos = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
            if (videoRef.current) {
              videoRef.current.currentTime = pos * duration;
            }
          }}
          onTouchEnd={(e) => {
            e.stopPropagation();
          }}
          style={{ height: '8px' }}
        >
          <div
            className="bg-yellow-500 rounded-full relative"
            style={{ width: `${(currentTime / duration) * 100}%`, height: '8px' }}
          >
            {/* Always visible draggable handle on touch devices */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-3 sm:h-3 bg-yellow-500 rounded-full border-2 border-white shadow-lg sm:opacity-0 sm:group-hover:opacity-100 transition-opacity" />
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          {/* Left Controls */}
          <div className="flex items-center gap-4">
            <button
              onClick={togglePlayPause}
              className="text-white hover:text-yellow-500 transition-colors"
            >
              {isPlaying ? <Pause size={32} /> : <Play size={32} fill="white" />}
            </button>

            {/* Episode Navigation for Series */}
            {isSeries && episodePlaylist && (
              <>
                {episodePlaylist.currentIndex > 0 && (
                  <button
                    onClick={playPreviousEpisode}
                    disabled={isLoadingNext}
                    className="text-white hover:text-yellow-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Previous Episode"
                  >
                    <SkipBack size={28} />
                  </button>
                )}
                
                <button
                  onClick={playNextEpisode}
                  disabled={isLoadingNext || episodePlaylist.currentIndex >= episodePlaylist.episodes.length - 1}
                  className="text-white hover:text-yellow-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Next Episode"
                >
                  <SkipForward size={28} />
                </button>
              </>
            )}

            <div className="flex items-center gap-2 group">
              <button
                onClick={toggleMute}
                className="text-white hover:text-yellow-500 transition-colors"
              >
                {isMuted || volume === 0 ? <VolumeX size={28} /> : <Volume2 size={28} />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-0 group-hover:w-24 transition-all opacity-0 group-hover:opacity-100"
              />
            </div>

            <span className="text-white text-sm font-medium">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-4">
            {/* Subtitle Menu */}
            <div className="relative flex items-center">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSubtitleMenu(!showSubtitleMenu);
                }}
                onMouseEnter={() => setShowSubtitleMenu(true)}
                className={`flex items-center justify-center transition-colors ${selectedSubtitle && subtitleTrack ? 'text-yellow-500 hover:text-yellow-400' : 'text-white hover:text-yellow-500'}`}
                title="Subtitles"
              >
                <Subtitles size={28} strokeWidth={2} />
              </button>

              {/* Subtitle Selection Menu */}
              {showSubtitleMenu && (
                <div 
                  className="absolute bottom-full right-0 mb-2 bg-black/95 rounded-lg shadow-xl border border-gray-700 w-[280px] max-h-[400px] overflow-hidden flex flex-col"
                  onMouseEnter={() => setShowSubtitleMenu(true)}
                  onMouseLeave={() => setShowSubtitleMenu(false)}
                >
                  <div className="p-2 border-b border-gray-700">
                    <div className="text-xs text-gray-400 px-1 mb-2 font-semibold uppercase">
                      Subtitles {loadingSubtitles && '(Loading...)'}
                    </div>
                    
                    {/* Search Input */}
                    <input
                      type="text"
                      placeholder="Search..."
                      value={subtitleSearch}
                      onChange={(e) => setSubtitleSearch(e.target.value)}
                      className="w-full px-2 py-1.5 bg-gray-800 text-white text-sm rounded border border-gray-600 focus:border-yellow-500 focus:outline-none"
                    />
                  </div>
                  
                  <div className="overflow-y-auto flex-1 p-1">
                    {/* Off option */}
                    <button
                      onClick={disableSubtitles}
                      className={`w-full text-left px-2 py-1.5 rounded text-sm hover:bg-gray-800 transition-colors ${
                        !selectedSubtitle ? 'bg-yellow-500/20 text-yellow-500' : 'text-white'
                      }`}
                    >
                      Off
                    </button>
                    
                    {/* Upload custom subtitle */}
                    <div className="w-full">
                      <input
                        ref={(el) => {
                          fileInputRef.current = el;
                          if (el && !el.dataset.listenerAdded) {
                            console.log('[Upload] Setting up native event listener');
                            el.dataset.listenerAdded = 'true';
                            el.addEventListener('change', (e) => {
                              console.log('[Upload] Native change event fired');
                              const target = e.target as HTMLInputElement;
                              const file = target.files?.[0];
                              console.log('[Upload] Selected file:', file?.name, file?.type, file?.size);
                              
                              if (file) {
                                const reader = new FileReader();
                                reader.onload = (event) => {
                                  try {
                                    console.log('[Upload] File read complete');
                                    const content = event.target?.result as string;
                                    console.log('[Upload] Content length:', content?.length, 'First 100 chars:', content?.substring(0, 100));
                                    let vttContent = content;
                                    
                                    // Convert SRT to VTT if needed
                                    if (file.name.endsWith('.srt')) {
                                      console.log('[Upload] Converting SRT to VTT');
                                      // Remove sequence numbers and convert time format
                                      const lines = content.replace(/\r\n/g, '\n').split('\n');
                                      const vttLines = ['WEBVTT', ''];
                                      
                                      for (let i = 0; i < lines.length; i++) {
                                        const line = lines[i].trim();
                                        
                                        // Skip sequence numbers (standalone numbers)
                                        if (/^\d+$/.test(line)) {
                                          continue;
                                        }
                                        
                                        // Convert SRT timestamp to VTT (comma to dot)
                                        if (line.includes('-->')) {
                                          vttLines.push(line.replace(/,/g, '.'));
                                        } else if (line) {
                                          vttLines.push(line);
                                        } else {
                                          vttLines.push('');
                                        }
                                      }
                                      
                                      vttContent = vttLines.join('\n');
                                      console.log('[Upload] VTT content created, length:', vttContent.length);
                                    } else if (!content.trim().startsWith('WEBVTT')) {
                                      console.log('[Upload] Adding WEBVTT header');
                                      vttContent = 'WEBVTT\n\n' + content;
                                    }
                                    
                                    console.log('[Upload] Creating blob and URL');
                                    const blob = new Blob([vttContent], { type: 'text/vtt' });
                                    const url = URL.createObjectURL(blob);
                                    console.log('[Upload] Blob URL created:', url);
                                    
                                    const customSubtitle: Subtitle = {
                                      id: `custom-${Date.now()}`,
                                      language: 'custom',
                                      languageName: 'Custom Upload',
                                      fileName: file.name,
                                      downloadCount: 0,
                                      rating: 0,
                                      uploader: 'You',
                                      fileId: 0,
                                      isCustom: true,
                                      customUrl: url
                                    };
                                    
                                    console.log('[Upload] Custom subtitle object:', customSubtitle);
                                    
                                    // Add to available subtitles list
                                    setAvailableSubtitles(prev => {
                                      console.log('[Upload] Previous subtitles:', prev.length);
                                      const updated = [customSubtitle, ...prev];
                                      console.log('[Upload] Updated subtitles:', updated.length);
                                      return updated;
                                    });
                                    
                                    console.log('[Upload] Calling selectSubtitle');
                                    selectSubtitle(customSubtitle);
                                    toast.success('Subtitle uploaded successfully');
                                  } catch (error) {
                                    console.error('[Upload] Error processing subtitle:', error);
                                    toast.error('Failed to process subtitle file');
                                  }
                                };
                                reader.onerror = (error) => {
                                  console.error('[Upload] Failed to read file:', error);
                                  toast.error('Failed to read subtitle file');
                                };
                                console.log('[Upload] Starting to read file as text');
                                reader.readAsText(file);
                              } else {
                                console.log('[Upload] No file selected');
                              }
                              target.value = ''; // Reset input
                            });
                          }
                        }}
                        type="file"
                        accept=".srt,.vtt"
                        style={{ display: 'none' }}
                      />
                      <button
                        onClick={() => {
                          console.log('[Upload] Button clicked');
                          if (fileInputRef.current) {
                            console.log('[Upload] Triggering file input click');
                            fileInputRef.current.click();
                          } else {
                            console.error('[Upload] File input ref is null');
                          }
                        }}
                        className="w-full text-left px-2 py-1.5 rounded text-sm hover:bg-gray-800 transition-colors text-white cursor-pointer flex items-center gap-2"
                      >
                        <span>📤</span>
                        <span>Upload Subtitle</span>
                      </button>
                    </div>

                    {/* Available subtitles */}
                    {availableSubtitles.length === 0 && !loadingSubtitles ? (
                      <div className="px-2 py-2 text-xs text-gray-500">
                        No subtitles available
                      </div>
                    ) : (
                      availableSubtitles
                        .filter((subtitle) => {
                          if (!subtitleSearch) return true;
                          const search = subtitleSearch.toLowerCase();
                          return (
                            subtitle.languageName.toLowerCase().includes(search) ||
                            subtitle.fileName.toLowerCase().includes(search) ||
                            subtitle.releaseInfo?.toLowerCase().includes(search)
                          );
                        })
                        .map((subtitle) => (
                          <button
                            key={subtitle.id}
                            onClick={() => selectSubtitle(subtitle)}
                            className={`w-full text-left px-2 py-1.5 rounded hover:bg-gray-800 transition-colors ${
                              selectedSubtitle?.id === subtitle.id ? 'bg-yellow-500/20 text-yellow-500' : 'text-white'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 mb-0.5">
                              <div className="text-xs font-medium">
                                {subtitle.isCustom && '📤 '}{subtitle.languageName}
                              </div>
                              {subtitle.episodeNumber && (
                                <div className="text-[10px] bg-gray-700 px-1.5 py-0.5 rounded">
                                  S{subtitle.seasonNumber}E{subtitle.episodeNumber}
                                </div>
                              )}
                            </div>
                            <div className="text-[10px] text-gray-400 truncate">{subtitle.fileName}</div>
                          </button>
                        ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={toggleFullscreen}
              className="flex items-center justify-center text-white hover:text-yellow-500 transition-colors"
            >
              <Maximize size={28} strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VODPlayerPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader className="w-12 h-12 text-yellow-500 animate-spin" />
      </div>
    }>
      <VODPlayerContent />
    </Suspense>
  );
}
