'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Play, Pause, Volume2, VolumeX, Maximize, Rewind, FastForward, Loader, SkipBack, SkipForward } from 'lucide-react';
import toast from 'react-hot-toast';
import { authService } from '@/services/authService';
import { cache } from '@/utils/cache';
import { API_URL } from '@/config/constants';

function VODPlayerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  
  const streamUrl = searchParams.get('url');
  const title = searchParams.get('title');
  const isSeries = searchParams.get('isSeries') === 'true';

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

  // Load episode playlist for series
  useEffect(() => {
    if (isSeries) {
      const playlistData = sessionStorage.getItem('episode_playlist');
      if (playlistData) {
        setEpisodePlaylist(JSON.parse(playlistData));
      }
    }
  }, [isSeries]);

  useEffect(() => {
    if (!streamUrl) {
      setError('No stream URL provided');
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    // Event listeners
    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleDurationChange = () => setDuration(video.duration);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleVolumeChange = () => {
      setVolume(video.volume);
      setIsMuted(video.muted);
    };
    const handleWaiting = () => setIsBuffering(true);
    const handleCanPlay = () => setIsBuffering(false);
    const handleError = () => setError('Failed to load video stream');
    const handleEnded = () => {
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

  const handleMouseMove = () => {
    setShowControls(true);
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
        
        // Update playlist with new index
        const updatedPlaylist = {
          ...episodePlaylist,
          currentIndex: index
        };
        sessionStorage.setItem('episode_playlist', JSON.stringify(updatedPlaylist));
        
        // Update state immediately before navigation
        setEpisodePlaylist(updatedPlaylist);
        
        router.replace(`/player/vod?url=${streamUrl}&title=${title}&isSeries=true`);
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
            onClick={() => router.back()}
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
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        src={decodeURIComponent(streamUrl)}
        autoPlay
      />

      {/* Buffering Indicator */}
      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Loader className="w-16 h-16 text-white animate-spin" />
        </div>
      )}

      {/* Play/Pause Overlay */}
      {showControls && !isBuffering && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ opacity: isPlaying ? 0 : 1, transition: 'opacity 0.3s' }}
        >
          <div className="bg-black/50 rounded-full p-6">
            {isPlaying ? (
              <Pause size={64} className="text-white" />
            ) : (
              <Play size={64} className="text-white" fill="white" />
            )}
          </div>
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
            onClick={() => router.back()}
            className="flex items-center gap-1 sm:gap-2 text-white hover:text-yellow-500 transition-colors flex-shrink-0"
          >
            <ArrowLeft size={20} className="sm:w-6 sm:h-6" />
            <span className="text-sm sm:text-lg font-semibold">Back</span>
          </button>
          {title && (
            <h1 className="text-white text-sm sm:text-xl font-semibold truncate flex-1 text-center px-2">{decodeURIComponent(title)}</h1>
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

            {/* Seek buttons for non-series or after episode buttons */}
            <button
              onClick={() => handleSeek(-10)}
              className="text-white hover:text-yellow-500 transition-colors"
              title="Rewind 10s"
            >
              <Rewind size={28} />
            </button>

            <button
              onClick={() => handleSeek(10)}
              className="text-white hover:text-yellow-500 transition-colors"
              title="Forward 10s"
            >
              <FastForward size={28} />
            </button>

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
          <button
            onClick={toggleFullscreen}
            className="text-white hover:text-yellow-500 transition-colors"
          >
            <Maximize size={28} />
          </button>
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
