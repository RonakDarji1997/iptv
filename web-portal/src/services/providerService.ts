import axios from 'axios'
import { authService } from './authService'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

// Stalker Portal Authentication
interface StalkerHandshakeResponse {
  js: {
    token: string
    random: string
    not_valid: number
  }
}

interface StalkerProfileResponse {
  js: {
    mac: string
    login?: string
    fname?: string
    expire_billing_date?: string
    tariff_plan?: string
    [key: string]: any
  }
}

interface StalkerGenre {
  id: string
  title: string
  alias: string
  censored: number
  number?: string
}

interface StalkerGenresResponse {
  js: StalkerGenre[]
}

interface StalkerVodItem {
  id: string
  name: string
  is_series: string | number
  [key: string]: any
}

interface StalkerVodListResponse {
  js: {
    total_items: string
    data: StalkerVodItem[]
  }
}

class StalkerAuthService {
  // Perform handshake to get token (via backend proxy)
  async handshake(portalUrl: string, mac: string): Promise<{ token: string; random: string; finalUrl: string }> {
    console.log('🤝 Handshake via backend proxy...')
    console.log('🌐 Portal URL:', portalUrl)
    console.log('🏷️  MAC:', mac)

    try {
      const response = await axios.post<{ token: string; random: string; finalUrl: string }>(
        `${API_URL}/stalker-proxy/handshake`,
        { portalUrl, mac },
        {
          headers: authService.getAuthHeader(),
          timeout: 15000,
        }
      )

      console.log('✅ Handshake successful')
      console.log('🔑 Token:', response.data.token)
      console.log('🎲 Random:', response.data.random)
      console.log('🌐 Final URL:', response.data.finalUrl)

      return response.data
    } catch (error: any) {
      console.error('❌ Handshake failed:', error.message)
      console.error('❌ Error details:', error.response?.data)
      throw new Error(`Handshake failed: ${error.response?.data?.details || error.message}`)
    }
  }

  // Get profile (via backend proxy)
  async getProfile(
    portalUrl: string,
    mac: string,
    token: string,
    serialNumber: string
  ): Promise<StalkerProfileResponse['js']> {
    console.log('👤 Getting profile via backend proxy...')

    try {
      const response = await axios.post<StalkerProfileResponse['js']>(
        `${API_URL}/stalker-proxy/profile`,
        { portalUrl, mac, token, serialNumber },
        {
          headers: authService.getAuthHeader(),
          timeout: 15000,
        }
      )

      console.log('✅ Profile retrieved successfully!')
      console.log('👤 User:', response.data.login || response.data.fname || 'Unknown')
      console.log('📅 Expires:', response.data.expire_billing_date || 'N/A')

      return response.data
    } catch (error: any) {
      console.error('❌ Get profile failed:', error.message)
      console.error('❌ Error details:', error.response?.data)
      
      // Handle specific error statuses
      if (error.response?.status === 401 && error.response?.data?.status === 2) {
        throw new Error('This portal requires username/password authentication. Please use Stalker portal credentials.')
      }
      
      if (error.response?.status === 400 && error.response?.data?.status === 1) {
        throw new Error('Time sync error. Please check your device time settings.')
      }
      
      throw new Error(`Get profile failed: ${error.response?.data?.message || error.response?.data?.details || error.message}`)
    }
  }

  // Complete Stalker authentication flow (via backend proxy)
  async authenticate(
    portalUrl: string,
    mac: string,
    serialNumber: string
  ): Promise<{
    token: string
    profile: StalkerProfileResponse['js']
    finalUrl: string
  }> {
    console.log('\n🚀 Starting Stalker authentication flow via backend proxy...')
    console.log('🌐 Portal URL:', portalUrl)
    console.log('🏷️  MAC Address:', mac)
    console.log('📟 Serial Number:', serialNumber)

    // Step 1: Handshake (handles redirect automatically)
    const { token, finalUrl } = await this.handshake(portalUrl, mac)

    // Step 2: Get Profile (backend will calculate prehash from MAC)
    const profile = await this.getProfile(finalUrl, mac, token, serialNumber)

    console.log('\n🎉 Authentication complete!')
    console.log('💾 Data to save:', {
      token,
      mac,
      serialNumber,
      portalUrl: finalUrl,
      userInfo: {
        login: profile.login,
        name: profile.fname,
        expires: profile.expire_billing_date
      }
    })

    return { token, profile, finalUrl }
  }

