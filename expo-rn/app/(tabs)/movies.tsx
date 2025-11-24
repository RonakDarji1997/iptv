import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  ScrollView,
} from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/lib/store';
import { useSnapshotStore } from '@/lib/snapshot-store';
import CategoryRow from '@/components/CategoryRow';

interface Movie {
  id: string;
  name: string;
  poster: string | null;
  year: string | null;
  ratingImdb: number | null;
  genres: string | null;
  categoryId: string | null;
}

interface Category {
  id: string;
  name: string;
  type: string;
}

export default function MoviesScreen() {
  const router = useRouter();
  const { user, selectedProfile } = useAuthStore();
  const { snapshot: cachedSnapshot, setSnapshot } = useSnapshotStore();

  const [categories, setCategories] = useState<Category[]>([]);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [categorizedMovies, setCategorizedMovies] = useState<{ [key: string]: Movie[] }>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Dashboard already fetched and cached snapshot, just use it
    if (cachedSnapshot && cachedSnapshot.movies) {
      console.log('[Movies] Using cached snapshot from dashboard');
      loadFromCache();
    } else {
      console.log('[Movies] No cache yet, waiting for dashboard to load...');
      // Dashboard will load it, but fetch as fallback
      loadSnapshot();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cachedSnapshot]);

  useEffect(() => {
    organizeMoviesByCategory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movies, categories]);

  // Ensure adult categories render at the end of the list
  const orderCategoriesWithAdultLast = (cats: Category[]) => {
    const adultRe = /adult/i;
    const normal = cats.filter((c) => !adultRe.test(c.name));
    const adult = cats.filter((c) => adultRe.test(c.name));
    return [...normal, ...adult];
  };

  const loadFromCache = () => {
    if (!cachedSnapshot) return;
    
    const movieCategories = cachedSnapshot.categories.filter(
      (cat: any) => cat.hasMovies === true
    );

    // move adult categories to the end
    setCategories(orderCategoriesWithAdultLast(movieCategories));
    setMovies(cachedSnapshot.movies || []);
    setLoading(false);
    
    console.log(`[Movies] Loaded from cache: ${cachedSnapshot.movies?.length || 0} movies`);
  };

  const loadSnapshot = async (forceRefresh = false) => {
    if (!user) {
      setError('Not authenticated');
      setLoading(false);
      return;
    }

    try {
      setError('');
      if (!forceRefresh) setLoading(true);

      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:2005';
      
      // Get user's provider
      const providersResp = await fetch(`${apiUrl}/api/providers?userId=${user.id}`);
      const providersData = await providersResp.json();
      
      if (!providersData.providers || providersData.providers.length === 0) {
        setError('No provider configured');
        setLoading(false);
        return;
      }

      const provider = providersData.providers[0];
      setProviderId(provider.id);

      // Fetch compressed snapshot
      const profileParam = selectedProfile?.id ? `?profileId=${selectedProfile.id}` : '';
      const snapshotResp = await fetch(`${apiUrl}/api/providers/${provider.id}/snapshot${profileParam}`, {
        headers: {
          'Accept-Encoding': 'gzip',
        },
      });

      if (!snapshotResp.ok) {
        throw new Error('Failed to load content');
      }

      const snapshot = await snapshotResp.json();

      // Cache the snapshot in store
      setSnapshot(snapshot);

      // Extract movie categories (categories that contain movies)
      const movieCategories = snapshot.categories.filter(
        (cat: any) => cat.hasMovies === true
      );

      // make sure adult categories appear last
      setCategories(orderCategoriesWithAdultLast(movieCategories));

      // Set all movies
      setMovies(snapshot.movies || []);
      
      console.log(`[Movies] Loaded ${snapshot.movies?.length || 0} movies, ${movieCategories.length} categories`);
    } catch (err) {
      console.error('Load snapshot error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load movies');
    } finally {
      setLoading(false);
      if (forceRefresh) setRefreshing(false);
    }
  };

  const organizeMoviesByCategory = () => {
    const organized: { [key: string]: Movie[] } = {};
    
    categories.forEach((category) => {
      const categoryMovies = movies.filter(movie => movie.categoryId === category.id);
      if (categoryMovies.length > 0) {
        organized[category.id] = categoryMovies;
      }
    });
    
    setCategorizedMovies(organized);
  };

  const handleMoviePress = (item: Movie) => {
    router.push({
      pathname: '/watch/[id]',
      params: {
        id: item.id,
        type: 'vod',
        title: item.name,
        screenshot: item.poster || '',
        providerId: providerId || '',
      },
    });
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadSnapshot(true);
  };

  if (loading && movies.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#ef4444" />
        <Text style={styles.loadingText}>Loading movies...</Text>
      </View>
    );
  }

  if (error && movies.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.retryButton} onPress={loadSnapshot}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Category Rows */}
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#ef4444"
          />
        }
      >
        {categories.map((category) => {
          const categoryMovies = categorizedMovies[category.id] || [];
          if (categoryMovies.length === 0) return null;

          return (
            <CategoryRow
              key={category.id}
              category={category}
              items={categoryMovies}
              contentType="vod"
              onItemPress={handleMoviePress}
              maxItems={25}
            />
          );
        })}

        {categories.length === 0 && !loading && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No movie categories available</Text>
          </View>
        )}
      </ScrollView>
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
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#888',
  },
  errorText: {
    fontSize: 16,
    color: '#ef4444',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#ef4444',
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    padding: 16,
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#888',
  },
  scrollView: {
    flex: 1,
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
