import React, { useState, useEffect, useCallback } from 'react';
import { 
  StyleSheet, 
  View, 
  FlatList, 
  Image, 
  TouchableOpacity, 
  Text, 
  ActivityIndicator, 
  Dimensions,
  StatusBar
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SPACING, API_CONFIG } from '../constants';
import { LoadingIndicator, EmptyState } from '../components';
import { CategoryRepository } from '../repositories';
import { Category } from '../types';
import { StalkerPortalClient, StalkerVodItem } from '../services/StalkerPortalClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');
const isTablet = width >= 768;
const THUMBNAIL_WIDTH = isTablet ? (width - SPACING.lg * 7) / 5 : (width - SPACING.lg * 5) / 3;
const THUMBNAIL_HEIGHT = THUMBNAIL_WIDTH * 1.5;
const MAX_THUMBNAILS = 25;
const FALLBACK_IMAGE = 'https://via.placeholder.com/300x450/1a1a1a/ffffff?text=No+Image';

export default function SeriesScreen({ navigation }: any) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [syncWaitComplete, setSyncWaitComplete] = useState(false);
  const [categorySeries, setCategorySeries] = useState<Record<string, StalkerVodItem[]>>({});
  const [series, setSeries] = useState<StalkerVodItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [stalkerClient, setStalkerClient] = useState<StalkerPortalClient | null>(null);
  const [portalUrl, setPortalUrl] = useState<string>('');

  useEffect(() => {
    initStalkerClient();
    loadCategories();
    
    // Allow time for sync to complete before showing empty state
    const syncTimer = setTimeout(() => {
      setSyncWaitComplete(true);
    }, 5000); // Wait 5 seconds for sync
    
    return () => clearTimeout(syncTimer);
  }, []);

  const initStalkerClient = async () => {
    try {
      const providerData = await AsyncStorage.getItem('stalker_provider_config');
      if (!providerData) {
        console.error('❌ No provider config found');
        return;
      }
      
      const provider = JSON.parse(providerData);
      // Use backend URL from constants (remove /api suffix for StalkerPortalClient)
      const backendBaseUrl = API_CONFIG.BACKEND_URL.endsWith('/api') 
        ? API_CONFIG.BACKEND_URL.slice(0, -4) 
        : API_CONFIG.BACKEND_URL;
      console.log('🔧 SeriesScreen using backend URL:', backendBaseUrl);
      
      const client = new StalkerPortalClient(
        provider.portalUrl,
        provider.macAddress,
        '058357N656529',
        backendBaseUrl
      );
      
      if (provider.bearerToken) {
        client.setToken(provider.bearerToken);
      }
      
      setPortalUrl(provider.portalUrl);
      setStalkerClient(client);
    } catch (error) {
      console.error('❌ Failed to init Stalker client:', error);
    }
  };

  const loadCategories = async () => {
    try {
      setCategoriesLoading(true);
      const cats = await CategoryRepository.getSeriesCategories();
      setCategories(cats);
    } catch (err) {
      console.error('Error loading series categories:', err);
    } finally {
      setCategoriesLoading(false);
    }
  };

  const loadCategorySeries = async (category: Category) => {
    if (!stalkerClient || categorySeries[category.id]) return;
    
    try {
      console.log(`📡 Loading series for category: ${category.name}`);
      
      const response = await stalkerClient.getVodItemsByCategory(category.id, 1);
      const limitedSeries = (response.items || []).slice(0, MAX_THUMBNAILS);
      
      setCategorySeries(prev => ({
        ...prev,
        [category.id]: limitedSeries
      }));
    } catch (error) {
      console.error('❌ Error loading series:', error);
    }
  };

  const loadMultipleCategoriesInParallel = async (categoriesToLoad: Category[]) => {
    if (!stalkerClient) return;
    
    // Filter out categories that are already loaded
    const unloadedCategories = categoriesToLoad.filter(cat => !categorySeries[cat.id]);
    if (unloadedCategories.length === 0) return;
    
    console.log(`🚀 Loading ${unloadedCategories.length} categories in parallel`);
    
    // Load all in parallel
    const results = await Promise.allSettled(
      unloadedCategories.map(async (category) => {
        const response = await stalkerClient.getVodItemsByCategory(category.id, 1);
        return {
          categoryId: category.id,
          series: (response.items || []).slice(0, MAX_THUMBNAILS)
        };
      })
    );
    
    // Update state with all results at once
    const newCategorySeries: Record<string, StalkerVodItem[]> = {};
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        newCategorySeries[result.value.categoryId] = result.value.series;
      }
    });
    
    if (Object.keys(newCategorySeries).length > 0) {
      setCategorySeries(prev => ({
        ...prev,
        ...newCategorySeries
      }));
    }
  };

  const loadAllSeries = async (category: Category) => {
    if (!stalkerClient) return;
    
    try {
      setLoading(true);
      setSelectedCategory(category);
      setPage(1);
      
      // Load first 3 pages in parallel for fast initial load
      const pages = [1, 2, 3];
      const responses = await Promise.all(
        pages.map(p => stalkerClient.getVodItemsByCategory(category.id, p))
      );
      
      const allSeries = responses.flatMap(r => r.items || []);
      setSeries(allSeries);
      setPage(4);
      setHasMore(responses[responses.length - 1].items.length > 0);
    } catch (error) {
      console.error('❌ Error loading all series:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMoreSeries = async () => {
    if (!selectedCategory || !stalkerClient || loading || !hasMore) return;
    
    try {
      setLoading(true);
      const response = await stalkerClient.getVodItemsByCategory(selectedCategory.id, page);
      
      if (response.items && response.items.length > 0) {
        setSeries(prev => [...prev, ...response.items]);
        setPage(page + 1);
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error('❌ Error loading more series:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSeriesPress = (seriesItem: StalkerVodItem) => {
    console.log('📺 Series selected:', seriesItem.name);
    // Navigate to series detail with seasons/episodes
    navigation.navigate('SeriesDetail', { 
      seriesId: seriesItem.id, 
      series: seriesItem 
    });
  };

  const handleBack = () => {
    setSelectedCategory(null);
    setSeries([]);
    setPage(1);
  };

  const renderCategoryRow = ({ item: category }: { item: Category }) => {
    return (
      <View style={styles.categoryRow}>
        <View style={styles.categoryHeader}>
          <Text style={styles.categoryName}>{category.name}</Text>
          <TouchableOpacity 
            onPress={() => loadAllSeries(category)}
            style={styles.viewAllButton}
          >
            <Text style={styles.viewAllText}>View All</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.primary} />
          </TouchableOpacity>
        </View>
        
        <FlatList
          horizontal
          data={categorySeries[category.id] || []}
          renderItem={renderSeriesThumbnail}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.thumbnailList}
          ListEmptyComponent={
            <View style={styles.loadingThumbnails}>
              <ActivityIndicator size="small" color={COLORS.primary} />
            </View>
          }
        />
      </View>
    );
  };

  const getImageUrl = async (item: StalkerVodItem): Promise<string> => {
    if (!item.screenshot_uri) {
      console.log('⚠️ No screenshot_uri for:', item.name);
      return FALLBACK_IMAGE;
    }
    
    try {
      if (stalkerClient) {
        const proxiedUrl = await stalkerClient.getProxiedImageUrl(item.screenshot_uri);
        console.log('🔗 Generated proxied URL:', proxiedUrl.substring(0, 120) + '...');
        return proxiedUrl;
      }
    } catch (error) {
      console.error('❌ Error getting proxied image:', error);
    }
    
    return FALLBACK_IMAGE;
  };

  const SeriesThumbnail = React.memo(({ item }: { item: StalkerVodItem }) => {
    const [imageUrl, setImageUrl] = React.useState<string>(FALLBACK_IMAGE);
    const [hasError, setHasError] = React.useState<boolean>(false);

    React.useEffect(() => {
      let mounted = true;
      setHasError(false);
      
      getImageUrl(item)
        .then((url) => {
          if (mounted && url !== FALLBACK_IMAGE) {
            setImageUrl(url);
          }
        })
        .catch(() => {
          if (mounted) {
            console.error('❌ Failed to get image URL for', item.name);
            setHasError(true);
          }
        });
      
      return () => { mounted = false; };
    }, [item.id]);

    return (
      <TouchableOpacity
        style={styles.thumbnail}
        onPress={() => handleSeriesPress(item)}
        activeOpacity={0.7}
      >
        <Image
          source={{ uri: hasError ? FALLBACK_IMAGE : imageUrl }}
          style={styles.thumbnailImage}
          resizeMode="cover"
          onError={() => {
            if (!hasError) {
              setHasError(true);
            }
          }}
        />
        <Text style={styles.thumbnailTitle} numberOfLines={2}>
          {item.name || 'Untitled'}
        </Text>
      </TouchableOpacity>
    );
  });

  const renderSeriesThumbnail = ({ item }: { item: StalkerVodItem }) => {
    return <SeriesThumbnail item={item} />;
  };

  const SeriesCard = React.memo(({ item }: { item: StalkerVodItem }) => {
    const [imageUrl, setImageUrl] = React.useState<string>(FALLBACK_IMAGE);
    const [hasError, setHasError] = React.useState<boolean>(false);

    React.useEffect(() => {
      let mounted = true;
      setHasError(false);
      
      getImageUrl(item)
        .then((url) => {
          if (mounted && url !== FALLBACK_IMAGE) {
            setImageUrl(url);
          }
        })
        .catch(() => {
          if (mounted) {
            setHasError(true);
          }
        });
      
      return () => { mounted = false; };
    }, [item.id]);

    return (
      <TouchableOpacity
        style={styles.seriesCard}
        onPress={() => handleSeriesPress(item)}
        activeOpacity={0.7}
      >
        <Image
          source={{ uri: hasError ? FALLBACK_IMAGE : imageUrl }}
          style={styles.seriesImage}
          resizeMode="cover"
          onError={() => {
            if (!hasError) {
              setHasError(true);
            }
          }}
        />
        <View style={styles.seriesInfo}>
          <Text style={styles.seriesTitle} numberOfLines={2}>
            {item.name || 'Untitled'}
          </Text>
          {item.year && (
            <Text style={styles.seriesYear}>{String(item.year)}</Text>
          )}
          {item.rating_imdb && item.rating_imdb > 0 && (
            <Text style={styles.seriesRating}>⭐ {Number(item.rating_imdb).toFixed(1)}</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  });

  const renderSeriesCard = ({ item }: { item: StalkerVodItem }) => {
    return <SeriesCard item={item} />;
  };

  if (categoriesLoading) {
    return <LoadingIndicator message="Loading TV shows..." />;
  }

  if (categories.length === 0 && !syncWaitComplete) {
    return <LoadingIndicator message="Syncing series categories..." />;
  }

  if (categories.length === 0) {
    return <EmptyState message="No TV show categories found" icon="📺" />;
  }

  // Show all series view when category selected
  if (selectedCategory) {
    return (
      <View style={styles.container}>
        <StatusBar hidden={false} />
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{selectedCategory.name}</Text>
        </View>

        <FlatList
          data={series}
          renderItem={renderSeriesCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.seriesGrid}
          onEndReached={loadMoreSeries}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loading ? (
              <View style={styles.loadingFooter}>
                <ActivityIndicator size="large" color={COLORS.primary} />
              </View>
            ) : null
          }
        />
      </View>
    );
  }

  // Show categories with horizontal scrolling thumbnails
  return (
    <View style={styles.container}>
      <StatusBar hidden={false} />
      <FlatList
        data={categories}
        renderItem={renderCategoryRow}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.categoryList}
        onViewableItemsChanged={({ viewableItems }) => {
          // Load series for categories as they become visible - in parallel batches
          const categoriesToLoad = viewableItems
            .map(({ item }) => item)
            .filter(item => !categorySeries[item.id]);
          
          if (categoriesToLoad.length > 0) {
            loadMultipleCategoriesInParallel(categoriesToLoad);
          }
        }}
        viewabilityConfig={{
          itemVisiblePercentThreshold: 50
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  categoryList: {
    padding: SPACING.lg,
  },
  categoryRow: {
    marginBottom: SPACING.xl,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  categoryName: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '700',
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewAllText: {
    color: COLORS.primary,
    fontSize: 16,
    marginRight: 4,
  },
  thumbnailList: {
    paddingRight: SPACING.lg,
  },
  thumbnail: {
    width: THUMBNAIL_WIDTH,
    marginRight: SPACING.md,
  },
  thumbnailImage: {
    width: THUMBNAIL_WIDTH,
    height: THUMBNAIL_HEIGHT,
    borderRadius: 8,
    backgroundColor: COLORS.backgroundLight,
  },
  thumbnailTitle: {
    color: COLORS.text,
    fontSize: 14,
    marginTop: SPACING.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    backgroundColor: COLORS.backgroundLight,
  },
  backButton: {
    marginRight: SPACING.md,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '700',
  },
  seriesGrid: {
    padding: SPACING.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  seriesCard: {
    width: isTablet ? (width - SPACING.lg * 6) / 4 : (width - SPACING.lg * 4) / 3,
    margin: SPACING.sm,
    minWidth: 100,
  },
  seriesImage: {
    width: '100%',
    height: isTablet ? (width - SPACING.lg * 6) / 4 * 1.5 : (width - SPACING.lg * 4) / 3 * 1.5,
    borderRadius: 8,
    backgroundColor: COLORS.backgroundLight,
  },
  seriesInfo: {
    marginTop: SPACING.sm,
  },
  seriesTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  seriesYear: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  seriesRating: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  loadingFooter: {
    padding: SPACING.xl,
    alignItems: 'center',
  },
  loadingThumbnails: {
    width: THUMBNAIL_WIDTH,
    height: THUMBNAIL_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
