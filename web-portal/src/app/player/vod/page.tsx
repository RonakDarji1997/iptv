'use client';

import { useEffect, useState, useRef, Suspense, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Play, Pause, Volume2, VolumeX, Maximize, Rewind, FastForward, Loader, SkipBack, SkipForward, Subtitles, Settings } from 'lucide-react';
import toast from 'react-hot-toast';
import { authService } from '@/services/authService';
import { cache } from '@/utils/cache';
import { apiCache } from '@/utils/api-cache';
import { API_URL } from '@/config/constants';
import { VideoStatsMonitor, VideoStats, getTranscodedUrl, formatBitrate, QUALITY_OPTIONS, QualityOption } from '@/utils/videoStats';

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
}

function VODPlayerContent({ searchParams }: { 
  searchParams: Promise<{ 
    url?: string; 
    title?: string; 
    isSeries?: string; 
    contentId?: string; 
    contentType?: string; 
    seriesId?: string; 
    seasonNumber?: string; 
    episodeNumber?: string;
    poster?: string;
  }> 
}) {
  const router = useRouter();
  const params = use(searchParams);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  
  const streamUrl = params.url;
  const title = params.title;
  const isSeries = params.isSeries === 'true';
  const contentId = params.contentId;
  const contentType = params.contentType; // 'movie' or 'episode'
  const seriesId = params.seriesId;
  const seasonNumber = params.seasonNumber;
  const episodeNumber = params.episodeNumber;

  console.log('[VODPlayer] URL Params:', {
    contentId,
    contentType,
    seriesId,
    seasonNumber,
    episodeNumber,
    isSeries
  });

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
  
  // Progress tracking
  const progressSaveIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const lastProgressSaveRef = useRef<number>(0);
  const durationRef = useRef<number>(0);
  
  // Subtitle state
  const [availableSubtitles, setAvailableSubtitles] = useState<Subtitle[]>([]);
  const [selectedSubtitle, setSelectedSubtitle] = useState<Subtitle | null>(null);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const [loadingSubtitles, setLoadingSubtitles] = useState(false);
  const [subtitleTrack, setSubtitleTrack] = useState<string | null>(null);
  const [videoStats, setVideoStats] = useState<VideoStats | null>(null);
  const statsMonitorRef = useRef<VideoStatsMonitor | null>(null);
  const [transcodeUrl, setTranscodeUrl] = useState<string | null>(null);
  const [selectedQuality, setSelectedQuality] = useState<QualityOption>('original');
  const [showQualityMenu, setShowQualityMenu] = useState(false);

  // Subtitle functions (defined before useEffect that uses them)
  const selectSubtitle = async (subtitle: Subtitle) => {
    try {
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
        contentPoster: params.poster || undefined,
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
      await saveWatchProgress(currentPosition, durationRef.current);
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

  // Load transcoded URL
  useEffect(() => {
    const loadTranscodeUrl = async () => {
      if (!streamUrl) return;
      
      const decoded = decodeURIComponent(streamUrl);
      const qualityConfig = QUALITY_OPTIONS.find(q => q.value === selectedQuality);
      
      if (!qualityConfig || selectedQuality === 'original') {
        setTranscodeUrl(decoded);
      } else if (qualityConfig.target && qualityConfig.mode) {
        const transcoded = await getTranscodedUrl(
          decoded,
          qualityConfig.target,
          qualityConfig.mode
        );
        setTranscodeUrl(transcoded);
      }
    };
    
    loadTranscodeUrl();
  }, [streamUrl, selectedQuality]);

  const handleQualityChange = (quality: QualityOption) => {
    setSelectedQuality(quality);
    setShowQualityMenu(false);
    // Reload will happen via useEffect above
  };

  // Load subtitles when player mounts
  useEffect(() => {
    const loadSubtitles = async () => {
      if (!title) return;

      try {
        setLoadingSubtitles(true);
        
        // Try to get IMDb ID from session storage (set from movie/series detail page)
        const imdbId = sessionStorage.getItem('current_imdb_id');
        
        if (!imdbId) {
          console.log('[Subtitles] No IMDb ID available');
          return;
        }
        
        console.log('[Subtitles] Searching by IMDb ID:', imdbId);
        
        // Call our API route with caching
        const data = await apiCache.fetch(`/api/subtitles?action=search&imdbId=${imdbId}&languages=en,es,fr`);
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
  }, [title]);

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
      
      // Start bitrate monitoring
      if (!statsMonitorRef.current) {
        statsMonitorRef.current = new VideoStatsMonitor(video);
        statsMonitorRef.current.start((stats) => {
          setVideoStats(stats);
        });
      }
    };
    const handleError = () => setError('Failed to load video stream');
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
      
      // Stop stats monitoring
      if (statsMonitorRef.current) {
        statsMonitorRef.current.stop();
        statsMonitorRef.current = null;
      }
    };
  }, [streamUrl, isSeries, episodePlaylist]);

  // Auto-hide controls
  useEffect(() => {
    if (!showControls) return;

    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }

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
  }, [showControls, isPlaying]);

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
      video.play();
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
        
        // Include contentId and tracking params for next episode
        router.replace(`/player/vod?url=${streamUrl}&title=${title}&isSeries=true&contentId=${episode.id}&contentType=episode&seriesId=${seriesId}&seasonNumber=${episode.season || 1}&episodeNumber=${episode.episode_num}`);
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
      className="relative w-full h-screen bg-black overflow-hidden"
      onMouseMove={handleMouseMove}
      onClick={togglePlayPause}
      onDoubleClick={handleDoubleClick}
    >
      {/* Subtitle styling */}
      <style jsx global>{`
        video::cue {
          font-size: 1.1rem;
          line-height: 1.3;
          background-color: rgba(0, 0, 0, 0.8);
          color: white;
          padding: 0.2em 0.5em;
        }
      `}</style>

      {/* Video Element */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        src={transcodeUrl || decodeURIComponent(streamUrl)}
        autoPlay
        crossOrigin="anonymous"
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
        <div className="absolute inset-0 flex items-center justify-center gap-12 pointer-events-none">
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
        className={`absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent p-4 sm:p-6 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={(e) => e.stopPropagation()}
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
              {videoStats && (
                <p className="text-gray-400 text-xs mt-1">
                  {videoStats.resolution} • {formatBitrate(videoStats.bitrate)}
                </p>
              )}
            </div>
          )}
          <div className="w-12 sm:w-20 flex-shrink-0" /> {/* Spacer for centering */}
        </div>
      </div>

      {/* Bottom Controls */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress Bar */}
        <div
          className="w-full h-1 bg-gray-600 rounded-full mb-4 cursor-pointer group"
          onClick={handleProgressClick}
        >
          <div
            className="h-full bg-yellow-500 rounded-full relative group-hover:h-1.5 transition-all"
            style={{ width: `${(currentTime / duration) * 100}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-yellow-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
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
            {/* Quality Selector */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowQualityMenu(!showQualityMenu);
                }}
                className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white px-3 py-2 rounded-lg transition-colors"
                title="Quality Settings"
              >
                <Settings size={20} />
                <span className="text-sm font-medium hidden sm:inline">{QUALITY_OPTIONS.find(q => q.value === selectedQuality)?.label}</span>
              </button>
              
              {showQualityMenu && (
                <div className="absolute bottom-full right-0 mb-2 bg-gray-900 border border-gray-700 rounded-lg shadow-xl overflow-hidden z-50">
                  <div className="px-3 py-2 border-b border-gray-700">
                    <p className="text-xs text-gray-400 font-semibold">VIDEO QUALITY</p>
                  </div>
                  {QUALITY_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handleQualityChange(option.value)}
                      className={`w-full px-4 py-2 text-left hover:bg-gray-800 transition-colors ${
                        selectedQuality === option.value ? 'bg-gray-800 text-yellow-500' : 'text-white'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-8">
                        <span className="font-medium">{option.label}</span>
                        {selectedQuality === option.value && (
                          <span className="text-yellow-500">✓</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Subtitle Menu */}
            <div className="relative flex items-center">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSubtitleMenu(!showSubtitleMenu);
                }}
                className={`flex items-center justify-center transition-colors ${selectedSubtitle && subtitleTrack ? 'text-yellow-500 hover:text-yellow-400' : 'text-white hover:text-yellow-500'}`}
                title="Subtitles"
              >
                <Subtitles size={28} strokeWidth={2} />
              </button>

              {/* Subtitle Selection Menu */}
              {showSubtitleMenu && (
                <div className="absolute bottom-full right-0 mb-2 bg-black/95 rounded-lg shadow-xl border border-gray-700 min-w-[200px] max-h-[300px] overflow-y-auto">
                  <div className="p-2">
                    <div className="text-xs text-gray-400 px-2 py-1 font-semibold uppercase">
                      Subtitles {loadingSubtitles && '(Loading...)'}
                    </div>
                    
                    {/* Off option */}
                    <button
                      onClick={disableSubtitles}
                      className={`w-full text-left px-3 py-2 rounded hover:bg-gray-800 transition-colors ${
                        !selectedSubtitle ? 'bg-yellow-500/20 text-yellow-500' : 'text-white'
                      }`}
                    >
                      Off
                    </button>

                    {/* Available subtitles */}
                    {availableSubtitles.length === 0 && !loadingSubtitles ? (
                      <div className="px-3 py-2 text-sm text-gray-500">
                        No subtitles available
                      </div>
                    ) : (
                      availableSubtitles.slice(0, 10).map((subtitle) => (
                        <button
                          key={subtitle.id}
                          onClick={() => selectSubtitle(subtitle)}
                          className={`w-full text-left px-3 py-2 rounded hover:bg-gray-800 transition-colors ${
                            selectedSubtitle?.id === subtitle.id ? 'bg-yellow-500/20 text-yellow-500' : 'text-white'
                          }`}
                        >
                          <div className="text-sm font-medium">{subtitle.languageName}</div>
                          <div className="text-xs text-gray-400 truncate">{subtitle.fileName}</div>
                          <div className="text-xs text-gray-500 flex items-center gap-2 mt-1">
                            <span>⭐ {subtitle.rating.toFixed(1)}</span>
                            <span>↓ {subtitle.downloadCount}</span>
                          </div>
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

export default async function VODPlayerPage({
  searchParams,
}: {
  searchParams: Promise<{ 
    url?: string; 
    title?: string; 
    isSeries?: string; 
    contentId?: string; 
    contentType?: string; 
    seriesId?: string; 
    seasonNumber?: string; 
    episodeNumber?: string;
    poster?: string;
  }>;
}) {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader className="w-12 h-12 text-yellow-500 animate-spin" />
      </div>
    }>
      <VODPlayerContent searchParams={searchParams} />
    </Suspense>
  );
}
