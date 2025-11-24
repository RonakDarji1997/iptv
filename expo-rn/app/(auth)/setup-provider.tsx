import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useState, useEffect } from 'react';
import { acquireNavLock } from '@/lib/navigation-lock';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/lib/store';
import { generateDeviceMAC } from '@/lib/mac-generator';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

type ProviderType = 'STALKER' | 'M3U' | 'XTREAM';

export default function SetupProviderScreen() {
  const router = useRouter();
  const { user, jwtToken, setHasProvider } = useAuthStore();
  
  const [selectedType, setSelectedType] = useState<ProviderType>('STALKER');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [mac, setMac] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Generate MAC address on mount
  useEffect(() => {
    const generatedMAC = generateDeviceMAC();
    setMac(generatedMAC);
    console.log('[SetupProvider] Generated device MAC:', generatedMAC);
  }, []);

  const providerTypes: { type: ProviderType; label: string; enabled: boolean }[] = [
    { type: 'STALKER', label: 'Stalker Portal', enabled: true },
    { type: 'M3U', label: 'M3U Playlist', enabled: false },
    { type: 'XTREAM', label: 'Xtream Codes', enabled: false },
  ];

  const handleAddProvider = async () => {
    if (!name.trim() || !url.trim()) {
      setError('Provider name and URL are required');
      return;
    }

    if (selectedType === 'STALKER' && !mac.trim()) {
      setError('MAC address is required for Stalker Portal');
      return;
    }

    if (!user || !jwtToken) {
      router.replace('/(auth)/login');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:2005';
      
      // Auto-append /stalker_portal for Stalker providers
      let finalUrl = url.trim();
      if (selectedType === 'STALKER' && !finalUrl.endsWith('/stalker_portal')) {
        // Remove trailing slash if present
        finalUrl = finalUrl.replace(/\/$/, '');
        finalUrl = `${finalUrl}/stalker_portal`;
      }
      
      const response = await fetch(`${apiUrl}/api/providers`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          name: name.trim(),
          type: selectedType,
          url: finalUrl,
          mac: selectedType === 'STALKER' ? mac.trim() : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add provider');
      }

      // Update hasProvider flag in store
      setHasProvider(true);

      // Provider added successfully, go to dashboard (replace to avoid stacking)
      console.log('[SetupProvider] Provider created, navigating to dashboard');
      if (acquireNavLock()) router.replace('/(tabs)');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add provider');
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
        <View style={styles.header}>
          <Text style={styles.title}>Setup IPTV Provider</Text>
          <Text style={styles.subtitle}>Add your IPTV service to get started</Text>
        </View>

        {/* Provider Type Selection */}
        <View style={styles.section}>
          <Text style={styles.label}>Provider Type</Text>
          <View style={styles.typesContainer}>
            {providerTypes.map((type) => (
              <Pressable
                key={type.type}
                style={[
                  styles.typeCard,
                  selectedType === type.type && styles.typeCardActive,
                  !type.enabled && styles.typeCardDisabled,
                ]}
                onPress={() => type.enabled && setSelectedType(type.type)}
                disabled={!type.enabled}
              >
                <Text
                  style={[
                    styles.typeLabel,
                    selectedType === type.type && styles.typeLabelActive,
                    !type.enabled && styles.typeLabelDisabled,
                  ]}
                >
                  {type.label}
                </Text>
                {!type.enabled && (
                  <Text style={styles.comingSoon}>Coming Soon</Text>
                )}
              </Pressable>
            ))}
          </View>
        </View>

        {/* Provider Details Form */}
        <View style={styles.section}>
          <Text style={styles.label}>Provider Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., My IPTV Service"
            placeholderTextColor="#6b7280"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            returnKeyType="next"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Portal URL</Text>
          <TextInput
            style={styles.input}
            placeholder="http://example.com/stalker_portal/"
            placeholderTextColor="#6b7280"
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="next"
          />
        </View>

        {selectedType === 'STALKER' && (
          <View style={styles.section}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>MAC Address</Text>
              <View style={styles.autoGeneratedBadge}>
                <MaterialIcons name="check-circle" size={14} color="#10b981" />
                <Text style={styles.autoGeneratedText}>Auto-generated</Text>
              </View>
            </View>
            <View style={styles.macInputContainer}>
              <TextInput
                style={[styles.input, styles.macInput]}
                placeholder="00:1A:79:XX:XX:XX"
                placeholderTextColor="#6b7280"
                value={mac}
                onChangeText={setMac}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleAddProvider}
              />
              <Pressable
                style={styles.regenerateButton}
                onPress={() => {
                  const newMAC = generateDeviceMAC();
                  setMac(newMAC);
                  console.log('[SetupProvider] Regenerated MAC:', newMAC);
                }}
              >
                <MaterialIcons name="refresh" size={20} color="#3b82f6" />
              </Pressable>
            </View>
            <Text style={styles.helperText}>
              Unique MAC address generated from your device ID
            </Text>
          </View>
        )}

        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleAddProvider}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Add Provider</Text>
          )}
        </Pressable>

        <Pressable
          style={styles.backButton}
          onPress={() => {
            useAuthStore.getState().logout();
            router.replace('/(auth)/login');
          }}
        >
          <Text style={styles.backButtonText}>← Back to Login</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 60,
  },
  header: {
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#9ca3af',
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  typesContainer: {
    gap: 12,
  },
  typeCard: {
    backgroundColor: '#18181b',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#27272a',
    padding: 16,
    alignItems: 'center',
  },
  typeCardActive: {
    borderColor: '#ef4444',
    backgroundColor: '#1f1f23',
  },
  typeCardDisabled: {
    opacity: 0.5,
  },
  typeLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  typeLabelActive: {
    color: '#ef4444',
  },
  typeLabelDisabled: {
    color: '#6b7280',
  },
  comingSoon: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  autoGeneratedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#064e3b',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  autoGeneratedText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#10b981',
  },
  macInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  macInput: {
    flex: 1,
  },
  regenerateButton: {
    backgroundColor: '#1e3a8a',
    borderRadius: 8,
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  helperText: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 6,
  },
  errorContainer: {
    backgroundColor: '#7f1d1d',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 14,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#ef4444',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  backButton: {
    marginTop: 24,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#9ca3af',
    fontSize: 14,
  },
});
