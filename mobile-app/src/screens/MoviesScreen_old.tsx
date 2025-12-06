import React, { useState, useEffect } from 'react';
import { StyleSheet, View, FlatList, Image, TouchableOpacity, Text, ActivityIndicator, Dimensions, ScrollView } from 'react-native';
import { COLORS, SPACING } from '../constants';
import { LoadingIndicator, ErrorState, EmptyState } from '../components';
import { CategoryRepository } from '../repositories';
import { Category } from '../types';
import { StalkerPortalClient, StalkerVodItem } from '../services/StalkerPortalClient';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');
const ITEM_WIDTH = (width - SPACING.lg * 3) / 2;
const ITEM_HEIGHT = ITEM_WIDTH * 1.5;

export default function MoviesScreen({ navigation }: any) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [movies, setMovies] = useState<StalkerVodItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [stalkerClient, setStalkerClient] = useState<StalkerPortalClient | null>(null);

  useEffect(() => {
    initStalkerClient();
    loadCategories();
  }, []);

  useEffect(() => {
    if (selectedCategory && stalkerClient) {
      loadMovies(true);
    }
  }, [selectedCategory]);

  const initStalkerClient = async () => {
    try {
      const providerData = await AsyncStorage.getItem('stalker_provider_config');
      if (!providerData) {
        console.error('❌ No provider config found in AsyncStorage');
        return;
      }
      
      const provider = JSON.parse(providerData);
      console.log('📱 Initializing Stalker client for Movies with provider:', provider.name);
      
      const client = new StalkerPortalClient(
        provider.portalUrl,
        provider.macAddress,
        '058357N656529'
      );
      
      if (provider.bearerToken) {
        client.setToken(provider.bearerToken);
        console.log('✅ Movies Stalker client initialized with token');
      }
      
      setStalkerClient(client);
    } catch (error) {
      console.error('❌ Failed to init Stalker client:', error);
    }
  };

  const loadCategories = async () => {
    try {
      setCategoriesLoading(true);
      setCategoriesError(null);
      const cats = await CategoryRepository.getMovieCategories();
      setCategories(cats);
      if (cats.length > 0) {
        setSelectedCategory(cats[0]);
      }
    } catch (err) {
      console.error('Error loading movie categories:', err);
      setCategoriesError('Failed to load movie categories');
    } finally {
      setCategoriesLoading(false);
    }
  };

  const loadMovies = async (reset: boolean = false) => {
    if (!selectedCategory || !stalkerClient || loading) return;
    
    try {
      setLoading(true);
      const currentPage = reset ? 1 : page;
      
      console.log(`📡 Fetching movies for category ${selectedCategory.id}, page ${currentPage}`);
      
      const response = await stalkerClient.getVodItemsByCategory(selectedCategory.id, currentPage);
      
      if (reset) {
        setMovies(response.items || []);
        setPage(2);
      } else {
        setMovies(prev => [...prev, ...(response.items || [])]);
        setPage(currentPage + 1);
      }
      
      setHasMore((response.items || []).length > 0);
    } catch (error) {
      console.error('Error loading movies:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMore = () => {
    if (hasMore && !loading) {
      loadMovies(false);
    }
  };

  const handleMoviePress = (movie: StalkerVodItem) => {
    navigation.navigate('MovieDetail', { movieId: movie.id, movie });
  };

  const renderMovieItem = ({ item }: { item: StalkerVodItem }) => {
    const imageUrl = item.screenshot_uri 
      ? `http://tv.stream4k.cc${item.screenshot_uri}`
      : 'https://via.placeholder.com/300x450?text=No+Image';

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
        />
        <View style={styles.movieInfo}>
          <Text style={styles.movieTitle} numberOfLines={2}>
            {item.name}
          </Text>
          {item.year && (
            <Text style={styles.movieYear}>{item.year}</Text>
          )}
          {item.rating_imdb && (
            <Text style={styles.movieRating}>⭐ {item.rating_imdb.toFixed(1)}</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderCategoryTab = (category: Category) => {
    const isSelected = selectedCategory?.id === category.id;
    return (
      <TouchableOpacity
        key={category.id}
        style={[styles.categoryTab, isSelected && styles.categoryTabActive]}
        onPress={() => setSelectedCategory(category)}
        activeOpacity={0.7}
      >
        <Text style={[styles.categoryText, isSelected && styles.categoryTextActive]}>
          {category.name}
        </Text>
      </TouchableOpacity>
    );
  };

  if (categoriesLoading) {
    return <LoadingIndicator message="Loading movies..." />;
  }

  if (categoriesError) {
    return <ErrorState message={categoriesError} />;
  }

  if (categories.length === 0) {
    return (
      <EmptyState 
        message="No movie categories found. Please sync data first." 
        icon="🎬" 
      />
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView 
        horizontal 
        style={styles.categoryScroll}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryScrollContent}
      >
        {categories.map(renderCategoryTab)}
      </ScrollView>

      <FlatList
        data={movies}
        renderItem={renderMovieItem}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.movieList}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loading ? (
            <View style={styles.loadingFooter}>
              <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          !loading ? (
            <EmptyState message="No movies found in this category" icon="🎬" />
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  categoryScroll: {
    maxHeight: 50,
    backgroundColor: COLORS.backgroundLight,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  categoryScrollContent: {
    paddingHorizontal: SPACING.md,
    alignItems: 'center',
  },
  categoryTab: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    marginRight: SPACING.sm,
    borderRadius: 20,
    backgroundColor: COLORS.cardBackground,
  },
  categoryTabActive: {
    backgroundColor: COLORS.primary,
  },
  categoryText: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  categoryTextActive: {
    color: COLORS.text,
  },
  movieList: {
    padding: SPACING.md,
  },
  movieCard: {
    width: ITEM_WIDTH,
    marginBottom: SPACING.lg,
    marginHorizontal: SPACING.sm,
  },
  movieImage: {
    width: '100%',
    height: ITEM_HEIGHT,
    borderRadius: 8,
    backgroundColor: COLORS.cardBackground,
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
    color: COLORS.primary,
    fontSize: 12,
    marginTop: 2,
  },
  loadingFooter: {
    paddingVertical: SPACING.xl,
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  bottomSpacer: {
    height: SPACING.xxl,
  },
});
