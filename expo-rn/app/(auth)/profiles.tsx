import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  ScrollView,
} from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/lib/store';
import { getUserProfiles, getProfileSnapshot, type Profile } from '@/lib/api-client';

export default function ProfileSelectionScreen() {
  const router = useRouter();
  const { user, jwtToken, setProfiles, setSelectedProfile, setSnapshot, availableProfiles } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [selectingProfile, setSelectingProfile] = useState<string | null>(null);
  const [error, setError] = useState('');
  const hasLoaded = useRef(false);

  useEffect(() => {
    if (hasLoaded.current) return;
    hasLoaded.current = true;
    loadProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadProfiles = async () => {
    if (!user || !jwtToken) {
      router.replace('/(auth)/login');
      return;
    }

    try {
      setLoading(true);
      const profiles = await getUserProfiles(user.id, jwtToken);
      setProfiles(profiles);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profiles');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectProfile = async (profile: Profile) => {
    if (!jwtToken) return;

    try {
      setSelectingProfile(profile.id);
      setError('');

      // Fetch snapshot for selected profile
      const snapshot = await getProfileSnapshot(profile.id, jwtToken);

      // Store profile and snapshot
      setSelectedProfile(profile);
      setSnapshot(snapshot);

      // Navigate to main app
      router.replace('/(tabs)');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile data');
    } finally {
      setSelectingProfile(null);
    }
  };

  const handleSkipProfile = () => {
    // User can skip profile selection and go directly to dashboard
    router.replace('/(tabs)');
  };

  const getProfileIcon = (type: string) => {
    switch (type) {
      case 'ADMIN':
        return '👑';
      case 'KID':
        return '👶';
      case 'GUEST':
        return '👤';
      default:
        return '👤';
    }
  };

  const getProfileColor = (type: string) => {
    switch (type) {
      case 'ADMIN':
        return '#ef4444'; // red-500
      case 'KID':
        return '#3b82f6'; // blue-500
      case 'GUEST':
        return '#6b7280'; // gray-500
      default:
        return '#6b7280';
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ef4444" />
          <Text style={styles.loadingText}>Loading profiles...</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <Text style={styles.title}>Who&apos;s watching?</Text>
        {user && <Text style={styles.subtitle}>Welcome, {user.username}</Text>}
      </View>

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={loadProfiles}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {availableProfiles.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No profiles found yet.</Text>
          <Text style={styles.emptyHint}>You can add profiles from the dashboard or skip for now.</Text>
        </View>
      ) : (
        <View style={styles.profilesContainer}>
          {availableProfiles.map((profile) => (
            <Pressable
              key={profile.id}
              style={[styles.profileCard, { borderColor: getProfileColor(profile.type) }]}
              onPress={() => handleSelectProfile(profile)}
              disabled={selectingProfile !== null}
            >
              {selectingProfile === profile.id ? (
                <ActivityIndicator size="large" color={getProfileColor(profile.type)} />
              ) : (
                <>
                  <Text style={styles.profileIcon}>{getProfileIcon(profile.type)}</Text>
                  <Text style={styles.profileName}>{profile.name}</Text>
                  <Text style={[styles.profileType, { color: getProfileColor(profile.type) }]}>
                    {profile.type}
                  </Text>
                  {profile.ageRating && <Text style={styles.profileRating}>{profile.ageRating}+</Text>}
                </>
              )}
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.actionsContainer}>
        <Pressable style={styles.skipButton} onPress={handleSkipProfile}>
          <Text style={styles.skipButtonText}>Skip for Now →</Text>
        </Pressable>

        <Pressable style={styles.newProfileButton} onPress={() => console.log('Create new profile')}>
          <Text style={styles.newProfileButtonText}>+ Add New Profile</Text>
        </Pressable>
      </View>

      <Pressable
        style={styles.logoutButton}
        onPress={() => {
          useAuthStore.getState().logout();
          router.replace('/(auth)/login');
        }}
      >
        <Text style={styles.logoutButtonText}>← Back to Login</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: { color: '#fff', fontSize: 16, marginTop: 16 },
  header: { alignItems: 'center', marginBottom: 40 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#9ca3af' },
  emptyContainer: { alignItems: 'center', padding: 24 },
  emptyText: { color: '#fff', fontSize: 18, marginBottom: 8 },
  emptyHint: { color: '#9ca3af', fontSize: 13, textAlign: 'center' },
  profilesContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 20 },
  profileCard: {
    width: 150,
    height: 180,
    backgroundColor: '#18181b',
    borderRadius: 12,
    borderWidth: 2,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileIcon: { fontSize: 48, marginBottom: 12 },
  profileName: { fontSize: 18, fontWeight: '600', color: '#fff', textAlign: 'center', marginBottom: 4 },
  profileType: { fontSize: 12, fontWeight: '500', textTransform: 'uppercase', marginBottom: 4 },
  profileRating: { fontSize: 12, color: '#9ca3af', backgroundColor: '#27272a', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  errorContainer: { alignItems: 'center', padding: 20 },
  errorText: { color: '#ef4444', fontSize: 16, textAlign: 'center', marginBottom: 16 },
  retryButton: { backgroundColor: '#ef4444', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  retryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  actionsContainer: { marginTop: 32, gap: 12 },
  skipButton: { backgroundColor: '#27272a', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 8, alignItems: 'center' },
  skipButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  newProfileButton: { backgroundColor: '#18181b', borderWidth: 2, borderColor: '#ef4444', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 8, alignItems: 'center' },
  newProfileButtonText: { color: '#ef4444', fontSize: 16, fontWeight: '600' },
  logoutButton: { marginTop: 24, alignItems: 'center' },
  logoutButtonText: { color: '#9ca3af', fontSize: 14 },
});