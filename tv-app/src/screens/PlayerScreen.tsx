import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  BackHandler,
  Dimensions,
} from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
import Video from 'react-native-video';
import { ApiClient } from '../lib/api-client';
import { useAuthStore } from '../lib/store';

interface PlayerScreenProps {
  route: {
    params: {
      id: string;
      title: string;
      type: 'channel' | 'movie' | 'episode';
      cmd: string;
      seriesId?: string;
      seasonId?: string;
      episodeNumber?: string;
    };
  };
  navigation: any;
}

export function PlayerScreen({ route, navigation }: PlayerScreenProps) {
  const { id, title, type, cmd, episodeNumber } = route.params;
  const { macAddress, portalUrl } = useAuthStore();
  const [apiClient] = useState(() => new ApiClient({ mac: macAddress!, url: portalUrl! }));
  
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [paused, setPaused] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [selectedControl, setSelectedControl] = useState<'back' | 'rewind' | 'play' | 'forward'>('play');
  
  const videoRef = useRef<any>(null);
  const controlsTimeout = useRef<any>(null);

  useEffect(() => {
    loadStream();
    
    // Handle back button
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (controlsVisible) {
        if (selectedControl === 'back') {
          navigation.goBack();
        } else {
          setSelectedControl('back');
        }
        return true;
      } else {
        showControls();
        return true;
      }
    });

    return () => {
      backHandler.remove();
      if (controlsTimeout.current) {
        clearTimeout(controlsTimeout.current);
      }
    };
  }, [controlsVisible, selectedControl]);

  const loadStream = async () => {
    if (!macAddress || !portalUrl) {
      setError('MAC address, portal URL, and cmd are required');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      console.log('[PlayerScreen] Loading stream:', { type, id, cmd });

      // For channels, use cmd directly
      if (type === 'channel') {
        const { url } = await apiClient.getStreamUrl(cmd, 'itv');
        setStreamUrl(url);
        return;
      }

      // For movies, get movie info first
      if (type === 'movie') {
        const movieInfo = await apiClient.getMovieInfo(id);
        if (!movieInfo || !movieInfo.id) {
          setError('No file information found');
          setLoading(false);
          return;
        }
        const movieCmd = `/media/file_${movieInfo.id}.mpg`;
        const { url } = await apiClient.getStreamUrl(movieCmd, 'vod');
        setStreamUrl(url);
        return;
      }

      // For series episodes
      if (type === 'episode' && route.params.seriesId && route.params.seasonId) {
        const fileInfo = await apiClient.getSeriesFileInfo(
          route.params.seriesId,
          route.params.seasonId,
          id
        );
        
        if (!fileInfo || !fileInfo.id) {
          setError('No file information found for episode');
          setLoading(false);
          return;
        }
        
        const episodeCmd = `/media/file_${fileInfo.id}.mpg`;
        const { url } = await apiClient.getStreamUrl(episodeCmd, 'series', episodeNumber);
        setStreamUrl(url);
        return;
      }

      setError('Invalid content type or missing parameters');
    } catch (err) {
      console.error('Failed to load stream:', err);
      setError(err instanceof Error ? err.message : 'Failed to load video stream');
    } finally {
      setLoading(false);
    }
  };

  const hideControlsAfterDelay = () => {
    if (controlsTimeout.current) {
      clearTimeout(controlsTimeout.current);
    }
    controlsTimeout.current = setTimeout(() => {
      setControlsVisible(false);
    }, 5000);
  };

  const showControls = () => {
    setControlsVisible(true);
    hideControlsAfterDelay();
  };

  const togglePlayPause = () => {
    setPaused(!paused);
    showControls();
  };

  const handleSeek = (seconds: number) => {
    const newTime = Math.max(0, Math.min(duration, currentTime + seconds));
    videoRef.current?.seek(newTime);
    showControls();
  };

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ff0000" />
        <Text style={styles.loadingText}>Loading stream...</Text>
      </View>
    );
  }

  if (error || !streamUrl) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error || 'Stream not available'}</Text>
        <Pressable
          style={styles.errorButton}
          onPress={() => navigation.goBack()}
          focusable={true}
          hasTVPreferredFocus
        >
          <Text style={styles.errorButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable style={styles.container} onPress={showControls}>
      <Video
        ref={videoRef}
        source={{ uri: streamUrl }}
        style={styles.video}
        resizeMode="contain"
        paused={paused}
        onProgress={({ currentTime, playableDuration }) => {
          setCurrentTime(currentTime);
          setDuration(playableDuration);
        }}
        onLoad={({ duration }) => setDuration(duration)}
        onError={(err) => {
          console.error('Video error:', err);
          setError('Playback error occurred');
        }}
      />

      {controlsVisible && (
        <View style={styles.controlsOverlay}>
          {/* Top bar */}
          <View style={styles.topBar}>
            <Pressable
              style={[
                styles.backButton,
                selectedControl === 'back' && styles.controlButtonFocused,
              ]}
              onPress={() => navigation.goBack()}
              hasTVPreferredFocus
              focusable={true}
            >
              <Text style={[
                styles.backButtonText,
                selectedControl === 'back' && styles.controlTextFocused,
              ]}>
                ← Back
              </Text>
            </Pressable>
            <Text style={styles.titleText} numberOfLines={1}>
              {title}
            </Text>
          </View>

          {/* Center controls */}
          <View style={styles.centerControls}>
            <Pressable
              style={[
                styles.controlButton,
                selectedControl === 'rewind' && styles.controlButtonFocused,
              ]}
              onPress={() => handleSeek(-30)}
              focusable={true}
            >
              <Text style={[
                styles.controlButtonText,
                selectedControl === 'rewind' && styles.controlTextFocused,
              ]}>
                ⏪30s
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.controlButton,
                styles.playButton,
                selectedControl === 'play' && styles.controlButtonFocused,
              ]}
              onPress={togglePlayPause}
              focusable={true}
            >
              <Text style={[
                styles.playButtonText,
                selectedControl === 'play' && styles.controlTextFocused,
              ]}>
                {paused ? '▶' : '⏸'}
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.controlButton,
                selectedControl === 'forward' && styles.controlButtonFocused,
              ]}
              onPress={() => handleSeek(30)}
              focusable={true}
            >
              <Text style={[
                styles.controlButtonText,
                selectedControl === 'forward' && styles.controlTextFocused,
              ]}>
                30s⏩
              </Text>
            </Pressable>
          </View>

          {/* Bottom bar */}
          <View style={styles.bottomBar}>
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` },
                  ]}
                />
              </View>
              <View style={styles.timeContainer}>
                <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
                <Text style={styles.timeText}>{formatTime(duration)}</Text>
              </View>
            </View>
          </View>

          {/* Control hints */}
          <View style={styles.controlHints}>
            <Text style={styles.hintText}>
              ◀ ▶ Navigate • OK to select • ⏯ Play/Pause • ⏪ ⏩ Seek • Back to exit
            </Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  video: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  loadingText: {
    color: '#ffffff',
    fontSize: 18,
    marginTop: 20,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
    padding: 40,
  },
  errorText: {
    color: '#ff0000',
    fontSize: 24,
    marginBottom: 30,
    textAlign: 'center',
  },
  errorButton: {
    backgroundColor: '#ff0000',
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 8,
  },
  errorButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 40,
  },
  backButton: {
    marginRight: 20,
  },
  backButtonText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '600',
  },
  titleText: {
    flex: 1,
    color: '#ffffff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  centerControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 40,
  },
  controlButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 30,
    paddingVertical: 20,
    borderRadius: 12,
  },
  controlButtonText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '600',
  },
  playButton: {
    backgroundColor: 'rgba(255, 0, 0, 0.8)',
    paddingHorizontal: 40,
    paddingVertical: 25,
  },
  playButtonText: {
    color: '#ffffff',
    fontSize: 36,
  },
  bottomBar: {
    padding: 40,
  },
  progressContainer: {
    width: '100%',
  },
  progressBar: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 3,
    marginBottom: 10,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#ff0000',
    borderRadius: 3,
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: {
    color: '#ffffff',
    fontSize: 16,
  },
  controlButtonFocused: {
    backgroundColor: '#ff0000',
    transform: [{ scale: 1.1 }],
    borderWidth: 3,
    borderColor: '#ffffff',
  },
  controlTextFocused: {
    fontWeight: 'bold',
  },
  controlHints: {
    position: 'absolute',
    bottom: 120,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hintText: {
    color: '#cccccc',
    fontSize: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
});
