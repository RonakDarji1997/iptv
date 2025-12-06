import axios, { AxiosInstance } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

export interface StalkerCategory {
  id: string;
  title: string;
  alias: string;
  censored: number;
}

export interface StalkerVodItem {
  id: string;
  name: string;
  description?: string;
  category_id: string;
  is_series: string; // "0" for movies, "1" for series
  screenshot_uri?: string;
  cmd: string;
  year?: string;
  director?: string;
  actors?: string;
  rating_imdb?: number;
  genres_str?: string;
}

export interface StalkerChannel {
  id: string;
  name: string;
  number?: string;
  logo?: string;
  cmd: string;
}

const STALKER_CACHE_KEY = 'stalker_portal_cache';
const MAC_ADDRESS = '00:1a:79:17:f4:f5'; // Same as Android TV
const SERIAL_NUMBER = '058357N656529'; // STB serial number

export class StalkerPortalClient {
  private client: AxiosInstance;
  private portalUrl: string;
  private macAddress: string;
  private serialNumber: string;
  private bearerToken: string | null = null;
  private backendUrl: string;

  constructor(portalUrl: string, macAddress: string = MAC_ADDRESS, serialNumber: string = SERIAL_NUMBER, backendUrl: string = 'http://api.iptv.ronika.co') {
    this.portalUrl = portalUrl.replace(/\/$/, ''); // Remove trailing slash
    this.macAddress = macAddress;
    this.serialNumber = serialNumber;
    this.backendUrl = backendUrl;
    
    this.client = axios.create({
      baseURL: `${this.portalUrl}/stalker_portal/server`,
      timeout: 30000,
      headers: {
        'Accept': '*/*',
      },
    });

    // Add request interceptor to log actual URLs and headers
    this.client.interceptors.request.use((config) => {
      const fullUrl = `${config.baseURL}${config.url}`;
      console.log(`📡 Making request to: ${fullUrl}`);
      console.log('🔍 Actual axios headers:', JSON.stringify(config.headers));
      return config;
    });
  }

  /**
   * Get auth token for backend requests
   */
  private async getAuthToken(): Promise<string> {
    const token = await AsyncStorage.getItem('auth_token');
    if (!token) {
      throw new Error('No auth token found');
    }
    return token;
  }

  /**
   * Set bearer token from sync data
   */
  setToken(token: string): void {
    this.bearerToken = token;
    console.log('✅ Bearer token set from sync data');
  }

