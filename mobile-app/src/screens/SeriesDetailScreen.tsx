import React, { useState, useEffect } from 'react';
import { View, ScrollView, Image, Text, TouchableOpacity, StyleSheet, FlatList, Modal, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, SPACING, FONT_SIZES, IS_TABLET } from '../constants';
import { LoadingIndicator } from '../components';
import { VODPlayer } from '../components/VODPlayer';
import { Series, Season, Episode } from '../types';
import { StalkerPortalClient } from '../services/StalkerPortalClient';

const FALLBACK_IMAGE = 'https://via.placeholder.com/300x450/1a1a1a/ffffff?text=No+Image';

export default function SeriesDetailScreen({ route }: any) {
  const { series } = route.params as { series: Series };
  const [stalkerClient, setStalkerClient] = useState<StalkerPortalClient | null>(null);
  const [portalUrl, setPortalUrl] = useState<string>('');
  
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<Season | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(false);
  const [playingEpisode, setPlayingEpisode] = useState<{episode: Episode, streamUrl: string, index: number} | null>(null);
  const [isLoadingEpisode, setIsLoadingEpisode] = useState(false);

  useEffect(() => {
    const initClient = async () => {
      try {
        const providerData = await AsyncStorage.getItem('stalker_provider_config');
        if (!providerData) {
          console.error('❌ No provider config found');
          return;
        }
        
        const provider = JSON.parse(providerData);
        const client = new StalkerPortalClient(
          provider.portalUrl,
          provider.macAddress,
          '058357N656529'
        );
        
        if (provider.bearerToken) {
          client.setToken(provider.bearerToken);
        }
        
        setPortalUrl(provider.portalUrl);
        setStalkerClient(client);
      } catch (error) {
        console.error('❌ Failed to init Stalker client:', error);
      }
    };
    
    initClient();
  }, []);

  useEffect(() => {
    if (stalkerClient) {
      loadSeasons();
    }
  }, [stalkerClient, series.id]);

  useEffect(() => {
    if (selectedSeason && stalkerClient) {
      loadEpisodes(selectedSeason);
    }
  }, [selectedSeason, stalkerClient]);

  const loadSeasons = async () => {
    if (!stalkerClient) return;
    
    try {
      setLoading(true);
      console.log('📡 Loading seasons for series:', series.id);
      const seasonsData = await stalkerClient.getSeriesSeasons(series.id);
      
      const seasonsList = seasonsData.map((s: any) => ({
        id: s.id?.toString() || '',
        seriesId: series.id,
        name: s.name || `Season ${s.season_number || ''}`,
        seasonNumber: s.season_number?.toString() || '',
        episodeCount: 0, // Will be updated when episodes load
      }));
      
      console.log('📺 Loaded seasons:', seasonsList.length);
      setSeasons(seasonsList);
      if (seasonsList.length > 0) {
        setSelectedSeason(seasonsList[0]);
      }
    } catch (error) {
      console.error('❌ Error loading seasons:', error);
      Alert.alert('Error', 'Failed to load seasons');
    } finally {
      setLoading(false);
    }
  };

  const loadEpisodes = async (season: Season) => {
    if (!stalkerClient) return;
    
    try {
      setLoading(true);
      console.log('📡 Loading episodes for season:', season.id);
      const episodesData = await stalkerClient.getSeriesEpisodes(series.id, season.id);
      
      const episodesList = episodesData.map((e: any) => ({
        id: e.id?.toString() || '',
        seriesId: series.id,
        name: e.name || `Episode ${e.series_number || ''}`,
        episodeNumber: e.series_number?.toString() || '',
        seasonId: season.id,
        duration: e.time || '',
        description: e.description || '',
        thumbnailUrl: e.screenshot_uri ? `${portalUrl}${e.screenshot_uri}` : series.pic || FALLBACK_IMAGE,
        cmd: '', // Will be fetched during playback
      }));
      
      // Sort episodes in ascending order by episode number
      const sortedEpisodes = episodesList.sort((a, b) => {
        const numA = parseInt(a.episodeNumber) || 0;
        const numB = parseInt(b.episodeNumber) || 0;
        return numA - numB;
      });
      
      console.log('📺 Loaded episodes:', sortedEpisodes.length);
      setEpisodes(sortedEpisodes);
    } catch (error) {
      console.error('❌ Error loading episodes:', error);
      Alert.alert('Error', 'Failed to load episodes');
    } finally {
      setLoading(false);
    }
  };

  const handlePlayPress = () => {
    if (episodes.length > 0) {
      handleEpisodePress(episodes[0], 0);
    }
  };

  const playNextEpisode = () => {
    if (!playingEpisode || playingEpisode.index >= episodes.length - 1) return;
    const nextIndex = playingEpisode.index + 1;
    handleEpisodePress(episodes[nextIndex], nextIndex);
  };

  const playPreviousEpisode = () => {
    if (!playingEpisode || playingEpisode.index <= 0) return;
    const prevIndex = playingEpisode.index - 1;
    handleEpisodePress(episodes[prevIndex], prevIndex);
  };

  const hasNextEpisode = () => {
    return playingEpisode && playingEpisode.index < episodes.length - 1;
  };

  const hasPreviousEpisode = () => {
    return playingEpisode && playingEpisode.index > 0;
  };

  const handleEpisodePress = async (episode: Episode, index?: number) => {
    if (!stalkerClient || isLoadingEpisode) return;
    
    const episodeIndex = index !== undefined ? index : episodes.findIndex(e => e.id === episode.id);
    
    try {
      setIsLoadingEpisode(true);
      console.log('🎬 Play episode:', episode.name, 'Index:', episodeIndex);
      
      // Step 1: Get episode file info
      console.log('📡 Step 1: Getting episode file info...');
      const episodeInfo = await stalkerClient.getEpisodeFileInfo(
        series.id,
        episode.seasonId,
        episode.id
      );
      
      if (!episodeInfo || !episodeInfo.id) {
        console.error('❌ No file info found for episode');
        Alert.alert('Error', 'Failed to get episode file info');
        return;
      }
      
      // Step 2: Get the file ID
      const fileId = episodeInfo.id;
      console.log('🎯 File ID:', fileId);
      
      // Step 3: Construct cmd parameter
      const vodCmd = `/media/file_${fileId}.mpg`;
      console.log('📝 VOD CMD:', vodCmd);
      
      // Step 4: Get stream URL
      console.log('🔗 Step 2: Calling create_link...');
      const linkResponse = await stalkerClient.createLink({
        cmd: vodCmd,
        // Don't send series parameter - it might cause wrong content to be returned
        // series: series.id,
        forced_storage: 'undefined',
        disable_ad: '0',
        download: '0',
      });
      
      console.log('✅ Link response:', linkResponse);
      
      if (linkResponse.cmd) {
        setPlayingEpisode({ episode, streamUrl: linkResponse.cmd, index: episodeIndex });
      } else {
        console.error('❌ No stream URL in response');
        Alert.alert(
          'Playback Error', 
          'Unable to get stream URL for this episode. The content may be unavailable.',
          [{ text: 'OK' }]
        );
      }
    } catch (error: any) {
      console.error('❌ Error playing episode:', error);
      const errorMsg = error.response?.data?.error || error.message || 'Unknown error';
      Alert.alert(
        'Playback Error', 
        `Failed to play episode: ${errorMsg}`,
        [{ text: 'OK' }]
      );
    } finally {
      setIsLoadingEpisode(false);
    }
  };

  const renderEpisode = ({ item, index }: { item: Episode, index: number }) => (
    <TouchableOpacity
      style={styles.episodeCard}
      onPress={() => handleEpisodePress(item, index)}
      activeOpacity={0.7}
    >
      <View style={styles.episodeThumbnail}>
        <Text style={styles.episodeNumber}>E{item.episodeNumber}</Text>
      </View>
      <View style={styles.episodeInfo}>
        <Text style={styles.episodeName} numberOfLines={2}>
          {item.name}
        </Text>
        {item.description && (
          <Text style={styles.episodeDescription} numberOfLines={3}>
            {item.description}
          </Text>
        )}
        {item.duration && (
          <Text style={styles.episodeDuration}>{item.duration} min</Text>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero Image */}
        <View style={styles.heroContainer}>
          <Image
            source={{ uri: (series as any).screenshot_uri ? `${portalUrl}${(series as any).screenshot_uri}` : FALLBACK_IMAGE }}
            style={styles.heroImage}
            resizeMode="cover"
          />
          <View style={styles.heroOverlay} />
        </View>

        {/* Content */}
        <View style={styles.contentContainer}>
          {/* Poster and Info */}
          <View style={styles.topSection}>
            <Image
              source={{ uri: (series as any).screenshot_uri ? `${portalUrl}${(series as any).screenshot_uri}` : FALLBACK_IMAGE }}
              style={styles.poster}
              resizeMode="cover"
            />
            <View style={styles.infoSection}>
              <Text style={styles.title}>{series.name}</Text>
              
              <View style={styles.metaRow}>
                {series.year && (
                  <Text style={styles.metaText}>{series.year}</Text>
                )}
                {series.lastSeason && (
                  <>
                    <Text style={styles.metaDot}>•</Text>
                    <Text style={styles.metaText}>{series.lastSeason} Seasons</Text>
                  </>
                )}
                {series.rating && (
                  <>
                    <Text style={styles.metaDot}>•</Text>
                    <Text style={styles.metaText}>⭐ {series.rating}</Text>
                  </>
                )}
              </View>

              {series.genres && (
                <Text style={styles.genres}>{series.genres}</Text>
              )}

              {/* Action Buttons */}
              <View style={styles.buttonsContainer}>
                <TouchableOpacity
                  style={styles.playButton}
                  onPress={handlePlayPress}
                  activeOpacity={0.8}
                >
                  <Text style={styles.playButtonText}>▶️ Play S1E1</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Description */}
          {series.description && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>About</Text>
              <Text style={styles.description}>{series.description}</Text>
            </View>
          )}

          {/* Season Selector */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Episodes</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.seasonSelector}
            >
              {seasons.map((season) => (
                <TouchableOpacity
                  key={season.id}
                  style={[
                    styles.seasonButton,
                    selectedSeason?.id === season.id && styles.seasonButtonSelected,
                  ]}
                  onPress={() => setSelectedSeason(season)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.seasonButtonText,
                      selectedSeason?.id === season.id && styles.seasonButtonTextSelected,
                    ]}
                  >
                    Season {season.seasonNumber}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Episodes List */}
          {loading ? (
            <LoadingIndicator message="Loading episodes..." />
          ) : (
            <FlatList
              data={episodes}
              renderItem={renderEpisode}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              contentContainerStyle={styles.episodesList}
            />
          )}
        </View>
      </ScrollView>

      {/* Fullscreen Player Modal */}
      {playingEpisode && (
        <Modal
          visible={true}
          animationType="slide"
          onRequestClose={() => setPlayingEpisode(null)}
          statusBarTranslucent={true}
          presentationStyle="fullScreen"
        >
          <VODPlayer
            streamUrl={playingEpisode.streamUrl}
            title={playingEpisode.episode.name}
            onClose={() => setPlayingEpisode(null)}
            onNext={hasNextEpisode() ? playNextEpisode : undefined}
            onPrevious={hasPreviousEpisode() ? playPreviousEpisode : undefined}
            onEnded={hasNextEpisode() ? playNextEpisode : undefined}
          />
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  heroContainer: {
    width: '100%',
    height: IS_TABLET ? 400 : 250,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  contentContainer: {
    marginTop: -50,
    paddingHorizontal: SPACING.md,
  },
  topSection: {
    flexDirection: 'row',
    marginBottom: SPACING.xl,
  },
  poster: {
    width: IS_TABLET ? 180 : 120,
    height: IS_TABLET ? 270 : 180,
    borderRadius: 8,
    backgroundColor: COLORS.cardBackground,
  },
  infoSection: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  title: {
    color: COLORS.text,
    fontSize: IS_TABLET ? FONT_SIZES.xxl : FONT_SIZES.xl,
    fontWeight: 'bold',
    marginBottom: SPACING.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  metaText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.md,
  },
  metaDot: {
    color: COLORS.textMuted,
    marginHorizontal: SPACING.sm,
  },
  genres: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.sm,
    marginBottom: SPACING.md,
  },
  buttonsContainer: {
    marginTop: SPACING.md,
  },
  playButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: IS_TABLET ? SPACING.xl : SPACING.lg,
    paddingVertical: IS_TABLET ? SPACING.md : SPACING.sm,
    borderRadius: 8,
  },
  playButtonText: {
    color: COLORS.text,
    fontSize: FONT_SIZES.md,
    fontWeight: 'bold',
  },
  section: {
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: FONT_SIZES.lg,
    fontWeight: 'bold',
    marginBottom: SPACING.md,
  },
  description: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.md,
    lineHeight: 22,
  },
  seasonSelector: {
    marginBottom: SPACING.md,
  },
  seasonButton: {
    paddingHorizontal: IS_TABLET ? SPACING.lg : SPACING.md,
    paddingVertical: SPACING.sm,
    marginRight: SPACING.sm,
    borderRadius: 20,
    backgroundColor: COLORS.cardBackground,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  seasonButtonSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  seasonButtonText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
  },
  seasonButtonTextSelected: {
    color: COLORS.text,
  },
  episodesList: {
    paddingBottom: SPACING.xxl,
  },
  episodeCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.cardBackground,
    borderRadius: 8,
    marginBottom: SPACING.md,
    overflow: 'hidden',
  },
  episodeThumbnail: {
    width: IS_TABLET ? 160 : 120,
    height: IS_TABLET ? 90 : 68,
    backgroundColor: COLORS.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  episodeNumber: {
    color: COLORS.text,
    fontSize: IS_TABLET ? FONT_SIZES.xxl : FONT_SIZES.xl,
    fontWeight: 'bold',
  },
  episodeInfo: {
    flex: 1,
    padding: SPACING.md,
  },
  episodeName: {
    color: COLORS.text,
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  episodeDescription: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.sm,
    marginBottom: SPACING.xs,
  },
  episodeDuration: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.xs,
  },
});
