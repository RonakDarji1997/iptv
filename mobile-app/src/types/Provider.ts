export interface Provider {
  id: string;
  name: string;
  type?: string; // Provider type (e.g., 'stalker', 'xtream')
  serverUrl: string;
  macAddress: string;
  token?: string;
  serialNumber?: string;
  isActive: boolean;
  createdAt: number;
  lastSyncedAt?: number;
}

export interface ProviderCredentials {
  serverUrl: string;
  macAddress: string;
  token?: string;
  serialNumber?: string;
}
