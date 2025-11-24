import { StalkerCredentials, StalkerSession, StalkerError } from './stalker-api';

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

export class StalkerClient {
    private baseUrl: string;
    private mac: string;
    private token: string | null = null;
    private bearer: string;
    private adid: string;

    constructor(credentials: StalkerCredentials);
    constructor(url: string, bearer: string, adid: string);
    constructor(credentialsOrUrl: StalkerCredentials | string, bearer?: string, adid?: string) {
        if (typeof credentialsOrUrl === 'string') {
            // New signature: (url, bearer, adid)
            this.baseUrl = credentialsOrUrl.endsWith('/') ? credentialsOrUrl : `${credentialsOrUrl}/`;
            this.bearer = bearer || '';
            this.adid = adid || '';
            this.mac = ''; // Will be set during handshake
        } else {
            // Old signature: (credentials)
            this.baseUrl = credentialsOrUrl.url.endsWith('/') ? credentialsOrUrl.url : `${credentialsOrUrl.url}/`;
            this.mac = credentialsOrUrl.mac;
            this.bearer = '';
            this.adid = '';
        }
    }

    private async request<T>(action: string, params: Record<string, string> = {}): Promise<T> {
        const isServer = typeof window === 'undefined';

        if (isServer) {
            // Server-side: Call Stalker portal directly with proper headers
            return this.requestDirect<T>(action, params);
        } else {
            // Client-side: Use proxy to avoid CORS
            return this.requestViaProxy<T>(action, params);
        }
    }

