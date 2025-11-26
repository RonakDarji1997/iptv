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

interface EpgProgram {
  id: string;
  ch_id: string;
  time: string;
  time_to: string;
  duration: string;
  name: string;
  descr: string;
  real_id: string;
  category?: string;
}

interface ShortEpg {
  current_program: EpgProgram | null;
  next_program: EpgProgram | null;
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
  const [epgData, setEpgData] = useState<ShortEpg | null>(null);
  const [loadingEpg, setLoadingEpg] = useState(false);

  useEffect(() => {
    loadChannelData();
  }, [params.id]);

  useEffect(() => {
    if (channel && params.providerId) {
      loadEpg();
    }
  }, [channel?.id, params.providerId]);

  const loadChannelData = async () => {
    console.log('[Channel] loadChannelData called with params:', {
      id: params.id,
      name: params.name,
      cmd: params.cmd,
      providerId: params.providerId,
      hasJwtToken: !!jwtToken,
      hasUser: !!user,
    });
    
    if (!jwtToken || !user) {
      console.error('[Channel] Missing auth:', { hasJwtToken: !!jwtToken, hasUser: !!user });
      setError('Not authenticated');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');

      if (!params.cmd || !params.providerId) {
        console.error('[Channel] Missing required params:', {
          hasCmd: !!params.cmd,
          hasProviderId: !!params.providerId,
        });
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
      const streamUrl = `${API_URL}/api/providers/${params.providerId}/stream`;
      console.log('[Channel] Calling stream API:', streamUrl, {
        cmd: params.cmd,
        contentType: 'itv',
        providerId: params.providerId,
      });
      
      const streamResponse = await fetch(streamUrl, {
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
      
      console.log('[Channel] Stream API response status:', streamResponse.status);

      if (!streamResponse.ok) {
        const errorData = await streamResponse.json();
        throw new Error(errorData.error || 'Failed to get stream URL');
      }

      const streamData = await streamResponse.json();
      
      // Add JWT token to proxied URLs
      let url = streamData.streamUrl;
      if (url.includes('/stream-proxy')) {
        const separator = url.includes('?') ? '&' : '?';
        url = `${url}${separator}token=${jwtToken}`;
      }
      
      setStreamUrl(url);
    } catch (err) {
      console.error('Channel data loading error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load channel');
    } finally {
      setLoading(false);
    }
  };

  const loadEpg = async () => {
    if (!params.providerId || !channel?.id) return;

    try {
      setLoadingEpg(true);
      console.log('[Channel] Loading EPG for channel:', channel.id);

      const epgResponse = await fetch(`${API_URL}/api/providers/${params.providerId}/epg`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channelId: channel.id,
        }),
      });

      if (epgResponse.ok) {
        const data = await epgResponse.json();
        setEpgData(data.epg);
        console.log('[Channel] EPG loaded:', data.epg);
      } else {
        console.warn('[Channel] Failed to load EPG:', epgResponse.status);
      }
    } catch (err) {
      console.error('EPG loading error:', err);
    } finally {
      setLoadingEpg(false);
    }
  };

  const formatEpgTime = (timeString: string): string => {
    try {
      const date = new Date(parseInt(timeString) * 1000);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return timeString;
    }
  };

