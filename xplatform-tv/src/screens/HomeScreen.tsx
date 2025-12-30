import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  Platform,
  Alert,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/RootNavigator';
import {ContentRow} from '../components/ContentRow';
import {Focusable} from '../components/Focusable';
import {contentService, Category, ContentItem} from '../services/contentService';
import {authService} from '../services/authService';
import {ROUTES} from '../config';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface CategoryWithContent extends Category {
  items: ContentItem[];
  loading: boolean;
}

const HomeScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<CategoryWithContent[]>([]);
  const [selectedMenu, setSelectedMenu] = useState(0);

  useEffect(() => {
    console.log('Platform.isTV:', Platform.isTV);
    console.log('Platform.OS:', Platform.OS);
  }, []);

  const menuItems = [
    {title: 'Home', route: ROUTES.HOME},
    {title: 'Movies', route: ROUTES.MOVIES},
    {title: 'Series', route: ROUTES.SERIES},
    {title: 'Live TV', route: ROUTES.LIVE_TV},
    {title: 'Logout', route: 'LOGOUT' as any},
  ];

  useEffect(() => {
    loadContent();
  }, []);

  const loadContent = async () => {
    try {
      setLoading(true);

      // Load movie categories for home screen
      const movieCats = await contentService.getCategories('MOVIE');
      const seriesCats = await contentService.getCategories('SERIES');

      // Take first 3 categories from each
      const selectedCats = [
        ...movieCats.slice(0, 2),
        ...seriesCats.slice(0, 2),
      ];

      const catsWithContent: CategoryWithContent[] = selectedCats.map(cat => ({
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
      console.error('Error loading home content:', error);
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
            ? {...cat, items: result.items.slice(0, 10), loading: false}
            : cat,
        ),
      );
    } catch (error) {
      console.error(`Error loading category ${categoryId}:`, error);
    }
  };

  const handleItemPress = (item: ContentItem) => {
    console.log('Item pressed:', item.name);
    // Navigate to player or detail screen
    // For now, just log
  };

  const handleMenuPress = async (index: number) => {
    setSelectedMenu(index);
    const route = menuItems[index].route;
    
    if (route === 'LOGOUT') {
      Alert.alert(
        'Logout',
        'Are you sure you want to logout?',
        [
          {text: 'Cancel', style: 'cancel'},
          {
            text: 'Logout',
            onPress: async () => {
              await authService.logout();
              // Navigation will automatically update due to auth state listener
            },
          },
        ],
      );
    } else if (route !== ROUTES.HOME) {
      navigation.navigate(route as any);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>Loading content...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Menu */}
      <View style={styles.menuContainer}>
        <Text style={styles.logo}>IPTV</Text>
        <View style={styles.menuItems}>
          {menuItems.map((item, index) => (
            <Focusable
              key={index}
              onPress={() => handleMenuPress(index)}
              style={[
                styles.menuItem,
                selectedMenu === index && styles.menuItemSelected,
              ]}
              hasTVPreferredFocus={index === 0}>
              <Text
                style={[
                  styles.menuText,
                  selectedMenu === index && styles.menuTextSelected,
                ]}>
                {item.title}
              </Text>
            </Focusable>
          ))}
        </View>
      </View>

      {/* Content Rows */}
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
  menuContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 48,
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  logo: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '700',
    marginRight: 48,
  },
  menuItems: {
    flexDirection: 'row',
    flex: 1,
  },
  menuItem: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginRight: 8,
    borderRadius: 6,
  },
  menuItemSelected: {
    backgroundColor: '#fff',
  },
  menuText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  menuTextSelected: {
    color: '#000',
  },
  contentContainer: {
    paddingTop: 32,
    paddingBottom: 48,
  },
});

export default HomeScreen;
