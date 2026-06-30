// metro.config.js
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

// libsodium-wrappers ships a .wasm file that Metro needs to serve as an asset
config.resolver.assetExts.push('wasm')

// Alias node's 'crypto' to expo-crypto for any transitive deps that import it
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  crypto: require.resolve('expo-crypto'),
  stream: require.resolve('readable-stream'),
  buffer: require.resolve('@craftzdog/react-native-buffer'),
}

// libsodium async init — needs to be a source extension, not asset
config.resolver.sourceExts = [
  ...config.resolver.sourceExts,
  'mjs',
]

module.exports = config
