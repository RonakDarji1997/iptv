/**
 * Native Live TV Player
 * Supports MPEG-TS and HLS streams with hardware acceleration
 */

import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  StatusBar,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import Video, { VideoRef, OnProgressData, OnLoadData, OnBufferData } from 'react-native-video';
import type { LiveTVData } from '../types/bridge';

interface Props {
  data: LiveTVData;
  onClose: () => void;
  onProgress: (contentId: string, currentTime: number, duration: number, buffered?: number) => void;
  onError: (error: string, code?: number) => void;
}

export default function NativeLiveTVPlayer({ data, onClose, onProgress, onError }: Props) {
  const videoRef = useRef<VideoRef>(null);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1.0);
  const [showControls, setShowControls] = useState(true);
  const [isBuffering, setIsBuffering] = useState(true);
  const [duration, setDuration] = useState(0);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  const handleLoad = (data: OnLoadData) => {
    console.log('[LiveTV] Video loaded:', data.duration);
    setDuration(data.duration);
    setIsBuffering(false);
  };

  const handleProgress = (progressData: OnProgressData) => {
    const contentId = data.cmd || data.title;
    onProgress(
      contentId,
      progressData.currentTime,
      duration || progressData.seekableDuration,
      progressData.playableDuration
    );
  };

  const handleBuffer = (bufferData: OnBufferData) => {
    console.log('[LiveTV] Buffering:', bufferData.isBuffering);
    setIsBuffering(bufferData.isBuffering);
  };

  const handleVideoError = (error: any) => {
    console.error('[LiveTV] Video error:', error);
    onError(error.error?.errorString || 'Playback failed', error.error?.errorCode);
  };

  const toggleControls = () => {
    setShowControls(!showControls);
  };

  const toggleMute = () => {
    setMuted(!muted);
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      
      {/* Video Player */}
      <TouchableOpacity
        style={styles.videoContainer}
        activeOpacity={1}
        onPress={toggleControls}>
        <Video
          ref={videoRef}
          source={{ uri: data.url }}
          style={styles.video}
          paused={paused}
          muted={muted}
          volume={volume}
          resizeMode="contain"
          // Live TV optimizations
          playInBackground={false}
          playWhenInactive={false}
          // Bufferring
          bufferConfig={{
            minBufferMs: 15000,
            maxBufferMs: 30000,
            bufferForPlaybackMs: 2500,
            bufferForPlaybackAfterRebufferMs: 5000,
          }}
          // Callbacks
          onLoad={handleLoad}
          onProgress={handleProgress}
          onBuffer={handleBuffer}
          onError={handleVideoError}
          // Performance
          reportBandwidth={true}
          // HLS/MPEG-TS support
          automaticallyWaitsToMinimizeStalling={true}
        />

        {/* Loading Indicator */}
        {isBuffering && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.loadingText}>Loading stream...</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Controls Overlay */}
      {showControls && (
        <>
          {/* Top Bar */}
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.iconText}>←</Text>
            </TouchableOpacity>
            <View style={styles.titleContainer}>
              <Text style={styles.title} numberOfLines={1}>
                {data.title}
              </Text>
              {data.channelNum && (
                <Text style={styles.channelNum}>Channel {data.channelNum}</Text>
              )}
            </View>
          </View>

          {/* Bottom Bar */}
          <View style={styles.bottomBar}>
            <TouchableOpacity style={styles.controlButton} onPress={toggleMute}>
              <Text style={styles.iconText}>{muted ? '🔇' : '🔊'}</Text>
            </TouchableOpacity>

            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  videoContainer: {
    flex: 1,
  },
  video: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 12,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 80,
    backgroundColor: 'rgba(0,0,0,0.6)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  closeButton: {
    padding: 8,
  },
  titleContainer: {
    flex: 1,
    marginLeft: 16,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  channelNum: {
    color: '#aaa',
    fontSize: 14,
    marginTop: 2,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 70,
    backgroundColor: 'rgba(0,0,0,0.6)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  controlButton: {
    padding: 12,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e50914',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
    marginRight: 6,
  },
  liveText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  iconText: {
    color: '#fff',
    fontSize: 28,
  },
});
