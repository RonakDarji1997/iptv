import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import MoviesScreen from '../screens/MoviesScreen';
import SeriesScreen from '../screens/SeriesScreen';
import LiveTVScreen from '../screens/LiveTVScreen';
import PlayerScreen from '../screens/PlayerScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import {ROUTES} from '../config';
import { authService } from '../services/authService';

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  [ROUTES.HOME]: undefined;
  [ROUTES.MOVIES]: undefined;
  [ROUTES.SERIES]: undefined;
  [ROUTES.LIVE_TV]: undefined;
  [ROUTES.PLAYER]: {
    streamUrl: string;
    title: string;
    type: 'movie' | 'series' | 'live';
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const RootNavigator = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        await authService.initializeAuth();
        const authenticated = authService.isAuthenticated();
        console.log('[RootNav] Auth check result:', authenticated);
        setIsAuthenticated(authenticated);
      } catch (error) {
        console.error('[RootNav] Failed to initialize auth:', error);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  // Listen for auth state changes
  useEffect(() => {
    const checkAuthInterval = setInterval(() => {
      const authenticated = authService.isAuthenticated();
      if (authenticated !== isAuthenticated) {
        console.log('[RootNav] Auth state changed:', authenticated);
        setIsAuthenticated(authenticated);
      }
    }, 500);

    return () => clearInterval(checkAuthInterval);
  }, [isAuthenticated]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          contentStyle: {backgroundColor: '#000'},
        }}>
        {!isAuthenticated ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name={ROUTES.HOME} component={HomeScreen} />
            <Stack.Screen name={ROUTES.MOVIES} component={MoviesScreen} />
            <Stack.Screen name={ROUTES.SERIES} component={SeriesScreen} />
            <Stack.Screen name={ROUTES.LIVE_TV} component={LiveTVScreen} />
            <Stack.Screen name={ROUTES.PLAYER} component={PlayerScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default RootNavigator;
