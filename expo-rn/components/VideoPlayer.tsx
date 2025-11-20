import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, Platform, Pressable, Text } from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface VideoPlayerProps {
  uri: string;
  autoPlay?: boolean;
  title?: string;
  onBack?: () => void;
  startPosition?: number; // Resume from this position in seconds
  onProgressUpdate?: (currentTime: number, duration: number) => void;
  onVideoEnd?: () => void; // Callback when video finishes playing
}

export default function VideoPlayer({ uri, autoPlay = true, title, onBack, startPosition = 0, onProgressUpdate, onVideoEnd }: VideoPlayerProps) {
  const videoRef = useRef<Video>(null);
  const [status, setStatus] = useState<AVPlaybackStatus | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [aspectIndex, setAspectIndex] = useState(0);
  const insets = useSafeAreaInsets();
  const isTV: boolean = (Platform as unknown as { isTV?: boolean }).isTV === true;

  const aspectOptions = [undefined, 16/9, 4/3, 21/9, 2.35, 1];

  const togglePlayPause = useCallback(() => {
    if (!status || !status.isLoaded || !videoRef.current) return;
    if (status.isPlaying) {
      videoRef.current.pauseAsync();
    } else {
      videoRef.current.playAsync();
    }
  }, [status]);

  const cycleAspect = useCallback(() => {
    setAspectIndex(i => (i + 1) % aspectOptions.length);
  }, [aspectOptions.length]);

  const currentAspect = aspectOptions[aspectIndex];

  useEffect(() => {
    if (Platform.OS !== 'web') {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    }
    return () => {
      if (Platform.OS !== 'web') {
        ScreenOrientation.unlockAsync();
      }
    };
  }, []);

  if (Platform.OS === 'web') {
    const videoElRef = useRef<HTMLVideoElement>(null);
    const progressTimerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
      const videoEl = videoElRef.current;
      if (!videoEl) return;

      // Set start position when video loads
      const handleLoadedMetadata = () => {
        if (startPosition > 0) {
          videoEl.currentTime = startPosition;
        }
      };

      // Track progress every 15 seconds
      const handleTimeUpdate = () => {
        if (progressTimerRef.current) {
          clearTimeout(progressTimerRef.current);
        }
        
        progressTimerRef.current = setTimeout(() => {
          if (onProgressUpdate && videoEl.duration) {
            onProgressUpdate(videoEl.currentTime, videoEl.duration);
          }
        }, 15000); // Save every 15 seconds
      };

      // Save progress when pausing or ending
      const handlePauseOrEnd = () => {
        if (onProgressUpdate && videoEl.duration) {
          onProgressUpdate(videoEl.currentTime, videoEl.duration);
        }
      };

      videoEl.addEventListener('loadedmetadata', handleLoadedMetadata);
      videoEl.addEventListener('timeupdate', handleTimeUpdate);
      videoEl.addEventListener('pause', handlePauseOrEnd);
      videoEl.addEventListener('ended', handlePauseOrEnd);

      return () => {
        videoEl.removeEventListener('loadedmetadata', handleLoadedMetadata);
        videoEl.removeEventListener('timeupdate', handleTimeUpdate);
        videoEl.removeEventListener('pause', handlePauseOrEnd);
        videoEl.removeEventListener('ended', handlePauseOrEnd);
        if (progressTimerRef.current) {
          clearTimeout(progressTimerRef.current);
        }
        // Save progress on unmount
        if (onProgressUpdate && videoEl.duration) {
          onProgressUpdate(videoEl.currentTime, videoEl.duration);
        }
      };
    }, [startPosition, onProgressUpdate]);

    return (
      <View style={styles.webContainer}>
        <video
          ref={videoElRef}
          src={uri}
          autoPlay={autoPlay}
          controls
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            background: '#000',
            display: 'block'
          }}
        />
        {/* Top bar with title and back button */}
        <View style={[styles.overlay, { paddingTop: insets.top }]} pointerEvents="box-none">
          <View style={styles.topBar}>
            {onBack && (
              <Pressable style={[styles.iconButton, styles.backButton]} onPress={onBack}>
                <Text style={styles.iconText}>←</Text>
              </Pressable>
            )}
            {title && <Text style={styles.title} numberOfLines={1}>{title}</Text>}
          </View>
        </View>
      </View>
    );
  }

  // Track progress for native video
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    if (!videoRef.current || !status || !('isLoaded' in status) || !status.isLoaded) return;
    
    // Set start position
    if (startPosition > 0 && status.positionMillis === 0) {
      videoRef.current.setPositionAsync(startPosition * 1000);
    }
    
    // Track progress every 15 seconds
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }
    
    progressIntervalRef.current = setInterval(() => {
      if (onProgressUpdate && status.isLoaded && status.durationMillis) {
        const currentTime = status.positionMillis / 1000;
        const duration = status.durationMillis / 1000;
        onProgressUpdate(currentTime, duration);
      }
    }, 15000);
    
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      // Save progress on unmount
      if (onProgressUpdate && status.isLoaded && status.durationMillis) {
        const currentTime = status.positionMillis / 1000;
        const duration = status.durationMillis / 1000;
        onProgressUpdate(currentTime, duration);
      }
    };
  }, [status, startPosition, onProgressUpdate]);

  return (
    <View style={styles.nativeRoot}>
      <Pressable style={styles.fullscreenTouch} onPress={() => setControlsVisible(v => !v)} />
      <Video
        ref={videoRef}
        source={{ uri }}
        style={[styles.nativeVideo, currentAspect ? { aspectRatio: currentAspect } : null]}
        resizeMode={ResizeMode.COVER}
        shouldPlay={autoPlay}
        onPlaybackStatusUpdate={(status) => {
          setStatus(status);
          // Check if video ended
          if (status.isLoaded && status.didJustFinish && onVideoEnd) {
            onVideoEnd();
          }
        }}
      />
      {controlsVisible && (
        <View style={[styles.overlay, { paddingTop: insets.top }]}>
          <View style={[styles.topBar, isTV && styles.topBarTV]}>
            {onBack && (
              <Pressable style={[styles.iconButton, styles.backButton]} onPress={onBack}>
                <Text style={[styles.iconText, isTV && styles.iconTextTV]}>⟵</Text>
              </Pressable>
            )}
            {title && <Text style={[styles.title, isTV && styles.titleTV]} numberOfLines={1}>{title}</Text>}
            <View style={styles.rightCluster}>
              <Pressable style={styles.iconButton} onPress={togglePlayPause}>
                <Text style={[styles.iconText, isTV && styles.iconTextTV]}>{status?.isLoaded && status.isPlaying ? '❚❚' : '▶'}</Text>
              </Pressable>
              <Pressable style={styles.iconButton} onPress={cycleAspect}>
                <Text style={[styles.iconText, isTV && styles.iconTextTV]}>{currentAspect ? aspectOptions[aspectIndex] === 1 ? '1:1' : `${(aspectOptions[aspectIndex] as number).toFixed(2)}` : 'AUTO'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  webContainer: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
  },
  nativeRoot: {
    flex: 1,
    backgroundColor: '#000',
  },
  nativeVideo: {
    width: '100%',
    height: '100%',
  },
  fullscreenTouch: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-start',
    zIndex: 2,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 44 : 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
    gap: 12,
  },
  topBarTV: {
    paddingHorizontal: 32,
    paddingTop: 32,
    paddingBottom: 24,
  },
  rightCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    padding: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  iconButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 4,
  },
  iconText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  iconTextTV: {
    fontSize: 28,
  },
  title: {
    flex: 1,
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  titleTV: {
    fontSize: 28,
  },
});
