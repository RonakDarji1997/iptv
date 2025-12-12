import React, { useState, useEffect } from 'react';
import { 
  View, 
  ScrollView,
  FlatList,
  Image, 
  TouchableOpacity, 
  Text, 
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Modal,
  StatusBar
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { COLORS, SPACING, API_CONFIG } from '../constants';
import { LoadingIndicator, ErrorState, EmptyState, LiveTVPlayer } from '../components';
// import { ProviderDropdown } from '../components/ProviderDropdown'; // Temporarily disabled
import { CategoryRepository } from '../repositories';
import { Category } from '../types';
import { StalkerPortalClient, StalkerChannel } from '../services/StalkerPortalClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { ProviderService } from '../services/ProviderService';
import { onSelectedProvidersChange } from '../services/ProviderSelectionEvents';

const { width } = Dimensions.get('window');
const isTablet = width >= 768;
const THUMBNAIL_WIDTH = isTablet ? (width - SPACING.lg * 7) / 5 : (width - SPACING.lg * 5) / 3;
const THUMBNAIL_HEIGHT = THUMBNAIL_WIDTH * 1.5;
const MAX_THUMBNAILS = 25;
const FALLBACK_IMAGE = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQ1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQ1MCIgZmlsbD0iIzFhMWExYSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjIwIiBmaWxsPSIjZmZmZmZmIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+';

export default function LiveTVScreen() {
  const navigation = useNavigation();
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<string | undefined>(undefined);
  const [channels, setChannels] = useState<StalkerChannel[]>([]);
  const [categoryChannels, setCategoryChannels] = useState<Record<string, StalkerChannel[]>>({});
  const [channelCategoryMap, setChannelCategoryMap] = useState<Record<string, string>>({});
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [syncWaitComplete, setSyncWaitComplete] = useState(false);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [playingChannel, setPlayingChannel] = useState<{ channel: StalkerChannel; streamUrl: string; channels: StalkerChannel[]; categoryId?: string } | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [stalkerClient, setStalkerClient] = useState<StalkerPortalClient | null>(null);
  const [portalUrl, setPortalUrl] = useState<string>('');
  const [loadedCategoryIds, setLoadedCategoryIds] = useState<Set<string>>(new Set());
  const isFocusedRef = React.useRef(true);
  const stalkerClientRef = React.useRef<StalkerPortalClient | null>(null);
  const loadedCategoryIdsRef = React.useRef<Set<string>>(new Set());

  // Update refs when state changes
  React.useEffect(() => {
    stalkerClientRef.current = stalkerClient;
  }, [stalkerClient]);

  React.useEffect(() => {
    loadedCategoryIdsRef.current = loadedCategoryIds;
  }, [loadedCategoryIds]);

  // Lazy loading configuration - must remain stable
  const handleViewableItemsChanged = React.useCallback(({ viewableItems }: any) => {
    // Load channels for categories that come into view
    if (stalkerClientRef.current && isFocusedRef.current) {
      viewableItems.forEach((viewableItem: any) => {
        const category = viewableItem.item;
        if (category && !loadedCategoryIdsRef.current.has(category.id)) {
          loadCategoryChannels(category, stalkerClientRef.current);
        }
      });
    }
  }, []); // Empty deps - callback never changes

  const viewabilityConfig = React.useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  // Reload categories when provider selection changes
  useEffect(() => {
    if (stalkerClient) {
      (async () => {
        if (selectedProviderId) {
          await loadCategories(stalkerClient, [selectedProviderId]);
        } else {
          const selectedIds = await ProviderService.getSelectedProviderIds();
          await loadCategories(stalkerClient, selectedIds);
        }
        // Clear loaded category channels when provider changes
        setCategoryChannels({});
        setLoadedCategoryIds(new Set());
      })();
    }
  }, [selectedProviderId]);

  useEffect(() => {
    const init = async () => {
      // Load the first selected provider as default (respect user's provider settings)
      const selectedProviders = await ProviderService.getSelectedProviders();
      console.log('🏢 [LiveTV] Selected providers:', selectedProviders.map(p => ({ id: p.id, name: p.name })));
      if (selectedProviders.length > 0 && !selectedProviderId) {
        console.log('🎯 [LiveTV] Setting default provider from selection:', selectedProviders[0].id, selectedProviders[0].name);
        setSelectedProviderId(selectedProviders[0].id);
      }
      
      const client = await initStalkerClient();
      if (client) {
        if (selectedProviderId) {
          await loadCategories(client, [selectedProviderId]);
        } else {
          const selectedIds = await ProviderService.getSelectedProviderIds();
          await loadCategories(client, selectedIds);
        }
      }
    };
    init();
    
    // Allow time for sync to complete before showing empty state
    const syncTimer = setTimeout(() => {
      setSyncWaitComplete(true);
    }, 5000); // Wait 5 seconds for sync
    
    // Track screen focus to stop loading on tab change
    const unsubscribeFocus = navigation.addListener('focus', () => {
      console.log('📺 [LiveTV] Screen focused');
      isFocusedRef.current = true;
    });
    
    const unsubscribeBlur = navigation.addListener('blur', () => {
      console.log('👋 [LiveTV] Screen blurred - stopping fetches');
      isFocusedRef.current = false;
    });
    
    return () => {
      clearTimeout(syncTimer);
      unsubscribeFocus();
      unsubscribeBlur();
    };
  }, [navigation]);

  // Subscribe to provider selection changes to force a categories refresh
  useEffect(() => {
    const unsubscribe = onSelectedProvidersChange(async (ids: string[]) => {
      console.log('🔁 [LiveTV] Provider selection changed (event):', ids);
      try {
        // Use the emitted ids directly to avoid race conditions with
        // AsyncStorage write/read. Emit provides the authoritative
        // selection payload from the UI.
        const first = ids && ids.length > 0 ? ids[0] : undefined;
        if (first && first !== selectedProviderId) {
          setSelectedProviderId(first);
        }
        await loadCategories(stalkerClient, ids);
        setCategoryChannels({});
        setLoadedCategoryIds(new Set());
      } catch (err) {
        console.error('🔁 [LiveTV] Error handling provider change event:', err);
      }
    });
    return () => unsubscribe();
  }, [stalkerClient, selectedProviderId]);

  const initStalkerClient = async () => {
    try {
      let provider: any = null;
      if (selectedProviderId) {
        provider = await ProviderService.getProviderById(selectedProviderId);
      }

      if (!provider) {
        const providerData = await AsyncStorage.getItem('stalker_provider_config');
        if (!providerData) {
          console.error('❌ No provider config found');
          return null;
        }
        provider = JSON.parse(providerData);
      }
      console.log('📱 Initializing Stalker client with provider:', provider.name);

      // Use backend URL from constants (remove /api suffix for StalkerPortalClient)
      const backendBaseUrl = API_CONFIG.BACKEND_URL.endsWith('/api')
        ? API_CONFIG.BACKEND_URL.slice(0, -4)
        : API_CONFIG.BACKEND_URL;

      const portal = provider.portalUrl || provider.serverUrl || provider.portalUrl;
      const client = new StalkerPortalClient(
        portal,
        provider.macAddress,
        provider.serialNumber || '058357N656529',
        backendBaseUrl
      );

      const token = provider.token || provider.bearerToken;
      if (token) {
        client.setToken(token);
        console.log('✅ Stalker client initialized with token');
      } else {
        console.warn('⚠️ No bearer token found for provider');
      }

      setPortalUrl(portal);
      setStalkerClient(client);
      return client;
    } catch (error) {
      console.error('❌ Failed to init Stalker client:', error);
      return null;
    }
  };

  useEffect(() => {
    const reinit = async () => {
      const client = await initStalkerClient();
      if (client) {
        if (selectedProviderId) {
          await loadCategories(client, [selectedProviderId]);
        } else {
          const selectedIds = await ProviderService.getSelectedProviderIds();
          await loadCategories(client, selectedIds);
        }
      }
    };
    reinit();
  }, [selectedProviderId]);

  const loadCategories = async (client?: StalkerPortalClient | null, providerIds?: string | string[]) => {
    try {
      const providerLabel = Array.isArray(providerIds) ? providerIds.join(',') : (providerIds || 'ALL');
      console.log(`📺 [LiveTV] Loading categories for provider(s): ${providerLabel}`);
      setCategoriesLoading(true);
      const cats = await CategoryRepository.getLiveCategories(providerIds as any);
      console.log(`✅ [LiveTV] Loaded ${cats.length} categories`);
      if (cats.length > 0) {
        console.log('📋 [LiveTV] First 3 categories:', cats.slice(0, 3).map(c => ({ name: c.name, id: c.id })));
      }
      setCategories(cats);
      setCategoriesLoading(false); // Show categories immediately without waiting for channels
    } catch (err) {
      console.error('❌ [LiveTV] Error loading categories:', err);
      setCategoriesLoading(false);
      // Silently handle error
    }
  };

  const loadCategoryChannels = async (category: Category, client?: StalkerPortalClient | null) => {
    const activeClient = client || stalkerClient;
    if (!activeClient) return;
    // Use backend category id if available for remote calls; fall back to DB id
    const remoteCategoryId = (category as any).categoryId || category.id;
    if (loadedCategoryIds.has(category.id)) return;
    
    try {
      console.log(`📡 Loading channels preview for category: ${category.name}`);
      setLoadedCategoryIds(prev => new Set(prev).add(category.id));
      
      const response = await activeClient.getChannelsByCategory(remoteCategoryId, 1);
      const channelsList = response.channels || [];
      const limitedChannels = channelsList.slice(0, MAX_THUMBNAILS);
      
      setCategoryChannels(prev => ({
        ...prev,
        [category.id]: limitedChannels
      }));
      
      // Map each channel to its backend category id for later lookup
      const newMappings: Record<string, string> = {};
      limitedChannels.forEach(ch => {
        newMappings[ch.id] = remoteCategoryId;
      });
      setChannelCategoryMap(prev => ({ ...prev, ...newMappings }));
      
      console.log(`✅ Loaded ${limitedChannels.length} channels for ${category.name}`);
    } catch (error) {
      // Silently handle error - some categories may not have channels available
      console.log(`⏭️ Skipping category ${category.name} - no channels available`);
    }
  };

  const handleCategoryPress = (category: Category) => {
    console.log(`🎯 Category clicked: ${category.name} (ID: ${category.id})`);
    loadAllChannels(category);
  };

  const loadAllChannels = (category: Category) => {
    setSelectedCategory(category);
    setChannels([]);
    setPage(1);
    setHasMore(true);
    loadChannels(category, 1, true);
  };

  const loadChannels = async (category: Category, pageNum: number, reset: boolean = false) => {
    if (!stalkerClient) {
      console.error('❌ Stalker client not initialized');
      return;
    }
    if (channelsLoading) {
      console.log('⏳ Already loading channels, skipping...');
      return;
    }

    try {
      setChannelsLoading(true);
      const remoteCategoryId = (category as any).categoryId || category.id;
      console.log(`📡 Fetching channels for category ${category.name} (${remoteCategoryId}), page ${pageNum}`);

      const response = await stalkerClient.getChannelsByCategory(remoteCategoryId, pageNum);
      
      console.log(`✅ Received ${response.channels?.length || 0} channels from backend`);

      if (reset) {
        setChannels(response.channels || []);
      } else {
        setChannels(prev => [...prev, ...(response.channels || [])]);
      }

      setHasMore((response.channels || []).length > 0);
      setPage(pageNum + 1);
    } catch (error) {
      // Silently handle error
    } finally {
      setChannelsLoading(false);
    }
  };

  const handleLoadMore = () => {
    if (selectedCategory && hasMore && !channelsLoading) {
      loadChannels(selectedCategory, page, false);
    }
  };

  const handleChannelPress = async (channel: StalkerChannel) => {
    if (!stalkerClient) {
      return;
    }

    try {
      console.log(`▶️ Playing channel: ${channel.name}`);
      console.log(`📡 Fetching stream URL for cmd: ${channel.cmd}`);
      
      const streamData = await stalkerClient.getChannelStream(channel.cmd);
      console.log(`🎬 Stream data received:`, streamData);
      
      if (streamData.cmd) {
        console.log(`✅ Opening player with stream URL: ${streamData.cmd.substring(0, 50)}...`);
        
        // Determine which channels array to use for navigation
        let allChannels = channels; // Default: use loaded channels (View All mode)
        let categoryId: string | undefined;
        
          if (!selectedCategory) {
          // Playing from preview - need to load all channels from category
          categoryId = channelCategoryMap[channel.id];

          if (categoryId) {
            console.log(`📺 Loading all channels for category ${categoryId} for navigation`);
            try {
              const response = await stalkerClient.getChannelsByCategory(categoryId, 1);
              allChannels = response.channels || [];
              console.log(`✅ Loaded ${allChannels.length} channels for navigation`);
            } catch (error) {
              // Failed to load, use single channel
              allChannels = [channel]; // Fallback: at least include current channel
            }
          } else {
            // No category mapping
            allChannels = [channel];
          }
        }
        
        console.log(`🎮 Setting up player with ${allChannels.length} channels for navigation`);
        setPlayingChannel({ channel, streamUrl: streamData.cmd, channels: allChannels, categoryId });
      }
    } catch (error) {
      // Silently handle error
    }
  };

  const handleChannelChange = async (newChannel: StalkerChannel) => {
    if (!stalkerClient || !playingChannel) return;
    
    try {
      console.log(`🔄 Changing to channel: ${newChannel.name}`);
      const streamData = await stalkerClient.getChannelStream(newChannel.cmd);
      
      if (streamData.cmd) {
        // Keep the same channels array and category for navigation
        setPlayingChannel({ 
          channel: newChannel, 
          streamUrl: streamData.cmd, 
          channels: playingChannel.channels,
          categoryId: playingChannel.categoryId 
        });
      }
    } catch (error) {
      // Silently handle error
    }
  };

  const handleBack = () => {
    setSelectedCategory(null);
    setChannels([]);
  };

  const getChannelImageUrl = (channel: StalkerChannel): string => {
    if (!channel.logo) return FALLBACK_IMAGE;
    return `${portalUrl}/stalker_portal/misc/logos/320/${channel.logo}`;
  };

  const ChannelThumbnail = React.memo(({ item }: { item: StalkerChannel }) => {
    const [hasError, setHasError] = React.useState<boolean>(false);
    const imageUrl = hasError ? FALLBACK_IMAGE : getChannelImageUrl(item);

    return (
      <TouchableOpacity
        style={styles.thumbnail}
        onPress={() => handleChannelPress(item)}
        activeOpacity={0.7}
      >
        {hasError ? (
          <View style={[styles.thumbnailImage, styles.noImagePlaceholder]}>
            <Ionicons name="tv-outline" size={48} color="#666" />
          </View>
        ) : (
          <Image
            source={{ uri: imageUrl }}
            style={styles.thumbnailImage}
            resizeMode="cover"
            onError={() => setHasError(true)}
          />
        )}
        <Text style={styles.thumbnailTitle} numberOfLines={2}>
          {item.name || 'Untitled'}
        </Text>
      </TouchableOpacity>
    );
  });

  const renderCategoryRow = ({ item: category }: { item: Category }) => {
    const channels = categoryChannels[category.id] || [];
    const isLoaded = loadedCategoryIds.has(category.id);
    
    return (
      <View style={styles.categoryRow}>
        <View style={styles.categoryHeader}>
          <Text style={styles.categoryName}>{category.name}</Text>
          <TouchableOpacity 
            onPress={() => loadAllChannels(category)}
            style={styles.viewAllButton}
          >
            <Text style={styles.viewAllText}>View All</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.primary} />
          </TouchableOpacity>
        </View>
        
        {!isLoaded ? (
          <View style={styles.loadingThumbnails}>
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        ) : channels.length > 0 ? (
          <FlatList
            horizontal
            data={channels}
            renderItem={({ item }) => <ChannelThumbnail item={item} />}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.thumbnailList}
          />
        ) : (
          <View style={styles.loadingThumbnails}>
            <Text style={styles.loadingText}>No channels</Text>
          </View>
        )}
      </View>
    );
  };

  const renderChannel = ({ item }: { item: StalkerChannel }) => (
    <TouchableOpacity
      style={styles.channelItem}
      onPress={() => handleChannelPress(item)}
      activeOpacity={0.7}
    >
      {item.logo ? (
        <Image
          source={{ uri: `${portalUrl}/stalker_portal/misc/logos/320/${item.logo}` }}
          style={styles.channelLogo}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.channelLogo, styles.channelPlaceholder]}>
          <Ionicons name="tv-outline" size={48} color={COLORS.textMuted} />
        </View>
      )}
      <View style={styles.channelInfo}>
        <Text style={styles.channelName} numberOfLines={2}>
          {item.name}
        </Text>
        {item.number && (
          <Text style={styles.channelNumber}>Ch {item.number}</Text>
        )}
      </View>
    </TouchableOpacity>
  );

  if (categoriesLoading) {
    return <LoadingIndicator message="Loading categories..." />;
  }

  if (categories.length === 0 && !syncWaitComplete) {
    return <LoadingIndicator message="Syncing categories..." />;
  }

  if (categories.length === 0) {
    return <EmptyState message="No live TV categories found" icon="📺" />;
  }

  // Show channels list when category selected
  if (selectedCategory) {
    return (
      <>
        <View style={styles.container}>
          <StatusBar hidden={false} />
          <View style={styles.header}>
            <TouchableOpacity onPress={handleBack} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{selectedCategory.name}</Text>
          </View>

        {/* Channels List */}
        <FlatList
          data={channels}
          renderItem={renderChannel}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.channelsList}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            channelsLoading ? (
              <View style={styles.loadingFooter}>
                <ActivityIndicator size="large" color={COLORS.primary} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            !channelsLoading ? (
              <EmptyState message="No channels found" icon="📺" />
            ) : null
          }
        />
        </View>
      </>
    );
  }

  // Show category rows with channel previews
  return (
    <>
      <View style={styles.container}>
        <View style={styles.headerOverlay}>
          {/* Provider dropdown temporarily hidden across screens.
              To re-enable, uncomment the import above and the
              <ProviderDropdown /> component below. */}
          {/*
          <ProviderDropdown
            selectedProviderId={selectedProviderId}
            onProviderSelect={setSelectedProviderId}
            style={styles.providerDropdown}
          />
          */}
        </View>
        <FlatList
          data={categories}
          renderItem={renderCategoryRow}
          keyExtractor={(item) => `${item.providerId || 'all'}_${item.id}`}
          contentContainerStyle={styles.categoriesContainer}
          onViewableItemsChanged={handleViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          removeClippedSubviews={true}
          maxToRenderPerBatch={5}
          updateCellsBatchingPeriod={50}
          windowSize={10}
        />
      </View>
      
      {/* Full Screen Player Modal - Available from all views */}
      {playingChannel && (
        <Modal
          visible={true}
          animationType="slide"
          onRequestClose={() => setPlayingChannel(null)}
          statusBarTranslucent={true}
          presentationStyle="fullScreen"
        >
          <LiveTVPlayer
            streamUrl={playingChannel.streamUrl}
            channel={playingChannel.channel}
            channels={playingChannel.channels}
            onClose={() => setPlayingChannel(null)}
            onChannelChange={handleChannelChange}
          />
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  headerOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  providerDropdown: {
    flex: 1,
  },
  categoriesContainer: {
    padding: SPACING.lg,
  },
  categoryRow: {
    marginBottom: SPACING.xl,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  categoryName: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '700',
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewAllText: {
    color: COLORS.primary,
    fontSize: 16,
    marginRight: 4,
  },
  thumbnailList: {
    paddingRight: SPACING.lg,
  },
  thumbnail: {
    width: THUMBNAIL_WIDTH,
    marginRight: SPACING.md,
  },
  thumbnailImage: {
    width: THUMBNAIL_WIDTH,
    height: THUMBNAIL_HEIGHT,
    borderRadius: 8,
    backgroundColor: COLORS.backgroundLight,
  },
  noImagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  thumbnailTitle: {
    color: COLORS.text,
    fontSize: 14,
    marginTop: SPACING.sm,
  },
  loadingThumbnails: {
    width: THUMBNAIL_WIDTH,
    height: THUMBNAIL_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    backgroundColor: COLORS.backgroundLight,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    marginRight: SPACING.md,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  channelsList: {
    padding: SPACING.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  channelItem: {
    width: isTablet ? (width - SPACING.lg * 6) / 4 : (width - SPACING.lg * 4) / 3,
    margin: SPACING.sm,
    minWidth: 100,
  },
  channelLogo: {
    width: '100%',
    height: isTablet ? (width - SPACING.lg * 6) / 4 * 1.5 : (width - SPACING.lg * 4) / 3 * 1.5,
    borderRadius: 8,
    backgroundColor: COLORS.backgroundLight,
  },
  channelPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  channelInfo: {
    marginTop: SPACING.sm,
  },
  channelName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  channelNumber: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  loadingFooter: {
    paddingVertical: SPACING.xl,
    alignItems: 'center',
  },
});
