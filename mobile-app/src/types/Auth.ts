export interface User {
  id: string;
  email: string;
  deviceName: string;
  deviceType: 'mobile' | 'tablet';
  createdAt: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  deviceName: string;
  deviceType: 'mobile' | 'tablet';
}
