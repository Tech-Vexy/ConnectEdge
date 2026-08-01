// metro.config.js
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

// libp2p (and its @libp2p/* / @chainsafe/* deps) are ESM-only packages that
// expose their entry ONLY via the "exports" map ("import" condition, no "main").
// Metro ignores "exports" by default, so it can't resolve "libp2p". Enable it.
config.resolver.unstable_enablePackageExports = true
// Prefer the "import" (ESM) condition these packages actually ship.
config.resolver.unstable_conditionNames = ['react-native', 'browser', 'import', 'require']

// libsodium / libsodium-wrappers ship a BROKEN esm build: their "import"
// (.mjs) entry references a sibling module that isn't bundled, so enabling
// package-exports above makes Metro pick the broken ESM path. Force just these
// two packages back to their complete CJS build (dist/modules/*.js).
// Point directly at the CJS files under node_modules. The broken "exports" map
// blocks require.resolve() for any subpath (even ./package.json), so we build
// the path from __dirname instead.
const path = require('path')
const nm = path.join(__dirname, 'node_modules')
const sodiumCjs = {
  'libsodium-wrappers': path.join(nm, 'libsodium-wrappers/dist/modules/libsodium-wrappers.js'),
  libsodium: path.join(nm, 'libsodium/dist/modules/libsodium.js'),
}
// expo-haptics type resolution issue workaround
const hapticsTypes = path.join(nm, 'expo-haptics/build/Haptics.types.js')
const defaultResolveRequest = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (sodiumCjs[moduleName]) {
    return { type: 'sourceFile', filePath: sodiumCjs[moduleName] }
  }
  // Fix expo-haptics relative import issue
  if (moduleName === './Haptics.types' && context.originModulePath.includes('expo-haptics')) {
    return { type: 'sourceFile', filePath: hapticsTypes }
  }
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform)
}

// libsodium-wrappers ships a .wasm file that Metro needs to serve as an asset
config.resolver.assetExts.push('wasm')

// Alias node's 'crypto' to expo-crypto for any transitive deps that import it
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  crypto: require.resolve('expo-crypto'),
  stream: require.resolve('readable-stream'),
  buffer: require.resolve('buffer'),
  // Add more Node.js core module polyfills
  events: require.resolve('events'),
  util: require.resolve('util'),
  assert: require.resolve('assert'),
  process: require.resolve('process/browser'),
}

// libsodium async init — needs to be a source extension, not asset
config.resolver.sourceExts = [
  ...config.resolver.sourceExts,
  'mjs',
]

module.exports = config
