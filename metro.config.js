const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const isProduction = process.env.NODE_ENV === 'production' || 
                     process.env.EAS_BUILD_PROFILE === 'production' || 
                     process.env.EAS_BUILD_PROFILE === 'preview';

if (isProduction) {
  const jsoMetroPlugin = require('obfuscator-io-metro-plugin')({
    compact: true,
    controlFlowFlattening: false, // Performance & Hermes compatibility
    deadCodeInjection: false,
    debugProtection: false,
    disableConsoleOutput: false,
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    numbersToExpressions: false,
    renameGlobals: false,
    selfDefending: false,
    simplify: true,
    splitStrings: false,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.75,
    unicodeEscapeSequence: false
  }, {
    runInDev: false,
    logObfuscatedFiles: true,
    sourceMap: false
  });

  // Safely merge obfuscator plugin into Expo Metro config
  if (jsoMetroPlugin.transformer) {
    config.transformer = {
      ...config.transformer,
      ...jsoMetroPlugin.transformer
    };
  }
  if (jsoMetroPlugin.serializer) {
    config.serializer = {
      ...config.serializer,
      ...jsoMetroPlugin.serializer
    };
  }
}

module.exports = config;
