// Expo SDK 56 Metro config with platform-conditional resolution for PowerSync.
// - @powersync/react-native is native-only (uses quick-sqlite). On web, stub it.
// - @powersync/web is web-only. On native, stub it.
// - On web, prefer the UMD build of @powersync/web (works under Metro web).
//
// Expo already aliases `react-native` -> `react-native-web` on web, so we
// intentionally do NOT touch that here.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Required so that the `@powersync/web/umd` export path resolves correctly.
config.resolver.unstable_enablePackageExports = true;

const baseResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web') {
    if (moduleName === '@powersync/react-native') {
      return { type: 'empty' };
    }
    if (moduleName === '@powersync/web') {
      return context.resolveRequest(context, '@powersync/web/umd', platform);
    }
  } else {
    if (moduleName === '@powersync/web') {
      return { type: 'empty' };
    }
  }

  if (baseResolveRequest) {
    return baseResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
