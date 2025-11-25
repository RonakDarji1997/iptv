import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  AppState,
} from 'react-native';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '@/lib/store';
import { useSnapshotStore } from '@/lib/snapshot-store';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Stats = {
  channels: number;
  movies: number;
  series: number;
  lastSync?: string;
};

type Provider = {
  id: string;
  name: string;
  type: string;
  url: string;
  mac?: string;
  lastSync?: string;
};

type SyncProgress = {
  totalItems: number;
  processedItems: number;
  moviesCount: number;
  seriesCount: number;
  channelsCount: number;
  progress: number;
};

export default function ProviderDetailScreen() {
  const router = useRouter();
  const { id: providerId } = useLocalSearchParams<{ id: string }>();
  const { jwtToken, selectedProfile } = useAuthStore();
  const { setSnapshot, isStale } = useSnapshotStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appState = useRef(AppState.currentState);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [stats, setStats] = useState<Stats>({ channels: 0, movies: 0, series: 0 });

  const fetchProviderData = useCallback(async (forceRefresh = false) => {
    if (!providerId || !jwtToken) return;

    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:2005';

      // Fetch provider details and sync status
      const [providerResponse, syncResponse] = await Promise.all([
        fetch(`${apiUrl}/api/providers/${providerId}`, {
          headers: { Authorization: `Bearer ${jwtToken}` },
        }),
        fetch(`${apiUrl}/api/providers/${providerId}/sync`, {
          headers: { Authorization: `Bearer ${jwtToken}` },
        }),
      ]);

      if (providerResponse.ok) {
        const providerData = await providerResponse.json();
        setProvider(providerData);
      }

      if (syncResponse.ok) {
        const syncData = await syncResponse.json();
        setStats({
          channels: syncData.stats.channels || 0,
          movies: syncData.stats.movies || 0,
          series: syncData.stats.series || 0,
          lastSync: syncData.lastSync,
        });
      }

      // Fetch and cache snapshot for Movies/Series tabs (with staleness check)
      const shouldRefreshSnapshot = forceRefresh || isStale(30); // Refresh if >30 minutes old or forced
      
      if (shouldRefreshSnapshot) {
        console.log('[ProviderDetail] Fetching fresh snapshot...', { 
          reason: forceRefresh ? 'forced' : 'stale cache (>30 min)' 
        });
        const profileParam = selectedProfile?.id ? `?profileId=${selectedProfile.id}` : '';
        const snapshotResp = await fetch(`${apiUrl}/api/providers/${providerId}/snapshot${profileParam}`, {
          headers: { 
            Authorization: `Bearer ${jwtToken}`,
            'Accept-Encoding': 'gzip',
          }, 
        });
        
        if (snapshotResp.ok) {
          const snapshot = await snapshotResp.json();
          setSnapshot(snapshot);
          console.log('[ProviderDetail] Fresh snapshot cached:', {
            channels: snapshot.channels?.length || 0,
            movies: snapshot.movies?.length || 0,
            series: snapshot.series?.length || 0,
            generatedAt: snapshot.generatedAt,
          });
        }
      } else {
        console.log('[ProviderDetail] Using cached snapshot (still fresh)');
      }
    } catch (error) {
      console.error('[ProviderDetail] Error fetching data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [providerId, jwtToken, setSnapshot, isStale, selectedProfile?.id]);

  const startSyncPolling = useCallback(() => {
    if (!providerId || !jwtToken) return;

    const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:2005';

    // Clear existing interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    
    // Start polling
    pollIntervalRef.current = setInterval(async () => {
      try {
        const statusResponse = await fetch(`${apiUrl}/api/providers/${providerId}/sync`, {
          headers: { Authorization: `Bearer ${jwtToken}` },
        });
        const status = await statusResponse.json();
        
        if (status.activeJob) {
          const progress = status.activeJob.totalItems > 0
            ? Math.min(100, Math.round((status.activeJob.processedItems / status.activeJob.totalItems) * 100))
            : 0;
          
          setSyncProgress({
            totalItems: status.activeJob.totalItems,
            processedItems: status.activeJob.processedItems,
            moviesCount: status.activeJob.moviesCount,
            seriesCount: status.activeJob.seriesCount,
            channelsCount: status.activeJob.channelsCount || 0,
            progress,
          });
          
          // Update stats cards in real-time
          setStats(prev => ({
            ...prev,
            movies: status.activeJob.moviesCount || prev.movies,
            series: status.activeJob.seriesCount || prev.series,
            channels: status.activeJob.channelsCount || prev.channels,
          }));
          
          console.log(`[Sync] ${progress}% - ${status.activeJob.processedItems}/${status.activeJob.totalItems} | Movies: ${status.activeJob.moviesCount}, Series: ${status.activeJob.seriesCount}, Channels: ${status.activeJob.channelsCount || 0}`);
        } else {
          // Sync completed
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setSyncing(false);
          setSyncProgress(null);
          await AsyncStorage.removeItem('active_sync_provider');
          fetchProviderData(); // Refresh data
        }
      } catch (error) {
        console.error('[ProviderDetail] Error polling sync status:', error);
      }
    }, 2000); // Poll every 2 seconds
  }, [providerId, jwtToken, fetchProviderData]);

  const checkForActiveSync = useCallback(async () => {
    try {
      const savedProviderId = await AsyncStorage.getItem('active_sync_provider');
      if (savedProviderId === providerId && jwtToken) {
        const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:2005';
        const response = await fetch(`${apiUrl}/api/providers/${providerId}/sync`, {
          headers: { Authorization: `Bearer ${jwtToken}` },
        });
        const data = await response.json();
        
        if (data.activeJob) {
          console.log('[ProviderDetail] Resuming active sync monitoring');
          setSyncing(true);
          startSyncPolling();
        } else {
          await AsyncStorage.removeItem('active_sync_provider');
        }
      }
    } catch (error) {
      console.error('[ProviderDetail] Error checking active sync:', error);
    }
  }, [providerId, jwtToken, startSyncPolling]);

  // Check for active sync on mount
  useEffect(() => {
    checkForActiveSync();
    
    // Listen to app state changes
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        console.log('[ProviderDetail] App foregrounded - checking sync status');
        checkForActiveSync();
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [checkForActiveSync]);

  useEffect(() => {
    fetchProviderData();
  }, [fetchProviderData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchProviderData();
  };

  const handleSync = async () => {
    if (!providerId || !jwtToken) return;

    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:2005';
      const response = await fetch(`${apiUrl}/api/providers/${providerId}/sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwtToken}` },
      });

      if (response.ok) {
        setSyncing(true);
        await AsyncStorage.setItem('active_sync_provider', providerId);
        startSyncPolling();
      }
    } catch (error) {
      console.error('[ProviderDetail] Error starting sync:', error);
    }
  };

  const handleStopSync = async () => {
    // Stop polling
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setSyncing(false);
    setSyncProgress(null);
    await AsyncStorage.removeItem('active_sync_provider');
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#ef4444" />
      </View>
    );
  }

  if (!provider) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Provider not found</Text>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#ef4444" />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButtonIcon}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>{provider.name}</Text>
          <Text style={styles.headerSubtitle}>{provider.type.toUpperCase()}</Text>
          {provider.mac && (
            <Text style={styles.headerMac}>MAC: {provider.mac}</Text>
          )}
        </View>
      </View>

      {/* Stats Cards */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <MaterialIcons name="live-tv" size={32} color="#ef4444" />
          <Text style={styles.statValue}>{stats.channels.toLocaleString()}</Text>
          <Text style={styles.statLabel}>Channels</Text>
        </View>
        <View style={styles.statCard}>
          <MaterialIcons name="movie" size={32} color="#ef4444" />
          <Text style={styles.statValue}>{stats.movies.toLocaleString()}</Text>
          <Text style={styles.statLabel}>Movies</Text>
        </View>
        <View style={styles.statCard}>
          <MaterialIcons name="tv" size={32} color="#ef4444" />
          <Text style={styles.statValue}>{stats.series.toLocaleString()}</Text>
          <Text style={styles.statLabel}>Series</Text>
        </View>
      </View>

      {/* Last Sync Info */}
      {stats.lastSync && (
        <View style={styles.lastSyncContainer}>
          <MaterialIcons name="sync" size={16} color="#71717a" />
          <Text style={styles.lastSyncText}>
            Last synced: {new Date(stats.lastSync).toLocaleString()}
          </Text>
        </View>
      )}

      {/* Sync Controls */}
      {provider.type === 'STALKER' && (
        <View style={styles.syncSection}>
          {syncing ? (
            <Pressable style={styles.stopButton} onPress={handleStopSync}>
              <MaterialIcons name="stop" size={20} color="#fff" />
              <Text style={styles.stopButtonText}>Stop Sync</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.syncButton} onPress={handleSync}>
              <MaterialIcons name="sync" size={20} color="#fff" />
              <Text style={styles.syncButtonText}>Sync Content</Text>
            </Pressable>
          )}

          {/* Live Progress */}
          {syncing && syncProgress && (
            <View style={styles.progressContainer}>
              {provider.lastSync === null && (
                <View style={styles.firstSyncBanner}>
                  <MaterialIcons name="info" size={20} color="#3b82f6" />
                  <Text style={styles.firstSyncText}>
                    First-time setup in progress. We're building your personalized playlist - this only happens once!
                  </Text>
                </View>
              )}
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${syncProgress.progress}%` }]} />
              </View>
              <Text style={styles.progressText}>
                {syncProgress.progress}%{syncProgress.progress === 100 && syncProgress.processedItems > syncProgress.totalItems ? ' - Discovering even more content for you!' : ''}
              </Text>
              <Text style={styles.progressDetails}>
                Movies: {syncProgress.moviesCount.toLocaleString()} | Series: {syncProgress.seriesCount.toLocaleString()}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Quick Actions */}
      <View style={styles.actionsSection}>
        <Text style={styles.sectionTitle}>Browse Content</Text>
        <Pressable style={[styles.actionCard, syncing && styles.actionCardDisabled]} onPress={() => !syncing && router.push('/live')} disabled={syncing}>
          <MaterialIcons name="live-tv" size={24} color="#ef4444" />
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Live Channels</Text>
            <Text style={styles.actionSubtitle}>{stats.channels} channels available</Text>
          </View>
          <MaterialIcons name="chevron-right" size={24} color="#71717a" />
        </Pressable>
        <Pressable style={[styles.actionCard, syncing && styles.actionCardDisabled]} onPress={() => !syncing && router.push('/movies')} disabled={syncing}>
          <MaterialIcons name="movie" size={24} color="#ef4444" />
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Movies</Text>
            <Text style={styles.actionSubtitle}>{stats.movies} movies available</Text>
          </View>
          <MaterialIcons name="chevron-right" size={24} color="#71717a" />
        </Pressable>
        <Pressable style={[styles.actionCard, syncing && styles.actionCardDisabled]} onPress={() => !syncing && router.push('/series')} disabled={syncing}>
          <MaterialIcons name="tv" size={24} color="#ef4444" />
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>TV Series</Text>
            <Text style={styles.actionSubtitle}>{stats.series} series available</Text>
          </View>
          <MaterialIcons name="chevron-right" size={24} color="#71717a" />
        </Pressable>
      </View>

      {/* Portal Management */}
      <View style={styles.actionsSection}>
        <Text style={styles.sectionTitle}>Portal Management</Text>
        <Pressable 
          style={styles.actionCard} 
          onPress={() => router.push(`/provider/${providerId}/manage`)}
        >
          <MaterialIcons name="category" size={24} color="#22c55e" />
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Manage Categories</Text>
            <Text style={styles.actionSubtitle}>View and organize content categories</Text>
          </View>
          <MaterialIcons name="chevron-right" size={24} color="#71717a" />
        </Pressable>
        <Pressable 
          style={styles.actionCard} 
          onPress={() => router.push(`/provider/${providerId}/profiles`)}
        >
          <MaterialIcons name="people" size={24} color="#3b82f6" />
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Manage Profiles</Text>
            <Text style={styles.actionSubtitle}>Create profiles with content restrictions</Text>
          </View>
          <MaterialIcons name="chevron-right" size={24} color="#71717a" />
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#18181b',
  },
  contentContainer: {
    paddingBottom: 32,
  },
  header: {
    backgroundColor: '#27272a',
    padding: 20,
    paddingTop: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  backButtonIcon: {
    padding: 8,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#ef4444',
    fontWeight: '600',
  },
  headerMac: {
    fontSize: 12,
    color: '#71717a',
    marginTop: 4,
  },
  statsContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#27272a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  statLabel: {
    fontSize: 12,
    color: '#71717a',
    textTransform: 'uppercase',
  },
  lastSyncContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  lastSyncText: {
    fontSize: 12,
    color: '#71717a',
  },
  syncSection: {
    padding: 16,
    gap: 12,
  },
  syncButton: {
    backgroundColor: '#ef4444',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 8,
    gap: 8,
  },
  syncButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  stopButton: {
    backgroundColor: '#71717a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 8,
    gap: 8,
  },
  stopButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  progressContainer: {
    backgroundColor: '#27272a',
    padding: 16,
    borderRadius: 8,
    gap: 8,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#3f3f46',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#ef4444',
  },
  progressText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  progressDetails: {
    color: '#71717a',
    fontSize: 12,
  },
  actionsSection: {
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  actionCard: {
    backgroundColor: '#27272a',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 8,
    gap: 12,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  actionSubtitle: {
    fontSize: 12,
    color: '#71717a',
  },
  actionCardDisabled: {
    opacity: 0.5,
  },
  firstSyncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1e3a8a',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  firstSyncText: {
    flex: 1,
    color: '#fff',
    fontSize: 13,
    lineHeight: 18,
  },
  errorText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
  backButton: {
    backgroundColor: '#ef4444',
    padding: 16,
    borderRadius: 8,
    marginTop: 16,
    marginHorizontal: 16,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
