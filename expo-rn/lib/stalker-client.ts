import axios from 'axios';
import { Platform } from 'react-native';
import { StalkerCredentials, StalkerSession, StalkerError } from './stalker-api';
import { DebugLogger } from './debug-logger';

interface StalkerResponse<T> {
    js: T;
}

export interface EpgProgram {
    id: string;
    ch_id: string;
    time: string;
    time_to: string;
    duration: string;
    name: string;
    descr: string;
    real_id: string;
    category?: string;
}

export interface ShortEpg {
    current_program: EpgProgram | null;
    next_program: EpgProgram | null;
}

// Stalker Portal credentials from environment variables
const STALKER_CONFIG = {
    bearer: process.env.EXPO_PUBLIC_STALKER_BEARER || '',
    adid: process.env.EXPO_PUBLIC_STALKER_ADID || '',
};

export class StalkerClient {
    private baseUrl: string;
    private mac: string;
    private bearer: string;
    private adid: string;
    private token: string | null = null;

    constructor(credentials: StalkerCredentials) {
        this.baseUrl = credentials.url.endsWith('/') ? credentials.url : `${credentials.url}/`;
        this.mac = credentials.mac;
        // Use pre-existing Bearer token and ADID (no handshake needed)
        this.bearer = STALKER_CONFIG.bearer;
        this.adid = STALKER_CONFIG.adid;
    }

    private async request<T>(action: string, params: Record<string, string> = {}): Promise<T> {
        // Web needs proxy to avoid CORS, native apps can use direct
        if (Platform.OS === 'web') {
            return this.requestViaProxy(action, params);
        } else {
            return this.requestDirect(action, params);
        }
    }

    private async requestViaProxy<T>(action: string, params: Record<string, string> = {}): Promise<T> {
        // Always use Next.js backend on port 3001 for API proxy
        const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
        const isLocalhost = typeof window !== 'undefined' && 
            (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
        
        // Use Next.js proxy on port 2005 (localhost or production domain)
        const host = isLocalhost ? 'localhost:2005' : (typeof window !== 'undefined' ? window.location.host.replace(':3005', ':2005') : 'localhost:2005');
        const proxyUrl = new URL('/api/proxy', `${protocol}//${host}`);
        
        // Pass the target portal URL and credentials to the proxy
        proxyUrl.searchParams.append('url', this.baseUrl);
        proxyUrl.searchParams.append('mac', this.mac);
        if (this.token) {
            proxyUrl.searchParams.append('token', this.token);
        }
        
        // Stalker params - only add type=stb if params don't already have a type
        if (!params.type) {
            proxyUrl.searchParams.append('type', 'stb');
        }
        proxyUrl.searchParams.append('action', action);
        
        // Append other params
        Object.entries(params).forEach(([key, value]) => {
            proxyUrl.searchParams.append(key, value);
        });

        try {
            DebugLogger.proxyCall(proxyUrl.toString(), { action, ...params });
            const response = await axios.get(proxyUrl.toString(), { timeout: 10000 });
            const data = response.data;
            
            DebugLogger.proxyResponse(proxyUrl.toString(), response.status, data);
            
            if (data && data.js) {
                return data.js as T;
            }
            
            return data as T;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                console.error('[StalkerClient] Proxy error:', error.message);
                DebugLogger.proxyError(proxyUrl.toString(), error);
                throw new StalkerError(`Request failed: ${error.message}`);
            }
            DebugLogger.proxyError(proxyUrl.toString(), error);
            throw error;
        }
    }

