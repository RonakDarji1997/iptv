import { create } from 'zustand';

export interface SnapshotData {
  categories: any[];
  channels: any[];
  movies: any[];
  series: any[];
  generatedAt?: string; // Snapshot generation timestamp from API
  metadata?: any;
}

interface SnapshotState {
  snapshot: SnapshotData | null;
  snapshotTimestamp: number | null; // When we cached it locally
  snapshotProviderId: string | null; // Which provider this snapshot belongs to
  setSnapshot: (snapshot: SnapshotData, providerId: string) => void;
  clearSnapshot: () => void;
  isStale: (maxAgeMinutes?: number) => boolean; // Check if cache is too old
  isForProvider: (providerId: string) => boolean; // Check if snapshot is for this provider
}

// Non-persisted store for snapshot - keeps data in memory only
// Data is cleared when app/browser closes
export const useSnapshotStore = create<SnapshotState>((set, get) => ({
  snapshot: null,
  snapshotTimestamp: null,
  snapshotProviderId: null,
  setSnapshot: (snapshot, providerId) => {
    const now = Date.now();
    console.log('[SnapshotStore] Caching snapshot in memory:', {
      providerId,
      categories: snapshot.categories?.length || 0,
      channels: snapshot.channels?.length || 0,
      movies: snapshot.movies?.length || 0,
      series: snapshot.series?.length || 0,
      generatedAt: snapshot.generatedAt,
      cachedAt: new Date(now).toISOString(),
    });
    set({ snapshot, snapshotTimestamp: now, snapshotProviderId: providerId });
  },
  clearSnapshot: () => set({ snapshot: null, snapshotTimestamp: null, snapshotProviderId: null }),
  isStale: (maxAgeMinutes = 30) => {
    const { snapshotTimestamp } = get();
    if (!snapshotTimestamp) return true;
    const ageMinutes = (Date.now() - snapshotTimestamp) / 1000 / 60;
    return ageMinutes > maxAgeMinutes;
  },
  isForProvider: (providerId) => {
    const { snapshotProviderId } = get();
    return snapshotProviderId === providerId;
  },
}));
