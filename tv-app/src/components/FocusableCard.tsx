import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Animated,
  Platform,
  Dimensions,
} from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface FocusableCardProps {
  title: string;
  imageUrl?: string;
  subtitle?: string;
  focused: boolean;
  selected?: boolean; // soft/highlight when grid loses native focus
  floating?: boolean; // floating cursor (stronger, temporary highlight)
  width?: number;
  height?: number;
}

export function FocusableCard({
  title,
  imageUrl,
  subtitle,
  focused,
  selected = false,
  floating = false,
  width = 240,
  height = 320,
}: FocusableCardProps) {
  const [scale] = React.useState(() => new Animated.Value(1));

  React.useEffect(() => {
    // Focused => largest scale. Floating cursor -> intermediate scale.
    // Selected (last active) -> smallest accent scale.
    const toValue = focused ? 1.12 : floating ? 1.06 : selected ? 1.03 : 1;
    Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      friction: 8,
      tension: 100,
    }).start();
  }, [focused, selected, floating, scale]);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          width,
          height,
          transform: [{ scale }],
        },
        focused && styles.containerFocused,
        !focused && selected && styles.containerSelected,
        floating && styles.containerFloating,
      ]}
    >
      <View style={styles.imageContainer}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.image}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.image, styles.placeholderImage]}>
            <Text style={styles.placeholderText}>📺</Text>
          </View>
        )}
      </View>

      <View style={styles.infoContainer}>
        <Text
          style={[styles.title, focused && styles.titleFocused]}
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {title}
        </Text>
        {subtitle && (
          <Text
            style={[styles.subtitle, focused && styles.subtitleFocused]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {subtitle}
          </Text>
        )}
      </View>

      {focused && <View style={styles.focusRing} />}
      {!focused && selected && <View style={styles.selectedRing} />}
      {floating && <View style={styles.floatingRing} />}
      {floating && <View style={styles.floatingDot} />}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  containerFocused: {
    borderColor: '#ff0000',
    shadowColor: '#ff0000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 10,
  },
  imageContainer: {
    flex: 1,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholderImage: {
    backgroundColor: '#2a2a2a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: SCREEN_WIDTH * 0.025,
  },
  infoContainer: {
    padding: SCREEN_WIDTH * 0.006,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  title: {
    color: '#ffffff',
    fontSize: SCREEN_WIDTH * 0.0085,
    fontWeight: '600',
    marginBottom: SCREEN_WIDTH * 0.002,
  },
  titleFocused: {
    color: '#ffffff',
    fontWeight: '700',
  },
  subtitle: {
    color: '#999999',
    fontSize: SCREEN_WIDTH * 0.0075,
  },
  subtitleFocused: {
    color: '#cccccc',
  },
  focusRing: {
    position: 'absolute',
    top: -3,
    left: -3,
    right: -3,
    bottom: -3,
    borderRadius: 15,
    borderWidth: 3,
    borderColor: '#ff0000',
  },
  containerSelected: {
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  containerFloating: {
    borderColor: 'rgba(0,200,180,0.14)',
    shadowColor: '#00c8b4',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  floatingRing: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: 'rgba(0,200,180,0.9)',
  },
  floatingDot: {
    position: 'absolute',
    top: -10,
    left: '50%',
    marginLeft: -9,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#00c8b4',
    borderWidth: 3,
    borderColor: 'rgba(0,0,0,0.25)',
  },
  selectedRing: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.08)',
  },
});
