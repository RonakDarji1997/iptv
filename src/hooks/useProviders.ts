'use client';

import { useState, useEffect } from 'react';

export interface Provider {
  id: string;
  userId: string;
  type: 'STALKER' | 'XTREAM' | 'M3U';
  name: string;
  url: string;
  stalkerMac?: string | null;
  stalkerBearer?: string | null;
  stalkerToken?: string | null;
  stalkerAdid?: string | null;
  stalkerStbId?: string | null;
  isActive: boolean;
  lastSync?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function useProviders(userId: string) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProviders = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/providers?userId=${userId}`);
      if (!response.ok) throw new Error('Failed to fetch providers');
      const data = await response.json();
      setProviders(data.providers);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId) {
      fetchProviders();
    }
  }, [userId]);

  const addProvider = async (providerData: any) => {
    try {
      const response = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...providerData, userId }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to add provider');
      }
      await fetchProviders();
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  };

  const updateProvider = async (id: string, updates: any) => {
    try {
      const response = await fetch(`/api/providers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!response.ok) throw new Error('Failed to update provider');
      await fetchProviders();
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  };

  const deleteProvider = async (id: string) => {
    try {
      const response = await fetch(`/api/providers/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete provider');
      await fetchProviders();
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  };

  const syncProvider = async (id: string) => {
    try {
      const response = await fetch(`/api/sync/${id}`, {
        method: 'POST',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to sync provider');
      }
      await fetchProviders();
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  };

  return {
    providers,
    loading,
    error,
    refresh: fetchProviders,
    addProvider,
    updateProvider,
    deleteProvider,
    syncProvider,
  };
}