  // Fetch and categorize all Stalker categories (via backend proxy)
  async fetchAllCategories(
    portalUrl: string,
    mac: string,
    token: string
  ): Promise<Category[]> {
    console.log('\n📋 Fetching all Stalker categories via backend proxy...')

    try {
      const response = await axios.post<{ categories: Category[] }>(
        `${API_URL}/stalker-proxy/fetch-categories`,
        { portalUrl, mac, token },
        {
          headers: authService.getAuthHeader(),
          timeout: 120000, // 2 minutes for category detection
        }
      )

      const categories = response.data.categories
      console.log(`\n🎉 Total categories fetched: ${categories.length}`)
      console.log(`   - Live TV: ${categories.filter(c => c.type === 'CHANNEL').length}`)
      console.log(`   - Movies: ${categories.filter(c => c.type === 'MOVIE').length}`)
      console.log(`   - Series: ${categories.filter(c => c.type === 'SERIES').length}`)

      return categories
    } catch (error: any) {
      console.error('❌ Failed to fetch categories:', error)
      throw new Error(`Failed to fetch categories: ${error.response?.data?.details || error.message}`)
    }
  }

  // Old direct methods kept for reference but not used
  async getLiveTvGenres_direct(portalUrl: string, mac: string, token: string): Promise<StalkerGenre[]> {
    const url = `${portalUrl}/server/load.php`
    const params = {
      type: 'itv',
      action: 'get_genres'
    }

    console.log('📺 Fetching Live TV genres...')
    console.log('📤 Request URL:', url)
    console.log('📤 Request Params:', params)

    try {
      const response = await axios.get<StalkerGenresResponse>(url, {
        params,
        headers: {
          'Cookie': `mac=${mac}; timezone=America/Toronto`,
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3'
        }
      })

      const genres = response.data.js || []
      // Filter out special categories like "All" and "DVB"
      const filtered = genres.filter(g => g.id !== '*' && g.id !== 'dvb')
      console.log(`✅ Fetched ${filtered.length} Live TV genres`)
      return filtered
    } catch (error: any) {
      console.error('❌ Failed to fetch Live TV genres:', error.message)
      throw error
    }
  }

  async getVodCategories_direct(portalUrl: string, mac: string, token: string): Promise<StalkerGenre[]> {
    const url = `${portalUrl}/server/load.php`
    const params = {
      type: 'vod',
      action: 'get_categories'
    }

    console.log('🎬 Fetching VOD categories...')
    console.log('📤 Request URL:', url)
    console.log('📤 Request Params:', params)

    try {
      const response = await axios.get<StalkerGenresResponse>(url, {
        params,
        headers: {
          'Cookie': `mac=${mac}; timezone=America/Toronto`,
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3'
        }
      })

      const categories = response.data.js || []
      // Filter out "All" category
      const filtered = categories.filter(c => c.id !== '*')
      console.log(`✅ Fetched ${filtered.length} VOD categories`)
      return filtered
    } catch (error: any) {
      console.error('❌ Failed to fetch VOD categories:', error.message)
      throw error
    }
  }

  async detectVodCategoryType_direct(
    portalUrl: string,
    mac: string,
    token: string,
    categoryId: string
  ): Promise<'MOVIE' | 'SERIES'> {
    const url = `${portalUrl}/server/load.php`
    const params = {
      type: 'vod',
      action: 'get_ordered_list',
      category: categoryId,
      sortby: '',
      p: 1
    }

    console.log(`🔍 Sampling category ${categoryId} to detect type...`)

    try {
      const response = await axios.get<StalkerVodListResponse>(url, {
        params,
        headers: {
          'Cookie': `mac=${mac}; timezone=America/Toronto`,
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3'
        }
      })

      const items = response.data.js?.data || []
      if (items.length === 0) {
        console.log(`⚠️ Category ${categoryId} is empty, defaulting to MOVIE`)
        return 'MOVIE'
      }

      // Check first few items for is_series flag
      const hasSeries = items.slice(0, 3).some(item => {
        const isSeries = item.is_series
        return isSeries === '1' || isSeries === 1
      })

      const type = hasSeries ? 'SERIES' : 'MOVIE'
      console.log(`✅ Category ${categoryId} detected as ${type}`)
      return type
    } catch (error: any) {
      console.error(`❌ Failed to detect category type for ${categoryId}:`, error.message)
      // Default to MOVIE on error
      return 'MOVIE'
    }
  }
}

export const stalkerAuthService = new StalkerAuthService()

export interface Provider {
  id: string
  provider_id?: string
  type: 'STALKER' | 'XTREAM' | 'M3U' | 'stalker' | 'xtream' | 'm3u'
  name: string
  url?: string
  server_url?: string
  mac_address?: string
  serial_number?: string
  token?: string
  isActive?: boolean
  is_active?: boolean
  is_configured?: boolean
  createdAt?: string
  created_at?: string
  lastSync?: string
  last_sync?: string
  synced_at?: string
}

