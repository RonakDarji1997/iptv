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

interface SeriesScreenProps {
  navigation?: any;
  onSeriesSelect?: (series: any) => void;
}

export function SeriesScreen({ navigation, onSeriesSelect }: SeriesScreenProps) {
  const { macAddress, portalUrl } = useAuthStore();
  const [apiClient] = useState(() => new ApiClient({ mac: macAddress!, url: portalUrl! }));
  
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('*');
  const [series, setSeries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    if (selectedCategory) {
      loadSeries(1);
    }
  }, [selectedCategory]);

  const loadCategories = async () => {
    try {
      const result = await apiClient.getSeriesCategories();
      const allCategories = [{ id: '*', title: 'All Series' }, ...result.categories];
      setCategories(allCategories);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  const loadSeries = async (pageNum: number) => {
    try {
      setLoading(true);
      const result = await apiClient.getSeries(selectedCategory, pageNum);
      
      // Filter to only show series
      const filteredSeries = result.items.data.filter((item: any) => 
        item.is_series === '1' || item.is_series === 1
      );
      
      if (pageNum === 1) {
        setSeries(filteredSeries);
      } else {
        setSeries(prev => [...prev, ...filteredSeries]);
      }
      
      setHasMore(result.items.data.length > 0);
      setPage(pageNum);
    } catch (error) {
      console.error('Failed to load series:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSeriesSelect = (item: any) => {
    if (onSeriesSelect) {
      onSeriesSelect(item);
    } else if (navigation) {
      navigation.navigate('SeriesDetails', {
        seriesId: item.id,
        seriesName: item.name,
      });
    }
  };

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      loadSeries(page + 1);
    }
  };

  if (loading && series.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ff0000" />
        <Text style={styles.loadingText}>Loading series...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>TV Series</Text>
        <Text style={styles.subtitle}>
          {series.length} series available
        </Text>
      </View>

      <TVGrid
        data={series}
        renderItem={(item, focused, _index) => (
          <FocusableCard
            title={item.name}
            imageUrl={getFullImageUrl(item.screenshot_uri || item.poster)}
            subtitle={item.year}
            focused={focused}
          />
        )}
        onItemSelect={handleSeriesSelect}
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
