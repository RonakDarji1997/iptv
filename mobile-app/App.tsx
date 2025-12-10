import React, { useEffect, useState } from 'react';
import { View, Platform, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from './src/constants';
import { Database } from './src/database/Database';

// Import screens
import LiveTVScreen from './src/screens/LiveTVScreen';
import MoviesScreen from './src/screens/MoviesScreen';
import SeriesScreen from './src/screens/SeriesScreen';
import SearchScreen from './src/screens/SearchScreen';
import MovieDetailScreen from './src/screens/MovieDetailScreen';
import SeriesDetailScreen from './src/screens/SeriesDetailScreen';
import LoginScreen from './src/screens/LoginScreen';
import { ProviderSelectionScreen } from './src/screens/ProviderSelectionScreen';
import { ProviderSettingsScreen } from './src/screens/ProviderSettingsScreen';
import { ProviderService } from './src/services/ProviderService';

// Tab icon component with proper icons
const TabIcon = ({ name, focused, size = 24 }: { name: string; focused: boolean; size?: number }) => {
  const iconMap: Record<string, { focused: any; unfocused: any }> = {
    Live: { focused: 'tv', unfocused: 'tv-outline' },
    Movies: { focused: 'film', unfocused: 'film-outline' },
    Series: { focused: 'play-circle', unfocused: 'play-circle-outline' },
    Search: { focused: 'search', unfocused: 'search-outline' },
    Settings: { focused: 'settings', unfocused: 'settings-outline' },
  };

  const iconName = iconMap[name] ? (focused ? iconMap[name].focused : iconMap[name].unfocused) : 'apps';
  const color = focused ? COLORS.primary : COLORS.textMuted;

  return <Ionicons name={iconName} size={size} color={color} />;
};

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function TabNavigator({ onLogout }: { onLogout: () => void }) {
  const bottomInset = Platform.OS === 'ios' ? 20 : 10; // Safe area for home indicator
  
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, size }) => <TabIcon name={route.name} focused={focused} size={size} />,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarStyle: {
          backgroundColor: COLORS.backgroundLight,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 85 : 65,
          paddingBottom: bottomInset,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginBottom: 2,
        },
        headerStyle: {
          backgroundColor: COLORS.background,
          borderBottomColor: COLORS.border,
          borderBottomWidth: 1,
        },
        headerTintColor: COLORS.text,
        headerTitleStyle: {
          fontWeight: '700',
          fontSize: 20,
        },
        headerRight: () => (
          <TouchableOpacity
            onPress={onLogout}
            style={{ marginRight: 16 }}
          >
            <Ionicons name="log-out-outline" size={24} color={COLORS.primary} />
          </TouchableOpacity>
        ),
      })}
    >
      <Tab.Screen 
        name="Live" 
        component={LiveTVScreen}
        options={{ title: 'Live TV' }}
      />
      <Tab.Screen 
        name="Movies" 
        component={MoviesScreen}
      />
      <Tab.Screen 
        name="Series" 
        component={SeriesScreen}
        options={{ title: 'TV Shows' }}
      />
      <Tab.Screen 
        name="Search" 
        component={SearchScreen}
      />
      <Tab.Screen 
        name="Settings" 
        component={ProviderSettingsScreen}
        options={{ title: 'Settings' }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [needsProviderSelection, setNeedsProviderSelection] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    
    const initializeApp = async () => {
      try {
        if (!isMounted) return;
        
        console.log('🚀 Initializing database...');
        await Database.init();
        
        console.log('🔐 Checking authentication...');
        const AuthManagerModule = await import('./src/services/AuthManager');
        const AuthManager = AuthManagerModule.AuthManager;
        
        const authenticated = await AuthManager.ensureAuthenticated();
        
        if (isMounted) {
          setIsAuthenticated(authenticated);
          setIsInitialized(true);
        }
        
        // Only sync if authenticated
        if (authenticated) {
          console.log('📡 Setting up Stalker portal from backend sync...');
          const StalkerSyncServiceModule = await import('./src/services/StalkerSyncService');
          const StalkerSyncService = StalkerSyncServiceModule.StalkerSyncService;
          
          // Initialize provider from backend sync (gets token, mac, portal URL)
          console.log('🔄 Fetching provider config from backend...');
          const providerInitialized = await StalkerSyncService.initializeFromBackend();
          
          if (!providerInitialized) {
            console.warn('⚠️ No provider data found for this user');
            setSyncError('No provider configured. Please contact support.');
            return;
          }
          
          console.log('🔄 Syncing categories from backend...');
          const CategoryRepositoryModule = await import('./src/repositories/CategoryRepository');
          const CategoryRepository = CategoryRepositoryModule.CategoryRepository;
          const syncSuccess = await CategoryRepository.syncFromBackend(true);
          
          if (!syncSuccess) {
            setSyncError('Failed to sync categories from backend');
          }
          
          // Check if we have multiple providers and need to show selection screen
          console.log('🔍 Checking for multiple providers...');
          const hasMultiple = await ProviderService.hasMultipleProviders();
          if (hasMultiple && isMounted) {
            setNeedsProviderSelection(true);
          }
        }
      } catch (error) {
        console.error('❌ App initialization failed:', error);
        if (isMounted) {
          setSyncError('App initialization failed');
          setIsInitialized(true);
        }
      }
    };

    initializeApp();
    
    return () => {
      isMounted = false;
    };
  }, []);

  const handleLogout = async () => {
    try {
      console.log('🚪 Logging out...');
      const AuthManagerModule = await import('./src/services/AuthManager');
      const AuthManager = AuthManagerModule.AuthManager;
      
      await AuthManager.logout();
      setIsAuthenticated(false);
      console.log('✅ Logged out successfully');
    } catch (error) {
      console.error('❌ Logout failed:', error);
    }
  };

  const handleLoginSuccess = async () => {
    setIsAuthenticated(true);
    
    // Initialize and sync after login
    try {
      console.log('📡 Setting up Stalker portal from backend sync...');
      const StalkerSyncServiceModule = await import('./src/services/StalkerSyncService');
      const StalkerSyncService = StalkerSyncServiceModule.StalkerSyncService;
      
      console.log('🔄 Fetching provider config from backend...');
      const providerInitialized = await StalkerSyncService.initializeFromBackend();
      
      if (!providerInitialized) {
        console.warn('⚠️ No provider data found for this user');
        setSyncError('No provider configured. Please contact support.');
        return;
      }
      
      console.log('🔄 Syncing categories from Stalker portal...');
      const syncSuccess = await StalkerSyncService.syncCategories(true);
      
      if (!syncSuccess) {
        setSyncError('Failed to sync categories from portal');
      }
      
      // Check if we have multiple providers and need to show selection screen
      console.log('🔍 Checking for multiple providers...');
      const hasMultiple = await ProviderService.hasMultipleProviders();
      if (hasMultiple) {
        setNeedsProviderSelection(true);
      }
    } catch (error) {
      console.error('❌ Post-login sync failed:', error);
      setSyncError('Failed to sync data');
    }
  };

  if (!isInitialized) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={{ color: COLORS.text, marginTop: 16, fontSize: 16 }}>
          Initializing app...
        </Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  if (syncError) {
    console.warn('⚠️ Running with sync error:', syncError);
    // Continue to show app even with sync error - will use existing data or show empty states
  }

  return (
    <>
      <StatusBar style="light" />
      <NavigationContainer>
        <Stack.Navigator
          screenOptions={{
            headerStyle: {
              backgroundColor: COLORS.background,
            },
            headerTintColor: COLORS.text,
            headerTitleStyle: {
              fontWeight: '700',
            },
            headerBackTitle: 'Back',
          }}
          initialRouteName={needsProviderSelection ? 'ProviderSelection' : 'Main'}
        >
          {needsProviderSelection && (
            <Stack.Screen 
              name="ProviderSelection" 
              component={ProviderSelectionScreen}
              options={{ 
                headerShown: false,
                gestureEnabled: false,
              }}
              listeners={{
                focus: () => {
                  // Once provider selection is done, mark as no longer needed
                  setNeedsProviderSelection(false);
                }
              }}
            />
          )}
          <Stack.Screen 
            name="Main" 
            options={{ headerShown: false }}
          >
            {(props) => <TabNavigator {...props} onLogout={handleLogout} />}
          </Stack.Screen>
          <Stack.Screen 
            name="MovieDetail" 
            component={MovieDetailScreen}
            options={{ title: 'Movie Details' }}
          />
          <Stack.Screen 
            name="SeriesDetail" 
            component={SeriesDetailScreen}
            options={{ title: 'Series Details' }}
          />
          <Stack.Screen 
            name="ProviderSettings" 
            component={ProviderSettingsScreen}
            options={{ 
              headerShown: false,
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}
