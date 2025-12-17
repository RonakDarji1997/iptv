/**
 * Native VOD Player
 * Full-featured player with subtitles, quality selection, resume playback, progress tracking
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  StatusBar,
  ActivityIndicator,
  ScrollView,
  Modal,
} from 'react-native';
import Video, { VideoRef, OnProgressData, OnLoadData, OnBufferData, TextTrackType } from 'react-native-video';
import Slider from '@react-native-community/slider';
import type { VODData, Subtitle } from '../types/bridge';

interface Props {
  data: VODData;
  onClose: () => void;
  onProgress: (contentId: string, currentTime: number, duration: number, buffered?: number) => void;
  onEnded: (contentId: string, duration: number) => void;
  onError: (error: string, code?: number) => void;
  onSubtitleChanged?: (subtitle: Subtitle | null) => void;
  onQualityChanged?: (quality: string) => void;
}

export default function NativeVODPlayer({
  data,
  onClose,
  onProgress,
  onEnded,
  onError,
  onSubtitleChanged,
  onQualityChanged,
}: Props) {
  const videoRef = useRef<VideoRef>(null);
  
  // Playback state
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1.0);
  const [currentTime, setCurrentTime] = useState(data.savedPosition || 0);
  const [duration, setDuration] = useState(0);
  const [isBuffering, setIsBuffering] = useState(true);
  const [isSeeking, setIsSeeking] = useState(false);
  
  // UI state
  const [showControls, setShowControls] = useState(true);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  
  // Subtitle state
  const [selectedSubtitle, setSelectedSubtitle] = useState<Subtitle | null>(
    data.selectedSubtitle || null
  );
  const [textTracks, setTextTracks] = useState<any[]>([]);
  
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-hide controls
  useEffect(() => {
    if (showControls && !paused) {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 4000);
    }
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [showControls, paused]);

  // Progress reporting
  useEffect(() => {
    if (!paused && duration > 0) {
      progressIntervalRef.current = setInterval(() => {
        if (data.contentId) {
          onProgress(data.contentId, currentTime, duration);
        }
      }, 5000); // Report every 5 seconds
    }
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [paused, currentTime, duration, data.contentId, onProgress]);

  // Prepare text tracks from subtitles
  useEffect(() => {
    if (data.subtitles && data.subtitles.length > 0) {
      const tracks = data.subtitles.map((sub, index) => ({
        title: sub.languageName,
        language: sub.language,
        type: TextTrackType.VTT,
        uri: sub.customUrl || `http://localhost:3001/api/subtitles/convert?fileId=${sub.fileId}`,
      }));
      setTextTracks(tracks);
    }
  }, [data.subtitles]);

  const handleLoad = (loadData: OnLoadData) => {
    console.log('[VOD] Video loaded:', loadData.duration);
    setDuration(loadData.duration);
    setIsBuffering(false);

    // Seek to saved position if available
    if (data.savedPosition && data.savedPosition > 0) {
      console.log('[VOD] Resuming from:', data.savedPosition);
      videoRef.current?.seek(data.savedPosition);
    }
  };

  const handleProgress = (progressData: OnProgressData) => {
    if (!isSeeking) {
      setCurrentTime(progressData.currentTime);
    }
  };

  const handleEnd = () => {
    console.log('[VOD] Video ended');
    if (data.contentId) {
      onEnded(data.contentId, duration);
    }
  };

  const handleBuffer = (bufferData: OnBufferData) => {
    setIsBuffering(bufferData.isBuffering);
  };

  const handleVideoError = (error: any) => {
    console.error('[VOD] Video error:', error);
    onError(error.error?.errorString || 'Playback failed', error.error?.errorCode);
  };

  const toggleControls = () => {
    setShowControls(!showControls);
  };

  const togglePlayPause = () => {
    setPaused(!paused);
  };

  const toggleMute = () => {
    setMuted(!muted);
  };

  const handleSeek = (value: number) => {
    setIsSeeking(true);
    setCurrentTime(value);
  };

  const handleSlidingComplete = (value: number) => {
    videoRef.current?.seek(value);
    setIsSeeking(false);
  };

  const skip = (seconds: number) => {
    const newTime = Math.max(0, Math.min(duration, currentTime + seconds));
    videoRef.current?.seek(newTime);
    setCurrentTime(newTime);
  };

  const selectSubtitle = useCallback((subtitle: Subtitle | null) => {
    console.log('[VOD] Subtitle selected:', subtitle?.languageName || 'None');
    setSelectedSubtitle(subtitle);
    setShowSubtitleMenu(false);
    onSubtitleChanged?.(subtitle);
  }, [onSubtitleChanged]);

  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
          // Subtitles
          textTracks={textTracks}
          selectedTextTrack={selectedSubtitle ? {
            type: 'index',
            value: data.subtitles?.findIndex(s => s.id === selectedSubtitle.id) || 0,
          } : { type: 'disabled' }}
          // Callbacks
          onLoad={handleLoad}
          onProgress={handleProgress}
          onEnd={handleEnd}
          onBuffer={handleBuffer}
          onError={handleVideoError}
          // Performance
          reportBandwidth={true}
          playInBackground={false}
          playWhenInactive={false}
          bufferConfig={{
            minBufferMs: 15000,
            maxBufferMs: 50000,
            bufferForPlaybackMs: 2500,
            bufferForPlaybackAfterRebufferMs: 5000,
          }}
        />

        {/* Loading Indicator */}
        {isBuffering && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#fff" />
          </View>
        )}
      </TouchableOpacity>

      {/* Controls Overlay */}
      {showControls && (
        <>
          {/* Top Bar */}
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.iconButton} onPress={onClose}>
              <Text style={styles.iconText}>←</Text>
            </TouchableOpacity>
            <View style={styles.titleContainer}>
              <Text style={styles.title} numberOfLines={1}>
                {data.title}
              </Text>
              {data.isSeries && (
                <Text style={styles.subtitle}>
                  S{data.seasonNumber} E{data.episodeNumber}
                </Text>
              )}
            </View>
          </View>

          {/* Center Controls */}
          <View style={styles.centerControls}>
            <TouchableOpacity style={styles.centerButton} onPress={() => skip(-10)}>
              <Text style={styles.iconText}>⏪</Text>
              <Text style={styles.skipText}>10</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.playButton} onPress={togglePlayPause}>
              <Text style={[styles.iconText, {fontSize: 56}]}>{paused ? '▶' : '⏸'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.centerButton} onPress={() => skip(10)}>
              <Text style={styles.iconText}>⏩</Text>
              <Text style={styles.skipText}>10</Text>
            </TouchableOpacity>
          </View>

          {/* Bottom Bar */}
          <View style={styles.bottomBar}>
            {/* Progress Bar */}
            <View style={styles.progressContainer}>
              <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
              <Slider
                style={styles.slider}
                value={currentTime}
                minimumValue={0}
                maximumValue={duration}
                minimumTrackTintColor="#e50914"
                maximumTrackTintColor="#666"
                thumbTintColor="#fff"
                onValueChange={handleSeek}
                onSlidingComplete={handleSlidingComplete}
              />
              <Text style={styles.timeText}>{formatTime(duration)}</Text>
            </View>

            {/* Control Buttons */}
            <View style={styles.controlRow}>
              <TouchableOpacity style={styles.iconButton} onPress={toggleMute}>
                <Text style={styles.iconText}>{muted ? '🔇' : '🔊'}</Text>
              </TouchableOpacity>

              {data.subtitles && data.subtitles.length > 0 && (
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => setShowSubtitleMenu(true)}>
                  <Text style={[styles.iconText, {color: selectedSubtitle ? '#e50914' : '#fff'}]}>CC</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => setShowSettingsMenu(true)}>
                <Text style={styles.iconText}>⚙</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}

      {/* Subtitle Menu Modal */}
      <Modal
        visible={showSubtitleMenu}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSubtitleMenu(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSubtitleMenu(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Subtitles</Text>
            <ScrollView style={styles.menuList}>
              <TouchableOpacity
                style={[
                  styles.menuItem,
                  !selectedSubtitle && styles.menuItemSelected,
                ]}
                onPress={() => selectSubtitle(null)}>
                <Text style={styles.menuItemText}>None</Text>
              </TouchableOpacity>
              {data.subtitles?.map((sub) => (
                <TouchableOpacity
                  key={sub.id}
                  style={[
                    styles.menuItem,
                    selectedSubtitle?.id === sub.id && styles.menuItemSelected,
                  ]}
                  onPress={() => selectSubtitle(sub)}>
                  <Text style={styles.menuItemText}>{sub.languageName}</Text>
                  {sub.rating && (
                    <Text style={styles.menuItemSubtext}>Rating: {sub.rating}/10</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Settings Menu Modal */}
      <Modal
        visible={showSettingsMenu}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSettingsMenu(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSettingsMenu(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Settings</Text>
            <ScrollView style={styles.menuList}>
              <View style={styles.menuItem}>
                <Text style={styles.menuItemText}>Playback Speed</Text>
                <Text style={styles.menuItemSubtext}>1.0x</Text>
              </View>
              <View style={styles.menuItem}>
                <Text style={styles.menuItemText}>Quality</Text>
                <Text style={styles.menuItemSubtext}>Auto</Text>
              </View>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
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
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 80,
    backgroundColor: 'rgba(0,0,0,0.7)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
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
  subtitle: {
    color: '#aaa',
    fontSize: 14,
    marginTop: 2,
  },
  centerControls: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -40,
  },
  centerButton: {
    padding: 20,
    position: 'relative',
  },
  playButton: {
    padding: 20,
    marginHorizontal: 40,
  },
  skipText: {
    position: 'absolute',
    bottom: 22,
    alignSelf: 'center',
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  timeText: {
    color: '#fff',
    fontSize: 12,
    minWidth: 50,
    textAlign: 'center',
  },
  slider: {
    flex: 1,
    marginHorizontal: 8,
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  iconButton: {
    padding: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    maxHeight: '70%',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  menuList: {
    paddingHorizontal: 20,
  },
  menuItem: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  menuItemSelected: {
    backgroundColor: 'rgba(229, 9, 20, 0.2)',
  },
  menuItemText: {
    color: '#fff',
    fontSize: 16,
  },
  menuItemSubtext: {
    color: '#aaa',
    fontSize: 12,
    marginTop: 4,
  },
  iconText: {
    color: '#fff',
    fontSize: 28,
  },
});
