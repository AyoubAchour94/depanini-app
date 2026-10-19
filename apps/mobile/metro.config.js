const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Both app variants share this folder and so Metro's transform cache. Without a
// per-variant cache key, a second dev server (`pnpm share both`) reuses the
// first one's cached `expo-constants` and serves the wrong variant.
config.cacheVersion = process.env.APP_VARIANT ?? 'user';

module.exports = config;
