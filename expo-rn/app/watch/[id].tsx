import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { useAuthStore } from '@/lib/store';
import { StalkerClient } from '@/lib/stalker-client';
import VideoPlayer from '@/components/VideoPlayer';

export default function WatchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; type: string; cmd?: string; title?: string }>();
  const { portalUrl, macAddress } = useAuthStore();

  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const insets = useSafeAreaInsets();

  useEffect(() => {
    loadStream();
  }, [params.id]);

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

        // If cmd is already provided (from series detail page), use it
        if (params.cmd) {
          cmd = params.cmd;
        } else {
          // Otherwise, get file info using movie_id (for direct movie playback)
          const fileInfo = await client.getMovieInfo(params.id);
          
          if (!fileInfo || !fileInfo.id) {
            setError('No file information found');
            setLoading(false);
            return;
          }

          cmd = `/media/file_${fileInfo.id}.mpg`;
        }

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

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}> 
      <VideoPlayer
        uri={streamUrl}
        title={params.title}
        onBack={() => router.back()}
        autoPlay
        isLive={params.type === 'itv'}
      />
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
});
