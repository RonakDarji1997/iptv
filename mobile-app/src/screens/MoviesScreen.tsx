import React, { useState, useEffect } from 'react';
import { 
  StyleSheet,
  View,
  FlatList,
  Image,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  useWindowDimensions,
  Modal,
  StatusBar
} from 'react-native';
import { COLORS, SPACING, API_CONFIG } from '../constants';
import { LoadingIndicator, ErrorState, EmptyState } from '../components';
// import { ProviderDropdown } from '../components/ProviderDropdown'; // Temporarily disabled
import { CategoryRepository } from '../repositories';
import { Category } from '../types';
import { StalkerPortalClient, StalkerVodItem } from '../services/StalkerPortalClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { ProviderService } from '../services/ProviderService';
import { onSelectedProvidersChange } from '../services/ProviderSelectionEvents';

const MAX_THUMBNAILS = 25;
const FALLBACK_IMAGE = 'https://via.placeholder.com/300x450/1a1a1a/ffffff?text=No+Image';

export default function MoviesScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const MOVIE_COLUMNS = isTablet ? 4 : 3;
  const THUMBNAIL_WIDTH = isTablet ? (width - SPACING.lg * 7) / 5 : (width - SPACING.lg * 5) / 3;
  const THUMBNAIL_HEIGHT = THUMBNAIL_WIDTH * 1.5;
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<string | undefined>(undefined);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [syncWaitComplete, setSyncWaitComplete] = useState(false);
  const [categoryMovies, setCategoryMovies] = useState<Record<string, StalkerVodItem[]>>({});
  const [movies, setMovies] = useState<StalkerVodItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [stalkerClient, setStalkerClient] = useState<StalkerPortalClient | null>(null);
  const [portalUrl, setPortalUrl] = useState<string>('');
  const [loadedCategoryIds, setLoadedCategoryIds] = useState<Set<string>>(new Set());
  const isFocusedRef = React.useRef(true);
  const stalkerClientRef = React.useRef<StalkerPortalClient | null>(null);
  const loadedCategoryIdsRef = React.useRef<Set<string>>(new Set());

  // Update refs when state changes
  React.useEffect(() => {
    stalkerClientRef.current = stalkerClient;
  }, [stalkerClient]);

  React.useEffect(() => {
    loadedCategoryIdsRef.current = loadedCategoryIds;
  }, [loadedCategoryIds]);

  // Reload categories when provider selection changes
  useEffect(() => {
    if (stalkerClient) {
      (async () => {
        if (selectedProviderId) {
          await loadCategories(stalkerClient, [selectedProviderId]);
        } else {
          const selectedIds = await ProviderService.getSelectedProviderIds();
          await loadCategories(stalkerClient, selectedIds);
        }
        setCategoryMovies({});
        setLoadedCategoryIds(new Set());
      })();
    }
  }, [selectedProviderId]);

  useEffect(() => {
    const init = async () => {
      // Load the first selected provider as default (respect user's provider settings)
      const selectedProviders = await ProviderService.getSelectedProviders();
      console.log('🎬 [Movies] Selected providers:', selectedProviders.map(p => ({ id: p.id, name: p.name })));
      if (selectedProviders.length > 0 && !selectedProviderId) {
        console.log('🎯 [Movies] Setting default provider from selection:', selectedProviders[0].id, selectedProviders[0].name);
        setSelectedProviderId(selectedProviders[0].id);
      }
      
      const client = await initStalkerClient();
      if (client) {
        const selectedIds = await ProviderService.getSelectedProviderIds();
        await loadCategories(client, selectedIds);
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

  // Subscribe to provider selection changes (e.g., user saved settings)
  useEffect(() => {
    const unsubscribe = onSelectedProvidersChange(async (ids: string[]) => {
      console.log('🔁 [Movies] Provider selection changed (event):', ids);
      try {
        const selectedIds = await ProviderService.getSelectedProviderIds();
        const first = selectedIds && selectedIds.length > 0 ? selectedIds[0] : undefined;
        if (first && first !== selectedProviderId) {
          setSelectedProviderId(first);
        }
        // Force refresh categories for the current selected set
        await loadCategories(stalkerClient, selectedIds);
        setCategoryMovies({});
        setLoadedCategoryIds(new Set());
      } catch (err) {
        console.error('🔁 [Movies] Error handling provider change event:', err);
      }
    });
    return () => unsubscribe();
  }, [stalkerClient, selectedProviderId]);

  const initStalkerClient = async () => {
    try {
      // Prefer provider matching selectedProviderId when available
      let provider: any = null;
      if (selectedProviderId) {
        provider = await ProviderService.getProviderById(selectedProviderId);
      }

      // Fallback to legacy single provider config
      if (!provider) {
        const providerData = await AsyncStorage.getItem('stalker_provider_config');
        if (!providerData) {
          console.error('❌ No provider config found');
          return null;
        }
        provider = JSON.parse(providerData);
      }
      // Use backend URL from constants (remove /api suffix for StalkerPortalClient)
      const backendBaseUrl = API_CONFIG.BACKEND_URL.endsWith('/api') 
        ? API_CONFIG.BACKEND_URL.slice(0, -4) 
        : API_CONFIG.BACKEND_URL;
      console.log('🔧 Using backend URL:', backendBaseUrl);
      
      const portal = provider.portalUrl || provider.serverUrl || provider.portalUrl;
      const client = new StalkerPortalClient(
        portal,
        provider.macAddress,
        provider.serialNumber || '058357N656529',
        backendBaseUrl
      );

      const token = provider.token || provider.bearerToken;
      if (token) {
        client.setToken(token);
      }
      
      setPortalUrl(portal);
      setStalkerClient(client);
      return client;
    } catch (error) {
      console.error('❌ Failed to init Stalker client:', error);
      return null;
    }
  };

  // Re-init stalker client whenever selected provider changes
  useEffect(() => {
    const reinit = async () => {
      const client = await initStalkerClient();
      if (client) {
        if (selectedProviderId) {
          await loadCategories(client, [selectedProviderId]);
        } else {
          const selectedIds = await ProviderService.getSelectedProviderIds();
          await loadCategories(client, selectedIds);
        }
      }
    };
    reinit();
  }, [selectedProviderId]);

  const loadCategories = async (client?: StalkerPortalClient | null, providerIds?: string[] | string) => {
    try {
      setCategoriesLoading(true);
      const cats = await CategoryRepository.getMovieCategories(providerIds as any);
      setCategories(cats);
      setCategoriesLoading(false); // Show categories immediately without loading movies
    } catch (err) {
      console.error('Error loading movie categories:', err);
      setCategoriesLoading(false);
    }
  };

  const loadCategoryMovies = async (category: Category, client?: StalkerPortalClient | null) => {
    const activeClient = client || stalkerClient;
    if (!activeClient) return;
    const remoteCategoryId = (category as any).categoryId || category.id;
    if (loadedCategoryIds.has(category.id)) return;
    
    try {
      console.log(`📡 Loading movies for category: ${category.name}`);
      setLoadedCategoryIds(prev => new Set(prev).add(category.id));
      
      const response = await activeClient.getVodItemsByCategory(remoteCategoryId, 1);
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
      const remoteCategoryId = (category as any).categoryId || category.id;
      const response = await stalkerClient.getVodItemsByCategory(remoteCategoryId, 1);
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
      const remoteCategoryId = (category as any).categoryId || category.id;
      const responses = await Promise.all(
        pages.map(p => stalkerClient.getVodItemsByCategory(remoteCategoryId, p))
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
      const remoteSelected = (selectedCategory as any).categoryId || selectedCategory.id;
      const response = await stalkerClient.getVodItemsByCategory(remoteSelected, page);
      
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

  const MovieThumbnail = React.memo(({ item }: { item: StalkerVodItem }) => {
    const [hasError, setHasError] = React.useState<boolean>(false);
    const imageUrl = item.screenshot_uri 
      ? `${portalUrl}${item.screenshot_uri}` 
      : FALLBACK_IMAGE;

    return (
      <TouchableOpacity
        style={[styles.thumbnail, { width: THUMBNAIL_WIDTH }]}
        onPress={() => handleMoviePress(item)}
        activeOpacity={0.7}
      >
        {hasError ? (
          <View style={[styles.thumbnailImage, styles.noImagePlaceholder, { width: THUMBNAIL_WIDTH, height: THUMBNAIL_HEIGHT }]}> 
            <Ionicons name="film-outline" size={48} color="#666" />
          </View>
        ) : (
          <Image
            source={{ uri: imageUrl }}
            style={[styles.thumbnailImage, { width: THUMBNAIL_WIDTH, height: THUMBNAIL_HEIGHT }]}
            resizeMode="cover"
            onError={() => setHasError(true)}
          />
        )}
        <Text style={styles.thumbnailTitle} numberOfLines={2}>
          {item.name || 'Untitled'}
        </Text>
      </TouchableOpacity>
    );
  });

  const renderCategoryRow = ({ item: category }: { item: Category }) => {
    const movies = categoryMovies[category.id] || [];
    const isLoaded = loadedCategoryIds.has(category.id);
    
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
        
        {!isLoaded ? (
          <View style={[styles.loadingThumbnails, { width: THUMBNAIL_WIDTH, height: THUMBNAIL_HEIGHT }]}> 
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        ) : movies.length > 0 ? (
          <FlatList
            horizontal
            data={movies}
            renderItem={renderMovieThumbnail}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.thumbnailList}
          />
        ) : (
          <View style={[styles.loadingThumbnails, { width: THUMBNAIL_WIDTH, height: THUMBNAIL_HEIGHT }]}> 
            <Text style={styles.loadingText}>No movies</Text>
          </View>
        )}
      </View>
    );
  };

  const MovieCard = React.memo(({ item }: { item: StalkerVodItem }) => {
    const movieCardWidth = isTablet ? (width - SPACING.lg * 6) / 4 : (width - SPACING.lg * 4) / 3;
    const movieImageHeight = movieCardWidth * 1.5;
    const imageUrl = item.screenshot_uri 
      ? `${portalUrl}${item.screenshot_uri}` 
      : FALLBACK_IMAGE;

    return (
      <TouchableOpacity
        style={[styles.movieCard, { width: movieCardWidth }]}
        onPress={() => handleMoviePress(item)}
        activeOpacity={0.7}
      >
        <Image
          source={{ uri: imageUrl }}
          style={[styles.movieImage, { height: movieImageHeight }]}
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

  // Lazy loading configuration - must be before any conditional returns
  const loadCategoryMoviesRef = React.useRef<typeof loadCategoryMovies | null>(null);
  useEffect(() => { loadCategoryMoviesRef.current = loadCategoryMovies; }, [loadCategoryMovies]);
  const onViewRef = React.useRef((args: { viewableItems: any[] }) => {
    const { viewableItems } = args;
    if (stalkerClientRef.current && isFocusedRef.current && loadCategoryMoviesRef.current) {
      viewableItems.forEach((viewableItem: any) => {
        const category = viewableItem.item;
        if (category && !loadedCategoryIdsRef.current.has(category.id)) {
          loadCategoryMoviesRef.current!(category, stalkerClientRef.current!);
        }
      });
    }
  });

  const viewabilityConfig = React.useRef({ itemVisiblePercentThreshold: 50 }).current;

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
            numColumns={MOVIE_COLUMNS}
            columnWrapperStyle={styles.movieColumnWrapper}
            key={`movies-grid-${MOVIE_COLUMNS}`}
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
        <View style={styles.header}>
          {/* Provider dropdown temporarily hidden across screens. */}
          {/*
          <ProviderDropdown
            selectedProviderId={selectedProviderId}
            onProviderSelect={setSelectedProviderId}
            style={styles.providerDropdown}
          />
          */}
        </View>
        <FlatList
          data={categories}
          renderItem={renderCategoryRow}
          keyExtractor={(item) => `${item.providerId || 'all'}_${item.id}`}
          contentContainerStyle={styles.categoryList}
          onViewableItemsChanged={onViewRef.current}
          viewabilityConfig={viewabilityConfig}
          removeClippedSubviews={true}
          maxToRenderPerBatch={5}
          updateCellsBatchingPeriod={50}
          windowSize={10}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  providerDropdown: {
    flex: 1,
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
    marginRight: SPACING.md,
  },
  thumbnailImage: {
    borderRadius: 8,
    backgroundColor: COLORS.backgroundLight,
  },
  noImagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  thumbnailPlaceholder: {
    borderRadius: 8,
    backgroundColor: COLORS.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.textMuted,
    fontSize: 14,
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
  },
  movieColumnWrapper: {
    justifyContent: 'space-between',
  },
  movieCard: {
    margin: SPACING.sm,
    minWidth: 100,
  },
  movieImage: {
    width: '100%',
    borderRadius: 8,
    backgroundColor: COLORS.backgroundLight,
  },
  movieImagePlaceholder: {
    width: '100%',
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
    justifyContent: 'center',
    alignItems: 'center',
  },
});
