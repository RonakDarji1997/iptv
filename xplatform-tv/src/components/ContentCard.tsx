import React from 'react';
import {View, Text, Image, StyleSheet, Dimensions} from 'react-native';
import {Focusable} from './Focusable';
import {ContentItem} from '../services/contentService';

const {width: SCREEN_WIDTH} = Dimensions.get('window');
const CARD_WIDTH = 200;
const CARD_HEIGHT = 300;

interface ContentCardProps {
  item: ContentItem;
  onPress: () => void;
  focused?: boolean;
}

export const ContentCard: React.FC<ContentCardProps> = ({
  item,
  onPress,
  focused,
}) => {
  const imageUrl =
    item.imageUrl ||
    item.screenshot_uri ||
    item.poster ||
    'https://via.placeholder.com/200x300?text=No+Image';

  return (
    <Focusable
      onPress={onPress}
      style={[styles.card, focused && styles.cardFocused]}
      focusedStyle={styles.cardFocused}
      scaleValue={1.08}>
      <View style={styles.imageContainer}>
        <Image
          source={{uri: imageUrl}}
          style={styles.image}
          resizeMode="cover"
        />
        <View style={styles.gradient} />
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={2}>
            {item.name || item.title}
          </Text>
          {item.year && (
            <Text style={styles.year}>{item.year}</Text>
          )}
          {item.rating && (
            <View style={styles.ratingContainer}>
              <Text style={styles.rating}>★ {item.rating.toFixed(1)}</Text>
            </View>
          )}
        </View>
      </View>
    </Focusable>
  );
};

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    marginRight: 20,
    borderRadius: 8,
    overflow: 'hidden',
  },
  cardFocused: {
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#fff',
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 10,
  },
  imageContainer: {
    width: '100%',
    height: '100%',
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
    height: '50%',
  },
  info: {
    position: 'absolute',
    backgroundColor: 'transparent',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  year: {
    color: '#ccc',
    fontSize: 14,
    marginBottom: 4,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rating: {
    color: '#ffd700',
    fontSize: 14,
    fontWeight: '600',
  },
});
