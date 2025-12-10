import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  View, 
  StyleSheet, 
  ActivityIndicator, 
  TouchableOpacity, 
  Text, 
  Dimensions,
  PanResponder,
  Animated,
  StatusBar,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, IS_TABLET } from '../constants';
import SubtitleOverlay from './SubtitleOverlay';
import { useSubtitles } from '../hooks/useSubtitles';

interface VODPlayerProps {
  streamUrl: string;
  title: string;
  onClose: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  onEnded?: () => void;
}

const { width, height } = Dimensions.get('window');

export const VODPlayer: React.FC<VODPlayerProps> = ({ streamUrl, title, onClose, onNext, onPrevious, onEnded }) => {
  const videoRef = useRef<Video>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seekIndicator, setSeekIndicator] = useState<string | null>(null);
  const [resizeMode, setResizeMode] = useState<ResizeMode>(ResizeMode.CONTAIN);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState(0);
  const [progressBarWidth, setProgressBarWidth] = useState(width - 200);
  const [isBuffering, setIsBuffering] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [showSubtitles, setShowSubtitles] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  
  // Subtitle integration
  const videoId = `vod_${title.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const {
    subtitles,
    loading: subtitlesLoading,
    progress: subtitleProgress,
    error: subtitleError,
    isGenerating,
    startGeneration,
    cancelGeneration,
    getCurrentSubtitle,
  } = useSubtitles({
    streamUrl,
    videoId,
    autoStart: false,
    model: 'tiny',
  });

  // Subtitle state is manually controlled by CC button
  
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekFadeAnim = useRef(new Animated.Value(0)).current;
  const lastTapRef = useRef<number>(0);
  const tapLocationRef = useRef<{ x: number, y: number }>({ x: 0, y: 0 });
  const initialPinchDistance = useRef<number | null>(null);
  const isPinching = useRef<boolean>(false);
  const [currentOrientation, setCurrentOrientation] = useState<number>(0);
  const MAX_RETRIES = 3;

  // Cancel subtitle generation when component unmounts or new video starts
  useEffect(() => {
    return () => {
      if (isGenerating) {
        console.log('🧹 [VODPlayer] Cleanup: Cancelling subtitle generation');
        cancelGeneration();
      }
    };
  }, [isGenerating, cancelGeneration]);

  const loadVideo = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('🎬 [VODPlayer] Initializing video...');
      console.log('  Stream URL:', streamUrl);
      console.log('  Title:', title);
      console.log('  Platform:', Platform.OS);
      
      // Configure audio mode for Expo Go
      const { Audio } = await import('expo-av');
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      
      console.log('✅ [VODPlayer] Audio mode configured, video will auto-load from source prop');
      
      // With source prop, video loads automatically
      // The onPlaybackStatusUpdate will handle the rest
      
    } catch (err: any) {
      console.error('❌ Failed to initialize video:', err);
      console.error('❌ Error details:', JSON.stringify(err));
      
      let errorMessage = 'Failed to load video';
      if (err.message?.includes('-1100')) {
        errorMessage = 'Unable to play this video. The stream may be unavailable or the format is not supported.';
      } else if (err.message?.includes('network')) {
        errorMessage = 'Network error. Please check your connection.';
      } else if (err.message?.includes('timeout')) {
        errorMessage = 'Video loading timed out. Please try again.';
      }
      
      setError(errorMessage);
    }
  }, [streamUrl, title]);

  useEffect(() => {
    // Load video immediately
    void loadVideo();
    
    // Start in portrait - rotation button will control it
    const setupOrientation = async () => {
      try {
        // Lock to portrait initially
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        
        // Get initial orientation
        const orientation = await ScreenOrientation.getOrientationAsync();
        setCurrentOrientation(orientation);
        
        // Listen to orientation changes
        const subscription = ScreenOrientation.addOrientationChangeListener((event) => {
          const { orientationInfo } = event;
          setCurrentOrientation(orientationInfo.orientation);
        });
        
        return subscription;
      } catch (error) {
        console.error('Failed to set orientation:', error);
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
      if (subscription) {
        subscription.remove();
      }
      // Restore portrait orientation when leaving player
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount only
  
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
    console.log('🔔 [VODPlayer] Status update:', {
      isLoaded: status.isLoaded,
      isPlaying: status.isLoaded && status.isPlaying,
      isBuffering: status.isLoaded && status.isBuffering,
      positionMillis: status.isLoaded && status.positionMillis,
      durationMillis: status.isLoaded && status.durationMillis,
      error: !status.isLoaded && status.error,
    });
    
    if (status.isLoaded) {
      setIsLoading(false);
      setIsPlaying(status.isPlaying);
      setIsBuffering(status.isBuffering);
      
      // Reset retry count on successful playback
      if (status.isPlaying) {
        console.log('✅ [VODPlayer] Video is now playing!');
        setRetryCount(0);
        setError(null);
      }
      
      // Only update position if user is not dragging the progress bar
      if (!isDragging) {
        setPosition(status.positionMillis);
      }
      
      setDuration(status.durationMillis || 0);
      
      // Auto-play next episode when current ends
      if (status.didJustFinish && onEnded) {
        console.log('📺 Episode finished, auto-playing next');
        onEnded();
      }
    } else if (status.error) {
      console.error('❌ Playback error:', status.error);
      setIsLoading(false);
      
      // Auto-retry logic
      if (retryCount < MAX_RETRIES) {
        console.log(`🔄 Auto-retrying... Attempt ${retryCount + 1}/${MAX_RETRIES}`);
        setRetryCount(prev => prev + 1);
        setError(null);
        
        // Retry after 2 seconds
        retryTimeoutRef.current = setTimeout(() => {
          loadVideo();
        }, 2000);
      } else {
        setError(`Playback error after ${MAX_RETRIES} attempts`);
      }
    }
  };

  const togglePlayPause = async () => {
    if (videoRef.current) {
      if (isPlaying) {
        await videoRef.current.pauseAsync();
      } else {
        await videoRef.current.playAsync();
      }
    }
  };

  const toggleResizeMode = () => {
    setResizeMode(prev => {
      if (prev === ResizeMode.CONTAIN) return ResizeMode.COVER;
      if (prev === ResizeMode.COVER) return ResizeMode.STRETCH;
      return ResizeMode.CONTAIN;
    });
  };

  const seek = async (milliseconds: number) => {
    if (videoRef.current) {
      const newPosition = Math.max(0, Math.min(duration, position + milliseconds));
      await videoRef.current.setPositionAsync(newPosition);
      setPosition(newPosition);
    }
  };

  const seekTo = async (milliseconds: number) => {
    if (videoRef.current) {
      await videoRef.current.setPositionAsync(milliseconds);
      setPosition(milliseconds);
    }
  };

  const showSeekIndicator = (direction: 'forward' | 'backward') => {
    const seconds = direction === 'forward' ? '+10s' : '-10s';
    setSeekIndicator(seconds);
    
    Animated.sequence([
      Animated.timing(seekFadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.delay(800),
      Animated.timing(seekFadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => setSeekIndicator(null));
  };

  const handleDoubleTap = (x: number) => {
    // Since screen is rotated 90deg, we need to use height as width
    const screenWidth = height; // Rotated dimension
    const leftZone = screenWidth * 0.15; // Left 15%
    const rightZone = screenWidth * 0.85; // Right 85% (last 15%)
    
    console.log(`🎯 Double-tap at x=${x}, screen width=${screenWidth}, left zone=0-${leftZone}, right zone=${rightZone}-${screenWidth}`);
    
    if (x < leftZone) {
      // Left 15% - rewind
      console.log('⏪ Rewind');
      seek(-10000);
      showSeekIndicator('backward');
    } else if (x > rightZone) {
      // Right 15% - forward
      console.log('⏩ Forward');
      seek(10000);
      showSeekIndicator('forward');
    } else {
      // Center 70% - toggle fullscreen
      console.log('🔄 Toggle fullscreen');
      setResizeMode(prev => 
        prev === ResizeMode.CONTAIN ? ResizeMode.COVER : ResizeMode.CONTAIN
      );
    }
  };

  const calculateDistance = (touches: any[]) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const panResponderRef = PanResponder.create({
    onStartShouldSetPanResponder: (evt) => {
      // Always capture the gesture
      if (evt.nativeEvent.touches.length >= 2) {
        isPinching.current = true;
        initialPinchDistance.current = calculateDistance(evt.nativeEvent.touches);
      }
      return true;
    },
    onMoveShouldSetPanResponder: (evt) => {
      // Detect if user added a second finger
      if (evt.nativeEvent.touches.length >= 2) {
        if (!isPinching.current) {
          isPinching.current = true;
          initialPinchDistance.current = calculateDistance(evt.nativeEvent.touches);
        }
        return true;
      }
      return false;
    },
    onPanResponderMove: (evt) => {
      if (evt.nativeEvent.touches.length >= 2 && isPinching.current && initialPinchDistance.current) {
        const currentDistance = calculateDistance(evt.nativeEvent.touches);
        const distanceChange = currentDistance - initialPinchDistance.current;
        
        // Pinch out (spread fingers) = fullscreen (COVER)
        // Pinch in (bring fingers together) = fit screen (CONTAIN)
        if (Math.abs(distanceChange) > 20) {
          const newMode = distanceChange > 0 ? ResizeMode.COVER : ResizeMode.CONTAIN;
          if (newMode !== resizeMode) {
            setResizeMode(newMode);
          }
          initialPinchDistance.current = currentDistance;
        }
      }
    },
    onPanResponderRelease: (evt) => {
      // Reset pinch state
      if (isPinching.current) {
        isPinching.current = false;
        initialPinchDistance.current = null;
        return; // Don't process as tap
      }
      
      // Only handle taps if not a pinch gesture
      const now = Date.now();
      const tapX = evt.nativeEvent.locationX;
      const tapY = evt.nativeEvent.locationY;
      
      // Check if this is a double tap (within 300ms)
      if (now - lastTapRef.current < 300 &&
          Math.abs(tapX - tapLocationRef.current.x) < 50 &&
          Math.abs(tapY - tapLocationRef.current.y) < 50) {
        // Double tap detected
        handleDoubleTap(tapX);
        lastTapRef.current = 0; // Reset to prevent triple tap
      } else {
        // Single tap - toggle controls
        lastTapRef.current = now;
        tapLocationRef.current = { x: tapX, y: tapY };
        setShowControls(prev => !prev);
      }
    },
  });

  const formatTime = (millis: number) => {
    const totalSeconds = Math.floor(millis / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return Platform.OS === 'web' ? (
    <View style={styles.safeArea}>
      <View style={styles.container}>
        <StatusBar hidden />
        <View style={styles.videoContainer}>
          <video
            ref={videoRef as any}
            src={streamUrl}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              backgroundColor: '#000',
            }}
            controls
            autoPlay
            onLoadedMetadata={(e: any) => {
              console.log('🎬 [VODPlayer Web] Video loaded');
              setIsLoading(false);
            }}
            onPlay={() => {
              console.log('✅ [VODPlayer Web] Video playing');
              setIsPlaying(true);
            }}
            onPause={() => {
              console.log('⏸️ [VODPlayer Web] Video paused');
              setIsPlaying(false);
            }}
            onError={(e: any) => {
              console.error('❌ [VODPlayer Web] Video error:', e);
              setError('Failed to load video');
              setIsLoading(false);
            }}
          />
          
          {/* Close Button Overlay */}
          <TouchableOpacity 
            onPress={onClose} 
            style={{
              position: 'absolute',
              top: 20,
              right: 20,
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              borderRadius: 20,
              padding: 8,
              zIndex: 1000,
            }}
          >
            <Ionicons name="close" size={28} color={COLORS.text} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  ) : (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.container}>
        <StatusBar hidden />
        <View style={styles.videoContainer} {...panResponderRef.panHandlers}>
        <Video
          ref={videoRef}
          style={styles.video}
          source={{ uri: streamUrl }}
          resizeMode={resizeMode}
          onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
          useNativeControls={false}
          shouldPlay={true}
          volume={1.0}
          isMuted={false}
        />

        {/* Loading Indicator */}
        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading video...</Text>
          </View>
        )}

        {/* Error */}
        {error && (
          <View style={styles.errorOverlay}>
            <Ionicons name="alert-circle" size={64} color={COLORS.error} />
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.errorHint}>Stream URL may be invalid or expired</Text>
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

        {/* Buffering Indicator */}
        {isBuffering && !isLoading && (
          <View style={styles.bufferingOverlay}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.bufferingText}>Buffering...</Text>
          </View>
        )}

        {/* Seek Indicator */}
        {seekIndicator && (
          <Animated.View style={[styles.seekIndicator, { opacity: seekFadeAnim }]}>
            <Ionicons 
              name={seekIndicator.startsWith('+') ? 'play-forward' : 'play-back'} 
              size={48} 
              color={COLORS.primary} 
            />
            <Text style={styles.seekText}>{seekIndicator}</Text>
          </Animated.View>
        )}

        {/* Overlay Controls */}
        {showControls && !isLoading && !error && (
          <>
            {/* Top Bar */}
            <View style={styles.topBar}>
              <Text style={styles.title} numberOfLines={1}>{title}</Text>
              <View style={styles.topBarButtons}>
                <TouchableOpacity onPress={toggleResizeMode} style={styles.aspectRatioButton}>
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
                    const newState = !showSubtitles;
                    const currentPos = position / 1000;
                    console.log('🎬 [VODPlayer] CC button toggled:', showSubtitles, '→', newState);
                    
                    if (newState && subtitles.length > 0) {
                      // Show where generation started from
                      console.log('  - Generation started from:', subtitles[0].startTime.toFixed(1) + 's');
                    }
                    
                    setShowSubtitles(newState);
                    
                    if (newState) {
                      // Turning on - start/resume generation from current position
                      const currentPos = Math.floor(position / 1000);
                      
                      if (isGenerating) {
                        console.log('🔄 [VODPlayer] Cancelling previous generation...');
                        cancelGeneration().then(() => {
                          console.log('▶️ [VODPlayer] Starting new generation from:', currentPos + 's');
                          startGeneration(currentPos);
                        });
                      } else {
                        console.log('  ▶️ Starting/resuming generation from:', currentPos + 's');
                        startGeneration(currentPos);
                      }
                    } else {
                      // Turning off - cancel generation if running
                      if (isGenerating) {
                        console.log('  🛑 Cancelling generation');
                        cancelGeneration();
                      }
                      console.log('  👁️ Hiding subtitles');
                    }
                  }}
                >
                  <Ionicons 
                    name={showSubtitles ? "chatbox" : "chatbox-outline"}
                    size={24} 
                    color={COLORS.text} 
                  />
                  <Text style={styles.subtitleText}>CC</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                  <Ionicons name="close" size={32} color={COLORS.text} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Center Play/Pause with Episode Navigation */}
            <View style={styles.centerControls}>
              {/* Previous button or placeholder */}
              {onPrevious ? (
                <TouchableOpacity onPress={onPrevious} style={styles.navButton}>
                  <Ionicons 
                    name="play-skip-back" 
                    size={48} 
                    color={COLORS.text} 
                  />
                </TouchableOpacity>
              ) : (
                <View style={styles.navButtonPlaceholder} />
              )}
              
              {/* Play/Pause button - always centered */}
              <TouchableOpacity onPress={togglePlayPause} style={styles.playButton}>
                <Ionicons 
                  name={isPlaying ? 'pause' : 'play'} 
                  size={64} 
                  color={COLORS.text} 
                />
              </TouchableOpacity>
              
              {/* Next button or placeholder */}
              {onNext ? (
                <TouchableOpacity onPress={onNext} style={styles.navButton}>
                  <Ionicons 
                    name="play-skip-forward" 
                    size={48} 
                    color={COLORS.text} 
                  />
                </TouchableOpacity>
              ) : (
                <View style={styles.navButtonPlaceholder} />
              )}
            </View>

            {/* Bottom Bar with Progress */}
            <View style={styles.bottomBar}>
              {/* Rotation Button */}
              <TouchableOpacity 
                style={styles.rotateButton}
                onPress={async () => {
                  // Simple toggle: 0° (portrait) ↔ 90° (landscape)
                  if (isLandscape) {
                    // Go to 0° (portrait)
                    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
                  } else {
                    // Go to 90° (landscape)
                    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_LEFT);
                  }
                  setIsLandscape(!isLandscape);
                }}
              >
                <Ionicons 
                  name={isLandscape ? "phone-landscape-outline" : "phone-portrait-outline"} 
                  size={20} 
                  color={COLORS.text} 
                />
                <Ionicons name="sync" size={14} color={COLORS.text} style={{ marginLeft: -8, marginTop: -2 }} />
              </TouchableOpacity>
              
              <View style={styles.progressContainer}>
                <Text style={styles.timeText}>{formatTime(position)}</Text>
                <View 
                  style={styles.progressBarContainer}
                  onLayout={(e) => {
                    const newWidth = e.nativeEvent.layout.width;
                    // Only update if width changed significantly (> 10px difference)
                    if (Math.abs(newWidth - progressBarWidth) > 10) {
                      console.log('📏 Progress bar width updated:', progressBarWidth, '->', newWidth);
                      setProgressBarWidth(newWidth);
                    }
                  }}
                  onStartShouldSetResponder={() => true}
                  onMoveShouldSetResponder={() => true}
                  onResponderTerminationRequest={() => false}
                  onResponderGrant={(e) => {
                    setIsDragging(true);
                    const locationX = Math.max(0, Math.min(progressBarWidth, e.nativeEvent.locationX));
                    const percent = locationX / progressBarWidth;
                    const newPos = duration * percent;
                    setDragPosition(newPos);
                  }}
                  onResponderMove={(e) => {
                    if (isDragging) {
                      const locationX = Math.max(0, Math.min(progressBarWidth, e.nativeEvent.locationX));
                      const percent = locationX / progressBarWidth;
                      const newPos = duration * percent;
                      setDragPosition(newPos);
                    }
                  }}
                  onResponderRelease={(e) => {
                    const locationX = Math.max(0, Math.min(progressBarWidth, e.nativeEvent.locationX));
                    const percent = locationX / progressBarWidth;
                    const newPosition = duration * percent;
                    console.log('⏩ Seek to:', Math.floor(newPosition/1000) + 's');
                    
                    setIsDragging(false);
                    seekTo(newPosition);
                    
                    // If subtitles are on, restart generation from new position
                    if (showSubtitles) {
                      const newPos = Math.floor(newPosition / 1000);
                      if (isGenerating) {
                        cancelGeneration();
                      }
                      setTimeout(() => {
                        startGeneration(newPos);
                      }, 300);
                    }
                  }}
                >
                  <View style={styles.progressTrack}>
                    <View 
                      style={[
                        styles.progressFill,
                        { width: duration > 0 ? ((isDragging ? dragPosition : position) / duration) * progressBarWidth : 0 }
                      ]} 
                    />
                  </View>
                  <View 
                    style={[
                      styles.progressThumb,
                      { left: duration > 0 ? ((isDragging ? dragPosition : position) / duration) * progressBarWidth - 8 : -8 }
                    ]} 
                  />
                </View>
                <Text style={styles.timeText}>{formatTime(duration)}</Text>
              </View>
            </View>
          </>
        )}

        {/* Subtitle Overlay */}
        {showSubtitles && subtitles.length > 0 && (
          <SubtitleOverlay
            subtitles={subtitles}
            currentTime={position / 1000}
            visible={showSubtitles}
          />
        )}
      </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000',
    ...(Platform.OS === 'web' && {
      width: '100vw' as any,
      height: '100vh' as any,
      overflow: 'hidden' as any,
    }),
  },
  container: {
    flex: 1,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  videoContainer: {
    flex: 1,
    backgroundColor: '#000',
    overflow: 'hidden',
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
  seekIndicator: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -60 }, { translateY: -60 }],
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 12,
    padding: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
  },
  seekText: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
    marginTop: SPACING.sm,
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
    paddingVertical: SPACING.sm,
  },
  title: {
    flex: 1,
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
  },
  topBarButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  resizeButton: {
    padding: SPACING.sm,
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
    padding: SPACING.sm,
  },
  rotateButton: {
    position: 'absolute',
    right: SPACING.lg,
    bottom: 70,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    padding: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
  },
  centerControls: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -165 }, { translateY: -40 }],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xl,
    width: 330,
  },
  playButton: {
    padding: SPACING.lg,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 50,
  },
  navButton: {
    padding: SPACING.md,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 40,
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navButtonPlaceholder: {
    width: 80,
    height: 80,
  },
  bottomBar: {
    position: 'absolute',
    bottom: IS_TABLET ? 40 : SPACING.sm,
    left: 0,
    right: 0,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  timeText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '600',
    minWidth: 45,
  },
  progressBarContainer: {
    flex: 1,
    height: 40,
    justifyContent: 'center',
    marginHorizontal: SPACING.md,
  },
  progressTrack: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
  progressThumb: {
    position: 'absolute',
    top: '50%',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    marginTop: -8,
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
});
