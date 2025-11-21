import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AuthState {
  macAddress: string | null;
  portalUrl: string | null;
  token: string | null;
  expiresAt: number | null;
  isAuthenticated: boolean;
  
  setCredentials: (mac: string, url: string) => void;
  setSession: (token: string, expiresAt: number) => void;
  checkSession: () => boolean;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  macAddress: null,
  portalUrl: null,
  token: null,
  expiresAt: null,
  isAuthenticated: false,

  setCredentials: (mac, url) => set({ macAddress: mac, portalUrl: url }),
  
  setSession: (token, expiresAt) => set({ 
    token, 
    expiresAt, 
    isAuthenticated: true 
  }),
  
  checkSession: () => {
    const state = get();
    if (!state.expiresAt) return false;
    const isValid = Date.now() < state.expiresAt;
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
    macAddress: null,
    portalUrl: null,
    token: null,
    expiresAt: null,
    isAuthenticated: false,
  }),
}));

// Default credentials from environment
// These are the actual Stalker Portal credentials, not the backend URL
const DEFAULT_MAC = '00:1A:79:17:F4:F5';
const DEFAULT_PORTAL_URL = 'http://tv.stream4k.cc/stalker_portal/';

// Persist auth state
export const initializeAuth = async () => {
  try {
    const stored = await AsyncStorage.getItem('iptv-auth');
    if (stored) {
      const data = JSON.parse(stored);
      useAuthStore.setState(data);
    } else {
      // Initialize with default credentials
      useAuthStore.setState({
        macAddress: DEFAULT_MAC,
        portalUrl: DEFAULT_PORTAL_URL,
      });
    }
  } catch (error) {
    console.error('Failed to load auth state:', error);
    // Fallback to default credentials
    useAuthStore.setState({
      macAddress: DEFAULT_MAC,
      portalUrl: DEFAULT_PORTAL_URL,
    });
  }
};

// Save auth state on changes
useAuthStore.subscribe((state) => {
  AsyncStorage.setItem('iptv-auth-storage', JSON.stringify({
    macAddress: state.macAddress,
    portalUrl: state.portalUrl,
    token: state.token,
    expiresAt: state.expiresAt,
    isAuthenticated: state.isAuthenticated,
  }));
});
