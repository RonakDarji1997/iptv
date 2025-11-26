import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Image,
  useWindowDimensions,
  RefreshControl,
} from 'react-native';
import { useState, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuthStore } from '@/lib/store';
import { WatchHistoryManager, WatchHistoryItem } from '@/lib/watch-history';

export default function ContinueWatchingScreen() {
  const router = useRouter();
  const { portalUrl, selectedProviderIds, user } = useAuthStore();
  const { width: screenWidth } = useWindowDimensions();

  const [watchHistory, setWatchHistory] = useState<WatchHistoryItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'series' | 'movies'>('series');
  const [providerPortalUrl, setProviderPortalUrl] = useState<string>('');

  // Calculate card size - responsive columns
  const getNumColumns = () => {
    if (screenWidth < 480) return 2;
    if (screenWidth < 768) return 3;
    if (screenWidth < 1024) return 4;
    if (screenWidth < 1440) return 5;
    if (screenWidth < 1920) return 6;
    return 7;
  };
  
  const numColumns = getNumColumns();
  const gap = 16;
  const totalPadding = 32;
  const totalGaps = (numColumns - 1) * gap;
  const availableWidth = screenWidth - totalPadding - totalGaps;
  const cardWidth = Math.floor(availableWidth / numColumns);
  const cardHeight = Math.floor(cardWidth * 1.5);

  const loadHistory = async () => {
    const history = await WatchHistoryManager.getContinueWatching();
    setWatchHistory(history);
    
    // Load portal URL for selected provider
    if (user && selectedProviderIds.length > 0) {
      try {
        const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:2005';
        const response = await fetch(`${apiUrl}/api/providers?userId=${user.id}`);
        const data = await response.json();
        const provider = data.providers?.find((p: any) => p.id === selectedProviderIds[0]);
        if (provider?.url) {
          setProviderPortalUrl(provider.url);
        }
      } catch (error) {
        console.error('Error loading provider portal URL:', error);
      }
    }
  };

  // Separate movies and series
  const movies = watchHistory.filter(item => item.type === 'movie');
  const series = watchHistory.filter(item => item.type === 'series');

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadHistory();
    setRefreshing(false);
  };

  const handleRemove = async (id: string) => {
    await WatchHistoryManager.remove(id);
    await loadHistory();
  };

  const handleClearAll = async () => {
    await WatchHistoryManager.clearAll();
    setWatchHistory([]);
  };

  const handleItemPress = (item: WatchHistoryItem) => {
    // Use providerId from item if available, otherwise use selected provider
    const providerId = item.providerId || (selectedProviderIds.length > 0 ? selectedProviderIds[0] : '');
    
    if (!providerId) {
      console.warn('No provider ID available for playback');
      return;
    }

    if (item.type === 'series') {
      router.push({
        pathname: '/watch/[id]',
        params: {
          id: item.contentId, // Series ID (movie_id)
          type: 'series',
          cmd: item.cmd || '', // Pass cmd to skip API calls if available
          title: `${item.title} - ${item.episodeTitle || `E${item.episodeNumber}`}`,
          screenshot: item.screenshot,
          seasonId: item.seasonId || '',
          seasonNumber: item.seasonNumber || '',
          episodeId: item.episodeId || '',
          episodeNumber: item.episodeNumber || '',
          resumeFrom: item.currentTime.toString(),
          providerId: providerId,
        },
      });
    } else if (item.type === 'movie') {
      router.push({
        pathname: '/watch/[id]',
        params: {
          id: item.contentId,
          type: 'vod',
          cmd: item.cmd || '', // Pass cmd to skip API calls if available
          title: item.title,
          screenshot: item.screenshot,
          resumeFrom: item.currentTime.toString(),
          providerId: providerId,
        },
      });
    }
  };

  const getImageUrl = (screenshot: string) => {
    if (!screenshot) return undefined;
    if (screenshot.startsWith('http')) return screenshot;
    
    // Use provider portal URL if available, otherwise fall back to auth store portalUrl
    const baseUrl = providerPortalUrl || portalUrl;
    if (!baseUrl) return undefined;
    
    const cleanUrl = baseUrl.replace(/\/stalker_portal\/?$/, '');
    return `${cleanUrl}${screenshot}`;
  };

  const formatTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Reload history when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [])
  );

  const renderItem = ({ item }: { item: WatchHistoryItem }) => {
    const imageUrl = getImageUrl(item.screenshot);
    
    return (
      <Pressable
        style={[styles.card, { width: cardWidth, height: cardHeight }]}
        onPress={() => handleItemPress(item)}
      >
        <View style={styles.imageContainer}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" />
          ) : (
            <View style={[styles.image, styles.placeholder]}>
              <Text style={styles.placeholderText}>No Image</Text>
            </View>
          )}
          
          {/* Progress Bar */}
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { width: `${item.percentage}%` }]} />
          </View>
          
          {/* Resume Badge */}
          <View style={styles.resumeBadge}>
            <Text style={styles.resumeText}>{formatTime(item.currentTime)}</Text>
          </View>
          
          {/* Remove Button */}
          <Pressable
            style={styles.removeButton}
            onPress={(e) => {
              e.stopPropagation();
              handleRemove(item.id);
            }}
          >
            <Text style={styles.removeIcon}>✕</Text>
          </Pressable>
        </View>
        
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>
          {item.type === 'series' && (
            <Text style={styles.episode} numberOfLines={1}>
              S{item.seasonNumber} E{item.episodeNumber}
            </Text>
          )}
        </View>
      </Pressable>
    );
  };

  // Get active content based on toggle
  const activeContent = activeTab === 'series' ? series : movies;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Continue Watching</Text>
        {watchHistory.length > 0 && (
          <Pressable onPress={handleClearAll} style={styles.clearButton}>
            <Text style={styles.clearText}>Clear All</Text>
          </Pressable>
        )}
      </View>

      {/* Toggle */}
      {watchHistory.length > 0 && (
        <View style={styles.toggleContainer}>
          <Pressable
            style={[styles.toggleButton, activeTab === 'series' && styles.toggleButtonActive]}
            onPress={() => setActiveTab('series')}
          >
            <Text style={[styles.toggleText, activeTab === 'series' && styles.toggleTextActive]}>
              Series ({series.length})
            </Text>
          </Pressable>
          <Pressable
            style={[styles.toggleButton, activeTab === 'movies' && styles.toggleButtonActive]}
            onPress={() => setActiveTab('movies')}
          >
            <Text style={[styles.toggleText, activeTab === 'movies' && styles.toggleTextActive]}>
              Movies ({movies.length})
            </Text>
          </Pressable>
        </View>
      )}

      {/* Content */}
      {watchHistory.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📺</Text>
          <Text style={styles.emptyTitle}>No Watch History</Text>
          <Text style={styles.emptyText}>
            Start watching movies or series to see them here
          </Text>
        </View>
      ) : activeContent.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📺</Text>
          <Text style={styles.emptyTitle}>No {activeTab === 'series' ? 'Series' : 'Movies'}</Text>
          <Text style={styles.emptyText}>
            You haven&apos;t started watching any {activeTab === 'series' ? 'series' : 'movies'} yet
          </Text>
        </View>
      ) : (
        <FlatList
          data={activeContent}
          keyExtractor={(item, index) => `continue-${item.id}-${index}`}
          renderItem={renderItem}
          contentContainerStyle={styles.gridContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#ef4444" />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#27272a',
    borderRadius: 6,
  },
  clearText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
  },
  toggleContainer: {
    flexDirection: 'row',
    padding: 16,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 12,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#18181b',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#27272a',
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: '#ef4444',
    borderColor: '#ef4444',
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9ca3af',
  },
  toggleTextActive: {
    color: '#ffffff',
  },
  gridContainer: {
    padding: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  card: {
    marginBottom: 8,
  },
  imageContainer: {
    position: 'relative',
    width: '100%',
    height: '85%',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#18181b',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#27272a',
  },
  placeholderText: {
    color: '#71717a',
    fontSize: 12,
  },
  progressContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#ef4444',
  },
  resumeBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  resumeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  removeButton: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeIcon: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  info: {
    marginTop: 6,
    paddingHorizontal: 4,
  },
  title: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  episode: {
    color: '#71717a',
    fontSize: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptyText: {
    color: '#71717a',
    fontSize: 14,
    textAlign: 'center',
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 16,
    paddingHorizontal: 16,
  },
});
