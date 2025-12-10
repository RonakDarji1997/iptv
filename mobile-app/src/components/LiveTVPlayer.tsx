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
  const [retryCount, setRetryCount] = useState(0);
  const [showSubtitles, setShowSubtitles] = useState(false);
  const [position, setPosition] = useState(0);
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
      setError(null);
      
      console.log('🎬 [LiveTVPlayer] Starting video load...');
      console.log('  Stream URL:', streamUrl);
      console.log('  Channel:', channel.name);
      
      // Configure audio mode for Expo Go
      const { Audio } = await import('expo-av');
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      
      if (videoRef.current) {
        console.log('🎬 Loading video with shouldPlay: true');
        await videoRef.current.loadAsync(
          { uri: streamUrl },
          { 
            shouldPlay: true,
            volume: 1.0,
            isMuted: false,
            isLooping: false,
            progressUpdateIntervalMillis: 1000,
          },
          false
        );
        console.log('✅ Video loaded successfully');
        
        // Try to play explicitly after load
        setTimeout(async () => {
          try {
            if (videoRef.current) {
              const status = await videoRef.current.getStatusAsync();
              console.log('📊 Video status after load:', {
                isLoaded: status.isLoaded,
                isPlaying: status.isLoaded && status.isPlaying,
                shouldPlay: status.isLoaded && status.shouldPlay,
              });
              
              if (status.isLoaded && !status.isPlaying) {
                console.log('🔄 Explicitly calling playAsync()...');
                await videoRef.current.playAsync();
              }
            }
          } catch (e) {
            console.error('❌ Error in explicit play:', e);
          }
        }, 500);
      }
    } catch (err) {
      console.error('❌ Failed to load stream:', err);
      setError('Failed to load stream');
    }
  }, [streamUrl, channel.name]);

  const refreshStream = useCallback(async () => {
    console.log('🔄 Refreshing stream (token may have expired)...');
    // Request a fresh stream URL from the backend
    onChannelChange(channel); // This will trigger a new stream URL fetch
  }, [channel, onChannelChange]);

  useEffect(() => {
    loadVideo();
    
    // Set up periodic stream refresh to prevent token expiration
    streamRefreshTimerRef.current = setInterval(() => {
      console.log('⏰ Periodic stream refresh (1 hour elapsed)');
      refreshStream();
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
    
    return () => {
      if (videoRef.current) {
        videoRef.current.unloadAsync();
      }
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      if (streamRefreshTimerRef.current) {
        clearInterval(streamRefreshTimerRef.current);
      }
      if (subscription) {
        subscription.remove();
      }
      // Restore portrait orientation when leaving player
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, [loadVideo, refreshStream]);
  
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

  // Auto-hide controls after 3 seconds
  useEffect(() => {
    if (showControls) {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [showControls]);

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
    if (videoRef.current) {
      if (isPlaying) {
        console.log('⏸️ USER ACTION: Pausing video');
        await videoRef.current.pauseAsync();
      } else {
        console.log('▶️ USER ACTION: Resuming video');
        await videoRef.current.playAsync();
      }
    }
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
      // Don't capture touches in the top 80px
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
          setShowControls(prev => !prev);
        }
      } else {
        // Portrait: vertical swipes
        if (gestureState.dy < -50) {
          handleNextChannel();
        } else if (gestureState.dy > 50) {
          handlePreviousChannel();
        } else {
          setShowControls(prev => !prev);
        }
      }
    },
  });

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
              <TouchableOpacity onPress={onClose} style={styles.closeErrorButton}>
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
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
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