    private async requestDirect<T>(action: string, params: Record<string, string> = {}): Promise<T> {
        // Direct server-side request to Stalker portal
        const forwardParams = new URLSearchParams();
        
        // Stalker params
        if (!params.type) {
            forwardParams.append('type', 'stb');
        }
        forwardParams.append('action', action);
        
        // Append other params
        Object.entries(params).forEach(([key, value]) => {
            forwardParams.append(key, value);
        });

        // Build final URL
        let finalUrl = this.baseUrl;
        if (!finalUrl.endsWith('/')) {
            finalUrl += '/';
        }
        finalUrl = `${finalUrl}server/load.php?${forwardParams.toString()}`;

        // Get credentials from instance or environment (prefer instance, then server-side vars, fallback to public)
        const bearer = this.bearer || process.env.STALKER_BEARER || process.env.NEXT_PUBLIC_STALKER_BEARER || '';
        const adid = this.adid || process.env.STALKER_ADID || process.env.NEXT_PUBLIC_STALKER_ADID || '';

        const headers: HeadersInit = {
            'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
            'X-User-Agent': 'Model: MAG270; Link: WiFi',
            'Referer': this.baseUrl + 'c/',
            'Authorization': `Bearer ${bearer}`,
            'Accept-Encoding': 'gzip',
            'Cookie': `mac=${this.mac.toLowerCase()}; timezone=America/Toronto; adid=${adid};${this.token ? ` st=${this.token};` : ''}`,
        };

        try {
            const response = await fetch(finalUrl, { method: 'GET', headers });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[StalkerClient] Direct request failed: ${response.status} ${response.statusText}`);
                
                // Handle rate limiting with retry
                if (response.status === 429) {
                    throw new Error('RATE_LIMIT');
                }
                
                throw new Error(`Portal request failed: ${response.status}`);
            }

            const data = await response.json();
            
            if (data && data.js) {
                return data.js as T;
            }
            
            return data as T;
        } catch (error) {
            console.error('[StalkerClient] Direct request error:', error);
            throw error;
        }
    }

    private async requestViaProxy<T>(action: string, params: Record<string, string> = {}): Promise<T> {
        // Client-side: use proxy
        const proxyUrl = new URL('/api/proxy', window.location.origin);
        
        proxyUrl.searchParams.append('url', this.baseUrl);
        proxyUrl.searchParams.append('mac', this.mac);
        if (this.token) {
            proxyUrl.searchParams.append('token', this.token);
        }

        if (!params.type) {
            proxyUrl.searchParams.append('type', 'stb');
        }
        proxyUrl.searchParams.append('action', action);
        
        Object.entries(params).forEach(([key, value]) => {
            proxyUrl.searchParams.append(key, value);
        });

        const finalUrl = proxyUrl.toString();

        try {
            const response = await fetch(finalUrl);
            
            if (!response.ok) {
                throw new Error(`Proxy request failed: ${response.statusText}`);
            }

            const data = await response.json();
            
            if (data && data.js) {
                return data.js as T;
            }
            
            return data as T;
        } catch (error) {
            console.error('[StalkerClient] Proxy request error:', error);
            throw error;
        }
    }

    private async mockResponse<T>(action: string, params: Record<string, string>): Promise<T> {
        await new Promise(resolve => setTimeout(resolve, 500)); // Latency

        switch (action) {
            case 'handshake':
                return { token: 'mock_token' } as any;
            case 'get_profile':
                return { id: 1, name: 'Demo User', login: 'demo' } as any;
            case 'get_genres':
                return [
                    { id: 1, title: 'Movies', alias: 'movies' },
                    { id: 2, title: 'Series', alias: 'series' },
                    { id: 3, title: 'Sports', alias: 'sports' },
                    { id: 4, title: 'News', alias: 'news' },
                ] as any;
            case 'get_ordered_list':
                // Return mock content based on category
                return Array(10).fill(0).map((_, i) => ({
                    id: i + 1,
                    name: `Channel ${i + 1}`,
                    cmd: `http://example.com/stream/${i}`,
                    logo: `https://picsum.photos/seed/${i}/200/200`
                })) as any;
            case 'create_link':
                return { cmd: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4' } as any;
            case 'get_main_info':
                return {
                    id: 1,
                    name: 'Demo User',
                    balance: '0.00',
                    status: 'ACTIVE',
                    exp_date: null
                } as any;
            default:
                throw new Error(`Unknown mock action: ${action}`);
        }
    }

    async handshake(mac?: string): Promise<void> {
        if (mac) {
            this.mac = mac;
        }
        
        if (!this.mac) {
            throw new StalkerError('MAC address is required for handshake');
        }
        
        try {
            const response = await this.request<{ token: string }>('handshake');
            this.token = response.token;
        } catch (error) {
            console.error('Handshake failed', error);
            throw new StalkerError('Failed to connect to portal');
        }
    }
    
    getToken(): string | null {
        return this.token;
    }

    async getCategories(): Promise<any[]> {
        // type=itv&action=get_genres
        // Returns { js: [...] } directly as an array
        return this.request<any[]>('get_genres', { type: 'itv' });
    }

    async getMovieCategories(): Promise<any[]> {
        // type=vod&action=get_categories - Returns ALL VOD categories (movies + series)
        return this.request<any[]>('get_categories', { type: 'vod' });
    }

    async getSeriesCategories(): Promise<any[]> {
        // Get all VOD categories and filter for series-related ones
        const allCategories = await this.getMovieCategories();
        const seriesKeywords = [
            'SERIES', 'SERIALS', 'WEB_SERIES', 'TV_SERIALS', 
            'ANIME', 'DOCUMENTARY', 'DRAMA', 'SHOWS',
            'KOREAN', 'DUBB', 'CELEBRITY', 'EVENTS'
        ];
        
        return allCategories.filter((cat: any) => {
            const combinedText = `${cat.title} ${cat.alias}`.toUpperCase();
            return seriesKeywords.some(keyword => combinedText.includes(keyword));
        });
    }

    async getChannels(categoryId: string, page: number = 1): Promise<{ data: any[], total: number }> {
        // type=itv&action=get_ordered_list&genre=...&p=...
        // Returns { js: { data: [...], total_items: "97" } }
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
        // type=vod&action=get_ordered_list&category={categoryId}&genre=0&sortby=&p=...
        // Returns { js: { data: [...], total_items: "97" } }
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
        // type=vod&action=get_ordered_list&category={categoryId}&genre=0&sortby=&p=...
        // Returns { js: { data: [...], total_items: "97" } }
        // Note: Series also uses type=vod, not type=series
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
        // type=vod&action=get_ordered_list&category=0&search={query}&sortby=name&p={page}
        // Returns { js: { data: [...], total_items: "3" } }
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
        // type=vod&action=get_ordered_list&movie_id={series_id}
        // Returns { js: { data: [{ season_id, season_name, ... }, ...] } }
        const response = await this.request<{ data: any[] }>('get_ordered_list', { 
            type: 'vod',
            movie_id: seriesId
        });
        
        return response.data || [];
    }

    async getSeriesEpisodes(seriesId: string, seasonId: string, page: number = 1): Promise<{ data: any[], total: number }> {
        // type=vod&action=get_ordered_list&movie_id={series_id}&season_id={season_id}&p=...
        // Returns { js: { data: [...episodes...], total_items: "10" } }
        const response = await this.request<{ data: any[], total?: number, total_items?: string }>('get_ordered_list', { 
            type: 'vod',
            movie_id: seriesId,
            season_id: seasonId,
            p: page.toString()
        });
        
        const total = response.total_items ? parseInt(response.total_items, 10) : (response.total || 0);
        
        return {
            data: response.data || [],
            total: total
        };
    }

    async getEpisodeFileInfo(seriesId: string, seasonId: string, episodeId: string): Promise<any> {
        // Step 3: Get episode file info
        // type=vod&action=get_ordered_list&movie_id={series_id}&season_id={season_id}&episode_id={episode_id}
        // Returns { js: { data: [{ id: "file_id", cmd: "http://...", url: "...", ... }] } }
        // The response contains the actual file_id and cmd that should be passed to create_link
        const response = await this.request<{ data: any[] }>('get_ordered_list', { 
            type: 'vod',
            movie_id: seriesId,
            season_id: seasonId,
            episode_id: episodeId
        });
        
        // Return the first file from the data array
        // This file object contains: id (file_id), cmd, url, protocol, etc.
        return response.data && response.data.length > 0 ? response.data[0] : null;
    }

    async getMovieInfo(movieId: string): Promise<any> {
        // type=vod&action=get_ordered_list&movie_id={movie_id}
        // Returns { js: { data: [{ id: "file_id", cmd: "...", ... }] } }
        const response = await this.request<{ data: any[] }>('get_ordered_list', { 
            type: 'vod',
            movie_id: movieId
        });
        
        // Return the first file from the data array
        return response.data && response.data.length > 0 ? response.data[0] : null;
    }

    async getStreamUrl(cmd: string, type: string = 'itv', episodeNumber?: string): Promise<string> {
        // If cmd is already a URL, return it (common in some playlists)
        if (cmd && cmd.startsWith('http') && !cmd.includes('localhost')) {
            return cmd;
        }

        // Otherwise ask portal to create a link
        // type=vod&action=create_link&cmd=...&series={episode_number}&force_ch_link_check=0
        // Response: { js: { cmd: "http://...", ... } }
        
        const params: Record<string, string> = {
            type: type === 'series' ? 'vod' : type, // Series uses type=vod
            cmd: cmd,
            force_ch_link_check: '0'
        };
        
        // Add series=episode_number parameter for series content
        if (type === 'series' && episodeNumber) {
            params.series = episodeNumber;
        } else if (type === 'series') {
            params.series = '1';
        }
        
        const response = await this.request<{ cmd: string, id?: number }>('create_link', params);
        
        console.log('[StalkerClient] create_link response:', JSON.stringify(response));
        
        if (!response || !response.cmd) {
             console.error('[StalkerClient] Invalid response, no cmd field found. Full response:', response);
             throw new Error('Failed to generate stream link - no cmd in response');
        }
        
        // Return the streaming URL from cmd field
        return response.cmd;
    }

    async getEpg(channelId: string, period: number = 7): Promise<EpgProgram[]> {
        // type=itv&action=get_epg_info&ch_id={channelId}&period={period}
        // period: days (default 7)
        // Returns EPG data for the specified channel
        const response = await this.request<EpgProgram[]>('get_epg_info', { 
            type: 'itv',
            ch_id: channelId,
            period: period.toString()
        });
        
        return response || [];
    }

    async getShortEpg(channelId: string): Promise<ShortEpg> {
        // type=itv&action=get_short_epg&ch_id={channelId}
        // Returns current and next program for the channel
        const response = await this.request<ShortEpg>('get_short_epg', { 
            type: 'itv',
            ch_id: channelId
        });
        
        return response || { current_program: null, next_program: null };
    }

    async getProfile(mac?: string): Promise<any> {
        // type=stb&action=get_profile
        // Returns { js: { id, name, login, stb_id, ... } }
        if (mac) {
            this.mac = mac;
        }
        
        try {
            const response = await this.request<any>('get_profile');
            // The portal sometimes wraps data under `js` — request() already returns the resolved js or raw
            return response || null;
        } catch (error) {
            console.error('[StalkerClient] getProfile error:', error);
            throw error;
        }
    }

    async getAccountInfo(mac?: string): Promise<any> {
        // type=account_info&action=get_main_info
        // The portal returns account info for the current MAC under this action
        if (mac) {
            this.mac = mac;
        }
        
        try {
            const response = await this.request<any>('get_main_info', { type: 'account_info' });
            return response || null;
        } catch (error) {
            console.error('[StalkerClient] getAccountInfo error:', error);
            throw error;
        }
    }
}
