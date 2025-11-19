import { StalkerCredentials, StalkerSession, StalkerError } from './stalker-api';

interface StalkerResponse<T> {
    js: T;
}

export class StalkerClient {
    private baseUrl: string;
    private mac: string;
    private token: string | null = null;

    constructor(credentials: StalkerCredentials) {
        this.baseUrl = credentials.url.endsWith('/') ? credentials.url : `${credentials.url}/`;
        this.mac = credentials.mac;
    }

    private async request<T>(action: string, params: Record<string, string> = {}): Promise<T> {
        // Use the internal proxy to bypass CORS
        // Construct proxy URL relative to current location
        const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
        const host = typeof window !== 'undefined' ? window.location.host : 'localhost:3000';
        const baseUrl = `${protocol}//${host}`;
        const proxyUrl = new URL('/api/proxy', baseUrl);
        
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

        const finalUrl = proxyUrl.toString();

        try {
            const response = await fetch(finalUrl);
            
            if (!response.ok) {
                throw new Error(`Proxy request failed: ${response.statusText}`);
            }

            const data = await response.json();
            
            // Stalker API returns { js: { data?: [...] } } or { js: [...] } or { js: { ... } }
            if (data && data.js) {
                const jsContent = data.js;
                // Handle both array responses and object responses
                return jsContent as T;
            }
            
            return data as T;
        } catch (error) {
            console.error('[StalkerClient] Error:', error);
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
            default:
                throw new Error(`Unknown mock action: ${action}`);
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
        const seriesKeywords = ['SERIES', 'SERIALS','WEB_SERIES', 'TV_SERIALS'];
        
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

    async getSeriesFileInfo(seriesId: string, seasonId: string, episodeId: string): Promise<any> {
        // type=vod&action=get_ordered_list&movie_id={series_id}&season_id={season_id}&episode_id={episode_id}
        // Returns { js: { data: [{ id: "file_id", cmd: "...", ... }] } }
        const response = await this.request<{ data: any[] }>('get_ordered_list', { 
            type: 'vod',
            movie_id: seriesId,
            season_id: seasonId,
            episode_id: episodeId
        });
        
        // Return the first file from the data array
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

    async getStreamUrl(cmd: string, type: string = 'itv'): Promise<string> {
        // If cmd is already a URL, return it (common in some playlists)
        if (cmd && cmd.startsWith('http') && !cmd.includes('localhost')) {
            return cmd;
        }

        // Otherwise ask portal to create a link
        // type=vod&action=create_link&cmd=...&series={0|1}&force_ch_link_check=0
        // Response: { js: { cmd: "http://...", ... } }
        
        const params: Record<string, string> = {
            type: type === 'series' ? 'vod' : type, // Series uses type=vod
            cmd: cmd,
            force_ch_link_check: '0'
        };
        
        // Add series=1 parameter for series content
        if (type === 'series') {
            params.series = '1';
        }
        
        const response = await this.request<{ cmd: string, id?: number }>('create_link', params);
        
        if (!response || !response.cmd) {
             console.error('[StalkerClient] Invalid response, no cmd field found');
             throw new Error('Failed to generate stream link - no cmd in response');
        }
        
        // Return the streaming URL from cmd field
        return response.cmd;
    }
}
