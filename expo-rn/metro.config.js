const { getDefaultConfig } = require('expo/metro-config');

// Default Metro config (no proxy/CORS hacks) for local development only.
module.exports = getDefaultConfig(__dirname);
