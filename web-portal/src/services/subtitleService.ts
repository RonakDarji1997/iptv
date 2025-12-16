/**
 * OpenSubtitles.com REST API Service
 * Free tier: 40 downloads/day for anonymous, 200/day for VIP
 * Get your API key from: https://www.opensubtitles.com/en/consumers
 */

export interface Subtitle {
  id: string;
  language: string;
  languageName: string;
  fileName: string;
  downloadUrl?: string;
  downloadCount: number;
  rating: number;
  uploader: string;
  releaseInfo?: string;
  fileId: number;
}

export class SubtitleService {
  private static readonly API_BASE = 'https://api.opensubtitles.com/api/v1';
  // OpenSubtitles requires specific User-Agent format: "YourAppName v1.2.3"
  // Must EXACTLY match the app name you registered (case-sensitive!)
  private static readonly USER_AGENT = 'streamHub v1.0.0';
  
  // Get API key at runtime (client-side)
  private static get API_KEY(): string {
    if (typeof window !== 'undefined') {
      return process.env.NEXT_PUBLIC_OPENSUBTITLES_API_KEY || '';
    }
    return '';
  }
  
  // Login session management
  private static authToken: string | null = null;
  private static tokenExpiry: number = 0;

  /**
   * Login to OpenSubtitles (optional but increases rate limits)
   */
  private static async login(): Promise<string | null> {
    // Check if we have a valid token
    if (this.authToken && Date.now() < this.tokenExpiry) {
      return this.authToken;
    }

    const username = process.env.NEXT_PUBLIC_OPENSUBTITLES_USERNAME;
    const password = process.env.NEXT_PUBLIC_OPENSUBTITLES_PASSWORD;

    if (!username || !password) {
      // Anonymous mode - lower rate limits
      return null;
    }

    try {
      const response = await fetch(`${this.API_BASE}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Api-Key': this.API_KEY,
          'User-Agent': this.USER_AGENT,
        },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) return null;

      const data = await response.json();
      this.authToken = data.token;
      this.tokenExpiry = Date.now() + 23 * 60 * 60 * 1000; // 23 hours
      return data.token;
    } catch (error) {
      console.error('OpenSubtitles login error:', error);
      return null;
    }
  }

  /**
   * Search for subtitles by IMDb ID (most reliable)
   */
  static async searchByImdbId(
    imdbId: string,
    languages: string[] = ['en', 'es', 'fr']
  ): Promise<Subtitle[]> {
    try {
      const apiKey = this.API_KEY;
      console.log('[SubtitleService] API_KEY present:', !!apiKey);
      console.log('[SubtitleService] API_KEY first 6 chars:', apiKey ? apiKey.substring(0, 6) + '...' : 'NONE');
      console.log('[SubtitleService] Searching by IMDb ID:', imdbId);
      
      if (!apiKey) {
        console.error('[SubtitleService] OpenSubtitles API key not configured. Please add NEXT_PUBLIC_OPENSUBTITLES_API_KEY to .env.local');
        console.error('[SubtitleService] Get your free API key from: https://www.opensubtitles.com/en/consumers');
        return [];
      }

      // Clean IMDb ID (ensure it has 'tt' prefix)
      const cleanImdbId = imdbId.startsWith('tt') ? imdbId : `tt${imdbId}`;
      console.log('[SubtitleService] Clean IMDb ID:', cleanImdbId);
      
      const token = await this.login();
      const headers: Record<string, string> = {
        'Api-Key': apiKey,
        'User-Agent': this.USER_AGENT,
        'Content-Type': 'application/json',
      };
      
      console.log('[SubtitleService] Request headers:', { 'Api-Key': apiKey.substring(0, 6) + '...', 'User-Agent': this.USER_AGENT });
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Build query parameters
      const params = new URLSearchParams({
        imdb_id: cleanImdbId.replace('tt', ''),
        languages: languages.join(','),
      });

      console.log('[SubtitleService] Fetching from:', `${this.API_BASE}/subtitles?${params}`);
      const response = await fetch(`${this.API_BASE}/subtitles?${params}`, {
        headers,
      });

      console.log('[SubtitleService] Response status:', response.status);
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[SubtitleService] API error:', response.status, errorText);
        return [];
      }

      const data = await response.json();
      console.log('[SubtitleService] Found subtitles:', data.data?.length || 0);
      
      return this.parseSubtitles(data.data || []);
    } catch (error) {
      console.error('[SubtitleService] Search error:', error);
      return [];
    }
  }

  /**
   * Search subtitles by movie/show title and year
   */
  static async searchByTitle(
    title: string,
    year?: number,
    season?: number,
    episode?: number,
    languages: string[] = ['en']
  ): Promise<Subtitle[]> {
    try {
      console.log('[SubtitleService] Searching by title:', title);
      
      if (!this.API_KEY) {
        console.error('[SubtitleService] OpenSubtitles API key not configured. Please add NEXT_PUBLIC_OPENSUBTITLES_API_KEY to .env.local');
        console.error('[SubtitleService] Get your free API key from: https://www.opensubtitles.com/en/consumers');
        return [];
      }

      const token = await this.login();
      const headers: Record<string, string> = {
        'Api-Key': this.API_KEY,
        'User-Agent': this.USER_AGENT,
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const params: Record<string, string> = {
        query: title,
        languages: languages.join(','),
      };

      if (year) params.year = year.toString();
      if (season) params.season_number = season.toString();
      if (episode) params.episode_number = episode.toString();

      const queryString = new URLSearchParams(params);
      const response = await fetch(`${this.API_BASE}/subtitles?${queryString}`, {
        headers,
      });

      if (!response.ok) {
        console.error('OpenSubtitles API error:', response.status);
        return [];
      }

      const data = await response.json();
      return this.parseSubtitles(data.data || []);
    } catch (error) {
      console.error('Subtitle search error:', error);
      return [];
    }
  }

  /**
   * Parse subtitle data from API response
   */
  private static parseSubtitles(data: any[]): Subtitle[] {
    return data.map((item: any) => ({
      id: item.id || item.attributes?.files?.[0]?.file_id?.toString() || '',
      language: item.attributes?.language || 'en',
      languageName: this.getLanguageName(item.attributes?.language || 'en'),
      fileName: item.attributes?.files?.[0]?.file_name || item.attributes?.release || 'subtitle.srt',
      fileId: item.attributes?.files?.[0]?.file_id || 0,
      downloadCount: item.attributes?.download_count || 0,
      rating: item.attributes?.ratings || 0,
      uploader: item.attributes?.uploader?.name || 'Unknown',
      releaseInfo: item.attributes?.release || item.attributes?.feature_details?.title,
    }));
  }

  /**
   * Get download URL for subtitle (requires auth for full version)
   */
  static async getDownloadUrl(fileId: number): Promise<string | null> {
    try {
      if (!this.API_KEY) {
        console.warn('OpenSubtitles API key not configured');
        return null;
      }

      const token = await this.login();
      const headers: Record<string, string> = {
        'Api-Key': this.API_KEY,
        'User-Agent': this.USER_AGENT,
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${this.API_BASE}/download`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ file_id: fileId }),
      });

      if (!response.ok) {
        console.error('Download URL request failed:', response.status);
        return null;
      }

      const data = await response.json();
      return data.link || null;
    } catch (error) {
      console.error('Subtitle download error:', error);
      return null;
    }
  }

  /**
   * Download subtitle file content
   */
  static async downloadSubtitle(fileId: number): Promise<string | null> {
    try {
      const downloadUrl = await this.getDownloadUrl(fileId);
      if (!downloadUrl) return null;

      const response = await fetch(downloadUrl);
      if (!response.ok) return null;

      return await response.text();
    } catch (error) {
      console.error('Subtitle download error:', error);
      return null;
    }
  }

  /**
   * Get language name from code
   */
  static getLanguageName(code: string): string {
    const languages: Record<string, string> = {
      en: 'English',
      es: 'Spanish',
      fr: 'French',
      de: 'German',
      it: 'Italian',
      pt: 'Portuguese',
      ru: 'Russian',
      ar: 'Arabic',
      zh: 'Chinese',
      ja: 'Japanese',
      ko: 'Korean',
      hi: 'Hindi',
      nl: 'Dutch',
      pl: 'Polish',
      tr: 'Turkish',
      // Add more as needed
      rus: 'Russian',
      ara: 'Arabic',
      chi: 'Chinese',
      jpn: 'Japanese',
      kor: 'Korean',
      hin: 'Hindi',
    };
    return languages[code] || code;
  }

  /**
   * Convert SRT content to VTT format (for HTML5 video)
   */
  static srtToVtt(srtContent: string): string {
    let vttContent = 'WEBVTT\n\n';
    vttContent += srtContent.replace(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/g, '$1:$2:$3.$4');
    return vttContent;
  }
}
