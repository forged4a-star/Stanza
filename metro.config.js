const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite on web ships a WebAssembly build of SQLite.
config.resolver.assetExts.push('wasm');
// SharedArrayBuffer (needed by expo-sqlite on web) requires cross-origin isolation.
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  middleware(req, res, next);
};

// the desktop app's own files (its packages, the copy of the web build) are not part of the app bundle
const path = require('path');
const desktopDir = path.join(__dirname, 'desktop').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
config.resolver.blockList = [].concat(config.resolver.blockList ?? [], new RegExp('^' + desktopDir + '[\\\\/].*'));

module.exports = config;
