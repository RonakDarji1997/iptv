'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Volume2, VolumeX, Maximize, ChevronLeft, ChevronRight, Loader, Tv } from 'lucide-react';
import toast from 'react-hot-toast';
import { authService } from '@/services/authService';
import { contentService } from '@/services/contentService';

function LivePlayerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<number | undefined>(undefined);
  
  const cmd = searchParams.get('cmd');
  const channelName = searchParams.get('name');
  const channelNum = searchParams.get('num');

  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [channelList, setChannelList] = useState<any[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const hasStartedPlayingRef = useRef(false);

  // Load channel list on mount
  useEffect(() => {
    loadChannelList();
  }, []);

  const loadChannelList = async (): Promise<any[]> => {
    try {
      console.log('[LivePlayer] Loading channel list...');
      setLoadingChannels(true);
      
      // Use contentService which handles caching properly
      const allChannels = await contentService.getAllChannels();
      console.log('[LivePlayer] Loaded channels:', allChannels.length);
      
      setChannelList(allChannels);
      return allChannels;
    } catch (error) {
      console.error('[LivePlayer] Failed to load channel list:', error);
      return [];
    } finally {
      setLoadingChannels(false);
    }
  };

  useEffect(() => {
    if (!cmd) {
      setError('No channel command provided');
      return;
    }

    createStreamLink();
  }, [cmd]);

  const createStreamLink = async () => {
    try {
      setIsBuffering(true);
      setLoadingTimeout(false);
      hasStartedPlayingRef.current = false;
      
      const token = authService.getToken();
      
      const response = await fetch(`http://localhost:3000/stalker-proxy/channel-stream?cmd=${encodeURIComponent(cmd || '')}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (data.success && data.stream && data.stream.cmd) {
        setStreamUrl(data.stream.cmd);
        
        // Set 10-second timeout for loading - check ref not state
        if (loadingTimeoutRef.current) {
          clearTimeout(loadingTimeoutRef.current);
        }
        
        loadingTimeoutRef.current = setTimeout(() => {
          if (!hasStartedPlayingRef.current) {
            setLoadingTimeout(true);
          }
        }, 10000);
      } else {
        setError('Failed to create stream link');
      }
    } catch (error) {
      console.error('Failed to create stream link:', error);
      setError('Failed to start playback');
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleVolumeChange = () => {
      setVolume(video.volume);
      setIsMuted(video.muted);
    };
    const handleWaiting = () => setIsBuffering(true);
    const handlePlaying = () => {
      hasStartedPlayingRef.current = true;
      setIsBuffering(false);
      setLoadingTimeout(false);
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
    };
    const handleCanPlay = () => {
      hasStartedPlayingRef.current = true;
      setIsBuffering(false);
      setLoadingTimeout(false);
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
    };
    const handleError = () => {
      setError('Failed to load channel stream');
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
    };

    video.addEventListener('volumechange', handleVolumeChange);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('error', handleError);

    // Fullscreen change
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      video.removeEventListener('volumechange', handleVolumeChange);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('error', handleError);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, [streamUrl]);

  // Auto-hide controls
  useEffect(() => {
    if (!showControls) return;

    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }

    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);

    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [showControls]);

  const handleMouseMove = () => {
    setShowControls(true);
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

  const handleChannelChange = async (direction: 'prev' | 'next') => {
    try {
      console.log(`[LivePlayer] Channel change requested: ${direction}`);
      console.log('[LivePlayer] Current channelList length:', channelList.length);
      console.log('[LivePlayer] Current cmd:', cmd);
      
      let channels = channelList;
      
      // Check if channel list is loaded
      if (channels.length === 0) {
        if (loadingChannels) {
          console.log('[LivePlayer] Channel list still loading...');
          toast.error('Channel list is still loading, please wait...');
          return;
        }
        
        // Try to reload channel list and get immediate result
        console.log('[LivePlayer] Channel list empty, reloading...');
        const loadingToast = toast.loading('Loading channel list...');
        channels = await loadChannelList();
        toast.dismiss(loadingToast);
        
        console.log('[LivePlayer] Reloaded channels:', channels.length);
        
        if (channels.length === 0) {
          console.error('[LivePlayer] No channels available after reload');
          toast.error('No channels available');
          return;
        }
      }
      
      // Find current channel index
      const currentIndex = channels.findIndex((ch: any) => ch.cmd === cmd);
      console.log('[LivePlayer] Current channel index:', currentIndex);
      
      if (currentIndex === -1) {
        console.error('[LivePlayer] Current channel not found in list');
        toast.error('Current channel not found in list');
        return;
      }
      
      // Calculate next/prev index with wrapping
      let newIndex;
      if (direction === 'next') {
        newIndex = (currentIndex + 1) % channels.length;
      } else {
        newIndex = currentIndex - 1 < 0 ? channels.length - 1 : currentIndex - 1;
      }
      
      console.log('[LivePlayer] New channel index:', newIndex);
      const nextChannel = channels[newIndex];
      console.log('[LivePlayer] Next channel:', nextChannel.name);
      
      // Navigate to new channel
      const params = new URLSearchParams({
        cmd: nextChannel.cmd,
        name: encodeURIComponent(nextChannel.name || 'Channel'),
      });
      
      if (nextChannel.number) {
        params.append('num', nextChannel.number);
      }
      
      router.replace(`/player/live?${params.toString()}`);
      toast.success(`Switching to ${nextChannel.name}`);
    } catch (error) {
      console.error('Channel change error:', error);
      toast.error('Failed to change channel');
    }
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
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-16 h-16 text-yellow-500 animate-spin mb-4" />
          <p className="text-white text-lg">Loading channel...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-screen bg-black overflow-hidden"
      onMouseMove={handleMouseMove}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        src={streamUrl}
        autoPlay
      />

      {/* Buffering Indicator with Timeout Fallback */}
      {isBuffering && !loadingTimeout && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Loader className="w-16 h-16 text-white animate-spin" />
        </div>
      )}
      
      {/* Loading Timeout Fallback */}
      {loadingTimeout && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-20">
          <div className="text-center max-w-md mx-auto px-4">
            <Tv className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">Stream Taking Too Long</h3>
            <p className="text-gray-400 mb-6">
              The channel stream is taking longer than expected to load. This might be a temporary issue.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => {
                  setLoadingTimeout(false);
                  setIsBuffering(true);
                  createStreamLink();
                }}
                className="bg-yellow-500 hover:bg-yellow-600 text-black px-6 py-3 rounded-lg font-semibold transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={() => router.back()}
                className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
              >
                Go Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Bar */}
      <div
        className={`absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent p-6 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-white hover:text-yellow-500 transition-colors"
          >
            <ArrowLeft size={24} />
            <span className="text-lg font-semibold">Back</span>
          </button>
          
          {/* Channel Info */}
          <div className="flex items-center gap-3 bg-black/50 px-4 py-2 rounded-lg">
            <Tv size={24} className="text-yellow-500" />
            <div className="text-left">
              {channelNum && (
                <p className="text-yellow-500 text-sm font-semibold">CH {channelNum}</p>
              )}
              {channelName && (
                <p className="text-white font-medium">{decodeURIComponent(channelName)}</p>
              )}
            </div>
          </div>
          
          <div className="w-20" /> {/* Spacer for centering */}
        </div>
      </div>

      {/* Bottom Controls */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          {/* Left: Channel Navigation */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => handleChannelChange('prev')}
              className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              <ChevronLeft size={24} />
              <span className="font-medium">Prev</span>
            </button>

            <button
              onClick={() => handleChannelChange('next')}
              className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              <span className="font-medium">Next</span>
              <ChevronRight size={24} />
            </button>
          </div>

          {/* Center: Volume */}
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
              className="w-32 accent-yellow-500"
            />
            <span className="text-white text-sm font-medium w-10">
              {Math.round((isMuted ? 0 : volume) * 100)}%
            </span>
          </div>

          {/* Right: Fullscreen */}
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

export default function LivePlayerPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader className="w-12 h-12 text-yellow-500 animate-spin" />
      </div>
    }>
      <LivePlayerContent />
    </Suspense>
  );
}
