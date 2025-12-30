import React, {useRef, useEffect} from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Dimensions,
  FlatList,
} from 'react-native';
import {ContentCard} from './ContentCard';
import {ContentItem} from '../services/contentService';

const {width: SCREEN_WIDTH} = Dimensions.get('window');

interface ContentRowProps {
  title: string;
  items: ContentItem[];
  onItemPress: (item: ContentItem) => void;
  focusedIndex?: number;
}

export const ContentRow: React.FC<ContentRowProps> = ({
  title,
  items,
  onItemPress,
  focusedIndex = -1,
}) => {
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (focusedIndex >= 0 && scrollViewRef.current) {
      const cardWidth = 200;
      const cardSpacing = 20;
      const scrollPosition = focusedIndex * (cardWidth + cardSpacing);
      scrollViewRef.current.scrollTo({x: scrollPosition, animated: true});
    }
  }, [focusedIndex]);

  if (!items || items.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        decelerationRate="fast"
        snapToInterval={220}
        snapToAlignment="start">
        {items.map((item, index) => (
          <ContentCard
            key={item.id || index}
            item={item}
            onPress={() => onItemPress(item)}
            focused={index === focusedIndex}
          />
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 40,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 16,
    marginLeft: 48,
  },
  scrollContent: {
    paddingLeft: 48,
    paddingRight: 48,
  },
});
