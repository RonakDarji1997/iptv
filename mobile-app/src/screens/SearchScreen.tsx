import React, { useState, useEffect } from 'react';
import { View, TextInput, FlatList, StyleSheet, Text, TouchableOpacity, Image, Dimensions } from 'react-native';
import { COLORS, SPACING, FONT_SIZES } from '../constants';
import { LoadingIndicator, EmptyState } from '../components';
import { StalkerPortalClient, StalkerVodItem } from '../services/StalkerPortalClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { debounce } from '../utils';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - SPACING.lg * 4) / 3;
const FALLBACK_IMAGE = 'https://via.placeholder.com/300x450/1a1a1a/ffffff?text=No+Image';

export default function SearchScreen({ navigation }: any) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StalkerVodItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [stalkerClient, setStalkerClient] = useState<StalkerPortalClient | null>(null);
  const [portalUrl, setPortalUrl] = useState<string>('');

  useEffect(() => {
    initStalkerClient();
  }, []);

  const initStalkerClient = async () => {
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
      console.error('❌ Error initializing Stalker client:', error);
    }
  };

  const performSearch = debounce(async (searchQuery: string) => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setResults([]);
      return;
    }

    if (!stalkerClient) {
      console.log('⏳ Stalker client not ready yet');
      return;
    }

    setLoading(true);
    
    try {
      console.log(`🔍 Searching for: "${searchQuery}"`);
      const response = await stalkerClient.searchVod(searchQuery);
      console.log(`✅ Found ${response.items.length} results`);
      setResults(response.items);
    } catch (error) {
      console.error('❌ Search error:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, 500);

  const handleTextChange = (text: string) => {
    setQuery(text);
    performSearch(text);
  };

  const handleResultPress = (item: StalkerVodItem) => {
    const isSeries = item.is_series === '1' || (item.is_series as any) === 1;
    
    if (isSeries) {
      navigation.navigate('SeriesDetail', { 
        series: item,
        portalUrl 
      });
    } else {
      navigation.navigate('MovieDetail', { 
        movie: item,
        portalUrl 
      });
    }
  };

  const renderItem = ({ item }: { item: StalkerVodItem }) => {
    const imageUrl = item.screenshot_uri
      ? `${portalUrl}${item.screenshot_uri}`
      : FALLBACK_IMAGE;
    
    const isSeries = item.is_series === '1' || (item.is_series as any) === 1;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => handleResultPress(item)}
        activeOpacity={0.7}
      >
        <Image
          source={{ uri: imageUrl }}
          style={styles.cardImage}
          resizeMode="cover"
        />
        <View style={styles.typeBadge}>
          <Text style={styles.typeText}>{isSeries ? 'SERIES' : 'MOVIE'}</Text>
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.name || 'Untitled'}
          </Text>
          {item.year && (
            <Text style={styles.cardYear}>{String(item.year)}</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search movies, series, channels..."
          placeholderTextColor={COLORS.textMuted}
          value={query}
          onChangeText={handleTextChange}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
      </View>

      {loading ? (
        <LoadingIndicator message="Searching..." />
      ) : query && results.length === 0 ? (
        <EmptyState message="No results found" icon="🔍" />
      ) : !query ? (
        <EmptyState message="Type at least 2 characters to search" icon="🔍" />
      ) : (
        <FlatList
          data={results}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.resultsGrid}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  searchContainer: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.backgroundLight,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  searchInput: {
    backgroundColor: COLORS.cardBackground,
    color: COLORS.text,
    fontSize: FONT_SIZES.md,
    padding: SPACING.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  resultsGrid: {
    padding: SPACING.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  card: {
    width: CARD_WIDTH,
    margin: SPACING.sm,
    minWidth: 100,
  },
  cardImage: {
    width: '100%',
    height: CARD_WIDTH * 1.5,
    borderRadius: 8,
    backgroundColor: COLORS.backgroundLight,
  },
  cardInfo: {
    marginTop: SPACING.sm,
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardYear: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  typeBadge: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 4,
  },
  typeText: {
    color: COLORS.text,
    fontSize: 10,
    fontWeight: 'bold',
  },
});
