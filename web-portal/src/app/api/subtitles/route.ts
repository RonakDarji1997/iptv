import { NextRequest, NextResponse } from 'next/server';

const OPENSUBTITLES_API_BASE = 'https://api.opensubtitles.com/api/v1';
const API_KEY = process.env.NEXT_PUBLIC_OPENSUBTITLES_API_KEY || '';
const USER_AGENT = 'streamHub v1.0.0';

// Language code to full name mapping
const LANGUAGE_NAMES: Record<string, string> = {
  'en': 'English',
  'es': 'Spanish',
  'fr': 'French',
  'de': 'German',
  'it': 'Italian',
  'pt': 'Portuguese',
  'pt-BR': 'Portuguese (Brazil)',
  'pt-PT': 'Portuguese (Portugal)',
  'ru': 'Russian',
  'ja': 'Japanese',
  'ko': 'Korean',
  'zh': 'Chinese',
  'ar': 'Arabic',
  'hi': 'Hindi',
  'tr': 'Turkish',
  'pl': 'Polish',
  'nl': 'Dutch',
  'sv': 'Swedish',
  'da': 'Danish',
  'fi': 'Finnish',
  'no': 'Norwegian',
  'cs': 'Czech',
  'ro': 'Romanian',
  'hu': 'Hungarian',
  'el': 'Greek',
  'he': 'Hebrew',
  'th': 'Thai',
  'vi': 'Vietnamese',
  'id': 'Indonesian',
  'ms': 'Malay',
  'uk': 'Ukrainian',
  'bg': 'Bulgarian',
  'hr': 'Croatian',
  'sk': 'Slovak',
  'sl': 'Slovenian',
  'sr': 'Serbian',
  'et': 'Estonian',
  'lv': 'Latvian',
  'lt': 'Lithuanian',
};

function getLanguageName(code: string): string {
  return LANGUAGE_NAMES[code] || code.toUpperCase();
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
        const query = searchParams.get('query'); // Show/movie name for fallback
        const languages = searchParams.get('languages') || 'en,es,fr';
        const seasonNumber = searchParams.get('seasonNumber');
        const episodeNumber = searchParams.get('episodeNumber');
        const maxEpisodes = parseInt(searchParams.get('maxEpisodes') || '20');

        if (!imdbId && !query) {
          return NextResponse.json(
            { error: 'Missing imdbId or query parameter' },
            { status: 400 }
          );
        }
        // Clean IMDb ID
        const cleanImdbId = imdbId ? (imdbId.startsWith('tt') ? imdbId.replace('tt', '') : imdbId) : null;

        // Build search parameters
        const params = new URLSearchParams({
          languages: languages,
        });
        
        if (cleanImdbId) {
          params.append('imdb_id', cleanImdbId);
        } else if (query) {
          params.append('query', query);
        }
        
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
        const subtitles = (data.data || []).map((item: any) => ({
          id: item.attributes.files[0]?.file_id?.toString() || '',
          language: item.attributes.language || 'unknown',
          languageName: getLanguageName(item.attributes.language || 'unknown'),
          fileName: item.attributes.files[0]?.file_name || item.attributes.release || 'Unknown',
          downloadCount: item.attributes.download_count || 0,
          rating: item.attributes.ratings || 0,
          uploader: item.attributes.uploader?.name || 'Unknown',
          releaseInfo: item.attributes.release,
          fileId: item.attributes.files[0]?.file_id || 0,
        }));

        const result = { success: true, subtitles };
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
        return NextResponse.json(result);
      }

      case 'convert': {
        // Convert and return VTT file directly for react-native-video
        const fileId = searchParams.get('fileId');

        if (!fileId) {
          return NextResponse.json(
            { error: 'Missing fileId parameter' },
            { status: 400 }
          );
        }

        console.log('[Subtitles API] Converting file to VTT:', fileId);
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
          if (response.status === 406) {
            console.log('[Subtitles API] Download not available (406):', errorText);
            return new NextResponse('WEBVTT\n\n', {
              status: 200,
              headers: { 'Content-Type': 'text/vtt' },
            });
          }
          console.error('[Subtitles API] Download error:', response.status, errorText);
          return new NextResponse('WEBVTT\n\n', {
            status: 200,
            headers: { 'Content-Type': 'text/vtt' },
          });
        }

        const data = await response.json();
        const downloadUrl = data.link;

        if (!downloadUrl) {
          return new NextResponse('WEBVTT\n\n', {
            status: 200,
            headers: { 'Content-Type': 'text/vtt' },
          });
        }

        // Fetch the actual subtitle file
        const subtitleResponse = await fetch(downloadUrl);
        const srtContent = await subtitleResponse.text();
        
        // Convert SRT to VTT format
        const vttContent = srtToVtt(srtContent);
        
        console.log('[Subtitles API] Returning VTT file');

        // Return as VTT file
        return new NextResponse(vttContent, {
          status: 200,
          headers: {
            'Content-Type': 'text/vtt',
            'Cache-Control': 'public, max-age=3600',
          },
        });
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
