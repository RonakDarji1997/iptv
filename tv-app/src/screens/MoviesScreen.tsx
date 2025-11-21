import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { TVGrid } from '../components/TVGrid';
import { FocusableCard } from '../components/FocusableCard';
import { ApiClient } from '../lib/api-client';
import { useAuthStore } from '../lib/store';
import { getFullImageUrl } from '../lib/image-utils';

interface MoviesScreenProps {
  navigation?: any;
  onMovieSelect?: (movie: any) => void;
}

export function MoviesScreen({ navigation, onMovieSelect }: MoviesScreenProps) {
  const { macAddress, portalUrl } = useAuthStore();
  const [apiClient] = useState(() => new ApiClient({ mac: macAddress!, url: portalUrl! }));
  
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('*');
  const [movies, setMovies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    if (selectedCategory) {
      loadMovies(1);
    }
  }, [selectedCategory]);

  const loadCategories = async () => {
    try {
      const result = await apiClient.getMovieCategories();
      const allCategories = [{ id: '*', title: 'All Movies' }, ...result.categories];
      setCategories(allCategories);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  const loadMovies = async (pageNum: number) => {
    try {
      setLoading(true);
      const result = await apiClient.getMovies(selectedCategory, pageNum);
      
      // Filter out series - only show actual movies
      const filteredMovies = result.items.data.filter((item: any) => 
        item.is_series !== '1' && item.is_series !== 1
      );
      
      if (pageNum === 1) {
        setMovies(filteredMovies);
      } else {
        setMovies(prev => [...prev, ...filteredMovies]);
      }
      
      setHasMore(result.items.data.length > 0);
      setPage(pageNum);
    } catch (error) {
      console.error('Failed to load movies:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMovieSelect = async (movie: any) => {
    try {
      const movieInfo = await apiClient.getMovieInfo(movie.id);
      const movieData = {
        id: movie.id,
        name: movie.name,
        cmd: movieInfo.cmd,
      };
      
      if (onMovieSelect) {
        onMovieSelect(movieData);
      } else if (navigation) {
        navigation.navigate('Player', {
          id: movie.id,
          title: movie.name,
          type: 'movie',
          cmd: movieInfo.cmd,
        });
      }
    } catch (error) {
      console.error('Failed to get movie info:', error);
    }
  };

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      loadMovies(page + 1);
    }
  };

  if (loading && movies.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ff0000" />
        <Text style={styles.loadingText}>Loading movies...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Movies</Text>
        <Text style={styles.subtitle}>
          {movies.length} movies available
        </Text>
      </View>

      <TVGrid
        data={movies}
        renderItem={(movie, focused, _index) => (
          <FocusableCard
            title={movie.name}
            imageUrl={getFullImageUrl(movie.screenshot_uri || movie.poster)}
            subtitle={movie.year}
            focused={focused}
          />
        )}
        onItemSelect={handleMovieSelect}
        onEndReached={handleLoadMore}
        numColumns={5}
        itemWidth={240}
        itemHeight={320}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    padding: 40,
    paddingBottom: 20,
  },
  title: {
    color: '#ffffff',
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    color: '#999999',
    fontSize: 18,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  loadingText: {
    color: '#ffffff',
    fontSize: 18,
    marginTop: 20,
  },
});