    private async requestDirect<T>(action: string, params: Record<string, string> = {}): Promise<T> {
        // Direct request to Stalker portal for native apps
        const url = new URL('server/load.php', this.baseUrl);
        
        const headers: Record<string, string> = {
            'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
            'X-User-Agent': 'Model: MAG270; Link: WiFi',
            'Referer': this.baseUrl + 'c/',
            'Authorization': `Bearer ${this.bearer}`,
            'Cookie': `mac=${this.mac.toLowerCase()}; timezone=America/Toronto; adid=${this.adid};${this.token ? ` st=${this.token};` : ''}`
        };

        if (!params.type) {
            url.searchParams.append('type', 'stb');
        }
        url.searchParams.append('action', action);
        url.searchParams.append('JsHttpRequest', '1-xml');
        
        Object.entries(params).forEach(([key, value]) => {
            url.searchParams.append(key, value);
        });

        try {
            const response = await axios.get(url.toString(), {
                headers,
                timeout: 10000,
            });
            
            const data = response.data;
            
            if (data && data.js) {
                const jsContent = data.js;
                return jsContent as T;
            }
            
            return data as T;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                console.error('[StalkerClient] Axios error:', error.message);
                throw new StalkerError(`Request failed: ${error.message}`);
            }
            console.error('[StalkerClient] Error:', error);
            throw error;
        }
    }

    async handshake(): Promise<void> {
        try {
            const response = await this.request<{ token: string }>('handshake');
            this.token = response.token;
        } catch (error) {
            console.error('Handshake failed', error);
            throw new StalkerError('Failed to connect to portal');
        }
    }

    async getCategories(): Promise<any[]> {
        // type=itv&action=get_genres
        return this.request<any[]>('get_genres', { type: 'itv' });
    }

    async getMovieCategories(): Promise<any[]> {
        // type=vod&action=get_categories
        return this.request<any[]>('get_categories', { type: 'vod' });
    }

    async getSeriesCategories(): Promise<any[]> {
        const allCategories = await this.getMovieCategories();
        const seriesKeywords = [
            'SERIES', 'SERIALS', 'SERIAL', 'WEB_SERIES', 'TV_SERIALS',
            'ANIME', 'DOCUMENTARY', 'KOREAN', 'KIDS', 'MUSIC ALBUMS',
            'DUBB', 'DRAMA', 'SHOWS', 'EVENTS', 'CRICKET',
            'ADULT', 'CELEBRITY'
        ];
        
        return allCategories.filter((cat: any) => {
            const combinedText = `${cat.title} ${cat.alias}`.toUpperCase();
            return seriesKeywords.some(keyword => combinedText.includes(keyword));
        });
    }

    async getChannels(categoryId: string, page: number = 1): Promise<{ data: any[], total: number }> {
        const response = await this.request<{ data: any[], total?: number, total_items?: string }>('get_ordered_list', { 
            type: 'itv',
            genre: categoryId,
            force_ch_link_check: '',
            fav: '0',
            sortby: 'number',
            hd: '0',
            p: page.toString()
        });
        
        const total = response.total_items ? parseInt(response.total_items, 10) : (response.total || 0);
        
        return {
            data: response.data || [],
            total: total
        };
    }

    async getMovies(categoryId: string, page: number = 1): Promise<{ data: any[], total: number }> {
        const response = await this.request<{ data: any[], total?: number, total_items?: string }>('get_ordered_list', { 
            type: 'vod',
            category: categoryId,
            genre: '0',
            sortby: '',
            p: page.toString()
        });
        
        const total = response.total_items ? parseInt(response.total_items, 10) : (response.total || 0);
        
        return {
            data: response.data || [],
            total: total
        };
    }

    async getSeries(categoryId: string, page: number = 1): Promise<{ data: any[], total: number }> {
        const response = await this.request<{ data: any[], total?: number, total_items?: string }>('get_ordered_list', { 
            type: 'vod',
            category: categoryId,
            genre: '0',
            sortby: '',
            p: page.toString()
        });
        
        const total = response.total_items ? parseInt(response.total_items, 10) : (response.total || 0);
        
        return {
            data: response.data || [],
            total: total
        };
    }

    async searchContent(query: string, page: number = 1): Promise<{ data: any[], total: number }> {
        const response = await this.request<{ data: any[], total?: number, total_items?: string }>('get_ordered_list', { 
            type: 'vod',
            category: '0',
            search: query,
            sortby: 'name',
            p: page.toString()
        });
        
        const total = response.total_items ? parseInt(response.total_items, 10) : (response.total || 0);
        
        return {
            data: response.data || [],
            total: total
        };
    }

    async getSeriesSeasons(seriesId: string): Promise<any[]> {
        // First request to get total count
        const firstResponse = await this.request<{ data: any[], total_items?: string }>('get_ordered_list', { 
            type: 'vod',
            movie_id: seriesId,
            p: '1'
        });
        
        const totalItems = firstResponse.total_items ? parseInt(firstResponse.total_items, 10) : (firstResponse.data?.length || 0);
        const itemsPerPage = 14;
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        
        // If only one page, return immediately
        if (totalPages <= 1) {
            return firstResponse.data || [];
        }
        
        // Fetch remaining pages in parallel
        const pagePromises = [];
        for (let page = 2; page <= totalPages; page++) {
            pagePromises.push(
                this.request<{ data: any[] }>('get_ordered_list', { 
                    type: 'vod',
                    movie_id: seriesId,
                    p: page.toString()
                })
            );
        }
        
        const remainingPages = await Promise.all(pagePromises);
        
        // Combine all results
        const allSeasons = [
            ...(firstResponse.data || []),
            ...remainingPages.flatMap(response => response.data || [])
        ];
        
        return allSeasons;
    }

    async getSeriesEpisodes(seriesId: string, seasonId: string, page: number = 1): Promise<{ data: any[], total: number }> {
        // First request to get total count
        const firstResponse = await this.request<{ data: any[], total?: number, total_items?: string }>('get_ordered_list', { 
            type: 'vod',
            movie_id: seriesId,
            season_id: seasonId,
            p: '1'
        });
        
        const totalItems = firstResponse.total_items ? parseInt(firstResponse.total_items, 10) : (firstResponse.data?.length || 0);
        const itemsPerPage = 14;
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        
        // If only one page, return immediately
        if (totalPages <= 1) {
            return {
                data: firstResponse.data || [],
                total: totalItems
            };
        }
        
        // Fetch remaining pages in parallel
        const pagePromises = [];
        for (let page = 2; page <= totalPages; page++) {
            pagePromises.push(
                this.request<{ data: any[] }>('get_ordered_list', { 
                    type: 'vod',
                    movie_id: seriesId,
                    season_id: seasonId,
                    p: page.toString()
                })
            );
        }
        
        const remainingPages = await Promise.all(pagePromises);
        
        // Combine all results
        const allEpisodes = [
            ...(firstResponse.data || []),
            ...remainingPages.flatMap(response => response.data || [])
        ];
        
        return {
            data: allEpisodes,
            total: totalItems
        };
    }

    async getSeriesFileInfo(seriesId: string, seasonId: string, episodeId: string): Promise<any> {
        const response = await this.request<{ data: any[] }>('get_ordered_list', { 
            type: 'vod',
            movie_id: seriesId,
            season_id: seasonId,
            episode_id: episodeId
        });
        
        return response.data && response.data.length > 0 ? response.data[0] : null;
    }

    async getMovieInfo(movieId: string): Promise<any> {
        const response = await this.request<{ data: any[] }>('get_ordered_list', { 
            type: 'vod',
            movie_id: movieId
        });
        
        return response.data && response.data.length > 0 ? response.data[0] : null;
    }

    async getStreamUrl(cmd: string, type: string = 'itv', episodeNumber?: string): Promise<string> {
        if (cmd && cmd.startsWith('http') && !cmd.includes('localhost')) {
            return cmd;
        }
        
        const params: Record<string, string> = {
            type: type === 'series' ? 'vod' : type,
            cmd: cmd,
            force_ch_link_check: '0'
        };
        
        if (type === 'series' && episodeNumber) {
            params.series = episodeNumber;
        } else if (type === 'series') {
            params.series = '1';
        }
        
        const response = await this.request<{ cmd: string, id?: number }>('create_link', params);
        
        if (!response || !response.cmd) {
             console.error('[StalkerClient] Invalid response, no cmd field found');
             throw new Error('Failed to generate stream link - no cmd in response');
        }
        
        return response.cmd;
    }

    async getEpg(channelId: string, period: number = 7): Promise<EpgProgram[]> {
        const response = await this.request<EpgProgram[]>('get_epg_info', { 
            type: 'itv',
            ch_id: channelId,
            period: period.toString()
        });
        
        return response || [];
    }

    async getShortEpg(channelId: string): Promise<ShortEpg> {
        const response = await this.request<ShortEpg>('get_short_epg', { 
            type: 'itv',
            ch_id: channelId
        });
        
        return response || { current_program: null, next_program: null };
    }
}