  const formatDuration = (durationString: string): string => {
    try {
      const minutes = Math.floor(parseInt(durationString) / 60);
      return `${minutes} min`;
    } catch {
      return durationString;
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

      {/* EPG Section */}
      <ScrollView style={styles.epgSection}>
        <View style={styles.epgHeader}>
          <MaterialIcons name="tv" size={20} color="#ef4444" />
          <Text style={styles.epgTitle}>Program Guide</Text>
        </View>

        {loadingEpg ? (
          <View style={styles.epgLoadingContainer}>
            <ActivityIndicator size="small" color="#ef4444" />
            <Text style={styles.epgLoadingText}>Loading program guide...</Text>
          </View>
        ) : epgData ? (
          <View style={styles.epgContent}>
            {/* Current Program */}
            {epgData.current_program && (
              <View style={styles.programCard}>
                <View style={styles.programHeader}>
                  <View style={styles.liveIndicator}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveLabel}>NOW PLAYING</Text>
                  </View>
                  <Text style={styles.programTime}>
                    {formatEpgTime(epgData.current_program.time)} - {formatEpgTime(epgData.current_program.time_to)}
                  </Text>
                </View>
                <Text style={styles.programTitle}>{epgData.current_program.name}</Text>
                {epgData.current_program.descr && (
                  <Text style={styles.programDescription}>{epgData.current_program.descr}</Text>
                )}
                <View style={styles.programMeta}>
                  <Text style={styles.programDuration}>
                    <MaterialIcons name="schedule" size={14} color="#71717a" />
                    {' '}{formatDuration(epgData.current_program.duration)}
                  </Text>
                  {epgData.current_program.category && (
                    <Text style={styles.programCategory}>{epgData.current_program.category}</Text>
                  )}
                </View>
              </View>
            )}

            {/* Next Program */}
            {epgData.next_program && (
              <View style={[styles.programCard, styles.nextProgramCard]}>
                <View style={styles.programHeader}>
                  <Text style={styles.upNextLabel}>UP NEXT</Text>
                  <Text style={styles.programTime}>
                    {formatEpgTime(epgData.next_program.time)} - {formatEpgTime(epgData.next_program.time_to)}
                  </Text>
                </View>
                <Text style={styles.programTitle}>{epgData.next_program.name}</Text>
                {epgData.next_program.descr && (
                  <Text style={styles.programDescription}>{epgData.next_program.descr}</Text>
                )}
                <View style={styles.programMeta}>
                  <Text style={styles.programDuration}>
                    <MaterialIcons name="schedule" size={14} color="#71717a" />
                    {' '}{formatDuration(epgData.next_program.duration)}
                  </Text>
                  {epgData.next_program.category && (
                    <Text style={styles.programCategory}>{epgData.next_program.category}</Text>
                  )}
                </View>
              </View>
            )}

            {!epgData.current_program && !epgData.next_program && (
              <View style={styles.noEpgContainer}>
                <MaterialIcons name="info-outline" size={32} color="#71717a" />
                <Text style={styles.noEpgText}>No program guide available</Text>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.noEpgContainer}>
            <MaterialIcons name="info-outline" size={32} color="#71717a" />
            <Text style={styles.noEpgText}>No program guide available</Text>
          </View>
        )}
      </ScrollView>
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
  epgSection: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  epgHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 12,
    gap: 8,
  },
  epgTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  epgLoadingContainer: {
    padding: 32,
    alignItems: 'center',
    gap: 12,
  },
  epgLoadingText: {
    color: '#71717a',
    fontSize: 14,
  },
  epgContent: {
    padding: 16,
    paddingTop: 0,
    gap: 12,
  },
  programCard: {
    backgroundColor: '#18181b',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  nextProgramCard: {
    opacity: 0.8,
  },
  programHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  liveLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#ef4444',
    letterSpacing: 1,
  },
  upNextLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#71717a',
    letterSpacing: 1,
  },
  programTime: {
    fontSize: 12,
    color: '#a1a1aa',
  },
  programTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  programDescription: {
    fontSize: 14,
    color: '#a1a1aa',
    lineHeight: 20,
    marginBottom: 12,
  },
  programMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  programDuration: {
    fontSize: 12,
    color: '#71717a',
    flexDirection: 'row',
    alignItems: 'center',
  },
  programCategory: {
    fontSize: 12,
    color: '#71717a',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#27272a',
    borderRadius: 4,
  },
  noEpgContainer: {
    padding: 32,
    alignItems: 'center',
    gap: 12,
  },
  noEpgText: {
    color: '#71717a',
    fontSize: 14,
    textAlign: 'center',
  },
  infoSection: {
    padding: 16,
    backgroundColor: '#18181b',
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
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
