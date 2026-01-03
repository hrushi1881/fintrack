// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Configure path aliases for Metro bundler
config.resolver.alias = {
  '@': path.resolve(__dirname),
};

// Ensure font file extensions are included in asset extensions
// This is important for @expo-google-fonts packages to work correctly on mobile
config.resolver.assetExts.push(
  // Font file extensions
  'ttf',
  'otf',
  'woff',
  'woff2',
  'eot',
  // Additional font formats if needed
  'ttc'
);

// Ensure fonts are properly resolved
config.resolver.sourceExts = [...config.resolver.sourceExts, 'mjs'];

module.exports = config;

