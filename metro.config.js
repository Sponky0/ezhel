const { getDefaultConfig } = require('expo/metro-config');

// Expo SDK 56 uses temporary eager bundle paths. The former obfuscator plugin
// cannot discover these and crashes after Metro succeeds, including production.
// Keep Expo's supported Hermes/Metro pipeline for every build profile.
module.exports = getDefaultConfig(__dirname);
