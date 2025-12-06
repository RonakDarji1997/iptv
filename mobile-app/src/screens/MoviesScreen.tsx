import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  Image,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  Dimensions,
  Modal,
  StatusBar
} from 'react-native';
import { COLORS, SPACING, API_CONFIG } from '../constants';
import { LoadingIndicator, ErrorState, EmptyState } from '../components';
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

export default function MoviesScreen({ navigation }: any) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [syncWaitComplete, setSyncWaitComplete] = useState(false);
  const [categoryMovies, setCategoryMovies] = useState<Record<string, StalkerVodItem[]>>({});
  const [movies, setMovies] = useState<StalkerVodItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [stalkerClient, setStalkerClient] = useState<StalkerPortalClient | null>(null);
  const [portalUrl, setPortalUrl] = useState<string>('');
  const isFocusedRef = React.useRef(true);

  useEffect(() => {
    const init = async () => {
      const client = await initStalkerClient();
      if (client) {
        await loadCategories(client);
      }
    };
    init();
    
    // Allow time for sync to complete before showing empty state
    const syncTimer = setTimeout(() => {
      setSyncWaitComplete(true);
    }, 5000); // Wait 5 seconds for sync
    
    // Track screen focus to stop loading on tab change
    const unsubscribeFocus = navigation.addListener('focus', () => {
      console.log('🎬 [Movies] Screen focused');
      isFocusedRef.current = true;
    });
    
    const unsubscribeBlur = navigation.addListener('blur', () => {
      console.log('👋 [Movies] Screen blurred - stopping fetches');
      isFocusedRef.current = false;
    });
    
    return () => {
      clearTimeout(syncTimer);
      unsubscribeFocus();
      unsubscribeBlur();
    };
  }, [navigation]);

  const initStalkerClient = async () => {
    try {
      const providerData = await AsyncStorage.getItem('stalker_provider_config');
      if (!providerData) {
        console.error('❌ No provider config found');
        return null;
      }
      
      const provider = JSON.parse(providerData);
      // Use backend URL from constants (remove /api suffix for StalkerPortalClient)
      const backendBaseUrl = API_CONFIG.BACKEND_URL.endsWith('/api') 
        ? API_CONFIG.BACKEND_URL.slice(0, -4) 
        : API_CONFIG.BACKEND_URL;
      console.log('🔧 Using backend URL:', backendBaseUrl);
      
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
      return client;
    } catch (error) {
      console.error('❌ Failed to init Stalker client:', error);
      return null;
    }
  };

  const loadCategories = async (client?: StalkerPortalClient | null) => {
    try {
      setCategoriesLoading(true);
      const cats = await CategoryRepository.getMovieCategories();
      setCategories(cats);
      setCategoriesLoading(false); // Show categories immediately
      
      // Load movie previews progressively for all categories (like LiveTV)
      const activeClient = client || stalkerClient;
      if (activeClient) {
        for (const cat of cats) {
          // Stop if screen is not focused
          if (!isFocusedRef.current) break;
          
          try {
            await loadCategoryMovies(cat, activeClient);
          } catch (error) {
            console.error(`❌ Error loading ${cat.name}:`, error);
          }
        }
      }
    } catch (err) {
      console.error('Error loading movie categories:', err);
      setCategoriesLoading(false);
    }
  };

  const loadCategoryMovies = async (category: Category, client?: StalkerPortalClient | null) => {
    const activeClient = client || stalkerClient;
    if (!activeClient || categoryMovies[category.id]) return;
    
    try {
      console.log(`📡 Loading movies for category: ${category.name}`);
      
      const response = await activeClient.getVodItemsByCategory(category.id, 1);
      const limitedMovies = (response.items || []).slice(0, MAX_THUMBNAILS);
      
      setCategoryMovies(prev => ({
        ...prev,
        [category.id]: limitedMovies
      }));
    } catch (error) {
      console.error('❌ Error loading movies:', error);
    }
  };

  const loadMultipleCategoriesInParallel = async (categoriesToLoad: Category[]) => {
    if (!stalkerClient || !isFocusedRef.current) return;
    
    // Filter out categories that are already loaded or loading
    const unloadedCategories = categoriesToLoad.filter(cat => !categoryMovies[cat.id]);
    if (unloadedCategories.length === 0) return;
    
    console.log(`🚀 Loading ${unloadedCategories.length} categories progressively`);
    
    // Load progressively and update as each completes
    for (const category of unloadedCategories) {
      // Stop loading if screen is no longer focused
      if (!isFocusedRef.current) {
        console.log('⏸️ Stopping movie loading - screen not focused');
        break;
      }
      
      try {
        const response = await stalkerClient.getVodItemsByCategory(category.id, 1);
        const movies = (response.items || []).slice(0, MAX_THUMBNAILS);
        
        // Update immediately as each category loads
        setCategoryMovies(prev => ({
          ...prev,
          [category.id]: movies
        }));
        
        console.log(`✅ Loaded ${movies.length} movies for ${category.name}`);
      } catch (error) {
        console.error(`❌ Error loading ${category.name}:`, error);
      }
    }
  };

  const loadAllMovies = async (category: Category) => {
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
      
      const allMovies = responses.flatMap(r => r.items || []);
      setMovies(allMovies);
      setPage(4);
      setHasMore(responses[responses.length - 1].items.length > 0);
    } catch (error) {
      console.error('❌ Error loading all movies:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMoreMovies = async () => {
    if (!selectedCategory || !stalkerClient || loading || !hasMore) return;
    
    try {
      setLoading(true);
      const response = await stalkerClient.getVodItemsByCategory(selectedCategory.id, page);
      
      if (response.items && response.items.length > 0) {
        setMovies(prev => [...prev, ...response.items]);
        setPage(page + 1);
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error('❌ Error loading more movies:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMoviePress = (movie: StalkerVodItem) => {
    console.log('🎬 Navigate to movie detail:', movie.name);
    navigation.navigate('MovieDetail', { movie, portalUrl });
  };

  const getImageUrl = async (item: StalkerVodItem): Promise<string> => {
    if (!item.screenshot_uri) {
      return FALLBACK_IMAGE;
    }
    
    // Use direct URL (same as LiveTV) - simpler and more reliable
    const directUrl = `${portalUrl}${item.screenshot_uri}`;
    return directUrl;
  };

  const handleBack = () => {
    setSelectedCategory(null);
    setMovies([]);
    setPage(1);
  };

  const renderCategoryRow = ({ item: category }: { item: Category }) => {
    return (
      <View style={styles.categoryRow}>
        <View style={styles.categoryHeader}>
          <Text style={styles.categoryName}>{category.name}</Text>
          <TouchableOpacity 
            onPress={() => loadAllMovies(category)}
            style={styles.viewAllButton}
          >
            <Text style={styles.viewAllText}>View All</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.primary} />
          </TouchableOpacity>
        </View>
        
        <FlatList
          horizontal
          data={categoryMovies[category.id] || []}
          renderItem={renderMovieThumbnail}
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

  const MovieThumbnail = React.memo(({ item }: { item: StalkerVodItem }) => {
    const imageUrl = item.screenshot_uri 
      ? `${portalUrl}${item.screenshot_uri}` 
      : FALLBACK_IMAGE;

    return (
      <TouchableOpacity
        style={styles.thumbnail}
        onPress={() => handleMoviePress(item)}
        activeOpacity={0.7}
      >
        <Image
          source={{ uri: imageUrl }}
          style={styles.thumbnailImage}
          resizeMode="cover"
          defaultSource={require('../../assets/icon.png')}
        />
        <Text style={styles.thumbnailTitle} numberOfLines={2}>
          {item.name || 'Untitled'}
        </Text>
      </TouchableOpacity>
    );
  });

  const MovieCard = React.memo(({ item }: { item: StalkerVodItem }) => {
    const imageUrl = item.screenshot_uri 
      ? `${portalUrl}${item.screenshot_uri}` 
      : FALLBACK_IMAGE;

    return (
      <TouchableOpacity
        style={styles.movieCard}
        onPress={() => handleMoviePress(item)}
        activeOpacity={0.7}
      >
        <Image
          source={{ uri: imageUrl }}
          style={styles.movieImage}
          resizeMode="cover"
          defaultSource={require('../../assets/icon.png')}
        />
        <View style={styles.movieInfo}>
          <Text style={styles.movieTitle} numberOfLines={2}>
            {item.name || 'Untitled'}
          </Text>
          {item.year && (
            <Text style={styles.movieYear}>{String(item.year)}</Text>
          )}
          {item.rating_imdb && item.rating_imdb > 0 && (
            <Text style={styles.movieRating}>⭐ {Number(item.rating_imdb).toFixed(1)}</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  });

  const renderMovieThumbnail = ({ item }: { item: StalkerVodItem }) => {
    return <MovieThumbnail item={item} />;
  };

  const renderMovieCard = ({ item }: { item: StalkerVodItem }) => {
    return <MovieCard item={item} />;
  };

  if (categoriesLoading) {
    return <LoadingIndicator message="Loading movies..." />;
  }

  if (categories.length === 0 && !syncWaitComplete) {
    return <LoadingIndicator message="Syncing movie categories..." />;
  }

  if (categories.length === 0) {
    return <EmptyState message="No movie categories found" icon="🎬" />;
  }

  // Show all movies view when category selected
  if (selectedCategory) {
    return (
      <>
        <View style={styles.container}>
          <StatusBar hidden={false} />
          <View style={styles.header}>
            <TouchableOpacity onPress={handleBack} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{selectedCategory.name}</Text>
          </View>

          <FlatList
            data={movies}
            renderItem={renderMovieCard}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.movieGrid}
            onEndReached={loadMoreMovies}
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
      </>
    );
  }

  // Show categories with horizontal scrolling thumbnails
  return (
    <>
      <View style={styles.container}>
        <StatusBar hidden={false} />
        <FlatList
          data={categories}
          renderItem={renderCategoryRow}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.categoryList}
        />
      </View>
    </>
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
  thumbnailPlaceholder: {
    width: THUMBNAIL_WIDTH,
    height: THUMBNAIL_HEIGHT,
    borderRadius: 8,
    backgroundColor: COLORS.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
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
  movieGrid: {
    padding: SPACING.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  movieCard: {
    width: isTablet ? (width - SPACING.lg * 6) / 4 : (width - SPACING.lg * 4) / 3,
    margin: SPACING.sm,
    minWidth: 100,
  },
  movieImage: {
    width: '100%',
    height: isTablet ? (width - SPACING.lg * 6) / 4 * 1.5 : (width - SPACING.lg * 4) / 3 * 1.5,
    borderRadius: 8,
    backgroundColor: COLORS.backgroundLight,
  },
  movieImagePlaceholder: {
    width: '100%',
    height: isTablet ? (width - SPACING.lg * 6) / 4 * 1.5 : (width - SPACING.lg * 4) / 3 * 1.5,
    borderRadius: 8,
    backgroundColor: COLORS.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  movieInfo: {
    marginTop: SPACING.sm,
  },
  movieTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  movieYear: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  movieRating: {
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
