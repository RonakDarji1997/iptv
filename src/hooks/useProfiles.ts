'use client';

import { useState, useEffect } from 'react';

export interface Profile {
  id: string;
  userId: string;
  providerId: string;
  name: string;
  type: 'ADMIN' | 'KID' | 'GUEST';
  pin?: string | null;
  ageRating?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export function useProfiles(userId: string, providerId?: string) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfiles = async () => {
    try {
      setLoading(true);
      let url = `/api/profiles?userId=${userId}`;
      if (providerId) url += `&providerId=${providerId}`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch profiles');
      const data = await response.json();
      setProfiles(data.profiles);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId) {
      fetchProfiles();
    }
  }, [userId, providerId]);

  const addProfile = async (profileData: any) => {
    try {
      const response = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...profileData, userId }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to add profile');
      }
      await fetchProfiles();
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  };

  const updateProfile = async (id: string, updates: any) => {
    try {
      const response = await fetch(`/api/profiles/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!response.ok) throw new Error('Failed to update profile');
      await fetchProfiles();
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  };

  const deleteProfile = async (id: string) => {
    try {
      const response = await fetch(`/api/profiles/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete profile');
      await fetchProfiles();
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  };

  return {
    profiles,
    loading,
    error,
    refresh: fetchProfiles,
    addProfile,
    updateProfile,
    deleteProfile,
  };
}
