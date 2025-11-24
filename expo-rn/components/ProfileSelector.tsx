import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView, ActivityIndicator } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAuthStore, Profile } from '@/lib/store';
import { getUserProfiles, switchProfile } from '@/lib/api-client';
import { useRouter } from 'expo-router';

export default function ProfileSelector() {
  const router = useRouter();
  const { user, jwtToken, selectedProfile, availableProfiles, setProfiles, setSelectedProfile } = useAuthStore();
  const [showModal, setShowModal] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadProfiles = async () => {
    if (!user || !jwtToken) return;

    setLoading(true);
    try {
      const profiles = await getUserProfiles(user.id, jwtToken);
      setProfiles(profiles);
      
      // Set active profile if available
      const activeProfile = profiles.find(p => p.isActive);
      if (activeProfile && !selectedProfile) {
        setSelectedProfile(activeProfile);
      }
    } catch (error) {
      console.error('Error loading profiles:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchProfile = async (profile: Profile) => {
    if (!jwtToken) return;

    setSwitching(profile.id);
    try {
      const updatedProfile = await switchProfile(profile.id, jwtToken);
      setSelectedProfile(updatedProfile);
      setShowModal(false);
      
      // Force refresh by navigating to dashboard and back
      // This will trigger snapshot reloads with the new profile ID
      router.push('/(tabs)');
      
      // Small delay to ensure the navigation completes
      setTimeout(() => {
        router.replace('/(tabs)');
      }, 100);
    } catch (error) {
      console.error('Error switching profile:', error);
    } finally {
      setSwitching(null);
    }
  };

  const getProfileColor = (type: string) => {
    switch (type) {
      case 'ADMIN':
        return '#ef4444';
      case 'KID':
        return '#3b82f6';
      case 'GUEST':
        return '#6b7280';
      default:
        return '#6b7280';
    }
  };

  if (!selectedProfile || availableProfiles.length === 0) {
    return null;
  }

  return (
    <>
      <Pressable style={styles.container} onPress={() => setShowModal(true)}>
        <Text style={styles.avatar}>{selectedProfile.avatar || '👤'}</Text>
        <View style={styles.info}>
          <Text style={styles.name}>{selectedProfile.name}</Text>
          <Text style={[styles.type, { color: getProfileColor(selectedProfile.type) }]}>
            {selectedProfile.type}
          </Text>
        </View>
        <MaterialIcons name="swap-horiz" size={20} color="#71717a" />
      </Pressable>

      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Switch Profile</Text>
              <Pressable onPress={() => setShowModal(false)}>
                <MaterialIcons name="close" size={24} color="#fff" />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody}>
              {loading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#ef4444" />
                </View>
              ) : (
                availableProfiles.map((profile) => (
                  <Pressable
                    key={profile.id}
                    style={[
                      styles.profileCard,
                      profile.id === selectedProfile.id && styles.profileCardActive,
                    ]}
                    onPress={() => handleSwitchProfile(profile)}
                    disabled={switching !== null}
                  >
                    {switching === profile.id ? (
                      <ActivityIndicator size="small" color={getProfileColor(profile.type)} />
                    ) : (
                      <>
                        <Text style={styles.profileAvatar}>{profile.avatar || '👤'}</Text>
                        <View style={styles.profileInfo}>
                          <Text style={styles.profileName}>{profile.name}</Text>
                          <Text style={[styles.profileType, { color: getProfileColor(profile.type) }]}>
                            {profile.type}
                          </Text>
                        </View>
                        {profile.id === selectedProfile.id && (
                          <MaterialIcons name="check-circle" size={24} color="#22c55e" />
                        )}
                      </>
                    )}
                  </Pressable>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#27272a',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 8,
  },
  avatar: {
    fontSize: 24,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  type: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#27272a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#3f3f46',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  modalBody: {
    padding: 16,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 12,
    borderWidth: 2,
    borderColor: '#3f3f46',
  },
  profileCardActive: {
    borderColor: '#22c55e',
  },
  profileAvatar: {
    fontSize: 36,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  profileType: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
});
