import { NextRequest, NextResponse } from 'next/server';

const OPENSUBTITLES_API_BASE = 'https://api.opensubtitles.com/api/v1';
const API_KEY = process.env.NEXT_PUBLIC_OPENSUBTITLES_API_KEY || '';
const USER_AGENT = 'streamHub v1.0.0';

// Server-side cache for subtitle data (1 hour TTL)
const subtitleCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function getCached(key: string): any | null {
  const cached = subtitleCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log('[Subtitles Cache] 🎯 HIT:', key);
    return cached.data;
  }
  if (cached) {
    subtitleCache.delete(key);
  }
  return null;
}

function setCache(key: string, data: any): void {
  subtitleCache.set(key, { data, timestamp: Date.now() });
}

// Convert SRT to VTT format
function srtToVtt(srtContent: string): string {
  // Add WEBVTT header
  let vtt = 'WEBVTT\n\n';
  
  // Clean the content: remove BOM, normalize line endings
  let cleaned = srtContent.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim();
  
  // Replace timestamps (00:00:00,000 -> 00:00:00.000)
  cleaned = cleaned.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  
  // Add cleaned content
  vtt += cleaned;
  
  return vtt;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get('action');

  if (!API_KEY) {
    return NextResponse.json(
      { error: 'OpenSubtitles API key not configured' },
      { status: 500 }
    );
  }

  try {
    switch (action) {
      case 'search': {
        const imdbId = searchParams.get('imdbId');
        const languages = searchParams.get('languages') || 'en,es,fr';
        const seasonNumber = searchParams.get('seasonNumber');
        const episodeNumber = searchParams.get('episodeNumber');

        if (!imdbId) {
          return NextResponse.json(
            { error: 'Missing imdbId parameter' },
            { status: 400 }
          );
        }

        // Clean IMDb ID
        const cleanImdbId = imdbId.startsWith('tt') ? imdbId.replace('tt', '') : imdbId;

        // Check cache first
        const cacheKey = `search:${cleanImdbId}:${languages}:${seasonNumber || ''}:${episodeNumber || ''}`;
        const cached = getCached(cacheKey);
        if (cached) {
          return NextResponse.json(cached);
        }

        const params = new URLSearchParams({
          imdb_id: cleanImdbId,
          languages: languages,
        });
        
        // Add season and episode for TV series
        if (seasonNumber) {
          params.append('season_number', seasonNumber);
        }
        if (episodeNumber) {
          params.append('episode_number', episodeNumber);
        }

        console.log('[Subtitles API] Fetching from:', `${OPENSUBTITLES_API_BASE}/subtitles?${params}`);
        console.log('[Subtitles API] User-Agent:', USER_AGENT);
        console.log('[Subtitles API] API Key:', API_KEY.substring(0, 6) + '...');

        const response = await fetch(`${OPENSUBTITLES_API_BASE}/subtitles?${params}`, {
          headers: {
            'Api-Key': API_KEY,
            'User-Agent': USER_AGENT,
            'Content-Type': 'application/json',
          },
        });

        console.log('[Subtitles API] Response status:', response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[Subtitles API] Error:', response.status, errorText);
          return NextResponse.json(
            { error: 'OpenSubtitles API error', details: errorText },
            { status: response.status }
          );
        }

        const data = await response.json();
        console.log('[Subtitles API] Found subtitles:', data.data?.length || 0);

        // Parse and format subtitles
        const subtitles = (data.data || []).slice(0, 10).map((item: any) => ({
          id: item.attributes.files[0]?.file_id?.toString() || '',
          language: item.attributes.language || 'unknown',
          languageName: item.attributes.language || 'Unknown',
          fileName: item.attributes.files[0]?.file_name || item.attributes.release || 'Unknown',
          downloadCount: item.attributes.download_count || 0,
          rating: item.attributes.ratings || 0,
          uploader: item.attributes.uploader?.name || 'Unknown',
          releaseInfo: item.attributes.release,
          fileId: item.attributes.files[0]?.file_id || 0,
        }));

        const result = { success: true, subtitles };
        setCache(cacheKey, result);
        return NextResponse.json(result);
      }

      case 'download': {
        const fileId = searchParams.get('fileId');

        if (!fileId) {
          return NextResponse.json(
            { error: 'Missing fileId parameter' },
            { status: 400 }
          );
        }

        // Check cache first
        const cacheKey = `download:${fileId}`;
        const cached = getCached(cacheKey);
        if (cached) {
          return NextResponse.json(cached);
        }

        console.log('[Subtitles API] Downloading file:', fileId);

        const response = await fetch(`${OPENSUBTITLES_API_BASE}/download`, {
          method: 'POST',
          headers: {
            'Api-Key': API_KEY,
            'User-Agent': USER_AGENT,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ file_id: parseInt(fileId) }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          // 406 means quota exceeded or download limit reached - handle silently
          if (response.status === 406) {
            console.log('[Subtitles API] Download not available (406):', errorText);
            return NextResponse.json(
              { error: 'Subtitle not available', userMessage: 'Subtitles could not be loaded at this time' },
              { status: 406 }
            );
          }
          console.error('[Subtitles API] Download error:', response.status, errorText);
          return NextResponse.json(
            { error: 'Failed to get download URL' },
            { status: response.status }
          );
        }

        const data = await response.json();
        const downloadUrl = data.link;

        if (!downloadUrl) {
          return NextResponse.json(
            { error: 'No download URL returned' },
            { status: 500 }
          );
        }

        // Fetch the actual subtitle file
        const subtitleResponse = await fetch(downloadUrl);
        const srtContent = await subtitleResponse.text();
        
        // Convert SRT to VTT format for HTML5 video
        const vttContent = srtToVtt(srtContent);
        
        console.log('[Subtitles API] Converted to VTT format');

        const result = { success: true, content: vttContent };
        setCache(cacheKey, result);
        return NextResponse.json(result);
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action parameter' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[Subtitles API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
