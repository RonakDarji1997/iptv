import axios from 'axios'
import { jwtDecode } from 'jwt-decode'

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
      this.setToken(response.data.accessToken)
      if (response.data.refreshToken) {
        this.setRefreshToken(response.data.refreshToken)
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
      this.setToken(response.data.accessToken)
      if (response.data.refreshToken) {
        this.setRefreshToken(response.data.refreshToken)
      }
    }
    
    return response.data
  }

  logout() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.tokenKey)
      localStorage.removeItem(this.refreshTokenKey)
    }
  }

  setToken(token: string) {
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.tokenKey, token)
    }
  }

  setRefreshToken(token: string) {
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.refreshTokenKey, token)
    }
  }

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
