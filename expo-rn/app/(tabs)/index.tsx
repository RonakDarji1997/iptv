import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/lib/store';
import { useSnapshotStore } from '@/lib/snapshot-store';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import ProfileSelector from '@/components/ProfileSelector';

type Provider = {
  id: string;
  name: string;
  type: string;
  url: string;
  mac?: string;
};

export default function DashboardScreen() {
  const router = useRouter();
  const { user, jwtToken, logout, selectedProfile, selectedProviderIds, setSelectedProviderIds } = useAuthStore();
  const { setSnapshot } = useSnapshotStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mergingSnapshots, setMergingSnapshots] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);

  const fetchProviders = async () => {
    if (!user?.id || !jwtToken) return;

    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:2005';

      const providersResp = await fetch(`${apiUrl}/api/providers?userId=${user.id}`, {
        headers: { Authorization: `Bearer ${jwtToken}` },
      });
      const providersData = await providersResp.json();
      const providersList = providersData.providers || [];
      setProviders(providersList);
      
      // Auto-select first provider if none selected
      if (providersList.length > 0 && selectedProviderIds.length === 0) {
        console.log('[Dashboard] Auto-selecting first provider:', providersList[0].id);
        setSelectedProviderIds([providersList[0].id]);
      }
    } catch (error) {
      console.error('[Dashboard] Error fetching providers:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchProviders();
  }, [user?.id]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchProviders();
  };

  const handleLogout = () => {
    logout();
    router.replace('/(auth)/login');
  };

  const mergeSnapshots = async (providerIds: string[]) => {
    if (providerIds.length === 0) return;

    setMergingSnapshots(true);
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:2005';
      const profileParam = selectedProfile?.id ? `?profileId=${selectedProfile.id}` : '';
      
      // Fetch all snapshots in parallel
      const snapshotPromises = providerIds.map(providerId =>
        fetch(`${apiUrl}/api/providers/${providerId}/snapshot${profileParam}`, {
          headers: { 'Accept-Encoding': 'gzip' },
        }).then(r => r.ok ? r.json() : null)
      );

      const snapshots = (await Promise.all(snapshotPromises)).filter(Boolean);

      if (snapshots.length === 0) return;

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

      // Merge movies (deduplicate by id, add providerId)
      const movieMap = new Map();
      snapshots.forEach(snapshot => {
        const snapshotProviderId = snapshot.provider?.id;
        (snapshot.movies || []).forEach((movie: any) => {
          if (!movieMap.has(movie.id)) {
            movieMap.set(movie.id, { ...movie, providerId: snapshotProviderId });
          }
        });
      });
      mergedSnapshot.movies = Array.from(movieMap.values());

      // Merge series (deduplicate by id, add providerId)
      const seriesMap = new Map();
      snapshots.forEach(snapshot => {
        const snapshotProviderId = snapshot.provider?.id;
        (snapshot.series || []).forEach((s: any) => {
          if (!seriesMap.has(s.id)) {
            seriesMap.set(s.id, { ...s, providerId: snapshotProviderId });
          }
        });
      });
      mergedSnapshot.series = Array.from(seriesMap.values());

      // Merge channels (deduplicate by id, add providerId)
      const channelMap = new Map();
      snapshots.forEach(snapshot => {
        const snapshotProviderId = snapshot.provider?.id;
        (snapshot.channels || []).forEach((channel: any) => {
          if (!channelMap.has(channel.id)) {
            channelMap.set(channel.id, { ...channel, providerId: snapshotProviderId });
          }
        });
      });
      mergedSnapshot.channels = Array.from(channelMap.values());

      // Update cached snapshot
      setSnapshot(mergedSnapshot);
      console.log(`[Dashboard] Merged ${snapshots.length} snapshots:`, {
        categories: mergedSnapshot.categories.length,
        movies: mergedSnapshot.movies.length,
        series: mergedSnapshot.series.length,
        channels: mergedSnapshot.channels.length,
      });
    } catch (error) {
      console.error('[Dashboard] Error merging snapshots:', error);
    } finally {
      setMergingSnapshots(false);
    }
  };

  const handleProviderPress = (providerId: string) => {
    router.push(`/provider/${providerId}`);
  };

  const handleDeleteProvider = async (providerId: string, providerName: string) => {
    console.log('[Dashboard] Delete button pressed for:', providerId, providerName);
    
    // Check if running on web (Alert doesn't work well on web)
    const isWeb = typeof window !== 'undefined' && window.document;
    
    const confirmDelete = isWeb 
      ? window.confirm(`Are you sure you want to delete "${providerName}"? This will remove all associated content, channels, and data.`)
      : await new Promise((resolve) => {
          Alert.alert(
            'Delete Provider',
            `Are you sure you want to delete "${providerName}"? This will remove all associated content, channels, and data.`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
            ]
          );
        });

    if (!confirmDelete) {
      console.log('[Dashboard] Delete cancelled');
      return;
    }

    try {
      console.log('[Dashboard] Deleting provider:', providerId);
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:2005';
      const response = await fetch(`${apiUrl}/api/providers/${providerId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${jwtToken}` },
      });

      if (!response.ok) {
        throw new Error('Failed to delete provider');
      }

      console.log('[Dashboard] Provider deleted successfully');
      // Refresh providers list
      await fetchProviders();
      
      if (isWeb) {
        window.alert('Provider deleted successfully');
      } else {
        Alert.alert('Success', 'Provider deleted successfully');
      }
    } catch (error) {
      console.error('[Dashboard] Error deleting provider:', error);
      if (isWeb) {
        window.alert('Failed to delete provider. Please try again.');
      } else {
        Alert.alert('Error', 'Failed to delete provider. Please try again.');
      }
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#ef4444" />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#ef4444" />
        }
      >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View>
            <Text style={styles.greeting}>Welcome back!</Text>
            <Text style={styles.username}>{user?.username}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <ProfileSelector />
          <Pressable onPress={handleLogout} style={styles.logoutButton}>
            <MaterialIcons name="logout" size={24} color="#ef4444" />
          </Pressable>
        </View>
      </View>

      {/* Providers Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>IPTV Providers</Text>
          <Pressable
            onPress={() => router.push('/(auth)/setup-provider')}
            style={styles.addButton}
          >
            <MaterialIcons name="add" size={20} color="#fff" />
            <Text style={styles.addButtonText}>Add Provider</Text>
          </Pressable>
        </View>

        {providers.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="cloud-off" size={48} color="#3f3f46" />
            <Text style={styles.emptyText}>No providers configured</Text>
            <Text style={styles.emptySubtext}>Add an IPTV provider to get started</Text>
          </View>
        ) : (
          providers.map((provider) => {
            const isSelected = selectedProviderIds.includes(provider.id);
            return (
            <View key={provider.id} style={styles.providerCardContainer}>
              <View style={styles.providerCard}>
                {/* Checkbox for provider selection */}
                <Pressable
                  style={styles.checkboxButton}
                  onPress={async () => {
                    let newSelectedIds: string[];
                    if (isSelected) {
                      if (selectedProviderIds.length > 1) {
                        console.log('[Dashboard] Deselecting provider:', provider.id);
                        newSelectedIds = selectedProviderIds.filter(id => id !== provider.id);
                        setSelectedProviderIds(newSelectedIds);
                        await mergeSnapshots(newSelectedIds);
                      } else {
                        Alert.alert('Cannot Deselect', 'At least one provider must be selected.');
                      }
                    } else {
                      console.log('[Dashboard] Selecting provider:', provider.id);
                      newSelectedIds = [...selectedProviderIds, provider.id];
                      setSelectedProviderIds(newSelectedIds);
                      await mergeSnapshots(newSelectedIds);
                    }
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                    {isSelected && <MaterialIcons name="check" size={16} color="#fff" />}
                  </View>
                </Pressable>

                <Pressable
                  style={styles.providerCardPressable}
                  onPress={() => {
                    console.log('[Dashboard] Card pressed:', provider.id);
                    handleProviderPress(provider.id);
                  }}
                >
                  <View style={styles.providerIconContainer}>
                    <MaterialIcons name="settings-input-antenna" size={24} color="#ef4444" />
                  </View>
                  <View style={styles.providerInfo}>
                    <Text style={styles.providerName}>{provider.name}</Text>
                    <Text style={styles.providerType}>{provider.type.toUpperCase()}</Text>
                    {provider.mac && (
                      <Text style={styles.providerMac}>MAC: {provider.mac}</Text>
                    )}
                  </View>
                  <MaterialIcons name="chevron-right" size={24} color="#71717a" />
                </Pressable>
                <Pressable
                  style={styles.deleteButton}
                  onPress={() => {
                    console.log('[Dashboard] Delete button tapped:', provider.id);
                    handleDeleteProvider(provider.id, provider.name);
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <MaterialIcons name="delete" size={20} color="#ef4444" />
                </Pressable>
              </View>
            </View>
          );
          })
        )}
      </View>

      {/* Help Text */}
      <View style={styles.helpSection}>
        <MaterialIcons name="info-outline" size={20} color="#71717a" />
        <Text style={styles.helpText}>
          Tap on a provider to view content, sync data, and access Live TV, Movies, and Series.
        </Text>
      </View>
      </ScrollView>

      {/* Loading Overlay */}
      {mergingSnapshots && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#ef4444" />
            <Text style={styles.loadingText}>Loading content...</Text>
            <Text style={styles.loadingSubtext}>Fetching from selected providers</Text>
          </View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  content: {
    padding: 16,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#09090b',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  greeting: {
    fontSize: 14,
    color: '#a1a1aa',
  },
  username: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  logoutButton: {
    padding: 8,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ef4444',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  activeProviderSection: {
    backgroundColor: '#18181b',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  activeProviderLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#a1a1aa',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  checkboxButton: {
    padding: 8,
    marginRight: 8,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#3f3f46',
    backgroundColor: '#18181b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#ef4444',
    borderColor: '#ef4444',
  },
  emptyState: {
    backgroundColor: '#18181b',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#27272a',
  },
  emptyText: {
    fontSize: 16,
    color: '#fff',
    marginTop: 12,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#71717a',
    marginTop: 4,
  },
  providerCardContainer: {
    marginBottom: 12,
  },
  providerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181b',
    borderRadius: 12,
    paddingVertical: 16,
    paddingLeft: 16,
    paddingRight: 8,
    borderWidth: 1,
    borderColor: '#27272a',
    gap: 8,
  },
  providerCardPressable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#27272a',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  providerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#27272a',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  providerInfo: {
    flex: 1,
  },
  providerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  providerType: {
    fontSize: 12,
    color: '#ef4444',
    marginBottom: 2,
  },
  providerMac: {
    fontSize: 12,
    color: '#71717a',
  },
  helpSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#18181b',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  helpText: {
    flex: 1,
    fontSize: 14,
    color: '#71717a',
    lineHeight: 20,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  loadingCard: {
    backgroundColor: '#18181b',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#27272a',
    minWidth: 250,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  loadingSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: '#71717a',
    textAlign: 'center',
  },
});
