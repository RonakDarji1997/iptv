import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '@/lib/store';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

interface Profile {
  id: string;
  name: string;
  avatar: string;
  type: 'ADMIN' | 'KID' | 'GUEST';
  ageRating?: number;
  isActive: boolean;
  allowedCategories: string[];
  blockedCategories: string[];
  allowedChannels: string[];
  blockedChannels: string[];
}

const MAX_PROFILES = 5;

const PROFILE_AVATARS = ['👤', '👑', '👶', '👧', '👦', '👨', '👩', '🧒', '🐶', '🐱', '🦊', '🐼'];
const PROFILE_TYPES = [
  { value: 'ADMIN', label: 'Admin', icon: '👑', color: '#ef4444' },
  { value: 'KID', label: 'Kid', icon: '👶', color: '#3b82f6' },
  { value: 'GUEST', label: 'Guest', icon: '👤', color: '#6b7280' },
];

export default function ProfileManagementScreen() {
  const router = useRouter();
  const { id: providerId } = useLocalSearchParams<{ id: string }>();
  const { jwtToken, user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('👤');
  const [selectedType, setSelectedType] = useState<'ADMIN' | 'KID' | 'GUEST'>('GUEST');
  const [ageRating, setAgeRating] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchProfiles = useCallback(async () => {
    if (!providerId || !jwtToken || !user) return;

    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:2005';
      const response = await fetch(
        `${apiUrl}/api/profiles?userId=${user.id}&providerId=${providerId}`,
        {
          headers: {
            Authorization: `Bearer ${jwtToken}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setProfiles(data.profiles || []);
      }
    } catch (error) {
      console.error('Error fetching profiles:', error);
    } finally {
      setLoading(false);
    }
  }, [providerId, jwtToken, user]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const handleCreateProfile = async () => {
    if (!newProfileName.trim()) {
      Alert.alert('Error', 'Please enter a profile name');
      return;
    }

    if (profiles.length >= MAX_PROFILES) {
      Alert.alert('Limit Reached', `You can only create up to ${MAX_PROFILES} profiles`);
      return;
    }

    setCreating(true);

    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:2005';
      const response = await fetch(`${apiUrl}/api/profiles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwtToken}`,
        },
        body: JSON.stringify({
          userId: user?.id,
          providerId,
          name: newProfileName.trim(),
          avatar: selectedAvatar,
          type: selectedType,
          ageRating: ageRating ? parseInt(ageRating) : null,
          allowedCategories: [],
          blockedCategories: [],
          allowedChannels: [],
          blockedChannels: [],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setProfiles([...profiles, data.profile]);
        setShowCreateModal(false);
        setNewProfileName('');
        setSelectedAvatar('👤');
        setSelectedType('GUEST');
        setAgeRating('');
        Alert.alert('Success', 'Profile created successfully');
      } else {
        const error = await response.json();
        Alert.alert('Error', error.error || 'Failed to create profile');
      }
    } catch (error) {
      console.error('Error creating profile:', error);
      Alert.alert('Error', 'Failed to create profile');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteProfile = async (profileId: string) => {
    Alert.alert(
      'Delete Profile',
      'Are you sure you want to delete this profile? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:2005';
              const response = await fetch(`${apiUrl}/api/profiles/${profileId}`, {
                method: 'DELETE',
                headers: {
                  Authorization: `Bearer ${jwtToken}`,
                },
              });

              if (response.ok) {
                setProfiles(profiles.filter((p) => p.id !== profileId));
                Alert.alert('Success', 'Profile deleted successfully');
              } else {
                const error = await response.json();
                Alert.alert('Error', error.error || 'Failed to delete profile');
              }
            } catch (error) {
              console.error('Error deleting profile:', error);
              Alert.alert('Error', 'Failed to delete profile');
            }
          },
        },
      ]
    );
  };

  const handleEditProfile = (profileId: string) => {
    router.push(`/provider/${providerId}/profile/${profileId}/edit`);
  };

  const handleSwitchProfile = async (profileId: string) => {
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:2005';
      const response = await fetch(`${apiUrl}/api/profiles/${profileId}/switch`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwtToken}`,
        },
      });

      if (response.ok) {
        await fetchProfiles();
        Alert.alert('Success', 'Profile switched successfully');
      }
    } catch (error) {
      console.error('Error switching profile:', error);
      Alert.alert('Error', 'Failed to switch profile');
    }
  };

  const getTypeColor = (type: string) => {
    const typeObj = PROFILE_TYPES.find((t) => t.value === type);
    return typeObj?.color || '#6b7280';
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ef4444" />
        <Text style={styles.loadingText}>Loading profiles...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Manage Profiles</Text>
          <Text style={styles.headerSubtitle}>
            {profiles.length} of {MAX_PROFILES} profiles
          </Text>
        </View>
      </View>

      <ScrollView style={styles.content}>
        {/* Info Card */}
        <View style={styles.infoCard}>
          <MaterialIcons name="info-outline" size={20} color="#3b82f6" />
          <Text style={styles.infoText}>
            Create profiles with custom content restrictions. Parents can control what content kids
            can access.
          </Text>
        </View>

        {/* Profile List */}
        {profiles.map((profile) => (
          <View key={profile.id} style={styles.profileCard}>
            <View style={styles.profileHeader}>
              <View style={styles.profileInfo}>
                <Text style={styles.profileAvatar}>{profile.avatar}</Text>
                <View style={styles.profileDetails}>
                  <View style={styles.profileNameRow}>
                    <Text style={styles.profileName}>{profile.name}</Text>
                    {profile.isActive && (
                      <View style={styles.activeBadge}>
                        <Text style={styles.activeBadgeText}>Active</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.profileMeta}>
                    <Text style={[styles.profileType, { color: getTypeColor(profile.type) }]}>
                      {profile.type}
                    </Text>
                    {profile.ageRating && (
                      <Text style={styles.profileRating}>{profile.ageRating}+</Text>
                    )}
                  </View>
                </View>
              </View>
              <Pressable
                style={styles.moreButton}
                onPress={() => handleEditProfile(profile.id)}
              >
                <MaterialIcons name="edit" size={20} color="#71717a" />
              </Pressable>
            </View>

            {/* Profile Stats */}
            <View style={styles.profileStats}>
              <View style={styles.stat}>
                <MaterialIcons name="check-circle" size={16} color="#22c55e" />
                <Text style={styles.statText}>
                  {profile.allowedCategories.length > 0
                    ? `${profile.allowedCategories.length} allowed categories`
                    : 'All categories'}
                </Text>
              </View>
              <View style={styles.stat}>
                <MaterialIcons name="block" size={16} color="#ef4444" />
                <Text style={styles.statText}>
                  {profile.blockedCategories.length} blocked categories
                </Text>
              </View>
            </View>

            {/* Actions */}
            <View style={styles.profileActions}>
              {!profile.isActive && (
                <Pressable
                  style={styles.switchButton}
                  onPress={() => handleSwitchProfile(profile.id)}
                >
                  <MaterialIcons name="swap-horiz" size={18} color="#fff" />
                  <Text style={styles.switchButtonText}>Switch To</Text>
                </Pressable>
              )}
              <Pressable
                style={styles.deleteButton}
                onPress={() => handleDeleteProfile(profile.id)}
              >
                <MaterialIcons name="delete" size={18} color="#ef4444" />
                <Text style={styles.deleteButtonText}>Delete</Text>
              </Pressable>
            </View>
          </View>
        ))}

        {/* Create Profile Button */}
        {profiles.length < MAX_PROFILES && (
          <Pressable style={styles.createButton} onPress={() => setShowCreateModal(true)}>
            <MaterialIcons name="add" size={24} color="#fff" />
            <Text style={styles.createButtonText}>Create New Profile</Text>
          </Pressable>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Create Profile Modal */}
      <Modal
        visible={showCreateModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create New Profile</Text>
              <Pressable onPress={() => setShowCreateModal(false)}>
                <MaterialIcons name="close" size={24} color="#fff" />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Profile Name */}
              <Text style={styles.label}>Profile Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter profile name"
                placeholderTextColor="#71717a"
                value={newProfileName}
                onChangeText={setNewProfileName}
              />

              {/* Avatar Selection */}
              <Text style={styles.label}>Choose Avatar</Text>
              <View style={styles.avatarGrid}>
                {PROFILE_AVATARS.map((avatar) => (
                  <Pressable
                    key={avatar}
                    style={[
                      styles.avatarOption,
                      selectedAvatar === avatar && styles.avatarOptionSelected,
                    ]}
                    onPress={() => setSelectedAvatar(avatar)}
                  >
                    <Text style={styles.avatarEmoji}>{avatar}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Profile Type */}
              <Text style={styles.label}>Profile Type</Text>
              <View style={styles.typeGrid}>
                {PROFILE_TYPES.map((type) => (
                  <Pressable
                    key={type.value}
                    style={[
                      styles.typeOption,
                      selectedType === type.value && styles.typeOptionSelected,
                      { borderColor: type.color },
                    ]}
                    onPress={() => setSelectedType(type.value as 'ADMIN' | 'KID' | 'GUEST')}
                  >
                    <Text style={styles.typeIcon}>{type.icon}</Text>
                    <Text style={styles.typeLabel}>{type.label}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Age Rating */}
              <Text style={styles.label}>Age Rating (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 13, 18"
                placeholderTextColor="#71717a"
                value={ageRating}
                onChangeText={setAgeRating}
                keyboardType="numeric"
              />

              {/* Create Button */}
              <Pressable
                style={[styles.modalCreateButton, creating && styles.buttonDisabled]}
                onPress={handleCreateProfile}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <MaterialIcons name="add" size={20} color="#fff" />
                    <Text style={styles.modalCreateButtonText}>Create Profile</Text>
                  </>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#18181b',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#18181b',
  },
  loadingText: {
    marginTop: 12,
    color: '#71717a',
    fontSize: 16,
  },
  header: {
    backgroundColor: '#27272a',
    padding: 20,
    paddingTop: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  backButton: {
    padding: 8,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#71717a',
    marginTop: 4,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#1e3a8a20',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  infoText: {
    flex: 1,
    color: '#93c5fd',
    fontSize: 14,
    lineHeight: 20,
  },
  profileCard: {
    backgroundColor: '#27272a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 12,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  profileAvatar: {
    fontSize: 40,
  },
  profileDetails: {
    flex: 1,
  },
  profileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  activeBadge: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  activeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  profileMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  profileType: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  profileRating: {
    fontSize: 11,
    color: '#71717a',
    backgroundColor: '#3f3f46',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  moreButton: {
    padding: 8,
  },
  profileStats: {
    gap: 8,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statText: {
    fontSize: 13,
    color: '#a1a1aa',
  },
  profileActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  switchButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  switchButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3f3f46',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  deleteButtonText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ef4444',
    padding: 16,
    borderRadius: 12,
    gap: 8,
    marginTop: 8,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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
    maxHeight: '90%',
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
    padding: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#18181b',
    borderRadius: 8,
    padding: 14,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  avatarOption: {
    width: 56,
    height: 56,
    backgroundColor: '#18181b',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#3f3f46',
  },
  avatarOptionSelected: {
    borderColor: '#ef4444',
    backgroundColor: '#27272a',
  },
  avatarEmoji: {
    fontSize: 28,
  },
  typeGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  typeOption: {
    flex: 1,
    backgroundColor: '#18181b',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    gap: 8,
    borderWidth: 2,
  },
  typeOptionSelected: {
    backgroundColor: '#27272a',
  },
  typeIcon: {
    fontSize: 32,
  },
  typeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  modalCreateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ef4444',
    padding: 16,
    borderRadius: 12,
    gap: 8,
    marginTop: 24,
    marginBottom: 20,
  },
  modalCreateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
