/**
 * TMDB Service
 * Fetches movie/TV metadata, ratings, and high-quality images from TMDB API
 */

const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

export interface TMDBMovie {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  popularity: number;
  genre_ids: number[];
  adult: boolean;
  original_language: string;
}

export interface TMDBTVShow {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  vote_average: number;
  vote_count: number;
  popularity: number;
  genre_ids: number[];
  origin_country: string[];
  original_language: string;
}

export interface TMDBDetails {
  id: number;
  title?: string;
  name?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
  vote_count: number;
  runtime?: number;
  episode_run_time?: number[];
  genres: Array<{ id: number; name: string }>;
  production_companies: Array<{ id: number; name: string; logo_path: string | null }>;
  imdb_id?: string;
  tagline?: string;
  status: string;
  original_language: string;
}

export interface TMDBEpisode {
  id: number;
  name: string;
  overview: string;
  episode_number: number;
  season_number: number;
  still_path: string | null;
  air_date: string;
  vote_average: number;
  vote_count: number;
  runtime: number | null;
}

export interface TMDBSeason {
  id: number;
  name: string;
  overview: string;
  season_number: number;
  poster_path: string | null;
  air_date: string;
  episode_count: number;
  episodes?: TMDBEpisode[];
}

export class TMDBService {
  /**
   * Search for movies by title
   */
  static async searchMovie(query: string, year?: number): Promise<TMDBMovie[]> {
    try {
      const params = new URLSearchParams({
        api_key: TMDB_API_KEY,
        query,
        language: 'en-US',
        page: '1',
        include_adult: 'false',
      });

      if (year) {
        params.append('year', year.toString());
      }

      const response = await fetch(`${TMDB_BASE_URL}/search/movie?${params}`);
      const data = await response.json();
      return data.results || [];
    } catch (error) {
      console.error('TMDB movie search error:', error);
      return [];
    }
  }

  /**
   * Search for TV shows by title
   */
  static async searchTV(query: string, year?: number): Promise<TMDBTVShow[]> {
    try {
      const params = new URLSearchParams({
        api_key: TMDB_API_KEY,
        query,
        language: 'en-US',
        page: '1',
        include_adult: 'false',
      });

      if (year) {
        params.append('first_air_date_year', year.toString());
      }

      const response = await fetch(`${TMDB_BASE_URL}/search/tv?${params}`);
      const data = await response.json();
      return data.results || [];
    } catch (error) {
      console.error('TMDB TV search error:', error);
      return [];
    }
  }

  /**
   * Get detailed movie information
   */
  static async getMovieDetails(movieId: number): Promise<TMDBDetails | null> {
    try {
      const params = new URLSearchParams({
        api_key: TMDB_API_KEY,
        language: 'en-US',
        append_to_response: 'credits,external_ids',
      });

      const response = await fetch(`${TMDB_BASE_URL}/movie/${movieId}?${params}`);
      return await response.json();
    } catch (error) {
      console.error('TMDB movie details error:', error);
      return null;
    }
  }

  /**
   * Get detailed TV show information
   */
  static async getTVDetails(tvId: number): Promise<TMDBDetails | null> {
    try {
      const params = new URLSearchParams({
        api_key: TMDB_API_KEY,
        language: 'en-US',
        append_to_response: 'credits,external_ids',
      });

      const response = await fetch(`${TMDB_BASE_URL}/tv/${tvId}?${params}`);
      return await response.json();
    } catch (error) {
      console.error('TMDB TV details error:', error);
      return null;
    }
  }

  /**
   * Get season details with episodes
   */
  static async getSeasonDetails(tvId: number, seasonNumber: number): Promise<TMDBSeason | null> {
    try {
      const params = new URLSearchParams({
        api_key: TMDB_API_KEY,
        language: 'en-US',
      });

      const response = await fetch(`${TMDB_BASE_URL}/tv/${tvId}/season/${seasonNumber}?${params}`);
      return await response.json();
    } catch (error) {
      console.error('TMDB season details error:', error);
      return null;
    }
  }

  /**
   * Get logos for movie or TV show
   * Returns logos in different languages (prioritizes English)
   */
  static async getLogos(id: number, type: 'movie' | 'tv'): Promise<any[]> {
    try {
      const params = new URLSearchParams({
        api_key: TMDB_API_KEY,
        include_image_language: 'en,null',
      });

      const response = await fetch(`${TMDB_BASE_URL}/${type}/${id}/images?${params}`);
      const data = await response.json();
      
      // Return logos, prioritizing English ones
      const logos = data.logos || [];
      return logos.sort((a: any, b: any) => {
        // Prioritize English logos
        if (a.iso_639_1 === 'en' && b.iso_639_1 !== 'en') return -1;
        if (a.iso_639_1 !== 'en' && b.iso_639_1 === 'en') return 1;
        // Then sort by vote_average
        return (b.vote_average || 0) - (a.vote_average || 0);
      });
    } catch (error) {
      console.error('TMDB logos error:', error);
      return [];
    }
  }

  /**
   * Get logo URL
   * Sizes: w45, w92, w154, w185, w300, w500, original
   */
  static getLogoUrl(path: string | null, size: string = 'w300'): string | null {
    return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
  }

  /**
   * Get episode still (thumbnail) URL
   * Sizes: w92, w185, w300, original
   */
  static getEpisodeStillUrl(path: string | null, size: string = 'w300'): string | null {
    if (!path) return null;
    return `${TMDB_IMAGE_BASE_URL}/${size}${path}`;
  }

