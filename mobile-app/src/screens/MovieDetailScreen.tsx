import React, { useState, useEffect } from 'react';
import { View, ScrollView, Image, Text, TouchableOpacity, StyleSheet, Modal, Alert, ActivityIndicator, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, SPACING, FONT_SIZES, IS_TABLET } from '../constants';
import { VODPlayer } from '../components';
import { StalkerPortalClient, StalkerVodItem } from '../services/StalkerPortalClient';
import { Ionicons } from '@expo/vector-icons';

const FALLBACK_IMAGE = 'https://via.placeholder.com/300x450/1a1a1a/ffffff?text=No+Image';

export default function MovieDetailScreen({ route, navigation }: any) {
  const { movie, portalUrl } = route.params as { movie: StalkerVodItem; portalUrl: string };
  const [stalkerClient, setStalkerClient] = useState<StalkerPortalClient | null>(null);
  const [playingMovie, setPlayingMovie] = useState<{ streamUrl: string } | null>(null);
  const [isLoadingMovie, setIsLoadingMovie] = useState(false);

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
        
        setStalkerClient(client);
      } catch (error) {
        console.error('❌ Failed to init Stalker client:', error);
      }
    };
    
    initClient();
  }, []);

  const handlePlayPress = async () => {
    if (!stalkerClient || isLoadingMovie) return;
    
    try {
      setIsLoadingMovie(true);
      console.log('🎬 Play movie:', movie.name);
      
      const vodInfo = await stalkerClient.getVodInfo(movie.id);
      if (!vodInfo || !vodInfo.id) {
        console.error('❌ No file info found for movie');
        Alert.alert('Error', 'Failed to get movie file info');
        return;
      }
      
      const fileId = vodInfo.id;
      console.log('🎯 File ID:', fileId);
      
      const vodCmd = `/media/file_${fileId}.mpg`;
      console.log('📝 VOD CMD:', vodCmd);
      
      const linkResponse = await stalkerClient.createLink({
        cmd: vodCmd,
        movie: movie.id,
        forced_storage: 'undefined',
        disable_ad: '0',
        download: '0',
      });
      
      console.log('✅ Link response:', linkResponse);
      
      if (linkResponse.cmd) {
        setPlayingMovie({ streamUrl: linkResponse.cmd });
      } else {
        console.error('❌ No stream URL in response');
        Alert.alert(
          'Playback Error',
          'Unable to get stream URL for this movie. The content may be unavailable.',
          [{ text: 'OK' }]
        );
      }
    } catch (error: any) {
      console.error('❌ Error playing movie:', error);
      const errorMsg = error.response?.data?.error || error.message || 'Unknown error';
      Alert.alert(
        'Playback Error',
        `Failed to play movie: ${errorMsg}`,
        [{ text: 'OK' }]
      );
    } finally {
      setIsLoadingMovie(false);
    }
  };

  const imageUrl = movie.screenshot_uri
    ? `${portalUrl}${movie.screenshot_uri}`
    : FALLBACK_IMAGE;

  return (
    <>
      <View style={styles.container}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Hero Image */}
          <View style={styles.heroContainer}>
            <Image
              source={{ uri: imageUrl }}
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
                source={{ uri: imageUrl }}
                style={styles.poster}
                resizeMode="cover"
              />
              <View style={styles.infoSection}>
                <Text style={styles.title}>{movie.name}</Text>
                
                {(movie.year || (movie.rating_imdb && movie.rating_imdb > 0)) && (
                  <View style={styles.metaRow}>
                    {movie.year && (
                      <Text style={styles.metaText}>{movie.year?.toString() || ''}</Text>
                    )}
                    {movie.rating_imdb && movie.rating_imdb > 0 && (
                      <>
                        <Text style={styles.metaDot}>•</Text>
                        <Text style={styles.metaText}>⭐ {movie.rating_imdb.toFixed(1)}</Text>
                      </>
                    )}
                  </View>
                )}

                {movie.genres_str && (
                  <Text style={styles.genres}>{movie.genres_str}</Text>
                )}

                {/* Action Buttons */}
                <View style={styles.buttonsContainer}>
                  <TouchableOpacity
                    style={styles.playButton}
                    onPress={handlePlayPress}
                    activeOpacity={0.8}
                    disabled={isLoadingMovie}
                  >
                    {isLoadingMovie ? (
                      <ActivityIndicator size="small" color={COLORS.text} />
                    ) : (
                      <View style={styles.playButtonContent}>
                        <Ionicons name="play" size={20} color={COLORS.text} />
                        <Text style={styles.playButtonText}>Play</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Description */}
            {movie.description && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>About</Text>
                <Text style={styles.description}>{movie.description}</Text>
              </View>
            )}

            {/* Cast and Crew */}
            {(movie.actors || movie.director) && (
              <View style={styles.section}>
                {movie.actors && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Cast:</Text>
                    <Text style={styles.detailValue}>{movie.actors}</Text>
                  </View>
                )}
                {movie.director && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Director:</Text>
                    <Text style={styles.detailValue}>{movie.director}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </ScrollView>
      </View>

      {/* Fullscreen Player Modal */}
      {playingMovie && (
        Platform.OS === 'web' ? (
          <View style={StyleSheet.absoluteFillObject}>
            <VODPlayer
              streamUrl={playingMovie.streamUrl}
              title={movie.name}
              onClose={() => setPlayingMovie(null)}
            />
          </View>
        ) : (
          <Modal
            visible={true}
            animationType="slide"
            onRequestClose={() => setPlayingMovie(null)}
            statusBarTranslucent={true}
            presentationStyle="fullScreen"
          >
            <VODPlayer
              streamUrl={playingMovie.streamUrl}
              title={movie.name}
              onClose={() => setPlayingMovie(null)}
            />
          </Modal>
        )
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: SPACING.md,
    zIndex: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
    padding: SPACING.sm,
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
    flexDirection: 'row',
    marginTop: SPACING.md,
  },
  playButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: IS_TABLET ? SPACING.xl : SPACING.lg,
    paddingVertical: IS_TABLET ? SPACING.md : SPACING.sm,
    borderRadius: 8,
    marginRight: SPACING.sm,
    minWidth: 120,
  },
  playButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  playButtonText: {
    color: COLORS.text,
    fontSize: FONT_SIZES.md,
    fontWeight: 'bold',
  },
  favoriteButton: {
    backgroundColor: COLORS.cardBackground,
    paddingHorizontal: IS_TABLET ? SPACING.lg : SPACING.md,
    paddingVertical: IS_TABLET ? SPACING.md : SPACING.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  favoriteButtonText: {
    color: COLORS.text,
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
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
  detailRow: {
    flexDirection: 'row',
    marginBottom: SPACING.sm,
  },
  detailLabel: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    width: IS_TABLET ? 100 : 80,
  },
  detailValue: {
    flex: 1,
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.md,
  },
});
