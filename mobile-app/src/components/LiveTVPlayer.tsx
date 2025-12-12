import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  View, 
  StyleSheet, 
  ActivityIndicator, 
  TouchableOpacity, 
  Text, 
  Dimensions,
  PanResponder,
  StatusBar,
  Platform,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING } from '../constants';
import { StalkerChannel } from '../services/StalkerPortalClient';
import SubtitleOverlay from './SubtitleOverlay';
import { useSubtitles } from '../hooks/useSubtitles';

interface LiveTVPlayerProps {
  streamUrl: string;
  channel: StalkerChannel;
  channels: StalkerChannel[];
  onClose: () => void;
  onChannelChange: (channel: StalkerChannel) => void;
}

const { width, height } = Dimensions.get('window');

export const LiveTVPlayer: React.FC<LiveTVPlayerProps> = ({ 
  streamUrl, 
  channel, 
  channels, 
  onClose, 
  onChannelChange 
}) => {
  const videoRef = useRef<Video>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [currentOrientation, setCurrentOrientation] = useState<number>(0);
  const [resizeMode, setResizeMode] = useState<ResizeMode>(ResizeMode.CONTAIN);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [mutedAutoplayFallback, setMutedAutoplayFallback] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [showSubtitles, setShowSubtitles] = useState(false);
  const [position, setPosition] = useState(0);
  const [showBackOverlay, setShowBackOverlay] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isDocumentFullscreen, setIsDocumentFullscreen] = useState(false);
  const streamUrlRef = useRef<string>(streamUrl);
  const webPositionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const backOverlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const LOADING_TIMEOUT_MS = 10000; // 10 seconds
  const reloadHtmlVideo = useCallback(() => {
    try {
      const el: any = (videoRef as any).current;
      if (!el) return;
      // Try to reload and play
      try { el.pause(); } catch(e) {}
      try { el.load(); } catch(e) {}
        try { el.muted = isMuted || mutedAutoplayFallback; } catch(e) {}
      try { webPlay(el, 'reloadHtmlVideo'); } catch(e) {}
      setError(null);
      setRetryCount(0);
      setIsLoading(false);
    } catch (err) {
      // ignore
    }
  }, [streamUrl]);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPlayingTimeRef = useRef<number>(Date.now());
  const MAX_RETRIES = 3;
  const STREAM_REFRESH_INTERVAL = 3600000; // Refresh stream every 1 hour (token expiry prevention)
  
  // Subtitle integration
  const videoId = `live_${channel.id}`;
  const {
    subtitles,
    loading: subtitlesLoading,
    progress: subtitleProgress,
    error: subtitleError,
    isGenerating,
    startGeneration,
    cancelGeneration,
  } = useSubtitles({
    streamUrl,
    videoId,
    autoStart: false,
    model: 'tiny',
  });

  // Log subtitle state changes
  useEffect(() => {
    console.log('📊 [LiveTVPlayer] Subtitle state changed:');
    console.log('  - channel:', channel.name);
    console.log('  - subtitles count:', subtitles.length);
    console.log('  - isGenerating:', isGenerating);
    console.log('  - progress:', subtitleProgress?.percent?.toFixed(1) + '%');
    console.log('  - error:', subtitleError);
  }, [channel.name, subtitles.length, isGenerating, subtitleProgress?.percent, subtitleError]);

  // Auto-enable subtitle display when first subtitles arrive
  useEffect(() => {
    if (subtitles.length > 0 && !showSubtitles) {
      console.log('✨ [LiveTVPlayer] Auto-enabling subtitle display (first subtitles received)');
      setShowSubtitles(true);
    }
  }, [subtitles.length, showSubtitles]);
  
  const WATCHDOG_INTERVAL = 10000; // Check stream health every 10 seconds

  const loadVideo = useCallback(async () => {
    try {
      setIsLoading(true);
      // Start loading timeout
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current as any);
      loadingTimeoutRef.current = setTimeout(() => {
        console.warn('⚠️ [LiveTVPlayer] Loading timed out');
        setError('Loading timed out. Please try again.');
        setIsLoading(false);
      }, LOADING_TIMEOUT_MS);
      setError(null);
      
      console.log('🎬 [LiveTVPlayer] Starting video load...');
      console.log('  Stream URL:', streamUrl);
      console.log('  Channel:', channel.name);
      
      // Configure audio mode for Expo Go
      const { Audio } = await import('expo-av');
      // (removed an accidental nested useEffect here — fullscreen handling
      // is handled in a top-level useEffect later in the component)
    streamRefreshTimerRef.current = setInterval(() => {
      console.log('⏰ Periodic stream refresh (1 hour elapsed)');
      try { refreshStream && (refreshStream as any)(); } catch (e) {}
    }, STREAM_REFRESH_INTERVAL);
    
    // Enable auto-rotation based on device gravity with explicit degree handling
    const setupOrientation = async () => {
      try {
        // Allow all orientations to follow device gravity
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.ALL);
        console.log('📱 [LiveTVPlayer] Orientation unlocked - all directions enabled');
        
        // Get initial orientation
        const orientation = await ScreenOrientation.getOrientationAsync();
        console.log('📱 Initial orientation:', orientation);
        setCurrentOrientation(orientation);
        
        // Listen to orientation changes
        const subscription = ScreenOrientation.addOrientationChangeListener((event) => {
          const { orientationInfo } = event;
          console.log('🔄 Orientation changed to:', orientationInfo.orientation);
          console.log('📐 Rotation degrees:', getOrientationDegrees(orientationInfo.orientation));
          setCurrentOrientation(orientationInfo.orientation);
        });
        
        console.log('📱 Player will follow device gravity (0°, 90°, 180°, 270°)');
        
        return subscription;
      } catch (error) {
        // Silently handle orientation error
        return null;
      }
    };
    
    let subscription: any = null;
    setupOrientation().then(sub => { subscription = sub; });

    // finish loadVideo try/catch
    } catch (err) {
      console.error('❌ [LiveTVPlayer] loadVideo failed:', err);
      setError('Failed to load video');
    } finally {
      setIsLoading(false);
    }
  }, [streamUrl, channel]);

  useEffect(() => {
    console.log('🔔 [LiveTVPlayer] Mounted with streamUrl:', streamUrl);
  }, []);

  // Helper for consistent web play logging
  const webPlay = (el: any, ctx: string = '') => {
    try {
      if (!el || !el.play) {
        console.warn('⚠️ [LiveTVPlayer] webPlay called but element/play not available', ctx);
        return null;
      }
      console.log(new Date().toISOString(), `▶️ [LiveTVPlayer] webPlay attempt (${ctx})`, { src: el.src });
      const p = el.play();
      if (p && typeof p.then === 'function') {
        p.then(() => console.log(new Date().toISOString(), `✅ [LiveTVPlayer] webPlay resolved (${ctx})`)).catch((e: any) => console.warn(new Date().toISOString(), `⚠️ [LiveTVPlayer] webPlay rejected (${ctx})`, e));
      }
      return p;
    } catch (err) {
      console.error(new Date().toISOString(), `❌ [LiveTVPlayer] webPlay threw (${ctx})`, err);
      return null;
    }
  };

  // If the player was opened without a streamUrl (we opened immediately), request the stream
  useEffect(() => {
    if (!streamUrl) {
      try {
        console.log('🔔 [LiveTVPlayer] streamUrl missing on mount — requesting stream via onChannelChange');
        onChannelChange(channel);
      } catch (err) {
        console.warn('⚠️ [LiveTVPlayer] Failed to request stream on mount:', err);
      }
    }
  }, [streamUrl, channel, onChannelChange]);

  // Web-specific: if `streamUrl` changes, update the DOM video `src` and try to play.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el: any = (videoRef as any).current;
    if (!el) return;

    setIsLoading(true);
    try { try { el.pause(); } catch (_) {} } catch (_) {}

    // Assign or remove src depending on availability. Avoid assigning an empty string.
    try {
      if (streamUrl) {
        try { el.src = streamUrl; } catch (_) {}
      } else {
        try { el.removeAttribute && el.removeAttribute('src'); } catch (_) {}
      }
    } catch (_) {}

    try { el.load && el.load(); } catch (_) {}

    try {
      console.log(new Date().toISOString(), '🔔 [LiveTVPlayer] streamUrl updated (web) - assigning to video element');
      console.log('  - streamUrl:', streamUrl);
      console.log('  - videoRef.src (after):', el.src);
      const fsEl = (document as any).fullscreenElement || (document as any).webkitFullscreenElement;
      console.log('  - fullscreenElement present:', !!fsEl);
      if (fsEl) console.log('  - fullscreenElement.src (before):', fsEl.src);
    } catch (e) {}

    try {
      // Also attempt to update any element currently in fullscreen (some browsers copy video to FS element)
      try {
        const fsEl = (document as any).fullscreenElement || (document as any).webkitFullscreenElement;
        if (fsEl && fsEl !== el) {
          try { if (streamUrl) fsEl.src = streamUrl; } catch (_) {}
          try { fsEl.load && fsEl.load(); } catch (_) {}
        }
      } catch (_) {}

      webPlay(el, 'stream-update');
    } catch (err) {
      console.warn(new Date().toISOString(), '❌ [LiveTVPlayer] play() threw after stream update', err);
    }
  }, [streamUrl]);

  // Keep a ref copy of the latest streamUrl for use inside event handlers
  useEffect(() => {
    streamUrlRef.current = streamUrl;
  }, [streamUrl]);

  // Attach HTML5 event listeners to the DOM video element to detect empties/aborts
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el: any = (videoRef as any).current;
    if (!el || typeof el.addEventListener !== 'function') return;

    console.log(new Date().toISOString(), 'ℹ️ [LiveTVPlayer] Attaching web event listeners to video element:', !!el);
    const events = [
      'loadedmetadata','loadeddata','canplay','canplaythrough','play','playing','pause','waiting','stalled','suspend','error','abort','emptied','progress','seeking','seeked','ended'
    ];
    const handler = (ev: any) => {
      try {
        console.log(new Date().toISOString(), `🔔 [LiveTVPlayer Web Event] ${ev.type}`, { currentTime: el.currentTime, src: el.src });
        // If browser emptied or aborted the element and the src is missing,
        // attempt to restore the src from the latest streamUrlRef and reload/play.
        if ((ev.type === 'emptied' || ev.type === 'abort' || ev.type === 'error') && (!el.src || el.src === '')) {
          const resolved = streamUrlRef.current;
          console.warn(new Date().toISOString(), `⚠️ [LiveTVPlayer] Video event ${ev.type} detected with empty src - attempting restore`, { resolved });
          try {
            if (resolved) {
              el.src = resolved;
              try { el.load(); } catch (_) {}
              webPlay(el, `restore-after-event-${ev.type}`);
            }
          } catch (e) {
            console.error(new Date().toISOString(), `❌ [LiveTVPlayer] Failed to restore video src after ${ev.type}`, e);
          }
        }
      } catch (e) {
        // ignore
      }
    };
    events.forEach((name) => el.addEventListener(name, handler));
    return () => {
      try { events.forEach((name) => el.removeEventListener(name, handler)); } catch (e) {}
    };
  }, [videoRef.current]);

  // Log and ensure onClose is wrapped so clicks are logged
  const handleClose = () => {
    try {
      console.log(`◀️ [LiveTVPlayer] Back/Close pressed for channel: ${channel.name}`);
    } catch (_) {}
    onClose();
  };

  // Attempt to play muted fallback when autoplay is blocked
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    try {
      const el: any = (videoRef as any).current;
      if (!el) return;
      // Try to play and if it fails, try again muted (autoplay policy fallback)
      const attemptPlay = async () => {
        try {
          const p = webPlay(el, 'attemptPlay-initial');
          if (p && typeof p.then === 'function') {
            await p;
            // success
            setMutedAutoplayFallback(false);
            setIsMuted(false);
          }
        } catch (err) {
          console.warn('⚠️ [LiveTVPlayer] Play error (attempting muted fallback):', err);
          try {
            el.muted = true;
            setMutedAutoplayFallback(true);
            const p = webPlay(el, 'attemptPlay-muted-fallback');
            if (p && typeof p.then === 'function') {
              await p;
            }
          } catch (err2) {
            console.error('❌ [LiveTVPlayer] Failed to play even after muted fallback:', err2);
            // no-op: will surface as onError and show UI
          }
        }
      };
      attemptPlay();
    } catch (err) {
      // ignore
    }
  }, [streamUrl]);

  // Handle browser fullscreen change events to ensure playback isn't unintentionally paused
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = async () => {
      try {
        const el: any = (videoRef as any).current;
        const isFullscreen = (document as any).fullscreenElement || (document as any).webkitFullscreenElement;
        console.log('🔵 [LiveTVPlayer] Fullscreen change (isFullscreen=):', !!isFullscreen);
        try {
          console.log('  - streamUrl:', streamUrl);
          console.log('  - videoRef.src:', el ? el.src : '(no video ref)');
          console.log('  - fullscreenElement src:', isFullscreen ? ((isFullscreen.src) ? isFullscreen.src : '(no src)') : '(not fullscreen)');
        } catch (e) {}
        if (isFullscreen && el) {
          try {
            // If streamUrl is available but el.src is not set (user entered fullscreen early), set it
            try {
              if (streamUrl && (!el.src || el.src.indexOf('blob:') === 0)) {
                el.src = streamUrl;
                try { el.load(); } catch (_) {}
              }
            } catch (_) {}

            const p = webPlay(el, 'fullscreen-enter');
            if (p && typeof p.then === 'function') {
              try {
                await p;
                console.log(new Date().toISOString(), '✅ [LiveTVPlayer] Playback started/resumed in fullscreen');
                setIsDocumentFullscreen(true);
              } catch (err) {
                console.error(new Date().toISOString(), '❌ [LiveTVPlayer] Failed to start/resume playback in fullscreen (webPlay)', err);
              }
            } else {
              console.log(new Date().toISOString(), 'ℹ️ [LiveTVPlayer] webPlay invoked in fullscreen (no promise available)');
              setIsDocumentFullscreen(true);
            }
          } catch (err) {
            console.error(new Date().toISOString(), '❌ [LiveTVPlayer] Failed to start/resume playback in fullscreen:', err);
          }
        } else if (!isFullscreen) {
          console.log(new Date().toISOString(), 'ℹ️ [LiveTVPlayer] Exited fullscreen');
          setIsDocumentFullscreen(false);
          try {
            // Ensure the main video element has the stream URL after exiting fullscreen
            if (el && streamUrl) {
              console.log('  - Restoring main video src after exit fullscreen:', streamUrl);
              try {
                if (!el.src || el.src.indexOf('blob:') === 0 || el.src !== streamUrl) {
                  el.src = streamUrl;
                  try { el.load(); } catch (_) {}
                }
              } catch (_) {}
              try {
                const p2 = webPlay(el, 'restore-after-exit');
                if (p2 && typeof p2.then === 'function') {
                  try {
                    await p2;
                    console.log(new Date().toISOString(), '✅ [LiveTVPlayer] Playback resumed after exiting fullscreen');
                  } catch (e) {
                    console.warn(new Date().toISOString(), '⚠️ [LiveTVPlayer] play() failed when restoring after exit fullscreen', e);
                  }
                }
              } catch (e) {
                console.warn(new Date().toISOString(), '⚠️ [LiveTVPlayer] play() failed when restoring after exit fullscreen', e);
              }
            }
          } catch (e) {
            // ignore
          }
        }
      } catch (err) {
        // ignore
      }
    };
    document.addEventListener('fullscreenchange', handler as any);
    // vendor prefixed events for older Safari
    document.addEventListener('webkitfullscreenchange', handler as any);
    return () => {
      document.removeEventListener('fullscreenchange', handler as any);
      document.removeEventListener('webkitfullscreenchange', handler as any);
    };
  }, []);

  // Safari-specific webkit fullscreen handlers on the video element
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el: any = (videoRef as any).current;
    if (!el || typeof el.addEventListener !== 'function') return;
    const begin = async () => {
      try {
        console.log('🔵 [LiveTVPlayer] webkit begin fullscreen');
        const p = webPlay(el, 'webkit-begin-fullscreen');
        if (p && typeof p.then === 'function') {
          try {
            await p;
            console.log('✅ [LiveTVPlayer] Playback started on webkit begin fullscreen');
          } catch (e) {
            console.error('❌ [LiveTVPlayer] Playback failed on webkit begin fullscreen:', e);
          }
        }
      } catch (err) {}
    };
    const end = async () => {
      try {
        console.log('🔵 [LiveTVPlayer] webkit end fullscreen');
        const p = webPlay(el, 'webkit-end-fullscreen');
        if (p && typeof p.then === 'function') {
          try {
            await p;
            console.log('✅ [LiveTVPlayer] Playback resumed on webkit end fullscreen');
          } catch (e) {
            console.error('❌ [LiveTVPlayer] Playback failed on webkit end fullscreen resume:', e);
          }
        }
      } catch (err) {}
    };
    el.addEventListener('webkitbeginfullscreen', begin);
    el.addEventListener('webkitendfullscreen', end);
    return () => {
      try { el.removeEventListener('webkitbeginfullscreen', begin); } catch (e) {}
      try { el.removeEventListener('webkitendfullscreen', end); } catch (e) {}
    };
  }, [videoRef.current]);

  // Watch isLoading and show timeout if still loading after LOADING_TIMEOUT_MS
  useEffect(() => {
    if (!isLoading) {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current as any);
        loadingTimeoutRef.current = null;
      }
      return;
    }

    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current as any);
    }
    loadingTimeoutRef.current = setTimeout(() => {
      console.warn('⚠️ [LiveTVPlayer] isLoading timeout triggered');
      setError('Loading timed out. Please try again.');
      setIsLoading(false);
    }, LOADING_TIMEOUT_MS);

    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current as any);
        loadingTimeoutRef.current = null;
      }
    };
  }, [isLoading]);

  // Cleanup overlay timer on unmount
  useEffect(() => {
    return () => {
      if (backOverlayTimeoutRef.current) {
        clearTimeout(backOverlayTimeoutRef.current as any);
      }
      // Cleanup DOM video for web when component unmounts
      if (Platform.OS === 'web') {
        try {
          const el: any = (videoRef as any).current;
          if (el) {
            try { el.pause(); } catch(e) {}
            try { el.removeAttribute('src'); } catch(e) {}
            try { el.load(); } catch(e) {}
          }
        } catch (err) {
          // ignore
        }
      }
    };
  }, []);
  
  // Helper function to get rotation degrees from orientation
  const getOrientationDegrees = (orientation: ScreenOrientation.Orientation): number => {
    switch (orientation) {
      case ScreenOrientation.Orientation.PORTRAIT_UP:
        return 0;
      case ScreenOrientation.Orientation.LANDSCAPE_LEFT:
        return 90;
      case ScreenOrientation.Orientation.PORTRAIT_DOWN:
        return 180;
      case ScreenOrientation.Orientation.LANDSCAPE_RIGHT:
        return 270;
      default:
        return 0;
    }
  };

  // Auto-hide controls after 3 seconds, but respect hover state.
  // If the user is hovering over the player, do not start the auto-hide timer.
  useEffect(() => {
    // Always clear any existing timer first
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current as any);
      controlsTimeoutRef.current = null;
    }

    // If controls are shown and the user is NOT hovering, start hide timer
    if (showControls && !isHovered) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
        controlsTimeoutRef.current = null;
      }, 3000);
    }

    // Cleanup on dependency change/unmount
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current as any);
        controlsTimeoutRef.current = null;
      }
    };
  }, [showControls, isHovered]);

  const handlePlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (status.isLoaded) {
      setIsLoading(false);
      setIsPlaying(status.isPlaying);
      setIsBuffering(status.isBuffering);
      setPosition(status.positionMillis); // Update playback position for subtitles
      
      // Reset retry count and update last playing time on successful playback
      if (status.isPlaying) {
        console.log('▶️ Stream is PLAYING');
        setRetryCount(0);
        setError(null);
        lastPlayingTimeRef.current = Date.now();
      } else if (!status.isBuffering) {
        console.log('⏸️ Stream is PAUSED (not playing, not buffering)');
        console.log('Playback status:', {
          isPlaying: status.isPlaying,
          isBuffering: status.isBuffering,
          positionMillis: status.positionMillis,
          durationMillis: status.durationMillis,
          shouldPlay: status.shouldPlay
        });
      }
      
      // Watchdog: Detect if stream stopped unexpectedly - but only after 30 seconds
      if (!status.isPlaying && !status.isBuffering && !error) {
        const timeSinceLastPlaying = Date.now() - lastPlayingTimeRef.current;
        if (timeSinceLastPlaying > 30000) { // 30 seconds instead of 10
          console.warn('⚠️ Stream stuck for 30s, refreshing...');
          refreshStream();
        }
      }
    } else if (status.error) {
      console.log('⚠️ Playback error, attempting recovery...');
      
      // Check if error might be due to expired token
      const errorMessage = String(status.error);
      const isTokenError = errorMessage.includes('404') || 
                          errorMessage.includes('403') || 
                          errorMessage.includes('expired') ||
                          errorMessage.includes('unauthorized');
      
      if (isTokenError && retryCount === 0) {
        console.log('🔑 Token may have expired, refreshing stream...');
        setRetryCount(prev => prev + 1);
        setError(null);
        refreshStream();
        return;
      }
      
      // Auto-retry logic for other errors - keep playing during retry
      if (retryCount < MAX_RETRIES) {
        console.log(`🔄 Auto-retrying... Attempt ${retryCount + 1}/${MAX_RETRIES}`);
        setRetryCount(prev => prev + 1);
        setError(null);
        
        // Retry after 2 seconds
        retryTimeoutRef.current = setTimeout(() => {
          loadVideo();
        }, 2000);
      } else {
        // Only show error and stop playing after all retries exhausted
        setError(`Playback error after ${MAX_RETRIES} attempts`);
        setIsLoading(false);
        setIsPlaying(false);
      }
    }
  };

  const togglePlayPause = async () => {
    if (!videoRef.current) return;
    try {
      if (Platform.OS === 'web') {
        const el: any = (videoRef as any).current;
        if (!el) return;
        if (isPlaying) {
          console.log('⏸️ USER ACTION (web): Pausing DOM video');
          el.pause();
        } else {
          console.log('▶️ USER ACTION (web): Resuming DOM video');
          await webPlay(el, 'user-toggle-play');
        }
      } else {
        if (isPlaying && typeof (videoRef.current as any).pauseAsync === 'function') {
          console.log('⏸️ USER ACTION: Pausing expo video');
          await (videoRef.current as any).pauseAsync();
        } else if (!isPlaying && typeof (videoRef.current as any).playAsync === 'function') {
          console.log('▶️ USER ACTION: Resuming expo video');
          await (videoRef.current as any).playAsync();
        }
      }
    } catch (err) {
      console.warn('Toggle play error:', err);
    }
  };

  const triggerBackOverlay = (duration: number = 3000) => {
    setShowBackOverlay(true);
    if (backOverlayTimeoutRef.current) {
      clearTimeout(backOverlayTimeoutRef.current);
    }
    backOverlayTimeoutRef.current = setTimeout(() => {
      setShowBackOverlay(false);
    }, duration);
  };

  const handleNextChannel = () => {
    const currentIndex = channels.findIndex(ch => ch.id === channel.id);
    if (currentIndex < channels.length - 1) {
      onChannelChange(channels[currentIndex + 1]);
    }
  };

  const handlePreviousChannel = () => {
    const currentIndex = channels.findIndex(ch => ch.id === channel.id);
    if (currentIndex > 0) {
      onChannelChange(channels[currentIndex - 1]);
    }
  };

  const toggleAspectRatio = () => {
    setResizeMode(prev => {
      if (prev === ResizeMode.CONTAIN) return ResizeMode.COVER;
      if (prev === ResizeMode.COVER) return ResizeMode.STRETCH;
      return ResizeMode.CONTAIN;
    });
  };

  // Toggle fullscreen on web; on native we rely on orientation handling elsewhere
  const handleToggleFullscreen = async () => {
    try {
      if (Platform.OS === 'web') {
        const el: any = (videoRef as any).current;
        if (!el) {
          console.log('🔳 [LiveTVPlayer] Fullscreen requested but video element missing');
          return;
        }

        const fsEl = (document as any).fullscreenElement || (document as any).webkitFullscreenElement;
        if (!fsEl) {
          console.log(new Date().toISOString(), '🔳 [LiveTVPlayer] Requesting fullscreen for channel:', channel.name);
          console.log('  - streamUrl:', streamUrl);
          console.log('  - videoRef.src (before):', el.src);
          try {
            if (el.requestFullscreen) await el.requestFullscreen();
            else if (el.webkitEnterFullscreen) el.webkitEnterFullscreen();
            else if ((el as any).webkitRequestFullscreen) await (el as any).webkitRequestFullscreen();
            console.log(new Date().toISOString(), '✅ [LiveTVPlayer] requestFullscreen call succeeded');
          } catch (err) {
            console.warn(new Date().toISOString(), '⚠️ [LiveTVPlayer] requestFullscreen call rejected', err);
          }
        } else {
          console.log(new Date().toISOString(), '🔙 [LiveTVPlayer] Exiting fullscreen (user requested)');
          try {
            if (document.exitFullscreen) await document.exitFullscreen();
            else if ((document as any).webkitExitFullscreen) (document as any).webkitExitFullscreen();
            console.log(new Date().toISOString(), '✅ [LiveTVPlayer] exitFullscreen call succeeded');
          } catch (err) {
            console.warn(new Date().toISOString(), '⚠️ [LiveTVPlayer] exitFullscreen call rejected', err);
          }
        }
      } else {
        // Native: toggle orientation as a lightweight fullscreen-like action
        console.log(new Date().toISOString(), '🔳 [LiveTVPlayer] Native fullscreen toggle requested');
        try {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT);
          console.log(new Date().toISOString(), '✅ [LiveTVPlayer] Locked orientation to landscape');
        } catch (err) {
          console.warn(new Date().toISOString(), '⚠️ [LiveTVPlayer] Failed to lock orientation', err);
        }
      }
    } catch (err) {
      console.error('❌ [LiveTVPlayer] handleToggleFullscreen error', err);
    }
  };

  // Swipe gesture handler (adapts to device orientation)
  const panResponderRef = PanResponder.create({
    onStartShouldSetPanResponder: (evt) => {
      // Don't capture touches in the top 80px (top bar area)
      const touchY = evt.nativeEvent.pageY;
      if (touchY < 80) {
        return false; // Let top bar buttons handle the touch
      }
      return true;
    },
    onStartShouldSetPanResponderCapture: () => false, // Don't capture, let children respond first
    onMoveShouldSetPanResponder: (evt, gestureState) => {
      // Don't capture touches in the top 80px (top bar area)
      const touchY = evt.nativeEvent.pageY;
      if (touchY < 80) {
        return false;
      }
      const isLandscape = currentOrientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
                         currentOrientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT;
      // In landscape: horizontal swipes, In portrait: vertical swipes
      const shouldCapture = isLandscape ? Math.abs(gestureState.dx) > 10 : Math.abs(gestureState.dy) > 10;
      return shouldCapture;
    },
    onPanResponderRelease: (_, gestureState) => {
      const isLandscape = currentOrientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT || 
                         currentOrientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT;
      
      if (isLandscape) {
        // Landscape: horizontal swipes
        if (gestureState.dx < -50) {
          handleNextChannel();
        } else if (gestureState.dx > 50) {
          handlePreviousChannel();
        } else {
          // Tap: ensure controls are visible and show overlay
          setShowControls(true);
          triggerBackOverlay();
        }
      } else {
        // Portrait: vertical swipes
        if (gestureState.dy < -50) {
          handleNextChannel();
        } else if (gestureState.dy > 50) {
          handlePreviousChannel();
        } else {
          // Tap: ensure controls are visible and show overlay
          setShowControls(true);
          triggerBackOverlay();
        }
      }
      // Toggle back overlay on taps (not swipes)
      if (Math.abs(gestureState.dx) < 50 && Math.abs(gestureState.dy) < 50) {
        triggerBackOverlay();
      }
    },
  });

  // Web: use native HTML <video> element (only on web platform)
  if (Platform.OS === 'web') {
    return (
      <View style={styles.webSafeArea}>
        <StatusBar hidden={true} />
        <Pressable
          style={styles.videoContainer}
          onHoverIn={() => {
            setIsHovered(true);
            // Keep controls visible while hovered
            setShowControls(true);
            if (controlsTimeoutRef.current) {
              clearTimeout(controlsTimeoutRef.current as any);
              controlsTimeoutRef.current = null;
            }
          }}
          onHoverOut={() => {
            // Clear immediate timers and unset hover; the central auto-hide
            // effect will start the hide timer when it notices `isHovered` is false.
            setIsHovered(false);
            if (controlsTimeoutRef.current) {
              clearTimeout(controlsTimeoutRef.current as any);
              controlsTimeoutRef.current = null;
            }
          }}
          onPress={() => {
            setShowControls(true);
            triggerBackOverlay();
            // Try to resume playback on user interaction
            try {
              const el: any = (videoRef as any).current;
                if (el && el.play) {
                webPlay(el, 'user-interaction-click');
              }
            } catch (err) {
              console.warn(new Date().toISOString(), '❌ [LiveTVPlayer] play() threw after user interaction', err);
            }
          }}
        >
          <video
            ref={videoRef as any}
            src={streamUrl || undefined}
            style={{ width: '100%', height: '100%', objectFit: 'contain', backgroundColor: '#000' }}
            muted={isMuted || mutedAutoplayFallback}
            autoPlay
            playsInline
            onLoadedMetadata={(e: any) => {
              console.log('🎬 [LiveTVPlayer Web] Video loaded for channel:', channel.name);
              setIsLoading(false);
              // Reset retry and error state
              setRetryCount(0);
              setError(null);
              // Start interval to update position for subtitles and watchdog
              if (webPositionTimerRef.current) {
                clearInterval(webPositionTimerRef.current as any);
              }
              webPositionTimerRef.current = setInterval(() => {
                try {
                  const el: any = (videoRef as any).current;
                  if (!el) return;
                  const current = (el.currentTime || 0) * 1000;
                  setPosition(current);
                } catch (err) {
                  // ignore
                }
              }, 1000);
            }}
            onPlay={() => {
              console.log('✅ [LiveTVPlayer Web] Video playing');
              setIsPlaying(true);
            }}
            onPause={() => {
              console.log('⏸️ [LiveTVPlayer Web] Video paused');
              setIsPlaying(false);
            }}
            onWaiting={() => {
              setIsBuffering(true);
            }}
            onPlaying={() => {
              setIsBuffering(false);
            }}
            onError={(e: any) => {
              console.error('❌ [LiveTVPlayer Web] Video error:', e);
              setError('Failed to load stream');
              setIsLoading(false);
            }}
          />

          {/* Hover / Click Back Overlay */}
          { (showBackOverlay || isHovered || isLoading) && (
            <TouchableOpacity onPress={handleClose} style={styles.backOverlay}>
              <Ionicons name="arrow-back" size={22} color={COLORS.text} />
              <Text style={styles.backOverlayText} numberOfLines={1}>{channel.name}</Text>
            </TouchableOpacity>
          )}

          {/* Buffering Indicator */}
          {isBuffering && !isLoading && (
            <View style={styles.bufferingOverlay}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.bufferingText}>Buffering...</Text>
            </View>
          )}

          {/* Loading Indicator */}
          {isLoading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Loading stream...</Text>
            </View>
          )}

          {/* Error */}
          {error && (
            <View style={styles.errorOverlay}>
              <Ionicons name="alert-circle" size={64} color={COLORS.error} />
              <Text style={styles.errorText}>{error}</Text>
              <Text style={styles.errorHint}>Stream may be unavailable or expired</Text>
              <View style={styles.errorButtons}>
                <TouchableOpacity onPress={() => { loadVideo(); reloadHtmlVideo(); }} style={styles.retryButton}>
                  <Ionicons name="refresh" size={20} color={COLORS.text} />
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleClose} style={styles.closeErrorButton}>
                  <Text style={styles.closeErrorText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Overlay Controls - reuse same UI as native; we keep the JSX consistent by rendering the same top/center/bottom overlays that were present below */}
          {(showControls || isHovered) && !isLoading && !error && (
            <>
              {/* Top Bar */}
              <View style={styles.topBar}>
                <View style={styles.channelInfoBar}>
                  <Text style={styles.channelName} numberOfLines={1}>
                    {channel.name}
                  </Text>
                  {channel.number && (
                    <Text style={styles.channelNumber}>Ch {channel.number}</Text>
                  )}
                </View>
                <View style={styles.topBarButtons}>
                  <TouchableOpacity onPress={toggleAspectRatio} style={styles.aspectRatioButton}>
                    <Ionicons 
                      name={
                        resizeMode === ResizeMode.CONTAIN ? "contract" : 
                        resizeMode === ResizeMode.COVER ? "expand" : 
                        "scan"
                      } 
                      size={24} 
                      color={COLORS.text} 
                    />
                    <Text style={styles.aspectRatioText}>{resizeMode === ResizeMode.CONTAIN ? "Fit" : resizeMode === ResizeMode.COVER ? "Fill" : "Stretch"}</Text>
                  </TouchableOpacity>
                  {/* fullscreen button (single instance) */}
                  <TouchableOpacity 
                    style={styles.subtitleButton}
                    onPress={() => {
                      console.log('🎬 [LiveTVPlayer Web] CC button pressed');
                      if (!isGenerating && subtitles.length === 0) {
                        startGeneration();
                      } else if (isGenerating) {
                        cancelGeneration();
                      } else {
                        const newVisibility = !showSubtitles;
                        setShowSubtitles(newVisibility);
                      }
                    }}
                  >
                    <Ionicons 
                      name={
                        isGenerating ? "sync" : 
                        subtitles.length > 0 && showSubtitles ? "chatbox" : 
                        "chatbox-outline"
                      } 
                      size={24} 
                      color={isGenerating ? COLORS.primary : COLORS.text} 
                    />
                    <Text style={[styles.subtitleText, isGenerating && { color: COLORS.primary }]}>{isGenerating ? `${subtitleProgress?.percent?.toFixed(0) || 0}%` : 'CC'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleToggleFullscreen} style={styles.aspectRatioButton}>
                    <Ionicons name={isDocumentFullscreen ? 'contract' : 'expand'} size={24} color={COLORS.text} />
                    <Text style={styles.aspectRatioText}>{isDocumentFullscreen ? 'Exit FS' : 'Fullscreen'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                    <Ionicons name="close" size={32} color={COLORS.text} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Center Controls */}
              <View style={styles.centerControls}>
                <TouchableOpacity onPress={handlePreviousChannel} style={styles.navButton} disabled={channels.findIndex(ch => ch.id === channel.id) === 0}>
                  <Ionicons name="chevron-back" size={48} color={COLORS.text} />
                </TouchableOpacity>
                <TouchableOpacity onPress={togglePlayPause} style={styles.playButton}>
                  <Ionicons name={isPlaying ? 'pause' : 'play'} size={64} color={COLORS.text} />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleNextChannel} style={styles.navButton} disabled={channels.findIndex(ch => ch.id === channel.id) === channels.length - 1}>
                  <Ionicons name="chevron-forward" size={48} color={COLORS.text} />
                </TouchableOpacity>
              </View>

              <View style={styles.bottomBar}>
                <View style={styles.liveIndicator}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>LIVE</Text>
                </View>
                <Text style={styles.swipeHint}>Swipe ← → to change channel</Text>
              </View>
            </>
          )}

          {/* Subtitle Overlay */}
          {showSubtitles && subtitles.length > 0 && (
            <SubtitleOverlay subtitles={subtitles} currentTime={position / 1000} visible={showSubtitles} />
          )}
        </Pressable>
      </View>
    );
  }

  // Native (iOS/Android) path continues below
  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <StatusBar hidden={true} />
      <View style={styles.videoContainer} {...panResponderRef.panHandlers}>
        <Video
          ref={videoRef}
          style={styles.video}
          resizeMode={resizeMode}
          onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
          useNativeControls={false}
        />

        {/* Back Overlay (also shown for taps on native) */}
          {(showBackOverlay || isHovered || isLoading) && (
          <TouchableOpacity onPress={handleClose} style={styles.backOverlay}>
            <Ionicons name="arrow-back" size={22} color={COLORS.text} />
            <Text style={styles.backOverlayText} numberOfLines={1}>{channel.name}</Text>
          </TouchableOpacity>
        )}

        {/* Buffering Indicator */}
        {isBuffering && !isLoading && (
          <View style={styles.bufferingOverlay}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.bufferingText}>Buffering...</Text>
          </View>
        )}

        {/* Loading Indicator */}
        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading stream...</Text>
          </View>
        )}

        {/* Error */}
        {error && (
          <View style={styles.errorOverlay}>
            <Ionicons name="alert-circle" size={64} color={COLORS.error} />
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.errorHint}>Stream may be unavailable or expired</Text>
            <View style={styles.errorButtons}>
              <TouchableOpacity onPress={loadVideo} style={styles.retryButton}>
                <Ionicons name="refresh" size={20} color={COLORS.text} />
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleClose} style={styles.closeErrorButton}>
                <Text style={styles.closeErrorText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Overlay Controls - Show/Hide on tap */}
        {showControls && !isLoading && !error && (
          <>
            {/* Top Bar */}
            <View style={styles.topBar}>
              <View style={styles.channelInfoBar}>
                <Text style={styles.channelName} numberOfLines={1}>
                  {channel.name}
                </Text>
                {channel.number && (
                  <Text style={styles.channelNumber}>Ch {channel.number}</Text>
                )}
              </View>
              <View style={styles.topBarButtons}>
                <TouchableOpacity onPress={toggleAspectRatio} style={styles.aspectRatioButton}>
                  <Ionicons 
                    name={
                      resizeMode === ResizeMode.CONTAIN ? "contract" : 
                      resizeMode === ResizeMode.COVER ? "expand" : 
                      "scan"
                    } 
                    size={24} 
                    color={COLORS.text} 
                  />
                  <Text style={styles.aspectRatioText}>
                    {resizeMode === ResizeMode.CONTAIN ? "Fit" : 
                     resizeMode === ResizeMode.COVER ? "Fill" : 
                     "Stretch"}
                  </Text>
                </TouchableOpacity>
                {/* Mute / Unmute for web autoplay fallback */}
                <TouchableOpacity
                  onPress={() => {
                    setIsMuted(prev => {
                      const next = !prev;
                      try {
                        const el: any = (videoRef as any).current;
                        if (el) el.muted = next || mutedAutoplayFallback;
                      } catch (err) {}
                      return next;
                    });
                    // If muted fallback was used and user asked to unmute, try to unmute and resume
                    if (mutedAutoplayFallback) {
                      try {
                        const el: any = (videoRef as any).current;
                        if (el) {
                          el.muted = false;
                          // Try to play again to ensure audio resumes
                          const p = webPlay(el, 'mute-unmute-resume');
                          if (p && typeof p.catch === 'function') p.catch(() => {});
                          setMutedAutoplayFallback(false);
                        }
                      } catch (err) {}
                    }
                  }}
                  style={styles.aspectRatioButton}
                >
                  <Ionicons name={isMuted || mutedAutoplayFallback ? 'volume-mute' : 'volume-high'} size={24} color={isMuted || mutedAutoplayFallback ? COLORS.primary : COLORS.text} />
                  <Text style={styles.aspectRatioText}>{(isMuted || mutedAutoplayFallback) ? 'Muted' : 'Sound'}</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.subtitleButton}
                  onPress={() => {
                    console.log('🎬 [LiveTVPlayer] CC button pressed');
                    console.log('  - channel:', channel.name);
                    console.log('  - isGenerating:', isGenerating);
                    console.log('  - subtitles.length:', subtitles.length);
                    console.log('  - showSubtitles:', showSubtitles);
                    console.log('  - streamUrl:', streamUrl.substring(0, 100) + '...');
                    console.log('  - videoId:', videoId);
                    
                    if (!isGenerating && subtitles.length === 0) {
                      console.log('▶️ [LiveTVPlayer] Starting subtitle generation...');
                      startGeneration();
                    } else if (isGenerating) {
                      console.log('🛑 [LiveTVPlayer] Cancelling subtitle generation...');
                      cancelGeneration();
                    } else {
                      const newVisibility = !showSubtitles;
                      setShowSubtitles(newVisibility);
                      console.log('👁️ [LiveTVPlayer] Toggling subtitle visibility:', newVisibility);
                      console.log('  - current playback position:', (position / 1000).toFixed(2) + 's');
                    }
                  }}
                >
                  <Ionicons 
                    name={
                      isGenerating ? "sync" : 
                      subtitles.length > 0 && showSubtitles ? "chatbox" : 
                      "chatbox-outline"
                    } 
                    size={24} 
                    color={isGenerating ? COLORS.primary : COLORS.text} 
                  />
                  <Text style={[
                    styles.subtitleText,
                    isGenerating && { color: COLORS.primary }
                  ]}>
                    {isGenerating 
                      ? `${subtitleProgress?.percent?.toFixed(0) || 0}%`
                      : 'CC'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                  <Ionicons name="close" size={32} color={COLORS.text} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Center Controls - Horizontal Layout */}
            <View style={styles.centerControls}>
              <TouchableOpacity 
                onPress={handlePreviousChannel} 
                style={styles.navButton}
                disabled={channels.findIndex(ch => ch.id === channel.id) === 0}
              >
                <Ionicons name="chevron-back" size={48} color={COLORS.text} />
              </TouchableOpacity>
              
              <TouchableOpacity onPress={togglePlayPause} style={styles.playButton}>
                <Ionicons 
                  name={isPlaying ? 'pause' : 'play'} 
                  size={64} 
                  color={COLORS.text} 
                />
              </TouchableOpacity>

              <TouchableOpacity 
                onPress={handleNextChannel} 
                style={styles.navButton}
                disabled={channels.findIndex(ch => ch.id === channel.id) === channels.length - 1}
              >
                <Ionicons name="chevron-forward" size={48} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            {/* Bottom Bar */}
            <View style={styles.bottomBar}>
              <View style={styles.liveIndicator}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
              <Text style={styles.swipeHint}>Swipe ← → to change channel</Text>
            </View>
          </>
        )}

        {/* Subtitle Overlay */}
        {showSubtitles && subtitles.length > 0 && (
          <SubtitleOverlay
            subtitles={subtitles}
            currentTime={position / 1000} // Convert milliseconds to seconds
            visible={showSubtitles}
          />
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  webSafeArea: {
    flex: 1,
    backgroundColor: '#000',
    // Use fixed position to cover viewport (avoid vw/vh in RN style types).
    // Increase the z-index to ensure overlay is above all app chrome / navigation.
    position: 'fixed' as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2147483647,
    overflow: 'hidden',
  },
  videoContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  video: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    zIndex: 1000,
  },
  channelInfoBar: {
    flex: 1,
  },
  channelName: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
  },
  channelNumber: {
    color: COLORS.textMuted,
    fontSize: 14,
    marginTop: 2,
  },
  topBarButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  aspectRatioButton: {
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  aspectRatioText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '600',
  },
  subtitleButton: {
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  subtitleText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '600',
  },
  closeButton: {
    padding: SPACING.md,
  },
  centerControls: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    transform: [{ translateY: -60 }],
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl * 2,
    zIndex: 999,
  },
  navButton: {
    padding: SPACING.lg,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 50,
  },
  playButton: {
    padding: SPACING.xl,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 60,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  backOverlay: {
    position: 'absolute',
    top: SPACING.lg,
    left: SPACING.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 1001,
  },
  backOverlayText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: SPACING.sm,
    maxWidth: '60%'
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.error,
  },
  liveText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  swipeHint: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  loadingText: {
    color: COLORS.text,
    fontSize: 16,
    marginTop: SPACING.md,
  },
  bufferingOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -50 }, { translateY: -50 }],
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
    borderRadius: 12,
  },
  bufferingText: {
    color: COLORS.text,
    fontSize: 14,
    marginTop: SPACING.sm,
  },
  errorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
  },
  errorText: {
    color: COLORS.text,
    fontSize: 18,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
    textAlign: 'center',
    paddingHorizontal: SPACING.xl,
    fontWeight: '600',
  },
  errorHint: {
    color: COLORS.textMuted,
    fontSize: 14,
    marginBottom: SPACING.xl,
    textAlign: 'center',
    paddingHorizontal: SPACING.xl,
  },
  errorButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  retryText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
  closeErrorButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  closeErrorText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
});
