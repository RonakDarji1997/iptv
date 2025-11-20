// Stalker Portal credentials from environment variables
const STALKER_CONFIG = {
    bearer: process.env.EXPO_PUBLIC_STALKER_BEARER || '',
    adid: process.env.EXPO_PUBLIC_STALKER_ADID || '',
};

export async function GET(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const searchParams = url.searchParams;
    
    const targetUrl = searchParams.get('url');
    const mac = searchParams.get('mac');
    const token = searchParams.get('token');
    const bearer = searchParams.get('bearer');
    const adid = searchParams.get('adid');

    if (!targetUrl || !mac) {
        return new Response(
            JSON.stringify({ error: 'Missing url or mac parameter' }), 
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }

    try {
        // Forward all query parameters except 'url', 'mac', 'token', 'bearer', 'adid'
        const forwardParams = new URLSearchParams();
        searchParams.forEach((value, key) => {
            if (!['url', 'mac', 'token', 'bearer', 'adid'].includes(key)) {
                forwardParams.append(key, value);
            }
        });

        // Add JsHttpRequest parameter
        forwardParams.append('JsHttpRequest', '1-xml');

        // Build final URL
        let finalUrl = targetUrl;
        if (targetUrl.includes('.php')) {
            finalUrl = `${targetUrl}?${forwardParams.toString()}`;
        } else {
            let baseUrl = targetUrl;
            if (!baseUrl.endsWith('/')) {
                baseUrl += '/';
            }
            finalUrl = `${baseUrl}server/load.php?${forwardParams.toString()}`;
        }
        
        // Build headers matching Next.js proxy
        const headers: Record<string, string> = {
            'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
            'X-User-Agent': 'Model: MAG270; Link: WiFi',
            'Referer': targetUrl.endsWith('/') ? targetUrl + 'c/' : targetUrl + '/c/',
            'Authorization': `Bearer ${bearer || STALKER_CONFIG.bearer}`,
            'Cookie': `mac=${mac.toLowerCase()}; timezone=America/Toronto; adid=${adid || STALKER_CONFIG.adid};${token ? ` st=${token};` : ''}`,
        };
        
        const response = await fetch(finalUrl, {
            method: 'GET',
            headers: headers,
        });

        if (!response.ok) {
            console.error(`[Proxy] Upstream error: ${response.status} ${response.statusText}`);
            return new Response(
                JSON.stringify({ error: `Upstream error: ${response.status}` }), 
                { status: response.status, headers: { 'Content-Type': 'application/json' } }
            );
        }

        const contentType = response.headers.get('content-type');
        let data;
        
        if (contentType?.includes('application/json')) {
            data = await response.json();
        } else {
            const text = await response.text();
            try {
                data = JSON.parse(text);
            } catch {
                console.error('[Proxy] Failed to parse response as JSON');
                return new Response(
                    JSON.stringify({ error: 'Invalid JSON response from portal' }), 
                    { status: 502, headers: { 'Content-Type': 'application/json' } }
                );
            }
        }
        
        return new Response(
            JSON.stringify(data), 
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        );

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Internal Proxy Error';
        console.error('[Proxy] Error:', error);
        return new Response(
            JSON.stringify({ error: errorMessage }), 
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}