  /**
   * Generate MD5 hash
   */
  private async md5(input: string): Promise<string> {
    const digest = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.MD5,
      input
    );
    return digest;
  }

  /**
   * Generate adid from MAC address
   * Note: The actual adid generation algorithm is different from simple MD5
   * For now, using hardcoded value that works with this provider
   */
  private async getAdid(): Promise<string> {
    // TODO: Find the correct adid generation algorithm
    // For Stream4K with MAC 00:1a:79:17:f4:f5, the correct adid is:
    return '06c140f97c839eaaa4faef4cc08a5722';
  }

  /**
   * Get cookies string - exact format from Android TV
   */
  private async getCookies(): Promise<string> {
    const adid = await this.getAdid();
    return `mac=${this.macAddress}; timezone=America/Toronto; adid=${adid}`;
  }

  /**
   * Build request headers - exact format from Android TV
   * Note: Host header is automatically set by fetch and cannot be overridden in React Native
   */
  private async buildHeaders(): Promise<Record<string, string>> {
    const cookies = await this.getCookies();
    
    const headers: Record<string, string> = {
      'Cookie': cookies,
      'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
      'X-User-Agent': 'Model: MAG270; Link: WiFi',
    };

    if (this.bearerToken) {
      headers['Authorization'] = `Bearer ${this.bearerToken}`;
    }

    console.log('📋 Request headers:', JSON.stringify(headers));
    return headers;
  }

  /**
   * Get live TV categories (ITV) via backend proxy
   * This avoids iOS Cookie header restrictions
   */
  async getLiveCategories(): Promise<StalkerCategory[]> {
    // Categories are now fetched via syncAllCategories() which uses the backend proxy
    throw new Error('Use syncAllCategories() instead - it uses backend proxy');
  }

  /**
   * Get VOD categories (contains both movies and series)
   * Exact format from Android TV: GET /load.php?type=vod&action=get_categories&JsHttpRequest=1-xml
   */
  async getVodCategories(): Promise<StalkerCategory[]> {
    try {
      const fullUrl = `${this.portalUrl}/stalker_portal/server/load.php?type=vod&action=get_categories&JsHttpRequest=1-xml`;
      console.log(`📡 Fetching VOD categories from: ${fullUrl}`);
      
      const headers = await this.buildHeaders();
      
      // Use XMLHttpRequest for proper header support in React Native
      const response = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', fullUrl, true);
        
        // Set headers
        Object.entries(headers).forEach(([key, value]) => {
          xhr.setRequestHeader(key, value);
        });
        
        xhr.onload = () => {
          if (xhr.status === 200) {
            resolve(xhr.responseText);
          } else {
            reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
          }
        };
        
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send();
      });
      
      console.log('VOD categories response text:', response.substring(0, 200));
      const data = JSON.parse(response);
      console.log('VOD categories response:', JSON.stringify(data).substring(0, 500));
      
      if (!data || !data.js) {
        console.warn('No js field in response:', data);
        return [];
      }
      
      const categories = data.js || [];
      console.log(`✅ Found ${categories.length} VOD categories`);
      return categories;
    } catch (error) {
      console.error('Failed to fetch VOD categories:', error);
      throw error;
    }
  }

  /**
   * Get channels for a live TV category via backend proxy
   */
  async getChannelsByCategory(categoryId: string, page: number = 1): Promise<{
    channels: StalkerChannel[];
    totalItems: number;
    maxPage: number;
  }> {
    try {
      // Get auth token from AsyncStorage
      const token = await AsyncStorage.getItem('auth_token');
      if (!token) {
        throw new Error('No auth token found');
      }

      const backendUrl = `http://192.168.2.69:3000/api/stalker-proxy/channels/${categoryId}?page=${page}`;
      const response = await axios.get(backendUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      return {
        channels: response.data.channels || [],
        totalItems: response.data.totalItems || 0,
        maxPage: response.data.maxPage || 1,
      };
    } catch (error) {
      console.error('Failed to fetch channels for category:', categoryId, error);
      throw error;
    }
  }

  /**
   * Get VOD items for a category via backend proxy
   */
  async getVodItemsByCategory(categoryId: string, page: number = 1): Promise<{
    items: StalkerVodItem[];
    totalItems: number;
    maxPage: number;
  }> {
    try {
      // Get auth token from AsyncStorage
      const token = await AsyncStorage.getItem('auth_token');
      if (!token) {
        throw new Error('No auth token found');
      }

      const backendUrl = `http://192.168.2.69:3000/api/stalker-proxy/vod/${categoryId}?page=${page}`;
      const response = await axios.get(backendUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      return {
        items: response.data.items || [],
        totalItems: response.data.totalItems || 0,
        maxPage: response.data.maxPage || 1,
      };
    } catch (error) {
      console.error('Failed to fetch VOD items:', error);
      throw error;
    }
  }

  /**
   * Analyze a VOD category to determine if it's movies or series
   * Returns: 'movie', 'series', or 'mixed'
   */
  async analyzeCategoryType(categoryId: string): Promise<'movie' | 'series' | 'mixed'> {
    try {
      const { items } = await this.getVodItemsByCategory(categoryId, 1);
      
      if (items.length === 0) {
        return 'movie'; // Default to movie for empty categories
      }

      const seriesCount = items.filter(item => item.is_series === '1').length;
      const movieCount = items.filter(item => item.is_series === '0' || !item.is_series).length;

      // If more than 80% are series, classify as series
      if (seriesCount > items.length * 0.8) {
        return 'series';
      }
      // If more than 80% are movies, classify as movies
      else if (movieCount > items.length * 0.8) {
        return 'movie';
      }
      // Mixed category
      else {
        return 'mixed';
      }
    } catch (error) {
      console.error('Failed to analyze category:', error);
      return 'movie'; // Default to movie on error
    }
  }

  /**
   * Sync all categories via backend proxy (backend does analysis and caching)
   */
  async syncAllCategories(): Promise<{
    liveCategories: StalkerCategory[];
    movieCategories: StalkerCategory[];
    seriesCategories: StalkerCategory[];
  }> {
    try {
      console.log('📡 Fetching categories from backend proxy...');

      // Get auth token from AsyncStorage
      const token = await AsyncStorage.getItem('auth_token');
      if (!token) {
        throw new Error('No auth token found');
      }

      // Backend proxy fetches from Stalker portal, analyzes categories, and caches in PostgreSQL
      const backendUrl = 'http://192.168.2.69:3000/api/stalker-proxy/categories';
      const response = await axios.get(backendUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      // Backend returns already-analyzed and categorized data from PostgreSQL
      const liveCategories = response.data.liveCategories || [];
      const movieCategories = response.data.movieCategories || [];
      const seriesCategories = response.data.seriesCategories || [];

      console.log(`📺 Found ${liveCategories.length} live categories`);
      console.log(`🎬 Found ${movieCategories.length} movie categories`);
      console.log(`📺 Found ${seriesCategories.length} series categories`);

      // Cache the results
      await AsyncStorage.setItem(STALKER_CACHE_KEY, JSON.stringify({
        liveCategories,
        movieCategories,
        seriesCategories,
        timestamp: Date.now(),
      }));

      return {
        liveCategories,
        movieCategories,
        seriesCategories,
      };
    } catch (error) {
      console.error('❌ Failed to sync categories:', error);
      throw error;
    }
  }

  /**
   * Get cached categories if available
   */
  async getCachedCategories(): Promise<{
    liveCategories: StalkerCategory[];
    movieCategories: StalkerCategory[];
    seriesCategories: StalkerCategory[];
  } | null> {
    try {
      const cached = await AsyncStorage.getItem(STALKER_CACHE_KEY);
      if (cached) {
        const data = JSON.parse(cached);
        // Cache valid for 24 hours
        if (Date.now() - data.timestamp < 24 * 60 * 60 * 1000) {
          return data;
        }
      }
      return null;
    } catch (error) {
      console.error('Failed to get cached categories:', error);
      return null;
    }
  }

  /**
   * Get series seasons via backend proxy
   */
  async getSeriesSeasons(seriesId: string): Promise<any[]> {
    const token = await this.getAuthToken();
    const response = await axios.get(
      `${this.backendUrl}/api/stalker-proxy/series/seasons/${seriesId}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    return response.data.seasons || [];
  }

  /**
   * Get series episodes via backend proxy
   */
  async getSeriesEpisodes(seriesId: string, seasonId: string): Promise<any[]> {
    const token = await this.getAuthToken();
    const response = await axios.get(
      `${this.backendUrl}/api/stalker-proxy/series/episodes/${seriesId}/${seasonId}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    return response.data.episodes || [];
  }

  /**
   * Get episode file info via backend proxy
   * This returns the file data including cmd URL
   */
  async getEpisodeFileInfo(seriesId: string, seasonId: string, episodeId: string): Promise<any> {
    const token = await this.getAuthToken();
    const response = await axios.get(
      `${this.backendUrl}/api/stalker-proxy/episode-info/${seriesId}/${seasonId}/${episodeId}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    const episodeData = response.data.info || {};
    // Return the first file's data which contains id and cmd
    return episodeData;
  }

  /**
   * Get VOD/Movie info via backend proxy
   */
  async getVodInfo(vodId: string): Promise<any> {
    const token = await this.getAuthToken();
    const response = await axios.get(
      `${this.backendUrl}/api/stalker-proxy/vod-info/${vodId}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    return response.data.info || {};
  }

  /**
   * Create streaming link via backend proxy
   */
  async createLink(params: {
    cmd?: string;
    series?: string;
    movie?: string;
    forced_storage?: string;
    disable_ad?: string;
    download?: string;
  }): Promise<any> {
    const token = await this.getAuthToken();
    console.log('🔗 createLink params:', params);
    const response = await axios.post(
      `${this.backendUrl}/api/stalker-proxy/create-link`,
      params,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    console.log('📦 createLink response:', response.data);
    return response.data.link || {};
  }

  /**
   * Get channel stream URL via backend proxy
   */
  async getChannelStream(cmd: string): Promise<any> {
    const token = await this.getAuthToken();
    const response = await axios.get(
      `${this.backendUrl}/api/stalker-proxy/channel-stream`,
      { 
        params: { cmd },
        headers: { 'Authorization': `Bearer ${token}` } 
      }
    );
    return response.data.stream || {};
  }

  /**
   * Batch fetch items with parallel processing (for fast image loading)
   */
  async batchFetchVodItems(categoryId: string, pages: number[]): Promise<StalkerVodItem[]> {
    const token = await this.getAuthToken();
    
    // Fetch multiple pages in parallel
    const promises = pages.map(page =>
      axios.get(
        `${this.backendUrl}/api/stalker-proxy/vod/${categoryId}?page=${page}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      )
    );

    const results = await Promise.all(promises);
    const allItems = results.flatMap(r => r.data.items || []);
    
    return allItems;
  }

  /**
   * Batch fetch channels with parallel processing
   */
  async batchFetchChannels(categoryId: string, pages: number[]): Promise<StalkerChannel[]> {
    const token = await this.getAuthToken();
    
    // Fetch multiple pages in parallel
    const promises = pages.map(page =>
      axios.get(
        `${this.backendUrl}/api/stalker-proxy/channels/${categoryId}?page=${page}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      )
    );

    const results = await Promise.all(promises);
    const allChannels = results.flatMap(r => r.data.channels || []);
    
    return allChannels;
  }

  /**
   * Search VOD (movies and series)
   */
  async searchVod(searchQuery: string, page: number = 1): Promise<{ items: StalkerVodItem[], total: number }> {
    const token = await this.getAuthToken();
    
    const response = await axios.get(
      `${this.backendUrl}/api/stalker-proxy/search`,
      { 
        params: { search: searchQuery, p: page },
        headers: { 'Authorization': `Bearer ${token}` } 
      }
    );
    
    return {
      items: response.data.items || [],
      total: parseInt(response.data.total_items || '0')
    };
  }

  /**
   * Get proxied image URL for better loading in debug mode
   * Note: Token is included in URL since React Native Image component doesn't support headers
   */
  async getProxiedImageUrl(imageUri: string): Promise<string> {
    if (!imageUri) {
      return '';
    }
    
    try {
      const token = await this.getAuthToken();
      const encodedUrl = encodeURIComponent(imageUri);
      const encodedToken = encodeURIComponent(token);
      const fullUrl = `${this.backendUrl}/api/stalker-proxy/image?url=${encodedUrl}&token=${encodedToken}`;
      console.log(`🔗 Generated proxied URL: ${fullUrl.substring(0, 120)}...`);
      return fullUrl;
    } catch (error) {
      console.error('❌ Error generating proxied URL:', error);
      throw error;
    }
  }
}
