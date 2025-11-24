import { create } from 'zustand';

export interface SnapshotData {
  categories: any[];
  channels: any[];
  movies: any[];
  series: any[];
}

interface SnapshotState {
  snapshot: SnapshotData | null;
  setSnapshot: (snapshot: SnapshotData) => void;
  clearSnapshot: () => void;
}

// Non-persisted store for snapshot - keeps data in memory only
// Data is cleared when app/browser closes
export const useSnapshotStore = create<SnapshotState>((set) => ({
  snapshot: null,
  setSnapshot: (snapshot) => {
    console.log('[SnapshotStore] Caching snapshot in memory:', {
      categories: snapshot.categories?.length || 0,
      channels: snapshot.channels?.length || 0,
      movies: snapshot.movies?.length || 0,
      series: snapshot.series?.length || 0,
    });
    set({ snapshot });
  },
  clearSnapshot: () => set({ snapshot: null }),
}));
