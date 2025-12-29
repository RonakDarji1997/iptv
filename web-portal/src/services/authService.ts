import axios from 'axios'
import { jwtDecode } from 'jwt-decode'
import { storage } from '@/utils/storage'
import { cache } from '@/utils/cache'
import { apiCache } from '@/utils/api-cache'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

interface RegisterData {
  email: string
  password: string
}

interface LoginResponse {
  success: boolean
  accessToken: string
  refreshToken: string
  userId: string
  isNewUser?: boolean
}

interface DecodedToken {
  userId: string
  email: string
  deviceId?: string
  exp: number
}

class AuthService {
  private tokenKey = 'iptv_auth_token'
  private refreshTokenKey = 'iptv_refresh_token'

  async register(data: RegisterData): Promise<LoginResponse> {
    const response = await axios.post<LoginResponse>(`${API_URL}/auth/register`, data)
    
    if (response.data.accessToken) {
      await this.setToken(response.data.accessToken)
      if (response.data.refreshToken) {
        await this.setRefreshToken(response.data.refreshToken)
      }
    }
    
    return response.data
  }

  async login(email: string, password: string): Promise<LoginResponse> {
    // Backend uses same endpoint for both login and register
    const response = await axios.post<LoginResponse>(`${API_URL}/auth/register`, {
      email,
      password,
    })
    
    if (response.data.accessToken) {
      await this.setToken(response.data.accessToken)
      if (response.data.refreshToken) {
        await this.setRefreshToken(response.data.refreshToken)
      }
    }
    
    return response.data
  }

  async logout() {
    // Clear storage (works for both web localStorage and mobile AsyncStorage)
    await storage.clear()
    
    // Clear in-memory cache
    cache.clear()
    
    // Clear API cache (includes localStorage persistence)
    apiCache.clear()
    
    console.log('[Auth] Logout complete - cleared storage, in-memory cache, and API cache')
  }

  async setToken(token: string) {
    await storage.setItem(this.tokenKey, token)
  }

  async setRefreshToken(token: string) {
    await storage.setItem(this.refreshTokenKey, token)
  }

  // Synchronous methods for backward compatibility (use localStorage directly)
  getToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(this.tokenKey)
    }
    return null
  }

  getRefreshToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(this.refreshTokenKey)
    }
    return null
  }

  isAuthenticated(): boolean {
    const token = this.getToken()
    if (!token) return false

    try {
      const decoded = jwtDecode<DecodedToken>(token)
      return decoded.exp * 1000 > Date.now()
    } catch {
      return false
    }
  }

  getUser(): DecodedToken | null {
    const token = this.getToken()
    if (!token) return null

    try {
      return jwtDecode<DecodedToken>(token)
    } catch {
      return null
    }
  }

  getAuthHeader(): { Authorization: string } | {} {
    const token = this.getToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  }
}

export const authService = new AuthService()
