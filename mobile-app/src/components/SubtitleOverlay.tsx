/**
 * SubtitleOverlay Component
 * 
 * Displays subtitles over video playback with automatic synchronization
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { Subtitle } from '../services/SubtitleService';

interface SubtitleOverlayProps {
  subtitles: Subtitle[];
  currentTime: number; // Current video playback position in seconds
  visible?: boolean;
}

const SubtitleOverlay: React.FC<SubtitleOverlayProps> = ({
  subtitles,
  currentTime,
  visible = true
}) => {
  // Find subtitle that matches current playback time
  const currentSubtitle = useMemo(() => {
    if (!visible || subtitles.length === 0) {
      console.log('📺 [SubtitleOverlay] No subtitles:', { visible, count: subtitles.length });
      return null;
    }
    
    const found = subtitles.find(
      subtitle => currentTime >= subtitle.startTime && currentTime <= subtitle.endTime
    );
    
    if (found) {
      console.log('✅ [SubtitleOverlay] Found subtitle:', {
        currentTime,
        text: found.text,
        start: found.startTime,
        end: found.endTime
      });
    }
    
    return found;
  }, [subtitles, currentTime, visible]);

  if (!visible || subtitles.length === 0 || !currentSubtitle) {
    return null;
  }

  return (
    <View style={styles.container} key={`subtitle-${currentSubtitle.index}`}>
      <View style={styles.textContainer}>
        <Text style={styles.text}>{currentSubtitle.text}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: '10%', // ~5% above progress bar
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  textContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
    maxWidth: '90%',
  },
  text: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 24,
  },
});

export default SubtitleOverlay;
