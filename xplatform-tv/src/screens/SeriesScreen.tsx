import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {ContentRow} from '../components/ContentRow';
import {contentService, Category, ContentItem} from '../services/contentService';

interface CategoryWithContent extends Category {
  items: ContentItem[];
  loading: boolean;
}

const SeriesScreen = () => {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<CategoryWithContent[]>([]);

  useEffect(() => {
    loadSeries();
  }, []);

  const loadSeries = async () => {
    try {
      setLoading(true);
      const cats = await contentService.getCategories('SERIES');

      const catsWithContent: CategoryWithContent[] = cats.map(cat => ({
        ...cat,
        items: [],
        loading: false,
      }));

      setCategories(catsWithContent);

      // Load content for each category
      for (const cat of catsWithContent) {
        loadCategoryContent(cat.category_id);
      }
    } catch (error) {
      console.error('Error loading series:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCategoryContent = async (categoryId: string) => {
    try {
      const result = await contentService.getVODContent(categoryId, 1);

      setCategories(prev =>
        prev.map(cat =>
          cat.category_id === categoryId
            ? {...cat, items: result.items, loading: false}
            : cat,
        ),
      );
    } catch (error) {
      console.error(`Error loading category ${categoryId}:`, error);
    }
  };

  const handleItemPress = async (item: ContentItem) => {
    console.log('Series pressed:', item.name);
    // Get series info and navigate to detail screen
    if (item.id) {
      const seriesInfo = await contentService.getSeriesInfo(item.id);
      console.log('Series info:', seriesInfo);
      // Navigate to series detail screen
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>Loading series...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>TV Series</Text>
      </View>

      <FlatList
        data={categories}
        keyExtractor={item => item.id}
        renderItem={({item}) => (
          <ContentRow
            title={item.name}
            items={item.items}
            onItemPress={handleItemPress}
          />
        )}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    fontSize: 18,
    marginTop: 16,
  },
  header: {
    paddingHorizontal: 48,
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  title: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '700',
  },
  contentContainer: {
    paddingTop: 32,
    paddingBottom: 48,
  },
});

export default SeriesScreen;
