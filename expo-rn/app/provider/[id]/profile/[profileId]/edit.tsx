import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
  Switch,
} from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '@/lib/store';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

interface Category {
  id: string;
  externalId: string;
  name: string;
  type: 'CHANNEL' | 'MOVIE' | 'SERIES';
}

interface Profile {
  id: string;
  name: string;
  avatar: string;
  type: 'ADMIN' | 'KID' | 'GUEST';
  ageRating?: number;
  allowedCategories: string[];
  blockedCategories: string[];
  allowedChannels: string[];
  blockedChannels: string[];
}

type TabType = 'all' | 'channels' | 'movies' | 'series';
type FilterMode = 'allowAll' | 'allowSelected' | 'blockSelected';

export default function EditProfileScreen() {
  const router = useRouter();
  const { id: providerId, profileId } = useLocalSearchParams<{ id: string; profileId: string }>();
  const { jwtToken } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [filterMode, setFilterMode] = useState<FilterMode>('allowAll');
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [profileName, setProfileName] = useState('');
  const [ageRating, setAgeRating] = useState('');

  const fetchData = useCallback(async () => {
    if (!providerId || !profileId || !jwtToken) return;

    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:2005';

      // Fetch profile and categories
      const [profileResponse, snapshotResponse] = await Promise.all([
        fetch(`${apiUrl}/api/profiles/${profileId}`, {
          headers: { Authorization: `Bearer ${jwtToken}` },
        }),
        fetch(`${apiUrl}/api/providers/${providerId}/snapshot`, {
          headers: {
            Authorization: `Bearer ${jwtToken}`,
            'Accept-Encoding': 'gzip',
          },
        }),
      ]);

      if (profileResponse.ok) {
        const profileData = await profileResponse.json();
        console.log('[ProfileEdit] Loaded profile:', profileData);
        setProfile(profileData);
        setProfileName(profileData.name);
        setAgeRating(profileData.ageRating?.toString() || '');

        // Ensure arrays exist (handle both array and undefined)
        const allowedCats = Array.isArray(profileData.allowedCategories) 
          ? profileData.allowedCategories 
          : [];
        const blockedCats = Array.isArray(profileData.blockedCategories)
          ? profileData.blockedCategories
          : [];

        // Determine filter mode and selected categories
        if (allowedCats.length > 0) {
          setFilterMode('allowSelected');
          setSelectedCategories(new Set(allowedCats));
        } else if (blockedCats.length > 0) {
          setFilterMode('blockSelected');
          setSelectedCategories(new Set(blockedCats));
        } else {
          setFilterMode('allowAll');
          setSelectedCategories(new Set());
        }
      }

      if (snapshotResponse.ok) {
        const snapshotData = await snapshotResponse.json();
        setCategories(snapshotData.categories || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, [providerId, profileId, jwtToken]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleToggleCategory = (categoryId: string) => {
    const newSelected = new Set(selectedCategories);
    if (newSelected.has(categoryId)) {
      newSelected.delete(categoryId);
    } else {
      newSelected.add(categoryId);
    }
    setSelectedCategories(newSelected);
  };

  const handleSave = async () => {
    if (!profileName.trim()) {
      Alert.alert('Error', 'Please enter a profile name');
      return;
    }

    setSaving(true);

    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:2005';

      // Prepare update data based on filter mode
      let allowedCategories: string[] = [];
      let blockedCategories: string[] = [];

      if (filterMode === 'allowSelected') {
        allowedCategories = Array.from(selectedCategories);
        blockedCategories = []; // Explicitly clear blocked when using allow mode
      } else if (filterMode === 'blockSelected') {
        blockedCategories = Array.from(selectedCategories);
        allowedCategories = []; // Explicitly clear allowed when using block mode
      }
      // If allowAll, both arrays remain empty

      const requestBody = {
        name: profileName.trim(),
        ageRating: ageRating ? parseInt(ageRating) : null,
        allowedCategories,
        blockedCategories,
        allowedChannels: [], // Keep channels unrestricted for now
        blockedChannels: [], // Keep channels unrestricted for now
      };

      console.log('[ProfileEdit] Updating profile with:', requestBody);

      const response = await fetch(`${apiUrl}/api/profiles/${profileId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwtToken}`,
        },
        body: JSON.stringify(requestBody),
      });

      console.log('[ProfileEdit] Response status:', response.status);

      if (response.ok) {
        const result = await response.json();
        console.log('[ProfileEdit] Update successful:', result);
        Alert.alert('Success', 'Profile updated successfully', [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]);
      } else {
        const errorText = await response.text();
        console.error('[ProfileEdit] Update failed:', response.status, errorText);
        try {
          const error = JSON.parse(errorText);
          Alert.alert('Error', error.error || 'Failed to update profile');
        } catch {
          Alert.alert('Error', `Failed to update profile: ${errorText}`);
        }
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const filteredCategories = categories.filter((cat) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'channels') return cat.type === 'CHANNEL';
    if (activeTab === 'movies') return cat.type === 'MOVIE';
    if (activeTab === 'series') return cat.type === 'SERIES';
    return true;
  });

  const stats = {
    all: categories.length,
    channels: categories.filter((c) => c.type === 'CHANNEL').length,
    movies: categories.filter((c) => c.type === 'MOVIE').length,
    series: categories.filter((c) => c.type === 'SERIES').length,
  };

  const getCategoryIcon = (type: string) => {
    switch (type) {
      case 'CHANNEL':
        return 'live-tv';
      case 'MOVIE':
        return 'movie';
      case 'SERIES':
        return 'tv';
      default:
        return 'folder';
    }
  };

  const getCategoryColor = (type: string) => {
    switch (type) {
      case 'CHANNEL':
        return '#ef4444';
      case 'MOVIE':
        return '#3b82f6';
      case 'SERIES':
        return '#22c55e';
      default:
        return '#71717a';
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ef4444" />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Profile not found</Text>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButtonIcon}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Edit Profile</Text>
          <Text style={styles.headerSubtitle}>{profile.name}</Text>
        </View>
        <Pressable
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <MaterialIcons name="save" size={24} color="#fff" />
          )}
        </Pressable>
      </View>

      <ScrollView style={styles.content}>
        {/* Profile Info Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile Information</Text>
          <View style={styles.card}>
            <Text style={styles.label}>Profile Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter profile name"
              placeholderTextColor="#71717a"
              value={profileName}
              onChangeText={setProfileName}
            />

            <Text style={[styles.label, { marginTop: 16 }]}>Age Rating (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., 13, 18"
              placeholderTextColor="#71717a"
              value={ageRating}
              onChangeText={setAgeRating}
              keyboardType="numeric"
            />
          </View>
        </View>

        {/* Filter Mode Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Content Access Mode</Text>
          <View style={styles.card}>
            <Pressable
              style={[styles.modeOption, filterMode === 'allowAll' && styles.modeOptionActive]}
              onPress={() => {
                setFilterMode('allowAll');
                setSelectedCategories(new Set());
              }}
            >
              <View style={styles.modeOptionContent}>
                <MaterialIcons
                  name="check-circle"
                  size={24}
                  color={filterMode === 'allowAll' ? '#22c55e' : '#71717a'}
                />
                <View style={styles.modeTextContainer}>
                  <Text style={styles.modeTitle}>Allow All Content</Text>
                  <Text style={styles.modeDescription}>No restrictions, full access</Text>
                </View>
              </View>
              {filterMode === 'allowAll' && (
                <MaterialIcons name="radio-button-checked" size={20} color="#22c55e" />
              )}
            </Pressable>

            <Pressable
              style={[
                styles.modeOption,
                filterMode === 'allowSelected' && styles.modeOptionActive,
              ]}
              onPress={() => setFilterMode('allowSelected')}
            >
              <View style={styles.modeOptionContent}>
                <MaterialIcons
                  name="playlist-add-check"
                  size={24}
                  color={filterMode === 'allowSelected' ? '#3b82f6' : '#71717a'}
                />
                <View style={styles.modeTextContainer}>
                  <Text style={styles.modeTitle}>Allow Selected Only</Text>
                  <Text style={styles.modeDescription}>
                    Only selected categories are visible
                  </Text>
                </View>
              </View>
              {filterMode === 'allowSelected' && (
                <MaterialIcons name="radio-button-checked" size={20} color="#3b82f6" />
              )}
            </Pressable>

            <Pressable
              style={[
                styles.modeOption,
                filterMode === 'blockSelected' && styles.modeOptionActive,
              ]}
              onPress={() => setFilterMode('blockSelected')}
            >
              <View style={styles.modeOptionContent}>
                <MaterialIcons
                  name="block"
                  size={24}
                  color={filterMode === 'blockSelected' ? '#ef4444' : '#71717a'}
                />
                <View style={styles.modeTextContainer}>
                  <Text style={styles.modeTitle}>Block Selected</Text>
                  <Text style={styles.modeDescription}>Hide selected categories</Text>
                </View>
              </View>
              {filterMode === 'blockSelected' && (
                <MaterialIcons name="radio-button-checked" size={20} color="#ef4444" />
              )}
            </Pressable>
          </View>
        </View>

        {/* Category Selection Section */}
        {filterMode !== 'allowAll' && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                {filterMode === 'allowSelected' ? 'Select Allowed Categories' : 'Select Blocked Categories'}
              </Text>
              <Text style={styles.selectionCount}>
                {selectedCategories.size} selected
              </Text>
            </View>

            {/* Tab Bar */}
            <View style={styles.tabBar}>
              <Pressable
                style={[styles.tab, activeTab === 'all' && styles.activeTab]}
                onPress={() => setActiveTab('all')}
              >
                <Text style={[styles.tabText, activeTab === 'all' && styles.activeTabText]}>
                  All ({stats.all})
                </Text>
              </Pressable>
              <Pressable
                style={[styles.tab, activeTab === 'channels' && styles.activeTab]}
                onPress={() => setActiveTab('channels')}
              >
                <Text
                  style={[styles.tabText, activeTab === 'channels' && styles.activeTabText]}
                >
                  Channels ({stats.channels})
                </Text>
              </Pressable>
              <Pressable
                style={[styles.tab, activeTab === 'movies' && styles.activeTab]}
                onPress={() => setActiveTab('movies')}
              >
                <Text style={[styles.tabText, activeTab === 'movies' && styles.activeTabText]}>
                  Movies ({stats.movies})
                </Text>
              </Pressable>
              <Pressable
                style={[styles.tab, activeTab === 'series' && styles.activeTab]}
                onPress={() => setActiveTab('series')}
              >
                <Text style={[styles.tabText, activeTab === 'series' && styles.activeTabText]}>
                  Series ({stats.series})
                </Text>
              </Pressable>
            </View>

            {/* Category List */}
            <View style={styles.categoryList}>
              {filteredCategories.map((category) => {
                const isSelected = selectedCategories.has(category.id);
                return (
                  <Pressable
                    key={category.id}
                    style={[styles.categoryItem, isSelected && styles.categoryItemSelected]}
                    onPress={() => handleToggleCategory(category.id)}
                  >
                    <View
                      style={[
                        styles.categoryIconContainer,
                        { backgroundColor: getCategoryColor(category.type) + '20' },
                      ]}
                    >
                      <MaterialIcons
                        name={
                          getCategoryIcon(category.type) as
                            | 'live-tv'
                            | 'movie'
                            | 'tv'
                            | 'folder'
                        }
                        size={20}
                        color={getCategoryColor(category.type)}
                      />
                    </View>
                    <View style={styles.categoryInfo}>
                      <Text style={styles.categoryName}>{category.name}</Text>
                      <Text style={styles.categoryType}>{category.type}</Text>
                    </View>
                    <Switch
                      value={isSelected}
                      onValueChange={() => handleToggleCategory(category.id)}
                      trackColor={{
                        false: '#3f3f46',
                        true:
                          filterMode === 'allowSelected'
                            ? '#3b82f6'
                            : '#ef4444',
                      }}
                      thumbColor="#fff"
                    />
                  </Pressable>
                );
              })}

              {filteredCategories.length === 0 && (
                <View style={styles.emptyContainer}>
                  <MaterialIcons name="folder-open" size={48} color="#71717a" />
                  <Text style={styles.emptyText}>No categories found</Text>
                </View>
              )}
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Save Button Fixed at Bottom */}
      <View style={styles.bottomBar}>
        <Pressable
          style={[styles.saveButtonLarge, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <MaterialIcons name="save" size={20} color="#fff" />
              <Text style={styles.saveButtonText}>Save Changes</Text>
            </>
          )}
        </Pressable>
      </View>
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#18181b',
    padding: 20,
  },
  errorText: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 16,
  },
  header: {
    backgroundColor: '#27272a',
    padding: 20,
    paddingTop: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  backButtonIcon: {
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
  saveButton: {
    padding: 8,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  content: {
    flex: 1,
  },
  section: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  selectionCount: {
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#27272a',
    borderRadius: 12,
    padding: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
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
  modeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#18181b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#3f3f46',
  },
  modeOptionActive: {
    borderColor: '#ef4444',
  },
  modeOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  modeTextContainer: {
    flex: 1,
  },
  modeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  modeDescription: {
    fontSize: 13,
    color: '#71717a',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#27272a',
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: '#ef4444',
  },
  tabText: {
    color: '#a1a1aa',
    fontSize: 12,
    fontWeight: '600',
  },
  activeTabText: {
    color: '#fff',
  },
  categoryList: {
    backgroundColor: '#27272a',
    borderRadius: 12,
    overflow: 'hidden',
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#3f3f46',
  },
  categoryItemSelected: {
    backgroundColor: '#18181b',
  },
  categoryIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryInfo: {
    flex: 1,
  },
  categoryName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  categoryType: {
    fontSize: 12,
    color: '#71717a',
    marginTop: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    color: '#71717a',
    fontSize: 16,
  },
  bottomBar: {
    backgroundColor: '#27272a',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#3f3f46',
  },
  saveButtonLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ef4444',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  backButton: {
    backgroundColor: '#ef4444',
    padding: 16,
    borderRadius: 8,
    marginTop: 16,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