export interface AddProviderRequest {
  type: 'STALKER' | 'XTREAM' | 'M3U'
  name: string
  url: string
  // Stalker specific
  stalkerMac?: string
  stalkerSerial?: string
  stalkerToken?: string
  stalkerAdid?: string
  // Xtream specific
  xtreamUsername?: string
  xtreamPassword?: string
  // M3U specific
  m3uUrl?: string
}

export interface Category {
  id: string
  category_id?: string
  externalId?: string
  name: string
  type: string // Backend uses: 'LIVE', 'VOD', 'SERIES' or UI uses: 'CHANNEL', 'MOVIE', 'SERIES'
  content_type?: string
  isEnabled?: boolean
  is_enabled?: boolean
  censored?: number
  sort_order?: number
}

class ProviderService {
  private getHeaders() {
    return authService.getAuthHeader()
  }

  async getProviders(): Promise<Provider[]> {
    // Use pull endpoint to get all user data including providers
    const response = await axios.get(`${API_URL}/sync/pull`, {
      headers: this.getHeaders(),
    })
    const providers = response.data.data?.providers || []
    console.log('Raw providers from backend:', providers)
    
    // Map backend response to Provider interface
    // Filter out providers with "pending" or empty server URLs
    return providers
      .filter((p: any) => {
        const serverUrl = p.server_url || p.url
        return serverUrl && serverUrl !== 'pending' && serverUrl.trim() !== ''
      })
      .map((p: any) => ({
        id: p.id || p.provider_id,
        provider_id: p.provider_id,
        type: p.type,
        name: p.name,
        url: p.server_url || p.url,
        server_url: p.server_url,
        mac_address: p.mac_address,
        serial_number: p.serial_number,
        token: p.token,
        isActive: p.is_active,
        is_active: p.is_active,
        is_configured: p.is_configured,
        createdAt: p.created_at,
        created_at: p.created_at,
        lastSync: p.synced_at || p.updated_at,
        last_sync: p.synced_at,
        synced_at: p.synced_at,
      }))
  }

  async addProvider(data: AddProviderRequest): Promise<Provider> {
    // Backend expects specific format for sync/providers
    const providerData = {
      provider_id: `web_${Date.now()}`, // Generate unique provider ID
      name: data.name,
      type: data.type,
      server_url: data.url,
      username: data.xtreamUsername || null,
      password: data.xtreamPassword || null,
      mac_address: data.stalkerMac || null,
      is_active: true,
      is_configured: true,
      include_tv: true,
      include_vod: true,
    }
    
    const response = await axios.post(`${API_URL}/sync/providers`, providerData, {
      headers: this.getHeaders(),
    })
    return response.data.provider
  }

  async deleteProvider(id: string): Promise<void> {
    // Backend doesn't have delete endpoint yet - would need to add or set is_active to false
    await axios.post(
      `${API_URL}/sync/providers`,
      { provider_id: id, is_active: false },
      { headers: this.getHeaders() }
    )
  }

  async getCategories(providerId: string): Promise<Category[]> {
    // Get all data and filter categories for this provider
    const response = await axios.get(`${API_URL}/sync/pull`, {
      headers: this.getHeaders(),
    })
    const categories = response.data.data?.categories || []
    const filtered = categories.filter((cat: any) => cat.provider_id === providerId)
    
    console.log('Fetched categories for provider:', providerId, filtered.length)
    
    // Normalize categories: map backend types to UI types
    const normalized = filtered.map((cat: any) => ({
      ...cat,
      // Map backend type to UI type: LIVE -> CHANNEL, VOD -> MOVIE
      type: cat.type === 'LIVE' ? 'CHANNEL' : cat.type === 'VOD' ? 'MOVIE' : cat.type,
      isEnabled: cat.is_enabled !== undefined ? cat.is_enabled : (cat.isEnabled !== undefined ? cat.isEnabled : true)
    }))
    
    console.log('Sample categories:', normalized.slice(0, 3))
    return normalized
  }

  async updateCategory(providerId: string, categoryId: string, isEnabled: boolean): Promise<void> {
    // Get all providers to find the provider_id string
    const allData = await axios.get(`${API_URL}/sync/pull`, {
      headers: this.getHeaders(),
    })
    
    const provider = allData.data.data?.providers?.find((p: any) => p.id === providerId)
    const category = allData.data.data?.categories?.find((c: any) => c.id === categoryId)
    
    if (!provider || !category) {
      console.error('Provider or category not found', { providerId, categoryId, provider, category })
      throw new Error('Provider or category not found')
    }
    
    const payload = {
      provider_id: provider.provider_id, // Use string provider_id, not UUID
      categories: [{
        id: category.category_id, // Backend expects category_id as 'id'
        name: category.name,
        type: category.type,
        contentType: category.content_type,
        censored: category.censored || 0,
        isEnabled: isEnabled,
        sortOrder: category.sort_order || 0
      }]
    }
    
    console.log('Updating category:', payload)
    
    // Backend expects provider_id (string) and category with backend field names
    const response = await axios.post(
      `${API_URL}/sync/categories`,
      payload,
      { headers: this.getHeaders() }
    )
    
    console.log('Category update response:', response.data)
  }

