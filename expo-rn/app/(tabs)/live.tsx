import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  ScrollView,
  Dimensions,
  useWindowDimensions,
} from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@/lib/store';
import { useSnapshotStore } from '@/lib/snapshot-store';
import { MaterialIcons } from '@expo/vector-icons';
import VideoPlayer from '@/components/VideoPlayer';

interface Channel {
  id: string;
  name: string;
  logo: string | null;
  number: number | null;
  cmd: string | null;
  categoryId: string | null;
  censored?: number | boolean; // From snapshot - indicates if channel is censored
  [key: string]: unknown;
}

interface Category {
  id: string;
  name: string;
  type: string;
  censored?: number | boolean; // From snapshot
}

interface EpgProgram {
  id: string;
  ch_id: string;
  time: string;
  time_to: string;
  duration: string;
  name: string;
  descr: string;
  start_timestamp: string;
  stop_timestamp: string;
  t_time: string;
  t_time_to: string;
}

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:2005';
const SCREEN_HEIGHT = Dimensions.get('window').height;

export default function LiveScreen() {
  const { user, selectedProfile, selectedProviderIds, jwtToken } = useAuthStore();
  const { snapshot: cachedSnapshot, setSnapshot, isForProvider } = useSnapshotStore();
  const { width: windowWidth } = useWindowDimensions();
  const isMobile = windowWidth < 768;

  const [categories, setCategories] = useState<Category[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [categorizedChannels, setCategorizedChannels] = useState<{ [key: string]: Channel[] }>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  
  // Preview player state
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [streamLoading, setStreamLoading] = useState(false);
  const [currentEpg, setCurrentEpg] = useState<{ current_program: EpgProgram | null; next_program: EpgProgram | null } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // EPG grid state
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [channelEpgs, setChannelEpgs] = useState<{ [channelId: string]: EpgProgram[] }>({});
  const epgCacheRef = useRef<{ [channelId: string]: { data: EpgProgram[], timestamp: number } }>({});

  useEffect(() => {
    // Dashboard already fetched and cached snapshot, just use it
    if (cachedSnapshot && cachedSnapshot.channels) {
      console.log('[Live] Using cached snapshot from dashboard');
      loadFromCache();
    } else {
      console.log('[Live] No cache yet, loading snapshot...');
      loadSnapshot();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cachedSnapshot]);

  useEffect(() => {
    organizeChannelsByCategory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels, categories]);

  // Removed automatic EPG loading on category change
  // EPG is now only loaded when a channel is clicked

  useEffect(() => {
    // Set default category if not set
    if (!selectedCategory && categories.length > 0) {
      const allCategoriesWithChannels = categories.filter(
        (cat) => categorizedChannels[cat.id] && categorizedChannels[cat.id].length > 0
      );
      if (allCategoriesWithChannels.length > 0) {
        setSelectedCategory(allCategoriesWithChannels[0].id);
      }
    }
  }, [selectedCategory, categories, categorizedChannels]);

  const loadFromCache = () => {
    if (!cachedSnapshot) return;
    
    // Check if cached snapshot is for the current provider
    const currentProviderId = selectedProviderIds[0];
    if (currentProviderId && !isForProvider(currentProviderId)) {
      console.log(`[Live] Cached snapshot is for different provider, refreshing...`);
      loadSnapshot(true);
      return;
    }
    
    const channelCategories = cachedSnapshot.categories.filter(
      (cat: Category) => cat.type === 'CHANNEL'
    );
    setCategories(channelCategories);
    setChannels(cachedSnapshot.channels || []);
    setLoading(false);
    
    console.log(`[Live] Loaded from cache: ${cachedSnapshot.channels?.length || 0} channels`);
  };

  const loadSnapshot = async (forceRefresh = false) => {
    if (!user) {
      setError('Not authenticated');
      setLoading(false);
      return;
    }

    if (selectedProviderIds.length === 0) {
      setError('No provider selected');
      setLoading(false);
      return;
    }

    try {
      setError('');
      if (!forceRefresh) setLoading(true);

      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:2005';
      
      // Fetch snapshots for all selected providers
      const profileParam = selectedProfile?.id ? `?profileId=${selectedProfile.id}` : '';
      const snapshotPromises = selectedProviderIds.map(providerId =>
        fetch(`${apiUrl}/api/providers/${providerId}/snapshot${profileParam}`, {
          headers: { 'Accept-Encoding': 'gzip' },
        }).then(r => r.ok ? r.json() : null)
      );

      const snapshots = (await Promise.all(snapshotPromises)).filter(Boolean);

      if (snapshots.length === 0) {
        throw new Error('Failed to load content from selected providers');
      }

      // Merge snapshots
      const mergedSnapshot: {
        categories: Category[];
        movies: unknown[];
        series: unknown[];
        channels: Channel[];
        provider: unknown;
      } = {
        categories: [],
        movies: [],
        series: [],
        channels: [],
        provider: snapshots[0].provider,
      };

      // Merge categories (deduplicate by name)
      const categoryMap = new Map<string, Category>();
      snapshots.forEach(snapshot => {
        (snapshot.categories as Category[]).forEach((cat: Category) => {
          if (!categoryMap.has(cat.name)) {
            categoryMap.set(cat.name, cat);
          }
        });
      });
      mergedSnapshot.categories = Array.from(categoryMap.values());

      // Merge channels (deduplicate by id)
      const channelMap = new Map<string, Channel>();
      snapshots.forEach(snapshot => {
        (snapshot.channels || []).forEach((channel: Channel & { providerId?: string }) => {
          if (!channelMap.has(channel.id)) {
            channelMap.set(channel.id, channel);
          }
        });
      });
      mergedSnapshot.channels = Array.from(channelMap.values());

      // Cache the merged snapshot with provider ID
      const primaryProviderId = selectedProviderIds[0] || '';
      setSnapshot(mergedSnapshot, primaryProviderId);

      const channelCategories = mergedSnapshot.categories.filter(
        (cat: Category) => cat.type === 'CHANNEL'
      );
      setCategories(channelCategories);
      setChannels(mergedSnapshot.channels);
      
      console.log(`[Live] Loaded ${mergedSnapshot.channels.length} channels from ${snapshots.length} providers, ${channelCategories.length} categories`);
    } catch (err) {
      console.error('Load snapshot error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load channels');
    } finally {
      setLoading(false);
      if (forceRefresh) setRefreshing(false);
    }
  };

  const organizeChannelsByCategory = () => {
    const organized: { [key: string]: Channel[] } = {};
    
    categories.forEach((category) => {
      const categoryChannels = channels.filter(ch => ch.categoryId === category.id);
      
      if (categoryChannels.length > 0) {
        organized[category.id] = categoryChannels;
      }
    });
    
    setCategorizedChannels(organized);
  };

  // Load EPG only when channel is clicked
  const loadChannelEpg = async (channel: Channel) => {
    if (!selectedProviderIds[0]) return;
    
    const providerId = channel.providerId || selectedProviderIds[0];
    const EPG_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
    const now = Date.now();
    
    // Check cache first
    const cached = epgCacheRef.current[channel.id];
    if (cached && (now - cached.timestamp) < EPG_CACHE_DURATION) {
      console.log(`[Live] Using cached EPG for channel: ${channel.name}`);
      return; // Already have valid cached data
    }
    
    try {
      console.log(`[Live] Loading EPG for single channel: ${channel.name}`);
      
      const response = await fetch(`${API_URL}/api/providers/${providerId}/epg`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ channelId: channel.id }),
      });
      
      if (response.ok) {
        const data = await response.json();
        const programs: EpgProgram[] = data.epg?.programs || [];
        
        // Fallback to current + next if programs array is empty
        if (programs.length === 0) {
          if (data.epg?.current_program) programs.push(data.epg.current_program);
          if (data.epg?.next_program) programs.push(data.epg.next_program);
        }
        
        if (programs.length > 0) {
          // Cache the data
          epgCacheRef.current[channel.id] = {
            data: programs,
            timestamp: now
          };
          
          setChannelEpgs(prev => ({ ...prev, [channel.id]: programs }));
          console.log(`[Live] Loaded ${programs.length} EPG programs for ${channel.name}`);
        }
      }
    } catch (err) {
      console.error(`[Live] Failed to load EPG for ${channel.name}:`, err);
    }
  };

  const loadChannelStream = async (channel: Channel & { providerId?: string }) => {
    const providerId = channel.providerId || selectedProviderIds[0];
    
    if (!providerId || !channel.cmd) {
      setError('Channel not available');
      return;
    }

    try {
      // Set channel immediately for instant UI feedback
      setSelectedChannel(channel);
      setStreamUrl(null); // Clear previous stream
      setCurrentEpg(null); // Clear previous EPG
      setStreamLoading(true); // Show loading state
      
      // Fetch stream and EPG in parallel
      const [streamResponse, epgResponse] = await Promise.all([
        fetch(`${API_URL}/api/providers/${providerId}/stream`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${jwtToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            cmd: channel.cmd,
            contentType: 'itv',
          }),
        }),
        fetch(`${API_URL}/api/providers/${providerId}/epg`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${jwtToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            channelId: channel.id,
          }),
        })
      ]);

      // Update stream URL - add JWT token as query parameter for video player
      if (streamResponse.ok) {
        const streamData = await streamResponse.json();
        let url = streamData.streamUrl;
        
        // If it's a proxied URL, add JWT token
        if (url.includes('/stream-proxy')) {
          const separator = url.includes('?') ? '&' : '?';
          url = `${url}${separator}token=${jwtToken}`;
        }
        
        setStreamUrl(url);
      }

      // Update EPG
      if (epgResponse.ok) {
        const epgData = await epgResponse.json();
        setCurrentEpg(epgData.epg);
      }
    } catch (err) {
      console.error('Load channel error:', err);
    } finally {
      setStreamLoading(false); // Hide loading state
    }
  };

  const handleChannelPress = (channel: Channel) => {
    loadChannelStream(channel);
    loadChannelEpg(channel); // Load EPG for this channel
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadSnapshot(true);
  };

  if (loading && channels.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#ef4444" />
        <Text style={styles.loadingText}>Loading channels...</Text>
      </View>
    );
  }

  if (error && channels.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.retryButton} onPress={() => loadSnapshot()}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (channels.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>No channels available</Text>
        <Text style={styles.emptySubtext}>Run sync to load live TV channels</Text>
        <Pressable style={styles.retryButton} onPress={handleRefresh}>
          <Text style={styles.retryText}>Refresh</Text>
        </Pressable>
      </View>
    );
  }

  // Get categories that have channels, separate censored from non-censored
  const allCategoriesWithChannels = categories.filter(
    (cat) => categorizedChannels[cat.id] && categorizedChannels[cat.id].length > 0
  );
  
  // Helper function to check if category is censored based on name
  const isCategoryRestricted = (category: Category): boolean => {
    const name = category.name.toUpperCase();
    return name.includes('ADULT') || 
           name.includes('XXX') || 
           name.includes('18+') ||
           category.censored === 1 || 
           category.censored === true;
  };
  
  // Split into non-censored and censored categories
  const normalCategories = allCategoriesWithChannels.filter(
    (cat) => !isCategoryRestricted(cat)
  );
  
  const restrictedCategories = allCategoriesWithChannels.filter(
    (cat) => isCategoryRestricted(cat)
  );
  
  // Combine: normal categories first, then censored at the end
  const categoriesWithChannels = [...normalCategories, ...restrictedCategories];
  
  // Get channels for selected category
  const displayChannels = selectedCategory 
    ? categorizedChannels[selectedCategory] || []
    : [];
  
  // Helper function to generate time slots (30-minute intervals for 72 hours)
  const generateTimeSlots = () => {
    const slots = [];
    const now = new Date();
    const startTime = new Date(now);
    startTime.setHours(startTime.getHours() - 1); // Start 1 hour before
    startTime.setMinutes(0, 0, 0);
    
    for (let i = 0; i < 146; i++) { // 73 hours of slots (30-min intervals)
      const slotTime = new Date(startTime.getTime() + i * 30 * 60 * 1000);
      slots.push(slotTime);
    }
    return slots;
  };
  
  const timeSlots = generateTimeSlots();
  
  // Helper function to get EPG program for a specific time
  const getProgramAtTime = (channelId: string, time: Date): EpgProgram | null => {
    const programs = channelEpgs[channelId] || [];
    const timeMs = time.getTime();
    
    return programs.find(program => {
      const start = parseInt(program.start_timestamp) * 1000;
      const stop = parseInt(program.stop_timestamp) * 1000;
      return timeMs >= start && timeMs < stop;
    }) || null;
  };
  
  // Helper function to format time
  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  };
  
  // Calculate current time position for the cursor
  const getCurrentTimePosition = (): number => {
    const now = new Date();
    const firstSlot = timeSlots[0];
    const minutesSinceStart = (now.getTime() - firstSlot.getTime()) / (1000 * 60);
    const slotWidth = 180; // Each 30-min slot is 180px
    const channelColumnWidth = 180; // Width of channel info column
    return channelColumnWidth + (minutesSinceStart / 30) * slotWidth;
  };

  // Fullscreen mode - use browser's native video player
  if (isFullscreen && streamUrl && selectedChannel) {
    return (
      <View style={styles.fullscreenContainer}>
        <Pressable
          style={styles.fullscreenBackButton}
          onPress={() => setIsFullscreen(false)}
        >
          <MaterialIcons name="arrow-back" size={28} color="#fff" />
          <Text style={styles.fullscreenBackText}>Back</Text>
        </Pressable>
        
        <video
          src={streamUrl}
          controls
          autoPlay
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: '#000',
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      {/* Top Section: 50% - Preview Player + Channel Info */}
      <View style={isMobile ? styles.topSectionMobile : styles.topSection}>
        {/* Left: Video Preview (60% desktop, 100% mobile) */}
        <View style={isMobile ? styles.previewContainerMobile : styles.previewContainer}>
          {streamLoading ? (
            <View style={styles.noPreview}>
              <ActivityIndicator size="large" color="#ef4444" />
              <Text style={styles.noPreviewText}>Loading stream...</Text>
            </View>
          ) : selectedChannel && streamUrl ? (
            <View style={styles.playerWrapper}>
              <VideoPlayer
                uri={streamUrl}
                title={selectedChannel.name}
                onBack={() => setSelectedChannel(null)}
                autoPlay
              />
            </View>
          ) : (
            <View style={styles.noPreview}>
              <MaterialIcons name="live-tv" size={64} color="#27272a" />
              <Text style={styles.noPreviewText}>Select a channel to watch</Text>
            </View>
          )}
        </View>

        {/* Right: Channel Info (40% desktop, 100% mobile) */}
        <View style={isMobile ? styles.channelInfoContainerMobile : styles.channelInfoContainer}>
          {selectedChannel ? (
            <ScrollView style={styles.channelInfoScroll}>
              <View style={styles.liveIndicator}>
                <View style={styles.liveDot} />
                <Text style={styles.liveLabel}>LIVE</Text>
              </View>
              
              <Text style={styles.channelName}>{selectedChannel.name}</Text>
              {selectedChannel.number && (
                <Text style={styles.channelNumber}>Channel {selectedChannel.number}</Text>
              )}

              {currentEpg?.current_program && (
                <View style={styles.programCard}>
                  <Text style={styles.programLabel}>NOW PLAYING</Text>
                  <Text style={styles.programTitle}>{currentEpg.current_program.name || 'No Title'}</Text>
                  <Text style={styles.programTime}>
                    {currentEpg.current_program.t_time || ''} - {currentEpg.current_program.t_time_to || ''}
                  </Text>
                  {currentEpg.current_program.descr && (
                    <Text style={styles.programDesc} numberOfLines={4}>
                      {currentEpg.current_program.descr}
                    </Text>
                  )}
                </View>
              )}

              {currentEpg?.next_program && (
                <View style={[styles.programCard, styles.nextProgramCard]}>
                  <Text style={styles.programLabel}>UP NEXT</Text>
                  <Text style={styles.programTitle}>{currentEpg.next_program.name || 'No Title'}</Text>
                  <Text style={styles.programTime}>
                    {currentEpg.next_program.t_time || ''} - {currentEpg.next_program.t_time_to || ''}
                  </Text>
                </View>
              )}
            </ScrollView>
          ) : (
            <View style={styles.noChannelInfo}>
              <MaterialIcons name="info-outline" size={48} color="#27272a" />
              <Text style={styles.noChannelInfoText}>
                Select a channel to view program information
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Bottom Section: 50% - EPG Grid with Timeline */}
      <View style={styles.epgSection}>
        {/* Category Dropdown */}
        <View style={styles.categoryDropdownContainer}>
          <Text style={styles.categoryDropdownLabel}>Category:</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.categoryDropdownScroll}
          >
            {categoriesWithChannels.map((category) => {
              const isCensored = isCategoryRestricted(category);
              const isSelected = selectedCategory === category.id;
              
              return (
                <Pressable
                  key={category.id}
                  style={[
                    styles.categoryChip,
                    isSelected && styles.categoryChipSelected,
                    isCensored && styles.categoryChipCensored,
                  ]}
                  onPress={() => setSelectedCategory(category.id)}
                >
                  {isCensored && (
                    <MaterialIcons name="lock" size={14} color={isSelected ? "#fff" : "#f59e0b"} />
                  )}
                  <Text style={[
                    styles.categoryChipText,
                    isSelected && styles.categoryChipTextSelected,
                  ]}>
                    {category.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* EPG Timeline Grid */}
        <ScrollView
          style={styles.epgGridContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#ef4444"
            />
          }
        >
          {/* Time Slot Headers */}
          <View style={styles.timeHeaderRow}>
            <View style={styles.channelColumnHeader} />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.timeSlotScroll}
            >
              {timeSlots.map((slot, index) => (
                <View key={index} style={styles.timeSlotHeader}>
                  <Text style={styles.timeSlotText}>{formatTime(slot)}</Text>
                </View>
              ))}
            </ScrollView>
          </View>

          {/* Channel Rows with EPG Timeline */}
          {displayChannels.map((channel) => {
            const isCensored = isCategoryRestricted(
              categories.find(c => c.id === selectedCategory) || {} as Category
            );
            
            return (
              <View key={channel.id} style={styles.epgRow}>
                {/* Channel Info Column */}
                <Pressable
                  style={[
                    styles.channelColumnCell,
                    selectedChannel?.id === channel.id && styles.channelColumnCellSelected,
                  ]}
                  onPress={() => handleChannelPress(channel)}
                >
                  <View style={styles.channelCellContent}>
                    {channel.number && (
                      <Text style={styles.channelCellNumber}>{channel.number}</Text>
                    )}
                    <View style={styles.channelCellLogo}>
                      {channel.logo ? (
                        <Text style={styles.channelCellLogoText}>
                          {channel.name.substring(0, 2).toUpperCase()}
                        </Text>
                      ) : (
                        <MaterialIcons name="tv" size={16} color="#71717a" />
                      )}
                      {isCensored && (
                        <View style={styles.channelCellLockBadge}>
                          <MaterialIcons name="lock" size={10} color="#f59e0b" />
                        </View>
                      )}
                    </View>
                    <Text style={styles.channelCellName} numberOfLines={1}>
                      {channel.name}
                    </Text>
                  </View>
                </Pressable>

                {/* EPG Timeline for this channel */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.epgTimelineRow}
                >
                  <View style={styles.epgTimelineContent}>
                    {timeSlots.map((slot, index) => {
                      const program = getProgramAtTime(channel.id, slot);
                      
                      return (
                        <View key={index} style={styles.epgProgramBlock}>
                          {program ? (
                            <View style={styles.epgProgramCard}>
                              <Text style={styles.epgProgramTitle} numberOfLines={1}>
                                {program.name || 'No Title'}
                              </Text>
                              <Text style={styles.epgProgramTime} numberOfLines={1}>
                                {program.t_time || ''}
                              </Text>
                            </View>
                          ) : (
                            <View style={styles.epgProgramEmpty}>
                              <Text style={styles.epgProgramEmptyText}>—</Text>
                            </View>
                          )}
                        </View>
                      );
                    })}
                    
                    {/* Current time cursor */}
                    <View
                      style={[
                        styles.currentTimeCursor,
                        { left: getCurrentTimePosition() - 180 }, // Subtract channel column width
                      ]}
                    />
                  </View>
                </ScrollView>
              </View>
            );
          })}
          
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  fullscreenContainer: {
    flex: 1,
    backgroundColor: '#000',
    position: 'relative',
  },
  fullscreenBackButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    zIndex: 10,
    gap: 8,
  },
  fullscreenBackText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#09090b',
    padding: 20,
  },
  
  // Top Section: Preview + Info
  topSection: {
    height: SCREEN_HEIGHT * 0.5,
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: '#ef4444',
    overflow: 'hidden',
    position: 'relative',
    zIndex: 1,
  },
  topSectionMobile: {
    height: SCREEN_HEIGHT * 0.5,
    flexDirection: 'column',
    borderBottomWidth: 2,
    borderBottomColor: '#ef4444',
    overflow: 'hidden',
    position: 'relative',
    zIndex: 1,
  },
  
  // Preview (60% desktop)
  previewContainer: {
    flex: 0.6,
    backgroundColor: '#000',
    overflow: 'hidden',
    position: 'relative',
    zIndex: 1,
  },
  previewContainerMobile: {
    height: '60%',
    backgroundColor: '#000',
    overflow: 'hidden',
    position: 'relative',
    zIndex: 1,
  },
  playerWrapper: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
    overflow: 'hidden',
  },
  fullscreenBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 8,
    borderRadius: 8,
    zIndex: 100,
  },
  noPreview: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#18181b',
  },
  noPreviewText: {
    color: '#71717a',
    fontSize: 14,
    marginTop: 16,
    textAlign: 'center',
  },
  
  // Channel Info (40% desktop)
  channelInfoContainer: {
    flex: 0.4,
    backgroundColor: '#18181b',
    overflow: 'hidden',
    borderLeftWidth: 0,
    position: 'relative',
    zIndex: 1,
  },
  channelInfoContainerMobile: {
    height: '40%',
    backgroundColor: '#18181b',
    overflow: 'hidden',
    borderTopWidth: 0,
    position: 'relative',
    zIndex: 1,
  },
  channelInfoScroll: {
    flex: 1,
    padding: 16,
  },
  noChannelInfo: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  noChannelInfoText: {
    color: '#71717a',
    fontSize: 13,
    marginTop: 12,
    textAlign: 'center',
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ef4444',
    marginRight: 8,
  },
  liveLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#ef4444',
    letterSpacing: 1.5,
  },
  channelName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  channelNumber: {
    fontSize: 14,
    color: '#71717a',
    marginBottom: 20,
  },
  programCard: {
    backgroundColor: '#27272a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  nextProgramCard: {
    opacity: 0.7,
  },
  programLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#71717a',
    letterSpacing: 1,
    marginBottom: 6,
  },
  programTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  programTime: {
    fontSize: 12,
    color: '#a1a1aa',
    marginBottom: 8,
  },
  programDesc: {
    fontSize: 12,
    color: '#a1a1aa',
    lineHeight: 18,
  },
  
  // EPG Grid Section
  epgSection: {
    flex: 1,
    backgroundColor: '#09090b',
    position: 'relative',
    zIndex: 2,
  },
  epgScrollView: {
    flex: 1,
  },
  categorySection: {
    marginTop: 16,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#18181b',
  },
  categoryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  censoredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#422006',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  censoredBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#f59e0b',
    letterSpacing: 0.5,
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
    backgroundColor: '#18181b',
  },
  channelRowSelected: {
    backgroundColor: '#27272a',
    borderLeftWidth: 4,
    borderLeftColor: '#ef4444',
  },
  channelRowCensored: {
    opacity: 0.7,
  },
  channelInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 180,
  },
  channelLogoWrapper: {
    position: 'relative',
    marginRight: 12,
  },
  channelLockBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#422006',
    borderRadius: 10,
    width: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f59e0b',
  },
  channelLogo: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: '#27272a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  channelLogoText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#71717a',
  },
  channelDetails: {
    flex: 1,
  },
  channelRowName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  channelRowNumber: {
    fontSize: 11,
    color: '#71717a',
  },
  
  // Loading states
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#888',
  },
  errorText: {
    fontSize: 16,
    color: '#ef4444',
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyText: {
    fontSize: 18,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#ef4444',
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  
  // Category Dropdown Styles
  categoryDropdownContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#18181b',
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
    gap: 12,
  },
  categoryDropdownLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#a1a1aa',
  },
  categoryDropdownScroll: {
    flex: 1,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    backgroundColor: '#27272a',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  categoryChipSelected: {
    backgroundColor: '#ef4444',
    borderColor: '#ef4444',
  },
  categoryChipCensored: {
    borderColor: '#f59e0b',
  },
  categoryChipText: {
    fontSize: 13,
    color: '#a1a1aa',
    fontWeight: '500',
  },
  categoryChipTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  
  // EPG Grid Timeline Styles
  epgGridContainer: {
    flex: 1,
  },
  timeHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#18181b',
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  channelColumnHeader: {
    width: 180,
    backgroundColor: '#18181b',
  },
  timeSlotScroll: {
    flex: 1,
  },
  timeSlotHeader: {
    width: 180,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#27272a',
  },
  timeSlotText: {
    fontSize: 12,
    color: '#a1a1aa',
    fontWeight: '600',
  },
  epgRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
    minHeight: 60,
  },
  channelColumnCell: {
    width: 180,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#18181b',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#27272a',
  },
  channelColumnCellSelected: {
    backgroundColor: '#27272a',
    borderLeftWidth: 3,
    borderLeftColor: '#ef4444',
  },
  channelCellContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  channelCellNumber: {
    fontSize: 12,
    color: '#71717a',
    fontWeight: '600',
    minWidth: 24,
  },
  channelCellLogo: {
    width: 32,
    height: 32,
    borderRadius: 4,
    backgroundColor: '#27272a',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  channelCellLogoText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#71717a',
  },
  channelCellLockBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#422006',
    borderRadius: 8,
    padding: 2,
  },
  channelCellName: {
    flex: 1,
    fontSize: 13,
    color: '#e4e4e7',
    fontWeight: '500',
  },
  epgTimelineRow: {
    flex: 1,
  },
  epgTimelineContent: {
    flexDirection: 'row',
    position: 'relative',
  },
  epgProgramBlock: {
    width: 180,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: '#27272a',
  },
  epgProgramCard: {
    backgroundColor: '#27272a',
    borderRadius: 4,
    padding: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#ef4444',
  },
  epgProgramTitle: {
    fontSize: 12,
    color: '#e4e4e7',
    fontWeight: '600',
    marginBottom: 2,
  },
  epgProgramTime: {
    fontSize: 10,
    color: '#71717a',
  },
  epgProgramEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  epgProgramEmptyText: {
    fontSize: 14,
    color: '#3f3f46',
  },
  currentTimeCursor: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#22c55e',
    zIndex: 10,
  },
  epgLoadingOverlay: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  epgLoadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#a1a1aa',
  },
});
