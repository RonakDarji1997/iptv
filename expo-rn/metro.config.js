const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Disable CORS middleware to allow proxied requests
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware, server) => {
    return (req, res, next) => {
      // Remove CORS restrictions for proxied requests
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      
      // Skip Expo's CORS check
      const originalReferer = req.headers.referer;
      if (originalReferer && originalReferer.includes('iptv.ronika.co')) {
        req.headers.referer = 'http://localhost:3005';
      }
      
      return middleware(req, res, next);
    };
  },
};

module.exports = config;
