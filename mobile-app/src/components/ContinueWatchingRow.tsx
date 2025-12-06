import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { WatchProgress } from '../types';
import { COLORS, CARD_DIMENSIONS, SPACING, FONT_SIZES, IS_TABLET } from '../constants';
import { truncateText, calculateProgress } from '../utils';

interface ContinueWatchingCardProps {
  progress: WatchProgress;
  onPress: () => void;
}

export const ContinueWatchingCard: React.FC<ContinueWatchingCardProps> = ({
  progress,
  onPress,
}) => {
  const progressPercentage = calculateProgress(progress.position, progress.duration);

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: progress.imageUrl || 'https://via.placeholder.com/320x180?text=Content' }}
          style={styles.image}
          resizeMode="cover"
        />
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progressPercentage}%` }]} />
        </View>
      </View>
      
      <View style={styles.infoContainer}>
        <Text style={styles.title} numberOfLines={1}>
          {truncateText(progress.title, 30)}
        </Text>
        {progress.episodeNumber && (
          <Text style={styles.episode}>
            S{progress.seasonId?.split('_').pop() || '1'}E{progress.episodeNumber}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

interface ContinueWatchingRowProps {
  items: WatchProgress[];
  onItemPress: (item: WatchProgress) => void;
}

export const ContinueWatchingRow: React.FC<ContinueWatchingRowProps> = ({
  items,
  onItemPress,
}) => {
  if (items.length === 0) {
    return null;
  }

  return (
    <View style={styles.rowContainer}>
      <Text style={styles.rowTitle}>Continue Watching</Text>
      <View style={styles.cardsContainer}>
        {items.map((item) => (
          <ContinueWatchingCard
            key={item.id}
            progress={item}
            onPress={() => onItemPress(item)}
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: CARD_DIMENSIONS.continueWatching.width,
    marginRight: SPACING.md,
    marginBottom: SPACING.md,
  },
  imageContainer: {
    width: CARD_DIMENSIONS.continueWatching.width,
    height: CARD_DIMENSIONS.continueWatching.height,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: COLORS.cardBackground,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  progressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
  },
  infoContainer: {
    marginTop: SPACING.sm,
  },
  title: {
    color: COLORS.text,
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
  },
  episode: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.xs,
    marginTop: SPACING.xs / 2,
  },
  rowContainer: {
    marginVertical: SPACING.md,
  },
  rowTitle: {
    color: COLORS.text,
    fontSize: IS_TABLET ? FONT_SIZES.xl : FONT_SIZES.lg,
    fontWeight: 'bold',
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  cardsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SPACING.md,
  },
});
