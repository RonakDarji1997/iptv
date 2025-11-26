import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { decrypt } from '@/lib/crypto';
import { verifyToken } from '@/lib/jwt';
import { StalkerClient } from '@/lib/stalker-client';

/**
 * GET /api/providers/[id]/stream-proxy?cmd=...&type=...
 * Proxy video stream with proper authentication headers
 * Regenerates fresh stream URL on each request to avoid token expiration
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get query params
    const { searchParams } = new URL(request.url);
    const cmd = searchParams.get('cmd');
    const streamType = searchParams.get('type') || 'itv';
    const episodeNumber = searchParams.get('episode');
    const segmentUrl = searchParams.get('url'); // For TS segments
    const tokenParam = searchParams.get('token');

    // Verify JWT token (from query param or Authorization header)
    let token = tokenParam;
    if (!token) {
      const authHeader = request.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized - token required' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    if (!cmd && !segmentUrl) {
      return NextResponse.json({ error: 'cmd or url parameter required' }, { status: 400 });
    }

    // Fetch provider credentials
    const provider = await prisma.provider.findUnique({
      where: { id },
    });

    if (!provider || !provider.isActive) {
      return NextResponse.json({ error: 'Provider not found or inactive' }, { status: 404 });
    }

    // Verify user owns this provider
    if (provider.userId !== decoded.userId) {
      return NextResponse.json({ error: 'Unauthorized access to provider' }, { status: 403 });
    }

    if (provider.type !== 'STALKER') {
      // For non-Stalker providers, redirect to segmentUrl if provided, otherwise to cmd
      return NextResponse.redirect(segmentUrl || cmd || '');
    }

    // Decrypt credentials
    let bearer = '';
    let adid = '';
    
    try {
      bearer = provider.stalkerBearer ? decrypt(provider.stalkerBearer) : '';
    } catch {
      bearer = provider.stalkerBearer || '';
    }

    try {
      adid = provider.stalkerAdid ? decrypt(provider.stalkerAdid) : '';
    } catch {
      adid = provider.stalkerAdid || '';
    }

    const mac = provider.stalkerMac;    if (!mac) {
      return NextResponse.json({ error: 'Missing MAC address' }, { status: 400 });
    }

    // If this is a segment request (url parameter), fetch it directly
    if (segmentUrl) {
      console.log('[StreamProxy] Fetching segment:', segmentUrl);
      
      const headers: HeadersInit = {
        'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
        'X-User-Agent': 'Model: MAG270; Link: WiFi',
        'Referer': provider.url.endsWith('/') ? `${provider.url}c/` : `${provider.url}/c/`,
        'Accept-Encoding': 'gzip',
        'Connection': 'keep-alive',
        'Cookie': `mac=${mac.toLowerCase()}; timezone=America/Toronto; adid=${adid}`,
      };

      if (bearer) {
        headers['Authorization'] = `Bearer ${bearer}`;
      }

      const response = await fetch(segmentUrl, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        console.error('[StreamProxy] Segment fetch failed:', response.status, response.statusText);
        return NextResponse.json(
          { error: `Segment fetch failed: ${response.status}` },
          { status: response.status }
        );
      }

      const contentType = response.headers.get('content-type') || 'video/MP2T';
      
      // Check if this is a playlist that needs URL rewriting
      if (contentType.includes('mpegurl') || contentType.includes('m3u8') || segmentUrl.includes('.m3u8')) {
        const playlistText = await response.text();
        
        const modifiedPlaylist = playlistText.split('\n').map(line => {
          // Skip comments and empty lines
          if (line.startsWith('#') || line.trim() === '') {
            return line;
          }
          
          // Handle segment URLs
          if (line.trim()) {
            let fullUrl = line.trim();
            
            // Handle relative URLs
            if (!fullUrl.startsWith('http')) {
              const baseUrl = new URL(segmentUrl);
              fullUrl = new URL(line.trim(), baseUrl.origin + baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf('/') + 1)).toString();
            }
            
            // Proxy segments through our endpoint
            const proxyUrl = `/api/providers/${id}/stream-proxy?url=${encodeURIComponent(fullUrl)}&token=${token}`;
            return proxyUrl;
          }
          
          return line;
        }).join('\n');

        return new NextResponse(modifiedPlaylist, {
          status: 200,
          headers: {
            'Content-Type': 'application/vnd.apple.mpegurl',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache',
          },
        });
      }
      
      // For video segments (.ts files), stream directly
      return new NextResponse(response.body, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=3600',
          'Content-Length': response.headers.get('content-length') || '',
        },
      });
    }

    // For master playlist, regenerate stream URL with fresh token
    if (cmd) {
      console.log('[StreamProxy] Regenerating stream URL for cmd:', cmd);
      
      // Initialize StalkerClient
      const client = new StalkerClient(provider.url, bearer, adid);
      Object.assign(client, { mac });
      
      // Get fresh stream URL (NO handshake - use existing bearer token)
      console.log('[StreamProxy] Getting fresh stream URL for cmd:', cmd);
      const freshStreamUrl = await client.getStreamUrl(cmd, streamType, episodeNumber || undefined);
      
      console.log('[StreamProxy] Fresh stream URL:', freshStreamUrl);
      
      // Fetch the fresh stream
      const headers: HeadersInit = {
        'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
        'X-User-Agent': 'Model: MAG270; Link: WiFi',
        'Referer': provider.url.endsWith('/') ? `${provider.url}c/` : `${provider.url}/c/`,
        'Accept-Encoding': 'gzip',
        'Connection': 'keep-alive',
        'Cookie': `mac=${mac.toLowerCase()}; timezone=America/Toronto; adid=${adid}`,
      };

      if (bearer) {
        headers['Authorization'] = `Bearer ${bearer}`;
      }

      const response = await fetch(freshStreamUrl, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        console.error('[StreamProxy] Fresh stream fetch failed:', response.status, response.statusText);
        const errorText = await response.text();
        console.error('[StreamProxy] Error body:', errorText);
        return NextResponse.json(
          { error: `Stream fetch failed: ${response.status}`, details: errorText },
          { status: response.status }
        );
      }

      // Get the content type
      const responseContentType = response.headers.get('content-type') || 'application/vnd.apple.mpegurl';

      // For HLS playlists, rewrite URLs to proxy through our endpoint
      if (responseContentType.includes('mpegurl') || responseContentType.includes('m3u8') || freshStreamUrl.includes('.m3u8')) {
        const playlistText = await response.text();
        
        const modifiedPlaylist = playlistText.split('\n').map(line => {
          // Skip comments and empty lines
          if (line.startsWith('#') || line.trim() === '') {
            return line;
          }
          
          // Handle segment URLs
          if (line.trim()) {
            let fullUrl = line.trim();
            
            // Handle relative URLs
            if (!fullUrl.startsWith('http')) {
              const baseUrl = new URL(freshStreamUrl);
              fullUrl = new URL(line.trim(), baseUrl.origin + baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf('/') + 1)).toString();
            }
            
            // Proxy segments through our endpoint
            const proxyUrl = `/api/providers/${id}/stream-proxy?url=${encodeURIComponent(fullUrl)}&token=${token}`;
            return proxyUrl;
          }
          
          return line;
        }).join('\n');

        return new NextResponse(modifiedPlaylist, {
          status: 200,
          headers: {
            'Content-Type': 'application/vnd.apple.mpegurl',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache',
          },
        });
      }

      // For non-playlist responses, stream directly
      return new NextResponse(response.body, {
        status: 200,
        headers: {
          'Content-Type': responseContentType,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=3600',
          'Content-Length': response.headers.get('content-length') || '',
        },
      });
    }

    return NextResponse.json({ error: 'No valid request' }, { status: 400 });

  } catch (error) {
    console.error('[StreamProxy] Error:', error);
    return NextResponse.json(
      { error: 'Stream proxy failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Handle OPTIONS for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    },
  });
}
