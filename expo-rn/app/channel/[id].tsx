import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { useAuthStore } from '@/lib/store';
import VideoPlayer from '@/components/VideoPlayer';
import { MaterialIcons } from '@expo/vector-icons';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:2005';

interface Channel {
  id: string;
  name: string;
  number: number;
  logo?: string;
  cmd: string;
}

export default function ChannelDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; name?: string; logo?: string; providerId?: string; cmd?: string }>();
  const { jwtToken, user } = useAuthStore();

  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    loadChannelData();
  }, [params.id]);

  const loadChannelData = async () => {
    if (!jwtToken || !user) {
      setError('Not authenticated');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');

      if (!params.cmd || !params.providerId) {
        throw new Error('Missing channel information');
      }

      // Set channel info from params
      setChannel({
        id: params.id,
        name: params.name || 'Live Channel',
        number: 0,
        cmd: params.cmd,
      });

      // Get stream URL directly from Stalker API
      const streamResponse = await fetch(`${API_URL}/api/providers/${params.providerId}/stream`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cmd: params.cmd,
          contentType: 'itv',
        }),
      });

      if (!streamResponse.ok) {
        const errorData = await streamResponse.json();
        throw new Error(errorData.error || 'Failed to get stream URL');
      }

      const streamData = await streamResponse.json();
      setStreamUrl(streamData.streamUrl);
    } catch (err) {
      console.error('Channel data loading error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load channel');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#ef4444" />
        <Text style={styles.loadingText}>Loading channel...</Text>
      </View>
    );
  }

  if (error || !streamUrl) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error || 'No stream available'}</Text>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  if (isFullscreen) {
    return (
      <View style={styles.fullscreenContainer}>
        <VideoPlayer
          uri={streamUrl}
          title={channel?.name || params.name || 'Live Channel'}
          onBack={() => setIsFullscreen(false)}
          autoPlay
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.channelName}>{channel?.name || params.name || 'Live Channel'}</Text>
          {channel?.number && (
            <Text style={styles.channelNumber}>Ch {channel.number}</Text>
          )}
        </View>
        <Pressable
          style={styles.fullscreenButton}
          onPress={() => setIsFullscreen(true)}
        >
          <MaterialIcons name="fullscreen" size={24} color="#fff" />
        </Pressable>
      </View>

      {/* Player Section */}
      <View style={styles.playerSection}>
        <VideoPlayer
          uri={streamUrl}
          title={channel?.name || params.name || 'Live Channel'}
          onBack={() => router.back()}
          autoPlay
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#09090b',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  fullscreenContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 60,
    backgroundColor: '#18181b',
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  headerInfo: {
    flex: 1,
    marginHorizontal: 12,
  },
  channelName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  channelNumber: {
    fontSize: 14,
    color: '#71717a',
    marginTop: 2,
  },
  playerSection: {
    backgroundColor: '#000',
    aspectRatio: 16 / 9,
  },
  infoSection: {
    padding: 16,
    backgroundColor: '#18181b',
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
    marginRight: 8,
  },
  liveText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ef4444',
    letterSpacing: 1,
  },
  infoText: {
    fontSize: 14,
    color: '#a1a1aa',
  },
  fullscreenButton: {
    padding: 8,
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
    marginBottom: 16,
  },
  backButton: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
