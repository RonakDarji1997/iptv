import { NextRequest, NextResponse } from 'next/server';

// Stalker Portal credentials from environment variables
const STALKER_CONFIG = {
    bearer: process.env.NEXT_PUBLIC_STALKER_BEARER || '',
    adid: process.env.NEXT_PUBLIC_STALKER_ADID || '',
};

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const targetUrl = searchParams.get('url');
    const mac = searchParams.get('mac');
    const token = searchParams.get('token');

    if (!targetUrl || !mac) {
        return NextResponse.json({ error: 'Missing url or mac parameter' }, { status: 400 });
    }

    try {
        // We need to forward all query parameters except 'url', 'mac', 'token'
        const forwardParams = new URLSearchParams();
        searchParams.forEach((value, key) => {
            if (!['url', 'mac', 'token'].includes(key)) {
                forwardParams.append(key, value);
            }
        });

        // Ensure targetUrl ends with / before appending server/load.php
        // Also handle cases where targetUrl might already include /c/ or similar paths
        let finalUrl = targetUrl;
        
        // If the user provided a full path to a PHP file (e.g. /server/load.php), use it as is.
        if (targetUrl.includes('.php')) {
             finalUrl = `${targetUrl}?${forwardParams.toString()}`;
        } else {
            // Otherwise, try to construct the standard path
            let baseUrl = targetUrl;
            if (!baseUrl.endsWith('/')) {
                baseUrl += '/';
            }
            finalUrl = `${baseUrl}server/load.php?${forwardParams.toString()}`;
        }
        
        // Build headers matching test-stalker.ts
        const headers: HeadersInit = {
            'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
            'X-User-Agent': 'Model: MAG270; Link: WiFi',
            'Referer': targetUrl.endsWith('/') ? targetUrl + 'c/' : targetUrl + '/c/',
            'Authorization': `Bearer ${STALKER_CONFIG.bearer}`,
            'Cookie': `mac=${mac.toLowerCase()}; timezone=America/Toronto; adid=${STALKER_CONFIG.adid};${token ? ` st=${token};` : ''}`,
        };
        
        const response = await fetch(finalUrl, {
            method: 'GET',
            headers: headers,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Proxy] Upstream error: ${response.status} ${response.statusText}`);
            console.error(`[Proxy] Response body:`, errorText.substring(0, 500));
            return NextResponse.json({ error: `Upstream error: ${response.status}` }, { status: response.status });
        }

        const contentType = response.headers.get('content-type');
        const text = await response.text();
        let data;
        
        // Log first 500 chars of response for debugging
        console.log('[Proxy] Response preview:', text.substring(0, 500));
        console.log('[Proxy] Content-Type:', contentType);
        
        try {
            data = JSON.parse(text);
        } catch (parseError) {
            console.error('[Proxy] Failed to parse response as JSON');
            console.error('[Proxy] Parse error:', parseError);
            console.error('[Proxy] Full response:', text);
            return NextResponse.json({ error: 'Invalid JSON response from portal' }, { status: 502 });
        }
        
        // Add CORS headers to allow Expo app to access this API
        return NextResponse.json(data, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            }
        });

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Internal Proxy Error';
        console.error('[Proxy] Error:', error);
        return NextResponse.json({ error: errorMessage }, { 
            status: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
            }
        });
    }
}

// Handle OPTIONS preflight requests
export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        }
    });
}
