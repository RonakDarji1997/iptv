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
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/lib/store';
import { StalkerClient } from '@/lib/stalker-client';

export default function LoginScreen() {
  const router = useRouter();
  const { setCredentials, setSession } = useAuthStore();
  
  const [macAddress, setMacAddress] = useState('00:1A:79:17:F4:F5');
  const [portalUrl, setPortalUrl] = useState('http://tv.stream4k.cc/stalker_portal/');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!macAddress || !portalUrl) {
      setError('Please enter MAC address and Portal URL');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Store credentials
      setCredentials(macAddress, portalUrl);

      // Test connection
      const client = new StalkerClient({ mac: macAddress, url: portalUrl });
      // No handshake needed - auth handled by bearer/adid

      // Store session
      setSession('token', Date.now() + 24 * 60 * 60 * 1000);

      // Navigate to home
      router.replace('/(tabs)');
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
          <Text style={styles.title}>IPTV Player</Text>
          <Text style={styles.subtitle}>Sign in to your portal</Text>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>MAC Address</Text>
            <TextInput
              style={styles.input}
              placeholder="00:1A:79:XX:XX:XX"
              placeholderTextColor="#6b7280"
              value={macAddress}
              onChangeText={setMacAddress}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Portal URL</Text>
            <TextInput
              style={styles.input}
              placeholder="http://example.com/stalker_portal/"
              placeholderTextColor="#6b7280"
              value={portalUrl}
              onChangeText={setPortalUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
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
            Enter your IPTV provider's MAC address and portal URL
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
