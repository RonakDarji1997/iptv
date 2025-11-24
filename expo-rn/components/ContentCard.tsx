import { View, Text, Image, StyleSheet, Pressable, Platform } from 'react-native';
import { useState } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

interface ContentCardProps {
  item: {
    id: string | number;
    name: string;
    logo?: string;
    screenshot?: string;
    screenshot_uri?: string;
    poster?: string;
    cover?: string;
    cover_big?: string;
    number?: string | number;
    cmd?: string;
    year?: string;
    rating_imdb?: number;
    description?: string;
    cast?: string | string[];
    hd?: string | number;
    high_quality?: string | number;
  };
  onPress: (item: any) => void;
  contentType?: 'itv' | 'vod' | 'series';
  width?: number;
  height?: number;
  portalUrl?: string;
}

export default function ContentCard({
  item,
  onPress,
  contentType = 'vod',
  width = 160,
  height = 240,
  portalUrl,
}: ContentCardProps) {
  const [imageError, setImageError] = useState(false);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  // Only enable hover effects on web (desktop / browser) — don't show on mobile/touch
  const isHoverEnabled = Platform.OS === 'web';

  // hovered indicates we should display the large preview overlay (web only)
  const [hovered, setHovered] = useState(false);

  const getImageUrl = () => {
    const baseUrl = portalUrl || 'http://tv.stream4k.cc/stalker_portal/';
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    
    // Extract domain without stalker_portal path for proper concatenation
    const domainUrl = cleanBaseUrl.replace(/\/stalker_portal\/?$/, '');

    // For channels (ITV)
    if (contentType === 'itv') {
      if (item.logo) {
        if (item.logo.startsWith('http')) {
          return item.logo;
        }
        if (item.logo.startsWith('/')) {
          return `${domainUrl}${item.logo}`;
        }
        return `${cleanBaseUrl}/misc/logos/320/${item.logo}`;
      }
      return `https://placehold.co/${width}x${height}/1f2937/ffffff?text=${encodeURIComponent(
        `CH ${item.number || item.name}`
      )}`;
    }

    // For VOD and Series
    const imageUrl =
      item.screenshot_uri || item.screenshot || item.poster || item.cover_big || item.cover;
    if (imageUrl) {
      if (imageUrl.startsWith('http')) {
        return imageUrl;
      }
      if (imageUrl.startsWith('/')) {
        return `${domainUrl}${imageUrl}`;
      }
      return imageUrl;
    }

    return `https://placehold.co/${width}x${height}/1f2937/ffffff?text=${encodeURIComponent(
      item.name || 'Content'
    )}`;
  };

  const imageUrl = imageError
    ? `https://placehold.co/${width}x${height}/1f2937/ffffff?text=${encodeURIComponent(
        item.name || 'Content'
      )}`
    : getImageUrl();

  const handleHoverIn = () => {
    if (isHoverEnabled) {
      scale.value = withTiming(1.05, { duration: 200 });
      opacity.value = withTiming(0.9, { duration: 200 });
      setHovered(true);
    }
  };

  const handleHoverOut = () => {
    if (isHoverEnabled) {
      scale.value = withTiming(1, { duration: 200 });
      opacity.value = withTiming(1, { duration: 200 });
      setHovered(false);
    }
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[animatedStyle, { width, height }]}>
      <Pressable
        style={({ pressed }) => [
          styles.container,
          { width: '100%', height: '100%' },
          pressed && styles.pressed,
          Platform.isTV && styles.tvFocusable,
        ]}
        onPress={() => onPress(item)}
        onHoverIn={isHoverEnabled ? handleHoverIn : undefined}
        onHoverOut={isHoverEnabled ? handleHoverOut : undefined}
      >
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: imageUrl }}
            style={styles.image}
            resizeMode="cover"
            onError={() => setImageError(true)}
          />
          <View style={styles.gradient} />
        
        {/* Badges */}
        <View style={styles.badges}>
          {(item.hd === 1 || item.hd === '1') && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>HD</Text>
            </View>
          )}
          {(item.high_quality === '1' || item.high_quality === 1) && (
            <View style={[styles.badge, styles.badge4k]}>
              <Text style={styles.badgeText}>4K</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {item.name}
        </Text>
        
        {contentType === 'itv' && item.number && (
          <Text style={styles.channelNumber}>CH {item.number}</Text>
        )}
        
        {contentType !== 'itv' && (
          <View style={styles.metadata}>
            {item.year && <Text style={styles.metaText}>{item.year}</Text>}
            {item.rating_imdb && item.rating_imdb > 0 && (
              <Text style={styles.rating}>⭐ {item.rating_imdb}</Text>
            )}
          </View>
        )}
      </View>
      </Pressable>

      {/* On hover, only enlarge image. No overlay content. */}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#18181b',
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
  tvFocusable: {
    borderWidth: 3,
    borderColor: 'transparent',
  },
  imageContainer: {
    flex: 1,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '30%',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  badges: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    gap: 4,
  },
  badge: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badge4k: {
    backgroundColor: '#eab308',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  info: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 8,
  },
  title: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  channelNumber: {
    color: '#22c55e',
    fontSize: 12,
    fontWeight: 'bold',
  },
  metadata: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaText: {
    color: '#a1a1aa',
    fontSize: 12,
  },
  rating: {
    color: '#fbbf24',
    fontSize: 12,
  },
  /* Hover overlay styles (web only) */
  hoverOverlay: {
    position: 'absolute',
    top: -220,
    zIndex: 999,
    backgroundColor: '#0b0b0b',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#222',
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  hoverImageWrap: {
    width: '100%',
    height: 140,
    position: 'relative',
  },
  hoverImage: {
    width: '100%',
    height: '100%',
  },
  hoverGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '40%',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  hoverInfo: {
    padding: 12,
    gap: 8,
  },
  hoverTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  hoverActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
  },
  playButton: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  playText: {
    color: '#fff',
    fontWeight: '700',
  },
  iconButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  hoverMetaRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  hoverMeta: {
    color: '#a1a1aa',
    fontSize: 12,
  },
  hoverDescription: {
    color: '#ddd',
    fontSize: 13,
    marginTop: 8,
  },
  hoverCast: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 6,
  },
});
