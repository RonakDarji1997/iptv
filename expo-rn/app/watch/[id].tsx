import { View, StyleSheet, ActivityIndicator, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { useAuthStore } from '@/lib/store';
import { StalkerClient } from '@/lib/stalker-client';
import VideoPlayer from '@/components/VideoPlayer';
import { WatchHistoryManager } from '@/lib/watch-history';

export default function WatchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ 
    id: string; 
    type: string; 
    cmd?: string; 
    title?: string;
    resumeFrom?: string; // Resume from this position in seconds
    screenshot?: string;
    seasonId?: string;
    seasonNumber?: string;
    episodeId?: string;
    episodeNumber?: string;
  }>();
  
  const [currentCmd, setCurrentCmd] = useState<string | null>(null);
  const { portalUrl, macAddress } = useAuthStore();

  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nextEpisode, setNextEpisode] = useState<any>(null);
  const [prevEpisode, setPrevEpisode] = useState<any>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    loadStream();
    if (params.type === 'series' && params.seasonId && params.episodeNumber) {
      loadNextEpisode();
    }
  }, [params.id]);

  const loadNextEpisode = async () => {
    if (!portalUrl || !macAddress || !params.seasonId || !params.episodeNumber) return;

    try {
      const client = new StalkerClient({ url: portalUrl, mac: macAddress });
      const result = await client.getSeriesEpisodes(params.id, params.seasonId);
      
      // Sort episodes ascending
      const sortedEpisodes = result.data.sort((a: any, b: any) => {
        const numA = parseInt(a.series_number) || 0;
        const numB = parseInt(b.series_number) || 0;
        return numA - numB;
      });
      
      // Find current episode index
      const currentEpNum = parseInt(params.episodeNumber);
      const currentIndex = sortedEpisodes.findIndex((ep: any) => parseInt(ep.series_number) === currentEpNum);
      
      // Get next episode
      if (currentIndex !== -1 && currentIndex < sortedEpisodes.length - 1) {
        setNextEpisode(sortedEpisodes[currentIndex + 1]);
      }
      
      // Get previous episode
      if (currentIndex > 0) {
        setPrevEpisode(sortedEpisodes[currentIndex - 1]);
      }
    } catch (err) {
      console.error('Error loading next episode:', err);
    }
  };

  const loadStream = async () => {
    if (!portalUrl || !macAddress) {
      setError('Not authenticated');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');

      const client = new StalkerClient({ url: portalUrl, mac: macAddress });
      const contentType = params.type || 'itv';

      if (contentType === 'vod' || contentType === 'series') {
        let cmd: string;

        // If cmd is already provided (from params), use it directly
        if (params.cmd) {
          cmd = params.cmd;
        } else if (contentType === 'series' && params.seasonId && params.episodeId) {
          // For series: need to call getSeriesFileInfo
          const fileInfo = await client.getSeriesFileInfo(params.id, params.seasonId, params.episodeId);
          
          if (!fileInfo || !fileInfo.id) {
            setError('No file information found for this episode');
            setLoading(false);
            return;
          }

          cmd = `/media/file_${fileInfo.id}.mpg`;
        } else {
          // For movies: get file info using movie_id
          const fileInfo = await client.getMovieInfo(params.id);
          
          if (!fileInfo || !fileInfo.id) {
            setError('No file information found');
            setLoading(false);
            return;
          }

          cmd = `/media/file_${fileInfo.id}.mpg`;
        }

        // Store cmd for watch history
        setCurrentCmd(cmd);

        // Create link and get stream URL
        // Use 'series' type for series episodes to set series=1 parameter
        const streamType = contentType === 'series' ? 'series' : 'vod';
        const url = await client.getStreamUrl(cmd, streamType);
        setStreamUrl(url);
      } else if (contentType === 'itv') {
        // For live channels, use cmd directly
        const url = await client.getStreamUrl(params.cmd || '', contentType);
        setStreamUrl(url);
      }
    } catch (err) {
      console.error('Stream loading error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load stream');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#ef4444" />
        <Text style={styles.loadingText}>Loading stream...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <Text style={styles.errorSubtext}>Pull down to go back</Text>
      </View>
    );
  }

  if (!streamUrl) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>No stream available</Text>
      </View>
    );
  }

  const handleProgressUpdate = async (currentTime: number, duration: number) => {
    // Don't save progress for live TV
    if (params.type === 'itv') return;
    
    // Create watch history item
    const historyItem = WatchHistoryManager.createItem(
      params.type === 'series' ? 'series' : 'movie',
      params.id,
      params.title || 'Unknown',
      params.screenshot || '',
      currentTime,
      duration,
      {
        cmd: currentCmd || params.cmd,
        seasonId: params.seasonId,
        seasonNumber: params.seasonNumber,
        episodeId: params.episodeId,
        episodeNumber: params.episodeNumber,
        episodeTitle: params.title,
      }
    );
    
    await WatchHistoryManager.saveProgress(historyItem);
  };

  const handleNextEpisode = async () => {
    if (!nextEpisode || !portalUrl || !macAddress) return;

    try {
      const client = new StalkerClient({ url: portalUrl, mac: macAddress });
      const fileInfo = await client.getSeriesFileInfo(params.id, params.seasonId!, nextEpisode.id);
      
      if (!fileInfo || !fileInfo.id) {
        alert('Could not load next episode');
        return;
      }

      const cmd = `/media/file_${fileInfo.id}.mpg`;
      
      // Navigate to next episode
      router.replace({
        pathname: '/watch/[id]',
        params: {
          id: params.id,
          cmd: cmd,
          type: 'series',
          title: `${params.title?.split(' - ')[0]} - ${nextEpisode.name}`,
          screenshot: params.screenshot || '',
          seasonId: params.seasonId,
          seasonNumber: params.seasonNumber,
          episodeId: nextEpisode.id,
          episodeNumber: nextEpisode.series_number || '',
        },
      });
    } catch (err) {
      console.error('Error playing next episode:', err);
    }
  };

  const handlePrevEpisode = async () => {
    if (!prevEpisode || !portalUrl || !macAddress) return;

    try {
      const client = new StalkerClient({ url: portalUrl, mac: macAddress });
      const fileInfo = await client.getSeriesFileInfo(params.id, params.seasonId!, prevEpisode.id);
      
      if (!fileInfo || !fileInfo.id) {
        alert('Could not load previous episode');
        return;
      }

      const cmd = `/media/file_${fileInfo.id}.mpg`;
      
      // Navigate to previous episode
      router.replace({
        pathname: '/watch/[id]',
        params: {
          id: params.id,
          cmd: cmd,
          type: 'series',
          title: `${params.title?.split(' - ')[0]} - ${prevEpisode.name}`,
          screenshot: params.screenshot || '',
          seasonId: params.seasonId,
          seasonNumber: params.seasonNumber,
          episodeId: prevEpisode.id,
          episodeNumber: prevEpisode.series_number || '',
        },
      });
    } catch (err) {
      console.error('Error playing previous episode:', err);
    }
  };

  const handleVideoEnd = () => {
    // Auto-play next episode when current one ends
    if (nextEpisode) {
      handleNextEpisode();
    }
  };

  const startPosition = params.resumeFrom ? parseFloat(params.resumeFrom) : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}> 
      <VideoPlayer
        uri={streamUrl}
        title={params.title}
        onBack={() => router.back()}
        autoPlay
        startPosition={startPosition}
        onProgressUpdate={handleProgressUpdate}
        onVideoEnd={handleVideoEnd}
      />
      
      {/* Previous Episode Button */}
      {prevEpisode && (
        <Pressable style={styles.prevEpisodeButton} onPress={handlePrevEpisode}>
          <Text style={styles.prevEpisodeIcon}>←</Text>
          <Text style={styles.prevEpisodeText}>Prev: Episode {prevEpisode.series_number}</Text>
        </Pressable>
      )}
      
      {/* Next Episode Button */}
      {nextEpisode && (
        <Pressable style={styles.nextEpisodeButton} onPress={handleNextEpisode}>
          <Text style={styles.nextEpisodeText}>Next: Episode {nextEpisode.series_number}</Text>
          <Text style={styles.nextEpisodeIcon}>→</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#09090b',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 16,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  errorSubtext: {
    color: '#71717a',
    fontSize: 14,
    textAlign: 'center',
  },
  prevEpisodeButton: {
    position: 'absolute',
    bottom: 80,
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#ef4444',
    gap: 8,
  },
  prevEpisodeText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  prevEpisodeIcon: {
    color: '#ef4444',
    fontSize: 18,
    fontWeight: 'bold',
  },
  nextEpisodeButton: {
    position: 'absolute',
    bottom: 80,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#ef4444',
    gap: 8,
  },
  nextEpisodeText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  nextEpisodeIcon: {
    color: '#ef4444',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
