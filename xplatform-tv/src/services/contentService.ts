import {apiClient} from './apiClient';

export interface Category {
  id: string;
  category_id: string;
  name: string;
  type: 'MOVIE' | 'SERIES' | 'LIVE';
  is_enabled?: boolean;
}

export interface ContentItem {
  id: string;
  stream_id?: string;
  name: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  screenshot_uri?: string;
  poster?: string;
  backdrop?: string;
  rating?: number;
  year?: number;
  duration?: number;
  category_id?: string;
  stream_url?: string;
}

export interface VODContent {
  items: ContentItem[];
  total: number;
  page: number;
  hasMore: boolean;
}

export interface SeriesInfo {
  id: string;
  name: string;
  description?: string;
  cover?: string;
  backdrop?: string;
  rating?: number;
  year?: number;
  genre?: string;
  cast?: string;
  director?: string;
  seasons: Season[];
}

export interface Season {
  season_number: number;
  name: string;
  episode_count: number;
  episodes: Episode[];
}

export interface Episode {
  id: string;
  episode_num: number;
  title: string;
  duration?: string;
  info?: {
    movie_image?: string;
    plot?: string;
    rating?: number;
  };
  stream_url?: string;
}

export interface LiveChannel {
  id: string;
  stream_id: string;
  num: string;
  name: string;
  stream_icon?: string;
  category_id: string;
  stream_url?: string;
  epg_channel_id?: string;
  tv_archive?: number;
  tv_archive_duration?: number;
}

class ContentService {
  // Categories
  async getCategories(type: 'MOVIE' | 'SERIES' | 'LIVE'): Promise<Category[]> {
    try {
      const response = await apiClient.get<{
        success: boolean;
        data: {
          categories: Category[];
        };
      }>('/api/sync/pull');

      const categories = response.data?.categories || [];

      return categories
        .filter(cat => cat.type === type && cat.is_enabled !== false)
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      console.error('Error fetching categories:', error);
      return [];
    }
  }

  // VOD Content (Movies/Series)
  async getVODContent(
    categoryId: string,
    page: number = 1,
  ): Promise<VODContent> {
    try {
      const response = await apiClient.get<{
        items: ContentItem[];
        totalItems: number;
        maxPage: number;
        currentPage: number;
      }>(`/api/stalker-proxy/vod/${categoryId}?page=${page}`);

      return {
        items: response.items || [],
        total: response.totalItems || 0,
        page: response.currentPage || 1,
        hasMore: page < (response.maxPage || 1),
      };
    } catch (error) {
      console.error('Error fetching VOD content:', error);
      return {items: [], total: 0, page: 1, hasMore: false};
    }
  }

  // Series Info
  async getSeriesInfo(seriesId: string): Promise<SeriesInfo | null> {
    try {
      const response = await apiClient.get<{
        success: boolean;
        series: SeriesInfo;
      }>(`/api/stalker/series/${seriesId}`);

      return response.series || null;
    } catch (error) {
      console.error('Error fetching series info:', error);
      return null;
    }
  }

  // Live TV Channels
  async getLiveChannels(categoryId?: string): Promise<LiveChannel[]> {
    try {
      const url = categoryId
        ? `/api/stalker-proxy/channels/${categoryId}`
        : '/api/stalker-proxy/channels';

      const response = await apiClient.get<{
        channels: LiveChannel[];
      }>(url);

      return response.channels || [];
    } catch (error) {
      console.error('Error fetching live channels:', error);
      return [];
    }
  }

  // Get Stream URL
  async getStreamUrl(
    streamId: string,
    type: 'movie' | 'series' | 'live',
  ): Promise<string | null> {
    try {
      const response = await apiClient.post<{
        success: boolean;
        url: string;
      }>('/api/stalker/stream-url', {
        stream_id: streamId,
        type,
      });

      return response.url || null;
    } catch (error) {
      console.error('Error fetching stream URL:', error);
      return null;
    }
  }

  // Search
  async search(query: string): Promise<ContentItem[]> {
    try {
      const response = await apiClient.get<{
        success: boolean;
        results: ContentItem[];
      }>(`/api/stalker/search?q=${encodeURIComponent(query)}`);

      return response.results || [];
    } catch (error) {
      console.error('Error searching:', error);
      return [];
    }
  }
}

export const contentService = new ContentService();
