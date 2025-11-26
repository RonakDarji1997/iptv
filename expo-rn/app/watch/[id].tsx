import { View, StyleSheet, ActivityIndicator, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { useAuthStore } from '@/lib/store';
import VideoPlayer from '@/components/VideoPlayer';
import { WatchHistoryManager } from '@/lib/watch-history';
import { DebugLogger } from '@/lib/debug-logger';

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
    providerId?: string;
  }>();
  
  const [currentCmd, setCurrentCmd] = useState<string | null>(null);
  const { jwtToken, user } = useAuthStore();

  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nextEpisode, setNextEpisode] = useState<any>(null);
  const [prevEpisode, setPrevEpisode] = useState<any>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    console.log('[WATCH DEBUG] Route params received:', {
      id: params.id,
      episodeId: params.episodeId,
      seasonId: params.seasonId,
      episodeNumber: params.episodeNumber,
      type: params.type,
    });
    
    DebugLogger.watchScreenOpened({
      id: params.id,
      episodeId: params.episodeId,
      type: params.type,
      seasonId: params.seasonId,
      episodeNumber: params.episodeNumber,
      title: params.title,
      resumeFrom: params.resumeFrom,
    });
    
    loadStream();
    if (params.type === 'series' && params.seasonId && params.episodeNumber) {
      loadNextEpisode();
    }
  }, [params.id, params.episodeId]);

  const loadNextEpisode = async () => {
    if (!jwtToken || !user || !params.seasonId || !params.episodeNumber || !params.providerId) return;

    try {
      DebugLogger.loadingNextEpisode(params.id, params.seasonId, params.episodeNumber);
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:2005';
      
      const response = await fetch(`${apiUrl}/api/providers/${params.providerId}/series/${params.id}/seasons/${params.seasonId}/episodes`, {
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to load episodes');
      }
      
      const result = await response.json();
      DebugLogger.apiResponse('getSeriesEpisodes (for next/prev)', result);
      
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
        const nextEp = sortedEpisodes[currentIndex + 1];
        setNextEpisode(nextEp);
        DebugLogger.nextEpisodeFound(nextEp);
      }
      
      // Get previous episode
      if (currentIndex > 0) {
        const prevEp = sortedEpisodes[currentIndex - 1];
        setPrevEpisode(prevEp);
        DebugLogger.prevEpisodeFound(prevEp);
      }
    } catch (err) {
      console.error('Error loading next episode:', err);
    }
  };

  const loadStream = async () => {
    console.log('[Watch] loadStream called with params:', {
      id: params.id,
      type: params.type,
      providerId: params.providerId,
      hasJwtToken: !!jwtToken,
      hasUser: !!user,
    });
    
    if (!jwtToken || !user || !params.providerId) {
      const missingItems = [];
      if (!jwtToken) missingItems.push('jwtToken');
      if (!user) missingItems.push('user');
      if (!params.providerId) missingItems.push('providerId');
      
      console.error('[Watch] Missing required items:', missingItems);
      setError(`Not authenticated or missing: ${missingItems.join(', ')}`);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');
      DebugLogger.loadingStream(params.type || 'itv', params.episodeId);

      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:2005';
      const contentType = params.type || 'itv';

      console.log('[WATCH DEBUG] Content type:', contentType);
      console.log('[WATCH DEBUG] Checking conditions:', {
        isSeries: contentType === 'series',
        hasEpisodeId: !!params.episodeId,
        hasSeasonId: !!params.seasonId,
        episodeId: params.episodeId,
        seasonId: params.seasonId
      });

      if (contentType === 'vod' || contentType === 'series') {
        let cmd: string;

        if (contentType === 'series' && params.episodeId && params.seasonId) {
          console.log('[WATCH DEBUG] ✅ Entering SERIES branch');
          
          // For series: get file info using seriesId, seasonId, and episodeId
          console.log('[WATCH DEBUG] Fetching file info for:', {
            seriesId: params.id,
            seasonId: params.seasonId,
            episodeId: params.episodeId
          });
          
          DebugLogger.log('Fetching series file info', {
            seriesId: params.id,
            seasonId: params.seasonId,
            episodeId: params.episodeId
          });
          
          const fileInfoResp = await fetch(`${apiUrl}/api/providers/${params.providerId}/series/${params.id}/seasons/${params.seasonId}/episodes/${params.episodeId}/file`, {
            headers: {
              'Authorization': `Bearer ${jwtToken}`,
            },
          });
          
          if (!fileInfoResp.ok) {
            throw new Error('Failed to get file info');
          }
          
          const fileInfo = await fileInfoResp.json();
          console.log('[WATCH DEBUG] File info received:', fileInfo);
          
          if (!fileInfo || !fileInfo.id) {
            setError('No file information found for episode');
            setLoading(false);
            return;
          }
          
          cmd = `/media/file_${fileInfo.id}.mpg`;
          console.log('[WATCH DEBUG] Constructed cmd:', cmd);
          DebugLogger.constructingCmd(fileInfo.id, cmd);
        } else if (contentType === 'vod' && params.id) {
          console.log('[WATCH DEBUG] ⚠️ Entering VOD branch');
          // For movies: get file info using movie_id
          const fileUrl = `${apiUrl}/api/providers/${params.providerId}/movies/${params.id}/file`;
          console.log('[Watch] Fetching movie file info from:', fileUrl);
          
          const fileInfoResp = await fetch(fileUrl, {
            headers: {
              'Authorization': `Bearer ${jwtToken}`,
            },
          });
          
          console.log('[Watch] File info response status:', fileInfoResp.status);
          
          if (!fileInfoResp.ok) {
            throw new Error('Failed to get file info');
          }
          
          const fileInfo = await fileInfoResp.json();
          
          if (!fileInfo || !fileInfo.id) {
            setError('No file information found');
            setLoading(false);
            return;
          }

          cmd = `/media/file_${fileInfo.id}.mpg`;
        } else {
          console.log('[WATCH DEBUG] ❌ No matching branch - missing parameters');
          console.log('[WATCH DEBUG] Missing params check:', {
            contentType,
            hasId: !!params.id,
            hasEpisodeId: !!params.episodeId,
            hasSeasonId: !!params.seasonId
          });
          setError('Missing required parameters');
          setLoading(false);
          return;
        }

        // Store cmd for watch history
        setCurrentCmd(cmd);

        // Get stream URL from provider endpoint
        const streamType = contentType === 'series' ? 'series' : 'vod';
        DebugLogger.callingCreateLink(cmd, streamType);
        
        const streamUrl = `${apiUrl}/api/providers/${params.providerId}/stream`;
        console.log('[Watch] Calling stream API:', streamUrl, {
          cmd,
          contentType: streamType,
          providerId: params.providerId,
        });
        
        const streamResp = await fetch(streamUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${jwtToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            cmd,
            contentType: streamType,
            episodeNumber: params.episodeNumber,
          }),
        });
        
        console.log('[Watch] Stream API response status:', streamResp.status);
        
        if (!streamResp.ok) {
          const errorData = await streamResp.json();
          throw new Error(errorData.error || 'Failed to get stream URL');
        }
        
        const streamData = await streamResp.json();
        DebugLogger.streamUrlReceived(streamData.streamUrl);
        
        // Add JWT token to proxied URLs
        let url = streamData.streamUrl;
        if (url.includes('/stream-proxy')) {
          const separator = url.includes('?') ? '&' : '?';
          url = `${url}${separator}token=${jwtToken}`;
        }
        
        setStreamUrl(url);
      } else if (contentType === 'itv') {
        // For live channels, use cmd directly
        const streamResp = await fetch(`${apiUrl}/api/providers/${params.providerId}/stream`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${jwtToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            cmd: params.cmd || '',
            contentType: 'itv',
          }),
        });
        
        if (!streamResp.ok) {
          const errorData = await streamResp.json();
          throw new Error(errorData.error || 'Failed to get stream URL');
        }
        
        const streamData = await streamResp.json();
        
        // Add JWT token to proxied URLs
        let url = streamData.streamUrl;
        if (url.includes('/stream-proxy')) {
          const separator = url.includes('?') ? '&' : '?';
          url = `${url}${separator}token=${jwtToken}`;
        }
        
        setStreamUrl(url);
      }
    } catch (err) {
      console.error('Stream loading error:', err);
      DebugLogger.streamError(err);
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
      DebugLogger.navigatingToNextEpisode(nextEpisode.id, nextEpisode.series_number);
      
      // Navigate to next episode
      router.replace({
        pathname: '/watch/[id]',
        params: {
          id: params.id,
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
      DebugLogger.navigatingToPrevEpisode(prevEpisode.id, prevEpisode.series_number);
      
      // Navigate to previous episode
      router.replace({
        pathname: '/watch/[id]',
        params: {
          id: params.id,
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
