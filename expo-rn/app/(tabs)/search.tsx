import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  ScrollView,
  Image,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/lib/store';
import { useSnapshotStore } from '@/lib/snapshot-store';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

export default function SearchScreen() {
  const router = useRouter();
  const { snapshot: cachedSnapshot, setSnapshot, isForProvider } = useSnapshotStore();
  const { user, selectedProfile, selectedProviderIds } = useAuthStore();
  const { width: screenWidth } = useWindowDimensions();

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [providerId, setProviderId] = useState<string>('');
  const [isSearching, setIsSearching] = useState(false);
  const initialLoadDone = useRef(false);
  const [searchResults, setSearchResults] = useState<{ channels: any[], movies: any[], series: any[] }>({ channels: [], movies: [], series: [] });
  const searchAbortRef = useRef<boolean>(false);

  // Debounce search query for performance (300ms for better input responsiveness)
  useEffect(() => {
    if (query !== debouncedQuery) {
      setIsSearching(true);
    }
    
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
      setIsSearching(false);
    }, 300); // 300ms debounce - lets user finish typing

    return () => clearTimeout(timer);
  }, [query, debouncedQuery]);

  // Load snapshot when component mounts or profile changes
  useEffect(() => {
    if (cachedSnapshot) {
      // Check if cached snapshot is for the current provider
      const currentProviderId = selectedProviderIds[0];
      if (currentProviderId && !isForProvider(currentProviderId)) {
        console.log('[Search] Cached snapshot is for different provider, refreshing...');
        loadSnapshot();
        return;
      }
      
      console.log('[Search] Using cached snapshot');
      // Extract providerId from snapshot metadata
      if (cachedSnapshot.metadata?.providerId) {
        setProviderId(cachedSnapshot.metadata.providerId);
      }
      setLoading(false);
    } else {
      console.log('[Search] No cache, loading snapshot...');
      loadSnapshot();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cachedSnapshot]);

  // Reload snapshot when profile changes (but not on initial mount)
  useEffect(() => {
    if (selectedProfile && initialLoadDone.current) {
      console.log('[Search] Profile changed, reloading snapshot...');
      loadSnapshot();
    }
    if (selectedProfile) {
      initialLoadDone.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProfile?.id]);

  const loadSnapshot = async () => {
    if (!user) {
      setError('Not authenticated');
      setLoading(false);
      return;
    }

    try {
      setError('');
      setLoading(true);

      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:2005';
      
      const providersResp = await fetch(`${apiUrl}/api/providers?userId=${user.id}`);
      const providersData = await providersResp.json();
      
      if (!providersData.providers || providersData.providers.length === 0) {
        setError('No provider configured');
        setLoading(false);
        return;
      }

      const provider = providersData.providers[0];
      setProviderId(provider.id); // Store providerId in state
      
      const profileParam = selectedProfile?.id ? `?profileId=${selectedProfile.id}` : '';
      const snapshotResp = await fetch(`${apiUrl}/api/providers/${provider.id}/snapshot${profileParam}`, {
        headers: {
          'Accept-Encoding': 'gzip',
        },
      });

      if (!snapshotResp.ok) {
        throw new Error('Failed to load content');
      }

      const snapshot = await snapshotResp.json();
      setSnapshot(snapshot, provider.id);
      setLoading(false);

      console.log(`[Search] Loaded snapshot with profile ${selectedProfile?.id || 'default'}`);
    } catch (err) {
      console.error('[Search] Error loading snapshot:', err);
      setError(err instanceof Error ? err.message : 'Failed to load content');
      setLoading(false);
    }
  };
  
  // Get portalUrl from snapshot metadata with fallback
  const portalUrl = cachedSnapshot?.metadata?.portalUrl || 'http://tv.stream4k.cc/stalker_portal/';

  // Card dimensions for horizontal scrolling
  const cardWidth = 140;
  const cardHeight = 210;

  // Helper function to convert relative image URLs to full URLs (same as ContentCard)
  const getImageUrl = useCallback((imageUrl: string | null | undefined, itemName: string = '', contentType: string = 'vod'): string => {
    const baseUrl = portalUrl;
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const domainUrl = cleanBaseUrl.replace(/\/stalker_portal\/?$/, '');

    if (!imageUrl) {
      return `https://placehold.co/${cardWidth}x${cardHeight}/1f2937/ffffff?text=${encodeURIComponent(itemName || 'Content')}`;
    }

    if (imageUrl.startsWith('http')) {
      return imageUrl;
    }
    
    if (imageUrl.startsWith('/')) {
      return `${domainUrl}${imageUrl}`;
    }
    
    // For channels without full path
    if (contentType === 'itv') {
      return `${cleanBaseUrl}/misc/logos/320/${imageUrl}`;
    }
    
    return imageUrl;
  }, [portalUrl, cardWidth, cardHeight]);

  // Progressive search - shows results as they're found
  useEffect(() => {
    if (!debouncedQuery.trim() || debouncedQuery.trim().length < 2) {
      setSearchResults({ channels: [], movies: [], series: [] });
      return;
    }

    if (!cachedSnapshot) {
      setSearchResults({ channels: [], movies: [], series: [] });
      return;
    }

    const searchTerm = debouncedQuery.toLowerCase().trim();
    searchAbortRef.current = false;
    
    // Start with empty results
    const results = { channels: [] as any[], movies: [] as any[], series: [] as any[] };

    // Helper to batch update UI (every 25 items to reduce re-renders)
    const updateResults = () => {
      if (!searchAbortRef.current) {
        setSearchResults({ 
          channels: [...results.channels], 
          movies: [...results.movies], 
          series: [...results.series] 
        });
      }
    };

    // Process search in chunks to keep UI responsive
    const processInChunks = async () => {
      const CHUNK_SIZE = 100; // Process 100 items at a time
      const BATCH_UPDATE = 50; // Update UI every 50 matches
      let matchCount = 0;

      // Search channels first
      if (cachedSnapshot.channels && !searchAbortRef.current) {
        const channels = cachedSnapshot.channels;
        for (let i = 0; i < channels.length; i += CHUNK_SIZE) {
          if (searchAbortRef.current) break;
          
          await new Promise(resolve => setTimeout(resolve, 0)); // Yield to UI
          
          const chunk = channels.slice(i, i + CHUNK_SIZE);
          for (const channel of chunk) {
            if (searchAbortRef.current) break;
            
            if (channel.name?.toLowerCase().includes(searchTerm) ||
                channel.number?.toString().includes(searchTerm)) {
              results.channels.push(channel);
              matchCount++;
              if (matchCount % BATCH_UPDATE === 0) updateResults();
            }
          }
        }
        updateResults(); // Update after channels complete
      }

      // Search movies
      if (cachedSnapshot.movies && !searchAbortRef.current) {
        const movies = cachedSnapshot.movies;
        for (let i = 0; i < movies.length; i += CHUNK_SIZE) {
          if (searchAbortRef.current) break;
          
          await new Promise(resolve => setTimeout(resolve, 0)); // Yield to UI
          
          const chunk = movies.slice(i, i + CHUNK_SIZE);
          for (const movie of chunk) {
            if (searchAbortRef.current) break;
            
            if (movie.censored === '1' || movie.censored === 1 || movie.censored === true) {
              continue;
            }
            
            if (movie.name?.toLowerCase().includes(searchTerm) ||
                movie.o_name?.toLowerCase().includes(searchTerm) ||
                movie.description?.toLowerCase().includes(searchTerm) ||
                movie.actors?.toLowerCase().includes(searchTerm) ||
                movie.director?.toLowerCase().includes(searchTerm)) {
              results.movies.push(movie);
              matchCount++;
              if (matchCount % BATCH_UPDATE === 0) updateResults();
            }
          }
        }
        updateResults(); // Update after movies complete
      }

      // Search series
      if (cachedSnapshot.series && !searchAbortRef.current) {
        const series = cachedSnapshot.series;
        for (let i = 0; i < series.length; i += CHUNK_SIZE) {
          if (searchAbortRef.current) break;
          
          await new Promise(resolve => setTimeout(resolve, 0)); // Yield to UI
          
          const chunk = series.slice(i, i + CHUNK_SIZE);
          for (const seriesItem of chunk) {
            if (searchAbortRef.current) break;
            
            if (seriesItem.censored === '1' || seriesItem.censored === 1 || seriesItem.censored === true) {
              continue;
            }
            
            if (seriesItem.name?.toLowerCase().includes(searchTerm) ||
                seriesItem.o_name?.toLowerCase().includes(searchTerm) ||
                seriesItem.description?.toLowerCase().includes(searchTerm) ||
                seriesItem.actors?.toLowerCase().includes(searchTerm) ||
                seriesItem.director?.toLowerCase().includes(searchTerm)) {
              results.series.push(seriesItem);
              matchCount++;
              if (matchCount % BATCH_UPDATE === 0) updateResults();
            }
          }
        }
        updateResults(); // Final update
        
        if (!searchAbortRef.current) {
          const total = results.channels.length + results.movies.length + results.series.length;
          console.log(`[Search] Found ${total} results (${results.channels.length} channels, ${results.movies.length} movies, ${results.series.length} series) for "${searchTerm}"`);
        }
      }
    };

    processInChunks();

    // Cleanup: abort search if query changes
    return () => {
      searchAbortRef.current = true;
    };
  }, [debouncedQuery, cachedSnapshot]);

  const handleSearch = (searchQuery: string) => {
    setQuery(searchQuery);
  };

  const handleChannelPress = (channel: any) => {
    if (!providerId) {
      console.error('[Search] Cannot navigate: providerId is missing');
      return;
    }
    if (!channel.cmd) {
      console.error('[Search] Cannot navigate: channel.cmd is missing');
      return;
    }
    
    router.push({
      pathname: '/channel/[id]',
      params: {
        id: channel.id,
        name: channel.name,
        logo: channel.logo || '',
        providerId: providerId,
        cmd: channel.cmd,
      },
    });
  };

  const handleMoviePress = (movie: any) => {
    if (!providerId) {
      console.error('[Search] Cannot navigate: providerId is missing');
      return;
    }
    
    router.push({
      pathname: '/watch/[id]',
      params: {
        id: movie.id,
        type: 'vod',
        title: movie.name,
        screenshot: movie.poster || movie.screenshot_uri || '',
        providerId: providerId,
      },
    });
  };

  const handleSeriesPress = (series: any) => {
    if (!providerId) {
      console.error('[Search] Cannot navigate: providerId is missing');
      return;
    }
    
    router.push({
      pathname: '/series/[id]',
      params: {
        id: series.id,
        title: series.name,
        screenshot: series.screenshot_uri || series.screenshot || '',
        description: series.description || '',
        actors: series.actors || '',
        year: series.year || '',
        country: series.country || '',
        genres: series.genres_str || '',
        totalFiles: series.has_files || series.episodeCount || '',
        providerId: providerId,
      },
    });
  };

  const handleClear = () => {
    setQuery('');
  };

  const totalResults = searchResults.channels.length + searchResults.movies.length + searchResults.series.length;
  const hasResults = query.length >= 2 && totalResults > 0;

  return (
    <View style={styles.container}>
      {/* Search Input */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          <MaterialIcons name="search" size={24} color="#71717a" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={handleSearch}
            placeholder="Search channels, movies, and series..."
            placeholderTextColor="#71717a"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            nativeID="search-input"
            accessibilityLabel="Search for channels, movies, and series"
            {...(Platform.OS === 'web' && {
              id: 'search-input',
              name: 'search',
              autoComplete: 'off',
            })}
          />
          {isSearching && query.length > 0 ? (
            <ActivityIndicator size="small" color="#ef4444" style={{ marginHorizontal: 8 }} />
          ) : query.length > 0 ? (
            <Pressable onPress={handleClear} style={styles.clearButton}>
              <MaterialIcons name="close" size={20} color="#71717a" />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Results or Empty State */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#ef4444" />
          <Text style={styles.loadingText}>Loading content...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <MaterialIcons name="error-outline" size={64} color="#ef4444" />
          <Text style={styles.emptyTitle}>Error</Text>
          <Text style={styles.emptyText}>{error}</Text>
          <Pressable 
            style={{ marginTop: 16, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: '#ef4444', borderRadius: 8 }}
            onPress={loadSnapshot}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>Retry</Text>
          </Pressable>
        </View>
      ) : !cachedSnapshot ? (
        <View style={styles.centerContainer}>
          <MaterialIcons name="error-outline" size={64} color="#71717a" />
          <Text style={styles.emptyTitle}>No Content Available</Text>
          <Text style={styles.emptyText}>
            Please select a provider to load content
          </Text>
        </View>
      ) : query.length === 0 ? (
        <View style={styles.centerContainer}>
          <MaterialIcons name="search" size={64} color="#3f3f46" />
          <Text style={styles.emptyTitle}>Search for Content</Text>
          <Text style={styles.emptyText}>
            Find channels, movies, and series
          </Text>
        </View>
      ) : query.length < 2 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>
            Type at least 2 characters...
          </Text>
        </View>
      ) : !hasResults ? (
        <View style={styles.centerContainer}>
          <MaterialIcons name="sentiment-dissatisfied" size={64} color="#3f3f46" />
          <Text style={styles.emptyTitle}>No Results Found</Text>
          <Text style={styles.emptyText}>
            Try searching with different keywords
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.resultsContainer}>
          {/* Results Count */}
          <Text style={styles.resultsCount}>
            Found {totalResults} result{totalResults !== 1 ? 's' : ''} 
            {searchResults.channels.length > 0 && ` • ${searchResults.channels.length} channels`}
            {searchResults.movies.length > 0 && ` • ${searchResults.movies.length} movies`}
            {searchResults.series.length > 0 && ` • ${searchResults.series.length} series`}
          </Text>

          {/* Channels Section */}
          {searchResults.channels.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <MaterialIcons name="live-tv" size={20} color="#ef4444" />
                <Text style={styles.sectionTitle}>Channels ({searchResults.channels.length})</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
                {searchResults.channels.map((channel: any) => (
                  <Pressable
                    key={channel.id}
                    style={[styles.channelCard, { width: cardWidth * 1.2 }]}
                    onPress={() => handleChannelPress(channel)}
                  >
                    <View style={styles.channelLogoContainer}>
                      <Image 
                        source={{ uri: getImageUrl(channel.logo, channel.name, 'itv') }} 
                        style={styles.channelLogo} 
                        resizeMode="contain"
                      />
                    </View>
                    <View style={styles.channelInfo}>
                      {channel.number && (
                        <Text style={styles.channelNumber}>{channel.number}</Text>
                      )}
                      <Text style={styles.channelName} numberOfLines={2}>{channel.name}</Text>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Movies Section */}
          {searchResults.movies.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <MaterialIcons name="movie" size={20} color="#3b82f6" />
                <Text style={styles.sectionTitle}>Movies ({searchResults.movies.length})</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
                {searchResults.movies.map((movie: any) => (
                  <Pressable
                    key={movie.id}
                    style={[styles.contentCard, { width: cardWidth, height: cardHeight }]}
                    onPress={() => handleMoviePress(movie)}
                  >
                    <Image
                      source={{ uri: getImageUrl(movie.screenshot_uri || movie.poster, movie.name, 'vod') }}
                      style={styles.poster}
                      resizeMode="cover"
                    />
                    <View style={styles.contentOverlay}>
                      <Text style={styles.contentTitle} numberOfLines={2}>{movie.name}</Text>
                      {movie.year && (
                        <Text style={styles.contentYear}>{movie.year}</Text>
                      )}
                      {movie.ratingImdb && (
                        <View style={styles.ratingBadge}>
                          <MaterialIcons name="star" size={12} color="#fbbf24" />
                          <Text style={styles.ratingText}>{movie.ratingImdb}</Text>
                        </View>
                      )}
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Series Section */}
          {searchResults.series.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <MaterialIcons name="tv" size={20} color="#22c55e" />
                <Text style={styles.sectionTitle}>Series ({searchResults.series.length})</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
                {searchResults.series.map((series: any) => (
                  <Pressable
                    key={series.id}
                    style={[styles.contentCard, { width: cardWidth, height: cardHeight }]}
                    onPress={() => handleSeriesPress(series)}
                  >
                    <Image
                      source={{ uri: getImageUrl(series.screenshot_uri || series.poster, series.name, 'series') }}
                      style={styles.poster}
                      resizeMode="cover"
                    />
                    <View style={styles.contentOverlay}>
                      <Text style={styles.contentTitle} numberOfLines={2}>{series.name}</Text>
                      {series.year && (
                        <Text style={styles.contentYear}>{series.year}</Text>
                      )}
                      {series.episodeCount > 0 && (
                        <Text style={styles.episodeCount}>{series.episodeCount} episodes</Text>
                      )}
                      {series.ratingImdb && (
                        <View style={styles.ratingBadge}>
                          <MaterialIcons name="star" size={12} color="#fbbf24" />
                          <Text style={styles.ratingText}>{series.ratingImdb}</Text>
                        </View>
                      )}
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  searchContainer: {
    backgroundColor: '#18181b',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#09090b',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3f3f46',
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    paddingVertical: 12,
  },
  clearButton: {
    padding: 4,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 16,
  },
  loadingText: {
    color: '#a1a1aa',
    fontSize: 16,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 8,
  },
  emptyText: {
    color: '#71717a',
    fontSize: 14,
    textAlign: 'center',
  },
  resultsContainer: {
    flex: 1,
  },
  resultsCount: {
    color: '#a1a1aa',
    fontSize: 13,
    fontWeight: '500',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#18181b',
  },
  section: {
    marginTop: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  horizontalScroll: {
    paddingHorizontal: 16,
    gap: 12,
  },
  channelCard: {
    backgroundColor: '#18181b',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#27272a',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 80,
  },
  channelLogoContainer: {
    width: 56,
    height: 56,
    backgroundColor: '#27272a',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  channelLogo: {
    width: 48,
    height: 48,
  },
  channelInfo: {
    flex: 1,
  },
  channelNumber: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  channelName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  contentCard: {
    backgroundColor: '#18181b',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#27272a',
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  placeholderPoster: {
    backgroundColor: '#27272a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    padding: 8,
  },
  contentTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  contentYear: {
    color: '#a1a1aa',
    fontSize: 11,
  },
  episodeCount: {
    color: '#22c55e',
    fontSize: 11,
    marginTop: 2,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  ratingText: {
    color: '#fbbf24',
    fontSize: 11,
    fontWeight: '600',
  },
});
