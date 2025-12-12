import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Provider } from '../types';
import { ProviderService } from '../services/ProviderService';
import { emitSelectedProvidersChange } from '../services/ProviderSelectionEvents';
import { COLORS, SPACING } from '../constants';

export const ProviderSettingsScreen: React.FC = () => {
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
      
      const selectedIds = await ProviderService.getSelectedProviderIds();
      setSelectedProviders(new Set(selectedIds));
    } catch (error) {
      console.error('Error loading providers:', error);
      Alert.alert('Error', 'Failed to load providers');
    } finally {
      setLoading(false);
    }
  };

  const toggleProvider = (providerId: string) => {
    const newSelected = new Set(selectedProviders);
    if (newSelected.has(providerId)) {
      // Don't allow deselecting all providers
      if (newSelected.size > 1) {
        newSelected.delete(providerId);
      } else {
        Alert.alert('Error', 'You must have at least one provider selected');
        return;
      }
    } else {
      newSelected.add(providerId);
    }
    setSelectedProviders(newSelected);
  };

  const selectAll = () => {
    setSelectedProviders(new Set(providers.map((p: Provider) => p.id)));
  };

  const deselectAll = () => {
    // Keep at least one selected
    if (providers.length > 0) {
      setSelectedProviders(new Set([providers[0].id]));
    }
  };

  const handleSave = async () => {
    if (selectedProviders.size === 0) {
      Alert.alert('Error', 'You must select at least one provider');
      return;
    }

    try {
      setSaving(true);
      await ProviderService.saveSelectedProviderIds(Array.from(selectedProviders));
      // Notify listeners in the app to hard-refresh category screens
      try { emitSelectedProvidersChange(Array.from(selectedProviders)); } catch (e) { console.error('Error emitting provider selection change:', e); }
      Alert.alert('Success', 'Provider settings saved successfully', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (error) {
      console.error('Error saving providers:', error);
      Alert.alert('Error', 'Failed to save provider settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading providers...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Provider Settings</Text>
      </View>

          {/*
            Temporarily disabled multi-provider selection actions.
            Keeping the UI here commented so we can re-enable it later.

          <View style={styles.actionsBar}>
            <TouchableOpacity onPress={selectAll} style={styles.actionButton}>
              <Ionicons name="checkbox-outline" size={20} color={COLORS.primary} />
              <Text style={styles.actionText}>Select All</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={deselectAll} style={styles.actionButton}>
              <Ionicons name="square-outline" size={20} color={COLORS.primary} />
              <Text style={styles.actionText}>Deselect All</Text>
            </TouchableOpacity>
          </View>
          */}

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionTitle}>
          Select which providers to show in the app
        </Text>

        {/* Multi-provider list temporarily hidden while we operate in
            single-provider mode. Keep code here commented for future
            re-enablement. */}
        <View style={{ padding: SPACING.lg }}>
          <Text style={{ color: '#8e8e93' }}>Provider selection is temporarily hidden — the app is running in single-provider mode.</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.selectedCount}>
          {selectedProviders.size} of {providers.length} selected
        </Text>
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="save-outline" size={20} color="#fff" />
              <Text style={styles.saveButtonText}>Save Changes</Text>
            </>
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
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    backgroundColor: COLORS.backgroundLight,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  backButton: {
    padding: 8,
    marginRight: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  actionsBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: SPACING.md,
    backgroundColor: COLORS.backgroundLight,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  actionText: {
    color: COLORS.primary,
    fontSize: 16,
    marginLeft: 8,
    fontWeight: '500',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
  },
  sectionTitle: {
    fontSize: 16,
    color: '#8e8e93',
    marginBottom: SPACING.lg,
  },
  providerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundLight,
    padding: SPACING.md,
    borderRadius: 12,
    marginBottom: SPACING.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  providerItemSelected: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(229, 9, 20, 0.08)',
  },
  providerInfo: {
    flex: 1,
    marginRight: SPACING.md,
  },
  providerName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  providerType: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '600',
    marginBottom: 4,
  },
  providerUrl: {
    fontSize: 12,
    color: '#8e8e93',
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#8e8e93',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  footer: {
    padding: SPACING.lg,
    backgroundColor: COLORS.backgroundLight,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  selectedCount: {
    fontSize: 14,
    color: '#8e8e93',
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.md,
    borderRadius: 12,
    gap: 8,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
