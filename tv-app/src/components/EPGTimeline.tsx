import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Dimensions,
  Pressable,
} from 'react-native';
import { EpgProgram } from '../lib/api-client';

interface EPGTimelineProps {
  channelId: string;
  programs: EpgProgram[];
  currentTime: Date;
  onProgramSelect?: (program: EpgProgram) => void;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const HOUR_WIDTH = 300; // Width per hour in pixels
const TIMELINE_HEIGHT = 100;

export function EPGTimeline({
  channelId,
  programs,
  currentTime,
  onProgramSelect,
}: EPGTimelineProps) {
  const [focusedProgramId, setFocusedProgramId] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  const getCurrentTimeOffset = (time: Date): number => {
    const hours = time.getHours() + time.getMinutes() / 60;
    return hours * HOUR_WIDTH;
  };

  useEffect(() => {
    // Auto-scroll to current time on mount
    const currentTimeOffset = getCurrentTimeOffset(currentTime);
    scrollViewRef.current?.scrollTo({
      x: Math.max(0, currentTimeOffset - SCREEN_WIDTH / 2),
      animated: true,
    });
  }, [currentTime]);

  const getProgramPosition = (program: EpgProgram): { left: number; width: number } => {
    const startTime = new Date(program.time);
    const endTime = new Date(program.time_to);
    
    const startHour = startTime.getHours() + startTime.getMinutes() / 60;
    const durationHours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
    
    return {
      left: startHour * HOUR_WIDTH,
      width: durationHours * HOUR_WIDTH,
    };
  };

  const isCurrentProgram = (program: EpgProgram): boolean => {
    const now = currentTime.getTime();
    const start = new Date(program.time).getTime();
    const end = new Date(program.time_to).getTime();
    return now >= start && now <= end;
  };

  const formatTime = (time: string): string => {
    const date = new Date(time);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const renderTimeMarkers = () => {
    const markers = [];
    for (let hour = 0; hour < 24; hour++) {
      markers.push(
        <View
          key={hour}
          style={[styles.timeMarker, { left: hour * HOUR_WIDTH }]}
        >
          <Text style={styles.timeMarkerText}>
            {hour.toString().padStart(2, '0')}:00
          </Text>
        </View>
      );
    }
    return markers;
  };

  const renderCurrentTimeLine = () => {
    const offset = getCurrentTimeOffset(currentTime);
    return (
      <View style={[styles.currentTimeLine, { left: offset }]}>
        <View style={styles.currentTimeIndicator} />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Program Guide</Text>
      </View>

      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scrollView}
        contentContainerStyle={{ width: 24 * HOUR_WIDTH }}
      >
        {/* Time markers */}
        <View style={styles.timeMarkersContainer}>
          {renderTimeMarkers()}
        </View>

        {/* Programs */}
        <View style={styles.programsContainer}>
          {programs.map((program) => {
            const { left, width } = getProgramPosition(program);
            const isCurrent = isCurrentProgram(program);
            const isFocused = focusedProgramId === program.id;

            return (
              <Pressable
                key={program.id}
                style={[
                  styles.programBlock,
                  {
                    left,
                    width: Math.max(width, 150), // Minimum width
                  },
                  isCurrent && styles.programBlockCurrent,
                  isFocused && styles.programBlockFocused,
                ]}
                onPress={() => onProgramSelect?.(program)}
                onFocus={() => setFocusedProgramId(program.id)}
                onBlur={() => setFocusedProgramId(null)}
              >
                <Text style={styles.programTime} numberOfLines={1}>
                  {formatTime(program.time)} - {formatTime(program.time_to)}
                </Text>
                <Text
                  style={[
                    styles.programTitle,
                    isCurrent && styles.programTitleCurrent,
                  ]}
                  numberOfLines={2}
                >
                  {program.name}
                </Text>
                {program.descr && (
                  <Text style={styles.programDescription} numberOfLines={1}>
                    {program.descr}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>

        {/* Current time indicator */}
        {renderCurrentTimeLine()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 200,
    backgroundColor: '#0a0a0a',
  },
  header: {
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  timeMarkersContainer: {
    height: 30,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  timeMarker: {
    position: 'absolute',
    height: 30,
    justifyContent: 'center',
    paddingLeft: 10,
    borderLeftWidth: 1,
    borderLeftColor: '#444',
  },
  timeMarkerText: {
    color: '#888',
    fontSize: 12,
  },
  programsContainer: {
    height: TIMELINE_HEIGHT,
    position: 'relative',
  },
  programBlock: {
    position: 'absolute',
    height: TIMELINE_HEIGHT - 20,
    top: 10,
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 10,
    marginRight: 10,
    borderWidth: 2,
    borderColor: '#444',
  },
  programBlockCurrent: {
    backgroundColor: '#1a3a5a',
    borderColor: '#4a9eff',
  },
  programBlockFocused: {
    borderColor: '#ff0000',
    backgroundColor: '#3a1a1a',
    transform: [{ scale: 1.05 }],
  },
  programTime: {
    color: '#aaa',
    fontSize: 11,
    marginBottom: 4,
  },
  programTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  programTitleCurrent: {
    color: '#4a9eff',
  },
  programDescription: {
    color: '#888',
    fontSize: 11,
  },
  currentTimeLine: {
    position: 'absolute',
    top: 30,
    bottom: 0,
    width: 2,
    backgroundColor: '#ff0000',
  },
  currentTimeIndicator: {
    position: 'absolute',
    top: -5,
    left: -5,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ff0000',
  },
});