  /**
   * Get poster URL for different sizes
   * Sizes: w92, w154, w185, w342, w500, w780, original
   */
  static getPosterUrl(path: string | null, size: string = 'w500'): string | null {
    if (!path) return null;
    return `${TMDB_IMAGE_BASE_URL}/${size}${path}`;
  }

  /**
   * Get backdrop URL for different sizes
   * Sizes: w300, w780, w1280, original
   */
  static getBackdropUrl(path: string | null, size: string = 'w1280'): string | null {
    if (!path) return null;
    return `${TMDB_IMAGE_BASE_URL}/${size}${path}`;
  }

  /**
   * Get videos (trailers, teasers, clips) for movie or TV show
   */
  static async getVideos(id: number, type: 'movie' | 'tv'): Promise<any[]> {
    try {
      const params = new URLSearchParams({
        api_key: TMDB_API_KEY,
        language: 'en-US',
      });

      const response = await fetch(`${TMDB_BASE_URL}/${type}/${id}/videos?${params}`);
      const data = await response.json();
      
      // Return videos, prioritizing trailers over teasers over clips
      const videos = data.results || [];
      return videos.sort((a: any, b: any) => {
        const typeOrder = { 'Trailer': 0, 'Teaser': 1, 'Clip': 2, 'Behind the Scenes': 3, 'Featurette': 4 };
        const aOrder = typeOrder[a.type as keyof typeof typeOrder] ?? 999;
        const bOrder = typeOrder[b.type as keyof typeof typeOrder] ?? 999;
        return aOrder - bOrder;
      });
    } catch (error) {
      console.error('TMDB videos error:', error);
      return [];
    }
  }

  /**
   * Smart search - tries to match content by cleaning the title
   */
  static async smartSearch(
    title: string,
    type: 'movie' | 'tv',
    year?: number
  ): Promise<TMDBDetails | null> {
    // Strategy 1: Aggressive cleaning
    let cleanTitle = title
      // Remove everything after common separators
      .replace(/\s*[-–|]\s*(ENGLISH|HINDI|TAMIL|TELUGU|SERIES|MOVIE|FILM).*/gi, '')
      .replace(/\s*\|\s*SERIES.*/gi, '')
      .replace(/\s*\|\s*MOVIE.*/gi, '')
      // Remove platform names
      .replace(/\s*\((English-)?Netflix\)/gi, '')
      .replace(/\s*\((English-)?Amazon\)/gi, '')
      .replace(/\s*\((English-)?Disney\+?\)/gi, '')
      .replace(/\s*\((English-)?HBO\)/gi, '')
      .replace(/\s*\((English-)?Hulu\)/gi, '')
      .replace(/\s*\((English-)?Prime\)/gi, '')
      // Remove language indicators
      .replace(/\s*\((English|Hindi|Tamil|Telugu|Multi|Dual)\)/gi, '')
      // Remove year
      .replace(/\s*\(?\d{4}\)?/g, '')
      // Remove episode info
      .replace(/\s*S\d+E\d+.*/i, '')
      // Remove remaining brackets and parentheses content
      .replace(/\s*\[.*?\]/g, '')
      .replace(/\s*\(.*?\)/g, '')
      // Clean up extra spaces and trim
      .replace(/\s+/g, ' ')
      .trim();

    console.log('[TMDB Smart Search] Original title:', title);
    console.log('[TMDB Smart Search] Cleaned title:', cleanTitle);

    try {
      // Try main search
      let results = type === 'movie' 
        ? await this.searchMovie(cleanTitle, year)
        : await this.searchTV(cleanTitle, year);

      console.log('[TMDB Smart Search] Strategy 1 results:', results.length);

      // Strategy 2: If no results, try just taking text before first separator
      if (results.length === 0) {
        const altTitle = title
          .split(/\s*[-–|(]/)[0]
          .replace(/\s*\d{4}.*/g, '')
          .trim();
        
        console.log('[TMDB Smart Search] Strategy 2 - trying:', altTitle);
        
        results = type === 'movie' 
          ? await this.searchMovie(altTitle, year)
          : await this.searchTV(altTitle, year);
        
        console.log('[TMDB Smart Search] Strategy 2 results:', results.length);
      }

      if (results.length > 0) {
        console.log('[TMDB Smart Search] First result:', ('name' in results[0] ? results[0].name : results[0].title));
      }

      if (results.length === 0) return null;

      // Get details for the first (most relevant) result
      const firstResult = results[0];
      const details = type === 'movie'
        ? await this.getMovieDetails(firstResult.id)
        : await this.getTVDetails(firstResult.id);

      return details;
    } catch (error) {
      console.error('TMDB smart search error:', error);
      return null;
    }
  }

  /**
   * Extract year from title string
   */
  static extractYear(title: string): number | undefined {
    const yearMatch = title.match(/\((\d{4})\)|\s(\d{4})\s?$/);
    if (yearMatch) {
      return parseInt(yearMatch[1] || yearMatch[2]);
    }
    return undefined;
  }

  /**
   * Get external IDs (IMDb, TVDB, etc.) for a movie or TV show
   */
  static async getExternalIds(id: number, type: 'movie' | 'tv'): Promise<any> {
    const url = `${TMDB_BASE_URL}/${type}/${id}/external_ids?api_key=${TMDB_API_KEY}`;
    
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`TMDB API error: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`Error fetching external IDs for ${type} ${id}:`, error);
      return null;
    }
  }
}

