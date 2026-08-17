const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.sourceExts.push('sql'); // drizzle migrations
config.resolver.assetExts.push('wasm'); // expo-sqlite web (wa-sqlite)

// COEP/COOP headers for SharedArrayBuffer (expo-sqlite web worker)
config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    middleware(req, res, next);
  };
};

module.exports = config;
