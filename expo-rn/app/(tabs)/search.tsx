import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  FlatList,
  useWindowDimensions,
} from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/lib/store';
import { ApiClient } from '@/lib/api-client';
import ContentCard from '@/components/ContentCard';

export default function SearchScreen() {
  const router = useRouter();
  const { portalUrl, macAddress } = useAuthStore();
  const { width: screenWidth } = useWindowDimensions();

  // Calculate card size based on screen width - responsive columns with vertical posters
  const getNumColumns = () => {
    if (screenWidth < 480) return 2; // Small phones
    if (screenWidth < 768) return 3; // Phones
    if (screenWidth < 1024) return 4; // Tablets
    if (screenWidth < 1440) return 5; // Small desktops
    if (screenWidth < 1920) return 6; // Medium desktops
    return 7; // Large screens
  };
  
  const numColumns = getNumColumns();
  const gap = 16;
  const totalPadding = 32; // 16px padding on each side
  const totalGaps = (numColumns - 1) * gap; // gaps between cards
  const availableWidth = screenWidth - totalPadding - totalGaps;
  const cardWidth = Math.floor(availableWidth / numColumns);
  const cardHeight = Math.floor(cardWidth * 1.5); // 2:3 aspect ratio for vertical posters

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async (searchQuery: string) => {
    setQuery(searchQuery);
    
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setLoading(false);
      return;
    }
    
    // Only search if query is at least 2 characters
    if (searchQuery.trim().length < 2) {
      return;
    }
    
    if (!portalUrl || !macAddress) {
      setError('Not authenticated');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const client = new ApiClient({ url: portalUrl, mac: macAddress });
      const { data } = await client.searchContent(searchQuery, 1);
      
      setSearchResults(data);
    } catch (err) {
      console.error('Search error:', err);
      setError(err instanceof Error ? err.message : 'Failed to search');
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleContentPress = (item: any) => {
    // Determine if it's a series or movie based on is_series flag or genres
    const isSeries = item.is_series === '1' || item.genres_str?.includes('SERIES');
    
    if (isSeries) {
      router.push({
        pathname: '/series/[id]',
        params: {
          id: item.id,
          title: item.name,
          screenshot: item.screenshot_uri || item.screenshot,
          description: item.description || '',
          actors: item.actors || '',
          year: item.year || '',
          country: item.country || '',
          genres: item.genres_str || '',
          totalFiles: item.has_files || '',
        },
      });
    } else {
      router.push({
        pathname: '/watch/[id]',
        params: {
          id: item.id,
          type: 'vod',
          title: item.name,
        },
      });
    }
  };

  const handleClear = () => {
    setQuery('');
    setSearchResults([]);
    setError('');
  };

  return (
    <View style={styles.container}>
      {/* Search Input */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={handleSearch}
            placeholder="Search movies and series..."
            placeholderTextColor="#71717a"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={handleClear} style={styles.clearButton}>
              <Text style={styles.clearIcon}>✕</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Results or Empty State */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#ef4444" />
          <Text style={styles.loadingText}>Searching...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : query.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyIcon}>🔍</Text>
          <Text style={styles.emptyTitle}>Search for Movies & Series</Text>
          <Text style={styles.emptyText}>
            Enter at least 2 characters to start searching
          </Text>
        </View>
      ) : query.length < 2 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>
            Type at least 2 characters...
          </Text>
        </View>
      ) : searchResults.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyIcon}>😔</Text>
          <Text style={styles.emptyTitle}>No Results Found</Text>
          <Text style={styles.emptyText}>
            Try searching with different keywords
          </Text>
        </View>
      ) : (
        <View style={styles.resultsContainer}>
          <Text style={styles.resultsCount}>
            Found {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
          </Text>
          <FlatList
            data={searchResults}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={styles.gridContainer}
            renderItem={({ item }) => (
              <ContentCard
                item={item}
                onPress={() => handleContentPress(item)}
                contentType={item.is_series === '1' || item.genres_str?.includes('SERIES') ? 'series' : 'vod'}
                portalUrl={portalUrl || undefined}
                width={cardWidth}
                height={cardHeight}
              />
            )}
          />
        </View>
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
  searchIcon: {
    fontSize: 20,
    marginRight: 8,
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
  clearIcon: {
    color: '#71717a',
    fontSize: 20,
  },
  centerContainer: {
    flex: 1,
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
    fontSize: 16,
    textAlign: 'center',
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
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
    fontSize: 14,
    fontWeight: '500',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  gridContainer: {
    padding: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'flex-start',
  },
});
