import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  FlatList,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/lib/store';
import { StalkerClient } from '@/lib/stalker-client';
import ContentCard from '@/components/ContentCard';
import { Picker } from '@react-native-picker/picker';

export default function LiveTVScreen() {
  const router = useRouter();
  const { portalUrl, macAddress } = useAuthStore();
  const { width: screenWidth } = useWindowDimensions();

  // Calculate card size based on screen width - responsive columns
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
  const totalPadding = 32; // 16px padding on each side
  const totalGaps = (numColumns - 1) * gap; // gaps between cards
  const availableWidth = screenWidth - totalPadding - totalGaps;
  const cardSize = Math.floor(availableWidth / numColumns);

  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [channels, setChannels] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    if (selectedCategory) {
      loadInitialPages();
    }
  }, [selectedCategory]);

  const loadInitialPages = async () => {
    // Load first 5 pages at once
    setLoading(true);
    try {
      await Promise.all([
        loadChannels(1),
        loadChannels(2),
        loadChannels(3),
        loadChannels(4),
        loadChannels(5),
      ]);
      setCurrentPage(5);
    } catch (err) {
      console.error('Error loading initial pages:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    if (!portalUrl || !macAddress) {
      setError('Not authenticated');
      setLoading(false);
      return;
    }

    try {
      setError('');
      const client = new StalkerClient({ url: portalUrl, mac: macAddress });

      const cats = await client.getCategories();
      setCategories(cats);
      
      // Set first category as default
      if (cats.length > 0 && !selectedCategory) {
        setSelectedCategory(cats[0].id);
      }
    } catch (err) {
      console.error('Load categories error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load categories');
    } finally {
      setLoading(false);
    }
  };

  const loadChannels = async (page: number) => {
    if (!portalUrl || !macAddress || !selectedCategory) return;

    try {
      setError('');

      const client = new StalkerClient({ url: portalUrl, mac: macAddress });

      const result = await client.getChannels(selectedCategory, page);
      
      if (page === 1) {
        setChannels(result.data);
        // Calculate total pages: API typically returns 14 items per page
        const itemsPerPage = result.data.length > 0 ? result.data.length : 14;
        const calculatedPages = Math.ceil(result.total / itemsPerPage);
        setTotalPages(calculatedPages > 0 ? calculatedPages : 1);
      } else {
        // Deduplicate by ID to prevent duplicate keys
        setChannels(prev => {
          const existingIds = new Set(prev.map(c => c.id));
          const newChannels = result.data.filter((c: any) => !existingIds.has(c.id));
          return [...prev, ...newChannels];
        });
      }
      
      return result;
    } catch (err) {
      console.error('Load channels error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load channels');
      throw err;
    }
  };

  const handleChannelPress = (channel: any) => {
    router.push({
      pathname: '/watch/[id]',
      params: {
        id: channel.id,
        type: 'itv',
        cmd: channel.cmd,
        title: channel.name,
      },
    });
  };

  const handleLoadMore = async () => {
    if (!loadingMore && currentPage < totalPages) {
      setLoadingMore(true);
      try {
        await loadChannels(currentPage + 1);
        setCurrentPage(currentPage + 1);
      } finally {
        setLoadingMore(false);
      }
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    setChannels([]);
    loadInitialPages().finally(() => setRefreshing(false));
  };

  if (loading && channels.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#ef4444" />
        <Text style={styles.loadingText}>Loading channels...</Text>
      </View>
    );
  }

  if (error && channels.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.retryButton} onPress={() => loadCategories()}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Category Dropdown */}
      <View style={styles.dropdownContainer}>
        <Text style={styles.dropdownLabel}>Select Channel Category</Text>
        <View style={styles.pickerWrapper}>
          <Picker
            selectedValue={selectedCategory}
            onValueChange={(value) => setSelectedCategory(value)}
            style={styles.picker}
            dropdownIconColor="#fff"
          >
            {categories.map((category) => (
              <Picker.Item
                key={category.id}
                label={category.title || category.name}
                value={category.id}
                color={Platform.OS === 'ios' ? '#fff' : undefined}
              />
            ))}
          </Picker>
        </View>
      </View>

      {/* Channels Grid */}
      <FlatList
        data={channels}
        numColumns={numColumns}
        key={numColumns}
        keyExtractor={(item, index) => `channel-${item.id}-${index}`}
        contentContainerStyle={styles.gridContainer}
        columnWrapperStyle={styles.columnWrapper}
        renderItem={({ item }) => (
          <ContentCard
            item={item}
            onPress={() => handleChannelPress(item)}
            contentType="itv"
            portalUrl={portalUrl || undefined}
            width={cardSize}
            height={cardSize}
          />
        )}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#ef4444" />
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color="#ef4444" />
              <Text style={styles.footerText}>Loading more...</Text>
            </View>
          ) : currentPage >= totalPages ? (
            <View style={styles.footerLoader}>
              <Text style={styles.footerText}>All channels loaded</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#09090b',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dropdownContainer: {
    backgroundColor: '#18181b',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  dropdownLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#a1a1aa',
    marginBottom: 8,
  },
  pickerWrapper: {
    backgroundColor: '#18181b',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3f3f46',
    overflow: 'hidden',
  },
  picker: {
    color: '#fff',
    backgroundColor: '#18181b',
    height: 50,
  },
  gridContainer: {
    padding: 16,
  },
  columnWrapper: {
    gap: 16,
    paddingBottom: 16,
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 16,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  footerLoader: {
    padding: 20,
    alignItems: 'center',
  },
  footerText: {
    color: '#71717a',
    fontSize: 14,
    marginTop: 8,
  },
});
