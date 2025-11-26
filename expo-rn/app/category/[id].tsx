import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '@/lib/store';
import { useSnapshotStore } from '@/lib/snapshot-store';
import ContentCard from '@/components/ContentCard';
import { Ionicons } from '@expo/vector-icons';

interface ContentItem {
  id: string;
  name: string;
  poster?: string | null;
  screenshot?: string | null;
  screenshot_uri?: string | null;
  logo?: string | null;
  year?: string | null;
  ratingImdb?: number | null;
  categoryId?: string | null;
  number?: string | number;
  cmd?: string;
}

export default function CategoryDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { snapshot: cachedSnapshot } = useSnapshotStore();
  const { width: screenWidth } = useWindowDimensions();
  const { user, selectedProviderIds } = useAuthStore();

  const categoryId = params.id as string;
  const categoryName = params.name as string;
  const contentType = (params.type as 'itv' | 'vod' | 'series') || 'vod';

  const [items, setItems] = useState<ContentItem[]>([]);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [portalUrl, setPortalUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Calculate card size based on screen width
  const getNumColumns = () => {
    if (screenWidth < 480) return 2; // Small phones
    if (screenWidth < 768) return 3; // Phones
    if (screenWidth < 1024) return 4; // Tablets
    if (screenWidth < 1440) return 5; // Small desktops
    if (screenWidth < 1920) return 6; // Medium desktops
    return 7; // Large screens
  };

  const numColumns = getNumColumns();
  const gap = 16;
  const totalPadding = 32;
  const totalGaps = (numColumns - 1) * gap;
  const availableWidth = screenWidth - totalPadding - totalGaps;
  const cardWidth = Math.floor(availableWidth / numColumns);
  const cardHeight = contentType === 'itv' ? Math.floor(cardWidth * 0.5625) : Math.floor(cardWidth * 1.5);

  useEffect(() => {
    loadCategoryItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, contentType]);

  const loadCategoryItems = async () => {
    try {
      // Get provider ID from selected providers
      if (!user || selectedProviderIds.length === 0) {
        setLoading(false);
        return;
      }

      // Use the first selected provider
      const selectedProviderId = selectedProviderIds[0];
      setProviderId(selectedProviderId);

      // Get provider details for portal URL
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:2005';
      const providersResp = await fetch(`${apiUrl}/api/providers?userId=${user.id}`);
      const providersData = await providersResp.json();
      
      const provider = providersData.providers?.find((p: any) => p.id === selectedProviderId);
      if (provider) {
        setPortalUrl(provider.url || '');
      }

      // Now load items from the snapshot for this provider
      if (!cachedSnapshot) {
        setLoading(false);
        return;
      }

      let categoryItems: ContentItem[] = [];

      if (contentType === 'vod') {
        categoryItems = cachedSnapshot.movies?.filter(
          (item: ContentItem) => item.categoryId === categoryId
        ) || [];
      } else if (contentType === 'series') {
        categoryItems = cachedSnapshot.series?.filter(
          (item: ContentItem) => item.categoryId === categoryId
        ) || [];
      } else if (contentType === 'itv') {
        categoryItems = cachedSnapshot.channels?.filter(
          (item: ContentItem) => item.categoryId === categoryId
        ) || [];
      }

      console.log(`[Category] Loaded ${categoryItems.length} items for category ${categoryName} (${contentType})`);
      setItems(categoryItems);
    } catch (err) {
      console.error('Error loading category items:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleItemPress = (item: ContentItem) => {
    if (!providerId) {
      console.warn('No provider ID available');
      return;
    }

    if (contentType === 'series') {
      router.push({
        pathname: '/series/[id]',
        params: {
          id: item.id,
          title: item.name,
          screenshot: item.poster || item.screenshot || item.screenshot_uri || '',
          providerId: providerId,
        },
      });
    } else {
      router.push({
        pathname: '/watch/[id]',
        params: {
          id: item.id,
          type: contentType === 'itv' ? 'live' : 'vod',
          title: item.name,
          screenshot: item.poster || item.screenshot || item.screenshot_uri || '',
          providerId: providerId,
          cmd: item.cmd || '',
          number: item.number || '',
        },
      });
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#ef4444" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.title}>{categoryName}</Text>
        <Text style={styles.count}>
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </Text>
      </View>

      {/* Grid */}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id.toString()}
        numColumns={numColumns}
        key={`grid-${numColumns}`}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.row}
        renderItem={({ item }) => (
          <ContentCard
            item={{
              id: item.id,
              name: item.name,
              poster: item.poster || undefined,
              screenshot: item.screenshot || item.screenshot_uri || undefined,
              logo: item.logo || undefined,
              year: item.year || undefined,
              rating_imdb: item.ratingImdb || undefined,
              number: item.number,
              cmd: item.cmd,
            }}
            onPress={() => handleItemPress(item)}
            contentType={contentType}
            width={cardWidth}
            height={cardHeight}
            portalUrl={portalUrl}
            shouldLoad={true}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No items in this category</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f0f0f',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#888',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
    gap: 12,
  },
  backButton: {
    padding: 4,
  },
  title: {
    flex: 1,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  count: {
    fontSize: 14,
    color: '#888',
  },
  grid: {
    padding: 16,
  },
  row: {
    gap: 16,
    marginBottom: 16,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});
