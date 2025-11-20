import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AuthState {
    macAddress: string | null;
    portalUrl: string | null;
    token: string | null;
    expiresAt: number | null;
    isAuthenticated: boolean;

    categories: any[];
    channels: Record<string, any[]>;

    setCredentials: (mac: string, url: string) => void;
    setSession: (token: string, expiresAt: number) => void;
    setCategories: (categories: any[]) => void;
    setChannels: (categoryId: string, channels: any[]) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            macAddress: null,
            portalUrl: null,
            token: null,
            expiresAt: null,
            isAuthenticated: false,
            categories: [],
            channels: {},

            setCredentials: (mac, url) => set({ macAddress: mac, portalUrl: url }),
            setSession: (token, expiresAt) => set({ token, expiresAt, isAuthenticated: true }),
            setCategories: (categories) => set({ categories }),
            setChannels: (categoryId, channels) => set((state) => ({
                channels: { ...state.channels, [categoryId]: channels }
            })),
            logout: () => set({
                macAddress: null,
                portalUrl: null,
                token: null,
                expiresAt: null,
                isAuthenticated: false,
                categories: [],
                channels: {}
            }),
        }),
        {
            name: 'iptv-auth-storage',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);
