import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Provider } from '../types';
import { ProviderService } from '../services/ProviderService';
import { emitSelectedProvidersChange } from '../services/ProviderSelectionEvents';
import { COLORS } from '../constants';

interface ProviderDropdownProps {
  selectedProviderId?: string;
  onProviderSelect: (providerId: string | undefined) => void;
  style?: any;
}

export const ProviderDropdown: React.FC<ProviderDropdownProps> = ({
  selectedProviderId,
  onProviderSelect,
  style,
}) => {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProviders();
  }, []);

  const loadProviders = async () => {
    try {
      // Show all active providers in the dropdown (not only the currently
      // selected providers). Using selectedProviders here caused the
      // dropdown to disappear when only one provider was selected.
      const activeProviders = await ProviderService.getActiveProviders();
      console.log('📱 [ProviderDropdown] Loaded active providers:', activeProviders.map(p => ({ id: p.id, name: p.name, isActive: p.isActive })));
      setProviders(activeProviders);
    } catch (error) {
      console.error('Error loading providers:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectedProvider = providers.find(p => p.id === selectedProviderId);
  console.log('🎯 [ProviderDropdown] Currently selected provider:', selectedProviderId, selectedProvider?.name);

  // TEMPORARY: Force single-provider mode.
  // The full dropdown UI is commented out for now so the app behaves
  // as a single-provider experience. Do not remove — uncomment when
  // multi-provider selection should be re-enabled.

  // if (providers.length <= 1) {
  //   return null;
  // }

  // Derive current provider label
  const providerLabel = selectedProvider ? selectedProvider.name : (providers[0]?.name || 'Provider');

  // Show a non-interactive label instead of the full dropdown while
  // single-provider mode is active.
  return (
    <View style={[styles.container, style]}>
      <View style={styles.selectedContainer}>
        <Ionicons name="tv-outline" size={18} color={COLORS.text} />
        <Text style={styles.selectedText} numberOfLines={1}>{providerLabel}</Text>
      </View>
    </View>
  );

  const handleSelect = async (providerId?: string) => {
    const providerName = providers.find(p => p.id === providerId)?.name || 'All Providers';
    console.log('🔄 [ProviderDropdown] Provider changed to:', providerId, providerName);
    try {
      // Persist the user's choice as the selected provider(s).
      if (providerId) {
        await ProviderService.saveSelectedProviderIds([providerId]);
        emitSelectedProvidersChange([providerId]);
      } else {
        // 'All Providers' selected - save all active provider ids
        const active = await ProviderService.getActiveProviders();
        const ids = active.map(p => p.id);
        await ProviderService.saveSelectedProviderIds(ids);
        emitSelectedProvidersChange(ids);
      }
    } catch (err) {
      console.error('Error saving provider selection:', err);
    }

    onProviderSelect(providerId);
    setShowModal(false);
  };

  // Original dropdown UI commented out above.
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBackground,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 150,
  },
  selectedContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  selectedText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: COLORS.backgroundLight,
    borderRadius: 12,
    width: '80%',
    maxWidth: 400,
    maxHeight: '70%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  closeButton: {
    padding: 4,
  },
  providerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  providerItemSelected: {
    backgroundColor: 'rgba(229, 9, 20, 0.12)',
  },
  providerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  providerName: {
    fontSize: 16,
    color: COLORS.text,
    marginLeft: 12,
  },
  providerNameSelected: {
    color: COLORS.primary,
    fontWeight: '500',
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginLeft: 48,
  },
});
