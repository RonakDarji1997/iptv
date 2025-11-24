import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface User {
    id: string;
    username: string;
    email: string;
    role: 'ADMIN' | 'USER';
}

export interface Profile {
    id: string;
    name: string;
    avatar?: string;
    type: 'ADMIN' | 'KID' | 'GUEST';
    ageRating?: number;
    userId: string;
    providerId: string;
    isActive?: boolean;
    allowedCategories?: string[];
    blockedCategories?: string[];
    allowedChannels?: string[];
    blockedChannels?: string[];
}

export interface SnapshotData {
    categories: any[];
    channels: any[];
    movies: any[];
    series: any[];
}

interface AuthState {
    // JWT Authentication
    jwtToken: string | null;
    user: User | null;
    
    // Profile Selection
    selectedProfile: Profile | null;
    availableProfiles: Profile[];
    
    // Provider Status
    hasProvider: boolean | null;
    
    // Legacy fields (for compatibility)
    macAddress: string | null;
    portalUrl: string | null;
    token: string | null;
    expiresAt: number | null;
    isAuthenticated: boolean;
    categories: any[];
    channels: Record<string, any[]>;

    // Auth Actions
    setUser: (user: User, jwtToken: string) => void;
    setProfiles: (profiles: Profile[]) => void;
    setSelectedProfile: (profile: Profile) => void;
    setHasProvider: (hasProvider: boolean) => void;
    
    // Helper function to filter snapshot based on active profile
    getFilteredSnapshot: (snapshot: SnapshotData) => SnapshotData;
    
    // Legacy Actions
    setCredentials: (mac: string, url: string) => void;
    setSession: (token: string, expiresAt: number) => void;
    setCategories: (categories: any[]) => void;
    setChannels: (categoryId: string, channels: any[]) => void;
    checkSession: () => boolean;
    logout: () => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            // JWT Auth State
            jwtToken: null,
            user: null,
            selectedProfile: null,
            availableProfiles: [],
            hasProvider: null,
            
            // Legacy State
            macAddress: null,
            portalUrl: null,
            token: null,
            expiresAt: null,
            isAuthenticated: false,
            categories: [],
            channels: {},

            // New Auth Actions
            setUser: (user, jwtToken) => set({ 
                user, 
                jwtToken, 
                isAuthenticated: true 
            }),
            
            setProfiles: (profiles) => set({ 
                availableProfiles: profiles 
            }),
            
            setSelectedProfile: (profile) => set({ 
                selectedProfile: profile 
            }),
            
            setHasProvider: (hasProvider) => set({ 
                hasProvider
            }),

            // Filter snapshot based on active profile's restrictions
            getFilteredSnapshot: (snapshot: SnapshotData) => {
                const state = get();
                const profile = state.selectedProfile;
                
                // If no profile or ADMIN profile, return full snapshot
                if (!profile || profile.type === 'ADMIN') {
                    return snapshot;
                }
                
                // If no restrictions set, return full snapshot
                const hasAllowedCategories = profile.allowedCategories && profile.allowedCategories.length > 0;
                const hasBlockedCategories = profile.blockedCategories && profile.blockedCategories.length > 0;
                
                if (!hasAllowedCategories && !hasBlockedCategories) {
                    return snapshot;
                }
                
                // Filter categories
                let filteredCategories = snapshot.categories || [];
                
                if (hasAllowedCategories) {
                    // Only show allowed categories
                    filteredCategories = filteredCategories.filter(cat => 
                        profile.allowedCategories!.includes(cat.id)
                    );
                } else if (hasBlockedCategories) {
                    // Show all except blocked categories
                    filteredCategories = filteredCategories.filter(cat => 
                        !profile.blockedCategories!.includes(cat.id)
                    );
                }
                
                // Get allowed category IDs for filtering content
                const allowedCategoryIds = new Set(filteredCategories.map(cat => cat.id));
                
                // Filter channels, movies, and series based on their categories
                const filteredChannels = (snapshot.channels || []).filter(channel => 
                    !channel.categoryId || allowedCategoryIds.has(channel.categoryId)
                );
                
                const filteredMovies = (snapshot.movies || []).filter(movie => 
                    !movie.categoryId || allowedCategoryIds.has(movie.categoryId)
                );
                
                const filteredSeries = (snapshot.series || []).filter(series => 
                    !series.categoryId || allowedCategoryIds.has(series.categoryId)
                );
                
                return {
                    categories: filteredCategories,
                    channels: filteredChannels,
                    movies: filteredMovies,
                    series: filteredSeries,
                };
            },
            
            // Legacy Actions (kept for compatibility)
            setCredentials: (mac, url) => set({ macAddress: mac, portalUrl: url }),
            setSession: (token, expiresAt) => set({ token, expiresAt, isAuthenticated: true }),
            setCategories: (categories) => set({ categories }),
            setChannels: (categoryId, channels) => set((state) => ({
                channels: { ...state.channels, [categoryId]: channels }
            })),
            
            checkSession: () => {
                const state = get();
                
                // Check JWT token first
                if (state.jwtToken && state.user) {
                    return true;
                }
                
                // Fallback to legacy session check
                if (!state.expiresAt) return false;
                const isValid: boolean = Date.now() < state.expiresAt;
                if (!isValid) {
                    set({
                        token: null,
                        expiresAt: null,
                        isAuthenticated: false,
                    });
                }
                return isValid;
            },
            
            logout: () => set({
                // Clear JWT auth
                jwtToken: null,
                user: null,
                selectedProfile: null,
                availableProfiles: [],
                
                // Clear legacy auth
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
