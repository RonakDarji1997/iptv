export interface Provider {
  id: string;
  name: string;
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
