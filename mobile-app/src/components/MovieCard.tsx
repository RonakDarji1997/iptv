import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, Dimensions } from 'react-native';
import { Movie } from '../types';
import { COLORS, CARD_DIMENSIONS, SPACING, FONT_SIZES, IS_TABLET } from '../constants';
import { truncateText } from '../utils';

interface MovieCardProps {
  movie: Movie;
  onPress: () => void;
  width?: number;
  height?: number;
  showTitle?: boolean;
}

export const MovieCard: React.FC<MovieCardProps> = ({
  movie,
  onPress,
  width = CARD_DIMENSIONS.movie.width,
  height = CARD_DIMENSIONS.movie.height,
  showTitle = true,
}) => {
  return (
    <TouchableOpacity
      style={[styles.container, { width, height: height + (showTitle ? 40 : 0) }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.imageContainer, { width, height }]}>
        <Image
          source={{ uri: movie.pic || 'https://via.placeholder.com/300x450?text=No+Image' }}
          style={styles.image}
          resizeMode="cover"
        />
        {movie.rating && (
          <View style={styles.ratingBadge}>
            <Text style={styles.ratingText}>⭐ {movie.rating}</Text>
          </View>
        )}
        {movie.isFavorite && (
          <View style={styles.favoriteBadge}>
            <Text style={styles.favoriteIcon}>❤️</Text>
          </View>
        )}
      </View>
      {showTitle && (
        <Text style={styles.title} numberOfLines={2}>
          {truncateText(movie.name, 30)}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    marginRight: SPACING.md,
  },
  imageContainer: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: COLORS.cardBackground,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  ratingBadge: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
    backgroundColor: COLORS.overlay,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: 4,
  },
  ratingText: {
    color: COLORS.text,
    fontSize: FONT_SIZES.xs,
    fontWeight: 'bold',
  },
  favoriteBadge: {
    position: 'absolute',
    top: SPACING.sm,
    left: SPACING.sm,
    backgroundColor: COLORS.overlay,
    width: IS_TABLET ? 32 : 28,
    height: IS_TABLET ? 32 : 28,
    borderRadius: IS_TABLET ? 16 : 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoriteIcon: {
    fontSize: IS_TABLET ? 16 : 14,
  },
  title: {
    color: COLORS.text,
    fontSize: FONT_SIZES.sm,
    marginTop: SPACING.sm,
    fontWeight: '500',
  },
});
