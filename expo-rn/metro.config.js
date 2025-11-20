const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Configure Metro to allow requests from Next.js proxy
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => {
    return (req, res, next) => {
      // Bypass Expo's CORS middleware by setting allowed origins
      // This allows requests proxied through Next.js from iptv.ronika.co
      const origin = req.headers.origin || req.headers.referer;
      
      // Set CORS headers for all requests
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      
      // Handle OPTIONS preflight
      if (req.method === 'OPTIONS') {
        res.statusCode = 200;
        res.end();
        return;
      }
      
      // Modify referer to bypass Expo's origin check
      // Expo checks if the referer is from localhost
      if (origin && !origin.includes('localhost')) {
        req.headers.referer = 'http://localhost:3005/';
        req.headers.origin = 'http://localhost:3005';
      }
      
      return middleware(req, res, next);
    };
  },
};

module.exports = config;
