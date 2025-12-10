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
      const selectedProviders = await ProviderService.getSelectedProviders();
      console.log('📱 [ProviderDropdown] Loaded providers:', selectedProviders.map(p => ({ id: p.id, name: p.name, isActive: p.isActive })));
      setProviders(selectedProviders);
    } catch (error) {
      console.error('Error loading providers:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectedProvider = providers.find(p => p.id === selectedProviderId);
  console.log('🎯 [ProviderDropdown] Currently selected provider:', selectedProviderId, selectedProvider?.name);

  // Don't show dropdown if only one provider
  if (providers.length <= 1) {
    return null;
  }

  const handleSelect = (providerId?: string) => {
    const providerName = providers.find(p => p.id === providerId)?.name || 'All Providers';
    console.log('🔄 [ProviderDropdown] Provider changed to:', providerId, providerName);
    onProviderSelect(providerId);
    setShowModal(false);
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.container, style]}
        onPress={() => setShowModal(true)}
        activeOpacity={0.7}
      >
        <View style={styles.selectedContainer}>
          <Ionicons name="tv-outline" size={18} color="#fff" />
          <Text style={styles.selectedText} numberOfLines={1}>
            {selectedProvider ? selectedProvider.name : 'All Providers'}
          </Text>
        </View>
        <Ionicons name="chevron-down" size={20} color="#fff" />
      </TouchableOpacity>

      <Modal
        visible={showModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowModal(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Provider</Text>
              <TouchableOpacity
                onPress={() => setShowModal(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={[{ id: undefined, name: 'All Providers' }, ...providers]}
              keyExtractor={(item) => item.id || 'all'}
              renderItem={({ item }) => {
                const isSelected = item.id === selectedProviderId || (!item.id && !selectedProviderId);
                return (
                  <TouchableOpacity
                    style={[
                      styles.providerItem,
                      isSelected && styles.providerItemSelected,
                    ]}
                    onPress={() => handleSelect(item.id)}
                  >
                    <View style={styles.providerInfo}>
                      <Ionicons 
                        name={item.id ? "tv" : "apps"} 
                        size={20} 
                        color={isSelected ? "#0a84ff" : "#8e8e93"} 
                      />
                      <Text style={[
                        styles.providerName,
                        isSelected && styles.providerNameSelected,
                      ]}>
                        {item.name}
                      </Text>
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark" size={24} color="#0a84ff" />
                    )}
                  </TouchableOpacity>
                );
              }}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
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
    backgroundColor: '#1c1c1e',
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
    backgroundColor: 'rgba(10, 132, 255, 0.15)',
  },
  providerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  providerName: {
    fontSize: 16,
    color: '#fff',
    marginLeft: 12,
  },
  providerNameSelected: {
    color: '#0a84ff',
    fontWeight: '500',
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginLeft: 48,
  },
});
