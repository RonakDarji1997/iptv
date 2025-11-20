import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { useAuthStore } from '@/lib/store';
import { StalkerClient, EpgProgram } from '@/lib/stalker-client';
import VideoPlayer from '@/components/VideoPlayer';
import { MaterialIcons } from '@expo/vector-icons';

export default function ChannelDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; type: string; cmd?: string; title?: string }>();
  const { portalUrl, macAddress } = useAuthStore();

  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [epg, setEpg] = useState<EpgProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    loadChannelData();
  }, [params.id]);

  const loadChannelData = async () => {
    if (!portalUrl || !macAddress) {
      setError('Not authenticated');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');

      const client = new StalkerClient({ url: portalUrl, mac: macAddress });

      // Load stream URL
      let cmd = params.cmd;
      if (!cmd) {
        setError('Stream command not found');
        setLoading(false);
        return;
      }

      const url = await client.getStreamUrl(cmd, params.type || 'itv');
      setStreamUrl(url);

      // Load EPG data
      try {
        const epgData = await client.getEpg(params.id);
        setEpg(epgData);
      } catch (epgError) {
        console.error('EPG load error:', epgError);
        // Continue even if EPG fails
      }
    } catch (err) {
      console.error('Channel data loading error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load channel');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timeStr: string) => {
    try {
      const date = new Date(parseInt(timeStr) * 1000);
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return timeStr;
    }
  };

  const formatDuration = (duration: string) => {
    const mins = Math.floor(parseInt(duration) / 60);
    return `${mins} min`;
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
          title={params.title}
          onBack={() => setIsFullscreen(false)}
          autoPlay
        />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Player Section */}
      <View style={styles.playerSection}>
        <View style={styles.playerContainer}>
          <VideoPlayer
            uri={streamUrl}
            title={params.title}
            onBack={() => router.back()}
            autoPlay
          />
        </View>
        <Pressable
          style={styles.fullscreenButton}
          onPress={() => setIsFullscreen(true)}
        >
          <MaterialIcons name="fullscreen" size={24} color="#fff" />
          <Text style={styles.fullscreenText}>Fullscreen</Text>
        </Pressable>
      </View>

      {/* EPG Section */}
      <View style={styles.epgSection}>
        <Text style={styles.sectionTitle}>Program Guide</Text>
        {epg.length > 0 ? (
          epg.map((program, index) => (
            <View key={index} style={styles.epgItem}>
              <View style={styles.epgTime}>
                <Text style={styles.epgTimeText}>
                  {formatTime(program.time)}
                </Text>
                <Text style={styles.epgDuration}>
                  {formatDuration(program.duration)}
                </Text>
              </View>
              <View style={styles.epgContent}>
                <Text style={styles.epgTitle}>{program.name}</Text>
                {program.descr && (
                  <Text style={styles.epgDescription} numberOfLines={2}>
                    {program.descr}
                  </Text>
                )}
              </View>
            </View>
          ))
        ) : (
          <View style={styles.noEpg}>
            <MaterialIcons name="tv-off" size={48} color="#3f3f46" />
            <Text style={styles.noEpgText}>No program guide available</Text>
          </View>
        )}
      </View>
    </ScrollView>
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
  playerSection: {
    backgroundColor: '#000',
    borderBottomWidth: 1,
    borderBottomColor: '#18181b',
  },
  playerContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
  },
  fullscreenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#18181b',
  },
  fullscreenText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  epgSection: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  epgItem: {
    flexDirection: 'row',
    backgroundColor: '#18181b',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  epgTime: {
    minWidth: 80,
    marginRight: 12,
  },
  epgTimeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ef4444',
    marginBottom: 4,
  },
  epgDuration: {
    fontSize: 12,
    color: '#71717a',
  },
  epgContent: {
    flex: 1,
  },
  epgTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  epgDescription: {
    fontSize: 14,
    color: '#a1a1aa',
    lineHeight: 20,
  },
  noEpg: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
  },
  noEpgText: {
    color: '#71717a',
    fontSize: 16,
    marginTop: 16,
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
