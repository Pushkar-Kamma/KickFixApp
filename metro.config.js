const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const defaultConfig = getDefaultConfig(__dirname);

// Tell Metro to bundle .tflite AI models
defaultConfig.resolver.assetExts.push('tflite');

const config = {};

module.exports = mergeConfig(defaultConfig, config);