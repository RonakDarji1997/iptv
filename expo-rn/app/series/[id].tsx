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
import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useAuthStore } from '@/lib/store';
import { Picker } from '@react-native-picker/picker';
import { WatchHistoryManager, WatchHistoryItem } from '@/lib/watch-history';
import { DebugLogger } from '@/lib/debug-logger';

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
    providerId?: string;
  }>();
  const { jwtToken, user, portalUrl } = useAuthStore();
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [seriesInfo, setSeriesInfo] = useState<any>({
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
  const [episodeProgress, setEpisodeProgress] = useState<Map<string, WatchHistoryItem>>(new Map());
  const [isLoadingBackground, setIsLoadingBackground] = useState(false);
  const [pollCount, setPollCount] = useState(0);

  const loadWatchHistory = async () => {
    const history = await WatchHistoryManager.getContinueWatching();
    const progressMap = new Map<string, WatchHistoryItem>();
    
    // Filter history for this series and create a map by episodeId
    history.forEach(item => {
      if (item.type === 'series' && item.contentId === params.id && item.episodeId) {
        progressMap.set(item.episodeId, item);
      }
    });
    
    setEpisodeProgress(progressMap);
  };

  useEffect(() => {
    DebugLogger.seriesOpened(params.id, params.title || 'Unknown');
    loadSeasons();
  }, []);

  // Reload watch history when screen comes into focus
  // Only load seasons once on mount, not on every focus
  useFocusEffect(
    useCallback(() => {
      loadWatchHistory();
    }, [params.id])
  );

  useEffect(() => {
    if (selectedSeason) {
      loadEpisodes();
    }
  }, [selectedSeason]);

  const loadSeasons = async () => {
    console.log('[Series Detail] loadSeasons called with:', {
      seriesId: params.id,
      providerId: params.providerId,
      hasJwtToken: !!jwtToken,
      hasUser: !!user,
    });
    
    if (!jwtToken || !user || !params.providerId) {
      const missingItems = [];
      if (!jwtToken) missingItems.push('jwtToken');
      if (!user) missingItems.push('user');
      if (!params.providerId) missingItems.push('providerId');
      
      console.error('[Series Detail] Missing required items:', missingItems);
      setError(`Not authenticated or missing: ${missingItems.join(', ')}`);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');
      DebugLogger.seasonsLoading(params.id);
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:2005';
      const seasonsUrl = `${apiUrl}/api/providers/${params.providerId}/series/${params.id}/seasons`;
      
      console.log('[Series Detail] Fetching seasons from:', seasonsUrl);
      
      const response = await fetch(seasonsUrl, {
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
        },
      });
      
      console.log('[Series Detail] Seasons API response status:', response.status);
      
      if (!response.ok) {
        throw new Error('Failed to load seasons');
      }
      
      const { series: seriesData, seasons: seasonsData } = await response.json();
      DebugLogger.seasonsLoaded(seasonsData);
      
      // Update series info from API response
      if (seriesData) {
        setSeriesInfo({
          name: seriesData.name,
          poster: seriesData.poster,
          screenshot_uri: seriesData.poster, // Keep for backward compatibility
          description: seriesData.description,
          actors: seriesData.actors,
          year: seriesData.year,
          country: seriesData.country,
          genres_str: seriesData.genres,
          has_files: seriesData.episodeCount,
        });
        // Store series name for navigation
        (params as any).title = seriesData.name;
      }
      
      // Filter out ADULT and CELEBRITY seasons
      const filteredSeasons = seasonsData.filter((season: any) => {
        const name = (season.name || '').toUpperCase();
        return !name.includes('ADULT') && !name.includes('CELEBRITY');
      });
      
      setSeasons(filteredSeasons);

      // Select first season by default
      if (filteredSeasons.length > 0) {
        const firstSeason = filteredSeasons[0];
        DebugLogger.seasonSelected(
          firstSeason.id,
          firstSeason.name || 'Unknown',
          firstSeason.seasonNumber || 'N/A'
        );
        setSelectedSeason(firstSeason.id);
        
        // Sort and set episodes from the first season
        if (firstSeason.episodes && firstSeason.episodes.length > 0) {
          const sortedEpisodes = [...firstSeason.episodes].sort((a: any, b: any) => {
            const numA = parseInt(a.episodeNumber) || 0;
            const numB = parseInt(b.episodeNumber) || 0;
            return numA - numB;
          });
          console.log(`[Series Detail] Initial load: Setting ${sortedEpisodes.length} episodes to state`);
          console.log(`[Series Detail] First episode:`, sortedEpisodes[0]);
          setEpisodes(sortedEpisodes);
          console.log(`[Series Detail] Episodes state set successfully`);
        } else {
          // If episodes are empty, start polling for background loading
          console.log('[Series Detail] No episodes yet, starting background polling');
          console.log('[Series Detail] First season data:', firstSeason);
          setEpisodes([]);
          setIsLoadingBackground(true);
          startPollingForEpisodes();
        }
      }
    } catch (err) {
      console.error('Load seasons error:', err);
      DebugLogger.seasonsError(err);
      setError(err instanceof Error ? err.message : 'Failed to load seasons');
    } finally {
      setLoading(false);
    }
  };

  const startPollingForEpisodes = () => {
    // Clear any existing interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    
    let pollAttempts = 0;
    console.log('[Series Detail] Starting polling for episodes...');
    
    // Poll every 2 seconds for up to 30 seconds
    pollIntervalRef.current = setInterval(async () => {
      pollAttempts++;
      setPollCount(pollAttempts);
      
      if (pollAttempts >= 15) { // 15 polls * 2 seconds = 30 seconds
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        setIsLoadingBackground(false);
        setPollCount(0);
        console.log('[Series Detail] Stopped polling after 30 seconds');
        return;
      }

      try {
        const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:2005';
        const seasonsUrl = `${apiUrl}/api/providers/${params.providerId}/series/${params.id}/seasons`;
        
        console.log(`[Series Detail] Poll #${pollAttempts}: Fetching from ${seasonsUrl}`);
        
        const response = await fetch(seasonsUrl, {
          headers: {
            'Authorization': `Bearer ${jwtToken}`,
          },
        });
        
        if (response.ok) {
          const { seasons: seasonsData } = await response.json();
          const filteredSeasons = seasonsData.filter((season: any) => {
            const name = (season.name || '').toUpperCase();
            return !name.includes('ADULT') && !name.includes('CELEBRITY');
          });
          
          // Check if ANY season has episodes loaded
          const totalEpisodes = filteredSeasons.reduce((sum: number, season: any) => 
            sum + (season.episodes?.length || 0), 0
          );
          
          console.log(`[Series Detail] Poll #${pollAttempts}: Found ${totalEpisodes} total episodes across ${filteredSeasons.length} seasons`);
          
          if (totalEpisodes > 0) {
            console.log(`[Series Detail] Episodes found! Updating UI...`);
            
            // Update seasons first
            setSeasons(filteredSeasons);
            
            // Find the currently selected season in the new data (use first season if none selected)
            const currentSeason = filteredSeasons.find((s: any) => s.id === selectedSeason) || filteredSeasons[0];
            
            console.log(`[Series Detail] Current season has ${currentSeason?.episodes?.length || 0} episodes`);
            
            if (currentSeason && currentSeason.episodes && currentSeason.episodes.length > 0) {
              // Sort and update episodes immediately
              const sortedEpisodes = [...currentSeason.episodes].sort((a: any, b: any) => {
                const numA = parseInt(a.episodeNumber) || 0;
                const numB = parseInt(b.episodeNumber) || 0;
                return numA - numB;
              });
              
              console.log(`[Series Detail] ✅ Setting ${sortedEpisodes.length} episodes to state NOW`);
              setEpisodes(sortedEpisodes);
              
              // Stop polling
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }
              setIsLoadingBackground(false);
              setPollCount(0);
              console.log(`[Series Detail] ✅ Polling stopped successfully`);
            } else {
              console.log(`[Series Detail] ⚠️ Current season has no episodes, continuing to poll...`);
            }
          }
        } else {
          console.warn(`[Series Detail] Poll #${pollAttempts}: API returned status ${response.status}`);
        }
      } catch (err) {
        console.error(`[Series Detail] Poll #${pollAttempts} error:`, err);
      }
    }, 2000);
  };
  
  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  const loadEpisodes = async () => {
    if (!selectedSeason) return;

    try {
      setLoadingEpisodes(true);
      
      // Find the selected season and get its episodes
      const season = seasons.find(s => s.id === selectedSeason);
      if (season) {
        // Sort episodes by episode number in ascending order
        const sortedEpisodes = (season.episodes || []).sort((a: any, b: any) => {
          const numA = parseInt(a.episodeNumber) || 0;
          const numB = parseInt(b.episodeNumber) || 0;
          return numA - numB;
        });
        
        setEpisodes(sortedEpisodes);
        DebugLogger.episodesLoaded(sortedEpisodes, selectedSeason);
      }
    } catch (err) {
      console.error('Load episodes error:', err);
      DebugLogger.episodesError(err);
      setError(err instanceof Error ? err.message : 'Failed to load episodes');
    } finally {
      setLoadingEpisodes(false);
    }
  };

  const handleEpisodePress = async (episode: any) => {
    if (!jwtToken || !user) return;

    try {
      // Check if we have existing progress for this episode
      const progress = episodeProgress.get(episode.id);
      
      DebugLogger.episodeClicked(episode, selectedSeason);

      const navigationParams = {
        id: params.id,
        type: 'series' as const,
        title: `${params.title || seriesInfo.name || 'Series'} - ${episode.name}`,
        screenshot: params.screenshot || '',
        seasonId: selectedSeason,
        seasonNumber: seasons.find(s => s.id === selectedSeason)?.seasonNumber || '',
        episodeId: episode.id,
        episodeNumber: episode.episodeNumber?.toString() || '',
        cmd: episode.cmd || '',
        resumeFrom: progress?.currentTime.toString(),
        providerId: params.providerId || '',
      };

      DebugLogger.navigatingToWatch(navigationParams);

      // Navigate to watch screen - DO NOT pass cmd, let watch screen construct it
      router.push({
        pathname: '/watch/[id]',
        params: navigationParams,
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

  // Helper to get full image URL (same logic as ContentCard)
  const getImageUrl = (screenshot: string | undefined) => {
    if (!screenshot) return undefined;
    if (screenshot.startsWith('http')) return screenshot;
    
    // Use portalUrl from store or fallback to environment variable
    const basePortalUrl = portalUrl || process.env.EXPO_PUBLIC_STALKER_URL || 'http://tv.stream4k.cc/stalker_portal/';
    
    // Extract domain without stalker_portal path for proper concatenation
    const domainUrl = basePortalUrl.replace(/\/stalker_portal\/?$/, '');
    
    // If path starts with /, append to domain
    if (screenshot.startsWith('/')) {
      return `${domainUrl}${screenshot}`;
    }
    
    return screenshot;
  };

  const posterUrl = getImageUrl(seriesInfo?.screenshot_uri || seriesInfo?.poster || params.screenshot);
  
  console.log('[Series Detail] Poster debug:', {
    screenshot_uri: seriesInfo?.screenshot_uri,
    poster: seriesInfo?.poster,
    params_screenshot: params.screenshot,
    posterUrl,
    portalUrl
  });

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
        
        {/* Play Button */}
        {episodes.length > 0 && (
          <Pressable 
            style={styles.playButton} 
            onPress={() => handleEpisodePress(episodes[0])}
          >
            <Text style={styles.playButtonIcon}>▶</Text>
            <Text style={styles.playButtonText}>
              Play S{seasons.find(s => s.id === selectedSeason)?.season_number || '1'} E{episodes[0].series_number || '1'}
            </Text>
          </Pressable>
        )}
        
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
        
        {/* Debug info - remove after testing */}
        {__DEV__ && (
          <Text style={{ color: '#888', fontSize: 10, marginBottom: 8 }}>
            Debug: {episodes.length} episodes, loading: {loadingEpisodes ? 'yes' : 'no'}, 
            background: {isLoadingBackground ? 'yes' : 'no'}, season: {selectedSeason}
          </Text>
        )}
        
        {isLoadingBackground && (
          <View style={styles.backgroundLoadingBanner}>
            <ActivityIndicator size="small" color="#ef4444" />
            <Text style={styles.backgroundLoadingText}>
              Loading episodes in background... (Poll: {pollCount}/15)
            </Text>
          </View>
        )}
        
        {loadingEpisodes ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#ef4444" />
          </View>
        ) : episodes.length === 0 ? (
          <Text style={styles.noEpisodes}>
            {isLoadingBackground ? 'Episodes loading, please wait...' : 'No episodes found'}
          </Text>
        ) : (
          episodes.map((episode, index) => {
            const progress = episodeProgress.get(episode.id);
            const hasProgress = progress && progress.percentage > 0 && !progress.completed;
            
            return (
              <Pressable
                key={`episode-${episode.id}-${index}`}
                style={styles.episodeCard}
                onPress={() => handleEpisodePress(episode)}
              >
                <View style={styles.episodeNumber}>
                  <Text style={styles.episodeNumberText}>
                    {episode.episodeNumber || episode.name.match(/\d+/)?.[0] || ''}
                  </Text>
                </View>
                <View style={styles.episodeInfo}>
                  <Text style={styles.episodeName}>{episode.name}</Text>
                  {episode.duration && (
                    <Text style={styles.episodeTime}>{episode.duration} min</Text>
                  )}
                  {/* Progress Bar */}
                  {hasProgress && (
                    <View style={styles.progressContainer}>
                      <View style={[styles.progressBar, { width: `${progress.percentage}%` }]} />
                    </View>
                  )}
                </View>
                <View style={styles.episodeActions}>
                  {progress?.completed && (
                    <Text style={styles.completedIcon}>✓</Text>
                  )}
                  {hasProgress && (
                    <Text style={styles.resumeText}>{progress.percentage}%</Text>
                  )}
                  <Text style={styles.playIcon}>▶</Text>
                </View>
              </Pressable>
            );
          })
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
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ef4444',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
    marginVertical: 16,
    alignSelf: 'center',
    gap: 8,
  },
  playButtonIcon: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  playButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
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
    marginBottom: 4,
  },
  progressContainer: {
    height: 3,
    backgroundColor: '#27272a',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 8,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#ef4444',
  },
  episodeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  completedIcon: {
    color: '#22c55e',
    fontSize: 18,
    fontWeight: 'bold',
  },
  resumeText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '600',
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
  backgroundLoadingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: '#27272a',
    borderRadius: 8,
    marginBottom: 16,
  },
  backgroundLoadingText: {
    color: '#a1a1aa',
    fontSize: 14,
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
