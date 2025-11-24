import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { useAuthStore } from '@/lib/store';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(auth)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { isAuthenticated, checkSession, user } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  // Check authentication and navigation flow
  useEffect(() => {
    // Add a small delay to ensure navigator is fully mounted
    const timeout = setTimeout(() => {
      const inAuthGroup = segments[0] === '(auth)';
      const sessionValid = checkSession();
      const isAuthed = isAuthenticated && sessionValid;

      // Not authenticated at all → login
      if (!isAuthed && !inAuthGroup) {
        router.replace('/login');
        return;
      }

      // Authenticated user on setup-provider page → allow them to stay
      const onSetupProvider = segments[0] === '(auth)' && segments[1] === 'setup-provider';
      if (isAuthed && user && inAuthGroup && !onSetupProvider) {
        router.replace('/(tabs)');
        return;
      }
    }, 0);

    return () => clearTimeout(timeout);
  }, [isAuthenticated, segments, user]);

  // Periodic session check every 5 minutes
  useEffect(() => {
    const intervalId = setInterval(() => {
      const sessionValid = checkSession();
      const inAuthGroup = segments[0] === '(auth)';
      
      if (!sessionValid && !inAuthGroup) {
        router.replace('/login');
      }
    }, 5 * 60 * 1000); // Check every 5 minutes

    return () => clearInterval(intervalId);
  }, [segments]);

  return (
    <ThemeProvider value={DarkTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="watch/[id]" options={{ presentation: 'fullScreenModal' }} />
      </Stack>
    </ThemeProvider>
  );
}
