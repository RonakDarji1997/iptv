import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/lib/store';
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
  const { user, jwtToken, logout } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);

  const fetchProviders = async () => {
    if (!user?.id || !jwtToken) return;

    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:2005';

      const providersResp = await fetch(`${apiUrl}/api/providers?userId=${user.id}`, {
        headers: { Authorization: `Bearer ${jwtToken}` },
      });
      const providersData = await providersResp.json();
      setProviders(providersData.providers || []);
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

  const handleProviderPress = (providerId: string) => {
    router.push(`/provider/${providerId}`);
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#ef4444" />
      </View>
    );
  }

  return (
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
          providers.map((provider) => (
            <Pressable
              key={provider.id}
              style={styles.providerCard}
              onPress={() => handleProviderPress(provider.id)}
            >
              <View style={styles.providerIcon}>
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
          ))
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
  providerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#27272a',
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
});
