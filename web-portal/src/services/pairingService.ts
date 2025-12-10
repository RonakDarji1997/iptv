import axios from 'axios'
import { authService } from './authService'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

export interface PairingSession {
  code: string
  userId: string
  expiresAt: string
}

export interface PairingResponse {
  success: boolean
  code: string
  expiresAt: string
}

class PairingService {
  private getHeaders() {
    return authService.getAuthHeader()
  }

  async createPairingSession(): Promise<PairingResponse> {
    const response = await axios.post(
      `${API_URL}/devices/pairing/create`,
      {},
      { headers: this.getHeaders() }
    )
    return response.data
  }

  async checkPairingStatus(code: string): Promise<{ paired: boolean; deviceName?: string }> {
    const response = await axios.get(
      `${API_URL}/devices/pairing/status/${code}`,
      { headers: this.getHeaders() }
    )
    return response.data
  }
}

export const pairingService = new PairingService()
