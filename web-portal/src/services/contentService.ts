import axios from 'axios'
import { authService } from './authService'
import { cache } from '@/utils/cache'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

export interface ContentItem {
  id: string
  name: string
  title?: string
  description?: string
  logo?: string
  screenshot_uri?: string
  imageUrl?: string
  cmd?: string
  url?: string
  number?: string
  is_series?: number
  type?: string
}

export interface Category {
  id: string
  category_id: string
  name: string
  type: string
  is_enabled: boolean
  censored?: number
}

export interface ContentCategory extends Category {
  items?: ContentItem[]
}

export interface PaginatedContent {
  items: ContentItem[]
  totalItems: number
  maxPage: number
  currentPage: number
}

const PROVIDER_URL_KEY = 'provider_url'
const PROVIDER_URL_TIMESTAMP_KEY = 'provider_url_timestamp'
const CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours

class ContentService {
  private providerUrlPromise: Promise<string | null> | null = null

  private getHeaders() {
    return authService.getAuthHeader()
  }

  // Fetch provider URL from backend or localStorage
  private async getProviderUrl(): Promise<string | null> {
    // Check localStorage first
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem(PROVIDER_URL_KEY)
      const timestamp = localStorage.getItem(PROVIDER_URL_TIMESTAMP_KEY)
      
      if (cached && timestamp) {
        const age = Date.now() - parseInt(timestamp)
        if (age < CACHE_DURATION) {
          return cached
        }
      }
    }

    // If already fetching, wait for that promise
    if (this.providerUrlPromise) {
      return this.providerUrlPromise
    }

    this.providerUrlPromise = (async () => {
      try {
        const response = await axios.get(`${API_URL}/sync/pull`, {
          headers: this.getHeaders(),
        })

        const providers = response.data.data?.providers || []
        const activeProvider = providers.find((p: any) => p.is_active)
        
        if (activeProvider?.server_url) {
          const url = activeProvider.server_url
          // Store in localStorage
          if (typeof window !== 'undefined') {
            localStorage.setItem(PROVIDER_URL_KEY, url)
            localStorage.setItem(PROVIDER_URL_TIMESTAMP_KEY, Date.now().toString())
          }
          return url
        }

        return null
      } catch (error) {
        console.error('Failed to fetch provider URL:', error)
        return null
      } finally {
        this.providerUrlPromise = null
      }
    })()

