import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '@/lib/store';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

interface Category {
  id: string;
  externalId: string;
  name: string;
  type: 'CHANNEL' | 'MOVIE' | 'SERIES';
}

type TabType = 'all' | 'channels' | 'movies' | 'series';

export default function ManageCategoriesScreen() {
  const router = useRouter();
  const { id: providerId } = useLocalSearchParams<{ id: string }>();
  const { jwtToken } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('all');

  const fetchCategories = useCallback(async () => {
    if (!providerId || !jwtToken) return;

    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:2005';
      const response = await fetch(`${apiUrl}/api/providers/${providerId}/snapshot`, {
        headers: {
          Authorization: `Bearer ${jwtToken}`,
          'Accept-Encoding': 'gzip',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setCategories(data.categories || []);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [providerId, jwtToken]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchCategories();
  };

  const filteredCategories = categories.filter((cat) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'channels') return cat.type === 'CHANNEL';
    if (activeTab === 'movies') return cat.type === 'MOVIE';
    if (activeTab === 'series') return cat.type === 'SERIES';
    return true;
  });

  const getCategoryIcon = (type: string) => {
    switch (type) {
      case 'CHANNEL':
        return 'live-tv';
      case 'MOVIE':
        return 'movie';
      case 'SERIES':
        return 'tv';
      default:
        return 'folder';
    }
  };

  const getCategoryColor = (type: string) => {
    switch (type) {
      case 'CHANNEL':
        return '#ef4444';
      case 'MOVIE':
        return '#3b82f6';
      case 'SERIES':
        return '#22c55e';
      default:
        return '#71717a';
    }
  };

  const stats = {
    all: categories.length,
    channels: categories.filter((c) => c.type === 'CHANNEL').length,
    movies: categories.filter((c) => c.type === 'MOVIE').length,
    series: categories.filter((c) => c.type === 'SERIES').length,
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ef4444" />
        <Text style={styles.loadingText}>Loading categories...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Manage Categories</Text>
          <Text style={styles.headerSubtitle}>{categories.length} total categories</Text>
        </View>
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tab, activeTab === 'all' && styles.activeTab]}
          onPress={() => setActiveTab('all')}
        >
          <Text style={[styles.tabText, activeTab === 'all' && styles.activeTabText]}>
            All ({stats.all})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'channels' && styles.activeTab]}
          onPress={() => setActiveTab('channels')}
        >
          <Text style={[styles.tabText, activeTab === 'channels' && styles.activeTabText]}>
            Channels ({stats.channels})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'movies' && styles.activeTab]}
          onPress={() => setActiveTab('movies')}
        >
          <Text style={[styles.tabText, activeTab === 'movies' && styles.activeTabText]}>
            Movies ({stats.movies})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'series' && styles.activeTab]}
          onPress={() => setActiveTab('series')}
        >
          <Text style={[styles.tabText, activeTab === 'series' && styles.activeTabText]}>
            Series ({stats.series})
          </Text>
        </Pressable>
      </View>

      {/* Category List */}
      <ScrollView
        style={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#ef4444" />
        }
      >
        {filteredCategories.map((category) => (
          <View key={category.id} style={styles.categoryCard}>
            <View style={[styles.iconContainer, { backgroundColor: getCategoryColor(category.type) + '20' }]}>
              <MaterialIcons
                name={getCategoryIcon(category.type) as 'live-tv' | 'movie' | 'tv' | 'folder'}
                size={24}
                color={getCategoryColor(category.type)}
              />
            </View>
            <View style={styles.categoryContent}>
              <Text style={styles.categoryName}>{category.name}</Text>
              <Text style={styles.categoryType}>{category.type}</Text>
            </View>
            <Text style={styles.categoryId}>#{category.externalId}</Text>
          </View>
        ))}

        {filteredCategories.length === 0 && (
          <View style={styles.emptyContainer}>
            <MaterialIcons name="folder-open" size={48} color="#71717a" />
            <Text style={styles.emptyText}>No categories found</Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#18181b',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#18181b',
  },
  loadingText: {
    marginTop: 12,
    color: '#71717a',
    fontSize: 16,
  },
  header: {
    backgroundColor: '#27272a',
    padding: 20,
    paddingTop: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  backButton: {
    padding: 8,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#71717a',
    marginTop: 4,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#27272a',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#3f3f46',
  },
  activeTab: {
    backgroundColor: '#ef4444',
  },
  tabText: {
    color: '#a1a1aa',
    fontSize: 13,
    fontWeight: '600',
  },
  activeTabText: {
    color: '#fff',
  },
  list: {
    flex: 1,
    padding: 16,
  },
  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#27272a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    gap: 12,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryContent: {
    flex: 1,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  categoryType: {
    fontSize: 12,
    color: '#71717a',
    marginTop: 2,
  },
  categoryId: {
    fontSize: 12,
    color: '#52525b',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    color: '#71717a',
    fontSize: 16,
  },
});
