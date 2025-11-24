'use client';

import { useState, useEffect } from 'react';

export interface Device {
  id: string;
  userId: string;
  providerId: string;
  deviceName: string;
  mac: string;
  token?: string | null;
  stbId?: string | null;
  lastActive?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function useDevices(userId: string, providerId?: string) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDevices = async () => {
    try {
      setLoading(true);
      let url = `/api/devices?userId=${userId}`;
      if (providerId) url += `&providerId=${providerId}`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch devices');
      const data = await response.json();
      setDevices(data.devices);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId) {
      fetchDevices();
    }
  }, [userId, providerId]);

  const addDevice = async (deviceData: any) => {
    try {
      const response = await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...deviceData, userId }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to add device');
      }
      await fetchDevices();
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  };

  return {
    devices,
    loading,
    error,
    refresh: fetchDevices,
    addDevice,
  };
}