    return this.providerUrlPromise
  }

  // Build direct Stalker portal image URL
  async getImageUrl(imageUri?: string): Promise<string | undefined> {
    if (!imageUri) return undefined
    
    // If it's already a full URL, return as is
    if (imageUri.startsWith('http://') || imageUri.startsWith('https://')) {
      return imageUri
    }
    
    // Get provider URL from database
    const baseUrl = await this.getProviderUrl()
    if (!baseUrl) return undefined

    // Build direct Stalker portal URL
    const cleanPath = imageUri.startsWith('/') ? imageUri.slice(1) : imageUri
    return `${baseUrl}/${cleanPath}`
  }

  // Get categories by type
  async getCategories(type?: 'LIVE' | 'MOVIE' | 'SERIES'): Promise<Category[]> {
    try {
      // Use cache for categories
      const cacheKey = type ? `categories:${type}` : 'categories:all';
      
      const categories = await cache.getOrFetch(
        cacheKey,
        async () => {
          const response = await axios.get(`${API_URL}/sync/pull`, {
            headers: this.getHeaders(),
          });
          return response.data.data?.categories || [];
        },
        5 * 60 * 1000 // 5 minutes TTL for categories
      );
      
      if (type) {
        return categories
          .filter((cat: Category) => cat.type === type && cat.is_enabled)
          .sort((a: Category, b: Category) => {
            // Move censored to end
            if ((a.censored || 0) !== (b.censored || 0)) {
              return (a.censored || 0) - (b.censored || 0)
            }
            // Sort alphabetically
            return a.name.localeCompare(b.name)
          })
      }

      return categories.filter((cat: Category) => cat.is_enabled)
    } catch (error) {
      console.error('Failed to fetch categories:', error)
      return []
    }
  }

  // Get live TV channels for a category
  async getLiveChannels(categoryId: string, page: number = 1): Promise<PaginatedContent> {
    try {
      // Use cache for channel pages
      const cacheKey = `channels:${categoryId}:page:${page}`;
      
      return await cache.getOrFetch(
        cacheKey,
        async () => {
          const response = await axios.get(
            `${API_URL}/stalker-proxy/channels/${categoryId}`,
            {
              headers: this.getHeaders(),
              params: { page }
            }
          );

          return {
            items: response.data.channels || [],
            totalItems: response.data.totalItems || 0,
            maxPage: response.data.maxPage || 1,
            currentPage: page
          };
        },
        3 * 60 * 1000 // 3 minutes TTL for channels
      );
    } catch (error) {
      console.error('Failed to fetch live channels:', error)
      return { items: [], totalItems: 0, maxPage: 1, currentPage: page }
    }
  }

  // Get VOD content (movies/series) for a category
  async getVODContent(categoryId: string, page: number = 1): Promise<PaginatedContent> {
    try {
      // Use cache for VOD pages
      const cacheKey = `vod:${categoryId}:page:${page}`;
      
      return await cache.getOrFetch(
        cacheKey,
        async () => {
          const response = await axios.get(
            `${API_URL}/stalker-proxy/vod/${categoryId}`,
            {
              headers: this.getHeaders(),
              params: { page }
            }
          );

          return {
            items: response.data.items || [],
            totalItems: response.data.totalItems || 0,
            maxPage: response.data.maxPage || 1,
            currentPage: page
          };
        },
        3 * 60 * 1000 // 3 minutes TTL for VOD content
      );
    } catch (error) {
      console.error('Failed to fetch VOD content:', error)
      return { items: [], totalItems: 0, maxPage: 1, currentPage: page }
    }
  }

  // Load first 3 pages of content for a category
  async loadInitialContent(categoryId: string, isLive: boolean = false): Promise<ContentItem[]> {
    try {
      const fetchFn = isLive ? this.getLiveChannels.bind(this) : this.getVODContent.bind(this)
      
      // Load first 3 pages in parallel for faster initial display
      const [page1, page2, page3] = await Promise.all([
        fetchFn(categoryId, 1),
        fetchFn(categoryId, 2),
        fetchFn(categoryId, 3)
      ])

      const allItems = [...page1.items, ...page2.items, ...page3.items]
      
      // Deduplicate by ID to avoid React key warnings
      const uniqueItems = Array.from(
        new Map(allItems.map(item => [item.id, item])).values()
      )

      return uniqueItems
    } catch (error) {
      console.error('Failed to load initial content:', error)
      return []
    }
  }

  // Get all channels for navigation (prev/next)
  async getAllChannels(): Promise<ContentItem[]> {
    try {
      // Use cache for all channels
      const cacheKey = 'all_channels';
      
      return await cache.getOrFetch(
        cacheKey,
        async () => {
          console.log('[ContentService] Fetching all channels from all categories...');
          
          // First get all LIVE categories
          const categories = await this.getCategories('LIVE');
          console.log('[ContentService] Found categories:', categories.length);
          
          if (categories.length === 0) {
            console.warn('[ContentService] No LIVE categories found');
            return [];
          }
          
          // Fetch channels from all categories in parallel
          const channelPromises = categories.map(cat => 
            this.getLiveChannels(cat.category_id, 1)
              .then(result => result.items)
              .catch(error => {
                console.error(`[ContentService] Failed to fetch channels for category ${cat.name}:`, error);
                return [];
              })
          );
          
          const channelArrays = await Promise.all(channelPromises);
          const allChannels = channelArrays.flat();
          
          console.log('[ContentService] Fetched all channels:', allChannels.length);
          return allChannels;
        },
        3 * 60 * 1000 // 3 minutes TTL
      );
    } catch (error) {
      console.error('[ContentService] Failed to fetch all channels:', error);
      return [];
    }
  }

  // Get featured content (mix of content from different categories)
  async getFeaturedContent(): Promise<ContentItem[]> {
    try {
      // Get some content from the first few categories
      const categories = await this.getCategories()
      if (categories.length === 0) return []

      // Take first 3 categories and get first page from each
      const featuredPromises = categories.slice(0, 3).map(async (cat) => {
        if (cat.type === 'LIVE') {
          const result = await this.getLiveChannels(cat.category_id, 1)
          return result.items.slice(0, 5) // Take 5 items from each
        } else {
          const result = await this.getVODContent(cat.category_id, 1)
          return result.items.slice(0, 5)
        }
      })

      const featuredArrays = await Promise.all(featuredPromises)
      return featuredArrays.flat()
    } catch (error) {
      console.error('Failed to fetch featured content:', error)
      return []
    }
  }

  // Get movies categories with content
  async getMovies(): Promise<ContentCategory[]> {
    try {
      const categories = await this.getCategories('MOVIE')
      
      // Fetch first page of content for each category in parallel
      const categoriesWithContent = await Promise.all(
        categories.map(async (cat) => {
          const result = await this.getVODContent(cat.category_id, 1)
          return {
            ...cat,
            items: result.items.slice(0, 20) // Limit to 20 items per category
          }
        })
      )
      
      return categoriesWithContent
    } catch (error) {
      console.error('Failed to fetch movies:', error)
      return []
    }
  }

  // Get series categories with content
  async getSeries(): Promise<ContentCategory[]> {
    try {
      const categories = await this.getCategories('SERIES')
      
      // Fetch first page of content for each category in parallel
      const categoriesWithContent = await Promise.all(
        categories.map(async (cat) => {
          const result = await this.getVODContent(cat.category_id, 1)
          return {
            ...cat,
            items: result.items.slice(0, 20)
          }
        })
      )
      
      return categoriesWithContent
    } catch (error) {
      console.error('Failed to fetch series:', error)
      return []
    }
  }

  // Get live TV categories with content
  async getLiveTV(): Promise<ContentCategory[]> {
    try {
      const categories = await this.getCategories('LIVE')
      
      // Fetch first page of content for each category in parallel
      const categoriesWithContent = await Promise.all(
        categories.map(async (cat) => {
          const result = await this.getLiveChannels(cat.category_id, 1)
          return {
            ...cat,
            items: result.items.slice(0, 20)
          }
        })
      )
      
      return categoriesWithContent
    } catch (error) {
      console.error('Failed to fetch live TV:', error)
      return []
    }
  }
}

export const contentService = new ContentService()
