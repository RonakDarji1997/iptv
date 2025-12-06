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
import { COLORS, SPACING } from '../constants';
import { LoadingIndicator, ErrorState, EmptyState, LiveTVPlayer } from '../components';
import { CategoryRepository } from '../repositories';
import { Category } from '../types';
import { StalkerPortalClient, StalkerChannel } from '../services/StalkerPortalClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');
const isTablet = width >= 768;
const THUMBNAIL_WIDTH = isTablet ? (width - SPACING.lg * 7) / 5 : (width - SPACING.lg * 5) / 3;
const THUMBNAIL_HEIGHT = THUMBNAIL_WIDTH * 1.5;
const MAX_THUMBNAILS = 25;
const FALLBACK_IMAGE = 'https://via.placeholder.com/300x450/1a1a1a/ffffff?text=No+Image';

export default function LiveTVScreen() {
  const navigation = useNavigation();
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
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
  const isFocusedRef = React.useRef(true);

  useEffect(() => {
    const init = async () => {
      const client = await initStalkerClient();
      await loadCategories(client);
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

  const initStalkerClient = async () => {
    try {
      const providerData = await AsyncStorage.getItem('stalker_provider_config');
      if (!providerData) {
        console.error('❌ No provider config found in AsyncStorage');
        return null;
      }
      
      const provider = JSON.parse(providerData);
      console.log('📱 Initializing Stalker client with provider:', provider.name);
      
      const client = new StalkerPortalClient(
        provider.portalUrl,
        provider.macAddress,
        '058357N656529'
      );
      
      if (provider.bearerToken) {
        client.setToken(provider.bearerToken);
        console.log('✅ Stalker client initialized with token');
      } else {
        console.warn('⚠️ No bearer token found for provider');
      }
      
      setPortalUrl(provider.portalUrl);
      setStalkerClient(client);
      return client;
    } catch (error) {
      console.error('❌ Failed to init Stalker client:', error);
      return null;
    }
  };

  const loadCategories = async (client?: StalkerPortalClient | null) => {
    try {
      setCategoriesLoading(true);
      const cats = await CategoryRepository.getLiveCategories();
      setCategories(cats);
      setCategoriesLoading(false); // Show categories immediately
      
      // Use provided client or fall back to state
      const activeClient = client || stalkerClient;
      
      // If stalker client is available, load channel previews progressively
      if (activeClient) {
        for (const cat of cats) {
          // Stop if screen is not focused
          if (!isFocusedRef.current) {
            console.log('⏸️ Stopping channel loading - screen not focused');
            break;
          }
          
          try {
            await loadCategoryChannels(cat, activeClient);
          } catch (error) {
            console.error(`❌ Error loading ${cat.name}:`, error);
          }
        }
      }
    } catch (err) {
      setCategoriesLoading(false);
      // Silently handle error
    }
  };

  const loadCategoryChannels = async (category: Category, client?: StalkerPortalClient | null) => {
    const activeClient = client || stalkerClient;
    if (!activeClient || categoryChannels[category.id]) return;
    
    try {
      console.log(`📡 Loading channels preview for category: ${category.name}`);
      const response = await activeClient.getChannelsByCategory(category.id, 1);
      const channelsList = response.channels || [];
      const limitedChannels = channelsList.slice(0, MAX_THUMBNAILS);
      
      setCategoryChannels(prev => ({
        ...prev,
        [category.id]: limitedChannels
      }));
      
      // Map each channel to its category for later lookup
      const newMappings: Record<string, string> = {};
      limitedChannels.forEach(ch => {
        newMappings[ch.id] = category.id;
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
      console.log(`📡 Fetching channels for category ${category.name} (${category.id}), page ${pageNum}`);

      const response = await stalkerClient.getChannelsByCategory(category.id, pageNum);
      
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
        <Image
          source={{ uri: imageUrl }}
          style={styles.thumbnailImage}
          resizeMode="cover"
          onError={() => setHasError(true)}
        />
        <Text style={styles.thumbnailTitle} numberOfLines={2}>
          {item.name || 'Untitled'}
        </Text>
      </TouchableOpacity>
    );
  });

  const renderCategoryRow = ({ item: category }: { item: Category }) => {
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
        
        <FlatList
          horizontal
          data={categoryChannels[category.id] || []}
          renderItem={({ item }) => <ChannelThumbnail item={item} />}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.thumbnailList}
          ListEmptyComponent={
            <View style={styles.loadingThumbnails}>
              <ActivityIndicator size="small" color={COLORS.primary} />
            </View>
          }
        />
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
        <FlatList
          data={categories}
          renderItem={renderCategoryRow}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.categoriesContainer}
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
