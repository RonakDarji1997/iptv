import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Channel } from '../types';
import { COLORS, CARD_DIMENSIONS, SPACING, FONT_SIZES, IS_TABLET } from '../constants';
import { truncateText } from '../utils';

interface ChannelCardProps {
  channel: Channel;
  onPress: () => void;
  showEPG?: boolean;
  width?: number;
  height?: number;
}

export const ChannelCard: React.FC<ChannelCardProps> = ({
  channel,
  onPress,
  showEPG = true,
  width = CARD_DIMENSIONS.channel.width,
  height = CARD_DIMENSIONS.channel.height,
}) => {
  return (
    <TouchableOpacity
      style={[styles.container, { width }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.imageContainer, { width, height }]}>
        <Image
          source={{ uri: channel.logo || 'https://via.placeholder.com/150?text=TV' }}
          style={styles.image}
          resizeMode="cover"
        />
        {channel.number && (
          <View style={styles.numberBadge}>
            <Text style={styles.numberText}>{channel.number}</Text>
          </View>
        )}
      </View>
      
      <View style={styles.infoContainer}>
        <Text style={styles.name} numberOfLines={1}>
          {truncateText(channel.name, 20)}
        </Text>
        {showEPG && channel.currentShow && (
          <Text style={styles.currentShow} numberOfLines={1}>
            {truncateText(channel.currentShow.name, 20)}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    marginRight: SPACING.md,
    marginBottom: SPACING.md,
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
  numberBadge: {
    position: 'absolute',
    top: SPACING.xs,
    left: SPACING.xs,
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs / 2,
    borderRadius: 4,
  },
  numberText: {
    color: COLORS.text,
    fontSize: FONT_SIZES.xs,
    fontWeight: 'bold',
  },
  infoContainer: {
    marginTop: SPACING.sm,
  },
  name: {
    color: COLORS.text,
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
  },
  currentShow: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.xs,
    marginTop: SPACING.xs / 2,
  },
});
