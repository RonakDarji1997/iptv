import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ViewToken,
} from 'react-native';
import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'expo-router';
import ContentCard from './ContentCard';
import { Ionicons } from '@expo/vector-icons';

interface ContentItem {
  id: string | number;
  name: string;
  [key: string]: unknown;
}

interface CategoryRowProps {
  category: {
    id: string;
    name: string;
  };
  items: ContentItem[];
  contentType: 'itv' | 'vod' | 'series';
  onItemPress: (item: ContentItem) => void;
  portalUrl?: string;
  maxItems?: number;
}

export default function CategoryRow({
  category,
  items,
  contentType,
  onItemPress,
  portalUrl,
  maxItems = 25,
}: CategoryRowProps) {
  const router = useRouter();
  const displayItems = items.slice(0, maxItems);
  const hasMore = items.length > maxItems;
  
  // Track which items are visible
  const [visibleItemIds, setVisibleItemIds] = useState<Set<string | number>>(new Set());
  
  // Keep track of items that have been seen at least once
  const seenItemIds = useRef<Set<string | number>>(new Set());

  // Card dimensions based on content type
  const isChannel = contentType === 'itv';
  const cardWidth = isChannel ? 160 : 140;
  const cardHeight = isChannel ? 90 : 210; // 16:9 for channels, 2:3 for movies/series
  
  // Callback when viewable items change
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const newVisibleIds = new Set<string | number>();
    viewableItems.forEach((viewableItem) => {
      if (viewableItem.item?.id) {
        newVisibleIds.add(viewableItem.item.id);
        seenItemIds.current.add(viewableItem.item.id);
      }
    });
    setVisibleItemIds(newVisibleIds);
  }, []);

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 10, // Item is considered visible when 10% is on screen
    minimumViewTime: 0,
  }).current;

  const handleCategoryPress = () => {
    // Navigate to category detail screen
    router.push({
      pathname: '/category/[id]',
      params: {
        id: category.id,
        name: category.name,
        type: contentType,
      },
    });
  };

  const handleSeeAllPress = () => {
    // Navigate to category detail screen
    router.push({
      pathname: '/category/[id]',
      params: {
        id: category.id,
        name: category.name,
        type: contentType,
      },
    });
  };

  return (
    <View style={styles.container}>
      {/* Category Header */}
      <Pressable 
        style={styles.header}
        onPress={handleCategoryPress}
      >
        <Text style={styles.categoryTitle}>{category.name}</Text>
        <Ionicons name="chevron-forward" size={20} color="#fff" />
      </Pressable>

      {/* Horizontal Scrolling List */}
      <FlatList
        horizontal
        data={displayItems}
        keyExtractor={(item) => item.id?.toString() || Math.random().toString()}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={5}
        removeClippedSubviews={true}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        renderItem={({ item }) => {
          const isVisible = seenItemIds.current.has(item.id);
          return (
            <View style={styles.cardWrapper}>
              <ContentCard
                item={item}
                onPress={onItemPress}
                contentType={contentType}
                width={cardWidth}
                height={cardHeight}
                portalUrl={portalUrl}
                shouldLoad={isVisible}
              />
            </View>
          );
        }}
        ListFooterComponent={
          hasMore ? (
            <Pressable
              style={[styles.seeAllCard, { width: cardWidth, height: cardHeight }]}
              onPress={handleSeeAllPress}
            >
              <View style={styles.seeAllContent}>
                <Ionicons name="arrow-forward" size={32} color="#fff" />
                <Text style={styles.seeAllText}>See All</Text>
                <Text style={styles.seeAllCount}>
                  {items.length} {items.length === 1 ? 'item' : 'items'}
                </Text>
              </View>
            </Pressable>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  categoryTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  listContent: {
    paddingHorizontal: 16,
    gap: 12,
  },
  cardWrapper: {
    marginRight: 0, // Gap is handled by contentContainerStyle
  },
  seeAllCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#333',
    borderStyle: 'dashed',
  },
  seeAllContent: {
    alignItems: 'center',
    gap: 8,
  },
  seeAllText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  seeAllCount: {
    color: '#888',
    fontSize: 12,
  },
});