  async syncProvider(providerId: string): Promise<{ 
    categories: number
    live: number
    movies: number
    series: number
  }> {
    console.log(`\n🔄 Starting category sync for provider: ${providerId}`)
    
    try {
      const response = await axios.post(
        `${API_URL}/sync/full-sync/${providerId}`,
        {},
        { headers: this.getHeaders() }
      )
      
      console.log('✅ Sync completed:', response.data.stats)
      return response.data.stats
    } catch (error: any) {
      console.error('❌ Sync failed:', error)
      throw new Error(error.response?.data?.details || 'Sync failed')
    }
  }

  async authenticateStalker(
    portalUrl: string,
    mac: string,
    serialNumber: string
  ): Promise<{
    token: string
    profile: any
    finalUrl: string
  }> {
    return stalkerAuthService.authenticate(portalUrl, mac, serialNumber)
  }

  // Fetch and save Stalker categories
  async fetchAndSaveCategories(
    providerId: string,
    portalUrl: string,
    mac: string,
    token: string,
    onProgress?: (current: number, total: number, message: string) => void
  ): Promise<void> {
    console.log('\n📋 Fetching and saving Stalker categories...')
    
    try {
      // Fetch all categories from Stalker portal
      const categories = await stalkerAuthService.fetchAllCategories(portalUrl, mac, token)
      
      if (onProgress) {
        onProgress(categories.length, categories.length, 'Categories fetched, saving to database...')
      }

      // Save categories to backend
      console.log(`💾 Saving ${categories.length} categories to database...`)
      
      const payload = {
        provider_id: providerId,
        categories: categories.map(cat => ({
          id: cat.category_id || cat.id,
          name: cat.name,
          type: cat.type,
          contentType: cat.content_type,
          censored: cat.censored || 0,
          isEnabled: cat.isEnabled !== false,
          sortOrder: cat.sort_order || 0
        }))
      }

      const response = await axios.post(`${API_URL}/sync/categories`, payload, {
        headers: this.getHeaders(),
      })

      console.log('✅ Categories saved:', response.data)
      
      if (onProgress) {
        onProgress(categories.length, categories.length, `✅ ${categories.length} categories saved!`)
      }
    } catch (error: any) {
      console.error('❌ Failed to fetch/save categories:', error)
      throw new Error(`Failed to fetch/save categories: ${error.message}`)
    }
  }

  // Complete Stalker provider setup: authenticate + fetch categories
  async setupStalkerProvider(
    name: string,
    portalUrl: string,
    mac: string,
    serialNumber: string,
    adid: string,
    onProgress?: (current: number, total: number, message: string) => void
  ): Promise<{ provider: Provider; categoriesCount: number }> {
    console.log('\n🚀 Starting complete Stalker provider setup...')
    
    try {
      // Step 1: Authenticate
      if (onProgress) onProgress(0, 3, 'Authenticating with portal...')
      
      const { token, profile, finalUrl } = await stalkerAuthService.authenticate(
        portalUrl,
        mac,
        serialNumber
      )

      console.log('✅ Authentication successful')

      // Step 2: Save provider
      if (onProgress) onProgress(1, 3, 'Saving provider...')
      
      const providerId = `web_${Date.now()}`
      const providerData = {
        provider_id: providerId,
        name: name,
        type: 'stalker',
        server_url: finalUrl,
        mac_address: mac,
        serial_number: serialNumber,
        token: token,
        is_active: true,
        is_configured: true,
        include_tv: true,
        include_vod: true,
      }

      const providerResponse = await axios.post(`${API_URL}/sync/providers`, providerData, {
        headers: this.getHeaders(),
      })

      const provider = providerResponse.data.provider
      console.log('✅ Provider saved:', provider.name)

      // Step 3: Fetch and save categories using full-sync endpoint
      if (onProgress) onProgress(2, 3, 'Fetching categories...')
      
      try {
        const stats = await this.syncProvider(provider.id)
        console.log('\n🎉 Stalker provider setup complete!')
        console.log(`   Categories synced: ${stats.categories}`)
        
        return { provider, categoriesCount: stats.categories }
      } catch (error: any) {
        console.error('⚠️  Category sync failed, but provider was saved:', error.message)
        // Return provider even if category sync fails
        return { provider, categoriesCount: 0 }
      }
    } catch (error: any) {
      console.error('❌ Stalker provider setup failed:', error)
      throw error
    }
  }
}

export const providerService = new ProviderService()
