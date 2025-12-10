import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Provider } from '../types';
import { ProviderService } from '../services/ProviderService';

const SELECTED_PROVIDERS_KEY = 'selected_providers';

export const ProviderSelectionScreen: React.FC = () => {
  const navigation = useNavigation();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProviders, setSelectedProviders] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProviders();
  }, []);

  const loadProviders = async () => {
    try {
      const allProviders = await ProviderService.getActiveProviders();
      setProviders(allProviders);
      
      // Load previously selected providers or select all by default
      const savedSelection = await AsyncStorage.getItem(SELECTED_PROVIDERS_KEY);
      if (savedSelection) {
        setSelectedProviders(new Set(JSON.parse(savedSelection)));
      } else {
        // Select all providers by default
        setSelectedProviders(new Set(allProviders.map((p: Provider) => p.id)));
      }
    } catch (error) {
      console.error('Error loading providers:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleProvider = (providerId: string) => {
    const newSelection = new Set(selectedProviders);
    if (newSelection.has(providerId)) {
      newSelection.delete(providerId);
    } else {
      newSelection.add(providerId);
    }
    setSelectedProviders(newSelection);
  };

  const selectAll = () => {
    setSelectedProviders(new Set(providers.map(p => p.id)));
  };

  const deselectAll = () => {
    setSelectedProviders(new Set());
  };

  const handleContinue = async () => {
    if (selectedProviders.size === 0) {
      alert('Please select at least one provider');
      return;
    }

    setSaving(true);
    try {
      await AsyncStorage.setItem(
        SELECTED_PROVIDERS_KEY,
        JSON.stringify(Array.from(selectedProviders))
      );
      
      // Navigate to dashboard
      navigation.reset({
        index: 0,
        routes: [{ name: 'Dashboard' as never }],
      });
    } catch (error) {
      console.error('Error saving provider selection:', error);
      alert('Failed to save selection. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.loadingText}>Loading providers...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Select Providers</Text>
        <Text style={styles.subtitle}>
          Choose which providers you want to see in the app
        </Text>
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity 
          style={styles.actionButton} 
          onPress={selectAll}
        >
          <Text style={styles.actionButtonText}>Select All</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.actionButton} 
          onPress={deselectAll}
        >
          <Text style={styles.actionButtonText}>Deselect All</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.providerList}>
        {providers.map((provider) => {
          const isSelected = selectedProviders.has(provider.id);
          return (
            <TouchableOpacity
              key={provider.id}
              style={[
                styles.providerItem,
                isSelected && styles.providerItemSelected,
              ]}
              onPress={() => toggleProvider(provider.id)}
            >
              <View style={styles.providerInfo}>
                <Text style={styles.providerName}>{provider.name}</Text>
                {provider.type && (
                  <Text style={styles.providerType}>{provider.type.toUpperCase()}</Text>
                )}
                {provider.serverUrl !== 'pending' && (
                  <Text style={styles.providerUrl} numberOfLines={1}>
                    {provider.serverUrl}
                  </Text>
                )}
              </View>
              <View
                style={[
                  styles.checkbox,
                  isSelected && styles.checkboxSelected,
                ]}
              >
                {isSelected && (
                  <Ionicons name="checkmark" size={18} color="#fff" />
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.selectedCount}>
          {selectedProviders.size} of {providers.length} providers selected
        </Text>
        <TouchableOpacity
          style={[
            styles.continueButton,
            (saving || selectedProviders.size === 0) && styles.continueButtonDisabled,
          ]}
          onPress={handleContinue}
          disabled={saving || selectedProviders.size === 0}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.continueButtonText}>Continue</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    marginTop: 16,
    fontSize: 16,
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#111',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
  },
  actionsRow: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#222',
    borderRadius: 8,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  providerList: {
    flex: 1,
    padding: 16,
  },
  providerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  providerItemSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#1a1a2e',
  },
  providerInfo: {
    flex: 1,
  },
  providerName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  providerType: {
    color: '#888',
    fontSize: 12,
    marginBottom: 4,
  },
  providerUrl: {
    color: '#666',
    fontSize: 12,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#444',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  checkboxSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  footer: {
    padding: 20,
    backgroundColor: '#111',
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  selectedCount: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  continueButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  continueButtonDisabled: {
    backgroundColor: '#333',
    opacity: 0.5,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
