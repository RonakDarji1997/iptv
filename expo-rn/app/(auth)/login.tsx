import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  Pressable,
} from 'react-native';
import { useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { useAuthStore } from '@/lib/store';
import { acquireNavLock } from '@/lib/navigation-lock';
import { loginUser } from '@/lib/api-client';

export default function LoginScreen() {
  const router = useRouter();
  const { setUser } = useAuthStore();
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!username || !password) {
      setError('Please enter username and password');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Login with backend API
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:2005';
      console.log(`[Login] Sending login request to ${apiUrl}/api/auth/login for username=${username}`);
      const response = await loginUser(username, password);

      console.log('[Login] Login response received for user:', response.user?.id);

      // Store user and JWT token immediately in the global store
      setUser(response.user, response.token);

      // Run a single provider check here so routing decision happens atomically
      try {
        // Determine provider-check URL and call it
        const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:2005';
        const providersUrl = `${apiUrl}/api/providers?userId=${response.user.id}`;
        console.log(`[Login] Checking providers using GET ${providersUrl}`);
        const providersResp = await fetch(providersUrl, {
          headers: { Authorization: `Bearer ${response.token}` },
        });
        console.log('[Login] providers response status:', providersResp.status);
        const providersData = providersResp.ok ? await providersResp.json() : { providers: [] };
        console.log('[Login] providers response payload:', providersData);
        const hasProviders = Array.isArray(providersData.providers) && providersData.providers.length > 0;

        // persist provider presence in the store for other screens to read
        const { setHasProvider } = useAuthStore.getState();
        setHasProvider(hasProviders);
        console.log('[Login] Provider check result:', hasProviders ? 'HAS_PROVIDER' : 'NO_PROVIDER');
        // navigate to next step (use replace to avoid leaving login on the stack)
        if (acquireNavLock()) {
          if (hasProviders) {
            console.log('[Login] Navigating to: dashboard');
            router.replace('/(tabs)');
          } else {
            console.log('[Login] Navigating to: setup-provider');
            router.replace('/(auth)/setup-provider' as Href);
          }
        }
      } catch (err) {
        console.error('[Login] Provider check failed:', err);
        // If the providers check fails for any reason, fall back to setup-provider
        if (acquireNavLock()) {
          console.log('[Login] Falling back to setup-provider due to error');
          router.replace('/(auth)/setup-provider' as Href);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.formContainer}>
          <Text style={styles.title}>Ronika&apos;s IPTV</Text>
          <Text style={styles.subtitle}>Sign in to continue</Text>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter username"
              placeholderTextColor="#6b7280"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                placeholder="Enter password"
                placeholderTextColor="#6b7280"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={handleLogin}
                returnKeyType="go"
              />
              <Pressable
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Text style={styles.eyeIcon}>{showPassword ? '👁️' : '👁️‍🗨️'}</Text>
              </Pressable>
            </View>
          </View>

          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              loading && styles.buttonDisabled,
            ]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </Pressable>

          <Text style={styles.helpText}>
            Welcome to Ronika&apos;s IPTV
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  formContainer: {
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#a1a1aa',
    marginBottom: 32,
    textAlign: 'center',
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    color: '#fff',
  },
  passwordContainer: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 50,
  },
  eyeButton: {
    position: 'absolute',
    right: 12,
    top: 12,
    padding: 4,
  },
  eyeIcon: {
    fontSize: 20,
  },
  button: {
    backgroundColor: '#ef4444',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  errorContainer: {
    backgroundColor: '#7f1d1d',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 14,
  },
  helpText: {
    color: '#71717a',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 16,
  },
});
