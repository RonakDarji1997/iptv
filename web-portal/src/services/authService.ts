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
  private isRefreshing = false
  private refreshSubscribers: ((token: string) => void)[] = []

  constructor() {
    this.setupAxiosInterceptor()
  }

  private setupAxiosInterceptor() {
    axios.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config

        // If error is 401 and we haven't retried yet
        if (error.response?.status === 401 && !originalRequest._retry) {
          if (this.isRefreshing) {
            // Wait for the token to be refreshed
            return new Promise((resolve) => {
              this.refreshSubscribers.push((token: string) => {
                originalRequest.headers.Authorization = `Bearer ${token}`
                resolve(axios(originalRequest))
              })
            })
          }

          originalRequest._retry = true
          this.isRefreshing = true

          try {
            const newToken = await this.refreshAccessToken()
            
            if (newToken) {
              // Update all waiting requests with new token
              this.refreshSubscribers.forEach((callback) => callback(newToken))
              this.refreshSubscribers = []
              
              originalRequest.headers.Authorization = `Bearer ${newToken}`
              return axios(originalRequest)
            }
          } catch (refreshError) {
            console.error('[Auth] Token refresh failed:', refreshError)
            await this.logout()
            if (typeof window !== 'undefined') {
              window.location.href = '/auth/login'
            }
            return Promise.reject(refreshError)
          } finally {
            this.isRefreshing = false
          }
        }

        return Promise.reject(error)
      }
    )
  }

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
      const isExpired = decoded.exp * 1000 <= Date.now()
      
      // If token is expired, try to refresh it
      if (isExpired) {
        this.refreshAccessToken().catch(() => {
          // If refresh fails, token is invalid
          console.log('[Auth] Token expired and refresh failed')
        })
        return false
      }
      
      return true
    } catch {
      return false
    }
  }

  async refreshAccessToken(): Promise<string | null> {
    const refreshToken = this.getRefreshToken()
    if (!refreshToken) {
      console.log('[Auth] No refresh token available')
      return null
    }

    try {
      const response = await axios.post<{ success: boolean; accessToken: string }>(
        `${API_URL}/auth/refresh`,
        { refreshToken }
      )

      if (response.data.success && response.data.accessToken) {
        await this.setToken(response.data.accessToken)
        console.log('[Auth] Access token refreshed successfully')
        return response.data.accessToken
      }
      
      return null
    } catch (error) {
      console.error('[Auth] Failed to refresh token:', error)
      // Clear invalid tokens
      await this.logout()
      return null
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
