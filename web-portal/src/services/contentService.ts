import axios from 'axios'
import { authService } from './authService'
import { cache } from '@/utils/cache'
import { apiCache } from '@/utils/api-cache'

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
  // TMDB enriched data
  tmdb?: {
    id: number
    posterUrl: string | null
    backdropUrl: string | null
    rating: number
    voteCount: number
    overview: string
    releaseDate?: string
    genres?: string[]
    imdbId?: string
  }
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
      // Use persistent cache for categories
      const data = await apiCache.fetch(`${API_URL}/sync/pull`, {
        headers: this.getHeaders(),
      });
      const categories = data.data?.categories || [];
      
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
      const url = `${API_URL}/stalker-proxy/channels/${categoryId}?page=${page}`;
      const response = await apiCache.fetch(url, {
        headers: this.getHeaders(),
      });

      return {
        items: response.channels || [],
        totalItems: response.totalItems || 0,
        maxPage: response.maxPage || 1,
        currentPage: page
      };
    } catch (error) {
      console.error('Failed to fetch live channels:', error)
      return { items: [], totalItems: 0, maxPage: 1, currentPage: page }
    }
  }

  // Get VOD content (movies/series) for a category
  async getVODContent(categoryId: string, page: number = 1): Promise<PaginatedContent> {
    try {
      const url = `${API_URL}/stalker-proxy/vod/${categoryId}?page=${page}`;
      const response = await apiCache.fetch(url, {
        headers: this.getHeaders(),
      });

      return {
        items: response.items || [],
        totalItems: response.totalItems || 0,
        maxPage: response.maxPage || 1,
        currentPage: page
      };
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

  // Enrich content with TMDB data
  async enrichWithTMDB(item: ContentItem, type: 'movie' | 'tv'): Promise<ContentItem> {
    try {
      const title = item.name || item.title || '';
      if (!title) return item;

      // Check if already enriched (cache)
      if (item.tmdb) return item;

      console.log(`[TMDB] Enriching ${type}: "${title}"`);

      // Fetch TMDB data
      const response = await fetch(
        `/api/tmdb?action=smart-search&title=${encodeURIComponent(title)}&type=${type}`
      );
      
      if (!response.ok) {
        console.log(`[TMDB] Failed to fetch for "${title}": ${response.status}`);
        return item;
      }

      const data = await response.json();
      if (!data.success || !data.details) {
        console.log(`[TMDB] No match found for "${title}"`);
        return item;
      }

      const details = data.details;
      console.log(`[TMDB] Match found for "${title}":`, {
        tmdbId: details.id,
        title: details.title || details.name,
        rating: details.vote_average,
        year: details.release_date || details.first_air_date,
      });

      // Add TMDB data to item
      return {
        ...item,
        tmdb: {
          id: details.id,
          posterUrl: details.poster_path 
            ? `https://image.tmdb.org/t/p/w500${details.poster_path}`
            : null,
          backdropUrl: details.backdrop_path
            ? `https://image.tmdb.org/t/p/w1280${details.backdrop_path}`
            : null,
          rating: details.vote_average || 0,
          voteCount: details.vote_count || 0,
          overview: details.overview || '',
          releaseDate: details.release_date || details.first_air_date,
          genres: details.genres?.map((g: any) => g.name) || [],
          imdbId: details.imdb_id,
        },
      };
    } catch (error) {
      console.error(`[TMDB] Error enriching "${item.name || item.title}":`, error);
      return item;
    }
  }

  // Batch enrich multiple items
  async enrichBatchWithTMDB(items: ContentItem[], type: 'movie' | 'tv'): Promise<ContentItem[]> {
    try {
      console.log(`[TMDB] Batch enriching ${items.length} ${type}s (processing first 10)`);
      
      // Enrich up to 10 items at a time to avoid rate limits
      const enrichPromises = items.slice(0, 10).map(item => this.enrichWithTMDB(item, type));
      const enriched = await Promise.all(enrichPromises);
      
      const successCount = enriched.filter(item => item.tmdb).length;
      console.log(`[TMDB] Batch complete: ${successCount}/10 enriched`);
      
      // Return enriched items plus remaining items
      return [...enriched, ...items.slice(10)];
    } catch (error) {
      console.error('[TMDB] Batch enrichment failed:', error);
      return items;
    }
  }

  // Get continue watching (recent watch progress)
  async getContinueWatching(limit: number = 10): Promise<any[]> {
    try {
      const response = await axios.get(`${API_URL}/progress`, {
        headers: this.getHeaders(),
      })
      
      if (response.data.success && response.data.progress) {
        return response.data.progress
          .filter((p: any) => p.current_position > 0 && p.current_position < p.duration * 0.95) // Not finished
          .slice(0, limit)
      }
      
      return []
    } catch (error) {
      console.error('Failed to fetch continue watching:', error)
      return []
    }
  }

  // Get user's favorite categories
  async getFavoriteCategories(limit: number = 10): Promise<any[]> {
    try {
      const response = await axios.get(`${API_URL}/favorites`, {
        headers: this.getHeaders(),
      })
      
      if (response.data.success && response.data.favorites) {
        // Filter for category type favorites
        const categoryFavorites = response.data.favorites
          .filter((f: any) => f.content_type === 'CATEGORY')
          .slice(0, limit)
        
        return categoryFavorites
      }
      
      return []
    } catch (error) {
      console.error('Failed to fetch favorite categories:', error)
      return []
    }
  }

  // Get user's favorite channel (single most favorite)
  async getFavoriteChannel(): Promise<any | null> {
    try {
      const response = await axios.get(`${API_URL}/user-settings`, {
        headers: this.getHeaders(),
      })
      
      if (response.data.success && response.data.settings?.favorite_channel_id) {
        const channelId = response.data.settings.favorite_channel_id
        
        // Fetch channel details from analytics or favorites
        const analyticsResponse = await axios.get(`${API_URL}/channel-analytics/top?limit=100`, {
          headers: this.getHeaders(),
        })
        
        if (analyticsResponse.data.success) {
          const channel = analyticsResponse.data.channels.find((c: any) => c.channel_id === channelId)
          return channel || null
        }
      }
      
      return null
    } catch (error) {
      console.error('Failed to fetch favorite channel:', error)
      return null
    }
  }

  // Set user's favorite channel
  async setFavoriteChannel(channelId: string): Promise<boolean> {
    try {
      const response = await axios.post(
        `${API_URL}/user-settings/favorite-channel`,
        { channelId },
        { headers: this.getHeaders() }
      )
      
      return response.data.success
    } catch (error) {
      console.error('Failed to set favorite channel:', error)
      return false
    }
  }

  // Get watch history
  async getWatchHistory(limit: number = 20): Promise<any[]> {
    try {
      const response = await axios.get(`${API_URL}/watch-history?limit=${limit}`, {
        headers: this.getHeaders(),
      })
      
      if (response.data.success && response.data.history) {
        return response.data.history
      }
      
      return []
    } catch (error) {
      console.error('Failed to fetch watch history:', error)
      return []
    }
  }

  // Get EPG (Electronic Program Guide) for a channel
  async getChannelEpg(channelId: string, period: number = 4): Promise<any> {
    try {
      const url = `${API_URL}/stalker-proxy/epg/${channelId}?period=${period}`;
      console.log('🔍 Fetching EPG from:', url);
      
      const response = await axios.get(url, {
        headers: this.getHeaders(),
      });

      console.log('📡 EPG API response:', {
        success: response.data.success,
        hasCurrent: !!response.data.epg?.current_program,
        hasNext: !!response.data.epg?.next_program,
        programCount: response.data.epg?.programs?.length || 0
      });

      if (response.data.success) {
        return response.data.epg;
      }

      return {
        current_program: null,
        next_program: null,
        programs: []
      };
    } catch (error) {
      console.error('❌ Failed to fetch channel EPG:', error);
      if (axios.isAxiosError(error)) {
        console.error('API Error:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          message: error.message
        });
      }
      return {
        current_program: null,
        next_program: null,
        programs: []
      };
    }
  }

  // Get short EPG (current and next program) for a channel
  async getShortEpg(channelId: string): Promise<any> {
    try {
      const url = `${API_URL}/stalker-proxy/epg-short/${channelId}`;
      const response = await axios.get(url, {
        headers: this.getHeaders(),
      });

      if (response.data.success) {
        return response.data.epg;
      }

      return {
        current_program: null,
        next_program: null
      };
    } catch (error) {
      console.error('Failed to fetch short EPG:', error);
      return {
        current_program: null,
        next_program: null
      };
    }
  }

  // Get top/favorite channels from analytics
  async getTopChannels(limit: number = 10): Promise<any[]> {
    try {
      const response = await axios.get(`${API_URL}/channel-analytics/top?limit=${limit}`, {
        headers: this.getHeaders(),
      })
      
      if (response.data.success && response.data.channels) {
        return response.data.channels
      }
      
      return []
    } catch (error) {
      console.error('Failed to fetch top channels:', error)
      return []
    }
  }

  // Get recently watched channels from analytics (without duplicates)
  async getRecentChannels(limit: number = 10): Promise<any[]> {
    try {
      const response = await axios.get(`${API_URL}/channel-analytics/recent?limit=${limit}`, {
        headers: this.getHeaders(),
      })
      
      if (response.data.success && response.data.channels) {
        return response.data.channels
      }
      
      return []
    } catch (error) {
      console.error('Failed to fetch recent channels:', error)
      return []
    }
  }
}

export const contentService = new ContentService()
