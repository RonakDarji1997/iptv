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

interface Series {
  id: string;
  name: string;
  poster: string | null;
  year: string | null;
  yearEnd: string | null;
  ratingImdb: number | null;
  genres: string | null;
  episodeCount: number | null;
  categoryId: string | null;
}

interface Category {
  id: string;
  name: string;
  type: string;
}

export default function SeriesScreen() {
  const router = useRouter();
  const { user, selectedProfile, selectedProviderIds } = useAuthStore();
  const { snapshot: cachedSnapshot, setSnapshot } = useSnapshotStore();

  const [categories, setCategories] = useState<Category[]>([]);
  const [series, setSeries] = useState<Series[]>([]);
  const [categorizedSeries, setCategorizedSeries] = useState<{ [key: string]: Series[] }>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Dashboard already fetched and cached snapshot, just use it
    if (cachedSnapshot && cachedSnapshot.series) {
      console.log('[Series] Using cached snapshot from dashboard');
      loadFromCache();
    } else {
      console.log('[Series] No cache yet, waiting for dashboard to load...');
      // Dashboard will load it, but fetch as fallback
      loadSnapshot();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cachedSnapshot]);

  useEffect(() => {
    organizeSeriesByCategory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, categories]);

  // Ensure adult categories render at the end of the list
  const orderCategoriesWithAdultLast = (cats: Category[]) => {
    const adultRe = /adult/i;
    const normal = cats.filter((c) => !adultRe.test(c.name));
    const adult = cats.filter((c) => adultRe.test(c.name));
    return [...normal, ...adult];
  };

  const loadFromCache = () => {
    if (!cachedSnapshot) return;
    
    const seriesCategories = cachedSnapshot.categories.filter(
      (cat: { hasSeries?: boolean }) => cat.hasSeries === true
    );

    // move adult categories to the end
    setCategories(orderCategoriesWithAdultLast(seriesCategories));
    setSeries(cachedSnapshot.series || []);
    setLoading(false);
    
    console.log(`[Series] Loaded from cache: ${cachedSnapshot.series?.length || 0} series`);
  };

  const loadSnapshot = async (forceRefresh = false) => {
    if (!user) {
      setError('Not authenticated');
      setLoading(false);
      return;
    }

    if (selectedProviderIds.length === 0) {
      setError('No provider selected');
      setLoading(false);
      return;
    }

    try {
      setError('');
      if (!forceRefresh) setLoading(true);

      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:2005';
      
      // Fetch snapshots for all selected providers
      const profileParam = selectedProfile?.id ? `?profileId=${selectedProfile.id}` : '';
      const snapshotPromises = selectedProviderIds.map(providerId =>
        fetch(`${apiUrl}/api/providers/${providerId}/snapshot${profileParam}`, {
          headers: { 'Accept-Encoding': 'gzip' },
        }).then(r => r.ok ? r.json() : null)
      );

      const snapshots = (await Promise.all(snapshotPromises)).filter(Boolean);

      if (snapshots.length === 0) {
        throw new Error('Failed to load content from selected providers');
      }

      // Merge snapshots
      const mergedSnapshot = {
        categories: [],
        movies: [],
        series: [],
        channels: [],
        provider: snapshots[0].provider,
      };

      // Merge categories (deduplicate by name)
      const categoryMap = new Map();
      snapshots.forEach(snapshot => {
        snapshot.categories.forEach((cat: any) => {
          if (!categoryMap.has(cat.name)) {
            categoryMap.set(cat.name, cat);
          }
        });
      });
      mergedSnapshot.categories = Array.from(categoryMap.values());

      // Merge series (deduplicate by id)
      const seriesMap = new Map();
      snapshots.forEach(snapshot => {
        (snapshot.series || []).forEach((s: any) => {
          if (!seriesMap.has(s.id)) {
            seriesMap.set(s.id, s);
          }
        });
      });
      mergedSnapshot.series = Array.from(seriesMap.values());

      // Cache the merged snapshot
      setSnapshot(mergedSnapshot);

      // Extract series categories
      const seriesCategories = mergedSnapshot.categories.filter(
        (cat: { hasSeries?: boolean }) => cat.hasSeries === true
      );

      // make sure adult categories appear last
      setCategories(orderCategoriesWithAdultLast(seriesCategories));
      setSeries(mergedSnapshot.series);
      
      console.log(`[Series] Loaded ${mergedSnapshot.series.length} series from ${snapshots.length} providers, ${seriesCategories.length} categories`);
    } catch (err) {
      console.error('Load snapshot error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load series');
    } finally {
      setLoading(false);
      if (forceRefresh) setRefreshing(false);
    }
  };

  const organizeSeriesByCategory = () => {
    const organized: { [key: string]: Series[] } = {};
    
    categories.forEach((category) => {
      const categorySeries = series.filter(s => s.categoryId === category.id);
      if (categorySeries.length > 0) {
        organized[category.id] = categorySeries;
      }
    });
    
    setCategorizedSeries(organized);
  };

  const handleSeriesPress = (item: Series) => {
    // Use providerId embedded in series from merge, fallback to first selected
    const providerId = (item as any).providerId || selectedProviderIds[0];
    
    console.log('[Series] Clicking series:', {
      seriesId: item.id,
      seriesName: item.name,
      providerId,
      embeddedProviderId: (item as any).providerId,
      fallbackProviderId: selectedProviderIds[0],
      hasProviderId: !!providerId,
    });
    
    if (!providerId) {
      console.error('[Series] ERROR: No providerId set!');
      setError('Provider not selected. Please select a provider from dashboard.');
      return;
    }
    
    router.push({
      pathname: '/series/[id]',
      params: {
        id: item.id,
        name: item.name,
        poster: item.poster || '',
        providerId,
      },
    });
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadSnapshot(true);
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
        <Pressable style={styles.retryButton} onPress={() => loadSnapshot()}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
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
          const categorySeries = categorizedSeries[category.id] || [];
          if (categorySeries.length === 0) return null;

          return (
            <CategoryRow
              key={category.id}
              category={category}
              items={categorySeries as any}
              contentType="series"
              onItemPress={handleSeriesPress as any}
              maxItems={25}
            />
          );
        })}

        {categories.length === 0 && !loading && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No series categories available</Text>
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
