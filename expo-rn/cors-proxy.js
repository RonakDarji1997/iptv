const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = 3006;

// Enable CORS for all origins
app.use(cors());

app.get('/proxy', async (req, res) => {
  try {
    const { url: targetUrl, mac, action, token, bearer, adid, ...otherParams } = req.query;

    if (!targetUrl || !mac) {
      return res.status(400).json({ error: 'Missing url or mac parameter' });
    }

    // Build Stalker portal URL
    const stalkerUrl = new URL('server/load.php', targetUrl);
    stalkerUrl.searchParams.append('action', action);
    stalkerUrl.searchParams.append('JsHttpRequest', '1-xml');
    
    // Add other params
    Object.entries(otherParams).forEach(([key, value]) => {
      stalkerUrl.searchParams.append(key, value);
    });

    // Make request with Stalker headers
    const headers = {
      'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
      'X-User-Agent': 'Model: MAG270; Link: WiFi',
      'Referer': targetUrl.endsWith('/') ? targetUrl + 'c/' : targetUrl + '/c/',
      'Authorization': `Bearer ${bearer || process.env.EXPO_PUBLIC_STALKER_BEARER || ''}`,
      'Cookie': `mac=${mac.toLowerCase()}; timezone=America/Toronto; adid=${adid || process.env.EXPO_PUBLIC_STALKER_ADID || ''};${token ? ` st=${token};` : ''}`,
    };

    const response = await axios.get(stalkerUrl.toString(), {
      headers,
      timeout: 10000,
    });

    res.json(response.data);
  } catch (error) {
    console.error('Proxy error:', error.message);
    res.status(500).json({ error: 'Proxy request failed' });
  }
});

app.listen(PORT, () => {
  console.log(`CORS proxy running on http://localhost:${PORT}`);
});
