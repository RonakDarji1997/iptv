import React, {useState, useRef, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import {useRoute, useNavigation, RouteProp} from '@react-navigation/native';
import Video, {VideoRef} from 'react-native-video';
import {useTVRemote} from '../hooks/useTVRemote';
import {RootStackParamList} from '../navigation/RootNavigator';
import {ROUTES} from '../config';

type PlayerScreenRouteProp = RouteProp<RootStackParamList, typeof ROUTES.PLAYER>;

const {width: SCREEN_WIDTH, height: SCREEN_HEIGHT} = Dimensions.get('window');

const PlayerScreen = () => {
  const route = useRoute<PlayerScreenRouteProp>();
  const navigation = useNavigation();
  const {streamUrl, title, type} = route.params;

  const videoRef = useRef<VideoRef>(null);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    showControlsTemporarily();
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, []);

  const showControlsTemporarily = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 5000);
  };

  const handlePlayPause = () => {
    setPaused(!paused);
    showControlsTemporarily();
  };

  const handleSeek = (seconds: number) => {
    if (videoRef.current) {
      const newTime = Math.max(0, Math.min(currentTime + seconds, duration));
      videoRef.current.seek(newTime);
      setCurrentTime(newTime);
      showControlsTemporarily();
    }
  };

  const handleBack = () => {
    navigation.goBack();
  };

  useTVRemote({
    onSelect: handlePlayPause,
    onPlayPause: handlePlayPause,
    onLeft: () => handleSeek(-10),
    onRight: () => handleSeek(10),
    onUp: showControlsTemporarily,
    onDown: showControlsTemporarily,
    onBack: handleBack,
    onMenu: handleBack,
  });

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <Video
        ref={videoRef}
        source={{uri: streamUrl}}
        style={styles.video}
        paused={paused}
        resizeMode="contain"
        onLoad={data => {
          setLoading(false);
          setDuration(data.duration);
        }}
        onProgress={data => {
          setCurrentTime(data.currentTime);
        }}
        onError={err => {
          setLoading(false);
          setError(err.error?.errorString || 'Failed to load video');
          console.error('Video error:', err);
        }}
        onBuffer={({isBuffering}) => {
          setLoading(isBuffering);
        }}
      />

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      )}

      {error && (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={handleBack} style={styles.errorButton}>
            <Text style={styles.errorButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      )}

      {showControls && !error && (
        <View style={styles.controlsOverlay}>
          <View style={styles.topControls}>
            <Text style={styles.titleText}>{title}</Text>
          </View>

          <View style={styles.centerControls}>
            <TouchableOpacity onPress={handlePlayPause} style={styles.playButton}>
              <Text style={styles.playButtonText}>{paused ? '▶' : '❚❚'}</Text>
            </TouchableOpacity>
          </View>

          {type !== 'live' && (
            <View style={styles.bottomControls}>
              <Text style={styles.timeText}>
                {formatTime(currentTime)} / {formatTime(duration)}
              </Text>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    {width: `${(currentTime / duration) * 100}%`},
                  ]}
                />
              </View>
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  video: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  loadingText: {
    color: '#fff',
    fontSize: 18,
    marginTop: 16,
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.9)',
    padding: 40,
  },
  errorText: {
    color: '#fff',
    fontSize: 20,
    textAlign: 'center',
    marginBottom: 24,
  },
  errorButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 8,
  },
  errorButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: '600',
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  topControls: {
    padding: 40,
  },
  titleText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
  },
  centerControls: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButtonText: {
    color: '#fff',
    fontSize: 40,
  },
  bottomControls: {
    padding: 40,
  },
  timeText: {
    color: '#fff',
    fontSize: 18,
    marginBottom: 12,
  },
  progressBar: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#fff',
  },
});

export default PlayerScreen;
