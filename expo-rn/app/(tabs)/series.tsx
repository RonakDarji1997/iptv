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

export default function SeriesScreen() {
  const router = useRouter();
  const { portalUrl, macAddress } = useAuthStore();
  const { width: screenWidth } = useWindowDimensions();

  // Calculate card size based on screen width - series use vertical poster layout
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
  const cardWidth = Math.floor(availableWidth / numColumns);
  const cardHeight = Math.floor(cardWidth * 1.5); // 2:3 aspect ratio for series posters

  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [series, setSeries] = useState<any[]>([]);
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
        loadSeries(1),
        loadSeries(2),
        loadSeries(3),
        loadSeries(4),
        loadSeries(5),
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

      const cats = await client.getSeriesCategories();
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

  const loadSeries = async (page: number) => {
    if (!portalUrl || !macAddress || !selectedCategory) return;

    try {
      setError('');

      const client = new StalkerClient({ url: portalUrl, mac: macAddress });

      const result = await client.getSeries(selectedCategory, page);
      
      if (page === 1) {
        setSeries(result.data);
        setTotalPages(Math.ceil(result.total / result.data.length));
      } else {
        setSeries(prev => [...prev, ...result.data]);
      }
      
      return result;
    } catch (err) {
      console.error('Load series error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load series');
      throw err;
    }
  };

  const handleSeriesPress = (seriesItem: any) => {
    router.push({
      pathname: '/series/[id]',
      params: {
        id: seriesItem.id,
        title: seriesItem.name,
        screenshot: seriesItem.screenshot_uri || seriesItem.screenshot,
        description: seriesItem.description || '',
        actors: seriesItem.actors || '',
        year: seriesItem.year || '',
        country: seriesItem.country || '',
        genres: seriesItem.genres_str || '',
        totalFiles: seriesItem.has_files || '',
      },
    });
  };

  const handleLoadMore = async () => {
    if (!loadingMore && currentPage < totalPages) {
      setLoadingMore(true);
      try {
        await loadSeries(currentPage + 1);
        setCurrentPage(currentPage + 1);
      } finally {
        setLoadingMore(false);
      }
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    setSeries([]);
    loadInitialPages().finally(() => setRefreshing(false));
  };

  if (loading && series.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#ef4444" />
        <Text style={styles.loadingText}>Loading series...</Text>
      </View>
    );
  }

  if (error && series.length === 0) {
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
        <Text style={styles.dropdownLabel}>Select Series Category</Text>
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

      {/* Series Grid */}
      <FlatList
        data={series}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.gridContainer}
        renderItem={({ item }) => (
          <ContentCard
            item={item}
            onPress={() => handleSeriesPress(item)}
            contentType="series"
            portalUrl={portalUrl || undefined}
            width={cardWidth}
            height={cardHeight}
          />
        )}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={2}
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
              <Text style={styles.footerText}>All series loaded</Text>
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'flex-start',
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
