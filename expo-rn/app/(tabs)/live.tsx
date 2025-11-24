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

interface Channel {
  id: string;
  name: string;
  logo: string | null;
  number: number | null;
  cmd: string | null;
  categoryId: string | null;
  [key: string]: unknown;
}

interface Category {
  id: string;
  name: string;
  type: string;
}

export default function LiveScreen() {
  const router = useRouter();
  const { user, selectedProfile } = useAuthStore();
  const { snapshot: cachedSnapshot, setSnapshot } = useSnapshotStore();

  const [categories, setCategories] = useState<Category[]>([]);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [categorizedChannels, setCategorizedChannels] = useState<{ [key: string]: Channel[] }>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Dashboard already fetched and cached snapshot, just use it
    if (cachedSnapshot && cachedSnapshot.channels) {
      console.log('[Live] Using cached snapshot from dashboard');
      loadFromCache();
    } else {
      console.log('[Live] No cache yet, loading snapshot...');
      loadSnapshot();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cachedSnapshot]);

  useEffect(() => {
    organizeChannelsByCategory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels, categories]);

  const loadFromCache = () => {
    if (!cachedSnapshot) return;
    
    const channelCategories = cachedSnapshot.categories.filter(
      (cat: Category) => cat.type === 'CHANNEL'
    );
    setCategories(channelCategories);
    setChannels(cachedSnapshot.channels || []);
    setLoading(false);
    
    console.log(`[Live] Loaded from cache: ${cachedSnapshot.channels?.length || 0} channels`);
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
      
      const providersResp = await fetch(`${apiUrl}/api/providers?userId=${user.id}`);
      const providersData = await providersResp.json();
      
      if (!providersData.providers || providersData.providers.length === 0) {
        setError('No provider configured');
        setLoading(false);
        return;
      }

      const provider = providersData.providers[0];
      setProviderId(provider.id);

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

      const channelCategories = snapshot.categories.filter(
        (cat: Category) => cat.type === 'CHANNEL'
      );
      setCategories(channelCategories);
      setChannels(snapshot.channels || []);
      
      console.log(`[Live] Loaded ${snapshot.channels?.length || 0} channels, ${channelCategories.length} categories`);
    } catch (err) {
      console.error('Load snapshot error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load channels');
    } finally {
      setLoading(false);
      if (forceRefresh) setRefreshing(false);
    }
  };

  const organizeChannelsByCategory = () => {
    const organized: { [key: string]: Channel[] } = {};
    
    categories.forEach((category) => {
      const categoryChannels = channels.filter(ch => ch.categoryId === category.id);
      if (categoryChannels.length > 0) {
        organized[category.id] = categoryChannels;
      }
    });
    
    setCategorizedChannels(organized);
  };

  const handleChannelPress = (channel: Channel) => {
    router.push({
      pathname: '/channel/[id]',
      params: {
        id: channel.id,
        name: channel.name,
        logo: channel.logo || '',
        providerId: providerId || '',
        cmd: channel.cmd,
      },
    });
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadSnapshot(true);
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
        <Pressable style={styles.retryButton} onPress={() => loadSnapshot()}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (channels.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>No channels available</Text>
        <Text style={styles.emptySubtext}>Run sync to load live TV channels</Text>
        <Pressable style={styles.retryButton} onPress={handleRefresh}>
          <Text style={styles.retryText}>Refresh</Text>
        </Pressable>
      </View>
    );
  }

  // Get categories that have channels
  const categoriesWithChannels = categories.filter(
    (cat) => categorizedChannels[cat.id] && categorizedChannels[cat.id].length > 0
  );

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor="#ef4444"
        />
      }
    >
      {categoriesWithChannels.map((category) => (
        <CategoryRow
          key={category.id}
          category={category}
          items={categorizedChannels[category.id]}
          contentType="itv"
          onItemPress={(item) => handleChannelPress(item as unknown as Channel)}
        />
      ))}
      
      {/* Bottom padding */}
      <View style={{ height: 40 }} />
    </ScrollView>
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
  emptyText: {
    fontSize: 18,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#888',
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
});
