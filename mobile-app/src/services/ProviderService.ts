import AsyncStorage from '@react-native-async-storage/async-storage';
import { Provider } from '../types';

const PROVIDERS_KEY = 'app_providers';
const SELECTED_PROVIDERS_KEY = 'selected_providers';

export class ProviderService {
  /**
   * Get all providers from storage
   */
  static async getAllProviders(): Promise<Provider[]> {
    try {
      const stored = await AsyncStorage.getItem(PROVIDERS_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
      return [];
    } catch (error) {
      console.error('Error loading providers:', error);
      return [];
    }
  }

  /**
   * Get active providers only
   */
  static async getActiveProviders(): Promise<Provider[]> {
    const allProviders = await this.getAllProviders();
    return allProviders.filter(p => p.isActive);
  }

  /**
   * Save providers to storage
   */
  static async saveProviders(providers: Provider[]): Promise<void> {
    try {
      await AsyncStorage.setItem(PROVIDERS_KEY, JSON.stringify(providers));
    } catch (error) {
      console.error('Error saving providers:', error);
      throw error;
    }
  }

  /**
   * Get selected provider IDs
   */
  static async getSelectedProviderIds(): Promise<string[]> {
    try {
      const stored = await AsyncStorage.getItem(SELECTED_PROVIDERS_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
      // If nothing selected, return all active provider IDs
      const activeProviders = await this.getActiveProviders();
      return activeProviders.map(p => p.id);
    } catch (error) {
      console.error('Error loading selected providers:', error);
      return [];
    }
  }

  /**
   * Save selected provider IDs
   */
  static async saveSelectedProviderIds(providerIds: string[]): Promise<void> {
    try {
      await AsyncStorage.setItem(SELECTED_PROVIDERS_KEY, JSON.stringify(providerIds));
    } catch (error) {
      console.error('Error saving selected providers:', error);
      throw error;
    }
  }

  /**
   * Get selected providers
   */
  static async getSelectedProviders(): Promise<Provider[]> {
    const allProviders = await this.getAllProviders();
    const selectedIds = await this.getSelectedProviderIds();
    return allProviders.filter(p => selectedIds.includes(p.id) && p.isActive);
  }

  /**
   * Check if multiple providers are available
   */
  static async hasMultipleProviders(): Promise<boolean> {
    const activeProviders = await this.getActiveProviders();
    return activeProviders.length > 1;
  }

  /**
   * Convert backend provider data to app Provider type
   */
  static convertBackendProvider(backendProvider: any): Provider {
    return {
      id: backendProvider.id || backendProvider.provider_id,
      name: backendProvider.name || 'Unknown Provider',
      type: backendProvider.type || 'stalker',
      serverUrl: backendProvider.server_url || backendProvider.portalUrl || '',
      macAddress: backendProvider.mac_address || backendProvider.macAddress || '',
      token: backendProvider.token || backendProvider.bearer_token,
      serialNumber: backendProvider.serial_number || backendProvider.serialNumber,
      isActive: backendProvider.is_active !== false,
      createdAt: backendProvider.created_at 
        ? new Date(backendProvider.created_at).getTime() 
        : Date.now(),
      lastSyncedAt: backendProvider.synced_at 
        ? new Date(backendProvider.synced_at).getTime() 
        : undefined,
    };
  }

  /**
   * Update providers from backend sync data
   */
  static async updateFromBackendSync(backendProviders: any[]): Promise<void> {
    const providers = backendProviders.map(bp => this.convertBackendProvider(bp));
    await this.saveProviders(providers);
  }
}
