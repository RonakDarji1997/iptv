import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  ScrollView,
  Platform,
  Image,
} from 'react-native';
import { useState, useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuthStore } from '@/lib/store';
import { StalkerClient } from '@/lib/stalker-client';
import { Picker } from '@react-native-picker/picker';

export default function SeriesDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ 
    id: string; 
    title?: string; 
    screenshot?: string;
    description?: string;
    actors?: string;
    year?: string;
    country?: string;
    genres?: string;
    totalFiles?: string;
  }>();
  const { portalUrl, macAddress } = useAuthStore();

  const [seriesInfo] = useState<any>({
    name: params.title,
    screenshot_uri: params.screenshot,
    description: params.description,
    actors: params.actors,
    year: params.year,
    country: params.country,
    genres_str: params.genres,
    has_files: params.totalFiles,
  });
  const [seasons, setSeasons] = useState<any[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadSeasons();
  }, []);

  useEffect(() => {
    if (selectedSeason) {
      loadEpisodes();
    }
  }, [selectedSeason]);

  const loadSeasons = async () => {
    if (!portalUrl || !macAddress) {
      setError('Not authenticated');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');
      const client = new StalkerClient({ url: portalUrl, mac: macAddress });

      const seasonsData = await client.getSeriesSeasons(params.id);
      setSeasons(seasonsData);

      // Select first season by default
      if (seasonsData.length > 0) {
        setSelectedSeason(seasonsData[0].id);
      }
    } catch (err) {
      console.error('Load seasons error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load seasons');
    } finally {
      setLoading(false);
    }
  };

  const loadEpisodes = async () => {
    if (!portalUrl || !macAddress || !selectedSeason) return;

    try {
      setLoadingEpisodes(true);
      setError('');
      const client = new StalkerClient({ url: portalUrl, mac: macAddress });

      const result = await client.getSeriesEpisodes(params.id, selectedSeason, 1);
      setEpisodes(result.data);
    } catch (err) {
      console.error('Load episodes error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load episodes');
    } finally {
      setLoadingEpisodes(false);
    }
  };

  const handleEpisodePress = async (episode: any) => {
    if (!portalUrl || !macAddress) return;

    try {
      const client = new StalkerClient({ url: portalUrl, mac: macAddress });

      // Get file info for the episode
      const fileInfo = await client.getSeriesFileInfo(params.id, selectedSeason, episode.id);
      console.log('Episode file info:', fileInfo);

      if (!fileInfo || !fileInfo.id) {
        alert('No file information found for this episode');
        return;
      }

      // Use the file id to construct the cmd path for create_link
      const cmd = `/media/file_${fileInfo.id}.mpg`;
      console.log('Using cmd for create_link:', cmd);

      // Navigate to watch screen
      router.push({
        pathname: '/watch/[id]',
        params: {
          id: fileInfo.id || 'series',
          cmd: cmd,
          type: 'series',
          title: `${params.title} - ${episode.name}`,
        },
      });
    } catch (err) {
      console.error('Episode play error:', err);
      alert(`Failed to play episode: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#ef4444" />
        <Text style={styles.loadingText}>Loading series...</Text>
      </View>
    );
  }

  if (error && seasons.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.retryButton} onPress={loadSeasons}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  // Helper to get full image URL
  const getImageUrl = (screenshot: string | undefined) => {
    if (!screenshot || !portalUrl) return undefined;
    if (screenshot.startsWith('http')) return screenshot;
    const cleanUrl = portalUrl.replace(/\/stalker_portal\/?$/, '');
    return `${cleanUrl}${screenshot}`;
  };

  const posterUrl = getImageUrl(seriesInfo?.screenshot_uri || params.screenshot);

  return (
    <ScrollView style={styles.container}>
      {/* Back Button */}
      <Pressable style={styles.backButton} onPress={() => router.back()}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>

      {/* Series Header with Poster */}
      <View style={styles.header}>
        {posterUrl && (
          <View style={styles.posterContainer}>
            <Image
              source={{ uri: posterUrl }}
              style={styles.poster}
              resizeMode="cover"
            />
          </View>
        )}
      </View>

      {/* Series Info */}
      <View style={styles.infoContainer}>
        <Text style={styles.title}>{seriesInfo?.name || params.title || 'Series'}</Text>
        
        <View style={styles.metaRow}>
          {seriesInfo?.year && (
            <Text style={styles.metaText}>{seriesInfo.year}</Text>
          )}
          {seriesInfo?.has_files && (
            <Text style={styles.metaText}>• {seriesInfo.has_files} Episodes</Text>
          )}
          {seriesInfo?.country && (
            <Text style={styles.metaText}>• {seriesInfo.country}</Text>
          )}
          {seriesInfo?.genres_str && (
            <Text style={styles.metaText}>• {seriesInfo.genres_str}</Text>
          )}
        </View>

        {seriesInfo?.actors && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Cast</Text>
            <Text style={styles.sectionText}>{seriesInfo.actors}</Text>
          </View>
        )}

        {seriesInfo?.description && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Description</Text>
            <Text style={styles.sectionText}>{seriesInfo.description}</Text>
          </View>
        )}
      </View>

      {/* Season Selector */}
      <View style={styles.selectorContainer}>
        <Text style={styles.selectorLabel}>Select Season</Text>
        <View style={styles.pickerWrapper}>
          <Picker
            selectedValue={selectedSeason}
            onValueChange={(value) => setSelectedSeason(value)}
            style={styles.picker}
            dropdownIconColor="#fff"
          >
            {seasons.map((season) => (
              <Picker.Item
                key={season.id}
                label={season.name}
                value={season.id}
                color={Platform.OS === 'ios' ? '#fff' : undefined}
              />
            ))}
          </Picker>
        </View>
      </View>

      {/* Episodes List */}
      <View style={styles.episodesContainer}>
        <Text style={styles.episodesTitle}>Episodes</Text>
        
        {loadingEpisodes ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#ef4444" />
          </View>
        ) : episodes.length === 0 ? (
          <Text style={styles.noEpisodes}>No episodes found</Text>
        ) : (
          episodes.map((episode, index) => (
            <Pressable
              key={episode.id}
              style={styles.episodeCard}
              onPress={() => handleEpisodePress(episode)}
            >
              <View style={styles.episodeNumber}>
                <Text style={styles.episodeNumberText}>{index + 1}</Text>
              </View>
              <View style={styles.episodeInfo}>
                <Text style={styles.episodeName}>{episode.name}</Text>
                {episode.time && (
                  <Text style={styles.episodeTime}>{episode.time}</Text>
                )}
              </View>
              <Text style={styles.playIcon}>▶</Text>
            </Pressable>
          ))
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
  header: {
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 24,
  },
  backButton: {
    position: 'absolute',
    top: 60,
    left: 16,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  backText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '600',
  },
  posterContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  poster: {
    width: 200,
    height: 300,
    borderRadius: 12,
    backgroundColor: '#18181b',
  },
  infoContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  metaText: {
    color: '#a1a1aa',
    fontSize: 14,
  },
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#71717a',
    textTransform: 'uppercase',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  sectionText: {
    color: '#d4d4d8',
    fontSize: 14,
    lineHeight: 20,
  },
  selectorContainer: {
    backgroundColor: '#18181b',
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 8,
  },
  selectorLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#a1a1aa',
    marginBottom: 8,
  },
  pickerWrapper: {
    backgroundColor: '#27272a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3f3f46',
    overflow: 'hidden',
  },
  picker: {
    color: '#fff',
    backgroundColor: '#27272a',
    height: 50,
  },
  episodesContainer: {
    padding: 16,
  },
  episodesTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  noEpisodes: {
    color: '#71717a',
    fontSize: 16,
    textAlign: 'center',
    padding: 40,
  },
  episodeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181b',
    padding: 16,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  episodeNumber: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  episodeNumberText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  episodeInfo: {
    flex: 1,
  },
  episodeName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  episodeTime: {
    color: '#71717a',
    fontSize: 14,
  },
  playIcon: {
    color: '#ef4444',
    fontSize: 20,
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
  retryButton: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
